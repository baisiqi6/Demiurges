import { describe, expect, test } from "bun:test";
import {
  chmodSync,
  mkdtempSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import {
  readStableRegularFile,
  readStableRegularFileSnapshot,
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

  test("stable snapshot read returns identity plus bytes and requires exact 0600", () => {
    const dir = mkdtempSync(join(tmpdir(), "dh017-safe-fs-"));
    try {
      const path = join(dir, "value");
      const bytes = new TextEncoder().encode("世界");
      writeFileSync(path, bytes, { mode: 0o600 });
      const snapshot = readStableRegularFileSnapshot(path, 16);
      expect(new TextDecoder().decode(snapshot.bytes)).toBe("世界");
      expect(snapshot.identity.size).toBe(BigInt(bytes.byteLength));
      expect(snapshot.identity.mode & 0o777n).toBe(0o600n);
      expect(() => readStableRegularFileSnapshot(path, 5)).toThrow("byte budget");

      const wide = join(dir, "wide");
      writeFileSync(wide, "x", { mode: 0o644 });
      expect(() => readStableRegularFileSnapshot(wide, 16)).toThrow("0600");

      const link = join(dir, "link");
      symlinkSync(path, link);
      expect(() => readStableRegularFileSnapshot(link, 16)).toThrow();

      expect(() => readStableRegularFileSnapshot(join(dir, "missing"), 16)).toThrow();

      chmodSync(path, 0o644);
      expect(() => readStableRegularFileSnapshot(path, 16)).toThrow("0600");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("snapshot read rejects 0600 files carrying special permission bits when the platform preserves them", () => {
    const dir = mkdtempSync(join(tmpdir(), "dh017-safe-fs-"));
    try {
      const path = join(dir, "special");
      writeFileSync(path, "x", { mode: 0o600 });
      chmodSync(path, 0o6600); // 0600 + setuid + setgid
      if ((statSync(path).mode & 0o6000) !== 0) {
        expect(() => readStableRegularFileSnapshot(path, 16)).toThrow("0600");
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
