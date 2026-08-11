import {
  AgentRegistry,
  createAgentSession,
  discoverAuthStorage,
  Settings,
  type CreateAgentSessionOptions,
  type CustomTool,
} from "@oh-my-pi/pi-coding-agent/sdk";
import { ModelRegistry } from "@oh-my-pi/pi-coding-agent/config/model-registry";
import type { AgentSession } from "@oh-my-pi/pi-coding-agent/session/agent-session";
import { SessionManager } from "@oh-my-pi/pi-coding-agent/session/session-manager";

import {
  CURRENT_WORLD_REF,
  deepFreeze,
  WorldToolSurface,
} from "@demiurges/world";

export const OMP_AGENT_RUNTIME_VERSION = "17.2.12";

export const OMP_WORLD_TOOL_NAMES = Object.freeze([
  "world_read",
  "world_write",
  "world_edit",
  "world_run",
] as const);

export const OMP_SYSTEM_PROMPT = `你是 Demiurges 的 World Agent。你只能通过 world_read、world_write、world_edit、world_run 操作和观察世界。read/write/edit/run 是世界能力；adopt 属于 Harness control authority，你不能调用或伪造它。以工具返回的结构化证据为准，不要声称未被证据证明的成功。`;

export const OMP_RESTRICTED_SESSION_POLICY = Object.freeze({
  restrictToolNames: true,
  allowRestrictedCustomTools: true,
  disableExtensionDiscovery: true,
  enableMCP: false,
  enableIrc: false,
  enableLsp: false,
  useInMemorySession: true,
  expandPromptTemplates: false,
  syntheticPrompt: true,
} as const);

export const OMP_SINGLE_MODEL_SETTINGS = Object.freeze({
  "retry.enabled": false,
  "retry.modelFallback": false,
  "retry.usageAwareFallback": false,
  "contextPromotion.enabled": false,
  "compaction.enabled": false,
  "compaction.midTurnEnabled": false,
  "compaction.strategy": "off",
} as const);

export type OmpHostTool = CustomTool<any, unknown>;

export interface OmpAgentClientPort {
  start(signal?: AbortSignal): Promise<void>;
  stop(): Promise<void>;
  promptAndWait(message: string, signal?: AbortSignal): Promise<unknown>;
  getLastAssistantText(): Promise<string | null>;
  getState(): Promise<{
    sessionId: string;
    toolNames: readonly string[];
    enabledToolNames: readonly string[];
    mountedToolNames: readonly string[];
  }>;
}

export type OmpAgentClientFactory = (
  tools: readonly OmpHostTool[],
) => OmpAgentClientPort;

export interface OmpModelSelector {
  readonly provider: string;
  readonly modelId: string;
  readonly selector: string;
}

type OmpGetApiKey = NonNullable<CreateAgentSessionOptions["getApiKey"]>;
type OmpRequestModel = Parameters<OmpGetApiKey>[0];

const OMP_MODEL_PART = /^[A-Za-z0-9][A-Za-z0-9._:-]*$/;

export function requireOmpModelSelector(value: string | undefined): OmpModelSelector {
  if (typeof value !== "string" || value.length === 0 || value.trim() !== value) {
    throw new Error("DEMIURGES_OMP_MODEL 必须显式设置为 provider/model");
  }
  const parts = value.split("/");
  const provider = parts[0] ?? "";
  const modelId = parts[1] ?? "";
  if (
    parts.length !== 2 ||
    provider.length > 64 ||
    modelId.length > 256 ||
    !OMP_MODEL_PART.test(provider) ||
    !OMP_MODEL_PART.test(modelId)
  ) {
    throw new Error("DEMIURGES_OMP_MODEL 必须是唯一合法的 provider/model");
  }
  if (provider === "fireworks" && modelId.endsWith("-fast")) {
    throw new Error(
      "DEMIURGES_OMP_MODEL 不接受带 intrinsic fallback 的 Fireworks fast selector",
    );
  }
  return Object.freeze({ provider, modelId, selector: value });
}

function requireOmpModelIdentity(
  selector: OmpModelSelector,
  model: Pick<OmpRequestModel, "provider" | "id">,
): void {
  if (model.provider !== selector.provider || model.id !== selector.modelId) {
    throw new Error(
      `OMP model identity 漂移：expected ${selector.selector}, actual ${model.provider}/${model.id}`,
    );
  }
}

export function createPinnedOmpCredentialResolver(
  selector: OmpModelSelector,
  providerSessionId: string,
  resolveInitialCredential: (
    model: OmpRequestModel,
    providerSessionId: string,
  ) => Promise<string | undefined>,
): OmpGetApiKey {
  if (providerSessionId.length === 0) {
    throw new Error("OMP provider session identity 不能为空");
  }
  let pinnedCredential: Promise<string | undefined> | undefined;
  return (model) => {
    requireOmpModelIdentity(selector, model);
    pinnedCredential ??= Promise.resolve().then(() =>
      resolveInitialCredential(model, providerSessionId),
    );
    return pinnedCredential;
  };
}

export interface OmpToolTraceEntry {
  readonly sequence: number;
  readonly tool: (typeof OMP_WORLD_TOOL_NAMES)[number];
  readonly input: unknown;
  readonly status: "succeeded" | "failed";
  readonly result?: unknown;
  readonly error?: string;
}

export interface OmpAgentTurnResult {
  readonly responseText: string;
  readonly trace: readonly OmpToolTraceEntry[];
}

export interface OmpWorldToolObservation {
  readonly trace: OmpToolTraceEntry;
  readonly evidence?: unknown;
}

export type OmpWorldToolObserver = (
  observation: OmpWorldToolObservation,
) => void;

export class OmpAgentTurnError extends Error {
  readonly trace: readonly OmpToolTraceEntry[];
  readonly cleanupError?: string;

  constructor(
    message: string,
    trace: readonly OmpToolTraceEntry[],
    cleanupError?: string,
  ) {
    super(message);
    this.name = "OmpAgentTurnError";
    this.trace = deepFreeze([...trace]) as readonly OmpToolTraceEntry[];
    this.cleanupError = cleanupError;
    Object.freeze(this);
  }
}

type TraceSink = (entry: OmpToolTraceEntry, evidence?: unknown) => void;
type ToolLimitSink = (error: Error) => void;
interface StructuredToolResult {
  readonly content: readonly [{ readonly type: "text"; readonly text: string }];
  readonly details: unknown;
}

const MAX_WORLD_TOOL_CALLS_PER_TURN = 128;
const MAX_TOOL_INPUT_NODES = 128;
const MAX_TOOL_INPUT_DEPTH = 6;
const MAX_TOOL_INPUT_STRING_LENGTH = 512;
const MAX_TRACE_DATA_NODES = 4_096;
const MAX_TRACE_DATA_CHARS = 65_536;
const MAX_TRACE_DATA_DEPTH = 12;
const MAX_TRACE_COLLECTION_ITEMS = 256;
const MAX_TRACE_STRING_LENGTH = 2_048;

function boundedError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.slice(0, 240);
}

interface TraceDataBudget {
  seen: WeakSet<object>;
  nodes: number;
  chars: number;
}

function traceTurnData(value: unknown, budget: TraceDataBudget): unknown {
  budget.seen = new WeakSet<object>();
  return traceData(value, budget);
}

function traceData(
  value: unknown,
  budget: TraceDataBudget = {
    seen: new WeakSet<object>(),
    nodes: MAX_TRACE_DATA_NODES,
    chars: MAX_TRACE_DATA_CHARS,
  },
  depth = 0,
): unknown {
  if (budget.nodes <= 0 || budget.chars <= 0) return "[trace-budget]";
  budget.nodes -= 1;
  if (depth > MAX_TRACE_DATA_DEPTH) return "[max-depth]";
  if (
    value === null ||
    typeof value === "boolean"
  ) {
    return value;
  }
  if (typeof value === "string") {
    return boundedTraceString(value, budget);
  }
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : `[${String(value)}]`;
  }
  if (typeof value !== "object") return `[${typeof value}]`;
  if (budget.seen.has(value)) return "[circular]";
  budget.seen.add(value);

  if (Array.isArray(value)) {
    const result: unknown[] = [];
    const limit = Math.min(value.length, MAX_TRACE_COLLECTION_ITEMS);
    for (let index = 0; index < limit; index += 1) {
      if (budget.nodes <= 0 || budget.chars <= 0) break;
      const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
      result.push(
        descriptor && "value" in descriptor
          ? traceData(descriptor.value, budget, depth + 1)
          : "[non-data]",
      );
    }
    if (result.length < value.length) result.push("[trace-truncated]");
    return result;
  }

  if (Object.getPrototypeOf(value) !== Object.prototype) {
    return "[non-plain-object]";
  }
  const result = Object.create(null) as Record<string, unknown>;
  const keys = Object.keys(value);
  const limit = Math.min(keys.length, MAX_TRACE_COLLECTION_ITEMS);
  for (let index = 0; index < limit; index += 1) {
    if (budget.nodes <= 0 || budget.chars <= 0) break;
    const key = keys[index] ?? "";
    const boundedKeyBase = boundedTraceString(key, budget);
    let boundedKey = boundedKeyBase;
    let collision = 1;
    while (Object.prototype.hasOwnProperty.call(result, boundedKey)) {
      boundedKey = `${boundedKeyBase.slice(0, MAX_TRACE_STRING_LENGTH - 12)}#${collision++}`;
    }
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    result[boundedKey] =
      descriptor && "value" in descriptor
        ? traceData(descriptor.value, budget, depth + 1)
        : "[non-data]";
  }
  if (Object.keys(result).length < keys.length) {
    result.__trace_truncated__ = true;
  }
  return result;
}

function boundedTraceString(
  value: string,
  budget: TraceDataBudget,
): string {
  const limit = Math.min(
    MAX_TRACE_STRING_LENGTH,
    Math.max(0, budget.chars),
  );
  const result =
    value.length <= limit
      ? value
      : `${value.slice(0, Math.max(0, limit - 20))}...[trace-truncated]`;
  budget.chars -= result.length;
  return result;
}

function requireBoundedToolInput(
  value: unknown,
  state = { nodes: MAX_TOOL_INPUT_NODES },
  depth = 0,
): void {
  if (depth > MAX_TOOL_INPUT_DEPTH) {
    throw new Error(`world tool input 深度不能超过 ${MAX_TOOL_INPUT_DEPTH}`);
  }
  state.nodes -= 1;
  if (state.nodes < 0) {
    throw new Error(`world tool input 节点不能超过 ${MAX_TOOL_INPUT_NODES}`);
  }
  if (typeof value === "string") {
    if (value.length > MAX_TOOL_INPUT_STRING_LENGTH) {
      throw new Error(
        `world tool input 字符串不能超过 ${MAX_TOOL_INPUT_STRING_LENGTH} 字符`,
      );
    }
    return;
  }
  if (
    value === null ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return;
  }
  if (typeof value !== "object") {
    throw new Error("world tool input 必须是 JSON data");
  }
  if (
    Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Object.prototype
  ) {
    throw new Error("world tool input 必须是 plain JSON data");
  }
  const ownKeys = Reflect.ownKeys(value);
  if (ownKeys.length > state.nodes) {
    throw new Error(`world tool input 节点不能超过 ${MAX_TOOL_INPUT_NODES}`);
  }
  for (const key of ownKeys) {
    if (typeof key !== "string") {
      throw new Error("world tool input 不接受 symbol key");
    }
    if (key === "__proto__") {
      throw new Error("world tool input 不接受 __proto__ key");
    }
    if (key.length > MAX_TOOL_INPUT_STRING_LENGTH) {
      throw new Error(
        `world tool input key 不能超过 ${MAX_TOOL_INPUT_STRING_LENGTH} 字符`,
      );
    }
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) {
      throw new Error("world tool input 必须是 plain JSON data");
    }
    requireBoundedToolInput(descriptor.value, state, depth + 1);
  }
}

function resultForModel(value: unknown): StructuredToolResult {
  const json = JSON.stringify(value);
  if (json === undefined) {
    throw new Error("world tool result 不是 JSON data");
  }
  const details = JSON.parse(json) as unknown;
  return {
    content: [{ type: "text", text: json }],
    details,
  };
}

function exactEmptyInput(input: Record<string, unknown>): void {
  if (
    input === null ||
    typeof input !== "object" ||
    Array.isArray(input) ||
    Object.getPrototypeOf(input) !== Object.prototype ||
    Reflect.ownKeys(input).length !== 0
  ) {
    throw new Error("world_read input 必须是空 plain JSON data record");
  }
}

function toolSchema(
  properties: Record<string, unknown>,
  required: readonly string[],
): Record<string, unknown> {
  return {
    type: "object",
    properties,
    required,
    additionalProperties: false,
  };
}

export function createOmpWorldTools(
  surface: WorldToolSurface,
  sink: TraceSink = () => undefined,
  onToolLimit: ToolLimitSink = () => undefined,
  turnSignal?: AbortSignal,
): OmpHostTool[] {
  let sequence = 0;
  const turnTraceBudget: TraceDataBudget = {
    seen: new WeakSet<object>(),
    nodes: MAX_TRACE_DATA_NODES,
    chars: MAX_TRACE_DATA_CHARS,
  };
  const wrap = (
    tool: (typeof OMP_WORLD_TOOL_NAMES)[number],
    execute: (input: Record<string, unknown>) => unknown | Promise<unknown>,
  ) =>
    async (
      _toolCallId: string,
      input: Record<string, unknown>,
      _onUpdate: unknown,
      _context: unknown,
      _signal?: AbortSignal,
    ): Promise<StructuredToolResult> => {
      if (turnSignal?.aborted) throw new Error("world tool turn 已取消");
      const currentSequence = ++sequence;
      if (currentSequence > MAX_WORLD_TOOL_CALLS_PER_TURN) {
        const error = new Error(
          `单个 Agent turn 的 world tool calls 不能超过 ${MAX_WORLD_TOOL_CALLS_PER_TURN}`,
        );
        onToolLimit(error);
        throw error;
      }
      try {
        if (_signal?.aborted) throw new Error("world tool call 已取消");
        requireBoundedToolInput(input);
        const result = await execute(input);
        const modelResult = resultForModel(result);
        const entry = deepFreeze({
          sequence: currentSequence,
          tool,
          input: traceTurnData(input, turnTraceBudget),
          status: "succeeded",
          result: traceTurnData(modelResult.details, turnTraceBudget),
        }) as OmpToolTraceEntry;
        sink(entry, result);
        return modelResult;
      } catch (error) {
        const message = boundedError(error);
        sink(
          deepFreeze({
            sequence: currentSequence,
            tool,
            input: traceTurnData(input, turnTraceBudget),
            status: "failed",
            error: message,
          }) as OmpToolTraceEntry,
        );
        throw new Error(message);
      }
    };

  const refSchema = {
    type: "object",
    properties: {
      name: { type: "string", const: CURRENT_WORLD_REF },
      snapshotId: {
        type: "string",
        pattern: "^snapshot:.+",
        maxLength: MAX_TOOL_INPUT_STRING_LENGTH,
      },
      version: { type: "integer", minimum: 1 },
    },
    required: ["name", "snapshotId", "version"],
    additionalProperties: false,
  };

  return Object.freeze([
    Object.freeze({
      name: "world_read",
      label: "Read world",
      description: "读取 current Snapshot 与 RefRecord。",
      loadMode: "essential",
      approval: "read",
      parameters: toolSchema({}, []),
      execute: wrap("world_read", (input) => {
        exactEmptyInput(input);
        return surface.read();
      }),
    }),
    Object.freeze({
      name: "world_write",
      label: "Write world",
      description: "创建 falling-cube root Snapshot。",
      loadMode: "essential",
      approval: "write",
      parameters: toolSchema(
        { cubeHeight: { type: "number", minimum: 0.5, maximum: 4 } },
        ["cubeHeight"],
      ),
      execute: wrap("world_write", (input) => surface.write(input)),
    }),
    Object.freeze({
      name: "world_edit",
      label: "Edit world",
      description: "以 fresh RefRecord CAS 修改方块高度。",
      loadMode: "essential",
      approval: "write",
      parameters: toolSchema(
        {
          expected: refSchema,
          cubeHeight: { type: "number", minimum: 0.5, maximum: 4 },
        },
        ["expected", "cubeHeight"],
      ),
      execute: wrap("world_edit", (input) => surface.edit(input)),
    }),
    Object.freeze({
      name: "world_run",
      label: "Run world",
      description: "运行固定 MuJoCo falling-cube 推演并返回 Episode 与 Evaluation。",
      loadMode: "essential",
      approval: "exec",
      parameters: toolSchema(
        {
          runId: {
            type: "string",
            pattern: "^run:.+",
            maxLength: MAX_TOOL_INPUT_STRING_LENGTH,
          },
        },
        ["runId"],
      ),
      execute: wrap("world_run", (input) => surface.run(input)),
    }),
  ]) as unknown as OmpHostTool[];
}

function requireExactWorldToolNames(
  label: string,
  toolNames: readonly string[],
): void {
  const expected = [...OMP_WORLD_TOOL_NAMES].sort();
  const actual = [...toolNames].sort();
  if (
    actual.length !== expected.length ||
    actual.some((name, index) => name !== expected[index])
  ) {
    throw new Error(
      `OMP ${label} tool surface 必须恰好为 ${expected.join(", ")}；实际为 ${actual.join(", ") || "<empty>"}`,
    );
  }
}

function requireRestrictedWorldToolSurface(state: {
  readonly toolNames: readonly string[];
  readonly enabledToolNames: readonly string[];
  readonly mountedToolNames: readonly string[];
}): void {
  requireExactWorldToolNames("active", state.toolNames);
  requireExactWorldToolNames("enabled", state.enabledToolNames);
  if (state.mountedToolNames.length !== 0) {
    throw new Error(
      `OMP mounted tool surface 必须为空；实际为 ${[...state.mountedToolNames].sort().join(", ")}`,
    );
  }
}

class RestrictedOmpSdkClient implements OmpAgentClientPort {
  readonly #tools: readonly OmpHostTool[];
  readonly #modelSelector: OmpModelSelector | undefined;
  #session: AgentSession | undefined;
  #startPromise: Promise<void> | undefined;
  #closeAuthStorage: (() => void) | undefined;

  constructor(
    tools: readonly OmpHostTool[],
    modelSelector?: OmpModelSelector,
  ) {
    this.#tools = tools;
    this.#modelSelector = modelSelector;
  }

  async start(signal?: AbortSignal): Promise<void> {
    if (this.#session || this.#startPromise) {
      throw new Error("OMP session 已启动");
    }
    const starting = this.#start(signal);
    this.#startPromise = starting;
    try {
      await starting;
    } finally {
      if (this.#startPromise === starting) this.#startPromise = undefined;
    }
  }

  async #start(signal?: AbortSignal): Promise<void> {
    if (signal?.aborted) throw new Error("OMP session 启动已取消");
    const cwd = process.cwd();
    const authStorage = await discoverAuthStorage();
    if (signal?.aborted) {
      authStorage.close();
      throw new Error("OMP session 启动已取消");
    }
    const modelRegistry = new ModelRegistry(authStorage);
    this.#closeAuthStorage = () => authStorage.close();
    const sessionManager = SessionManager.inMemory(cwd);
    const providerSessionId = sessionManager.getSessionId();
    const getApiKey = this.#modelSelector
      ? createPinnedOmpCredentialResolver(
          this.#modelSelector,
          providerSessionId,
          (model, sessionId) => modelRegistry.getApiKey(model, sessionId),
        )
      : undefined;
    let createdSession: AgentSession | undefined;
    try {
      const { session } = await createAgentSession({
        cwd,
        sessionManager,
        providerSessionId,
        agentRegistry: new AgentRegistry(),
        settings: Settings.isolated(OMP_SINGLE_MODEL_SETTINGS),
        modelRegistry,
        ...(getApiKey ? { getApiKey } : {}),
        customTools: [...this.#tools],
        ...(this.#modelSelector
          ? { modelPattern: this.#modelSelector.selector }
          : {}),
        toolNames: [...OMP_WORLD_TOOL_NAMES],
        restrictToolNames: OMP_RESTRICTED_SESSION_POLICY.restrictToolNames,
        allowRestrictedCustomTools:
          OMP_RESTRICTED_SESSION_POLICY.allowRestrictedCustomTools,
        disableExtensionDiscovery:
          OMP_RESTRICTED_SESSION_POLICY.disableExtensionDiscovery,
        enableMCP: OMP_RESTRICTED_SESSION_POLICY.enableMCP,
        enableIrc: OMP_RESTRICTED_SESSION_POLICY.enableIrc,
        enableLsp: OMP_RESTRICTED_SESSION_POLICY.enableLsp,
        contextFiles: [],
        skills: [],
        rules: [],
        promptTemplates: [],
        slashCommands: [],
        systemPrompt: [OMP_SYSTEM_PROMPT],
        hasUI: false,
        autoApprove: true,
        skipPythonPreflight: true,
        deadline: Date.now() + 120_000,
      });
      createdSession = session;
      if (signal?.aborted) throw new Error("OMP session 启动已取消");
      this.#session = session;
      this.#requireModelIdentity();
      requireRestrictedWorldToolSurface(await this.getState());
    } catch (error) {
      this.#session = undefined;
      if (createdSession) {
        try {
          await createdSession.dispose();
        } catch {
          // Preserve the startup authority failure; cleanup is best effort here.
        }
      }
      this.#closeOwnedAuthStorage();
      throw error;
    }
  }

  async stop(): Promise<void> {
    const starting = this.#startPromise;
    if (starting) {
      try {
        await starting;
      } catch {
        // Startup owns its partial-session cleanup before stop continues.
      }
    }
    const session = this.#session;
    this.#session = undefined;
    try {
      if (session) await session.dispose();
    } finally {
      this.#closeOwnedAuthStorage();
    }
  }

  async promptAndWait(message: string, signal?: AbortSignal): Promise<void> {
    const session = this.#requireSession();
    if (signal?.aborted) throw new Error("OMP turn 已取消");
    let aborting: Promise<void> | undefined;
    const abort = () => {
      aborting ??= session.abort({
        goalReason: "interrupted",
        reason: "Demiurges turn aborted",
      });
    };
    signal?.addEventListener("abort", abort, { once: true });
    try {
      const forwarded = await session.prompt(message, {
        expandPromptTemplates:
          OMP_RESTRICTED_SESSION_POLICY.expandPromptTemplates,
        synthetic: OMP_RESTRICTED_SESSION_POLICY.syntheticPrompt,
        userInitiated: true,
      });
      if (!forwarded) throw new Error("OMP prompt 未转发给模型");
      await session.waitForIdle();
      if (aborting) await aborting;
      if (signal?.aborted) throw new Error("OMP turn 已取消");
      this.#requireModelIdentity();
    } finally {
      signal?.removeEventListener("abort", abort);
    }
  }

  async getLastAssistantText(): Promise<string | null> {
    return this.#requireSession().getLastAssistantText() ?? null;
  }

  async getState(): Promise<{
    sessionId: string;
    toolNames: readonly string[];
    enabledToolNames: readonly string[];
    mountedToolNames: readonly string[];
  }> {
    const session = this.#requireSession();
    return {
      sessionId: session.sessionId,
      toolNames: session.getActiveToolNames(),
      enabledToolNames: session.getEnabledToolNames(),
      mountedToolNames: session.getMountedXdevToolNames(),
    };
  }

  #requireSession(): AgentSession {
    if (!this.#session) throw new Error("OMP session 尚未启动");
    return this.#session;
  }

  #requireModelIdentity(): void {
    if (!this.#modelSelector) return;
    const model = this.#requireSession().model;
    if (!model) {
      throw new Error(
        `OMP model identity 漂移：expected ${this.#modelSelector.selector}, actual <unselected>`,
      );
    }
    requireOmpModelIdentity(this.#modelSelector, model);
  }

  #closeOwnedAuthStorage(): void {
    const close = this.#closeAuthStorage;
    this.#closeAuthStorage = undefined;
    close?.();
  }
}

export const createDefaultOmpAgentClient: OmpAgentClientFactory = (tools) =>
  new RestrictedOmpSdkClient(tools);

export function createOmpAgentClientFactory(
  selector: OmpModelSelector,
): OmpAgentClientFactory {
  return (tools) => new RestrictedOmpSdkClient(tools, selector);
}

async function resolveInstalledOmpVersion(): Promise<string> {
  const sdkUrl = import.meta.resolve("@oh-my-pi/pi-coding-agent/sdk");
  const manifest = (await Bun.file(new URL("../package.json", sdkUrl)).json()) as {
    version?: unknown;
  };
  if (typeof manifest.version !== "string") {
    throw new Error("无法读取已安装 OMP runtime version");
  }
  if (manifest.version !== OMP_AGENT_RUNTIME_VERSION) {
    throw new Error(
      `OMP runtime version 漂移：expected ${OMP_AGENT_RUNTIME_VERSION}, actual ${manifest.version}`,
    );
  }
  return manifest.version;
}

function requirePrompt(prompt: string): string {
  if (typeof prompt !== "string" || prompt.trim().length === 0) {
    throw new Error("Agent prompt 不能为空");
  }
  if (prompt.length > 8_000) {
    throw new Error("Agent prompt 不能超过 8000 字符");
  }
  if (prompt.trimStart().startsWith("/")) {
    throw new Error("Agent prompt 不接受 OMP slash/control syntax");
  }
  if (/(^|[\s([{<"'`])@(?:"[^"]+"|'[^']+'|[^\s@]+)/u.test(prompt)) {
    throw new Error("Agent prompt 不接受 OMP @file mention syntax");
  }
  return prompt;
}

async function awaitAgentPhase<T>(
  phase: string,
  signal: AbortSignal | undefined,
  operation: () => Promise<T>,
): Promise<T> {
  let pending: Promise<T>;
  try {
    pending = operation();
  } catch (error) {
    pending = Promise.reject(error);
  }
  if (!signal) return pending;
  pending.catch(() => undefined);
  let rejectAbort: ((error: Error) => void) | undefined;
  const aborted = new Promise<never>((_, reject) => {
    rejectAbort = reject;
  });
  const abort = () => rejectAbort?.(new Error(`Agent ${phase} 已取消`));
  signal.addEventListener("abort", abort, { once: true });
  if (signal.aborted) abort();
  try {
    return await Promise.race([pending, aborted]);
  } finally {
    signal.removeEventListener("abort", abort);
  }
}

export class OmpWorldAgent {
  readonly #surface: WorldToolSurface;
  readonly #clientFactory: OmpAgentClientFactory;

  constructor(
    surface: WorldToolSurface,
    clientFactory: OmpAgentClientFactory = createDefaultOmpAgentClient,
  ) {
    this.#surface = surface;
    this.#clientFactory = clientFactory;
  }

  async run(
    prompt: string,
    observer: OmpWorldToolObserver = () => undefined,
    signal?: AbortSignal,
  ): Promise<OmpAgentTurnResult> {
    const admittedPrompt = requirePrompt(prompt);
    if (signal?.aborted) throw new Error("Agent turn 已取消");
    const toolAuthority = new AbortController();
    const closeToolAuthority = () => toolAuthority.abort();
    signal?.addEventListener("abort", closeToolAuthority, { once: true });
    const trace: OmpToolTraceEntry[] = [];
    let toolLimitError: Error | undefined;
    const tools = createOmpWorldTools(
      this.#surface,
      (entry, evidence) => {
        trace.push(entry);
        if (toolAuthority.signal.aborted) return;
        try {
          observer(
            deepFreeze({
              trace: entry,
              ...(evidence === undefined ? {} : { evidence }),
            }) as OmpWorldToolObservation,
          );
        } catch {
          // Presentation/transport observers cannot change world tool outcomes.
        }
      },
      (error) => {
        toolLimitError ??= error;
      },
      toolAuthority.signal,
    );
    let client: OmpAgentClientPort;
    try {
      client = this.#clientFactory(tools);
    } catch (error) {
      closeToolAuthority();
      signal?.removeEventListener("abort", closeToolAuthority);
      throw error;
    }

    let result: OmpAgentTurnResult | undefined;
    let primaryError: unknown;
    try {
      await awaitAgentPhase("start", signal, () => client.start(signal));
      const state = await awaitAgentPhase("tool surface check", signal, () =>
        client.getState(),
      );
      requireRestrictedWorldToolSurface(state);
      await awaitAgentPhase("prompt", signal, () =>
        client.promptAndWait(admittedPrompt, signal),
      );
      closeToolAuthority();
      if (toolLimitError) throw toolLimitError;
      const responseText =
        (await awaitAgentPhase("response", signal, () =>
          client.getLastAssistantText(),
        )) ?? "";
      result = deepFreeze({
        responseText,
        trace: [...trace].sort((left, right) => left.sequence - right.sequence),
      }) as OmpAgentTurnResult;
    } catch (error) {
      closeToolAuthority();
      primaryError = error;
    }

    let cleanupError: unknown;
    try {
      await awaitAgentPhase("stop", signal, () => client.stop());
    } catch (error) {
      cleanupError = error;
    }
    closeToolAuthority();
    signal?.removeEventListener("abort", closeToolAuthority);

    const frozenTrace = [...trace].sort(
      (left, right) => left.sequence - right.sequence,
    );
    if (primaryError !== undefined) {
      throw new OmpAgentTurnError(
        boundedError(primaryError),
        frozenTrace,
        cleanupError === undefined ? undefined : boundedError(cleanupError),
      );
    }
    if (cleanupError !== undefined) {
      throw new OmpAgentTurnError(
        `OMP cleanup 失败：${boundedError(cleanupError)}`,
        frozenTrace,
      );
    }
    if (!result) throw new Error("OMP turn 未产生结果");
    return result;
  }
}

export async function smokeOmpSdk(
  surface: WorldToolSurface,
): Promise<{
  readonly runtimeVersion: string;
  readonly toolNames: readonly string[];
  readonly sessionId: string;
}> {
  const tools = createOmpWorldTools(surface);
  const client = createDefaultOmpAgentClient(tools);
  let result:
    | {
        readonly runtimeVersion: string;
        readonly toolNames: readonly string[];
        readonly sessionId: string;
      }
    | undefined;
  let primaryError: unknown;
  try {
    await client.start();
    const state = await client.getState();
    requireRestrictedWorldToolSurface(state);
    result = deepFreeze({
      runtimeVersion: await resolveInstalledOmpVersion(),
      toolNames: [...state.toolNames],
      sessionId: state.sessionId,
    });
  } catch (error) {
    primaryError = error;
  }
  let cleanupError: unknown;
  try {
    await client.stop();
  } catch (error) {
    cleanupError = error;
  }
  if (primaryError !== undefined && cleanupError !== undefined) {
    throw new AggregateError(
      [primaryError, cleanupError],
      "OMP SDK smoke 与 cleanup 均失败",
    );
  }
  if (primaryError !== undefined) throw primaryError;
  if (cleanupError !== undefined) throw cleanupError;
  if (!result) throw new Error("OMP SDK smoke 未产生结果");
  return result;
}
