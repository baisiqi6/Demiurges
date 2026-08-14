import {
  MARBLE_HUNYUAN_MANIFEST_DIGEST,
  MARBLE_HUNYUAN_REGISTRY,
  type CalibrationRecord,
  type FloorContactWitness,
  type HunyuanContainmentWitness,
  type ManifestAssetEntry,
  type MarbleBoundsWitness,
  type RegisteredAssetObservationRepresentation,
  type RegisteredAssetVisualRepresentation,
} from "@demiurges/world";

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
  if (
    !asset ||
    !calibration ||
    !witness ||
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
