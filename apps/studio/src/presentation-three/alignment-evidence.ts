import {
  DIAGNOSTIC_GAUSSIAN_SPLAT_ASSET,
  deepFreeze,
  requireDiagnosticGaussianSplatObservation,
  type Entity,
  type GaussianSplatObservationRepresentation,
} from "@demiurges/world";

export interface Bounds3 {
  readonly min: readonly [number, number, number];
  readonly max: readonly [number, number, number];
}

export interface AlignmentEvidence {
  readonly entityRef: Entity["ref"];
  readonly observationAssetId: GaussianSplatObservationRepresentation["assetId"];
  readonly contentDigest: GaussianSplatObservationRepresentation["contentDigest"];
  readonly sourceFrameRef: GaussianSplatObservationRepresentation["sourceFrameRef"];
  readonly sourceUnitMeters: number;
  readonly observedEntityLocalBounds: Bounds3;
  readonly expectedEntityLocalBounds: Bounds3;
  readonly collisionProxyBounds: Bounds3;
  readonly maxBoundsErrorMeters: number;
  readonly poseTranslationErrorMeters: number;
  readonly poseAngularErrorRadians: number;
  readonly toleranceMeters: number;
  readonly passed: boolean;
}

interface PoseValue {
  readonly position: readonly [number, number, number];
  readonly rotation: { readonly x: number; readonly y: number; readonly z: number; readonly w: number };
}

function isFiniteOrderedBounds(bounds: Bounds3): boolean {
  if (
    !Array.isArray(bounds.min) ||
    !Array.isArray(bounds.max) ||
    bounds.min.length !== 3 ||
    bounds.max.length !== 3
  ) {
    return false;
  }
  for (let axis = 0; axis < 3; axis += 1) {
    if (
      !Object.hasOwn(bounds.min, axis) ||
      !Object.hasOwn(bounds.max, axis) ||
      !Number.isFinite(bounds.min[axis]) ||
      !Number.isFinite(bounds.max[axis]) ||
      bounds.min[axis]! > bounds.max[axis]!
    ) {
      return false;
    }
  }
  return true;
}

function isValidPose(pose: PoseValue): boolean {
  const values = [
    ...pose.position,
    pose.rotation.x,
    pose.rotation.y,
    pose.rotation.z,
    pose.rotation.w,
  ];
  return values.every(Number.isFinite) &&
    Math.abs(Math.hypot(
      pose.rotation.x,
      pose.rotation.y,
      pose.rotation.z,
      pose.rotation.w,
    ) - 1) <= 1e-9;
}

function rotate(
  point: readonly [number, number, number],
  rotation: PoseValue["rotation"],
): [number, number, number] {
  const [x, y, z] = point;
  const tx = 2 * (rotation.y * z - rotation.z * y);
  const ty = 2 * (rotation.z * x - rotation.x * z);
  const tz = 2 * (rotation.x * y - rotation.y * x);
  return [
    x + rotation.w * tx + rotation.y * tz - rotation.z * ty,
    y + rotation.w * ty + rotation.z * tx - rotation.x * tz,
    z + rotation.w * tz + rotation.x * ty - rotation.y * tx,
  ];
}

function transformBounds(
  bounds: Bounds3,
  observation: GaussianSplatObservationRepresentation,
): Bounds3 {
  const result = {
    min: [Infinity, Infinity, Infinity] as [number, number, number],
    max: [-Infinity, -Infinity, -Infinity] as [number, number, number],
  };
  const transform = observation.localTransform;
  for (const x of [bounds.min[0], bounds.max[0]]) {
    for (const y of [bounds.min[1], bounds.max[1]]) {
      for (const z of [bounds.min[2], bounds.max[2]]) {
        const rotated = rotate([
          x * transform.scale[0] * observation.sourceUnitMeters,
          y * transform.scale[1] * observation.sourceUnitMeters,
          z * transform.scale[2] * observation.sourceUnitMeters,
        ], transform.rotation);
        for (let axis = 0; axis < 3; axis += 1) {
          const value = rotated[axis]! + transform.position[axis]!;
          result.min[axis] = Math.min(result.min[axis], value);
          result.max[axis] = Math.max(result.max[axis], value);
        }
      }
    }
  }
  return result;
}

function boundsError(left: Bounds3, right: Bounds3): number {
  return Math.max(
    ...left.min.map((value, axis) => Math.abs(value - right.min[axis]!)),
    ...left.max.map((value, axis) => Math.abs(value - right.max[axis]!)),
  );
}

function poseError(left: PoseValue, right: PoseValue): {
  translation: number;
  angle: number;
} {
  if (!isValidPose(left) || !isValidPose(right)) {
    return { translation: Infinity, angle: Infinity };
  }
  const translation = Math.hypot(
    left.position[0] - right.position[0],
    left.position[1] - right.position[1],
    left.position[2] - right.position[2],
  );
  const dot = Math.abs(
    left.rotation.x * right.rotation.x +
    left.rotation.y * right.rotation.y +
    left.rotation.z * right.rotation.z +
    left.rotation.w * right.rotation.w,
  );
  return {
    translation,
    angle: 2 * Math.acos(Math.min(1, Math.max(0, dot))),
  };
}

export function createAlignmentEvidence(
  entityRef: Entity["ref"],
  observation: GaussianSplatObservationRepresentation,
  observedSourceBounds: Bounds3,
  authoritativePose: PoseValue,
  presentationPose: PoseValue,
): AlignmentEvidence {
  const asset = DIAGNOSTIC_GAUSSIAN_SPLAT_ASSET;
  let observationValid = true;
  try {
    requireDiagnosticGaussianSplatObservation(observation);
  } catch {
    observationValid = false;
  }
  const boundsValid = observationValid && isFiniteOrderedBounds(observedSourceBounds);
  const observedEntityLocalBounds = boundsValid
    ? transformBounds(observedSourceBounds, observation)
    : {
        min: [NaN, NaN, NaN] as const,
        max: [NaN, NaN, NaN] as const,
      };
  const expectedEntityLocalBounds = asset.expectedEntityLocalBoundsMeters;
  const collisionProxyBounds = asset.collisionProxyBoundsMeters;
  const maxBoundsErrorMeters = boundsValid
    ? Math.max(
        boundsError(observedEntityLocalBounds, expectedEntityLocalBounds),
        boundsError(expectedEntityLocalBounds, collisionProxyBounds),
      )
    : Infinity;
  const pose = poseError(authoritativePose, presentationPose);
  const values = [
    maxBoundsErrorMeters,
    pose.translation,
    pose.angle,
  ];
  const passed = values.every(Number.isFinite) &&
    maxBoundsErrorMeters <= asset.alignmentToleranceMeters &&
    pose.translation <= 1e-9 &&
    pose.angle <= 1e-9;

  return deepFreeze({
    entityRef,
    observationAssetId: observation.assetId,
    contentDigest: observation.contentDigest,
    sourceFrameRef: observation.sourceFrameRef,
    sourceUnitMeters: observation.sourceUnitMeters,
    observedEntityLocalBounds,
    expectedEntityLocalBounds,
    collisionProxyBounds,
    maxBoundsErrorMeters,
    poseTranslationErrorMeters: pose.translation,
    poseAngularErrorRadians: pose.angle,
    toleranceMeters: asset.alignmentToleranceMeters,
    passed,
  }) as AlignmentEvidence;
}
