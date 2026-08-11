import type {
  GaussianSplatObservationRepresentation,
  Vec3,
} from "../kernel/types";
import { deepFreeze } from "../kernel/world";

const LOCAL_TRANSFORM = {
  position: [0, 0, 0] as const,
  rotation: {
    x: Math.SQRT1_2,
    y: 0,
    z: 0,
    w: Math.SQRT1_2,
  },
  scale: [1, 1, 1] as const,
};

export const DIAGNOSTIC_GAUSSIAN_SPLAT_ASSET = deepFreeze({
  assetId: "asset:diagnostic-wedge-3dgs-v1" as const,
  role: "observation" as const,
  format: "ply" as const,
  mediaType: "model/vnd.ply" as const,
  repoPath: "packages/world/assets/diagnostic-wedge-3dgs-v1.ply" as const,
  contentDigest: "sha256:7654a8ef7282452ea75da7e1b6c1ec1e98dbd5333e32339a1911b827b5add754" as const,
  byteLength: 115_153,
  splatCount: 2_048,
  provenance: {
    origin: "generated-in-repo" as const,
    generator: "scripts/generate-diagnostic-wedge-ply.mjs" as const,
    seed: 3_540_605_463,
    license: "CC0-1.0" as const,
  },
  sourceFrameRef: "frame:gltf-y-up" as const,
  sourceUnitMeters: 1,
  sourceCenterBoundsMeters: {
    min: [-0.32, -0.25, -0.22] as const,
    max: [0.32, 0.25, 0.22] as const,
  },
  localTransform: LOCAL_TRANSFORM,
  expectedEntityLocalBoundsMeters: {
    min: [-0.32, -0.22, -0.25] as const,
    max: [0.32, 0.22, 0.25] as const,
  },
  collisionProxyBoundsMeters: {
    min: [-0.32, -0.22, -0.25] as const,
    max: [0.32, 0.22, 0.25] as const,
  },
  alignmentToleranceMeters: 0.001,
} as const);

function sameVec(left: Vec3, right: Vec3): boolean {
  return left[0] === right[0] && left[1] === right[1] && left[2] === right[2];
}

export function requireDiagnosticGaussianSplatObservation(
  observation: GaussianSplatObservationRepresentation,
): void {
  const expected = DIAGNOSTIC_GAUSSIAN_SPLAT_ASSET;
  if (
    observation.kind !== "gaussian-splat" ||
    observation.role !== expected.role ||
    observation.assetId !== expected.assetId ||
    observation.contentDigest !== expected.contentDigest ||
    observation.sourceFrameRef !== expected.sourceFrameRef ||
    observation.sourceUnitMeters !== expected.sourceUnitMeters
  ) {
    throw new Error("3DGS observation 与 repo-owned artifact identity 不一致");
  }

  const transform = observation.localTransform;
  if (
    !sameVec(transform.position, expected.localTransform.position) ||
    !sameVec(transform.scale, expected.localTransform.scale) ||
    transform.scale[0] !== transform.scale[1] ||
    transform.scale[1] !== transform.scale[2] ||
    transform.rotation.x !== expected.localTransform.rotation.x ||
    transform.rotation.y !== expected.localTransform.rotation.y ||
    transform.rotation.z !== expected.localTransform.rotation.z ||
    transform.rotation.w !== expected.localTransform.rotation.w
  ) {
    throw new Error("3DGS observation 与登记 alignment transform 不一致");
  }
}

export function createDiagnosticGaussianSplatObservation(): GaussianSplatObservationRepresentation {
  const asset = DIAGNOSTIC_GAUSSIAN_SPLAT_ASSET;
  return deepFreeze({
    kind: "gaussian-splat" as const,
    role: asset.role,
    assetId: asset.assetId,
    contentDigest: asset.contentDigest,
    sourceFrameRef: asset.sourceFrameRef,
    sourceUnitMeters: asset.sourceUnitMeters,
    localTransform: asset.localTransform,
  }) as GaussianSplatObservationRepresentation;
}
