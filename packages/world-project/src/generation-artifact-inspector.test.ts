import { describe, expect, test } from "bun:test";
import { gzipSync } from "node:zlib";

import { inspectDynamicArtifactBytes } from "./generation-artifact-inspector";

function encodeSignedInt24(value: number, bytes: Uint8Array, offset: number): void {
  const encoded = value < 0 ? value + 0x100_0000 : value;
  bytes[offset] = encoded & 0xff;
  bytes[offset + 1] = encoded >>> 8 & 0xff;
  bytes[offset + 2] = encoded >>> 16 & 0xff;
}

function createSpzFixture(
  centers = [[-1.25, 0.5, 2], [1.75, -0.25, -2.5]] as const,
): Uint8Array {
  const fractionalBits = 12;
  const decoded = new Uint8Array(16 + centers.length * 19);
  const header = new DataView(decoded.buffer);
  header.setUint32(0, 1_347_635_022, true);
  header.setUint32(4, 2, true);
  header.setUint32(8, centers.length, true);
  header.setUint8(13, fractionalBits);
  centers.forEach((center, index) => center.forEach((component, axis) =>
    encodeSignedInt24(component * 2 ** fractionalBits, decoded, 16 + index * 9 + axis * 3)));
  return gzipSync(decoded);
}

interface GlbFixtureOptions {
  readonly externalUri?: string;
  readonly sparsePosition?: boolean;
  readonly invalidAccessor?: boolean;
  readonly positions?: readonly (readonly [number, number, number])[];
  readonly translation?: readonly [number, number, number];
  readonly scale?: readonly [number, number, number];
}

function createGlbFixture(options: GlbFixtureOptions = {}): Uint8Array {
  const positions = options.positions ?? [
    [-1, -2, -3], [-1, -2, 6], [-1, 5, -3], [-1, 5, 6],
    [4, -2, -3], [4, -2, 6], [4, 5, -3], [4, 5, 6],
  ];
  const localMin = [0, 1, 2].map((axis) => Math.min(...positions.map((position) => position[axis]!))) as [number, number, number];
  const localMax = [0, 1, 2].map((axis) => Math.max(...positions.map((position) => position[axis]!))) as [number, number, number];
  const binary = new Uint8Array(positions.length * 12);
  const binaryView = new DataView(binary.buffer);
  positions.forEach((position, index) => position.forEach((component, axis) =>
    binaryView.setFloat32(index * 12 + axis * 4, component, true)));
  const json = JSON.stringify({
    asset: { version: "2.0" },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{
      mesh: 0,
      translation: options.translation ?? [1, -2, 0.5],
      ...(options.scale ? { scale: options.scale } : {}),
    }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0 } }] }],
    buffers: [{ byteLength: binary.byteLength }],
    bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: binary.byteLength }],
    accessors: [{
      bufferView: 0,
      componentType: options.invalidAccessor ? 5123 : 5126,
      count: positions.length,
      type: "VEC3",
      min: localMin,
      max: localMax,
      ...(options.sparsePosition ? { sparse: { count: 1 } } : {}),
    }],
    ...(options.externalUri ? { images: [{ uri: options.externalUri }] } : {}),
  });
  const jsonBytes = new TextEncoder().encode(json);
  const jsonLength = Math.ceil(jsonBytes.byteLength / 4) * 4;
  const binaryOffset = 20 + jsonLength;
  const bytes = new Uint8Array(binaryOffset + 8 + binary.byteLength);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, 0x46546c67, true);
  view.setUint32(4, 2, true);
  view.setUint32(8, bytes.byteLength, true);
  view.setUint32(12, jsonLength, true);
  view.setUint32(16, 0x4e4f534a, true);
  bytes.fill(0x20, 20, binaryOffset);
  bytes.set(jsonBytes, 20);
  view.setUint32(binaryOffset, binary.byteLength, true);
  view.setUint32(binaryOffset + 4, 0x004e4942, true);
  bytes.set(binary, binaryOffset + 8);
  return bytes;
}

describe("DH-017 dynamic artifact inspector", () => {
  test("legal deterministic SPZ and GLB derive frozen golden descriptors without static manifests", () => {
    const spz = inspectDynamicArtifactBytes("spz-v2", createSpzFixture());
    const glb = inspectDynamicArtifactBytes("glb-2.0", createGlbFixture());
    expect(spz).toEqual({
      descriptor: {
        schemaVersion: 1,
        inspectorProfile: "spz-v2-position-bounds-v1",
        format: "spz-v2",
        contentDigest: "3fdedd838a3d16e1a15d63be44582e41c1554ebcdee67eb9a6c9b36155fa3cdb",
        byteLength: 55,
        elementCount: 2,
        sourceBounds: { min: [-1.25, -0.25, -2.5], max: [1.75, 0.5, 2] },
      },
      descriptorDigest: "b75c0fe2b235a34544d43bcb569028d6c8580a79b2b966bd26fb657971f5027f",
    });
    expect(glb).toEqual({
      descriptor: {
        schemaVersion: 1,
        inspectorProfile: "glb-2.0-scene-bounds-v1",
        format: "glb-2.0",
        contentDigest: "fdf4958e3008de283749f64b1610de2c3e77d0a1000112c53a2bd1339b196c32",
        byteLength: 488,
        elementCount: 1,
        sourceBounds: { min: [0, -4, -2.5], max: [5, 3, 6.5] },
      },
      descriptorDigest: "e06fe8b6924239c796048b2f5bd3937ed7ae5232500e1e6f50fca4e770d42c6e",
    });
  });

  test("repeated inspection is stable and returned nested bounds cannot be mutated", () => {
    const bytes = createGlbFixture();
    const first = inspectDynamicArtifactBytes("glb-2.0", bytes);
    expect(first).toEqual(inspectDynamicArtifactBytes("glb-2.0", bytes));
    expect(Object.isFrozen(first.descriptor.sourceBounds.min)).toBe(true);
    expect(() => {
      (first.descriptor.sourceBounds.min as unknown as number[])[0] = 999;
    }).toThrow();
    expect(inspectDynamicArtifactBytes("glb-2.0", bytes)).toEqual(first);
  });

  test("legal GLB Float32 bounds use a 15-significant-digit descriptor golden", () => {
    const inspection = inspectDynamicArtifactBytes("glb-2.0", createGlbFixture({
      positions: [
        [0.12345679104328156, -1.2345678806304932, 2.3456788063049316],
        [3.456789016723633, 4.567890167236328, 5.678901195526123],
      ],
      translation: [0.12345678901234567, -0.5, 1.2345678901234567],
    }));
    expect(inspection).toEqual({
      descriptor: {
        schemaVersion: 1,
        inspectorProfile: "glb-2.0-scene-bounds-v1",
        format: "glb-2.0",
        contentDigest: "601c5c2193ea3467d41ca8da4983fb85be3e87b94e4e1e84c9451ba8c29e2eca",
        byteLength: 548,
        elementCount: 1,
        sourceBounds: {
          min: [0.246913580055627, -1.73456788063049, 3.58024669642839],
          max: [3.58024580573598, 4.06789016723633, 6.91346908564958],
        },
      },
      descriptorDigest: "04c4ce9f42a5b29d152e07061cac733f2474a8fae4a559df72ba8f872e31c03e",
    });
  });

  test("normalizes GLB -0 and rejects bounds made degenerate by rounding", () => {
    const negativeZero = inspectDynamicArtifactBytes("glb-2.0", createGlbFixture({
      positions: [[-0, -1, -1], [1, 1, 1]],
      translation: [0, 0, 0],
    }));
    expect(negativeZero.descriptor.sourceBounds.min[0]).toBe(0);
    expect(Object.is(negativeZero.descriptor.sourceBounds.min[0], -0)).toBe(false);

    expect(() => inspectDynamicArtifactBytes("glb-2.0", createGlbFixture({
      positions: [[1, 0, 0], [1.0000001192092896, 1, 1]],
      translation: [1, 0, 0],
      scale: [1e-8, 1, 1],
    }))).toThrow("GENERATION_RECOVERY_REQUIRED");
  });

  test("selected format and malformed decoder counterexamples fail closed", () => {
    const glb = createGlbFixture();
    expect(() => inspectDynamicArtifactBytes("spz-v2", glb)).toThrow("gzip");
    expect(() => inspectDynamicArtifactBytes("glb-2.0", glb.subarray(0, 3))).toThrow("header");

    const badVersion = glb.slice();
    new DataView(badVersion.buffer).setUint32(4, 1, true);
    expect(() => inspectDynamicArtifactBytes("glb-2.0", badVersion)).toThrow("version");

    const truncatedSpz = new Uint8Array(16 + 9);
    const spzHeader = new DataView(truncatedSpz.buffer);
    spzHeader.setUint32(0, 1_347_635_022, true);
    spzHeader.setUint32(4, 2, true);
    spzHeader.setUint32(8, 1, true);
    spzHeader.setUint8(13, 12);
    expect(() => inspectDynamicArtifactBytes("spz-v2", gzipSync(truncatedSpz))).toThrow("layout");

    const trailing = new Uint8Array(glb.byteLength + 4);
    trailing.set(glb);
    new DataView(trailing.buffer).setUint32(8, trailing.byteLength, true);
    expect(() => inspectDynamicArtifactBytes("glb-2.0", trailing)).toThrow("trailing");

    const chunkDrift = glb.slice();
    const jsonLength = new DataView(chunkDrift.buffer).getUint32(12, true);
    new DataView(chunkDrift.buffer).setUint32(20 + jsonLength, 98, true);
    expect(() => inspectDynamicArtifactBytes("glb-2.0", chunkDrift)).toThrow("boundary");

    for (const externalUri of ["https://provider.example/texture.png", "data:image/png;base64,AA=="]) {
      expect(() => inspectDynamicArtifactBytes("glb-2.0", createGlbFixture({ externalUri })))
        .toThrow("URI");
    }
    expect(() => inspectDynamicArtifactBytes("glb-2.0", createGlbFixture({ sparsePosition: true })))
      .toThrow("POSITION");
    expect(() => inspectDynamicArtifactBytes("glb-2.0", createGlbFixture({ invalidAccessor: true })))
      .toThrow("POSITION");

    const nonFinite = glb.slice();
    const nonFiniteJsonLength = new DataView(nonFinite.buffer).getUint32(12, true);
    new DataView(nonFinite.buffer).setFloat32(20 + nonFiniteJsonLength + 8, Number.NaN, true);
    expect(() => inspectDynamicArtifactBytes("glb-2.0", nonFinite)).toThrow("非有限");
  });

  test("valid content changes derive a different digest, while degenerate content is rejected", () => {
    const canonical = inspectDynamicArtifactBytes("spz-v2", createSpzFixture());
    const changed = inspectDynamicArtifactBytes(
      "spz-v2",
      createSpzFixture([[-1, 0.5, 2], [1.75, -0.25, -2.5]]),
    );
    expect(changed.descriptor.contentDigest).not.toBe(canonical.descriptor.contentDigest);
    expect(changed.descriptorDigest).not.toBe(canonical.descriptorDigest);
    expect(() => inspectDynamicArtifactBytes("spz-v2", createSpzFixture([[0, 0, 0], [0, 0, 0]])))
      .toThrow("GENERATION_RECOVERY_REQUIRED");
  });
});
