import type { Pose } from "../kernel/types";
import { deepFreeze } from "../kernel/world";
import { isWorldPosePositionInEnvelope } from "./pose-envelope";

export function requireCanonicalCompositePose(pose: Pose): Pose {
  const position = pose.position;
  const rotation = pose.rotation;
  const values = [
    ...position,
    rotation.x,
    rotation.y,
    rotation.z,
    rotation.w,
  ];
  if (!isWorldPosePositionInEnvelope(position) ||
      values.some((value) => !Number.isFinite(value) || Object.is(value, -0))) {
    throw new Error("composite pose position 必须落在 canonical world envelope");
  }
  if (rotation.x !== 0 || rotation.y !== 0) {
    throw new Error("composite pose rotation 只能绕 world-Z");
  }
  const norm = Math.hypot(rotation.x, rotation.y, rotation.z, rotation.w);
  if (Math.abs(norm - 1) > 1e-9) throw new Error("composite pose rotation 必须是单位 quaternion");
  if (!(rotation.w > 0 || (rotation.w === 0 && rotation.z >= 0))) {
    throw new Error("composite pose rotation 不满足 canonical hemisphere");
  }
  return deepFreeze({
    position: [position[0], position[1], position[2]],
    rotation: {
      x: 0,
      y: 0,
      z: rotation.z / norm || 0,
      w: rotation.w / norm || 0,
    },
  }) as Pose;
}

export function sameSemanticPose(left: Pose, right: Pose): boolean {
  if (!left.position.every((value, index) => Object.is(value, right.position[index]))) return false;
  const dot = left.rotation.x * right.rotation.x +
    left.rotation.y * right.rotation.y +
    left.rotation.z * right.rotation.z +
    left.rotation.w * right.rotation.w;
  return Math.abs(Math.abs(dot) - 1) <= 1e-12;
}
