import { RuntimeMvpHost } from "../host/runtime-mvp-host";
import type {
  Episode,
  EvaluationRecord,
  RefRecord,
  RefUpdateResult,
  Snapshot,
} from "../kernel/types";
import {
  deepFreeze,
} from "../kernel/world";
import {
  createFixtureSnapshot,
} from "../artifacts/diagnostic-rigid-fixture";
import {
  TWO_JOINT_REACH_FIXTURE_ID,
  createTwoJointReachSnapshot,
} from "../artifacts/two-joint-reach-fixture";
import {
  MARBLE_HUNYUAN_COMPOSITE_FIXTURE_ID,
  createMarbleHunyuanCompositeSnapshot,
} from "../artifacts/marble-hunyuan-composite-fixture";
import {
  requireWorldEditInput,
  requireWorldRunInput,
  requireWorldWriteInput,
} from "./world-tool-contract";

export const WORLD_TOOL_NAMES = Object.freeze([
  "read",
  "write",
  "edit",
  "run",
] as const);

export interface WorldReadResult {
  readonly tool: "read";
  readonly ref: RefRecord;
  readonly snapshot: Snapshot;
}

export interface WorldWriteResult {
  readonly tool: "write";
  readonly ref: RefRecord;
  readonly snapshot: Snapshot;
}

export interface WorldEditResult {
  readonly tool: "edit";
  readonly update: RefUpdateResult;
}

export interface WorldRunResult {
  readonly tool: "run";
  readonly baseRef: RefRecord;
  readonly episode: Episode;
  readonly evaluation: EvaluationRecord;
}

export class WorldToolSurface {
  readonly #host: RuntimeMvpHost;

  constructor(host: RuntimeMvpHost) {
    this.#host = host;
  }

  read(): WorldReadResult {
    return deepFreeze({
      tool: "read",
      ref: this.#host.readRefRecord(),
      snapshot: this.#host.readRef(),
    }) as WorldReadResult;
  }

  write(input: unknown): WorldWriteResult {
    const { fixtureId } = requireWorldWriteInput(input);
    const snapshot = this.#host.write(
      fixtureId === TWO_JOINT_REACH_FIXTURE_ID
        ? createTwoJointReachSnapshot()
        : fixtureId === MARBLE_HUNYUAN_COMPOSITE_FIXTURE_ID
          ? createMarbleHunyuanCompositeSnapshot()
          : createFixtureSnapshot(2, fixtureId),
    );
    return deepFreeze({
      tool: "write",
      ref: this.#host.readRefRecord(),
      snapshot,
    }) as WorldWriteResult;
  }

  edit(input: unknown): WorldEditResult {
    const parsed = requireWorldEditInput(input);
    const update = parsed.change.kind === "pose"
      ? this.#host.editCurrentEntityPose(parsed.expected, parsed.targetRef, parsed.change.pose)
      : this.#host.editCurrentEntityJointState(parsed.expected, parsed.targetRef, parsed.change.joints);
    return deepFreeze({ tool: "edit", update }) as WorldEditResult;
  }

  async run(input: unknown): Promise<WorldRunResult> {
    const parsed = requireWorldRunInput(input);
    const result = await this.#host.runCurrent(
      deepFreeze({ runId: parsed.runId }),
      parsed.program,
    );
    const evaluation = this.#host.evaluateEpisode(result.episode.id);
    return deepFreeze({
      tool: "run",
      baseRef: result.baseRef,
      episode: result.episode,
      evaluation,
    }) as WorldRunResult;
  }
}
