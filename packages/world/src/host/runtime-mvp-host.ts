import {
  deriveLandingSuccessContract,
  evaluateLanding,
} from "../evaluation/evaluate-landing";
import type {
  Episode,
  EvaluationRecord,
  ExplicitInputs,
  RefRecord,
  RefUpdateResult,
  Snapshot,
} from "../kernel/types";
import {
  FALLING_CUBE_PROGRAM,
  MUJOCO_PROFILE,
} from "../kernel/world";
import { createWorldRepositoryAuthority } from "../repository/world-repository";
import { runFallingCube } from "../runtime-mujoco/run-falling-cube";
import { ADOPT_RUNTIME_MVP_POLICY } from "./runtime-mvp-adopt-policy";

export interface RuntimeMvpRunResult {
  readonly episode: Episode;
  readonly baseRef: RefRecord;
}

export class RuntimeMvpHost {
  readonly #authority = createWorldRepositoryAuthority(ADOPT_RUNTIME_MVP_POLICY);

  write(snapshot: Snapshot): Snapshot {
    return this.#authority.repository.write(snapshot);
  }

  readSnapshot(id: Snapshot["id"]): Snapshot {
    return this.#authority.repository.readSnapshot(id);
  }

  readRefRecord(): RefRecord {
    return this.#authority.repository.readRefRecord();
  }

  readRef(): Snapshot {
    return this.#authority.repository.readRef();
  }

  editCubeHeight(parentId: Snapshot["id"], height: number): Snapshot {
    return this.#authority.repository.editCubeHeight(parentId, height);
  }

  editCurrentCubeHeight(expected: RefRecord, height: number): RefUpdateResult {
    return this.#authority.repository.editCurrentCubeHeight(expected, height);
  }

  advance(snapshotId: Snapshot["id"], expected: RefRecord): RefUpdateResult {
    return this.#authority.repository.advance(snapshotId, expected);
  }

  async runCurrent(explicitInputs: ExplicitInputs): Promise<RuntimeMvpRunResult> {
    const baseRef = this.#authority.repository.readRefRecord();
    const base = this.#authority.repository.readSnapshot(baseRef.snapshotId);
    const episode = await runFallingCube(
      base,
      FALLING_CUBE_PROGRAM,
      MUJOCO_PROFILE,
      explicitInputs,
    );
    this.#authority.evidence.recordEpisode(episode);
    return Object.freeze({ episode, baseRef });
  }

  evaluateEpisode(episodeId: Episode["id"]): EvaluationRecord {
    const episode = this.#authority.repository.readEpisode(episodeId);
    const evaluation = evaluateLanding(
      episode,
      deriveLandingSuccessContract(episode),
    );
    this.#authority.evidence.recordEvaluation(evaluation);
    return evaluation;
  }

  adopt(
    episodeId: Episode["id"],
    evaluationId: EvaluationRecord["id"],
    expected: RefRecord,
  ): RefUpdateResult {
    return this.#authority.repository.adopt(
      episodeId,
      evaluationId,
      ADOPT_RUNTIME_MVP_POLICY.id,
      expected,
    );
  }
}

Object.freeze(RuntimeMvpHost.prototype);
