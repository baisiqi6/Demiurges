import {
  GENERATED_OBJECT_REF,
  WORLD_POSE_POSITION_ENVELOPE,
  deepFreeze,
  type Entity,
  type RefRecord,
} from "@demiurges/world";

export type PoseDraftMode = "translate" | "rotate-z";

export interface PoseDraft {
  readonly baseRef: RefRecord;
  readonly targetRef: typeof GENERATED_OBJECT_REF;
  readonly pose: Entity["state"]["pose"];
  readonly mode: PoseDraftMode;
}

function densePosition(position: readonly number[]): readonly [number, number, number] {
  if (!Array.isArray(position) || position.length !== 3 ||
      ![0, 1, 2].every((index) => Object.hasOwn(position, index))) {
    throw new Error("PoseDraft position 必须是 dense Vec3");
  }
  const [rawX, rawY, rawZ] = position;
  if (![rawX, rawY, rawZ].every(Number.isFinite) ||
      rawX! < WORLD_POSE_POSITION_ENVELOPE.x.minimum || rawX! > WORLD_POSE_POSITION_ENVELOPE.x.maximum ||
      rawY! < WORLD_POSE_POSITION_ENVELOPE.y.minimum || rawY! > WORLD_POSE_POSITION_ENVELOPE.y.maximum ||
      rawZ! < WORLD_POSE_POSITION_ENVELOPE.z.minimum || rawZ! > WORLD_POSE_POSITION_ENVELOPE.z.maximum) {
    throw new Error("PoseDraft position 超出 world authoring envelope");
  }
  return [rawX === 0 ? 0 : rawX!, rawY === 0 ? 0 : rawY!, rawZ === 0 ? 0 : rawZ!];
}

function yawRotation(yawRadians: number) {
  if (!Number.isFinite(yawRadians)) throw new Error("PoseDraft yaw 必须 finite");
  let z = Math.sin(yawRadians / 2);
  let w = Math.cos(yawRadians / 2);
  if (w < 0 || (Math.abs(w) <= Number.EPSILON * 4 && z < 0)) {
    z = -z;
    w = -w;
  }
  if (Math.abs(w) <= Number.EPSILON * 4) w = 0;
  if (Math.abs(z) <= Number.EPSILON * 4) z = 0;
  return { x: 0, y: 0, z, w } as const;
}

export function createPoseDraft(
  baseRef: RefRecord,
  entity: Entity,
  mode: PoseDraftMode,
): PoseDraft {
  if (entity.ref !== GENERATED_OBJECT_REF) throw new Error("只有 generated-object 可建立 PoseDraft");
  const yaw = 2 * Math.atan2(entity.state.pose.rotation.z, entity.state.pose.rotation.w);
  return updatePoseDraft({
    baseRef: deepFreeze({ ...baseRef }) as RefRecord,
    targetRef: GENERATED_OBJECT_REF,
    pose: entity.state.pose,
    mode,
  }, entity.state.pose.position, yaw, mode);
}

export function updatePoseDraft(
  draft: PoseDraft,
  position: readonly [number, number, number],
  yawRadians: number,
  mode: PoseDraftMode = draft.mode,
): PoseDraft {
  return deepFreeze({
    baseRef: draft.baseRef,
    targetRef: GENERATED_OBJECT_REF,
    mode,
    pose: {
      position: densePosition(position),
      rotation: yawRotation(yawRadians),
    },
  }) as PoseDraft;
}

export function poseDraftWorldEditInput(draft: PoseDraft) {
  return {
    expected: { ...draft.baseRef },
    targetRef: GENERATED_OBJECT_REF,
    change: {
      kind: "pose" as const,
      frameRef: "frame:world" as const,
      pose: {
        position: {
          x: draft.pose.position[0],
          y: draft.pose.position[1],
          z: draft.pose.position[2],
        },
        rotation: { ...draft.pose.rotation },
      },
    },
  };
}
