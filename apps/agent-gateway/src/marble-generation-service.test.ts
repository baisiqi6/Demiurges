import { describe, expect, test } from "bun:test";

import {
  createGenerationBinding,
  requireGenerationRequest,
  type GenerationBindingBodyV1,
  type MarbleProviderRequestV1,
} from "@demiurges/world-project";

import { MarbleGenerationService } from "./marble-generation-service";

const API_KEY = "test-marble-api-key-never-log";
const OPERATION_ID = "marble_operation_1";
const WORLD_ID = "marble_world_1";

const BINDING = createGenerationBinding(requireGenerationRequest({
  provider: "worldlabs-marble-v1",
  model: "marble-1.1",
  prompt: "A mossy arch beside a river",
  costUnknownAccepted: true,
  waitForCompletionAndDownload: true,
  idempotencyKey: "marble-service-test",
}), {
  contractProfile: "worldlabs-openapi-2026-08-15-v1",
  contractShapeDigest: "a".repeat(64),
});
const MARBLE_REQUEST = BINDING.providerRequest as MarbleProviderRequestV1;

function world(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    world_id: WORLD_ID,
    display_name: "Mossy arch",
    world_marble_url: "https://marble.worldlabs.ai/worlds/demo",
    assets: {
      splats: {
        spz_urls: { "500k": "https://cdn.marble.worldlabs.ai/world.spz?sig=signed" },
      },
      mesh: {
        collider_mesh_url: "https://cdn.marble.worldlabs.ai/collider.glb?sig=signed",
      },
    },
    ...overrides,
  };
}

function pendingOperation(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return { operation_id: OPERATION_ID, done: false, ...overrides };
}

function json(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function serviceFor(
  response: Response | (() => Promise<Response>),
  requests: Request[],
  deadlineSignal?: () => AbortSignal,
): MarbleGenerationService {
  return new MarbleGenerationService({
    apiKey: API_KEY,
    createDeadlineSignal: deadlineSignal,
    fetch: async (request) => {
      requests.push(request);
      return typeof response === "function" ? await response() : response;
    },
  });
}

describe("MarbleGenerationService", () => {
  test("submit sends only the frozen request JSON to the exact credential route", async () => {
    const requests: Request[] = [];
    const service = serviceFor(json(pendingOperation()), requests);

    await expect(service.submitMarbleWorld(BINDING)).resolves.toEqual({
      kind: "success",
      result: {
        kind: "pending",
        remoteBound: {
          provider: "worldlabs-marble-v1",
          remoteJobId: OPERATION_ID,
          providerRequestId: null,
        },
      },
    });
    expect(requests).toHaveLength(1);
    const request = requests[0]!;
    expect(request.method).toBe("POST");
    expect(request.url).toBe("https://api.worldlabs.ai/marble/v1/worlds:generate");
    expect(request.redirect).toBe("error");
    expect([...request.headers].sort()).toEqual([
      ["accept", "application/json"],
      ["content-type", "application/json"],
      ["wlt-api-key", API_KEY],
    ]);
    expect(await request.text()).toBe(JSON.stringify(MARBLE_REQUEST));
  });

  test("query and get-world send exact GET routes with no body", async () => {
    const requests: Request[] = [];
    const queryService = serviceFor(json({
      operation_id: OPERATION_ID,
      done: true,
      response: world(),
    }), requests);
    expect((await queryService.queryMarbleOperation(OPERATION_ID)).kind).toBe("success");

    const getWorldService = serviceFor(json(world()), requests);
    const refreshed = await getWorldService.getMarbleWorld(OPERATION_ID, WORLD_ID);
    expect(refreshed).toMatchObject({
      kind: "success",
      result: { remoteOutputIdentity: { operationId: OPERATION_ID, worldId: WORLD_ID } },
    });
    expect(requests).toHaveLength(2);
    expect(requests.map((request) => request.url)).toEqual([
      `https://api.worldlabs.ai/marble/v1/operations/${OPERATION_ID}`,
      `https://api.worldlabs.ai/marble/v1/worlds/${WORLD_ID}`,
    ]);
    for (const request of requests) {
      expect(request.method).toBe("GET");
      expect(request.body).toBeNull();
      expect(request.headers.get("content-type")).toBeNull();
      expect(request.headers.get("accept")).toBe("application/json");
      expect(request.headers.get("WLT-Api-Key")).toBe(API_KEY);
    }
  });

  test("rejects unsafe durable IDs before fetch", async () => {
    const requests: Request[] = [];
    const service = serviceFor(json(pendingOperation()), requests);
    expect(await service.queryMarbleOperation("../escape")).toEqual({
      kind: "contract-mismatch",
      code: "PROVIDER_CONTRACT_MISMATCH",
    });
    expect(await service.getMarbleWorld(OPERATION_ID, "world/escape")).toEqual({
      kind: "contract-mismatch",
      code: "PROVIDER_CONTRACT_MISMATCH",
    });
    expect(requests).toHaveLength(0);
  });

  test("fails closed when get-world returns a different durable world identity", async () => {
    const requests: Request[] = [];
    const service = serviceFor(json(world({ world_id: "other_world" })), requests);
    expect(await service.getMarbleWorld(OPERATION_ID, WORLD_ID)).toEqual({
      kind: "contract-mismatch",
      code: "PROVIDER_CONTRACT_MISMATCH",
    });
    expect(requests).toHaveLength(1);
  });

  test("decodes pending, provider failure, done, and world refresh through frozen codecs", async () => {
    const requests: Request[] = [];
    const pending = serviceFor(json(pendingOperation()), requests);
    expect(await pending.queryMarbleOperation(OPERATION_ID)).toMatchObject({
      kind: "success",
      result: { kind: "pending" },
    });
    const failure = serviceFor(json({
      operation_id: OPERATION_ID,
      done: true,
      error: { code: 500, message: "provider detail" },
    }), requests);
    expect(await failure.queryMarbleOperation(OPERATION_ID)).toMatchObject({
      kind: "success",
      result: { kind: "failure" },
    });
    const done = serviceFor(json({
      operation_id: OPERATION_ID,
      done: true,
      response: world(),
    }), requests);
    expect(await done.queryMarbleOperation(OPERATION_ID)).toMatchObject({
      kind: "success",
      result: { kind: "done", remoteOutputIdentity: { worldId: WORLD_ID } },
    });
    const refreshed = serviceFor(json(world()), requests);
    expect(await refreshed.getMarbleWorld(OPERATION_ID, WORLD_ID)).toMatchObject({
      kind: "success",
      result: { remoteOutputIdentity: { worldId: WORLD_ID } },
    });
  });

  for (const response of [
    json({ operation_id: "other_operation", done: false }),
    json(world({ world_id: "other_world" })),
    new Response('{"operation_id":"one","operation_id":"two","done":false}'),
    new Response(new Uint8Array([0x7b, 0x22, 0x78, 0x22, 0x3a, 0xc3, 0x7d])),
    json({ operation_id: OPERATION_ID, done: false, unknown: true }),
    json({ operation_id: OPERATION_ID, done: false }, 201),
    new Response(new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(256 * 1024 + 1));
        controller.close();
      },
    })),
  ]) {
    test("fails closed for identity or response-contract drift", async () => {
      const requests: Request[] = [];
      const service = serviceFor(response, requests);
      const outcome = response.status === 200 && response.body !== null &&
        response.headers.get("content-type") === null
        ? await service.getMarbleWorld(OPERATION_ID, WORLD_ID)
        : await service.queryMarbleOperation(OPERATION_ID);
      expect(outcome).toEqual(response.status === 201
        ? { kind: "transient", reason: "unsupported-status" }
        : { kind: "contract-mismatch", code: "PROVIDER_CONTRACT_MISMATCH" });
      expect(requests).toHaveLength(1);
    });
  }

  test("maps only documented Marble submit rejection statuses to public rejection codes", async () => {
    const expected = new Map<number,
      "PROVIDER_REJECTED" | "PROVIDER_UNAUTHORIZED" | "PROVIDER_PAYMENT_REQUIRED"
    >([
      [400, "PROVIDER_REJECTED"],
      [401, "PROVIDER_UNAUTHORIZED"],
      [402, "PROVIDER_PAYMENT_REQUIRED"],
      [422, "PROVIDER_REJECTED"],
    ]);
    for (const [status, code] of expected) {
      const requests: Request[] = [];
      const service = serviceFor(new Response("provider raw body", { status, statusText: "raw status" }), requests);
      expect(await service.submitMarbleWorld(BINDING)).toEqual({ kind: "rejected", code });
      expect(requests).toHaveLength(1);
    }
  });

  test("maps only bound query/get-world rejection statuses to their frozen codes", async () => {
    const expected = new Map<number, "PROVIDER_REJECTED" | "PROVIDER_UNAUTHORIZED">([
      [400, "PROVIDER_REJECTED"],
      [401, "PROVIDER_UNAUTHORIZED"],
      [403, "PROVIDER_UNAUTHORIZED"],
      [404, "PROVIDER_REJECTED"],
      [422, "PROVIDER_REJECTED"],
    ]);
    for (const [status, code] of expected) {
      const queryRequests: Request[] = [];
      const query = serviceFor(new Response("provider raw body", { status }), queryRequests);
      expect(await query.queryMarbleOperation(OPERATION_ID)).toEqual({ kind: "rejected", code });
      expect(queryRequests).toHaveLength(1);

      const worldRequests: Request[] = [];
      const worldService = serviceFor(new Response("provider raw body", { status }), worldRequests);
      expect(await worldService.getMarbleWorld(OPERATION_ID, WORLD_ID)).toEqual({ kind: "rejected", code });
      expect(worldRequests).toHaveLength(1);
    }
  });

  test("revalidates durable Marble binding before submit and never fetches forged input", async () => {
    const forgedBindings: unknown[] = [
      { ...BINDING, provider: "hunyuan-ai3d-v1" },
      {
        ...BINDING,
        providerRequest: {
          ...MARBLE_REQUEST,
          world_prompt: { ...MARBLE_REQUEST.world_prompt, type: "image" },
        },
      },
      { ...BINDING, providerRequest: { ...MARBLE_REQUEST, model: "marble-1.0" } },
      {
        ...BINDING,
        providerRequest: {
          ...MARBLE_REQUEST,
          permission: { ...MARBLE_REQUEST.permission, public: true },
        },
      },
      { ...BINDING, providerRequest: { ...MARBLE_REQUEST, tags: [] } },
      { ...BINDING, contractProfile: "cloud-response-v1" },
    ];
    for (const forged of forgedBindings) {
      const requests: Request[] = [];
      const service = serviceFor(json(pendingOperation()), requests);
      expect(await service.submitMarbleWorld(forged as GenerationBindingBodyV1)).toEqual({
        kind: "contract-mismatch",
        code: "PROVIDER_CONTRACT_MISMATCH",
      });
      expect(requests).toHaveLength(0);
    }
  });

  test("keeps rate limits, 5xx, fetch and body failures transient without raw details", async () => {
    const rawText = "raw provider body https://api.worldlabs.ai/secret";
    const cases: Array<[
      MarbleGenerationService,
      "rate-limited" | "upstream-error" | "transport-failure" | "body-failure",
    ]> = [
      [serviceFor(new Response(rawText, { status: 429 }), []), "rate-limited"],
      [serviceFor(new Response(rawText, { status: 503, statusText: "raw status" }), []), "upstream-error"],
      [serviceFor(async () => { throw new Error("raw fetch failure"); }, []), "transport-failure"],
      [serviceFor(new Response(new ReadableStream<Uint8Array>({
        start(controller) { controller.error(new Error("raw stream failure")); },
      })), []), "body-failure"],
    ];
    for (const [service, reason] of cases) {
      const outcome = await service.queryMarbleOperation(OPERATION_ID);
      expect(outcome).toEqual({ kind: "transient", reason });
      const visible = JSON.stringify(outcome);
      for (const secret of [API_KEY, rawText, "raw status", "raw fetch failure", "raw stream failure"]) {
        expect(visible).not.toContain(secret);
      }
    }
  });

  test("combines caller abort and injected deadline without retrying", async () => {
    const caller = new AbortController();
    const deadline = new AbortController();
    const requests: Request[] = [];
    let release: ((response: Response) => void) | undefined;
    const pendingResponse = new Promise<Response>((resolve) => { release = resolve; });
    const service = serviceFor(() => pendingResponse, requests, () => deadline.signal);
    const pending = service.queryMarbleOperation(OPERATION_ID, caller.signal);
    caller.abort();
    expect(await pending).toEqual({ kind: "transient", reason: "caller-aborted" });
    expect(requests).toHaveLength(1);
    expect(requests[0]!.signal.aborted).toBe(true);
    release!(json(pendingOperation()));

    const activeDeadline = new AbortController();
    const deadlineRequests: Request[] = [];
    let releaseDeadline: ((response: Response) => void) | undefined;
    const deadlineService = serviceFor(
      () => new Promise<Response>((resolve) => { releaseDeadline = resolve; }),
      deadlineRequests,
      () => activeDeadline.signal,
    );
    const pendingDeadline = deadlineService.queryMarbleOperation(OPERATION_ID);
    activeDeadline.abort();
    expect(await pendingDeadline).toEqual({
      kind: "transient",
      reason: "deadline-exceeded",
    });
    expect(deadlineRequests).toHaveLength(1);
    expect(deadlineRequests[0]!.signal.aborted).toBe(true);
    releaseDeadline!(json(pendingOperation()));
  });
});
