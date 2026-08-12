import {
  CUBE_REF,
  CURRENT_WORLD_REF,
  deepFreeze,
  findEntity,
  isDeepFrozen,
} from "../kernel/world";
import type {
  AdoptPolicy,
  Entity,
  Episode,
  EvaluationRecord,
  Pose,
  RefRecord,
  RefUpdateResult,
  Snapshot,
} from "../kernel/types";
import { requireRegisteredSnapshotIdentity } from "../artifacts/diagnostic-rigid-fixture";
import {
  requireAdoptPolicyById,
  RUNTIME_MVP_ADOPT_POLICY_REGISTRY,
} from "../host/runtime-mvp-adopt-policy";

function verticalHalfExtent(entity: Entity, pose: Pose): number {
  const collision = entity.representations.collision;
  if (collision.kind === "sphere") return collision.radius;
  if (collision.kind !== "box") {
    throw new Error(`${entity.ref} 不能作为 authored pose edit target`);
  }
  const { x, y, z, w } = pose.rotation;
  const [hx, hy, hz] = collision.halfExtents;
  const r20 = 2 * (x * z - w * y);
  const r21 = 2 * (y * z + w * x);
  const r22 = 1 - 2 * (x * x + y * y);
  return Math.abs(r20) * hx + Math.abs(r21) * hy + Math.abs(r22) * hz;
}

class WorldRepositoryState {
  readonly #snapshots = new Map<Snapshot["id"], Snapshot>();
  readonly #episodes = new Map<Episode["id"], Episode>();
  readonly #evaluations = new Map<EvaluationRecord["id"], EvaluationRecord>();
  readonly #refs = new Map<RefRecord["name"], RefRecord>();
  #editSequence = 0;

  constructor() {
    if (!isDeepFrozen(RUNTIME_MVP_ADOPT_POLICY_REGISTRY)) {
      throw new Error("Host AdoptPolicy registry 必须是递归冻结的 plain data record");
    }
  }

  #insert(snapshot: Snapshot): Snapshot {
    if (this.#snapshots.has(snapshot.id)) {
      throw new Error(`Snapshot ID 冲突：${snapshot.id}`);
    }
    if (snapshot.source === "write" && snapshot.parentId !== null) {
      throw new Error("write Snapshot 的 parentId 必须为 null");
    }
    if (snapshot.source !== "write" && snapshot.parentId === null) {
      throw new Error(`${snapshot.source} 必须声明 parentId`);
    }
    if (snapshot.parentId !== null && !this.#snapshots.has(snapshot.parentId)) {
      throw new Error(`parent Snapshot 不存在：${snapshot.parentId}`);
    }
    if (snapshot.entities.some((entity) =>
      entity.representations.collision.kind === "compound" &&
      entity.representations.collision.parts.some((part) =>
        part.partKey === "test-only-top-lid"))) {
      throw new Error("test-only closed proxy 只允许 Runtime-direct seam");
    }
    requireRegisteredSnapshotIdentity(snapshot);
    const frozen = deepFreeze(snapshot) as Snapshot;
    if (!isDeepFrozen(frozen)) {
      throw new Error("Snapshot 必须是递归冻结的 plain data record");
    }
    this.#snapshots.set(frozen.id, frozen);
    return frozen;
  }

  #requireExpectation(expected: RefRecord, ref: RefRecord["name"]): void {
    if (
      !isDeepFrozen(expected) ||
      expected.name !== ref ||
      typeof expected.snapshotId !== "string" ||
      !expected.snapshotId.startsWith("snapshot:") ||
      !Number.isSafeInteger(expected.version) ||
      expected.version < 1
    ) {
      throw new Error("Ref expectation 必须是当前 ref 的冻结 snapshotId + version record");
    }
  }

  #updateRef(
    operation: RefUpdateResult["operation"],
    target: Snapshot,
    expected: RefRecord,
    ref: RefRecord["name"],
  ): RefUpdateResult {
    const current = this.readRefRecord(ref);
    if (
      current.snapshotId !== expected.snapshotId ||
      current.version !== expected.version
    ) {
      return deepFreeze({
        status: "stale_ref",
        operation,
        ref: current,
        snapshot: this.readSnapshot(current.snapshotId),
      }) as RefUpdateResult;
    }

    const nextRef = deepFreeze({
      name: ref,
      snapshotId: target.id,
      version: current.version + 1,
    }) as RefRecord;
    this.#refs.set(ref, nextRef);
    return deepFreeze({
      status: "updated",
      operation,
      ref: nextRef,
      snapshot: target,
    }) as RefUpdateResult;
  }

  write(snapshot: Snapshot, ref: RefRecord["name"] = CURRENT_WORLD_REF): Snapshot {
    if (snapshot.source !== "write") {
      throw new Error("write 只接纳 source: write 的 root Snapshot");
    }
    if (this.#refs.has(ref)) {
      throw new Error(`Repository ref ${ref} 已初始化`);
    }
    const inserted = this.#insert(snapshot);
    this.#refs.set(ref, deepFreeze({
      name: ref,
      snapshotId: inserted.id,
      version: 1,
    }) as RefRecord);
    return inserted;
  }

  record(snapshot: Snapshot): Snapshot {
    if (snapshot.source !== "runtime-terminal") {
      throw new Error("record 只接纳 runtime-terminal Snapshot");
    }
    return this.#insert(snapshot);
  }

  recordEpisode(episode: Episode): Episode {
    if (!isDeepFrozen(episode)) {
      throw new Error("Episode 必须是递归冻结的 plain data record");
    }
    if (this.#episodes.has(episode.id)) {
      throw new Error(`Episode ID 冲突：${episode.id}`);
    }
    if (episode.terminalSnapshot.source !== "runtime-terminal") {
      throw new Error("Episode terminal 必须是 runtime-terminal Snapshot");
    }
    if (episode.terminalSnapshot.parentId !== episode.baseSnapshotId) {
      throw new Error("Episode terminal parent 与 base Snapshot 不一致");
    }
    if (!this.#snapshots.has(episode.baseSnapshotId)) {
      throw new Error(`Episode base Snapshot 不存在：${episode.baseSnapshotId}`);
    }

    const recordedTerminal = this.#snapshots.get(episode.terminalSnapshot.id);
    if (recordedTerminal && recordedTerminal !== episode.terminalSnapshot) {
      throw new Error(`Snapshot ID 冲突：${episode.terminalSnapshot.id}`);
    }
    if (!recordedTerminal) {
      this.#insert(episode.terminalSnapshot);
    }
    this.#episodes.set(episode.id, episode);
    return episode;
  }

  recordEvaluation(evaluation: EvaluationRecord): EvaluationRecord {
    if (!isDeepFrozen(evaluation)) {
      throw new Error("EvaluationRecord 必须是递归冻结的 plain data record");
    }
    if (this.#evaluations.has(evaluation.id)) {
      throw new Error(`EvaluationRecord ID 冲突：${evaluation.id}`);
    }
    if (!this.#episodes.has(evaluation.episodeId)) {
      throw new Error(`Episode 尚未登记：${evaluation.episodeId}`);
    }
    this.#evaluations.set(evaluation.id, evaluation);
    return evaluation;
  }

  readEpisode(id: Episode["id"]): Episode {
    const episode = this.#episodes.get(id);
    if (!episode) {
      throw new Error(`Episode 尚未登记：${id}`);
    }
    return episode;
  }

  readSnapshot(id: Snapshot["id"]): Snapshot {
    const snapshot = this.#snapshots.get(id);
    if (!snapshot) {
      throw new Error(`Repository 中不存在 ${id}`);
    }
    return snapshot;
  }

  readRefRecord(ref: RefRecord["name"] = CURRENT_WORLD_REF): RefRecord {
    const record = this.#refs.get(ref);
    if (!record) {
      throw new Error(`Repository ref ${ref} 尚未初始化`);
    }
    return record;
  }

  readRef(ref: RefRecord["name"] = CURRENT_WORLD_REF): Snapshot {
    return this.readSnapshot(this.readRefRecord(ref).snapshotId);
  }

  editCubeHeight(parentId: Snapshot["id"], height: number): Snapshot {
    if (!Number.isFinite(height) || height < 0.5 || height > 4) {
      throw new Error("方块高度必须在 0.5m 到 4m 之间");
    }

    const parent = this.readSnapshot(parentId);
    const cube = findEntity(parent, CUBE_REF);
    return this.editEntityPose(parentId, CUBE_REF, {
      ...cube.state.pose,
      position: [cube.state.pose.position[0], cube.state.pose.position[1], height],
    });
  }

  editEntityPose(
    parentId: Snapshot["id"],
    targetRef: Entity["ref"],
    pose: Pose,
  ): Snapshot {
    const parent = this.readSnapshot(parentId);
    const target = findEntity(parent, targetRef);
    if (target.physics.bodyType !== "dynamic") {
      throw new Error("authored pose edit target 必须是 dynamic Entity");
    }
    const floor = findEntity(parent, "entity:floor");
    const targetBottom = pose.position[2] - verticalHalfExtent(target, pose);
    const floorTop = floor.state.pose.position[2] + verticalHalfExtent(floor, floor.state.pose);
    if (!Number.isFinite(targetBottom) || targetBottom < floorTop - 1e-9) {
      throw new Error(`${targetRef} authored pose 穿透 floor`);
    }
    this.#editSequence += 1;
    return this.#insert(deepFreeze({
      schemaVersion: 1,
      id: `snapshot:edit-${this.#editSequence}`,
      parentId: parent.id,
      source: "edit",
      entities: parent.entities.map((entity): Entity => entity.ref === targetRef
        ? { ...entity, state: { ...entity.state, pose } }
        : entity),
    }) as Snapshot);
  }

  editCurrentCubeHeight(
    expected: RefRecord,
    height: number,
    ref: RefRecord["name"] = CURRENT_WORLD_REF,
  ): RefUpdateResult {
    this.#requireExpectation(expected, ref);
    if (!Number.isFinite(height) || height < 0.5 || height > 4) {
      throw new Error("方块高度必须在 0.5m 到 4m 之间");
    }

    const current = this.readRefRecord(ref);
    if (
      current.snapshotId !== expected.snapshotId ||
      current.version !== expected.version
    ) {
      return deepFreeze({
        status: "stale_ref",
        operation: "advance",
        ref: current,
        snapshot: this.readSnapshot(current.snapshotId),
      }) as RefUpdateResult;
    }

    const snapshot = this.editCubeHeight(expected.snapshotId, height);
    return this.#updateRef("advance", snapshot, expected, ref);
  }

  editCurrentEntityPose(
    expected: RefRecord,
    targetRef: Entity["ref"],
    pose: Pose,
    ref: RefRecord["name"] = CURRENT_WORLD_REF,
  ): RefUpdateResult {
    this.#requireExpectation(expected, ref);
    const current = this.readRefRecord(ref);
    if (
      current.snapshotId !== expected.snapshotId ||
      current.version !== expected.version
    ) {
      return deepFreeze({
        status: "stale_ref",
        operation: "advance",
        ref: current,
        snapshot: this.readSnapshot(current.snapshotId),
      }) as RefUpdateResult;
    }
    const snapshot = this.editEntityPose(expected.snapshotId, targetRef, pose);
    return this.#updateRef("advance", snapshot, expected, ref);
  }

  advance(
    snapshotId: Snapshot["id"],
    expected: RefRecord,
    ref: RefRecord["name"] = CURRENT_WORLD_REF,
  ): RefUpdateResult {
    this.#requireExpectation(expected, ref);
    const snapshot = this.readSnapshot(snapshotId);
    if (snapshot.source !== "edit") {
      throw new Error("advance 只接纳 authored edit Snapshot");
    }
    if (snapshot.parentId !== expected.snapshotId) {
      throw new Error("advance target 不是 expectedCurrent 的直接 child");
    }
    return this.#updateRef("advance", snapshot, expected, ref);
  }

  adopt(
    episodeId: Episode["id"],
    evaluationId: EvaluationRecord["id"],
    policyId: AdoptPolicy["id"],
    expected: RefRecord,
    ref: RefRecord["name"] = CURRENT_WORLD_REF,
  ): RefUpdateResult {
    this.#requireExpectation(expected, ref);
    const policyEntry = requireAdoptPolicyById(policyId);
    const policy = policyEntry.policy;

    const episode = this.#episodes.get(episodeId);
    if (!episode) {
      throw new Error(`Episode 尚未登记：${episodeId}`);
    }
    if (episode.programId !== policyEntry.programId) {
      throw new Error("Episode Program 与 Host AdoptPolicy registry 不匹配");
    }
    const evaluation = this.#evaluations.get(evaluationId);
    if (!evaluation) {
      throw new Error(`EvaluationRecord 尚未登记：${evaluationId}`);
    }
    if (evaluation.episodeId !== episode.id) {
      throw new Error("Evaluation 与 Episode 不匹配");
    }
    if (evaluation.evaluatorId !== policy.evaluatorId) {
      throw new Error("Evaluation evaluator 不满足 AdoptPolicy");
    }
    if (evaluation.contractId !== policy.contractId) {
      throw new Error("Evaluation contract 不满足 AdoptPolicy");
    }
    if (policy.requirePassed && !evaluation.passed) {
      throw new Error("Evaluation 未通过 AdoptPolicy");
    }
    if (episode.completion !== policy.episodeCompletion) {
      throw new Error("Episode completion 不满足 AdoptPolicy");
    }
    if (episode.terminalSnapshot.source !== policy.terminalSource) {
      throw new Error("Episode terminal source 不满足 AdoptPolicy");
    }
    if (episode.baseSnapshotId !== expected.snapshotId) {
      throw new Error("Episode base 与 expectedCurrent 不匹配");
    }
    if (this.#snapshots.get(episode.terminalSnapshot.id) !== episode.terminalSnapshot) {
      throw new Error("Episode terminal 与 Repository record 不一致");
    }

    return this.#updateRef("adopt", episode.terminalSnapshot, expected, ref);
  }
}

export interface WorldRepository {
  write(snapshot: Snapshot, ref?: RefRecord["name"]): Snapshot;
  readSnapshot(id: Snapshot["id"]): Snapshot;
  readEpisode(id: Episode["id"]): Episode;
  readRefRecord(ref?: RefRecord["name"]): RefRecord;
  readRef(ref?: RefRecord["name"]): Snapshot;
  editCubeHeight(parentId: Snapshot["id"], height: number): Snapshot;
  editEntityPose(parentId: Snapshot["id"], targetRef: Entity["ref"], pose: Pose): Snapshot;
  editCurrentCubeHeight(
    expected: RefRecord,
    height: number,
    ref?: RefRecord["name"],
  ): RefUpdateResult;
  editCurrentEntityPose(
    expected: RefRecord,
    targetRef: Entity["ref"],
    pose: Pose,
    ref?: RefRecord["name"],
  ): RefUpdateResult;
  advance(
    snapshotId: Snapshot["id"],
    expected: RefRecord,
    ref?: RefRecord["name"],
  ): RefUpdateResult;
  adopt(
    episodeId: Episode["id"],
    evaluationId: EvaluationRecord["id"],
    policyId: AdoptPolicy["id"],
    expected: RefRecord,
    ref?: RefRecord["name"],
  ): RefUpdateResult;
}

export interface WorldEvidenceWriter {
  record(snapshot: Snapshot): Snapshot;
  recordEpisode(episode: Episode): Episode;
  recordEvaluation(evaluation: EvaluationRecord): EvaluationRecord;
}

export interface WorldRepositoryAuthority {
  readonly repository: WorldRepository;
  readonly evidence: WorldEvidenceWriter;
}

export function createWorldRepositoryAuthority(
  rejectedCallerPolicy?: unknown,
): WorldRepositoryAuthority {
  if (rejectedCallerPolicy !== undefined) {
    throw new Error("Repository 不接纳调用方 policy；必须使用 Host closed registry");
  }
  const state = new WorldRepositoryState();

  return Object.freeze({
    repository: Object.freeze({
      write: (snapshot: Snapshot, ref?: RefRecord["name"]) =>
        state.write(snapshot, ref),
      readSnapshot: (id: Snapshot["id"]) => state.readSnapshot(id),
      readEpisode: (id: Episode["id"]) => state.readEpisode(id),
      readRefRecord: (ref?: RefRecord["name"]) => state.readRefRecord(ref),
      readRef: (ref?: RefRecord["name"]) => state.readRef(ref),
      editCubeHeight: (parentId: Snapshot["id"], height: number) =>
        state.editCubeHeight(parentId, height),
      editEntityPose: (parentId: Snapshot["id"], targetRef: Entity["ref"], pose: Pose) =>
        state.editEntityPose(parentId, targetRef, pose),
      editCurrentCubeHeight: (
        expected: RefRecord,
        height: number,
        ref?: RefRecord["name"],
      ) => state.editCurrentCubeHeight(expected, height, ref),
      editCurrentEntityPose: (
        expected: RefRecord,
        targetRef: Entity["ref"],
        pose: Pose,
        ref?: RefRecord["name"],
      ) => state.editCurrentEntityPose(expected, targetRef, pose, ref),
      advance: (
        snapshotId: Snapshot["id"],
        expected: RefRecord,
        ref?: RefRecord["name"],
      ) => state.advance(snapshotId, expected, ref),
      adopt: (
        episodeId: Episode["id"],
        evaluationId: EvaluationRecord["id"],
        policyId: AdoptPolicy["id"],
        expected: RefRecord,
        ref?: RefRecord["name"],
      ) => state.adopt(episodeId, evaluationId, policyId, expected, ref),
    }),
    evidence: Object.freeze({
      record: (snapshot: Snapshot) => state.record(snapshot),
      recordEpisode: (episode: Episode) => state.recordEpisode(episode),
      recordEvaluation: (evaluation: EvaluationRecord) =>
        state.recordEvaluation(evaluation),
    }),
  });
}
