import {
  closeSync,
  constants as FS,
  fstatSync,
  linkSync,
  lstatSync,
  mkdirSync,
  openSync,
  readdirSync,
  readSync,
  unlinkSync,
  type BigIntStats,
} from "node:fs";
import { join } from "node:path";

import {
  MARBLE_HUNYUAN_REGISTRY,
  canonicalJsonBytes,
  type ManifestAssetEntry,
} from "@demiurges/world";

import { validateRegisteredArtifactBytes } from "../../../scripts/provider-artifact-validation";
import {
  DATA_ROOT_LAYOUT,
  dataRootArtifactPath,
  dataRootStagingPath,
  requireLiveOpenedDataRoot,
  type OpenedDataRoot,
} from "./data-root";
import {
  requireLiveDataRootWriterLease,
  type DataRootWriterLease,
} from "./data-root-lease";
import { ensureDataRootLayout } from "./data-root-layout";
import {
  OperationJournal,
  requireDurablyFinalizedOperation,
  requireLiveAdmittedOperation,
  type AdmittedOperation,
  type ArtifactCandidateIdentity,
} from "./operation-journal";
import {
  readStableDirectoryIdentity,
  syncDirectory,
  writeNewSyncedFile,
  type StableDirectoryIdentity,
} from "./safe-filesystem";
import type { WorldProjectArtifactEntry } from "./world-project-manifest";

export type ArtifactStoreErrorCode =
  | "DATA_ROOT_WRITER_LEASE_REQUIRED"
  | "ARTIFACT_NOT_REGISTERED"
  | "ARTIFACT_IDENTITY_MISMATCH"
  | "ARTIFACT_DESTINATION_CONFLICT"
  | "OPERATION_RECOVERY_REQUIRED";

export class ArtifactStoreError extends Error {
  readonly code: ArtifactStoreErrorCode;

  constructor(code: ArtifactStoreErrorCode) {
    super(code);
    this.name = "ArtifactStoreError";
    this.code = code;
  }
}

export interface PublishRegisteredArtifactOptions {
  readonly root: OpenedDataRoot;
  readonly lease: DataRootWriterLease;
  readonly journal: OperationJournal;
  readonly operation: AdmittedOperation;
  readonly entry: ManifestAssetEntry;
  readonly bytes: Uint8Array;
}

export interface PublishedArtifactIdentity {
  readonly assetId: ManifestAssetEntry["assetId"];
  readonly digest: string;
  readonly byteLength: number;
  readonly format: ManifestAssetEntry["format"];
  readonly elementCount: number;
  readonly sourceBounds: ManifestAssetEntry["sourceBounds"];
}

export interface PublishRegisteredArtifactResult {
  readonly status: "published" | "already-present";
  readonly artifact: PublishedArtifactIdentity;
}

interface ArtifactLayoutIdentity {
  readonly artifacts: StableDirectoryIdentity;
  readonly digests: StableDirectoryIdentity;
}

function sameDirectoryIdentity(
  left: StableDirectoryIdentity,
  right: StableDirectoryIdentity,
): boolean {
  return left.dev === right.dev && left.ino === right.ino &&
    left.mode === right.mode && left.uid === right.uid && left.gid === right.gid;
}

function readArtifactLayoutIdentity(root: OpenedDataRoot): ArtifactLayoutIdentity {
  const rootPath = requireLiveOpenedDataRoot(root).absolutePath;
  const artifacts = readStableDirectoryIdentity(join(rootPath, DATA_ROOT_LAYOUT.artifacts));
  const digests = readStableDirectoryIdentity(
    join(rootPath, DATA_ROOT_LAYOUT.artifactDigestDir),
  );
  requireLiveOpenedDataRoot(root);
  return { artifacts, digests };
}

function sameArtifactLayout(
  left: ArtifactLayoutIdentity,
  right: ArtifactLayoutIdentity,
): boolean {
  return sameDirectoryIdentity(left.artifacts, right.artifacts) &&
    sameDirectoryIdentity(left.digests, right.digests);
}

export type ArtifactDestinationState =
  | { readonly status: "absent" }
  | { readonly status: "exact"; readonly artifact: PublishedArtifactIdentity }
  | { readonly status: "conflict" }
  | { readonly status: "recovery-required" };

interface OpenedFileIdentity {
  readonly dev: bigint;
  readonly ino: bigint;
  readonly mode: bigint;
  readonly nlink: bigint;
  readonly uid: bigint;
  readonly gid: bigint;
  readonly size: bigint;
  readonly mtimeNs: bigint;
  readonly ctimeNs: bigint;
}

interface ValidatedOpenedArtifact {
  readonly identity: OpenedFileIdentity;
  readonly artifact: PublishedArtifactIdentity;
  readonly bytes: Uint8Array;
}

const operationCandidateIdentities = new WeakMap<
  AdmittedOperation,
  Map<string, OpenedFileIdentity>
>();

class StableDestinationMismatch extends Error {}
class UnstableDestination extends Error {}

function fail(code: ArtifactStoreErrorCode): never {
  throw new ArtifactStoreError(code);
}

function syscallCode(error: unknown): string {
  if (typeof error === "object" && error !== null && "code" in error) {
    const code = error.code;
    if (typeof code === "string") return code;
  }
  return "UNKNOWN";
}

function bytesEqual(left: Uint8Array, right: Uint8Array): boolean {
  if (left.byteLength !== right.byteLength) return false;
  for (let index = 0; index < left.byteLength; index += 1) {
    if (left[index] !== right[index]) return false;
  }
  return true;
}

function requireRegisteredEntry(value: ManifestAssetEntry): ManifestAssetEntry {
  let encoded: Uint8Array;
  try {
    encoded = canonicalJsonBytes(value);
  } catch {
    fail("ARTIFACT_NOT_REGISTERED");
  }
  const assetIdDescriptor = Object.getOwnPropertyDescriptor(value, "assetId");
  const assetId = assetIdDescriptor && "value" in assetIdDescriptor
    ? assetIdDescriptor.value
    : undefined;
  const registered = MARBLE_HUNYUAN_REGISTRY.assets.find(
    (entry) => entry.assetId === assetId,
  );
  if (
    registered === undefined ||
    !bytesEqual(encoded, canonicalJsonBytes(registered))
  ) {
    fail("ARTIFACT_NOT_REGISTERED");
  }
  return registered;
}

function artifactIdentity(entry: ManifestAssetEntry): PublishedArtifactIdentity {
  return Object.freeze({
    assetId: entry.assetId,
    digest: entry.digest,
    byteLength: entry.byteLength,
    format: entry.format,
    elementCount: entry.elementCount,
    sourceBounds: entry.sourceBounds,
  });
}

/** startup recovery 只接受与 frozen registry 完整一致的 durable candidate。 */
export function requireRegisteredArtifactCandidate(
  value: ArtifactCandidateIdentity,
): ManifestAssetEntry {
  const registered = MARBLE_HUNYUAN_REGISTRY.assets.find(
    (entry) => entry.assetId === value.assetId,
  );
  if (
    registered === undefined ||
    !bytesEqual(
      canonicalJsonBytes(value),
      canonicalJsonBytes(artifactIdentity(registered)),
    )
  ) {
    fail("OPERATION_RECOVERY_REQUIRED");
  }
  return registered;
}

function requireProjectArtifactEntry(
  value: WorldProjectArtifactEntry,
): ManifestAssetEntry {
  const registered = MARBLE_HUNYUAN_REGISTRY.assets.find(
    (entry) => entry.assetId === value.assetId,
  );
  if (
    registered === undefined ||
    registered.digest !== value.digest ||
    registered.byteLength !== value.byteLength ||
    registered.format !== value.format
  ) {
    fail("ARTIFACT_NOT_REGISTERED");
  }
  return registered;
}

function requireMutationAuthority(
  root: OpenedDataRoot,
  lease: DataRootWriterLease,
): string {
  let liveRoot: ReturnType<typeof requireLiveOpenedDataRoot>;
  let liveLease: ReturnType<typeof requireLiveDataRootWriterLease>;
  try {
    liveRoot = requireLiveOpenedDataRoot(root);
    liveLease = requireLiveDataRootWriterLease(lease);
  } catch {
    fail("DATA_ROOT_WRITER_LEASE_REQUIRED");
  }
  if (
    liveLease.root !== root ||
    liveLease.identity.dev !== liveRoot.identity.dev ||
    liveLease.identity.ino !== liveRoot.identity.ino
  ) {
    fail("DATA_ROOT_WRITER_LEASE_REQUIRED");
  }
  return liveRoot.absolutePath;
}

function requireDirectory(path: string): void {
  let fd: number | undefined;
  try {
    fd = openSync(path, FS.O_RDONLY | FS.O_DIRECTORY | FS.O_NOFOLLOW);
    const stat = fstatSync(fd, { bigint: true });
    if (
      (stat.mode & 0o170000n) !== 0o40000n ||
      (stat.mode & 0o777n) !== 0o700n
    ) {
      fail("OPERATION_RECOVERY_REQUIRED");
    }
  } catch (error) {
    if (error instanceof ArtifactStoreError) throw error;
    fail("OPERATION_RECOVERY_REQUIRED");
  } finally {
    if (fd !== undefined) closeSync(fd);
  }
}

function ensureAttemptDirectory(
  root: OpenedDataRoot,
  lease: DataRootWriterLease,
  path: string,
  parentPath: string,
): void {
  requireMutationAuthority(root, lease);
  let created = false;
  try {
    mkdirSync(path, { mode: 0o700, recursive: false });
    created = true;
  } catch (error) {
    if (syscallCode(error) !== "EEXIST") {
      fail("OPERATION_RECOVERY_REQUIRED");
    }
  }
  requireMutationAuthority(root, lease);
  requireDirectory(path);
  if (created) {
    try {
      syncDirectory(parentPath);
    } catch {
      fail("OPERATION_RECOVERY_REQUIRED");
    }
    requireMutationAuthority(root, lease);
  }
}

/** 只允许持有匹配 live lease 的 writer 建立固定 v1 layout。 */
export function initializeArtifactStore(
  root: OpenedDataRoot,
  lease: DataRootWriterLease,
): void {
  requireMutationAuthority(root, lease);
  try {
    ensureDataRootLayout(root, lease);
  } catch {
    try {
      requireMutationAuthority(root, lease);
    } catch (error) {
      if (error instanceof ArtifactStoreError) throw error;
      fail("DATA_ROOT_WRITER_LEASE_REQUIRED");
    }
    fail("OPERATION_RECOVERY_REQUIRED");
  }
  requireMutationAuthority(root, lease);
}

function fileIdentity(stat: BigIntStats): OpenedFileIdentity {
  return {
    dev: stat.dev,
    ino: stat.ino,
    mode: stat.mode,
    nlink: stat.nlink,
    uid: stat.uid,
    gid: stat.gid,
    size: stat.size,
    mtimeNs: stat.mtimeNs,
    ctimeNs: stat.ctimeNs,
  };
}

function sameFileIdentity(
  left: OpenedFileIdentity,
  right: OpenedFileIdentity,
): boolean {
  return (
    left.dev === right.dev &&
    left.ino === right.ino &&
    left.mode === right.mode &&
    left.nlink === right.nlink &&
    left.uid === right.uid &&
    left.gid === right.gid &&
    left.size === right.size &&
    left.mtimeNs === right.mtimeNs &&
    left.ctimeNs === right.ctimeNs
  );
}

function stableNonRegularPath(path: string): boolean {
  try {
    const before = lstatSync(path, { bigint: true });
    const after = lstatSync(path, { bigint: true });
    return (
      (before.mode & 0o170000n) !== 0o100000n &&
      sameFileIdentity(fileIdentity(before), fileIdentity(after))
    );
  } catch {
    return false;
  }
}

function validateOpenedArtifact(
  path: string,
  entry: ManifestAssetEntry,
  afterRead?: () => void,
): ValidatedOpenedArtifact {
  let fd: number | undefined;
  try {
    try {
      fd = openSync(path, FS.O_RDONLY | FS.O_NONBLOCK | FS.O_NOFOLLOW);
    } catch {
      if (stableNonRegularPath(path)) throw new StableDestinationMismatch();
      throw new UnstableDestination();
    }
    const before = fileIdentity(fstatSync(fd, { bigint: true }));
    const stableMismatch =
      (before.mode & 0o170000n) !== 0o100000n ||
      (before.mode & 0o777n) !== 0o600n ||
      before.size !== BigInt(entry.byteLength);
    let bytes: Uint8Array | undefined;
    let readFailed = false;
    if (!stableMismatch) {
      bytes = new Uint8Array(entry.byteLength);
      let offset = 0;
      try {
        while (offset < bytes.byteLength) {
          const count = readSync(fd, bytes, offset, bytes.byteLength - offset, offset);
          if (count <= 0) throw new Error("short-read");
          offset += count;
        }
      } catch {
        readFailed = true;
      }
    }
    afterRead?.();
    const after = fileIdentity(fstatSync(fd, { bigint: true }));
    if (!sameFileIdentity(before, after)) throw new UnstableDestination();
    if (stableMismatch) throw new StableDestinationMismatch();
    if (readFailed || bytes === undefined) throw new UnstableDestination();
    try {
      validateRegisteredArtifactBytes(entry, bytes);
    } catch {
      throw new StableDestinationMismatch();
    }
    return {
      identity: after,
      artifact: artifactIdentity(entry),
      bytes,
    };
  } finally {
    if (fd !== undefined) closeSync(fd);
  }
}

function requireExactDestination(
  path: string,
  entry: ManifestAssetEntry,
  afterRead?: () => void,
): ValidatedOpenedArtifact {
  try {
    return validateOpenedArtifact(path, entry, afterRead);
  } catch (error) {
    if (error instanceof StableDestinationMismatch) {
      fail("ARTIFACT_DESTINATION_CONFLICT");
    }
    fail("OPERATION_RECOVERY_REQUIRED");
  }
}

function requireExactStagedCandidate(
  path: string,
  entry: ManifestAssetEntry,
): ValidatedOpenedArtifact {
  try {
    return validateOpenedArtifact(path, entry);
  } catch {
    fail("OPERATION_RECOVERY_REQUIRED");
  }
}

/**
 * 将一项 frozen registry Artifact 原子发布到 immutable CAS。
 * global operation admission / terminal result 由上层 operation coordinator 持有；
 * 本函数只负责 admitted leader 的 Artifact staging 与 destination matrix。
 */
export function publishRegisteredArtifactForAdmittedOperation(
  options: PublishRegisteredArtifactOptions,
): PublishRegisteredArtifactResult {
  requireMutationAuthority(options.root, options.lease);
  const operation = requireLiveAdmittedOperation(
    options.operation,
    options.root,
    options.lease,
    options.journal,
  );
  if (
    operation.attemptPath.length === 0 ||
    operation.attemptToken.length === 0
  ) {
    fail("OPERATION_RECOVERY_REQUIRED");
  }
  const entry = requireRegisteredEntry(options.entry);
  const candidate = operation.binding.candidateIdentity;
  const admittedEntry = "digest" in candidate
    ? candidate
    : "candidateArtifacts" in candidate
      ? candidate.candidateArtifacts.find((value) => value.assetId === entry.assetId)
      : undefined;
  const targetMatches = operation.binding.operationKind === "artifact.publish"
    ? operation.binding.target.kind === "artifact" &&
      operation.binding.target.id === entry.assetId
    : operation.binding.operationKind === "artifact.import-dh013"
      ? operation.binding.target.kind === "registry" &&
        operation.binding.target.id === "registry:marble-hunyuan-v1"
      : operation.binding.operationKind === "bundle.import" &&
        operation.binding.target.kind === "project";
  if (
    admittedEntry === undefined ||
    !targetMatches ||
    !bytesEqual(
      canonicalJsonBytes(admittedEntry),
      canonicalJsonBytes(artifactIdentity(entry)),
    )
  ) {
    fail("OPERATION_RECOVERY_REQUIRED");
  }
  const candidateBytes = Uint8Array.from(options.bytes);
  try {
    validateRegisteredArtifactBytes(entry, candidateBytes);
  } catch {
    fail("ARTIFACT_IDENTITY_MISMATCH");
  }

  let attemptRelative: string;
  let targetRelative: string;
  try {
    attemptRelative = dataRootStagingPath(
      operation.binding.operationId,
      operation.attemptToken,
    );
    targetRelative = dataRootArtifactPath(entry.digest);
  } catch {
    fail("OPERATION_RECOVERY_REQUIRED");
  }
  initializeArtifactStore(options.root, options.lease);
  const absoluteRoot = requireMutationAuthority(options.root, options.lease);
  const stagingRoot = join(absoluteRoot, DATA_ROOT_LAYOUT.staging);
  const attemptDirectory = join(absoluteRoot, attemptRelative);
  ensureAttemptDirectory(
    options.root,
    options.lease,
    attemptDirectory,
    stagingRoot,
  );
  const candidatePath = join(attemptDirectory, `artifact-${entry.digest}.candidate`);
  try {
    requireMutationAuthority(options.root, options.lease);
    writeNewSyncedFile(candidatePath, candidateBytes, 0o600);
    requireMutationAuthority(options.root, options.lease);
    const staged = requireExactStagedCandidate(candidatePath, entry);
    let identities = operationCandidateIdentities.get(operation);
    if (identities === undefined) {
      identities = new Map();
      operationCandidateIdentities.set(operation, identities);
    }
    identities.set(entry.digest, staged.identity);
    syncDirectory(attemptDirectory);
    requireMutationAuthority(options.root, options.lease);
  } catch (error) {
    if (error instanceof ArtifactStoreError) throw error;
    fail("OPERATION_RECOVERY_REQUIRED");
  }

  const targetPath = join(absoluteRoot, targetRelative);
  try {
    requireMutationAuthority(options.root, options.lease);
    linkSync(candidatePath, targetPath);
  } catch (error) {
    if (error instanceof ArtifactStoreError) throw error;
    if (syscallCode(error) === "EEXIST") {
      const existing = requireExactDestination(targetPath, entry);
      // link may have become visible before a previous parent fsync completed.
      // Exact EEXIST replay repairs the business candidate durability first.
      syncDirectory(join(absoluteRoot, DATA_ROOT_LAYOUT.artifactDigestDir));
      requireMutationAuthority(options.root, options.lease);
      return Object.freeze({
        status: "already-present",
        artifact: existing.artifact,
      });
    }
    fail("OPERATION_RECOVERY_REQUIRED");
  }

  try {
    syncDirectory(join(absoluteRoot, DATA_ROOT_LAYOUT.artifactDigestDir));
    requireMutationAuthority(options.root, options.lease);
    const staged = requireExactStagedCandidate(candidatePath, entry);
    const published = requireExactDestination(targetPath, entry);
    if (
      staged.identity.dev !== published.identity.dev ||
      staged.identity.ino !== published.identity.ino
    ) {
      fail("OPERATION_RECOVERY_REQUIRED");
    }
    return Object.freeze({
      status: "published",
      artifact: published.artifact,
    });
  } catch (error) {
    if (error instanceof ArtifactStoreError) throw error;
    fail("OPERATION_RECOVERY_REQUIRED");
  }
}

/** reader-mode exact validation；不需要 writer lease，也不发生 filesystem mutation。 */
export function readRegisteredArtifact(
  root: OpenedDataRoot,
  entryValue: WorldProjectArtifactEntry,
): Uint8Array {
  const before = requireLiveOpenedDataRoot(root);
  try {
    const layoutBefore = readArtifactLayoutIdentity(root);
    const entry = requireProjectArtifactEntry(entryValue);
    const path = join(before.absolutePath, dataRootArtifactPath(entry.digest));
    const validated = requireExactDestination(path, entry);
    const layoutAfter = readArtifactLayoutIdentity(root);
    const after = requireLiveOpenedDataRoot(root);
    if (
      before.identity.dev !== after.identity.dev ||
      before.identity.ino !== after.identity.ino ||
      !sameArtifactLayout(layoutBefore, layoutAfter)
    ) {
      fail("OPERATION_RECOVERY_REQUIRED");
    }
    return validated.bytes;
  } catch (error) {
    if (error instanceof ArtifactStoreError) throw error;
    fail("OPERATION_RECOVERY_REQUIRED");
  }
}

export function verifyRegisteredArtifact(
  root: OpenedDataRoot,
  entry: WorldProjectArtifactEntry,
): PublishedArtifactIdentity {
  const bytes = readRegisteredArtifact(root, entry);
  void bytes;
  return artifactIdentity(requireProjectArtifactEntry(entry));
}

export function inspectRegisteredArtifactDestination(
  root: OpenedDataRoot,
  entryValue: WorldProjectArtifactEntry,
): ArtifactDestinationState {
  const live = requireLiveOpenedDataRoot(root);
  let layoutBefore: ArtifactLayoutIdentity;
  try {
    layoutBefore = readArtifactLayoutIdentity(root);
  } catch {
    return { status: "recovery-required" };
  }
  const entry = requireProjectArtifactEntry(entryValue);
  const path = join(live.absolutePath, dataRootArtifactPath(entry.digest));
  try {
    lstatSync(path, { bigint: true });
  } catch (error) {
    if (syscallCode(error) !== "ENOENT") return { status: "recovery-required" };
    try {
      lstatSync(path, { bigint: true });
      return { status: "recovery-required" };
    } catch (second) {
      if (syscallCode(second) !== "ENOENT") return { status: "recovery-required" };
      try {
        const layoutAfter = readArtifactLayoutIdentity(root);
        if (!sameArtifactLayout(layoutBefore, layoutAfter)) {
          return { status: "recovery-required" };
        }
        requireLiveOpenedDataRoot(root);
        return { status: "absent" };
      } catch {
        return { status: "recovery-required" };
      }
    }
  }
  try {
    const exact = {
      status: "exact",
      artifact: requireExactDestination(path, entry).artifact,
    } as const;
    if (!sameArtifactLayout(layoutBefore, readArtifactLayoutIdentity(root))) {
      return { status: "recovery-required" };
    }
    return exact;
  } catch (error) {
    if (
      error instanceof ArtifactStoreError &&
      error.code === "ARTIFACT_DESTINATION_CONFLICT"
    ) {
      try {
        if (!sameArtifactLayout(layoutBefore, readArtifactLayoutIdentity(root))) {
          return { status: "recovery-required" };
        }
      } catch {
        return { status: "recovery-required" };
      }
      return { status: "conflict" };
    }
    return { status: "recovery-required" };
  }
}

/** Bundle Phase A / pre-admission 使用的纯 bytes validator。 */
export function validateRegisteredProjectArtifactBytes(
  entryValue: WorldProjectArtifactEntry,
  bytes: Uint8Array,
): PublishedArtifactIdentity {
  const entry = requireProjectArtifactEntry(entryValue);
  try {
    validateRegisteredArtifactBytes(entry, bytes);
  } catch {
    fail("ARTIFACT_IDENTITY_MISMATCH");
  }
  return artifactIdentity(entry);
}

export class ArtifactStoreReader {
  readonly #root: OpenedDataRoot;

  constructor(root: OpenedDataRoot) {
    requireLiveOpenedDataRoot(root);
    this.#root = root;
  }

  verify(entry: WorldProjectArtifactEntry): void {
    verifyRegisteredArtifact(this.#root, entry);
  }

  read(entry: WorldProjectArtifactEntry): Uint8Array {
    return readRegisteredArtifact(this.#root, entry);
  }

  validate(entry: WorldProjectArtifactEntry, bytes: Uint8Array): void {
    validateRegisteredProjectArtifactBytes(entry, bytes);
  }
}

export function cleanupArtifactAttemptCandidates(
  root: OpenedDataRoot,
  lease: DataRootWriterLease,
  journal: OperationJournal,
  operation: AdmittedOperation,
  entries: readonly WorldProjectArtifactEntry[],
): void {
  requireDurablyFinalizedOperation(operation, root, lease, journal);
  const absoluteRoot = requireMutationAuthority(root, lease);
  let attemptRelative: string;
  try {
    attemptRelative = dataRootStagingPath(
      operation.binding.operationId,
      operation.attemptToken,
    );
  } catch {
    fail("OPERATION_RECOVERY_REQUIRED");
  }
  const attemptDirectory = join(absoluteRoot, attemptRelative);
  const identities = operationCandidateIdentities.get(operation);
  if (entries.length === 0) return;
  if (identities === undefined) fail("OPERATION_RECOVERY_REQUIRED");
  for (const entryValue of entries) {
    const entry = requireProjectArtifactEntry(entryValue);
    const expected = identities.get(entry.digest);
    if (expected === undefined) fail("OPERATION_RECOVERY_REQUIRED");
    try {
      const candidatePath = join(
        attemptDirectory,
        `artifact-${entry.digest}.candidate`,
      );
      const actual = requireExactStagedCandidate(candidatePath, entry).identity;
      // link(candidate, CAS) 会合法改变 nlink/ctime；cleanup authority 绑定的是
      // 同一个 filesystem object，并在 unlink 前重新完成 exact bytes/format 验证。
      if (actual.dev !== expected.dev || actual.ino !== expected.ino) {
        fail("OPERATION_RECOVERY_REQUIRED");
      }
      unlinkSync(candidatePath);
      identities.delete(entry.digest);
    } catch (error) {
      if (error instanceof ArtifactStoreError) throw error;
      fail("OPERATION_RECOVERY_REQUIRED");
    }
  }
  try {
    syncDirectory(attemptDirectory);
  } catch {
    fail("OPERATION_RECOVERY_REQUIRED");
  }
  requireMutationAuthority(root, lease);
  if (identities.size === 0) operationCandidateIdentities.delete(operation);
}

/**
 * Restart后WeakMap inode witness已丢失；仅对由receipt intent/result hard-link
 * 重新证明归属的attempt，按frozen registry重验并删除存在的exact candidates。
 */
export function requireRecoveredArtifactAttemptCandidates(
  root: OpenedDataRoot,
  lease: DataRootWriterLease,
  journal: OperationJournal,
  operation: AdmittedOperation,
  entries: readonly WorldProjectArtifactEntry[],
): void {
  try {
    requireDurablyFinalizedOperation(operation, root, lease, journal);
  } catch {
    requireLiveAdmittedOperation(operation, root, lease, journal);
  }
  if (operation.attemptPath.length === 0) return;
  requireMutationAuthority(root, lease);
  const expected = new Map<string, ManifestAssetEntry>(
    entries.map((entryValue) => {
      const entry = requireProjectArtifactEntry(entryValue);
      return [`artifact-${entry.digest}.candidate`, entry] as const;
    }),
  );
  const generic = new Set([
    "operation-intent.json",
    "operation-result.json",
    "project.json",
    "project-directory.json",
    "project-directory.candidate",
  ]);
  for (const name of readdirSync(operation.attemptPath)) {
    const entry = expected.get(name);
    if (entry === undefined) {
      if (!generic.has(name)) fail("OPERATION_RECOVERY_REQUIRED");
      continue;
    }
    const candidatePath = join(operation.attemptPath, name);
    requireExactStagedCandidate(candidatePath, entry);
  }
  requireMutationAuthority(root, lease);
}

export function cleanupRecoveredArtifactAttemptCandidates(
  root: OpenedDataRoot,
  lease: DataRootWriterLease,
  journal: OperationJournal,
  operation: AdmittedOperation,
  entries: readonly WorldProjectArtifactEntry[],
): void {
  requireRecoveredArtifactAttemptCandidates(root, lease, journal, operation, entries);
  if (operation.attemptPath.length === 0) return;
  const expected = new Map<string, ManifestAssetEntry>(
    entries.map((entryValue) => {
      const entry = requireProjectArtifactEntry(entryValue);
      return [`artifact-${entry.digest}.candidate`, entry] as const;
    }),
  );
  for (const name of readdirSync(operation.attemptPath)) {
    const entry = expected.get(name);
    if (entry === undefined) continue;
    const candidatePath = join(operation.attemptPath, name);
    requireExactStagedCandidate(candidatePath, entry);
    unlinkSync(candidatePath);
  }
  syncDirectory(operation.attemptPath);
  requireMutationAuthority(root, lease);
}

/** 只供同目录 focused tests 注入稳定 identity drift，不进入 package root export。 */
export const ARTIFACT_STORE_TEST_SEAMS = Object.freeze({
  requireExactDestination(
    root: OpenedDataRoot,
    lease: DataRootWriterLease,
    entryValue: ManifestAssetEntry,
    path: string,
    afterRead?: () => void,
  ): PublishedArtifactIdentity {
    requireMutationAuthority(root, lease);
    const entry = requireRegisteredEntry(entryValue);
    return requireExactDestination(path, entry, afterRead).artifact;
  },
});
