import { describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";

import { MARBLE_HUNYUAN_REGISTRY } from "@demiurges/world";

import { ArtifactStoreReader, initializeArtifactStore } from "./artifact-store";
import {
  bootstrapDataRoot,
  dataRootReceiptIntentPath,
  dataRootReceiptResultPath,
  openDataRoot,
} from "./data-root";
import { acquireDataRootWriterLease } from "./data-root-lease";
import {
  DH013_IMPORT_OPERATION_ID,
  importDh013ProviderCache,
} from "./import-dh013";

const cacheRoot = process.env.DEMIURGES_DH013_TEST_CACHE_ROOT ?? resolve(
  import.meta.dir,
  "../../../../Demiurges-DH-013/.artifacts/provider-cache",
);
const hasAssets = MARBLE_HUNYUAN_REGISTRY.assets.every((entry) =>
  existsSync(join(cacheRoot, "sha256", entry.digest)));
const testWithAssets: typeof test = hasAssets ? test : test.skip;

describe("DH-013 → shared Artifact Store explicit migration", () => {
  testWithAssets("三项全量预验证后同一 durable operation 发布，重跑 exact replay", async () => {
    const parent = mkdtempSync(join(tmpdir(), "dh016-import-"));
    const rootPath = join(parent, "root");
    bootstrapDataRoot(rootPath);
    const root = openDataRoot(rootPath);
    const leaseResult = await acquireDataRootWriterLease(root);
    expect(leaseResult.status).toBe("acquired");
    if (leaseResult.status !== "acquired") throw new Error("lease unavailable");
    try {
      const first = await importDh013ProviderCache(
        root,
        leaseResult.lease,
        cacheRoot,
      );
      expect(first.replayed).toBe(false);
      expect(first.terminal.variant).toBe("success");
      const reader = new ArtifactStoreReader(root);
      for (const entry of MARBLE_HUNYUAN_REGISTRY.assets) {
        reader.verify(entry);
      }
      const replay = await importDh013ProviderCache(
        root,
        leaseResult.lease,
        cacheRoot,
      );
      expect(replay.replayed).toBe(true);
      expect(replay.terminal).toEqual(first.terminal);
    } finally {
      await leaseResult.lease.close();
      root.close();
      rmSync(parent, { recursive: true, force: true });
    }
  });

  testWithAssets("terminal publish 无法唯一完成时保留 intent、attempt 与 candidate evidence", async () => {
    const parent = mkdtempSync(join(tmpdir(), "dh016-import-terminal-fault-"));
    const rootPath = join(parent, "root");
    bootstrapDataRoot(rootPath);
    const root = openDataRoot(rootPath);
    const leaseResult = await acquireDataRootWriterLease(root);
    if (leaseResult.status !== "acquired") throw new Error("lease unavailable");
    try {
      initializeArtifactStore(root, leaseResult.lease);
      const pending = importDh013ProviderCache(
        root,
        leaseResult.lease,
        cacheRoot,
      );
      const resultPath = join(
        rootPath,
        dataRootReceiptResultPath(DH013_IMPORT_OPERATION_ID),
      );
      writeFileSync(resultPath, "foreign-result", { mode: 0o600 });
      await expect(pending).rejects.toThrow("OPERATION_RECOVERY_REQUIRED");
      expect(existsSync(join(
        rootPath,
        dataRootReceiptIntentPath(DH013_IMPORT_OPERATION_ID),
      ))).toBe(true);
      expect(existsSync(resultPath)).toBe(true);
      const attempts = readdirSync(join(rootPath, "staging"));
      expect(attempts).toHaveLength(1);
      expect(readdirSync(join(rootPath, "staging", attempts[0]!)))
        .toContain("operation-intent.json");
    } finally {
      await leaseResult.lease.close();
      root.close();
      rmSync(parent, { recursive: true, force: true });
    }
  });
});
