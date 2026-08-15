import {
  lstatSync,
  linkSync,
  mkdirSync,
  readdirSync,
  renameSync,
  unlinkSync,
  type BigIntStats,
} from "node:fs";
import { join } from "node:path";

import { canonicalJsonBytes } from "@demiurges/world";

import {
  operationBindingDigest,
  type AdmittedOperation,
  type OperationBinding,
} from "./operation-journal";
import {
  readStableDirectoryIdentity,
  readStableRegularFile,
  removeExactEmptyDirectory,
  sameStableDirectoryIdentity,
  syncDirectory,
  writeNewSyncedFile,
  type StableDirectoryIdentity,
} from "./safe-filesystem";

export const PROJECT_DIRECTORY_MARKER_NAME = ".created-directory.json";
export const PROJECT_DIRECTORY_CANDIDATE_NAME = "project-directory.candidate";
const PROJECT_DIRECTORY_MARKER_MAX_BYTES = 1024;
const BINDING_DIGEST = /^[a-f0-9]{64}$/;

interface ProjectDirectoryMarker {
  readonly schemaVersion: 1;
  readonly bindingDigest: string;
  readonly directory: {
    readonly dev: string;
    readonly ino: string;
    readonly mode: string;
    readonly uid: string;
    readonly gid: string;
  };
}

function syscallCode(error: unknown): string | undefined {
  return typeof error === "object" && error !== null && "code" in error &&
      typeof error.code === "string"
    ? error.code
    : undefined;
}

function markerFor(
  binding: OperationBinding,
  identity: StableDirectoryIdentity,
): ProjectDirectoryMarker {
  return {
    schemaVersion: 1,
    bindingDigest: operationBindingDigest(binding),
    directory: {
      dev: identity.dev.toString(10),
      ino: identity.ino.toString(10),
      mode: identity.mode.toString(10),
      uid: identity.uid.toString(10),
      gid: identity.gid.toString(10),
    },
  };
}

function sameBytes(left: Uint8Array, right: Uint8Array): boolean {
  return Buffer.from(left).equals(Buffer.from(right));
}

function sameStat(
  left: BigIntStats,
  right: BigIntStats,
): boolean {
  return (
    left.dev === right.dev &&
    left.ino === right.ino &&
    left.mode === right.mode &&
    left.size === right.size &&
    left.mtimeNs === right.mtimeNs &&
    left.ctimeNs === right.ctimeNs
  );
}

function exactKeys(value: unknown, keys: readonly string[]): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype &&
    Reflect.ownKeys(value).length === keys.length &&
    keys.every((key) => Object.prototype.hasOwnProperty.call(value, key));
}

function requireCanonicalMarkerBytes(
  markerPath: string,
  binding: OperationBinding,
): ProjectDirectoryMarker {
  const actual = readStableRegularFile(markerPath, PROJECT_DIRECTORY_MARKER_MAX_BYTES);
  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(actual));
  } catch {
    throw new Error("project directory marker 非canonical JSON");
  }
  const decimal = /^(0|[1-9][0-9]*)$/;
  if (
    !exactKeys(parsed, ["schemaVersion", "bindingDigest", "directory"]) ||
    parsed.schemaVersion !== 1 ||
    parsed.bindingDigest !== operationBindingDigest(binding)
  ) {
    throw new Error("project directory marker identity 不一致");
  }
  const directory = parsed.directory;
  if (
    !exactKeys(directory, ["dev", "ino", "mode", "uid", "gid"]) ||
    !["dev", "ino", "mode", "uid", "gid"].every(
      (key) => typeof directory[key] === "string" &&
        decimal.test(directory[key] as string),
    ) ||
    !sameBytes(actual, canonicalJsonBytes(parsed))
  ) {
    throw new Error("project directory marker identity 不一致");
  }
  return parsed as unknown as ProjectDirectoryMarker;
}

/**
 * Restart cleanup前验证attempt中的staged marker。若Project directory仍存在，
 * staged bytes必须与当前directory identity exact；若目录已被此前durable cleanup
 * 移除，仍要求canonical marker与exact binding digest，不能按文件名吞掉任意bytes。
 */
export function requireStagedProjectDirectoryMarker(
  markerPath: string,
  projectPath: string,
  binding: OperationBinding,
): void {
  const parsed = requireCanonicalMarkerBytes(markerPath, binding);
  try {
    const directory = readStableDirectoryIdentity(projectPath);
    if (!sameBytes(
      canonicalJsonBytes(parsed),
      canonicalJsonBytes(markerFor(binding, directory)),
    )) {
      throw new Error("project directory marker identity 不一致");
    }
  } catch (error) {
    if (syscallCode(error) !== "ENOENT") throw error;
  }
}

/** final/candidate marker必须仍是staged marker的同一regular-file hard-link。 */
export function requirePublishedProjectDirectoryMarkerHardLink(
  stagedMarkerPath: string,
  projectPath: string,
  binding: OperationBinding,
): void {
  requireStagedProjectDirectoryMarker(stagedMarkerPath, projectPath, binding);
  const publishedMarkerPath = join(projectPath, PROJECT_DIRECTORY_MARKER_NAME);
  const staged = lstatSync(stagedMarkerPath, { bigint: true });
  const published = lstatSync(publishedMarkerPath, { bigint: true });
  if (
    (staged.mode & 0o170000n) !== 0o100000n ||
    (published.mode & 0o170000n) !== 0o100000n ||
    staged.dev !== published.dev ||
    staged.ino !== published.ino
  ) {
    throw new Error("project directory marker hard-link identity 不一致");
  }
}

/**
 * Recovery preflight读取marker自身声明的binding，不带caller expected binding。
 * 同时重验canonical bytes与directory inode，供跨operation ownership映射。
 */
export function readProjectDirectoryMarkerBindingDigest(
  projectPath: string,
): string | undefined {
  const markerPath = join(projectPath, PROJECT_DIRECTORY_MARKER_NAME);
  let before: BigIntStats;
  try {
    before = lstatSync(markerPath, { bigint: true });
  } catch (error) {
    if (syscallCode(error) === "ENOENT") return undefined;
    throw error;
  }
  if ((before.mode & 0o170000n) !== 0o100000n) {
    throw new Error("project directory marker 必须是 regular file");
  }
  const directory = readStableDirectoryIdentity(projectPath);
  const actual = readStableRegularFile(markerPath, PROJECT_DIRECTORY_MARKER_MAX_BYTES);
  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(actual));
  } catch {
    throw new Error("project directory marker 非canonical JSON");
  }
  if (!exactKeys(parsed, ["schemaVersion", "bindingDigest", "directory"]) ||
      parsed.schemaVersion !== 1 ||
      typeof parsed.bindingDigest !== "string" ||
      !BINDING_DIGEST.test(parsed.bindingDigest) ||
      !exactKeys(parsed.directory, ["dev", "ino", "mode", "uid", "gid"])) {
    throw new Error("project directory marker identity 不一致");
  }
  const canonical = canonicalJsonBytes({
    schemaVersion: 1,
    bindingDigest: parsed.bindingDigest,
    directory: {
      dev: directory.dev.toString(10),
      ino: directory.ino.toString(10),
      mode: directory.mode.toString(10),
      uid: directory.uid.toString(10),
      gid: directory.gid.toString(10),
    },
  });
  const after = lstatSync(markerPath, { bigint: true });
  if (!sameStat(before, after) || !sameBytes(actual, canonical)) {
    throw new Error("project directory marker identity 不一致");
  }
  return parsed.bindingDigest;
}

/**
 * 将 operation-created directory 的 inode 身份写成 canonical durable witness。
 * marker 先在该 operation staging 中完成，再以 no-replace hard-link 发布。
 */
export function publishProjectDirectoryMarker(
  projectPath: string,
  operation: AdmittedOperation,
  identity: StableDirectoryIdentity,
): void {
  const staged = join(operation.attemptPath, "project-directory.json");
  const published = join(projectPath, PROJECT_DIRECTORY_MARKER_NAME);
  writeNewSyncedFile(staged, canonicalJsonBytes(markerFor(operation.binding, identity)));
  syncDirectory(operation.attemptPath);
  linkSync(staged, published);
  syncDirectory(projectPath);
}

export interface StagedProjectDirectoryCandidate {
  readonly path: string;
  readonly identity: StableDirectoryIdentity;
}

/**
 * Final namespace之外先构造完整、durable、带ownership witness的Project目录。
 * 因此crash时只会留下完整candidate，绝不会留下无marker的final目录。
 */
export function stageProjectDirectoryCandidate(
  operation: AdmittedOperation,
): StagedProjectDirectoryCandidate {
  const path = join(operation.attemptPath, PROJECT_DIRECTORY_CANDIDATE_NAME);
  mkdirSync(path, { mode: 0o700, recursive: false });
  const identity = readStableDirectoryIdentity(path);
  publishProjectDirectoryMarker(path, operation, identity);
  syncDirectory(operation.attemptPath);
  return Object.freeze({ path, identity });
}

function requireExactCandidateMarker(
  operation: Pick<AdmittedOperation, "attemptPath" | "binding">,
  candidatePath: string,
): StableDirectoryIdentity {
  const identity = readStableDirectoryIdentity(candidatePath);
  const staged = join(operation.attemptPath, "project-directory.json");
  requirePublishedProjectDirectoryMarkerHardLink(
    staged,
    candidatePath,
    operation.binding,
  );
  const published = join(candidatePath, PROJECT_DIRECTORY_MARKER_NAME);
  const stagedStat = lstatSync(staged, { bigint: true });
  const publishedStat = lstatSync(published, { bigint: true });
  if (
    (stagedStat.mode & 0o170000n) !== 0o100000n ||
    (publishedStat.mode & 0o170000n) !== 0o100000n ||
    stagedStat.dev !== publishedStat.dev ||
    stagedStat.ino !== publishedStat.ino ||
    readdirSync(candidatePath).length !== 1
  ) {
    throw new Error("staged project directory candidate identity 不一致");
  }
  return identity;
}

let beforeCandidatePublish: (() => void) | undefined;

/** single-writer lease下，以atomic rename发布已完整构造的Project directory。 */
export function publishStagedProjectDirectoryCandidate(
  operation: AdmittedOperation,
  candidate: StagedProjectDirectoryCandidate,
  projectPath: string,
  projectsPath: string,
): StableDirectoryIdentity {
  const identity = requireExactCandidateMarker(operation, candidate.path);
  if (!sameStableDirectoryIdentity(identity, candidate.identity)) {
    throw new Error("staged project directory candidate identity 漂移");
  }
  try {
    lstatSync(projectPath, { bigint: true });
    throw Object.assign(new Error("project destination exists"), { code: "EEXIST" });
  } catch (error) {
    if (syscallCode(error) !== "ENOENT") throw error;
  }
  beforeCandidatePublish?.();
  renameSync(candidate.path, projectPath);
  const publishedIdentity = readStableDirectoryIdentity(projectPath);
  if (!sameStableDirectoryIdentity(publishedIdentity, identity)) {
    throw new Error("published project directory identity 漂移");
  }
  requireStagedProjectDirectoryMarker(
    join(operation.attemptPath, "project-directory.json"),
    projectPath,
    operation.binding,
  );
  // rename changes entries in both parents；两边都必须形成durability proof。
  syncDirectory(operation.attemptPath);
  syncDirectory(projectsPath);
  return publishedIdentity;
}

export function requireStagedProjectDirectoryCandidate(
  operation: Pick<AdmittedOperation, "attemptPath" | "binding">,
): StableDirectoryIdentity | undefined {
  const candidatePath = join(operation.attemptPath, PROJECT_DIRECTORY_CANDIDATE_NAME);
  try {
    lstatSync(candidatePath, { bigint: true });
  } catch (error) {
    if (syscallCode(error) === "ENOENT") return undefined;
    throw error;
  }
  return requireExactCandidateMarker(operation, candidatePath);
}

/** terminal authority形成后，精确回收尚未发布的staged directory。 */
export function cleanupStagedProjectDirectoryCandidate(
  operation: Pick<AdmittedOperation, "attemptPath" | "binding">,
): boolean {
  const candidatePath = join(operation.attemptPath, PROJECT_DIRECTORY_CANDIDATE_NAME);
  const identity = requireStagedProjectDirectoryCandidate(operation);
  if (identity === undefined) {
    // A previous rename/rmdir may have removed the child before parent fsync failed.
    syncDirectory(operation.attemptPath);
    return false;
  }
  unlinkSync(join(candidatePath, PROJECT_DIRECTORY_MARKER_NAME));
  syncDirectory(candidatePath);
  removeExactEmptyDirectory(candidatePath, operation.attemptPath, identity);
  return true;
}

/** 只供同 package 的 publish-boundary crash tests 使用。 */
export const PROJECT_DIRECTORY_MARKER_TEST_SEAMS = Object.freeze({
  replaceBeforeCandidatePublish(replacement: () => void): () => void {
    const previous = beforeCandidatePublish;
    beforeCandidatePublish = replacement;
    return () => {
      if (beforeCandidatePublish === replacement) beforeCandidatePublish = previous;
    };
  },
});

/**
 * 只清理由 exact binding + directory inode marker 证明归属的目录状态。
 * removeDirectory=true 时，任何 marker 之外的 entry 都保留现场并 fail closed。
 */
export function cleanupProjectDirectoryMarker(
  projectPath: string,
  projectsPath: string,
  binding: OperationBinding,
  options: {
    readonly required: boolean;
    readonly removeDirectory: boolean;
    readonly stagedMarkerPath?: string;
  },
): boolean {
  const markerPath = join(projectPath, PROJECT_DIRECTORY_MARKER_NAME);
  let before: BigIntStats;
  try {
    before = lstatSync(markerPath, { bigint: true });
  } catch (error) {
    if (syscallCode(error) === "ENOENT" && !options.required) {
      if (options.removeDirectory) {
        try {
          const directory = readStableDirectoryIdentity(projectPath);
          if (options.stagedMarkerPath === undefined) {
            throw new Error("operation-created project directory 缺少 staged marker authority");
          }
          requireStagedProjectDirectoryMarker(
            options.stagedMarkerPath,
            projectPath,
            binding,
          );
          if (readdirSync(projectPath).length !== 0) {
            throw new Error("operation-created project directory 非空");
          }
          removeExactEmptyDirectory(projectPath, projectsPath, directory);
          return true;
        } catch (directoryError) {
          if (syscallCode(directoryError) === "ENOENT") {
            // A previous rmdir may have succeeded before parent fsync failed.
            // Re-prove that directory-entry removal before reporting cleanup.
            syncDirectory(projectsPath);
            return false;
          }
          throw directoryError;
        }
        throw new Error("operation-created project directory 缺少 ownership marker");
      }
      return false;
    }
    throw error;
  }
  if ((before.mode & 0o170000n) !== 0o100000n) {
    throw new Error("project directory marker 必须是 regular file");
  }
  if (options.stagedMarkerPath === undefined) {
    throw new Error("project directory cleanup 缺少 staged marker authority");
  }
  requirePublishedProjectDirectoryMarkerHardLink(
    options.stagedMarkerPath,
    projectPath,
    binding,
  );
  const directory = readStableDirectoryIdentity(projectPath);
  const expected = canonicalJsonBytes(markerFor(binding, directory));
  const actual = readStableRegularFile(
    markerPath,
    PROJECT_DIRECTORY_MARKER_MAX_BYTES,
  );
  const after = lstatSync(markerPath, { bigint: true });
  if (!sameStat(before, after) || !sameBytes(actual, expected)) {
    throw new Error("project directory marker identity 不一致");
  }

  const entries = readdirSync(projectPath).sort();
  const expectedEntries = options.removeDirectory
    ? [PROJECT_DIRECTORY_MARKER_NAME]
    : [PROJECT_DIRECTORY_MARKER_NAME, "project.json"].sort();
  if (
    entries.length !== expectedEntries.length ||
    !entries.every((entry, index) => entry === expectedEntries[index])
  ) {
    throw new Error("operation-created project directory 含未知 entry");
  }

  unlinkSync(markerPath);
  syncDirectory(projectPath);
  if (options.removeDirectory) {
    removeExactEmptyDirectory(projectPath, projectsPath, directory);
  }
  return true;
}
