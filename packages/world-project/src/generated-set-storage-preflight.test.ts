import { describe, expect, test } from "bun:test";
import {
  chmodSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  symlinkSync,
  unlinkSync,
  utimesSync,
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
  generatedArtifactContentRecordPath,
  generatedArtifactProvenanceRecordPath,
  generatedArtifactSetRecordPath,
} from "./generated-artifact-layout";
import type { GeneratedArtifactOutputRole } from "./generation-output-contracts";
import {
  inspectGeneratedSetStoragePreflight,
  revalidateGeneratedSetStoragePreflight,
  type GeneratedSetStoragePreflightSnapshotV1,
  type GeneratedSetStorageTargetObservationV1,
} from "./generated-set-storage-preflight";

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
          idempotencyKey: "storage-preflight-marble",
        }
      : {
          provider, model: "3.1", prompt: "A bounded generated object",
          costUnknownAccepted: true, waitForCompletionAndDownload: true,
          idempotencyKey: "storage-preflight-hunyuan",
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

function planFixture(
  provider: "worldlabs-marble-v1" | "hunyuan-ai3d-v1",
  members: readonly FixtureMember[],
): PlanFixture {
  const parent = mkdtempSync(join(tmpdir(), "dh017-preflight-"));
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
  const orderedMembers = members.map(({ outputRole, bytes }) => {
    const candidateName = `${outputRole}-c1-a1-${checkpoint}.bin`;
    writeFile0600(join(downloadsPath, candidateName), bytes);
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
  const plan = deriveGeneratedSetCandidatePlan(
    durableIntent,
    remoteBound,
    activePayload,
    inspections,
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

function allTargetObservations(
  snapshot: GeneratedSetStoragePreflightSnapshotV1,
): readonly GeneratedSetStorageTargetObservationV1[] {
  return [
    ...snapshot.content.flatMap((entry) => [
      entry.bytesCas,
      entry.contentRecordTarget,
      entry.byBytesPointerTarget,
    ]),
    ...snapshot.members.flatMap((member) => [
      member.privateCandidate,
      member.provenanceTarget,
    ]),
    snapshot.setTarget,
  ];
}

function targetAt(
  snapshot: GeneratedSetStoragePreflightSnapshotV1,
  relativePath: string,
): GeneratedSetStorageTargetObservationV1 {
  const matches = allTargetObservations(snapshot).filter(
    (entry) => entry.relativePath === relativePath,
  );
  expect(matches).toHaveLength(1);
  return matches[0]!;
}

function expectAbsent(
  observation: GeneratedSetStorageTargetObservationV1,
  deepestExistingAncestor: string,
  missingSegments: readonly string[],
): void {
  expect(observation.status.kind).toBe("absent");
  if (observation.status.kind !== "absent") return;
  expect(observation.status.deepestExistingAncestor).toBe(deepestExistingAncestor);
  expect(observation.status.ancestorIdentity.mode).toBe(0o700);
  expect(observation.status.missingSegments).toEqual(missingSegments);
}

function expectExisting(observation: GeneratedSetStorageTargetObservationV1): void {
  expect(observation.status.kind).toBe("existing");
  if (observation.status.kind !== "existing") return;
  expect(observation.status.fileIdentity.mode).toBe(0o600);
  expect(observation.status.fileIdentity.size).toBeGreaterThan(0);
}

function tree(path: string, prefix = ""): readonly string[] {
  const entries: string[] = [];
  for (const entry of readdirSync(path, { withFileTypes: true }).sort((a, b) =>
    a.name.localeCompare(b.name))) {
    const name = `${prefix}${entry.name}`;
    entries.push(`${name}:${entry.isDirectory() ? "d" : "f"}`);
    if (entry.isDirectory()) entries.push(...tree(join(path, entry.name), `${name}/`));
  }
  return entries;
}

function fileBytes(path: string): Map<string, Buffer> {
  const result = new Map<string, Buffer>();
  for (const entry of tree(path)) {
    if (!entry.endsWith(":f")) continue;
    const relative = entry.slice(0, -2);
    result.set(relative, readFileSync(join(path, relative)));
  }
  return result;
}

function assertNoBinaryValues(value: unknown, path = "$"): void {
  if (
    value instanceof Uint8Array ||
    value instanceof ArrayBuffer ||
    ArrayBuffer.isView(value) ||
    typeof value === "bigint"
  ) {
    throw new Error(`snapshot 包含二进制/大整数值 at ${path}`);
  }
  if (value === null || typeof value !== "object") return;
  for (const [key, entry] of Object.entries(value)) {
    assertNoBinaryValues(entry, `${path}.${key}`);
  }
}

function capture(path: string): { readonly tree: readonly string[]; readonly bytes: Map<string, Buffer> } {
  return { tree: tree(path), bytes: fileBytes(path) };
}

describe("DH-017 generated-set storage preflight", () => {
  test("fresh Marble root: every public target is exact absent under the root", () => {
    const fixture = marbleFixture();
    try {
      const snapshot = inspectGeneratedSetStoragePreflight(fixture.root, fixture.plan);
      expect(snapshot.generationId).toBe(fixture.plan.generationId);
      expect(snapshot.artifactSetDigest).toBe(fixture.plan.artifactSetRecord.artifactSetDigest);
      expect(snapshot.content).toHaveLength(2);
      expect(snapshot.members).toHaveLength(2);
      const rootStat = lstatSync(fixture.rootPath, { bigint: true });
      expect(snapshot.rootIdentity).toEqual({
        dev: rootStat.dev.toString(),
        ino: rootStat.ino.toString(),
      });
      for (const observation of allTargetObservations(snapshot)) {
        if (observation.relativePath.startsWith("receipts/")) {
          expectExisting(observation);
          continue;
        }
        expectAbsent(
          observation,
          "",
          observation.relativePath.split("/"),
        );
      }
      expect(
        snapshot.content.flatMap((entry) => [entry.bytesCas, entry.contentRecordTarget, entry.byBytesPointerTarget])
          .every((entry) => entry.status.kind === "absent"),
      ).toBe(true);
      expect(Object.isFrozen(snapshot)).toBe(true);
      expect(Object.isFrozen(snapshot.members[0]?.privateCandidate.status)).toBe(true);
      assertNoBinaryValues(snapshot);
      expect(JSON.stringify(snapshot)).not.toContain(fixture.rootPath);
    } finally {
      fixture.close();
    }
  });

  test("fresh Hunyuan root: all public targets absent; existing artifacts ancestor narrows missing segments", () => {
    const fixture = hunyuanFixture();
    try {
      mkdirp0700(fixture.rootPath, "artifacts");
      const snapshot = inspectGeneratedSetStoragePreflight(fixture.root, fixture.plan);
      expect(snapshot.content).toHaveLength(1);
      const bytesTarget = targetAt(
        snapshot,
        generatedArtifactBytesPath(snapshot.content[0]!.contentDigest),
      );
      expectAbsent(bytesTarget, "artifacts", [
        "sha256",
        snapshot.content[0]!.contentDigest,
      ]);
      const contentRecordTarget = targetAt(
        snapshot,
        generatedArtifactContentRecordPath(
          snapshot.content[0]!.contentRecord.recordDigest,
        ),
      );
      expect(contentRecordTarget.status.kind).toBe("absent");
      if (contentRecordTarget.status.kind === "absent") {
        expect(contentRecordTarget.status.deepestExistingAncestor).toBe("artifacts");
        expect(contentRecordTarget.status.ancestorIdentity.mode).toBe(0o700);
        expect(contentRecordTarget.status.missingSegments).toEqual([
          "records",
          "content",
          "sha256",
          snapshot.content[0]!.contentRecord.recordDigest,
        ]);
      }
    } finally {
      fixture.close();
    }
  });

  test("mixed exact replay: shared bytes/content/by-bytes existing while provider-specific targets stay absent", () => {
    const fixture = marbleFixture();
    try {
      const targets = publicTargets(fixture);
      // 只发布 spz bytes/content/by-bytes 与 set；glb 内容与两个 provenance 全部 absent。
      const spz = fixture.plan.orderedMembers[0]!;
      const published = targets.filter((target) =>
        target.relativePath === generatedArtifactBytesPath(spz.contentRecord.digest) ||
        target.relativePath === generatedArtifactContentRecordPath(spz.contentRecord.recordDigest) ||
        target.relativePath === generatedArtifactByBytesPointerPath(spz.contentRecord.digest) ||
        target.relativePath === generatedArtifactSetRecordPath(fixture.plan.artifactSetRecord.artifactSetDigest)
      );
      writePublicTargets(fixture, published);

      const snapshot = inspectGeneratedSetStoragePreflight(fixture.root, fixture.plan);
      const spzContent = snapshot.content.find(
        (entry) => entry.contentRecord.recordDigest === spz.contentRecord.recordDigest,
      )!;
      const glbContent = snapshot.content.find(
        (entry) => entry.contentRecord.recordDigest !== spz.contentRecord.recordDigest,
      )!;
      expectExisting(spzContent.bytesCas);
      expectExisting(spzContent.contentRecordTarget);
      expectExisting(spzContent.byBytesPointerTarget);
      // spz bytes 发布创建了 artifacts/sha256；glb 内容因此只在最深已存在祖先下缺失。
      expectAbsent(glbContent.bytesCas, "artifacts/sha256", [glbContent.contentDigest]);
      expectAbsent(glbContent.contentRecordTarget, "artifacts/records/content/sha256", [
        glbContent.contentRecord.recordDigest,
      ]);
      expectAbsent(glbContent.byBytesPointerTarget, "artifacts/records/content/by-bytes/sha256", [
        `${glbContent.contentDigest}.json`,
      ]);
      expect(
        snapshot.members.every((member) => member.provenanceTarget.status.kind === "absent"),
      ).toBe(true);
      expectExisting(snapshot.setTarget);
      const spzMember = snapshot.members.find((member) => member.outputRole === "world-spz-500k")!;
      const glbMember = snapshot.members.find((member) => member.outputRole === "world-collider-glb")!;
      expect(spzMember.contentObservationIndex).toBe(snapshot.content.indexOf(spzContent));
      expect(glbMember.contentObservationIndex).toBe(snapshot.content.indexOf(glbContent));
    } finally {
      fixture.close();
    }
  });

  test("byte-identical Marble collider / Hunyuan object share identical digest-derived content evidence, keep separate provenance/set", () => {
    const marble = marbleFixture();
    const hunyuan = hunyuanFixture();
    try {
      const marbleBytes = marble.members.find((member) => member.outputRole === "world-collider-glb")!.bytes;
      const hunyuanBytes = hunyuan.members.find((member) => member.outputRole === "object-glb")!.bytes;
      expect(Buffer.from(marbleBytes).equals(Buffer.from(hunyuanBytes))).toBe(true);
      writePublicTargets(marble, publicTargets(marble));
      writePublicTargets(hunyuan, publicTargets(hunyuan));

      const marbleSnapshot = inspectGeneratedSetStoragePreflight(marble.root, marble.plan);
      const hunyuanSnapshot = inspectGeneratedSetStoragePreflight(hunyuan.root, hunyuan.plan);

      const marbleGlbContent = marbleSnapshot.content.find(
        (entry) => entry.contentRecord.recordDigest ===
          marble.plan.orderedMembers[1]!.contentRecord.recordDigest,
      )!;
      const hunyuanContent = hunyuanSnapshot.content[0]!;
      // content observation 与 plan member 1:1；跨 plan 共享内容经由相同 digest
      // 派生的 target path 与 plan-derived record 自然去重，无 plan 内 dedupe 分支。
      expect(hunyuanSnapshot.content).toHaveLength(1);
      expect(marbleSnapshot.content).toHaveLength(2);
      const contentLevel = (entry: typeof marbleGlbContent) => ({
        contentDigest: entry.contentDigest,
        contentRecord: entry.contentRecord,
        byBytesPointer: entry.byBytesPointer,
        bytesCasPath: entry.bytesCas.relativePath,
        contentRecordPath: entry.contentRecordTarget.relativePath,
        byBytesPointerPath: entry.byBytesPointerTarget.relativePath,
      });
      expect(contentLevel(marbleGlbContent)).toEqual(contentLevel(hunyuanContent));
      expect(marbleGlbContent.contentRecord.recordDigest)
        .toBe(hunyuanContent.contentRecord.recordDigest);
      expect(marbleGlbContent.bytesCas.relativePath)
        .toBe(hunyuanContent.bytesCas.relativePath);
      // file identity 是各 root 私有观察，不跨 root 比较。
      // provenance/set 保持 provider-specific 分离。
      const marbleGlbMember = marbleSnapshot.members.find(
        (member) => member.outputRole === "world-collider-glb",
      )!;
      const hunyuanMember = hunyuanSnapshot.members[0]!;
      expect(marbleGlbMember.provenanceRecord.recordDigest)
        .not.toBe(hunyuanMember.provenanceRecord.recordDigest);
      expect(marbleGlbMember.provenanceTarget.relativePath)
        .not.toBe(hunyuanMember.provenanceTarget.relativePath);
      expect(marbleSnapshot.artifactSetDigest).not.toBe(hunyuanSnapshot.artifactSetDigest);
      expect(hunyuanMember.contentObservationIndex).toBe(0);
    } finally {
      marble.close();
      hunyuan.close();
    }
  });

  test("private candidate missing / wrong mode / symlink / wrong type fail closed", () => {
    const cases: Array<{ readonly name: string; readonly mutate: (fixture: PlanFixture) => void }> = [
      {
        name: "missing",
        mutate: (fixture) => {
          unlinkSync(join(fixture.downloadsPath, fixture.members[0]!.candidateName));
        },
      },
      {
        name: "wrong mode",
        mutate: (fixture) => {
          chmodSync(join(fixture.downloadsPath, fixture.members[0]!.candidateName), 0o644);
        },
      },
      {
        name: "symlink",
        mutate: (fixture) => {
          const path = join(fixture.downloadsPath, fixture.members[0]!.candidateName);
          unlinkSync(path);
          symlinkSync(join(fixture.downloadsPath, fixture.members[1]!.candidateName), path);
        },
      },
      {
        name: "wrong type",
        mutate: (fixture) => {
          const path = join(fixture.downloadsPath, fixture.members[0]!.candidateName);
          unlinkSync(path);
          mkdirSync(path, { mode: 0o700, recursive: false });
        },
      },
    ];
    for (const { name, mutate } of cases) {
      const fixture = marbleFixture();
      try {
        mutate(fixture);
        expect(
          () => inspectGeneratedSetStoragePreflight(fixture.root, fixture.plan),
          name,
        ).toThrow("GENERATION_RECOVERY_REQUIRED");
      } finally {
        fixture.close();
      }
    }
  });

  test("private candidate same-bytes replacement inode and body drift fail closed", () => {
    const replacement = marbleFixture();
    try {
      const candidatePath = join(replacement.downloadsPath, replacement.members[0]!.candidateName);
      const originalBytes = readFileSync(candidatePath);
      unlinkSync(candidatePath);
      writeFile0600(candidatePath, originalBytes);
      expect(
        () => inspectGeneratedSetStoragePreflight(replacement.root, replacement.plan),
      ).toThrow("GENERATION_RECOVERY_REQUIRED");
    } finally {
      replacement.close();
    }

    const drift = marbleFixture();
    try {
      const colliderPath = join(drift.downloadsPath, drift.members[1]!.candidateName);
      writeFile0600(colliderPath, createGlbVariantFixture());
      expect(
        () => inspectGeneratedSetStoragePreflight(drift.root, drift.plan),
      ).toThrow("GENERATION_RECOVERY_REQUIRED");
    } finally {
      drift.close();
    }

    const hunyuanDrift = hunyuanFixture();
    try {
      const objectPath = join(hunyuanDrift.downloadsPath, hunyuanDrift.members[0]!.candidateName);
      writeFile0600(objectPath, createGlbVariantFixture());
      expect(
        () => inspectGeneratedSetStoragePreflight(hunyuanDrift.root, hunyuanDrift.plan),
      ).toThrow("GENERATION_RECOVERY_REQUIRED");
    } finally {
      hunyuanDrift.close();
    }
  });

  test("public wrong type / symlink / noncanonical JSON / duplicate key / wrong record / bytes drift fail closed", () => {
    const wrongType = marbleFixture();
    try {
      const spz = wrongType.plan.orderedMembers[0]!;
      const contentPath = join(
        wrongType.rootPath,
        generatedArtifactContentRecordPath(spz.contentRecord.recordDigest),
      );
      mkdirp0700(wrongType.rootPath, "artifacts/records/content/sha256");
      mkdirSync(contentPath, { mode: 0o700, recursive: false });
      expect(() => inspectGeneratedSetStoragePreflight(wrongType.root, wrongType.plan))
        .toThrow("GENERATION_RECOVERY_REQUIRED");
    } finally {
      wrongType.close();
    }

    const symlink = marbleFixture();
    try {
      const spz = symlink.plan.orderedMembers[0]!;
      const pointerPath = join(
        symlink.rootPath,
        generatedArtifactByBytesPointerPath(spz.contentRecord.digest),
      );
      mkdirp0700(symlink.rootPath, "artifacts/records/content/by-bytes/sha256");
      const target = join(symlink.downloadsPath, symlink.members[0]!.candidateName);
      symlinkSync(target, pointerPath);
      expect(() => inspectGeneratedSetStoragePreflight(symlink.root, symlink.plan))
        .toThrow("GENERATION_RECOVERY_REQUIRED");
    } finally {
      symlink.close();
    }

    const noncanonical = marbleFixture();
    try {
      const targets = publicTargets(noncanonical);
      const spz = noncanonical.plan.orderedMembers[0]!;
      const pointer = targets.find(
        (target) => target.relativePath ===
          generatedArtifactByBytesPointerPath(spz.contentRecord.digest),
      )!;
      const canonical = new TextDecoder().decode(pointer.bytes);
      const comma = canonical.indexOf(",");
      const scrambled = `${canonical.slice(comma + 1, -1)},${canonical.slice(1, comma + 1)}}`;
      writePublicTargets(noncanonical, [
        { relativePath: pointer.relativePath, bytes: new TextEncoder().encode(scrambled) },
      ]);
      expect(() => inspectGeneratedSetStoragePreflight(noncanonical.root, noncanonical.plan))
        .toThrow("GENERATION_RECOVERY_REQUIRED");
    } finally {
      noncanonical.close();
    }

    const duplicateKey = marbleFixture();
    try {
      const spz = duplicateKey.plan.orderedMembers[0]!;
      const pointerPath = generatedArtifactByBytesPointerPath(spz.contentRecord.digest);
      const pointer = publicTargets(duplicateKey).find(
        (target) => target.relativePath === pointerPath,
      )!;
      const canonical = new TextDecoder().decode(pointer.bytes);
      const comma = canonical.indexOf(",");
      const duplicated = `${canonical.slice(0, comma + 1)}${canonical.slice(1, comma + 1)}${canonical.slice(comma + 1)}`;
      writePublicTargets(duplicateKey, [
        { relativePath: pointerPath, bytes: new TextEncoder().encode(duplicated) },
      ]);
      expect(() => inspectGeneratedSetStoragePreflight(duplicateKey.root, duplicateKey.plan))
        .toThrow("GENERATION_RECOVERY_REQUIRED");
    } finally {
      duplicateKey.close();
    }

    const wrongRecord = marbleFixture();
    const foreign = hunyuanFixture();
    try {
      const spz = wrongRecord.plan.orderedMembers[0]!;
      const provenancePath = generatedArtifactProvenanceRecordPath(
        spz.provenanceRecord.recordDigest,
      );
      writePublicTargets(wrongRecord, [
        {
          relativePath: provenancePath,
          bytes: canonicalJsonBytes(foreign.plan.orderedMembers[0]!.provenanceRecord),
        },
      ]);
      expect(() => inspectGeneratedSetStoragePreflight(wrongRecord.root, wrongRecord.plan))
        .toThrow("GENERATION_RECOVERY_REQUIRED");
    } finally {
      wrongRecord.close();
      foreign.close();
    }

    const bytesDrift = marbleFixture();
    try {
      const spz = bytesDrift.plan.orderedMembers[0]!;
      writePublicTargets(bytesDrift, [
        {
          relativePath: generatedArtifactBytesPath(spz.contentRecord.digest),
          bytes: createGlbVariantFixture(),
        },
      ]);
      expect(() => inspectGeneratedSetStoragePreflight(bytesDrift.root, bytesDrift.plan))
        .toThrow("GENERATION_RECOVERY_REQUIRED");
    } finally {
      bytesDrift.close();
    }
  });

  test("near-revalidation repeats exactly and rejects forged / cross-root / cross-plan snapshots", () => {
    const fixture = marbleFixture();
    try {
      writePublicTargets(fixture, publicTargets(fixture));
      const snapshot = inspectGeneratedSetStoragePreflight(fixture.root, fixture.plan);
      revalidateGeneratedSetStoragePreflight(snapshot, fixture.root, fixture.plan);
      revalidateGeneratedSetStoragePreflight(snapshot, fixture.root, fixture.plan);

      const forged = JSON.parse(JSON.stringify(snapshot)) as GeneratedSetStoragePreflightSnapshotV1;
      expect(() => revalidateGeneratedSetStoragePreflight(forged, fixture.root, fixture.plan))
        .toThrow("GENERATION_RECOVERY_REQUIRED");

      const secondRoot = openDataRoot(fixture.rootPath);
      try {
        expect(() => revalidateGeneratedSetStoragePreflight(snapshot, secondRoot, fixture.plan))
          .toThrow("GENERATION_RECOVERY_REQUIRED");
      } finally {
        secondRoot.close();
      }

      // 同输入重新 derive 的 plan 是 equal-but-distinct 对象，不是原 origin plan。
      const secondPlan = deriveSecondPlan(fixture);
      expect(secondPlan).toEqual(fixture.plan);
      expect(secondPlan).not.toBe(fixture.plan);
      expect(() => revalidateGeneratedSetStoragePreflight(snapshot, fixture.root, secondPlan))
        .toThrow("GENERATION_RECOVERY_REQUIRED");
    } finally {
      fixture.close();
    }
  });

  test("near-revalidation rejects ancestor/target/body/inode/mtime drift", () => {
    const ancestorAppeared = marbleFixture();
    try {
      const snapshot = inspectGeneratedSetStoragePreflight(ancestorAppeared.root, ancestorAppeared.plan);
      mkdirp0700(ancestorAppeared.rootPath, "artifacts/records");
      expect(() => revalidateGeneratedSetStoragePreflight(snapshot, ancestorAppeared.root, ancestorAppeared.plan))
        .toThrow("GENERATION_RECOVERY_REQUIRED");
    } finally {
      ancestorAppeared.close();
    }

    const targetAppeared = marbleFixture();
    try {
      const snapshot = inspectGeneratedSetStoragePreflight(targetAppeared.root, targetAppeared.plan);
      const spz = targetAppeared.plan.orderedMembers[0]!;
      writePublicTargets(targetAppeared, [
        {
          relativePath: generatedArtifactContentRecordPath(spz.contentRecord.recordDigest),
          bytes: canonicalJsonBytes(spz.contentRecord),
        },
      ]);
      expect(() => revalidateGeneratedSetStoragePreflight(snapshot, targetAppeared.root, targetAppeared.plan))
        .toThrow("GENERATION_RECOVERY_REQUIRED");
    } finally {
      targetAppeared.close();
    }

    const inodeReplaced = marbleFixture();
    try {
      writePublicTargets(inodeReplaced, publicTargets(inodeReplaced));
      const snapshot = inspectGeneratedSetStoragePreflight(inodeReplaced.root, inodeReplaced.plan);
      const spz = inodeReplaced.plan.orderedMembers[0]!;
      const contentPath = join(
        inodeReplaced.rootPath,
        generatedArtifactContentRecordPath(spz.contentRecord.recordDigest),
      );
      const bytes = readFileSync(contentPath);
      unlinkSync(contentPath);
      writeFile0600(contentPath, bytes);
      expect(() => revalidateGeneratedSetStoragePreflight(snapshot, inodeReplaced.root, inodeReplaced.plan))
        .toThrow("GENERATION_RECOVERY_REQUIRED");
    } finally {
      inodeReplaced.close();
    }

    const bodyDrift = marbleFixture();
    try {
      writePublicTargets(bodyDrift, publicTargets(bodyDrift));
      const snapshot = inspectGeneratedSetStoragePreflight(bodyDrift.root, bodyDrift.plan);
      const spz = bodyDrift.plan.orderedMembers[0]!;
      const contentPath = join(
        bodyDrift.rootPath,
        generatedArtifactContentRecordPath(spz.contentRecord.recordDigest),
      );
      writeFile0600(contentPath, canonicalJsonBytes(spz.byBytesPointer));
      expect(() => revalidateGeneratedSetStoragePreflight(snapshot, bodyDrift.root, bodyDrift.plan))
        .toThrow("GENERATION_RECOVERY_REQUIRED");
    } finally {
      bodyDrift.close();
    }

    const mtimeDrift = marbleFixture();
    try {
      writePublicTargets(mtimeDrift, publicTargets(mtimeDrift));
      const snapshot = inspectGeneratedSetStoragePreflight(mtimeDrift.root, mtimeDrift.plan);
      const spz = mtimeDrift.plan.orderedMembers[0]!;
      const contentPath = join(
        mtimeDrift.rootPath,
        generatedArtifactContentRecordPath(spz.contentRecord.recordDigest),
      );
      utimesSync(contentPath, new Date("2020-01-01T00:00:00.000Z"), new Date("2020-01-01T00:00:00.000Z"));
      expect(() => revalidateGeneratedSetStoragePreflight(snapshot, mtimeDrift.root, mtimeDrift.plan))
        .toThrow("GENERATION_RECOVERY_REQUIRED");
    } finally {
      mtimeDrift.close();
    }

    const candidateDrift = marbleFixture();
    try {
      writePublicTargets(candidateDrift, publicTargets(candidateDrift));
      const snapshot = inspectGeneratedSetStoragePreflight(candidateDrift.root, candidateDrift.plan);
      const colliderPath = join(candidateDrift.downloadsPath, candidateDrift.members[1]!.candidateName);
      writeFile0600(colliderPath, createGlbVariantFixture());
      expect(() => revalidateGeneratedSetStoragePreflight(snapshot, candidateDrift.root, candidateDrift.plan))
        .toThrow("GENERATION_RECOVERY_REQUIRED");
    } finally {
      candidateDrift.close();
    }

    const closedRoot = marbleFixture();
    try {
      const snapshot = inspectGeneratedSetStoragePreflight(closedRoot.root, closedRoot.plan);
      closedRoot.root.close();
      expect(() => revalidateGeneratedSetStoragePreflight(snapshot, closedRoot.root, closedRoot.plan))
        .toThrow();
    } finally {
      rmSync(closedRoot.rootPath, { recursive: true, force: true });
    }
  });

  test("exact mode rejects special permission bits on private candidates and ancestor directories when preserved", () => {
    const fileBits = marbleFixture();
    try {
      const candidatePath = join(fileBits.downloadsPath, fileBits.members[0]!.candidateName);
      chmodSync(candidatePath, 0o6600); // 0600 + setuid + setgid
      if ((statSync(candidatePath).mode & 0o6000) !== 0) {
        expect(() => inspectGeneratedSetStoragePreflight(fileBits.root, fileBits.plan))
          .toThrow("GENERATION_RECOVERY_REQUIRED");
      }
    } finally {
      fileBits.close();
    }

    const dirBits = marbleFixture();
    try {
      mkdirp0700(dirBits.rootPath, "artifacts");
      chmodSync(join(dirBits.rootPath, "artifacts"), 0o7700); // 0700 + setuid + setgid + sticky
      if ((statSync(join(dirBits.rootPath, "artifacts")).mode & 0o7000) !== 0) {
        expect(() => inspectGeneratedSetStoragePreflight(dirBits.root, dirBits.plan))
          .toThrow("GENERATION_RECOVERY_REQUIRED");
      }
    } finally {
      dirBits.close();
    }
  });

  test("inspect and revalidate leave directory entry sets and file bytes unchanged", () => {
    const fixture = marbleFixture();
    try {
      writePublicTargets(fixture, publicTargets(fixture));
      const before = capture(fixture.rootPath);
      const snapshot = inspectGeneratedSetStoragePreflight(fixture.root, fixture.plan);
      const afterInspect = capture(fixture.rootPath);
      expect(afterInspect.tree).toEqual(before.tree);
      expect([...afterInspect.bytes.entries()]).toEqual([...before.bytes.entries()]);
      revalidateGeneratedSetStoragePreflight(snapshot, fixture.root, fixture.plan);
      const afterRevalidate = capture(fixture.rootPath);
      expect(afterRevalidate.tree).toEqual(before.tree);
      expect([...afterRevalidate.bytes.entries()]).toEqual([...before.bytes.entries()]);
    } finally {
      fixture.close();
    }
  });

  test("source scan: preflight/layout have no mutation or framework dependency and stay package-private", () => {
    const preflightSource = readFileSync(
      join(import.meta.dir, "generated-set-storage-preflight.ts"),
      "utf8",
    );
    const layoutSource = readFileSync(
      join(import.meta.dir, "generated-artifact-layout.ts"),
      "utf8",
    );
    for (const token of [
      "mkdirSync", "writeFileSync", "linkSync", "unlinkSync", "renameSync",
      "fsyncSync", "rmSync", "openSync", "writeSync", "truncateSync",
    ]) {
      expect(preflightSource).not.toContain(token);
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
    ]) {
      expect(preflightSource).not.toContain(`from "${dependency}"`);
    }
    const indexSource = readFileSync(join(import.meta.dir, "index.ts"), "utf8");
    expect(indexSource).not.toContain("generated-set-storage-preflight");
    expect(indexSource).not.toContain("generated-artifact-layout");
  });
});

function deriveSecondPlan(fixture: PlanFixture): GeneratedSetCandidatePlanV1 {
  const provider = fixture.plan.provider;
  const durableIntent = intent(provider);
  const members = fixture.members.map(({ outputRole, bytes }) => {
    const inspection = inspectDynamicArtifactBytes(
      outputRole === "world-spz-500k" ? "spz-v2" : "glb-2.0",
      bytes,
    );
    const stat = lstatSync(join(fixture.downloadsPath, `${outputRole}-c1-a1-${"c".repeat(64)}.bin`), { bigint: true });
    return {
      outputRole,
      downloadAttemptCount: 1,
      stage: "candidate",
      candidate: {
        candidateName: `${outputRole}-c1-a1-${"c".repeat(64)}.bin`,
        attemptCheckpointRecordDigest: "c".repeat(64),
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
      orderedMembers: members,
    },
  };
  return deriveGeneratedSetCandidatePlan(
    durableIntent,
    remoteBound,
    activePayload,
    fixture.members.map(({ outputRole, bytes }) => ({
      outputRole,
      inspection: inspectDynamicArtifactBytes(
        outputRole === "world-spz-500k" ? "spz-v2" : "glb-2.0",
        bytes,
      ),
    })),
  );
}
