import {
  closeSync,
  constants as FS,
  fstatSync,
  linkSync,
  openSync,
  readdirSync,
  renameSync,
} from "node:fs";
import { join } from "node:path";

import {
  MARBLE_HUNYUAN_MANIFEST_DIGEST,
  MARBLE_HUNYUAN_REGISTRY,
  RuntimeMvpHost,
  deepFreeze,
  type RepositoryHistory,
} from "@demiurges/world";

import {
  DATA_ROOT_LAYOUT,
  dataRootProjectPath,
  requireDataRootProjectId,
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
  isDurablyFinalizedOperation,
  type AdmittedOperation,
  type OperationBinding,
  type OperationTerminalResult,
} from "./operation-journal";
import {
  readStableDirectoryIdentity,
  readStableRegularFile,
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
  WORLD_PROJECT_MANIFEST_MAX_BYTES,
  WORLD_PROJECT_REGISTRY_ID,
  computeWorldProjectRevision,
  decodeWorldProjectManifestV1,
  encodeWorldProjectManifestV1,
  validateWorldProjectManifest,
  type WorldProjectArtifactEntry,
  type WorldProjectManifestRevisionBody,
  type WorldProjectManifestV1,
} from "./world-project-manifest";

export const WORLD_PROJECT_LIST_MAX_ENTRIES = 256;

export type ProjectStoreErrorCode =
  | "PROJECT_NOT_FOUND"
  | "PROJECT_REVISION_CONFLICT"
  | "PROJECT_ID_CONFLICT"
  | "PROJECT_WRITE_LOCKED"
  | "PROJECT_RECOVERY_REQUIRED"
  | "REQUEST_ABORTED";

export class ProjectStoreError extends Error {
  readonly code: ProjectStoreErrorCode;

  constructor(code: ProjectStoreErrorCode) {
    super(code);
    this.name = "ProjectStoreError";
    this.code = code;
  }
}

export interface ProjectArtifactVerifier {
  verify(entry: WorldProjectArtifactEntry): void;
}

export interface ProjectListEntry {
  readonly projectId: WorldProjectManifestV1["projectId"];
  readonly displayName: string;
  readonly revision: WorldProjectManifestV1["revision"];
  readonly modifiedTimeMs: number;
}

export interface ProjectListResult {
  readonly projects: readonly ProjectListEntry[];
  readonly rejectedEntryCount: number;
}

export interface SaveProjectResult {
  readonly manifest: WorldProjectManifestV1;
  readonly terminal: OperationTerminalResult;
  readonly replayed: boolean;
}

function byteEqual(left: Uint8Array, right: Uint8Array): boolean {
  return Buffer.from(left).equals(Buffer.from(right));
}

function syscallCode(error: unknown): string | undefined {
  if (typeof error === "object" && error !== null && "code" in error) {
    return typeof error.code === "string" ? error.code : undefined;
  }
  return undefined;
}

function sameDirectoryIdentity(
  left: StableDirectoryIdentity,
  right: StableDirectoryIdentity,
): boolean {
  return left.dev === right.dev &&
    left.ino === right.ino &&
    left.mode === right.mode &&
    left.uid === right.uid &&
    left.gid === right.gid;
}

function projectArtifacts(history: RepositoryHistory): readonly WorldProjectArtifactEntry[] {
  const byDigest = new Map<string, WorldProjectArtifactEntry>();
  for (const snapshot of history.snapshots) {
    for (const entity of snapshot.entities) {
      const assetIds: string[] = [];
      if (entity.representations.visual.kind === "registered-rigid-mesh") {
        assetIds.push(entity.representations.visual.assetId);
      }
      if (entity.representations.observation?.kind === "registered-gaussian-splat") {
        assetIds.push(entity.representations.observation.assetId);
      }
      for (const assetId of assetIds) {
        const registered = MARBLE_HUNYUAN_REGISTRY.assets.find(
          (entry) => entry.assetId === assetId,
        );
        if (registered === undefined) {
          throw new ProjectStoreError("PROJECT_RECOVERY_REQUIRED");
        }
        byDigest.set(registered.digest, {
          assetId: registered.assetId,
          digest: registered.digest,
          byteLength: registered.byteLength,
          format: registered.format,
        });
      }
    }
  }
  return [...byDigest.values()].sort((left, right) =>
    left.digest < right.digest ? -1 : left.digest > right.digest ? 1 : 0,
  );
}

export function createWorldProjectManifest(
  projectId: string,
  displayName: string,
  history: RepositoryHistory,
): WorldProjectManifestV1 {
  const body = {
    schemaVersion: 1,
    projectId: requireDataRootProjectId(projectId) as `project:${string}`,
    metadata: { displayName },
    registry: {
      id: WORLD_PROJECT_REGISTRY_ID,
      manifestDigest: MARBLE_HUNYUAN_MANIFEST_DIGEST,
    },
    snapshots: history.snapshots,
    history: {
      snapshotIds: history.snapshots.map((snapshot) => snapshot.id),
      cursor: history.cursor,
    },
    currentRef: history.currentRef,
    artifacts: projectArtifacts(history),
  } as WorldProjectManifestRevisionBody;
  return validateWorldProjectManifest({
    ...body,
    revision: computeWorldProjectRevision(body),
  });
}

export class WorldProjectReader {
  readonly #root: OpenedDataRoot;
  readonly #artifacts: ProjectArtifactVerifier;

  constructor(root: OpenedDataRoot, artifacts: ProjectArtifactVerifier) {
    requireLiveOpenedDataRoot(root);
    this.#root = root;
    this.#artifacts = artifacts;
  }

  #rootPath(): string {
    return requireLiveOpenedDataRoot(this.#root).absolutePath;
  }

  open(projectId: string): WorldProjectManifestV1 {
    const canonicalId = requireDataRootProjectId(projectId);
    const projectsPath = join(this.#rootPath(), DATA_ROOT_LAYOUT.projects);
    const projectPath = join(projectsPath, canonicalId);
    const path = join(projectPath, "project.json");
    let bytes: Uint8Array;
    try {
      const projectsBefore = readStableDirectoryIdentity(projectsPath);
      const before = readStableDirectoryIdentity(projectPath);
      bytes = readStableRegularFile(path, WORLD_PROJECT_MANIFEST_MAX_BYTES);
      const after = readStableDirectoryIdentity(projectPath);
      const projectsAfter = readStableDirectoryIdentity(projectsPath);
      if (
        !sameDirectoryIdentity(before, after) ||
        !sameDirectoryIdentity(projectsBefore, projectsAfter)
      ) {
        throw new ProjectStoreError("PROJECT_RECOVERY_REQUIRED");
      }
    } catch (error) {
      if (syscallCode(error) === "ENOENT") throw new ProjectStoreError("PROJECT_NOT_FOUND");
      if (error instanceof ProjectStoreError) throw error;
      throw new ProjectStoreError("PROJECT_RECOVERY_REQUIRED");
    }
    const manifest = decodeWorldProjectManifestV1(bytes);
    if (manifest.projectId !== canonicalId) {
      throw new ProjectStoreError("PROJECT_ID_CONFLICT");
    }
    if (!byteEqual(bytes, encodeWorldProjectManifestV1(manifest))) {
      throw new ProjectStoreError("PROJECT_RECOVERY_REQUIRED");
    }
    for (const artifact of manifest.artifacts) this.#artifacts.verify(artifact);
    requireLiveOpenedDataRoot(this.#root);
    return manifest;
  }

  restoreHost(projectId: string): {
    readonly manifest: WorldProjectManifestV1;
    readonly host: RuntimeMvpHost;
  } {
    const manifest = this.open(projectId);
    const host = RuntimeMvpHost.restoreProject(manifest.snapshots, manifest.currentRef);
    return Object.freeze({ manifest, host });
  }

  list(): ProjectListResult {
    const projectsPath = join(this.#rootPath(), DATA_ROOT_LAYOUT.projects);
    let entries: string[];
    let projectsIdentity: StableDirectoryIdentity;
    try {
      projectsIdentity = readStableDirectoryIdentity(projectsPath);
      entries = readdirSync(projectsPath);
      const after = readStableDirectoryIdentity(projectsPath);
      if (!sameDirectoryIdentity(projectsIdentity, after)) {
        throw new ProjectStoreError("PROJECT_RECOVERY_REQUIRED");
      }
    } catch (error) {
      if (syscallCode(error) === "ENOENT") {
        return deepFreeze({ projects: [], rejectedEntryCount: 0 }) as ProjectListResult;
      }
      if (error instanceof ProjectStoreError) throw error;
      throw new ProjectStoreError("PROJECT_RECOVERY_REQUIRED");
    }
    if (entries.length > WORLD_PROJECT_LIST_MAX_ENTRIES) {
      throw new ProjectStoreError("PROJECT_RECOVERY_REQUIRED");
    }
    const projects: ProjectListEntry[] = [];
    let rejectedEntryCount = 0;
    for (const name of entries) {
      try {
        const manifest = this.open(name);
        const fd = openSync(
          join(projectsPath, name, "project.json"),
          FS.O_RDONLY | FS.O_NOFOLLOW,
        );
        try {
          const stat = fstatSync(fd);
          projects.push({
            projectId: manifest.projectId,
            displayName: manifest.metadata.displayName,
            revision: manifest.revision,
            modifiedTimeMs: stat.mtimeMs,
          });
        } finally {
          closeSync(fd);
        }
      } catch {
        rejectedEntryCount += 1;
      }
    }
    try {
      if (!sameDirectoryIdentity(
        projectsIdentity,
        readStableDirectoryIdentity(projectsPath),
      )) {
        throw new ProjectStoreError("PROJECT_RECOVERY_REQUIRED");
      }
    } catch (error) {
      if (error instanceof ProjectStoreError) throw error;
      throw new ProjectStoreError("PROJECT_RECOVERY_REQUIRED");
    }
    projects.sort((left, right) =>
      right.modifiedTimeMs - left.modifiedTimeMs ||
      left.projectId.localeCompare(right.projectId),
    );
    return deepFreeze({ projects, rejectedEntryCount }) as ProjectListResult;
  }
}

export class WorldProjectWriter {
  readonly #root: OpenedDataRoot;
  readonly #lease: DataRootWriterLease;
  readonly #reader: WorldProjectReader;
  readonly #artifacts: ProjectArtifactVerifier;
  readonly #journal: OperationJournal;
  readonly #singleFlight: OperationSingleFlight;

  constructor(
    root: OpenedDataRoot,
    lease: DataRootWriterLease,
    artifacts: ProjectArtifactVerifier,
    singleFlight: OperationSingleFlight = new OperationSingleFlight(),
  ) {
    const liveLease = requireLiveDataRootWriterLease(lease);
    if (liveLease.root !== root) throw new Error("WorldProjectWriter root/lease 不一致");
    this.#root = root;
    this.#lease = lease;
    this.#artifacts = artifacts;
    this.#reader = new WorldProjectReader(root, artifacts);
    this.#journal = new OperationJournal(root, lease);
    this.#singleFlight = singleFlight;
  }

  reader(): WorldProjectReader {
    return this.#reader;
  }

  save(
    manifestInput: WorldProjectManifestV1,
    operationId: string,
    expectedRevision: string | null,
    signal?: AbortSignal,
  ): Promise<SaveProjectResult> {
    const manifest = validateWorldProjectManifest(manifestInput);
    for (const artifact of manifest.artifacts) this.#artifacts.verify(artifact);
    const binding: OperationBinding = {
      schemaVersion: 1,
      operationId,
      operationKind: expectedRevision === null ? "project.save-as" : "project.save",
      target: { kind: "project", id: manifest.projectId },
      expectedIdentity: expectedRevision,
      candidateIdentity: { projectRevision: manifest.revision },
    };
    return this.#singleFlight.run(binding, signal, async () =>
      this.#saveLeader(manifest, binding, signal),
    );
  }

  async #saveLeader(
    manifest: WorldProjectManifestV1,
    binding: OperationBinding,
    signal: AbortSignal | undefined,
  ): Promise<SaveProjectResult> {
    if (signal?.aborted) throw new ProjectStoreError("REQUEST_ABORTED");
    requireLiveDataRootWriterLease(this.#lease);
    // Open/Artifact validation occurs before this durable admission in the caller-visible flow.
    for (const artifact of manifest.artifacts) {
      // Re-open through the reader's exact Project path is impossible before publish; the
      // verifier was already called while constructing/opening the manifest. A final project
      // decode below rechecks the exact declared set.
      void artifact;
    }
    const admission = this.#journal.admit(binding);
    if (admission.status === "replay") {
      if (admission.result.variant === "aborted-before-publish") {
        throw new ProjectStoreError(
          admission.result.code as ProjectStoreErrorCode,
        );
      }
      const published = this.#reader.open(manifest.projectId);
      if (published.revision !== manifest.revision) {
        throw new OperationJournalError("OPERATION_RECOVERY_REQUIRED");
      }
      return { manifest: published, terminal: admission.result, replayed: true };
    }
    const operation = admission.operation;
    if (operation.attemptPath.length === 0) {
      throw new OperationJournalError("OPERATION_RECOVERY_REQUIRED");
    }

    const rootPath = requireLiveOpenedDataRoot(this.#root).absolutePath;
    const projectsPath = join(rootPath, DATA_ROOT_LAYOUT.projects);
    const projectPath = join(rootPath, dataRootProjectPath(manifest.projectId));
    let createdProjectDirectory: StableDirectoryIdentity | undefined;
    let locked = false;
    let published = false;
    try {
      if (signal?.aborted) {
        return this.#abort(operation, manifest, "REQUEST_ABORTED");
      }
      if (binding.expectedIdentity !== null) {
        const dirFd = openSync(
          projectPath,
          FS.O_RDONLY | FS.O_DIRECTORY | FS.O_NOFOLLOW,
        );
        closeSync(dirFd);
      } else {
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
          const dirFd = openSync(
            projectPath,
            FS.O_RDONLY | FS.O_DIRECTORY | FS.O_NOFOLLOW,
          );
          closeSync(dirFd);
          try {
            this.#reader.open(manifest.projectId);
          } catch (openError) {
            if (
              openError instanceof ProjectStoreError &&
              openError.code === "PROJECT_NOT_FOUND"
            ) {
              return this.#abort(operation, manifest, "PROJECT_ID_CONFLICT");
            }
            throw openError;
          }
        }
      }

      const lockPath = join(projectPath, ".write-lock");
      try {
        linkSync(operation.intentPath, lockPath);
        syncDirectory(projectPath);
        locked = true;
      } catch (error) {
        if (syscallCode(error) !== "EEXIST") throw error;
        return this.#abort(operation, manifest, "PROJECT_WRITE_LOCKED");
      }

      const projectFile = join(projectPath, "project.json");
      let existing: WorldProjectManifestV1 | undefined;
      try {
        existing = this.#reader.open(manifest.projectId);
      } catch (error) {
        if (!(error instanceof ProjectStoreError && error.code === "PROJECT_NOT_FOUND")) {
          throw error;
        }
      }
      if (binding.expectedIdentity === null) {
        if (existing !== undefined) {
          if (existing.revision === manifest.revision) {
            syncDirectory(projectPath);
            const terminal = this.#journal.finalizeSuccess(operation);
            return { manifest: existing, terminal, replayed: true };
          }
          return this.#abort(operation, manifest, "PROJECT_ID_CONFLICT");
        }
      } else if (
        existing === undefined ||
        existing.revision !== binding.expectedIdentity
      ) {
        return this.#abort(operation, manifest, "PROJECT_REVISION_CONFLICT");
      }

      if (signal?.aborted) return this.#abort(operation, manifest, "REQUEST_ABORTED");
      const stagedProject = join(operation.attemptPath, "project.json");
      writeNewSyncedFile(stagedProject, encodeWorldProjectManifestV1(manifest));
      syncDirectory(operation.attemptPath);
      const redecoded = decodeWorldProjectManifestV1(
        readStableRegularFile(stagedProject, WORLD_PROJECT_MANIFEST_MAX_BYTES),
      );
      if (redecoded.revision !== manifest.revision) {
        throw new OperationJournalError("OPERATION_RECOVERY_REQUIRED");
      }
      requireLiveDataRootWriterLease(this.#lease);
      renameSync(stagedProject, projectFile);
      syncDirectory(projectPath);
      published = true;
      const terminal = this.#journal.finalizeSuccess(operation);
      return { manifest, terminal, replayed: false };
    } catch (error) {
      if (published) throw new OperationJournalError("OPERATION_RECOVERY_REQUIRED");
      throw error;
    } finally {
      let cleanupFailed = false;
      const terminalExists = isDurablyFinalizedOperation(
        operation,
        this.#root,
        this.#lease,
        this.#journal,
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
          this.#journal.cleanupAttempt(operation);
        } catch {
          cleanupFailed = true;
        }
      }
      if (cleanupFailed) {
        throw new OperationJournalError("OPERATION_RECOVERY_REQUIRED");
      }
    }
  }

  #abort(
    operation: AdmittedOperation,
    _manifest: WorldProjectManifestV1,
    code: ProjectStoreErrorCode,
  ): never {
    this.#journal.finalizeAborted(operation, code);
    throw new ProjectStoreError(code);
  }
}
