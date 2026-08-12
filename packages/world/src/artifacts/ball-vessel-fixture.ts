import type {
  CollisionRepresentation,
  CompoundCollisionPart,
  Entity,
  Pose,
  Snapshot,
  Vec3,
  VesselSemanticRepresentation,
} from "../kernel/types";
import {
  FLOOR_REF,
  createInitialSnapshot,
  deepFreeze,
} from "../kernel/world";

export const BALL_VESSEL_FIXTURE_ID = "fixture:ball-vessel-v1" as const;
export const VESSEL_REF = "entity:vessel" as const;
export const BALL_REF = "entity:ball" as const;

const IDENTITY_ROTATION = { x: 0, y: 0, z: 0, w: 1 } as const;
const WALL_HALF_HEIGHT_METERS = 0.285;
const WALL_POSES = [
  { position: [0.45, 0, 0.365], rotation: { x: 0, y: 0, z: 0, w: 1 } },
  { position: [0.415745789630079, 0.1722075445642904, 0.365], rotation: { x: 0, y: 0, z: 0.19509032201612825, w: 0.9807852804032304 } },
  { position: [0.3181980515339464, 0.31819805153394637, 0.365], rotation: { x: 0, y: 0, z: 0.3826834323650898, w: 0.9238795325112867 } },
  { position: [0.17220754456429044, 0.415745789630079, 0.365], rotation: { x: 0, y: 0, z: 0.5555702330196022, w: 0.8314696123025452 } },
  { position: [0, 0.45, 0.365], rotation: { x: 0, y: 0, z: 0.7071067811865475, w: 0.7071067811865476 } },
  { position: [-0.17220754456429038, 0.415745789630079, 0.365], rotation: { x: 0, y: 0, z: 0.8314696123025452, w: 0.5555702330196023 } },
  { position: [-0.31819805153394637, 0.3181980515339464, 0.365], rotation: { x: 0, y: 0, z: 0.9238795325112867, w: 0.38268343236508984 } },
  { position: [-0.415745789630079, 0.17220754456429047, 0.365], rotation: { x: 0, y: 0, z: 0.9807852804032304, w: 0.19509032201612833 } },
  { position: [-0.45, 0, 0.365], rotation: { x: 0, y: 0, z: 1, w: 0 } },
  { position: [-0.4157457896300791, -0.17220754456429035, 0.365], rotation: { x: 0, y: 0, z: 0.9807852804032304, w: -0.1950903220161282 } },
  { position: [-0.3181980515339465, -0.31819805153394637, 0.365], rotation: { x: 0, y: 0, z: 0.9238795325112867, w: -0.3826834323650897 } },
  { position: [-0.17220754456429066, -0.41574578963007897, 0.365], rotation: { x: 0, y: 0, z: 0.8314696123025453, w: -0.555570233019602 } },
  { position: [0, -0.45, 0.365], rotation: { x: 0, y: 0, z: 0.7071067811865476, w: -0.7071067811865475 } },
  { position: [0.1722075445642905, -0.41574578963007897, 0.365], rotation: { x: 0, y: 0, z: 0.5555702330196022, w: -0.8314696123025453 } },
  { position: [0.3181980515339463, -0.3181980515339465, 0.365], rotation: { x: 0, y: 0, z: 0.3826834323650899, w: -0.9238795325112867 } },
  { position: [0.41574578963007897, -0.1722075445642907, 0.365], rotation: { x: 0, y: 0, z: 0.1950903220161286, w: -0.9807852804032304 } },
] as const;

export const BALL_VESSEL_ASSET = deepFreeze({
  assetId: "asset:smooth-vessel-v1" as const,
  mediaType: "model/gltf-binary" as const,
  repoPath: "packages/world/assets/smooth-vessel-v1.glb" as const,
  contentDigest:
    "sha256:856788138ecc53d407827a0e67aa9977237dd914809316f8af992e8ee098cd92" as const,
  byteLength: 26_256,
  provenance: {
    origin: "generated-in-repo" as const,
    generator: "scripts/generate-smooth-vessel-glb.mjs" as const,
    license: "CC0-1.0" as const,
  },
  radialSegments: 64,
  sourceFrameRef: "frame:gltf-y-up" as const,
  sourceUnitMeters: 1,
  localBoundsMeters: {
    center: [0, 0.325, 0] as const,
    halfExtents: [0.52, 0.325, 0.52] as const,
  },
  localTransform: {
    position: [0, 0, 0] as const,
    rotation: {
      x: Math.SQRT1_2,
      y: 0,
      z: 0,
      w: Math.SQRT1_2,
    },
    scale: [1, 1, 1] as const,
  },
} as const);

function wallPart(index: number): CompoundCollisionPart {
  const pose = WALL_POSES[index];
  if (!pose) throw new Error(`wall pose 未登记：${index}`);
  return {
    partKey: `wall-${String(index).padStart(2, "0")}`,
    localPose: pose,
    shape: {
      kind: "box",
      halfExtents: [0.05, 0.105, WALL_HALF_HEIGHT_METERS],
    },
  };
}

const BASE_PART: CompoundCollisionPart = {
  partKey: "base",
  localPose: {
    position: [0, 0, 0.04],
    rotation: IDENTITY_ROTATION,
  },
  shape: { kind: "box", halfExtents: [0.5, 0.5, 0.04] },
};

const VESSEL_COLLISION: CollisionRepresentation = deepFreeze({
  kind: "compound",
  parts: [
    BASE_PART,
    ...WALL_POSES.map((_, index) => wallPart(index)),
  ],
});

const VESSEL_SEMANTIC: VesselSemanticRepresentation = deepFreeze({
  kind: "vessel",
  rimFrame: {
    ref: "frame:vessel-rim-center",
    localPose: {
      position: [0, 0, 0.65],
      rotation: IDENTITY_ROTATION,
    },
  },
  innerEnvelope: {
    radiusMeters: 0.4,
    innerFloorZMeters: 0.08,
    rimZMeters: 0.65,
  },
});

const VESSEL_PHYSICS = deepFreeze({
  bodyType: "static" as const,
  massKg: 0,
  friction: 0.8,
});

export const BALL_VESSEL_FIXTURE = deepFreeze({
  fixtureId: BALL_VESSEL_FIXTURE_ID,
  artifact: BALL_VESSEL_ASSET,
  collision: VESSEL_COLLISION,
  semantic: VESSEL_SEMANTIC,
  ball: {
    radiusMeters: 0.1,
    massKg: 0.2,
    color: "#d8a657" as const,
    friction: 0.8,
    canonicalPose: {
      position: [0.12, 0, 1.25] as const,
      rotation: IDENTITY_ROTATION,
    },
    canonicalLinearVelocity: [-0.08, 0.04, 0] as const,
  },
} as const);

type DataRecord = Readonly<Record<string, unknown>>;

function dataRecord(
  value: unknown,
  label: string,
): DataRecord {
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Object.prototype &&
    Object.getPrototypeOf(value) !== null
  ) {
    throw new Error(`${label} 必须是 plain data record`);
  }
  const ownKeys = Reflect.ownKeys(value);
  if (ownKeys.some((key) => typeof key !== "string")) {
    throw new Error(`${label} 字段非法`);
  }
  const result: Record<string, unknown> = {};
  for (const key of ownKeys as string[]) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) {
      throw new Error(`${label} 必须是 enumerable own-data record`);
    }
    result[key] = descriptor.value;
  }
  return result;
}

function exactRecord(
  value: unknown,
  label: string,
  keys: readonly string[],
): DataRecord {
  const result = dataRecord(value, label);
  const ownKeys = Object.keys(result);
  if (
    ownKeys.length !== keys.length ||
    ownKeys.some((key) => !keys.includes(key)) ||
    keys.some((key) => !ownKeys.includes(key))
  ) {
    throw new Error(`${label} 字段非法`);
  }
  return result;
}

function finite(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${label} 必须是有限数值`);
  }
  return value;
}

function denseVec3(value: unknown, label: string): Vec3 {
  if (
    !Array.isArray(value) ||
    value.length !== 3 ||
    !Object.hasOwn(value, 0) ||
    !Object.hasOwn(value, 1) ||
    !Object.hasOwn(value, 2)
  ) {
    throw new Error(`${label} 必须是 dense Vec3`);
  }
  return [
    finite(value[0], `${label}[0]`),
    finite(value[1], `${label}[1]`),
    finite(value[2], `${label}[2]`),
  ];
}

function requirePose(value: unknown, label: string): Pose {
  const pose = exactRecord(value, label, ["position", "rotation"]);
  const position = denseVec3(pose.position, `${label}.position`);
  const rotation = exactRecord(pose.rotation, `${label}.rotation`, ["x", "y", "z", "w"]);
  const quaternion = {
    x: finite(rotation.x, `${label}.rotation.x`),
    y: finite(rotation.y, `${label}.rotation.y`),
    z: finite(rotation.z, `${label}.rotation.z`),
    w: finite(rotation.w, `${label}.rotation.w`),
  };
  if (Math.abs(Math.hypot(
    quaternion.x,
    quaternion.y,
    quaternion.z,
    quaternion.w,
  ) - 1) > 1e-9) {
    throw new Error(`${label}.rotation 必须是单位 quaternion`);
  }
  return { position, rotation: quaternion };
}

function requirePositive(value: unknown, label: string): number {
  const result = finite(value, label);
  if (result <= 0) throw new Error(`${label} 必须是正数`);
  return result;
}

function requireCompound(
  value: unknown,
  label: string,
  expectedPartCount?: number,
): void {
  const compound = exactRecord(value, label, ["kind", "parts"]);
  if (compound.kind !== "compound" || !Array.isArray(compound.parts)) {
    throw new Error(`${label} 必须是 compound collision`);
  }
  for (let index = 0; index < compound.parts.length; index += 1) {
    if (!Object.hasOwn(compound.parts, index)) {
      throw new Error(`${label}.parts 必须是 dense array`);
    }
  }
  const partKeys = new Set<string>();
  compound.parts.forEach((value, index) => {
    const part = exactRecord(value, `${label}.parts[${index}]`, [
      "partKey",
      "localPose",
      "shape",
    ]);
    if (
      typeof part.partKey !== "string" ||
      !/^(base|wall-[0-9]{2}|test-only-top-lid)$/.test(part.partKey)
    ) {
      throw new Error(`${label}.parts[${index}].partKey 非法`);
    }
    if (partKeys.has(part.partKey)) {
      throw new Error(`${label} partKey 重复：${part.partKey}`);
    }
    partKeys.add(part.partKey);
    requirePose(part.localPose, `${label}.parts[${index}].localPose`);
    const shape = exactRecord(part.shape, `${label}.parts[${index}].shape`, [
      "kind",
      "halfExtents",
    ]);
    if (shape.kind !== "box") {
      throw new Error(`${label}.parts[${index}].shape 必须是 box`);
    }
    denseVec3(shape.halfExtents, `${label}.parts[${index}].shape.halfExtents`)
      .forEach((component, axis) => requirePositive(
        component,
        `${label}.parts[${index}].shape.halfExtents[${axis}]`,
      ));
  });
  if (expectedPartCount !== undefined && compound.parts.length !== expectedPartCount) {
    throw new Error(`${label} 必须恰好包含 ${expectedPartCount} parts`);
  }
}

function requireSemantic(value: unknown, label: string): void {
  if (value === null) return;
  if (typeof value === "object" && value !== null && "kind" in value &&
      ((value as { kind?: unknown }).kind === "articulated" || (value as { kind?: unknown }).kind === "goal-frame")) {
    return;
  }
  const semantic = exactRecord(value, label, ["kind", "rimFrame", "innerEnvelope"]);
  if (semantic.kind !== "vessel") throw new Error(`${label}.kind 非法`);
  const rimFrame = exactRecord(semantic.rimFrame, `${label}.rimFrame`, ["ref", "localPose"]);
  if (rimFrame.ref !== "frame:vessel-rim-center") {
    throw new Error(`${label}.rim-center ref 非法`);
  }
  requirePose(rimFrame.localPose, `${label}.rim-center localPose`);
  const envelope = exactRecord(semantic.innerEnvelope, `${label}.innerEnvelope`, [
    "radiusMeters",
    "innerFloorZMeters",
    "rimZMeters",
  ]);
  requirePositive(envelope.radiusMeters, `${label}.innerEnvelope.radiusMeters`);
  finite(envelope.innerFloorZMeters, `${label}.innerEnvelope.innerFloorZMeters`);
  finite(envelope.rimZMeters, `${label}.innerEnvelope.rimZMeters`);
}

export function requireSnapshotRepresentationIntegrity(snapshot: Snapshot): void {
  const root = exactRecord(snapshot, "Snapshot", [
    "schemaVersion",
    "id",
    "parentId",
    "source",
    "scenarioId",
    "entities",
  ]);
  if (!Array.isArray(root.entities)) {
    throw new Error("Snapshot.entities 必须是 dense array");
  }
  for (let index = 0; index < root.entities.length; index += 1) {
    if (!Object.hasOwn(root.entities, index)) {
      throw new Error("Snapshot.entities 必须是 dense array");
    }
  }
  const entityRefs = new Set<string>();
  root.entities.forEach((value, index) => {
    const entity = exactRecord(value, `Snapshot.entities[${index}]`, [
      "ref",
      "label",
      "frameRef",
      "unitSystemRef",
      "state",
      "representations",
      "physics",
    ]);
    if (typeof entity.ref !== "string" || !entity.ref.startsWith("entity:")) {
      throw new Error(`Snapshot.entities[${index}].ref 非法`);
    }
    if (entityRefs.has(entity.ref)) {
      throw new Error("Snapshot EntityRef 必须唯一");
    }
    entityRefs.add(entity.ref);
    const state = exactRecord(entity.state, `${entity.ref}.state`,
      entity.ref === "entity:arm"
        ? ["pose", "linearVelocity", "angularVelocity", "articulated"]
        : ["pose", "linearVelocity", "angularVelocity"]);
    requirePose(state.pose, `${entity.ref}.state.pose`);
    denseVec3(state.linearVelocity, `${entity.ref}.state.linearVelocity`);
    denseVec3(state.angularVelocity, `${entity.ref}.state.angularVelocity`);
    const representations = exactRecord(entity.representations, `${entity.ref}.representations`, [
      "visual",
      "collision",
      "observation",
      "semantic",
    ]);
    const collisionRecord = dataRecord(representations.collision, `${entity.ref}.collision`);
    const collision = representations.collision as CollisionRepresentation;
    if (collision.kind === "box") {
      exactRecord(collisionRecord, `${entity.ref}.collision`, ["kind", "halfExtents"]);
      denseVec3(collision.halfExtents, `${entity.ref}.collision.halfExtents`)
        .forEach((component, axis) => requirePositive(
          component,
          `${entity.ref}.collision.halfExtents[${axis}]`,
        ));
    } else if (collision.kind === "sphere") {
      exactRecord(collisionRecord, `${entity.ref}.collision`, ["kind", "radius"]);
      requirePositive(collision.radius, `${entity.ref}.collision.radius`);
    } else if (collision.kind === "compound") {
      requireCompound(collision, `${entity.ref}.collision`);
    } else if (collision.kind === "none") {
      exactRecord(collisionRecord, `${entity.ref}.collision`, ["kind"]);
    } else {
      throw new Error(`${entity.ref}.collision.kind 非法`);
    }
    const visualRecord = dataRecord(representations.visual, `${entity.ref}.visual`);
    const visual = representations.visual as Entity["representations"]["visual"];
    if (visual.kind === "sphere") {
      exactRecord(visualRecord, `${entity.ref}.visual`, ["kind", "radius", "color"]);
      requirePositive(visual.radius, `${entity.ref}.visual.radius`);
      if (typeof visual.color !== "string" || visual.color.length === 0) {
        throw new Error(`${entity.ref}.visual.color 非法`);
      }
    } else if (visual.kind === "box") {
      exactRecord(visualRecord, `${entity.ref}.visual`, ["kind", "halfExtents", "color"]);
      denseVec3(visual.halfExtents, `${entity.ref}.visual.halfExtents`);
    } else if (visual.kind === "imported-rigid-mesh") {
      exactRecord(visualRecord, `${entity.ref}.visual`, [
        "kind",
        "assetId",
        "contentDigest",
        "sourceFrameRef",
        "sourceUnitMeters",
        "localTransform",
      ]);
      const transform = exactRecord(visual.localTransform, `${entity.ref}.visual.localTransform`, [
        "position",
        "rotation",
        "scale",
      ]);
      denseVec3(transform.position, `${entity.ref}.visual.localTransform.position`);
      denseVec3(transform.scale, `${entity.ref}.visual.localTransform.scale`)
        .forEach((component, axis) => requirePositive(
          component,
          `${entity.ref}.visual.localTransform.scale[${axis}]`,
        ));
      requirePose(
        { position: transform.position, rotation: transform.rotation },
        `${entity.ref}.visual.localTransform`,
      );
    } else {
      throw new Error(`${entity.ref}.visual.kind 非法`);
    }
    requireSemantic(representations.semantic, `${entity.ref}.semantic`);
    if ((representations.semantic as { kind?: unknown } | null)?.kind === "vessel" && collision.kind !== "compound") {
      throw new Error(`${entity.ref} vessel semantic 必须绑定 compound collision`);
    }
  });
}

function sameVec(left: readonly number[], right: readonly number[]): boolean {
  if (left.length !== right.length) return false;
  for (let index = 0; index < left.length; index += 1) {
    if (!Object.hasOwn(left, index) || left[index] !== right[index]) return false;
  }
  return true;
}

function sameRotation(left: Pose["rotation"], right: Pose["rotation"]): boolean {
  return left.x === right.x && left.y === right.y && left.z === right.z && left.w === right.w;
}

function samePose(left: Pose, right: Pose): boolean {
  return sameVec(left.position, right.position) && sameRotation(left.rotation, right.rotation);
}

function requireRegisteredVessel(entity: Entity): void {
  const visual = entity.representations.visual;
  const asset = BALL_VESSEL_ASSET;
  if (
    visual.kind !== "imported-rigid-mesh" ||
    visual.assetId !== asset.assetId ||
    visual.contentDigest !== asset.contentDigest ||
    visual.sourceFrameRef !== asset.sourceFrameRef ||
    visual.sourceUnitMeters !== asset.sourceUnitMeters ||
    !sameVec(visual.localTransform.position, asset.localTransform.position) ||
    !sameRotation(visual.localTransform.rotation, asset.localTransform.rotation) ||
    !sameVec(visual.localTransform.scale, asset.localTransform.scale)
  ) {
    throw new Error("vessel visual artifact identity/alignment 漂移");
  }
  requireCompound(entity.representations.collision, "entity:vessel collision", 17);
  const expectedCollision = BALL_VESSEL_FIXTURE.collision;
  if (JSON.stringify(entity.representations.collision) !== JSON.stringify(expectedCollision)) {
    throw new Error("vessel compound collision 与 fixture registry 漂移");
  }
  const semantic = entity.representations.semantic;
  if (
    semantic === null ||
    semantic.kind !== "vessel" ||
    semantic.rimFrame.ref !== VESSEL_SEMANTIC.rimFrame.ref ||
    !samePose(semantic.rimFrame.localPose, VESSEL_SEMANTIC.rimFrame.localPose) ||
    semantic.innerEnvelope.radiusMeters !== VESSEL_SEMANTIC.innerEnvelope.radiusMeters ||
    semantic.innerEnvelope.innerFloorZMeters !==
      VESSEL_SEMANTIC.innerEnvelope.innerFloorZMeters ||
    semantic.innerEnvelope.rimZMeters !== VESSEL_SEMANTIC.innerEnvelope.rimZMeters
  ) {
    throw new Error("vessel rim-center semantic 与 fixture registry 漂移");
  }
  if (
    entity.physics.bodyType !== VESSEL_PHYSICS.bodyType ||
    entity.physics.massKg !== VESSEL_PHYSICS.massKg ||
    entity.physics.friction !== VESSEL_PHYSICS.friction
  ) {
    throw new Error("vessel physics 与 fixture registry 漂移");
  }
}

function requireRegisteredBall(entity: Entity): void {
  const radius = BALL_VESSEL_FIXTURE.ball.radiusMeters;
  if (
    entity.representations.visual.kind !== "sphere" ||
    entity.representations.visual.radius !== radius ||
    entity.representations.visual.color !== BALL_VESSEL_FIXTURE.ball.color ||
    entity.representations.collision.kind !== "sphere" ||
    entity.representations.collision.radius !== radius ||
    entity.representations.observation !== null ||
    entity.representations.semantic !== null ||
    entity.physics.bodyType !== "dynamic" ||
    entity.physics.massKg !== BALL_VESSEL_FIXTURE.ball.massKg ||
    entity.physics.friction !== BALL_VESSEL_FIXTURE.ball.friction
  ) {
    throw new Error("entity:ball representation/physics 与 fixture registry 漂移");
  }
}

export function requireBallVesselSnapshot(snapshot: Snapshot): void {
  requireSnapshotRepresentationIntegrity(snapshot);
  if (snapshot.scenarioId !== "scenario:ball-vessel-free-fall-v1") {
    throw new Error("ball-vessel Snapshot scenario 与 fixture registry 漂移");
  }
  const refs = snapshot.entities.map((entity) => entity.ref);
  if (
    refs.length !== 3 ||
    refs[0] !== FLOOR_REF ||
    refs[1] !== VESSEL_REF ||
    refs[2] !== BALL_REF
  ) {
    throw new Error("ball-vessel Snapshot 必须恰好为 floor/vessel/ball");
  }
  const [floor, vessel, ball] = snapshot.entities;
  const registeredFloor = createInitialSnapshot().entities[0]!;
  if (
    JSON.stringify(floor!.representations) !==
      JSON.stringify(registeredFloor.representations) ||
    JSON.stringify(floor!.physics) !== JSON.stringify(registeredFloor.physics)
  ) {
    throw new Error("ball-vessel floor representation/physics 与 fixture registry 漂移");
  }
  requireRegisteredVessel(vessel!);
  requireRegisteredBall(ball!);
}

export function createBallVesselSnapshot(): Snapshot {
  const floor = createInitialSnapshot().entities.find((entity) => entity.ref === FLOOR_REF)!;
  const vessel: Entity = {
    ref: VESSEL_REF,
    label: "Smooth curved vessel",
    frameRef: "frame:world",
    unitSystemRef: "units:si",
    state: {
      pose: { position: [0, 0, 0], rotation: IDENTITY_ROTATION },
      linearVelocity: [0, 0, 0],
      angularVelocity: [0, 0, 0],
    },
    representations: {
      visual: {
        kind: "imported-rigid-mesh",
        assetId: BALL_VESSEL_ASSET.assetId,
        contentDigest: BALL_VESSEL_ASSET.contentDigest,
        sourceFrameRef: BALL_VESSEL_ASSET.sourceFrameRef,
        sourceUnitMeters: BALL_VESSEL_ASSET.sourceUnitMeters,
        localTransform: BALL_VESSEL_ASSET.localTransform,
      },
      collision: BALL_VESSEL_FIXTURE.collision,
      observation: null,
      semantic: BALL_VESSEL_FIXTURE.semantic,
    },
    physics: VESSEL_PHYSICS,
  };
  const ball: Entity = {
    ref: BALL_REF,
    label: "Dynamic ball",
    frameRef: "frame:world",
    unitSystemRef: "units:si",
    state: {
      pose: BALL_VESSEL_FIXTURE.ball.canonicalPose,
      linearVelocity: BALL_VESSEL_FIXTURE.ball.canonicalLinearVelocity,
      angularVelocity: [0, 0, 0],
    },
    representations: {
      visual: {
        kind: "sphere",
        radius: BALL_VESSEL_FIXTURE.ball.radiusMeters,
        color: BALL_VESSEL_FIXTURE.ball.color,
      },
      collision: {
        kind: "sphere",
        radius: BALL_VESSEL_FIXTURE.ball.radiusMeters,
      },
      observation: null,
      semantic: null,
    },
    physics: {
      bodyType: "dynamic",
      massKg: BALL_VESSEL_FIXTURE.ball.massKg,
      friction: BALL_VESSEL_FIXTURE.ball.friction,
    },
  };
  const snapshot = deepFreeze({
    schemaVersion: 1,
    id: "snapshot:base-ball-vessel",
    parentId: null,
    source: "write",
    scenarioId: "scenario:ball-vessel-free-fall-v1",
    entities: [floor, vessel, ball],
  }) as Snapshot;
  requireBallVesselSnapshot(snapshot);
  return snapshot;
}

export function vesselLocalPointToWorld(
  entityPose: Pose,
  localPoint: Vec3,
): Vec3 {
  requirePose(entityPose, "entityPose");
  const [x, y, z] = denseVec3(localPoint, "localPoint");
  const rotation = entityPose.rotation;
  const tx = 2 * (rotation.y * z - rotation.z * y);
  const ty = 2 * (rotation.z * x - rotation.x * z);
  const tz = 2 * (rotation.x * y - rotation.y * x);
  const rotated: Vec3 = [
    x + rotation.w * tx + rotation.y * tz - rotation.z * ty,
    y + rotation.w * ty + rotation.z * tx - rotation.x * tz,
    z + rotation.w * tz + rotation.x * ty - rotation.y * tx,
  ];
  return [
    entityPose.position[0] + rotated[0],
    entityPose.position[1] + rotated[1],
    entityPose.position[2] + rotated[2],
  ];
}
