import { describe, expect, test } from "bun:test";

import { canonicalJsonBytes, sha256Hex } from "@demiurges/world";

import {
  GenerationCodecError,
  createGenerationBinding,
  createGenerationIntent,
  generationIdFromIdempotencyKey,
  generationIntentDigest,
  generationRequestDigest,
  requireGenerationBindingBody,
  requireGenerationIntent,
  requireGenerationRequest,
} from "./generation-contracts";

const MARBLE_SHAPE = "1".repeat(64);
const HUNYUAN_SHAPE = "2".repeat(64);

function expectInvalid(action: () => unknown): void {
  expect(action).toThrow(GenerationCodecError);
  try {
    action();
  } catch (error) {
    expect(error).toMatchObject({ code: "INVALID_REQUEST" });
  }
}

describe("generation request contract", () => {
  test("Marble normalizes prompt and derives the exact provider request", () => {
    const request = requireGenerationRequest({
      provider: "worldlabs-marble-v1",
      model: "marble-1.1",
      prompt: "Cafe\u0301 courtyard\nwith water",
      seed: 42,
      costUnknownAccepted: true,
      waitForCompletionAndDownload: true,
      idempotencyKey: "demo.marble-1",
    });

    expect(request.canonicalRequest).toEqual({
      provider: "worldlabs-marble-v1",
      model: "marble-1.1",
      prompt: "Café courtyard\nwith water",
      seed: 42,
      costUnknownAccepted: true,
      waitForCompletionAndDownload: true,
    });
    const generationId = generationIdFromIdempotencyKey("demo.marble-1");
    expect(request.generationId).toBe(generationId);
    expect(request.providerRequest).toEqual({
      world_prompt: {
        type: "text",
        text_prompt: "Café courtyard\nwith water",
        disable_recaption: true,
      },
      display_name: `Demiurges ${generationId.slice("generation:sha256:".length, "generation:sha256:".length + 12)}`,
      model: "marble-1.1",
      permission: {
        public: false,
        allow_id_access: false,
        allowed_readers: [],
        allowed_writers: [],
      },
      seed: 42,
    });
    expect(Object.isFrozen(request)).toBe(true);
    expect(Object.isFrozen(request.providerRequest)).toBe(true);
  });

  test("Hunyuan uses the exact Prompt/Model projection", () => {
    const request = requireGenerationRequest({
      provider: "hunyuan-ai3d-v1",
      model: "3.1",
      prompt: "a bronze astrolabe",
      costUnknownAccepted: true,
      waitForCompletionAndDownload: true,
      idempotencyKey: "demo.hunyuan-1",
    });

    expect(request.canonicalRequest).toEqual({
      provider: "hunyuan-ai3d-v1",
      model: "3.1",
      prompt: "a bronze astrolabe",
      costUnknownAccepted: true,
      waitForCompletionAndDownload: true,
    });
    expect(request.providerRequest).toEqual({
      Prompt: "a bronze astrolabe",
      Model: "3.1",
    });
  });

  test("request digest excludes idempotency key and follows the v1 domain", () => {
    const left = requireGenerationRequest({
      provider: "hunyuan-ai3d-v1",
      model: "3.0",
      prompt: "one object",
      costUnknownAccepted: true,
      waitForCompletionAndDownload: true,
      idempotencyKey: "key-a",
    });
    const right = requireGenerationRequest({
      provider: "hunyuan-ai3d-v1",
      model: "3.0",
      prompt: "one object",
      costUnknownAccepted: true,
      waitForCompletionAndDownload: true,
      idempotencyKey: "key-b",
    });
    const expected = sha256Hex(
      new Uint8Array([
        ...new TextEncoder().encode("demiurges-generation-request-v1\u0000"),
        ...canonicalJsonBytes(left.canonicalRequest),
      ]),
    );
    expect(left.requestDigest).toBe(expected);
    expect(right.requestDigest).toBe(expected);
    expect(left.generationId).not.toBe(right.generationId);
    expect(generationRequestDigest(left.canonicalRequest)).toBe(expected);
  });

  test("rejects unconfirmed cost/wait policy, unknown keys, invalid prompt and model", () => {
    const valid = {
      provider: "hunyuan-ai3d-v1",
      model: "3.0",
      prompt: "valid",
      costUnknownAccepted: true,
      waitForCompletionAndDownload: true,
      idempotencyKey: "key",
    } as const;
    expectInvalid(() => requireGenerationRequest({ ...valid, costUnknownAccepted: false }));
    expectInvalid(() => requireGenerationRequest({ ...valid, waitForCompletionAndDownload: false }));
    expectInvalid(() => requireGenerationRequest({ ...valid, extra: true }));
    expectInvalid(() => requireGenerationRequest({ ...valid, prompt: "bad\u0000prompt" }));
    expectInvalid(() => requireGenerationRequest({ ...valid, model: "2.0" }));
    expectInvalid(() => requireGenerationRequest({ ...valid, idempotencyKey: "bad/key" }));
    expectInvalid(() => requireGenerationRequest({ ...valid, prompt: "x".repeat(1025) }));
  });

  test("rejects accessors and non-plain request bodies", () => {
    const accessor = Object.create(null) as Record<string, unknown>;
    Object.defineProperty(accessor, "provider", { enumerable: true, get: () => "hunyuan-ai3d-v1" });
    expectInvalid(() => requireGenerationRequest(accessor));
    expectInvalid(() => requireGenerationRequest([]));
  });
});

describe("generation durable binding and intent", () => {
  test("binding and intent recompute all derived identities", () => {
    const request = requireGenerationRequest({
      provider: "worldlabs-marble-v1",
      model: "marble-1.0-draft",
      prompt: "a small observatory",
      costUnknownAccepted: true,
      waitForCompletionAndDownload: true,
      idempotencyKey: "binding-1",
    });
    const binding = createGenerationBinding(request, {
      contractProfile: "worldlabs-openapi-2026-08-15-v1",
      contractShapeDigest: MARBLE_SHAPE,
    });
    const decodedBinding = requireGenerationBindingBody(binding);
    expect("bindingDigest" in decodedBinding).toBe(false);

    const intent = createGenerationIntent(binding, "2026-08-15T12:34:56.789Z");
    expect(requireGenerationIntent(intent)).toEqual(intent);
    expect(Object.isFrozen(intent)).toBe(true);
    expect(intent.bindingDigest).toMatch(/^[a-f0-9]{64}$/);
    expect(generationIntentDigest(intent)).toBe(sha256Hex(new Uint8Array([
      ...new TextEncoder().encode("demiurges-generation-intent-v1\u0000"),
      ...canonicalJsonBytes(intent),
    ])));
  });

  test("Hunyuan binding accepts only a frozen response profile", () => {
    const request = requireGenerationRequest({
      provider: "hunyuan-ai3d-v1",
      model: "3.0",
      prompt: "a ceramic vessel",
      costUnknownAccepted: true,
      waitForCompletionAndDownload: true,
      idempotencyKey: "binding-2",
    });
    const binding = createGenerationBinding(request, {
      contractProfile: "cloud-response-v1",
      contractShapeDigest: HUNYUAN_SHAPE,
    });
    expect(requireGenerationBindingBody(binding)).toEqual(binding);
    expectInvalid(() => createGenerationBinding(request, {
      contractProfile: "worldlabs-openapi-2026-08-15-v1",
      contractShapeDigest: HUNYUAN_SHAPE,
    }));
  });

  test("intent decode rejects request, projection, digest and timestamp drift", () => {
    const request = requireGenerationRequest({
      provider: "hunyuan-ai3d-v1",
      model: "3.1",
      prompt: "a clockwork bird",
      costUnknownAccepted: true,
      waitForCompletionAndDownload: true,
      idempotencyKey: "binding-3",
    });
    const binding = createGenerationBinding(request, {
      contractProfile: "compat-top-level-v1",
      contractShapeDigest: HUNYUAN_SHAPE,
    });
    const intent = createGenerationIntent(binding, "2026-08-15T01:02:03.004Z");

    expectInvalid(() => requireGenerationIntent({ ...intent, requestDigest: "0".repeat(64) }));
    expectInvalid(() => requireGenerationIntent({
      ...intent,
      providerRequest: { Prompt: "drift", Model: "3.1" },
    }));
    expectInvalid(() => requireGenerationIntent({ ...intent, bindingDigest: "0".repeat(64) }));
    expectInvalid(() => requireGenerationIntent({ ...intent, createdAt: "2026-08-15" }));
    expectInvalid(() => requireGenerationIntent({ ...intent, unknown: true }));
  });
});
