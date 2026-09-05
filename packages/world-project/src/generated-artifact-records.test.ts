import { describe, expect, test } from "bun:test";
import { gzipSync } from "node:zlib";

import { canonicalJsonBytes, sha256Hex } from "@demiurges/world";

import {
  createGenerationBinding,
  requireGenerationRequest,
} from "./generation-contracts";
import {
  createVerifiedArtifactContentByBytesPointer,
  deriveGeneratedArtifactSetRecord,
  deriveGenerationArtifactProvenanceRecord,
  deriveVerifiedArtifactContentRecord,
  requireGeneratedArtifactSetRecord,
  requireGenerationArtifactProvenanceRecord,
  requireVerifiedArtifactContentByBytesPointer,
  requireVerifiedArtifactContentRecord,
  type VerifiedArtifactContentRecordV1,
} from "./generated-artifact-records";
import { inspectDynamicArtifactBytes } from "./generation-artifact-inspector";
import { requireArtifactInspectorDescriptor } from "./generation-output-contracts";

function encodeSignedInt24(value: number, bytes: Uint8Array, offset: number): void {
  const encoded = value < 0 ? value + 0x1_000000 : value;
  bytes[offset] = encoded & 0xff;
  bytes[offset + 1] = encoded >>> 8 & 0xff;
  bytes[offset + 2] = encoded >>> 16 & 0xff;
}

function createSpzFixture(): Uint8Array {
  const centers = [[-1.25, 0.5, 2], [1.75, -0.25, -2.5]] as const;
  const bytes = new Uint8Array(16 + centers.length * 19);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, 1_347_635_022, true);
  view.setUint32(4, 2, true);
  view.setUint32(8, centers.length, true);
  view.setUint8(13, 12);
  centers.forEach((center, index) => center.forEach((component, axis) =>
    encodeSignedInt24(component * 2 ** 12, bytes, 16 + index * 9 + axis * 3)));
  return gzipSync(bytes);
}

function createGlbFixture(): Uint8Array {
  const positions = [
    [-1, -2, -3], [-1, -2, 6], [-1, 5, -3], [-1, 5, 6],
    [4, -2, -3], [4, -2, 6], [4, 5, -3], [4, 5, 6],
  ];
  const binary = new Uint8Array(positions.length * 12);
  const binaryView = new DataView(binary.buffer);
  positions.forEach((position, index) => position.forEach((component, axis) =>
    binaryView.setFloat32(index * 12 + axis * 4, component, true)));
  const json = new TextEncoder().encode(JSON.stringify({
    asset: { version: "2.0" }, scene: 0, scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0, translation: [1, -2, 0.5] }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0 } }] }],
    buffers: [{ byteLength: binary.byteLength }],
    bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: binary.byteLength }],
    accessors: [{ bufferView: 0, componentType: 5126, count: positions.length, type: "VEC3", min: [-1, -2, -3], max: [4, 5, 6] }],
  }));
  const jsonLength = Math.ceil(json.byteLength / 4) * 4;
  const binaryOffset = 20 + jsonLength;
  const bytes = new Uint8Array(binaryOffset + 8 + binary.byteLength);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, 0x46546c67, true);
  view.setUint32(4, 2, true);
  view.setUint32(8, bytes.byteLength, true);
  view.setUint32(12, jsonLength, true);
  view.setUint32(16, 0x4e4f534a, true);
  bytes.fill(0x20, 20, binaryOffset);
  bytes.set(json, 20);
  view.setUint32(binaryOffset, binary.byteLength, true);
  view.setUint32(binaryOffset + 4, 0x004e4942, true);
  bytes.set(binary, binaryOffset + 8);
  return bytes;
}

function spzInspection() {
  return inspectDynamicArtifactBytes("spz-v2", createSpzFixture());
}

function glbInspection() {
  return inspectDynamicArtifactBytes("glb-2.0", createGlbFixture());
}

function inspectorDescriptorDigest(value: unknown): string {
  const prefix = new TextEncoder().encode("demiurges-artifact-inspector-descriptor-v1\0");
  const body = canonicalJsonBytes(value);
  const bytes = new Uint8Array(prefix.byteLength + body.byteLength);
  bytes.set(prefix);
  bytes.set(body, prefix.byteLength);
  return sha256Hex(bytes);
}

function marbleBinding() {
  return createGenerationBinding(requireGenerationRequest({
    provider: "worldlabs-marble-v1",
    model: "marble-1.1",
    prompt: "A bounded generated world",
    costUnknownAccepted: true,
    waitForCompletionAndDownload: true,
    idempotencyKey: "marble-artifact-records",
  }), {
    contractProfile: "worldlabs-openapi-2026-08-15-v1",
    contractShapeDigest: "a".repeat(64),
  });
}

function hunyuanBinding() {
  return createGenerationBinding(requireGenerationRequest({
    provider: "hunyuan-ai3d-v1",
    model: "3.1",
    prompt: "A bounded generated object",
    costUnknownAccepted: true,
    waitForCompletionAndDownload: true,
    idempotencyKey: "hunyuan-artifact-records",
  }), {
    contractProfile: "cloud-response-v1",
    contractShapeDigest: "b".repeat(64),
  });
}

function replace<T extends object>(value: T, patch: Record<string, unknown>): T {
  return { ...value, ...patch } as T;
}

describe("DH-017 generated artifact record identities", () => {
  test("derives deterministic frozen SPZ/GLB content, provenance, and exact provider sets", () => {
    const spz = deriveVerifiedArtifactContentRecord(spzInspection());
    const glb = deriveVerifiedArtifactContentRecord(glbInspection());
    const marble = marbleBinding();
    const hunyuan = hunyuanBinding();
    const marbleSpz = deriveGenerationArtifactProvenanceRecord(
      marble,
      "marble-job-1",
      "world-spz-500k",
      spz,
    );
    const marbleGlb = deriveGenerationArtifactProvenanceRecord(
      marble,
      "marble-job-1",
      "world-collider-glb",
      glb,
    );
    const hunyuanGlb = deriveGenerationArtifactProvenanceRecord(
      hunyuan,
      "12345",
      "object-glb",
      glb,
    );
    const marbleSet = deriveGeneratedArtifactSetRecord(
      marble.provider,
      marble.generationId,
      [
        { content: spz, provenance: marbleSpz },
        { content: glb, provenance: marbleGlb },
      ],
    );
    const hunyuanSet = deriveGeneratedArtifactSetRecord(
      hunyuan.provider,
      hunyuan.generationId,
      [{ content: glb, provenance: hunyuanGlb }],
    );

    expect({
      spz: { assetId: spz.assetId, recordDigest: spz.recordDigest },
      glb: { assetId: glb.assetId, recordDigest: glb.recordDigest },
      marbleSpz: marbleSpz.recordDigest,
      marbleGlb: marbleGlb.recordDigest,
      hunyuanGlb: hunyuanGlb.recordDigest,
      marbleSet: marbleSet.artifactSetDigest,
      hunyuanSet: hunyuanSet.artifactSetDigest,
    }).toEqual({
      spz: {
        assetId: "asset:generated-sha256-3fdedd838a3d16e1a15d63be44582e41c1554ebcdee67eb9a6c9b36155fa3cdb",
        recordDigest: "087125e9033a7efb53930a4a03afcaa1e75add8533648f5fa95a05b1c9aa7e48",
      },
      glb: {
        assetId: "asset:generated-sha256-fdf4958e3008de283749f64b1610de2c3e77d0a1000112c53a2bd1339b196c32",
        recordDigest: "6d4240f0df3de4a03806ffb7424f40c168e15243fba4d0f6636357b99e0c1731",
      },
      marbleSpz: "225bb49b9ca1fae2f5991f61e5cb4f92e257d1fe4fbc169a9fa2d5647c9a747e",
      marbleGlb: "0830594fc07b4cb04a53ec805f8dd36733c26febe6ea18360cdd113ed3bb2f34",
      hunyuanGlb: "d86f6ea6d00d5c5c562a45eed24452ab1dc2c8ac23f7926ffac4deae9eb3fea2",
      marbleSet: "4b315d160030cdbcf25ee73e3a27e8eafbe387a80914fb83921bdea779dc7902",
      hunyuanSet: "7aadf435b5c664ae817a4a4d50351e9ed65c7cc516888e1e7878be7420cd13e4",
    });
    expect(Object.isFrozen(spz)).toBe(true);
    expect(Object.isFrozen(spz.sourceBounds.min)).toBe(true);
    expect(Object.isFrozen(marbleSet.orderedMembers)).toBe(true);
    expect(Object.isFrozen(marbleSet.orderedMembers[0])).toBe(true);
  });

  test("byte-identical GLB content is many-to-one while provenance and sets stay distinct", () => {
    const glb = deriveVerifiedArtifactContentRecord(glbInspection());
    const marble = marbleBinding();
    const hunyuan = hunyuanBinding();
    const marbleProvenance = deriveGenerationArtifactProvenanceRecord(
      marble,
      "marble-job-1",
      "world-collider-glb",
      glb,
    );
    const hunyuanProvenance = deriveGenerationArtifactProvenanceRecord(
      hunyuan,
      "12345",
      "object-glb",
      glb,
    );
    const marbleSpz = deriveGenerationArtifactProvenanceRecord(
      marble,
      "marble-job-1",
      "world-spz-500k",
      deriveVerifiedArtifactContentRecord(spzInspection()),
    );
    const marbleSet = deriveGeneratedArtifactSetRecord(
      marble.provider,
      marble.generationId,
      [
        { content: deriveVerifiedArtifactContentRecord(spzInspection()), provenance: marbleSpz },
        { content: glb, provenance: marbleProvenance },
      ],
    );
    const hunyuanSet = deriveGeneratedArtifactSetRecord(
      hunyuan.provider,
      hunyuan.generationId,
      [{ content: glb, provenance: hunyuanProvenance }],
    );

    expect(glb.assetId).toBe("asset:generated-sha256-fdf4958e3008de283749f64b1610de2c3e77d0a1000112c53a2bd1339b196c32");
    expect(marbleProvenance.contentRecordDigest).toBe(hunyuanProvenance.contentRecordDigest);
    expect(marbleProvenance.recordDigest).not.toBe(hunyuanProvenance.recordDigest);
    expect(marbleSet.artifactSetDigest).not.toBe(hunyuanSet.artifactSetDigest);
    expect(createVerifiedArtifactContentByBytesPointer(glb)).toEqual({
      assetId: glb.assetId,
      contentDigest: glb.digest,
      contentRecordDigest: glb.recordDigest,
    });
  });

  test("rejects identity, descriptor, digest, role, provider, member order and cardinality drift", () => {
    const spz = deriveVerifiedArtifactContentRecord(spzInspection());
    const glb = deriveVerifiedArtifactContentRecord(glbInspection());
    const marble = marbleBinding();
    const marbleSpz = deriveGenerationArtifactProvenanceRecord(marble, "marble-job-1", "world-spz-500k", spz);
    const marbleGlb = deriveGenerationArtifactProvenanceRecord(marble, "marble-job-1", "world-collider-glb", glb);
    const set = deriveGeneratedArtifactSetRecord(marble.provider, marble.generationId, [
      { content: spz, provenance: marbleSpz },
      { content: glb, provenance: marbleGlb },
    ]);

    expect(() => requireVerifiedArtifactContentRecord(replace(spz, { assetId: "asset:generated-sha256-" + "0".repeat(64) }))).toThrow("GENERATION_RECOVERY_REQUIRED");
    expect(() => requireVerifiedArtifactContentRecord(replace(spz, { recordDigest: "0".repeat(64) }))).toThrow("GENERATION_RECOVERY_REQUIRED");
    expect(() => requireVerifiedArtifactContentRecord(replace(spz, { format: "glb-2.0" }))).toThrow("GENERATION_RECOVERY_REQUIRED");
    expect(() => requireGenerationArtifactProvenanceRecord(replace(marbleSpz, { providerJobId: "bad/job" }))).toThrow("GENERATION_RECOVERY_REQUIRED");
    expect(() => requireGenerationArtifactProvenanceRecord(replace(marbleSpz, { contentRecordDigest: glb.recordDigest }))).toThrow("GENERATION_RECOVERY_REQUIRED");
    expect(() => deriveGenerationArtifactProvenanceRecord(marble, "marble-job-1", "world-spz-500k", glb)).toThrow("GENERATION_RECOVERY_REQUIRED");
    expect(() => requireGeneratedArtifactSetRecord(replace(set, { artifactSetDigest: "0".repeat(64) }))).toThrow("GENERATION_RECOVERY_REQUIRED");
    expect(() => requireGeneratedArtifactSetRecord(replace(set, {
      orderedMembers: [...set.orderedMembers].reverse(),
    }))).toThrow("GENERATION_RECOVERY_REQUIRED");
    expect(() => deriveGeneratedArtifactSetRecord(marble.provider, marble.generationId, [
      { content: glb, provenance: marbleGlb },
    ])).toThrow("GENERATION_RECOVERY_REQUIRED");
    expect(() => deriveGeneratedArtifactSetRecord(marble.provider, marble.generationId, [
      { content: spz, provenance: marbleSpz },
      { content: glb, provenance: replace(marbleGlb, { generationId: marble.generationId.replace(/.$/, "0") }) },
    ])).toThrow("GENERATION_RECOVERY_REQUIRED");
  });

  test("rejects unknown, non-plain, malformed, and oversized data without accepting caller identities", () => {
    const content = deriveVerifiedArtifactContentRecord(glbInspection());
    const pointer = createVerifiedArtifactContentByBytesPointer(content);
    const unknown = { ...content, unexpected: true };
    const malformed = { ...pointer, contentDigest: "A".repeat(64) };
    const oversized = { ...content, inspectorDescriptor: { ...content.inspectorDescriptor, sourceBounds: { ...content.sourceBounds, min: Array.from({ length: 4097 }, () => 0) } } };
    const nonPlain = Object.assign(Object.create(null), content);
    const cyclic = { ...content } as Record<string, unknown>;
    cyclic.inspectorDescriptor = cyclic;

    expect(() => requireVerifiedArtifactContentRecord(unknown)).toThrow("GENERATION_RECOVERY_REQUIRED");
    expect(() => requireVerifiedArtifactContentByBytesPointer(malformed)).toThrow("GENERATION_RECOVERY_REQUIRED");
    expect(() => requireVerifiedArtifactContentRecord(oversized)).toThrow("GENERATION_RECOVERY_REQUIRED");
    expect(() => requireVerifiedArtifactContentRecord(nonPlain)).toThrow("GENERATION_RECOVERY_REQUIRED");
    expect(() => requireVerifiedArtifactContentRecord(cyclic)).toThrow("GENERATION_RECOVERY_REQUIRED");
    expect(() => {
      (content.sourceBounds.min as unknown as number[])[0] = 999;
    }).toThrow();
  });

  test("accepts only inspector-origin output and rejects self-consistent noncanonical descriptor bounds", () => {
    const inspected = glbInspection();
    const forged = Object.freeze({
      descriptor: inspected.descriptor,
      descriptorDigest: inspected.descriptorDigest,
    });
    const noncanonicalDescriptor = {
      ...inspected.descriptor,
      sourceBounds: {
        min: [0.12345678901234567, -4, -2.5],
        max: [5, 3, 6.5],
      },
    };
    const selfConsistentNoncanonical = Object.freeze({
      descriptor: noncanonicalDescriptor,
      descriptorDigest: inspectorDescriptorDigest(noncanonicalDescriptor),
    });

    expect(() => deriveVerifiedArtifactContentRecord(forged as never))
      .toThrow("GENERATION_RECOVERY_REQUIRED");
    expect(() => requireArtifactInspectorDescriptor(noncanonicalDescriptor))
      .toThrow("GENERATION_RECOVERY_REQUIRED");
    expect(() => deriveVerifiedArtifactContentRecord(selfConsistentNoncanonical as never))
      .toThrow("GENERATION_RECOVERY_REQUIRED");
  });
});
