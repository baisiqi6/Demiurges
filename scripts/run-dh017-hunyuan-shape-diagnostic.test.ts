import { describe, expect, test } from "bun:test";

import {
  DH017_HUNYUAN_SHAPE_DIAGNOSTIC_STOPPED,
  runHunyuanShapeDiagnostic,
} from "./run-dh017-hunyuan-shape-diagnostic";

const JOB_ID = "1479369951965601792";
const REQUEST_ID = "123e4567-e89b-42d3-a456-426614174000";
const SIGNED_URL =
  "https://hunyuan-prod-1258344699.cos.ap-guangzhou.tencentcos.cn/result.glb?sign=top-secret";
const ERROR_MESSAGE = "internal failure key=SECRET_TOKEN";
const COST = 1234.5;
const PROMPT = "红色木凳 prompt-red-wooden-stool";
const API_KEY = "synthetic-api-key-sentinel";
const SENTINELS = [JOB_ID, REQUEST_ID, SIGNED_URL, ERROR_MESSAGE, "1234.5", PROMPT, API_KEY];

function json(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), { status });
}

function envelope(payload: Record<string, unknown>): Record<string, unknown> {
  return { Response: payload };
}

function fullResponse(): Record<string, unknown> {
  return envelope({
    Status: "DONE",
    RequestId: REQUEST_ID,
    ErrorCode: null,
    ErrorMessage: null,
    ResultFile3Ds: [
      { Type: "GLB", Url: SIGNED_URL, PreviewImageUrl: `${SIGNED_URL}/preview` },
      { Type: "OBJ", Url: `${SIGNED_URL}/obj`, PreviewImageUrl: null },
    ],
    ResultCreditDetails: null,
    ResultCreditConsumed: COST,
  });
}

describe("runHunyuanShapeDiagnostic", () => {
  test("恰好一次 authenticated query，输出 shape descriptor 且不含任何 scalar sentinel", async () => {
    const requests: Request[] = [];
    const outcome = await runHunyuanShapeDiagnostic({
      jobId: JOB_ID,
      readCredential: async () => API_KEY,
      fetchImpl: async (request) => {
        requests.push(request);
        return json(fullResponse());
      },
    });
    expect(outcome.kind).toBe("shape");
    if (outcome.kind !== "shape") return;
    expect(outcome.descriptor.schemaVersion).toBe(1);
    expect(outcome.descriptor.httpStatus).toBe(200);
    expect(outcome.descriptor.profileCandidate).toBe("cloud-response-v1");
    expect(outcome.descriptor.shapeDigest).toMatch(/^[a-f0-9]{64}$/);
    const serialized = JSON.stringify(outcome);
    for (const sentinel of SENTINELS) {
      expect(serialized).not.toContain(sentinel);
    }

    expect(requests).toHaveLength(1);
    const request = requests[0]!;
    expect(request.url).toBe("https://api.ai3d.cloud.tencent.com/v1/ai3d/query");
    expect(request.method).toBe("POST");
    expect(request.redirect).toBe("error");
    expect(await request.text()).toBe(JSON.stringify({ JobId: JOB_ID }));
    expect(request.headers.get("Authorization")).toBe(API_KEY);
    expect(request.headers.get("Authorization")).not.toContain("Bearer");
    expect([...request.headers].sort()).toEqual([
      ["accept", "application/json"],
      ["authorization", API_KEY],
      ["content-type", "application/json"],
    ]);
  });

  test("HTTP 非 200 只输出 STOPPED，不重试且不含 sentinel", async () => {
    for (const status of [401, 403, 404, 429, 500]) {
      let fetches = 0;
      const outcome = await runHunyuanShapeDiagnostic({
        jobId: JOB_ID,
        readCredential: async () => API_KEY,
        fetchImpl: async () => {
          fetches += 1;
          return new Response(`{"Response":{"Status":"FAIL","ErrorMessage":"${ERROR_MESSAGE}"}}`, { status });
        },
      });
      expect(outcome).toEqual({ kind: "stopped" });
      expect(fetches).toBe(1);
      expect(JSON.stringify(outcome)).not.toContain(ERROR_MESSAGE);
      expect(JSON.stringify(outcome)).not.toContain(API_KEY);
    }
  });

  test("256 KiB body 超限只输出 STOPPED", async () => {
    const outcome = await runHunyuanShapeDiagnostic({
      jobId: JOB_ID,
      readCredential: async () => API_KEY,
      fetchImpl: async () => new Response(new Uint8Array(256 * 1024 + 1), { status: 200 }),
    });
    expect(outcome).toEqual({ kind: "stopped" });
  });

  test("duplicate-key / malformed / fatal UTF-8 body 只输出 STOPPED", async () => {
    const duplicated = new TextEncoder().encode(
      `{"Response":{"Status":"DONE","RequestId":"${REQUEST_ID}"},"Response":{"Status":"DONE","RequestId":"${REQUEST_ID}"}}`,
    );
    const malformed = new TextEncoder().encode(`{"Response":{"Status":"DONE",`);
    const fatalUtf8 = new Uint8Array([0x7b, 0x22, 0x53, 0x22, 0x3a, 0x22, 0xff, 0x22, 0x7d]);
    for (const body of [duplicated, malformed, fatalUtf8]) {
      let fetches = 0;
      const outcome = await runHunyuanShapeDiagnostic({
        jobId: JOB_ID,
        readCredential: async () => API_KEY,
        fetchImpl: async () => {
          fetches += 1;
          return new Response(body, { status: 200 });
        },
      });
      expect(outcome).toEqual({ kind: "stopped" });
      expect(fetches).toBe(1);
      expect(JSON.stringify(outcome)).not.toContain(REQUEST_ID);
    }
  });

  test("noncooperative fetch 受 deadline 约束且无 late unhandled rejection", async () => {
    const unhandled: unknown[] = [];
    const observe = (reason: unknown) => { unhandled.push(reason); };
    process.on("unhandledRejection", observe);
    try {
      let rejectFetch: ((reason: unknown) => void) | undefined;
      const started = performance.now();
      const outcome = await runHunyuanShapeDiagnostic({
        jobId: JOB_ID,
        readCredential: async () => API_KEY,
        createDeadlineSignal: () => AbortSignal.timeout(50),
        fetchImpl: () => new Promise<Response>((_, reject) => {
          rejectFetch = reject;
        }),
      });
      expect(outcome).toEqual({ kind: "stopped" });
      expect(performance.now() - started).toBeLessThan(2_000);
      rejectFetch?.(new Error("late injected rejection"));
      await new Promise((resolve) => setTimeout(resolve, 50));
      expect(unhandled).toHaveLength(0);
    } finally {
      process.off("unhandledRejection", observe);
    }
  });

  test("noncooperative body read 受 deadline 约束", async () => {
    const started = performance.now();
    const outcome = await runHunyuanShapeDiagnostic({
      jobId: JOB_ID,
      readCredential: async () => API_KEY,
      createDeadlineSignal: () => AbortSignal.timeout(50),
      fetchImpl: async () => new Response(new ReadableStream<Uint8Array>({
        pull() {
          return new Promise<void>(() => undefined);
        },
      }), { status: 200 }),
    });
    expect(outcome).toEqual({ kind: "stopped" });
    expect(performance.now() - started).toBeLessThan(2_000);
  });

  test("noncooperative body cancel 不阻塞完成路径", async () => {
    const outcome = await runHunyuanShapeDiagnostic({
      jobId: JOB_ID,
      readCredential: async () => API_KEY,
      fetchImpl: async () => new Response(new ReadableStream<Uint8Array>({
        pull(controller) {
          controller.enqueue(new TextEncoder().encode(JSON.stringify(fullResponse())));
          controller.close();
        },
        cancel() {
          return new Promise<void>(() => undefined);
        },
      }), { status: 200 }),
    });
    expect(outcome.kind).toBe("shape");
  });

  test("depth / node 超界响应同样只输出 STOPPED", async () => {
    const deep = {
      Response: {
        Status: "RUN",
        RequestId: REQUEST_ID,
        nested: { a: { b: { c: { d: { e: { f: { g: { h: 1 } } } } } } } },
      },
    };
    const outcome = await runHunyuanShapeDiagnostic({
      jobId: JOB_ID,
      readCredential: async () => API_KEY,
      fetchImpl: async () => json(deep),
    });
    expect(outcome).toEqual({ kind: "stopped" });
    expect(JSON.stringify(outcome)).not.toContain(REQUEST_ID);
  });

  test("pre-aborted 调用在 credential 与 fetch 之前停止", async () => {
    const controller = new AbortController();
    controller.abort();
    let credentialReads = 0;
    let fetches = 0;
    const outcome = await runHunyuanShapeDiagnostic({
      jobId: JOB_ID,
      signal: controller.signal,
      readCredential: async () => {
        credentialReads += 1;
        return API_KEY;
      },
      fetchImpl: async () => {
        fetches += 1;
        return json(fullResponse());
      },
    });
    expect(outcome).toEqual({ kind: "stopped" });
    expect(credentialReads).toBe(0);
    expect(fetches).toBe(0);
  });

  test("非法 JobId 在 credential 与 fetch 之前停止", async () => {
    for (const jobId of ["not-a-job-id", "1479369951965601792.5", " 123", "123456789012345678901234567890123"]) {
      let credentialReads = 0;
      let fetches = 0;
      const outcome = await runHunyuanShapeDiagnostic({
        jobId,
        readCredential: async () => {
          credentialReads += 1;
          return API_KEY;
        },
        fetchImpl: async () => {
          fetches += 1;
          return json(fullResponse());
        },
      });
      expect(outcome).toEqual({ kind: "stopped" });
      expect(credentialReads).toBe(0);
      expect(fetches).toBe(0);
    }
  });

  test("停止码是固定脱敏常量且不携带任何响应内容", () => {
    expect(DH017_HUNYUAN_SHAPE_DIAGNOSTIC_STOPPED).toBe("DH017_HUNYUAN_SHAPE_DIAGNOSTIC_STOPPED");
    expect(JSON.stringify({ kind: "stopped", code: DH017_HUNYUAN_SHAPE_DIAGNOSTIC_STOPPED }))
      .not.toMatch(new RegExp(`(${SENTINELS.join("|")})`));
  });
});
