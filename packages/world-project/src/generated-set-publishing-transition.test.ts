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

import { canonicalJsonBytes } from "@demiurges/world";

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
import {
  GENERATION_RECORD_JOURNAL_TEST_SEAMS,
  GenerationRecordJournal,
} from "./generation-record-journal";
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
  writeGeneratedSetPublicationIntent,
  type AdmittedGeneratedSetIntentEvidenceV1,
} from "./generated-set-intent-writer";
import { transitionGeneratedSetToPublishing } from "./generated-set-publishing-transition";
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

const PUBLISHING_RECORDED_AT = "2026-08-15T10:00:15.000Z";

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
  const minAll = [
    Math.min(...positions.map((p) => p[0]!)),
    Math.min(...positions.map((p) => p[1]!)),
    Math.min(...positions.map((p) => p[2]!)),
  ];
  const maxAll = [
    Math.max(...positions.map((p) => p[0]!)),
    Math.max(...positions.map((p) => p[1]!)),
    Math.max(...positions.map((p) => p[2]!)),
  ];
  const json = new TextEncoder().encode(JSON.stringify({
    asset: { version: "2.0" }, scene: 0, scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0 }], meshes: [{ primitives: [{ attributes: { POSITION: 0 } }] }],
    buffers: [{ byteLength: binary.byteLength }],
    bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: binary.byteLength }],
    accessors: [{ bufferView: 0, componentType: 5126, count: positions.length, type: "VEC3", min: minAll, max: maxAll }],
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
    prompt: "A bounded publishing-transition world",
    costUnknownAccepted: true,
    waitForCompletionAndDownload: true,
    idempotencyKey: `publishing-transition-${intentNonce}`,
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

interface TransitionFixture {
  readonly root: OpenedDataRoot;
  readonly lease: DataRootWriterLease;
  readonly rootPath: string;
  readonly intent: GenerationIntentV1;
  readonly downloadsPath: string;
  readonly recordsPath: string;
  readonly journal: GenerationRecordJournal;
  readonly publicationPlan: GeneratedSetPublicationPlanV1;
  readonly eligibility: GeneratedSetPublicationEligibilityV1;
  readonly evidence: AdmittedGeneratedSetIntentEvidenceV1;
  readonly recordCount: number;
  close(): Promise<void>;
}

function writePublicIntent(rootPath: string, operationId: string): void {
  const binding: OperationBinding = {
    schemaVersion: 1,
    operationId,
    operationKind: "project.save-as",
    target: { kind: "project", id: "project:transition-test" },
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

async function buildTransitionFixture(): Promise<TransitionFixture> {
  const members = [
    { outputRole: "world-spz-500k" as const, bytes: createSpzFixture() },
    { outputRole: "world-collider-glb" as const, bytes: createGlbWithPositions([[-1, -2, -3], [4, 5, 6]]) },
  ];

  const parent = mkdtempSync(join(tmpdir(), "dh017-publishing-transition-"));
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
    const admission = authorizeGeneratedSetAdmission(
      root,
      lease,
      intent,
      publicationPlan,
      eligibility,
    );
    if (admission.status !== "authorized") throw new Error("fixture authorize failed");
    const evidence = writeGeneratedSetPublicationIntent(
      admission.capability,
      root,
      lease,
      intent,
      publicationPlan,
      eligibility,
    );

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
      evidence,
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

function track(fixture: TransitionFixture): TransitionFixture {
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

function runTransition(fixture: TransitionFixture): unknown {
  return transitionGeneratedSetToPublishing(
    fixture.evidence,
    fixture.root,
    fixture.lease,
    fixture.intent,
    fixture.publicationPlan,
    fixture.eligibility,
    PUBLISHING_RECORDED_AT,
  );
}

describe("generated-set publishing transition", () => {
  test("happy path: one durable publishing record/head, everything else untouched", async () => {
    const fixture = track(await buildTransitionFixture());
    const result = runTransition(fixture) as ReturnType<
      typeof transitionGeneratedSetToPublishing
    >;

    expect(result.kind).toBe("generated-set-publishing-transitioned-v1");
    expect(result.operationId).toBe(fixture.publicationPlan.binding.operationId);
    expect(result.artifactSetDigest).toBe(fixture.publicationPlan.artifactSetDigest);
    expect(result.publicationBindingDigest).toBe(
      fixture.publicationPlan.publicationBindingDigest,
    );
    expect(result.generationId).toBe(fixture.intent.generationId);
    expect(Object.isFrozen(result)).toBe(true);
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain(fixture.rootPath);
    expect(serialized).not.toContain(tmpdir());

    // durable head：唯一 publishing record，payload exact plan-derived。
    const head = fixture.journal.readCurrent();
    expect(head.state).toBe("publishing");
    expect(head.sequence).toBe(result.publishingSequence);
    expect(head.recordedAt).toBe(PUBLISHING_RECORDED_AT);
    expect(head.payload).toEqual({
      operationId: fixture.publicationPlan.binding.operationId,
      artifactSetDigest: fixture.publicationPlan.artifactSetDigest,
    });
    expect(generationStateRecordDigest(head)).toBe(result.publishingRecordDigest);
    expect(readdirSync(fixture.recordsPath).length).toBe(fixture.recordCount + 1);
    expect(
      readdirSync(fixture.recordsPath).includes(
        generationStateRecordFilename(head),
      ),
    ).toBe(true);

    // public 面仍未被触碰：result/catalog 缺席、receipt intent 未变、attempt 保留。
    expect(() => statSync(join(
      fixture.rootPath,
      fixture.publicationPlan.receiptResultPath,
    ))).toThrow();
    expect(() => statSync(join(
      fixture.rootPath,
      fixture.publicationPlan.catalogPath,
    ))).toThrow();
    const receiptPath = join(fixture.rootPath, fixture.publicationPlan.receiptIntentPath);
    const stagedPath = join(
      fixture.rootPath,
      dataRootStagingPath(
        fixture.publicationPlan.binding.operationId,
        fixture.evidence.attemptToken,
      ),
      "operation-intent.json",
    );
    expect(readFileSync(receiptPath)).toEqual(
      canonicalJsonBytes(fixture.publicationPlan.binding),
    );
    expect(statSync(receiptPath).ino).toBe(statSync(stagedPath).ino);

    // capacity arithmetic：takeover 2 == actual intent 1 + pending result 1 保持不变。
    expect(fixture.evidence.takeover.effectiveEntries).toBe(
      fixture.evidence.preWriteEffectiveEntries,
    );
    expect(fixture.evidence.takeover.generationPublicationReservations).toBe(0);
  }, 60_000);

  test("journal fault boundaries fail closed and resume via the exact pending protocol", async () => {
    for (const stage of [
      "next-file-synced",
      "witness-directory-synced",
      "final-link-directory-synced",
      "head-next-synced",
      "head-directory-synced",
      "next-cleanup-directory-synced",
      "witness-cleanup-directory-synced",
    ] as const) {
      const fixture = track(await buildTransitionFixture());
      const restore = GENERATION_RECORD_JOURNAL_TEST_SEAMS.replaceStageHook(
        (reached) => {
          if (reached === stage) throw new Error(`injected kill at ${stage}`);
        },
      );
      let thrown: unknown;
      try {
        runTransition(fixture);
      } catch (error) {
        thrown = error;
      } finally {
        restore();
      }
      expect(thrown).toBeDefined();

      // 无 public mutation：result/catalog 缺席。
      expect(() => statSync(join(
        fixture.rootPath,
        fixture.publicationPlan.receiptResultPath,
      ))).toThrow();
      expect(() => statSync(join(
        fixture.rootPath,
        fixture.publicationPlan.catalogPath,
      ))).toThrow();

      // 唯一支持的 recovery：Journal 的 same-inode pending protocol。
      // `.record.next` 尚无 witness 时（next-file fsync 边界），pending protocol
      // 本身 fail closed，durable 现场保持不变；witness 已 durable 后 resume
      // 精确完成同一 publishing record。
      const resumer = new GenerationRecordJournal(
        fixture.root,
        fixture.lease,
        fixture.intent,
      );
      if (stage === "next-file-synced") {
        // 孤儿 `.record.next`（无 witness）让整个 journal fail closed：head 未
        // 推进、final 未链接，现场保留给后续 convergence 切片。
        expect(() => resumer.resumePending()).toThrow();
        expect(() => resumer.readCurrent()).toThrow();
        const names = readdirSync(fixture.recordsPath);
        expect(names).toContain(".record.next");
        expect(names.length).toBe(fixture.recordCount + 1);
      } else if (stage === "witness-cleanup-directory-synced") {
        // witness unlink 后的 kill：record 已 fully committed，无 pending 可 resume。
        expect(resumer.resumePending()).toBeUndefined();
        expect(resumer.readCurrent().state).toBe("publishing");
        expect(readdirSync(fixture.recordsPath).length).toBe(fixture.recordCount + 1);
      } else {
        const resumed = resumer.resumePending();
        expect(resumed?.state).toBe("publishing");
        expect(resumer.readCurrent().state).toBe("publishing");
        expect(readdirSync(fixture.recordsPath).length).toBe(fixture.recordCount + 1);
      }
    }
  }, 300_000);

  test("durable drift fails closed before .record.next creation", async () => {
    const drifts: readonly ((fixture: TransitionFixture) => void)[] = [
      // receipt intent body/inode 漂移。
      (fixture) => {
        const receipt = join(fixture.rootPath, fixture.publicationPlan.receiptIntentPath);
        const bytes = readFileSync(receipt);
        unlinkSync(receipt);
        writeNewSyncedFile(receipt, bytes);
      },
      // receipt intent mode 漂移。
      (fixture) => {
        chmodSync(
          join(fixture.rootPath, fixture.publicationPlan.receiptIntentPath),
          0o644,
        );
      },
      // staged intent 缺席。
      (fixture) => {
        unlinkSync(join(
          fixture.rootPath,
          dataRootStagingPath(
            fixture.publicationPlan.binding.operationId,
            fixture.evidence.attemptToken,
          ),
          "operation-intent.json",
        ));
      },
      // result 出现。
      (fixture) => {
        writeNewSyncedFile(
          join(fixture.rootPath, fixture.publicationPlan.receiptResultPath),
          canonicalJsonBytes(fixture.publicationPlan.expectedResult),
        );
      },
      // catalog 出现。
      (fixture) => {
        mkdirSync(join(fixture.rootPath, "artifacts", "catalog"), {
          mode: 0o700,
          recursive: true,
        });
        writeNewSyncedFile(
          join(fixture.rootPath, fixture.publicationPlan.catalogPath),
          canonicalJsonBytes(fixture.publicationPlan.catalogBody),
        );
      },
      // public counts 漂移。
      (fixture) => {
        writePublicIntent(fixture.rootPath, "op:transition-drift-extra");
      },
      // validating head 漂移（直接合法推进到 publishing）。
      (fixture) => {
        fixture.journal.append(
          "publishing",
          {
            operationId: fixture.publicationPlan.binding.operationId,
            artifactSetDigest: fixture.publicationPlan.artifactSetDigest,
          },
          PUBLISHING_RECORDED_AT,
        );
      },
      // birth anchor 漂移。
      (fixture) => {
        const pointerPath = join(
          fixture.rootPath,
          "receipts",
          "generations",
          "catalog",
          `${generationIdDigest(fixture.intent.generationId)}.json`,
        );
        const bytes = readFileSync(pointerPath);
        unlinkSync(pointerPath);
        writeNewSyncedFile(pointerPath, Buffer.from(bytes).subarray(0, bytes.length - 2));
      },
    ];
    for (const inject of drifts) {
      const fixture = track(await buildTransitionFixture());
      inject(fixture);
      expectRecovery(() => runTransition(fixture));
      // 零 Generation mutation：记录数未变（drift 自身推进 head 的用例除外）。
      const head = fixture.journal.readCurrent();
      if (head.state === "validating") {
        expect(readdirSync(fixture.recordsPath).length).toBe(fixture.recordCount);
      }
    }
  }, 300_000);

  test("forged/cross inputs: zero Generation mutation, valid authority intact", async () => {
    const fixture = track(await buildTransitionFixture());
    const foreign = track(await buildTransitionFixture());

    expectRecovery(() => transitionGeneratedSetToPublishing(
      JSON.parse(JSON.stringify(fixture.evidence)),
      fixture.root,
      fixture.lease,
      fixture.intent,
      fixture.publicationPlan,
      fixture.eligibility,
      PUBLISHING_RECORDED_AT,
    ));
    const reopened = openDataRoot(fixture.rootPath);
    cleanups.push(() => reopened.close());
    expectRecovery(() => transitionGeneratedSetToPublishing(
      fixture.evidence,
      reopened,
      fixture.lease,
      fixture.intent,
      fixture.publicationPlan,
      fixture.eligibility,
      PUBLISHING_RECORDED_AT,
    ));
    expectRecovery(() => transitionGeneratedSetToPublishing(
      fixture.evidence,
      fixture.root,
      foreign.lease,
      fixture.intent,
      fixture.publicationPlan,
      fixture.eligibility,
      PUBLISHING_RECORDED_AT,
    ));
    expectRecovery(() => transitionGeneratedSetToPublishing(
      fixture.evidence,
      fixture.root,
      fixture.lease,
      foreign.intent,
      fixture.publicationPlan,
      fixture.eligibility,
      PUBLISHING_RECORDED_AT,
    ));
    expectRecovery(() => transitionGeneratedSetToPublishing(
      fixture.evidence,
      fixture.root,
      fixture.lease,
      fixture.intent,
      foreign.publicationPlan,
      fixture.eligibility,
      PUBLISHING_RECORDED_AT,
    ));
    expectRecovery(() => transitionGeneratedSetToPublishing(
      fixture.evidence,
      fixture.root,
      fixture.lease,
      fixture.intent,
      fixture.publicationPlan,
      foreign.eligibility,
      PUBLISHING_RECORDED_AT,
    ));
    expect(fixture.journal.readCurrent().state).toBe("validating");
    expect(readdirSync(fixture.recordsPath).length).toBe(fixture.recordCount);

    // 原有效 authority 未被错误输入消耗。
    const result = runTransition(fixture) as ReturnType<
      typeof transitionGeneratedSetToPublishing
    >;
    expect(result.publishingSequence).toBe(
      new GenerationRecordJournal(fixture.root, fixture.lease, fixture.intent)
        .readCurrent().sequence,
    );
  }, 120_000);

  test("second append after publishing fails closed", async () => {
    const fixture = track(await buildTransitionFixture());
    runTransition(fixture);
    expectRecovery(() => runTransition(fixture));
    // publishing 是 stop state：codec 层的 direct append 同样 fail closed。
    expect(() => fixture.journal.append(
      "publishing",
      {
        operationId: fixture.publicationPlan.binding.operationId,
        artifactSetDigest: fixture.publicationPlan.artifactSetDigest,
      },
      "2026-08-15T10:00:16.000Z",
    ));
  }, 60_000);

  test("closed lease rejects the transition before mutation", async () => {
    const fixture = track(await buildTransitionFixture());
    await fixture.lease.close();
    expectRecovery(() => runTransition(fixture));
  });

  test("source scan: package-private, no public facade or framework dependency", () => {
    const source = readFileSync(
      join(import.meta.dir, "generated-set-publishing-transition.ts"),
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
      "./index",
    ]) {
      expect(source).not.toContain(`from "${dependency}"`);
    }
    for (const framework of ["three", "@mujoco", "solid-js", "agent-gateway", "apps/studio"]) {
      expect(source).not.toContain(framework);
    }
    const indexSource = readFileSync(join(import.meta.dir, "index.ts"), "utf8");
    expect(indexSource).not.toContain("generated-set-publishing-transition");
  });
});
