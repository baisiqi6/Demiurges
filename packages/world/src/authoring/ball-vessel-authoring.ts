import { BALL_REF, BALL_VESSEL_FIXTURE, createBallVesselSnapshot, vesselLocalPointToWorld } from "../artifacts/ball-vessel-fixture";
import { requireRegisteredSnapshotIdentity } from "../artifacts/diagnostic-rigid-fixture";
import { deepFreeze } from "../kernel/world";
import type { RefRecord } from "../kernel/types";
import type { WorldReadResult } from "../world-tools/world-tool-surface";
import { requireWorldEditInput, type WorldEditPoseWireInput } from "../world-tools/world-tool-contract";

export const BALL_VESSEL_TASK_LIMITS = deepFreeze({ x: [-2, 2], y: [-2, 2], z: [0.7, 2] } as const);

export function requireBallVesselTaskWorld(world: WorldReadResult): void {
  if (world.ref.name !== "world:current" || world.ref.snapshotId !== world.snapshot.id ||
      world.snapshot.scenarioId !== "scenario:ball-vessel-free-fall-v1") throw new Error("FIXTURE_NOT_COMPOSABLE");
  requireRegisteredSnapshotIdentity(world.snapshot);
  const canonical = createBallVesselSnapshot();
  for (const ref of ["entity:floor", "entity:vessel"]) {
    const state = world.snapshot.entities.find((entity) => entity.ref === ref)!.state;
    const registered = canonical.entities.find((entity) => entity.ref === ref)!.state;
    if (!state.pose.position.every((value, index) => value === registered.pose.position[index]) ||
        !["x", "y", "z", "w"].every((key) => state.pose.rotation[key as keyof typeof state.pose.rotation] === registered.pose.rotation[key as keyof typeof state.pose.rotation]) ||
        !state.linearVelocity.every((value, index) => value === registered.linearVelocity[index]) ||
        !state.angularVelocity.every((value, index) => value === registered.angularVelocity[index])) throw new Error("FIXTURE_NOT_COMPOSABLE");
  }
  const ball = world.snapshot.entities.find((entity) => entity.ref === BALL_REF)!;
  const [x, y, z] = ball.state.pose.position;
  if (x < -2 || x > 2 || y < -2 || y > 2 || z < 0.7 || z > 2 ||
      !ball.state.linearVelocity.every((value, index) => value === BALL_VESSEL_FIXTURE.ball.canonicalLinearVelocity[index]) ||
      !ball.state.angularVelocity.every((value) => value === 0) ||
      ball.state.pose.rotation.x !== 0 || ball.state.pose.rotation.y !== 0 ||
      ball.state.pose.rotation.z !== 0 || ball.state.pose.rotation.w !== 1) throw new Error("POSE_NOT_COMPOSABLE");
}

export function sameBallTaskRef(a: RefRecord, b: RefRecord): boolean {
  return a.name === b.name && a.snapshotId === b.snapshotId && a.version === b.version;
}

export function requireBallVesselTaskRunInput(world: WorldReadResult, input: unknown): { readonly expected: RefRecord } {
  if (typeof input !== "object" || input === null || Array.isArray(input) ||
      Object.getPrototypeOf(input) !== Object.prototype || Reflect.ownKeys(input).length !== 1 ||
      !Object.hasOwn(input, "expected")) throw new Error("INVALID_REQUEST");
  const expected = (input as { expected: unknown }).expected;
  if (typeof expected !== "object" || expected === null || Array.isArray(expected) ||
      Object.getPrototypeOf(expected) !== Object.prototype || Reflect.ownKeys(expected).length !== 3 ||
      !["name", "snapshotId", "version"].every((key) => Object.hasOwn(expected, key))) throw new Error("INVALID_REQUEST");
  const ref = expected as RefRecord;
  if (ref.name !== "world:current" || typeof ref.snapshotId !== "string" ||
      !/^snapshot:[A-Za-z0-9._-]+$/.test(ref.snapshotId) || !Number.isSafeInteger(ref.version) || ref.version < 1) throw new Error("INVALID_REQUEST");
  if (!sameBallTaskRef(ref, world.ref)) throw new Error("STALE_REF");
  return deepFreeze({ expected: ref });
}

export function admitBallVesselTaskEdit(world: WorldReadResult, input: unknown): WorldEditPoseWireInput {
  requireBallVesselTaskWorld(world);
  const parsed = requireWorldEditInput(input);
  if (!sameBallTaskRef(parsed.expected, world.ref)) throw new Error("STALE_REF");
  if (parsed.targetRef !== BALL_REF || parsed.change.kind !== "pose") throw new Error("POSE_NOT_COMPOSABLE");
  const { position: [x, y, z], rotation } = parsed.change.pose;
  if (x < -2 || x > 2 || y < -2 || y > 2 || z < 0.7 || z > 2 ||
      rotation.x !== 0 || rotation.y !== 0 || rotation.z !== 0 || rotation.w !== 1) throw new Error("POSE_NOT_COMPOSABLE");
  return deepFreeze({ expected: parsed.expected, targetRef: BALL_REF,
    change: { kind: "pose", frameRef: "frame:world", pose: { position: { x, y, z }, rotation } },
  }) as WorldEditPoseWireInput;
}

export function ballVesselStagingPosition(world: WorldReadResult): readonly [number, number, number] {
  const vessel = world.snapshot.entities.find((entity) => entity.ref === "entity:vessel")!;
  const ball = world.snapshot.entities.find((entity) => entity.ref === BALL_REF)!;
  const semantic = vessel.representations.semantic;
  if (semantic?.kind !== "vessel" || ball.representations.collision.kind !== "sphere") throw new Error("INVALID_REQUEST");
  const local = semantic.rimFrame.localPose.position;
  const worldPosition = vesselLocalPointToWorld(vessel.state.pose, [local[0], local[1], local[2] + ball.representations.collision.radius / 2]);
  return worldPosition.map((value) => { const rounded = Number(value.toPrecision(15)); return Object.is(rounded, -0) ? 0 : rounded; }) as unknown as readonly [number, number, number];
}
