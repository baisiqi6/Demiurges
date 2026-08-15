import { describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, renameSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";

import {
  GENERATED_OBJECT_REF,
  MARBLE_HUNYUAN_REGISTRY,
  RuntimeMvpHost,
  createMarbleHunyuanCompositeSnapshot,
} from "@demiurges/world";

import { dataRootArtifactPath, bootstrapDataRoot, openDataRoot } from "./data-root";
import { acquireDataRootWriterLease } from "./data-root-lease";
import { importDh013ProviderCache } from "./import-dh013";
import { createWorldProjectManifest, WorldProjectWriter } from "./project-store";
import { ArtifactStoreReader } from "./artifact-store";
import { openWorldProjectRuntime } from "./world-project-runtime";

const cacheRoot = process.env.DEMIURGES_DH013_TEST_CACHE_ROOT ?? resolve(
  import.meta.dir,
  "../../../../Demiurges-DH-013/.artifacts/provider-cache",
);
const hasAssets = MARBLE_HUNYUAN_REGISTRY.assets.every((entry) =>
  existsSync(join(cacheRoot, "sha256", entry.digest)));
const testWithAssets: typeof test = hasAssets ? test : test.skip;

describe("World Project persistence product acceptance", () => {
  testWithAssets(
    "Marble × Hunyuan v1→v2 可跨进程恢复；损坏 fail closed；bundle 空根导入 identity exact",
    async () => {
      const parent = mkdtempSync(join(tmpdir(), "dh016-product-"));
      const firstRootPath = join(parent, "root-a");
      const secondRootPath = join(parent, "root-b");
      bootstrapDataRoot(firstRootPath);

      const root = openDataRoot(firstRootPath);
      const leaseResult = await acquireDataRootWriterLease(root);
      if (leaseResult.status !== "acquired") throw new Error("lease unavailable");
      let expectedHistory;
      let expectedManifest;
      try {
        await importDh013ProviderCache(root, leaseResult.lease, cacheRoot);
        const host = new RuntimeMvpHost();
        host.write(createMarbleHunyuanCompositeSnapshot());
        const edited = host.editCurrentEntityPose(
          host.readRefRecord(),
          GENERATED_OBJECT_REF,
          {
            position: [0.4, -0.25, 1.2],
            rotation: { x: 0, y: 0, z: 0, w: 1 },
          },
        );
        expect(edited.status).toBe("updated");
        expectedHistory = host.exportProjectHistory();
        expectedManifest = createWorldProjectManifest(
          "project:marble-hunyuan",
          "Marble × Hunyuan",
          expectedHistory,
        );
        const writer = new WorldProjectWriter(
          root,
          leaseResult.lease,
          new ArtifactStoreReader(root),
        );
        await writer.save(expectedManifest, "op:persistence-v2", null);
      } finally {
        await leaseResult.lease.close();
        root.close();
      }

      const reopened = await openWorldProjectRuntime(firstRootPath);
      let bundle: Uint8Array;
      try {
        const restored = reopened.reader.restoreHost("project:marble-hunyuan");
        expect(restored.manifest).toEqual(expectedManifest);
        expect(restored.host.exportProjectHistory()).toEqual(expectedHistory);
        bundle = reopened.bundles.export("project:marble-hunyuan");

        const glb = MARBLE_HUNYUAN_REGISTRY.assets.find(
          (entry) => entry.format === "glb-2.0",
        );
        if (glb === undefined) throw new Error("registered GLB missing");
        const artifactPath = join(firstRootPath, dataRootArtifactPath(glb.digest));
        const heldPath = join(parent, "held-glb");
        renameSync(artifactPath, heldPath);
        expect(() => reopened.reader.open("project:marble-hunyuan")).toThrow();
        // 已经恢复到内存的 Repository authority 不会被磁盘损坏反向污染。
        expect(restored.host.exportProjectHistory()).toEqual(expectedHistory);
        renameSync(heldPath, artifactPath);
        expect(reopened.reader.open("project:marble-hunyuan")).toEqual(expectedManifest);
      } finally {
        await reopened.close();
      }

      bootstrapDataRoot(secondRootPath);
      const emptyRuntime = await openWorldProjectRuntime(secondRootPath);
      try {
        expect(emptyRuntime.mode).toBe("writer");
        const imported = await emptyRuntime.bundles.import(
          bundle!,
          "op:bundle-empty-root",
        );
        expect(imported.replayed).toBe(false);
        const restored = emptyRuntime.reader.restoreHost("project:marble-hunyuan");
        expect(restored.manifest).toEqual(expectedManifest);
        expect(restored.host.exportProjectHistory()).toEqual(expectedHistory);
        expect(emptyRuntime.bundles.export("project:marble-hunyuan")).toEqual(bundle!);
      } finally {
        await emptyRuntime.close();
        rmSync(parent, { recursive: true, force: true });
      }
    },
    30_000,
  );
});
