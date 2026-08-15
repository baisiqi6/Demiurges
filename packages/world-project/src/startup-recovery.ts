import { lstatSync, readdirSync, unlinkSync } from "node:fs";
import { join } from "node:path";

import { MARBLE_HUNYUAN_REGISTRY, canonicalJsonBytes } from "@demiurges/world";

import type { OpenedDataRoot } from "./data-root";
import {
  DATA_ROOT_LAYOUT,
  dataRootProjectPath,
  dataRootReceiptIntentPath,
  requireLiveOpenedDataRoot,
} from "./data-root";
import {
  requireLiveDataRootWriterLease,
  type DataRootWriterLease,
} from "./data-root-lease";
import {
  cleanupRecoveredArtifactAttemptCandidates,
  inspectRegisteredArtifactDestination,
  requireRecoveredArtifactAttemptCandidates,
  requireRegisteredArtifactCandidate,
  type ArtifactDestinationState,
} from "./artifact-store";
import {
  OperationJournal,
  OperationJournalError,
  operationBindingDigest,
  requireDurablyFinalizedOperation,
  requireLiveAdmittedOperation,
  type AdmittedOperation,
  type ArtifactCandidateIdentity,
  type OperationBinding,
  type OperationTerminalResult,
} from "./operation-journal";
import {
  ProjectStoreError,
  WorldProjectReader,
} from "./project-store";
import {
  PROJECT_DIRECTORY_CANDIDATE_NAME,
  PROJECT_DIRECTORY_MARKER_NAME,
  cleanupStagedProjectDirectoryCandidate,
  cleanupProjectDirectoryMarker,
  readProjectDirectoryMarkerBindingDigest,
  requirePublishedProjectDirectoryMarkerHardLink,
  requireStagedProjectDirectoryCandidate,
  requireStagedProjectDirectoryMarker,
} from "./project-directory-marker";
import {
  readStableDirectoryIdentity,
  sameStableDirectoryIdentity,
  syncDirectory,
  type StableDirectoryIdentity,
} from "./safe-filesystem";
import { readStableRegularFile } from "./safe-filesystem";
import {
  WORLD_PROJECT_MANIFEST_MAX_BYTES,
  decodeWorldProjectManifestV1,
} from "./world-project-manifest";

export interface StartupRecoveryResult {
  readonly recovered: readonly OperationTerminalResult[];
  readonly alreadyTerminal: readonly OperationTerminalResult[];
}

type ConfirmedTerminal = ReturnType<OperationJournal["confirmExistingTerminal"]>;

type ConfirmedCleanupHook = (confirmed: ConfirmedTerminal) => void;

let confirmedCleanupHook: ConfirmedCleanupHook | undefined;

function artifactStates(
  root: OpenedDataRoot,
  candidates: readonly ArtifactCandidateIdentity[],
): readonly ArtifactDestinationState[] {
  return candidates.map((candidate) => {
    const registered = requireRegisteredArtifactCandidate(candidate);
    return inspectRegisteredArtifactDestination(root, registered);
  });
}

function bindingArtifacts(binding: OperationBinding) {
  const candidate = binding.candidateIdentity;
  if ("digest" in candidate) {
    return [requireRegisteredArtifactCandidate(candidate)];
  }
  if ("candidateArtifacts" in candidate) {
    return candidate.candidateArtifacts.map(requireRegisteredArtifactCandidate);
  }
  return [];
}

function cleanupConfirmedAttempts(
  root: OpenedDataRoot,
  lease: DataRootWriterLease,
  journal: OperationJournal,
  confirmed: ConfirmedTerminal,
): void {
  const entries = bindingArtifacts(confirmed.operation.binding);
  for (const attempt of confirmed.attempts) {
    if (
      attempt.binding.operationKind === "project.save-as" ||
      attempt.binding.operationKind === "bundle.import"
    ) {
      cleanupStagedProjectDirectoryCandidate(attempt);
    }
    cleanupRecoveredArtifactAttemptCandidates(
      root,
      lease,
      journal,
      attempt,
      entries,
    );
    journal.cleanupAttempt(attempt);
  }
}

function requireConfirmedAttemptsCleanable(
  root: OpenedDataRoot,
  lease: DataRootWriterLease,
  journal: OperationJournal,
  confirmed: ConfirmedTerminal,
  wasTerminalAtStartup: boolean,
): void {
  const entries = bindingArtifacts(confirmed.operation.binding);
  for (const attempt of confirmed.attempts) {
    if (attempt.attemptPath.length > 0) {
      const allowedNames = new Set([
        "operation-intent.json",
        "operation-result.json",
        "project.json",
        "project-directory.json",
        PROJECT_DIRECTORY_CANDIDATE_NAME,
        "artifact",
      ]);
      let names: readonly string[];
      try {
        names = readdirSync(attempt.attemptPath);
      } catch {
        throw new OperationJournalError("OPERATION_RECOVERY_REQUIRED");
      }
      if (names.some((name) => !allowedNames.has(name))) {
        throw new OperationJournalError("OPERATION_RECOVERY_REQUIRED");
      }
    }
    requireRecoveredProjectAttemptCandidates(
      root,
      lease,
      journal,
      attempt,
      wasTerminalAtStartup,
    );
    requireRecoveredArtifactAttemptCandidates(
      root,
      lease,
      journal,
      attempt,
      entries,
    );
  }
}

function requireConfirmedAttemptSetStable(
  expected: ConfirmedTerminal,
  current: ConfirmedTerminal,
  directoryIdentities: ReadonlyMap<string, StableDirectoryIdentity>,
): void {
  if (expected.attempts.length !== current.attempts.length) {
    throw new OperationJournalError("OPERATION_RECOVERY_REQUIRED");
  }
  for (let index = 0; index < expected.attempts.length; index += 1) {
    const expectedAttempt = expected.attempts[index]!;
    const currentAttempt = current.attempts[index]!;
    if (
      expectedAttempt.attemptPath !== currentAttempt.attemptPath ||
      expectedAttempt.attemptToken !== currentAttempt.attemptToken ||
      expectedAttempt.bindingDigest !== currentAttempt.bindingDigest
    ) {
      throw new OperationJournalError("OPERATION_RECOVERY_REQUIRED");
    }
    const expectedIdentity = directoryIdentities.get(expectedAttempt.attemptPath);
    if (expectedIdentity === undefined) {
      throw new OperationJournalError("OPERATION_RECOVERY_REQUIRED");
    }
    try {
      if (!sameStableDirectoryIdentity(
        expectedIdentity,
        readStableDirectoryIdentity(currentAttempt.attemptPath),
      )) {
        throw new OperationJournalError("OPERATION_RECOVERY_REQUIRED");
      }
    } catch (error) {
      if (error instanceof OperationJournalError) throw error;
      throw new OperationJournalError("OPERATION_RECOVERY_REQUIRED");
    }
  }
}

function inspectConfirmedAttemptDirectoryIdentities(
  confirmations: readonly ConfirmedTerminal[],
): ReadonlyMap<string, StableDirectoryIdentity> {
  const identities = new Map<string, StableDirectoryIdentity>();
  try {
    for (const confirmed of confirmations) {
      for (const attempt of confirmed.attempts) {
        if (identities.has(attempt.attemptPath)) {
          throw new OperationJournalError("OPERATION_RECOVERY_REQUIRED");
        }
        identities.set(
          attempt.attemptPath,
          readStableDirectoryIdentity(attempt.attemptPath),
        );
      }
    }
  } catch (error) {
    if (error instanceof OperationJournalError) throw error;
    throw new OperationJournalError("OPERATION_RECOVERY_REQUIRED");
  }
  return identities;
}

function requireRecoveredProjectAttemptCandidates(
  root: OpenedDataRoot,
  lease: DataRootWriterLease,
  journal: OperationJournal,
  operation: AdmittedOperation,
  allowMissingPublishedEvidence: boolean,
): void {
  try {
    requireDurablyFinalizedOperation(operation, root, lease, journal);
  } catch {
    requireLiveAdmittedOperation(operation, root, lease, journal);
  }
  if (operation.attemptPath.length === 0) return;
  const binding = operation.binding;
  const names = new Set(readdirSync(operation.attemptPath));
  if (names.has("artifact")) {
    throw new OperationJournalError("OPERATION_RECOVERY_REQUIRED");
  }
  if (names.has("project.json")) {
    if (
      binding.target.kind !== "project" ||
      !("projectRevision" in binding.candidateIdentity)
    ) {
      throw new OperationJournalError("OPERATION_RECOVERY_REQUIRED");
    }
    try {
      const manifest = decodeWorldProjectManifestV1(readStableRegularFile(
        join(operation.attemptPath, "project.json"),
        WORLD_PROJECT_MANIFEST_MAX_BYTES,
      ));
      if (
        manifest.projectId !== binding.target.id ||
        manifest.revision !== binding.candidateIdentity.projectRevision
      ) {
        throw new OperationJournalError("OPERATION_RECOVERY_REQUIRED");
      }
    } catch (error) {
      if (error instanceof OperationJournalError) throw error;
      throw new OperationJournalError("OPERATION_RECOVERY_REQUIRED");
    }
  }
  if (names.has("project-directory.json")) {
    if (
      binding.target.kind !== "project" ||
      (binding.operationKind !== "project.save-as" &&
        binding.operationKind !== "bundle.import")
    ) {
      throw new OperationJournalError("OPERATION_RECOVERY_REQUIRED");
    }
    try {
      if (names.has(PROJECT_DIRECTORY_CANDIDATE_NAME)) {
        if (requireStagedProjectDirectoryCandidate(operation) === undefined) {
          throw new OperationJournalError("OPERATION_RECOVERY_REQUIRED");
        }
      } else {
        const rootPath = requireLiveOpenedDataRoot(root).absolutePath;
        const stagedMarkerPath = join(operation.attemptPath, "project-directory.json");
        const projectPath = join(rootPath, dataRootProjectPath(binding.target.id));
        let projectExists = true;
        try {
          readStableDirectoryIdentity(projectPath);
        } catch (error) {
          if (syscallCode(error) !== "ENOENT") throw error;
          projectExists = false;
        }
        if (!projectExists) {
          if (!allowMissingPublishedEvidence) {
            throw new OperationJournalError("OPERATION_RECOVERY_REQUIRED");
          }
          requireStagedProjectDirectoryMarker(stagedMarkerPath, projectPath, binding);
        } else {
          let markerExists = true;
          try {
            lstatSync(join(projectPath, PROJECT_DIRECTORY_MARKER_NAME), { bigint: true });
          } catch (error) {
            if (syscallCode(error) !== "ENOENT") throw error;
            markerExists = false;
          }
          if (!markerExists) {
            if (!allowMissingPublishedEvidence) {
              throw new OperationJournalError("OPERATION_RECOVERY_REQUIRED");
            }
            requireStagedProjectDirectoryMarker(stagedMarkerPath, projectPath, binding);
          } else {
          requirePublishedProjectDirectoryMarkerHardLink(
            stagedMarkerPath,
            projectPath,
            binding,
          );
          }
        }
      }
    } catch {
      throw new OperationJournalError("OPERATION_RECOVERY_REQUIRED");
    }
  } else if (names.has(PROJECT_DIRECTORY_CANDIDATE_NAME)) {
    throw new OperationJournalError("OPERATION_RECOVERY_REQUIRED");
  }
  requireLiveOpenedDataRoot(root);
}

function requireAllExistingAttemptsCleanable(
  root: OpenedDataRoot,
  lease: DataRootWriterLease,
  journal: OperationJournal,
  bindings: readonly OperationBinding[],
  terminalAtStartup: ReadonlySet<string>,
): void {
  const coveredAttemptPaths = new Set<string>();
  for (const binding of bindings) {
    const entries = bindingArtifacts(binding);
    for (const attempt of journal.inspectExistingAttempts(binding)) {
      coveredAttemptPaths.add(attempt.attemptPath);
      requireRecoveredProjectAttemptCandidates(
        root,
        lease,
        journal,
        attempt,
        terminalAtStartup.has(binding.operationId),
      );
      requireRecoveredArtifactAttemptCandidates(
        root,
        lease,
        journal,
        attempt,
        entries,
      );
    }
  }
  const rootPath = requireLiveOpenedDataRoot(root).absolutePath;
  const stagingPath = join(rootPath, DATA_ROOT_LAYOUT.staging);
  for (const name of readdirSync(stagingPath)) {
    if (!coveredAttemptPaths.has(join(stagingPath, name))) {
      throw new OperationJournalError("OPERATION_RECOVERY_REQUIRED");
    }
  }
}

/**
 * A pending Project-creation operation is not recoverable from its durable
 * intent alone. Before recovery may classify or terminalize it, exactly one
 * attempt must still carry the staged directory marker that proves the
 * candidate/final Project publication lineage. Existing terminal operations
 * are excluded because a prior successful cleanup may already have removed
 * that evidence.
 */
function requirePendingProjectPublicationEvidence(
  journal: OperationJournal,
  bindings: readonly OperationBinding[],
  terminalAtStartup: ReadonlySet<string>,
): void {
  for (const binding of bindings) {
    if (
      (binding.operationKind !== "project.save-as" &&
        binding.operationKind !== "bundle.import") ||
      terminalAtStartup.has(binding.operationId)
    ) {
      continue;
    }
    const markerAttempts = journal.inspectExistingAttempts(binding).filter(
      (attempt) => readdirSync(attempt.attemptPath).includes("project-directory.json"),
    );
    if (markerAttempts.length !== 1) {
      throw new OperationJournalError("OPERATION_RECOVERY_REQUIRED");
    }
  }
}

function requireOperationTarget(binding: OperationBinding): void {
  const candidate = binding.candidateIdentity;
  if (binding.operationKind === "artifact.publish") {
    if (
      !("digest" in candidate) ||
      binding.target.kind !== "artifact" ||
      binding.target.id !== candidate.assetId
    ) {
      throw new OperationJournalError("OPERATION_RECOVERY_REQUIRED");
    }
    requireRegisteredArtifactCandidate(candidate);
    return;
  }
  if (binding.operationKind === "artifact.import-dh013") {
    if (
      !("candidateArtifacts" in candidate) ||
      "projectRevision" in candidate ||
      binding.target.kind !== "registry" ||
      binding.target.id !== "registry:marble-hunyuan-v1"
    ) {
      throw new OperationJournalError("OPERATION_RECOVERY_REQUIRED");
    }
    const expected = MARBLE_HUNYUAN_REGISTRY.assets
      .map((entry) => ({
        assetId: entry.assetId,
        digest: entry.digest,
        byteLength: entry.byteLength,
        format: entry.format,
        elementCount: entry.elementCount,
        sourceBounds: entry.sourceBounds,
      }))
      .sort((left, right) => left.digest.localeCompare(right.digest));
    if (
      !Buffer.from(canonicalJsonBytes(candidate.candidateArtifacts)).equals(
        Buffer.from(canonicalJsonBytes(expected)),
      )
    ) {
      throw new OperationJournalError("OPERATION_RECOVERY_REQUIRED");
    }
    return;
  }
  if (
    !("projectRevision" in candidate) ||
    binding.target.kind !== "project"
  ) {
    throw new OperationJournalError("OPERATION_RECOVERY_REQUIRED");
  }
  if ("candidateArtifacts" in candidate) {
    for (const artifact of candidate.candidateArtifacts) {
      requireRegisteredArtifactCandidate(artifact);
    }
  }
}

function classifyArtifacts(states: readonly ArtifactDestinationState[]):
  | "all-exact"
  | "has-absent"
  | "conflict"
  | "recovery-required" {
  if (states.some((state) => state.status === "recovery-required")) {
    return "recovery-required";
  }
  if (states.some((state) => state.status === "conflict")) return "conflict";
  if (states.some((state) => state.status === "absent")) return "has-absent";
  return "all-exact";
}

function projectRevision(
  reader: WorldProjectReader,
  projectId: string,
): string | undefined {
  try {
    return reader.open(projectId).revision;
  } catch (error) {
    if (error instanceof ProjectStoreError && error.code === "PROJECT_NOT_FOUND") {
      return undefined;
    }
    throw new OperationJournalError("OPERATION_RECOVERY_REQUIRED");
  }
}

function targetProjectId(binding: OperationBinding): string {
  if (binding.target.kind !== "project" || !binding.target.id.startsWith("project:")) {
    throw new OperationJournalError("OPERATION_RECOVERY_REQUIRED");
  }
  return binding.target.id;
}

function syscallCode(error: unknown): string | undefined {
  if (typeof error === "object" && error !== null && "code" in error) {
    return typeof error.code === "string" ? error.code : undefined;
  }
  return undefined;
}

/**
 * Project lock 是 global intent 的 hard-link。恢复只删除 dev/ino 与该 intent
 * 完全相同的 regular file；同Project另一durable intent拥有的lock留给owner处理，
 * 任何无法归属的foreign/malformed lock都保留并fail closed。
 */
function cleanupExactProjectLock(
  root: OpenedDataRoot,
  binding: OperationBinding,
  requiredAtCleanup: boolean,
): void {
  if (binding.target.kind !== "project") return;
  const rootPath = requireLiveOpenedDataRoot(root).absolutePath;
  const projectPath = join(rootPath, dataRootProjectPath(targetProjectId(binding)));
  const lockPath = join(projectPath, ".write-lock");
  let lock;
  try {
    lock = lstatSync(lockPath, { bigint: true });
  } catch (error) {
    if (syscallCode(error) === "ENOENT" && !requiredAtCleanup) return;
    throw new OperationJournalError("OPERATION_RECOVERY_REQUIRED");
  }
  let intent;
  try {
    intent = lstatSync(
      join(rootPath, dataRootReceiptIntentPath(binding.operationId)),
      { bigint: true },
    );
  } catch {
    throw new OperationJournalError("OPERATION_RECOVERY_REQUIRED");
  }
  const regular = 0o100000n;
  if ((lock.mode & 0o170000n) !== regular) {
    throw new OperationJournalError("OPERATION_RECOVERY_REQUIRED");
  }
  if (
    (intent.mode & 0o170000n) === regular &&
    lock.dev === intent.dev &&
    lock.ino === intent.ino
  ) {
    unlinkSync(lockPath);
    syncDirectory(projectPath);
    requireLiveOpenedDataRoot(root);
    return;
  }
  throw new OperationJournalError("OPERATION_RECOVERY_REQUIRED");
}

function inspectProjectEvidenceOwners(
  root: OpenedDataRoot,
  bindings: readonly OperationBinding[],
): {
  readonly owners: ReadonlyMap<string, string | undefined>;
  readonly lockOwners: ReadonlyMap<string, string | undefined>;
  readonly markerOwners: ReadonlyMap<string, string | undefined>;
  readonly directoryIdentities: ReadonlyMap<
    string,
    StableDirectoryIdentity | undefined
  >;
} {
  const rootPath = requireLiveOpenedDataRoot(root).absolutePath;
  const byProject = new Map<string, OperationBinding[]>();
  for (const binding of bindings) {
    if (binding.target.kind !== "project") continue;
    const current = byProject.get(binding.target.id) ?? [];
    current.push(binding);
    byProject.set(binding.target.id, current);
  }
  const owners = new Map<string, string | undefined>();
  const lockOwners = new Map<string, string | undefined>();
  const markerOwners = new Map<string, string | undefined>();
  const directoryIdentities = new Map<
    string,
    StableDirectoryIdentity | undefined
  >();
  for (const [projectId, projectBindings] of byProject) {
    const projectPath = join(rootPath, dataRootProjectPath(projectId));
    try {
      directoryIdentities.set(
        projectId,
        readStableDirectoryIdentity(projectPath),
      );
    } catch (error) {
      if (syscallCode(error) === "ENOENT") {
        owners.set(projectId, undefined);
        lockOwners.set(projectId, undefined);
        markerOwners.set(projectId, undefined);
        directoryIdentities.set(projectId, undefined);
        continue;
      }
      throw new OperationJournalError("OPERATION_RECOVERY_REQUIRED");
    }
    let lockOwner: string | undefined;
    try {
      const lock = lstatSync(join(projectPath, ".write-lock"), { bigint: true });
      if ((lock.mode & 0o170000n) !== 0o100000n) {
        throw new OperationJournalError("OPERATION_RECOVERY_REQUIRED");
      }
      const matches = projectBindings.filter((candidate) => {
        try {
          const intent = lstatSync(
            join(rootPath, dataRootReceiptIntentPath(candidate.operationId)),
            { bigint: true },
          );
          return (intent.mode & 0o170000n) === 0o100000n &&
            intent.dev === lock.dev && intent.ino === lock.ino;
        } catch {
          throw new OperationJournalError("OPERATION_RECOVERY_REQUIRED");
        }
      });
      if (matches.length !== 1) {
        throw new OperationJournalError("OPERATION_RECOVERY_REQUIRED");
      }
      lockOwner = matches[0]!.operationId;
    } catch (error) {
      if (syscallCode(error) !== "ENOENT") throw error;
    }

    let markerOwner: string | undefined;
    try {
      const markerDigest = readProjectDirectoryMarkerBindingDigest(projectPath);
      if (markerDigest !== undefined) {
        const matches = projectBindings.filter(
          (candidate) => operationBindingDigest(candidate) === markerDigest,
        );
        if (matches.length !== 1) {
          throw new OperationJournalError("OPERATION_RECOVERY_REQUIRED");
        }
        markerOwner = matches[0]!.operationId;
      }
    } catch {
      throw new OperationJournalError("OPERATION_RECOVERY_REQUIRED");
    }
    if (lockOwner !== undefined && markerOwner !== undefined && lockOwner !== markerOwner) {
      throw new OperationJournalError("OPERATION_RECOVERY_REQUIRED");
    }
    owners.set(projectId, lockOwner ?? markerOwner);
    lockOwners.set(projectId, lockOwner);
    markerOwners.set(projectId, markerOwner);
  }
  return Object.freeze({
    owners,
    lockOwners,
    markerOwners,
    directoryIdentities,
  });
}

type ProjectEvidenceInspection = ReturnType<typeof inspectProjectEvidenceOwners>;

function sameOptionalDirectoryIdentity(
  left: StableDirectoryIdentity | undefined,
  right: StableDirectoryIdentity | undefined,
): boolean {
  if (left === undefined || right === undefined) return left === right;
  return sameStableDirectoryIdentity(left, right);
}

function requireProjectEvidenceStable(
  projectId: string,
  startup: ProjectEvidenceInspection,
  current: ProjectEvidenceInspection,
): void {
  if (
    startup.owners.get(projectId) !== current.owners.get(projectId) ||
    startup.lockOwners.get(projectId) !== current.lockOwners.get(projectId) ||
    startup.markerOwners.get(projectId) !== current.markerOwners.get(projectId) ||
    !sameOptionalDirectoryIdentity(
      startup.directoryIdentities.get(projectId),
      current.directoryIdentities.get(projectId),
    )
  ) {
    throw new OperationJournalError("OPERATION_RECOVERY_REQUIRED");
  }
}

function requireProjectEvidenceInspectionStable(
  bindings: readonly OperationBinding[],
  startup: ProjectEvidenceInspection,
  current: ProjectEvidenceInspection,
): void {
  const projectIds = new Set(
    bindings
      .filter((binding) => binding.target.kind === "project")
      .map((binding) => binding.target.id),
  );
  for (const projectId of projectIds) {
    requireProjectEvidenceStable(projectId, startup, current);
  }
}

function requireCurrentProjectEvidenceStable(
  binding: OperationBinding,
  startup: ProjectEvidenceInspection,
  current: ProjectEvidenceInspection,
): void {
  if (binding.target.kind !== "project") return;
  requireProjectEvidenceStable(binding.target.id, startup, current);
}

function requireOwnedProjectEvidenceEntrySets(
  root: OpenedDataRoot,
  bindings: readonly OperationBinding[],
  owners: ReadonlyMap<string, string | undefined>,
): void {
  const rootPath = requireLiveOpenedDataRoot(root).absolutePath;
  const inspected = new Set<string>();
  for (const binding of bindings) {
    if (
      binding.target.kind !== "project" ||
      owners.get(binding.target.id) !== binding.operationId ||
      inspected.has(binding.target.id)
    ) continue;
    inspected.add(binding.target.id);
    const entries = readdirSync(
      join(rootPath, dataRootProjectPath(binding.target.id)),
    );
    const allowed = new Set([
      PROJECT_DIRECTORY_MARKER_NAME,
      ".write-lock",
      "project.json",
    ]);
    if (entries.some((entry) => !allowed.has(entry))) {
      throw new OperationJournalError("OPERATION_RECOVERY_REQUIRED");
    }
  }
}

/**
 * A pending Project-creation operation may observe no final path yet, or the
 * exact final directory owned by its own marker/lock evidence. An existing
 * ownerless directory (including an empty one) is foreign authority and must
 * be rejected before recovery can classify or terminalize any operation.
 */
function requirePendingProjectDestinationOwnership(
  root: OpenedDataRoot,
  bindings: readonly OperationBinding[],
  owners: ReadonlyMap<string, string | undefined>,
  terminalAtStartup: ReadonlySet<string>,
): void {
  const rootPath = requireLiveOpenedDataRoot(root).absolutePath;
  for (const binding of bindings) {
    if (
      (binding.operationKind !== "project.save-as" &&
        binding.operationKind !== "bundle.import") ||
      terminalAtStartup.has(binding.operationId)
    ) {
      continue;
    }
    const projectId = targetProjectId(binding);
    try {
      readStableDirectoryIdentity(join(rootPath, dataRootProjectPath(projectId)));
    } catch (error) {
      if (syscallCode(error) === "ENOENT") continue;
      throw new OperationJournalError("OPERATION_RECOVERY_REQUIRED");
    }
    if (owners.get(projectId) !== binding.operationId) {
      throw new OperationJournalError("OPERATION_RECOVERY_REQUIRED");
    }
  }
}

function repairArtifactCandidateDurability(
  root: OpenedDataRoot,
  lease: DataRootWriterLease,
): void {
  if (requireLiveDataRootWriterLease(lease).root !== root) {
    throw new OperationJournalError("OPERATION_RECOVERY_REQUIRED");
  }
  const rootPath = requireLiveOpenedDataRoot(root).absolutePath;
  syncDirectory(join(rootPath, DATA_ROOT_LAYOUT.artifactDigestDir));
  requireLiveOpenedDataRoot(root);
}

function repairProjectCandidateDurability(
  root: OpenedDataRoot,
  lease: DataRootWriterLease,
  projectId: string,
): void {
  if (requireLiveDataRootWriterLease(lease).root !== root) {
    throw new OperationJournalError("OPERATION_RECOVERY_REQUIRED");
  }
  const rootPath = requireLiveOpenedDataRoot(root).absolutePath;
  syncDirectory(join(rootPath, dataRootProjectPath(projectId)));
  requireLiveOpenedDataRoot(root);
}

/**
 * Phase A 已证明全量 durable bindings/evidence 后，先补齐此前可能发生的
 * attempt/project directory removal 的 parent-directory durability。即使目标
 * entry 已不存在，也不能把 path absence 当作 fsync proof。
 */
function repairRecoveryControlDirectoryDurability(
  root: OpenedDataRoot,
  lease: DataRootWriterLease,
  journal: OperationJournal,
  bindings: readonly OperationBinding[],
): void {
  if (requireLiveDataRootWriterLease(lease).root !== root) {
    throw new OperationJournalError("OPERATION_RECOVERY_REQUIRED");
  }
  const rootPath = requireLiveOpenedDataRoot(root).absolutePath;
  for (const binding of bindings) {
    for (const attempt of journal.inspectExistingAttempts(binding)) {
      syncDirectory(attempt.attemptPath);
    }
  }
  syncDirectory(join(rootPath, DATA_ROOT_LAYOUT.projects));
  syncDirectory(join(rootPath, DATA_ROOT_LAYOUT.staging));
  requireLiveOpenedDataRoot(root);
}

function cleanupProjectEvidence(
  root: OpenedDataRoot,
  lease: DataRootWriterLease,
  journal: OperationJournal,
  confirmed: ConfirmedTerminal,
  reader: WorldProjectReader,
  evidenceOwners: ReadonlyMap<string, string | undefined>,
  startupLockOwners: ReadonlyMap<string, string | undefined>,
  wasTerminalAtStartup: boolean,
): void {
  const binding = confirmed.operation.binding;
  let operation = confirmed.operation;
  if (
    binding.target.kind === "project" &&
    evidenceOwners.get(binding.target.id) !== undefined &&
    evidenceOwners.get(binding.target.id) !== binding.operationId
  ) {
    requireDurablyFinalizedOperation(operation, root, lease, journal);
    return;
  }
  requireOwnedProjectEvidenceEntrySets(
    root,
    [binding],
    evidenceOwners,
  );
  if (
    binding.target.kind === "project" &&
    (binding.operationKind === "project.save-as" ||
      binding.operationKind === "bundle.import")
  ) {
    const rootPath = requireLiveOpenedDataRoot(root).absolutePath;
    const projectPath = join(rootPath, dataRootProjectPath(targetProjectId(binding)));
    let finalProjectExists = true;
    try {
      readStableDirectoryIdentity(projectPath);
    } catch (error) {
      if (syscallCode(error) !== "ENOENT") {
        throw new OperationJournalError("OPERATION_RECOVERY_REQUIRED");
      }
      finalProjectExists = false;
    }
    let finalMarkerExists = true;
    try {
      lstatSync(join(projectPath, PROJECT_DIRECTORY_MARKER_NAME), { bigint: true });
    } catch (error) {
      if (syscallCode(error) !== "ENOENT") {
        throw new OperationJournalError("OPERATION_RECOVERY_REQUIRED");
      }
      finalMarkerExists = false;
    }
    if (finalProjectExists && !finalMarkerExists && !wasTerminalAtStartup) {
      throw new OperationJournalError("OPERATION_RECOVERY_REQUIRED");
    }
    const markerAttempts: AdmittedOperation[] = [];
    for (const attempt of confirmed.attempts) {
      const stagedMarkerPath = join(attempt.attemptPath, "project-directory.json");
      try {
        if (finalMarkerExists) {
          requirePublishedProjectDirectoryMarkerHardLink(
            stagedMarkerPath,
            projectPath,
            binding,
          );
        } else {
          requireStagedProjectDirectoryMarker(stagedMarkerPath, projectPath, binding);
        }
        markerAttempts.push(attempt);
      } catch (error) {
        if (syscallCode(error) !== "ENOENT") {
          throw new OperationJournalError("OPERATION_RECOVERY_REQUIRED");
        }
      }
    }
    if (markerAttempts.length > 1 || (finalMarkerExists && markerAttempts.length !== 1)) {
      throw new OperationJournalError("OPERATION_RECOVERY_REQUIRED");
    }
    operation = markerAttempts[0] ?? operation;
  }
  requireDurablyFinalizedOperation(operation, root, lease, journal);
  cleanupExactProjectLock(
    root,
    binding,
    binding.target.kind === "project" &&
      startupLockOwners.get(binding.target.id) === binding.operationId,
  );
  if (binding.target.kind !== "project") return;
  const rootPath = requireLiveOpenedDataRoot(root).absolutePath;
  const projectPath = join(rootPath, dataRootProjectPath(targetProjectId(binding)));
  const current = projectRevision(reader, targetProjectId(binding));
  const removeDirectory =
    confirmed.result.variant === "aborted-before-publish" &&
    current === undefined &&
    (binding.operationKind === "project.save-as" ||
      binding.operationKind === "bundle.import");
  cleanupProjectDirectoryMarker(
    projectPath,
    join(rootPath, DATA_ROOT_LAYOUT.projects),
    binding,
    {
      required: false,
      removeDirectory,
      stagedMarkerPath: operation.attemptPath.length === 0
        ? undefined
        : join(operation.attemptPath, "project-directory.json"),
    },
  );
}

type PendingRecoveryAction =
  | { readonly variant: "success"; readonly repairArtifact: boolean; readonly repairProject: boolean }
  | { readonly variant: "aborted-before-publish"; readonly code: string };

function classifyPendingRecovery(
  root: OpenedDataRoot,
  reader: WorldProjectReader,
  binding: OperationBinding,
): PendingRecoveryAction {
  const candidate = binding.candidateIdentity;
  if (binding.operationKind === "artifact.publish") {
    if (!("digest" in candidate)) {
      throw new OperationJournalError("OPERATION_RECOVERY_REQUIRED");
    }
    const classification = classifyArtifacts(artifactStates(root, [candidate]));
    if (classification === "recovery-required") {
      throw new OperationJournalError("OPERATION_RECOVERY_REQUIRED");
    }
    return classification === "all-exact"
      ? { variant: "success", repairArtifact: true, repairProject: false }
      : {
          variant: "aborted-before-publish",
          code: classification === "conflict"
            ? "ARTIFACT_DESTINATION_CONFLICT"
            : "OPERATION_INTERRUPTED",
        };
  }
  if (binding.operationKind === "artifact.import-dh013") {
    if (!("candidateArtifacts" in candidate) || "projectRevision" in candidate) {
      throw new OperationJournalError("OPERATION_RECOVERY_REQUIRED");
    }
    const classification = classifyArtifacts(
      artifactStates(root, candidate.candidateArtifacts),
    );
    if (classification === "recovery-required") {
      throw new OperationJournalError("OPERATION_RECOVERY_REQUIRED");
    }
    return classification === "all-exact"
      ? { variant: "success", repairArtifact: true, repairProject: false }
      : {
          variant: "aborted-before-publish",
          code: classification === "conflict"
            ? "ARTIFACT_DESTINATION_CONFLICT"
            : "OPERATION_INTERRUPTED",
        };
  }
  if (!("projectRevision" in candidate)) {
    throw new OperationJournalError("OPERATION_RECOVERY_REQUIRED");
  }
  let bundleArtifacts: ReturnType<typeof classifyArtifacts> | undefined;
  if (binding.operationKind === "bundle.import") {
    if (!("candidateArtifacts" in candidate)) {
      throw new OperationJournalError("OPERATION_RECOVERY_REQUIRED");
    }
    bundleArtifacts = classifyArtifacts(artifactStates(root, candidate.candidateArtifacts));
    if (bundleArtifacts === "recovery-required") {
      throw new OperationJournalError("OPERATION_RECOVERY_REQUIRED");
    }
    if (bundleArtifacts === "conflict") {
      return {
        variant: "aborted-before-publish",
        code: "ARTIFACT_DESTINATION_CONFLICT",
      };
    }
  }
  const current = projectRevision(reader, targetProjectId(binding));
  if (current === candidate.projectRevision) {
    if (bundleArtifacts === "has-absent") {
      throw new OperationJournalError("OPERATION_RECOVERY_REQUIRED");
    }
    return {
      variant: "success",
      repairArtifact: bundleArtifacts === "all-exact",
      repairProject: true,
    };
  }
  if (current === undefined || current === binding.expectedIdentity) {
    return { variant: "aborted-before-publish", code: "OPERATION_INTERRUPTED" };
  }
  return {
    variant: "aborted-before-publish",
    code: "PROJECT_REVISION_CONFLICT",
  };
}

/**
 * 新 lease holder 在开放 disk mutation route 前调用。任何无法唯一分类的 operation
 * 都 fail closed；不会猜测删除未知 evidence。
 */
export function recoverPendingOperations(
  root: OpenedDataRoot,
  lease: DataRootWriterLease,
  reader: WorldProjectReader,
): StartupRecoveryResult {
  const journal = new OperationJournal(root, lease);
  const bindings = journal.listBindings();
  // Phase A：任何durability repair、terminalization或cleanup前的全局只读preflight。
  for (const binding of bindings) requireOperationTarget(binding);
  const initiallyTerminal = new Set<string>();
  for (const binding of bindings) {
    if (journal.readResult(binding.operationId, binding) !== undefined) {
      initiallyTerminal.add(binding.operationId);
    }
  }
  requireAllExistingAttemptsCleanable(
    root,
    lease,
    journal,
    bindings,
    initiallyTerminal,
  );
  requirePendingProjectPublicationEvidence(journal, bindings, initiallyTerminal);
  const evidenceAtStartup = inspectProjectEvidenceOwners(root, bindings);
  const evidenceOwners = evidenceAtStartup.owners;
  requirePendingProjectDestinationOwnership(
    root,
    bindings,
    evidenceOwners,
    initiallyTerminal,
  );
  requireOwnedProjectEvidenceEntrySets(root, bindings, evidenceOwners);
  const pendingActions = new Map<string, PendingRecoveryAction>();
  for (const binding of bindings) {
    if (!initiallyTerminal.has(binding.operationId)) {
      pendingActions.set(
        binding.operationId,
        classifyPendingRecovery(root, reader, binding),
      );
    }
  }

  repairRecoveryControlDirectoryDurability(root, lease, journal, bindings);

  // Phase B：全体terminal authority形成；任一失败时仍未cleanup任何evidence。
  for (const binding of bindings) {
    if (initiallyTerminal.has(binding.operationId)) {
      journal.confirmExistingTerminal(binding);
      continue;
    }
    const action = pendingActions.get(binding.operationId);
    if (action === undefined) throw new OperationJournalError("OPERATION_RECOVERY_REQUIRED");
    const operation = journal.beginRecovery(binding);
    if (action.variant === "success") {
      if (action.repairArtifact) repairArtifactCandidateDurability(root, lease);
      if (action.repairProject) {
        repairProjectCandidateDurability(root, lease, targetProjectId(binding));
      }
      journal.finalizeSuccess(operation);
    } else {
      journal.finalizeAborted(operation, action.code);
    }
  }

  // Phase C：新recovery attempts也必须加入全局coverage，然后全体confirm后才cleanup。
  requireAllExistingAttemptsCleanable(
    root,
    lease,
    journal,
    bindings,
    initiallyTerminal,
  );
  const confirmations = bindings.map((binding) => {
    const confirmed = journal.confirmExistingTerminal(binding);
    requireConfirmedAttemptsCleanable(
      root,
      lease,
      journal,
      confirmed,
      initiallyTerminal.has(binding.operationId),
    );
    return confirmed;
  });
  const attemptDirectoryIdentitiesBeforeCleanup =
    inspectConfirmedAttemptDirectoryIdentities(confirmations);
  const evidenceBeforeCleanup = inspectProjectEvidenceOwners(root, bindings);
  requireProjectEvidenceInspectionStable(
    bindings,
    evidenceAtStartup,
    evidenceBeforeCleanup,
  );
  requireOwnedProjectEvidenceEntrySets(
    root,
    bindings,
    evidenceBeforeCleanup.owners,
  );
  const recovered: OperationTerminalResult[] = [];
  const alreadyTerminal: OperationTerminalResult[] = [];
  for (const confirmed of confirmations) {
    requireCurrentProjectEvidenceStable(
      confirmed.operation.binding,
      evidenceAtStartup,
      inspectProjectEvidenceOwners(root, bindings),
    );
    const currentConfirmed = journal.confirmExistingTerminal(
      confirmed.operation.binding,
    );
    requireConfirmedAttemptSetStable(
      confirmed,
      currentConfirmed,
      attemptDirectoryIdentitiesBeforeCleanup,
    );
    requireConfirmedAttemptsCleanable(
      root,
      lease,
      journal,
      currentConfirmed,
      initiallyTerminal.has(currentConfirmed.result.operationId),
    );
    cleanupProjectEvidence(
      root,
      lease,
      journal,
      currentConfirmed,
      reader,
      evidenceOwners,
      evidenceAtStartup.lockOwners,
      initiallyTerminal.has(currentConfirmed.result.operationId),
    );
    cleanupConfirmedAttempts(root, lease, journal, currentConfirmed);
    confirmedCleanupHook?.(currentConfirmed);
    (initiallyTerminal.has(currentConfirmed.result.operationId)
      ? alreadyTerminal
      : recovered).push(currentConfirmed.result);
  }
  return Object.freeze({
    recovered: Object.freeze(recovered),
    alreadyTerminal: Object.freeze(alreadyTerminal),
  });
}

export const STARTUP_RECOVERY_TEST_SEAMS = Object.freeze({
  replaceConfirmedCleanupHook(replacement: ConfirmedCleanupHook): () => void {
    const previous = confirmedCleanupHook;
    confirmedCleanupHook = replacement;
    return () => {
      confirmedCleanupHook = previous;
    };
  },
});
