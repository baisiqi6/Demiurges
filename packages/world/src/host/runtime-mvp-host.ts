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
  ArticulatedJointState,
} from "../kernel/types";
import {
  FALLING_CUBE_PROGRAM,
  MUJOCO_PROFILE,
} from "../kernel/world";
import {
  createWorldRepositoryAuthority,
  exportRepositoryHistory,
  restoreRepositoryAuthority,
  type RepositoryHistory,
  type WorldRepositoryAuthority,
} from "../repository/world-repository";
import { runFallingCube } from "../runtime-mujoco/run-falling-cube";
import { runArticulatedReach } from "../runtime-mujoco/run-articulated-reach";
import { requireAdoptPolicyForProgram } from "./runtime-mvp-adopt-policy";
import { evaluateArticulatedReach } from "../evaluation/evaluate-articulated-reach";

export interface RuntimeMvpRunResult {
  readonly episode: Episode;
  readonly baseRef: RefRecord;
}
export class RuntimeMvpHost {
  #authority: WorldRepositoryAuthority;

  constructor() {
    if (arguments.length !== 0) {
      throw new Error("RuntimeMvpHost 不接纳调用方 Repository authority");
    }
    this.#authority = createWorldRepositoryAuthority();
  }

  /**
   * project restoration seam：只接收已验证的 immutable plain data，
   * authority 与 evidence writer 始终在 Host lexical boundary 内创建。
   */
  static restoreProject(
    snapshots: readonly Snapshot[],
    currentRef: RefRecord,
  ): RuntimeMvpHost {
    const host = new RuntimeMvpHost();
    host.#authority = restoreRepositoryAuthority(snapshots, currentRef);
    return host;
  }

  exportProjectHistory(): RepositoryHistory {
    return exportRepositoryHistory(this.#authority);
  }

  moveProjectRef(
    targetSnapshotId: Snapshot["id"],
    expected: RefRecord,
  ): RefUpdateResult {
    return this.#authority.repository.moveCurrentRef(targetSnapshotId, expected);
  }

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

  editCurrentEntityJointState(
    expected: RefRecord,
    targetRef: Snapshot["entities"][number]["ref"],
    joints: readonly ArticulatedJointState[],
  ): RefUpdateResult {
    return this.#authority.repository.editCurrentEntityJointState(expected, targetRef, joints);
  }

  advance(snapshotId: Snapshot["id"], expected: RefRecord): RefUpdateResult {
    return this.#authority.repository.advance(snapshotId, expected);
  }

  async runCurrent(
    explicitInputs: ExplicitInputs,
    program: WorldProgram = FALLING_CUBE_PROGRAM,
  ): Promise<RuntimeMvpRunResult> {
    const baseRef = this.#authority.repository.readRefRecord();
    const base = this.#authority.repository.readSnapshot(baseRef.snapshotId);
    if (!base.entities.some((entity) => entity.ref === program.targetRef)) {
      throw new Error(`WorldProgram 与当前 scenario 不匹配：${program.id}`);
    }
    const episode = program.kind === "free-fall"
      ? await runFallingCube(base, program, MUJOCO_PROFILE, explicitInputs)
      : await runArticulatedReach(base, program, MUJOCO_PROFILE, explicitInputs);
    this.#authority.evidence.recordEpisode(episode);
    return Object.freeze({ episode, baseRef });
  }

  evaluateEpisode(episodeId: Episode["id"]): EvaluationRecord {
    const episode = this.#authority.repository.readEpisode(episodeId);
    const policy = requireAdoptPolicyForProgram(episode.scenarioId, episode.program.kind);
    const evaluation = episode.program.kind === "actuator-sequence"
      ? evaluateArticulatedReach(episode)
      : evaluateEpisode(episode, policy.contractId === "success:stable-inside-vessel"
        ? deriveStableInsideVesselSuccessContract(episode)
        : deriveLandingSuccessContract(episode));
    this.#authority.evidence.recordEvaluation(evaluation);
    return evaluation;
  }

  adopt(
    episodeId: Episode["id"],
    evaluationId: EvaluationRecord["id"],
    expected: RefRecord,
  ): RefUpdateResult {
    const episode = this.#authority.repository.readEpisode(episodeId);
    const policy = requireAdoptPolicyForProgram(episode.scenarioId, episode.program.kind);
    return this.#authority.repository.adopt(
      episodeId,
      evaluationId,
      policy.id,
      expected,
    );
  }
}

Object.freeze(RuntimeMvpHost.prototype);
