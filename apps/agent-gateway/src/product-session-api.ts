import type { ProductSessionEvent } from "@demiurges/world";

import type { OmpAgentClientFactory } from "./omp-world-agent";
import {
  ProductSession,
  ProductSessionAuthoringFailure,
} from "./product-session";

const MAX_SESSIONS = 32;
const MAX_TURN_BODY_BYTES = 16_384;
const DEFAULT_GATEWAY_TURN_TIMEOUT_MS = 120_000;
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
  | { sessionId: string; operation: "read" | "turn" | "world_write" | "world_edit" }
  | undefined {
  const match = pathname.match(/^\/api\/sessions\/([^/]+)(?:\/(turns|world\/(write|edit)))?$/);
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
          : "read",
  };
}

async function readJsonBody(request: Request): Promise<unknown> {
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

  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  if (request.body) {
    const reader = request.body.getReader();
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > MAX_TURN_BODY_BYTES) {
        await reader.cancel().catch(() => undefined);
        rejectRequest("turn_body_too_large");
      }
      chunks.push(value);
    }
  }
  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
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

async function readPrompt(request: Request): Promise<string> {
  const value = await readJsonBody(request);
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
  turnTimeoutMs = DEFAULT_GATEWAY_TURN_TIMEOUT_MS,
): { readonly fetch: (request: Request) => Promise<Response> } {
  if (!Number.isFinite(turnTimeoutMs) || turnTimeoutMs <= 0) {
    throw new Error("Gateway turn timeout 必须是正有限毫秒数");
  }
  const sessions = new ProductSessionRegistry(clientFactory);

  return Object.freeze({
    async fetch(request: Request): Promise<Response> {
      const url = new URL(request.url);
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
          const prompt = await readPrompt(request);
          return (
            streamTurn(session, prompt, request.signal, turnTimeoutMs) ??
            errorResponse(409, "session_turn_in_progress")
          );
        } catch (error) {
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
          const body = await readJsonBody(request);
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
          const mapped = authoringRequestError(error);
          return errorResponse(mapped.status, mapped.code);
        }
      }
      return errorResponse(405, "method_not_allowed");
    },
  });
}
