import { deepFreeze } from "../kernel/world";

export const WORLD_POSE_POSITION_ENVELOPE = deepFreeze({
  x: deepFreeze({ minimum: -4, maximum: 4 }),
  y: deepFreeze({ minimum: -4, maximum: 4 }),
  z: deepFreeze({ minimum: 0, maximum: 4 }),
} as const);

export function isWorldPosePositionInEnvelope(position: readonly number[]): boolean {
  return position.length === 3 &&
    position.every((value) => Number.isFinite(value) && !Object.is(value, -0)) &&
    position[0]! >= WORLD_POSE_POSITION_ENVELOPE.x.minimum &&
    position[0]! <= WORLD_POSE_POSITION_ENVELOPE.x.maximum &&
    position[1]! >= WORLD_POSE_POSITION_ENVELOPE.y.minimum &&
    position[1]! <= WORLD_POSE_POSITION_ENVELOPE.y.maximum &&
    position[2]! >= WORLD_POSE_POSITION_ENVELOPE.z.minimum &&
    position[2]! <= WORLD_POSE_POSITION_ENVELOPE.z.maximum;
}
