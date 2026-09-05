import { afterEach, describe, expect, test } from "bun:test";
import {
  chmodSync,
  linkSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  symlinkSync,
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
import { generationIdDigest, createGenerationBirthPointer } from "./generation-birth";
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
import {
  deriveGeneratedSetCandidatePlan,
  type GeneratedSetCandidatePlanV1,
} from "./generated-set-candidate-plan";
import {
  inspectGeneratedSetStoragePreflight,
  type GeneratedSetStoragePreflightSnapshotV1,
} from "./generated-set-storage-preflight";
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
import {
  transitionGeneratedSetToPublishing,
  type GeneratedSetPublishingTransitionEvidenceV1,
} from "./generated-set-publishing-transition";
import {
  GENERATED_SET_HIDDEN_CAS_WRITER_TEST_SEAMS,
  inspectGeneratedSetHiddenCasStartupResume,
  requireGeneratedSetHiddenCasProvenance,
  resumeGeneratedSetHiddenCasAtStartup,
  writeGeneratedSetHiddenCas,
  type GeneratedSetHiddenCasWriterStage,
} from "./generated-set-hidden-cas-writer";
import {
  commitGeneratedSetVisible,
  GENERATED_SET_VISIBLE_COMMIT_TEST_SEAMS,
} from "./generated-set-visible-commit";
import { transitionGeneratedSetVisibleToVerified } from "./generated-set-verified-transition";
import {
  generatedArtifactByBytesPointerPath,
  generatedArtifactBytesPath,
  generatedArtifactContentRecordPath,
  generatedArtifactProvenanceRecordPath,
  generatedArtifactSetRecordPath,
} from "./generated-artifact-layout";
import { GENERATED_ARTIFACT_RECORD_MAX_BYTES } from "./generated-artifact-records";
import { inspectGenerationBirthStartupRecovery } from "./generation-birth-journal";
import { ArtifactStoreReader } from "./artifact-store";
import { WorldProjectWriter } from "./project-store";
import {
  recoverPendingOperations,
  STARTUP_RECOVERY_TEST_SEAMS,
} from "./startup-recovery";
import {
  readStableDirectoryIdentity,
  readStableRegularFileSnapshot,
  syncDirectory,
  writeNewSyncedFile,
} from "./safe-filesystem";

const POLL_BUDGET = {
  cycleCount: 1 as const,
  attemptCount: 6,
  cycleStartedAt: "2026-08-15T10:00:02.000Z",
  deadlineAt: "2026-08-15T10:20:02.000Z",
};

const PUBLISHING_RECORDED_AT = "2026-08-15T10:00:15.000Z";

type ProviderFixture = "worldlabs-marble-v1" | "hunyuan-ai3d-v1";

interface FixtureMember {
  readonly outputRole: "world-spz-500k" | "world-collider-glb" | "object-glb";
  readonly format: "spz-v2" | "glb-2.0";
  readonly bytes: Uint8Array;
}

function fixtureMembers(provider: ProviderFixture): readonly FixtureMember[] {
  return provider === "worldlabs-marble-v1"
    ? [
        { outputRole: "world-spz-500k", format: "spz-v2", bytes: createSpzFixture() },
        {
          outputRole: "world-collider-glb",
          format: "glb-2.0",
          bytes: createGlbWithPositions([[-1, -2, -3], [4, 5, 6]]),
        },
      ]
    : [
        {
          outputRole: "object-glb",
          format: "glb-2.0",
          bytes: createGlbWithPositions([[-1, -2, -3], [4, 5, 6]]),
        },
      ];
}

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

function fixtureIntent(provider: ProviderFixture): GenerationIntentV1 {
  intentNonce += 1;
  return createGenerationIntent(createGenerationBinding(requireGenerationRequest({
    provider,
    model: provider === "worldlabs-marble-v1" ? "marble-1.1" : "3.1",
    prompt: "A bounded hidden-cas writer world",
    costUnknownAccepted: true,
    waitForCompletionAndDownload: true,
    idempotencyKey: `hidden-cas-writer-${provider === "worldlabs-marble-v1" ? "marble" : "hunyuan"}-${intentNonce}`,
  }), { contractProfile: provider === "worldlabs-marble-v1" ? "worldlabs-openapi-2026-08-15-v1" : "cloud-response-v1", contractShapeDigest: "a".repeat(64) }), "2026-08-15T10:00:00.000Z");
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
  readonly provider: ProviderFixture;
  readonly members: readonly FixtureMember[];
  readonly downloadsPath: string;
  readonly recordsPath: string;
  readonly journal: GenerationRecordJournal;
  readonly candidatePlan: GeneratedSetCandidatePlanV1;
  readonly publicationPlan: GeneratedSetPublicationPlanV1;
  readonly eligibility: GeneratedSetPublicationEligibilityV1;
  readonly evidence: AdmittedGeneratedSetIntentEvidenceV1;
  readonly transitionEvidence: GeneratedSetPublishingTransitionEvidenceV1;
  readonly snapshot: GeneratedSetStoragePreflightSnapshotV1;
  readonly recordCount: number;
  close(): Promise<void>;
}

type PreSeed = (
  rootPath: string,
  candidatePlan: GeneratedSetCandidatePlanV1,
  members: readonly FixtureMember[],
) => void;

function mkdirChain0700(rootPath: string, relative: string): void {
  let prefix = "";
  for (const segment of relative.split("/")) {
    if (segment.length === 0) throw new Error("empty segment");
    prefix = prefix === "" ? segment : `${prefix}/${segment}`;
    const path = join(rootPath, prefix);
    try {
      mkdirSync(path, { mode: 0o700, recursive: false });
    } catch {
      // EEXIST 视为已存在；类型/mode 由后续 write 前的 verify 兜底。
    }
    const stat = statSync(path);
    if ((stat.mode & 0o170000) !== 0o40000 || (stat.mode & 0o777) !== 0o700) {
      throw new Error(`directory mode drift at ${path}`);
    }
  }
}

async function buildWriterFixture(
  provider: ProviderFixture,
  preSeed?: PreSeed,
): Promise<WriterFixture> {
  const members = fixtureMembers(provider);

  const parent = mkdtempSync(join(tmpdir(), "dh017-hidden-cas-writer-"));
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

    const intent = fixtureIntent(provider);
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

    const remoteBound = provider === "worldlabs-marble-v1"
      ? {
          provider: "worldlabs-marble-v1" as const,
          remoteJobId: "operation_1",
          providerRequestId: null,
        }
      : {
          provider: "hunyuan-ai3d-v1" as const,
          remoteJobId: "12345678",
          providerRequestId: "5b0a1e2e-4c3d-4e5f-8a9b-0c1d2e3f4a5b",
        };
    const identity = provider === "worldlabs-marble-v1"
      ? {
          kind: "marble-world" as const,
          operationId: "operation_1",
          worldId: "world_1",
          spzKey: "500k" as const,
          colliderField: "collider_mesh_url" as const,
        }
      : {
          kind: "hunyuan-file-set" as const,
          jobId: "12345678",
          glbCount: 1,
          objCount: 0,
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
    for (const [index, member] of members.entries()) {
      running = memberWith(running, index, {
        outputRole: member.outputRole,
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
      const candidateName = `${member.outputRole}-c1-a1-${checkpoint}.bin`;
      const candidatePath = join(downloadsPath, candidateName);
      writeFileSync(candidatePath, member.bytes, { mode: 0o600 });
      chmodSync(candidatePath, 0o600);
      const stat = statSync(candidatePath, { bigint: true });
      const inspection = inspectDynamicArtifactBytes(member.format, member.bytes);
      const basename = `${member.outputRole}-c1-a1-${checkpoint}`;
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
        outputRole: member.outputRole,
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
        outputRole: member.outputRole,
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
        outputRole: member.outputRole,
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
    const inspections = members.map((member) => ({
      outputRole: member.outputRole,
      inspection: inspectDynamicArtifactBytes(member.format, member.bytes),
    }));
    const candidatePlan = deriveGeneratedSetCandidatePlan(
      intent,
      remoteBound as never,
      head.payload as never,
      inspections,
    );
    if (preSeed !== undefined) preSeed(rootPath, candidatePlan, members);
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
    const transitionEvidence = transitionGeneratedSetToPublishing(
      evidence,
      root,
      lease,
      intent,
      publicationPlan,
      eligibility,
      PUBLISHING_RECORDED_AT,
    );

    return {
      root,
      lease,
      rootPath,
      intent,
      provider,
      members,
      downloadsPath,
      recordsPath,
      journal,
      candidatePlan,
      publicationPlan,
      eligibility,
      evidence,
      transitionEvidence,
      snapshot,
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

function runWriter(fixture: WriterFixture): unknown {
  return writeGeneratedSetHiddenCas(
    fixture.transitionEvidence,
    fixture.root,
    fixture.lease,
    fixture.intent,
    fixture.publicationPlan,
  );
}

function attemptPath(fixture: WriterFixture): string {
  return join(
    fixture.rootPath,
    dataRootStagingPath(
      fixture.publicationPlan.binding.operationId,
      fixture.evidence.attemptToken,
    ),
  );
}

function candidatePath(fixture: WriterFixture, index: number): string {
  const member = fixture.members[index]!;
  const name = readdirSync(fixture.downloadsPath)
    .find((entry) => entry.startsWith(`${member.outputRole}-`))!;
  return join(fixture.downloadsPath, name);
}

function tryReadBytes(path: string, maxBytes: number): Uint8Array | null {
  try {
    return readStableRegularFileSnapshot(path, maxBytes).bytes;
  } catch {
    return null;
  }
}

/**
 * 公共目标复核：每个已存在 target 都必须是 exact（bytes 重读等于原始 bytes；
 * records/pointer 重读等于 canonical bytes）；pointer 存在 ⇒ 其 content record
 * 必须存在（不产生第二个 public content truth）；catalog/result 始终缺席；
 * Generation head 仍为 publishing；attempt staged 现场只含 closed grammar 的
 * exact canonical 文件。
 */
function assertExactPartialState(fixture: WriterFixture): void {
  expect(() => statSync(join(
    fixture.rootPath,
    fixture.publicationPlan.receiptResultPath,
  ))).toThrow();
  expect(() => statSync(join(
    fixture.rootPath,
    fixture.publicationPlan.catalogPath,
  ))).toThrow();
  expect(fixture.journal.readCurrent().state).toBe("publishing");
  expect(readdirSync(fixture.recordsPath).length).toBe(fixture.recordCount);

  for (const [index, content] of fixture.snapshot.content.entries()) {
    const bytesTarget = join(
      fixture.rootPath,
      generatedArtifactBytesPath(content.contentDigest),
    );
    const bytes = tryReadBytes(bytesTarget, content.contentRecord.byteLength);
    if (bytes !== null) {
      expect(Buffer.from(bytes).equals(Buffer.from(fixture.members[index]!.bytes)))
        .toBe(true);
    }
    const recordTarget = join(
      fixture.rootPath,
      generatedArtifactContentRecordPath(content.contentRecord.recordDigest),
    );
    const recordBytes = tryReadBytes(recordTarget, GENERATED_ARTIFACT_RECORD_MAX_BYTES);
    if (recordBytes !== null) {
      expect(
        Buffer.from(recordBytes).equals(
          Buffer.from(canonicalJsonBytes(content.contentRecord)),
        ),
      ).toBe(true);
    }
    const pointerTarget = join(
      fixture.rootPath,
      generatedArtifactByBytesPointerPath(content.contentDigest),
    );
    const pointerBytes = tryReadBytes(pointerTarget, GENERATED_ARTIFACT_RECORD_MAX_BYTES);
    if (pointerBytes !== null) {
      expect(
        Buffer.from(pointerBytes).equals(
          Buffer.from(canonicalJsonBytes(content.byBytesPointer)),
        ),
      ).toBe(true);
      expect(recordBytes).not.toBeNull();
    }
  }
  for (const member of fixture.snapshot.members) {
    const target = join(
      fixture.rootPath,
      generatedArtifactProvenanceRecordPath(member.provenanceRecord.recordDigest),
    );
    const bytes = tryReadBytes(target, GENERATED_ARTIFACT_RECORD_MAX_BYTES);
    if (bytes !== null) {
      expect(
        Buffer.from(bytes).equals(
          Buffer.from(canonicalJsonBytes(member.provenanceRecord)),
        ),
      ).toBe(true);
    }
  }
  const setTarget = join(
    fixture.rootPath,
    generatedArtifactSetRecordPath(fixture.snapshot.setRecord.artifactSetDigest),
  );
  const setBytes = tryReadBytes(setTarget, GENERATED_ARTIFACT_RECORD_MAX_BYTES);
  if (setBytes !== null) {
    expect(
      Buffer.from(setBytes).equals(
        Buffer.from(canonicalJsonBytes(fixture.snapshot.setRecord)),
      ),
    ).toBe(true);
  }

  for (const name of readdirSync(attemptPath(fixture))) {
    if (name === "operation-intent.json") continue;
    expect(/^[a-f0-9]{64}\.(content|pointer|provenance|set)\.json$/.test(name))
      .toBe(true);
    expect(
      tryReadBytes(join(attemptPath(fixture), name), GENERATED_ARTIFACT_RECORD_MAX_BYTES),
    ).not.toBeNull();
  }
}

function expectTargets(
  fixture: WriterFixture,
  expected: Readonly<Record<string, boolean>>,
): void {
  for (const [index, content] of fixture.snapshot.content.entries()) {
    const prefix = `content-${index}`;
    expect(
      tryReadBytes(
        join(fixture.rootPath, generatedArtifactBytesPath(content.contentDigest)),
        content.contentRecord.byteLength,
      ) !== null,
    ).toBe(expected[`${prefix}.bytes`] ?? false);
    expect(
      tryReadBytes(
        join(
          fixture.rootPath,
          generatedArtifactContentRecordPath(content.contentRecord.recordDigest),
        ),
        GENERATED_ARTIFACT_RECORD_MAX_BYTES,
      ) !== null,
    ).toBe(expected[`${prefix}.record`] ?? false);
    expect(
      tryReadBytes(
        join(
          fixture.rootPath,
          generatedArtifactByBytesPointerPath(content.contentDigest),
        ),
        GENERATED_ARTIFACT_RECORD_MAX_BYTES,
      ) !== null,
    ).toBe(expected[`${prefix}.pointer`] ?? false);
  }
  for (const [index, member] of fixture.snapshot.members.entries()) {
    expect(
      tryReadBytes(
        join(
          fixture.rootPath,
          generatedArtifactProvenanceRecordPath(member.provenanceRecord.recordDigest),
        ),
        GENERATED_ARTIFACT_RECORD_MAX_BYTES,
      ) !== null,
    ).toBe(expected[`provenance-${index}`] ?? false);
  }
  expect(
    tryReadBytes(
      join(
        fixture.rootPath,
        generatedArtifactSetRecordPath(fixture.snapshot.setRecord.artifactSetDigest),
      ),
      GENERATED_ARTIFACT_RECORD_MAX_BYTES,
    ) !== null,
  ).toBe(expected["set"] ?? false);
}

describe("generated-set hidden CAS writer", () => {
  test("Marble happy path: full hidden CAS in phase order, catalog/result absent", async () => {
    const fixture = track(await buildWriterFixture("worldlabs-marble-v1"));
    const result = runWriter(fixture) as ReturnType<typeof writeGeneratedSetHiddenCas>;

    expect(result.kind).toBe("generated-set-hidden-cas-written-v1");
    expect(result.hiddenPhase).toBe("complete");
    expect(result.generationId).toBe(fixture.intent.generationId);
    expect(result.publicationOperationId).toBe(
      fixture.publicationPlan.binding.operationId,
    );
    expect(result.publicationBindingDigest).toBe(
      fixture.publicationPlan.publicationBindingDigest,
    );
    expect(result.artifactSetDigest).toBe(fixture.publicationPlan.artifactSetDigest);
    expect(result.publishingSequence).toBe(
      fixture.transitionEvidence.publishingSequence,
    );
    expect(result.publishingRecordDigest).toBe(
      fixture.transitionEvidence.publishingRecordDigest,
    );
    expect(result.uniqueContentCount).toBe(2);
    expect(result.orderedContentDigests).toEqual(
      fixture.snapshot.content.map((content) => content.contentDigest),
    );
    expect(result.orderedContentRecordDigests).toEqual(
      fixture.snapshot.content.map((content) => content.contentRecord.recordDigest),
    );
    expect(result.orderedProvenanceRecordDigests).toEqual(
      fixture.snapshot.members.map((member) => member.provenanceRecord.recordDigest),
    );
    expect(result.setRecordDigest).toBe(
      fixture.snapshot.setRecord.artifactSetDigest,
    );
    expect(Object.isFrozen(result)).toBe(true);
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain(fixture.rootPath);
    expect(serialized).not.toContain(tmpdir());

    // 全部 public hidden targets 已按 phase 完成且 exact。
    expectTargets(fixture, {
      "content-0.bytes": true,
      "content-0.record": true,
      "content-0.pointer": true,
      "content-1.bytes": true,
      "content-1.record": true,
      "content-1.pointer": true,
      "provenance-0": true,
      "provenance-1": true,
      set: true,
    });

    // bytes CAS 与 private candidate 同一 inode（hard-link，无 copy）。
    for (const [index] of fixture.members.entries()) {
      const content = fixture.snapshot.content[index]!;
      expect(
        statSync(join(
          fixture.rootPath,
          generatedArtifactBytesPath(content.contentDigest),
        )).ino,
      ).toBe(statSync(candidatePath(fixture, index)).ino);
    }
    // 每个 final record/pointer/set 与 attempt 内 staged 文件同一 inode。
    const stagedDir = attemptPath(fixture);
    for (const content of fixture.snapshot.content) {
      const pointerFinal = join(
        fixture.rootPath,
        generatedArtifactByBytesPointerPath(content.contentDigest),
      );
      const pointerStaged = join(
        stagedDir,
        `${content.contentDigest}.pointer.json`,
      );
      expect(statSync(pointerFinal).ino).toBe(statSync(pointerStaged).ino);
      expect(statSync(pointerFinal).nlink).toBe(2);
    }
    for (const member of fixture.snapshot.members) {
      const final = join(
        fixture.rootPath,
        generatedArtifactProvenanceRecordPath(member.provenanceRecord.recordDigest),
      );
      expect(statSync(final).ino).toBe(
        statSync(join(stagedDir, `${member.provenanceRecord.recordDigest}.provenance.json`)).ino,
      );
    }
    const setFinal = join(
      fixture.rootPath,
      generatedArtifactSetRecordPath(fixture.snapshot.setRecord.artifactSetDigest),
    );
    expect(statSync(setFinal).ino).toBe(
      statSync(join(stagedDir, `${fixture.snapshot.setRecord.artifactSetDigest}.set.json`)).ino,
    );

    // hidden evidence 保留：candidate 与 attempt 现场未删除。
    expect(readdirSync(fixture.downloadsPath).length).toBeGreaterThan(0);
    const stagedNames = readdirSync(stagedDir);
    expect(stagedNames).toContain("operation-intent.json");
    expect(stagedNames.length).toBe(8); // intent + 2 content + 2 pointer + 2 provenance + set

    // catalog/result 仍缺席；Generation head 未推进。
    expect(() => statSync(join(
      fixture.rootPath,
      fixture.publicationPlan.receiptResultPath,
    ))).toThrow();
    expect(() => statSync(join(
      fixture.rootPath,
      fixture.publicationPlan.catalogPath,
    ))).toThrow();
    expect(fixture.journal.readCurrent().state).toBe("publishing");
    expect(readdirSync(fixture.recordsPath).length).toBe(fixture.recordCount);
  }, 120_000);

  test("Hunyuan happy path: single-member set", async () => {
    const fixture = track(await buildWriterFixture("hunyuan-ai3d-v1"));
    const result = runWriter(fixture) as ReturnType<typeof writeGeneratedSetHiddenCas>;

    expect(result.uniqueContentCount).toBe(1);
    expect(result.orderedProvenanceRecordDigests.length).toBe(1);
    expect(result.generationId).toBe(fixture.intent.generationId);
    expectTargets(fixture, {
      "content-0.bytes": true,
      "content-0.record": true,
      "content-0.pointer": true,
      "provenance-0": true,
      set: true,
    });
    expect(() => statSync(join(
      fixture.rootPath,
      fixture.publicationPlan.receiptResultPath,
    ))).toThrow();
    expect(() => statSync(join(
      fixture.rootPath,
      fixture.publicationPlan.catalogPath,
    ))).toThrow();
    expect(fixture.journal.readCurrent().state).toBe("publishing");
  }, 120_000);

  test("startup resume reuses the one hidden CAS core, then converges through existing visible/verified tail", async () => {
    for (const provider of ["worldlabs-marble-v1", "hunyuan-ai3d-v1"] as const) {
      const fixture = track(await buildWriterFixture(provider));
      const firstResume = inspectGeneratedSetHiddenCasStartupResume(
        fixture.root,
        fixture.lease,
        fixture.intent,
        fixture.publicationPlan,
      );
      const firstHidden = resumeGeneratedSetHiddenCasAtStartup(
        firstResume,
        fixture.root,
        fixture.lease,
        fixture.intent,
        fixture.publicationPlan,
      );
      const hiddenInodes = fixture.snapshot.content.map((content) => statSync(join(
        fixture.rootPath,
        generatedArtifactBytesPath(content.contentDigest),
      )).ino);
      const replayPlan = deriveGeneratedSetPublicationPlan(
        fixture.root,
        fixture.candidatePlan,
        inspectGeneratedSetStoragePreflight(fixture.root, fixture.candidatePlan),
      );
      const replayResume = inspectGeneratedSetHiddenCasStartupResume(
        fixture.root,
        fixture.lease,
        fixture.intent,
        replayPlan,
      );
      const replayHidden = resumeGeneratedSetHiddenCasAtStartup(
        replayResume,
        fixture.root,
        fixture.lease,
        fixture.intent,
        replayPlan,
      );
      expect(replayHidden.hiddenPhase).toBe("complete");
      expect(fixture.snapshot.content.map((content) => statSync(join(
        fixture.rootPath,
        generatedArtifactBytesPath(content.contentDigest),
      )).ino)).toEqual(hiddenInodes);
      const visible = commitGeneratedSetVisible(
        firstHidden,
        fixture.root,
        fixture.lease,
        fixture.intent,
        fixture.publicationPlan,
      );
      const verified = transitionGeneratedSetVisibleToVerified(
        visible,
        fixture.root,
        fixture.lease,
        fixture.intent,
        fixture.publicationPlan,
        "2026-08-18T07:30:00.000Z",
      );
      expect(verified.generationId).toBe(fixture.intent.generationId);
      expect(fixture.journal.readCurrent().state).toBe("verified");
    }
  }, 240_000);

  test("startup resume rejects forged authority and Phase-A private-candidate inode drift before CAS mutation", async () => {
    const fixture = track(await buildWriterFixture("hunyuan-ai3d-v1"));
    const resume = inspectGeneratedSetHiddenCasStartupResume(
      fixture.root,
      fixture.lease,
      fixture.intent,
      fixture.publicationPlan,
    );
    expectRecovery(() => resumeGeneratedSetHiddenCasAtStartup(
      Object.freeze({ ...resume }),
      fixture.root,
      fixture.lease,
      fixture.intent,
      fixture.publicationPlan,
    ));
    expectTargets(fixture, {});

    const candidate = candidatePath(fixture, 0);
    const original = readFileSync(candidate);
    unlinkSync(candidate);
    writeFileSync(candidate, original, { mode: 0o600 });
    expectRecovery(() => resumeGeneratedSetHiddenCasAtStartup(
      resume,
      fixture.root,
      fixture.lease,
      fixture.intent,
      fixture.publicationPlan,
    ));
    expectTargets(fixture, {});
  }, 120_000);

  test("recoverPendingOperations covers the exact generated attempt and converges Marble/Hunyuan", async () => {
    for (const provider of ["worldlabs-marble-v1", "hunyuan-ai3d-v1"] as const) {
      const fixture = track(await buildWriterFixture(provider));
      const reader = new WorldProjectWriter(
        fixture.root,
        fixture.lease,
        new ArtifactStoreReader(fixture.root),
      ).reader();
      recoverPendingOperations(fixture.root, fixture.lease, reader);
      expect(fixture.journal.readCurrent().state).toBe("verified");
      expect(() => statSync(join(fixture.rootPath, fixture.publicationPlan.catalogPath)))
        .not.toThrow();
      expect(() => statSync(join(fixture.rootPath, fixture.publicationPlan.receiptResultPath)))
        .not.toThrow();
    }
  }, 240_000);

  test("real startup resumes representative hidden partial and hidden-complete catalog handoff crashes", async () => {
    const partial = track(await buildWriterFixture("worldlabs-marble-v1"));
    const partialReader = new WorldProjectWriter(
      partial.root, partial.lease, new ArtifactStoreReader(partial.root),
    ).reader();
    const restorePartial = GENERATED_SET_HIDDEN_CAS_WRITER_TEST_SEAMS.replaceStageHook(
      "after-provenance-link",
      () => { throw new Error("hidden partial"); },
    );
    expect(() => runWriter(partial)).toThrow("hidden partial");
    restorePartial();
    recoverPendingOperations(partial.root, partial.lease, partialReader);
    expect(partial.journal.readCurrent().state).toBe("verified");

    const handoff = track(await buildWriterFixture("hunyuan-ai3d-v1"));
    const handoffReader = new WorldProjectWriter(
      handoff.root, handoff.lease, new ArtifactStoreReader(handoff.root),
    ).reader();
    runWriter(handoff);
    const hiddenInode = statSync(join(
      handoff.rootPath,
      generatedArtifactBytesPath(handoff.snapshot.content[0]!.contentDigest),
    )).ino;
    const restoreCatalog = GENERATED_SET_VISIBLE_COMMIT_TEST_SEAMS.replaceStageHook(
      "after-catalog-link",
      () => { throw new Error("catalog handoff"); },
    );
    expect(() => recoverPendingOperations(handoff.root, handoff.lease, handoffReader))
      .toThrow("catalog handoff");
    restoreCatalog();
    expect(() => statSync(join(handoff.rootPath, handoff.publicationPlan.catalogPath)))
      .not.toThrow();
    expect(() => statSync(join(handoff.rootPath, handoff.publicationPlan.receiptResultPath)))
      .toThrow();
    recoverPendingOperations(handoff.root, handoff.lease, handoffReader);
    expect(handoff.journal.readCurrent().state).toBe("verified");
    expect(statSync(join(
      handoff.rootPath,
      generatedArtifactBytesPath(handoff.snapshot.content[0]!.contentDigest),
    )).ino).toBe(hiddenInode);
  }, 300_000);

  test("Phase-A generated-set drift hook rejects candidate/head/receipt/capacity/attempt before startup CAS", async () => {
    const drifts: readonly [string, (fixture: WriterFixture) => void][] = [
      ["candidate", (fixture) => {
        const path = candidatePath(fixture, 0);
        const bytes = readFileSync(path);
        unlinkSync(path);
        writeFileSync(path, bytes, { mode: 0o600 });
      }],
      ["head", (fixture) => writeFileSync(join(fixture.recordsPath, "..", "head.json"), "{}", { mode: 0o600 })],
      ["receipt", (fixture) => unlinkSync(join(fixture.rootPath, fixture.publicationPlan.receiptIntentPath))],
      ["capacity", (fixture) => writeFileSync(join(fixture.rootPath, "receipts", "foreign.intent.json"), "{}", { mode: 0o600 })],
      ["attempt", (fixture) => writeFileSync(join(attemptPath(fixture), "foreign"), "x", { mode: 0o600 })],
    ];
    for (const [_name, drift] of drifts) {
      const fixture = track(await buildWriterFixture("hunyuan-ai3d-v1"));
      const reader = new WorldProjectWriter(
        fixture.root, fixture.lease, new ArtifactStoreReader(fixture.root),
      ).reader();
      const restore = STARTUP_RECOVERY_TEST_SEAMS.replaceGeneratedSetApplyHook(() => drift(fixture));
      try {
        expectRecovery(() => recoverPendingOperations(fixture.root, fixture.lease, reader));
      } finally {
        restore();
      }
      expectTargets(fixture, {});
      expect(() => statSync(join(fixture.rootPath, fixture.publicationPlan.catalogPath))).toThrow();
      expect(() => statSync(join(fixture.rootPath, fixture.publicationPlan.receiptResultPath))).toThrow();
    }
  }, 300_000);

  test("advanced-birth preflight accepts legal publishing candidates and rejects malformed chain/download evidence", async () => {
    const legal = track(await buildWriterFixture("hunyuan-ai3d-v1"));
    expect(inspectGenerationBirthStartupRecovery(legal.root, legal.lease)).toBeUndefined();

    for (const [_name, mutate] of [
      ["chain", (fixture: WriterFixture) => writeFileSync(
        join(fixture.recordsPath, "..", "head.json"), "{}", { mode: 0o600 },
      )],
      ["wrong-mode", (fixture: WriterFixture) => chmodSync(candidatePath(fixture, 0), 0o644)],
      ["foreign", (fixture: WriterFixture) => writeFileSync(
        join(fixture.downloadsPath, "foreign.bin"), "x", { mode: 0o600 },
      )],
    ] as const) {
      const fixture = track(await buildWriterFixture("hunyuan-ai3d-v1"));
      mutate(fixture);
      expect(() => inspectGenerationBirthStartupRecovery(fixture.root, fixture.lease))
        .toThrow("GENERATION_RECOVERY_REQUIRED");
    }
  }, 240_000);

  test("verified restart is read-only with retained private candidates; foreign terminal download fails closed", async () => {
    const fixture = track(await buildWriterFixture("hunyuan-ai3d-v1"));
    const reader = new WorldProjectWriter(
      fixture.root, fixture.lease, new ArtifactStoreReader(fixture.root),
    ).reader();
    recoverPendingOperations(fixture.root, fixture.lease, reader);
    const catalog = readFileSync(join(fixture.rootPath, fixture.publicationPlan.catalogPath));
    const result = readFileSync(join(fixture.rootPath, fixture.publicationPlan.receiptResultPath));
    const recordCount = readdirSync(fixture.recordsPath).length;
    const candidateInode = statSync(candidatePath(fixture, 0)).ino;
    recoverPendingOperations(fixture.root, fixture.lease, reader);
    expect(readFileSync(join(fixture.rootPath, fixture.publicationPlan.catalogPath))).toEqual(catalog);
    expect(readFileSync(join(fixture.rootPath, fixture.publicationPlan.receiptResultPath))).toEqual(result);
    expect(readdirSync(fixture.recordsPath).length).toBe(recordCount);
    expect(statSync(candidatePath(fixture, 0)).ino).toBe(candidateInode);

    writeFileSync(join(fixture.downloadsPath, "foreign.bin"), "x", { mode: 0o600 });
    expectRecovery(() => recoverPendingOperations(fixture.root, fixture.lease, reader));
    expect(readFileSync(join(fixture.rootPath, fixture.publicationPlan.catalogPath))).toEqual(catalog);
    expect(readFileSync(join(fixture.rootPath, fixture.publicationPlan.receiptResultPath))).toEqual(result);
    expect(statSync(candidatePath(fixture, 0)).ino).toBe(candidateInode);
  }, 180_000);


  test("phase order: fault at every staged-write/link/dir-fsync boundary fails closed", async () => {
    const stages: readonly GeneratedSetHiddenCasWriterStage[] = [
      "after-bytes-link",
      "after-bytes-dir-fsync",
      "after-content-staged-write",
      "after-content-link",
      "after-content-dir-fsync",
      "after-pointer-staged-write",
      "after-pointer-link",
      "after-pointer-dir-fsync",
      "after-provenance-staged-write",
      "after-provenance-link",
      "after-provenance-dir-fsync",
      "after-set-staged-write",
      "after-set-link",
      "after-set-dir-fsync",
    ];
    for (const stage of stages) {
      const fixture = track(await buildWriterFixture("worldlabs-marble-v1"));
      const restore = GENERATED_SET_HIDDEN_CAS_WRITER_TEST_SEAMS.replaceStageHook(
        stage,
        (reached) => {
          if (reached === stage) throw new Error(`injected kill at ${stage}`);
        },
      );
      let thrown: unknown;
      try {
        runWriter(fixture);
      } catch (error) {
        thrown = error;
      } finally {
        restore();
      }
      expect(thrown).toBeDefined();
      assertExactPartialState(fixture);
    }
  }, 600_000);

  test("phase order: Marble writes members in exact phase order", async () => {
    // kill at first bytes link：只有 content-0 bytes 出现。
    {
      const fixture = track(await buildWriterFixture("worldlabs-marble-v1"));
      const restore = GENERATED_SET_HIDDEN_CAS_WRITER_TEST_SEAMS.replaceStageHook(
        "after-bytes-link",
        (reached) => {
          if (reached === "after-bytes-link") throw new Error("kill");
        },
      );
      expectRecovery(() => runWriter(fixture));
      restore();
      expectTargets(fixture, { "content-0.bytes": true });
      assertExactPartialState(fixture);
    }
    // kill at first content dir-fsync：bytes 全部完成、content-0 record 存在。
    {
      const fixture = track(await buildWriterFixture("worldlabs-marble-v1"));
      const restore = GENERATED_SET_HIDDEN_CAS_WRITER_TEST_SEAMS.replaceStageHook(
        "after-content-dir-fsync",
        (reached) => {
          if (reached === "after-content-dir-fsync") throw new Error("kill");
        },
      );
      expectRecovery(() => runWriter(fixture));
      restore();
      expectTargets(fixture, {
        "content-0.bytes": true,
        "content-1.bytes": true,
        "content-0.record": true,
      });
      assertExactPartialState(fixture);
    }
    // kill at first pointer dir-fsync：content-0 pointer 存在、content-1 record 未写。
    {
      const fixture = track(await buildWriterFixture("worldlabs-marble-v1"));
      const restore = GENERATED_SET_HIDDEN_CAS_WRITER_TEST_SEAMS.replaceStageHook(
        "after-pointer-dir-fsync",
        (reached) => {
          if (reached === "after-pointer-dir-fsync") throw new Error("kill");
        },
      );
      expectRecovery(() => runWriter(fixture));
      restore();
      expectTargets(fixture, {
        "content-0.bytes": true,
        "content-1.bytes": true,
        "content-0.record": true,
        "content-0.pointer": true,
      });
      assertExactPartialState(fixture);
    }
    // kill at first provenance dir-fsync：provenance-0 存在、provenance-1 未写。
    {
      const fixture = track(await buildWriterFixture("worldlabs-marble-v1"));
      const restore = GENERATED_SET_HIDDEN_CAS_WRITER_TEST_SEAMS.replaceStageHook(
        "after-provenance-dir-fsync",
        (reached) => {
          if (reached === "after-provenance-dir-fsync") throw new Error("kill");
        },
      );
      expectRecovery(() => runWriter(fixture));
      restore();
      expectTargets(fixture, {
        "content-0.bytes": true,
        "content-1.bytes": true,
        "content-0.record": true,
        "content-0.pointer": true,
        "content-1.record": true,
        "content-1.pointer": true,
        "provenance-0": true,
      });
      assertExactPartialState(fixture);
    }
    // kill at second content staged-write：content-1 record 未发布（staged 已存在）。
    {
      const fixture = track(await buildWriterFixture("worldlabs-marble-v1"));
      let calls = 0;
      const restore = GENERATED_SET_HIDDEN_CAS_WRITER_TEST_SEAMS.replaceStageHook(
        "after-content-staged-write",
        (reached) => {
          if (reached === "after-content-staged-write") {
            calls += 1;
            if (calls === 2) throw new Error("kill");
          }
        },
      );
      expectRecovery(() => runWriter(fixture));
      restore();
      expectTargets(fixture, {
        "content-0.bytes": true,
        "content-1.bytes": true,
        "content-0.record": true,
        "content-0.pointer": true,
      });
      // staged content-1 文件已落 attempt 目录且 exact。
      const staged = join(
        attemptPath(fixture),
        `${fixture.snapshot.content[1]!.contentRecord.recordDigest}.content.json`,
      );
      expect(
        Buffer.from(
          tryReadBytes(staged, GENERATED_ARTIFACT_RECORD_MAX_BYTES)!,
        ).equals(
          Buffer.from(canonicalJsonBytes(fixture.snapshot.content[1]!.contentRecord)),
        ),
      ).toBe(true);
      assertExactPartialState(fixture);
    }
  }, 600_000);

  test("Hunyuan writes one member and never exposes a second public content truth", async () => {
    const fixture = track(await buildWriterFixture("hunyuan-ai3d-v1"));
    const restore = GENERATED_SET_HIDDEN_CAS_WRITER_TEST_SEAMS.replaceStageHook(
      "after-pointer-link",
      (reached) => {
        if (reached === "after-pointer-link") throw new Error("kill");
      },
    );
    expectRecovery(() => runWriter(fixture));
    restore();
    expectTargets(fixture, {
      "content-0.bytes": true,
      "content-0.record": true,
      "content-0.pointer": true,
    });
    expect(
      tryReadBytes(
        join(
          fixture.rootPath,
          generatedArtifactSetRecordPath(fixture.snapshot.setRecord.artifactSetDigest),
        ),
        GENERATED_ARTIFACT_RECORD_MAX_BYTES,
      ),
    ).toBeNull();
    assertExactPartialState(fixture);
  }, 120_000);

  test("exact pre-existing targets converge without overwrite; shared bytes reuse one truth", async () => {
    // 模拟另一 provider 已把同一 GLB bytes 的 bytes/content/by-bytes 先发布为
    // exact hidden evidence（content record 是 provider-agnostic，byte-identical
    // 共享同一 truth），并留下 spz content record orphan 与 exact set record。
    const fixture = track(await buildWriterFixture("worldlabs-marble-v1", (rootPath, candidatePlan, members) => {
      const glb = candidatePlan.orderedMembers[1]!;
      const glbBytes = members[1]!.bytes;
      mkdirChain0700(rootPath, "artifacts/sha256");
      writeNewSyncedFile(
        join(rootPath, generatedArtifactBytesPath(glb.contentRecord.digest)),
        glbBytes,
      );
      mkdirChain0700(rootPath, "artifacts/records/content/sha256");
      writeNewSyncedFile(
        join(rootPath, generatedArtifactContentRecordPath(glb.contentRecord.recordDigest)),
        canonicalJsonBytes(glb.contentRecord),
      );
      mkdirChain0700(rootPath, "artifacts/records/content/by-bytes/sha256");
      writeNewSyncedFile(
        join(rootPath, generatedArtifactByBytesPointerPath(glb.contentRecord.digest)),
        canonicalJsonBytes(glb.byBytesPointer),
      );
      syncDirectory(join(rootPath, "artifacts/records/content/by-bytes/sha256"));
      const spz = candidatePlan.orderedMembers[0]!;
      writeNewSyncedFile(
        join(rootPath, generatedArtifactContentRecordPath(spz.contentRecord.recordDigest)),
        canonicalJsonBytes(spz.contentRecord),
      );
      syncDirectory(join(rootPath, "artifacts/records/content/sha256"));
      mkdirChain0700(rootPath, "artifacts/sets/sha256");
      writeNewSyncedFile(
        join(rootPath, generatedArtifactSetRecordPath(candidatePlan.artifactSetRecord.artifactSetDigest)),
        canonicalJsonBytes(candidatePlan.artifactSetRecord),
      );
      syncDirectory(join(rootPath, "artifacts/sets/sha256"));
    }));

    const glbBytesInode = statSync(join(
      fixture.rootPath,
      generatedArtifactBytesPath(fixture.snapshot.content[1]!.contentDigest),
    )).ino;
    const spzRecordInode = statSync(join(
      fixture.rootPath,
      generatedArtifactContentRecordPath(fixture.snapshot.content[0]!.contentRecord.recordDigest),
    )).ino;
    const glbPointerInode = statSync(join(
      fixture.rootPath,
      generatedArtifactByBytesPointerPath(fixture.snapshot.content[1]!.contentDigest),
    )).ino;
    const setInode = statSync(join(
      fixture.rootPath,
      generatedArtifactSetRecordPath(fixture.snapshot.setRecord.artifactSetDigest),
    )).ino;

    runWriter(fixture);

    // pre-existing exact 全部复用：inode 不变、无 overwrite。
    expect(statSync(join(
      fixture.rootPath,
      generatedArtifactBytesPath(fixture.snapshot.content[1]!.contentDigest),
    )).ino).toBe(glbBytesInode);
    expect(statSync(join(
      fixture.rootPath,
      generatedArtifactContentRecordPath(fixture.snapshot.content[0]!.contentRecord.recordDigest),
    )).ino).toBe(spzRecordInode);
    expect(statSync(join(
      fixture.rootPath,
      generatedArtifactByBytesPointerPath(fixture.snapshot.content[1]!.contentDigest),
    )).ino).toBe(glbPointerInode);
    expect(statSync(join(
      fixture.rootPath,
      generatedArtifactSetRecordPath(fixture.snapshot.setRecord.artifactSetDigest),
    )).ino).toBe(setInode);
    // spz bytes 由 private candidate hard-link 发布；spz pointer 为新发布。
    expect(statSync(join(
      fixture.rootPath,
      generatedArtifactBytesPath(fixture.snapshot.content[0]!.contentDigest),
    )).ino).toBe(statSync(candidatePath(fixture, 0)).ino);
    const stagedDir = attemptPath(fixture);
    expect(statSync(join(
      fixture.rootPath,
      generatedArtifactByBytesPointerPath(fixture.snapshot.content[0]!.contentDigest),
    )).ino).toBe(
      statSync(join(stagedDir, `${fixture.snapshot.content[0]!.contentDigest}.pointer.json`)).ino,
    );
    // provenance 仍保留两个 distinct records。
    expectTargets(fixture, {
      "content-0.bytes": true,
      "content-0.record": true,
      "content-0.pointer": true,
      "content-1.bytes": true,
      "content-1.record": true,
      "content-1.pointer": true,
      "provenance-0": true,
      "provenance-1": true,
      set: true,
    });
    expect(readdirSync(stagedDir).length).toBe(4); // intent + spz pointer + 2 provenance
    expect(() => statSync(join(
      fixture.rootPath,
      fixture.publicationPlan.receiptResultPath,
    ))).toThrow();
    expect(() => statSync(join(
      fixture.rootPath,
      fixture.publicationPlan.catalogPath,
    ))).toThrow();
  }, 120_000);

  test("durable drift fails closed before the next mutation and preserves evidence", async () => {
    interface DriftCase {
      readonly inject: (fixture: WriterFixture) => void;
      readonly resultAppears?: true;
      readonly catalogAppears?: true;
      readonly headDrift?: true;
    }
    const drifts: readonly DriftCase[] = [
      // receipt intent same-bytes replacement inode。
      {
        inject: (fixture) => {
          const receipt = join(fixture.rootPath, fixture.publicationPlan.receiptIntentPath);
          const bytes = readFileSync(receipt);
          unlinkSync(receipt);
          writeNewSyncedFile(receipt, bytes);
        },
      },
      // receipt intent body 漂移。
      {
        inject: (fixture) => {
          const receipt = join(fixture.rootPath, fixture.publicationPlan.receiptIntentPath);
          unlinkSync(receipt);
          writeNewSyncedFile(receipt, canonicalJsonBytes(fixture.publicationPlan.binding).subarray(0, -2));
        },
      },
      // staged intent 缺席。
      {
        inject: (fixture) => {
          unlinkSync(join(
            attemptPath(fixture),
            "operation-intent.json",
          ));
        },
      },
      // attempt 目录改名（24-hex token 现场失效）。
      {
        inject: (fixture) => {
          renameSync(attemptPath(fixture), `${attemptPath(fixture)}-renamed`);
        },
      },
      // result 出现。
      {
        inject: (fixture) => {
          writeNewSyncedFile(
            join(fixture.rootPath, fixture.publicationPlan.receiptResultPath),
            canonicalJsonBytes(fixture.publicationPlan.expectedResult),
          );
        },
        resultAppears: true,
      },
      // catalog 出现。
      {
        inject: (fixture) => {
          mkdirChain0700(fixture.rootPath, "artifacts/catalog");
          writeNewSyncedFile(
            join(fixture.rootPath, fixture.publicationPlan.catalogPath),
            canonicalJsonBytes(fixture.publicationPlan.catalogBody),
          );
        },
        catalogAppears: true,
      },
      // bytes CAS drift（exact 0600 但内容错误）。
      {
        inject: (fixture) => {
          const content = fixture.snapshot.content[1]!;
          writeNewSyncedFile(
            join(fixture.rootPath, generatedArtifactBytesPath(content.contentDigest)),
            fixture.members[0]!.bytes,
          );
        },
      },
      // content record drift（指向另一内容的 canonical record）。
      {
        inject: (fixture) => {
          const content = fixture.snapshot.content[0]!;
          const other = fixture.snapshot.content[1]!;
          mkdirChain0700(fixture.rootPath, "artifacts/records/content/sha256");
          writeNewSyncedFile(
            join(
              fixture.rootPath,
              generatedArtifactContentRecordPath(content.contentRecord.recordDigest),
            ),
            canonicalJsonBytes(other.contentRecord),
          );
        },
      },
      // pointer-to-second-descriptor。
      {
        inject: (fixture) => {
          const content = fixture.snapshot.content[0]!;
          const other = fixture.snapshot.content[1]!;
          mkdirChain0700(fixture.rootPath, "artifacts/records/content/by-bytes/sha256");
          writeNewSyncedFile(
            join(
              fixture.rootPath,
              generatedArtifactByBytesPointerPath(content.contentDigest),
            ),
            canonicalJsonBytes({
              assetId: other.byBytesPointer.assetId,
              contentDigest: other.byBytesPointer.contentDigest,
              contentRecordDigest: other.byBytesPointer.contentRecordDigest,
            }),
          );
        },
      },
      // pointer symlink。
      {
        inject: (fixture) => {
          const content = fixture.snapshot.content[0]!;
          const pointerPath = join(
            fixture.rootPath,
            generatedArtifactByBytesPointerPath(content.contentDigest),
          );
          mkdirChain0700(fixture.rootPath, "artifacts/records/content/by-bytes/sha256");
          symlinkSync(
            join(fixture.rootPath, "receipts", "generations", "namespace.json"),
            pointerPath,
          );
        },
      },
      // content record wrong mode。
      {
        inject: (fixture) => {
          const content = fixture.snapshot.content[0]!;
          const recordPath = join(
            fixture.rootPath,
            generatedArtifactContentRecordPath(content.contentRecord.recordDigest),
          );
          mkdirChain0700(fixture.rootPath, "artifacts/records/content/sha256");
          writeNewSyncedFile(recordPath, canonicalJsonBytes(content.contentRecord));
          chmodSync(recordPath, 0o644);
        },
      },
      // private candidate inode replacement（same bytes）。
      {
        inject: (fixture) => {
          const path = candidatePath(fixture, 0);
          const bytes = readFileSync(path);
          unlinkSync(path);
          writeFileSync(path, bytes, { mode: 0o600 });
          chmodSync(path, 0o600);
        },
      },
      // private candidate bytes replacement。
      {
        inject: (fixture) => {
          const path = candidatePath(fixture, 1);
          unlinkSync(path);
          writeFileSync(path, fixture.members[0]!.bytes, { mode: 0o600 });
          chmodSync(path, 0o600);
        },
      },
      // publishing head drift（head 回指 validating record）。
      {
        inject: (fixture) => {
          const validating = fixture.journal.readValidatedChain();
          const head = validating[validating.length - 2]!;
          const headPath = join(fixture.rootPath, "receipts", "generations", "data",
            generationIdDigest(fixture.intent.generationId), "head.json");
          unlinkSync(headPath);
          writeNewSyncedFile(headPath, canonicalJsonBytes({
            generationId: fixture.intent.generationId,
            sequence: head.sequence,
            recordDigest: generationStateRecordDigest(head),
          }));
        },
        headDrift: true,
      },
      // attempt 目录 extra/foreign staging entry。
      {
        inject: (fixture) => {
          writeNewSyncedFile(join(attemptPath(fixture), "foreign.json"), new TextEncoder().encode("{}"));
        },
      },
      // attempt 目录 wrong-digest staged name（grammar 内但不在 expected 集合）。
      {
        inject: (fixture) => {
          writeNewSyncedFile(
            join(attemptPath(fixture), `${"f".repeat(64)}.pointer.json`),
            new TextEncoder().encode("{}"),
          );
        },
      },
      // attempt 目录 wrong-type staged（symlink）。
      {
        inject: (fixture) => {
          symlinkSync(
            join(fixture.rootPath, fixture.publicationPlan.receiptIntentPath),
            join(attemptPath(fixture), `${"e".repeat(64)}.set.json`),
          );
        },
      },
    ];
    for (const drift of drifts) {
      const fixture = track(await buildWriterFixture("worldlabs-marble-v1"));
      drift.inject(fixture);
      expectRecovery(() => runWriter(fixture));
      // 零 public CAS mutation：journal 未推进，records 未变；注入的 drift 证据保留。
      if (drift.resultAppears === true) {
        expect(readFileSync(join(
          fixture.rootPath,
          fixture.publicationPlan.receiptResultPath,
        ))).toEqual(canonicalJsonBytes(fixture.publicationPlan.expectedResult));
      } else {
        expect(() => statSync(join(
          fixture.rootPath,
          fixture.publicationPlan.receiptResultPath,
        ))).toThrow();
      }
      if (drift.catalogAppears === true) {
        expect(readFileSync(join(
          fixture.rootPath,
          fixture.publicationPlan.catalogPath,
        ))).toEqual(canonicalJsonBytes(fixture.publicationPlan.catalogBody));
      } else {
        expect(() => statSync(join(
          fixture.rootPath,
          fixture.publicationPlan.catalogPath,
        ))).toThrow();
      }
      if (drift.headDrift !== true) {
        expect(fixture.journal.readCurrent().state).toBe("publishing");
      }
      expect(readdirSync(fixture.recordsPath).length).toBe(fixture.recordCount);
    }
  }, 600_000);

  test("pointer exact but record missing fails before any record/provenance/set mutation", async () => {
    const fixture = track(await buildWriterFixture("worldlabs-marble-v1", (rootPath, candidatePlan) => {
      const glb = candidatePlan.orderedMembers[1]!;
      mkdirChain0700(rootPath, "artifacts/records/content/by-bytes/sha256");
      writeNewSyncedFile(
        join(rootPath, generatedArtifactByBytesPointerPath(glb.contentRecord.digest)),
        canonicalJsonBytes(glb.byBytesPointer),
      );
      syncDirectory(join(rootPath, "artifacts/records/content/by-bytes/sha256"));
    }));
    expectRecovery(() => runWriter(fixture));
    // bytes CAS 可能已完成（phase 1），content-0 record/pointer 已发布；
    // content-1 record 缺失（注入的 pointer-without-record 证据保留）、
    // provenance/set 均未发布。
    expectTargets(fixture, {
      "content-0.bytes": true,
      "content-0.record": true,
      "content-0.pointer": true,
      "content-1.bytes": true,
      "content-1.pointer": true,
    });
    // 注入的 exact pointer 原样保留；其背后 record 仍缺失（没有第二个 public
    // content truth 被伪造出来）。
    expect(
      Buffer.from(
        tryReadBytes(
          join(
            fixture.rootPath,
            generatedArtifactByBytesPointerPath(
              fixture.snapshot.content[1]!.contentDigest,
            ),
          ),
          GENERATED_ARTIFACT_RECORD_MAX_BYTES,
        )!,
      ).equals(
        Buffer.from(canonicalJsonBytes(fixture.snapshot.content[1]!.byBytesPointer)),
      ),
    ).toBe(true);
    expect(
      tryReadBytes(
        join(
          fixture.rootPath,
          generatedArtifactContentRecordPath(
            fixture.snapshot.content[1]!.contentRecord.recordDigest,
          ),
        ),
        GENERATED_ARTIFACT_RECORD_MAX_BYTES,
      ),
    ).toBeNull();
    expect(() => statSync(join(
      fixture.rootPath,
      fixture.publicationPlan.receiptResultPath,
    ))).toThrow();
    expect(() => statSync(join(
      fixture.rootPath,
      fixture.publicationPlan.catalogPath,
    ))).toThrow();
    expect(fixture.journal.readCurrent().state).toBe("publishing");
  }, 120_000);

  test("forged/cross inputs: zero CAS mutation, valid authority intact", async () => {
    const fixture = track(await buildWriterFixture("worldlabs-marble-v1"));
    const foreign = track(await buildWriterFixture("hunyuan-ai3d-v1"));

    expectRecovery(() => writeGeneratedSetHiddenCas(
      JSON.parse(JSON.stringify(fixture.transitionEvidence)),
      fixture.root,
      fixture.lease,
      fixture.intent,
      fixture.publicationPlan,
    ));
    const reopened = openDataRoot(fixture.rootPath);
    cleanups.push(() => reopened.close());
    expectRecovery(() => writeGeneratedSetHiddenCas(
      fixture.transitionEvidence,
      reopened,
      fixture.lease,
      fixture.intent,
      fixture.publicationPlan,
    ));
    expectRecovery(() => writeGeneratedSetHiddenCas(
      fixture.transitionEvidence,
      fixture.root,
      foreign.lease,
      fixture.intent,
      fixture.publicationPlan,
    ));
    expectRecovery(() => writeGeneratedSetHiddenCas(
      fixture.transitionEvidence,
      fixture.root,
      fixture.lease,
      foreign.intent,
      fixture.publicationPlan,
    ));
    expectRecovery(() => writeGeneratedSetHiddenCas(
      fixture.transitionEvidence,
      fixture.root,
      fixture.lease,
      fixture.intent,
      foreign.publicationPlan,
    ));
    expectRecovery(() => writeGeneratedSetHiddenCas(
      foreign.transitionEvidence,
      fixture.root,
      fixture.lease,
      fixture.intent,
      fixture.publicationPlan,
    ));
    expect(() => statSync(join(
      fixture.rootPath,
      fixture.publicationPlan.receiptResultPath,
    ))).toThrow();
    expect(() => statSync(join(
      fixture.rootPath,
      fixture.publicationPlan.catalogPath,
    ))).toThrow();
    expect(readdirSync(fixture.recordsPath).length).toBe(fixture.recordCount);
    expect(
      readdirSync(join(fixture.rootPath, "artifacts", "sha256")).length,
    ).toBe(0);

    // 原有效 authority 未被错误输入消耗。
    const result = runWriter(fixture) as ReturnType<typeof writeGeneratedSetHiddenCas>;
    expect(result.hiddenPhase).toBe("complete");
  }, 120_000);

  test("closed lease rejects the writer before mutation", async () => {
    const fixture = track(await buildWriterFixture("worldlabs-marble-v1"));
    await fixture.lease.close();
    expectRecovery(() => runWriter(fixture));
  });

  test("re-invocation after success fails closed (startup convergence is a later slice)", async () => {
    const fixture = track(await buildWriterFixture("worldlabs-marble-v1"));
    runWriter(fixture);
    // 第二次调用：storage snapshot 已漂移（targets 由 absent 变 existing），
    // 在第一个 CAS mutation 前 fail closed；不 overwrite、不删除。
    const bytesInode = statSync(join(
      fixture.rootPath,
      generatedArtifactBytesPath(fixture.snapshot.content[0]!.contentDigest),
    )).ino;
    expectRecovery(() => runWriter(fixture));
    expect(statSync(join(
      fixture.rootPath,
      generatedArtifactBytesPath(fixture.snapshot.content[0]!.contentDigest),
    )).ino).toBe(bytesInode);
    assertExactPartialState(fixture);
  }, 120_000);

  test("hidden CAS provenance: same root/lease only, no path leakage in evidence", async () => {
    const fixture = track(await buildWriterFixture("worldlabs-marble-v1"));
    const result = runWriter(fixture) as ReturnType<typeof writeGeneratedSetHiddenCas>;
    const provenance = requireGeneratedSetHiddenCasProvenance(
      result,
      fixture.root,
      fixture.lease,
    );
    expect(provenance.plan).toBe(fixture.publicationPlan);
    expect(provenance.intentPath).toBe(join(
      fixture.rootPath,
      fixture.publicationPlan.receiptIntentPath,
    ));
    expect(provenance.attemptPath).toBe(attemptPath(fixture));
    expect(Object.isFrozen(provenance)).toBe(true);

    const foreign = track(await buildWriterFixture("hunyuan-ai3d-v1"));
    expectRecovery(() => requireGeneratedSetHiddenCasProvenance(
      result,
      foreign.root,
      foreign.lease,
    ));
    expectRecovery(() => requireGeneratedSetHiddenCasProvenance(
      JSON.parse(JSON.stringify(result)),
      fixture.root,
      fixture.lease,
    ));
    const reopened = openDataRoot(fixture.rootPath);
    cleanups.push(() => reopened.close());
    expectRecovery(() => requireGeneratedSetHiddenCasProvenance(
      result,
      reopened,
      fixture.lease,
    ));
    expect(JSON.stringify(result)).not.toContain(fixture.rootPath);
    expect(JSON.stringify(result)).not.toContain(tmpdir());
  }, 120_000);

  test("source scan: package-private, no public facade or framework dependency", () => {
    const source = readFileSync(
      join(import.meta.dir, "generated-set-hidden-cas-writer.ts"),
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
    expect(indexSource).not.toContain("generated-set-hidden-cas-writer");
    expect(indexSource).not.toContain("generated-set-publishing-transition");
  });
});
