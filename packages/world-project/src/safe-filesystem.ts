import {
  closeSync,
  constants as FS,
  fstatSync,
  fsyncSync,
  lstatSync,
  openSync,
  readdirSync,
  readSync,
  rmdirSync,
  unlinkSync,
  writeSync,
} from "node:fs";

interface StableFileIdentity {
  readonly dev: bigint;
  readonly ino: bigint;
  readonly mode: bigint;
  readonly size: bigint;
  readonly mtimeNs: bigint;
  readonly ctimeNs: bigint;
}

export interface StableDirectoryIdentity {
  readonly dev: bigint;
  readonly ino: bigint;
  readonly mode: bigint;
  readonly uid: bigint;
  readonly gid: bigint;
}

function identity(fd: number): StableFileIdentity {
  const stat = fstatSync(fd, { bigint: true });
  return {
    dev: stat.dev,
    ino: stat.ino,
    mode: stat.mode,
    size: stat.size,
    mtimeNs: stat.mtimeNs,
    ctimeNs: stat.ctimeNs,
  };
}

function sameIdentity(left: StableFileIdentity, right: StableFileIdentity): boolean {
  return (
    left.dev === right.dev &&
    left.ino === right.ino &&
    left.mode === right.mode &&
    left.size === right.size &&
    left.mtimeNs === right.mtimeNs &&
    left.ctimeNs === right.ctimeNs
  );
}

function requireRegularFile(stat: StableFileIdentity): void {
  if ((stat.mode & 0o170000n) !== 0o100000n) {
    throw new Error("opened target 必须是 regular file");
  }
  if (stat.size < 0n || stat.size > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error("opened target byteLength 超出 safe integer");
  }
}

export function readStableRegularFile(path: string, maxBytes: number): Uint8Array {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 0) {
    throw new Error("maxBytes 必须是非负 safe integer");
  }
  let fd: number | undefined;
  try {
    fd = openSync(path, FS.O_RDONLY | FS.O_NOFOLLOW);
    const before = identity(fd);
    requireRegularFile(before);
    if (before.size > BigInt(maxBytes)) throw new Error("opened target 超出 byte budget");
    const bytes = new Uint8Array(Number(before.size));
    let offset = 0;
    while (offset < bytes.byteLength) {
      const count = readSync(fd, bytes, offset, bytes.byteLength - offset, offset);
      if (count <= 0) throw new Error("opened target short read");
      offset += count;
    }
    const after = identity(fd);
    if (!sameIdentity(before, after)) {
      throw new Error("opened target identity 在读取期间漂移");
    }
    return bytes;
  } finally {
    if (fd !== undefined) closeSync(fd);
  }
}

export function writeNewSyncedFile(
  path: string,
  bytes: Uint8Array,
  mode = 0o600,
): void {
  let fd: number | undefined;
  try {
    fd = openSync(
      path,
      FS.O_WRONLY | FS.O_CREAT | FS.O_EXCL | FS.O_NOFOLLOW,
      mode,
    );
    let offset = 0;
    while (offset < bytes.byteLength) {
      const count = writeSync(fd, bytes, offset, bytes.byteLength - offset, offset);
      if (count <= 0) throw new Error("opened target short write");
      offset += count;
    }
    fsyncSync(fd);
    const stat = identity(fd);
    requireRegularFile(stat);
    if (stat.size !== BigInt(bytes.byteLength)) {
      throw new Error("opened target write byteLength 不一致");
    }
  } finally {
    if (fd !== undefined) closeSync(fd);
  }
}

function syncDirectoryNow(path: string): void {
  const fd = openSync(path, FS.O_RDONLY | FS.O_DIRECTORY | FS.O_NOFOLLOW);
  try {
    const stat = fstatSync(fd, { bigint: true });
    if ((stat.mode & 0o170000n) !== 0o40000n) {
      throw new Error("sync target 必须是 directory");
    }
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
}

type DirectorySyncReplacement = (
  path: string,
  actual: (path: string) => void,
) => void;

let directorySyncReplacement: DirectorySyncReplacement | undefined;

export function syncDirectory(path: string): void {
  const replacement = directorySyncReplacement;
  if (replacement !== undefined) {
    replacement(path, syncDirectoryNow);
    return;
  }
  syncDirectoryNow(path);
}

function directoryIdentity(fd: number): StableDirectoryIdentity {
  const stat = fstatSync(fd, { bigint: true });
  if (
    (stat.mode & 0o170000n) !== 0o40000n ||
    (stat.mode & 0o777n) !== 0o700n
  ) {
    throw new Error("opened target 必须是 0700 directory");
  }
  return {
    dev: stat.dev,
    ino: stat.ino,
    mode: stat.mode,
    uid: stat.uid,
    gid: stat.gid,
  };
}

export function sameStableDirectoryIdentity(
  left: StableDirectoryIdentity,
  right: StableDirectoryIdentity,
): boolean {
  return (
    left.dev === right.dev &&
    left.ino === right.ino &&
    left.mode === right.mode &&
    left.uid === right.uid &&
    left.gid === right.gid
  );
}

/** 在 O_NOFOLLOW fd 上捕获 operation-created directory 的稳定身份。 */
export function readStableDirectoryIdentity(path: string): StableDirectoryIdentity {
  const fd = openSync(path, FS.O_RDONLY | FS.O_DIRECTORY | FS.O_NOFOLLOW);
  try {
    return directoryIdentity(fd);
  } finally {
    closeSync(fd);
  }
}

/** 只删除与 intent 同 inode 的 regular hard-link；不存在或漂移都 fail closed。 */
export function unlinkExactHardLink(
  linkPath: string,
  intentPath: string,
  parentPath: string,
): void {
  const link = lstatSync(linkPath, { bigint: true });
  const intent = lstatSync(intentPath, { bigint: true });
  if (
    (link.mode & 0o170000n) !== 0o100000n ||
    (intent.mode & 0o170000n) !== 0o100000n ||
    link.dev !== intent.dev ||
    link.ino !== intent.ino
  ) {
    throw new Error("operation lock identity 不一致");
  }
  unlinkSync(linkPath);
  syncDirectory(parentPath);
}

/**
 * 只回收本 operation 创建、身份未漂移且仍为空的目录。持有 no-follow fd 贯穿
 * 检查与 rmdir；任何额外 entry 或身份变化都保留现场并 fail closed。
 */
export function removeExactEmptyDirectory(
  path: string,
  parentPath: string,
  expected: StableDirectoryIdentity,
): void {
  const fd = openSync(path, FS.O_RDONLY | FS.O_DIRECTORY | FS.O_NOFOLLOW);
  try {
    const before = directoryIdentity(fd);
    if (!sameStableDirectoryIdentity(before, expected)) {
      throw new Error("operation-created directory identity 不一致");
    }
    if (readdirSync(path).length !== 0) {
      throw new Error("operation-created directory 非空");
    }
    const afterRead = directoryIdentity(fd);
    const pathIdentity = readStableDirectoryIdentity(path);
    if (
      !sameStableDirectoryIdentity(afterRead, expected) ||
      !sameStableDirectoryIdentity(pathIdentity, expected)
    ) {
      throw new Error("operation-created directory identity 漂移");
    }
    rmdirSync(path);
    const afterRemove = directoryIdentity(fd);
    if (!sameStableDirectoryIdentity(afterRemove, expected)) {
      throw new Error("removed directory identity 漂移");
    }
    syncDirectory(parentPath);
  } finally {
    closeSync(fd);
  }
}

/** 只供同 package 的 durability fault tests 使用，不从 package root 导出。 */
export const SAFE_FILESYSTEM_TEST_SEAMS = Object.freeze({
  replaceDirectorySync(replacement: DirectorySyncReplacement): () => void {
    const previous = directorySyncReplacement;
    directorySyncReplacement = replacement;
    return () => {
      if (directorySyncReplacement === replacement) {
        directorySyncReplacement = previous;
      }
    };
  },
});
