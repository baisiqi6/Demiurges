import { describe, expect, test } from "bun:test";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import {
  bootstrapDataRoot,
  createGenerationBinding,
  createGenerationIntent,
  openWorldProjectRuntime,
  requireGenerationRequest,
  type WorldProjectFirstGenerationFacade,
} from "@demiurges/world-project";

import {
  GENERATION_ADMISSION_API_TEST_SEAMS,
  createGenerationAdmissionApi,
  resolveGenerationContractConfig,
  type GenerationContractConfigV1,
} from "./generation-admission-api";
import { GenerationConfirmationStore } from "./generation-confirmation";

const MARBLE_CONTRACT: GenerationContractConfigV1 = {
  provider: "worldlabs-marble-v1",
  contractProfile: "worldlabs-openapi-2026-08-15-v1",
  contractShapeDigest: "a".repeat(64),
};
const HUNYUAN_CONTRACT: GenerationContractConfigV1 = {
  provider: "hunyuan-ai3d-v1",
  contractProfile: "cloud-response-v1",
  contractShapeDigest: "b".repeat(64),
};

function prepareBody(
  key: string,
  prompt = "a bronze compass",
  provider: "worldlabs-marble-v1" | "hunyuan-ai3d-v1" = "worldlabs-marble-v1",
): Record<string, unknown> {
  return provider === "worldlabs-marble-v1"
    ? {
        provider,
        model: "marble-1.1",
        prompt,
        costUnknownAccepted: true,
        waitForCompletionAndDownload: true,
        idempotencyKey: key,
      }
    : {
        provider,
        model: "3.1",
        prompt,
        costUnknownAccepted: true,
        waitForCompletionAndDownload: true,
        idempotencyKey: key,
      };
}

interface AdmissionContext {
  readonly api: ReturnType<typeof createGenerationAdmissionApi>;
  readonly confirmations: GenerationConfirmationStore;
  readonly runtime: Awaited<ReturnType<typeof openWorldProjectRuntime>>;
  readonly rootPath: string;
  readonly facade: WorldProjectFirstGenerationFacade;
  advance(milliseconds: number): void;
}

async function withAdmission(
  run: (context: AdmissionContext) => Promise<void>,
  contract: GenerationContractConfigV1 | null = MARBLE_CONTRACT,
): Promise<AdmissionContext> {
  const parent = mkdtempSync(join(tmpdir(), "dh017-admission-api-"));
  const rootPath = join(parent, "root");
  bootstrapDataRoot(rootPath);
  const runtime = await openWorldProjectRuntime(rootPath);
  let monotonic = 1_000;
  let wall = Date.parse("2026-08-15T10:00:00.000Z");
  let sequence = 0;
  const confirmations = new GenerationConfirmationStore({
    monotonicNowMs: () => monotonic,
    wallNowMs: () => wall,
    nextConfirmationId: () => `confirmation:test-${++sequence}`,
  });
  const sessions = new Set<string>(["session:alpha", "session:beta"]);
  const api = createGenerationAdmissionApi({
    confirmations,
    firstGeneration: runtime.firstGeneration,
    contract: contract ?? undefined,
    clock: () => "2026-08-15T10:00:00.000Z",
    bodyTimeoutMs: 5_000,
    hasSession: (sessionId) => sessions.has(sessionId),
  });
  const context: AdmissionContext = {
    api,
    confirmations,
    runtime,
    rootPath,
    facade: runtime.firstGeneration!,
    advance(milliseconds: number) {
      monotonic += milliseconds;
      wall += milliseconds;
    },
  };
  try {
    await run(context);
    return context;
  } finally {
    await runtime.close();
    rmSync(parent, { recursive: true, force: true });
  }
}

function prepareRequest(
  sessionId: string,
  body: string,
  init: { method?: string; headers?: Record<string, string> } = {},
): Request {
  return new Request(
    `http://local.test/api/sessions/${sessionId}/generations/prepare`,
    {
      method: init.method ?? "POST",
      headers: { "content-type": "application/json", ...(init.headers ?? {}) },
      body,
      duplex: "half",
    } as RequestInit & { duplex: "half" },
  );
}

function confirmRequest(
  sessionId: string,
  generationId: string,
  body: string,
  init: { method?: string; signal?: AbortSignal } = {},
): Request {
  return new Request(
    `http://local.test/api/sessions/${sessionId}/generations/${generationId}/confirm`,
    {
      method: init.method ?? "POST",
      headers: { "content-type": "application/json" },
      body,
      signal: init.signal,
      duplex: "half",
    } as RequestInit & { duplex: "half" },
  );
}

interface PreparedResponseV1 {
  readonly schemaVersion: 1;
  readonly confirmationId: string;
  readonly sessionId: string;
  readonly generationId: string;
  readonly provider: string;
  readonly model: string;
  readonly requestDigest: string;
  readonly expiresAt: string;
  readonly preview: { readonly prompt: string; readonly seed?: number };
}

interface ConfirmedResponseV1 {
  readonly schemaVersion: 1;
  readonly status: string;
  readonly generationId: string;
  readonly sequence: number;
  readonly recordedAt: string;
  readonly replayed: boolean;
  readonly binding: {
    readonly provider: string;
    readonly model: string;
    readonly requestDigest: string;
    readonly contractProfile: string;
    readonly contractShapeDigest: string;
    readonly bindingDigest: string;
    readonly createdAt: string;
  };
}

// helper 是测试侧单一转换点；字段形状由各测试逐项断言。
async function preparedPayload(response: Response): Promise<PreparedResponseV1> {
  return await response.json() as PreparedResponseV1;
}

async function confirmedPayload(response: Response): Promise<ConfirmedResponseV1> {
  return await response.json() as ConfirmedResponseV1;
}

async function prepareVia(
  context: AdmissionContext,
  sessionId = "session:alpha",
  body = prepareBody("admission-happy"),
): Promise<{ response: Response; body: PreparedResponseV1 }> {
  const response = await fetchRoute(context.api,
    prepareRequest(sessionId, JSON.stringify(body)),
  );
  return { response, body: await preparedPayload(response) };
}

async function confirmVia(
  context: AdmissionContext,
  sessionId: string,
  generationId: string,
  confirmationId: string,
  requestDigest: string,
  init: { method?: string; signal?: AbortSignal } = {},
): Promise<{ response: Response; body: ConfirmedResponseV1 }> {
  const response = await fetchRoute(context.api,
    confirmRequest(
      sessionId,
      generationId,
      JSON.stringify({ confirmationId, requestDigest }),
      init,
    ),
  );
  return { response, body: await confirmedPayload(response) };
}

async function fetchRoute(
  api: ReturnType<typeof createGenerationAdmissionApi>,
  request: Request,
): Promise<Response> {
  const response = await api.fetch(request);
  if (response === undefined) throw new Error("unexpected route miss");
  return response;
}

/** 错误路径专用：body 只读一次，返回 status + raw JSON。 */
async function confirmError(
  context: AdmissionContext,
  sessionId: string,
  generationId: string,
  confirmationId: string,
  requestDigest: string,
): Promise<{ status: number; body: unknown }> {
  const response = await fetchRoute(context.api,
    confirmRequest(
      sessionId,
      generationId,
      JSON.stringify({ confirmationId, requestDigest }),
    ),
  );
  return { status: response.status, body: await response.json() };
}

function snapshot(path: string, prefix = ""): readonly string[] {
  const entries: string[] = [];
  for (const entry of readdirSync(path, { withFileTypes: true }).sort((a, b) =>
    a.name.localeCompare(b.name))) {
    const name = `${prefix}${entry.name}`;
    entries.push(`${name}:${entry.isDirectory() ? "d" : "f"}`);
    if (entry.isDirectory()) entries.push(...snapshot(join(path, entry.name), `${name}/`));
  }
  return entries;
}

describe("Generation admission API", () => {
  test("prepare 返回 safe preview 且零 Data Root mutation、零 confirmation 泄漏", async () => {
    await withAdmission(async (context) => {
      const before = snapshot(join(context.rootPath, "receipts"));
      const { response, body } = await prepareVia(context);
      expect(response.status).toBe(201);
      expect(body.schemaVersion).toBe(1);
      expect(body.sessionId).toBe("session:alpha");
      expect(body.provider).toBe("worldlabs-marble-v1");
      expect(body.model).toBe("marble-1.1");
      expect(body.generationId).toMatch(/^generation:sha256:[a-f0-9]{64}$/);
      expect(body.requestDigest).toMatch(/^[a-f0-9]{64}$/);
      expect(body.expiresAt).toBe("2026-08-15T10:10:00.000Z");
      expect(body.preview).toEqual({ prompt: "a bronze compass" });
      expect(body).not.toHaveProperty("idempotencyKey");
      expect(body).not.toHaveProperty("providerRequest");
      expect(body).not.toHaveProperty("contractProfile");
      expect(body).not.toHaveProperty("contractShapeDigest");
      expect(context.confirmations.size).toBe(1);
      expect(snapshot(join(context.rootPath, "receipts"))).toEqual(before);
    });
  });

  test("prepare 拒绝错误 media type / 非 JSON / duplicate key / unknown key / false flags", async () => {
    await withAdmission(async (context) => {
      const cases: { body: string; headers?: Record<string, string>; code: string }[] = [
        { body: JSON.stringify(prepareBody("media")), headers: { "content-type": "text/plain" }, code: "UNSUPPORTED_MEDIA_TYPE" },
        { body: "not json", code: "INVALID_REQUEST" },
        {
          body: '{"provider":"worldlabs-marble-v1","provider":"hunyuan-ai3d-v1",' +
            '"model":"marble-1.1","prompt":"dup","costUnknownAccepted":true,' +
            '"waitForCompletionAndDownload":true,"idempotencyKey":"dup-key"}',
          code: "INVALID_REQUEST",
        },
        { body: JSON.stringify({ ...prepareBody("unknown"), extra: 1 }), code: "INVALID_REQUEST" },
        { body: JSON.stringify({ ...prepareBody("flags"), costUnknownAccepted: false }), code: "INVALID_REQUEST" },
        { body: JSON.stringify({ ...prepareBody("flags"), waitForCompletionAndDownload: false }), code: "INVALID_REQUEST" },
        { body: JSON.stringify({ ...prepareBody("flags-missing"), costUnknownAccepted: undefined, waitForCompletionAndDownload: undefined }), code: "INVALID_REQUEST" },
        { body: JSON.stringify({ ...prepareBody("spoof"), sessionId: "session:beta" }), code: "INVALID_REQUEST" },
      ];
      for (const entry of cases) {
        const response = await fetchRoute(context.api,
          prepareRequest("session:alpha", entry.body, { headers: entry.headers }),
        );
        expect(response.status).toBe(
          entry.code === "UNSUPPORTED_MEDIA_TYPE" ? 415 : 400,
        );
        expect(await response.json()).toEqual({ error: entry.code });
      }
      expect(context.confirmations.size).toBe(0);
      expect(snapshot(join(context.rootPath, "receipts"))).toEqual([]);
    });
  });

  test("prepare 拒绝 oversize body 为 413 且不创建 confirmation", async () => {
    await withAdmission(async (context) => {
      const response = await fetchRoute(context.api,
        prepareRequest("session:alpha", JSON.stringify(prepareBody("big", "x".repeat(17 * 1024)))),
      );
      expect(response.status).toBe(413);
      expect(await response.json()).toEqual({ error: "REQUEST_TOO_LARGE" });
      expect(context.confirmations.size).toBe(0);
    });
  });

  test("prepare 缺失/foreign session 或错误 session pattern 拒绝且零 mutation", async () => {
    await withAdmission(async (context) => {
      const missing = await fetchRoute(context.api,
        prepareRequest("session:ghost", JSON.stringify(prepareBody("missing"))),
      );
      expect(missing.status).toBe(404);
      expect(await missing.json()).toEqual({ error: "SESSION_NOT_FOUND" });

      const encodedSlash = await fetchRoute(context.api,
        prepareRequest("session%3Aalpha%2F..", JSON.stringify(prepareBody("slash"))),
      );
      expect(encodedSlash.status).toBe(400);
      expect(await encodedSlash.json()).toEqual({ error: "INVALID_REQUEST" });

      const badPattern = await fetchRoute(context.api,
        prepareRequest("alpha", JSON.stringify(prepareBody("pattern"))),
      );
      expect(badPattern.status).toBe(400);
      expect(await badPattern.json()).toEqual({ error: "INVALID_REQUEST" });

      expect(context.confirmations.size).toBe(0);
      expect(snapshot(join(context.rootPath, "receipts"))).toEqual([]);
    });
  });

  test("header/cookie/query session 值不能覆盖 route identity", async () => {
    await withAdmission(async (context) => {
      const body = JSON.stringify(prepareBody("spoof-session"));
      const response = await fetchRoute(context.api,
        new Request(
          "http://local.test/api/sessions/session:alpha/generations/prepare?sessionId=session:beta",
          {
            method: "POST",
            headers: {
              "content-type": "application/json",
              "x-session-id": "session:beta",
              cookie: "sessionId=session:beta",
            },
            body,
            duplex: "half",
          } as RequestInit & { duplex: "half" },
        ),
      );
      expect(response.status).toBe(201);
      const payload = await preparedPayload(response);
      expect(payload.sessionId).toBe("session:alpha");

      const confirmed = await confirmVia(
        context,
        "session:alpha",
        payload.generationId,
        payload.confirmationId,
        payload.requestDigest,
      );
      expect(confirmed.response.status).toBe(200);
    });
  });

  test("无注入 contract 时 prepare 稳定 PROVIDER_CONTRACT_MISMATCH 且零 confirmation", async () => {
    await withAdmission(async (context) => {
      const response = await fetchRoute(context.api,
        prepareRequest("session:alpha", JSON.stringify(prepareBody("admission-happy"))),
      );
      expect(response.status).toBe(409);
      expect(await response.json()).toEqual({ error: "PROVIDER_CONTRACT_MISMATCH" });
      expect(context.confirmations.size).toBe(0);
      expect(snapshot(join(context.rootPath, "receipts"))).toEqual([]);
    }, null);
  });

  test("GET prepare 为 405，非 generation route 返回 undefined", async () => {
    await withAdmission(async (context) => {
      const response = await fetchRoute(context.api,
        prepareRequest("session:alpha", JSON.stringify(prepareBody("get")), { method: "GET" }),
      );
      expect(response.status).toBe(405);
      expect(await response.json()).toEqual({ error: "METHOD_NOT_ALLOWED" });

      expect(await context.api.fetch(new Request(
        "http://local.test/api/sessions/session:alpha",
      ))).toBeUndefined();
      expect(await context.api.fetch(new Request(
        "http://local.test/api/sessions/session:alpha/turns",
      ))).toBeUndefined();
    });
  });

  test("confirm leader 原子消费 token 并 durably birth，intent 与 record exact", async () => {
    await withAdmission(async (context) => {
      const prepared = requireGenerationRequest(prepareBody("admission-exact"));
      const { body: preparedPayload } = await prepareVia(context, "session:alpha", prepareBody("admission-exact"));
      const { response, body } = await confirmVia(
        context,
        "session:alpha",
        preparedPayload.generationId,
        preparedPayload.confirmationId,
        preparedPayload.requestDigest,
      );
      expect(response.status).toBe(200);
      expect(body.schemaVersion).toBe(1);
      expect(body.status).toBe("admitted");
      expect(body.generationId).toBe(prepared.generationId);
      expect(body.sequence).toBe(0);
      expect(body.recordedAt).toBe("2026-08-15T10:00:00.000Z");
      expect(body.replayed).toBe(false);
      expect(body.binding).toEqual({
        provider: "worldlabs-marble-v1",
        model: "marble-1.1",
        requestDigest: prepared.requestDigest,
        contractProfile: "worldlabs-openapi-2026-08-15-v1",
        contractShapeDigest: "a".repeat(64),
        bindingDigest: expect.any(String),
        createdAt: "2026-08-15T10:00:00.000Z",
      });
      expect(context.confirmations.size).toBe(0);

      const digest = prepared.generationId.slice("generation:sha256:".length);
      const catalog = join(context.rootPath, "receipts", "generations", "catalog");
      expect(readdirSync(catalog)).toEqual([`${digest}.json`]);
      const expectedIntent = createGenerationIntent(
        createGenerationBinding(prepared, MARBLE_CONTRACT),
        "2026-08-15T10:00:00.000Z",
      );
      const intentPath = join(
        context.rootPath,
        "receipts",
        "generations",
        "data",
        digest,
        "intent.json",
      );
      expect(JSON.parse(readFileSync(intentPath, "utf8"))).toEqual(expectedIntent);
      expect(context.facade.inspect(prepared.generationId)).toEqual({
        status: "admitted",
        intent: expectedIntent,
        current: expect.objectContaining({ state: "admitted", sequence: 0 }),
      });
    });
  });

  test("confirm route/body 权威性：foreign session、错误 generation、错误 digest、伪造 id 均不消费 token", async () => {
    await withAdmission(async (context) => {
      const { body: token } = await prepareVia(context, "session:alpha", prepareBody("adverse"));
      const otherGeneration = requireGenerationRequest(prepareBody("adverse-other")).generationId;

      // 已存在但 foreign 的 session 拿到同 binding token：稳定 CONFIRMATION_REQUIRED 且不消费原 token。
      const foreign = await confirmError(
        context, "session:beta", token.generationId, token.confirmationId, token.requestDigest,
      );
      expect(foreign).toEqual({ status: 409, body: { error: "CONFIRMATION_REQUIRED" } });

      const missingSession = await fetchRoute(context.api,
        confirmRequest(
          "session:ghost",
          token.generationId,
          JSON.stringify({ confirmationId: token.confirmationId, requestDigest: token.requestDigest }),
        ),
      );
      expect(missingSession.status).toBe(404);
      expect(await missingSession.json()).toEqual({ error: "SESSION_NOT_FOUND" });

      const wrongGeneration = await confirmError(
        context, "session:alpha", otherGeneration, token.confirmationId, token.requestDigest,
      );
      expect(wrongGeneration).toEqual({ status: 409, body: { error: "CONFIRMATION_REQUIRED" } });

      const wrongDigest = await confirmError(
        context, "session:alpha", token.generationId, token.confirmationId, "c".repeat(64),
      );
      expect(wrongDigest).toEqual({ status: 409, body: { error: "CONFIRMATION_REQUIRED" } });

      const forged = await confirmError(
        context, "session:alpha", token.generationId, "confirmation:forged-1", token.requestDigest,
      );
      expect(forged).toEqual({ status: 409, body: { error: "CONFIRMATION_REQUIRED" } });

      expect(context.confirmations.size).toBe(1);
      expect(context.facade.inspect(token.generationId)).toEqual({ status: "absent" });
    });
  });

  test("confirm body duplicate key / unknown key / bad pattern 为 400 且零 mutation", async () => {
    await withAdmission(async (context) => {
      const generationId = requireGenerationRequest(prepareBody("dup-confirm")).generationId;
      const cases = [
        '{"confirmationId":"confirmation:test-1","confirmationId":"confirmation:test-2","requestDigest":"' + "a".repeat(64) + '"}',
        JSON.stringify({ confirmationId: "confirmation:test-1", requestDigest: "a".repeat(64), sessionId: "session:beta" }),
        JSON.stringify({ confirmationId: "not-a-confirmation", requestDigest: "a".repeat(64) }),
        JSON.stringify({ confirmationId: "confirmation:test-1", requestDigest: "not-hex" }),
      ];
      for (const body of cases) {
        const response = await fetchRoute(context.api,
          confirmRequest("session:alpha", generationId, body),
        );
        expect(response.status).toBe(400);
        expect(await response.json()).toEqual({ error: "INVALID_REQUEST" });
      }
      expect(context.confirmations.size).toBe(0);
      expect(snapshot(join(context.rootPath, "receipts"))).toEqual([]);
    });
  });

  test("过期 confirmation 为 410，且已消费无 durable binding 为 409", async () => {
    await withAdmission(async (context) => {
      const { body: token } = await prepareVia(context, "session:alpha", prepareBody("expiry"));
      context.advance(10 * 60 * 1_000 + 1);
      const expired = await confirmError(
        context, "session:alpha", token.generationId, token.confirmationId, token.requestDigest,
      );
      expect(expired).toEqual({ status: 410, body: { error: "CONFIRMATION_EXPIRED" } });

      const { body: second } = await prepareVia(context, "session:alpha", prepareBody("preconsumed"));
      context.confirmations.consume("session:alpha", second.generationId, {
        confirmationId: second.confirmationId,
        requestDigest: second.requestDigest,
      });
      const consumed = await confirmError(
        context, "session:alpha", second.generationId, second.confirmationId, second.requestDigest,
      );
      expect(consumed).toEqual({ status: 409, body: { error: "CONFIRMATION_REQUIRED" } });
      expect(context.facade.inspect(second.generationId)).toEqual({ status: "absent" });
    });
  });

  test("admitted 后同 key/same binding 用已消费 id 可 replay；fresh store 同样 replay", async () => {
    await withAdmission(async (context) => {
      const { body: token } = await prepareVia(context, "session:alpha", prepareBody("replay"));
      const first = await confirmVia(
        context, "session:alpha", token.generationId, token.confirmationId, token.requestDigest,
      );
      expect(first.body.replayed).toBe(false);

      const second = await confirmVia(
        context, "session:alpha", token.generationId, token.confirmationId, token.requestDigest,
      );
      expect(second.response.status).toBe(200);
      expect(second.body.replayed).toBe(true);
      expect(second.body.status).toBe("admitted");
      expect(second.body.sequence).toBe(0);
      expect(second.body.generationId).toBe(token.generationId);

      const freshStore = new GenerationConfirmationStore({
        nextConfirmationId: () => "confirmation:fresh-1",
      });
      const freshApi = createGenerationAdmissionApi({
        confirmations: freshStore,
        firstGeneration: context.runtime.firstGeneration,
        contract: MARBLE_CONTRACT,
        clock: () => "2026-08-15T10:00:00.000Z",
        hasSession: () => true,
      });
      const fresh = await fetchRoute(freshApi,
        confirmRequest(
          "session:alpha",
          token.generationId,
          JSON.stringify({ confirmationId: token.confirmationId, requestDigest: token.requestDigest }),
        ),
      );
      expect(fresh!.status).toBe(200);
      const freshBody = await confirmedPayload(fresh!);
      expect(freshBody.replayed).toBe(true);
      expect(freshStore.size).toBe(0);
      expect(readdirSync(join(context.rootPath, "receipts", "generations", "catalog")))
        .toHaveLength(1);
    });
  });

  test("同 generationId 不同 request 是 OPERATION_BINDING_CONFLICT 且不消费新 token", async () => {
    await withAdmission(async (context) => {
      const first = await prepareVia(context, "session:alpha", prepareBody("conflict-key", "first prompt"));
      const firstConfirm = await confirmVia(
        context, "session:alpha", first.body.generationId, first.body.confirmationId, first.body.requestDigest,
      );
      expect(firstConfirm.response.status).toBe(200);

      const second = await prepareVia(context, "session:alpha", prepareBody("conflict-key", "second prompt"));
      expect(second.body.generationId).toBe(first.body.generationId);
      expect(second.body.requestDigest).not.toBe(first.body.requestDigest);
      const secondConfirm = await confirmError(
        context, "session:alpha", second.body.generationId, second.body.confirmationId, second.body.requestDigest,
      );
      expect(secondConfirm).toEqual({ status: 409, body: { error: "OPERATION_BINDING_CONFLICT" } });
      expect(context.confirmations.size).toBe(1);
      expect(readdirSync(join(context.rootPath, "receipts", "generations", "catalog")))
        .toHaveLength(1);
    });
  });

  test("并发同 binding confirm：exactly one durable birth，follower 等待并 replay", async () => {
    await withAdmission(async (context) => {
      const body = prepareBody("concurrent");
      const first = await prepareVia(context, "session:alpha", body);
      const second = await prepareVia(context, "session:alpha", body);
      expect(second.body.confirmationId).not.toBe(first.body.confirmationId);

      let release: () => void = () => undefined;
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      const restore = GENERATION_ADMISSION_API_TEST_SEAMS
        .replaceBeforeDurableAdmissionHook(() => gate);
      try {
        const leader = confirmVia(
          context, "session:alpha", first.body.generationId, first.body.confirmationId, first.body.requestDigest,
        );
        const follower = confirmVia(
          context, "session:alpha", second.body.generationId, second.body.confirmationId, second.body.requestDigest,
        );
        release();
        const [leaderResult, followerResult] = await Promise.all([leader, follower]);
        expect(leaderResult.response.status).toBe(200);
        expect(leaderResult.body.replayed).toBe(false);
        expect(followerResult.response.status).toBe(200);
        expect(followerResult.body.replayed).toBe(true);
      } finally {
        restore();
      }
      expect(readdirSync(join(context.rootPath, "receipts", "generations", "catalog")))
        .toHaveLength(1);
      expect(context.confirmations.size).toBe(1);
    });
  });

  test("aborted follower 不取消 leader；leader 完成唯一 durable birth", async () => {
    await withAdmission(async (context) => {
      const body = prepareBody("abort-follower");
      const first = await prepareVia(context, "session:alpha", body);
      const second = await prepareVia(context, "session:alpha", body);

      let release: () => void = () => undefined;
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      const restore = GENERATION_ADMISSION_API_TEST_SEAMS
        .replaceBeforeDurableAdmissionHook(() => gate);
      try {
        const leader = confirmVia(
          context, "session:alpha", first.body.generationId, first.body.confirmationId, first.body.requestDigest,
        );
        const followerAbort = new AbortController();
        const follower = confirmVia(
          context, "session:alpha", second.body.generationId, second.body.confirmationId, second.body.requestDigest,
          { signal: followerAbort.signal },
        );
        // leader 被 hook 钉住；等 follower 通过 body 读取进入 flight 后再 abort。
        await new Promise((resolve) => setTimeout(resolve, 20));
        followerAbort.abort();
        release();
        const [leaderResult, followerResult] = await Promise.all([leader, follower]);
        expect(leaderResult.response.status).toBe(200);
        expect(leaderResult.body.replayed).toBe(false);
        expect(followerResult.response.status).toBe(200);
        expect(followerResult.body.replayed).toBe(true);
      } finally {
        restore();
      }
      expect(readdirSync(join(context.rootPath, "receipts", "generations", "catalog")))
        .toHaveLength(1);
      expect(context.confirmations.size).toBe(1);
    });
  });

  test("contract 漂移在 token 消费前失败且零 mutation", async () => {
    await withAdmission(async (context) => {
      const { body: token } = await prepareVia(context, "session:alpha", prepareBody("drift"));
      const drifted: GenerationContractConfigV1 = {
        ...MARBLE_CONTRACT,
        contractShapeDigest: "b".repeat(64),
      };
      const otherApi = createGenerationAdmissionApi({
        confirmations: context.confirmations,
        firstGeneration: context.runtime.firstGeneration,
        contract: drifted,
        clock: () => "2026-08-15T10:00:00.000Z",
        hasSession: () => true,
      });
      const response = await fetchRoute(otherApi,
        confirmRequest(
          "session:alpha",
          token.generationId,
          JSON.stringify({ confirmationId: token.confirmationId, requestDigest: token.requestDigest }),
        ),
      );
      expect(response!.status).toBe(409);
      expect(await response!.json()).toEqual({ error: "PROVIDER_CONTRACT_MISMATCH" });
      expect(context.confirmations.size).toBe(1);
      expect(snapshot(join(context.rootPath, "receipts"))).toEqual([]);
    });
  });

  test("capacity-reached 与注入 birth fault 暴露稳定 code 且保留证据", async () => {
    await withAdmission(async (context) => {
      const capacityApi = createGenerationAdmissionApi({
        confirmations: context.confirmations,
        firstGeneration: {
          inspect: (id) => context.facade.inspect(id),
          admit: () => ({ status: "capacity-reached" }),
          checkpoint: (request) => context.facade.checkpoint(request),
          submitResult: () => {
            throw new Error("GENERATION_RECOVERY_REQUIRED");
          },
          submitInspect: () => {
            throw new Error("GENERATION_RECOVERY_REQUIRED");
          },
        },
        contract: MARBLE_CONTRACT,
        clock: () => "2026-08-15T10:00:00.000Z",
        hasSession: () => true,
      });
      const token = await prepareVia(context, "session:alpha", prepareBody("capacity"));
      const capacityResponse = await fetchRoute(capacityApi,
        confirmRequest(
          "session:alpha",
          token.body.generationId,
          JSON.stringify({ confirmationId: token.body.confirmationId, requestDigest: token.body.requestDigest }),
        ),
      );
      expect(capacityResponse!.status).toBe(503);
      expect(await capacityResponse!.json()).toEqual({ error: "GENERATION_CAPACITY_REACHED" });
      expect(snapshot(join(context.rootPath, "receipts"))).toEqual([]);

      const faultApi = createGenerationAdmissionApi({
        confirmations: context.confirmations,
        firstGeneration: {
          inspect: (id) => context.facade.inspect(id),
          admit: () => {
            throw new Error("GENERATION_RECOVERY_REQUIRED");
          },
          checkpoint: (request) => context.facade.checkpoint(request),
          submitResult: () => {
            throw new Error("GENERATION_RECOVERY_REQUIRED");
          },
          submitInspect: () => {
            throw new Error("GENERATION_RECOVERY_REQUIRED");
          },
        },
        contract: MARBLE_CONTRACT,
        clock: () => "2026-08-15T10:00:00.000Z",
        hasSession: () => true,
      });
      const faultToken = await prepareVia(context, "session:alpha", prepareBody("fault"));
      const faultResponse = await fetchRoute(faultApi,
        confirmRequest(
          "session:alpha",
          faultToken.body.generationId,
          JSON.stringify({ confirmationId: faultToken.body.confirmationId, requestDigest: faultToken.body.requestDigest }),
        ),
      );
      expect(faultResponse!.status).toBe(409);
      expect(await faultResponse!.json()).toEqual({ error: "GENERATION_RECOVERY_REQUIRED" });
      expect(snapshot(join(context.rootPath, "receipts"))).toEqual([]);
      expect(context.confirmations.size).toBe(0);
    });
  });

  test("hunyuan prepare/confirm 走同一 admission 且 durable binding exact", async () => {
    await withAdmission(async (context) => {
      const prepared = requireGenerationRequest(prepareBody("hunyuan-admission", "a jade seal", "hunyuan-ai3d-v1"));
      const { response, body } = await prepareVia(
        context,
        "session:alpha",
        prepareBody("hunyuan-admission", "a jade seal", "hunyuan-ai3d-v1"),
      );
      expect(response.status).toBe(201);
      expect(body.provider).toBe("hunyuan-ai3d-v1");
      expect(body.model).toBe("3.1");

      const confirmed = await confirmVia(
        context, "session:alpha", body.generationId, body.confirmationId, body.requestDigest,
      );
      expect(confirmed.response.status).toBe(200);
      expect(confirmed.body.binding.provider).toBe("hunyuan-ai3d-v1");
      expect(confirmed.body.binding.contractProfile).toBe("cloud-response-v1");
      expect(confirmed.body.binding.requestDigest).toBe(prepared.requestDigest);
    }, HUNYUAN_CONTRACT);
  });

  test("provider 不匹配注入 contract 时 prepare 稳定 PROVIDER_CONTRACT_MISMATCH", async () => {
    await withAdmission(async (context) => {
      const response = await fetchRoute(context.api,
        prepareRequest(
          "session:alpha",
          JSON.stringify(prepareBody("wrong-provider", "a bronze compass", "hunyuan-ai3d-v1")),
        ),
      );
      expect(response.status).toBe(409);
      expect(await response.json()).toEqual({ error: "PROVIDER_CONTRACT_MISMATCH" });
      expect(context.confirmations.size).toBe(0);
    });
  });

  test("admission 模块不触碰 provider service、credential 或 network", () => {
    const source = readFileSync(
      join(import.meta.dir, "generation-admission-api.ts"),
      "utf8",
    );
    for (const token of [
      "marble-generation-service",
      "hunyuan-generation-service",
      "generation-provider-transport",
      "apiKey",
      "Authorization",
      "WLT-Api-Key",
    ]) {
      expect(source).not.toContain(token);
    }
  });

  test("resolveGenerationContractConfig 从 env 推导 provider 并成对校验", () => {
    expect(resolveGenerationContractConfig({})).toBeUndefined();
    expect(resolveGenerationContractConfig({
      DEMIURGES_GENERATION_CONTRACT_PROFILE: "worldlabs-openapi-2026-08-15-v1",
      DEMIURGES_GENERATION_CONTRACT_SHAPE_DIGEST: "a".repeat(64),
    })).toEqual(MARBLE_CONTRACT);
    expect(resolveGenerationContractConfig({
      DEMIURGES_GENERATION_CONTRACT_PROFILE: "cloud-response-v1",
      DEMIURGES_GENERATION_CONTRACT_SHAPE_DIGEST: "b".repeat(64),
    })).toEqual(HUNYUAN_CONTRACT);
    expect(() => resolveGenerationContractConfig({
      DEMIURGES_GENERATION_CONTRACT_PROFILE: "worldlabs-openapi-2026-08-15-v1",
    })).toThrow("必须成对配置");
    expect(() => resolveGenerationContractConfig({
      DEMIURGES_GENERATION_CONTRACT_PROFILE: "made-up-profile-v1",
      DEMIURGES_GENERATION_CONTRACT_SHAPE_DIGEST: "a".repeat(64),
    })).toThrow("未知 generation contract profile");
    expect(() => resolveGenerationContractConfig({
      DEMIURGES_GENERATION_CONTRACT_PROFILE: "worldlabs-openapi-2026-08-15-v1",
      DEMIURGES_GENERATION_CONTRACT_SHAPE_DIGEST: "A".repeat(64),
    })).toThrow("64 位 lowercase hex");
  });
});
