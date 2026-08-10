import type { ProductSessionEvent } from "@demiurges/world";

import type { OmpAgentClientFactory } from "./omp-world-agent";
import {
  ProductSession,
  createScriptedAgentClientFactory,
} from "./product-session";

const MAX_SESSIONS = 32;
const MAX_TURN_BODY_BYTES = 16_384;
const PUBLIC_REQUEST_ERRORS = new Set([
  "invalid_content_type",
  "invalid_content_length",
  "turn_body_too_large",
  "invalid_utf8",
  "invalid_json",
  "invalid_turn_fields",
  "invalid_prompt",
]);

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
  | { sessionId: string; operation: "read" | "turn" }
  | undefined {
  const match = pathname.match(/^\/api\/sessions\/([^/]+)(?:\/(turns))?$/);
  if (!match) return undefined;
  let sessionId: string;
  try {
    sessionId = decodeURIComponent(match[1] ?? "");
  } catch {
    return undefined;
  }
  return {
    sessionId,
    operation: match[2] === "turns" ? "turn" : "read",
  };
}

async function readPrompt(request: Request): Promise<string> {
  if (mediaType(request.headers.get("content-type")) !== "application/json") {
    throw new Error("invalid_content_type");
  }
  const lengthHeader = request.headers.get("content-length");
  if (lengthHeader !== null && !/^\d+$/.test(lengthHeader)) {
    throw new Error("invalid_content_length");
  }
  if (lengthHeader !== null && Number(lengthHeader) > MAX_TURN_BODY_BYTES) {
    throw new Error("turn_body_too_large");
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
        throw new Error("turn_body_too_large");
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
    throw new Error("invalid_utf8");
  }
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new Error("invalid_json");
  }
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Object.prototype ||
    Reflect.ownKeys(value).length !== 1 ||
    !Object.prototype.hasOwnProperty.call(value, "prompt")
  ) {
    throw new Error("invalid_turn_fields");
  }
  const prompt = (value as { prompt: unknown }).prompt;
  if (typeof prompt !== "string") {
    throw new Error("invalid_prompt");
  }
  return prompt;
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
): Response | undefined {
  const encoder = new TextEncoder();
  let canceled = false;
  let accepted = false;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const emit = (event: ProductSessionEvent) => {
        if (canceled) return;
        controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      };
      const turn = session.tryRunTurn(prompt, emit);
      if (!turn) {
        controller.close();
        return;
      }
      accepted = true;
      void turn
        .catch(() => undefined)
        .finally(() => {
          if (!canceled) controller.close();
        });
    },
    cancel() {
      canceled = true;
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
  clientFactory: OmpAgentClientFactory = createScriptedAgentClientFactory(),
): { readonly fetch: (request: Request) => Promise<Response> } {
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
            streamTurn(session, prompt) ??
            errorResponse(409, "session_turn_in_progress")
          );
        } catch (error) {
          const code = error instanceof Error && PUBLIC_REQUEST_ERRORS.has(error.message)
            ? error.message
            : "invalid_turn_request";
          return errorResponse(
            400,
            code,
          );
        }
      }
      return errorResponse(405, "method_not_allowed");
    },
  });
}
