import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gzipSync } from "node:zlib";

import {
  bootstrapDataRoot,
  createGenerationBinding,
  createGenerationIntent,
  generationIdFromIdempotencyKey,
  openWorldProjectRuntime,
  requireGenerationRequest,
} from "@demiurges/world-project";

import { HunyuanGenerationService } from "./hunyuan-generation-service";
import { MarbleGenerationService } from "./marble-generation-service";
import { ProviderCanaryRunner, type FrozenProviderCanaryV1 } from "./provider-canary-runner";

const KEY = "test-canary-key-never-log";
const SHAPE = "a".repeat(64);
const REQUEST_ID = "123e4567-e89b-42d3-a456-426614174000";

function json(value: unknown): Response {
  return new Response(JSON.stringify(value), { status: 200 });
}

function writeSignedInt24(value: number, bytes: Uint8Array, offset: number): void {
  const encoded = value < 0 ? value + 0x1_000000 : value;
  bytes[offset] = encoded & 0xff;
  bytes[offset + 1] = encoded >>> 8 & 0xff;
  bytes[offset + 2] = encoded >>> 16 & 0xff;
}

function spz(): Uint8Array {
  const centers = [[-1.25, 0.5, 2], [1.75, -0.25, -2.5]] as const;
  const raw = new Uint8Array(16 + centers.length * 19);
  const view = new DataView(raw.buffer);
  view.setUint32(0, 1_347_635_022, true);
  view.setUint32(4, 2, true);
  view.setUint32(8, centers.length, true);
  view.setUint8(13, 12);
  centers.forEach((center, index) => center.forEach((component, axis) =>
    writeSignedInt24(component * 2 ** 12, raw, 16 + index * 9 + axis * 3)));
  return gzipSync(raw);
}

function glb(): Uint8Array {
  const positions = [[-1, -2, -3], [4, 5, 6]] as const;
  const binary = new Uint8Array(positions.length * 12);
  const binaryView = new DataView(binary.buffer);
  positions.forEach((position, index) => position.forEach((component, axis) =>
    binaryView.setFloat32(index * 12 + axis * 4, component, true)));
  const jsonBytes = new TextEncoder().encode(JSON.stringify({
    asset: { version: "2.0" }, scene: 0, scenes: [{ nodes: [0] }], nodes: [{ mesh: 0 }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0 } }] }], buffers: [{ byteLength: binary.byteLength }],
    bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: binary.byteLength }],
    accessors: [{ bufferView: 0, componentType: 5126, count: positions.length, type: "VEC3", min: [-1, -2, -3], max: [4, 5, 6] }],
  }));
  const jsonLength = Math.ceil(jsonBytes.byteLength / 4) * 4;
  const binaryOffset = 20 + jsonLength;
  const bytes = new Uint8Array(binaryOffset + 8 + binary.byteLength);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, 0x46546c67, true); view.setUint32(4, 2, true); view.setUint32(8, bytes.byteLength, true);
  view.setUint32(12, jsonLength, true); view.setUint32(16, 0x4e4f534a, true);
  bytes.fill(0x20, 20, binaryOffset); bytes.set(jsonBytes, 20);
  view.setUint32(binaryOffset, binary.byteLength, true); view.setUint32(binaryOffset + 4, 0x004e4942, true);
  bytes.set(binary, binaryOffset + 8);
  return bytes;
}

function canary(provider: "worldlabs-marble-v1" | "hunyuan-ai3d-v1"): FrozenProviderCanaryV1 {
  return provider === "worldlabs-marble-v1"
    ? {
        provider,
        model: "marble-1.0-draft",
        prompt: "A small quiet stone courtyard with a single red wooden stool at the center, flat ground, daylight, no people, no text.",
        idempotencyKey: "fake-marble-canary",
        contract: { contractProfile: "worldlabs-openapi-2026-08-15-v1", contractShapeDigest: SHAPE },
        maxPollAttempts: 2,
        deadlineAt: "2030-01-01T00:00:00.000Z",
      }
    : {
        provider,
        model: "3.0",
        prompt: "一张结构简单的红色木凳，四条腿，纯色材质，独立单体，无人物，无文字。",
        idempotencyKey: "fake-hunyuan-canary",
        contract: { contractProfile: "cloud-response-v1", contractShapeDigest: SHAPE },
        maxPollAttempts: 2,
        deadlineAt: "2030-01-01T00:00:00.000Z",
      };
}

async function withRuntime(run: (runtime: Awaited<ReturnType<typeof openWorldProjectRuntime>>) => Promise<void>): Promise<void> {
  const parent = mkdtempSync(join(tmpdir(), "dh017-canary-runner-"));
  const root = join(parent, "root");
  bootstrapDataRoot(root);
  const runtime = await openWorldProjectRuntime(root, { enableOperatorCanaryCompletion: true });
  try {
    await run(runtime);
  } finally {
    await runtime.close();
    rmSync(parent, { recursive: true, force: true });
  }
}

describe("ProviderCanaryRunner", () => {
  test("Marble submits exactly once, bounds poll/download, and publishes verified bytes without signed URLs", async () => {
    await withRuntime(async (runtime) => {
      const requests: Request[] = [];
      const marble = new MarbleGenerationService({
        apiKey: KEY,
        fetch: async (request) => {
          requests.push(request);
          if (request.method === "POST") return json({ operation_id: "op_1", done: false });
          if (request.url.includes("operations")) return json({
            operation_id: "op_1", done: true, response: {
              world_id: "world_1", display_name: "courtyard", world_marble_url: "https://marble.worldlabs.ai/worlds/1",
              assets: { splats: { spz_urls: { "500k": "https://cdn.marble.worldlabs.ai/a.spz?signature=secret" } }, mesh: { collider_mesh_url: "https://cdn.marble.worldlabs.ai/a.glb?signature=secret" } },
            },
          });
          return json({
            world_id: "world_1", display_name: "courtyard", world_marble_url: "https://marble.worldlabs.ai/worlds/1",
            assets: { splats: { spz_urls: { "500k": "https://cdn.marble.worldlabs.ai/a.spz?signature=secret" } }, mesh: { collider_mesh_url: "https://cdn.marble.worldlabs.ai/a.glb?signature=secret" } },
          });
        },
      });
      const hunyuan = new HunyuanGenerationService({
        apiKey: KEY,
        contractProfile: "cloud-response-v1",
        contractShapeDigest: SHAPE,
        fetch: async (request) => {
          requests.push(request);
          return request.url.endsWith("/submit")
            ? json({ Response: { JobId: "123456", RequestId: REQUEST_ID } })
            : json({ Response: { Status: "DONE", RequestId: REQUEST_ID, ResultCreditConsumed: 20, ResultFile3Ds: [{ Type: "GLB", Url: "https://bucket.cos.ap-guangzhou.tencentcos.cn/a.glb?signature=secret" }] } });
        },
      });
      const downloads: Array<{ url: string; provider: string }> = [];
      const runner = new ProviderCanaryRunner({
        firstGeneration: runtime.firstGeneration!,
        completion: runtime.operatorCanaryCompletion!,
        marble,
        hunyuan,
        downloader: {
          download: async ({ url, provider, format }) => {
            downloads.push({ url, provider });
            return format === "spz-v2" ? spz() : glb();
          },
        },
        now: () => Date.parse("2026-08-20T00:00:00.000Z"),
        createRecordedAt: (() => { let second = 1; return () => `2026-08-20T00:00:${String(second++).padStart(2, "0")}.000Z`; })(),
      });
      const result = await runner.run(canary("worldlabs-marble-v1"));
      expect(result.status).toBe("verified");
      expect(JSON.stringify(result)).not.toContain("signature");
      expect(JSON.stringify(result)).not.toContain(KEY);
      expect(requests.filter((request) => request.method === "POST" && request.url.includes("worlds:generate"))).toHaveLength(1);
      expect(requests.filter((request) => request.method === "POST" && request.url.endsWith("/submit"))).toHaveLength(0);
      expect(downloads).toHaveLength(2);
      expect(downloads.every(({ url }) => !JSON.stringify(runtime.generatedArtifacts.list()).includes(url))).toBeTrue();
    });
  });

  test("Hunyuan also uses one submit and one signed-asset-free publication path", async () => {
    await withRuntime(async (runtime) => {
      const requests: Request[] = [];
      const marble = new MarbleGenerationService({ apiKey: KEY, fetch: async () => json({}) });
      const hunyuan = new HunyuanGenerationService({
        apiKey: KEY, contractProfile: "cloud-response-v1", contractShapeDigest: SHAPE,
        fetch: async (request) => {
          requests.push(request);
          return request.url.endsWith("/submit")
            ? json({ Response: { JobId: "123456", RequestId: REQUEST_ID } })
            : json({ Response: { Status: "DONE", RequestId: REQUEST_ID, ResultCreditConsumed: 20, ResultFile3Ds: [{ Type: "GLB", Url: "https://bucket.cos.ap-guangzhou.tencentcos.cn/a.glb?signature=secret" }] } });
        },
      });
      const runner = new ProviderCanaryRunner({
        firstGeneration: runtime.firstGeneration!, completion: runtime.operatorCanaryCompletion!, marble, hunyuan,
        downloader: { download: async ({ format }) => format === "glb-2.0" ? glb() : spz() },
        now: () => Date.parse("2026-08-20T00:00:00.000Z"),
        createRecordedAt: (() => { let second = 1; return () => `2026-08-20T00:00:${String(second++).padStart(2, "0")}.000Z`; })(),
      });
      const result = await runner.run(canary("hunyuan-ai3d-v1"));
      expect(result.status).toBe("verified");
      expect(JSON.stringify(result)).not.toContain("signature");
      expect(requests.filter((request) => request.url.endsWith("/submit"))).toHaveLength(1);
      expect(result).toMatchObject({
        elapsedMs: 0,
        sanitizedCost: { unit: "hunyuan-credit", amount: "20" },
        artifacts: [{ role: "object-glb", format: "glb-2.0" }],
      });
    });
  });

  test("frozen provider/model/prompt/profile/shape drift fails before provider fetch", async () => {
    await withRuntime(async (runtime) => {
      let fetches = 0;
      const marble = new MarbleGenerationService({ apiKey: KEY, fetch: async () => { fetches += 1; return json({}); } });
      const hunyuan = new HunyuanGenerationService({ apiKey: KEY, contractProfile: "cloud-response-v1", contractShapeDigest: SHAPE, fetch: async () => { fetches += 1; return json({}); } });
      const runner = new ProviderCanaryRunner({
        firstGeneration: runtime.firstGeneration!, completion: runtime.operatorCanaryCompletion!, marble, hunyuan,
        downloader: { download: async () => glb() }, now: () => 0,
      });
      const frozen = canary("hunyuan-ai3d-v1");
      const forged = createGenerationIntent(createGenerationBinding(requireGenerationRequest({
        provider: "hunyuan-ai3d-v1", model: "3.0", prompt: "forged", costUnknownAccepted: true,
        waitForCompletionAndDownload: true, idempotencyKey: frozen.idempotencyKey,
      }), frozen.contract), "2026-08-20T00:00:00.000Z");
      expect(await runner.run(frozen, forged)).toMatchObject({ status: "blocked" });
      expect(fetches).toBe(0);
    });
  });

  test("a durable intent that no longer matches the frozen contract blocks before provider fetch", async () => {
    await withRuntime(async (runtime) => {
      const frozen = canary("hunyuan-ai3d-v1");
      const forged = createGenerationIntent(createGenerationBinding(requireGenerationRequest({
        provider: "hunyuan-ai3d-v1", model: "3.0", prompt: "forged", costUnknownAccepted: true,
        waitForCompletionAndDownload: true, idempotencyKey: frozen.idempotencyKey,
      }), frozen.contract), "2026-08-20T00:00:00.000Z");
      // 直接推进 durable 链到 remote_bound：admit → checkpoint(ready) →
      // submitResult(remote-bound)，与 orchestrator 的持久化形状一致。
      expect(runtime.firstGeneration!.admit(forged)).toMatchObject({ status: "admitted" });
      expect(runtime.firstGeneration!.checkpoint({
        generationId: forged.generationId,
        recordedAt: "2026-08-20T00:00:01.000Z",
        decision: { kind: "ready" },
      })).toMatchObject({ status: "ready" });
      expect(runtime.firstGeneration!.submitResult({
        generationId: forged.generationId,
        recordedAt: "2026-08-20T00:00:02.000Z",
        outcome: {
          kind: "remote-bound",
          remoteBound: { provider: "hunyuan-ai3d-v1", remoteJobId: "123456", providerRequestId: REQUEST_ID },
        },
      })).toMatchObject({ status: "appended" });
      let fetches = 0;
      const marble = new MarbleGenerationService({ apiKey: KEY, fetch: async () => { fetches += 1; return json({}); } });
      const hunyuan = new HunyuanGenerationService({
        apiKey: KEY, contractProfile: "cloud-response-v1", contractShapeDigest: SHAPE,
        fetch: async () => { fetches += 1; return json({}); },
      });
      const runner = new ProviderCanaryRunner({
        firstGeneration: runtime.firstGeneration!, completion: runtime.operatorCanaryCompletion!, marble, hunyuan,
        downloader: { download: async () => glb() },
        now: () => Date.parse("2026-08-20T00:00:00.000Z"),
        sleep: async () => undefined,
      });
      expect(await runner.run(frozen)).toMatchObject({ status: "blocked", generationId: forged.generationId });
      expect(fetches).toBe(0);
    });
  });

  test("a durable state other than remote_bound blocks a second invocation before provider fetch", async () => {
    await withRuntime(async (runtime) => {
      const frozen = canary("hunyuan-ai3d-v1");
      const intent = createGenerationIntent(createGenerationBinding(requireGenerationRequest({
        provider: "hunyuan-ai3d-v1", model: "3.0", prompt: frozen.prompt, costUnknownAccepted: true,
        waitForCompletionAndDownload: true, idempotencyKey: frozen.idempotencyKey,
      }), frozen.contract), "2026-08-20T00:00:00.000Z");
      // durable 链推进到 provider_failed：admit → checkpoint(ready) →
      // submitResult(remote-bound) → submitResult(provider-failed)。
      expect(runtime.firstGeneration!.admit(intent)).toMatchObject({ status: "admitted" });
      expect(runtime.firstGeneration!.checkpoint({
        generationId: intent.generationId,
        recordedAt: "2026-08-20T00:00:01.000Z",
        decision: { kind: "ready" },
      })).toMatchObject({ status: "ready" });
      expect(runtime.firstGeneration!.submitResult({
        generationId: intent.generationId,
        recordedAt: "2026-08-20T00:00:02.000Z",
        outcome: {
          kind: "remote-bound",
          remoteBound: { provider: "hunyuan-ai3d-v1", remoteJobId: "123456", providerRequestId: REQUEST_ID },
        },
      })).toMatchObject({ status: "appended" });
      expect(runtime.firstGeneration!.submitResult({
        generationId: intent.generationId,
        recordedAt: "2026-08-20T00:00:03.000Z",
        outcome: { kind: "provider-failed", code: "PROVIDER_REJECTED" },
      })).toMatchObject({ status: "appended" });
      let fetches = 0;
      const marble = new MarbleGenerationService({ apiKey: KEY, fetch: async () => { fetches += 1; return json({}); } });
      const hunyuan = new HunyuanGenerationService({
        apiKey: KEY, contractProfile: "cloud-response-v1", contractShapeDigest: SHAPE,
        fetch: async () => { fetches += 1; return json({}); },
      });
      const runner = new ProviderCanaryRunner({
        firstGeneration: runtime.firstGeneration!, completion: runtime.operatorCanaryCompletion!, marble, hunyuan,
        downloader: { download: async () => glb() },
        now: () => Date.parse("2026-08-20T00:00:00.000Z"),
        sleep: async () => undefined,
      });
      expect(await runner.run(frozen)).toMatchObject({ status: "blocked", generationId: intent.generationId });
      expect(fetches).toBe(0);
    });
  });

  test("pre-submit abort is zero-fetch; a remote_bound root resumes to verified with exactly one submit", async () => {
    await withRuntime(async (runtime) => {
      let submits = 0;
      let queries = 0;
      const marble = new MarbleGenerationService({ apiKey: KEY, fetch: async () => json({}) });
      const hunyuan = new HunyuanGenerationService({
        apiKey: KEY, contractProfile: "cloud-response-v1", contractShapeDigest: SHAPE,
        fetch: async (request) => {
          if (request.url.endsWith("/submit")) {
            submits += 1;
            return json({ Response: { JobId: "123456", RequestId: REQUEST_ID } });
          }
          queries += 1;
          return queries === 1
            ? json({ Response: { Status: "RUN", RequestId: REQUEST_ID } })
            : json({ Response: { Status: "DONE", RequestId: REQUEST_ID, ResultFile3Ds: [{ Type: "GLB", Url: "https://bucket.cos.ap-guangzhou.tencentcos.cn/a.glb?signature=secret" }] } });
        },
      });
      const runner = new ProviderCanaryRunner({
        firstGeneration: runtime.firstGeneration!, completion: runtime.operatorCanaryCompletion!, marble, hunyuan,
        downloader: { download: async () => glb() }, now: () => Date.parse("2026-08-20T00:00:00.000Z"),
        sleep: async () => undefined,
        createRecordedAt: (() => { let second = 1; return () => `2026-08-20T00:00:${String(second++).padStart(2, "0")}.000Z`; })(),
      });
      const generationId = generationIdFromIdempotencyKey(canary("hunyuan-ai3d-v1").idempotencyKey);
      const aborted = new AbortController();
      aborted.abort();
      expect(await runner.run(canary("hunyuan-ai3d-v1"), undefined, aborted.signal)).toMatchObject({ status: "blocked" });
      expect(submits).toBe(0);
      // 第一次运行停在 remote_bound：单次 poll 见 pending 后 timed-out，
      // 不写 terminal record。
      const first = { ...canary("hunyuan-ai3d-v1"), maxPollAttempts: 1 };
      expect(await runner.run(first)).toMatchObject({ status: "timed-out", generationId });
      expect(submits).toBe(1);
      expect(queries).toBe(1);
      const stopped = runtime.firstGeneration!.submitInspect(generationId);
      expect(stopped.status).toBe("present");
      if (stopped.status !== "present") throw new Error("unreachable");
      expect(stopped.current.state).toBe("remote_bound");
      // 第二次运行 resume：不 submit、不 admission，poll 到 verified。
      const resumed = await runner.run(canary("hunyuan-ai3d-v1"));
      expect(resumed.status).toBe("verified");
      expect(resumed.generationId).toBe(generationId);
      expect(submits).toBe(1);
      expect(queries).toBe(2);
    });
  });

  test("uses the frozen provider-specific poll schedules rather than a one-second retry loop", async () => {
    await withRuntime(async (runtime) => {
      const sleeps: number[] = [];
      let marbleQueries = 0;
      const marble = new MarbleGenerationService({
        apiKey: KEY,
        fetch: async (request) => {
          if (request.method === "POST") return json({ operation_id: "op_1", done: false });
          marbleQueries += 1;
          return json({ operation_id: "op_1", done: false });
        },
      });
      const runner = new ProviderCanaryRunner({
        firstGeneration: runtime.firstGeneration!, completion: runtime.operatorCanaryCompletion!, marble,
        hunyuan: new HunyuanGenerationService({ apiKey: KEY, contractProfile: "cloud-response-v1", contractShapeDigest: SHAPE, fetch: async () => json({}) }),
        downloader: { download: async () => glb() },
        now: () => Date.parse("2026-08-20T00:00:00.000Z"),
        sleep: async (milliseconds) => { sleeps.push(milliseconds); },
      });
      expect(await runner.run({ ...canary("worldlabs-marble-v1"), maxPollAttempts: 37 })).toMatchObject({ status: "timed-out" });
      expect(marbleQueries).toBe(37);
      expect(sleeps).toHaveLength(37);
      expect(sleeps.slice(0, 12)).toEqual(Array(12).fill(5_000));
      expect(sleeps.slice(12, 36)).toEqual(Array(24).fill(10_000));
      expect(sleeps[36]).toBe(20_000);
    });
  });

  test("Hunyuan terminal FAIL poll durably appends provider_failed(PROVIDER_REJECTED)", async () => {
    await withRuntime(async (runtime) => {
      const marble = new MarbleGenerationService({ apiKey: KEY, fetch: async () => json({}) });
      const hunyuan = new HunyuanGenerationService({
        apiKey: KEY, contractProfile: "cloud-response-v1", contractShapeDigest: SHAPE,
        fetch: async (request) => {
          if (request.url.endsWith("/submit")) {
            return json({ Response: { JobId: "123456", RequestId: REQUEST_ID } });
          }
          return json({ Response: { Status: "FAIL", RequestId: REQUEST_ID } });
        },
      });
      const runner = new ProviderCanaryRunner({
        firstGeneration: runtime.firstGeneration!, completion: runtime.operatorCanaryCompletion!, marble, hunyuan,
        downloader: { download: async () => glb() },
        now: () => Date.parse("2026-08-20T00:00:00.000Z"),
        createRecordedAt: (() => { let second = 1; return () => `2026-08-20T00:00:${String(second++).padStart(2, "0")}.000Z`; })(),
      });
      const generationId = generationIdFromIdempotencyKey(canary("hunyuan-ai3d-v1").idempotencyKey);
      const result = await runner.run(canary("hunyuan-ai3d-v1"));
      expect(result).toMatchObject({ status: "provider-failed", generationId });
      const inspection = runtime.firstGeneration!.submitInspect(generationId);
      expect(inspection.status).toBe("present");
      if (inspection.status !== "present") throw new Error("unreachable");
      expect(inspection.current.state).toBe("provider_failed");
      expect(inspection.current.payload).toEqual({ code: "PROVIDER_REJECTED" });
    });
  });

  test("Hunyuan HTTP-rejected poll durably writes its exact provider code", async () => {
    await withRuntime(async (runtime) => {
      const marble = new MarbleGenerationService({ apiKey: KEY, fetch: async () => json({}) });
      const hunyuan = new HunyuanGenerationService({
        apiKey: KEY, contractProfile: "cloud-response-v1", contractShapeDigest: SHAPE,
        fetch: async (request) => {
          if (request.url.endsWith("/submit")) {
            return json({ Response: { JobId: "123456", RequestId: REQUEST_ID } });
          }
          return new Response("nope", { status: 401 });
        },
      });
      const runner = new ProviderCanaryRunner({
        firstGeneration: runtime.firstGeneration!, completion: runtime.operatorCanaryCompletion!, marble, hunyuan,
        downloader: { download: async () => glb() },
        now: () => Date.parse("2026-08-20T00:00:00.000Z"),
        createRecordedAt: (() => { let second = 1; return () => `2026-08-20T00:00:${String(second++).padStart(2, "0")}.000Z`; })(),
      });
      const generationId = generationIdFromIdempotencyKey(canary("hunyuan-ai3d-v1").idempotencyKey);
      const result = await runner.run(canary("hunyuan-ai3d-v1"));
      expect(result).toMatchObject({ status: "provider-failed", generationId });
      const inspection = runtime.firstGeneration!.submitInspect(generationId);
      expect(inspection.status).toBe("present");
      if (inspection.status !== "present") throw new Error("unreachable");
      expect(inspection.current.state).toBe("provider_failed");
      expect(inspection.current.payload).toEqual({ code: "PROVIDER_UNAUTHORIZED" });
    });
  });

  test("Marble transient poll returns timed-out without a terminal record", async () => {
    await withRuntime(async (runtime) => {
      const marble = new MarbleGenerationService({
        apiKey: KEY,
        fetch: async (request) => {
          if (request.method === "POST") return json({ operation_id: "op_1", done: false });
          return new Response("boom", { status: 500 });
        },
      });
      const runner = new ProviderCanaryRunner({
        firstGeneration: runtime.firstGeneration!, completion: runtime.operatorCanaryCompletion!, marble,
        hunyuan: new HunyuanGenerationService({ apiKey: KEY, contractProfile: "cloud-response-v1", contractShapeDigest: SHAPE, fetch: async () => json({}) }),
        downloader: { download: async () => glb() },
        now: () => Date.parse("2026-08-20T00:00:00.000Z"),
        createRecordedAt: (() => { let second = 1; return () => `2026-08-20T00:00:${String(second++).padStart(2, "0")}.000Z`; })(),
      });
      const generationId = generationIdFromIdempotencyKey(canary("worldlabs-marble-v1").idempotencyKey);
      const result = await runner.run(canary("worldlabs-marble-v1"));
      expect(result).toMatchObject({ status: "timed-out", generationId });
      const inspection = runtime.firstGeneration!.submitInspect(generationId);
      expect(inspection.status).toBe("present");
      if (inspection.status !== "present") throw new Error("unreachable");
      expect(inspection.current.state).toBe("remote_bound");
    });
  });

  test("Marble contract-mismatch poll returns blocked without a terminal record", async () => {
    await withRuntime(async (runtime) => {
      const marble = new MarbleGenerationService({
        apiKey: KEY,
        fetch: async (request) => {
          if (request.method === "POST") return json({ operation_id: "op_1", done: false });
          return json({ oops: 1 });
        },
      });
      const runner = new ProviderCanaryRunner({
        firstGeneration: runtime.firstGeneration!, completion: runtime.operatorCanaryCompletion!, marble,
        hunyuan: new HunyuanGenerationService({ apiKey: KEY, contractProfile: "cloud-response-v1", contractShapeDigest: SHAPE, fetch: async () => json({}) }),
        downloader: { download: async () => glb() },
        now: () => Date.parse("2026-08-20T00:00:00.000Z"),
        createRecordedAt: (() => { let second = 1; return () => `2026-08-20T00:00:${String(second++).padStart(2, "0")}.000Z`; })(),
      });
      const generationId = generationIdFromIdempotencyKey(canary("worldlabs-marble-v1").idempotencyKey);
      const result = await runner.run(canary("worldlabs-marble-v1"));
      expect(result).toMatchObject({ status: "blocked", generationId });
      const inspection = runtime.firstGeneration!.submitInspect(generationId);
      expect(inspection.status).toBe("present");
      if (inspection.status !== "present") throw new Error("unreachable");
      expect(inspection.current.state).toBe("remote_bound");
    });
  });

  test("Marble terminal failure payload durably appends provider_failed(PROVIDER_REJECTED)", async () => {
    await withRuntime(async (runtime) => {
      const marble = new MarbleGenerationService({
        apiKey: KEY,
        fetch: async (request) => {
          if (request.method === "POST") return json({ operation_id: "op_1", done: false });
          return json({ operation_id: "op_1", done: true, error: { code: 9, message: "boom" } });
        },
      });
      const runner = new ProviderCanaryRunner({
        firstGeneration: runtime.firstGeneration!, completion: runtime.operatorCanaryCompletion!, marble,
        hunyuan: new HunyuanGenerationService({ apiKey: KEY, contractProfile: "cloud-response-v1", contractShapeDigest: SHAPE, fetch: async () => json({}) }),
        downloader: { download: async () => glb() },
        now: () => Date.parse("2026-08-20T00:00:00.000Z"),
        createRecordedAt: (() => { let second = 1; return () => `2026-08-20T00:00:${String(second++).padStart(2, "0")}.000Z`; })(),
      });
      const generationId = generationIdFromIdempotencyKey(canary("worldlabs-marble-v1").idempotencyKey);
      const result = await runner.run(canary("worldlabs-marble-v1"));
      expect(result).toMatchObject({ status: "provider-failed", generationId });
      const inspection = runtime.firstGeneration!.submitInspect(generationId);
      expect(inspection.status).toBe("present");
      if (inspection.status !== "present") throw new Error("unreachable");
      expect(inspection.current.state).toBe("provider_failed");
      expect(inspection.current.payload).toEqual({ code: "PROVIDER_REJECTED" });
    });
  });
});
