import { createHash } from "node:crypto";
import { gunzipSync } from "node:zlib";

import type {
  Bounds3,
  ManifestAssetEntry,
} from "../packages/world/src/artifacts/marble-hunyuan-registry";

const GLB_MAGIC = 0x46546c67;
const GLB_JSON_CHUNK = 0x4e4f534a;
const GLB_BIN_CHUNK = 0x004e4942;
const MAX_GLB_JSON_BYTES = 256 * 1024;
const SPZ_MAGIC = 1_347_635_022;
const SPZ_HEADER_BYTES = 16;
const BOUNDS_EPSILON = 1e-6;
const MAX_SPZ_DECOMPRESSED_BYTES = 64 * 1024 * 1024;

type Mat4 = readonly number[];
type Vec3Tuple = readonly [number, number, number];

export interface VerifiedArtifactIdentity {
  readonly assetId: ManifestAssetEntry["assetId"];
  readonly digest: string;
  readonly byteLength: number;
  readonly elementCount: number;
  readonly sourceBounds: Bounds3;
}

export interface InspectedArtifactBytes {
  readonly format: ManifestAssetEntry["format"];
  readonly digest: string;
  readonly byteLength: number;
  readonly elementCount: number;
  readonly sourceBounds: Bounds3;
}

function finiteNumber(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${label} 必须是 finite number`);
  }
  return value;
}

function finiteVec3(value: unknown, label: string): Vec3Tuple {
  if (!Array.isArray(value) || value.length !== 3) {
    throw new Error(`${label} 必须是 Vec3`);
  }
  return [
    finiteNumber(value[0], `${label}[0]`),
    finiteNumber(value[1], `${label}[1]`),
    finiteNumber(value[2], `${label}[2]`),
  ];
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Object.prototype
  ) {
    throw new Error(`${label} 必须是 plain record`);
  }
  return value as Record<string, unknown>;
}

function array(value: unknown, label: string): readonly unknown[] {
  if (!Array.isArray(value)) throw new Error(`${label} 必须是 array`);
  return value;
}

function requireEmbeddedGlbResources(value: unknown): void {
  if (Array.isArray(value)) {
    for (const item of value) requireEmbeddedGlbResources(item);
    return;
  }
  if (typeof value !== "object" || value === null) return;
  for (const [key, child] of Object.entries(value)) {
    if (key === "uri") throw new Error("GLB 不允许 external/data URI resource");
    requireEmbeddedGlbResources(child);
  }
}

function sameBounds(actual: Bounds3, expected: Bounds3, label: string): void {
  for (const side of ["min", "max"] as const) {
    for (let axis = 0; axis < 3; axis += 1) {
      if (Math.abs(actual[side][axis] - expected[side][axis]) > BOUNDS_EPSILON) {
        throw new Error(`${label} decoded bounds 与 manifest 不一致`);
      }
    }
  }
}

function decodeSignedInt24(bytes: Uint8Array, offset: number): number {
  let value = bytes[offset]! | bytes[offset + 1]! << 8 | bytes[offset + 2]! << 16;
  if ((value & 0x80_0000) !== 0) value -= 0x100_0000;
  return value;
}

function decodeSpzIdentity(bytes: Uint8Array): {
  readonly elementCount: number;
  readonly sourceBounds: Bounds3;
} {
  let decoded: Uint8Array;
  try {
    decoded = gunzipSync(bytes, { maxOutputLength: MAX_SPZ_DECOMPRESSED_BYTES });
  } catch {
    throw new Error("SPZ gzip payload 非法或超出解压预算");
  }
  if (decoded.byteLength < SPZ_HEADER_BYTES) throw new Error("SPZ header 截断");
  const header = new DataView(decoded.buffer, decoded.byteOffset, SPZ_HEADER_BYTES);
  if (header.getUint32(0, true) !== SPZ_MAGIC) throw new Error("SPZ magic 非法");
  if (header.getUint32(4, true) !== 2) throw new Error("SPZ version 必须为 2");
  const elementCount = header.getUint32(8, true);
  const shDegree = header.getUint8(12);
  const fractionalBits = header.getUint8(13);
  const flags = header.getUint8(14);
  const reserved = header.getUint8(15);
  if (elementCount === 0 || shDegree > 3 || fractionalBits > 23 || flags !== 0 || reserved !== 0) {
    throw new Error("SPZ v2 header identity 非法");
  }
  const centerBytes = elementCount * 9;
  const shBytesPerElement = shDegree === 0 ? 0 : shDegree === 1 ? 9 : shDegree === 2 ? 24 : 45;
  const bytesPerElement = 19 + shBytesPerElement;
  const expectedBytes = SPZ_HEADER_BYTES + elementCount * bytesPerElement;
  if (
    !Number.isSafeInteger(centerBytes) ||
    !Number.isSafeInteger(expectedBytes) ||
    decoded.byteLength !== expectedBytes
  ) {
    throw new Error("SPZ v2 payload layout 不完整");
  }
  const fixed = 2 ** fractionalBits;
  const min = [Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY];
  const max = [Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY];
  for (let index = 0; index < elementCount; index += 1) {
    const base = SPZ_HEADER_BYTES + index * 9;
    for (let axis = 0; axis < 3; axis += 1) {
      const value = decodeSignedInt24(decoded, base + axis * 3) / fixed;
      if (!Number.isFinite(value)) throw new Error("SPZ center 包含非有限数值");
      min[axis] = Math.min(min[axis]!, value);
      max[axis] = Math.max(max[axis]!, value);
    }
  }
  return {
    elementCount,
    sourceBounds: {
      min: min as [number, number, number],
      max: max as [number, number, number],
    },
  };
}

function identityMatrix(): number[] {
  return [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
}

function multiplyMatrix(left: Mat4, right: Mat4): number[] {
  const result = new Array<number>(16).fill(0);
  for (let column = 0; column < 4; column += 1) {
    for (let row = 0; row < 4; row += 1) {
      for (let inner = 0; inner < 4; inner += 1) {
        result[column * 4 + row] += left[inner * 4 + row]! * right[column * 4 + inner]!;
      }
    }
  }
  return result;
}

function nodeMatrix(node: Record<string, unknown>, label: string): number[] {
  if (node.matrix !== undefined) {
    const values = array(node.matrix, `${label}.matrix`);
    if (values.length !== 16) throw new Error(`${label}.matrix 必须有 16 项`);
    return values.map((value, index) => finiteNumber(value, `${label}.matrix[${index}]`));
  }
  const translation = node.translation === undefined
    ? [0, 0, 0] as const
    : finiteVec3(node.translation, `${label}.translation`);
  const scale = node.scale === undefined
    ? [1, 1, 1] as const
    : finiteVec3(node.scale, `${label}.scale`);
  const rotationValues = node.rotation === undefined
    ? [0, 0, 0, 1] as const
    : array(node.rotation, `${label}.rotation`);
  if (rotationValues.length !== 4) throw new Error(`${label}.rotation 必须有 4 项`);
  const [x, y, z, w] = rotationValues.map((value, index) =>
    finiteNumber(value, `${label}.rotation[${index}]`));
  const norm = Math.hypot(x!, y!, z!, w!);
  if (Math.abs(norm - 1) > 1e-6) throw new Error(`${label}.rotation 必须是单位 quaternion`);
  return [
    (1 - 2 * (y! * y! + z! * z!)) * scale[0],
    (2 * (x! * y! + z! * w!)) * scale[0],
    (2 * (x! * z! - y! * w!)) * scale[0],
    0,
    (2 * (x! * y! - z! * w!)) * scale[1],
    (1 - 2 * (x! * x! + z! * z!)) * scale[1],
    (2 * (y! * z! + x! * w!)) * scale[1],
    0,
    (2 * (x! * z! + y! * w!)) * scale[2],
    (2 * (y! * z! - x! * w!)) * scale[2],
    (1 - 2 * (x! * x! + y! * y!)) * scale[2],
    0,
    translation[0], translation[1], translation[2], 1,
  ];
}

function transformPoint(matrix: Mat4, point: Vec3Tuple): Vec3Tuple {
  return [
    matrix[0]! * point[0] + matrix[4]! * point[1] + matrix[8]! * point[2] + matrix[12]!,
    matrix[1]! * point[0] + matrix[5]! * point[1] + matrix[9]! * point[2] + matrix[13]!,
    matrix[2]! * point[0] + matrix[6]! * point[1] + matrix[10]! * point[2] + matrix[14]!,
  ];
}

function includeTransformedBounds(
  aggregate: { min: number[]; max: number[] },
  localMin: Vec3Tuple,
  localMax: Vec3Tuple,
  matrix: Mat4,
): void {
  for (const x of [localMin[0], localMax[0]]) {
    for (const y of [localMin[1], localMax[1]]) {
      for (const z of [localMin[2], localMax[2]]) {
        const point = transformPoint(matrix, [x, y, z]);
        for (let axis = 0; axis < 3; axis += 1) {
          aggregate.min[axis] = Math.min(aggregate.min[axis]!, point[axis]);
          aggregate.max[axis] = Math.max(aggregate.max[axis]!, point[axis]);
        }
      }
    }
  }
}

function decodeGlbIdentity(bytes: Uint8Array): {
  readonly elementCount: number;
  readonly sourceBounds: Bounds3;
} {
  if (bytes.byteLength < 20) throw new Error("GLB header 截断");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint32(0, true) !== GLB_MAGIC) throw new Error("GLB magic 非法");
  if (view.getUint32(4, true) !== 2) throw new Error("GLB version 必须为 2");
  if (view.getUint32(8, true) !== bytes.byteLength) throw new Error("GLB declared length 非法");
  const jsonLength = view.getUint32(12, true);
  if (jsonLength === 0 || jsonLength > MAX_GLB_JSON_BYTES || 20 + jsonLength > bytes.byteLength) {
    throw new Error("GLB JSON chunk 长度非法");
  }
  if (view.getUint32(16, true) !== GLB_JSON_CHUNK) throw new Error("GLB 首 chunk 必须是 JSON");
  let root: Record<string, unknown>;
  try {
    const json = new TextDecoder("utf-8", { fatal: true })
      .decode(bytes.subarray(20, 20 + jsonLength))
      .replace(/[\u0000\u0020]+$/g, "");
    root = record(JSON.parse(json), "GLB JSON");
  } catch {
    throw new Error("GLB JSON 非法");
  }
  let cursor = 20 + jsonLength;
  let binaryChunk: Uint8Array | undefined;
  while (cursor < bytes.byteLength) {
    if (cursor % 4 !== 0 || cursor + 8 > bytes.byteLength) {
      throw new Error("GLB chunk table 或 trailing bytes 非法");
    }
    const chunkLength = view.getUint32(cursor, true);
    const chunkType = view.getUint32(cursor + 4, true);
    const next = cursor + 8 + chunkLength;
    if (chunkLength % 4 !== 0 || next > bytes.byteLength) {
      throw new Error("GLB chunk boundary 非法");
    }
    if (chunkType !== GLB_BIN_CHUNK || binaryChunk !== undefined) {
      throw new Error("GLB 只允许单一 JSON + BIN chunk");
    }
    binaryChunk = bytes.subarray(cursor + 8, next);
    cursor = next;
  }
  if (cursor !== bytes.byteLength || binaryChunk === undefined) {
    throw new Error("GLB BIN chunk 缺失或 trailing bytes 非法");
  }
  const asset = record(root.asset, "GLB.asset");
  if (asset.version !== "2.0") throw new Error("GLB.asset.version 必须是 2.0");
  requireEmbeddedGlbResources(root);
  const scenes = array(root.scenes, "GLB.scenes");
  const nodes = array(root.nodes, "GLB.nodes");
  const meshes = array(root.meshes, "GLB.meshes");
  const accessors = array(root.accessors, "GLB.accessors");
  const bufferViews = array(root.bufferViews, "GLB.bufferViews");
  const buffers = array(root.buffers, "GLB.buffers");
  if (buffers.length !== 1) throw new Error("GLB 必须只有一个 embedded buffer");
  const buffer = record(buffers[0], "GLB.buffers[0]");
  const bufferByteLength = finiteNumber(buffer.byteLength, "GLB.buffers[0].byteLength");
  if (
    !Number.isSafeInteger(bufferByteLength) ||
    bufferByteLength < 1 ||
    bufferByteLength > binaryChunk.byteLength ||
    binaryChunk.byteLength - bufferByteLength > 3
  ) {
    throw new Error("GLB embedded buffer length 非法");
  }
  for (const padding of binaryChunk.subarray(bufferByteLength)) {
    if (padding !== 0) throw new Error("GLB BIN padding 非法");
  }
  const sceneIndex = root.scene === undefined ? 0 : finiteNumber(root.scene, "GLB.scene");
  if (!Number.isSafeInteger(sceneIndex) || !scenes[sceneIndex]) throw new Error("GLB.scene 非法");
  const rootNodes = array(record(scenes[sceneIndex], `GLB.scenes[${sceneIndex}]`).nodes, "GLB scene nodes");
  const aggregate = {
    min: [Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY],
    max: [Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY],
  };
  let elementCount = 0;
  const active = new Set<number>();
  const visit = (value: unknown, parent: Mat4): void => {
    const index = finiteNumber(value, "GLB node index");
    if (!Number.isSafeInteger(index) || !nodes[index]) throw new Error("GLB node index 非法");
    if (active.has(index)) throw new Error("GLB node graph 含 cycle");
    active.add(index);
    const node = record(nodes[index], `GLB.nodes[${index}]`);
    const world = multiplyMatrix(parent, nodeMatrix(node, `GLB.nodes[${index}]`));
    if (node.mesh !== undefined) {
      const meshIndex = finiteNumber(node.mesh, `GLB.nodes[${index}].mesh`);
      if (!Number.isSafeInteger(meshIndex) || !meshes[meshIndex]) throw new Error("GLB mesh index 非法");
      const primitives = array(record(meshes[meshIndex], `GLB.meshes[${meshIndex}]`).primitives,
        `GLB.meshes[${meshIndex}].primitives`);
      for (let primitiveIndex = 0; primitiveIndex < primitives.length; primitiveIndex += 1) {
        const primitive = record(primitives[primitiveIndex], `GLB primitive[${primitiveIndex}]`);
        const attributes = record(primitive.attributes, `GLB primitive[${primitiveIndex}].attributes`);
        const accessorIndex = finiteNumber(attributes.POSITION, "GLB POSITION accessor");
        if (!Number.isSafeInteger(accessorIndex) || !accessors[accessorIndex]) {
          throw new Error("GLB POSITION accessor 非法");
        }
        const accessor = record(accessors[accessorIndex], `GLB.accessors[${accessorIndex}]`);
        if (
          accessor.componentType !== 5126 ||
          accessor.type !== "VEC3" ||
          accessor.sparse !== undefined ||
          accessor.normalized === true
        ) {
          throw new Error("GLB POSITION 必须是 Float32 VEC3");
        }
        const accessorCount = finiteNumber(accessor.count, "GLB POSITION count");
        const bufferViewIndex = finiteNumber(accessor.bufferView, "GLB POSITION bufferView");
        const accessorByteOffset = accessor.byteOffset === undefined
          ? 0
          : finiteNumber(accessor.byteOffset, "GLB POSITION byteOffset");
        if (
          !Number.isSafeInteger(accessorCount) || accessorCount < 1 ||
          !Number.isSafeInteger(bufferViewIndex) || !bufferViews[bufferViewIndex] ||
          !Number.isSafeInteger(accessorByteOffset) || accessorByteOffset < 0 ||
          accessorByteOffset % 4 !== 0
        ) {
          throw new Error("GLB POSITION accessor layout 非法");
        }
        const positionView = record(
          bufferViews[bufferViewIndex],
          `GLB.bufferViews[${bufferViewIndex}]`,
        );
        const viewBuffer = finiteNumber(positionView.buffer, "GLB POSITION view buffer");
        const viewByteOffset = positionView.byteOffset === undefined
          ? 0
          : finiteNumber(positionView.byteOffset, "GLB POSITION view byteOffset");
        const viewByteLength = finiteNumber(positionView.byteLength, "GLB POSITION view byteLength");
        const byteStride = positionView.byteStride === undefined
          ? 12
          : finiteNumber(positionView.byteStride, "GLB POSITION byteStride");
        if (
          viewBuffer !== 0 ||
          !Number.isSafeInteger(viewByteOffset) || viewByteOffset < 0 || viewByteOffset % 4 !== 0 ||
          !Number.isSafeInteger(viewByteLength) || viewByteLength < 12 ||
          !Number.isSafeInteger(byteStride) || byteStride < 12 || byteStride > 252 || byteStride % 4 !== 0
        ) {
          throw new Error("GLB POSITION bufferView layout 非法");
        }
        const requiredViewBytes = accessorByteOffset + (accessorCount - 1) * byteStride + 12;
        const absoluteStart = viewByteOffset + accessorByteOffset;
        if (
          !Number.isSafeInteger(requiredViewBytes) || requiredViewBytes > viewByteLength ||
          viewByteOffset + viewByteLength > bufferByteLength ||
          absoluteStart + (accessorCount - 1) * byteStride + 12 > binaryChunk.byteLength
        ) {
          throw new Error("GLB POSITION bytes 截断");
        }
        const localMinValues = [
          Number.POSITIVE_INFINITY,
          Number.POSITIVE_INFINITY,
          Number.POSITIVE_INFINITY,
        ];
        const localMaxValues = [
          Number.NEGATIVE_INFINITY,
          Number.NEGATIVE_INFINITY,
          Number.NEGATIVE_INFINITY,
        ];
        const binView = new DataView(
          binaryChunk.buffer,
          binaryChunk.byteOffset,
          binaryChunk.byteLength,
        );
        for (let vertex = 0; vertex < accessorCount; vertex += 1) {
          const base = absoluteStart + vertex * byteStride;
          for (let axis = 0; axis < 3; axis += 1) {
            const component = binView.getFloat32(base + axis * 4, true);
            if (!Number.isFinite(component)) throw new Error("GLB POSITION 包含非有限值");
            localMinValues[axis] = Math.min(localMinValues[axis]!, component);
            localMaxValues[axis] = Math.max(localMaxValues[axis]!, component);
          }
        }
        const localMin = localMinValues as [number, number, number];
        const localMax = localMaxValues as [number, number, number];
        sameBounds(
          { min: localMin, max: localMax },
          {
            min: finiteVec3(accessor.min, "GLB POSITION min"),
            max: finiteVec3(accessor.max, "GLB POSITION max"),
          },
          "GLB POSITION accessor",
        );
        includeTransformedBounds(aggregate, localMin, localMax, world);
        elementCount += 1;
      }
    }
    if (node.children !== undefined) {
      for (const child of array(node.children, `GLB.nodes[${index}].children`)) visit(child, world);
    }
    active.delete(index);
  };
  for (const node of rootNodes) visit(node, identityMatrix());
  if (elementCount === 0 || aggregate.min.some((value) => !Number.isFinite(value))) {
    throw new Error("GLB 不含可验证 POSITION primitive");
  }
  return {
    elementCount,
    sourceBounds: {
      min: aggregate.min as [number, number, number],
      max: aggregate.max as [number, number, number],
    },
  };
}

export function sha256Hex(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

export function inspectArtifactBytes(
  format: ManifestAssetEntry["format"],
  bytes: Uint8Array,
): InspectedArtifactBytes {
  if (format !== "spz-v2" && format !== "glb-2.0") {
    throw new Error("artifact format 非法");
  }
  const decoded = format === "spz-v2" ? decodeSpzIdentity(bytes) : decodeGlbIdentity(bytes);
  const sourceBounds: Bounds3 = {
    min: [...decoded.sourceBounds.min] as [number, number, number],
    max: [...decoded.sourceBounds.max] as [number, number, number],
  };
  Object.freeze(sourceBounds.min);
  Object.freeze(sourceBounds.max);
  Object.freeze(sourceBounds);
  return Object.freeze({
    format,
    digest: sha256Hex(bytes),
    byteLength: bytes.byteLength,
    elementCount: decoded.elementCount,
    sourceBounds,
  });
}

export function validateRegisteredArtifactBytes(
  entry: ManifestAssetEntry,
  bytes: Uint8Array,
): VerifiedArtifactIdentity {
  if (bytes.byteLength !== entry.byteLength) {
    throw new Error("artifact byteLength 与 manifest 不一致");
  }
  const digest = sha256Hex(bytes);
  if (digest !== entry.digest) throw new Error("artifact digest 与 manifest 不一致");
  const inspected = inspectArtifactBytes(entry.format, bytes);
  if (inspected.elementCount !== entry.elementCount) {
    throw new Error("artifact elementCount 与 manifest 不一致");
  }
  sameBounds(inspected.sourceBounds, entry.sourceBounds, entry.assetId);
  return {
    assetId: entry.assetId,
    digest,
    byteLength: inspected.byteLength,
    elementCount: inspected.elementCount,
    sourceBounds: inspected.sourceBounds,
  };
}
