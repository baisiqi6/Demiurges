import { describe, expect, test } from "bun:test";
import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  bootstrapDataRoot,
  createGenerationBinding,
  createGenerationIntent,
  createInitialGenerationStateRecord,
  createNextGenerationStateRecord,
  generationStateRecordFilename,
  openWorldProjectRuntime,
  requireGenerationRequest,
  type GenerationIntentV1,
  type WorldProjectFirstGenerationFacade,
} from "@demiurges/world-project";

import { HunyuanGenerationService } from "./hunyuan-generation-service";
import { MarbleGenerationService } from "./marble-generation-service";
import { ProviderSubmitOrchestrator } from "./provider-submit-orchestrator";

const FAKE_API_KEY = "test-orchestrator-api-key-never-log";
const SHAPE_DIGEST = "a".repeat(64);
const OPERATION_ID = "marble_operation_1";
const JOB_ID = "123456";
const REQUEST_ID = "123e4567-e89b-42d3-a456-426614174000";

function marbleIntent(key: string): GenerationIntentV1 {
  return createGenerationIntent(createGenerationBinding(requireGenerationRequest({
    provider: "worldlabs-marble-v1",
    model: "marble-1.1",
    prompt: "a mossy stone arch",
    costUnknownAccepted: true,
    waitForCompletionAndDownload: true,
    idempotencyKey: key,
  }), {
    contractProfile: "worldlabs-openapi-2026-08-15-v1",
    contractShapeDigest: SHAPE_DIGEST,
  }), "2026-08-15T10:00:00.000Z");
}

function hunyuanIntent(key: string): GenerationIntentV1 {
  return createGenerationIntent(createGenerationBinding(requireGenerationRequest({
    provider: "hunyuan-ai3d-v1",
    model: "3.1",
    prompt: "a mossy stone arch",
    costUnknownAccepted: true,
    waitForCompletionAndDownload: true,
    idempotencyKey: key,
  }), {
    contractProfile: "cloud-response-v1",
    contractShapeDigest: SHAPE_DIGEST,
  }), "2026-08-15T10:00:00.000Z");
}

function json(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), { status });
}

function marblePending(): Response {
  return json({ operation_id: OPERATION_ID, done: false });
}

function hunyuanSuccess(): Response {
  return json({ Response: { JobId: JOB_ID, RequestId: REQUEST_ID } });
}

function clock(): () => string {
  let seconds = 1;
  return () => `2026-08-15T10:00:${String(seconds++).padStart(2, "0")}.000Z`;
}

interface OrchestratorContext {
  readonly facade: WorldProjectFirstGenerationFacade;
  readonly rootPath: string;
  readonly close: () => Promise<void>;
}

async function withOrchestrator(
  run: (context: OrchestratorContext) => Promise<void>,
): Promise<void> {
  const parent = mkdtempSync(join(tmpdir(), "dh017-submit-orchestrator-"));
  const rootPath = join(parent, "root");
  bootstrapDataRoot(rootPath);
  const runtime = await openWorldProjectRuntime(rootPath);
  try {
    await run({ facade: runtime.firstGeneration!, rootPath, close: () => runtime.close() });
  } finally {
    await runtime.close();
    rmSync(parent, { recursive: true, force: true });
  }
}

function admit(ctx: OrchestratorContext, durableIntent: GenerationIntentV1): void {
  const result = ctx.facade.admit(durableIntent);
  expect(result).toMatchObject({ status: "admitted", birthStatus: "born" });
}

function marbleService(
  fetch: (request: Request) => Promise<Response>,
): MarbleGenerationService {
  return new MarbleGenerationService({
    apiKey: FAKE_API_KEY,
    fetch,
  });
}

function hunyuanService(
  fetch: (request: Request) => Promise<Response>,
  shapeDigest = SHAPE_DIGEST,
): HunyuanGenerationService {
  return new HunyuanGenerationService({
    apiKey: FAKE_API_KEY,
    contractProfile: "cloud-response-v1",
    contractShapeDigest: shapeDigest,
    fetch,
  });
}

function neverFetch(): Promise<Response> {
  throw new Error("unexpected provider fetch");
}

function recordsOf(ctx: OrchestratorContext, durableIntent: GenerationIntentV1): string[] {
  const digest = durableIntent.generationId.slice("generation:sha256:".length);
  return readdirSync(join(
    ctx.rootPath,
    "receipts",
    "generations",
    "data",
    digest,
    "records",
  )).sort();
}

function orchestrator(
  ctx: OrchestratorContext,
  marble: MarbleGenerationService,
  hunyuan: HunyuanGenerationService,
): ProviderSubmitOrchestrator {
  return new ProviderSubmitOrchestrator({
    firstGeneration: ctx.facade,
    marble,
    hunyuan,
    createRecordedAt: clock(),
  });
}

describe("ProviderSubmitOrchestrator", () => {
  test("Marble trustworthy submit response produces one exact remote_bound; retry is zero-fetch read-only replay", async () => {
    await withOrchestrator(async (ctx) => {
      const durableIntent = marbleIntent("marble-happy");
      admit(ctx, durableIntent);
      const requests: Request[] = [];
      const submit = orchestrator(ctx, marbleService(async (request) => {
        requests.push(request);
        return marblePending();
      }), hunyuanService(neverFetch));
      const result = await submit.submit(durableIntent.generationId);
      expect(result).toMatchObject({
        status: "submitted",
        record: {
          state: "remote_bound",
          sequence: 2,
          payload: {
            provider: "worldlabs-marble-v1",
            remoteJobId: OPERATION_ID,
            providerRequestId: null,
          },
        },
      });
      expect(requests).toHaveLength(1);
      expect(requests[0]!.url).toBe("https://api.worldlabs.ai/marble/v1/worlds:generate");
      const before = recordsOf(ctx, durableIntent);
      const replay = await submit.submit(durableIntent.generationId);
      expect(replay).toMatchObject({ status: "replay", record: { state: "remote_bound", sequence: 2 } });
      expect(requests).toHaveLength(1);
      expect(recordsOf(ctx, durableIntent)).toEqual(before);
    });
  });

  test("Hunyuan trustworthy submit response produces one exact remote_bound; retry is zero-fetch replay", async () => {
    await withOrchestrator(async (ctx) => {
      const durableIntent = hunyuanIntent("hunyuan-happy");
      admit(ctx, durableIntent);
      const requests: Request[] = [];
      const submit = orchestrator(ctx, marbleService(neverFetch), hunyuanService(async (request) => {
        requests.push(request);
        return hunyuanSuccess();
      }));
      const result = await submit.submit(durableIntent.generationId);
      expect(result).toMatchObject({
        status: "submitted",
        record: {
          state: "remote_bound",
          sequence: 2,
          payload: {
            provider: "hunyuan-ai3d-v1",
            remoteJobId: JOB_ID,
            providerRequestId: REQUEST_ID,
          },
        },
      });
      expect(requests).toHaveLength(1);
      expect(requests[0]!.url).toBe("https://api.ai3d.cloud.tencent.com/v1/ai3d/submit");
      const before = recordsOf(ctx, durableIntent);
      expect(await submit.submit(durableIntent.generationId))
        .toMatchObject({ status: "replay", record: { state: "remote_bound", sequence: 2 } });
      expect(requests).toHaveLength(1);
      expect(recordsOf(ctx, durableIntent)).toEqual(before);
    });
  });

  test("Marble documented payment rejection is durable and replays without another fetch", async () => {
    await withOrchestrator(async (ctx) => {
      const durableIntent = marbleIntent("marble-payment-rejected");
      admit(ctx, durableIntent);
      const requests: Request[] = [];
      const submit = orchestrator(ctx, marbleService(async (request) => {
        requests.push(request);
        return new Response("payment required", { status: 402 });
      }), hunyuanService(neverFetch));
      const result = await submit.submit(durableIntent.generationId);
      expect(result).toMatchObject({
        status: "provider-failed",
        record: { state: "provider_failed", payload: { code: "PROVIDER_PAYMENT_REQUIRED" } },
      });
      expect(await submit.submit(durableIntent.generationId))
        .toMatchObject({ status: "replay", record: { state: "provider_failed" } });
      expect(requests).toHaveLength(1);
    });
  });

  test("Marble transient response becomes ambiguous after its single fetch", async () => {
    await withOrchestrator(async (ctx) => {
      const durableIntent = marbleIntent("marble-transient");
      admit(ctx, durableIntent);
      const requests: Request[] = [];
      const submit = orchestrator(ctx, marbleService(async (request) => {
        requests.push(request);
        return new Response("upstream", { status: 500 });
      }), hunyuanService(neverFetch));
      const result = await submit.submit(durableIntent.generationId);
      expect(result).toMatchObject({
        status: "ambiguous",
        record: { state: "submission_ambiguous", payload: { code: "PROVIDER_SUBMISSION_AMBIGUOUS" } },
      });
      expect(requests).toHaveLength(1);
    });
  });

  test("Hunyuan non-success never borrows Marble's provider-failed classification", async () => {
    await withOrchestrator(async (ctx) => {
      const durableIntent = hunyuanIntent("hunyuan-rejected");
      admit(ctx, durableIntent);
      const requests: Request[] = [];
      const submit = orchestrator(ctx, marbleService(neverFetch), hunyuanService(async (request) => {
        requests.push(request);
        return new Response("{}", { status: 400 });
      }));
      const result = await submit.submit(durableIntent.generationId);
      expect(result).toMatchObject({
        status: "ambiguous",
        record: { state: "submission_ambiguous", payload: { code: "PROVIDER_SUBMISSION_AMBIGUOUS" } },
      });
      expect(requests).toHaveLength(1);
    });
  });

  test("local binding/profile mismatch ends at exact pre_submit_blocked(PROVIDER_CONTRACT_MISMATCH) before submit_started with zero fetch", async () => {
    await withOrchestrator(async (ctx) => {
      const durableIntent = hunyuanIntent("hunyuan-mismatch");
      admit(ctx, durableIntent);
      const requests: Request[] = [];
      const submit = orchestrator(
        ctx,
        marbleService(neverFetch),
        hunyuanService(async (request) => {
          requests.push(request);
          return hunyuanSuccess();
        }, "b".repeat(64)),
      );
      const result = await submit.submit(durableIntent.generationId);
      expect(result).toMatchObject({
        status: "blocked",
        replay: false,
        record: {
          state: "pre_submit_blocked",
          sequence: 1,
          payload: { code: "PROVIDER_CONTRACT_MISMATCH", preSubmitResumeCount: 0 },
        },
      });
      expect(requests).toHaveLength(0);
      const names = recordsOf(ctx, durableIntent);
      // 唯一两条 record：admitted + pre_submit_blocked；submit_started 永不出现。
      const admittedRecord = createInitialGenerationStateRecord(durableIntent);
      const blockedRecord = createNextGenerationStateRecord(
        durableIntent,
        admittedRecord,
        "pre_submit_blocked",
        { code: "PROVIDER_CONTRACT_MISMATCH", preSubmitResumeCount: 0 },
        "2026-08-15T10:00:01.000Z",
      );
      expect(names).toEqual([
        generationStateRecordFilename(admittedRecord),
        generationStateRecordFilename(blockedRecord),
      ]);
      // 同 mismatch 重试：read-only replay，零 fetch、零新 record。
      const before = recordsOf(ctx, durableIntent);
      const replay = await submit.submit(durableIntent.generationId);
      expect(replay).toMatchObject({ status: "replay", record: { state: "pre_submit_blocked", sequence: 1 } });
      expect(requests).toHaveLength(0);
      expect(recordsOf(ctx, durableIntent)).toEqual(before);
    });
  });

  test("crash after durable submit_started but before fetch restarts as ambiguous with zero additional fetch", async () => {
    await withOrchestrator(async (ctx) => {
      const durableIntent = marbleIntent("marble-crash-before-fetch");
      admit(ctx, durableIntent);
      // 模拟更早进程 checkpoint(ready) 后、fetch 前崩溃：submit_started durable。
      const checkpoint = ctx.facade.checkpoint({
        generationId: durableIntent.generationId,
        recordedAt: "2026-08-15T10:00:01.000Z",
        decision: { kind: "ready" },
      });
      expect(checkpoint).toMatchObject({ status: "ready", replay: false });
      const requests: Request[] = [];
      const submit = orchestrator(ctx, marbleService(async (request) => {
        requests.push(request);
        return marblePending();
      }), hunyuanService(neverFetch));
      const result = await submit.submit(durableIntent.generationId);
      expect(result).toMatchObject({
        status: "ambiguous",
        record: {
          state: "submission_ambiguous",
          sequence: 2,
          payload: { code: "PROVIDER_SUBMISSION_AMBIGUOUS" },
        },
      });
      expect(requests).toHaveLength(0);
      // 再次调用：terminal replay，零 fetch。
      expect(await submit.submit(durableIntent.generationId))
        .toMatchObject({ status: "replay", record: { state: "submission_ambiguous", sequence: 2 } });
      expect(requests).toHaveLength(0);
    });
  });

  test("crash after fake fetch but before durable outcome restarts as ambiguous with submit count unchanged", async () => {
    await withOrchestrator(async (ctx) => {
      const durableIntent = marbleIntent("marble-crash-after-fetch");
      admit(ctx, durableIntent);
      const requests: Request[] = [];
      let clockCalls = 0;
      const submit = new ProviderSubmitOrchestrator({
        firstGeneration: ctx.facade,
        marble: marbleService(async (request) => {
          requests.push(request);
          return marblePending();
        }),
        hunyuan: hunyuanService(neverFetch),
        createRecordedAt: () => {
          clockCalls += 1;
          // 第一次调用是 checkpoint recordedAt（有效）；第二次是 submitResult
          // recordedAt——注入非法时间戳，等价于 fetch 后、durable outcome 前
          // 进程崩溃（fetch 已发生，outcome 未落盘）。
          return clockCalls === 2
            ? "not-a-timestamp"
            : "2026-08-15T10:00:01.000Z";
        },
      });
      await expect(submit.submit(durableIntent.generationId)).rejects
        .toThrow("GENERATION_RECOVERY_REQUIRED");
      expect(requests).toHaveLength(1);
      // 重启（新 orchestrator）：restart 为 ambiguous，fetch 数保持 1。
      const restart = orchestrator(ctx, marbleService(async (request) => {
        requests.push(request);
        return marblePending();
      }), hunyuanService(neverFetch));
      const result = await restart.submit(durableIntent.generationId);
      expect(result).toMatchObject({
        status: "ambiguous",
        record: { state: "submission_ambiguous", sequence: 2 },
      });
      expect(requests).toHaveLength(1);
    });
  });

  test("concurrent same-generation calls yield one fake submit at most", async () => {
    await withOrchestrator(async (ctx) => {
      const durableIntent = marbleIntent("marble-concurrent");
      admit(ctx, durableIntent);
      let release!: () => void;
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      const requests: Request[] = [];
      const submit = orchestrator(ctx, marbleService(async (request) => {
        requests.push(request);
        await gate;
        return marblePending();
      }), hunyuanService(neverFetch));
      const first = submit.submit(durableIntent.generationId);
      // first 的 checkpoint 与 fetch 已在同步前缀内启动；second 只能 replay。
      const second = await submit.submit(durableIntent.generationId);
      expect(second).toMatchObject({
        status: "ambiguous",
        record: { state: "submission_ambiguous", sequence: 2 },
      });
      release();
      // first 的 durable outcome 与已收束的 ambiguous 冲突：fail closed，
      // 不产生第二条 successor。
      await expect(first).rejects.toThrow("GENERATION_RECOVERY_REQUIRED");
      expect(requests).toHaveLength(1);
      const names = recordsOf(ctx, durableIntent);
      expect(names).toHaveLength(3);
      expect(names[2]!).toMatch(/^0000000000000002-/);
    });
  });

  test("absent/unknown generation returns absent with zero provider calls", async () => {
    await withOrchestrator(async (ctx) => {
      const requests: Request[] = [];
      const submit = orchestrator(ctx, marbleService(async (request) => {
        requests.push(request);
        return marblePending();
      }), hunyuanService(neverFetch));
      expect(await submit.submit(`generation:sha256:${"f".repeat(64)}`))
        .toEqual({ status: "absent" });
      expect(requests).toHaveLength(0);
    });
  });
});
