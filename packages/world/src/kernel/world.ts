import type {
  Entity,
  EntityState,
  Snapshot,
  Vec3,
  WorldProgram,
  RuntimeProfile,
  LandingSuccessContract,
} from "./types";

const ZERO: Vec3 = [0, 0, 0];
const IDENTITY_ROTATION = { x: 0, y: 0, z: 0, w: 1 } as const;

export const FLOOR_REF = "entity:floor" as const;
export const CUBE_REF = "entity:cube" as const;
export const CURRENT_WORLD_REF = "world:current" as const;

export function deepFreeze<T>(value: T, seen = new WeakSet<object>()): Readonly<T> {
  if (!value || typeof value !== "object" || seen.has(value)) return value;
  seen.add(value);
  for (const key of Reflect.ownKeys(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (descriptor && "value" in descriptor) deepFreeze(descriptor.value, seen);
  }
  if (!Object.isFrozen(value)) Object.freeze(value);
  return value;
}

export function isDeepFrozen(value: unknown, seen = new WeakSet<object>()): boolean {
  if (typeof value === "function") return false;
  if (!value || typeof value !== "object") return true;
  if (seen.has(value)) return true;
  if (!Object.isFrozen(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  if (
    (Array.isArray(value) && prototype !== Array.prototype) ||
    (!Array.isArray(value) && prototype !== Object.prototype && prototype !== null)
  ) {
    return false;
  }
  seen.add(value);
  for (const key of Reflect.ownKeys(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !("value" in descriptor) || !isDeepFrozen(descriptor.value, seen)) {
      return false;
    }
  }
  return true;
}

export function createInitialSnapshot(cubeHeight = 2): Snapshot {
  const floorHalfExtents: Vec3 = [3.2, 3.2, 0.05];
  const cubeHalfExtents: Vec3 = [0.25, 0.25, 0.25];

  const entities: Entity[] = [
    {
      ref: FLOOR_REF,
      label: "Ground plane",
      frameRef: "frame:world",
      unitSystemRef: "units:si",
      state: createState([0, 0, -floorHalfExtents[2]]),
      representations: {
        visual: { kind: "box", halfExtents: floorHalfExtents, color: "#c7ccc5" },
        collision: { kind: "box", halfExtents: floorHalfExtents },
      },
      physics: { bodyType: "static", massKg: 0, friction: 0.85 },
    },
    {
      ref: CUBE_REF,
      label: "Diagnostic cube",
      frameRef: "frame:world",
      unitSystemRef: "units:si",
      state: createState([0, 0, cubeHeight]),
      representations: {
        visual: { kind: "box", halfExtents: cubeHalfExtents, color: "#df6b45" },
        collision: { kind: "box", halfExtents: cubeHalfExtents },
      },
      physics: { bodyType: "dynamic", massKg: 1, friction: 0.8 },
    },
  ];

  return deepFreeze({
    schemaVersion: 1,
    id: "snapshot:base",
    parentId: null,
    source: "write",
    entities,
  }) as Snapshot;
}

export function createState(position: Vec3): EntityState {
  return {
    pose: { position, rotation: IDENTITY_ROTATION },
    linearVelocity: ZERO,
    angularVelocity: ZERO,
  };
}

export function findEntity(snapshot: Snapshot, ref: Entity["ref"]): Entity {
  const entity = snapshot.entities.find((candidate) => candidate.ref === ref);
  if (!entity) {
    throw new Error(`Snapshot ${snapshot.id} 中不存在 ${ref}`);
  }
  return entity;
}

export const FALLING_CUBE_PROGRAM: WorldProgram = deepFreeze({
  id: "program:falling-cube",
  kind: "free-fall",
  targetRef: CUBE_REF,
  durationSeconds: 2.5,
  sampleRateHz: 30,
}) as WorldProgram;

export const MUJOCO_PROFILE: RuntimeProfile = deepFreeze({
  id: "runtime:mujoco-wasm-single-3.11.0",
  provider: "MuJoCo WASM",
  version: "3.11.0",
  equivalence: "numeric",
  timestepSeconds: 1 / 240,
  gravity: [0, 0, -9.81],
}) as RuntimeProfile;

export const LANDING_SUCCESS_CONTRACT: LandingSuccessContract = deepFreeze({
  id: "success:stable-on-floor",
  targetRef: CUBE_REF,
  expectedCenterHeight: 0.25,
  heightTolerance: 0.015,
  maxLinearSpeed: 0.08,
}) as LandingSuccessContract;
