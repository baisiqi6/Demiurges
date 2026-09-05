import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { RuntimeMvpHost, createInitialSnapshot } from "@demiurges/world";

import { bootstrapDataRoot } from "./data-root";
import {
  createGenerationBinding,
  createGenerationIntent,
  requireGenerationRequest,
} from "./generation-contracts";
import { createWorldProjectManifest } from "./project-store";
import { openWorldProjectRuntime } from "./world-project-runtime";

describe("WorldProjectRuntime", () => {
  test("同一 host/Data Root 最多一个 writer；reader 跨 runtime 读取同一 Project", async () => {
    const parent = mkdtempSync(join(tmpdir(), "dh016-runtime-"));
    const rootPath = join(parent, "root");
    bootstrapDataRoot(rootPath);
    const first = await openWorldProjectRuntime(rootPath);
    const second = await openWorldProjectRuntime(rootPath);
    try {
      expect(first.mode).toBe("writer");
      expect(second.mode).toBe("reader");
      expect(second.writer).toBeNull();
      expect(second.writerUnavailableReason).toBe("listen-failed");
      expect(first.generatedArtifacts.list()).toEqual([]);
      expect(second.generatedArtifacts.list()).toEqual([]);

      const host = new RuntimeMvpHost();
      host.write(createInitialSnapshot());
      const manifest = createWorldProjectManifest(
        "project:shared",
        "Shared",
        host.exportProjectHistory(),
      );
      await first.writer!.save(manifest, "op:shared", null);
      expect(second.reader.open(manifest.projectId)).toEqual(manifest);
    } finally {
      await second.close();
      await first.close();
      rmSync(parent, { recursive: true, force: true });
    }
  });

  test("writer runtime exposes firstGeneration facade with admit/inspect round trip; reader does not", async () => {
    const parent = mkdtempSync(join(tmpdir(), "dh017-runtime-facade-"));
    const rootPath = join(parent, "root");
    bootstrapDataRoot(rootPath);
    const first = await openWorldProjectRuntime(rootPath);
    const second = await openWorldProjectRuntime(rootPath);
    try {
      expect(first.mode).toBe("writer");
      expect(second.mode).toBe("reader");
      expect(first.firstGeneration).not.toBeNull();
      expect(second.firstGeneration).toBeNull();
      expect(first.developmentFakeGeneration).toBeNull();
      expect(second.developmentFakeGeneration).toBeNull();
      expect(first.operatorCanaryCompletion).toBeNull();
      expect(second.operatorCanaryCompletion).toBeNull();

      const facade = first.firstGeneration!;
      const foreignId = `generation:sha256:${"a".repeat(64)}`;
      expect(facade.inspect(foreignId)).toEqual({ status: "absent" });

      const prepared = requireGenerationRequest({
        provider: "worldlabs-marble-v1",
        model: "marble-1.1",
        prompt: "a runtime facade arch",
        costUnknownAccepted: true,
        waitForCompletionAndDownload: true,
        idempotencyKey: "runtime-facade-key",
      });
      const binding = createGenerationBinding(prepared, {
        contractProfile: "worldlabs-openapi-2026-08-15-v1",
        contractShapeDigest: "a".repeat(64),
      });
      const durableIntent = createGenerationIntent(
        binding,
        "2026-08-15T10:00:00.000Z",
      );
      expect(facade.admit(durableIntent)).toMatchObject({
        status: "admitted",
        namespaceStatus: "installed",
        birthStatus: "born",
        current: { state: "admitted", sequence: 0 },
      });
      expect(facade.admit(durableIntent)).toMatchObject({
        status: "admitted",
        namespaceStatus: "replay",
        birthStatus: "replay",
      });
      const inspection = facade.inspect(durableIntent.generationId);
      expect(inspection).toEqual({
        status: "admitted",
        intent: durableIntent,
        current: expect.objectContaining({ state: "admitted", sequence: 0 }),
      });
      const checkpoint = facade.checkpoint({
        generationId: durableIntent.generationId,
        recordedAt: "2026-08-15T10:00:01.000Z",
        decision: { kind: "ready" },
      });
      expect(checkpoint).toMatchObject({
        status: "ready",
        replay: false,
        record: { state: "submit_started", sequence: 1, payload: { submitAttempt: 1 } },
      });
      expect(facade.checkpoint({
        generationId: durableIntent.generationId,
        recordedAt: "2026-08-15T10:00:01.000Z",
        decision: { kind: "ready" },
      })).toMatchObject({ status: "ready", replay: true, record: { sequence: 1 } });
      expect(() => facade.checkpoint({
        generationId: durableIntent.generationId,
        recordedAt: "2026-08-15T10:00:01.000Z",
        decision: { kind: "blocked", code: "REQUEST_ABORTED" },
      })).toThrow("GENERATION_RECOVERY_REQUIRED");
    } finally {
      await second.close();
      await first.close();
      rmSync(parent, { recursive: true, force: true });
    }
  });
});
