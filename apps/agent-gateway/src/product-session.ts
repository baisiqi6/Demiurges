import {
  BALL_REF,
  BALL_VESSEL_PROGRAM,
  BALL_VESSEL_FIXTURE_ID,
  GENERATED_OBJECT_REF,
  MARBLE_HUNYUAN_COMPOSITE_FIXTURE_ID,
  MARBLE_HUNYUAN_COMPOSITE_PROGRAM,
  PRIMITIVE_BOX_FIXTURE_ID,
  RuntimeMvpHost,
  WorldToolSurface,
  FALLING_CUBE_PROGRAM,
  deepFreeze,
  type ProductSessionEvent,
  type ProductSessionProjection,
  type ProductToolTrace,
  type ProductWorldEvidence,
  type WorldReadResult,
  type WorldEditResult,
  type WorldRunResult,
  type WorldFixtureId,
  TWO_JOINT_REACH_FIXTURE_ID,
  admitMarbleHunyuanCompositeEdit,
  requireWorldWriteInput,
} from "@demiurges/world";

import {
  OmpWorldAgent,
  type OmpAgentClientFactory,
  type OmpAgentClientPort,
  type OmpHostTool,
  type OmpWorldToolObservation,
} from "./omp-world-agent";

const MAX_RESPONSE_TEXT_LENGTH = 8_000;

export type ProductSessionAuthoringFailureCode =
  | "INVALID_REQUEST"
  | "WORLD_REQUIRED"
  | "WORLD_ALREADY_EXISTS"
  | "STALE_REF"
  | "FIXTURE_NOT_COMPOSABLE"
  | "POSE_NOT_COMPOSABLE";

export class ProductSessionAuthoringFailure extends Error {
  readonly code: ProductSessionAuthoringFailureCode;

  constructor(code: ProductSessionAuthoringFailureCode) {
    super("Product Session authoring command rejected");
    this.name = "ProductSessionAuthoringFailure";
    this.code = code;
  }
}

function rejectAuthoring(code: ProductSessionAuthoringFailureCode): never {
  throw new ProductSessionAuthoringFailure(code);
}

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
  readonly #fixtureId: WorldFixtureId;
  #started = false;
  #responseText: string | null = null;

  constructor(
    tools: readonly OmpHostTool[],
    nextRunId: () => string,
    fixtureId: WorldFixtureId,
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
      fixtureId: this.#fixtureId,
    });
    const read = (await invoke("world_read", {})) as {
      ref: { name: string; snapshotId: string; version: number };
      snapshot: { entities: Array<{ ref: string; representations: { semantic: unknown } }> };
    };
    const ballVessel = this.#fixtureId === BALL_VESSEL_FIXTURE_ID;
    const composite = this.#fixtureId === MARBLE_HUNYUAN_COMPOSITE_FIXTURE_ID;
    const articulated = this.#fixtureId === TWO_JOINT_REACH_FIXTURE_ID;
    const armSemantic = articulated
      ? read.snapshot.entities.find((entity) => entity.ref === "entity:arm")?.representations.semantic as {
          joints: Array<{ jointRef: string }>;
          actuators: Array<{ actuatorRef: string }>;
        } | undefined
      : undefined;
    if (articulated && (!armSemantic || armSemantic.joints.length !== 2 || armSemantic.actuators.length !== 2)) {
      throw new Error("world_read 没有提供完整 articulated affordance");
    }
    await invoke("world_edit", articulated ? {
      expected: read.ref,
      targetRef: "entity:arm",
      change: {
        kind: "joint-state",
        joints: [
          { jointRef: armSemantic!.joints[0]!.jointRef, positionRadians: 0, velocityRadiansPerSecond: 0 },
          { jointRef: armSemantic!.joints[1]!.jointRef, positionRadians: 0, velocityRadiansPerSecond: 0 },
        ],
      },
    } : {
      expected: read.ref,
      targetRef: ballVessel ? BALL_REF : composite ? GENERATED_OBJECT_REF : "entity:cube",
      change: {
        kind: "pose",
        frameRef: "frame:world",
        pose: {
          position: ballVessel
            ? { x: 0.12, y: 0, z: 1.25 }
            : composite
            ? { x: 0, y: 0, z: 1.2 }
            : { x: 0, y: 0, z: 2.8 },
          rotation: { x: 0, y: 0, z: 0, w: 1 },
        },
      },
    });
    const run = (await invoke("world_run", {
      runId: this.#nextRunId(),
      program: articulated
        ? {
            kind: "actuator-sequence",
            targetRef: "entity:arm",
            durationSeconds: 3,
            sampleRateHz: 30,
            steps: [
              { timeSeconds: 0, commands: [
                { actuatorRef: armSemantic!.actuators[0]!.actuatorRef, valueRadians: 0.35 },
                { actuatorRef: armSemantic!.actuators[1]!.actuatorRef, valueRadians: -0.35 },
              ] },
              { timeSeconds: 0.5, commands: [
                { actuatorRef: armSemantic!.actuators[0]!.actuatorRef, valueRadians: 0.65 },
                { actuatorRef: armSemantic!.actuators[1]!.actuatorRef, valueRadians: -1 },
              ] },
            ],
          }
        : ballVessel
        ? { kind: BALL_VESSEL_PROGRAM.kind, targetRef: BALL_VESSEL_PROGRAM.targetRef, durationSeconds: BALL_VESSEL_PROGRAM.durationSeconds, sampleRateHz: BALL_VESSEL_PROGRAM.sampleRateHz }
        : composite
        ? { kind: MARBLE_HUNYUAN_COMPOSITE_PROGRAM.kind, targetRef: MARBLE_HUNYUAN_COMPOSITE_PROGRAM.targetRef, durationSeconds: MARBLE_HUNYUAN_COMPOSITE_PROGRAM.durationSeconds, sampleRateHz: MARBLE_HUNYUAN_COMPOSITE_PROGRAM.sampleRateHz }
        : { kind: FALLING_CUBE_PROGRAM.kind, targetRef: FALLING_CUBE_PROGRAM.targetRef, durationSeconds: FALLING_CUBE_PROGRAM.durationSeconds, sampleRateHz: FALLING_CUBE_PROGRAM.sampleRateHz },
    })) as { evaluation: { passed: boolean } };
    this.#responseText = run.evaluation.passed
      ? "世界已经完成推演，确定性评测通过。"
      : "世界推演未通过评测。";
  }

  async getLastAssistantText(): Promise<string | null> {
    return this.#responseText;
  }
}

export function createScriptedAgentClientFactory(
  fixtureId: WorldFixtureId = PRIMITIVE_BOX_FIXTURE_ID,
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
    if (!this.#tryReserve()) return undefined;
    const turnId = `turn:${this.#sessionId.slice("session:".length)}:${++this.#turnSequence}`;

    return this.#runReservedTurn(turnId, prompt, sink, signal);
  }

  tryWriteWorld(input: unknown): ProductSessionProjection | undefined {
    if (!this.#tryReserve()) return undefined;
    try {
      if (this.#world !== null) rejectAuthoring("WORLD_ALREADY_EXISTS");
      const parsed = requireWorldWriteInput(input);
      if (parsed.fixtureId !== MARBLE_HUNYUAN_COMPOSITE_FIXTURE_ID) {
        rejectAuthoring("FIXTURE_NOT_COMPOSABLE");
      }
      this.#surface.write(parsed);
      this.#world = this.#surface.read();
      this.#lastRun = null;
    } finally {
      this.#running = false;
    }
    return this.readProjection();
  }

  tryEditWorld(input: unknown): ProductSessionProjection | undefined {
    if (!this.#tryReserve()) return undefined;
    try {
      if (this.#world === null) rejectAuthoring("WORLD_REQUIRED");
      const admission = admitMarbleHunyuanCompositeEdit(this.#world, input);
      if (admission.status === "rejected") rejectAuthoring(admission.code);
      if (admission.status === "accepted") {
        const result = this.#surface.edit(admission.canonicalWireInput);
        if (result.update.status !== "updated") rejectAuthoring("STALE_REF");
        this.#world = this.#surface.read();
        this.#lastRun = null;
      }
    } finally {
      this.#running = false;
    }
    return this.readProjection();
  }

  #tryReserve(): boolean {
    if (this.#running) return false;
    this.#running = true;
    return true;
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
      } else if (observation.trace.tool === "world_write") {
        this.#lastRun = null;
      } else if (
        observation.trace.tool === "world_edit" &&
        (observation.evidence as WorldEditResult).update.status === "updated"
      ) {
        this.#lastRun = null;
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
