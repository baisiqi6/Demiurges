import type { Entity, Pose } from "../kernel/types";

export const AUTHORED_FLOOR_TOLERANCE_METERS = 1e-9;

export function verticalHalfExtent(entity: Entity, pose: Pose): number {
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

export function requireAuthoredPoseAboveFloor(
  target: Entity,
  floor: Entity,
  pose: Pose,
): void {
  const targetBottom = pose.position[2] - verticalHalfExtent(target, pose);
  const floorTop = floor.state.pose.position[2] + verticalHalfExtent(floor, floor.state.pose);
  if (!Number.isFinite(targetBottom) || targetBottom < floorTop - AUTHORED_FLOOR_TOLERANCE_METERS) {
    throw new Error(`${target.ref} authored pose 穿透 floor`);
  }
}
