import { BALL_REF, createBallVesselSnapshot } from "./artifacts/ball-vessel-fixture";
import { BALL_VESSEL_PROGRAM, deepFreeze } from "./kernel/world";
import { decodeProductSessionProjection } from "./product-session-codec";
import type { ProductSessionProjection } from "./product-session-contract";
import type { RefRecord } from "./kernel/types";
import type { WorldEditPoseWireInput } from "./world-tools/world-tool-contract";
import { admitBallVesselTaskEdit, requireBallVesselTaskWorld, sameBallTaskRef } from "./authoring/ball-vessel-authoring";
import { deriveBallVesselPoseRepair, type BallVesselPoseRepairResult } from "./authoring/derive-ball-vessel-pose-repair";

export type BallVesselTaskOperation =
  | { readonly kind: "create" }
  | { readonly kind: "edit"; readonly input: WorldEditPoseWireInput }
  | { readonly kind: "run"; readonly expected: RefRecord };

export interface BallVesselTaskPreview {
  readonly projection: ProductSessionProjection;
  readonly proposal: BallVesselPoseRepairResult | { readonly status: "unavailable"; readonly reason: "run_required" };
}

// 按已验证的 expected shape 比较，拒绝 accessor/额外字段；不执行未知 proposal 的 getter/toJSON。
function sameData(value: unknown, expected: unknown): boolean {
  if (typeof expected !== "object" || expected === null) return value === expected;
  if (typeof value !== "object" || value === null || Array.isArray(value) !== Array.isArray(expected)) return false;
  const prototype = Object.getPrototypeOf(value);
  if (Array.isArray(value) ? prototype !== Array.prototype : prototype !== Object.prototype && prototype !== null) return false;
  const keys = Reflect.ownKeys(value), expectedKeys = Reflect.ownKeys(expected);
  if (keys.length !== expectedKeys.length) return false;
  return keys.every((key) => {
    if (typeof key !== "string" || !Object.hasOwn(expected, key)) return false;
    const actual = Object.getOwnPropertyDescriptor(value, key)!, trusted = Object.getOwnPropertyDescriptor(expected, key)!;
    return "value" in actual && actual.enumerable === trusted.enumerable && sameData(actual.value, trusted.value);
  });
}

function settled(value: unknown, sessionId: string): ProductSessionProjection {
  const decoded = decodeProductSessionProjection(value, sessionId);
  if (decoded.running) throw new Error("Ball task transition 必须 settled");
  return decoded;
}

export function decodeBallVesselTaskTransition(
  value: unknown,
  sessionId: string,
  prior: ProductSessionProjection,
  operation: BallVesselTaskOperation,
): ProductSessionProjection {
  const before = settled(prior, sessionId), after = settled(value, sessionId);
  if (after.lastSequence !== before.lastSequence || !after.world) throw new Error("Ball task session authority 漂移");
  requireBallVesselTaskWorld(after.world);
  if (operation.kind === "create") {
    if (before.world !== null || before.lastRun !== null || after.lastRun !== null ||
        after.world.ref.version !== 1 || !sameData(after.world.snapshot, createBallVesselSnapshot())) {
      throw new Error("Ball task create transition 非法");
    }
    return after;
  }
  if (!before.world) throw new Error("Ball task 缺少 world");
  requireBallVesselTaskWorld(before.world);
  if (operation.kind === "run") {
    if (!sameBallTaskRef(operation.expected, before.world.ref) || !sameData(after.world, before.world) ||
        !after.lastRun || after.lastRun.episode.program.id !== BALL_VESSEL_PROGRAM.id ||
        after.lastRun.episode.id === before.lastRun?.episode.id) throw new Error("Ball task run transition 非法");
    return after;
  }
  const admitted = admitBallVesselTaskEdit(before.world, operation.input);
  const { position, rotation } = admitted.change.pose;
  const expectedEntities = before.world.snapshot.entities.map((entity) => entity.ref === BALL_REF
    ? { ...entity, state: { ...entity.state, pose: { position: [position.x, position.y, position.z], rotation } } }
    : entity);
  const expectedSnapshot = { ...before.world.snapshot,
    id: after.world.snapshot.id, parentId: before.world.snapshot.id, source: "edit", entities: expectedEntities };
  if (after.world.ref.version !== before.world.ref.version + 1 || after.lastRun !== null ||
      after.world.snapshot.id === before.world.snapshot.id || !sameData(after.world.snapshot, expectedSnapshot)) {
    throw new Error("Ball task edit lineage/pose 非法");
  }
  return after;
}

export function decodeBallVesselTaskPreview(
  value: unknown,
  sessionId: string,
  prior: ProductSessionProjection,
): BallVesselTaskPreview {
  if (typeof value !== "object" || value === null || Array.isArray(value) ||
      Object.getPrototypeOf(value) !== Object.prototype || Reflect.ownKeys(value).length !== 2 ||
      !Object.hasOwn(value, "projection") || !Object.hasOwn(value, "proposal")) throw new Error("Ball task preview shape 非法");
  const projection = Object.getOwnPropertyDescriptor(value, "projection")!, proposal = Object.getOwnPropertyDescriptor(value, "proposal")!;
  if (!("value" in projection) || !("value" in proposal) || !projection.enumerable || !proposal.enumerable) throw new Error("Ball task preview 必须是 plain data");
  const before = settled(prior, sessionId), after = settled(projection.value, sessionId);
  if (!sameData(before, after) || !before.world) throw new Error("Ball task preview 改变了 authority");
  requireBallVesselTaskWorld(before.world);
  const expected = before.lastRun ? deriveBallVesselPoseRepair(before.world, before.lastRun)
    : { status: "unavailable", reason: "run_required" };
  if (!sameData(proposal.value, expected)) throw new Error("Ball task preview 来源或 edit 漂移");
  return deepFreeze({ projection: after, proposal: expected }) as BallVesselTaskPreview;
}
