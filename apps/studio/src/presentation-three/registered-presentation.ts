import {
  MARBLE_HUNYUAN_MANIFEST_DIGEST,
  MARBLE_HUNYUAN_REGISTRY,
  MARBLE_HUNYUAN_COMPOSITE_SCENARIO_ID,
  type CalibrationRecord,
  type FloorContactWitness,
  type HunyuanContainmentWitness,
  type ManifestAssetEntry,
  type MarbleBoundsWitness,
  type RegisteredAssetObservationRepresentation,
  type RegisteredAssetVisualRepresentation,
  type Snapshot,
} from "@demiurges/world";
import {
  boundsContains,
  normalizeBounds,
  type Bounds3,
  type CameraPose,
} from "./observer-camera";

export type RegisteredRepresentation =
  | RegisteredAssetVisualRepresentation
  | RegisteredAssetObservationRepresentation;

export type RegisteredWitness =
  | MarbleBoundsWitness
  | HunyuanContainmentWitness
  | FloorContactWitness;

export interface RegisteredPresentationAsset {
  readonly asset: ManifestAssetEntry;
  readonly calibration: CalibrationRecord;
  readonly witness: RegisteredWitness;
  readonly url: string;
}

export interface RegisteredObserverEntry {
  readonly bounds: Bounds3;
  readonly entryPose: CameraPose;
  readonly truthLevel: "authored-unverified";
  readonly provenance: string;
  readonly entityRef: `entity:${string}`;
  readonly calibrationId: `calibration:${string}`;
}

const MARBLE_ENTRY_POSE: CameraPose = Object.freeze({
  position: Object.freeze([0, -1.2, 1.15]),
  target: Object.freeze([0, 0.2, 1.05]),
}) as CameraPose;

const EXPECTED_REGISTERED_BINDINGS = Object.freeze([
  {
    entityRef: "entity:environment",
    slot: "visual",
    kind: "registered-rigid-mesh",
    assetId: "asset:marble-world-collider-v1",
    calibrationId: "calibration:marble-collider-v1",
    witnessId: "witness:marble-spz-collider-bounds-v1",
  },
  {
    entityRef: "entity:environment",
    slot: "observation",
    kind: "registered-gaussian-splat",
    assetId: "asset:marble-world-500k-spz-v1",
    calibrationId: "calibration:marble-spz-v1",
    witnessId: "witness:marble-spz-collider-bounds-v1",
  },
  {
    entityRef: "entity:generated-object",
    slot: "visual",
    kind: "registered-rigid-mesh",
    assetId: "asset:hunyuan-rounded-cube-v1",
    calibrationId: "calibration:hunyuan-glb-v1",
    witnessId: "witness:hunyuan-glb-box-proxy-v1",
  },
] as const);

export function registeredAssetUrl(assetId: ManifestAssetEntry["assetId"]): string {
  return `/api/assets/${encodeURIComponent(assetId)}`;
}

export function resolveRegisteredPresentationAsset(
  representation: RegisteredRepresentation,
): RegisteredPresentationAsset {
  if (representation.manifestDigest !== MARBLE_HUNYUAN_MANIFEST_DIGEST) {
    throw new Error("registered Presentation manifestDigest 漂移");
  }
  const asset = MARBLE_HUNYUAN_REGISTRY.assets.find(
    (candidate) => candidate.assetId === representation.assetId,
  );
  const calibration = MARBLE_HUNYUAN_REGISTRY.calibrations.find(
    (candidate) => candidate.id === representation.calibrationId,
  );
  const witness = MARBLE_HUNYUAN_REGISTRY.witnesses.find(
    (candidate) => candidate.id === representation.witnessId,
  );
  const expectedBinding = EXPECTED_REGISTERED_BINDINGS.find((candidate) =>
    candidate.kind === representation.kind &&
    candidate.assetId === representation.assetId &&
    candidate.calibrationId === representation.calibrationId &&
    candidate.witnessId === representation.witnessId);
  if (
    !asset ||
    !calibration ||
    !witness ||
    !expectedBinding ||
    calibration.evidence.artifactId !== asset.assetId ||
    calibration.evidence.artifactDigest !== asset.digest
  ) {
    throw new Error("registered Presentation registry binding 漂移");
  }
  return Object.freeze({
    asset,
    calibration,
    witness,
    url: registeredAssetUrl(asset.assetId),
  });
}

export function resolveRegisteredObserverEntry(
  snapshot: Snapshot | undefined,
): RegisteredObserverEntry | undefined {
  if (!snapshot || snapshot.scenarioId !== MARBLE_HUNYUAN_COMPOSITE_SCENARIO_ID) {
    return undefined;
  }
  requireRegisteredPresentationScenario(snapshot);
  const entity = snapshot.entities.find((candidate) =>
    candidate.representations.observation?.kind === "registered-gaussian-splat" &&
    candidate.representations.observation.assetId === "asset:marble-world-500k-spz-v1");
  const representation = entity?.representations.observation;
  if (!entity || representation?.kind !== "registered-gaussian-splat") {
    throw new Error("Marble Observer entry 缺少 registered Observation");
  }
  const resolved = resolveRegisteredPresentationAsset(representation);
  if (
    resolved.asset.assetId !== "asset:marble-world-500k-spz-v1" ||
    resolved.calibration.id !== "calibration:marble-spz-v1" ||
    resolved.calibration.status !== "authored-unverified"
  ) {
    throw new Error("Marble Observer entry registry binding 漂移");
  }
  const bounds = normalizeBounds(resolved.calibration.targetBounds);
  if (!bounds || !boundsContains(bounds, MARBLE_ENTRY_POSE.position) ||
      !boundsContains(bounds, MARBLE_ENTRY_POSE.target)) {
    throw new Error("Marble Observer entry pose 超出 registered bounds");
  }
  return Object.freeze({
    bounds,
    entryPose: MARBLE_ENTRY_POSE,
    truthLevel: "authored-unverified",
    provenance: `${resolved.asset.assetId} · ${resolved.calibration.id} · operator-authored-entry-v1`,
    entityRef: entity.ref,
    calibrationId: resolved.calibration.id,
  });
}

export function hasExactRegisteredPresentationScenario(snapshot: Snapshot | undefined): boolean {
  if (!snapshot || snapshot.scenarioId !== MARBLE_HUNYUAN_COMPOSITE_SCENARIO_ID) return false;
  requireRegisteredPresentationScenario(snapshot);
  return true;
}

function requireRegisteredPresentationScenario(snapshot: Snapshot): void {
  const representations: RegisteredRepresentation[] = [];
  for (const entity of snapshot.entities) {
    for (const representation of [
      entity.representations.visual,
      entity.representations.observation,
    ] as readonly unknown[]) {
      if (isRegisteredRepresentation(representation)) representations.push(representation);
    }
  }
  const actualAssetIds = representations.map(
    (representation) => resolveRegisteredPresentationAsset(representation).asset.assetId,
  );
  const expectedAssetIds = MARBLE_HUNYUAN_REGISTRY.assets.map((asset) => asset.assetId);
  const sortedActual = [...actualAssetIds].sort();
  const sortedExpected = [...expectedAssetIds].sort();
  if (
    actualAssetIds.length !== expectedAssetIds.length ||
    new Set(actualAssetIds).size !== expectedAssetIds.length ||
    sortedActual.some((assetId, index) => assetId !== sortedExpected[index])
  ) {
    throw new Error("Marble registered Presentation scenario binding 不完整");
  }
  for (const expected of EXPECTED_REGISTERED_BINDINGS) {
    const entity = snapshot.entities.find((candidate) => candidate.ref === expected.entityRef);
    const representation = expected.slot === "visual"
      ? entity?.representations.visual
      : entity?.representations.observation;
    if (
      !representation ||
      representation.kind !== expected.kind ||
      representation.assetId !== expected.assetId ||
      representation.calibrationId !== expected.calibrationId ||
      representation.witnessId !== expected.witnessId
    ) {
      throw new Error("Marble registered Presentation entity/role binding 漂移");
    }
  }
}

function isRegisteredRepresentation(value: unknown): value is RegisteredRepresentation {
  if (!value || typeof value !== "object") return false;
  const kind = (value as { readonly kind?: unknown }).kind;
  return kind === "registered-rigid-mesh" || kind === "registered-gaussian-splat";
}
