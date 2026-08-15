import {
  closeSync,
  constants as FS,
  linkSync,
  openSync,
  readdirSync,
  renameSync,
} from "node:fs";
import { join } from "node:path";

import { MARBLE_HUNYUAN_REGISTRY } from "@demiurges/world";

import {
  ArtifactStoreReader,
  cleanupArtifactAttemptCandidates,
  inspectRegisteredArtifactDestination,
  publishRegisteredArtifactForAdmittedOperation,
} from "./artifact-store";
import {
  DATA_ROOT_LAYOUT,
  dataRootProjectPath,
  requireLiveOpenedDataRoot,
  type OpenedDataRoot,
} from "./data-root";
import {
  requireLiveDataRootWriterLease,
  type DataRootWriterLease,
} from "./data-root-lease";
import {
  OperationJournal,
  OperationJournalError,
  OperationSingleFlight,
  artifactCandidateSetDigest,
  isDurablyFinalizedOperation,
  type ArtifactCandidateIdentity,
  type OperationBinding,
  type OperationTerminalResult,
} from "./operation-journal";
import {
  ProjectStoreError,
  WorldProjectReader,
} from "./project-store";
import {
  readStableDirectoryIdentity,
  sameStableDirectoryIdentity,
  syncDirectory,
  unlinkExactHardLink,
  writeNewSyncedFile,
  type StableDirectoryIdentity,
} from "./safe-filesystem";
import {
  cleanupStagedProjectDirectoryCandidate,
  cleanupProjectDirectoryMarker,
  publishStagedProjectDirectoryCandidate,
  stageProjectDirectoryCandidate,
} from "./project-directory-marker";
import {
  decodeWorldProjectBundle,
  encodeWorldProjectBundle,
} from "./world-project-bundle";
import { encodeWorldProjectManifestV1 } from "./world-project-manifest";

export interface ImportWorldProjectBundleResult {
  readonly terminal: OperationTerminalResult;
  readonly projectId: string;
  readonly revision: string;
  readonly replayed: boolean;
}

function syscallCode(error: unknown): string | undefined {
  if (typeof error === "object" && error !== null && "code" in error) {
    return typeof error.code === "string" ? error.code : undefined;
  }
  return undefined;
}

function candidates(
  entries: readonly {
    readonly assetId: `asset:${string}`;
    readonly digest: string;
  }[],
): readonly ArtifactCandidateIdentity[] {
  return entries
    .map((entry) => {
      const registered = MARBLE_HUNYUAN_REGISTRY.assets.find(
        (candidate) => candidate.assetId === entry.assetId && candidate.digest === entry.digest,
      );
      if (registered === undefined) throw new Error("BUNDLE_ARTIFACT_INVALID");
      return {
        assetId: registered.assetId,
        digest: registered.digest,
        byteLength: registered.byteLength,
        format: registered.format,
        elementCount: registered.elementCount,
        sourceBounds: registered.sourceBounds,
      };
    })
    .sort((left, right) => left.digest.localeCompare(right.digest));
}

export class WorldProjectBundleStore {
  readonly #root: OpenedDataRoot;
  readonly #lease: DataRootWriterLease | undefined;
  readonly #artifacts: ArtifactStoreReader;
  readonly #reader: WorldProjectReader;
  readonly #singleFlight: OperationSingleFlight;

  constructor(
    root: OpenedDataRoot,
    lease?: DataRootWriterLease,
    singleFlight: OperationSingleFlight = new OperationSingleFlight(),
  ) {
    requireLiveOpenedDataRoot(root);
    if (lease !== undefined && requireLiveDataRootWriterLease(lease).root !== root) {
      throw new Error("WorldProjectBundleStore root/lease 不一致");
    }
    this.#root = root;
    this.#lease = lease;
    this.#artifacts = new ArtifactStoreReader(root);
    this.#reader = new WorldProjectReader(root, this.#artifacts);
    this.#singleFlight = singleFlight;
  }

  export(projectId: string): Uint8Array {
    const manifest = this.#reader.open(projectId);
    const artifacts = manifest.artifacts.map((entry) => ({
      entry,
      bytes: this.#artifacts.read(entry),
    }));
    return encodeWorldProjectBundle(manifest, artifacts, this.#artifacts);
  }

  async import(
    bundleBytes: Uint8Array,
    operationId: string,
    signal?: AbortSignal,
  ): Promise<ImportWorldProjectBundleResult> {
    if (this.#lease === undefined) throw new Error("DATA_ROOT_READ_ONLY");

    // Phase A：完整 ZIP/Project/Artifact 验证与只读 destination matrix，零 Data Root mutation。
    const decoded = decodeWorldProjectBundle(bundleBytes, this.#artifacts);
    const rootPath = requireLiveOpenedDataRoot(this.#root).absolutePath;
    const projectPath = join(rootPath, dataRootProjectPath(decoded.manifest.projectId));
    let targetDirectoryExists = true;
    let targetDirectoryIdentity: StableDirectoryIdentity | undefined;
    try {
      targetDirectoryIdentity = readStableDirectoryIdentity(projectPath);
    } catch (error) {
      if (syscallCode(error) === "ENOENT") {
        targetDirectoryExists = false;
      } else {
        throw new OperationJournalError("OPERATION_RECOVERY_REQUIRED");
      }
    }
    let existingRevision: string | undefined;
    if (targetDirectoryExists) {
      const entriesBefore = readdirSync(projectPath);
      if (entriesBefore.length !== 1 || entriesBefore[0] !== "project.json") {
        throw new ProjectStoreError("PROJECT_ID_CONFLICT");
      }
      try {
        existingRevision = this.#reader.open(decoded.manifest.projectId).revision;
      } catch (error) {
        if (error instanceof ProjectStoreError && error.code === "PROJECT_NOT_FOUND") {
          throw new ProjectStoreError("PROJECT_ID_CONFLICT");
        }
        throw error;
      }
      const entriesAfter = readdirSync(projectPath);
      const identityAfter = readStableDirectoryIdentity(projectPath);
      if (
        targetDirectoryIdentity === undefined ||
        !sameStableDirectoryIdentity(targetDirectoryIdentity, identityAfter) ||
        entriesAfter.length !== 1 ||
        entriesAfter[0] !== "project.json"
      ) {
        throw new OperationJournalError("OPERATION_RECOVERY_REQUIRED");
      }
    }
    if (
      existingRevision !== undefined &&
      existingRevision !== decoded.manifest.revision
    ) {
      throw new ProjectStoreError("PROJECT_ID_CONFLICT");
    }
    for (const entry of decoded.manifest.artifacts) {
      const state = inspectRegisteredArtifactDestination(this.#root, entry);
      if (state.status === "conflict") throw new Error("ARTIFACT_DESTINATION_CONFLICT");
      if (state.status === "recovery-required") {
        throw new OperationJournalError("OPERATION_RECOVERY_REQUIRED");
      }
    }

    const candidateArtifacts = candidates(decoded.manifest.artifacts);
    const binding: OperationBinding = {
      schemaVersion: 1,
      operationId,
      operationKind: "bundle.import",
      target: { kind: "project", id: decoded.manifest.projectId },
      expectedIdentity: null,
      candidateIdentity: {
        projectRevision: decoded.manifest.revision,
        candidateArtifacts,
        artifactSetDigest: artifactCandidateSetDigest(candidateArtifacts),
      },
    };
    return this.#singleFlight.run(binding, signal, async () =>
      this.#importLeader(decoded, binding, signal),
    );
  }

  async #importLeader(
    decoded: ReturnType<typeof decodeWorldProjectBundle>,
    binding: OperationBinding,
    signal: AbortSignal | undefined,
  ): Promise<ImportWorldProjectBundleResult> {
    const lease = this.#lease!;
    if (signal?.aborted) throw new Error("REQUEST_ABORTED");
    const journal = new OperationJournal(this.#root, lease);
    const admission = journal.admit(binding);
    if (admission.status === "replay") {
      if (admission.result.variant !== "success") throw new Error(admission.result.code);
      const manifest = this.#reader.open(decoded.manifest.projectId);
      if (manifest.revision !== decoded.manifest.revision) {
        throw new OperationJournalError("OPERATION_RECOVERY_REQUIRED");
      }
      return {
        terminal: admission.result,
        projectId: manifest.projectId,
        revision: manifest.revision,
        replayed: true,
      };
    }
    const operation = admission.operation;
    if (operation.attemptToken.length === 0) {
      throw new OperationJournalError("OPERATION_RECOVERY_REQUIRED");
    }
    const rootPath = requireLiveOpenedDataRoot(this.#root).absolutePath;
    const projectsPath = join(rootPath, DATA_ROOT_LAYOUT.projects);
    const projectPath = join(rootPath, dataRootProjectPath(decoded.manifest.projectId));
    let createdProjectDirectory: StableDirectoryIdentity | undefined;
    let locked = false;
    let published = false;
    try {
      for (const artifact of decoded.artifacts) {
        const entry = MARBLE_HUNYUAN_REGISTRY.assets.find(
          (candidate) => candidate.assetId === artifact.entry.assetId,
        )!;
        publishRegisteredArtifactForAdmittedOperation({
          root: this.#root,
          lease,
          journal,
          operation,
          entry,
          bytes: artifact.bytes,
        });
      }
      if (signal?.aborted) {
        journal.finalizeAborted(operation, "REQUEST_ABORTED");
        throw new Error("REQUEST_ABORTED");
      }

      try {
        const candidate = stageProjectDirectoryCandidate(operation);
        createdProjectDirectory = publishStagedProjectDirectoryCandidate(
          operation,
          candidate,
          projectPath,
          projectsPath,
        );
      } catch (error) {
        if (syscallCode(error) !== "EEXIST") throw error;
        const fd = openSync(projectPath, FS.O_RDONLY | FS.O_DIRECTORY | FS.O_NOFOLLOW);
        closeSync(fd);
        try {
          this.#reader.open(decoded.manifest.projectId);
        } catch (openError) {
          if (
            openError instanceof ProjectStoreError &&
            openError.code === "PROJECT_NOT_FOUND"
          ) {
            journal.finalizeAborted(operation, "PROJECT_ID_CONFLICT");
            throw new ProjectStoreError("PROJECT_ID_CONFLICT");
          }
          throw openError;
        }
      }
      const lockPath = join(projectPath, ".write-lock");
      try {
        linkSync(operation.intentPath, lockPath);
        syncDirectory(projectPath);
        locked = true;
      } catch (error) {
        if (syscallCode(error) !== "EEXIST") throw error;
        journal.finalizeAborted(operation, "PROJECT_WRITE_LOCKED");
        throw new Error("PROJECT_WRITE_LOCKED");
      }

      if (signal?.aborted) {
        journal.finalizeAborted(operation, "REQUEST_ABORTED");
        throw new Error("REQUEST_ABORTED");
      }

      let existingRevision: string | undefined;
      try {
        existingRevision = this.#reader.open(decoded.manifest.projectId).revision;
      } catch (error) {
        if (!(error instanceof ProjectStoreError && error.code === "PROJECT_NOT_FOUND")) throw error;
      }
      if (existingRevision !== undefined) {
        if (existingRevision !== decoded.manifest.revision) {
          journal.finalizeAborted(operation, "PROJECT_ID_CONFLICT");
          throw new ProjectStoreError("PROJECT_ID_CONFLICT");
        }
      } else {
        const staged = join(operation.attemptPath, "project.json");
        writeNewSyncedFile(staged, encodeWorldProjectManifestV1(decoded.manifest));
        syncDirectory(operation.attemptPath);
        requireLiveDataRootWriterLease(lease);
        renameSync(staged, join(projectPath, "project.json"));
        syncDirectory(projectPath);
        published = true;
      }
      const terminal = journal.finalizeSuccess(operation);
      return {
        terminal,
        projectId: decoded.manifest.projectId,
        revision: decoded.manifest.revision,
        replayed: existingRevision !== undefined,
      };
    } catch (error) {
      if (published) throw new OperationJournalError("OPERATION_RECOVERY_REQUIRED");
      if (
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        error.code === "ARTIFACT_DESTINATION_CONFLICT"
      ) {
        journal.finalizeAborted(operation, "ARTIFACT_DESTINATION_CONFLICT");
      }
      throw error;
    } finally {
      let cleanupFailed = false;
      const terminalExists = isDurablyFinalizedOperation(
        operation,
        this.#root,
        lease,
        journal,
      );
      if (terminalExists && locked) {
        try {
          unlinkExactHardLink(
            join(projectPath, ".write-lock"),
            operation.intentPath,
            projectPath,
          );
          locked = false;
        } catch {
          cleanupFailed = true;
        }
      }
      if (
        terminalExists &&
        !cleanupFailed &&
        createdProjectDirectory !== undefined
      ) {
        try {
          cleanupProjectDirectoryMarker(
            projectPath,
            projectsPath,
            operation.binding,
            {
              required: true,
              removeDirectory: !published,
              stagedMarkerPath: join(operation.attemptPath, "project-directory.json"),
            },
          );
        } catch {
          cleanupFailed = true;
        }
      }
      if (terminalExists && !cleanupFailed) {
        try {
          cleanupStagedProjectDirectoryCandidate(operation);
          cleanupArtifactAttemptCandidates(
            this.#root,
            lease,
            journal,
            operation,
            decoded.manifest.artifacts,
          );
          journal.cleanupAttempt(operation);
        } catch {
          cleanupFailed = true;
        }
      }
      if (cleanupFailed) {
        throw new OperationJournalError("OPERATION_RECOVERY_REQUIRED");
      }
    }
  }
}
