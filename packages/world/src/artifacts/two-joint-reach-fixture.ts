import type { Entity, Pose, Snapshot, Vec3 } from "../kernel/types";
import { createInitialSnapshot, createState, deepFreeze } from "../kernel/world";

export const TWO_JOINT_REACH_FIXTURE_ID = "fixture:two-joint-planar-reach-v1" as const;
export const TWO_JOINT_REACH_SCENARIO_ID = "scenario:two-joint-planar-reach-v1" as const;
export const ARM_REF = "entity:arm" as const;
export const REACH_TARGET_REF = "entity:target" as const;
export const REACH_TARGET_POSITION = [0.8605638099833013, 0.17854850979986867, 0.75] as const satisfies Vec3;

const IDENTITY: Pose["rotation"] = { x: 0, y: 0, z: 0, w: 1 };
const localPose = (position: Vec3): Pose => ({ position, rotation: IDENTITY });

export function createTwoJointReachSnapshot(): Snapshot {
  const floor = createInitialSnapshot().entities[0]!;
  const arm: Entity = {
    ref: ARM_REF,
    label: "Two-joint planar arm",
    frameRef: "frame:world",
    unitSystemRef: "units:si",
    state: {
      ...createState([0, 0, 0.75]),
      articulated: { joints: [
        { jointRef: "joint:arm-shoulder", positionRadians: 0, velocityRadiansPerSecond: 0 },
        { jointRef: "joint:arm-elbow", positionRadians: 0, velocityRadiansPerSecond: 0 },
      ] },
    },
    representations: {
      visual: { kind: "box", halfExtents: [0.5, 0.05, 0.05], color: "#d97757" },
      collision: { kind: "none" },
      observation: null,
      semantic: {
        kind: "articulated",
        rootFrameRef: "frame:arm-base",
        links: [
          { linkRef: "link:arm-base", parentLinkRef: null, lengthMeters: 0, localPose: localPose([0, 0, 0]), visual: { kind: "none", radiusMeters: 0, lengthMeters: 0 }, collision: { kind: "none" } },
          { linkRef: "link:arm-upper", parentLinkRef: "link:arm-base", lengthMeters: 0.55, localPose: localPose([0, 0, 0]), visual: { kind: "capsule", radiusMeters: 0.05, lengthMeters: 0.45 }, collision: { kind: "none" } },
          { linkRef: "link:arm-forearm", parentLinkRef: "link:arm-upper", lengthMeters: 0.45, localPose: localPose([0.55, 0, 0]), visual: { kind: "capsule", radiusMeters: 0.05, lengthMeters: 0.35 }, collision: { kind: "none" } },
        ],
        joints: [
          { jointRef: "joint:arm-shoulder", parentLinkRef: "link:arm-base", childLinkRef: "link:arm-upper", axis: [0, 0, 1], limitRadians: [-1.57, 1.57], type: "hinge", positionUnit: "rad", velocityUnit: "rad/s" },
          { jointRef: "joint:arm-elbow", parentLinkRef: "link:arm-upper", childLinkRef: "link:arm-forearm", axis: [0, 0, 1], limitRadians: [-2.2, 2.2], type: "hinge", positionUnit: "rad", velocityUnit: "rad/s" },
        ],
        actuators: [
          { actuatorRef: "actuator:arm-shoulder-position", jointRef: "joint:arm-shoulder", controlRangeRadians: [-1.57, 1.57], controlMode: "position", commandUnit: "rad" },
          { actuatorRef: "actuator:arm-elbow-position", jointRef: "joint:arm-elbow", controlRangeRadians: [-2.2, 2.2], controlMode: "position", commandUnit: "rad" },
        ],
        sensors: [
          { sensorRef: "sensor:arm-shoulder-position", jointRef: "joint:arm-shoulder", sourceRef: "joint:arm-shoulder", measurement: "position", unit: "rad", registryOrder: 0 },
          { sensorRef: "sensor:arm-shoulder-velocity", jointRef: "joint:arm-shoulder", sourceRef: "joint:arm-shoulder", measurement: "velocity", unit: "rad/s", registryOrder: 1 },
          { sensorRef: "sensor:arm-elbow-position", jointRef: "joint:arm-elbow", sourceRef: "joint:arm-elbow", measurement: "position", unit: "rad", registryOrder: 2 },
          { sensorRef: "sensor:arm-elbow-velocity", jointRef: "joint:arm-elbow", sourceRef: "joint:arm-elbow", measurement: "velocity", unit: "rad/s", registryOrder: 3 },
        ],
        frames: [
          { frameRef: "frame:arm-base", parentLinkRef: "link:arm-base", localPose: localPose([0, 0, 0]) },
          { frameRef: "frame:arm-elbow", parentLinkRef: "link:arm-upper", localPose: localPose([0.55, 0, 0]) },
          { frameRef: "frame:arm-tool", parentLinkRef: "link:arm-forearm", localPose: localPose([0.45, 0, 0]) },
        ],
      },
    },
    physics: { bodyType: "static", massKg: 2, friction: 0 },
  };
  const target: Entity = {
    ref: REACH_TARGET_REF,
    label: "Reach target",
    frameRef: "frame:world",
    unitSystemRef: "units:si",
    state: createState(REACH_TARGET_POSITION),
    representations: {
      visual: { kind: "sphere", radius: 0.04, color: "#6ee7b7" },
      collision: { kind: "none" },
      observation: null,
      semantic: { kind: "goal-frame", frameRef: "frame:reach-target", localPose: localPose([0, 0, 0]) },
    },
    physics: { bodyType: "static", massKg: 0, friction: 0 },
  };
  return deepFreeze({
    schemaVersion: 1,
    id: "snapshot:base-two-joint-reach",
    parentId: null,
    source: "write",
    scenarioId: TWO_JOINT_REACH_SCENARIO_ID,
    entities: [floor, arm, target],
  }) as Snapshot;
}
