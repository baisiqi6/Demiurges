import { describe, expect, test } from "bun:test";
import {
  chmodSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gzipSync } from "node:zlib";

import { canonicalJsonBytes } from "@demiurges/world";

import { bootstrapDataRoot, openDataRoot, type OpenedDataRoot } from "./data-root";
import { generationIdDigest } from "./generation-birth";
import {
  createGenerationBinding,
  createGenerationIntent,
  requireGenerationRequest,
  type GenerationIntentV1,
} from "./generation-contracts";
import { inspectDynamicArtifactBytes } from "./generation-artifact-inspector";
import {
  deriveGeneratedSetCandidatePlan,
  type GeneratedSetCandidatePlanV1,
} from "./generated-set-candidate-plan";
import {
  generatedArtifactByBytesPointerPath,
  generatedArtifactBytesPath,
  generatedArtifactCatalogPath,
  generatedArtifactContentRecordPath,
  generatedArtifactProvenanceRecordPath,
  generatedArtifactSetRecordPath,
} from "./generated-artifact-layout";
import type { GeneratedArtifactOutputRole } from "./generation-output-contracts";
import {
  inspectGeneratedSetStoragePreflight,
  type GeneratedSetStoragePreflightSnapshotV1,
} from "./generated-set-storage-preflight";
import {
  deriveGeneratedSetPublicationPlan,
  generatedSetPublicationBindingDigest,
  requireGeneratedSetPublicationBinding,
  requireGeneratedSetPublicationPlanOrigin,
  requireGeneratedSetPublicationResult,
  type GeneratedSetPublicationBindingV1,
  type GeneratedSetPublicationPlanV1,
} from "./generated-artifact-publication";

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
  return createGlbWithPositions([[-1, -2, -3], [4, 5, 6]]);
}

function createGlbVariantFixture(): Uint8Array {
  return createGlbWithPositions([[-2, -1, -3], [4, 5, 6]]);
}

function createGlbWithPositions(
  positions: readonly (readonly [number, number, number])[],
): Uint8Array {
  const binary = new Uint8Array(positions.length * 12);
  const binaryView = new DataView(binary.buffer);
  positions.forEach((position, index) => position.forEach((component, axis) =>
    binaryView.setFloat32(index * 12 + axis * 4, component, true)));
  const min = [
    Math.min(...positions.map((position) => position[0]!)),
    Math.min(...positions.map((position) => position[1]!)),
    Math.min(...positions.map((position) => position[2]!)),
  ];
  const max = [
    Math.max(...positions.map((position) => position[0]!)),
    Math.max(...positions.map((position) => position[1]!)),
    Math.max(...positions.map((position) => position[2]!)),
  ];
  const json = new TextEncoder().encode(JSON.stringify({
    asset: { version: "2.0" }, scene: 0, scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0 }], meshes: [{ primitives: [{ attributes: { POSITION: 0 } }] }],
    buffers: [{ byteLength: binary.byteLength }],
    bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: binary.byteLength }],
    accessors: [{ bufferView: 0, componentType: 5126, count: positions.length, type: "VEC3", min, max }],
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

function intent(provider: "worldlabs-marble-v1" | "hunyuan-ai3d-v1"): GenerationIntentV1 {
  return createGenerationIntent(createGenerationBinding(requireGenerationRequest(
    provider === "worldlabs-marble-v1"
      ? {
          provider, model: "marble-1.1", prompt: "A bounded generated world",
          costUnknownAccepted: true, waitForCompletionAndDownload: true,
          idempotencyKey: "publication-plan-marble",
        }
      : {
          provider, model: "3.1", prompt: "A bounded generated object",
          costUnknownAccepted: true, waitForCompletionAndDownload: true,
          idempotencyKey: "publication-plan-hunyuan",
        },
  ), provider === "worldlabs-marble-v1"
    ? { contractProfile: "worldlabs-openapi-2026-08-15-v1", contractShapeDigest: "a".repeat(64) }
    : { contractProfile: "cloud-response-v1", contractShapeDigest: "b".repeat(64) },
  ), "2026-08-17T09:00:00.000Z");
}

interface FixtureMember {
  readonly outputRole: GeneratedArtifactOutputRole;
  readonly bytes: Uint8Array;
}

interface PlanFixture {
  readonly root: OpenedDataRoot;
  readonly rootPath: string;
  readonly plan: GeneratedSetCandidatePlanV1;
  readonly generationDigest: string;
  readonly downloadsPath: string;
  readonly members: readonly {
    readonly outputRole: GeneratedArtifactOutputRole;
    readonly bytes: Uint8Array;
    readonly candidateName: string;
  }[];
  readonly close(): void;
}

function mkdirp0700(rootPath: string, relativePath: string): void {
  let current = rootPath;
  for (const segment of relativePath.split("/")) {
    if (segment.length === 0) continue;
    current = join(current, segment);
    try {
      mkdirSync(current, { mode: 0o700, recursive: false });
    } catch (error) {
      if (
        typeof error !== "object" ||
        error === null ||
        !("code" in error) ||
        error.code !== "EEXIST"
      ) {
        throw error;
      }
    }
  }
}

function writeFile0600(path: string, bytes: Uint8Array | string): void {
  writeFileSync(path, bytes, { mode: 0o600 });
  chmodSync(path, 0o600);
}

/** 从固定 fixture bytes + downloads 目录构造候选 plan 全部输入；同一构建器可重复调用。 */
function candidatePlanInputs(
  provider: "worldlabs-marble-v1" | "hunyuan-ai3d-v1",
  members: readonly FixtureMember[],
  downloadsPath: string,
) {
  const durableIntent = intent(provider);
  const checkpoint = "c".repeat(64);
  const orderedMembers = members.map(({ outputRole, bytes }) => {
    const candidateName = `${outputRole}-c1-a1-${checkpoint}.bin`;
    const stat = lstatSync(join(downloadsPath, candidateName), { bigint: true });
    const inspection = inspectDynamicArtifactBytes(
      outputRole === "world-spz-500k" ? "spz-v2" : "glb-2.0",
      bytes,
    );
    return {
      outputRole,
      downloadAttemptCount: 1,
      stage: "candidate",
      candidate: {
        candidateName,
        attemptCheckpointRecordDigest: checkpoint,
        fileIdentity: {
          dev: stat.dev.toString(),
          ino: stat.ino.toString(),
          mode: 0o600,
          uid: Number(stat.uid),
          gid: Number(stat.gid),
        },
        digest: inspection.descriptor.contentDigest,
        byteLength: inspection.descriptor.byteLength,
        format: inspection.descriptor.format,
        elementCount: inspection.descriptor.elementCount,
        sourceBounds: inspection.descriptor.sourceBounds,
        inspectorDescriptor: inspection.descriptor,
        inspectorDescriptorDigest: inspection.descriptorDigest,
      },
    };
  });
  const inspections = members.map(({ outputRole, bytes }) => ({
    outputRole,
    inspection: inspectDynamicArtifactBytes(
      outputRole === "world-spz-500k" ? "spz-v2" : "glb-2.0",
      bytes,
    ),
  }));
  const remoteBound = provider === "worldlabs-marble-v1"
    ? { provider, remoteJobId: "operation_1", providerRequestId: null }
    : { provider, remoteJobId: "12345", providerRequestId: "123e4567-e89b-42d3-a456-426614174000" };
  const activePayload = {
    remoteOutputIdentity: provider === "worldlabs-marble-v1"
      ? {
          kind: "marble-world",
          operationId: "operation_1",
          worldId: "world_1",
          spzKey: "500k",
          colliderField: "collider_mesh_url",
        }
      : { kind: "hunyuan-file-set", jobId: "12345", glbCount: 1, objCount: 0 },
    downloadBudget: {
      pollBudget: {
        cycleCount: 1,
        attemptCount: 2,
        cycleStartedAt: "2026-08-17T09:00:00.000Z",
        deadlineAt: "2026-08-17T09:20:00.000Z",
      },
      metadataRefreshCount: 0,
      orderedMembers,
    },
  };
  return { durableIntent, remoteBound, activePayload, inspections };
}

function planFixture(
  provider: "worldlabs-marble-v1" | "hunyuan-ai3d-v1",
  members: readonly FixtureMember[],
): PlanFixture {
  const parent = mkdtempSync(join(tmpdir(), "dh017-publication-"));
  const rootPath = join(parent, "root");
  bootstrapDataRoot(rootPath);
  const root = openDataRoot(rootPath);
  const durableIntent = intent(provider);
  const generationDigest = generationIdDigest(durableIntent.generationId);
  const downloadsPath = join(
    rootPath,
    "receipts",
    "generations",
    "data",
    generationDigest,
    "downloads",
  );
  mkdirp0700(
    rootPath,
    `receipts/generations/data/${generationDigest}/downloads`,
  );
  const checkpoint = "c".repeat(64);
  for (const { outputRole, bytes } of members) {
    writeFile0600(
      join(downloadsPath, `${outputRole}-c1-a1-${checkpoint}.bin`),
      bytes,
    );
  }
  const inputs = candidatePlanInputs(provider, members, downloadsPath);
  const plan = deriveGeneratedSetCandidatePlan(
    inputs.durableIntent,
    inputs.remoteBound,
    inputs.activePayload,
    inputs.inspections,
  );
  return {
    root,
    rootPath,
    plan,
    generationDigest,
    downloadsPath,
    members: members.map(({ outputRole, bytes }) => ({
      outputRole,
      bytes,
      candidateName: `${outputRole}-c1-a1-${checkpoint}.bin`,
    })),
    close() {
      root.close();
      rmSync(parent, { recursive: true, force: true });
    },
  };
}

function marbleFixture(): PlanFixture {
  return planFixture("worldlabs-marble-v1", [
    { outputRole: "world-spz-500k", bytes: createSpzFixture() },
    { outputRole: "world-collider-glb", bytes: createGlbFixture() },
  ]);
}

function hunyuanFixture(): PlanFixture {
  return planFixture("hunyuan-ai3d-v1", [
    { outputRole: "object-glb", bytes: createGlbFixture() },
  ]);
}

interface PublicTarget {
  readonly relativePath: string;
  readonly bytes: Uint8Array;
}

function publicTargets(fixture: PlanFixture): readonly PublicTarget[] {
  const targets = new Map<string, Uint8Array>();
  const add = (relativePath: string, bytes: Uint8Array) => {
    if (!targets.has(relativePath)) targets.set(relativePath, bytes);
  };
  for (const member of fixture.plan.orderedMembers) {
    const bytes = fixture.members.find((entry) => entry.outputRole === member.outputRole)!.bytes;
    add(generatedArtifactBytesPath(member.contentRecord.digest), bytes);
    add(
      generatedArtifactContentRecordPath(member.contentRecord.recordDigest),
      canonicalJsonBytes(member.contentRecord),
    );
    add(
      generatedArtifactByBytesPointerPath(member.contentRecord.digest),
      canonicalJsonBytes(member.byBytesPointer),
    );
    add(
      generatedArtifactProvenanceRecordPath(member.provenanceRecord.recordDigest),
      canonicalJsonBytes(member.provenanceRecord),
    );
  }
  add(
    generatedArtifactSetRecordPath(fixture.plan.artifactSetRecord.artifactSetDigest),
    canonicalJsonBytes(fixture.plan.artifactSetRecord),
  );
  return [...targets.entries()].map(([relativePath, bytes]) => ({ relativePath, bytes }));
}

function writePublicTargets(fixture: PlanFixture, targets: readonly PublicTarget[]): void {
  for (const { relativePath, bytes } of targets) {
    mkdirp0700(fixture.rootPath, relativePath.split("/").slice(0, -1).join("/"));
    writeFile0600(join(fixture.rootPath, relativePath), bytes);
  }
}

function assertNoBinaryValues(value: unknown, path = "$"): void {
  if (
    value instanceof Uint8Array ||
    value instanceof ArrayBuffer ||
    ArrayBuffer.isView(value) ||
    typeof value === "bigint"
  ) {
    throw new Error(`plan 包含二进制/大整数值 at ${path}`);
  }
  if (value === null || typeof value !== "object") return;
  for (const [key, entry] of Object.entries(value)) {
    assertNoBinaryValues(entry, `${path}.${key}`);
  }
}

function assertDeepFrozen(value: unknown): void {
  if (value === null || typeof value !== "object") return;
  expect(Object.isFrozen(value)).toBe(true);
  for (const entry of Object.values(value)) assertDeepFrozen(entry);
}

function publicationPlan(
  fixture: PlanFixture,
): { readonly plan: GeneratedSetPublicationPlanV1; readonly snapshot: GeneratedSetStoragePreflightSnapshotV1 } {
  const snapshot = inspectGeneratedSetStoragePreflight(fixture.root, fixture.plan);
  return {
    plan: deriveGeneratedSetPublicationPlan(fixture.root, fixture.plan, snapshot),
    snapshot,
  };
}

/** 从同一 fixture 重新 derive 的 equal-but-distinct candidate plan。 */
function deriveSecondPlan(fixture: PlanFixture): GeneratedSetCandidatePlanV1 {
  const inputs = candidatePlanInputs(
    fixture.plan.provider,
    fixture.members,
    fixture.downloadsPath,
  );
  return deriveGeneratedSetCandidatePlan(
    inputs.durableIntent,
    inputs.remoteBound,
    inputs.activePayload,
    inputs.inspections,
  );
}

function bindingCopy(
  binding: GeneratedSetPublicationBindingV1,
): GeneratedSetPublicationBindingV1 {
  return JSON.parse(JSON.stringify(binding)) as GeneratedSetPublicationBindingV1;
}

const MARBLE_GENERATION = "generation:sha256:c5865682ffa44ab947d15226bf5e3f979b576055bd1687b9076410b95626f221";
const MARBLE_SET_DIGEST = "d48c7723610d9e670509ad4168ef1353ef302e8afd153b7dfea0c780fad7ef15";
const MARBLE_OPERATION_ID = "op:3944714ae92cede8a3fb309c20f93abd570d9b93298df9cc5fa746a4a1a6df36";
const MARBLE_BINDING_DIGEST = "db1d24881fa3fd3a6bfefb342339279e79edb5085458bcccdecc9bdc90585153";
const MARBLE_CATALOG_DIGEST = "8e83752a6c612fd6da3bc03a2bfcbc58a1d57b27f8d46c826936565b65d9e1da";
const MARBLE_CONTENT_DIGESTS = [
  "087125e9033a7efb53930a4a03afcaa1e75add8533648f5fa95a05b1c9aa7e48",
  "3b05b6cf0871afa395a0389a16aea4bc3abe0d78ab4f3a69a8dc63965c069798",
] as const;
const MARBLE_PROVENANCE_DIGESTS = [
  "fe840e81b1ce40255fb5ce6ba4b0d677e5b2138492250355de605361fd31c58b",
  "75f5240fb79e7739cbeb7f69b8056118a8012028749de4c7a3676c78d67eb53e",
] as const;
const HUNYUAN_GENERATION = "generation:sha256:02b4fc0b33c8c96636cb4bd2aa9b156ee8c891bc03494337f565364bced7a2ad";
const HUNYUAN_SET_DIGEST = "36c480b6dd786a64a07f24cdf24b11095b3f4592b043b6d068f63913f1d89ec0";
const HUNYUAN_OPERATION_ID = "op:cf28516b2db495de787345f79f2e117de89f4e62bc52c30de6d047319e1c8705";
const HUNYUAN_BINDING_DIGEST = "1ff8850f8db9cccad060dd6d7ac8131de1dc77d0cb73d010a8dd713efbcd0400";
const HUNYUAN_CATALOG_DIGEST = "09ba4706606f4e0975d1ed70f28790383275d20ac7bd57805494c39a1e88775c";
const HUNYUAN_CONTENT_DIGESTS = [
  "3b05b6cf0871afa395a0389a16aea4bc3abe0d78ab4f3a69a8dc63965c069798",
] as const;
const HUNYUAN_PROVENANCE_DIGESTS = [
  "4f97313a7cd5755c51a64327788d6f2af6b8f6e9920e74fb591d2725f920bf85",
] as const;

describe("DH-017 generated-set publication plan", () => {
  test("derives deterministic frozen Marble and Hunyuan plans with exact golden vectors", () => {
    const marble = marbleFixture();
    const hunyuan = hunyuanFixture();
    try {
      const marblePublication = publicationPlan(marble);
      const hunyuanPublication = publicationPlan(hunyuan);
      const marblePlan = marblePublication.plan;
      const hunyuanPlan = hunyuanPublication.plan;

      expect(marblePlan.generationId).toBe(MARBLE_GENERATION);
      expect(marblePlan.artifactSetDigest).toBe(MARBLE_SET_DIGEST);
      expect(marblePlan.binding.operationId).toBe(MARBLE_OPERATION_ID);
      expect(marblePlan.publicationBindingDigest).toBe(MARBLE_BINDING_DIGEST);
      expect(marblePlan.catalogDigest).toBe(MARBLE_CATALOG_DIGEST);
      expect(marblePlan.catalogPath).toBe(`artifacts/catalog/${generationIdDigest(MARBLE_GENERATION)}.json`);
      expect(marblePlan.receiptIntentPath).toBe(`receipts/${MARBLE_OPERATION_ID}.intent.json`);
      expect(marblePlan.receiptResultPath).toBe(`receipts/${MARBLE_OPERATION_ID}.result.json`);
      expect(marblePlan.binding).toEqual({
        schemaVersion: 1,
        operationId: MARBLE_OPERATION_ID,
        operationKind: "artifact.publish-generated-set",
        target: { kind: "registry", id: "registry:generated-artifact-sets-v1" },
        expectedIdentity: null,
        candidateIdentity: {
          generationId: MARBLE_GENERATION,
          artifactSetDigest: MARBLE_SET_DIGEST,
          orderedContentRecordDigests: [...MARBLE_CONTENT_DIGESTS],
          orderedProvenanceRecordDigests: [...MARBLE_PROVENANCE_DIGESTS],
        },
      });
      expect(marblePlan.catalogBody).toEqual({
        generationId: MARBLE_GENERATION,
        artifactSetDigest: MARBLE_SET_DIGEST,
        publicationOperationId: MARBLE_OPERATION_ID,
        publicationBindingDigest: MARBLE_BINDING_DIGEST,
      });
      expect(marblePlan.expectedResult).toEqual({
        schemaVersion: 1,
        operationId: MARBLE_OPERATION_ID,
        bindingDigest: MARBLE_BINDING_DIGEST,
        variant: "success",
        publishedIdentity: MARBLE_SET_DIGEST,
      });

      expect(hunyuanPlan.generationId).toBe(HUNYUAN_GENERATION);
      expect(hunyuanPlan.artifactSetDigest).toBe(HUNYUAN_SET_DIGEST);
      expect(hunyuanPlan.binding.operationId).toBe(HUNYUAN_OPERATION_ID);
      expect(hunyuanPlan.publicationBindingDigest).toBe(HUNYUAN_BINDING_DIGEST);
      expect(hunyuanPlan.catalogDigest).toBe(HUNYUAN_CATALOG_DIGEST);
      expect(hunyuanPlan.binding.candidateIdentity).toEqual({
        generationId: HUNYUAN_GENERATION,
        artifactSetDigest: HUNYUAN_SET_DIGEST,
        orderedContentRecordDigests: [...HUNYUAN_CONTENT_DIGESTS],
        orderedProvenanceRecordDigests: [...HUNYUAN_PROVENANCE_DIGESTS],
      });
      expect(hunyuanPlan.expectedResult.publishedIdentity).toBe(HUNYUAN_SET_DIGEST);

      for (const plan of [marblePlan, hunyuanPlan]) {
        expect(plan.schemaVersion).toBe(1);
        expect(plan.kind).toBe("generated-set-publication-plan-v1");
        expect(plan.catalogPath).toBe(generatedArtifactCatalogPath(plan.generationId));
        expect(generatedSetPublicationBindingDigest(plan.binding)).toBe(
          plan.publicationBindingDigest,
        );
        assertDeepFrozen(plan);
        assertNoBinaryValues(plan);
      }
    } finally {
      marble.close();
      hunyuan.close();
    }
  });

  test("ordered digest arrays exactly match the set members; caller arrays are never accepted as authority", () => {
    const marble = marbleFixture();
    try {
      const { plan } = publicationPlan(marble);
      const setMembers = marble.plan.artifactSetRecord.orderedMembers;
      const planMembers = marble.plan.orderedMembers;
      expect(plan.orderedContentRecordDigests).toEqual(
        setMembers.map((member) => member.contentRecordDigest),
      );
      expect(plan.orderedProvenanceRecordDigests).toEqual(
        setMembers.map((member) => member.provenanceRecordDigest),
      );
      expect(plan.orderedContentRecordDigests).toEqual(
        planMembers.map((member) => member.contentRecord.recordDigest),
      );
      expect(plan.orderedProvenanceRecordDigests).toEqual(
        planMembers.map((member) => member.provenanceRecord.recordDigest),
      );
      expect(plan.orderedContentRecordDigests).toEqual([
        ...MARBLE_CONTENT_DIGESTS,
      ]);
      expect(plan.orderedProvenanceRecordDigests).toEqual([
        ...MARBLE_PROVENANCE_DIGESTS,
      ]);
      // derive API 不接受任何 caller digest 数组：binding 只从 plan/set record 派生。
      const swapped = bindingCopy(plan.binding);
      swapped.candidateIdentity.orderedContentRecordDigests = [
        ...MARBLE_PROVENANCE_DIGESTS,
      ] as unknown as string[];
      swapped.candidateIdentity.orderedProvenanceRecordDigests = [
        ...MARBLE_CONTENT_DIGESTS,
      ] as unknown as string[];
      // 结构上仍是合法 hex 数组，但 canonical 字节不同 → 不可能与 plan 共享 binding identity。
      expect(generatedSetPublicationBindingDigest(swapped)).not.toBe(
        plan.publicationBindingDigest,
      );
      expect(JSON.stringify(plan)).not.toContain("candidateName");
      expect(JSON.stringify(plan)).not.toContain("operation_1");
    } finally {
      marble.close();
    }
  });

  test("binding target/kind/id/expectedIdentity/operationId/candidate/array drift all fail closed", () => {
    const fixture = marbleFixture();
    try {
      const { plan } = publicationPlan(fixture);
      const base = bindingCopy(plan.binding);
      const cases: Array<{ readonly name: string; readonly mutate: (copy: GeneratedSetPublicationBindingV1) => void }> = [
        { name: "schemaVersion", mutate: (copy) => { copy.schemaVersion = 2 as never; } },
        { name: "operationKind", mutate: (copy) => { copy.operationKind = "artifact.publish" as never; } },
        { name: "target kind", mutate: (copy) => { copy.target.kind = "artifact" as never; } },
        { name: "target id", mutate: (copy) => { copy.target.id = "registry:other-v1" as never; } },
        { name: "expectedIdentity", mutate: (copy) => { copy.expectedIdentity = "0".repeat(64); } },
        { name: "operationId", mutate: (copy) => { copy.operationId = `op:${"0".repeat(64)}`; } },
        {
          name: "generationId",
          mutate: (copy) => { copy.candidateIdentity.generationId = HUNYUAN_GENERATION; },
        },
        {
          name: "artifactSetDigest",
          mutate: (copy) => { copy.candidateIdentity.artifactSetDigest = "0".repeat(64); },
        },
        {
          name: "empty content array",
          mutate: (copy) => { copy.candidateIdentity.orderedContentRecordDigests = []; },
        },
        {
          name: "content/provenance length mismatch",
          mutate: (copy) => {
            copy.candidateIdentity.orderedContentRecordDigests = [
              ...copy.candidateIdentity.orderedContentRecordDigests,
              ...copy.candidateIdentity.orderedContentRecordDigests,
            ];
          },
        },
        {
          name: "oversized array",
          mutate: (copy) => {
            copy.candidateIdentity.orderedContentRecordDigests = Array.from(
              { length: 17 },
              () => "a".repeat(64),
            );
          },
        },
        {
          name: "non-hex array entry",
          mutate: (copy) => {
            copy.candidateIdentity.orderedContentRecordDigests = ["g".repeat(64)];
          },
        },
        {
          name: "sparse array",
          mutate: (copy) => {
            const sparse: string[] = ["a".repeat(64)];
            sparse.length = 2;
            copy.candidateIdentity.orderedContentRecordDigests = sparse;
          },
        },
        {
          name: "extra candidate key",
          mutate: (copy) => {
            (copy.candidateIdentity as Record<string, unknown>).extra = true;
          },
        },
        {
          name: "extra top-level key",
          mutate: (copy) => {
            (copy as Record<string, unknown>).extra = true;
          },
        },
      ];
      for (const { name, mutate } of cases) {
        const copy = bindingCopy(plan.binding);
        mutate(copy);
        expect(() => requireGeneratedSetPublicationBinding(copy), name)
          .toThrow("GENERATION_RECOVERY_REQUIRED");
      }
      // 未改动的 round-trip copy 保持合法且 identity 不变。
      expect(requireGeneratedSetPublicationBinding(base)).toEqual(plan.binding);
      expect(generatedSetPublicationBindingDigest(base)).toBe(
        plan.publicationBindingDigest,
      );
    } finally {
      fixture.close();
    }
  });

  test("catalog evidence stays out of the binding preimage and cannot produce a second binding identity", () => {
    const fixture = marbleFixture();
    try {
      const { plan } = publicationPlan(fixture);
      expect(JSON.stringify(plan.binding)).not.toContain("catalog");
      expect(JSON.stringify(plan.binding)).not.toContain("bindingDigest");

      // 只改动 derived catalog 证据：binding bytes 不变、identity 不变、catalog digest 改变。
      const alternateCatalog = {
        ...plan.catalogBody,
        publicationBindingDigest: "0".repeat(64),
      };
      expect(alternateCatalog).not.toEqual(plan.catalogBody);
      expect(JSON.stringify(alternateCatalog)).not.toBe(JSON.stringify(plan.catalogBody));
      expect(generatedSetPublicationBindingDigest(plan.binding)).toBe(
        plan.publicationBindingDigest,
      );
      // catalog 不进入 binding preimage：binding digest 与 catalog digest 相互独立推导。
      expect(plan.catalogDigest).not.toBe(plan.publicationBindingDigest);

      // 同输入重新 derive 的 plan 是 equal-but-distinct 对象，binding identity 完全一致。
      const second = publicationPlan(fixture);
      expect(second.plan).toEqual(plan);
      expect(second.plan).not.toBe(plan);
      expect(second.plan.binding).toEqual(plan.binding);
      expect(second.plan.publicationBindingDigest).toBe(plan.publicationBindingDigest);
      expect(second.plan.catalogDigest).toBe(plan.catalogDigest);
    } finally {
      fixture.close();
    }
  });

  test("forged/copied/cross-root/cross-plan/cross-snapshot plans fail origin/revalidation; original is checkable repeatedly", () => {
    const fixture = marbleFixture();
    const foreign = hunyuanFixture();
    try {
      const { plan, snapshot } = publicationPlan(fixture);
      expect(requireGeneratedSetPublicationPlanOrigin(plan)).toBe(plan);
      expect(requireGeneratedSetPublicationPlanOrigin(plan)).toBe(plan);

      // forged / copied plan objects 一律拒绝。
      expect(() => requireGeneratedSetPublicationPlanOrigin(
        JSON.parse(JSON.stringify(plan)),
      )).toThrow("GENERATION_RECOVERY_REQUIRED");
      expect(() => requireGeneratedSetPublicationPlanOrigin(
        { ...plan },
      )).toThrow("GENERATION_RECOVERY_REQUIRED");

      // 伪造 candidate plan 或 storage snapshot 在 derive 前被拒绝。
      expect(() => deriveGeneratedSetPublicationPlan(
        fixture.root,
        JSON.parse(JSON.stringify(fixture.plan)),
        snapshot,
      )).toThrow("GENERATION_RECOVERY_REQUIRED");
      expect(() => deriveGeneratedSetPublicationPlan(
        fixture.root,
        fixture.plan,
        JSON.parse(JSON.stringify(snapshot)),
      )).toThrow("GENERATION_RECOVERY_REQUIRED");

      // cross-root：同一 path 的另一个 root 对象不是 origin root。
      const secondRoot = openDataRoot(fixture.rootPath);
      try {
        expect(() => deriveGeneratedSetPublicationPlan(
          secondRoot,
          fixture.plan,
          snapshot,
        )).toThrow("GENERATION_RECOVERY_REQUIRED");
      } finally {
        secondRoot.close();
      }

      // cross-plan：equal-but-distinct candidate plan 不是 origin plan。
      const secondPlan = deriveSecondPlan(fixture);
      expect(secondPlan).toEqual(fixture.plan);
      expect(secondPlan).not.toBe(fixture.plan);
      expect(() => deriveGeneratedSetPublicationPlan(
        fixture.root,
        secondPlan,
        snapshot,
      )).toThrow("GENERATION_RECOVERY_REQUIRED");

      // cross-snapshot：另一个 root 的 snapshot 不是 origin snapshot。
      const foreignSnapshot = inspectGeneratedSetStoragePreflight(
        foreign.root,
        foreign.plan,
      );
      expect(() => deriveGeneratedSetPublicationPlan(
        fixture.root,
        fixture.plan,
        foreignSnapshot,
      )).toThrow("GENERATION_RECOVERY_REQUIRED");
    } finally {
      fixture.close();
      foreign.close();
    }
  });

  test("storage drift between preflight and publication-plan derivation fails before returning a plan", () => {
    const targetAppeared = marbleFixture();
    try {
      const snapshot = inspectGeneratedSetStoragePreflight(
        targetAppeared.root,
        targetAppeared.plan,
      );
      const spz = targetAppeared.plan.orderedMembers[0]!;
      writePublicTargets(targetAppeared, [
        {
          relativePath: generatedArtifactContentRecordPath(spz.contentRecord.recordDigest),
          bytes: canonicalJsonBytes(spz.contentRecord),
        },
      ]);
      expect(() => deriveGeneratedSetPublicationPlan(
        targetAppeared.root,
        targetAppeared.plan,
        snapshot,
      )).toThrow("GENERATION_RECOVERY_REQUIRED");
    } finally {
      targetAppeared.close();
    }

    const candidateDrift = marbleFixture();
    try {
      const snapshot = inspectGeneratedSetStoragePreflight(
        candidateDrift.root,
        candidateDrift.plan,
      );
      const colliderPath = join(
        candidateDrift.downloadsPath,
        candidateDrift.members[1]!.candidateName,
      );
      writeFile0600(colliderPath, createGlbVariantFixture());
      expect(() => deriveGeneratedSetPublicationPlan(
        candidateDrift.root,
        candidateDrift.plan,
        snapshot,
      )).toThrow("GENERATION_RECOVERY_REQUIRED");
    } finally {
      candidateDrift.close();
    }

    const ancestorAppeared = marbleFixture();
    try {
      const snapshot = inspectGeneratedSetStoragePreflight(
        ancestorAppeared.root,
        ancestorAppeared.plan,
      );
      mkdirp0700(ancestorAppeared.rootPath, "artifacts/records");
      expect(() => deriveGeneratedSetPublicationPlan(
        ancestorAppeared.root,
        ancestorAppeared.plan,
        snapshot,
      )).toThrow("GENERATION_RECOVERY_REQUIRED");
    } finally {
      ancestorAppeared.close();
    }

    const closedRoot = marbleFixture();
    try {
      const snapshot = inspectGeneratedSetStoragePreflight(
        closedRoot.root,
        closedRoot.plan,
      );
      closedRoot.root.close();
      expect(() => deriveGeneratedSetPublicationPlan(
        closedRoot.root,
        closedRoot.plan,
        snapshot,
      )).toThrow();
    } finally {
      rmSync(closedRoot.rootPath, { recursive: true, force: true });
    }
  });

  test("plan serialization contains no raw bytes, absolute path, signed URL, credential, provider request, or mutable object", () => {
    const marble = marbleFixture();
    const hunyuan = hunyuanFixture();
    try {
      const marblePlan = publicationPlan(marble).plan;
      const hunyuanPlan = publicationPlan(hunyuan).plan;
      for (const [fixture, plan] of [
        [marble, marblePlan],
        [hunyuan, hunyuanPlan],
      ] as const) {
        const serialized = JSON.stringify(plan);
        expect(serialized).not.toContain(fixture.rootPath);
        expect(serialized).not.toContain("downloads");
        expect(serialized).not.toContain("candidateName");
        expect(serialized).not.toContain("providerRequest");
        expect(serialized).not.toContain("https://");
        expect(serialized).not.toContain("http://");
        expect(serialized).not.toContain("signed");
        expect(serialized).not.toContain("credential");
        expect(serialized).not.toContain("operation_1");
        expect(serialized).not.toContain("12345");
        expect(serialized).not.toContain("world_1");
        expect(serialized).not.toContain("collider_mesh_url");
        expect(serialized).not.toContain("A bounded generated world");
        expect(serialized).not.toContain("A bounded generated object");
        assertNoBinaryValues(plan);
        assertDeepFrozen(plan);
      }
    } finally {
      marble.close();
      hunyuan.close();
    }
  });

  test("exact result decoder accepts success and aborted-before-publish, rejecting identity drift", () => {
    const fixture = marbleFixture();
    try {
      const { plan } = publicationPlan(fixture);
      const binding = plan.binding;
      const decoded = requireGeneratedSetPublicationResult(plan.expectedResult, binding);
      expect(decoded).toEqual(plan.expectedResult);
      expect(Object.isFrozen(decoded)).toBe(true);

      const success = {
        schemaVersion: 1,
        operationId: binding.operationId,
        bindingDigest: plan.publicationBindingDigest,
        variant: "success" as const,
        publishedIdentity: plan.artifactSetDigest,
      };
      expect(requireGeneratedSetPublicationResult(success, binding)).toEqual(success);

      const aborted = {
        schemaVersion: 1,
        operationId: binding.operationId,
        bindingDigest: plan.publicationBindingDigest,
        variant: "aborted-before-publish" as const,
        code: "PUBLISH_ABORTED",
      };
      expect(requireGeneratedSetPublicationResult(aborted, binding)).toEqual(aborted);

      const resultDrift: Array<{ readonly name: string; readonly value: unknown }> = [
        {
          name: "published identity is a member content digest",
          value: { ...success, publishedIdentity: plan.orderedContentRecordDigests[0]! },
        },
        {
          name: "forged binding digest",
          value: { ...success, bindingDigest: "0".repeat(64) },
        },
        {
          name: "forged operation id",
          value: { ...success, operationId: `op:${"0".repeat(64)}` },
        },
        { name: "schema version", value: { ...success, schemaVersion: 2 } },
        { name: "extra key", value: { ...success, extra: true } },
        { name: "missing published identity", value: { schemaVersion: 1, operationId: binding.operationId, bindingDigest: plan.publicationBindingDigest, variant: "success" } },
        {
          name: "aborted wrong digest",
          value: { ...aborted, bindingDigest: "0".repeat(64) },
        },
        { name: "aborted lowercase code", value: { ...aborted, code: "lowercase" } },
        { name: "aborted oversized code", value: { ...aborted, code: "A".repeat(97) } },
        { name: "aborted missing code", value: { schemaVersion: 1, operationId: binding.operationId, bindingDigest: plan.publicationBindingDigest, variant: "aborted-before-publish" } },
        { name: "unknown variant", value: { ...success, variant: "failed" } },
      ];
      for (const { name, value } of resultDrift) {
        expect(() => requireGeneratedSetPublicationResult(value, binding), name)
          .toThrow("GENERATION_RECOVERY_REQUIRED");
      }
    } finally {
      fixture.close();
    }
  });

  test("source scan: publication module has no writer/CAS/journal/startup/framework dependency and stays package-private", () => {
    const publicationSource = readFileSync(
      join(import.meta.dir, "generated-artifact-publication.ts"),
      "utf8",
    );
    const layoutSource = readFileSync(
      join(import.meta.dir, "generated-artifact-layout.ts"),
      "utf8",
    );
    for (const token of [
      "mkdirSync", "writeFileSync", "linkSync", "unlinkSync", "renameSync",
      "fsyncSync", "rmSync", "openSync", "writeSync", "truncateSync",
      "readFileSync", "readdirSync", "opendirSync",
    ]) {
      expect(publicationSource).not.toContain(token);
      expect(layoutSource).not.toContain(token);
    }
    for (const dependency of [
      "./operation-journal",
      "./startup-recovery",
      "./artifact-store",
      "./world-project-manifest",
      "./project-store",
      "./bundle-store",
      "./world-project-runtime",
      "./first-generation-coordinator",
      "./generation-record-journal",
      "./first-generation-capacity",
      "./data-root-capacity",
      "./generation-namespace-installer",
      "./generation-birth-journal",
      "./generation-state",
      "./data-root-lease",
    ]) {
      expect(publicationSource).not.toContain(`from "${dependency}"`);
    }
    for (const framework of [
      "three",
      "@mujoco",
      "solid-js",
      "@oh-my-pi",
      "agent-gateway",
      "apps/studio",
    ]) {
      expect(publicationSource).not.toContain(framework);
    }
    const indexSource = readFileSync(join(import.meta.dir, "index.ts"), "utf8");
    expect(indexSource).not.toContain("generated-artifact-publication");
    expect(indexSource).not.toContain("generated-artifact-layout");
  });
});
