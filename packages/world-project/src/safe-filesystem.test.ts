import { describe, expect, test } from "bun:test";
import {
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import {
  readStableRegularFile,
  syncDirectory,
  writeNewSyncedFile,
} from "./safe-filesystem";

describe("safe filesystem primitives", () => {
  test("exclusive write + bounded stable read + directory fsync", () => {
    const dir = mkdtempSync(join(tmpdir(), "dh016-safe-fs-"));
    try {
      const path = join(dir, "value");
      writeNewSyncedFile(path, new TextEncoder().encode("世界"));
      expect(new TextDecoder().decode(readStableRegularFile(path, 16))).toBe("世界");
      expect(() => readStableRegularFile(path, 5)).toThrow("byte budget");
      expect(() => writeNewSyncedFile(path, new Uint8Array())).toThrow();
      syncDirectory(dir);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("symlink 与非 regular file fail closed", () => {
    const dir = mkdtempSync(join(tmpdir(), "dh016-safe-fs-"));
    try {
      const target = join(dir, "target");
      const link = join(dir, "link");
      writeFileSync(target, "x");
      symlinkSync(target, link);
      expect(() => readStableRegularFile(link, 16)).toThrow();
      expect(() => readStableRegularFile(dir, 16)).toThrow();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
