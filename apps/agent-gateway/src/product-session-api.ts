import {
  sha256Hex,
  type ProductSessionEvent,
} from "@demiurges/world";
import {
  WORLD_PROJECT_BUNDLE_MAX_BYTES,
  WORLD_PROJECT_BUNDLE_MEDIA_TYPE,
  createWorldProjectManifest,
  type WorldProjectManifestV1,
  type WorldProjectRuntime,
} from "@demiurges/world-project";

import type { OmpAgentClientFactory } from "./omp-world-agent";
import {
  ProductSession,
  ProductSessionAuthoringFailure,
} from "./product-session";

const MAX_SESSIONS = 32;
const MAX_TURN_BODY_BYTES = 16_384;
const DEFAULT_GATEWAY_TURN_TIMEOUT_MS = 120_000;
const DEFAULT_GATEWAY_BODY_TIMEOUT_MS = 5_000;
const PUBLIC_REQUEST_ERROR_CODES = [
  "invalid_content_type",
  "invalid_content_length",
  "turn_body_too_large",
  "invalid_utf8",
  "invalid_json",
  "invalid_turn_fields",
  "invalid_prompt",
] as const;
type PublicRequestErrorCode = (typeof PUBLIC_REQUEST_ERROR_CODES)[number];

class PublicRequestError extends Error {
  readonly code: PublicRequestErrorCode;

  constructor(code: PublicRequestErrorCode) {
    super("public request rejected");
    this.name = "PublicRequestError";
    this.code = code;
  }
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

function rejectRequest(code: PublicRequestErrorCode): never {
  throw new PublicRequestError(code);
}

function jsonResponse(value: unknown, status = 200): Response {
  return Response.json(value, {
    status,
    headers: { "cache-control": "no-store" },
  });
}

function errorResponse(status: number, message: string): Response {
  return jsonResponse({ error: message.slice(0, 240) }, status);
}

function mediaType(value: string | null): string {
  return (value ?? "").split(";", 1)[0]?.trim().toLowerCase() ?? "";
}

function parseSessionPath(pathname: string):
  | { sessionId: string; operation: "read" | "turn" | "world_write" | "world_edit" | "project_save_as" | "project_save" | "undo" | "redo" }
  | undefined {
  const match = pathname.match(/^\/api\/sessions\/([^/]+)(?:\/(turns|world\/(write|edit)|project\/(save-as|save|undo|redo)))?$/);
  if (!match) return undefined;
  let sessionId: string;
  try {
    sessionId = decodeURIComponent(match[1] ?? "");
  } catch {
    return undefined;
  }
  return {
    sessionId,
    operation: match[2] === "turns"
      ? "turn"
      : match[3] === "write"
        ? "world_write"
        : match[3] === "edit"
          ? "world_edit"
          : match[4] === "save-as"
            ? "project_save_as"
            : match[4] === "save"
              ? "project_save"
              : match[4] === "undo"
              ? "undo"
              : match[4] === "redo"
                ? "redo"
          : "read",
  };
}

async function requireEmptyRequestBody(
  request: Request,
  timeoutMs: number,
): Promise<void> {
  try {
    const bytes = await readBoundedRequestBody(request, 0, timeoutMs, false);
    if (bytes.byteLength !== 0) throw new Error("INVALID_REQUEST");
  } catch (error) {
    if (
      error instanceof RequestBodyError &&
      error.code === "REQUEST_BODY_BUDGET_EXCEEDED"
    ) {
      throw new Error("INVALID_REQUEST");
    }
    throw error;
  }
}

async function readBoundedRequestBody(
  request: Request,
  maxBytes: number,
  timeoutMs: number,
  required: boolean,
): Promise<Uint8Array> {
  if (request.signal.aborted) throw new RequestBodyError("REQUEST_ABORTED");
  const reader = request.body?.getReader();
  if (reader === undefined) {
    if (required) throw new RequestBodyError("REQUEST_BODY_READ_FAILED");
    return new Uint8Array();
  }
  const deadlineAt = Date.now() + timeoutMs;
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  try {
    while (true) {
      const remainingMs = deadlineAt - Date.now();
      if (remainingMs <= 0) throw new RequestBodyError("REQUEST_BODY_TIMEOUT");
      const result = await new Promise<Awaited<ReturnType<typeof reader.read>>>(
        (resolve, reject) => {
          let settled = false;
          const finish = (callback: () => void) => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            request.signal.removeEventListener("abort", onAbort);
            callback();
          };
          const onAbort = () => finish(() =>
            reject(new RequestBodyError("REQUEST_ABORTED")));
          const timer = setTimeout(() => finish(() =>
            reject(new RequestBodyError("REQUEST_BODY_TIMEOUT"))), remainingMs);
          request.signal.addEventListener("abort", onAbort, { once: true });
          reader.read().then(
            (value) => finish(() => resolve(value)),
            () => finish(() =>
              reject(new RequestBodyError("REQUEST_BODY_READ_FAILED"))),
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

async function readJsonBody(
  request: Request,
  timeoutMs: number,
): Promise<unknown> {
  if (mediaType(request.headers.get("content-type")) !== "application/json") {
    rejectRequest("invalid_content_type");
  }
  const lengthHeader = request.headers.get("content-length");
  if (lengthHeader !== null && !/^\d+$/.test(lengthHeader)) {
    rejectRequest("invalid_content_length");
  }
  if (lengthHeader !== null && Number(lengthHeader) > MAX_TURN_BODY_BYTES) {
    rejectRequest("turn_body_too_large");
  }

  let bytes: Uint8Array;
  try {
    bytes = await readBoundedRequestBody(
      request,
      MAX_TURN_BODY_BYTES,
      timeoutMs,
      false,
    );
  } catch (error) {
    if (
      error instanceof RequestBodyError &&
      error.code === "REQUEST_BODY_BUDGET_EXCEEDED"
    ) {
      rejectRequest("turn_body_too_large");
    }
    throw error;
  }
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    rejectRequest("invalid_utf8");
  }
  try {
    return JSON.parse(text);
  } catch {
    rejectRequest("invalid_json");
  }
}

async function readPrompt(request: Request, timeoutMs: number): Promise<string> {
  const value = await readJsonBody(request, timeoutMs);
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Object.prototype ||
    Reflect.ownKeys(value).length !== 1 ||
    !Object.prototype.hasOwnProperty.call(value, "prompt")
  ) {
    rejectRequest("invalid_turn_fields");
  }
  const prompt = (value as { prompt: unknown }).prompt;
  if (typeof prompt !== "string") {
    rejectRequest("invalid_prompt");
  }
  return prompt;
}

const AUTHORING_ERROR_STATUS = Object.freeze({
  INVALID_REQUEST: 400,
  REQUEST_TOO_LARGE: 413,
  UNSUPPORTED_MEDIA_TYPE: 415,
  SESSION_BUSY: 409,
  WORLD_REQUIRED: 409,
  WORLD_ALREADY_EXISTS: 409,
  STALE_REF: 409,
  FIXTURE_NOT_COMPOSABLE: 422,
  POSE_NOT_COMPOSABLE: 422,
  PROJECT_NOT_BOUND: 409,
  PROJECT_HISTORY_BOUNDARY: 409,
} as const);

function authoringRequestError(error: unknown): { status: number; code: string } {
  if (error instanceof PublicRequestError && error.code === "invalid_content_type") {
    return { status: AUTHORING_ERROR_STATUS.UNSUPPORTED_MEDIA_TYPE, code: "UNSUPPORTED_MEDIA_TYPE" };
  }
  if (error instanceof PublicRequestError && error.code === "turn_body_too_large") {
    return { status: AUTHORING_ERROR_STATUS.REQUEST_TOO_LARGE, code: "REQUEST_TOO_LARGE" };
  }
  if (error instanceof ProductSessionAuthoringFailure) {
    return {
      status: AUTHORING_ERROR_STATUS[error.code],
      code: error.code,
    };
  }
  return { status: AUTHORING_ERROR_STATUS.INVALID_REQUEST, code: "INVALID_REQUEST" };
}

class ProductSessionRegistry {
  readonly #sessions = new Map<string, ProductSession>();
  readonly #clientFactory: OmpAgentClientFactory;
  #sequence = 0;

  constructor(clientFactory: OmpAgentClientFactory) {
    this.#clientFactory = clientFactory;
  }

  create(): ProductSession {
    if (this.#sessions.size >= MAX_SESSIONS) {
      throw new Error(`本地 Product Sessions 不能超过 ${MAX_SESSIONS}`);
    }
    const id = `session:local-${++this.#sequence}`;
    const session = new ProductSession(id, this.#clientFactory);
    this.#sessions.set(id, session);
    return session;
  }

  restore(manifest: WorldProjectManifestV1): ProductSession {
    if (this.#sessions.size >= MAX_SESSIONS) {
      throw new Error(`本地 Product Sessions 不能超过 ${MAX_SESSIONS}`);
    }
    const id = `session:local-${++this.#sequence}`;
    const session = ProductSession.restoreProject(
      id,
      this.#clientFactory,
      manifest.snapshots,
      manifest.currentRef,
      manifest.projectId,
      manifest.revision,
    );
    this.#sessions.set(id, session);
    return session;
  }

  get(id: string): ProductSession | undefined {
    return this.#sessions.get(id);
  }
}

function streamTurn(
  session: ProductSession,
  prompt: string,
  requestSignal: AbortSignal,
  turnTimeoutMs: number,
): Response | undefined {
  const encoder = new TextEncoder();
  const turnAbort = new AbortController();
  const abortTurn = () => turnAbort.abort();
  const timeout = setTimeout(abortTurn, turnTimeoutMs);
  if (requestSignal.aborted) abortTurn();
  else requestSignal.addEventListener("abort", abortTurn, { once: true });
  const cleanup = () => {
    clearTimeout(timeout);
    requestSignal.removeEventListener("abort", abortTurn);
  };
  let canceled = false;
  let accepted = false;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const emit = (event: ProductSessionEvent) => {
        if (canceled) return;
        controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      };
      const turn = session.tryRunTurn(prompt, emit, turnAbort.signal);
      if (!turn) {
        cleanup();
        controller.close();
        return;
      }
      accepted = true;
      void turn
        .catch(() => undefined)
        .finally(() => {
          cleanup();
          if (!canceled) controller.close();
        });
    },
    cancel() {
      canceled = true;
      abortTurn();
    },
  });
  if (!accepted) return undefined;
  return new Response(stream, {
    status: 200,
    headers: {
      "content-type": "application/x-ndjson; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    },
  });
}

export function createProductSessionApi(
  clientFactory: OmpAgentClientFactory,
  optionsOrTimeout: number | {
    readonly turnTimeoutMs?: number;
    readonly bodyTimeoutMs?: number;
    readonly worldProjects?: WorldProjectRuntime;
  } = DEFAULT_GATEWAY_TURN_TIMEOUT_MS,
): { readonly fetch: (request: Request) => Promise<Response> } {
  const turnTimeoutMs = typeof optionsOrTimeout === "number"
    ? optionsOrTimeout
    : optionsOrTimeout.turnTimeoutMs ?? DEFAULT_GATEWAY_TURN_TIMEOUT_MS;
  const worldProjects = typeof optionsOrTimeout === "number"
    ? undefined
    : optionsOrTimeout.worldProjects;
  const bodyTimeoutMs = typeof optionsOrTimeout === "number"
    ? DEFAULT_GATEWAY_BODY_TIMEOUT_MS
    : optionsOrTimeout.bodyTimeoutMs ?? DEFAULT_GATEWAY_BODY_TIMEOUT_MS;
  if (!Number.isFinite(turnTimeoutMs) || turnTimeoutMs <= 0) {
    throw new Error("Gateway turn timeout 必须是正有限毫秒数");
  }
  if (!Number.isFinite(bodyTimeoutMs) || bodyTimeoutMs <= 0) {
    throw new Error("Gateway body timeout 必须是正有限毫秒数");
  }
  const sessions = new ProductSessionRegistry(clientFactory);

  return Object.freeze({
    async fetch(request: Request): Promise<Response> {
      const url = new URL(request.url);
      if (url.pathname === "/api/projects" && request.method === "GET") {
        if (worldProjects === undefined) return errorResponse(503, "DATA_ROOT_UNAVAILABLE");
        try {
          const listed = worldProjects.reader.list();
          return jsonResponse({
            mode: worldProjects.mode,
            projects: listed.projects.map(({ projectId, displayName, revision }) => ({
              projectId,
              displayName,
              revision,
            })),
            rejectedEntryCount: listed.rejectedEntryCount,
          });
        } catch {
          return errorResponse(409, "PROJECT_RECOVERY_REQUIRED");
        }
      }
      const openMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/open$/);
      if (openMatch && request.method === "POST") {
        if (worldProjects === undefined) return errorResponse(503, "DATA_ROOT_UNAVAILABLE");
        try {
          await requireEmptyRequestBody(request, bodyTimeoutMs);
          let projectId: string;
          try {
            projectId = decodeURIComponent(openMatch[1] ?? "");
          } catch {
            throw new Error("INVALID_REQUEST");
          }
          const manifest = worldProjects.reader.open(projectId);
          const session = sessions.restore(manifest);
          return jsonResponse({
            project: projectSummary(manifest),
            session: session.readProjection(),
          }, 201);
        } catch (error) {
          return projectErrorResponse(error);
        }
      }
      if (url.pathname === "/api/projects/import" && request.method === "POST") {
        if (worldProjects === undefined) return errorResponse(503, "DATA_ROOT_UNAVAILABLE");
        if (worldProjects.mode !== "writer") return errorResponse(409, "DATA_ROOT_READ_ONLY");
        try {
          const operationId = requireOperationId(request);
          const bytes = await readBundleBody(request, bodyTimeoutMs);
          const result = await worldProjects.bundles.import(bytes, operationId, request.signal);
          return jsonResponse(result, 201);
        } catch (error) {
          return projectErrorResponse(error);
        }
      }
      const exportMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/export$/);
      if (exportMatch && request.method === "GET") {
        if (worldProjects === undefined) return errorResponse(503, "DATA_ROOT_UNAVAILABLE");
        try {
          const projectId = decodeURIComponent(exportMatch[1] ?? "");
          const bytes = worldProjects.bundles.export(projectId);
          return new Response(bytes, {
            status: 200,
            headers: {
              "content-type": WORLD_PROJECT_BUNDLE_MEDIA_TYPE,
              "content-length": String(bytes.byteLength),
              "content-disposition": `attachment; filename="${projectId.slice("project:".length)}.dworld"`,
              "cache-control": "no-store",
              "x-content-type-options": "nosniff",
            },
          });
        } catch (error) {
          return projectErrorResponse(error);
        }
      }
      if (url.pathname === "/api/sessions" && request.method === "POST") {
        try {
          return jsonResponse(sessions.create().readProjection(), 201);
        } catch (error) {
          return errorResponse(503, "session_capacity_reached");
        }
      }

      const route = parseSessionPath(url.pathname);
      if (!route) return errorResponse(404, "route_not_found");
      const session = sessions.get(route.sessionId);
      if (!session) return errorResponse(404, "session_not_found");

      if (route.operation === "read" && request.method === "GET") {
        return jsonResponse(session.readProjection());
      }
      if (route.operation === "turn" && request.method === "POST") {
        try {
          const prompt = await readPrompt(request, bodyTimeoutMs);
          return (
            streamTurn(session, prompt, request.signal, turnTimeoutMs) ??
            errorResponse(409, "session_turn_in_progress")
          );
        } catch (error) {
          if (error instanceof RequestBodyError) {
            return errorResponse(408, error.code);
          }
          const code = error instanceof PublicRequestError
            ? error.code
            : "invalid_turn_request";
          return errorResponse(
            400,
            code,
          );
        }
      }
      if ((route.operation === "world_write" || route.operation === "world_edit") && request.method === "POST") {
        try {
          if (request.signal.aborted) {
            return errorResponse(AUTHORING_ERROR_STATUS.INVALID_REQUEST, "INVALID_REQUEST");
          }
          const body = await readJsonBody(request, bodyTimeoutMs);
          if (request.signal.aborted) {
            return errorResponse(AUTHORING_ERROR_STATUS.INVALID_REQUEST, "INVALID_REQUEST");
          }
          const projection = route.operation === "world_write"
            ? session.tryWriteWorld(body)
            : session.tryEditWorld(body);
          return projection
            ? jsonResponse(projection)
            : errorResponse(AUTHORING_ERROR_STATUS.SESSION_BUSY, "SESSION_BUSY");
        } catch (error) {
          if (error instanceof RequestBodyError) {
            return errorResponse(408, error.code);
          }
          const mapped = authoringRequestError(error);
          return errorResponse(mapped.status, mapped.code);
        }
      }
      if (
        (route.operation === "project_save_as" || route.operation === "project_save") &&
        request.method === "POST"
      ) {
        if (worldProjects === undefined) return errorResponse(503, "DATA_ROOT_UNAVAILABLE");
        if (worldProjects.writer === null) return errorResponse(409, "DATA_ROOT_READ_ONLY");
        try {
          const operationId = requireOperationId(request);
          const body = requireProjectSaveBody(await readJsonBody(request, bodyTimeoutMs));
          if (
            (route.operation === "project_save_as" && body.expectedRevision !== null) ||
            (route.operation === "project_save" && body.expectedRevision === null)
          ) {
            throw new Error("INVALID_REQUEST");
          }
          if (request.signal.aborted) return errorResponse(408, "REQUEST_ABORTED");
          const pending = session.tryPersistProject(async ({ history, binding }) => {
            if (
              binding !== null &&
              (binding.projectId !== body.projectId || binding.revision !== body.expectedRevision)
            ) {
              throw new Error("PROJECT_REVISION_CONFLICT");
            }
            if (binding === null && body.expectedRevision !== null) {
              throw new Error("PROJECT_REVISION_CONFLICT");
            }
            const manifest = createWorldProjectManifest(
              body.projectId,
              body.displayName,
              history,
            );
            const saved = await worldProjects.writer!.save(
              manifest,
              operationId,
              body.expectedRevision,
              request.signal,
            );
            return {
              value: {
                project: projectSummary(saved.manifest),
                terminal: saved.terminal,
                replayed: saved.replayed,
              },
              nextBinding: {
                projectId: saved.manifest.projectId,
                revision: saved.manifest.revision,
              },
            };
          });
          if (pending === undefined) return errorResponse(409, "SESSION_BUSY");
          return jsonResponse(await pending);
        } catch (error) {
          return projectErrorResponse(error);
        }
      }
      if ((route.operation === "undo" || route.operation === "redo") && request.method === "POST") {
        try {
          if (request.signal.aborted) return errorResponse(408, "REQUEST_ABORTED");
          const expected = requireProjectHistoryBody(
            await readJsonBody(request, bodyTimeoutMs),
          );
          if (request.signal.aborted) return errorResponse(408, "REQUEST_ABORTED");
          const result = session.tryMoveProjectHistory(route.operation, expected);
          return result === undefined
            ? errorResponse(409, "SESSION_BUSY")
            : jsonResponse(result);
        } catch (error) {
          return projectErrorResponse(error);
        }
      }
      return errorResponse(405, "method_not_allowed");
    },
  });
}

function requireOperationId(request: Request): string {
  const key = request.headers.get("idempotency-key");
  if (
    key === null ||
    key.length < 1 ||
    key.length > 128 ||
    !/^[\x21-\x7e]+$/.test(key)
  ) {
    throw new Error("INVALID_IDEMPOTENCY_KEY");
  }
  return `op:${sha256Hex(new TextEncoder().encode(`demiurges-idempotency-v1\u0000${key}`))}`;
}

function plainExact(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Object.prototype ||
    Reflect.ownKeys(value).length !== keys.length ||
    !keys.every((key) => Object.prototype.hasOwnProperty.call(value, key))
  ) {
    throw new Error("INVALID_REQUEST");
  }
  return value as Record<string, unknown>;
}

function requireProjectSaveBody(value: unknown): {
  readonly projectId: string;
  readonly displayName: string;
  readonly expectedRevision: string | null;
} {
  const body = plainExact(value, ["projectId", "displayName", "expectedRevision"]);
  if (
    typeof body.projectId !== "string" ||
    typeof body.displayName !== "string" ||
    (body.expectedRevision !== null && typeof body.expectedRevision !== "string")
  ) {
    throw new Error("INVALID_REQUEST");
  }
  return {
    projectId: body.projectId,
    displayName: body.displayName,
    expectedRevision: body.expectedRevision as string | null,
  };
}

function requireProjectHistoryBody(value: unknown): {
  readonly projectRevision: string;
  readonly ref: {
    readonly name: "world:current";
    readonly snapshotId: string;
    readonly version: number;
  };
} {
  const body = plainExact(value, ["projectRevision", "ref"]);
  const ref = plainExact(body.ref, ["name", "snapshotId", "version"]);
  if (
    typeof body.projectRevision !== "string" ||
    body.projectRevision.length === 0 ||
    body.projectRevision.length > 128 ||
    ref.name !== "world:current" ||
    typeof ref.snapshotId !== "string" ||
    ref.snapshotId.length === 0 ||
    ref.snapshotId.length > 256 ||
    typeof ref.version !== "number" ||
    !Number.isSafeInteger(ref.version) ||
    ref.version < 1
  ) {
    throw new Error("INVALID_REQUEST");
  }
  return {
    projectRevision: body.projectRevision,
    ref: {
      name: "world:current",
      snapshotId: ref.snapshotId,
      version: ref.version,
    },
  };
}

async function readBundleBody(
  request: Request,
  timeoutMs: number,
): Promise<Uint8Array> {
  if (mediaType(request.headers.get("content-type")) !== WORLD_PROJECT_BUNDLE_MEDIA_TYPE) {
    throw new Error("UNSUPPORTED_MEDIA_TYPE");
  }
  const length = request.headers.get("content-length");
  if (length !== null && (!/^\d+$/.test(length) || Number(length) > WORLD_PROJECT_BUNDLE_MAX_BYTES)) {
    throw new Error("BUNDLE_BUDGET_EXCEEDED");
  }
  try {
    return await readBoundedRequestBody(
      request,
      WORLD_PROJECT_BUNDLE_MAX_BYTES,
      timeoutMs,
      true,
    );
  } catch (error) {
    if (
      error instanceof RequestBodyError &&
      error.code === "REQUEST_BODY_BUDGET_EXCEEDED"
    ) {
      throw new Error("BUNDLE_BUDGET_EXCEEDED");
    }
    throw error;
  }
}

function projectSummary(manifest: WorldProjectManifestV1) {
  return {
    projectId: manifest.projectId,
    displayName: manifest.metadata.displayName,
    revision: manifest.revision,
  };
}

function projectErrorResponse(error: unknown): Response {
  const publicCodes = new Set([
    "ARTIFACT_DESTINATION_CONFLICT",
    "ARTIFACT_IDENTITY_MISMATCH",
    "ARTIFACT_NOT_REGISTERED",
    "BUNDLE_ARTIFACT_INVALID",
    "BUNDLE_BUDGET_EXCEEDED",
    "BUNDLE_INVALID",
    "BUNDLE_PROJECT_INVALID",
    "DATA_ROOT_READ_ONLY",
    "DATA_ROOT_UNAVAILABLE",
    "INVALID_IDEMPOTENCY_KEY",
    "INVALID_REQUEST",
    "OPERATION_BINDING_CONFLICT",
    "OPERATION_IN_PROGRESS",
    "OPERATION_RECOVERY_REQUIRED",
    "PROJECT_ARTIFACT_INVALID",
    "PROJECT_ARTIFACT_UNBACKED",
    "PROJECT_CURRENT_REF_INVALID",
    "PROJECT_CURSOR_INVALID",
    "PROJECT_ID_CONFLICT",
    "PROJECT_LINEAGE_INVALID",
    "PROJECT_MANIFEST_INVALID",
    "PROJECT_NOT_BOUND",
    "PROJECT_NOT_FOUND",
    "PROJECT_RECOVERY_REQUIRED",
    "PROJECT_REF_CONFLICT",
    "PROJECT_REGISTRY_INVALID",
    "PROJECT_REVISION_CONFLICT",
    "PROJECT_REVISION_MISMATCH",
    "PROJECT_SCHEMA_UNSUPPORTED",
    "PROJECT_WRITE_LOCKED",
    "REQUEST_ABORTED",
    "REQUEST_BODY_READ_FAILED",
    "REQUEST_BODY_TIMEOUT",
    "UNSUPPORTED_MEDIA_TYPE",
    "WORLD_REQUIRED",
  ]);
  const candidate =
    typeof error === "object" && error !== null && "code" in error && typeof error.code === "string"
      ? error.code
      : error instanceof Error && /^[A-Z][A-Z0-9_]+$/.test(error.message)
        ? error.message
        : undefined;
  const code = candidate !== undefined && publicCodes.has(candidate)
    ? candidate
    : "PROJECT_REQUEST_FAILED";
  const status = code === "PROJECT_NOT_FOUND" ? 404
    : code === "INVALID_REQUEST" || code === "INVALID_IDEMPOTENCY_KEY" ? 400
    : code === "UNSUPPORTED_MEDIA_TYPE" ? 415
    : code === "BUNDLE_BUDGET_EXCEEDED" ? 413
    : code === "REQUEST_ABORTED" || code === "REQUEST_BODY_TIMEOUT" ? 408
    : code === "REQUEST_BODY_READ_FAILED" ? 400
    : code === "DATA_ROOT_UNAVAILABLE" ? 503
    : 409;
  return errorResponse(status, code);
}
