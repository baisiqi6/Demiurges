import {
  DIAGNOSTIC_RIGID_FIXTURE_ID,
  PRIMITIVE_BOX_FIXTURE_ID,
  RuntimeMvpHost,
  WorldToolSurface,
  deepFreeze,
  type ProductSessionEvent,
  type ProductSessionProjection,
  type ProductToolTrace,
  type ProductWorldEvidence,
  type WorldReadResult,
  type WorldRunResult,
} from "@demiurges/world";

import {
  OmpWorldAgent,
  type OmpAgentClientFactory,
  type OmpAgentClientPort,
  type OmpHostTool,
  type OmpWorldToolObservation,
} from "./omp-world-agent";

const MAX_RESPONSE_TEXT_LENGTH = 8_000;

export type ProductSessionEventSink = (
  event: ProductSessionEvent,
) => void | Promise<void>;

function resultDetails(
  result: Awaited<ReturnType<OmpHostTool["execute"]>>,
): unknown {
  if (typeof result === "string") {
    throw new Error("scripted Agent 预期 structured world tool result");
  }
  return result.details;
}

class ScriptedAgentClient implements OmpAgentClientPort {
  readonly #tools: readonly OmpHostTool[];
  readonly #nextRunId: () => string;
  readonly #fixtureId: typeof PRIMITIVE_BOX_FIXTURE_ID | typeof DIAGNOSTIC_RIGID_FIXTURE_ID;
  #started = false;
  #responseText: string | null = null;

  constructor(
    tools: readonly OmpHostTool[],
    nextRunId: () => string,
    fixtureId: typeof PRIMITIVE_BOX_FIXTURE_ID | typeof DIAGNOSTIC_RIGID_FIXTURE_ID,
  ) {
    this.#tools = tools;
    this.#nextRunId = nextRunId;
    this.#fixtureId = fixtureId;
  }

  async start(): Promise<void> {
    this.#started = true;
  }

  async stop(): Promise<void> {
    this.#started = false;
  }

  async getState() {
    if (!this.#started) throw new Error("scripted Agent session 尚未启动");
    const toolNames = this.#tools.map((tool) => tool.name);
    return {
      sessionId: "session:scripted-agent",
      toolNames,
      enabledToolNames: toolNames,
      mountedToolNames: [],
    };
  }

  async promptAndWait(): Promise<void> {
    const invoke = async (name: string, input: Record<string, unknown>) => {
      const tool = this.#tools.find((candidate) => candidate.name === name);
      if (!tool) throw new Error(`缺少 world tool ${name}`);
      return resultDetails(
        await tool.execute(
          `call:${name}`,
          input,
          undefined,
          {} as never,
          new AbortController().signal,
        ),
      );
    };

    await invoke("world_write", {
      cubeHeight: 2,
      ...(this.#fixtureId === PRIMITIVE_BOX_FIXTURE_ID
        ? {}
        : { fixtureId: this.#fixtureId }),
    });
    const read = (await invoke("world_read", {})) as {
      ref: { name: string; snapshotId: string; version: number };
    };
    await invoke("world_edit", { expected: read.ref, cubeHeight: 2.8 });
    const run = (await invoke("world_run", {
      runId: this.#nextRunId(),
    })) as { evaluation: { passed: boolean } };
    this.#responseText = run.evaluation.passed
      ? "刚体已经完成推演，确定性评测通过。"
      : "刚体推演未通过评测。";
  }

  async getLastAssistantText(): Promise<string | null> {
    return this.#responseText;
  }
}

export function createScriptedAgentClientFactory(
  fixtureId: typeof PRIMITIVE_BOX_FIXTURE_ID | typeof DIAGNOSTIC_RIGID_FIXTURE_ID = PRIMITIVE_BOX_FIXTURE_ID,
): OmpAgentClientFactory {
  let runSequence = 0;
  return (tools) =>
    new ScriptedAgentClient(
      tools,
      () => `run:scripted-${++runSequence}`,
      fixtureId,
    );
}

export class ProductSession {
  readonly #sessionId: string;
  readonly #surface: WorldToolSurface;
  readonly #clientFactory: OmpAgentClientFactory;
  #world: WorldReadResult | null = null;
  #lastRun: WorldRunResult | null = null;
  #sequence = 0;
  #turnSequence = 0;
  #running = false;

  constructor(sessionId: string, clientFactory: OmpAgentClientFactory) {
    this.#sessionId = sessionId;
    this.#surface = new WorldToolSurface(new RuntimeMvpHost());
    this.#clientFactory = clientFactory;
  }

  readProjection(): ProductSessionProjection {
    return deepFreeze({
      sessionId: this.#sessionId,
      world: this.#world,
      lastRun: this.#lastRun,
      lastSequence: this.#sequence,
      running: this.#running,
    }) as ProductSessionProjection;
  }

  runTurn(
    prompt: string,
    sink: ProductSessionEventSink,
    signal?: AbortSignal,
  ): Promise<ProductSessionProjection> {
    const turn = this.tryRunTurn(prompt, sink, signal);
    return turn ?? Promise.reject(
      new Error(`Product Session ${this.#sessionId} 已有 turn 正在运行`),
    );
  }

  tryRunTurn(
    prompt: string,
    sink: ProductSessionEventSink,
    signal?: AbortSignal,
  ): Promise<ProductSessionProjection> | undefined {
    if (this.#running) {
      return undefined;
    }
    this.#running = true;
    const turnId = `turn:${this.#sessionId.slice("session:".length)}:${++this.#turnSequence}`;

    return this.#runReservedTurn(turnId, prompt, sink, signal);
  }

  async #runReservedTurn(
    turnId: string,
    prompt: string,
    sink: ProductSessionEventSink,
    signal?: AbortSignal,
  ): Promise<ProductSessionProjection> {
    try {
      if (signal?.aborted) throw new Error("Product Session turn 已取消");
      await sink(this.#event(turnId, { type: "turn.started" }));
      const agent = new OmpWorldAgent(this.#surface, this.#clientFactory);
      const result = await agent.run(prompt, (observation) => {
        this.#observeTool(turnId, observation, sink);
      }, signal);
      if (signal?.aborted) throw new Error("Product Session turn 已取消");
      await sink(
        this.#event(turnId, {
          type: "turn.completed",
          responseText: result.responseText.slice(0, MAX_RESPONSE_TEXT_LENGTH),
        }),
      );
      this.#running = false;
      return this.readProjection();
    } catch (error) {
      try {
        await sink(this.#event(turnId, {
          type: "turn.failed",
          error: "agent_turn_failed",
        }));
      } catch {
        // Transport failure does not replace the primary world turn failure.
      }
      throw error;
    } finally {
      this.#running = false;
    }
  }

  #observeTool(
    turnId: string,
    observation: OmpWorldToolObservation,
    sink: ProductSessionEventSink,
  ): void {
    if (observation.trace.status === "succeeded") {
      this.#world = this.#surface.read();
      if (observation.trace.tool === "world_run") {
        this.#lastRun = observation.evidence as WorldRunResult;
      }
    }
    const event = this.#event(turnId, {
      type: "tool.completed",
      tool: observation.trace.tool,
      trace: deepFreeze({
        sequence: observation.trace.sequence,
        tool: observation.trace.tool,
        input: observation.trace.status === "failed"
          ? "[redacted]"
          : observation.trace.input,
        status: observation.trace.status,
        ...(observation.trace.result === undefined
          ? {}
          : { result: observation.trace.result }),
        ...(observation.trace.error === undefined
          ? {}
          : { error: "world_tool_failed" }),
      }) as ProductToolTrace,
      ...(observation.evidence === undefined
        ? {}
        : { evidence: observation.evidence as ProductWorldEvidence }),
    });
    try {
      const emitted = sink(event);
      if (emitted instanceof Promise) void emitted.catch(() => undefined);
    } catch {
      // A disconnected observer cannot change the authoritative turn.
    }
  }

  #event<T extends Omit<ProductSessionEvent, "sequence" | "sessionId" | "turnId">>(
    turnId: string,
    event: T,
  ): ProductSessionEvent {
    return deepFreeze({
      sequence: ++this.#sequence,
      sessionId: this.#sessionId,
      turnId,
      ...event,
    }) as ProductSessionEvent;
  }
}
