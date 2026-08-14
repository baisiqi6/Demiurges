import { describe, expect, test } from "bun:test";
import { gzipSync } from "node:zlib";

import type { ManifestAssetEntry } from "../packages/world/src/artifacts/marble-hunyuan-registry";
import {
  sha256Hex,
  validateRegisteredArtifactBytes,
} from "./provider-artifact-validation";

function encodeSignedInt24(value: number, bytes: Uint8Array, offset: number): void {
  const encoded = value < 0 ? value + 0x100_0000 : value;
  bytes[offset] = encoded & 0xff;
  bytes[offset + 1] = encoded >>> 8 & 0xff;
  bytes[offset + 2] = encoded >>> 16 & 0xff;
}

function createSpzFixture(): Uint8Array {
  const fractionalBits = 12;
  const centers = [
    [-1.25, 0.5, 2],
    [1.75, -0.25, -2.5],
  ] as const;
  const decoded = new Uint8Array(16 + centers.length * 19);
  const header = new DataView(decoded.buffer);
  header.setUint32(0, 1_347_635_022, true);
  header.setUint32(4, 2, true);
  header.setUint32(8, centers.length, true);
  header.setUint8(12, 0);
  header.setUint8(13, fractionalBits);
  header.setUint8(14, 0);
  header.setUint8(15, 0);
  centers.forEach((center, index) => center.forEach((component, axis) =>
    encodeSignedInt24(component * 2 ** fractionalBits, decoded, 16 + index * 9 + axis * 3)));
  return gzipSync(decoded);
}

function createGlbFixture(externalUri?: string, sparsePosition = false): Uint8Array {
  const positions = [
    [-1, -2, -3], [-1, -2, 6], [-1, 5, -3], [-1, 5, 6],
    [4, -2, -3], [4, -2, 6], [4, 5, -3], [4, 5, 6],
  ] as const;
  const binary = new Uint8Array(positions.length * 12);
  const binaryView = new DataView(binary.buffer);
  positions.forEach((position, index) => position.forEach((component, axis) =>
    binaryView.setFloat32(index * 12 + axis * 4, component, true)));
  const json = JSON.stringify({
    asset: { version: "2.0" },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0, translation: [1, -2, 0.5] }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0 } }] }],
    buffers: [{ byteLength: binary.byteLength }],
    bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: binary.byteLength }],
    accessors: [{
      bufferView: 0,
      componentType: 5126,
      count: 8,
      type: "VEC3",
      min: [-1, -2, -3],
      max: [4, 5, 6],
      ...(sparsePosition ? { sparse: { count: 1 } } : {}),
    }],
    ...(externalUri ? { images: [{ uri: externalUri }] } : {}),
  });
  const unpadded = new TextEncoder().encode(json);
  const jsonLength = Math.ceil(unpadded.byteLength / 4) * 4;
  const binaryOffset = 20 + jsonLength;
  const bytes = new Uint8Array(binaryOffset + 8 + binary.byteLength);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, 0x46546c67, true);
  view.setUint32(4, 2, true);
  view.setUint32(8, bytes.byteLength, true);
  view.setUint32(12, jsonLength, true);
  view.setUint32(16, 0x4e4f534a, true);
  bytes.fill(0x20, 20);
  bytes.set(unpadded, 20);
  view.setUint32(binaryOffset, binary.byteLength, true);
  view.setUint32(binaryOffset + 4, 0x004e4942, true);
  bytes.set(binary, binaryOffset + 8);
  return bytes;
}

function entry(
  assetId: ManifestAssetEntry["assetId"],
  format: ManifestAssetEntry["format"],
  bytes: Uint8Array,
  sourceBounds: ManifestAssetEntry["sourceBounds"],
  elementCount: number,
): ManifestAssetEntry {
  return {
    assetId,
    provider: "fixture",
    resourceId: "fixture-resource",
    ...(format === "spz-v2" ? { resolution: "500k" as const } : {}),
    format,
    elementCount,
    byteLength: bytes.byteLength,
    digest: sha256Hex(bytes),
    sourceBounds,
    distributionPolicy: "unknown-restricted-local",
  };
}

export const PROVIDER_IMPORT_TEST_FIXTURES = Object.freeze({
  createGlbFixture,
  entry,
});

describe("DH-013 provider artifact validator", () => {
  test("SPZ v2 由 gzip/header/int24 centers 重算 element count 与 bounds", () => {
    const bytes = createSpzFixture();
    const manifest = entry(
      "asset:marble-world-500k-spz-v1",
      "spz-v2",
      bytes,
      { min: [-1.25, -0.25, -2.5], max: [1.75, 0.5, 2] },
      2,
    );
    expect(validateRegisteredArtifactBytes(manifest, bytes)).toEqual({
      assetId: manifest.assetId,
      digest: manifest.digest,
      byteLength: bytes.byteLength,
      elementCount: 2,
      sourceBounds: manifest.sourceBounds,
    });
  });

  test("GLB 2.0 从 scene/node/primitive/POSITION bounds 重算 world-space bounds", () => {
    const bytes = createGlbFixture();
    const manifest = entry(
      "asset:hunyuan-rounded-cube-v1",
      "glb-2.0",
      bytes,
      { min: [0, -4, -2.5], max: [5, 3, 6.5] },
      1,
    );
    expect(validateRegisteredArtifactBytes(manifest, bytes).sourceBounds)
      .toEqual(manifest.sourceBounds);
  });

  test("digest、magic、element count 与 decoded bounds 任一漂移都 fail closed", () => {
    const bytes = createGlbFixture();
    const canonical = entry(
      "asset:hunyuan-rounded-cube-v1",
      "glb-2.0",
      bytes,
      { min: [0, -4, -2.5], max: [5, 3, 6.5] },
      1,
    );
    expect(() => validateRegisteredArtifactBytes(
      { ...canonical, digest: "0".repeat(64) },
      bytes,
    )).toThrow("digest");

    const badMagic = bytes.slice();
    badMagic[0] = 0;
    expect(() => validateRegisteredArtifactBytes(
      { ...canonical, digest: sha256Hex(badMagic) },
      badMagic,
    )).toThrow("magic");

    expect(() => validateRegisteredArtifactBytes(
      { ...canonical, elementCount: 2 },
      bytes,
    )).toThrow("elementCount");
    expect(() => validateRegisteredArtifactBytes(
      { ...canonical, sourceBounds: { ...canonical.sourceBounds, max: [6, 3, 6.5] } },
      bytes,
    )).toThrow("bounds");
  });

  test("即使 digest 匹配，GLB external/data URI 仍不会进入浏览器加载面", () => {
    for (const uri of ["https://provider.example/texture.png", "data:image/png;base64,AA=="]) {
      const bytes = createGlbFixture(uri);
      const manifest = entry(
        "asset:hunyuan-rounded-cube-v1",
        "glb-2.0",
        bytes,
        { min: [0, -4, -2.5], max: [5, 3, 6.5] },
        1,
      );
      expect(() => validateRegisteredArtifactBytes(manifest, bytes)).toThrow("URI");
    }
  });

  test("SPZ v2 position-only、GLB sparse POSITION 与非法 trailing bytes 均 fail closed", () => {
    const truncatedSpz = gzipSync(new Uint8Array([
      0x4e, 0x47, 0x53, 0x50,
      2, 0, 0, 0,
      1, 0, 0, 0,
      0, 12, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0,
    ]));
    const spzManifest = entry(
      "asset:marble-world-500k-spz-v1",
      "spz-v2",
      truncatedSpz,
      { min: [0, 0, 0], max: [0, 0, 0] },
      1,
    );
    expect(() => validateRegisteredArtifactBytes(spzManifest, truncatedSpz))
      .toThrow("layout");

    const sparse = createGlbFixture(undefined, true);
    const sparseManifest = entry(
      "asset:hunyuan-rounded-cube-v1",
      "glb-2.0",
      sparse,
      { min: [0, -4, -2.5], max: [5, 3, 6.5] },
      1,
    );
    expect(() => validateRegisteredArtifactBytes(sparseManifest, sparse)).toThrow("POSITION");

    const canonical = createGlbFixture();
    const trailing = new Uint8Array(canonical.byteLength + 4);
    trailing.set(canonical);
    new DataView(trailing.buffer).setUint32(8, trailing.byteLength, true);
    const trailingManifest = entry(
      "asset:hunyuan-rounded-cube-v1",
      "glb-2.0",
      trailing,
      { min: [0, -4, -2.5], max: [5, 3, 6.5] },
      1,
    );
    expect(() => validateRegisteredArtifactBytes(trailingManifest, trailing)).toThrow("trailing");
  });
});
