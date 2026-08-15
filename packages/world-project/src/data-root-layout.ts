import {
  closeSync,
  constants as FS,
  fstatSync,
  fsyncSync,
  mkdirSync,
  openSync,
} from "node:fs";
import { dirname, join } from "node:path";

import {
  DATA_ROOT_DIR_MODE,
  DATA_ROOT_LAYOUT,
  requireLiveOpenedDataRoot,
  type OpenedDataRoot,
} from "./data-root";
import {
  requireLiveDataRootWriterLease,
  type DataRootWriterLease,
} from "./data-root-lease";

export const DATA_ROOT_CHILD_DIR_MODE = 0o700;

function requireDirectory(path: string): void {
  let fd: number | undefined;
  try {
    fd = openSync(path, FS.O_RDONLY | FS.O_DIRECTORY | FS.O_NOFOLLOW);
    const stat = fstatSync(fd, { bigint: true });
    if ((stat.mode & 0o170000n) !== 0o40000n) {
      throw new Error("Data Root layout entry 必须是 regular directory");
    }
    if ((stat.mode & 0o777n) !== BigInt(DATA_ROOT_CHILD_DIR_MODE)) {
      throw new Error("Data Root layout directory mode 必须为 0700");
    }
  } finally {
    if (fd !== undefined) closeSync(fd);
  }
}

function ensureDirectory(parentPath: string, name: string): void {
  const path = join(parentPath, name);
  try {
    mkdirSync(path, { mode: DATA_ROOT_CHILD_DIR_MODE, recursive: false });
  } catch (error) {
    if (
      typeof error !== "object" ||
      error === null ||
      !("code" in error) ||
      error.code !== "EEXIST"
    ) {
      throw error;
    }
  }
  requireDirectory(path);

  const parentFd = openSync(
    dirname(path),
    FS.O_RDONLY | FS.O_DIRECTORY | FS.O_NOFOLLOW,
  );
  try {
    fsyncSync(parentFd);
  } finally {
    closeSync(parentFd);
  }
}

/** writer lease 之后唯一的固定 layout 初始化入口。 */
export function ensureDataRootLayout(
  root: OpenedDataRoot,
  lease: DataRootWriterLease,
): void {
  const liveLease = requireLiveDataRootWriterLease(lease);
  const liveRoot = requireLiveOpenedDataRoot(root);
  if (
    liveLease.root !== root ||
    liveLease.identity.dev !== liveRoot.identity.dev ||
    liveLease.identity.ino !== liveRoot.identity.ino
  ) {
    throw new Error("Data Root layout lease 与 root 不一致");
  }

  ensureDirectory(liveRoot.absolutePath, DATA_ROOT_LAYOUT.artifacts);
  ensureDirectory(liveRoot.absolutePath, DATA_ROOT_LAYOUT.projects);
  ensureDirectory(liveRoot.absolutePath, DATA_ROOT_LAYOUT.receipts);
  ensureDirectory(liveRoot.absolutePath, DATA_ROOT_LAYOUT.staging);
  ensureDirectory(liveRoot.absolutePath, DATA_ROOT_LAYOUT.artifactDigestDir);

  requireLiveOpenedDataRoot(root);
  if ((fstatSync(liveRoot.fd).mode & 0o777) !== DATA_ROOT_DIR_MODE) {
    throw new Error("Data Root mode 在 layout 初始化期间漂移");
  }
  fsyncSync(liveRoot.fd);
}
