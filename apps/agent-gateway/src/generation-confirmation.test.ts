import { describe, expect, test } from "bun:test";

import { requireGenerationRequest } from "@demiurges/world-project";

import {
  GenerationConfirmationError,
  GenerationConfirmationStore,
} from "./generation-confirmation";

const MARBLE_CONTRACT = {
  contractProfile: "worldlabs-openapi-2026-08-15-v1",
  contractShapeDigest: "a".repeat(64),
} as const;

function request(key: string) {
  return requireGenerationRequest({
    provider: "hunyuan-ai3d-v1",
    model: "3.1",
    prompt: "a bronze compass",
    costUnknownAccepted: true,
    waitForCompletionAndDownload: true,
    idempotencyKey: key,
  });
}

function makeStore() {
  let monotonic = 1_000;
  let wall = Date.parse("2026-08-15T10:00:00.000Z");
  let sequence = 0;
  const store = new GenerationConfirmationStore({
    monotonicNowMs: () => monotonic,
    wallNowMs: () => wall,
    nextConfirmationId: () => `confirmation:test-${++sequence}`,
  });
  return {
    store,
    advance(milliseconds: number) {
      monotonic += milliseconds;
      wall += milliseconds;
    },
  };
}

function expectCode(action: () => unknown, code: string): void {
  let thrown: unknown;
  try {
    action();
  } catch (error) {
    thrown = error;
  }
  expect(thrown).toBeInstanceOf(GenerationConfirmationError);
  expect(thrown).toMatchObject({ code });
}

describe("GenerationConfirmationStore", () => {
  test("binds a token to the server-trusted session and consumes it once", () => {
    const { store } = makeStore();
    const prepared = request("confirm-1");
    const confirmation = store.prepare("session:alpha", prepared, MARBLE_CONTRACT);

    expect(confirmation.sessionId).toBe("session:alpha");
    expect(confirmation.generationId).toBe(prepared.generationId);
    expect(confirmation.requestDigest).toBe(prepared.requestDigest);
    expect(confirmation.expiresAt).toBe("2026-08-15T10:10:00.000Z");
    expect(store.size).toBe(1);

    expectCode(
      () => store.consume("session:foreign", prepared.generationId, {
        confirmationId: confirmation.confirmationId,
        requestDigest: prepared.requestDigest,
      }),
      "CONFIRMATION_REQUIRED",
    );
    expect(store.size).toBe(1);

    const consumed = store.consume("session:alpha", prepared.generationId, {
      confirmationId: confirmation.confirmationId,
      requestDigest: prepared.requestDigest,
    });
    expect(consumed.payload).toEqual(confirmation);
    expect(consumed.prepared).toEqual(prepared);
    expect(consumed.contract).toEqual(MARBLE_CONTRACT);
    expect(store.size).toBe(0);
    expectCode(
      () => store.consume("session:alpha", prepared.generationId, {
        confirmationId: confirmation.confirmationId,
        requestDigest: prepared.requestDigest,
      }),
      "CONFIRMATION_REQUIRED",
    );
  });

  test("public payload stays frozen without idempotencyKey or provider request", () => {
    const { store } = makeStore();
    const prepared = request("private-1");
    const confirmation = store.prepare("session:alpha", prepared, MARBLE_CONTRACT);
    expect(Object.isFrozen(confirmation)).toBe(true);
    expect(confirmation).not.toHaveProperty("idempotencyKey");
    expect(confirmation).not.toHaveProperty("providerRequest");
    expect(confirmation).not.toHaveProperty("contractProfile");
    expect(confirmation).not.toHaveProperty("contractShapeDigest");
    expect(confirmation.canonicalRequest).not.toHaveProperty("idempotencyKey");
  });

  test("inspect returns the private prepared request and contract without consuming", () => {
    const { store } = makeStore();
    const prepared = request("inspect-1");
    const confirmation = store.prepare("session:alpha", prepared, MARBLE_CONTRACT);
    const inspected = store.inspect("session:alpha", prepared.generationId, {
      confirmationId: confirmation.confirmationId,
      requestDigest: prepared.requestDigest,
    });
    expect(inspected.prepared).toEqual(prepared);
    expect(inspected.prepared.idempotencyKey).toBe("inspect-1");
    expect(inspected.contract).toEqual(MARBLE_CONTRACT);
    expect(store.size).toBe(1);
    expectCode(
      () => store.inspect("session:beta", prepared.generationId, {
        confirmationId: confirmation.confirmationId,
        requestDigest: prepared.requestDigest,
      }),
      "CONFIRMATION_REQUIRED",
    );
    expect(store.size).toBe(1);
  });

  test("mismatched binding does not consume the valid token", () => {
    const { store } = makeStore();
    const prepared = request("confirm-2");
    const confirmation = store.prepare("session:alpha", prepared, MARBLE_CONTRACT);
    expectCode(
      () => store.consume("session:alpha", request("other").generationId, {
        confirmationId: confirmation.confirmationId,
        requestDigest: prepared.requestDigest,
      }),
      "CONFIRMATION_REQUIRED",
    );
    expect(store.size).toBe(1);
    store.consume("session:alpha", prepared.generationId, {
      confirmationId: confirmation.confirmationId,
      requestDigest: prepared.requestDigest,
    });
  });

  test("expires by monotonic time and releases accounting", () => {
    const { store, advance } = makeStore();
    const prepared = request("confirm-3");
    const confirmation = store.prepare("session:alpha", prepared, MARBLE_CONTRACT);
    advance(10 * 60 * 1_000 + 1);
    expectCode(
      () => store.inspect("session:alpha", prepared.generationId, {
        confirmationId: confirmation.confirmationId,
        requestDigest: prepared.requestDigest,
      }),
      "CONFIRMATION_EXPIRED",
    );
    expect(store.size).toBe(0);

    const second = store.prepare("session:alpha", request("confirm-3b"), MARBLE_CONTRACT);
    advance(10 * 60 * 1_000 + 1);
    expectCode(
      () => store.consume("session:alpha", second.generationId, {
        confirmationId: second.confirmationId,
        requestDigest: second.requestDigest,
      }),
      "CONFIRMATION_EXPIRED",
    );
    expect(store.size).toBe(0);
  });

  test("enforces 16 confirmations per session without evicting valid entries", () => {
    const { store } = makeStore();
    for (let index = 0; index < 16; index += 1) {
      store.prepare("session:alpha", request(`session-cap-${index}`), MARBLE_CONTRACT);
    }
    expect(store.size).toBe(16);
    expectCode(
      () => store.prepare("session:alpha", request("session-cap-17"), MARBLE_CONTRACT),
      "GENERATION_CAPACITY_REACHED",
    );
    expect(store.size).toBe(16);
  });

  test("enforces the global 256 confirmation cap", () => {
    const { store } = makeStore();
    for (let index = 0; index < 256; index += 1) {
      store.prepare(
        `session:s${Math.floor(index / 16)}`,
        request(`global-${index}`),
        MARBLE_CONTRACT,
      );
    }
    expect(store.size).toBe(256);
    expectCode(
      () => store.prepare("session:overflow", request("global-257"), MARBLE_CONTRACT),
      "GENERATION_CAPACITY_REACHED",
    );
    expect(store.size).toBe(256);
  });

  test("session teardown releases all tokens for that trusted session", () => {
    const { store } = makeStore();
    store.prepare("session:alpha", request("teardown-a"), MARBLE_CONTRACT);
    store.prepare("session:beta", request("teardown-b"), MARBLE_CONTRACT);
    expect(store.releaseSession("session:alpha")).toBe(1);
    expect(store.size).toBe(1);
  });
});
