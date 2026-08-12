import {
  deriveStableInsideVesselSuccessContract,
  deriveLandingSuccessContract,
  evaluateEpisode,
} from "../evaluation/evaluate-episode";
import type {
  Episode,
  EvaluationRecord,
  ExplicitInputs,
  RefRecord,
  RefUpdateResult,
  Snapshot,
  WorldProgram,
} from "../kernel/types";
import {
  BALL_VESSEL_PROGRAM,
  FALLING_CUBE_PROGRAM,
  MUJOCO_PROFILE,
} from "../kernel/world";
import { createWorldRepositoryAuthority } from "../repository/world-repository";
import { runFallingCube } from "../runtime-mujoco/run-falling-cube";
import { requireAdoptPolicyForProgram } from "./runtime-mvp-adopt-policy";

export interface RuntimeMvpRunResult {
  readonly episode: Episode;
  readonly baseRef: RefRecord;
}

export class RuntimeMvpHost {
  readonly #authority = createWorldRepositoryAuthority();

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

  editCurrentEntityPose(
    expected: RefRecord,
    targetRef: Snapshot["entities"][number]["ref"],
    pose: Snapshot["entities"][number]["state"]["pose"],
  ): RefUpdateResult {
    const current = this.#authority.repository.readRef();
    if (!current.entities.some((entity) => entity.ref === targetRef)) {
      throw new Error(`edit target 与当前 scenario 不匹配：${targetRef}`);
    }
    return this.#authority.repository.editCurrentEntityPose(expected, targetRef, pose);
  }

  advance(snapshotId: Snapshot["id"], expected: RefRecord): RefUpdateResult {
    return this.#authority.repository.advance(snapshotId, expected);
  }

  async runCurrent(
    explicitInputs: ExplicitInputs,
    programId: WorldProgram["id"] = FALLING_CUBE_PROGRAM.id,
  ): Promise<RuntimeMvpRunResult> {
    const baseRef = this.#authority.repository.readRefRecord();
    const base = this.#authority.repository.readSnapshot(baseRef.snapshotId);
    const program = programId === FALLING_CUBE_PROGRAM.id
      ? FALLING_CUBE_PROGRAM
      : programId === BALL_VESSEL_PROGRAM.id
        ? BALL_VESSEL_PROGRAM
        : null;
    if (!program) throw new Error(`不受支持的 WorldProgram：${programId}`);
    if (!base.entities.some((entity) => entity.ref === program.targetRef)) {
      throw new Error(`WorldProgram 与当前 scenario 不匹配：${programId}`);
    }
    const episode = await runFallingCube(
      base,
      program,
      MUJOCO_PROFILE,
      explicitInputs,
    );
    this.#authority.evidence.recordEpisode(episode);
    return Object.freeze({ episode, baseRef });
  }

  evaluateEpisode(episodeId: Episode["id"]): EvaluationRecord {
    const episode = this.#authority.repository.readEpisode(episodeId);
    const policy = requireAdoptPolicyForProgram(episode.programId);
    const evaluation = evaluateEpisode(
      episode,
      policy.contractId === "success:stable-inside-vessel"
        ? deriveStableInsideVesselSuccessContract(episode)
        : deriveLandingSuccessContract(episode),
    );
    this.#authority.evidence.recordEvaluation(evaluation);
    return evaluation;
  }

  adopt(
    episodeId: Episode["id"],
    evaluationId: EvaluationRecord["id"],
    expected: RefRecord,
  ): RefUpdateResult {
    const episode = this.#authority.repository.readEpisode(episodeId);
    const policy = requireAdoptPolicyForProgram(episode.programId);
    return this.#authority.repository.adopt(
      episodeId,
      evaluationId,
      policy.id,
      expected,
    );
  }
}

Object.freeze(RuntimeMvpHost.prototype);
