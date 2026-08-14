import { constants, type BigIntStats } from "node:fs";

export const VERIFIED_CACHE_OPEN_FLAGS =
  constants.O_RDONLY |
  constants.O_NONBLOCK |
  ("O_NOFOLLOW" in constants ? constants.O_NOFOLLOW : 0);

function requireExpectedFile(
  value: BigIntStats,
  expectedByteLength: number,
  expectedMode?: number,
): void {
  if (!value.isFile() || value.size !== BigInt(expectedByteLength)) {
    throw new Error("cache file type/size identity 不匹配");
  }
  if (expectedMode !== undefined && (value.mode & 0o777n) !== BigInt(expectedMode)) {
    throw new Error("cache file mode identity 不匹配");
  }
}

export function requireStableOpenedFileIdentity(
  before: BigIntStats,
  after: BigIntStats,
  expectedByteLength: number,
  expectedMode?: number,
): void {
  requireExpectedFile(before, expectedByteLength, expectedMode);
  requireExpectedFile(after, expectedByteLength, expectedMode);
  for (const key of [
    "dev",
    "ino",
    "mode",
    "nlink",
    "uid",
    "gid",
    "size",
    "mtimeNs",
    "ctimeNs",
  ] as const) {
    if (before[key] !== after[key]) {
      throw new Error(`cache file ${key} 在读取期间漂移`);
    }
  }
}

export function requireOpenedFileIdentity(
  value: BigIntStats,
  expectedByteLength: number,
  expectedMode?: number,
): void {
  requireExpectedFile(value, expectedByteLength, expectedMode);
}
