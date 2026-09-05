import { randomBytes } from "node:crypto";

import { canonicalJsonBytes, deepFreeze } from "@demiurges/world";
import type {
  GenerationCanonicalRequestV1,
  GenerationContractSelectionV1,
  GenerationModelV1,
  GenerationProviderV1,
  PreparedGenerationRequestV1,
} from "@demiurges/world-project";

export const GENERATION_CONFIRMATION_TTL_MS = 10 * 60 * 1_000;
export const GENERATION_CONFIRMATION_MAX_GLOBAL = 256;
export const GENERATION_CONFIRMATION_MAX_PER_SESSION = 16;
export const GENERATION_CONFIRMATION_MAX_BYTES = 16 * 1024;

export type GenerationConfirmationErrorCode =
  | "INVALID_REQUEST"
  | "CONFIRMATION_REQUIRED"
  | "CONFIRMATION_EXPIRED"
  | "GENERATION_CAPACITY_REACHED";

export class GenerationConfirmationError extends Error {
  readonly code: GenerationConfirmationErrorCode;

  constructor(code: GenerationConfirmationErrorCode) {
    super(code);
    this.name = "GenerationConfirmationError";
    this.code = code;
  }
}

export interface GenerationConfirmationV1 {
  readonly confirmationId: string;
  readonly sessionId: string;
  readonly generationId: `generation:sha256:${string}`;
  readonly provider: GenerationProviderV1;
  readonly model: GenerationModelV1;
  readonly canonicalRequest: GenerationCanonicalRequestV1;
  readonly requestDigest: string;
  readonly expiresAt: string;
}

/**
 * inspect/consume 的返回值：公开 payload 加私有 prepared request 与
 * prepare 时注入的 contract selection。prepared/contract 只存在于内存
 * store，绝不进入公开 confirmation payload 或任何响应。
 */
export interface ConsumedGenerationConfirmationV1 {
  readonly payload: GenerationConfirmationV1;
  readonly prepared: PreparedGenerationRequestV1;
  readonly contract: GenerationContractSelectionV1;
}

interface StoredConfirmation {
  readonly payload: GenerationConfirmationV1;
  readonly prepared: PreparedGenerationRequestV1;
  readonly contract: GenerationContractSelectionV1;
  readonly expiresAtMonotonicMs: number;
  readonly byteLength: number;
}

interface GenerationConfirmationStoreOptions {
  readonly monotonicNowMs?: () => number;
  readonly wallNowMs?: () => number;
  readonly nextConfirmationId?: () => string;
}

const SESSION_ID = /^session:[A-Za-z0-9._-]{1,96}$/;
const CONFIRMATION_ID = /^confirmation:[A-Za-z0-9._-]{1,96}$/;
const GENERATION_ID = /^generation:sha256:[a-f0-9]{64}$/;
const HEX_64 = /^[a-f0-9]{64}$/;

function reject(code: GenerationConfirmationErrorCode): never {
  throw new GenerationConfirmationError(code);
}

function requirePattern(value: unknown, pattern: RegExp): string {
  if (typeof value !== "string" || !pattern.test(value)) {
    return reject("INVALID_REQUEST");
  }
  return value;
}

function plainRecord(value: unknown): Record<string, unknown> {
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Object.prototype
  ) {
    return reject("INVALID_REQUEST");
  }
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== "string") return reject("INVALID_REQUEST");
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (
      descriptor === undefined ||
      !("value" in descriptor) ||
      descriptor.enumerable !== true
    ) {
      return reject("INVALID_REQUEST");
    }
  }
  return value as Record<string, unknown>;
}

function exactKeys(
  record: Record<string, unknown>,
  keys: readonly string[],
): void {
  const actual = Reflect.ownKeys(record);
  if (
    actual.length !== keys.length ||
    actual.some((key) => typeof key !== "string") ||
    !keys.every((key) => Object.prototype.hasOwnProperty.call(record, key))
  ) {
    reject("INVALID_REQUEST");
  }
}

function requireClockValue(value: number): number {
  if (!Number.isFinite(value) || value < 0 || Object.is(value, -0)) {
    return reject("GENERATION_CAPACITY_REACHED");
  }
  return value;
}

export class GenerationConfirmationStore {
  readonly #entries = new Map<string, StoredConfirmation>();
  readonly #monotonicNowMs: () => number;
  readonly #wallNowMs: () => number;
  readonly #nextConfirmationId: () => string;

  constructor(options: GenerationConfirmationStoreOptions = {}) {
    this.#monotonicNowMs = options.monotonicNowMs ?? (() => performance.now());
    this.#wallNowMs = options.wallNowMs ?? (() => Date.now());
    this.#nextConfirmationId =
      options.nextConfirmationId ??
      (() => `confirmation:${randomBytes(16).toString("hex")}`);
  }

  get size(): number {
    return this.#entries.size;
  }

  #purgeExpired(nowMonotonicMs: number): void {
    for (const [id, entry] of this.#entries) {
      if (entry.expiresAtMonotonicMs <= nowMonotonicMs) {
        this.#entries.delete(id);
      }
    }
  }

  prepare(
    sessionIdInput: string,
    preparedInput: PreparedGenerationRequestV1,
    contract: GenerationContractSelectionV1,
  ): GenerationConfirmationV1 {
    const sessionId = requirePattern(sessionIdInput, SESSION_ID);
    const prepared = deepFreeze({ ...preparedInput }) as PreparedGenerationRequestV1;
    const monotonicNowMs = requireClockValue(this.#monotonicNowMs());
    const wallNowMs = requireClockValue(this.#wallNowMs());
    this.#purgeExpired(monotonicNowMs);

    let sessionCount = 0;
    for (const entry of this.#entries.values()) {
      if (entry.payload.sessionId === sessionId) sessionCount += 1;
    }
    if (
      this.#entries.size >= GENERATION_CONFIRMATION_MAX_GLOBAL ||
      sessionCount >= GENERATION_CONFIRMATION_MAX_PER_SESSION
    ) {
      return reject("GENERATION_CAPACITY_REACHED");
    }

    const confirmationId = requirePattern(
      this.#nextConfirmationId(),
      CONFIRMATION_ID,
    );
    if (this.#entries.has(confirmationId)) {
      return reject("GENERATION_CAPACITY_REACHED");
    }
    const expiresAt = new Date(
      wallNowMs + GENERATION_CONFIRMATION_TTL_MS,
    ).toISOString();
    const payload = deepFreeze({
      confirmationId,
      sessionId,
      generationId: requirePattern(
        prepared.generationId,
        GENERATION_ID,
      ) as `generation:sha256:${string}`,
      provider: prepared.provider,
      model: prepared.model,
      canonicalRequest: prepared.canonicalRequest,
      requestDigest: requirePattern(prepared.requestDigest, HEX_64),
      expiresAt,
    }) as GenerationConfirmationV1;
    const byteLength = canonicalJsonBytes(payload).byteLength;
    if (byteLength > GENERATION_CONFIRMATION_MAX_BYTES) {
      return reject("GENERATION_CAPACITY_REACHED");
    }
    this.#entries.set(confirmationId, {
      payload,
      prepared,
      contract: deepFreeze({ ...contract }) as GenerationContractSelectionV1,
      expiresAtMonotonicMs:
        monotonicNowMs + GENERATION_CONFIRMATION_TTL_MS,
      byteLength,
    });
    return payload;
  }

  #validate(
    sessionIdInput: string,
    generationIdInput: string,
    value: unknown,
  ): StoredConfirmation {
    const sessionId = requirePattern(sessionIdInput, SESSION_ID);
    const generationId = requirePattern(generationIdInput, GENERATION_ID);
    const record = plainRecord(value);
    exactKeys(record, ["confirmationId", "requestDigest"]);
    const confirmationId = requirePattern(record.confirmationId, CONFIRMATION_ID);
    const requestDigest = requirePattern(record.requestDigest, HEX_64);
    const stored = this.#entries.get(confirmationId);
    if (stored === undefined) return reject("CONFIRMATION_REQUIRED");

    const monotonicNowMs = requireClockValue(this.#monotonicNowMs());
    if (stored.expiresAtMonotonicMs <= monotonicNowMs) {
      this.#entries.delete(confirmationId);
      return reject("CONFIRMATION_EXPIRED");
    }
    if (
      stored.payload.sessionId !== sessionId ||
      stored.payload.generationId !== generationId ||
      stored.payload.requestDigest !== requestDigest
    ) {
      return reject("CONFIRMATION_REQUIRED");
    }
    return stored;
  }

  /** 只读校验：不消费 token，返回私有 prepared request 与 contract。 */
  inspect(
    sessionIdInput: string,
    generationIdInput: string,
    value: unknown,
  ): ConsumedGenerationConfirmationV1 {
    const stored = this.#validate(sessionIdInput, generationIdInput, value);
    return {
      payload: stored.payload,
      prepared: stored.prepared,
      contract: stored.contract,
    };
  }

  /** 原子消费：exact 校验通过后删除 token，并返回私有 prepared/contract。 */
  consume(
    sessionIdInput: string,
    generationIdInput: string,
    value: unknown,
  ): ConsumedGenerationConfirmationV1 {
    const stored = this.#validate(sessionIdInput, generationIdInput, value);
    this.#entries.delete(stored.payload.confirmationId);
    return {
      payload: stored.payload,
      prepared: stored.prepared,
      contract: stored.contract,
    };
  }

  releaseSession(sessionIdInput: string): number {
    const sessionId = requirePattern(sessionIdInput, SESSION_ID);
    let released = 0;
    for (const [id, entry] of this.#entries) {
      if (entry.payload.sessionId === sessionId) {
        this.#entries.delete(id);
        released += 1;
      }
    }
    return released;
  }
}
