import {
  canonicalJsonBytes,
  deepFreeze,
  sha256Hex,
} from "@demiurges/world";

export const GENERATION_REQUEST_MAX_BYTES = 16 * 1024;
export const GENERATION_PROMPT_MAX_SCALARS = 1024;
export const GENERATION_PROMPT_MAX_BYTES = 4096;

export const MARBLE_MODELS = Object.freeze([
  "marble-1.0-draft",
  "marble-1.0",
  "marble-1.1",
  "marble-1.1-plus",
] as const);
export const HUNYUAN_MODELS = Object.freeze(["3.0", "3.1"] as const);

export type GenerationProviderV1 =
  | "worldlabs-marble-v1"
  | "hunyuan-ai3d-v1";

export type MarbleModelV1 = (typeof MARBLE_MODELS)[number];
export type HunyuanModelV1 = (typeof HUNYUAN_MODELS)[number];
export type GenerationModelV1 = MarbleModelV1 | HunyuanModelV1;

export type GenerationContractProfileV1 =
  | "worldlabs-openapi-2026-08-15-v1"
  | "cloud-response-v1"
  | "compat-top-level-v1";

/** 注入式 contract 选择：只有 profile 与 lowercase 64-hex shape digest，不含任何 credential。 */
export interface GenerationContractSelectionV1 {
  readonly contractProfile: GenerationContractProfileV1;
  readonly contractShapeDigest: string;
}

export type GenerationCodecErrorCode =
  | "INVALID_REQUEST"
  | "GENERATION_RECOVERY_REQUIRED";

export class GenerationCodecError extends Error {
  readonly code: GenerationCodecErrorCode;

  constructor(code: GenerationCodecErrorCode) {
    super(code);
    this.name = "GenerationCodecError";
    this.code = code;
  }
}

export interface MarbleCanonicalRequestV1 {
  readonly provider: "worldlabs-marble-v1";
  readonly model: MarbleModelV1;
  readonly prompt: string;
  readonly seed?: number;
  readonly costUnknownAccepted: true;
  readonly waitForCompletionAndDownload: true;
}

export interface HunyuanCanonicalRequestV1 {
  readonly provider: "hunyuan-ai3d-v1";
  readonly model: HunyuanModelV1;
  readonly prompt: string;
  readonly costUnknownAccepted: true;
  readonly waitForCompletionAndDownload: true;
}

export type GenerationCanonicalRequestV1 =
  | MarbleCanonicalRequestV1
  | HunyuanCanonicalRequestV1;

export interface MarbleProviderRequestV1 {
  readonly world_prompt: {
    readonly type: "text";
    readonly text_prompt: string;
    readonly disable_recaption: true;
  };
  readonly display_name: string;
  readonly model: MarbleModelV1;
  readonly permission: {
    readonly public: false;
    readonly allow_id_access: false;
    readonly allowed_readers: readonly [];
    readonly allowed_writers: readonly [];
  };
  readonly seed?: number;
}

export interface HunyuanProviderRequestV1 {
  readonly Prompt: string;
  readonly Model: HunyuanModelV1;
}

export type GenerationProviderRequestV1 =
  | MarbleProviderRequestV1
  | HunyuanProviderRequestV1;

export interface PreparedGenerationRequestV1 {
  readonly generationId: `generation:sha256:${string}`;
  readonly idempotencyKey: string;
  readonly provider: GenerationProviderV1;
  readonly model: GenerationModelV1;
  readonly canonicalRequest: GenerationCanonicalRequestV1;
  readonly providerRequest: GenerationProviderRequestV1;
  readonly requestDigest: string;
}

export interface GenerationBindingBodyV1 {
  readonly schemaVersion: 1;
  readonly generationId: `generation:sha256:${string}`;
  readonly idempotencyKey: string;
  readonly provider: GenerationProviderV1;
  readonly model: GenerationModelV1;
  readonly contractProfile: GenerationContractProfileV1;
  readonly contractShapeDigest: string;
  readonly requestDigest: string;
  readonly canonicalRequest: GenerationCanonicalRequestV1;
  readonly providerRequest: GenerationProviderRequestV1;
  readonly costPolicy: "unknown-accepted";
  readonly executionPolicy: "wait-and-download";
}

export interface GenerationIntentV1 extends GenerationBindingBodyV1 {
  readonly bindingDigest: string;
  readonly createdAt: string;
}

type PlainRecord = Record<string, unknown>;

const HEX_64 = /^[a-f0-9]{64}$/;
const IDEMPOTENCY_KEY = /^[A-Za-z0-9._-]{1,96}$/;
const RFC3339_MILLISECONDS =
  /^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{3}Z$/;
const FORBIDDEN_PROMPT_CONTROLS =
  /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/u;

function invalid(): never {
  throw new GenerationCodecError("INVALID_REQUEST");
}

function plainRecord(value: unknown): PlainRecord {
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Object.prototype
  ) {
    return invalid();
  }
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== "string") return invalid();
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (
      descriptor === undefined ||
      !("value" in descriptor) ||
      descriptor.enumerable !== true
    ) {
      return invalid();
    }
  }
  return value as PlainRecord;
}

function exactKeys(record: PlainRecord, keys: readonly string[]): void {
  const actual = Reflect.ownKeys(record);
  if (
    actual.length !== keys.length ||
    actual.some((key) => typeof key !== "string") ||
    !keys.every((key) => Object.prototype.hasOwnProperty.call(record, key))
  ) {
    invalid();
  }
}

function requireString(
  value: unknown,
  pattern: RegExp,
  maxScalars: number,
): string {
  if (
    typeof value !== "string" ||
    Array.from(value).length > maxScalars ||
    !pattern.test(value)
  ) {
    return invalid();
  }
  return value;
}

function bytesWithDomain(domain: string, body: Uint8Array): Uint8Array {
  const prefix = new TextEncoder().encode(`${domain}\u0000`);
  const combined = new Uint8Array(prefix.byteLength + body.byteLength);
  combined.set(prefix, 0);
  combined.set(body, prefix.byteLength);
  return combined;
}

function sameCanonicalBytes(left: unknown, right: unknown): boolean {
  return Buffer.from(canonicalJsonBytes(left)).equals(
    Buffer.from(canonicalJsonBytes(right)),
  );
}

function requirePrompt(value: unknown): string {
  if (typeof value !== "string") return invalid();
  const prompt = value.normalize("NFC");
  const scalarCount = Array.from(prompt).length;
  const byteLength = new TextEncoder().encode(prompt).byteLength;
  if (
    scalarCount < 1 ||
    scalarCount > GENERATION_PROMPT_MAX_SCALARS ||
    byteLength < 1 ||
    byteLength > GENERATION_PROMPT_MAX_BYTES ||
    FORBIDDEN_PROMPT_CONTROLS.test(prompt)
  ) {
    return invalid();
  }
  return prompt;
}

function requireIdempotencyKey(value: unknown): string {
  return requireString(value, IDEMPOTENCY_KEY, 96);
}

function requireShapeDigest(value: unknown): string {
  return requireString(value, HEX_64, 64);
}

function requireCanonicalTimestamp(value: unknown): string {
  if (
    typeof value !== "string" ||
    !RFC3339_MILLISECONDS.test(value) ||
    new Date(value).toISOString() !== value
  ) {
    return invalid();
  }
  return value;
}

function marbleProviderRequest(
  canonical: MarbleCanonicalRequestV1,
  generationId: `generation:sha256:${string}`,
): MarbleProviderRequestV1 {
  const digest = generationId.slice("generation:sha256:".length);
  const base = {
    world_prompt: {
      type: "text" as const,
      text_prompt: canonical.prompt,
      disable_recaption: true as const,
    },
    display_name: `Demiurges ${digest.slice(0, 12)}`,
    model: canonical.model,
    permission: {
      public: false as const,
      allow_id_access: false as const,
      allowed_readers: [] as const,
      allowed_writers: [] as const,
    },
  };
  return canonical.seed === undefined
    ? base
    : { ...base, seed: canonical.seed };
}

function requestFromRecord(
  input: PlainRecord,
): {
  canonicalRequest: GenerationCanonicalRequestV1;
  providerRequest: GenerationProviderRequestV1;
  generationId: `generation:sha256:${string}`;
  idempotencyKey: string;
  provider: GenerationProviderV1;
  model: GenerationModelV1;
} {
  const provider = input.provider;
  if (provider === "worldlabs-marble-v1") {
    const hasSeed = Object.prototype.hasOwnProperty.call(input, "seed");
    exactKeys(input, hasSeed
      ? [
          "provider",
          "model",
          "prompt",
          "seed",
          "costUnknownAccepted",
          "waitForCompletionAndDownload",
          "idempotencyKey",
        ]
      : [
          "provider",
          "model",
          "prompt",
          "costUnknownAccepted",
          "waitForCompletionAndDownload",
          "idempotencyKey",
        ]);
    if (!(MARBLE_MODELS as readonly unknown[]).includes(input.model)) invalid();
    if (
      input.costUnknownAccepted !== true ||
      input.waitForCompletionAndDownload !== true
    ) {
      invalid();
    }
    if (
      hasSeed &&
      (!Number.isSafeInteger(input.seed) ||
        (input.seed as number) < 0 ||
        (input.seed as number) > 4_294_967_295 ||
        Object.is(input.seed, -0))
    ) {
      invalid();
    }
    const idempotencyKey = requireIdempotencyKey(input.idempotencyKey);
    const generationId = generationIdFromIdempotencyKey(idempotencyKey);
    const base = {
      provider: "worldlabs-marble-v1" as const,
      model: input.model as MarbleModelV1,
      prompt: requirePrompt(input.prompt),
      costUnknownAccepted: true as const,
      waitForCompletionAndDownload: true as const,
    };
    const canonicalRequest: MarbleCanonicalRequestV1 = hasSeed
      ? { ...base, seed: input.seed as number }
      : base;
    return {
      canonicalRequest,
      providerRequest: marbleProviderRequest(canonicalRequest, generationId),
      generationId,
      idempotencyKey,
      provider: "worldlabs-marble-v1",
      model: canonicalRequest.model,
    };
  }

  if (provider === "hunyuan-ai3d-v1") {
    exactKeys(input, [
      "provider",
      "model",
      "prompt",
      "costUnknownAccepted",
      "waitForCompletionAndDownload",
      "idempotencyKey",
    ]);
    if (!(HUNYUAN_MODELS as readonly unknown[]).includes(input.model)) invalid();
    if (
      input.costUnknownAccepted !== true ||
      input.waitForCompletionAndDownload !== true
    ) {
      invalid();
    }
    const idempotencyKey = requireIdempotencyKey(input.idempotencyKey);
    const generationId = generationIdFromIdempotencyKey(idempotencyKey);
    const canonicalRequest: HunyuanCanonicalRequestV1 = {
      provider: "hunyuan-ai3d-v1",
      model: input.model as HunyuanModelV1,
      prompt: requirePrompt(input.prompt),
      costUnknownAccepted: true,
      waitForCompletionAndDownload: true,
    };
    return {
      canonicalRequest,
      providerRequest: {
        Prompt: canonicalRequest.prompt,
        Model: canonicalRequest.model,
      },
      generationId,
      idempotencyKey,
      provider: "hunyuan-ai3d-v1",
      model: canonicalRequest.model,
    };
  }

  return invalid();
}

function requestFromCanonical(
  canonicalRequestValue: unknown,
  idempotencyKeyValue: unknown,
): ReturnType<typeof requestFromRecord> {
  const canonicalRequest = plainRecord(canonicalRequestValue);
  const request = {
    ...canonicalRequest,
    idempotencyKey: requireIdempotencyKey(idempotencyKeyValue),
  };
  return requestFromRecord(plainRecord(request));
}

export function generationIdFromIdempotencyKey(
  idempotencyKeyInput: string,
): `generation:sha256:${string}` {
  const idempotencyKey = requireIdempotencyKey(idempotencyKeyInput);
  return `generation:sha256:${sha256Hex(
    bytesWithDomain(
      "demiurges-generation-id-v1",
      new TextEncoder().encode(idempotencyKey),
    ),
  )}`;
}

export function generationRequestDigest(
  canonicalRequest: GenerationCanonicalRequestV1,
): string {
  return sha256Hex(
    bytesWithDomain(
      "demiurges-generation-request-v1",
      canonicalJsonBytes(canonicalRequest),
    ),
  );
}

export function generationBindingDigest(
  bindingInput: GenerationBindingBodyV1,
): string {
  const binding = requireGenerationBindingBody(bindingInput);
  return sha256Hex(
    bytesWithDomain(
      "demiurges-generation-binding-v1",
      canonicalJsonBytes(binding),
    ),
  );
}

export function generationIntentDigest(
  intentInput: GenerationIntentV1,
): string {
  const intent = requireGenerationIntent(intentInput);
  return sha256Hex(
    bytesWithDomain(
      "demiurges-generation-intent-v1",
      canonicalJsonBytes(intent),
    ),
  );
}

export function requireGenerationRequest(
  value: unknown,
): PreparedGenerationRequestV1 {
  const request = requestFromRecord(plainRecord(value));
  const prepared = {
    ...request,
    requestDigest: generationRequestDigest(request.canonicalRequest),
  };
  if (canonicalJsonBytes(prepared).byteLength > GENERATION_REQUEST_MAX_BYTES) {
    return invalid();
  }
  return deepFreeze(prepared) as PreparedGenerationRequestV1;
}

function requireContractProfile(
  provider: GenerationProviderV1,
  value: unknown,
): GenerationContractProfileV1 {
  if (
    provider === "worldlabs-marble-v1" &&
    value === "worldlabs-openapi-2026-08-15-v1"
  ) {
    return value;
  }
  if (
    provider === "hunyuan-ai3d-v1" &&
    (value === "cloud-response-v1" || value === "compat-top-level-v1")
  ) {
    return value;
  }
  return invalid();
}

export function createGenerationBinding(
  preparedInput: PreparedGenerationRequestV1,
  contract: {
    readonly contractProfile: GenerationContractProfileV1;
    readonly contractShapeDigest: string;
  },
): GenerationBindingBodyV1 {
  const prepared = requestFromCanonical(
    preparedInput.canonicalRequest,
    preparedInput.idempotencyKey,
  );
  if (
    preparedInput.generationId !== prepared.generationId ||
    preparedInput.provider !== prepared.provider ||
    preparedInput.model !== prepared.model ||
    preparedInput.requestDigest !== generationRequestDigest(prepared.canonicalRequest) ||
    !sameCanonicalBytes(preparedInput.providerRequest, prepared.providerRequest)
  ) {
    return invalid();
  }
  return requireGenerationBindingBody({
    schemaVersion: 1,
    generationId: prepared.generationId,
    idempotencyKey: prepared.idempotencyKey,
    provider: prepared.provider,
    model: prepared.model,
    contractProfile: requireContractProfile(
      prepared.provider,
      contract.contractProfile,
    ),
    contractShapeDigest: requireShapeDigest(contract.contractShapeDigest),
    requestDigest: generationRequestDigest(prepared.canonicalRequest),
    canonicalRequest: prepared.canonicalRequest,
    providerRequest: prepared.providerRequest,
    costPolicy: "unknown-accepted",
    executionPolicy: "wait-and-download",
  });
}

export function requireGenerationBindingBody(
  value: unknown,
): GenerationBindingBodyV1 {
  const record = plainRecord(value);
  exactKeys(record, [
    "schemaVersion",
    "generationId",
    "idempotencyKey",
    "provider",
    "model",
    "contractProfile",
    "contractShapeDigest",
    "requestDigest",
    "canonicalRequest",
    "providerRequest",
    "costPolicy",
    "executionPolicy",
  ]);
  if (
    record.schemaVersion !== 1 ||
    record.costPolicy !== "unknown-accepted" ||
    record.executionPolicy !== "wait-and-download"
  ) {
    return invalid();
  }
  const request = requestFromCanonical(
    record.canonicalRequest,
    record.idempotencyKey,
  );
  if (
    record.generationId !== request.generationId ||
    record.provider !== request.provider ||
    record.model !== request.model ||
    record.requestDigest !== generationRequestDigest(request.canonicalRequest) ||
    !sameCanonicalBytes(record.canonicalRequest, request.canonicalRequest) ||
    !sameCanonicalBytes(record.providerRequest, request.providerRequest)
  ) {
    return invalid();
  }
  const binding: GenerationBindingBodyV1 = {
    schemaVersion: 1,
    generationId: request.generationId,
    idempotencyKey: request.idempotencyKey,
    provider: request.provider,
    model: request.model,
    contractProfile: requireContractProfile(
      request.provider,
      record.contractProfile,
    ),
    contractShapeDigest: requireShapeDigest(record.contractShapeDigest),
    requestDigest: record.requestDigest as string,
    canonicalRequest: request.canonicalRequest,
    providerRequest: request.providerRequest,
    costPolicy: "unknown-accepted",
    executionPolicy: "wait-and-download",
  };
  return deepFreeze(binding) as GenerationBindingBodyV1;
}

/**
 * Validated intent 的 canonical binding body projection。body 层 exact-key
 * 校验仍由 `requireGenerationBindingBody` 完成；provider transport 边界只接受
 * exact `GenerationBindingBodyV1`，不能直接吞下带 `bindingDigest/createdAt` 的
 * intent。
 */
export function requireGenerationBindingBodyFromIntent(
  intentInput: unknown,
): GenerationBindingBodyV1 {
  const intent = requireGenerationIntent(intentInput);
  return requireGenerationBindingBody({
    schemaVersion: intent.schemaVersion,
    generationId: intent.generationId,
    idempotencyKey: intent.idempotencyKey,
    provider: intent.provider,
    model: intent.model,
    contractProfile: intent.contractProfile,
    contractShapeDigest: intent.contractShapeDigest,
    requestDigest: intent.requestDigest,
    canonicalRequest: intent.canonicalRequest,
    providerRequest: intent.providerRequest,
    costPolicy: intent.costPolicy,
    executionPolicy: intent.executionPolicy,
  });
}

export function createGenerationIntent(
  bindingInput: GenerationBindingBodyV1,
  createdAtInput: string,
): GenerationIntentV1 {
  const binding = requireGenerationBindingBody(bindingInput);
  return requireGenerationIntent({
    ...binding,
    bindingDigest: generationBindingDigest(binding),
    createdAt: requireCanonicalTimestamp(createdAtInput),
  });
}

export function requireGenerationIntent(value: unknown): GenerationIntentV1 {
  const record = plainRecord(value);
  exactKeys(record, [
    "schemaVersion",
    "generationId",
    "idempotencyKey",
    "provider",
    "model",
    "contractProfile",
    "contractShapeDigest",
    "requestDigest",
    "canonicalRequest",
    "providerRequest",
    "costPolicy",
    "executionPolicy",
    "bindingDigest",
    "createdAt",
  ]);
  const binding = requireGenerationBindingBody({
    schemaVersion: record.schemaVersion,
    generationId: record.generationId,
    idempotencyKey: record.idempotencyKey,
    provider: record.provider,
    model: record.model,
    contractProfile: record.contractProfile,
    contractShapeDigest: record.contractShapeDigest,
    requestDigest: record.requestDigest,
    canonicalRequest: record.canonicalRequest,
    providerRequest: record.providerRequest,
    costPolicy: record.costPolicy,
    executionPolicy: record.executionPolicy,
  });
  const bindingDigest = generationBindingDigest(binding);
  if (record.bindingDigest !== bindingDigest) return invalid();
  const intent: GenerationIntentV1 = {
    ...binding,
    bindingDigest,
    createdAt: requireCanonicalTimestamp(record.createdAt),
  };
  return deepFreeze(intent) as GenerationIntentV1;
}
