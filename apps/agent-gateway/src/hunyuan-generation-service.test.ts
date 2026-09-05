import { describe, expect, test } from "bun:test";

import {
  createGenerationBinding,
  requireGenerationRequest,
  type GenerationBindingBodyV1,
  type HunyuanProviderRequestV1,
  type RemoteBoundPayloadV1,
} from "@demiurges/world-project";

import { HunyuanGenerationService } from "./hunyuan-generation-service";

const API_KEY = "test-hunyuan-api-key-never-log";
const SHAPE_DIGEST = "b".repeat(64);
const JOB_ID = "123456";
const REQUEST_ID = "123e4567-e89b-42d3-a456-426614174000";

function binding(profile: "cloud-response-v1" | "compat-top-level-v1") {
  return createGenerationBinding(requireGenerationRequest({
    provider: "hunyuan-ai3d-v1",
    model: "3.1",
    prompt: "A polished bronze fox statue",
    costUnknownAccepted: true,
    waitForCompletionAndDownload: true,
    idempotencyKey: `hunyuan-${profile}`,
  }), { contractProfile: profile, contractShapeDigest: SHAPE_DIGEST });
}

const CLOUD_BINDING = binding("cloud-response-v1");
const COMPAT_BINDING = binding("compat-top-level-v1");
const PROVIDER_REQUEST = CLOUD_BINDING.providerRequest as HunyuanProviderRequestV1;
const REMOTE: RemoteBoundPayloadV1 = {
  provider: "hunyuan-ai3d-v1",
  remoteJobId: JOB_ID,
  providerRequestId: REQUEST_ID,
};

function envelope(
  profile: "cloud-response-v1" | "compat-top-level-v1",
  payload: Record<string, unknown>,
): Record<string, unknown> {
  return profile === "cloud-response-v1" ? { Response: payload } : payload;
}

function json(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), { status });
}

function serviceFor(
  response: Response | (() => Promise<Response>),
  requests: Request[],
  profile: "cloud-response-v1" | "compat-top-level-v1" = "cloud-response-v1",
  deadlineSignal?: () => AbortSignal,
): HunyuanGenerationService {
  return new HunyuanGenerationService({
    apiKey: API_KEY,
    contractProfile: profile,
    contractShapeDigest: SHAPE_DIGEST,
    createDeadlineSignal: deadlineSignal,
    fetch: async (request) => {
      requests.push(request);
      return typeof response === "function" ? await response() : response;
    },
  });
}

describe("HunyuanGenerationService", () => {
  test("submits and queries through exact authenticated POST routes", async () => {
    const requests: Request[] = [];
    const submit = serviceFor(json(envelope("cloud-response-v1", {
      JobId: JOB_ID,
      RequestId: REQUEST_ID,
    })), requests);
    expect(await submit.submitHunyuanObject(CLOUD_BINDING)).toEqual({
      kind: "success",
      remoteBound: REMOTE,
    });

    const query = serviceFor(json(envelope("cloud-response-v1", {
      Status: "WAIT",
      RequestId: REQUEST_ID,
    })), requests);
    expect(await query.queryHunyuanJob(CLOUD_BINDING, REMOTE)).toMatchObject({
      kind: "success",
      result: { kind: "pending", status: "WAIT", providerRequestId: REQUEST_ID },
    });
    expect(requests).toHaveLength(2);
    expect(requests.map((request) => request.url)).toEqual([
      "https://api.ai3d.cloud.tencent.com/v1/ai3d/submit",
      "https://api.ai3d.cloud.tencent.com/v1/ai3d/query",
    ]);
    expect(await requests[0]!.text()).toBe(JSON.stringify(PROVIDER_REQUEST));
    expect(await requests[1]!.text()).toBe(JSON.stringify({ JobId: JOB_ID }));
    for (const request of requests) {
      expect(request.method).toBe("POST");
      expect(request.redirect).toBe("error");
      expect(request.headers.get("Authorization")).toBe(API_KEY);
      expect(request.headers.get("Authorization")).not.toContain("Bearer");
      expect([...request.headers].sort()).toEqual([
        ["accept", "application/json"],
        ["authorization", API_KEY],
        ["content-type", "application/json"],
      ]);
    }
  });

  test("freezes each configured response profile without fallback", async () => {
    const cloudRequests: Request[] = [];
    const cloud = serviceFor(json({ JobId: JOB_ID, RequestId: REQUEST_ID }), cloudRequests);
    expect(await cloud.submitHunyuanObject(CLOUD_BINDING)).toEqual({
      kind: "submit-ambiguous",
      code: "PROVIDER_SUBMISSION_AMBIGUOUS",
    });
    expect(cloudRequests).toHaveLength(1);

    const compatRequests: Request[] = [];
    const compat = serviceFor(json({ JobId: JOB_ID, RequestId: REQUEST_ID }), compatRequests,
      "compat-top-level-v1");
    expect(await compat.submitHunyuanObject(COMPAT_BINDING)).toEqual({
      kind: "success",
      remoteBound: REMOTE,
    });
    expect(compatRequests).toHaveLength(1);
  });

  test("maps every post-fetch submit failure to one redacted ambiguity", async () => {
    const cases: Array<Response | (() => Promise<Response>)> = [
      ...[400, 401, 402, 422, 429, 503, 418].map((status) =>
        new Response("raw status or body https://example.invalid/signed", { status })),
      json({ Response: { JobId: "not-a-job", RequestId: REQUEST_ID } }),
      new Response(new Uint8Array([0x7b, 0xc3, 0x7d])),
      new Response(new ReadableStream<Uint8Array>({
        start(controller) { controller.enqueue(new Uint8Array(256 * 1024 + 1)); controller.close(); },
      })),
      async () => { throw new Error("raw fetch error"); },
      new Response(new ReadableStream<Uint8Array>({
        start(controller) { controller.error(new Error("raw body error")); },
      })),
    ];
    for (const response of cases) {
      const requests: Request[] = [];
      const service = serviceFor(response, requests);
      const outcome = await service.submitHunyuanObject(CLOUD_BINDING);
      expect(outcome).toEqual({
        kind: "submit-ambiguous",
        code: "PROVIDER_SUBMISSION_AMBIGUOUS",
      });
      expect(requests).toHaveLength(1);
      expect(JSON.stringify(outcome)).not.toContain(API_KEY);
      expect(JSON.stringify(outcome)).not.toContain("raw");
    }
  });

  test("rejects forged bindings and remote values before fetch", async () => {
    const forgedBindings: unknown[] = [
      { ...CLOUD_BINDING, provider: "worldlabs-marble-v1" },
      { ...CLOUD_BINDING, contractProfile: "compat-top-level-v1" },
      { ...CLOUD_BINDING, contractShapeDigest: "c".repeat(64) },
      { ...CLOUD_BINDING, providerRequest: { Prompt: "forged", Model: "3.1" } },
    ];
    for (const forged of forgedBindings) {
      const requests: Request[] = [];
      const service = serviceFor(json({}), requests);
      expect(await service.submitHunyuanObject(forged as GenerationBindingBodyV1)).toEqual({
        kind: "contract-mismatch",
        code: "PROVIDER_CONTRACT_MISMATCH",
      });
      expect(await service.queryHunyuanJob(forged as GenerationBindingBodyV1, REMOTE)).toEqual({
        kind: "contract-mismatch",
        code: "PROVIDER_CONTRACT_MISMATCH",
      });
      expect(requests).toHaveLength(0);
    }
    const requests: Request[] = [];
    const service = serviceFor(json({}), requests);
    expect(await service.queryHunyuanJob(CLOUD_BINDING, {
      ...REMOTE, remoteJobId: "bad/job",
    })).toEqual({ kind: "contract-mismatch", code: "PROVIDER_CONTRACT_MISMATCH" });
    expect(requests).toHaveLength(0);
  });

  test("keeps the query status, response, and failure matrices separate", async () => {
    const rejected = new Map<number, "PROVIDER_UNAUTHORIZED" | "PROVIDER_REJECTED">([
      [400, "PROVIDER_REJECTED"], [401, "PROVIDER_UNAUTHORIZED"],
      [403, "PROVIDER_UNAUTHORIZED"], [404, "PROVIDER_REJECTED"], [422, "PROVIDER_REJECTED"],
    ]);
    for (const [status, code] of rejected) {
      const requests: Request[] = [];
      expect(await serviceFor(new Response("raw status", { status }), requests)
        .queryHunyuanJob(CLOUD_BINDING, REMOTE)).toEqual({ kind: "rejected", code });
      expect(requests).toHaveLength(1);
    }
    for (const [status, reason] of [[429, "rate-limited"], [503, "upstream-error"], [418, "unsupported-status"]] as const) {
      const requests: Request[] = [];
      expect(await serviceFor(new Response("raw status", { status }), requests)
        .queryHunyuanJob(CLOUD_BINDING, REMOTE)).toEqual({ kind: "transient", reason });
      expect(requests).toHaveLength(1);
    }
    const bodyRequests: Request[] = [];
    expect(await serviceFor(new Response(new ReadableStream<Uint8Array>({
      start(controller) { controller.enqueue(new Uint8Array(256 * 1024 + 1)); controller.close(); },
    })), bodyRequests).queryHunyuanJob(CLOUD_BINDING, REMOTE)).toEqual({
      kind: "contract-mismatch", code: "PROVIDER_CONTRACT_MISMATCH",
    });
    expect(bodyRequests).toHaveLength(1);
  });

  test("returns only legal Hunyuan query results and keeps GLB URL ephemeral", async () => {
    const doneUrl = "https://bucket.cos.ap-guangzhou.tencentcos.cn/model.glb?signature=secret";
    const cases: Array<[Record<string, unknown>, string]> = [
      [{ Status: "RUN", RequestId: REQUEST_ID }, "pending"],
      [{ Status: "WAIT", RequestId: REQUEST_ID, ResultFile3Ds: [], ResultCreditConsumed: 0, ResultCreditDetails: "" }, "pending"],
      [{ Status: "FAIL", RequestId: REQUEST_ID, ResultCreditConsumed: 1.25 }, "failure"],
      [{
        Status: "DONE", RequestId: REQUEST_ID, ResultFile3Ds: [
          { Type: "OBJ", Url: "https://bucket.cos.ap-guangzhou.tencentcos.cn/model.obj" },
          { Type: "GLB", Url: doneUrl },
        ], ResultCreditConsumed: 2,
      }, "done"],
    ];
    for (const [payload, kind] of cases) {
      const requests: Request[] = [];
      const result = await serviceFor(json(envelope("cloud-response-v1", payload)), requests)
        .queryHunyuanJob(CLOUD_BINDING, REMOTE);
      expect(result).toMatchObject({ kind: "success", result: { kind } });
      expect(requests).toHaveLength(1);
      if (kind === "done") expect(JSON.stringify(result)).toContain(doneUrl);
    }
    for (const payload of [
      { Status: "DONE", RequestId: REQUEST_ID, ResultFile3Ds: [{ Type: "OBJ", Url: doneUrl }] },
      { Status: "DONE", RequestId: REQUEST_ID, ResultFile3Ds: [
        { Type: "GLB", Url: doneUrl }, { Type: "GLB", Url: doneUrl },
      ] },
      { Status: "DONE", RequestId: REQUEST_ID, ResultFile3Ds: [{ Type: "GLB", Url: doneUrl }], extra: true },
      { Status: "DONE", RequestId: "bad", ResultFile3Ds: [{ Type: "GLB", Url: doneUrl }] },
    ]) {
      const requests: Request[] = [];
      expect(await serviceFor(json(envelope("cloud-response-v1", payload)), requests)
        .queryHunyuanJob(CLOUD_BINDING, REMOTE)).toEqual({
          kind: "contract-mismatch", code: "PROVIDER_CONTRACT_MISMATCH",
        });
      expect(requests).toHaveLength(1);
    }
  });

  test("combines caller abort and deadline with one fetch and no retry", async () => {
    const caller = new AbortController();
    const requests: Request[] = [];
    let release: ((response: Response) => void) | undefined;
    const service = serviceFor(() => new Promise<Response>((resolve) => { release = resolve; }), requests);
    const pending = service.queryHunyuanJob(CLOUD_BINDING, REMOTE, caller.signal);
    caller.abort();
    expect(await pending).toEqual({ kind: "transient", reason: "caller-aborted" });
    expect(requests).toHaveLength(1);
    expect(requests[0]!.signal.aborted).toBe(true);
    release!(json({}));

    const deadline = new AbortController();
    const submitRequests: Request[] = [];
    let releaseSubmit: ((response: Response) => void) | undefined;
    const submit = serviceFor(
      () => new Promise<Response>((resolve) => { releaseSubmit = resolve; }),
      submitRequests,
      "cloud-response-v1",
      () => deadline.signal,
    );
    const pendingSubmit = submit.submitHunyuanObject(CLOUD_BINDING);
    deadline.abort();
    expect(await pendingSubmit).toEqual({
      kind: "submit-ambiguous", code: "PROVIDER_SUBMISSION_AMBIGUOUS",
    });
    expect(submitRequests).toHaveLength(1);
    expect(submitRequests[0]!.signal.aborted).toBe(true);
    releaseSubmit!(json({}));
  });

  test("returns a zero-fetch pre-submit abort only before a paid fetch can begin", async () => {
    const caller = new AbortController();
    caller.abort();
    const callerRequests: Request[] = [];
    expect(await serviceFor(json({}), callerRequests)
      .submitHunyuanObject(CLOUD_BINDING, caller.signal)).toEqual({
        kind: "pre-submit-aborted", code: "REQUEST_ABORTED",
      });
    expect(callerRequests).toHaveLength(0);

    const deadline = new AbortController();
    deadline.abort();
    const deadlineRequests: Request[] = [];
    expect(await serviceFor(json({}), deadlineRequests, "cloud-response-v1", () => deadline.signal)
      .submitHunyuanObject(CLOUD_BINDING)).toEqual({
        kind: "pre-submit-aborted", code: "REQUEST_ABORTED",
      });
    expect(deadlineRequests).toHaveLength(0);
  });
});
