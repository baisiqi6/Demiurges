import {
  BALL_VESSEL_ASSET,
  DIAGNOSTIC_RIGID_ASSET,
  deepFreeze,
  type ImportedRigidMeshRepresentation,
} from "@demiurges/world";

const DIAGNOSTIC_RIGID_ASSET_URL = new URL(
  "../../../../packages/world/assets/diagnostic-wedge-v1.glb",
  import.meta.url,
).href;
const BALL_VESSEL_ASSET_URL = new URL(
  "../../../../packages/world/assets/smooth-vessel-v1.glb",
  import.meta.url,
).href;

export interface PresentationAsset {
  readonly assetId: ImportedRigidMeshRepresentation["assetId"];
  readonly contentDigest: ImportedRigidMeshRepresentation["contentDigest"];
  readonly url: string;
  readonly repoPath: string;
  readonly provenance: {
    readonly origin: string;
    readonly generator: string;
    readonly license: string;
  };
  readonly alignmentToleranceMeters?: number;
}

const REGISTERED_PRESENTATION_ASSETS = deepFreeze([
  {
    assetId: DIAGNOSTIC_RIGID_ASSET.assetId,
    contentDigest: DIAGNOSTIC_RIGID_ASSET.contentDigest,
    url: DIAGNOSTIC_RIGID_ASSET_URL,
    repoPath: DIAGNOSTIC_RIGID_ASSET.repoPath,
    provenance: DIAGNOSTIC_RIGID_ASSET.provenance,
    alignmentToleranceMeters: DIAGNOSTIC_RIGID_ASSET.alignment.toleranceMeters,
  },
  {
    assetId: BALL_VESSEL_ASSET.assetId,
    contentDigest: BALL_VESSEL_ASSET.contentDigest,
    url: BALL_VESSEL_ASSET_URL,
    repoPath: BALL_VESSEL_ASSET.repoPath,
    provenance: BALL_VESSEL_ASSET.provenance,
  },
] as const) as readonly PresentationAsset[];

export function resolveImportedVisualAsset(
  visual: ImportedRigidMeshRepresentation,
): PresentationAsset {
  const asset = REGISTERED_PRESENTATION_ASSETS.find(
    (candidate) =>
      candidate.assetId === visual.assetId &&
      candidate.contentDigest === visual.contentDigest,
  );
  if (!asset) throw new Error(`未登记 imported visual：${visual.assetId}`);
  return asset;
}
