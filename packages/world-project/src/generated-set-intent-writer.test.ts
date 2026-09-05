import { afterEach, describe, expect, test } from "bun:test";
import {
  chmodSync,
  linkSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gzipSync } from "node:zlib";

import { canonicalJsonBytes, sha256Hex } from "@demiurges/world";

import {
  bootstrapDataRoot,
  dataRootReceiptIntentPath,
  dataRootReceiptResultPath,
  dataRootStagingPath,
  openDataRoot,
  type OpenedDataRoot,
} from "./data-root";
import {
  acquireDataRootWriterLease,
  type DataRootWriterLease,
} from "./data-root-lease";
import { ensureDataRootLayout } from "./data-root-layout";
import { generationIdDigest } from "./generation-birth";
import { createGenerationBirthPointer } from "./generation-birth";
import {
  GenerationCodecError,
  createGenerationBinding,
  createGenerationIntent,
  requireGenerationRequest,
  type GenerationIntentV1,
} from "./generation-contracts";
import { createInitialDownloadBudget } from "./generation-output-contracts";
import {
  createInitialGenerationStateRecord,
  generationStateRecordDigest,
  generationStateRecordFilename,
} from "./generation-state";
import { GenerationRecordJournal } from "./generation-record-journal";
import { inspectDynamicArtifactBytes } from "./generation-artifact-inspector";
import {
  createGenerationNamespaceBody,
  createGenerationNamespaceInstallBinding,
  generationNamespaceInstallBindingDigest,
  generationNamespaceSeedDigest,
} from "./generation-namespace";
import { deriveGeneratedSetCandidatePlan } from "./generated-set-candidate-plan";
import { inspectGeneratedSetStoragePreflight } from "./generated-set-storage-preflight";
import {
  deriveGeneratedSetPublicationPlan,
  requireGeneratedSetPublicationBinding,
  type GeneratedSetPublicationPlanV1,
} from "./generated-artifact-publication";
import {
  deriveGeneratedSetPublicationEligibility,
  type GeneratedSetPublicationEligibilityV1,
} from "./generated-set-publication-eligibility";
import {
  authorizeGeneratedSetAdmission,
  type GeneratedSetAdmissionCapabilityV1,
} from "./generated-set-admission";
import {
  GENERATED_SET_INTENT_WRITER_TEST_SEAMS,
  requireAdmittedGeneratedSetIntentProvenance,
  writeGeneratedSetPublicationIntent,
  type AdmittedGeneratedSetIntentEvidenceV1,
} from "./generated-set-intent-writer";
import { inspectDataRootCapacity } from "./data-root-capacity-inspection";
import { calculateDataRootCapacity } from "./data-root-capacity";
import {
  readStableDirectoryIdentity,
  syncDirectory,
  writeNewSyncedFile,
} from "./safe-filesystem";
import { operationBindingDigest, type OperationBinding } from "./operation-journal";

const POLL_BUDGET = {
  cycleCount: 1 as const,
  attemptCount: 6,
  cycleStartedAt: "2026-08-15T10:00:02.000Z",
  deadlineAt: "2026-08-15T10:20:02.000Z",
};

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

let intentNonce = 0;

function fixtureIntent(): GenerationIntentV1 {
  intentNonce += 1;
  return createGenerationIntent(createGenerationBinding(requireGenerationRequest({
    provider: "worldlabs-marble-v1",
    model: "marble-1.1",
    prompt: "A bounded intent-writer world",
    costUnknownAccepted: true,
    waitForCompletionAndDownload: true,
    idempotencyKey: `generated-set-intent-writer-${intentNonce}`,
  }), { contractProfile: "worldlabs-openapi-2026-08-15-v1", contractShapeDigest: "a".repeat(64) }), "2026-08-15T10:00:00.000Z");
}

function journalTimestamp(second: number): string {
  return `2026-08-15T10:${String(Math.floor(second / 60)).padStart(2, "0")}:${String(second % 60).padStart(2, "0")}.000Z`;
}

function memberWith(
  budget: Record<string, unknown>,
  index: number,
  member: Record<string, unknown>,
): Record<string, unknown> {
  const orderedMembers = (budget.orderedMembers as Record<string, unknown>[]).map(
    (existing, position) => (position === index ? member : existing),
  );
  return { ...budget, orderedMembers };
}

interface WriterFixture {
  readonly root: OpenedDataRoot;
  readonly lease: DataRootWriterLease;
  readonly rootPath: string;
  readonly intent: GenerationIntentV1;
  readonly downloadsPath: string;
  readonly recordsPath: string;
  readonly journal: GenerationRecordJournal;
  readonly publicationPlan: GeneratedSetPublicationPlanV1;
  readonly eligibility: GeneratedSetPublicationEligibilityV1;
  readonly capability: GeneratedSetAdmissionCapabilityV1;
  readonly recordCount: number;
  close(): Promise<void>;
}

function writePublicIntent(rootPath: string, operationId: string): void {
  const binding: OperationBinding = {
    schemaVersion: 1,
    operationId,
    operationKind: "project.save-as",
    target: { kind: "project", id: "project:intent-writer-test" },
    expectedIdentity: null,
    candidateIdentity: {
      projectRevision: `project-revision:sha256:${"a".repeat(64)}`,
    },
  };
  writeNewSyncedFile(
    join(rootPath, dataRootReceiptIntentPath(operationId)),
    canonicalJsonBytes(binding),
  );
  writeNewSyncedFile(
    join(rootPath, dataRootReceiptResultPath(operationId)),
    canonicalJsonBytes({
      schemaVersion: 1,
      operationId,
      bindingDigest: operationBindingDigest(binding),
      variant: "success",
      publishedIdentity: `project-revision:sha256:${"a".repeat(64)}`,
    }),
  );
  syncDirectory(join(rootPath, "receipts"));
}

async function buildWriterFixture(
  options: {
    readonly publicOperations?: number;
    readonly expectCapacityReached?: boolean;
  } = {},
): Promise<WriterFixture> {
  const members = [
    { outputRole: "world-spz-500k" as const, bytes: createSpzFixture() },
    { outputRole: "world-collider-glb" as const, bytes: createGlbWithPositions([[-1, -2, -3], [4, 5, 6]]) },
  ];

  const parent = mkdtempSync(join(tmpdir(), "dh017-intent-writer-"));
  const rootPath = join(parent, "root");
  bootstrapDataRoot(rootPath);
  const root = openDataRoot(rootPath);
  const acquired = await acquireDataRootWriterLease(root);
  if (acquired.status !== "acquired") throw new Error("test lease unavailable");
  const lease = acquired.lease;
  let closed = false;
  const close = async (): Promise<void> => {
    if (closed) return;
    closed = true;
    await lease.close().catch(() => undefined);
    root.close();
    rmSync(parent, { recursive: true, force: true });
  };
  try {
    ensureDataRootLayout(root, lease);
    const namespaceBinding = createGenerationNamespaceInstallBinding(root, lease);
    const namespaceIntentPath = join(
      rootPath,
      dataRootReceiptIntentPath(namespaceBinding.operationId),
    );
    writeNewSyncedFile(namespaceIntentPath, canonicalJsonBytes(namespaceBinding));
    const namespacePath = join(rootPath, "receipts", "generations");
    mkdirSync(namespacePath, { mode: 0o700 });
    linkSync(namespaceIntentPath, join(namespacePath, ".namespace-install-intent.json"));
    for (const name of ["data", "catalog", "birth-staging"] as const) {
      mkdirSync(join(namespacePath, name), { mode: 0o700 });
      syncDirectory(join(namespacePath, name));
    }
    writeNewSyncedFile(
      join(namespacePath, "namespace.json"),
      canonicalJsonBytes(createGenerationNamespaceBody(
        namespaceBinding,
        readStableDirectoryIdentity(namespacePath),
      )),
    );
    syncDirectory(namespacePath);
    syncDirectory(join(rootPath, "receipts"));
    writeNewSyncedFile(
      join(rootPath, dataRootReceiptResultPath(namespaceBinding.operationId)),
      canonicalJsonBytes({
        schemaVersion: 1,
        operationId: namespaceBinding.operationId,
        bindingDigest: generationNamespaceInstallBindingDigest(namespaceBinding),
        variant: "success",
        publishedIdentity: generationNamespaceSeedDigest(),
      }),
    );
    syncDirectory(join(rootPath, "receipts"));

    const intent = fixtureIntent();
    const digest = generationIdDigest(intent.generationId);
    const generationPath = join(namespacePath, "data", digest);
    const recordsPath = join(generationPath, "records");
    const downloadsPath = join(generationPath, "downloads");
    mkdirSync(generationPath, { mode: 0o700 });
    mkdirSync(recordsPath, { mode: 0o700 });
    mkdirSync(downloadsPath, { mode: 0o700 });
    const initial = createInitialGenerationStateRecord(intent);
    writeNewSyncedFile(join(generationPath, "intent.json"), canonicalJsonBytes(intent));
    writeNewSyncedFile(
      join(recordsPath, generationStateRecordFilename(initial)),
      canonicalJsonBytes(initial),
    );
    writeNewSyncedFile(
      join(generationPath, "head.json"),
      canonicalJsonBytes({
        generationId: intent.generationId,
        sequence: 0,
        recordDigest: generationStateRecordDigest(initial),
      }),
    );
    writeNewSyncedFile(
      join(namespacePath, "catalog", `${digest}.json`),
      canonicalJsonBytes(createGenerationBirthPointer(intent, initial)),
    );

    const remoteBound = {
      provider: "worldlabs-marble-v1",
      remoteJobId: "operation_1",
      providerRequestId: null,
    };
    const identity = {
      kind: "marble-world" as const,
      operationId: "operation_1",
      worldId: "world_1",
      spzKey: "500k" as const,
      colliderField: "collider_mesh_url" as const,
    };

    const journal = new GenerationRecordJournal(root, lease, intent);
    journal.append("submit_started", { submitAttempt: 1 }, journalTimestamp(1));
    journal.append("remote_bound", remoteBound, journalTimestamp(2));
    journal.append("polling", POLL_BUDGET, journalTimestamp(3));
    const budget = createInitialDownloadBudget(intent, POLL_BUDGET) as unknown as Record<string, unknown>;
    journal.append("outputs_ready", {
      remoteOutputIdentity: identity,
      downloadBudget: budget,
    }, journalTimestamp(4));
    journal.append("downloading", {
      remoteOutputIdentity: identity,
      downloadBudget: budget,
    }, journalTimestamp(5));

    let running = budget;
    let second = 6;
    for (const [index, { outputRole, bytes }] of members.entries()) {
      running = memberWith(running, index, {
        outputRole,
        downloadAttemptCount: 1,
        stage: "reserved",
        candidate: null,
      });
      journal.append("downloading", {
        remoteOutputIdentity: identity,
        downloadBudget: running,
      }, journalTimestamp(second));
      second += 1;
      const checkpoint = generationStateRecordDigest(journal.readCurrent());
      const candidateName = `${outputRole}-c1-a1-${checkpoint}.bin`;
      const candidatePath = join(downloadsPath, candidateName);
      writeFileSync(candidatePath, bytes, { mode: 0o600 });
      chmodSync(candidatePath, 0o600);
      const stat = statSync(candidatePath, { bigint: true });
      const inspection = inspectDynamicArtifactBytes(
        outputRole === "world-spz-500k" ? "spz-v2" : "glb-2.0",
        bytes,
      );
      const basename = `${outputRole}-c1-a1-${checkpoint}`;
      const candidate = {
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
      };
      running = memberWith(running, index, {
        outputRole,
        downloadAttemptCount: 1,
        stage: "owned-next",
        attemptCheckpointRecordDigest: checkpoint,
        nextName: `${basename}.next`,
        ownerName: `${basename}.owner`,
        fileIdentity: candidate.fileIdentity,
        candidate: null,
      });
      journal.append("downloading", {
        remoteOutputIdentity: identity,
        downloadBudget: running,
      }, journalTimestamp(second));
      second += 1;
      running = memberWith(running, index, {
        outputRole,
        downloadAttemptCount: 1,
        stage: "cleanup-authorized",
        ownerName: `${basename}.owner`,
        candidate,
      });
      journal.append("downloading", {
        remoteOutputIdentity: identity,
        downloadBudget: running,
      }, journalTimestamp(second));
      second += 1;
      running = memberWith(running, index, {
        outputRole,
        downloadAttemptCount: 1,
        stage: "candidate",
        candidate,
      });
      journal.append("downloading", {
        remoteOutputIdentity: identity,
        downloadBudget: running,
      }, journalTimestamp(second));
      second += 1;
    }

    journal.append("validating", {
      remoteOutputIdentity: identity,
      downloadBudget: running,
    }, journalTimestamp(second));

    const head = journal.readCurrent();
    const inspections = members.map(({ outputRole, bytes }) => ({
      outputRole,
      inspection: inspectDynamicArtifactBytes(
        outputRole === "world-spz-500k" ? "spz-v2" : "glb-2.0",
        bytes,
      ),
    }));
    const candidatePlan = deriveGeneratedSetCandidatePlan(
      intent,
      remoteBound as never,
      head.payload as never,
      inspections,
    );
    const snapshot = inspectGeneratedSetStoragePreflight(root, candidatePlan);
    const publicationPlan = deriveGeneratedSetPublicationPlan(root, candidatePlan, snapshot);
    const eligibility = deriveGeneratedSetPublicationEligibility(
      root,
      lease,
      intent,
      publicationPlan,
    );

    for (let index = 0; index < (options.publicOperations ?? 0); index += 1) {
      writePublicIntent(rootPath, `op:intent-writer-filler-${index}`);
    }

    const admission = authorizeGeneratedSetAdmission(
      root,
      lease,
      intent,
      publicationPlan,
      eligibility,
    );
    if (options.expectCapacityReached === true) {
      if (admission.status !== "capacity-reached") {
        throw new Error("fixture expected capacity-reached");
      }
    } else if (admission.status !== "authorized") {
      throw new Error("fixture authorize failed");
    }

    return {
      root,
      lease,
      rootPath,
      intent,
      downloadsPath,
      recordsPath,
      journal,
      publicationPlan,
      eligibility,
      capability: admission.status === "authorized"
        ? admission.capability
        : (undefined as never),
      recordCount: readdirSync(recordsPath).length,
      close,
    };
  } catch (error) {
    await close();
    throw error;
  }
}

const cleanups: Array<() => unknown> = [];

afterEach(async () => {
  while (cleanups.length > 0) await cleanups.pop()!();
});

function track(fixture: WriterFixture): WriterFixture {
  cleanups.push(() => fixture.close());
  return fixture;
}

function expectRecovery(action: () => unknown): void {
  let thrown: unknown;
  try {
    action();
  } catch (error) {
    thrown = error;
  }
  expect(thrown).toBeDefined();
  if (thrown instanceof GenerationCodecError) {
    expect(thrown.code).toBe("GENERATION_RECOVERY_REQUIRED");
  }
}

function writeIntent(fixture: WriterFixture): AdmittedGeneratedSetIntentEvidenceV1 {
  return writeGeneratedSetPublicationIntent(
    fixture.capability,
    fixture.root,
    fixture.lease,
    fixture.intent,
    fixture.publicationPlan,
    fixture.eligibility,
  );
}

function attemptDirPath(
  fixture: WriterFixture,
  evidence: AdmittedGeneratedSetIntentEvidenceV1,
): string {
  return join(
    fixture.rootPath,
    dataRootStagingPath(evidence.operationId, evidence.attemptToken),
  );
}

function receiptsEntryCount(fixture: WriterFixture): number {
  return readdirSync(join(fixture.rootPath, "receipts")).length;
}

describe("generated-set intent writer", () => {
  test("happy path: durable flat attempt, same-inode receipt, exact 2 -> 1+1 takeover", async () => {
    const fixture = track(await buildWriterFixture());
    const preInspection = inspectDataRootCapacity(fixture.root, fixture.lease);
    const preCapacity = calculateDataRootCapacity({
      usedReceiptEntries: preInspection.usedReceiptEntries,
      pendingResultReservations: preInspection.pendingResultReservations,
      namespaceState: preInspection.namespaceState,
      generations: [{ state: "validating", publicationEvidence: "none" }],
      request: "none",
    });
    expect(preCapacity.canAdmit).toBe(true);
    expect(preCapacity.generationPublicationReservations).toBe(2);

    const stages: string[] = [];
    for (const stage of [
      "after-attempt-mkdir",
      "after-staging-dir-fsync",
      "after-staged-intent-write",
      "after-attempt-dir-fsync",
      "after-hard-link",
      "after-receipts-dir-fsync",
      "before-takeover-inspection",
    ] as const) {
      cleanups.push(GENERATED_SET_INTENT_WRITER_TEST_SEAMS.replaceStageHook(
        stage,
        () => stages.push(stage),
      ));
    }

    const evidence = writeIntent(fixture);
    expect(stages).toEqual([
      "after-attempt-mkdir",
      "after-staging-dir-fsync",
      "after-staged-intent-write",
      "after-attempt-dir-fsync",
      "after-hard-link",
      "after-receipts-dir-fsync",
      "before-takeover-inspection",
    ]);

    // 证据 body：deep-frozen、无绝对路径、无 reusable writer、无 result/catalog。
    expect(evidence.kind).toBe("generated-set-publication-intent-admitted-v1");
    expect(evidence.operationId).toBe(fixture.publicationPlan.binding.operationId);
    expect(evidence.publicationBindingDigest).toBe(
      fixture.publicationPlan.publicationBindingDigest,
    );
    expect(evidence.generationId).toBe(fixture.intent.generationId);
    expect(evidence.attemptToken).toMatch(/^[0-9a-f]{24}$/);
    expect(Object.isFrozen(evidence)).toBe(true);
    expect(Object.isFrozen(evidence.takeover)).toBe(true);
    const serialized = JSON.stringify(evidence);
    expect(serialized).not.toContain(fixture.rootPath);
    expect(serialized).not.toContain(tmpdir());
    expect(serialized).not.toContain("candidateName");

    // 文件系统事实：flat attempt + 24-hex token + same-inode 0600/0700。
    const attemptDir = attemptDirPath(fixture, evidence);
    const attemptStat = statSync(attemptDir, { bigint: true });
    expect((attemptStat.mode & 0o777n).toString(8)).toBe("700");
    const stagedPath = join(attemptDir, "operation-intent.json");
    const stagedStat = statSync(stagedPath, { bigint: true });
    const receiptPath = join(fixture.rootPath, fixture.publicationPlan.receiptIntentPath);
    const receiptStat = statSync(receiptPath, { bigint: true });
    expect((stagedStat.mode & 0o777n).toString(8)).toBe("600");
    expect((receiptStat.mode & 0o777n).toString(8)).toBe("600");
    expect(stagedStat.dev).toBe(receiptStat.dev);
    expect(stagedStat.ino).toBe(receiptStat.ino);
    expect(receiptStat.nlink).toBe(2n);
    expect(readFileSync(receiptPath)).toEqual(canonicalJsonBytes(fixture.publicationPlan.binding));

    // 接管算术：actual intent 1 + pending reservation 1 == 原 2-slot reservation。
    const postInspection = inspectDataRootCapacity(fixture.root, fixture.lease);
    expect(postInspection.namespaceState).toBe("terminal-installed");
    expect(postInspection.publicOperationCount).toBe(preInspection.publicOperationCount);
    expect(postInspection.internalOperationCount).toBe(2);
    expect(postInspection.usedReceiptEntries).toBe(preInspection.usedReceiptEntries + 1);
    expect(postInspection.pendingResultReservations).toBe(
      preInspection.pendingResultReservations + 1,
    );
    const postCapacity = calculateDataRootCapacity({
      usedReceiptEntries: postInspection.usedReceiptEntries,
      pendingResultReservations: postInspection.pendingResultReservations,
      namespaceState: postInspection.namespaceState,
      generations: [
        { state: "validating", publicationEvidence: "matching-intent-no-result" },
      ],
      request: "none",
    });
    expect(postCapacity.status).toBe("ready");
    expect(postCapacity.generationPublicationReservations).toBe(0);
    expect(postCapacity.requestedEntries).toBe(0);
    expect(postCapacity.effectiveEntries).toBe(preCapacity.effectiveEntries);
    expect(evidence.preWriteEffectiveEntries).toBe(preCapacity.effectiveEntries);
    expect(evidence.takeover.effectiveEntries).toBe(postCapacity.effectiveEntries);
    expect(evidence.takeover.status).toBe("ready");
    expect(evidence.takeover.internalOperationCount).toBe(2);
    expect(evidence.takeover.generationClassification).toEqual({
      state: "validating",
      publicationEvidence: "matching-intent-no-result",
    });

    // 无 result、无 catalog、Generation truth 仍停在 validating（无 publishing append）。
    expect(() => statSync(join(fixture.rootPath, fixture.publicationPlan.receiptResultPath))).toThrow();
    expect(() => statSync(join(fixture.rootPath, fixture.publicationPlan.catalogPath))).toThrow();
    expect(fixture.journal.readCurrent().state).toBe("validating");
    expect(readdirSync(fixture.recordsPath).length).toBe(fixture.recordCount);

    // provenance 只在同一 root/lease 上可还原，供下一 publishing append slice 使用。
    const provenance = requireAdmittedGeneratedSetIntentProvenance(
      evidence,
      fixture.root,
      fixture.lease,
    );
    expect(provenance.plan).toBe(fixture.publicationPlan);
    expect(provenance.attemptPath).toBe(attemptDir);
    expectRecovery(() => requireAdmittedGeneratedSetIntentProvenance(
      evidence,
      openDataRootAndClose(fixture.rootPath),
      fixture.lease,
    ));

    // capability one-shot：同一 capability 的第二次 writer 调用 fail closed。
    expectRecovery(() => writeIntent(fixture));
    expect(receiptsEntryCount(fixture)).toBe(preInspection.usedReceiptEntries + 1);
  });

  test("fault hooks at every durable boundary fail closed with bounded evidence", async () => {
    for (const stage of [
      "after-attempt-mkdir",
      "after-staging-dir-fsync",
      "after-staged-intent-write",
      "after-attempt-dir-fsync",
      "after-hard-link",
      "after-receipts-dir-fsync",
      "before-takeover-inspection",
    ] as const) {
      const fixture = track(await buildWriterFixture());
      const preInspection = inspectDataRootCapacity(fixture.root, fixture.lease);
      const restore = GENERATED_SET_INTENT_WRITER_TEST_SEAMS.replaceStageHook(
        stage,
        () => {
          throw new Error(`injected kill at ${stage}`);
        },
      );
      let thrown: unknown;
      try {
        writeIntent(fixture);
      } catch (error) {
        thrown = error;
      } finally {
        restore();
      }
      expect(thrown).toBeDefined();

      // 有界证据：无 result、无 catalog、Generation truth 未推进。
      const operationId = fixture.publicationPlan.binding.operationId;
      expect(() => statSync(join(
        fixture.rootPath,
        dataRootReceiptResultPath(operationId),
      ))).toThrow();
      expect(() => statSync(join(fixture.rootPath, fixture.publicationPlan.catalogPath))).toThrow();
      expect(fixture.journal.readCurrent().state).toBe("validating");
      expect(readdirSync(fixture.recordsPath).length).toBe(fixture.recordCount);

      const receiptPath = join(fixture.rootPath, fixture.publicationPlan.receiptIntentPath);
      const linkStages = [
        "after-hard-link",
        "after-receipts-dir-fsync",
        "before-takeover-inspection",
      ];
      if (linkStages.includes(stage)) {
        // receipt 已 durable：证据保留，字节 exact，无 cleanup。
        expect(readFileSync(receiptPath)).toEqual(
          canonicalJsonBytes(fixture.publicationPlan.binding),
        );
        expect(receiptsEntryCount(fixture)).toBe(preInspection.usedReceiptEntries + 1);
      } else {
        expect(() => statSync(receiptPath)).toThrow();
        expect(receiptsEntryCount(fixture)).toBe(preInspection.usedReceiptEntries);
      }

      // 失败后的 capability 已被 one-shot consume 毒化，不可重试。
      expectRecovery(() => writeIntent(fixture));
    }
  }, 120_000);

  test("post-link drift fails closed and preserves all evidence", async () => {
    const drifts: readonly {
      readonly stage: "after-hard-link" | "after-receipts-dir-fsync" | "before-takeover-inspection";
      readonly inject: (fixture: WriterFixture) => void;
    }[] = [
      {
        stage: "before-takeover-inspection",
        inject: (fixture) => {
          writeNewSyncedFile(
            join(fixture.rootPath, fixture.publicationPlan.receiptResultPath),
            canonicalJsonBytes(fixture.publicationPlan.expectedResult),
          );
        },
      },
      {
        stage: "before-takeover-inspection",
        inject: (fixture) => {
          mkdirSync(join(fixture.rootPath, "artifacts", "catalog"), {
            mode: 0o700,
            recursive: true,
          });
          writeNewSyncedFile(
            join(fixture.rootPath, fixture.publicationPlan.catalogPath),
            canonicalJsonBytes(fixture.publicationPlan.catalogBody),
          );
        },
      },
      {
        stage: "before-takeover-inspection",
        inject: (fixture) => {
          writePublicIntent(fixture.rootPath, "op:intent-writer-extra");
        },
      },
      {
        stage: "after-receipts-dir-fsync",
        inject: (fixture) => {
          const staged = join(
            fixture.rootPath,
            "staging",
            `${fixture.publicationPlan.binding.operationId}-${
              readdirSync(join(fixture.rootPath, "staging"))
                .find((name) => name.startsWith(fixture.publicationPlan.binding.operationId))!
                .split("-").pop()!
            }`,
            "operation-intent.json",
          );
          unlinkSync(staged);
          writeNewSyncedFile(staged, canonicalJsonBytes(fixture.publicationPlan.binding));
        },
      },
      {
        stage: "after-receipts-dir-fsync",
        inject: (fixture) => {
          const receipt = join(fixture.rootPath, fixture.publicationPlan.receiptIntentPath);
          const bytes = readFileSync(receipt);
          unlinkSync(receipt);
          writeNewSyncedFile(receipt, bytes);
        },
      },
      {
        stage: "after-receipts-dir-fsync",
        inject: (fixture) => {
          chmodSync(join(
            fixture.rootPath,
            fixture.publicationPlan.receiptIntentPath,
          ), 0o644);
        },
      },
    ];
    for (const { stage, inject } of drifts) {
      const fixture = track(await buildWriterFixture());
      const restore = GENERATED_SET_INTENT_WRITER_TEST_SEAMS.replaceStageHook(stage, () => {
        inject(fixture);
      });
      try {
        expectRecovery(() => writeIntent(fixture));
      } finally {
        restore();
      }
      // 现场保留：receipt intent 文件仍在（或被注入替换），绝不 unlink/overwrite。
      const receiptPath = join(fixture.rootPath, fixture.publicationPlan.receiptIntentPath);
      expect(() => statSync(receiptPath)).not.toThrow();
      expect(fixture.journal.readCurrent().state).toBe("validating");
      expect(readdirSync(fixture.recordsPath).length).toBe(fixture.recordCount);
    }
  }, 120_000);

  test("forged/copy/cross-root/cross-lease/cross-plan/cross-eligibility inputs: zero mutation, capability intact", async () => {
    const fixture = track(await buildWriterFixture());
    const foreign = track(await buildWriterFixture());
    const stagingBefore = readdirSync(join(fixture.rootPath, "staging")).length;
    const receiptsBefore = receiptsEntryCount(fixture);

    expectRecovery(() => writeGeneratedSetPublicationIntent(
      JSON.parse(JSON.stringify(fixture.capability)),
      fixture.root,
      fixture.lease,
      fixture.intent,
      fixture.publicationPlan,
      fixture.eligibility,
    ));
    expectRecovery(() => writeGeneratedSetPublicationIntent(
      fixture.capability,
      openDataRootAndTrack(fixture.rootPath),
      fixture.lease,
      fixture.intent,
      fixture.publicationPlan,
      fixture.eligibility,
    ));
    expectRecovery(() => writeGeneratedSetPublicationIntent(
      fixture.capability,
      fixture.root,
      foreign.lease,
      fixture.intent,
      fixture.publicationPlan,
      fixture.eligibility,
    ));
    expectRecovery(() => writeGeneratedSetPublicationIntent(
      fixture.capability,
      fixture.root,
      fixture.lease,
      foreign.intent,
      fixture.publicationPlan,
      fixture.eligibility,
    ));
    expectRecovery(() => writeGeneratedSetPublicationIntent(
      fixture.capability,
      fixture.root,
      fixture.lease,
      fixture.intent,
      foreign.publicationPlan,
      fixture.eligibility,
    ));
    expectRecovery(() => writeGeneratedSetPublicationIntent(
      fixture.capability,
      fixture.root,
      fixture.lease,
      fixture.intent,
      fixture.publicationPlan,
      foreign.eligibility,
    ));

    expect(readdirSync(join(fixture.rootPath, "staging")).length).toBe(stagingBefore);
    expect(receiptsEntryCount(fixture)).toBe(receiptsBefore);

    // 原有效 capability 未被错误输入消耗。
    const evidence = writeIntent(fixture);
    expect(evidence.operationId).toBe(fixture.publicationPlan.binding.operationId);
  }, 60_000);

  test("existing receipt before write fails consume preflight with zero new mutation", async () => {
    const fixture = track(await buildWriterFixture());
    const foreignBinding = requireGeneratedSetPublicationBinding({
      schemaVersion: 1,
      operationId: `op:${sha256Hex(new TextEncoder().encode(
        "demiurges-generated-set-publication-v1\0generation:sha256:" + "9".repeat(64) + "\0" + "8".repeat(64),
      ))}`,
      operationKind: "artifact.publish-generated-set",
      target: { kind: "registry", id: "registry:generated-artifact-sets-v1" },
      expectedIdentity: null,
      candidateIdentity: {
        generationId: `generation:sha256:${"9".repeat(64)}` as never,
        artifactSetDigest: "8".repeat(64),
        orderedContentRecordDigests: ["c".repeat(64)],
        orderedProvenanceRecordDigests: ["d".repeat(64)],
      },
    });
    const stagingBefore = readdirSync(join(fixture.rootPath, "staging")).length;
    writeNewSyncedFile(
      join(fixture.rootPath, dataRootReceiptIntentPath(foreignBinding.operationId)),
      canonicalJsonBytes(foreignBinding),
    );
    syncDirectory(join(fixture.rootPath, "receipts"));
    expectRecovery(() => writeIntent(fixture));
    expect(readdirSync(join(fixture.rootPath, "staging")).length).toBe(stagingBefore);
    // 目标 intent/result/catalog 均未被触碰。
    expect(() => statSync(join(fixture.rootPath, fixture.publicationPlan.receiptIntentPath))).toThrow();
    expect(fixture.journal.readCurrent().state).toBe("validating");
  });

  test("near-capacity boundary keeps effective count after handoff", async () => {
    const near = track(await buildWriterFixture({ publicOperations: 1021 }));
    const preInspection = inspectDataRootCapacity(near.root, near.lease);
    expect(preInspection.usedReceiptEntries).toBe(2045);
    const evidence = writeIntent(near);
    expect(evidence.preWriteEffectiveEntries).toBe(2047);
    expect(evidence.takeover.effectiveEntries).toBe(2047);
    expect(evidence.takeover.generationPublicationReservations).toBe(0);
    expect(inspectDataRootCapacity(near.root, near.lease).usedReceiptEntries).toBe(2046);

    const full = track(await buildWriterFixture({
      publicOperations: 1022,
      expectCapacityReached: true,
    }));
    // capacity-reached 下没有任何 capability 可供 writer 消费，receipts 未增长。
    expect(receiptsEntryCount(full)).toBe(2047);
  }, 60_000);

  test("closed lease rejects the writer before mutation", async () => {
    const fixture = track(await buildWriterFixture());
    await fixture.lease.close();
    expectRecovery(() => writeIntent(fixture));
  });

  test("source scan: package-private, no public facade or framework dependency", () => {
    const source = readFileSync(
      join(import.meta.dir, "generated-set-intent-writer.ts"),
      "utf8",
    );
    for (const dependency of [
      "./operation-journal",
      "./startup-recovery",
      "./artifact-store",
      "./project-store",
      "./bundle-store",
      "./world-project-runtime",
      "./world-project-manifest",
      "./first-generation-capacity",
      "./first-generation-coordinator",
      "./generation-namespace-installer",
      "./generation-birth-journal",
    ]) {
      expect(source).not.toContain(`from "${dependency}"`);
    }
    for (const framework of ["three", "@mujoco", "solid-js", "agent-gateway", "apps/studio"]) {
      expect(source).not.toContain(framework);
    }
    const indexSource = readFileSync(join(import.meta.dir, "index.ts"), "utf8");
    expect(indexSource).not.toContain("generated-set-intent-writer");
  });
});

function openDataRootAndClose(path: string): OpenedDataRoot {
  const root = openDataRoot(path);
  cleanups.push(() => {
    root.close();
  });
  return root;
}

function openDataRootAndTrack(path: string): OpenedDataRoot {
  return openDataRootAndClose(path);
}
