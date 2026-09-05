import { describe, expect, test } from "bun:test";
import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  bootstrapDataRoot,
  openWorldProjectRuntime,
} from "@demiurges/world-project";

import { createDevelopmentFakeGenerationApi } from "./development-fake-generation-api";
import { createGeneratedArtifactApi } from "./generated-artifact-api";

describe("development fake generation API", () => {
  test("explicit POST creates one verified set; replay and normal list/read are stable", async () => {
    const parent = mkdtempSync(join(tmpdir(), "dh017-development-fake-api-"));
    const rootPath = join(parent, "root");
    bootstrapDataRoot(rootPath);
    const runtime = await openWorldProjectRuntime(rootPath, {
      enableDevelopmentFakeGeneration: true,
    });
    try {
      const development = createDevelopmentFakeGenerationApi({
        firstGeneration: runtime.firstGeneration,
        completion: runtime.developmentFakeGeneration,
      });
      const generated = createGeneratedArtifactApi({ reader: runtime.generatedArtifacts });
      const first = await development.fetch(new Request(
        "http://127.0.0.1/api/dev/fake-generation",
        { method: "POST" },
      ));
      expect(first?.status).toBe(200);
      const body = await first!.json() as Record<string, unknown>;
      expect(body.status).toBe("verified");
      const generationId = String(body.generationId);
      const digest = generationId.slice("generation:sha256:".length);
      const recordsPath = join(
        rootPath,
        "receipts",
        "generations",
        "data",
        digest,
        "records",
      );
      const before = readdirSync(recordsPath).sort();

      const list = await generated.fetch(new Request("http://127.0.0.1/api/artifacts"));
      expect(list?.status).toBe(200);
      const listed = await list!.json() as {
        sets: readonly { generationId: string; members: readonly { assetId: string }[] }[];
      };
      expect(listed.sets).toHaveLength(1);
      expect(listed.sets[0]!.generationId).toBe(generationId);
      const assetId = listed.sets[0]!.members[0]!.assetId;
      const bytes = await generated.fetch(new Request(
        `http://127.0.0.1/api/artifacts/${encodeURIComponent(generationId)}/${encodeURIComponent(assetId)}`,
      ));
      expect(bytes?.status).toBe(200);
      expect((await bytes!.arrayBuffer()).byteLength).toBeGreaterThan(0);

      const replay = await development.fetch(new Request(
        "http://127.0.0.1/api/dev/fake-generation",
        { method: "POST" },
      ));
      expect(replay?.status).toBe(200);
      expect(await replay!.json()).toMatchObject({ status: "replay", generationId });
      expect(readdirSync(recordsPath).sort()).toEqual(before);
    } finally {
      await runtime.close();
      rmSync(parent, { recursive: true, force: true });
    }
  });

  test("route is explicit and unavailable without the development facade", async () => {
    const api = createDevelopmentFakeGenerationApi({});
    expect(await api.fetch(new Request("http://127.0.0.1/api/other"))).toBeUndefined();
    expect((await api.fetch(new Request(
      "http://127.0.0.1/api/dev/fake-generation",
      { method: "POST" },
    )))?.status).toBe(503);
    expect((await api.fetch(new Request(
      "http://127.0.0.1/api/dev/fake-generation?provider=real",
      { method: "POST" },
    )))?.status).toBe(400);
  });
});
