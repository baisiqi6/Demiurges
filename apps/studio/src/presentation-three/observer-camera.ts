export type ObserverMode = "overview" | "inspect" | "explore";
export type Vec3 = readonly [number, number, number];

export interface CameraPose {
  readonly position: Vec3;
  readonly target: Vec3;
}

export interface Bounds3 {
  readonly min: Vec3;
  readonly max: Vec3;
}

export interface CameraEnvelope {
  readonly near: number;
  readonly far: number;
  readonly fogNear: number;
  readonly fogFar: number;
  readonly minDistance: number;
  readonly maxDistance: number;
}

export interface FitBoundsResult {
  readonly pose: CameraPose;
  readonly bounds: Bounds3;
  readonly center: Vec3;
  readonly radius: number;
  readonly envelope: CameraEnvelope;
}

export interface MovementIntent {
  readonly forward: number;
  readonly right: number;
  readonly up: number;
  readonly accelerated: boolean;
}

export interface ObserverBoundsCandidates {
  readonly registered?: Bounds3;
  readonly loadedDigest?: Bounds3;
  readonly primitiveOrCollision?: Bounds3;
  readonly fallbackPosition: Vec3;
}

export interface ResolvedObserverBounds {
  readonly bounds: Bounds3;
  readonly provenance:
    | "registered"
    | "derived-from-loaded-digest"
    | "primitive-or-collision"
    | "authored-fallback";
}

export const FALLBACK_WORLD_BOUNDS: Bounds3 = Object.freeze({
  min: Object.freeze([-1.5, -1.5, -0.1]) as Vec3,
  max: Object.freeze([1.5, 1.5, 2.1]) as Vec3,
});

const EPSILON = 1e-6;
const MIN_EXTENT = 0.05;
const DEFAULT_FORWARD: Vec3 = Object.freeze([0, 1, 0]) as Vec3;

function finite(value: number): boolean {
  return Number.isFinite(value);
}

export function isFiniteVec3(value: readonly number[]): value is Vec3 {
  return Array.isArray(value) && value.length === 3 &&
    [0, 1, 2].every((index) => Object.hasOwn(value, index) && finite(value[index]!));
}

export function isFinitePose(pose: CameraPose): boolean {
  return isFiniteVec3(pose.position) && isFiniteVec3(pose.target) &&
    distance(pose.position, pose.target) > EPSILON;
}

export function normalizeBounds(value: Bounds3 | undefined): Bounds3 | undefined {
  const ordered = finiteOrderedBounds(value);
  if (!ordered || [0, 1, 2].some(
    (axis) => ordered.max[axis]! - ordered.min[axis]! <= EPSILON,
  )) return undefined;
  return ordered;
}

function finiteOrderedBounds(value: Bounds3 | undefined): Bounds3 | undefined {
  if (!value || !isFiniteVec3(value.min) || !isFiniteVec3(value.max)) return undefined;
  if (value.min.some((entry, axis) => entry > value.max[axis]!)) return undefined;
  return {
    min: [value.min[0], value.min[1], value.min[2]],
    max: [value.max[0], value.max[1], value.max[2]],
  };
}

export function unionBounds(values: readonly (Bounds3 | undefined)[]): Bounds3 | undefined {
  const valid = values.map(normalizeBounds).filter((value): value is Bounds3 => value !== undefined);
  if (valid.length === 0) return undefined;
  return {
    min: [
      Math.min(...valid.map((value) => value.min[0])),
      Math.min(...valid.map((value) => value.min[1])),
      Math.min(...valid.map((value) => value.min[2])),
    ],
    max: [
      Math.max(...valid.map((value) => value.max[0])),
      Math.max(...valid.map((value) => value.max[1])),
      Math.max(...valid.map((value) => value.max[2])),
    ],
  };
}

export function resolveObserverBounds(
  candidates: ObserverBoundsCandidates,
): ResolvedObserverBounds {
  for (const [provenance, candidate] of [
    ["registered", candidates.registered],
    ["derived-from-loaded-digest", candidates.loadedDigest],
    ["primitive-or-collision", candidates.primitiveOrCollision],
  ] as const) {
    const bounds = normalizeBounds(candidate);
    if (bounds) return { bounds, provenance };
  }
  return {
    bounds: boundsFromCenterHalfExtents(
      isFiniteVec3(candidates.fallbackPosition) ? candidates.fallbackPosition : [0, 0, 0],
      [0.15, 0.15, 0.15],
    )!,
    provenance: "authored-fallback",
  };
}

export function boundsFromCenterHalfExtents(center: Vec3, halfExtents: Vec3): Bounds3 | undefined {
  if (!isFiniteVec3(center) || !isFiniteVec3(halfExtents) || halfExtents.some((value) => value < 0)) {
    return undefined;
  }
  return {
    min: [center[0] - halfExtents[0], center[1] - halfExtents[1], center[2] - halfExtents[2]],
    max: [center[0] + halfExtents[0], center[1] + halfExtents[1], center[2] + halfExtents[2]],
  };
}

export function transformBounds(
  bounds: Bounds3,
  position: Vec3,
  rotation: Readonly<{ x: number; y: number; z: number; w: number }>,
): Bounds3 | undefined {
  const normalized = finiteOrderedBounds(bounds);
  const quaternion = [rotation.x, rotation.y, rotation.z, rotation.w] as const;
  if (!normalized || !isFiniteVec3(position) || !quaternion.every(finite)) return undefined;
  const length = Math.hypot(...quaternion);
  if (length <= EPSILON) return undefined;
  const [qx, qy, qz, qw] = quaternion.map((value) => value / length) as [number, number, number, number];
  const corners: Vec3[] = [];
  for (const x of [normalized.min[0], normalized.max[0]]) {
    for (const y of [normalized.min[1], normalized.max[1]]) {
      for (const z of [normalized.min[2], normalized.max[2]]) {
        const ix = qw * x + qy * z - qz * y;
        const iy = qw * y + qz * x - qx * z;
        const iz = qw * z + qx * y - qy * x;
        const iw = -qx * x - qy * y - qz * z;
        corners.push([
          ix * qw + iw * -qx + iy * -qz - iz * -qy + position[0],
          iy * qw + iw * -qy + iz * -qx - ix * -qz + position[1],
          iz * qw + iw * -qz + ix * -qy - iy * -qx + position[2],
        ]);
      }
    }
  }
  return {
    min: [
      Math.min(...corners.map((corner) => corner[0])),
      Math.min(...corners.map((corner) => corner[1])),
      Math.min(...corners.map((corner) => corner[2])),
    ],
    max: [
      Math.max(...corners.map((corner) => corner[0])),
      Math.max(...corners.map((corner) => corner[1])),
      Math.max(...corners.map((corner) => corner[2])),
    ],
  };
}

export function boundsContains(bounds: Bounds3, point: Vec3): boolean {
  const valid = normalizeBounds(bounds);
  return valid !== undefined && isFiniteVec3(point) && point.every(
    (value, axis) => value >= valid.min[axis]! && value <= valid.max[axis]!,
  );
}

export function fitBounds(
  candidate: Bounds3 | undefined,
  aspect: number,
  verticalFovDegrees = 42,
  margin = 1.28,
): FitBoundsResult {
  const source = normalizeBounds(candidate) ?? FALLBACK_WORLD_BOUNDS;
  const center: Vec3 = [
    (source.min[0] + source.max[0]) / 2,
    (source.min[1] + source.max[1]) / 2,
    (source.min[2] + source.max[2]) / 2,
  ];
  const extents: Vec3 = [
    Math.max(source.max[0] - source.min[0], MIN_EXTENT),
    Math.max(source.max[1] - source.min[1], MIN_EXTENT),
    Math.max(source.max[2] - source.min[2], MIN_EXTENT),
  ];
  const bounds: Bounds3 = {
    min: [
      source.max[0] - source.min[0] >= MIN_EXTENT ? source.min[0] : center[0] - extents[0] / 2,
      source.max[1] - source.min[1] >= MIN_EXTENT ? source.min[1] : center[1] - extents[1] / 2,
      source.max[2] - source.min[2] >= MIN_EXTENT ? source.min[2] : center[2] - extents[2] / 2,
    ],
    max: [
      source.max[0] - source.min[0] >= MIN_EXTENT ? source.max[0] : center[0] + extents[0] / 2,
      source.max[1] - source.min[1] >= MIN_EXTENT ? source.max[1] : center[1] + extents[1] / 2,
      source.max[2] - source.min[2] >= MIN_EXTENT ? source.max[2] : center[2] + extents[2] / 2,
    ],
  };
  const radius = Math.max(Math.hypot(extents[0], extents[1], extents[2]) / 2, MIN_EXTENT);
  const verticalFov = Math.max(verticalFovDegrees, 1) * Math.PI / 180;
  const safeAspect = finite(aspect) && aspect > EPSILON ? aspect : 1;
  const horizontalFov = 2 * Math.atan(Math.tan(verticalFov / 2) * safeAspect);
  const limitingHalfFov = Math.max(Math.min(verticalFov, horizontalFov) / 2, 0.01);
  const distanceFromCenter = radius * Math.max(margin, 1) / Math.sin(limitingHalfFov);
  const direction = normalize([1, -1.15, 0.72], [1, -1, 0.65]);
  const position: Vec3 = [
    center[0] + direction[0] * distanceFromCenter,
    center[1] + direction[1] * distanceFromCenter,
    center[2] + direction[2] * distanceFromCenter,
  ];
  const near = Math.max(0.005, Math.min(0.1, radius / 500));
  const far = Math.max(near + 1, distanceFromCenter + radius * 4);
  return {
    pose: { position, target: center },
    bounds,
    center,
    radius,
    envelope: {
      near,
      far,
      fogNear: Math.max(radius * 2, distanceFromCenter + radius * 0.8),
      fogFar: Math.max(radius * 4, distanceFromCenter + radius * 3),
      minDistance: Math.max(0.05, radius * 0.08),
      maxDistance: Math.max(radius * 8, distanceFromCenter + radius * 3),
    },
  };
}

export function moveZUp(
  pose: CameraPose,
  intent: MovementIntent,
  flySpeed: number,
  deltaSeconds: number,
  previousForward: Vec3 = DEFAULT_FORWARD,
): { readonly pose: CameraPose; readonly forward: Vec3; readonly changed: boolean } {
  if (!isFinitePose(pose)) return { pose, forward: DEFAULT_FORWARD, changed: false };
  const horizontal = [pose.target[0] - pose.position[0], pose.target[1] - pose.position[1], 0] as Vec3;
  const forward = Math.hypot(horizontal[0], horizontal[1]) > EPSILON
    ? normalize(horizontal, previousForward)
    : normalize(previousForward, DEFAULT_FORWARD);
  const right: Vec3 = [forward[1], -forward[0], 0];
  const direction: Vec3 = [
    forward[0] * intent.forward + right[0] * intent.right,
    forward[1] * intent.forward + right[1] * intent.right,
    intent.up,
  ];
  const magnitude = Math.hypot(...direction);
  const dt = Math.min(Math.max(deltaSeconds, 0), 0.05);
  const speed = Math.max(0, finite(flySpeed) ? flySpeed : 0) * (intent.accelerated ? 3 : 1);
  if (magnitude <= EPSILON || dt === 0 || speed === 0) return { pose, forward, changed: false };
  const scale = speed * dt / magnitude;
  const offset: Vec3 = [direction[0] * scale, direction[1] * scale, direction[2] * scale];
  return {
    pose: {
      position: add(pose.position, offset),
      target: add(pose.target, offset),
    },
    forward,
    changed: true,
  };
}

export function rotateZUp(pose: CameraPose, yawDelta: number, pitchDelta: number): CameraPose {
  if (!isFinitePose(pose) || !finite(yawDelta) || !finite(pitchDelta)) return pose;
  const direction = subtract(pose.target, pose.position);
  const length = Math.max(Math.hypot(...direction), 1);
  const normalized = normalize(direction, DEFAULT_FORWARD);
  const yaw = Math.atan2(normalized[1], normalized[0]) + yawDelta;
  const pitch = Math.min(Math.max(Math.asin(Math.max(-1, Math.min(1, normalized[2]))) + pitchDelta, -1.48), 1.48);
  const horizontal = Math.cos(pitch);
  const nextDirection: Vec3 = [
    Math.cos(yaw) * horizontal * length,
    Math.sin(yaw) * horizontal * length,
    Math.sin(pitch) * length,
  ];
  return { position: pose.position, target: add(pose.position, nextDirection) };
}

export function boundaryWarning(bounds: Bounds3 | undefined, position: Vec3): "inside" | "near" | "unknown" {
  const valid = normalizeBounds(bounds);
  if (!valid || !isFiniteVec3(position)) return "unknown";
  if (!boundsContains(valid, position)) return "unknown";
  const extent = valid.max.map((value, axis) => value - valid.min[axis]!) as [number, number, number];
  const threshold = Math.max(Math.min(...extent.filter((value) => value > EPSILON)) * 0.08, 0.08);
  return position.some((value, axis) =>
    value - valid.min[axis]! <= threshold || valid.max[axis]! - value <= threshold)
    ? "near"
    : "inside";
}

export function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  return Boolean(target.closest("input, textarea, select, button, a, [contenteditable]:not([contenteditable='false'])"));
}

export function cameraKeyAdmission(input: Readonly<{
  viewportFocused: boolean;
  pointerOwned: boolean;
  editableTarget: boolean;
}>): boolean {
  return !input.editableTarget && (input.viewportFocused || input.pointerOwned);
}

export function poseDataset(pose: CameraPose): string {
  return [...pose.position, ...pose.target].map((value) => Number(value.toFixed(6))).join(",");
}

export function interpolatePose(from: CameraPose, to: CameraPose, progress: number): CameraPose {
  const t = Math.min(Math.max(progress, 0), 1);
  if (t === 0) return from;
  if (t === 1) return to;
  const eased = 1 - Math.pow(1 - t, 3);
  return {
    position: lerpVec(from.position, to.position, eased),
    target: lerpVec(from.target, to.target, eased),
  };
}

function add(left: Vec3, right: Vec3): Vec3 {
  return [left[0] + right[0], left[1] + right[1], left[2] + right[2]];
}

function subtract(left: Vec3, right: Vec3): Vec3 {
  return [left[0] - right[0], left[1] - right[1], left[2] - right[2]];
}

function distance(left: Vec3, right: Vec3): number {
  return Math.hypot(left[0] - right[0], left[1] - right[1], left[2] - right[2]);
}

function normalize(value: Vec3, fallback: Vec3): Vec3 {
  const length = Math.hypot(...value);
  return length > EPSILON
    ? [value[0] / length, value[1] / length, value[2] / length]
    : fallback;
}

function lerpVec(from: Vec3, to: Vec3, t: number): Vec3 {
  return [
    from[0] + (to[0] - from[0]) * t,
    from[1] + (to[1] - from[1]) * t,
    from[2] + (to[2] - from[2]) * t,
  ];
}
