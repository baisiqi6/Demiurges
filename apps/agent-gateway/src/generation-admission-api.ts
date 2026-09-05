import {
  GENERATION_REQUEST_MAX_BYTES,
  GenerationCodecError,
  createGenerationBinding,
  createGenerationIntent,
  requireGenerationRequest,
  type FirstGenerationInspectionV1,
  type GenerationBindingBodyV1,
  type GenerationContractProfileV1,
  type GenerationContractSelectionV1,
  type GenerationIntentV1,
  type GenerationProviderV1,
  type PreparedGenerationRequestV1,
  type WorldProjectFirstGenerationFacade,
} from "@demiurges/world-project";

import {
  GenerationConfirmationError,
  GenerationConfirmationStore,
  type GenerationConfirmationV1,
} from "./generation-confirmation";
import { parseExactJsonBytes } from "./generation-provider-codecs";

const SESSION_ID = /^session:[A-Za-z0-9._-]{1,96}$/;
const GENERATION_ID = /^generation:sha256:[a-f0-9]{64}$/;
const CONFIRMATION_ID = /^confirmation:[A-Za-z0-9._-]{1,96}$/;
const HEX_64 = /^[a-f0-9]{64}$/;
const CONTRACT_PROFILE =
  /^(?:worldlabs-openapi-2026-08-15-v1|cloud-response-v1|compat-top-level-v1)$/;
const DEFAULT_GATEWAY_BODY_TIMEOUT_MS = 5_000;

export type GenerationAdmissionErrorCode =
  | "INVALID_REQUEST"
  | "SESSION_NOT_FOUND"
  | "METHOD_NOT_ALLOWED"
  | "REQUEST_ABORTED"
  | "REQUEST_BODY_TIMEOUT"
  | "REQUEST_BODY_READ_FAILED"
  | "REQUEST_TOO_LARGE"
  | "UNSUPPORTED_MEDIA_TYPE"
  | "CONFIRMATION_REQUIRED"
  | "CONFIRMATION_EXPIRED"
  | "OPERATION_BINDING_CONFLICT"
  | "PROVIDER_CONTRACT_MISMATCH"
  | "GENERATION_CAPACITY_REACHED"
  | "GENERATION_RECOVERY_REQUIRED"
  | "DATA_ROOT_UNAVAILABLE"
  | "GENERATION_REQUEST_FAILED";

const ADMISSION_ERROR_STATUS = Object.freeze({
  INVALID_REQUEST: 400,
  SESSION_NOT_FOUND: 404,
  METHOD_NOT_ALLOWED: 405,
  REQUEST_ABORTED: 408,
  REQUEST_BODY_TIMEOUT: 408,
  REQUEST_BODY_READ_FAILED: 400,
  REQUEST_TOO_LARGE: 413,
  UNSUPPORTED_MEDIA_TYPE: 415,
  CONFIRMATION_REQUIRED: 409,
  CONFIRMATION_EXPIRED: 410,
  OPERATION_BINDING_CONFLICT: 409,
  PROVIDER_CONTRACT_MISMATCH: 409,
  GENERATION_CAPACITY_REACHED: 503,
  GENERATION_RECOVERY_REQUIRED: 409,
  DATA_ROOT_UNAVAILABLE: 503,
  GENERATION_REQUEST_FAILED: 500,
} as const);

/** package 内部错误码（facade/journal/capacity 抛出的 stable message code）映射。 */
const MESSAGE_CODE_STATUS: Record<string, number> = Object.freeze({
  GENERATION_RECOVERY_REQUIRED: 409,
  OPERATION_RECOVERY_REQUIRED: 409,
  DATA_ROOT_READ_ONLY: 409,
  DATA_ROOT_UNAVAILABLE: 503,
});

export class GenerationAdmissionError extends Error {
  readonly code: GenerationAdmissionErrorCode;

  constructor(code: GenerationAdmissionErrorCode) {
    super(code);
    this.name = "GenerationAdmissionError";
    this.code = code;
  }
}

function reject(code: GenerationAdmissionErrorCode): never {
  throw new GenerationAdmissionError(code);
}

type RequestBodyErrorCode =
  | "REQUEST_ABORTED"
  | "REQUEST_BODY_TIMEOUT"
  | "REQUEST_BODY_READ_FAILED"
  | "REQUEST_BODY_BUDGET_EXCEEDED";

class RequestBodyError extends Error {
  readonly code: RequestBodyErrorCode;

  constructor(code: RequestBodyErrorCode) {
    super(code);
    this.name = "RequestBodyError";
    this.code = code;
  }
}

function jsonResponse(value: unknown, status = 200): Response {
  return Response.json(value, {
    status,
    headers: {
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    },
  });
}

function errorResponse(status: number, code: string): Response {
  return jsonResponse({ error: code }, status);
}

function mediaType(value: string | null): string {
  return (value ?? "").split(";", 1)[0]?.trim().toLowerCase() ?? "";
}

function mapConfirmationCode(
  code: GenerationConfirmationError["code"],
): GenerationAdmissionErrorCode {
  if (code === "CONFIRMATION_REQUIRED") return "CONFIRMATION_REQUIRED";
  if (code === "CONFIRMATION_EXPIRED") return "CONFIRMATION_EXPIRED";
  if (code === "GENERATION_CAPACITY_REACHED") return "GENERATION_CAPACITY_REACHED";
  return "INVALID_REQUEST";
}

function mapError(error: unknown): Response {
  if (error instanceof GenerationAdmissionError) {
    return errorResponse(ADMISSION_ERROR_STATUS[error.code], error.code);
  }
  if (error instanceof GenerationConfirmationError) {
    const code = mapConfirmationCode(error.code);
    return errorResponse(ADMISSION_ERROR_STATUS[code], code);
  }
  if (error instanceof GenerationCodecError) {
    return errorResponse(ADMISSION_ERROR_STATUS.INVALID_REQUEST, "INVALID_REQUEST");
  }
  if (error instanceof RequestBodyError) {
    const code = error.code === "REQUEST_BODY_BUDGET_EXCEEDED"
      ? "REQUEST_TOO_LARGE"
      : error.code;
    return errorResponse(ADMISSION_ERROR_STATUS[code as GenerationAdmissionErrorCode], code);
  }
  if (
    error instanceof Error &&
    Object.prototype.hasOwnProperty.call(MESSAGE_CODE_STATUS, error.message)
  ) {
    const code = error.message as keyof typeof MESSAGE_CODE_STATUS;
    return errorResponse(MESSAGE_CODE_STATUS[code], code);
  }
  return errorResponse(
    ADMISSION_ERROR_STATUS.GENERATION_REQUEST_FAILED,
    "GENERATION_REQUEST_FAILED",
  );
}

async function readBoundedRequestBody(
  request: Request,
  maxBytes: number,
  timeoutMs: number,
): Promise<Uint8Array> {
  if (request.signal.aborted) throw new RequestBodyError("REQUEST_ABORTED");
  const reader = request.body?.getReader();
  if (reader === undefined) throw new RequestBodyError("REQUEST_BODY_READ_FAILED");
  const deadlineAt = Date.now() + timeoutMs;
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  try {
    while (true) {
      const remainingMs = deadlineAt - Date.now();
      if (remainingMs <= 0) throw new RequestBodyError("REQUEST_BODY_TIMEOUT");
      const result = await new Promise<Awaited<ReturnType<typeof reader.read>>>(
        (resolve, rejectPromise) => {
          let settled = false;
          const finish = (callback: () => void) => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            request.signal.removeEventListener("abort", onAbort);
            callback();
          };
          const onAbort = () => finish(() =>
            rejectPromise(new RequestBodyError("REQUEST_ABORTED")));
          const timer = setTimeout(() => finish(() =>
            rejectPromise(new RequestBodyError("REQUEST_BODY_TIMEOUT"))), remainingMs);
          request.signal.addEventListener("abort", onAbort, { once: true });
          reader.read().then(
            (value) => finish(() => resolve(value)),
            () => finish(() =>
              rejectPromise(new RequestBodyError("REQUEST_BODY_READ_FAILED"))),
          );
          if (request.signal.aborted) onAbort();
        },
      );
      if (result.done) break;
      totalBytes += result.value.byteLength;
      if (!Number.isSafeInteger(totalBytes) || totalBytes > maxBytes) {
        throw new RequestBodyError("REQUEST_BODY_BUDGET_EXCEEDED");
      }
      chunks.push(result.value);
    }
  } catch (error) {
    void reader.cancel(error).catch(() => undefined);
    throw error;
  } finally {
    try {
      reader.releaseLock();
    } catch {
      // cancel/release 是 best effort；请求已经由稳定 public code 收束。
    }
  }
  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

/**
 * strict application/json + bounded bytes + fatal UTF-8 + duplicate-key
 * rejection（复用 provider codec 的 exact parser）。
 */
async function readGenerationJsonBody(
  request: Request,
  timeoutMs: number,
): Promise<unknown> {
  if (mediaType(request.headers.get("content-type")) !== "application/json") {
    reject("UNSUPPORTED_MEDIA_TYPE");
  }
  const lengthHeader = request.headers.get("content-length");
  if (lengthHeader !== null && !/^\d+$/.test(lengthHeader)) {
    reject("INVALID_REQUEST");
  }
  if (
    lengthHeader !== null &&
    Number(lengthHeader) > GENERATION_REQUEST_MAX_BYTES
  ) {
    reject("REQUEST_TOO_LARGE");
  }
  let bytes: Uint8Array;
  try {
    bytes = await readBoundedRequestBody(
      request,
      GENERATION_REQUEST_MAX_BYTES,
      timeoutMs,
    );
  } catch (error) {
    if (
      error instanceof RequestBodyError &&
      error.code === "REQUEST_BODY_BUDGET_EXCEEDED"
    ) {
      reject("REQUEST_TOO_LARGE");
    }
    throw error;
  }
  try {
    return parseExactJsonBytes(bytes);
  } catch {
    reject("INVALID_REQUEST");
  }
}

function plainRecord(value: unknown): Record<string, unknown> {
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Object.prototype
  ) {
    reject("INVALID_REQUEST");
  }
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== "string") reject("INVALID_REQUEST");
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (
      descriptor === undefined ||
      !("value" in descriptor) ||
      descriptor.enumerable !== true
    ) {
      reject("INVALID_REQUEST");
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

function requireConfirmBody(value: unknown): {
  readonly confirmationId: string;
  readonly requestDigest: string;
} {
  const record = plainRecord(value);
  exactKeys(record, ["confirmationId", "requestDigest"]);
  const confirmationId = record.confirmationId;
  const requestDigest = record.requestDigest;
  if (typeof confirmationId !== "string" || !CONFIRMATION_ID.test(confirmationId)) {
    reject("INVALID_REQUEST");
  }
  if (typeof requestDigest !== "string" || !HEX_64.test(requestDigest)) {
    reject("INVALID_REQUEST");
  }
  return { confirmationId, requestDigest };
}

function decodeSegment(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return reject("INVALID_REQUEST");
  }
}

function parseGenerationRoute(pathname: string):
  | { readonly sessionId: string; readonly operation: "prepare" }
  | {
      readonly sessionId: string;
      readonly generationId: string;
      readonly operation: "confirm";
    }
  | undefined {
  const prepare = pathname.match(
    /^\/api\/sessions\/([^/]+)\/generations\/prepare$/,
  );
  if (prepare !== null) {
    return { sessionId: decodeSegment(prepare[1]!), operation: "prepare" };
  }
  const confirm = pathname.match(
    /^\/api\/sessions\/([^/]+)\/generations\/([^/]+)\/confirm$/,
  );
  if (confirm !== null) {
    return {
      sessionId: decodeSegment(confirm[1]!),
      generationId: decodeSegment(confirm[2]!),
      operation: "confirm",
    };
  }
  return undefined;
}

/** 单 generation 的 in-memory single-flight：同一 key 只有一个 leader。 */
class GenerationSingleFlight {
  readonly #inFlight = new Map<string, Promise<void>>();

  run(key: string, leader: () => Promise<void> | void): Promise<void> {
    const existing = this.#inFlight.get(key);
    if (existing !== undefined) return existing;
    const promise = Promise.resolve()
      .then(leader)
      .finally(() => {
        this.#inFlight.delete(key);
      });
    this.#inFlight.set(key, promise);
    return promise;
  }
}

function sameContract(
  left: GenerationContractSelectionV1,
  right: GenerationContractSelectionV1,
): boolean {
  return (
    left.contractProfile === right.contractProfile &&
    left.contractShapeDigest === right.contractShapeDigest
  );
}

function previewOf(confirmation: GenerationConfirmationV1): {
  readonly prompt: string;
  readonly seed?: number;
} {
  const preview: { prompt: string; seed?: number } = {
    prompt: confirmation.canonicalRequest.prompt,
  };
  if (
    confirmation.canonicalRequest.provider === "worldlabs-marble-v1" &&
    confirmation.canonicalRequest.seed !== undefined
  ) {
    preview.seed = confirmation.canonicalRequest.seed;
  }
  return preview;
}

let beforeDurableAdmissionHook: () => Promise<void> | void = () => undefined;

/** Focused fault/concurrency injection only. */
export const GENERATION_ADMISSION_API_TEST_SEAMS = Object.freeze({
  replaceBeforeDurableAdmissionHook(
    replacement: () => Promise<void> | void,
  ): () => void {
    const previous = beforeDurableAdmissionHook;
    beforeDurableAdmissionHook = replacement;
    return () => {
      if (beforeDurableAdmissionHook === replacement) {
        beforeDurableAdmissionHook = previous;
      }
    };
  },
});

/** 注入式 contract 配置：provider 从 profile 推导，不读取任何 credential。 */
export interface GenerationContractConfigV1 {
  readonly provider: GenerationProviderV1;
  readonly contractProfile: GenerationContractProfileV1;
  readonly contractShapeDigest: string;
}

/**
 * 从环境读取单 provider contract 配置。两个变量必须成对出现；
 * 都不存在返回 undefined（routes 稳定失败 PROVIDER_CONTRACT_MISMATCH）。
 */
export function resolveGenerationContractConfig(
  env: Record<string, string | undefined>,
): GenerationContractConfigV1 | undefined {
  const profile = env.DEMIURGES_GENERATION_CONTRACT_PROFILE;
  const shapeDigest = env.DEMIURGES_GENERATION_CONTRACT_SHAPE_DIGEST;
  if (profile === undefined && shapeDigest === undefined) return undefined;
  if (profile === undefined || shapeDigest === undefined) {
    throw new Error(
      "DEMIURGES_GENERATION_CONTRACT_PROFILE 与 DEMIURGES_GENERATION_CONTRACT_SHAPE_DIGEST 必须成对配置",
    );
  }
  if (!CONTRACT_PROFILE.test(profile)) {
    throw new Error(`未知 generation contract profile: ${profile}`);
  }
  if (!HEX_64.test(shapeDigest)) {
    throw new Error("DEMIURGES_GENERATION_CONTRACT_SHAPE_DIGEST 必须是 64 位 lowercase hex");
  }
  const provider: GenerationProviderV1 = profile.startsWith("worldlabs")
    ? "worldlabs-marble-v1"
    : "hunyuan-ai3d-v1";
  return {
    provider,
    contractProfile: profile as GenerationContractProfileV1,
    contractShapeDigest: shapeDigest,
  };
}

export interface GenerationAdmissionApiOptions {
  readonly confirmations: GenerationConfirmationStore;
  /** null = 无 Data Root writer（reader/unavailable），confirm 稳定 503。 */
  readonly firstGeneration: WorldProjectFirstGenerationFacade | null;
  /** 注入式 server 配置；undefined 或 provider 不匹配 = PROVIDER_CONTRACT_MISMATCH。 */
  readonly contract?: GenerationContractConfigV1;
  /** 受信 wall clock，输出 RFC3339 毫秒 UTC。 */
  readonly clock?: () => string;
  readonly bodyTimeoutMs?: number;
  /** 当前 Gateway 的 active ProductSession registry 查询。 */
  readonly hasSession: (sessionId: string) => boolean;
}

/**
 * Confirmed durable admission HTTP adapter。只拥有两条 exact route：
 *
 *   POST /api/sessions/:sessionId/generations/prepare
 *   POST /api/sessions/:sessionId/generations/:generationId/confirm
 *
 * 零 provider call、零 credential read；prepare 零 Data Root mutation。
 * 非本模块路径返回 undefined，由调用方继续路由。
 */
export function createGenerationAdmissionApi(
  options: GenerationAdmissionApiOptions,
): { readonly fetch: (request: Request) => Promise<Response | undefined> } {
  const confirmations = options.confirmations;
  const firstGeneration = options.firstGeneration;
  const contract = options.contract;
  const clock = options.clock ?? (() => new Date().toISOString());
  const bodyTimeoutMs = options.bodyTimeoutMs ?? DEFAULT_GATEWAY_BODY_TIMEOUT_MS;
  if (!Number.isFinite(bodyTimeoutMs) || bodyTimeoutMs <= 0) {
    throw new Error("Gateway body timeout 必须是正有限毫秒数");
  }
  const flight = new GenerationSingleFlight();

  const resolveContract = (
    provider: GenerationProviderV1,
  ): GenerationContractSelectionV1 | undefined => {
    if (contract === undefined || contract.provider !== provider) return undefined;
    return {
      contractProfile: contract.contractProfile,
      contractShapeDigest: contract.contractShapeDigest,
    };
  };

  const inspectDurable = (generationId: string): FirstGenerationInspectionV1 => {
    if (firstGeneration === null) reject("DATA_ROOT_UNAVAILABLE");
    return firstGeneration.inspect(generationId);
  };

  const leaderAdmit = (
    sessionId: string,
    generationId: string,
    body: unknown,
  ): "capacity-reached" | "admitted" => {
    const durable = inspectDurable(generationId);
    if (durable.status === "admitted") return "admitted";

    // contract 必须可用且未漂移，任何 token 消费之前失败。
    const stored = confirmations.inspect(sessionId, generationId, body);
    const selection = resolveContract(stored.payload.provider);
    if (selection === undefined || !sameContract(selection, stored.contract)) {
      reject("PROVIDER_CONTRACT_MISMATCH");
    }
    let binding: GenerationBindingBodyV1;
    try {
      binding = createGenerationBinding(stored.prepared, selection);
    } catch (error) {
      if (error instanceof GenerationCodecError) reject("PROVIDER_CONTRACT_MISMATCH");
      throw error;
    }
    confirmations.consume(sessionId, generationId, body);
    let intent: GenerationIntentV1;
    try {
      intent = createGenerationIntent(binding, clock());
    } catch (error) {
      if (error instanceof GenerationCodecError) reject("PROVIDER_CONTRACT_MISMATCH");
      throw error;
    }
    const result = firstGeneration!.admit(intent);
    if (result.status === "capacity-reached") return "capacity-reached";
    return "admitted";
  };

  const replayResponse = (
    durable: Extract<FirstGenerationInspectionV1, { readonly status: "admitted" }>,
    confirmBody: { readonly requestDigest: string },
    replayed: boolean,
  ): Response => {
    if (durable.intent.requestDigest !== confirmBody.requestDigest) {
      return errorResponse(
        ADMISSION_ERROR_STATUS.OPERATION_BINDING_CONFLICT,
        "OPERATION_BINDING_CONFLICT",
      );
    }
    const intent = durable.intent;
    return jsonResponse({
      schemaVersion: 1,
      status: durable.current.state,
      generationId: intent.generationId,
      sequence: durable.current.sequence,
      recordedAt: durable.current.recordedAt,
      replayed,
      binding: {
        provider: intent.provider,
        model: intent.model,
        requestDigest: intent.requestDigest,
        contractProfile: intent.contractProfile,
        contractShapeDigest: intent.contractShapeDigest,
        bindingDigest: intent.bindingDigest,
        createdAt: intent.createdAt,
      },
    });
  };

  const prepare = async (
    request: Request,
    sessionId: string,
  ): Promise<Response> => {
    if (!SESSION_ID.test(sessionId)) reject("INVALID_REQUEST");
    if (!options.hasSession(sessionId)) reject("SESSION_NOT_FOUND");
    if (request.method !== "POST") reject("METHOD_NOT_ALLOWED");
    const body = await readGenerationJsonBody(request, bodyTimeoutMs);
    let prepared: PreparedGenerationRequestV1;
    try {
      prepared = requireGenerationRequest(body);
    } catch (error) {
      if (error instanceof GenerationCodecError) reject("INVALID_REQUEST");
      throw error;
    }
    const selection = resolveContract(prepared.provider);
    if (selection === undefined) reject("PROVIDER_CONTRACT_MISMATCH");
    try {
      createGenerationBinding(prepared, selection);
    } catch (error) {
      if (error instanceof GenerationCodecError) reject("PROVIDER_CONTRACT_MISMATCH");
      throw error;
    }
    let confirmation: GenerationConfirmationV1;
    try {
      confirmation = confirmations.prepare(sessionId, prepared, selection);
    } catch (error) {
      if (error instanceof GenerationConfirmationError) {
        reject(mapConfirmationCode(error.code));
      }
      throw error;
    }
    return jsonResponse({
      schemaVersion: 1,
      confirmationId: confirmation.confirmationId,
      sessionId: confirmation.sessionId,
      generationId: confirmation.generationId,
      provider: confirmation.provider,
      model: confirmation.model,
      requestDigest: confirmation.requestDigest,
      expiresAt: confirmation.expiresAt,
      preview: previewOf(confirmation),
    }, 201);
  };

  const confirm = async (
    request: Request,
    sessionId: string,
    generationId: string,
  ): Promise<Response> => {
    if (!SESSION_ID.test(sessionId)) reject("INVALID_REQUEST");
    if (!GENERATION_ID.test(generationId)) reject("INVALID_REQUEST");
    if (!options.hasSession(sessionId)) reject("SESSION_NOT_FOUND");
    if (request.method !== "POST") reject("METHOD_NOT_ALLOWED");
    const body = await readGenerationJsonBody(request, bodyTimeoutMs);
    const confirmBody = requireConfirmBody(body);

    // precedence 2/3：先按 route generationId inspect durable，再碰 confirmation。
    const durable = inspectDurable(generationId);
    if (durable.status === "admitted") {
      return replayResponse(durable, confirmBody, true);
    }

    // precedence 4/5：single-flight 内唯一 leader 消费 token 并 durable admit；
    // follower 等待后重放，follower abort 不取消 leader。
    let leaderOutcome: "capacity-reached" | "admitted" | undefined;
    try {
      await flight.run(generationId, async () => {
        await beforeDurableAdmissionHook();
        leaderOutcome = leaderAdmit(sessionId, generationId, body);
      });
    } catch (error) {
      return mapError(error);
    }
    if (leaderOutcome === "capacity-reached") {
      return errorResponse(
        ADMISSION_ERROR_STATUS.GENERATION_CAPACITY_REACHED,
        "GENERATION_CAPACITY_REACHED",
      );
    }
    const after = inspectDurable(generationId);
    if (after.status !== "admitted") {
      return errorResponse(
        ADMISSION_ERROR_STATUS.GENERATION_RECOVERY_REQUIRED,
        "GENERATION_RECOVERY_REQUIRED",
      );
    }
    return replayResponse(after, confirmBody, leaderOutcome === undefined);
  };

  return Object.freeze({
    async fetch(request: Request): Promise<Response | undefined> {
      const url = new URL(request.url);
      const route = parseGenerationRoute(url.pathname);
      if (route === undefined) return undefined;
      try {
        return route.operation === "prepare"
          ? await prepare(request, route.sessionId)
          : await confirm(request, route.sessionId, route.generationId);
      } catch (error) {
        return mapError(error);
      }
    },
  });
}
