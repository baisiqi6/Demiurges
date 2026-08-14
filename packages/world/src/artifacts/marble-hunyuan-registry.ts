import type { Vec3 } from "../kernel/types";
import { canonicalJsonBytes, sha256Hex } from "../kernel/canonical-json";
import { deepFreeze } from "../kernel/world";

export const TRANSFORM_RECOMPUTE_EPSILON = 1e-12;

const DIGEST_PATTERN = /^[a-f0-9]{64}$/;
const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const AXIS_SOURCES = ["+source.x", "-source.x", "+source.y", "-source.y", "+source.z", "-source.z"] as const;

export interface Bounds3 {
  readonly min: Vec3;
  readonly max: Vec3;
}

export interface ManifestAssetEntry {
  readonly assetId: `asset:${string}`;
  readonly provider: string;
  readonly resourceId: string;
  readonly resolution?: "500k";
  readonly format: "spz-v2" | "glb-2.0";
  readonly elementCount: number;
  readonly byteLength: number;
  readonly digest: string;
  readonly sourceBounds: Bounds3;
  readonly distributionPolicy: "unknown-restricted-local";
}

export interface CalibrationEvidence {
  readonly artifactId: `asset:${string}`;
  readonly artifactDigest: string;
  readonly method: string;
  readonly truthLevel: string;
}

export interface CalibrationRecord {
  readonly id: `calibration:${string}`;
  readonly status: "authored-unverified";
  readonly method: string;
  readonly sourceFrameRef: string;
  readonly targetFrameRef: string;
  readonly sourceHandedness: "right" | "left";
  readonly targetHandedness: "right" | "left";
  readonly axisMap: readonly [string, string, string];
  readonly determinant: 1 | -1;
  readonly sourceUnitMeters: number;
  readonly targetUnitMeters: number;
  readonly quaternionConvention: string;
  readonly rotation: readonly [number, number, number, number];
  readonly translation: Vec3;
  readonly uniformScale: number;
  readonly sourceBounds: Bounds3;
  readonly targetBounds: Bounds3;
  readonly integrityToleranceMeters: number;
  readonly evidence: CalibrationEvidence;
}

export interface WitnessSide {
  readonly assetId: `asset:${string}`;
  readonly artifactDigest: string;
  readonly calibrationId: `calibration:${string}`;
}

export interface MarbleBoundsWitness {
  readonly id: `witness:${string}`;
  readonly kind: "artifact-bounds-alignment-v1";
  readonly left: WitnessSide;
  readonly right: WitnessSide;
  readonly metric: "max-abs-aabb-face-delta-meters";
  readonly faceDeltas: readonly [number, number, number, number, number, number];
  readonly measured: number;
  readonly tolerance: number;
  readonly passed: boolean;
  readonly truthLevel: string;
}

export interface BoxProxyReference {
  readonly entityRef: string;
  readonly kind: "box";
  readonly center: Vec3;
  readonly halfExtents: Vec3;
}

export interface HunyuanContainmentWitness {
  readonly id: `witness:${string}`;
  readonly kind: "mesh-proxy-aabb-containment-v1";
  readonly source: WitnessSide;
  readonly proxy: BoxProxyReference;
  readonly metric: "max-abs-aabb-containment-error-meters";
  readonly measured: number;
  readonly tolerance: number;
  readonly passed: boolean;
  readonly truthLevel: string;
}

export interface FloorContactWitness {
  readonly id: `witness:${string}`;
  readonly kind: "authored-floor-aabb-contact-v1";
  readonly source: WitnessSide & { readonly calibratedMinZ: number };
  readonly proxy: BoxProxyReference & { readonly topZ: number };
  readonly metric: "abs-calibrated-min-z-minus-proxy-top-z-meters";
  readonly measured: number;
  readonly tolerance: number;
  readonly passed: boolean;
  readonly truthLevel: string;
}

export interface MarbleHunyuanRegistry {
  readonly assets: readonly [ManifestAssetEntry, ManifestAssetEntry, ManifestAssetEntry];
  readonly calibrations: readonly [CalibrationRecord, CalibrationRecord, CalibrationRecord];
  readonly witnesses: readonly [
    MarbleBoundsWitness,
    HunyuanContainmentWitness,
    FloorContactWitness,
  ];
}

// Frozen physics proxy constants：Hunyuan box proxy 与 authored floor proxy。
export const GENERATED_OBJECT_PROXY = deepFreeze({
  center: [0, 0, 0],
  halfExtents: [0.39742499589920044, 0.3973826045317581, 0.39708911126088414],
} as const);

export const FLOOR_PROXY = deepFreeze({
  center: [0, 0, -0.05],
  halfExtents: [1.4802459478378296, 2.5527453422546387, 0.05],
  topZ: 0,
} as const);

const MARBLE_HUNYUAN_REGISTRY_LITERAL = {
  assets: [
    {
      assetId: "asset:marble-world-500k-spz-v1",
      provider: "worldlabs-marble-v1",
      resourceId: "7ece758a-aea5-42a0-890d-303d6bbab9b0",
      resolution: "500k",
      format: "spz-v2",
      elementCount: 497_664,
      byteLength: 5_163_264,
      digest: "3fc704ff2b5a2f6cc6bf8f5efb179ac30904ba6af3ee2da6b5aa1e2148577cb5",
      sourceBounds: {
        min: [-1.187255859375, -1.81494140625, -2.52490234375],
        max: [1.823486328125, 0.875732421875, 2.66748046875],
      },
      distributionPolicy: "unknown-restricted-local",
    },
    {
      assetId: "asset:marble-world-collider-v1",
      provider: "worldlabs-marble-v1",
      resourceId: "7ece758a-aea5-42a0-890d-303d6bbab9b0",
      format: "glb-2.0",
      elementCount: 1,
      byteLength: 7_719_136,
      digest: "6a5b26afe07afb057ea8872281966c1605b3ae3f06b0418081586a393c710e24",
      sourceBounds: {
        min: [-1.1668531894683838, -1.8059593439102173, -2.471714496612549],
        max: [1.7936387062072754, 0.7732045650482178, 2.6337761878967285],
      },
      distributionPolicy: "unknown-restricted-local",
    },
    {
      assetId: "asset:hunyuan-rounded-cube-v1",
      provider: "hunyuan-ai3d-v1",
      resourceId: "1479369951965601792",
      format: "glb-2.0",
      elementCount: 1,
      byteLength: 21_383_672,
      digest: "ad65fee536bfaf3b3efc889b71302be1002d2688b423b3a292a1e72b0a08b7d5",
      sourceBounds: {
        min: [-0.3981949985027313, -5.3308758703680866e-8, -0.3980010388589447],
        max: [0.39665499329566956, 0.7941781692130095, 0.39676417020457155],
      },
      distributionPolicy: "unknown-restricted-local",
    },
  ],
  calibrations: [
    {
      id: "calibration:marble-spz-v1",
      status: "authored-unverified",
      method: "operator-authored-axis-map-and-aabb-grounding-v1",
      sourceFrameRef: "frame:worldlabs-opencv-x-left-y-down-z-forward",
      targetFrameRef: "frame:world-z-up",
      sourceHandedness: "right",
      targetHandedness: "right",
      axisMap: ["+source.x", "+source.z", "-source.y"],
      determinant: 1,
      sourceUnitMeters: 1,
      targetUnitMeters: 1,
      quaternionConvention: "xyzw-active-right-handed-w-nonnegative",
      rotation: [-0.7071067811865475, 0, 0, 0.7071067811865476],
      translation: [-0.3133927583694458, -0.08103084564208984, 0.7732045650482178],
      uniformScale: 1,
      sourceBounds: {
        min: [-1.187255859375, -1.81494140625, -2.52490234375],
        max: [1.823486328125, 0.875732421875, 2.66748046875],
      },
      targetBounds: {
        min: [-1.5006486177444458, -2.60593318939209, -0.10252785682678223],
        max: [1.5100935697555542, 2.58644962310791, 2.5881459712982178],
      },
      integrityToleranceMeters: 0.000001,
      evidence: {
        artifactId: "asset:marble-world-500k-spz-v1",
        artifactDigest: "3fc704ff2b5a2f6cc6bf8f5efb179ac30904ba6af3ee2da6b5aa1e2148577cb5",
        method: "decoded-spz-v2-centers-v1",
        truthLevel: "artifact-derived-bounds-only",
      },
    },
    {
      id: "calibration:marble-collider-v1",
      status: "authored-unverified",
      method: "operator-authored-axis-map-and-aabb-grounding-v1",
      sourceFrameRef: "frame:worldlabs-opencv-x-left-y-down-z-forward",
      targetFrameRef: "frame:world-z-up",
      sourceHandedness: "right",
      targetHandedness: "right",
      axisMap: ["+source.x", "+source.z", "-source.y"],
      determinant: 1,
      sourceUnitMeters: 1,
      targetUnitMeters: 1,
      quaternionConvention: "xyzw-active-right-handed-w-nonnegative",
      rotation: [-0.7071067811865475, 0, 0, 0.7071067811865476],
      translation: [-0.3133927583694458, -0.08103084564208984, 0.7732045650482178],
      uniformScale: 1,
      sourceBounds: {
        min: [-1.1668531894683838, -1.8059593439102173, -2.471714496612549],
        max: [1.7936387062072754, 0.7732045650482178, 2.6337761878967285],
      },
      targetBounds: {
        min: [-1.4802459478378296, -2.5527453422546387, 0],
        max: [1.4802459478378296, 2.5527453422546387, 2.579163908958435],
      },
      integrityToleranceMeters: 0.000001,
      evidence: {
        artifactId: "asset:marble-world-collider-v1",
        artifactDigest: "6a5b26afe07afb057ea8872281966c1605b3ae3f06b0418081586a393c710e24",
        method: "decoded-glb-position-accessor-node-transform-v1",
        truthLevel: "artifact-derived-bounds-only",
      },
    },
    {
      id: "calibration:hunyuan-glb-v1",
      status: "authored-unverified",
      method: "operator-authored-axis-map-and-aabb-centering-v1",
      sourceFrameRef: "frame:gltf-right-handed-y-up",
      targetFrameRef: "frame:world-z-up",
      sourceHandedness: "right",
      targetHandedness: "right",
      axisMap: ["+source.x", "-source.z", "+source.y"],
      determinant: 1,
      sourceUnitMeters: 1,
      targetUnitMeters: 1,
      quaternionConvention: "xyzw-active-right-handed-w-nonnegative",
      rotation: [0.7071067811865475, 0, 0, 0.7071067811865476],
      translation: [0.0007700026035308838, -0.0006184343271865844, -0.3970890579521254],
      uniformScale: 1,
      sourceBounds: {
        min: [-0.3981949985027313, -5.3308758703680866e-8, -0.3980010388589447],
        max: [0.39665499329566956, 0.7941781692130095, 0.39676417020457155],
      },
      targetBounds: {
        min: [-0.39742499589920044, -0.3973826045317581, -0.3970891112608841],
        max: [0.39742499589920044, 0.3973826045317581, 0.39708911126088414],
      },
      integrityToleranceMeters: 0.000001,
      evidence: {
        artifactId: "asset:hunyuan-rounded-cube-v1",
        artifactDigest: "ad65fee536bfaf3b3efc889b71302be1002d2688b423b3a292a1e72b0a08b7d5",
        method: "decoded-glb-position-accessor-node-transform-v1",
        truthLevel: "artifact-derived-bounds-only",
      },
    },
  ],
  witnesses: [
    {
      id: "witness:marble-spz-collider-bounds-v1",
      kind: "artifact-bounds-alignment-v1",
      left: {
        assetId: "asset:marble-world-500k-spz-v1",
        artifactDigest: "3fc704ff2b5a2f6cc6bf8f5efb179ac30904ba6af3ee2da6b5aa1e2148577cb5",
        calibrationId: "calibration:marble-spz-v1",
      },
      right: {
        assetId: "asset:marble-world-collider-v1",
        artifactDigest: "6a5b26afe07afb057ea8872281966c1605b3ae3f06b0418081586a393c710e24",
        calibrationId: "calibration:marble-collider-v1",
      },
      metric: "max-abs-aabb-face-delta-meters",
      faceDeltas: [
        0.02040266990661621,
        0.05318784713745117,
        0.10252785682678223,
        0.02984762191772461,
        0.033704280853271484,
        0.008982062339782715,
      ],
      measured: 0.10252785682678223,
      tolerance: 0.12,
      passed: true,
      truthLevel: "authored-unverified",
    },
    {
      id: "witness:hunyuan-glb-box-proxy-v1",
      kind: "mesh-proxy-aabb-containment-v1",
      source: {
        assetId: "asset:hunyuan-rounded-cube-v1",
        artifactDigest: "ad65fee536bfaf3b3efc889b71302be1002d2688b423b3a292a1e72b0a08b7d5",
        calibrationId: "calibration:hunyuan-glb-v1",
      },
      proxy: {
        entityRef: "entity:generated-object",
        kind: "box",
        center: [0, 0, 0],
        halfExtents: [0.39742499589920044, 0.3973826045317581, 0.39708911126088414],
      },
      metric: "max-abs-aabb-containment-error-meters",
      measured: 5.551115123125783e-17,
      tolerance: 0.000001,
      passed: true,
      truthLevel: "authored-unverified",
    },
    {
      id: "witness:marble-collider-authored-floor-v1",
      kind: "authored-floor-aabb-contact-v1",
      source: {
        assetId: "asset:marble-world-collider-v1",
        artifactDigest: "6a5b26afe07afb057ea8872281966c1605b3ae3f06b0418081586a393c710e24",
        calibrationId: "calibration:marble-collider-v1",
        calibratedMinZ: 0,
      },
      proxy: {
        entityRef: "entity:floor",
        kind: "box",
        center: [0, 0, -0.05],
        halfExtents: [1.4802459478378296, 2.5527453422546387, 0.05],
        topZ: 0,
      },
      metric: "abs-calibrated-min-z-minus-proxy-top-z-meters",
      measured: 0,
      tolerance: 0.000001,
      passed: true,
      truthLevel: "authored-aabb-floor-unverified",
    },
  ],
} as const satisfies MarbleHunyuanRegistry;

export const MARBLE_HUNYUAN_REGISTRY = deepFreeze(MARBLE_HUNYUAN_REGISTRY_LITERAL);
export const MARBLE_HUNYUAN_MANIFEST_DIGEST =
  `sha256:${sha256Hex(canonicalJsonBytes(MARBLE_HUNYUAN_REGISTRY))}` as const;

type DataRecord = Readonly<Record<string, unknown>>;

function exactRecord(value: unknown, label: string, keys: readonly string[]): DataRecord {
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Object.prototype
  ) {
    throw new Error(`${label} 必须是 plain JSON data record`);
  }
  const ownKeys = Reflect.ownKeys(value);
  if (
    ownKeys.length !== keys.length ||
    ownKeys.some((key) => typeof key !== "string" || !keys.includes(key)) ||
    keys.some((key) => !ownKeys.includes(key))
  ) {
    throw new Error(`${label} 字段必须恰好为 ${keys.join(", ") || "<none>"}`);
  }
  const result: Record<string, unknown> = {};
  for (const key of keys) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) {
      throw new Error(`${label} 必须是 enumerable own data record`);
    }
    result[key] = descriptor.value;
  }
  return result;
}

function denseArray(value: unknown, label: string, length: number): readonly unknown[] {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype || value.length !== length) {
    throw new Error(`${label} 必须是恰好 ${length} 项 dense array`);
  }
  const expectedKeys = new Set<PropertyKey>([
    ...Array.from({ length }, (_, index) => String(index)),
    "length",
  ]);
  const ownKeys = Reflect.ownKeys(value);
  if (
    ownKeys.length !== expectedKeys.size ||
    ownKeys.some((key) => !expectedKeys.has(key))
  ) {
    throw new Error(`${label} 只能包含 dense indices 与 length`);
  }
  for (let index = 0; index < length; index += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) {
      throw new Error(`${label} 只能包含 dense index`);
    }
  }
  const lengthDescriptor = Object.getOwnPropertyDescriptor(value, "length");
  if (
    !lengthDescriptor ||
    !("value" in lengthDescriptor) ||
    lengthDescriptor.value !== length
  ) {
    throw new Error(`${label}.length 必须是 own data property`);
  }
  return Array.from({ length }, (_, index) => {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    return (descriptor as PropertyDescriptor).value;
  });
}

function finite(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || Object.is(value, -0)) {
    throw new Error(`${label} 必须是 finite number`);
  }
  return value;
}

function nonNegative(value: unknown, label: string): number {
  const result = finite(value, label);
  if (result < 0) throw new Error(`${label} 不能为负数`);
  return result;
}

function positive(value: unknown, label: string): number {
  const result = finite(value, label);
  if (result <= 0) throw new Error(`${label} 必须为正数`);
  return result;
}

function id(value: unknown, prefix: string, label: string): string {
  if (
    typeof value !== "string" ||
    !value.startsWith(prefix) ||
    !ID_PATTERN.test(value.slice(prefix.length))
  ) {
    throw new Error(`${label} 格式非法`);
  }
  return value;
}

function digest(value: unknown, label: string): string {
  if (typeof value !== "string" || !DIGEST_PATTERN.test(value)) {
    throw new Error(`${label} 必须是 64 位 hex digest`);
  }
  return value;
}

function vec3(value: unknown, label: string): Vec3 {
  const values = denseArray(value, label, 3);
  return values.map((component, axis) => finite(component, `${label}[${axis}]`)) as unknown as Vec3;
}

function bounds(value: unknown, label: string): Bounds3 {
  const record = exactRecord(value, label, ["min", "max"]);
  const min = vec3(record.min, `${label}.min`);
  const max = vec3(record.max, `${label}.max`);
  for (let axis = 0; axis < 3; axis += 1) {
    if (min[axis]! > max[axis]!) throw new Error(`${label} min/max 顺序非法`);
  }
  return { min, max };
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

function quaternionMatrix(rotation: readonly [number, number, number, number]): number[][] {
  const [x, y, z, w] = rotation;
  return [
    [1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)],
    [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)],
    [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)],
  ];
}

function closeEnough(actual: number, expected: number, label: string): void {
  if (Math.abs(actual - expected) > TRANSFORM_RECOMPUTE_EPSILON) {
    throw new Error(`${label} 派生值漂移超出 TRANSFORM_RECOMPUTE_EPSILON`);
  }
}

function parseAssetEntry(value: unknown, label: string, expectResolution: boolean): ManifestAssetEntry {
  const keys = expectResolution
    ? ["assetId", "provider", "resourceId", "resolution", "format", "elementCount", "byteLength", "digest", "sourceBounds", "distributionPolicy"]
    : ["assetId", "provider", "resourceId", "format", "elementCount", "byteLength", "digest", "sourceBounds", "distributionPolicy"];
  const record = exactRecord(value, label, keys);
  id(record.assetId, "asset:", `${label}.assetId`);
  if (typeof record.provider !== "string" || record.provider.length === 0) {
    throw new Error(`${label}.provider 非法`);
  }
  if (typeof record.resourceId !== "string" || record.resourceId.length === 0) {
    throw new Error(`${label}.resourceId 非法`);
  }
  if (expectResolution && record.resolution !== "500k") {
    throw new Error(`${label}.resolution 非法`);
  }
  if (record.format !== "spz-v2" && record.format !== "glb-2.0") {
    throw new Error(`${label}.format 非法`);
  }
  if (!Number.isSafeInteger(record.elementCount) || (record.elementCount as number) <= 0) {
    throw new Error(`${label}.elementCount 非法`);
  }
  if (!Number.isSafeInteger(record.byteLength) || (record.byteLength as number) <= 0) {
    throw new Error(`${label}.byteLength 非法`);
  }
  digest(record.digest, `${label}.digest`);
  bounds(record.sourceBounds, `${label}.sourceBounds`);
  if (record.distributionPolicy !== "unknown-restricted-local") {
    throw new Error(`${label}.distributionPolicy 必须为 unknown-restricted-local`);
  }
  return record as unknown as ManifestAssetEntry;
}

function parseAxisMap(value: unknown, label: string): readonly [string, string, string] {
  const entries = denseArray(value, label, 3) as [unknown, unknown, unknown];
  const map = entries.map((entry, axis) => {
    if (typeof entry !== "string" || !AXIS_SOURCES.includes(entry as (typeof AXIS_SOURCES)[number])) {
      throw new Error(`${label}[${axis}] 必须是 signed source axis`);
    }
    return entry;
  });
  const sourceAxes = new Set(map.map((entry) => entry.slice("-source.".length)));
  if (sourceAxes.size !== 3) throw new Error(`${label} 必须覆盖三个不同 source axis`);
  return map as unknown as readonly [string, string, string];
}

function parseCalibration(value: unknown, label: string, expectedId: string): CalibrationRecord {
  const record = exactRecord(value, label, [
    "id", "status", "method", "sourceFrameRef", "targetFrameRef",
    "sourceHandedness", "targetHandedness", "axisMap", "determinant",
    "sourceUnitMeters", "targetUnitMeters", "quaternionConvention",
    "rotation", "translation", "uniformScale", "sourceBounds", "targetBounds",
    "integrityToleranceMeters", "evidence",
  ]);
  if (record.id !== expectedId) throw new Error(`${label}.id 与 registry 顺序漂移`);
  if (record.status !== "authored-unverified") throw new Error(`${label}.status 非法`);
  if (typeof record.method !== "string" || record.method.length === 0) throw new Error(`${label}.method 非法`);
  if (typeof record.sourceFrameRef !== "string" || !record.sourceFrameRef.startsWith("frame:")) {
    throw new Error(`${label}.sourceFrameRef 非法`);
  }
  if (record.targetFrameRef !== "frame:world-z-up") throw new Error(`${label}.targetFrameRef 非法`);
  if (record.sourceHandedness !== "right" || record.targetHandedness !== "right") {
    throw new Error(`${label}.handedness 必须为 right`);
  }
  const axisMap = parseAxisMap(record.axisMap, `${label}.axisMap`);
  if (record.determinant !== 1) throw new Error(`${label}.determinant 必须为 +1`);
  positive(record.sourceUnitMeters, `${label}.sourceUnitMeters`);
  positive(record.targetUnitMeters, `${label}.targetUnitMeters`);
  if (record.quaternionConvention !== "xyzw-active-right-handed-w-nonnegative") {
    throw new Error(`${label}.quaternionConvention 非法`);
  }
  const rotation = denseArray(record.rotation, `${label}.rotation`, 4).map((component, axis) =>
    finite(component, `${label}.rotation[${axis}]`)) as unknown as [number, number, number, number];
  const norm = Math.hypot(...rotation);
  if (Math.abs(norm - 1) > TRANSFORM_RECOMPUTE_EPSILON) {
    throw new Error(`${label}.rotation 必须是单位 quaternion`);
  }
  if (rotation[3]! < 0) throw new Error(`${label}.rotation.w 必须 nonnegative`);
  const translation = vec3(record.translation, `${label}.translation`);
  const uniformScale = positive(record.uniformScale, `${label}.uniformScale`);
  const sourceBounds = bounds(record.sourceBounds, `${label}.sourceBounds`);
  const targetBounds = bounds(record.targetBounds, `${label}.targetBounds`);
  nonNegative(record.integrityToleranceMeters, `${label}.integrityToleranceMeters`);
  const evidence = exactRecord(record.evidence, `${label}.evidence`, [
    "artifactId", "artifactDigest", "method", "truthLevel",
  ]);
  id(evidence.artifactId, "asset:", `${label}.evidence.artifactId`);
  digest(evidence.artifactDigest, `${label}.evidence.artifactDigest`);
  if (typeof evidence.method !== "string" || evidence.method.length === 0) {
    throw new Error(`${label}.evidence.method 非法`);
  }
  if (typeof evidence.truthLevel !== "string" || evidence.truthLevel.length === 0) {
    throw new Error(`${label}.evidence.truthLevel 非法`);
  }

  // quaternion ↔ axisMap ↔ matrix 互相重算一致
  const matrix = quaternionMatrix(rotation);
  for (let targetAxis = 0; targetAxis < 3; targetAxis += 1) {
    const entry = axisMap[targetAxis]!;
    const sign = entry.startsWith("-") ? -1 : 1;
    const sourceAxis = "xyz".indexOf(entry.slice("-source.".length));
    if (sourceAxis < 0) throw new Error(`${label}.axisMap 非法`);
    for (let candidate = 0; candidate < 3; candidate += 1) {
      const expected = candidate === sourceAxis ? sign : 0;
      closeEnough(
        matrix[targetAxis]![candidate]!,
        expected,
        `${label} axisMap/quaternion 重算`,
      );
    }
  }

  // targetBounds 由 sourceBounds + transform 重算
  const [smin, smax] = [sourceBounds.min, sourceBounds.max];
  const corners: Vec3[] = [];
  for (const x of [smin[0]!, smax[0]!]) {
    for (const y of [smin[1]!, smax[1]!]) {
      for (const z of [smin[2]!, smax[2]!]) {
        corners.push([x, y, z]);
      }
    }
  }
  const recomputedMin = [Infinity, Infinity, Infinity];
  const recomputedMax = [-Infinity, -Infinity, -Infinity];
  for (const corner of corners) {
    for (let targetAxis = 0; targetAxis < 3; targetAxis += 1) {
      const rotated = matrix[targetAxis]![0]! * corner[0]! * uniformScale +
        matrix[targetAxis]![1]! * corner[1]! * uniformScale +
        matrix[targetAxis]![2]! * corner[2]! * uniformScale;
      const mapped = rotated + translation[targetAxis]!;
      recomputedMin[targetAxis] = Math.min(recomputedMin[targetAxis]!, mapped);
      recomputedMax[targetAxis] = Math.max(recomputedMax[targetAxis]!, mapped);
    }
  }
  for (let axis = 0; axis < 3; axis += 1) {
    closeEnough(recomputedMin[axis]!, targetBounds.min[axis]!, `${label}.targetBounds.min[${axis}] 重算`);
    closeEnough(recomputedMax[axis]!, targetBounds.max[axis]!, `${label}.targetBounds.max[${axis}] 重算`);
  }
  return record as unknown as CalibrationRecord;
}

function parseWitnessSide(value: unknown, label: string): WitnessSide {
  const record = exactRecord(value, label, ["assetId", "artifactDigest", "calibrationId"]);
  id(record.assetId, "asset:", `${label}.assetId`);
  digest(record.artifactDigest, `${label}.artifactDigest`);
  id(record.calibrationId, "calibration:", `${label}.calibrationId`);
  return record as unknown as WitnessSide;
}

function requireResolvedSide(
  side: WitnessSide,
  assets: readonly ManifestAssetEntry[],
  calibrations: readonly CalibrationRecord[],
  label: string,
): { asset: ManifestAssetEntry; calibration: CalibrationRecord } {
  const asset = assets.find((candidate) =>
    candidate.assetId === side.assetId && candidate.digest === side.artifactDigest);
  if (!asset) throw new Error(`${label} asset identity 与 manifest 漂移`);
  const calibration = calibrations.find((candidate) => candidate.id === side.calibrationId);
  if (!calibration) throw new Error(`${label} calibrationId 未在 registry 登记`);
  if (calibration.evidence.artifactId !== side.assetId ||
      calibration.evidence.artifactDigest !== side.artifactDigest) {
    throw new Error(`${label} calibration evidence 与 asset identity 漂移`);
  }
  return { asset, calibration };
}

function requireSameFrozenTransform(
  left: CalibrationRecord,
  right: CalibrationRecord,
  label: string,
): void {
  const shared: Array<[string, unknown, unknown]> = [
    ["sourceFrameRef", left.sourceFrameRef, right.sourceFrameRef],
    ["targetFrameRef", left.targetFrameRef, right.targetFrameRef],
    ["sourceHandedness", left.sourceHandedness, right.sourceHandedness],
    ["targetHandedness", left.targetHandedness, right.targetHandedness],
    ["sourceUnitMeters", left.sourceUnitMeters, right.sourceUnitMeters],
    ["targetUnitMeters", left.targetUnitMeters, right.targetUnitMeters],
    ["quaternionConvention", left.quaternionConvention, right.quaternionConvention],
    ["uniformScale", left.uniformScale, right.uniformScale],
  ];
  for (const [field, leftValue, rightValue] of shared) {
    if (!Object.is(leftValue, rightValue)) {
      throw new Error(`${label} 两条 calibration 的 ${field} 必须 exact 相同`);
    }
  }
  for (let axis = 0; axis < 3; axis += 1) {
    if (left.axisMap[axis] !== right.axisMap[axis]) {
      throw new Error(`${label} 两条 calibration 的 axisMap[${axis}] 必须 exact 相同`);
    }
  }
  for (let index = 0; index < 4; index += 1) {
    if (!Object.is(left.rotation[index], right.rotation[index])) {
      throw new Error(`${label} 两条 calibration 的 rotation[${index}] 必须 exact 相同`);
    }
  }
  for (let axis = 0; axis < 3; axis += 1) {
    if (!Object.is(left.translation[axis], right.translation[axis])) {
      throw new Error(`${label} 两条 calibration 的 translation[${axis}] 必须 exact 相同`);
    }
  }
}

function requireRegistrySelfConsistency(registry: MarbleHunyuanRegistry): void {
  const { assets, calibrations, witnesses } = registry;

  // manifest ↔ calibration evidence closure
  for (const calibration of calibrations) {
    const asset = assets.find((candidate) =>
      candidate.assetId === calibration.evidence.artifactId &&
      candidate.digest === calibration.evidence.artifactDigest);
    if (!asset) throw new Error(`${calibration.id} evidence 与 manifest 漂移`);
  }

  const marbleWitness = witnesses[0];
  const hunyuanWitness = witnesses[1];
  const floorWitness = witnesses[2];

  // Marble SPZ ↔ collider bounds witness
  {
    if (marbleWitness.kind !== "artifact-bounds-alignment-v1" ||
        marbleWitness.metric !== "max-abs-aabb-face-delta-meters") {
      throw new Error("marble bounds witness kind/metric 非法");
    }
    const left = requireResolvedSide(marbleWitness.left, assets, calibrations, "marble witness left");
    const right = requireResolvedSide(marbleWitness.right, assets, calibrations, "marble witness right");
    if (left.calibration.id !== "calibration:marble-spz-v1" ||
        right.calibration.id !== "calibration:marble-collider-v1") {
      throw new Error("marble witness calibration pair 与 registry 顺序漂移");
    }
    requireSameFrozenTransform(left.calibration, right.calibration, "marble witness");

    const recomputedDeltas: number[] = [];
    for (let axis = 0; axis < 3; axis += 1) {
      recomputedDeltas.push(Math.abs(
        left.calibration.targetBounds.min[axis]! - right.calibration.targetBounds.min[axis]!));
    }
    for (let axis = 0; axis < 3; axis += 1) {
      recomputedDeltas.push(Math.abs(
        left.calibration.targetBounds.max[axis]! - right.calibration.targetBounds.max[axis]!));
    }
    for (let index = 0; index < 6; index += 1) {
      closeEnough(recomputedDeltas[index]!, marbleWitness.faceDeltas[index]!, `marble witness faceDeltas[${index}] 重算`);
    }
    const recomputedMeasured = Math.max(...recomputedDeltas);
    closeEnough(recomputedMeasured, marbleWitness.measured, "marble witness measured 重算");
    const recomputedPassed = recomputedMeasured <= marbleWitness.tolerance;
    if (recomputedPassed !== marbleWitness.passed) {
      throw new Error("marble witness passed 与重算结果不一致");
    }
  }

  // Hunyuan GLB ↔ box proxy containment witness
  {
    if (hunyuanWitness.kind !== "mesh-proxy-aabb-containment-v1" ||
        hunyuanWitness.metric !== "max-abs-aabb-containment-error-meters") {
      throw new Error("hunyuan containment witness kind/metric 非法");
    }
    const source = requireResolvedSide(hunyuanWitness.source, assets, calibrations, "hunyuan witness source");
    if (source.calibration.id !== "calibration:hunyuan-glb-v1") {
      throw new Error("hunyuan witness calibration 与 registry 顺序漂移");
    }
    const proxy = hunyuanWitness.proxy;
    if (proxy.entityRef !== "entity:generated-object" || proxy.kind !== "box") {
      throw new Error("hunyuan proxy entityRef/kind 与 frozen proxy 漂移");
    }
    for (let axis = 0; axis < 3; axis += 1) {
      if (proxy.center[axis] !== GENERATED_OBJECT_PROXY.center[axis]) {
        throw new Error("hunyuan proxy center 与 frozen proxy 漂移");
      }
      if (proxy.halfExtents[axis] !== GENERATED_OBJECT_PROXY.halfExtents[axis]) {
        throw new Error("hunyuan proxy halfExtents 与 frozen proxy 漂移");
      }
    }
    const target = source.calibration.targetBounds;
    const errors: number[] = [];
    for (let axis = 0; axis < 3; axis += 1) {
      errors.push(Math.abs(target.min[axis]! - proxy.center[axis]! + proxy.halfExtents[axis]!));
      errors.push(Math.abs(target.max[axis]! - proxy.center[axis]! - proxy.halfExtents[axis]!));
    }
    const recomputedMeasured = Math.max(...errors);
    closeEnough(recomputedMeasured, hunyuanWitness.measured, "hunyuan witness measured 重算");
    if ((recomputedMeasured <= hunyuanWitness.tolerance) !== hunyuanWitness.passed) {
      throw new Error("hunyuan witness passed 与重算结果不一致");
    }
  }

  // Marble collider ↔ authored floor contact witness
  {
    if (floorWitness.kind !== "authored-floor-aabb-contact-v1" ||
        floorWitness.metric !== "abs-calibrated-min-z-minus-proxy-top-z-meters") {
      throw new Error("floor contact witness kind/metric 非法");
    }
    const source = requireResolvedSide(floorWitness.source, assets, calibrations, "floor witness source");
    if (source.calibration.id !== "calibration:marble-collider-v1") {
      throw new Error("floor witness calibration 与 registry 顺序漂移");
    }
    closeEnough(
      source.calibration.targetBounds.min[2]!,
      floorWitness.source.calibratedMinZ,
      "floor witness calibratedMinZ 重算",
    );
    const proxy = floorWitness.proxy;
    if (proxy.entityRef !== "entity:floor" || proxy.kind !== "box") {
      throw new Error("floor proxy entityRef/kind 与 frozen proxy 漂移");
    }
    for (let axis = 0; axis < 3; axis += 1) {
      if (proxy.center[axis] !== FLOOR_PROXY.center[axis]) {
        throw new Error("floor proxy center 与 frozen proxy 漂移");
      }
      if (proxy.halfExtents[axis] !== FLOOR_PROXY.halfExtents[axis]) {
        throw new Error("floor proxy halfExtents 与 frozen proxy 漂移");
      }
    }
    if (proxy.topZ !== FLOOR_PROXY.topZ) {
      throw new Error("floor proxy topZ 与 frozen proxy 漂移");
    }
    if (proxy.topZ !== proxy.center[2]! + proxy.halfExtents[2]!) {
      throw new Error("floor proxy topZ 与 center/halfExtents 不一致");
    }
    const recomputedMeasured = Math.abs(
      floorWitness.source.calibratedMinZ - proxy.topZ);
    closeEnough(recomputedMeasured, floorWitness.measured, "floor witness measured 重算");
    if ((recomputedMeasured <= floorWitness.tolerance) !== floorWitness.passed) {
      throw new Error("floor witness passed 与重算结果不一致");
    }
  }
}

function parseRegistryStructure(value: unknown): MarbleHunyuanRegistry {
  const registry = exactRecord(value, "provider registry", ["assets", "calibrations", "witnesses"]);
  const assets = denseArray(registry.assets, "registry.assets", 3).map((entry, index) =>
    parseAssetEntry(entry, `registry.assets[${index}]`, index === 0));
  const expectedCalibrationIds = [
    "calibration:marble-spz-v1",
    "calibration:marble-collider-v1",
    "calibration:hunyuan-glb-v1",
  ] as const;
  const calibrations = denseArray(registry.calibrations, "registry.calibrations", 3).map(
    (entry, index) => parseCalibration(entry, `registry.calibrations[${index}]`, expectedCalibrationIds[index]!),
  );
  const witnessRecords = denseArray(registry.witnesses, "registry.witnesses", 3);

  const marbleWitnessRecord = exactRecord(witnessRecords[0], "registry.witnesses[0]", [
    "id", "kind", "left", "right", "metric", "faceDeltas", "measured", "tolerance", "passed", "truthLevel",
  ]);
  if (marbleWitnessRecord.id !== "witness:marble-spz-collider-bounds-v1") {
    throw new Error("registry.witnesses[0].id 与 registry 顺序漂移");
  }
  const marbleFaceDeltas = denseArray(marbleWitnessRecord.faceDeltas, "marble faceDeltas", 6).map(
    (component, index) => nonNegative(component, `marble faceDeltas[${index}]`));
  nonNegative(marbleWitnessRecord.measured, "marble measured");
  nonNegative(marbleWitnessRecord.tolerance, "marble tolerance");
  if (typeof marbleWitnessRecord.passed !== "boolean") throw new Error("marble passed 非法");
  if (typeof marbleWitnessRecord.truthLevel !== "string" || marbleWitnessRecord.truthLevel.length === 0) {
    throw new Error("marble truthLevel 非法");
  }

  const hunyuanWitnessRecord = exactRecord(witnessRecords[1], "registry.witnesses[1]", [
    "id", "kind", "source", "proxy", "metric", "measured", "tolerance", "passed", "truthLevel",
  ]);
  if (hunyuanWitnessRecord.id !== "witness:hunyuan-glb-box-proxy-v1") {
    throw new Error("registry.witnesses[1].id 与 registry 顺序漂移");
  }
  const hunyuanProxy = exactRecord(hunyuanWitnessRecord.proxy, "hunyuan proxy", [
    "entityRef", "kind", "center", "halfExtents",
  ]);
  if (typeof hunyuanProxy.entityRef !== "string" || !hunyuanProxy.entityRef.startsWith("entity:")) {
    throw new Error("hunyuan proxy.entityRef 非法");
  }
  if (hunyuanProxy.kind !== "box") throw new Error("hunyuan proxy.kind 非法");
  vec3(hunyuanProxy.center, "hunyuan proxy.center");
  vec3(hunyuanProxy.halfExtents, "hunyuan proxy.halfExtents");
  nonNegative(hunyuanWitnessRecord.measured, "hunyuan measured");
  nonNegative(hunyuanWitnessRecord.tolerance, "hunyuan tolerance");
  if (typeof hunyuanWitnessRecord.passed !== "boolean") throw new Error("hunyuan passed 非法");
  if (typeof hunyuanWitnessRecord.truthLevel !== "string" || hunyuanWitnessRecord.truthLevel.length === 0) {
    throw new Error("hunyuan truthLevel 非法");
  }

  const floorWitnessRecord = exactRecord(witnessRecords[2], "registry.witnesses[2]", [
    "id", "kind", "source", "proxy", "metric", "measured", "tolerance", "passed", "truthLevel",
  ]);
  if (floorWitnessRecord.id !== "witness:marble-collider-authored-floor-v1") {
    throw new Error("registry.witnesses[2].id 与 registry 顺序漂移");
  }
  const floorSource = exactRecord(floorWitnessRecord.source, "floor witness source", [
    "assetId", "artifactDigest", "calibrationId", "calibratedMinZ",
  ]);
  finite(floorSource.calibratedMinZ, "floor calibratedMinZ");
  const floorProxy = exactRecord(floorWitnessRecord.proxy, "floor proxy", [
    "entityRef", "kind", "center", "halfExtents", "topZ",
  ]);
  if (typeof floorProxy.entityRef !== "string" || !floorProxy.entityRef.startsWith("entity:")) {
    throw new Error("floor proxy.entityRef 非法");
  }
  if (floorProxy.kind !== "box") throw new Error("floor proxy.kind 非法");
  vec3(floorProxy.center, "floor proxy.center");
  vec3(floorProxy.halfExtents, "floor proxy.halfExtents");
  finite(floorProxy.topZ, "floor proxy.topZ");
  nonNegative(floorWitnessRecord.measured, "floor measured");
  nonNegative(floorWitnessRecord.tolerance, "floor tolerance");
  if (typeof floorWitnessRecord.passed !== "boolean") throw new Error("floor passed 非法");
  if (typeof floorWitnessRecord.truthLevel !== "string" || floorWitnessRecord.truthLevel.length === 0) {
    throw new Error("floor truthLevel 非法");
  }

  const parsed = {
    assets: assets as [ManifestAssetEntry, ManifestAssetEntry, ManifestAssetEntry],
    calibrations: calibrations as [CalibrationRecord, CalibrationRecord, CalibrationRecord],
    witnesses: [
      {
        ...marbleWitnessRecord,
        faceDeltas: marbleFaceDeltas,
        left: parseWitnessSide(marbleWitnessRecord.left, "marble left"),
        right: parseWitnessSide(marbleWitnessRecord.right, "marble right"),
      },
      {
        ...hunyuanWitnessRecord,
        source: parseWitnessSide(hunyuanWitnessRecord.source, "hunyuan source"),
        proxy: hunyuanProxy,
      },
      {
        ...floorWitnessRecord,
        source: floorSource,
        proxy: floorProxy,
      },
    ],
  } as unknown as MarbleHunyuanRegistry;
  return parsed;
}

export function requireMarbleHunyuanRegistrySelfConsistency(value: unknown): void {
  requireRegistrySelfConsistency(parseRegistryStructure(value));
}

export function requireMarbleHunyuanRegistryIntegrity(value: unknown): void {
  const parsed = parseRegistryStructure(value);
  requireRegistrySelfConsistency(parsed);
  if (!samePlainData(parsed, MARBLE_HUNYUAN_REGISTRY)) {
    throw new Error("provider registry 与 frozen canonical manifest 漂移");
  }
}

requireMarbleHunyuanRegistryIntegrity(MARBLE_HUNYUAN_REGISTRY);
