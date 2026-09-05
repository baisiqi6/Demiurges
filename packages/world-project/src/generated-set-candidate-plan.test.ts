import { describe, expect, test } from "bun:test";
import { gzipSync } from "node:zlib";

import {
  createGenerationBinding,
  createGenerationIntent,
  requireGenerationRequest,
} from "./generation-contracts";
import { inspectDynamicArtifactBytes } from "./generation-artifact-inspector";
import {
  deriveGeneratedSetCandidatePlan,
  requireGeneratedSetCandidatePlanOrigin,
} from "./generated-set-candidate-plan";
import { artifactInspectorDescriptorDigest } from "./generation-output-contracts";

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
  const positions = [[-1, -2, -3], [4, 5, 6]];
  const binary = new Uint8Array(positions.length * 12);
  const binaryView = new DataView(binary.buffer);
  positions.forEach((position, index) => position.forEach((component, axis) =>
    binaryView.setFloat32(index * 12 + axis * 4, component, true)));
  const json = new TextEncoder().encode(JSON.stringify({
    asset: { version: "2.0" }, scene: 0, scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0 }], meshes: [{ primitives: [{ attributes: { POSITION: 0 } }] }],
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

function intent(provider: "worldlabs-marble-v1" | "hunyuan-ai3d-v1") {
  return createGenerationIntent(createGenerationBinding(requireGenerationRequest(
    provider === "worldlabs-marble-v1"
      ? {
          provider, model: "marble-1.1", prompt: "A bounded generated world",
          costUnknownAccepted: true, waitForCompletionAndDownload: true,
          idempotencyKey: "candidate-plan-marble",
        }
      : {
          provider, model: "3.1", prompt: "A bounded generated object",
          costUnknownAccepted: true, waitForCompletionAndDownload: true,
          idempotencyKey: "candidate-plan-hunyuan",
        },
  ), provider === "worldlabs-marble-v1"
    ? { contractProfile: "worldlabs-openapi-2026-08-15-v1", contractShapeDigest: "a".repeat(64) }
    : { contractProfile: "cloud-response-v1", contractShapeDigest: "b".repeat(64) },
  ), "2026-08-17T09:00:00.000Z");
}

function candidate(role: "world-spz-500k" | "world-collider-glb" | "object-glb", inspection: ReturnType<typeof inspectDynamicArtifactBytes>) {
  const checkpoint = "c".repeat(64);
  const descriptor = inspection.descriptor;
  return {
    candidateName: `${role}-c1-a1-${checkpoint}.bin`,
    attemptCheckpointRecordDigest: checkpoint,
    fileIdentity: { dev: "1", ino: role === "world-spz-500k" ? "2" : "3", mode: 0o600, uid: 501, gid: 20 },
    digest: descriptor.contentDigest,
    byteLength: descriptor.byteLength,
    format: descriptor.format,
    elementCount: descriptor.elementCount,
    sourceBounds: descriptor.sourceBounds,
    inspectorDescriptor: descriptor,
    inspectorDescriptorDigest: artifactInspectorDescriptorDigest(descriptor),
  };
}

function inputs(provider: "worldlabs-marble-v1" | "hunyuan-ai3d-v1") {
  const durableIntent = intent(provider);
  const spz = inspectDynamicArtifactBytes("spz-v2", createSpzFixture());
  const glb = inspectDynamicArtifactBytes("glb-2.0", createGlbFixture());
  const roles = provider === "worldlabs-marble-v1"
    ? ["world-spz-500k", "world-collider-glb"] as const
    : ["object-glb"] as const;
  const inspections = roles.map((outputRole) => ({
    outputRole,
    inspection: outputRole === "world-spz-500k" ? spz : glb,
  }));
  const remoteBound = provider === "worldlabs-marble-v1"
    ? { provider, remoteJobId: "operation_1", providerRequestId: null }
    : { provider, remoteJobId: "12345", providerRequestId: "123e4567-e89b-42d3-a456-426614174000" };
  const activePayload = {
    remoteOutputIdentity: provider === "worldlabs-marble-v1"
      ? { kind: "marble-world", operationId: "operation_1", worldId: "world_1", spzKey: "500k", colliderField: "collider_mesh_url" }
      : { kind: "hunyuan-file-set", jobId: "12345", glbCount: 1, objCount: 0 },
    downloadBudget: {
      pollBudget: {
        cycleCount: 1, attemptCount: 2,
        cycleStartedAt: "2026-08-17T09:00:00.000Z",
        deadlineAt: "2026-08-17T09:20:00.000Z",
      },
      metadataRefreshCount: 0,
      orderedMembers: inspections.map(({ outputRole, inspection }) => ({
        outputRole, downloadAttemptCount: 1, stage: "candidate", candidate: candidate(outputRole, inspection),
      })),
    },
  };
  return { durableIntent, remoteBound, activePayload, inspections };
}

describe("DH-017 generated-set candidate plan", () => {
  test("derives deterministic frozen Marble and Hunyuan plans from fresh fixture inspections", () => {
    const marble = inputs("worldlabs-marble-v1");
    const hunyuan = inputs("hunyuan-ai3d-v1");
    const marblePlan = deriveGeneratedSetCandidatePlan(
      marble.durableIntent, marble.remoteBound, marble.activePayload, marble.inspections,
    );
    const hunyuanPlan = deriveGeneratedSetCandidatePlan(
      hunyuan.durableIntent, hunyuan.remoteBound, hunyuan.activePayload, hunyuan.inspections,
    );

    expect(marblePlan.orderedMembers.map((member) => member.outputRole)).toEqual([
      "world-spz-500k", "world-collider-glb",
    ]);
    expect(hunyuanPlan.orderedMembers.map((member) => member.outputRole)).toEqual(["object-glb"]);
    expect({
      marbleGeneration: marblePlan.generationId,
      hunyuanGeneration: hunyuanPlan.generationId,
      marble: marblePlan.artifactSetRecord.artifactSetDigest,
      hunyuan: hunyuanPlan.artifactSetRecord.artifactSetDigest,
      marbleMembers: marblePlan.orderedMembers.map((member) => ({
        assetId: member.contentRecord.assetId,
        content: member.contentRecord.recordDigest,
        provenance: member.provenanceRecord.recordDigest,
      })),
      hunyuanMembers: hunyuanPlan.orderedMembers.map((member) => ({
        assetId: member.contentRecord.assetId,
        content: member.contentRecord.recordDigest,
        provenance: member.provenanceRecord.recordDigest,
      })),
    }).toEqual({
      marbleGeneration: "generation:sha256:b7eda8d61ced53a9f7529a2d0adf7a79e0774514be26706d57836c0e2001b66a",
      hunyuanGeneration: "generation:sha256:0fe653e010ae7d6aa26e362f8be496c37dd3ff635a5c995e9fd1c4ce06fc8e48",
      marble: "d6bee375aadf32852f6a466c1d14373b9745f7ab6b78d861cc51f9e0569ba848",
      hunyuan: "6129e8839e388b8b64f727fcaa757ac1c595a2cefde4dd51d6850895c8b3da1c",
      marbleMembers: [
        {
          assetId: "asset:generated-sha256-3fdedd838a3d16e1a15d63be44582e41c1554ebcdee67eb9a6c9b36155fa3cdb",
          content: "087125e9033a7efb53930a4a03afcaa1e75add8533648f5fa95a05b1c9aa7e48",
          provenance: "7ff9d9771cb20243d0d7c23f2e188be50a8ceb080424bdf1272d7be65e04b0e0",
        },
        {
          assetId: "asset:generated-sha256-6267ee4e97d8690d28ec481cc81b48baefc3abf4075fee94a4c5cb50553ad0f4",
          content: "3b05b6cf0871afa395a0389a16aea4bc3abe0d78ab4f3a69a8dc63965c069798",
          provenance: "d84cdda5f9e371b3a30fe324fae094ca41a677916a31e98df3ccba95d6426542",
        },
      ],
      hunyuanMembers: [{
        assetId: "asset:generated-sha256-6267ee4e97d8690d28ec481cc81b48baefc3abf4075fee94a4c5cb50553ad0f4",
        content: "3b05b6cf0871afa395a0389a16aea4bc3abe0d78ab4f3a69a8dc63965c069798",
        provenance: "7b5590deefa940da9b985de94de3cd2fac538cb5d02f74340301a73e0b528d88",
      }],
    });
    expect(Object.isFrozen(marblePlan)).toBe(true);
    expect(Object.isFrozen(marblePlan.orderedMembers)).toBe(true);
    expect(Object.isFrozen(marblePlan.orderedMembers[0]?.contentRecord.sourceBounds.min)).toBe(true);
    expect(JSON.stringify(marblePlan)).not.toContain("A bounded generated world");
    expect(JSON.stringify(marblePlan)).not.toContain("providerRequest");
  });

  test("rejects cardinality/order/stage/provider and candidate-fresh-inspection drift", () => {
    const source = inputs("worldlabs-marble-v1");
    const derive = (patch: Partial<typeof source>) => deriveGeneratedSetCandidatePlan(
      patch.durableIntent ?? source.durableIntent,
      patch.remoteBound ?? source.remoteBound,
      patch.activePayload ?? source.activePayload,
      patch.inspections ?? source.inspections,
    );
    expect(() => derive({ inspections: source.inspections.slice(0, 1) })).toThrow("GENERATION_RECOVERY_REQUIRED");
    expect(() => derive({ inspections: [...source.inspections].reverse() })).toThrow("GENERATION_RECOVERY_REQUIRED");
    expect(() => derive({ activePayload: {
      ...source.activePayload,
      downloadBudget: { ...source.activePayload.downloadBudget, orderedMembers: source.activePayload.downloadBudget.orderedMembers.map((member, index) => index === 1 ? { ...member, stage: "reserved", candidate: null } : member) },
    } })).toThrow("GENERATION_RECOVERY_REQUIRED");
    expect(() => derive({ remoteBound: { ...source.remoteBound, provider: "hunyuan-ai3d-v1" } as never })).toThrow("GENERATION_RECOVERY_REQUIRED");
    expect(() => derive({ remoteBound: { ...source.remoteBound, remoteJobId: "operation_2" } })).toThrow("GENERATION_RECOVERY_REQUIRED");
    expect(() => derive({ durableIntent: { ...source.durableIntent, requestDigest: "0".repeat(64) } })).toThrow();
    expect(() => derive({ activePayload: {
      ...source.activePayload,
      remoteOutputIdentity: { ...source.activePayload.remoteOutputIdentity, operationId: "operation_2" },
    } })).toThrow("GENERATION_RECOVERY_REQUIRED");
    expect(() => derive({ activePayload: {
      ...source.activePayload,
      downloadBudget: { ...source.activePayload.downloadBudget, orderedMembers: source.activePayload.downloadBudget.orderedMembers.map((member, index) => index === 0 ? { ...member, candidate: { ...member.candidate, digest: "0".repeat(64) } } : member) },
    } })).toThrow("GENERATION_RECOVERY_REQUIRED");
  });

  test("requires inspector and plan origins, while repeated plans remain equal but independently valid", () => {
    const source = inputs("hunyuan-ai3d-v1");
    const first = deriveGeneratedSetCandidatePlan(
      source.durableIntent, source.remoteBound, source.activePayload, source.inspections,
    );
    const second = deriveGeneratedSetCandidatePlan(
      source.durableIntent, source.remoteBound, source.activePayload, source.inspections,
    );
    expect(first).toEqual(second);
    expect(first).not.toBe(second);
    expect(requireGeneratedSetCandidatePlanOrigin(first)).toBe(first);
    expect(requireGeneratedSetCandidatePlanOrigin(first)).toBe(first);
    expect(requireGeneratedSetCandidatePlanOrigin(second)).toBe(second);
    expect(() => requireGeneratedSetCandidatePlanOrigin({ ...first })).toThrow("GENERATION_RECOVERY_REQUIRED");
    expect(() => deriveGeneratedSetCandidatePlan(
      source.durableIntent,
      source.remoteBound,
      source.activePayload,
      [{ outputRole: "object-glb", inspection: { ...source.inspections[0]!.inspection } }],
    )).toThrow("GENERATION_RECOVERY_REQUIRED");
    for (const providerRequestId of [
      "forged",
      "123E4567-E89B-42D3-A456-426614174000",
    ]) {
      expect(() => deriveGeneratedSetCandidatePlan(
        source.durableIntent,
        { ...source.remoteBound, providerRequestId } as never,
        source.activePayload,
        source.inspections,
      )).toThrow("GENERATION_RECOVERY_REQUIRED");
    }
  });
});
