import { describe, expect, test } from "bun:test";
import {
  mkdtempSync,
  readdirSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gzipSync } from "node:zlib";

import {
  bootstrapDataRoot,
  openDataRoot,
  type OpenedDataRoot,
} from "./data-root";
import {
  acquireDataRootWriterLease,
  type DataRootWriterLease,
} from "./data-root-lease";
import { ensureDataRootLayout } from "./data-root-layout";
import {
  createGenerationBinding,
  createGenerationIntent,
  requireGenerationRequest,
  type GenerationIntentV1,
} from "./generation-contracts";
import { FirstGenerationCoordinator } from "./first-generation-coordinator";
import { FirstGenerationPreSubmitCoordinator } from "./first-generation-pre-submit-coordinator";
import { GenerationSubmitResultCoordinator } from "./generation-submit-result-coordinator";
import {
  FakeGenerationCompletionCoordinator,
  type FakeGenerationArtifactV1,
} from "./fake-generation-completion-coordinator";
import { GeneratedArtifactReader } from "./generated-artifact-reader";

const MARBLE_REMOTE = {
  provider: "worldlabs-marble-v1" as const,
  remoteJobId: "operation_1",
  providerRequestId: null,
};
const MARBLE_OUTPUT = {
  kind: "marble-world" as const,
  operationId: "operation_1",
  worldId: "world_1",
  spzKey: "500k" as const,
  colliderField: "collider_mesh_url" as const,
};
const HUNYUAN_REMOTE = {
  provider: "hunyuan-ai3d-v1" as const,
  remoteJobId: "12345678",
  providerRequestId: "5b0a1e2e-4c3d-4e5f-8a9b-0c1d2e3f4a5b",
};
const HUNYUAN_OUTPUT = {
  kind: "hunyuan-file-set" as const,
  jobId: "12345678",
  glbCount: 1 as const,
  objCount: 0 as const,
};

async function withRoot(
  run: (root: OpenedDataRoot, lease: DataRootWriterLease, rootPath: string) => void,
): Promise<void> {
  const parent = mkdtempSync(join(tmpdir(), "dh017-fake-completion-"));
  const rootPath = join(parent, "root");
  bootstrapDataRoot(rootPath);
  const root = openDataRoot(rootPath);
  const acquired = await acquireDataRootWriterLease(root);
  expect(acquired.status).toBe("acquired");
  if (acquired.status !== "acquired") throw new Error("lease unavailable");
  try {
    ensureDataRootLayout(root, acquired.lease);
    run(root, acquired.lease, rootPath);
  } finally {
    await acquired.lease.close();
    root.close();
    rmSync(parent, { recursive: true, force: true });
  }
}

function intent(provider: "worldlabs-marble-v1" | "hunyuan-ai3d-v1"): GenerationIntentV1 {
  const prepared = requireGenerationRequest(provider === "worldlabs-marble-v1"
    ? {
        provider,
        model: "marble-1.1",
        prompt: "a mossy stone arch",
        costUnknownAccepted: true,
        waitForCompletionAndDownload: true,
        idempotencyKey: "fake-marble-completion",
      }
    : {
        provider,
        model: "3.1",
        prompt: "a mossy stone arch",
        costUnknownAccepted: true,
        waitForCompletionAndDownload: true,
        idempotencyKey: "fake-hunyuan-completion",
      });
  return createGenerationIntent(createGenerationBinding(prepared, {
    contractProfile: provider === "worldlabs-marble-v1"
      ? "worldlabs-openapi-2026-08-15-v1"
      : "cloud-response-v1",
    contractShapeDigest: "a".repeat(64),
  }), "2026-08-15T10:00:00.000Z");
}

function advanceToRemoteBound(
  root: OpenedDataRoot,
  lease: DataRootWriterLease,
  durableIntent: GenerationIntentV1,
): void {
  new FirstGenerationCoordinator(root, lease).admit(durableIntent);
  const checkpoint = new FirstGenerationPreSubmitCoordinator(root, lease).checkpoint({
    generationId: durableIntent.generationId,
    recordedAt: "2026-08-15T10:00:01.000Z",
    decision: { kind: "ready" },
  });
  expect(checkpoint.status).toBe("ready");
  const remoteBound = durableIntent.provider === "worldlabs-marble-v1"
    ? MARBLE_REMOTE
    : HUNYUAN_REMOTE;
  expect(new GenerationSubmitResultCoordinator(root, lease).submitResult({
    generationId: durableIntent.generationId,
    recordedAt: "2026-08-15T10:00:02.000Z",
    outcome: { kind: "remote-bound", remoteBound },
  }).status).toBe("appended");
}

function encodeSignedInt24(value: number, bytes: Uint8Array, offset: number): void {
  const encoded = value < 0 ? value + 0x1_000000 : value;
  bytes[offset] = encoded & 0xff;
  bytes[offset + 1] = encoded >>> 8 & 0xff;
  bytes[offset + 2] = encoded >>> 16 & 0xff;
}

function spz(): Uint8Array {
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

function glb(): Uint8Array {
  const positions = [[-1, -2, -3], [4, 5, 6]] as const;
  const binary = new Uint8Array(positions.length * 12);
  const binaryView = new DataView(binary.buffer);
  positions.forEach((position, index) => position.forEach((component, axis) =>
    binaryView.setFloat32(index * 12 + axis * 4, component, true)));
  const json = new TextEncoder().encode(JSON.stringify({
    asset: { version: "2.0" },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0 }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0 } }] }],
    buffers: [{ byteLength: binary.byteLength }],
    bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: binary.byteLength }],
    accessors: [{
      bufferView: 0,
      componentType: 5126,
      count: positions.length,
      type: "VEC3",
      min: [-1, -2, -3],
      max: [4, 5, 6],
    }],
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

function artifacts(provider: GenerationIntentV1["provider"]): readonly FakeGenerationArtifactV1[] {
  return provider === "worldlabs-marble-v1"
    ? [
        { outputRole: "world-spz-500k", format: "spz-v2", bytes: spz() },
        { outputRole: "world-collider-glb", format: "glb-2.0", bytes: glb() },
      ]
    : [{ outputRole: "object-glb", format: "glb-2.0", bytes: glb() }];
}

function records(rootPath: string, durableIntent: GenerationIntentV1): readonly string[] {
  return readdirSync(join(
    rootPath,
    "receipts",
    "generations",
    "data",
    durableIntent.generationId.slice("generation:sha256:".length),
    "records",
  )).sort();
}

describe("FakeGenerationCompletionCoordinator", () => {
  for (const provider of ["worldlabs-marble-v1", "hunyuan-ai3d-v1"] as const) {
    test(`${provider} closes remote_bound to verified list/read and replays`, async () => {
      await withRoot((root, lease, rootPath) => {
        const durableIntent = intent(provider);
        advanceToRemoteBound(root, lease, durableIntent);
        const orderedArtifacts = artifacts(provider);
        const completion = new FakeGenerationCompletionCoordinator(root, lease);
        const request = {
          remoteOutputIdentity: provider === "worldlabs-marble-v1"
            ? MARBLE_OUTPUT
            : HUNYUAN_OUTPUT,
          orderedArtifacts,
          recordedAt: "2026-08-15T10:00:03.000Z",
        };
        const result = completion.complete(durableIntent, request);
        expect(result.status).toBe("verified");
        expect(result.set.members.map((member) => member.role)).toEqual(
          orderedArtifacts.map((artifact) => artifact.outputRole),
        );
        const reader = new GeneratedArtifactReader(root);
        for (const [index, member] of result.set.members.entries()) {
          expect(reader.read(durableIntent.generationId, member.assetId))
            .toEqual(orderedArtifacts[index]!.bytes);
        }
        const before = records(rootPath, durableIntent);
        expect(completion.complete(durableIntent, request).status).toBe("replay");
        expect(records(rootPath, durableIntent)).toEqual(before);
      });
    });
  }

  test("invalid bytes and wrong role fail before the first poll mutation", async () => {
    await withRoot((root, lease, rootPath) => {
      const durableIntent = intent("worldlabs-marble-v1");
      advanceToRemoteBound(root, lease, durableIntent);
      const before = records(rootPath, durableIntent);
      const coordinator = new FakeGenerationCompletionCoordinator(root, lease);
      expect(() => coordinator.complete(durableIntent, {
        remoteOutputIdentity: MARBLE_OUTPUT,
        orderedArtifacts: [
          { outputRole: "world-spz-500k", format: "spz-v2", bytes: new Uint8Array([1]) },
          { outputRole: "world-collider-glb", format: "glb-2.0", bytes: glb() },
        ],
        recordedAt: "2026-08-15T10:00:03.000Z",
      })).toThrow("GENERATION_RECOVERY_REQUIRED");
      expect(() => coordinator.complete(durableIntent, {
        remoteOutputIdentity: MARBLE_OUTPUT,
        orderedArtifacts: [
          { outputRole: "object-glb", format: "glb-2.0", bytes: glb() },
          { outputRole: "world-collider-glb", format: "glb-2.0", bytes: glb() },
        ],
        recordedAt: "2026-08-15T10:00:03.000Z",
      })).toThrow("GENERATION_RECOVERY_REQUIRED");
      expect(records(rootPath, durableIntent)).toEqual(before);
      expect(new GeneratedArtifactReader(root).list()).toEqual([]);
    });
  });
});
