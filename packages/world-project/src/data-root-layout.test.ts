import { describe, expect, test } from "bun:test";
import { mkdtempSync, readdirSync, rmSync, symlinkSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { bootstrapDataRoot, openDataRoot } from "./data-root";
import { acquireDataRootWriterLease } from "./data-root-lease";
import { ensureDataRootLayout } from "./data-root-layout";

describe("ensureDataRootLayout", () => {
  test("只有同一 live package-owned lease 可创建固定 layout", async () => {
    const parent = mkdtempSync(join(tmpdir(), "dh016-layout-"));
    const rootPath = join(parent, "root");
    bootstrapDataRoot(rootPath);
    const root = openDataRoot(rootPath);
    const leaseResult = await acquireDataRootWriterLease(root);
    expect(leaseResult.status).toBe("acquired");
    if (leaseResult.status !== "acquired") throw new Error("lease unavailable");
    try {
      ensureDataRootLayout(root, leaseResult.lease);
      expect(readdirSync(rootPath).sort()).toEqual([
        "artifacts",
        "projects",
        "receipts",
        "staging",
      ]);
      expect(readdirSync(join(rootPath, "artifacts"))).toEqual(["sha256"]);
      ensureDataRootLayout(root, leaseResult.lease);
    } finally {
      await leaseResult.lease.close();
      root.close();
      rmSync(parent, { recursive: true, force: true });
    }
  });

  test("wrong-type/symlink layout entry 与另一 root lease fail closed", async () => {
    const parent = mkdtempSync(join(tmpdir(), "dh016-layout-"));
    const firstPath = join(parent, "first");
    const secondPath = join(parent, "second");
    bootstrapDataRoot(firstPath);
    bootstrapDataRoot(secondPath);
    const first = openDataRoot(firstPath);
    const second = openDataRoot(secondPath);
    const leaseResult = await acquireDataRootWriterLease(first);
    expect(leaseResult.status).toBe("acquired");
    if (leaseResult.status !== "acquired") throw new Error("lease unavailable");
    try {
      expect(() => ensureDataRootLayout(second, leaseResult.lease)).toThrow(
        "Data Root layout lease 与 root 不一致",
      );
      symlinkSync(secondPath, join(firstPath, "artifacts"));
      expect(() => ensureDataRootLayout(first, leaseResult.lease)).toThrow();
    } finally {
      await leaseResult.lease.close();
      first.close();
      second.close();
      rmSync(parent, { recursive: true, force: true });
    }
  });
});
