import {
  GENERATED_OBJECT_REF,
  MARBLE_HUNYUAN_COMPOSITE_SCENARIO_ID,
  requireMarbleHunyuanCompositeSnapshot,
} from "./artifacts/marble-hunyuan-composite-fixture";
import { canonicalJsonBytes } from "./kernel/canonical-json";
import type { Entity, Pose, RefRecord, Snapshot } from "./kernel/types";
import { CURRENT_WORLD_REF, deepFreeze, findEntity } from "./kernel/world";
import { requireAuthoredPoseAboveFloor } from "./repository/pose-constraints";
import { requireCanonicalCompositePose, sameSemanticPose } from "./world-tools/composite-pose";
import {
  decodeWorldEditInputStructure,
  requireWorldEditInput,
  type WorldEditInput,
  type WorldEditPoseWireInput,
  type WorldEditStructuralInput,
} from "./world-tools/world-tool-contract";

export type CompositeAuthoringRejectionCode =
  | "INVALID_REQUEST"
  | "FIXTURE_NOT_COMPOSABLE"
  | "POSE_NOT_COMPOSABLE"
  | "STALE_REF";

export type CompositeAuthoringAdmission =
  | Readonly<{
      status: "accepted";
      canonicalWireInput: WorldEditPoseWireInput;
      parsedInput: WorldEditInput;
    }>
  | Readonly<{ status: "unchanged" }>
  | Readonly<{ status: "rejected"; code: CompositeAuthoringRejectionCode }>;

export interface CompositeWorldAuthority {
  readonly ref: RefRecord;
  readonly snapshot: Snapshot;
}

function rejected(code: CompositeAuthoringRejectionCode): CompositeAuthoringAdmission {
  return deepFreeze({ status: "rejected", code }) as CompositeAuthoringAdmission;
}

function sameRef(left: RefRecord, right: RefRecord): boolean {
  return left.name === right.name &&
    left.snapshotId === right.snapshotId &&
    left.version === right.version;
}

function isPoseStructural(input: WorldEditStructuralInput): input is WorldEditPoseWireInput {
  return input.change.kind === "pose";
}

function canonicalPose(input: WorldEditPoseWireInput): Pose | null {
  const { position, rotation } = input.change.pose;
  try {
    return requireCanonicalCompositePose({
      position: [position.x, position.y, position.z],
      rotation,
    });
  } catch {
    return null;
  }
}

function canonicalWire(
  input: WorldEditPoseWireInput,
  pose: Pose,
): WorldEditPoseWireInput {
  return deepFreeze({
    expected: input.expected,
    targetRef: GENERATED_OBJECT_REF,
    change: {
      kind: "pose",
      frameRef: "frame:world",
      pose: {
        position: { x: pose.position[0], y: pose.position[1], z: pose.position[2] },
        rotation: pose.rotation,
      },
    },
  }) as WorldEditPoseWireInput;
}

export function admitMarbleHunyuanCompositeEdit(
  current: CompositeWorldAuthority,
  rawInput: unknown,
): CompositeAuthoringAdmission {
  let structural;
  try {
    structural = decodeWorldEditInputStructure(rawInput);
  } catch {
    return rejected("INVALID_REQUEST");
  }

  if (!sameRef(structural.expected, current.ref)) return rejected("STALE_REF");
  if (current.ref.name !== CURRENT_WORLD_REF ||
      current.ref.snapshotId !== current.snapshot.id ||
      current.snapshot.scenarioId !== MARBLE_HUNYUAN_COMPOSITE_SCENARIO_ID ||
      structural.targetRef !== GENERATED_OBJECT_REF) {
    return rejected("FIXTURE_NOT_COMPOSABLE");
  }
  if (!isPoseStructural(structural)) return rejected("FIXTURE_NOT_COMPOSABLE");
  try {
    requireMarbleHunyuanCompositeSnapshot(current.snapshot);
  } catch {
    return rejected("FIXTURE_NOT_COMPOSABLE");
  }

  const pose = canonicalPose(structural);
  if (!pose) return rejected("POSE_NOT_COMPOSABLE");
  const target = findEntity(current.snapshot, GENERATED_OBJECT_REF);
  const floor = findEntity(current.snapshot, "entity:floor");
  try {
    requireAuthoredPoseAboveFloor(target, floor, pose);
  } catch {
    return rejected("POSE_NOT_COMPOSABLE");
  }
  if (sameSemanticPose(target.state.pose, pose)) return deepFreeze({ status: "unchanged" });

  const wire = canonicalWire(structural, pose);
  const parsed = requireWorldEditInput(wire);
  const expectedParsed = deepFreeze({
    expected: wire.expected,
    targetRef: wire.targetRef as Entity["ref"],
    change: { kind: "pose", frameRef: "frame:world", pose },
  }) as WorldEditInput;
  if (canonicalJsonBytes(parsed).toString() !== canonicalJsonBytes(expectedParsed).toString()) {
    throw new Error("canonical world_edit wire 与 parsed input 不一致");
  }
  return deepFreeze({
    status: "accepted",
    canonicalWireInput: wire,
    parsedInput: parsed,
  }) as CompositeAuthoringAdmission;
}
