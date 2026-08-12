import {
  decodeProductSessionEventTrusted,
  decodeProductSessionProjectionTrusted,
  type ProductSessionEvent,
  type ProductSessionProjection,
  type WorldReadResult,
} from "@demiurges/world";

const MAX_EVENT_LINE_BYTES = 1_000_000;
const MAX_JSON_RESPONSE_BYTES = 2_000_000;
const MAX_TURN_EVENTS = 130;
const SETTLED_RESYNC_ATTEMPTS = 100;
const SETTLED_RESYNC_DELAY_MS = 20;
const DEFAULT_TURN_TIMEOUT_MS = 120_000;

type EventSink = (event: ProductSessionEvent) => void;
type FetchPort = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
type TurnTerminal = Extract<ProductSessionEvent, { type: "turn.completed" | "turn.failed" }>;
type VerifiedTurnStream = TurnTerminal & {
  readonly verifiedWorld: Pick<WorldReadResult, "ref" | "snapshot"> | null;
};

function worldAuthority(
  value: Pick<WorldReadResult, "ref" | "snapshot"> | null | undefined,
): Pick<WorldReadResult, "ref" | "snapshot"> | null | undefined {
  if (value == null) return value;
  return Object.freeze({ ref: value.ref, snapshot: value.snapshot });
}

function mediaType(value: string | null): string {
  return (value ?? "").split(";", 1)[0]?.trim().toLowerCase() ?? "";
}

function byteLength(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

export async function readProductSessionEvents(
  response: Response,
  sessionId: string,
  sink: EventSink,
  firstSequence = 1,
  signal?: AbortSignal,
  initialWorld?: WorldReadResult | null,
): Promise<VerifiedTurnStream> {
  if (!response.ok) {
    throw new Error(`Agent Gateway turn request 失败：HTTP ${response.status}`);
  }
  if (mediaType(response.headers.get("content-type")) !== "application/x-ndjson") {
    throw new Error("Agent Gateway turn response 不是 NDJSON");
  }
  if (!response.body) throw new Error("Agent Gateway turn response 缺少 body");

  const reader = response.body.getReader();
  let removeAbortListener: () => void = () => undefined;
  const abortFailure = new Promise<never>((_, reject) => {
    if (!signal) return;
    const fail = () => {
      void reader.cancel(signal.reason).catch(() => undefined);
      reject(new Error("Agent Gateway turn 已取消"));
    };
    if (signal.aborted) {
      fail();
      return;
    }
    signal.addEventListener("abort", fail, { once: true });
    removeAbortListener = () => signal.removeEventListener("abort", fail);
  });
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let buffer = "";
  let expectedSequence = firstSequence;
  let turnId: string | undefined;
  let nextTraceSequence = 1;
  let eventCount = 0;
  let terminal: Extract<ProductSessionEvent, { type: "turn.completed" | "turn.failed" }> | undefined;
  let acceptedWorld: Pick<WorldReadResult, "ref" | "snapshot"> | null | undefined =
    worldAuthority(initialWorld);

  const consumeLine = async (line: string) => {
    if (line.length === 0) return;
    eventCount += 1;
    if (eventCount > MAX_TURN_EVENTS) {
      throw new Error(`Product Session event 总量不能超过 ${MAX_TURN_EVENTS}`);
    }
    if (byteLength(line) > MAX_EVENT_LINE_BYTES) {
      throw new Error(`Product Session event 不能超过 ${MAX_EVENT_LINE_BYTES} bytes`);
    }
    let value: unknown;
    try {
      value = JSON.parse(line);
    } catch {
      throw new Error("Product Session event 不是合法 JSON");
    }
    const event = await decodeProductSessionEventTrusted(
      value,
      sessionId,
      expectedSequence++,
      acceptedWorld,
    );
    if (terminal) throw new Error("Product Session terminal event 后不能继续发送 event");
    if (turnId === undefined) {
      if (event.type !== "turn.started") {
        throw new Error("Product Session turn 必须以 turn.started 开始");
      }
      turnId = event.turnId;
    } else {
      if (event.turnId !== turnId || event.type === "turn.started") {
        throw new Error("Product Session turn identity/lifecycle 漂移");
      }
      if (event.type === "tool.completed") {
        if (event.trace.sequence !== nextTraceSequence++) {
          throw new Error("Product Session tool trace sequence 漂移");
        }
        if (event.evidence?.tool === "read" || event.evidence?.tool === "write") {
          acceptedWorld = worldAuthority(event.evidence);
        } else if (event.evidence?.tool === "edit") {
          acceptedWorld = worldAuthority(event.evidence.update);
        }
      }
      if (event.type === "turn.completed" || event.type === "turn.failed") {
        terminal = event;
      }
    }
    sink(event);
  };

  try {
    while (true) {
      const { value, done } = await Promise.race([reader.read(), abortFailure]);
      buffer += decoder.decode(value, { stream: !done });
      let newline = buffer.indexOf("\n");
      while (newline >= 0) {
        await consumeLine(buffer.slice(0, newline));
        buffer = buffer.slice(newline + 1);
        newline = buffer.indexOf("\n");
      }
      if (byteLength(buffer) > MAX_EVENT_LINE_BYTES) {
        throw new Error(`Product Session event 不能超过 ${MAX_EVENT_LINE_BYTES} bytes`);
      }
      if (done) break;
    }
    await consumeLine(buffer);
  } catch (error) {
    await reader.cancel(error).catch(() => undefined);
    throw error;
  } finally {
    removeAbortListener();
  }
  if (!turnId || !terminal) {
    throw new Error("Product Session stream 缺少完整 turn lifecycle");
  }
  return Object.freeze({ ...terminal, verifiedWorld: acceptedWorld ?? null });
}

async function readBoundedText(response: Response, maximumBytes: number): Promise<string> {
  if (!response.body) return "";
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maximumBytes) {
      await reader.cancel().catch(() => undefined);
      throw new Error(`Agent Gateway JSON response 不能超过 ${maximumBytes} bytes`);
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
}

async function responseJson(response: Response): Promise<unknown> {
  if (mediaType(response.headers.get("content-type")) !== "application/json") {
    throw new Error("Agent Gateway response 不是 JSON");
  }
  const text = await readBoundedText(response, MAX_JSON_RESPONSE_BYTES);
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    throw new Error("Agent Gateway response 不是合法 JSON");
  }
  if (!response.ok) {
    let message = `HTTP ${response.status}`;
    if (
      typeof body === "object" &&
      body !== null &&
      typeof (body as { error?: unknown }).error === "string"
    ) message = (body as { error: string }).error;
    throw new Error(`Agent Gateway request 失败：${message.slice(0, 240)}`);
  }
  return body;
}

export class ProductSessionTurnError extends Error {
  readonly projection: ProductSessionProjection;

  constructor(message: string, projection: ProductSessionProjection) {
    super(message.slice(0, 240));
    this.name = "ProductSessionTurnError";
    this.projection = projection;
    Object.freeze(this);
  }
}

export class ProductSessionClient {
  readonly #fetch: FetchPort;
  readonly #turnTimeoutMs: number;

  constructor(
    fetchPort: FetchPort = globalThis.fetch.bind(globalThis),
    turnTimeoutMs = DEFAULT_TURN_TIMEOUT_MS,
  ) {
    if (!Number.isFinite(turnTimeoutMs) || turnTimeoutMs <= 0) {
      throw new Error("turn timeout 必须是正有限毫秒数");
    }
    this.#fetch = fetchPort;
    this.#turnTimeoutMs = turnTimeoutMs;
  }

  async createSession(): Promise<ProductSessionProjection> {
    const response = await this.#fetch("/api/sessions", { method: "POST" });
    return decodeProductSessionProjectionTrusted(await responseJson(response));
  }

  async readSession(
    sessionId: string,
    signal?: AbortSignal,
    expectedWorld?: Pick<WorldReadResult, "ref" | "snapshot"> | null,
  ): Promise<ProductSessionProjection> {
    const response = await this.#fetch(
      `/api/sessions/${encodeURIComponent(sessionId)}`,
      signal ? { signal } : undefined,
    );
    return decodeProductSessionProjectionTrusted(
      await responseJson(response),
      sessionId,
      expectedWorld,
    );
  }

  async #readSettledSession(
    sessionId: string,
    deadline: number,
    signal?: AbortSignal,
    expectedWorld?: Pick<WorldReadResult, "ref" | "snapshot"> | null,
  ): Promise<ProductSessionProjection> {
    let projection = await this.#readSessionBeforeDeadline(
      sessionId,
      deadline,
      signal,
      expectedWorld,
    );
    for (let attempt = 1; projection.running && attempt < SETTLED_RESYNC_ATTEMPTS; attempt += 1) {
      const remaining = deadline - Date.now();
      if (remaining <= 0) break;
      await this.#beforeDeadline(
        deadline,
        signal,
        "session resync delay",
        () => new Promise<void>((resolve) =>
          setTimeout(resolve, Math.min(SETTLED_RESYNC_DELAY_MS, remaining)),
        ),
      );
      projection = await this.#readSessionBeforeDeadline(
        sessionId,
        deadline,
        signal,
        expectedWorld,
      );
    }
    if (projection.running) {
      throw new Error("Agent Gateway session 未在 resync budget 内 settled");
    }
    return projection;
  }

  async #readSessionBeforeDeadline(
    sessionId: string,
    deadline: number,
    signal?: AbortSignal,
    expectedWorld?: Pick<WorldReadResult, "ref" | "snapshot"> | null,
  ): Promise<ProductSessionProjection> {
    return this.#beforeDeadline(
      deadline,
      signal,
      "session resync GET",
      (operationSignal) => this.readSession(sessionId, operationSignal, expectedWorld),
    );
  }

  async #beforeDeadline<T>(
    deadline: number,
    signal: AbortSignal | undefined,
    label: string,
    operation: (signal: AbortSignal) => Promise<T>,
  ): Promise<T> {
    const remaining = deadline - Date.now();
    if (remaining <= 0) throw new Error(`Agent Gateway ${label} 超过 turn deadline`);
    const controller = new AbortController();
    let timeout: ReturnType<typeof setTimeout> | undefined;
    let removeAbortListener: () => void = () => undefined;
    const deadlineFailure = new Promise<never>((_, reject) => {
      timeout = setTimeout(() => {
        controller.abort();
        reject(new Error(`Agent Gateway ${label} 超过 turn deadline`));
      }, remaining);
    });
    const abortFailure = new Promise<never>((_, reject) => {
      if (!signal) return;
      const fail = () => {
        controller.abort(signal.reason);
        reject(new Error("Agent Gateway turn 已取消"));
      };
      if (signal.aborted) {
        fail();
        return;
      }
      signal.addEventListener("abort", fail, { once: true });
      removeAbortListener = () => signal.removeEventListener("abort", fail);
    });
    try {
      return await Promise.race([
        operation(controller.signal),
        deadlineFailure,
        abortFailure,
      ]);
    } finally {
      if (timeout !== undefined) clearTimeout(timeout);
      removeAbortListener();
      controller.abort();
    }
  }

  async runTurn(
    sessionId: string,
    prompt: string,
    firstSequence: number,
    sink: EventSink,
    signal?: AbortSignal,
    initialWorld?: WorldReadResult | null,
  ): Promise<ProductSessionProjection> {
    const deadline = Date.now() + this.#turnTimeoutMs;
    let stream: VerifiedTurnStream | undefined;
    let verifiedWorld: Pick<WorldReadResult, "ref" | "snapshot"> | null | undefined =
      worldAuthority(initialWorld);
    const acceptEvent = (event: ProductSessionEvent) => {
      if (event.type === "tool.completed") {
        if (event.evidence?.tool === "read" || event.evidence?.tool === "write") {
          verifiedWorld = worldAuthority(event.evidence);
        } else if (event.evidence?.tool === "edit") {
          verifiedWorld = worldAuthority(event.evidence.update);
        }
      }
      sink(event);
    };
    try {
      stream = await this.#beforeDeadline(
        deadline,
        signal,
        "turn POST/stream",
        async (operationSignal) => {
          const response = await this.#fetch(
            `/api/sessions/${encodeURIComponent(sessionId)}/turns`,
            {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ prompt }),
              signal: operationSignal,
            },
          );
          return readProductSessionEvents(
            response,
            sessionId,
            acceptEvent,
            firstSequence,
            operationSignal,
            initialWorld,
          );
        },
      );
    } catch (error) {
      const projection = await this.#readSettledSession(
        sessionId,
        deadline,
        signal,
        verifiedWorld,
      );
      throw new ProductSessionTurnError(
        error instanceof Error ? error.message : "Agent Gateway turn stream 失败",
        projection,
      );
    }
    const projection = await this.#beforeDeadline(
      deadline,
      signal,
      "final projection GET",
      (operationSignal) => this.readSession(
        sessionId,
        operationSignal,
        stream.verifiedWorld,
      ),
    );
    if (stream.type === "turn.failed") {
      throw new ProductSessionTurnError(stream.error, projection);
    }
    return projection;
  }
}
