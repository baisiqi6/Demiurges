import {
  admitMarbleHunyuanCompositeEdit,
  decodeProductSessionAuthoringTransition,
  decodeProductSessionProjectHistoryTransition,
  decodeProductSessionEventTrusted,
  decodeProductSessionProjectionTrusted,
  requireWorldWriteInput,
  admitBallVesselTaskEdit,
  decodeBallVesselTaskTransition,
  decodeBallVesselTaskPreview,
  type BallVesselTaskOperation,
  type BallVesselTaskPreview,
  type ProductSessionEvent,
  type ProductSessionProjection,
  type WorldReadResult,
  type WorldWriteInput,
} from "@demiurges/world";

const MAX_EVENT_LINE_BYTES = 1_000_000;
const MAX_JSON_RESPONSE_BYTES = 2_000_000;
const MAX_TURN_EVENTS = 130;
const SETTLED_RESYNC_ATTEMPTS = 100;
const SETTLED_RESYNC_DELAY_MS = 20;
const DEFAULT_TURN_TIMEOUT_MS = 120_000;
const MAX_WORLD_PROJECT_BUNDLE_BYTES = 64 * 1024 * 1024;
const WORLD_PROJECT_BUNDLE_MEDIA_TYPE = "application/vnd.demiurges.world-project+zip";

export interface WorldProjectSummary {
  readonly projectId: string;
  readonly displayName: string;
  readonly revision: string;
}

export interface WorldProjectList {
  readonly mode: "writer" | "reader";
  readonly projects: readonly WorldProjectSummary[];
  readonly rejectedEntryCount: number;
}

type EventSink = (event: ProductSessionEvent) => void;
type FetchPort = (input: string | Request | URL, init?: RequestInit) => Promise<Response>;
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

function plainRecord(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Object.prototype ||
    Reflect.ownKeys(value).length !== keys.length ||
    !keys.every((key) => Object.prototype.hasOwnProperty.call(value, key))
  ) {
    throw new Error("World Project response shape 非法");
  }
  return value as Record<string, unknown>;
}

function projectSummary(value: unknown): WorldProjectSummary {
  const record = plainRecord(value, ["projectId", "displayName", "revision"]);
  if (
    typeof record.projectId !== "string" ||
    !/^project:[a-z0-9][a-z0-9-]{0,63}$/.test(record.projectId) ||
    typeof record.displayName !== "string" ||
    record.displayName.length < 1 ||
    record.displayName.length > 128 ||
    typeof record.revision !== "string" ||
    !/^project-revision:sha256:[a-f0-9]{64}$/.test(record.revision)
  ) {
    throw new Error("World Project summary 非法");
  }
  return Object.freeze({
    projectId: record.projectId,
    displayName: record.displayName,
    revision: record.revision,
  });
}

function requireOperationSuccess(value: unknown, publishedIdentity: string): void {
  const terminal = plainRecord(value, [
    "schemaVersion",
    "operationId",
    "bindingDigest",
    "variant",
    "publishedIdentity",
  ]);
  if (
    terminal.schemaVersion !== 1 ||
    typeof terminal.operationId !== "string" ||
    !/^op:[A-Za-z0-9._-]{1,127}$/.test(terminal.operationId) ||
    typeof terminal.bindingDigest !== "string" ||
    !/^[a-f0-9]{64}$/.test(terminal.bindingDigest) ||
    terminal.variant !== "success" ||
    terminal.publishedIdentity !== publishedIdentity
  ) {
    throw new Error("World Project operation terminal 非法");
  }
}

async function readBoundedBytes(
  response: Response,
  maximumBytes: number,
  exactBytes?: number,
): Promise<Uint8Array> {
  if (!response.body) throw new Error("Agent Gateway binary response 缺少 body");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maximumBytes || (exactBytes !== undefined && total > exactBytes)) {
      await reader.cancel().catch(() => undefined);
      throw new Error("World Project export byteLength 非法");
    }
    chunks.push(value);
  }
  if (exactBytes !== undefined && total !== exactBytes) {
    throw new Error("World Project export short read");
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
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

export class ProductSessionAuthoringError extends Error {
  readonly projection: ProductSessionProjection;

  constructor(message: string, projection: ProductSessionProjection) {
    super(message.slice(0, 240));
    this.name = "ProductSessionAuthoringError";
    this.projection = projection;
    Object.freeze(this);
  }
}

export class ProductSessionAuthorityUnavailableError extends Error {
  readonly sessionId: string;

  constructor(sessionId: string) {
    super("任务结果尚未核实，当前世界已断开。请新建 Session 后重新开始。");
    this.name = "ProductSessionAuthorityUnavailableError";
    this.sessionId = sessionId;
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

  async listProjects(): Promise<WorldProjectList> {
    const body = plainRecord(await responseJson(await this.#fetch("/api/projects")), [
      "mode",
      "projects",
      "rejectedEntryCount",
    ]);
    if (
      (body.mode !== "writer" && body.mode !== "reader") ||
      !Array.isArray(body.projects) ||
      Reflect.ownKeys(body.projects).length !== body.projects.length + 1 ||
      typeof body.rejectedEntryCount !== "number" ||
      !Number.isSafeInteger(body.rejectedEntryCount) ||
      body.rejectedEntryCount < 0
    ) {
      throw new Error("World Project list 非法");
    }
    return Object.freeze({
      mode: body.mode,
      projects: Object.freeze(body.projects.map(projectSummary)),
      rejectedEntryCount: body.rejectedEntryCount,
    });
  }

  async openProject(projectId: string): Promise<{
    readonly project: WorldProjectSummary;
    readonly session: ProductSessionProjection;
  }> {
    const body = plainRecord(await responseJson(await this.#fetch(
      `/api/projects/${encodeURIComponent(projectId)}/open`,
      { method: "POST" },
    )), ["project", "session"]);
    return Object.freeze({
      project: projectSummary(body.project),
      session: await decodeProductSessionProjectionTrusted(body.session),
    });
  }

  async saveProject(
    sessionId: string,
    input: {
      readonly projectId: string;
      readonly displayName: string;
      readonly expectedRevision: string | null;
    },
    idempotencyKey: string = crypto.randomUUID(),
  ): Promise<WorldProjectSummary> {
    const body = plainRecord(await responseJson(await this.#fetch(
      `/api/sessions/${encodeURIComponent(sessionId)}/project/${
        input.expectedRevision === null ? "save-as" : "save"
      }`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": idempotencyKey,
        },
        body: JSON.stringify(input),
      },
    )), ["project", "terminal", "replayed"]);
    if (typeof body.replayed !== "boolean") throw new Error("World Project save result 非法");
    const project = projectSummary(body.project);
    requireOperationSuccess(body.terminal, project.revision);
    return project;
  }

  async moveProjectHistory(
    sessionId: string,
    prior: ProductSessionProjection,
    direction: "undo" | "redo",
    projectRevision: string,
  ): Promise<ProductSessionProjection> {
    if (prior.world === null) throw new Error("World Project history 缺少 world authority");
    const bodyValue = await responseJson(await this.#fetch(
      `/api/sessions/${encodeURIComponent(sessionId)}/project/${direction}`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ projectRevision, ref: prior.world.ref }),
      },
    ));
    if (typeof bodyValue !== "object" || bodyValue === null || Array.isArray(bodyValue)) {
      throw new Error("World Project history response 非法");
    }
    const body = bodyValue as Record<string, unknown>;
    if (body.status !== "updated" && body.status !== "unchanged") {
      throw new Error("World Project history status 非法");
    }
    const expectedKeys = body.status === "updated"
      ? ["status", "projection", "update"]
      : ["status", "projection"];
    plainRecord(body, expectedKeys);
    return decodeProductSessionProjectHistoryTransition(
      body.projection,
      sessionId,
      prior,
      direction,
      body.status,
    );
  }

  async exportProject(projectId: string): Promise<Uint8Array> {
    const response = await this.#fetch(
      `/api/projects/${encodeURIComponent(projectId)}/export`,
    );
    if (!response.ok) await responseJson(response);
    if (mediaType(response.headers.get("content-type")) !== WORLD_PROJECT_BUNDLE_MEDIA_TYPE) {
      throw new Error("World Project export media type 非法");
    }
    const length = response.headers.get("content-length");
    if (length === null || !/^\d+$/.test(length) || Number(length) > MAX_WORLD_PROJECT_BUNDLE_BYTES) {
      throw new Error("World Project export byteLength 非法");
    }
    return readBoundedBytes(response, MAX_WORLD_PROJECT_BUNDLE_BYTES, Number(length));
  }

  async importProject(
    bytes: Uint8Array,
    idempotencyKey: string = crypto.randomUUID(),
  ): Promise<WorldProjectSummary> {
    if (bytes.byteLength > MAX_WORLD_PROJECT_BUNDLE_BYTES) {
      throw new Error("World Project bundle 超出 64 MiB");
    }
    const body = plainRecord(await responseJson(await this.#fetch("/api/projects/import", {
      method: "POST",
      headers: {
        "content-type": WORLD_PROJECT_BUNDLE_MEDIA_TYPE,
        "idempotency-key": idempotencyKey,
      },
      body: Uint8Array.from(bytes).buffer,
    })), ["terminal", "projectId", "revision", "replayed"]);
    if (
      typeof body.projectId !== "string" ||
      !/^project:[a-z0-9][a-z0-9-]{0,63}$/.test(body.projectId) ||
      typeof body.revision !== "string" ||
      !/^project-revision:sha256:[a-f0-9]{64}$/.test(body.revision) ||
      typeof body.replayed !== "boolean"
    ) {
      throw new Error("World Project import result 非法");
    }
    requireOperationSuccess(body.terminal, body.revision);
    const listed = await this.listProjects();
    const project = listed.projects.find(
      (entry) => entry.projectId === body.projectId && entry.revision === body.revision,
    );
    if (project === undefined) throw new Error("导入 Project 未出现在受信列表");
    return project;
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

  async writeWorld(
    sessionId: string,
    input: WorldWriteInput,
    prior: ProductSessionProjection,
    signal?: AbortSignal,
  ): Promise<ProductSessionProjection> {
    const parsed = requireWorldWriteInput(input);
    return this.#runAuthoringCommand(
      sessionId,
      "write",
      parsed,
      prior,
      { kind: "write", input: parsed },
      signal,
    );
  }

  async editWorld(
    sessionId: string,
    input: unknown,
    prior: ProductSessionProjection,
    signal?: AbortSignal,
  ): Promise<ProductSessionProjection> {
    if (!prior.world) throw new Error("Product Session 尚无可编辑 world");
    const admission = admitMarbleHunyuanCompositeEdit(prior.world, input);
    if (admission.status === "rejected") throw new Error(admission.code);
    if (admission.status === "unchanged") {
      return decodeProductSessionAuthoringTransition(
        prior,
        sessionId,
        prior,
        { kind: "edit", outcome: "unchanged" },
      );
    }
    return this.#runAuthoringCommand(
      sessionId,
      "edit",
      admission.canonicalWireInput,
      prior,
      { kind: "edit", outcome: "updated", input: admission.parsedInput },
      signal,
    );
  }

  async #runAuthoringCommand(
    sessionId: string,
    operation: "write" | "edit",
    input: unknown,
    prior: ProductSessionProjection,
    transition: Parameters<typeof decodeProductSessionAuthoringTransition>[3],
    signal?: AbortSignal,
  ): Promise<ProductSessionProjection> {
    const deadline = Date.now() + this.#turnTimeoutMs;
    try {
      const body = await this.#beforeDeadline(
        deadline,
        signal,
        `world/${operation} POST`,
        async (operationSignal) => {
          const response = await this.#fetch(
            `/api/sessions/${encodeURIComponent(sessionId)}/world/${operation}`,
            {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify(input),
              signal: operationSignal,
            },
          );
          return responseJson(response);
        },
      );
      return await decodeProductSessionAuthoringTransition(
        body,
        sessionId,
        prior,
        transition,
      );
    } catch (error) {
      const projection = await this.#readSettledSession(
        sessionId,
        deadline,
        signal,
        undefined,
      );
      throw new ProductSessionAuthoringError(
        error instanceof Error ? error.message : "Agent Gateway authoring command 失败",
        projection,
      );
    }
  }

  createBallWorld(prior: ProductSessionProjection, signal?: AbortSignal): Promise<ProductSessionProjection> {
    return this.#runBallTaskCommand(prior, "create", {},
      (value) => decodeBallVesselTaskTransition(value, prior.sessionId, prior, { kind: "create" }), signal);
  }

  editBallWorld(prior: ProductSessionProjection, input: unknown, signal?: AbortSignal): Promise<ProductSessionProjection> {
    if (!prior.world) return Promise.reject(new Error("WORLD_REQUIRED"));
    const admitted = admitBallVesselTaskEdit(prior.world, input);
    const operation: BallVesselTaskOperation = { kind: "edit", input: admitted };
    return this.#runBallTaskCommand(prior, "edit", admitted,
      (value) => decodeBallVesselTaskTransition(value, prior.sessionId, prior, operation), signal);
  }

  runBallWorld(prior: ProductSessionProjection, signal?: AbortSignal): Promise<ProductSessionProjection> {
    if (!prior.world) return Promise.reject(new Error("WORLD_REQUIRED"));
    const expected = prior.world.ref;
    return this.#runBallTaskCommand(prior, "run", { expected },
      (value) => decodeBallVesselTaskTransition(value, prior.sessionId, prior, { kind: "run", expected }), signal);
  }

  previewBallRepair(prior: ProductSessionProjection, signal?: AbortSignal): Promise<BallVesselTaskPreview> {
    return this.#runBallTaskCommand(prior, "repair", {},
      (value) => decodeBallVesselTaskPreview(value, prior.sessionId, prior), signal);
  }

  async #runBallTaskCommand<T>(
    prior: ProductSessionProjection,
    path: "create" | "edit" | "run" | "repair",
    input: unknown,
    decode: (value: unknown) => T,
    signal?: AbortSignal,
  ): Promise<T> {
    const deadline = Date.now() + this.#turnTimeoutMs;
    try {
      const body = await this.#beforeDeadline(deadline, signal, `ball-vessel/${path} POST`, async (operationSignal) =>
        responseJson(await this.#fetch(`/api/sessions/${encodeURIComponent(prior.sessionId)}/ball-vessel/${path}`, {
          method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(input), signal: operationSignal,
        })));
      if (signal?.aborted) throw new Error("Ball task 已取消");
      return decode(body);
    } catch (error) {
      // 命令取消后仍尝试独立的 bounded GET；只恢复 Gateway 返回的 settled authority。
      let recovered: ProductSessionProjection;
      try {
        recovered = await this.#readSettledSession(prior.sessionId, Date.now() + Math.min(this.#turnTimeoutMs, 5_000));
      } catch {
        throw new ProductSessionAuthorityUnavailableError(prior.sessionId);
      }
      throw new ProductSessionAuthoringError(error instanceof Error ? error.message : "Ball task 命令失败", recovered);
    }
  }
}
