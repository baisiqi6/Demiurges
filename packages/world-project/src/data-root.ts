import {
  closeSync,
  constants as FS,
  fstatSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readdirSync,
  statfsSync,
} from "node:fs";
import { dirname, isAbsolute } from "node:path";

/**
 * Data Root 配置与目录 contract（package-owned）。
 *
 * - 唯一 server-side 根是显式环境变量 `DEMIURGES_DATA_ROOT`，必须是绝对路径；
 *   不得 fallback 到 cwd、repo、`$HOME` 或旧 provider cache。
 * - bootstrap 是“所有 mutation 先持 lease”之外唯一且有界的 root-birth operation：
 *   只在已存在 parent 下用 atomic non-recursive `mkdir(mode=0700)` 创建 empty root。
 * - open 通过 `O_DIRECTORY|O_NOFOLLOW` directory fd 与 BigInt `fstat` 建立 identity；
 *   realpath 只用于诊断，不作为 lease identity。
 * - 本包内所有内部路径只由受限 ID/digest 生成（见下方 path builder）。
 */

export const DATA_ROOT_ENV_VAR = "DEMIURGES_DATA_ROOT";

export const DATA_ROOT_DIR_MODE = 0o700;

/** 固定目录 layout（v1）。Phase 2 的 Gateway writer 才创建这些子目录。 */
export const DATA_ROOT_LAYOUT = Object.freeze({
  artifacts: "artifacts",
  artifactDigestDir: "artifacts/sha256",
  projects: "projects",
  receipts: "receipts",
  staging: "staging",
} as const);

export const DATA_ROOT_ARTIFACT_DIGEST_PATTERN = /^[a-f0-9]{64}$/;
export const DATA_ROOT_PROJECT_ID_PATTERN = /^project:[a-z0-9][a-z0-9-]{0,63}$/;
export const DATA_ROOT_OPERATION_ID_PATTERN = /^op:[A-Za-z0-9._-]{1,127}$/;
export const DATA_ROOT_ATTEMPT_TOKEN_PATTERN = /^[A-Za-z0-9]{1,32}$/;

export type DataRootErrorCode =
  | "DATA_ROOT_UNAVAILABLE"
  | "DATA_ROOT_BOOTSTRAP_FAILED";

export class DataRootError extends Error {
  readonly code: DataRootErrorCode;

  constructor(code: DataRootErrorCode, message: string) {
    super(message);
    this.name = "DataRootError";
    this.code = code;
  }
}

export type DataRootConfig =
  | { readonly status: "configured"; readonly absolutePath: string }
  | {
      readonly status: "unavailable";
      readonly code: "DATA_ROOT_UNAVAILABLE";
      readonly reason: string;
    };

/** 显式解析 `DEMIURGES_DATA_ROOT`；缺失/空/相对/NUL 一律 fail closed，不 fallback。 */
export function resolveDataRootConfig(
  env: Readonly<Record<string, string | undefined>>,
): DataRootConfig {
  const raw = env[DATA_ROOT_ENV_VAR];
  if (typeof raw !== "string" || raw.length === 0) {
    return {
      status: "unavailable",
      code: "DATA_ROOT_UNAVAILABLE",
      reason: `${DATA_ROOT_ENV_VAR} 未设置或为空`,
    };
  }
  if (raw.includes("\u0000")) {
    return {
      status: "unavailable",
      code: "DATA_ROOT_UNAVAILABLE",
      reason: `${DATA_ROOT_ENV_VAR} 不得包含 NUL`,
    };
  }
  if (!isAbsolute(raw)) {
    return {
      status: "unavailable",
      code: "DATA_ROOT_UNAVAILABLE",
      reason: `${DATA_ROOT_ENV_VAR} 必须是绝对路径`,
    };
  }
  return { status: "configured", absolutePath: raw };
}

function requireAbsolutePathArgument(
  path: string,
  code: DataRootErrorCode,
  operation: string,
): void {
  if (typeof path !== "string" || path.length === 0) {
    throw new DataRootError(code, `${operation} 需要非空绝对路径`);
  }
  if (path.includes("\u0000")) {
    throw new DataRootError(code, `${operation} 路径不得包含 NUL`);
  }
  if (!isAbsolute(path)) {
    throw new DataRootError(code, `${operation} 路径必须是绝对路径`);
  }
}

function syscallCode(error: unknown): string {
  if (typeof error === "object" && error !== null && "code" in error) {
    const code = error.code;
    if (typeof code === "string") return code;
  }
  return "UNKNOWN";
}

function isSyscall(error: unknown, code: string): boolean {
  return syscallCode(error) === code;
}

export interface DataRootIdentity {
  readonly dev: bigint;
  readonly ino: bigint;
}

export type DataRootFilesystemSupport = "confirmed-local" | "unknown";

/**
 * package-owned 本地 filesystem 积极确认表。
 * 无法积极确认（statfs 不可用、类型未知）→ `unknown`，调用方只能进入 reader mode，
 * 绝不能把 unknown 当作 writer-eligible。
 */
const CONFIRMED_LOCAL_FILESYSTEM_TYPES: Record<number, true> = {
  17: true, // APFS（Linux apfs driver 惯例 magic）
  24: true, // HFS+
  26: true, // macOS APFS：本机 Bun 1.3.14 的 statfsSync 对 /、/Users、/private/tmp 一致返回 26
  0xef53: true, // ext4
  0x9123683e: true, // btrfs
  0x58465342: true, // xfs
  0x01021994: true, // tmpfs
};


export interface OpenedDataRoot {
  readonly absolutePath: string;
  readonly identity: DataRootIdentity;
  readonly filesystemSupport: DataRootFilesystemSupport;
  readonly rawFilesystemType: number | null;
  readonly closed: boolean;
  close(): void;
}

interface OpenedDataRootState {
  readonly absolutePath: string;
  readonly fd: number;
  readonly identity: DataRootIdentity;
  closed: boolean;
}

const OPENED_DATA_ROOT_STATES = new WeakMap<OpenedDataRoot, OpenedDataRootState>();

function sameIdentity(left: DataRootIdentity, right: DataRootIdentity): boolean {
  return left.dev === right.dev && left.ino === right.ino;
}

function identityFromFd(fd: number): DataRootIdentity {
  const stat = fstatSync(fd, { bigint: true });
  if ((stat.mode & 0o170000n) !== 0o40000n) {
    throw new DataRootError(
      "DATA_ROOT_UNAVAILABLE",
      "Data Root 必须是 regular directory",
    );
  }
  if ((stat.mode & 0o777n) !== 0o700n) {
    throw new DataRootError("DATA_ROOT_UNAVAILABLE", "Data Root mode 必须为 0700");
  }
  return Object.freeze({ dev: stat.dev, ino: stat.ino });
}

/**
 * 仅供 package 内部 mutation/read boundary 使用：证明句柄由本包创建、仍然打开，
 * 且配置路径仍指向 held fd 所代表的同一 directory object。
 */
export function requireLiveOpenedDataRoot(root: OpenedDataRoot): {
  readonly absolutePath: string;
  readonly fd: number;
  readonly identity: DataRootIdentity;
} {
  const state = OPENED_DATA_ROOT_STATES.get(root);
  if (state === undefined || state.closed) {
    throw new DataRootError(
      "DATA_ROOT_UNAVAILABLE",
      "Data Root handle 非本包所有或已关闭",
    );
  }

  const heldIdentity = identityFromFd(state.fd);
  if (!sameIdentity(heldIdentity, state.identity)) {
    throw new DataRootError("DATA_ROOT_UNAVAILABLE", "Data Root held identity 漂移");
  }

  let pathFd: number | undefined;
  try {
    pathFd = openSync(
      state.absolutePath,
      FS.O_RDONLY | FS.O_DIRECTORY | FS.O_NOFOLLOW,
    );
    const pathIdentity = identityFromFd(pathFd);
    if (!sameIdentity(pathIdentity, state.identity)) {
      throw new DataRootError("DATA_ROOT_UNAVAILABLE", "Data Root path identity 漂移");
    }
  } catch (error) {
    if (error instanceof DataRootError) throw error;
    throw new DataRootError(
      "DATA_ROOT_UNAVAILABLE",
      `无法复核 Data Root path identity：${syscallCode(error)}`,
    );
  } finally {
    if (pathFd !== undefined) closeSync(pathFd);
  }

  return Object.freeze({
    absolutePath: state.absolutePath,
    fd: state.fd,
    identity: state.identity,
  });
}

/**
 * Gateway-style open：不创建任何路径，不 fallback。
 * 以 no-follow directory fd + BigInt fstat 建立 identity；
 * symlink / 非 directory / mode ≠ 0700 / 无法打开均返回 `DATA_ROOT_UNAVAILABLE`。
 */
export function openDataRoot(absolutePath: string): OpenedDataRoot {
  requireAbsolutePathArgument(
    absolutePath,
    "DATA_ROOT_UNAVAILABLE",
    "Data Root open",
  );
  let fd: number | undefined;
  try {
    fd = openSync(absolutePath, FS.O_RDONLY | FS.O_DIRECTORY | FS.O_NOFOLLOW);
  } catch (error) {
    throw new DataRootError(
      "DATA_ROOT_UNAVAILABLE",
      `无法打开 Data Root：${syscallCode(error)}`,
    );
  }
  try {
    const identity = identityFromFd(fd);
    const filesystem = classifyFilesystem(absolutePath);
    const state: OpenedDataRootState = {
      absolutePath,
      fd,
      identity,
      closed: false,
    };
    const root: OpenedDataRoot = Object.freeze({
      absolutePath,
      identity,
      ...filesystem,
      get closed() {
        return state.closed;
      },
      close() {
        if (state.closed) return;
        closeSync(state.fd);
        state.closed = true;
      },
    });
    OPENED_DATA_ROOT_STATES.set(root, state);
    return root;
  } catch (error) {
    closeSync(fd);
    throw error;
  }
}

function classifyFilesystem(
  absolutePath: string,
): {
  readonly filesystemSupport: DataRootFilesystemSupport;
  readonly rawFilesystemType: number | null;
} {
  try {
    const statfs = statfsSync(absolutePath);
    const rawFilesystemType =
      typeof statfs.type === "number" && Number.isFinite(statfs.type)
        ? statfs.type
        : null;
    return {
      filesystemSupport:
        rawFilesystemType !== null &&
        Object.hasOwn(CONFIRMED_LOCAL_FILESYSTEM_TYPES, rawFilesystemType)
          ? "confirmed-local"
          : "unknown",
      rawFilesystemType,
    };
  } catch {
    return { filesystemSupport: "unknown", rawFilesystemType: null };
  }
}

export type BootstrapDataRootResult = "created" | "already-exists";

/**
 * 唯一且有界的 root-birth operation：
 * parent 必须已存在（no-follow directory），只用 atomic non-recursive
 * `mkdir(mode=0700)` 创建 empty root；`EEXIST` 时只验证同一 empty 0700
 * regular directory identity。不创建子目录、不导入 Artifact、不启动 Gateway。
 */
export function bootstrapDataRoot(absolutePath: string): BootstrapDataRootResult {
  requireAbsolutePathArgument(
    absolutePath,
    "DATA_ROOT_BOOTSTRAP_FAILED",
    "Data Root bootstrap",
  );
  const parentPath = dirname(absolutePath);
  let parentFd: number | undefined;
  try {
    parentFd = openSync(
      parentPath,
      FS.O_RDONLY | FS.O_DIRECTORY | FS.O_NOFOLLOW,
    );
  } catch (error) {
    throw new DataRootError(
      "DATA_ROOT_BOOTSTRAP_FAILED",
      `parent 不存在或不可用：${syscallCode(error)}`,
    );
  }
  try {
    const parentStat = fstatSync(parentFd, { bigint: true });
    if ((parentStat.mode & 0o170000n) !== 0o40000n) {
      throw new DataRootError(
        "DATA_ROOT_BOOTSTRAP_FAILED",
        "parent 必须是 regular directory",
      );
    }
    try {
      mkdirSync(absolutePath, { mode: DATA_ROOT_DIR_MODE, recursive: false });
      verifyBootstrappedRoot(absolutePath, true);
      fsyncSync(parentFd);
      return "created";
    } catch (error) {
      if (!isSyscall(error, "EEXIST")) {
        throw new DataRootError(
          "DATA_ROOT_BOOTSTRAP_FAILED",
          `mkdir 失败：${syscallCode(error)}`,
        );
      }
      // 并发 bootstrap：其余调用方只验证同一 empty 0700 regular directory identity。
      try {
        verifyBootstrappedRoot(absolutePath);
      } catch (error) {
        throw new DataRootError(
          "DATA_ROOT_BOOTSTRAP_FAILED",
          `已存在 root 验证失败：${error instanceof Error ? error.message : String(error)}`,
        );
      }
      return "already-exists";
    }
  } finally {
    closeSync(parentFd);
  }
}

function verifyBootstrappedRoot(
  absolutePath: string,
  syncRoot = false,
): void {
  const root = openDataRoot(absolutePath);
  try {
    requireLiveOpenedDataRoot(root);
    const entries = readdirSync(absolutePath);
    requireLiveOpenedDataRoot(root);
    if (entries.length !== 0) {
      throw new DataRootError(
        "DATA_ROOT_BOOTSTRAP_FAILED",
        "已存在 root 非空，拒绝 bootstrap",
      );
    }
    if (syncRoot) {
      fsyncSync(requireLiveOpenedDataRoot(root).fd);
    }
  } catch (error) {
    if (error instanceof DataRootError) throw error;
    throw new DataRootError(
      "DATA_ROOT_BOOTSTRAP_FAILED",
      `无法验证已存在 root：${syscallCode(error)}`,
    );
  } finally {
    root.close();
  }
}

function requireDataRootArtifactDigest(value: unknown): string {
  if (typeof value !== "string" || !DATA_ROOT_ARTIFACT_DIGEST_PATTERN.test(value)) {
    throw new Error("artifact digest 必须是 64 位 lowercase hex");
  }
  return value;
}

/** 共享 projectId 形状（manifest codec 与路径生成同源）。 */
export function requireDataRootProjectId(value: unknown): string {
  if (typeof value !== "string" || !DATA_ROOT_PROJECT_ID_PATTERN.test(value)) {
    throw new Error("projectId 必须是 lowercase slug（project:<1-64 位 a-z0-9/- 字符>）");
  }
  return value;
}

function requireDataRootOperationId(value: unknown): string {
  if (typeof value !== "string" || !DATA_ROOT_OPERATION_ID_PATTERN.test(value)) {
    throw new Error("operationId 必须是 op:<1-127 位 A-Za-z0-9._->");
  }
  return value;
}

function requireDataRootAttemptToken(value: unknown): string {
  if (typeof value !== "string" || !DATA_ROOT_ATTEMPT_TOKEN_PATTERN.test(value)) {
    throw new Error("attemptToken 必须是 1-32 位 A-Za-z0-9");
  }
  return value;
}

/** 固定 layout 路径生成：只接受受限 ID/digest，不接受调用方 filesystem path。 */
export function dataRootArtifactPath(digest: string): string {
  return `${DATA_ROOT_LAYOUT.artifactDigestDir}/${requireDataRootArtifactDigest(digest)}`;
}

export function dataRootProjectPath(projectId: string): string {
  return `${DATA_ROOT_LAYOUT.projects}/${requireDataRootProjectId(projectId)}`;
}

export function dataRootReceiptIntentPath(operationId: string): string {
  return `${DATA_ROOT_LAYOUT.receipts}/${requireDataRootOperationId(operationId)}.intent.json`;
}

export function dataRootReceiptResultPath(operationId: string): string {
  return `${DATA_ROOT_LAYOUT.receipts}/${requireDataRootOperationId(operationId)}.result.json`;
}

export function dataRootStagingPath(
  operationId: string,
  attemptToken: string,
): string {
  return `${DATA_ROOT_LAYOUT.staging}/${requireDataRootOperationId(operationId)}-${requireDataRootAttemptToken(attemptToken)}`;
}
