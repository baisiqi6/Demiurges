import type {
  Entity,
  RegisteredAssetObservationRepresentation,
  RegisteredAssetVisualRepresentation,
  Snapshot,
} from "../kernel/types";
import { deepFreeze } from "../kernel/world";
import {
  FLOOR_PROXY,
  GENERATED_OBJECT_PROXY,
  MARBLE_HUNYUAN_MANIFEST_DIGEST,
  MARBLE_HUNYUAN_REGISTRY,
  requireMarbleHunyuanRegistryIntegrity,
} from "./marble-hunyuan-registry";
import { requireSnapshotRepresentationIntegrity } from "./ball-vessel-fixture";

export { FLOOR_PROXY, GENERATED_OBJECT_PROXY } from "./marble-hunyuan-registry";

export const MARBLE_HUNYUAN_COMPOSITE_FIXTURE_ID = "fixture:marble-hunyuan-composite-v1" as const;
export const MARBLE_HUNYUAN_COMPOSITE_SCENARIO_ID = "scenario:marble-hunyuan-composite-v1" as const;
export const ENVIRONMENT_REF = "entity:environment" as const;
export const GENERATED_OBJECT_REF = "entity:generated-object" as const;
export const MARBLE_HUNYUAN_COMPOSITE_SNAPSHOT_ID = "snapshot:marble-hunyuan-composite-base" as const;

const GENERATED_OBJECT_MASS_KG = 1;
const GENERATED_OBJECT_INITIAL_CENTER_Z = 1.2;
const GENERATED_OBJECT_FRICTION = 0.8;
const FLOOR_FRICTION = 0.85;
const FLOOR_VISUAL_COLOR = "#c7ccc5";

const IDENTITY_ROTATION = { x: 0, y: 0, z: 0, w: 1 } as const;
const ZERO_VELOCITY = [0, 0, 0] as const;

function registeredAssetVisual(
  assetId: `asset:${string}`,
  calibrationId: `calibration:${string}`,
  witnessId: `witness:${string}`,
): RegisteredAssetVisualRepresentation {
  return deepFreeze({
    kind: "registered-rigid-mesh",
    assetId,
    manifestDigest: MARBLE_HUNYUAN_MANIFEST_DIGEST,
    calibrationId,
    witnessId,
  }) as RegisteredAssetVisualRepresentation;
}

function registeredAssetObservation(
  assetId: `asset:${string}`,
  calibrationId: `calibration:${string}`,
  witnessId: `witness:${string}`,
): RegisteredAssetObservationRepresentation {
  return deepFreeze({
    kind: "registered-gaussian-splat",
    role: "observation",
    assetId,
    manifestDigest: MARBLE_HUNYUAN_MANIFEST_DIGEST,
    calibrationId,
    witnessId,
  }) as RegisteredAssetObservationRepresentation;
}

export function createMarbleHunyuanCompositeSnapshot(): Snapshot {
  requireMarbleHunyuanRegistryIntegrity(MARBLE_HUNYUAN_REGISTRY);
  const [spzAsset, colliderAsset, hunyuanAsset] = MARBLE_HUNYUAN_REGISTRY.assets;
  const [spzCalibration, colliderCalibration, hunyuanCalibration] =
    MARBLE_HUNYUAN_REGISTRY.calibrations;

  if (
    spzAsset!.assetId !== spzCalibration!.evidence.artifactId ||
    colliderAsset!.assetId !== colliderCalibration!.evidence.artifactId ||
    hunyuanAsset!.assetId !== hunyuanCalibration!.evidence.artifactId
  ) {
    throw new Error("manifest asset 与 calibration evidence 顺序漂移");
  }

  const entities: Entity[] = [
    {
      ref: ENVIRONMENT_REF,
      label: "Marble world environment",
      frameRef: "frame:world",
      unitSystemRef: "units:si",
      state: {
        pose: { position: [0, 0, 0], rotation: IDENTITY_ROTATION },
        linearVelocity: ZERO_VELOCITY,
        angularVelocity: ZERO_VELOCITY,
      },
      representations: {
        visual: registeredAssetVisual(
          colliderAsset!.assetId,
          colliderCalibration!.id,
          "witness:marble-spz-collider-bounds-v1",
        ),
        collision: { kind: "none" },
        observation: registeredAssetObservation(
          spzAsset!.assetId,
          spzCalibration!.id,
          "witness:marble-spz-collider-bounds-v1",
        ),
        semantic: null,
      },
      physics: { bodyType: "static", massKg: 0, friction: 0 },
    },
    {
      ref: "entity:floor",
      label: "Authored floor box proxy",
      frameRef: "frame:world",
      unitSystemRef: "units:si",
      state: {
        pose: { position: FLOOR_PROXY.center, rotation: IDENTITY_ROTATION },
        linearVelocity: ZERO_VELOCITY,
        angularVelocity: ZERO_VELOCITY,
      },
      representations: {
        visual: { kind: "box", halfExtents: FLOOR_PROXY.halfExtents, color: FLOOR_VISUAL_COLOR },
        collision: { kind: "box", halfExtents: FLOOR_PROXY.halfExtents },
        observation: null,
        semantic: {
          kind: "authored-box-proxy",
          witnessId: "witness:marble-collider-authored-floor-v1",
        },
      },
      physics: { bodyType: "static", massKg: 0, friction: FLOOR_FRICTION },
    },
    {
      ref: GENERATED_OBJECT_REF,
      label: "Hunyuan generated object",
      frameRef: "frame:world",
      unitSystemRef: "units:si",
      state: {
        pose: {
          position: [0, 0, GENERATED_OBJECT_INITIAL_CENTER_Z],
          rotation: IDENTITY_ROTATION,
        },
        linearVelocity: ZERO_VELOCITY,
        angularVelocity: ZERO_VELOCITY,
      },
      representations: {
        visual: registeredAssetVisual(
          hunyuanAsset!.assetId,
          hunyuanCalibration!.id,
          "witness:hunyuan-glb-box-proxy-v1",
        ),
        collision: { kind: "box", halfExtents: GENERATED_OBJECT_PROXY.halfExtents },
        observation: null,
        semantic: null,
      },
      physics: {
        bodyType: "dynamic",
        massKg: GENERATED_OBJECT_MASS_KG,
        friction: GENERATED_OBJECT_FRICTION,
      },
    },
  ];

  return deepFreeze({
    schemaVersion: 1,
    id: MARBLE_HUNYUAN_COMPOSITE_SNAPSHOT_ID,
    parentId: null,
    source: "write",
    scenarioId: MARBLE_HUNYUAN_COMPOSITE_SCENARIO_ID,
    entities,
  }) as Snapshot;
}

function samePlainData(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (Array.isArray(left) || Array.isArray(right)) {
    if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) {
      return false;
    }
    return left.every((value, index) =>
      Object.hasOwn(left, index) && Object.hasOwn(right, index) && samePlainData(value, right[index]));
  }
  if (
    typeof left !== "object" || left === null ||
    typeof right !== "object" || right === null
  ) return false;
  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);
  return leftKeys.length === rightKeys.length && leftKeys.every((key) =>
    Object.hasOwn(right, key) && samePlainData(
      (left as Record<string, unknown>)[key],
      (right as Record<string, unknown>)[key],
    ));
}

export function requireMarbleHunyuanCompositeSnapshot(snapshot: Snapshot): void {
  requireSnapshotRepresentationIntegrity(snapshot);
  requireMarbleHunyuanRegistryIntegrity(MARBLE_HUNYUAN_REGISTRY);

  if (snapshot.scenarioId !== MARBLE_HUNYUAN_COMPOSITE_SCENARIO_ID) {
    throw new Error("composite Snapshot scenario 与 fixture registry 漂移");
  }
  const refs = snapshot.entities.map((entity) => entity.ref);
  if (
    refs.length !== 3 ||
    refs[0] !== ENVIRONMENT_REF ||
    refs[1] !== "entity:floor" ||
    refs[2] !== GENERATED_OBJECT_REF
  ) {
    throw new Error("composite Snapshot 必须恰好为 environment/floor/generated-object");
  }
  if (snapshot.source === "write" && snapshot.parentId !== null) {
    throw new Error("composite write Snapshot 的 parentId 必须为 null");
  }
  if (snapshot.source !== "write" && snapshot.parentId === null) {
    throw new Error(`${snapshot.source} composite Snapshot 必须声明 parentId`);
  }

  const canonical = createMarbleHunyuanCompositeSnapshot();
  const [environment, floor, generated] = snapshot.entities;
  const [canonicalEnvironment, canonicalFloor, canonicalGenerated] = canonical.entities;

  for (const [entity, expected, label] of [
    [environment, canonicalEnvironment, "environment"],
    [floor, canonicalFloor, "floor"],
  ] as const) {
    if (
      entity!.label !== expected!.label ||
      !samePlainData(entity!.state, expected!.state) ||
      !samePlainData(entity!.representations, expected!.representations) ||
      !samePlainData(entity!.physics, expected!.physics)
    ) {
      throw new Error(`composite ${label} 与 fixture registry 漂移`);
    }
  }

  if (
    generated!.label !== canonicalGenerated!.label ||
    !samePlainData(generated!.representations, canonicalGenerated!.representations) ||
    !samePlainData(generated!.physics, canonicalGenerated!.physics)
  ) {
    throw new Error("composite generated-object representation/physics 与 fixture registry 漂移");
  }
  if (snapshot.source !== "runtime-terminal" &&
      !samePlainData(generated!.state, canonicalGenerated!.state)) {
    throw new Error("authored composite generated-object 初始 state 必须与 fixture registry 一致");
  }
}
