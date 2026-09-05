import { afterEach, describe, expect, test } from "bun:test";
import {
  chmodSync,
  existsSync,
  linkSync,
  lstatSync,
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

import { MARBLE_HUNYUAN_REGISTRY, canonicalJsonBytes, sha256Hex } from "@demiurges/world";

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
import { GENERATION_RECORD_JOURNAL_TEST_SEAMS } from "./generation-record-journal";
import { inspectDynamicArtifactBytes } from "./generation-artifact-inspector";
import {
  createGenerationNamespaceBody,
  createGenerationNamespaceInstallBinding,
  createGenerationNamespaceInstallBindingFromLeaseDigest,
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
  requireGeneratedSetPublicationBinding,
  type GeneratedSetPublicationPlanV1,
} from "./generated-artifact-publication";
import {
  deriveGeneratedSetPublicationEligibility,
  type GeneratedSetPublicationEligibilityV1,
} from "./generated-set-publication-eligibility";
import { authorizeGeneratedSetAdmission } from "./generated-set-admission";
import {
  writeGeneratedSetPublicationIntent,
  type AdmittedGeneratedSetIntentEvidenceV1,
} from "./generated-set-intent-writer";
import {
  transitionGeneratedSetToPublishing,
  type GeneratedSetPublishingTransitionEvidenceV1,
} from "./generated-set-publishing-transition";
import {
  writeGeneratedSetHiddenCas,
  type GeneratedSetHiddenCasEvidenceV1,
} from "./generated-set-hidden-cas-writer";
import {
  GENERATED_SET_VISIBLE_COMMIT_TEST_SEAMS,
  commitGeneratedSetVisible,
  type GeneratedSetVisibleCommitEvidenceV1,
  type GeneratedSetVisibleCommitStage,
} from "./generated-set-visible-commit";
import {
  transitionGeneratedSetVisibleToVerified,
} from "./generated-set-verified-transition";
import {
  applyGeneratedSetStartupRecovery,
  GENERATED_SET_STARTUP_RECOVERY_TEST_SEAMS,
  inspectGeneratedSetStartupRecovery,
} from "./generated-set-startup-recovery";
import {
  generatedArtifactByBytesPointerPath,
  generatedArtifactBytesPath,
  generatedArtifactContentRecordPath,
  generatedArtifactProvenanceRecordPath,
  generatedArtifactSetRecordPath,
} from "./generated-artifact-layout";
import { GENERATED_ARTIFACT_RECORD_MAX_BYTES } from "./generated-artifact-records";
import { OperationJournal, OperationJournalError } from "./operation-journal";
import { ArtifactStoreReader } from "./artifact-store";
import {
  GeneratedArtifactReader,
  GENERATED_ARTIFACT_READER_TEST_SEAMS,
  requireGeneratedArtifactReaderRoleFormat,
} from "./generated-artifact-reader";
import { WorldProjectWriter } from "./project-store";
import { recoverPendingOperations } from "./startup-recovery";
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
    prompt: "A bounded visible commit world",
    costUnknownAccepted: true,
    waitForCompletionAndDownload: true,
    idempotencyKey: `visible-commit-${provider === "worldlabs-marble-v1" ? "marble" : "hunyuan"}-${intentNonce}`,
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

interface CommitFixture {
  readonly root: OpenedDataRoot;
  readonly lease: DataRootWriterLease;
  readonly rootPath: string;
  readonly intent: GenerationIntentV1;
  readonly provider: ProviderFixture;
  readonly members: readonly FixtureMember[];
  readonly downloadsPath: string;
  readonly recordsPath: string;
  readonly journal: GenerationRecordJournal;
  readonly publicationPlan: GeneratedSetPublicationPlanV1;
  readonly eligibility: GeneratedSetPublicationEligibilityV1;
  readonly evidence: AdmittedGeneratedSetIntentEvidenceV1;
  readonly transitionEvidence: GeneratedSetPublishingTransitionEvidenceV1;
  readonly hiddenEvidence: GeneratedSetHiddenCasEvidenceV1;
  readonly snapshot: GeneratedSetStoragePreflightSnapshotV1;
  readonly recordCount: number;
  close(): Promise<void>;
}

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

async function buildCommitFixture(
  provider: ProviderFixture,
): Promise<CommitFixture> {
  const members = fixtureMembers(provider);

  const parent = mkdtempSync(join(tmpdir(), "dh017-visible-commit-"));
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
    const hiddenEvidence = writeGeneratedSetHiddenCas(
      transitionEvidence,
      root,
      lease,
      intent,
      publicationPlan,
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
      publicationPlan,
      eligibility,
      evidence,
      transitionEvidence,
      hiddenEvidence,
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

function track(fixture: CommitFixture): CommitFixture {
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

function runCommit(fixture: CommitFixture): GeneratedSetVisibleCommitEvidenceV1 {
  return commitGeneratedSetVisible(
    fixture.hiddenEvidence,
    fixture.root,
    fixture.lease,
    fixture.intent,
    fixture.publicationPlan,
  );
}

function runVerifiedTransition(
  fixture: CommitFixture,
  visibleEvidence: GeneratedSetVisibleCommitEvidenceV1,
) {
  return transitionGeneratedSetVisibleToVerified(
    visibleEvidence,
    fixture.root,
    fixture.lease,
    fixture.intent,
    fixture.publicationPlan,
    "2026-08-15T10:00:16.000Z",
  );
}

function attemptPath(fixture: CommitFixture): string {
  return join(
    fixture.rootPath,
    dataRootStagingPath(
      fixture.publicationPlan.binding.operationId,
      fixture.evidence.attemptToken,
    ),
  );
}

function catalogPathOf(fixture: CommitFixture): string {
  return join(fixture.rootPath, fixture.publicationPlan.catalogPath);
}

function resultPathOf(fixture: CommitFixture): string {
  return join(fixture.rootPath, fixture.publicationPlan.receiptResultPath);
}

function tryReadBytes(path: string, maxBytes: number): Uint8Array | null {
  try {
    return readStableRegularFileSnapshot(path, maxBytes).bytes;
  } catch {
    return null;
  }
}

function assertTarget(
  path: string,
  expectedBytes: Uint8Array,
  stagedPath: string,
): void {
  const bytes = tryReadBytes(path, GENERATED_ARTIFACT_RECORD_MAX_BYTES);
  expect(bytes).not.toBeNull();
  expect(Buffer.from(bytes!).equals(Buffer.from(expectedBytes))).toBe(true);
  const stat = statSync(path, { bigint: true });
  expect(stat.mode & 0o7777n).toBe(0o600n);
  const staged = statSync(stagedPath, { bigint: true });
  expect(staged.dev).toBe(stat.dev);
  expect(staged.ino).toBe(stat.ino);
  expect(stat.nlink).toBe(2n);
}

function assertTargetAbsent(path: string): void {
  expect(() => statSync(path)).toThrow();
}

/**
 * 完整可见现场：catalog/result exact、与 attempt 内 staged 同一 inode；全部
 * hidden targets 仍 exact；Generation head 仍为 publishing；attempt 只含
 * closed grammar 的 intent + hidden staged + catalog/result staged 名。
 */
function assertVisibleComplete(fixture: CommitFixture): void {
  assertTarget(
    catalogPathOf(fixture),
    canonicalJsonBytes(fixture.publicationPlan.catalogBody),
    join(attemptPath(fixture), "catalog.json"),
  );
  assertTarget(
    resultPathOf(fixture),
    canonicalJsonBytes(fixture.publicationPlan.expectedResult),
    join(attemptPath(fixture), "result.json"),
  );
  expect(fixture.journal.readCurrent().state).toBe("publishing");
  expect(readdirSync(fixture.recordsPath).length).toBe(fixture.recordCount);

  for (const [index, content] of fixture.snapshot.content.entries()) {
    const bytes = tryReadBytes(
      join(fixture.rootPath, generatedArtifactBytesPath(content.contentDigest)),
      content.contentRecord.byteLength,
    );
    expect(bytes).not.toBeNull();
    expect(Buffer.from(bytes!).equals(Buffer.from(fixture.members[index]!.bytes)))
      .toBe(true);
    expect(
      tryReadBytes(
        join(
          fixture.rootPath,
          generatedArtifactContentRecordPath(content.contentRecord.recordDigest),
        ),
        GENERATED_ARTIFACT_RECORD_MAX_BYTES,
      ),
    ).not.toBeNull();
    expect(
      tryReadBytes(
        join(
          fixture.rootPath,
          generatedArtifactByBytesPointerPath(content.contentDigest),
        ),
        GENERATED_ARTIFACT_RECORD_MAX_BYTES,
      ),
    ).not.toBeNull();
  }
  for (const member of fixture.snapshot.members) {
    expect(
      tryReadBytes(
        join(
          fixture.rootPath,
          generatedArtifactProvenanceRecordPath(member.provenanceRecord.recordDigest),
        ),
        GENERATED_ARTIFACT_RECORD_MAX_BYTES,
      ),
    ).not.toBeNull();
  }
  expect(
    tryReadBytes(
      join(
        fixture.rootPath,
        generatedArtifactSetRecordPath(fixture.snapshot.setRecord.artifactSetDigest),
      ),
      GENERATED_ARTIFACT_RECORD_MAX_BYTES,
    ),
  ).not.toBeNull();

  const names = readdirSync(attemptPath(fixture)).sort();
  const hiddenNames = [
    ...fixture.snapshot.content.map(
      (content) => `${content.contentRecord.recordDigest}.content.json`,
    ),
    ...fixture.snapshot.content.map(
      (content) => `${content.contentDigest}.pointer.json`,
    ),
    ...fixture.snapshot.members.map(
      (member) => `${member.provenanceRecord.recordDigest}.provenance.json`,
    ),
    `${fixture.snapshot.setRecord.artifactSetDigest}.set.json`,
    "catalog.json",
    "result.json",
  ].sort();
  expect(names).toEqual(["operation-intent.json", ...hiddenNames].sort());
}

describe("generated-set visible commit", () => {
  test("Marble happy path: catalog then result, exact same-inode evidence, frozen", async () => {
    const fixture = track(await buildCommitFixture("worldlabs-marble-v1"));
    const result = runCommit(fixture);

    expect(result.kind).toBe("generated-set-visible-commit-v1");
    expect(result.generationId).toBe(fixture.intent.generationId);
    expect(result.provider).toBe("worldlabs-marble-v1");
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
    expect(result.catalogDigest).toBe(fixture.publicationPlan.catalogDigest);
    expect(result.resultDigest).toBe(sha256Hex(
      canonicalJsonBytes(fixture.publicationPlan.expectedResult),
    ));
    expect(result.setRecordDigest).toBe(fixture.snapshot.setRecord.artifactSetDigest);
    expect(result.orderedContentRecordDigests).toEqual(
      fixture.snapshot.content.map((content) => content.contentRecord.recordDigest),
    );
    expect(result.orderedProvenanceRecordDigests).toEqual(
      fixture.snapshot.members.map((member) => member.provenanceRecord.recordDigest),
    );
    expect(Object.isFrozen(result)).toBe(true);
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain(fixture.rootPath);
    expect(serialized).not.toContain(tmpdir());

    assertTarget(
      resultPathOf(fixture),
      canonicalJsonBytes(fixture.publicationPlan.expectedResult),
      join(attemptPath(fixture), "result.json"),
    );
    expect(readdirSync(fixture.downloadsPath).length).toBeGreaterThan(0);
  }, 120_000);

  test("Hunyuan happy path: single-member visible commit", async () => {
    const fixture = track(await buildCommitFixture("hunyuan-ai3d-v1"));
    const result = runCommit(fixture);
    expect(result.orderedProvenanceRecordDigests.length).toBe(1);
    expect(result.orderedContentRecordDigests.length).toBe(1);
    expect(result.generationId).toBe(fixture.intent.generationId);
    assertVisibleComplete(fixture);
  }, 120_000);

  test("exact order: no result before catalog-dir fsync; no visibility before result-dir fsync", async () => {
    // kill at after-catalog-link：catalog link 已存在但 catalog 目录尚未 fsync，
    // result 必须仍 absent。
    {
      const fixture = track(await buildCommitFixture("worldlabs-marble-v1"));
      const restore = GENERATED_SET_VISIBLE_COMMIT_TEST_SEAMS.replaceStageHook(
        "after-catalog-link",
        (reached) => {
          if (reached === "after-catalog-link") throw new Error("kill");
        },
      );
      let thrown: unknown;
      try {
        runCommit(fixture);
      } catch (error) {
        thrown = error;
      } finally {
        restore();
      }
      expect(thrown).toBeDefined();
      expect(statSync(catalogPathOf(fixture)).nlink).toBe(2);
      assertTargetAbsent(resultPathOf(fixture));
      expect(fixture.journal.readCurrent().state).toBe("publishing");
      // resume：精确补完 catalog dir fsync 后继续 result。
      runCommit(fixture);
      assertVisibleComplete(fixture);
    }
    // kill at after-result-link：result link 已存在但 receipts 尚未 fsync，
    // 本调用不得铸造 visibility evidence；resume 后完成。
    {
      const fixture = track(await buildCommitFixture("worldlabs-marble-v1"));
      const restore = GENERATED_SET_VISIBLE_COMMIT_TEST_SEAMS.replaceStageHook(
        "after-result-link",
        (reached) => {
          if (reached === "after-result-link") throw new Error("kill");
        },
      );
      let thrown: unknown;
      try {
        runCommit(fixture);
      } catch (error) {
        thrown = error;
      } finally {
        restore();
      }
      expect(thrown).toBeDefined();
      expect(statSync(catalogPathOf(fixture)).nlink).toBe(2);
      expect(statSync(resultPathOf(fixture)).nlink).toBe(2);
      // evidence 未铸造：attempt 内 staged result 已存在但调用抛错。
      expect(fixture.journal.readCurrent().state).toBe("publishing");
      const resumed = runCommit(fixture);
      expect(resumed.kind).toBe("generated-set-visible-commit-v1");
      assertVisibleComplete(fixture);
    }
  }, 120_000);

  test("kill/fault at every milestone: deterministic exact resume to complete visibility", async () => {
    const stages: readonly {
      readonly stage: GeneratedSetVisibleCommitStage;
      readonly catalog: boolean;
      readonly result: boolean;
    }[] = [
      { stage: "after-catalog-staged-write", catalog: false, result: false },
      { stage: "after-catalog-attempt-fsync", catalog: false, result: false },
      { stage: "after-catalog-link", catalog: true, result: false },
      { stage: "after-catalog-dir-fsync", catalog: true, result: false },
      { stage: "after-result-staged-write", catalog: true, result: false },
      { stage: "after-result-attempt-fsync", catalog: true, result: false },
      { stage: "after-result-link", catalog: true, result: true },
      { stage: "after-receipts-fsync", catalog: true, result: true },
    ];
    for (const { stage, catalog, result } of stages) {
      const fixture = track(await buildCommitFixture("worldlabs-marble-v1"));
      const restore = GENERATED_SET_VISIBLE_COMMIT_TEST_SEAMS.replaceStageHook(
        stage,
        (reached) => {
          if (reached === stage) throw new Error(`injected kill at ${stage}`);
        },
      );
      let thrown: unknown;
      try {
        runCommit(fixture);
      } catch (error) {
        thrown = error;
      } finally {
        restore();
      }
      expect(thrown).toBeDefined();
      if (catalog) {
        expect(
          Buffer.from(
            tryReadBytes(catalogPathOf(fixture), GENERATED_ARTIFACT_RECORD_MAX_BYTES)!,
          ).equals(canonicalJsonBytes(fixture.publicationPlan.catalogBody)),
        ).toBe(true);
      } else {
        assertTargetAbsent(catalogPathOf(fixture));
      }
      if (result) {
        expect(
          Buffer.from(
            tryReadBytes(resultPathOf(fixture), GENERATED_ARTIFACT_RECORD_MAX_BYTES)!,
          ).equals(canonicalJsonBytes(fixture.publicationPlan.expectedResult)),
        ).toBe(true);
      } else {
        assertTargetAbsent(resultPathOf(fixture));
      }
      expect(fixture.journal.readCurrent().state).toBe("publishing");
      // 同一 live 现场精确 resume（catalog 不重写、只补缺失项）。
      const evidence = runCommit(fixture);
      expect(evidence.kind).toBe("generated-set-visible-commit-v1");
      assertVisibleComplete(fixture);
    }
  }, 600_000);

  test("catalog-only is hidden pending; fresh live call resumes exact catalog -> result", async () => {
    const fixture = track(await buildCommitFixture("worldlabs-marble-v1"));
    const restore = GENERATED_SET_VISIBLE_COMMIT_TEST_SEAMS.replaceStageHook(
      "after-catalog-dir-fsync",
      (reached) => {
        if (reached === "after-catalog-dir-fsync") throw new Error("kill");
      },
    );
    let thrown: unknown;
    try {
      runCommit(fixture);
    } catch (error) {
      thrown = error;
    } finally {
      restore();
    }
    expect(thrown).toBeDefined();
    // catalog durable、result absent：hidden pending，不是可见提交。
    assertTarget(
      catalogPathOf(fixture),
      canonicalJsonBytes(fixture.publicationPlan.catalogBody),
      join(attemptPath(fixture), "catalog.json"),
    );
    assertTargetAbsent(resultPathOf(fixture));
    const catalogInode = statSync(catalogPathOf(fixture)).ino;
    expect(fixture.journal.readCurrent().state).toBe("publishing");
    // 新鲜调用精确 resume：catalog 原 inode 不变，只补 result。
    runCommit(fixture);
    expect(statSync(catalogPathOf(fixture)).ino).toBe(catalogInode);
    assertVisibleComplete(fixture);
  }, 120_000);

  test("result without catalog / missing member: recovery-required, zero mutation", async () => {
    // result-only：catalog absent 时 result 已存在 → recovery-required。
    {
      const fixture = track(await buildCommitFixture("worldlabs-marble-v1"));
      writeNewSyncedFile(
        resultPathOf(fixture),
        canonicalJsonBytes(fixture.publicationPlan.expectedResult),
      );
      expectRecovery(() => runCommit(fixture));
      assertTargetAbsent(catalogPathOf(fixture));
      expect(
        tryReadBytes(resultPathOf(fixture), GENERATED_ARTIFACT_RECORD_MAX_BYTES),
      ).not.toBeNull();
      expect(fixture.journal.readCurrent().state).toBe("publishing");
    }
    // 缺失 member：删除一个 bytes CAS 后 join 必须失败，catalog/result 零 mutation。
    {
      const fixture = track(await buildCommitFixture("worldlabs-marble-v1"));
      const content = fixture.snapshot.content[1]!;
      unlinkSync(join(
        fixture.rootPath,
        generatedArtifactBytesPath(content.contentDigest),
      ));
      expectRecovery(() => runCommit(fixture));
      assertTargetAbsent(catalogPathOf(fixture));
      assertTargetAbsent(resultPathOf(fixture));
      expect(fixture.journal.readCurrent().state).toBe("publishing");
      expect(readdirSync(fixture.recordsPath).length).toBe(fixture.recordCount);
    }
  }, 120_000);

  test("forged/copy/cross-root/cross-lease/cross-plan/cross-intent/stale head: zero catalog/result mutation", async () => {
    const fixture = track(await buildCommitFixture("worldlabs-marble-v1"));
    const foreign = track(await buildCommitFixture("hunyuan-ai3d-v1"));

    // 序列化副本。
    expectRecovery(() => commitGeneratedSetVisible(
      JSON.parse(JSON.stringify(fixture.hiddenEvidence)),
      fixture.root,
      fixture.lease,
      fixture.intent,
      fixture.publicationPlan,
    ));
    // cross-root：同一路径的新 open handle。
    const reopened = openDataRoot(fixture.rootPath);
    cleanups.push(() => reopened.close());
    expectRecovery(() => commitGeneratedSetVisible(
      fixture.hiddenEvidence,
      reopened,
      fixture.lease,
      fixture.intent,
      fixture.publicationPlan,
    ));
    // cross-lease。
    expectRecovery(() => commitGeneratedSetVisible(
      fixture.hiddenEvidence,
      fixture.root,
      foreign.lease,
      fixture.intent,
      fixture.publicationPlan,
    ));
    // cross-intent。
    expectRecovery(() => commitGeneratedSetVisible(
      fixture.hiddenEvidence,
      fixture.root,
      fixture.lease,
      foreign.intent,
      fixture.publicationPlan,
    ));
    // cross-plan。
    expectRecovery(() => commitGeneratedSetVisible(
      fixture.hiddenEvidence,
      fixture.root,
      fixture.lease,
      fixture.intent,
      foreign.publicationPlan,
    ));
    // foreign evidence。
    expectRecovery(() => commitGeneratedSetVisible(
      foreign.hiddenEvidence,
      fixture.root,
      fixture.lease,
      fixture.intent,
      fixture.publicationPlan,
    ));
    // stale publishing head（head.json 回指 validating record）：head 回退后
    // publishing record 成为 committed chain 外 final，journal 永久 fail closed；
    // 零 catalog/result mutation 且证据保留。
    {
      const fixture2 = track(await buildCommitFixture("worldlabs-marble-v1"));
      const validating = fixture2.journal.readValidatedChain();
      const head = validating[validating.length - 2]!;
      const headPath = join(fixture2.rootPath, "receipts", "generations", "data",
        generationIdDigest(fixture2.intent.generationId), "head.json");
      unlinkSync(headPath);
      writeNewSyncedFile(headPath, canonicalJsonBytes({
        generationId: fixture2.intent.generationId,
        sequence: head.sequence,
        recordDigest: generationStateRecordDigest(head),
      }));
      expectRecovery(() => runCommit(fixture2));
      assertTargetAbsent(catalogPathOf(fixture2));
      assertTargetAbsent(resultPathOf(fixture2));
      expect(readdirSync(fixture2.recordsPath).length).toBe(fixture2.recordCount);
      expect(() => fixture2.journal.readCurrent()).toThrow();
    }

    assertTargetAbsent(catalogPathOf(fixture));
    assertTargetAbsent(resultPathOf(fixture));
    expect(readdirSync(fixture.recordsPath).length).toBe(fixture.recordCount);
    expect(readdirSync(join(fixture.rootPath, "artifacts", "sha256")).length)
      .toBe(2);

    // 原有效 authority 未被错误输入消耗。
    const result = runCommit(fixture);
    expect(result.kind).toBe("generated-set-visible-commit-v1");
    assertVisibleComplete(fixture);
  }, 120_000);

  test("durable drift fails closed before the next mutation and preserves evidence", async () => {
    interface DriftCase {
      readonly inject: (fixture: CommitFixture, foreign: CommitFixture) => void;
      readonly resultAppears?: true;
      readonly catalogAppears?: true;
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
      // receipt intent body 漂移（foreign binding bytes）。
      {
        inject: (fixture, foreign) => {
          const receipt = join(fixture.rootPath, fixture.publicationPlan.receiptIntentPath);
          unlinkSync(receipt);
          writeNewSyncedFile(receipt, canonicalJsonBytes(foreign.publicationPlan.binding));
        },
      },
      // staged intent 缺席。
      {
        inject: (fixture) => {
          unlinkSync(join(attemptPath(fixture), "operation-intent.json"));
        },
      },
      // attempt 目录改名（24-hex token 现场失效）。
      {
        inject: (fixture) => {
          renameSync(attemptPath(fixture), `${attemptPath(fixture)}-renamed`);
        },
      },
      // catalog body drift（exact 0600 但内容错误）。
      {
        inject: (fixture) => {
          mkdirChain0700(fixture.rootPath, "artifacts/catalog");
          writeNewSyncedFile(
            catalogPathOf(fixture),
            new TextEncoder().encode("{}"),
          );
        },
        catalogAppears: true,
      },
      // catalog symlink。
      {
        inject: (fixture) => {
          mkdirChain0700(fixture.rootPath, "artifacts/catalog");
          symlinkSync(
            join(fixture.rootPath, "receipts", "generations", "namespace.json"),
            catalogPathOf(fixture),
          );
        },
        catalogAppears: true,
      },
      // catalog wrong mode（0644）。
      {
        inject: (fixture) => {
          mkdirChain0700(fixture.rootPath, "artifacts/catalog");
          writeNewSyncedFile(
            catalogPathOf(fixture),
            canonicalJsonBytes(fixture.publicationPlan.catalogBody),
          );
          chmodSync(catalogPathOf(fixture), 0o644);
        },
        catalogAppears: true,
      },
      // result body drift。
      {
        inject: (fixture) => {
          writeNewSyncedFile(resultPathOf(fixture), new TextEncoder().encode("{}"));
        },
        resultAppears: true,
      },
      // result symlink。
      {
        inject: (fixture) => {
          symlinkSync(
            join(fixture.rootPath, "receipts", "generations", "namespace.json"),
            resultPathOf(fixture),
          );
        },
        resultAppears: true,
      },
      // bytes CAS drift（exact 0600 但内容错误）。
      {
        inject: (fixture) => {
          const content = fixture.snapshot.content[1]!;
          const target = join(
            fixture.rootPath,
            generatedArtifactBytesPath(content.contentDigest),
          );
          unlinkSync(target);
          writeNewSyncedFile(target, fixture.members[0]!.bytes);
        },
      },
      // content record drift（指向另一内容的 canonical record）。
      {
        inject: (fixture) => {
          const content = fixture.snapshot.content[0]!;
          const other = fixture.snapshot.content[1]!;
          const target = join(
            fixture.rootPath,
            generatedArtifactContentRecordPath(content.contentRecord.recordDigest),
          );
          unlinkSync(target);
          writeNewSyncedFile(target, canonicalJsonBytes(other.contentRecord));
        },
      },
      // pointer drift（second-descriptor pointer 放在 content-0 pointer 目标）。
      {
        inject: (fixture) => {
          const content = fixture.snapshot.content[0]!;
          const other = fixture.snapshot.content[1]!;
          const target = join(
            fixture.rootPath,
            generatedArtifactByBytesPointerPath(content.contentDigest),
          );
          unlinkSync(target);
          writeNewSyncedFile(target, canonicalJsonBytes({
            assetId: other.byBytesPointer.assetId,
            contentDigest: other.byBytesPointer.contentDigest,
            contentRecordDigest: other.byBytesPointer.contentRecordDigest,
          }));
        },
      },
      // pointer symlink。
      {
        inject: (fixture) => {
          const content = fixture.snapshot.content[0]!;
          const target = join(
            fixture.rootPath,
            generatedArtifactByBytesPointerPath(content.contentDigest),
          );
          unlinkSync(target);
          symlinkSync(
            join(fixture.rootPath, "receipts", "generations", "namespace.json"),
            target,
          );
        },
      },
      // provenance record drift（foreign member 的 provenance 放在 member-0 目标：
      // generation/provider/job/request/role/format 全部来自另一 set）。
      {
        inject: (fixture, foreign) => {
          const member = fixture.snapshot.members[0]!;
          const foreignMember = foreign.snapshot.members[0]!;
          const target = join(
            fixture.rootPath,
            generatedArtifactProvenanceRecordPath(member.provenanceRecord.recordDigest),
          );
          unlinkSync(target);
          writeNewSyncedFile(
            target,
            canonicalJsonBytes(foreignMember.provenanceRecord),
          );
        },
      },
      // provenance 顺序交换（member/order drift，内容各自 canonical）。
      {
        inject: (fixture) => {
          const first = fixture.snapshot.members[0]!;
          const second = fixture.snapshot.members[1]!;
          const firstTarget = join(
            fixture.rootPath,
            generatedArtifactProvenanceRecordPath(first.provenanceRecord.recordDigest),
          );
          unlinkSync(firstTarget);
          writeNewSyncedFile(
            firstTarget,
            canonicalJsonBytes(second.provenanceRecord),
          );
        },
      },
      // set record drift（non-canonical body）。
      {
        inject: (fixture) => {
          const target = join(
            fixture.rootPath,
            generatedArtifactSetRecordPath(fixture.snapshot.setRecord.artifactSetDigest),
          );
          unlinkSync(target);
          writeNewSyncedFile(target, new TextEncoder().encode('{"schemaVersion":1}'));
        },
      },
      // missing member（删除 provenance target）。
      {
        inject: (fixture) => {
          const member = fixture.snapshot.members[1]!;
          unlinkSync(join(
            fixture.rootPath,
            generatedArtifactProvenanceRecordPath(member.provenanceRecord.recordDigest),
          ));
        },
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
      const fixture = track(await buildCommitFixture("worldlabs-marble-v1"));
      const foreign = track(await buildCommitFixture("hunyuan-ai3d-v1"));
      drift.inject(fixture, foreign);
      expectRecovery(() => runCommit(fixture));
      // 零 catalog/result mutation：注入的 drift 证据原样保留（symlink/mode
      // drift 可能不可稳定读取，用 no-follow lstat 证明路径仍存在）。
      if (drift.resultAppears === true) {
        expect(() => lstatSync(resultPathOf(fixture))).not.toThrow();
      } else {
        assertTargetAbsent(resultPathOf(fixture));
      }
      if (drift.catalogAppears === true) {
        expect(() => lstatSync(catalogPathOf(fixture))).not.toThrow();
      } else {
        assertTargetAbsent(catalogPathOf(fixture));
      }
      expect(fixture.journal.readCurrent().state).toBe("publishing");
      expect(readdirSync(fixture.recordsPath).length).toBe(fixture.recordCount);
    }
  }, 600_000);

  test("post-commit same-bytes replacement inode / unlink: replay fails closed", async () => {
    // catalog same-bytes replacement inode：staged/final 不再同一 inode → 拒绝，
    // 现场（foreign catalog + 既有 result）全部保留。
    {
      const fixture = track(await buildCommitFixture("worldlabs-marble-v1"));
      const result = runCommit(fixture);
      expect(result.kind).toBe("generated-set-visible-commit-v1");
      const catalogBytes = readFileSync(catalogPathOf(fixture));
      unlinkSync(catalogPathOf(fixture));
      writeNewSyncedFile(catalogPathOf(fixture), catalogBytes);
      expectRecovery(() => runCommit(fixture));
      expect(
        Buffer.from(
          tryReadBytes(catalogPathOf(fixture), GENERATED_ARTIFACT_RECORD_MAX_BYTES)!,
        ).equals(catalogBytes),
      ).toBe(true);
      expect(
        tryReadBytes(resultPathOf(fixture), GENERATED_ARTIFACT_RECORD_MAX_BYTES),
      ).not.toBeNull();
      expect(fixture.journal.readCurrent().state).toBe("publishing");
    }
    // result same-bytes replacement inode：同样拒绝且不产生新 mutation。
    {
      const fixture = track(await buildCommitFixture("worldlabs-marble-v1"));
      const result = runCommit(fixture);
      expect(result.kind).toBe("generated-set-visible-commit-v1");
      const resultBytes = readFileSync(resultPathOf(fixture));
      unlinkSync(resultPathOf(fixture));
      writeNewSyncedFile(resultPathOf(fixture), resultBytes);
      expectRecovery(() => runCommit(fixture));
      expect(
        Buffer.from(
          tryReadBytes(resultPathOf(fixture), GENERATED_ARTIFACT_RECORD_MAX_BYTES)!,
        ).equals(resultBytes),
      ).toBe(true);
      expect(
        tryReadBytes(catalogPathOf(fixture), GENERATED_ARTIFACT_RECORD_MAX_BYTES),
      ).not.toBeNull();
      expect(fixture.journal.readCurrent().state).toBe("publishing");
    }
    // catalog unlink：catalog 缺席但 result 已存在 → recovery-required。
    {
      const fixture = track(await buildCommitFixture("worldlabs-marble-v1"));
      runCommit(fixture);
      unlinkSync(catalogPathOf(fixture));
      expectRecovery(() => runCommit(fixture));
      expect(
        tryReadBytes(resultPathOf(fixture), GENERATED_ARTIFACT_RECORD_MAX_BYTES),
      ).not.toBeNull();
      expect(fixture.journal.readCurrent().state).toBe("publishing");
    }
  }, 120_000);

  test("re-invocation after success is an exact read-only replay minting the same identity", async () => {
    const fixture = track(await buildCommitFixture("worldlabs-marble-v1"));
    const first = runCommit(fixture);
    const catalogInode = statSync(catalogPathOf(fixture)).ino;
    const resultInode = statSync(resultPathOf(fixture)).ino;
    const stagedNames = readdirSync(attemptPath(fixture)).sort();
    const second = runCommit(fixture);
    expect(second).toEqual(first);
    expect(statSync(catalogPathOf(fixture)).ino).toBe(catalogInode);
    expect(statSync(resultPathOf(fixture)).ino).toBe(resultInode);
    expect(readdirSync(attemptPath(fixture)).sort()).toEqual(stagedNames);
    expect(fixture.journal.readCurrent().state).toBe("publishing");
    assertVisibleComplete(fixture);
  }, 120_000);

  test("visible join advances exactly once to verified and same evidence replays", async () => {
    for (const provider of ["worldlabs-marble-v1", "hunyuan-ai3d-v1"] as const) {
      const fixture = track(await buildCommitFixture(provider));
      const visible = runCommit(fixture);
      const catalogInode = statSync(catalogPathOf(fixture)).ino;
      const resultInode = statSync(resultPathOf(fixture)).ino;
      const beforeRecords = readdirSync(fixture.recordsPath).sort();
      const first = runVerifiedTransition(fixture, visible);
      expect(first.artifactSetDigest).toBe(fixture.publicationPlan.artifactSetDigest);
      expect(first.publicationOperationId).toBe(fixture.publicationPlan.binding.operationId);
      expect(fixture.journal.readCurrent().state).toBe("verified");
      expect(readdirSync(fixture.recordsPath).length).toBe(beforeRecords.length + 1);
      expect(statSync(catalogPathOf(fixture)).ino).toBe(catalogInode);
      expect(statSync(resultPathOf(fixture)).ino).toBe(resultInode);
      expect(runVerifiedTransition(fixture, visible)).toEqual(first);
      expect(readdirSync(fixture.recordsPath).length).toBe(beforeRecords.length + 1);
    }
  }, 120_000);

  test("read-only generated reader exposes only terminal complete Marble and Hunyuan sets", async () => {
    for (const provider of ["worldlabs-marble-v1", "hunyuan-ai3d-v1"] as const) {
      const fixture = track(await buildCommitFixture(provider));
      const reader = new GeneratedArtifactReader(fixture.root);
      expect(reader.list()).toEqual([]);
      const visible = runCommit(fixture);
      expect(() => reader.list()).toThrow("GENERATION_RECOVERY_REQUIRED");
      runVerifiedTransition(fixture, visible);
      const listed = reader.list();
      expect(listed).toHaveLength(1);
      expect(listed[0]?.generationId).toBe(fixture.intent.generationId);
      expect(listed[0]?.members.map((member) => member.role)).toEqual(
        fixture.members.map((member) => member.outputRole),
      );
      for (const [index, member] of listed[0]!.members.entries()) {
        expect(reader.read(listed[0]!.generationId, member.assetId)).toEqual(
          fixture.members[index]!.bytes,
        );
      }
      expect(() => reader.read(
        listed[0]!.generationId,
        "asset:generated-sha256-" + "0".repeat(64),
      )).toThrow("GENERATED_ARTIFACT_NOT_FOUND");
    }
  }, 120_000);

  test("read-only generated reader returns an empty list for an uninstalled namespace", () => {
    const parent = mkdtempSync(join(tmpdir(), "dh017-empty-generated-reader-"));
    const rootPath = join(parent, "root");
    bootstrapDataRoot(rootPath);
    const root = openDataRoot(rootPath);
    try {
      expect(new GeneratedArtifactReader(root).list()).toEqual([]);
    } finally {
      root.close();
      rmSync(parent, { recursive: true, force: true });
    }
  });

  test("read-only generated reader fails closed on a terminal set with a missing public member", async () => {
    const fixture = track(await buildCommitFixture("worldlabs-marble-v1"));
    const visible = runCommit(fixture);
    runVerifiedTransition(fixture, visible);
    const reader = new GeneratedArtifactReader(fixture.root);
    const listed = reader.list();
    unlinkSync(join(
      fixture.rootPath,
      generatedArtifactBytesPath(listed[0]!.members[0]!.contentDigest),
    ));
    expect(() => reader.list()).toThrow("GENERATION_RECOVERY_REQUIRED");
  }, 120_000);

  test("read-only generated reader rejects catalog-only and pre-verified publication", async () => {
    const fixture = track(await buildCommitFixture("hunyuan-ai3d-v1"));
    const restore = GENERATED_SET_VISIBLE_COMMIT_TEST_SEAMS.replaceStageHook(
      "after-catalog-dir-fsync",
      () => { throw new Error("stop after catalog"); },
    );
    try {
      expect(() => runCommit(fixture)).toThrow("stop after catalog");
    } finally {
      restore();
    }
    expect(() => new GeneratedArtifactReader(fixture.root).list())
      .toThrow("GENERATION_RECOVERY_REQUIRED");
  }, 120_000);

  test("read-only generated reader rejects same-bytes catalog replacement and the 257th catalog entry", async () => {
    const fixture = track(await buildCommitFixture("hunyuan-ai3d-v1"));
    const visible = runCommit(fixture);
    runVerifiedTransition(fixture, visible);
    const catalog = catalogPathOf(fixture);
    const bytes = readFileSync(catalog);
    unlinkSync(catalog);
    writeFileSync(catalog, bytes, { mode: 0o600 });
    chmodSync(catalog, 0o600);
    expect(() => new GeneratedArtifactReader(fixture.root).list())
      .toThrow("GENERATION_RECOVERY_REQUIRED");

    const second = track(await buildCommitFixture("hunyuan-ai3d-v1"));
    const secondVisible = runCommit(second);
    runVerifiedTransition(second, secondVisible);
    const directory = join(second.rootPath, "artifacts", "catalog");
    for (let index = 0; index < 256; index += 1) {
      const name = `${index.toString(16).padStart(64, "0")}.json`;
      if (existsSync(join(directory, name))) continue;
      writeFileSync(join(directory, name), "{}", { mode: 0o600 });
    }
    expect(() => new GeneratedArtifactReader(second.root).list())
      .toThrow("GENERATION_RECOVERY_REQUIRED");
  }, 120_000);

  test("read-only generated reader list/read preserve all observed durable inodes", async () => {
    const fixture = track(await buildCommitFixture("hunyuan-ai3d-v1"));
    const visible = runCommit(fixture);
    runVerifiedTransition(fixture, visible);
    const reader = new GeneratedArtifactReader(fixture.root);
    const before = [
      statSync(catalogPathOf(fixture), { bigint: true }),
      statSync(resultPathOf(fixture), { bigint: true }),
      statSync(join(fixture.rootPath, generatedArtifactBytesPath(fixture.snapshot.content[0]!.contentDigest)), { bigint: true }),
      statSync(fixture.recordsPath, { bigint: true }),
    ].map((stat) => `${stat.dev}:${stat.ino}:${stat.nlink}:${stat.mtimeNs}:${stat.ctimeNs}`);
    const listed = reader.list();
    expect(reader.read(listed[0]!.generationId, listed[0]!.members[0]!.assetId))
      .toEqual(fixture.members[0]!.bytes);
    expect(reader.list()).toEqual(listed);
    const after = [
      statSync(catalogPathOf(fixture), { bigint: true }),
      statSync(resultPathOf(fixture), { bigint: true }),
      statSync(join(fixture.rootPath, generatedArtifactBytesPath(fixture.snapshot.content[0]!.contentDigest)), { bigint: true }),
      statSync(fixture.recordsPath, { bigint: true }),
    ].map((stat) => `${stat.dev}:${stat.ino}:${stat.nlink}:${stat.mtimeNs}:${stat.ctimeNs}`);
    expect(after).toEqual(before);
  }, 120_000);

  test("read-only generated reader keeps the role-to-format mapping closed", () => {
    expect(() => requireGeneratedArtifactReaderRoleFormat("world-spz-500k", "glb-2.0"))
      .toThrow("GENERATION_RECOVERY_REQUIRED");
    expect(() => requireGeneratedArtifactReaderRoleFormat("world-collider-glb", "spz-v2"))
      .toThrow("GENERATION_RECOVERY_REQUIRED");
    expect(() => requireGeneratedArtifactReaderRoleFormat("object-glb", "spz-v2"))
      .toThrow("GENERATION_RECOVERY_REQUIRED");
  });

  test("read-only generated reader requires the final publication intent hard-link and bounded staging", async () => {
    const fixture = track(await buildCommitFixture("hunyuan-ai3d-v1"));
    const visible = runCommit(fixture);
    runVerifiedTransition(fixture, visible);
    const intentPath = join(
      fixture.rootPath,
      dataRootReceiptIntentPath(fixture.publicationPlan.binding.operationId),
    );
    const intentBytes = readFileSync(intentPath);
    unlinkSync(intentPath);
    writeFileSync(intentPath, intentBytes, { mode: 0o600 });
    chmodSync(intentPath, 0o600);
    expect(() => new GeneratedArtifactReader(fixture.root).list())
      .toThrow("GENERATION_RECOVERY_REQUIRED");

    const bounded = track(await buildCommitFixture("hunyuan-ai3d-v1"));
    const boundedVisible = runCommit(bounded);
    runVerifiedTransition(bounded, boundedVisible);
    const staging = join(bounded.rootPath, "staging");
    for (let index = 0; index < 2048; index += 1) {
      mkdirSync(join(staging, `reader-bound-${index}`), { mode: 0o700 });
    }
    expect(() => new GeneratedArtifactReader(bounded.root).list())
      .toThrow("GENERATION_RECOVERY_REQUIRED");
  }, 120_000);

  test("read-only generated reader rejects a symlinked or mid-join replaced catalog parent", async () => {
    const symlinkFixture = track(await buildCommitFixture("hunyuan-ai3d-v1"));
    const symlinkVisible = runCommit(symlinkFixture);
    runVerifiedTransition(symlinkFixture, symlinkVisible);
    const catalogDirectory = join(symlinkFixture.rootPath, "artifacts", "catalog");
    const savedDirectory = `${catalogDirectory}.saved`;
    renameSync(catalogDirectory, savedDirectory);
    symlinkSync(savedDirectory, catalogDirectory);
    expect(() => new GeneratedArtifactReader(symlinkFixture.root).list())
      .toThrow("GENERATION_RECOVERY_REQUIRED");

    const replacementFixture = track(await buildCommitFixture("hunyuan-ai3d-v1"));
    const replacementVisible = runCommit(replacementFixture);
    runVerifiedTransition(replacementFixture, replacementVisible);
    const replacementDirectory = join(replacementFixture.rootPath, "artifacts", "catalog");
    const backupDirectory = `${replacementDirectory}.backup`;
    const catalogName = `${generationIdDigest(replacementFixture.intent.generationId)}.json`;
    const restore = GENERATED_ARTIFACT_READER_TEST_SEAMS.replaceStageHook(() => {
      renameSync(replacementDirectory, backupDirectory);
      mkdirSync(replacementDirectory, { mode: 0o700 });
      linkSync(join(backupDirectory, catalogName), join(replacementDirectory, catalogName));
    });
    try {
      expect(() => new GeneratedArtifactReader(replacementFixture.root).list())
        .toThrow("GENERATION_RECOVERY_REQUIRED");
    } finally {
      restore();
    }
  }, 120_000);

  test("forged visible evidence cannot advance Generation", async () => {
    const fixture = track(await buildCommitFixture("worldlabs-marble-v1"));
    const visible = runCommit(fixture);
    const beforeRecords = readdirSync(fixture.recordsPath).sort();
    expectRecovery(() => transitionGeneratedSetVisibleToVerified(
      { ...visible },
      fixture.root,
      fixture.lease,
      fixture.intent,
      fixture.publicationPlan,
      "2026-08-15T10:00:16.000Z",
    ));
    expect(readdirSync(fixture.recordsPath).sort()).toEqual(beforeRecords);
    expect(fixture.journal.readCurrent().state).toBe("publishing");
  }, 120_000);

  test("record-journal append fault matrix resumes exactly or preserves recovery evidence", async () => {
    const stages = [
      "next-file-synced",
      "witness-directory-synced",
      "final-link-directory-synced",
      "head-next-synced",
      "head-directory-synced",
      "next-cleanup-directory-synced",
      "witness-cleanup-directory-synced",
    ] as const;
    for (const stage of stages) {
      const fixture = track(await buildCommitFixture("worldlabs-marble-v1"));
      const visible = runCommit(fixture);
      const before = readdirSync(fixture.recordsPath).filter((name) => !name.startsWith(".")).length;
      const restore = GENERATION_RECORD_JOURNAL_TEST_SEAMS.replaceStageHook(
        (reached) => {
          if (reached === stage) throw new Error(`kill at ${stage}`);
        },
      );
      expect(() => runVerifiedTransition(fixture, visible)).toThrow("kill");
      restore();
      if (stage === "next-file-synced") {
        expectRecovery(() => runVerifiedTransition(fixture, visible));
        expect(readdirSync(fixture.recordsPath)).toContain(".record.next");
        continue;
      }
      const resumed = runVerifiedTransition(fixture, visible);
      expect(resumed.verifiedSequence).toBe(visible.publishingSequence + 1);
      expect(fixture.journal.readCurrent().state).toBe("verified");
      expect(readdirSync(fixture.recordsPath).filter((name) => !name.startsWith(".")).length)
        .toBe(before + 1);
    }
  }, 120_000);

  test("startup durable published tail converges catalog/result to one verified record and replays read-only", async () => {
    const fixture = track(await buildCommitFixture("worldlabs-marble-v1"));
    runCommit(fixture);
    const before = readdirSync(fixture.recordsPath).filter((name) => !name.startsWith(".")).length;
    const plan = inspectGeneratedSetStartupRecovery(fixture.root, fixture.lease);
    expect(plan?.action).toBe("verify");
    if (plan === undefined) throw new Error("missing startup plan");
    applyGeneratedSetStartupRecovery(plan, fixture.root, fixture.lease);
    expect(fixture.journal.readCurrent().state).toBe("verified");
    expect(readdirSync(fixture.recordsPath).filter((name) => !name.startsWith(".")).length)
      .toBe(before + 1);
    const replay = inspectGeneratedSetStartupRecovery(fixture.root, fixture.lease);
    expect(replay?.action).toBe("replay");
    if (replay === undefined) throw new Error("missing replay plan");
    applyGeneratedSetStartupRecovery(replay, fixture.root, fixture.lease);
    expect(readdirSync(fixture.recordsPath).filter((name) => !name.startsWith(".")).length)
      .toBe(before + 1);
  }, 120_000);

  test("startup catalog-only tail writes the exact result before verified", async () => {
    const fixture = track(await buildCommitFixture("hunyuan-ai3d-v1"));
    const restore = GENERATED_SET_VISIBLE_COMMIT_TEST_SEAMS.replaceStageHook(
      "after-catalog-dir-fsync",
      () => { throw new Error("kill after catalog"); },
    );
    expect(() => runCommit(fixture)).toThrow("kill after catalog");
    restore();
    assertTargetAbsent(resultPathOf(fixture));
    const plan = inspectGeneratedSetStartupRecovery(fixture.root, fixture.lease);
    expect(plan?.action).toBe("complete-result-and-verify");
    if (plan === undefined) throw new Error("missing catalog-only plan");
    applyGeneratedSetStartupRecovery(plan, fixture.root, fixture.lease);
    assertTarget(
      resultPathOf(fixture),
      canonicalJsonBytes(fixture.publicationPlan.expectedResult),
      join(attemptPath(fixture), "result.json"),
    );
    expect(fixture.journal.readCurrent().state).toBe("verified");
  }, 120_000);

  test("startup catalog-only result fault matrix uniquely resumes", async () => {
    for (const stage of [
      "after-result-staged-write",
      "after-result-attempt-fsync",
      "after-result-link",
      "after-result-receipts-fsync",
    ] as const) {
      const fixture = track(await buildCommitFixture("hunyuan-ai3d-v1"));
      const stopCatalog = GENERATED_SET_VISIBLE_COMMIT_TEST_SEAMS.replaceStageHook(
        "after-catalog-dir-fsync",
        () => { throw new Error("kill after catalog"); },
      );
      expect(() => runCommit(fixture)).toThrow("kill after catalog");
      stopCatalog();
      const first = inspectGeneratedSetStartupRecovery(fixture.root, fixture.lease);
      if (first === undefined) throw new Error("missing catalog-only plan");
      const stopResult = GENERATED_SET_STARTUP_RECOVERY_TEST_SEAMS.replaceStageHook(
        (reached) => {
          if (reached === stage) throw new Error(`kill at ${stage}`);
        },
      );
      expect(() => applyGeneratedSetStartupRecovery(first, fixture.root, fixture.lease))
        .toThrow(`kill at ${stage}`);
      stopResult();
      const resumed = inspectGeneratedSetStartupRecovery(fixture.root, fixture.lease);
      if (resumed === undefined) throw new Error("missing resume plan");
      applyGeneratedSetStartupRecovery(resumed, fixture.root, fixture.lease);
      expect(fixture.journal.readCurrent().state).toBe("verified");
    }
  }, 120_000);

  test("startup validating head with exact visible tail resumes publishing before verified without replacing public inodes", async () => {
    const fixture = track(await buildCommitFixture("worldlabs-marble-v1"));
    runCommit(fixture);
    const chain = fixture.journal.readValidatedChain();
    const validating = chain[chain.length - 2]!;
    const publishing = chain[chain.length - 1]!;
    expect(publishing.state).toBe("publishing");
    const generationPath = join(
      fixture.rootPath,
      "receipts",
      "generations",
      "data",
      generationIdDigest(fixture.intent.generationId),
    );
    unlinkSync(join(fixture.recordsPath, generationStateRecordFilename(publishing)));
    const headPath = join(generationPath, "head.json");
    unlinkSync(headPath);
    writeNewSyncedFile(headPath, canonicalJsonBytes({
      generationId: fixture.intent.generationId,
      sequence: validating.sequence,
      recordDigest: generationStateRecordDigest(validating),
    }));
    const catalogInode = statSync(catalogPathOf(fixture)).ino;
    const resultInode = statSync(resultPathOf(fixture)).ino;
    const plan = inspectGeneratedSetStartupRecovery(fixture.root, fixture.lease);
    expect(plan?.action).toBe("append-publishing-and-verify");
    if (plan === undefined) throw new Error("missing validating-tail plan");
    applyGeneratedSetStartupRecovery(plan, fixture.root, fixture.lease);
    expect(fixture.journal.readCurrent().state).toBe("verified");
    expect(statSync(catalogPathOf(fixture)).ino).toBe(catalogInode);
    expect(statSync(resultPathOf(fixture)).ino).toBe(resultInode);
  }, 120_000);

  test("startup validating intent rejects a partial public generated-set before publishing append", async () => {
    const fixture = track(await buildCommitFixture("hunyuan-ai3d-v1"));
    const chain = fixture.journal.readValidatedChain();
    const validating = chain[chain.length - 2]!;
    const publishing = chain[chain.length - 1]!;
    unlinkSync(join(fixture.recordsPath, generationStateRecordFilename(publishing)));
    const headPath = join(
      fixture.rootPath,
      "receipts",
      "generations",
      "data",
      generationIdDigest(fixture.intent.generationId),
      "head.json",
    );
    unlinkSync(headPath);
    writeNewSyncedFile(headPath, canonicalJsonBytes({
      generationId: fixture.intent.generationId,
      sequence: validating.sequence,
      recordDigest: generationStateRecordDigest(validating),
    }));
    unlinkSync(join(
      fixture.rootPath,
      generatedArtifactBytesPath(fixture.snapshot.content[0]!.contentDigest),
    ));
    expectRecovery(() => inspectGeneratedSetStartupRecovery(fixture.root, fixture.lease));
    expect(fixture.journal.readCurrent().state).toBe("validating");
  }, 120_000);

  test("startup rejects foreign attempt entry before a generated tail mutation", async () => {
    const fixture = track(await buildCommitFixture("hunyuan-ai3d-v1"));
    writeFileSync(join(attemptPath(fixture), "foreign.json"), "{}", { mode: 0o600 });
    expectRecovery(() => inspectGeneratedSetStartupRecovery(fixture.root, fixture.lease));
    expect(fixture.journal.readCurrent().state).toBe("publishing");
  }, 120_000);

  test("startup Phase-A plan rejects same-bytes catalog replacement before verified append", async () => {
    const fixture = track(await buildCommitFixture("hunyuan-ai3d-v1"));
    runCommit(fixture);
    const plan = inspectGeneratedSetStartupRecovery(fixture.root, fixture.lease);
    if (plan === undefined) throw new Error("missing startup plan");
    const catalogPath = catalogPathOf(fixture);
    const bytes = readFileSync(catalogPath);
    unlinkSync(catalogPath);
    writeFileSync(catalogPath, bytes, { mode: 0o600 });
    expect(() => applyGeneratedSetStartupRecovery(plan, fixture.root, fixture.lease))
      .toThrow("OPERATION_RECOVERY_REQUIRED");
    expect(fixture.journal.readCurrent().state).toBe("publishing");
  }, 120_000);

  test("malformed generated catalog blocks legacy operation terminalization in global Phase A", async () => {
    const fixture = track(await buildCommitFixture("hunyuan-ai3d-v1"));
    runCommit(fixture);
    const registered = MARBLE_HUNYUAN_REGISTRY.assets[0]!;
    const legacyJournal = new OperationJournal(fixture.root, fixture.lease);
    const legacy = legacyJournal.admit({
      schemaVersion: 1,
      operationId: "op:generated-preflight-before-legacy",
      operationKind: "artifact.publish",
      target: { kind: "artifact", id: registered.assetId },
      expectedIdentity: null,
      candidateIdentity: {
        assetId: registered.assetId,
        digest: registered.digest,
        byteLength: registered.byteLength,
        format: registered.format,
        elementCount: registered.elementCount,
        sourceBounds: registered.sourceBounds,
      },
    });
    if (legacy.status !== "admitted") throw new Error("unexpected legacy replay");
    writeFileSync(catalogPathOf(fixture), "{}", { mode: 0o600 });
    const reader = new WorldProjectWriter(
      fixture.root,
      fixture.lease,
      new ArtifactStoreReader(fixture.root),
    ).reader();
    expect(() => recoverPendingOperations(fixture.root, fixture.lease, reader)).toThrow();
    expect(existsSync(join(fixture.rootPath, dataRootReceiptResultPath("op:generated-preflight-before-legacy"))))
      .toBe(false);
    expect(existsSync(legacy.operation.attemptPath)).toBe(true);
  }, 120_000);

  test("terminal provider_failed head with exact generated publication evidence blocks legacy cleanup in Phase A", async () => {
    const fixture = track(await buildCommitFixture("worldlabs-marble-v1"));
    runCommit(fixture);
    const chain = fixture.journal.readValidatedChain();
    const remoteBound = chain.find((record) => record.state === "remote_bound");
    if (remoteBound === undefined) throw new Error("missing remote-bound record");
    for (const record of chain) {
      if (record.sequence > remoteBound.sequence) {
        unlinkSync(join(fixture.recordsPath, generationStateRecordFilename(record)));
      }
    }
    const headPath = join(
      fixture.rootPath,
      "receipts",
      "generations",
      "data",
      generationIdDigest(fixture.intent.generationId),
      "head.json",
    );
    unlinkSync(headPath);
    writeNewSyncedFile(headPath, canonicalJsonBytes({
      generationId: fixture.intent.generationId,
      sequence: remoteBound.sequence,
      recordDigest: generationStateRecordDigest(remoteBound),
    }));
    fixture.journal.append(
      "provider_failed",
      { code: "PROVIDER_REJECTED" },
      journalTimestamp(99),
    );
    expect(fixture.journal.readCurrent().state).toBe("provider_failed");
    // The tail inspector itself classifies a terminal head plus exact durable
    // publication evidence as contradictory before global recovery gets any
    // chance to touch old-operation evidence.
    expectRecovery(() => inspectGeneratedSetStartupRecovery(fixture.root, fixture.lease));

    const legacyJournal = new OperationJournal(fixture.root, fixture.lease);
    const legacy = legacyJournal.admit({
      schemaVersion: 1,
      operationId: "op:generated-terminal-evidence-before-legacy-cleanup",
      operationKind: "project.save-as",
      target: { kind: "project", id: "project:generated-terminal-evidence" },
      expectedIdentity: null,
      candidateIdentity: {
        projectRevision: `project-revision:sha256:${"e".repeat(64)}`,
      },
    });
    if (legacy.status !== "admitted") throw new Error("unexpected legacy replay");
    legacyJournal.finalizeAborted(legacy.operation, "OPERATION_INTERRUPTED");
    const attemptBefore = statSync(legacy.operation.attemptPath, { bigint: true });
    const catalogBefore = statSync(catalogPathOf(fixture), { bigint: true });
    const resultBefore = statSync(resultPathOf(fixture), { bigint: true });
    const reader = new WorldProjectWriter(
      fixture.root,
      fixture.lease,
      new ArtifactStoreReader(fixture.root),
    ).reader();
    expectRecovery(() => recoverPendingOperations(fixture.root, fixture.lease, reader));
    const attemptAfter = statSync(legacy.operation.attemptPath, { bigint: true });
    expect(attemptAfter.dev).toBe(attemptBefore.dev);
    expect(attemptAfter.ino).toBe(attemptBefore.ino);
    expect(statSync(catalogPathOf(fixture), { bigint: true }).ino).toBe(catalogBefore.ino);
    expect(statSync(resultPathOf(fixture), { bigint: true }).ino).toBe(resultBefore.ino);
  }, 120_000);

  test("closed lease rejects the commit before mutation", async () => {
    const fixture = track(await buildCommitFixture("worldlabs-marble-v1"));
    await fixture.lease.close();
    expectRecovery(() => runCommit(fixture));
  }, 120_000);

  test("package-root behavior negative: no export and public OperationJournal rejects both internal kinds", () => {
    const source = readFileSync(
      join(import.meta.dir, "generated-set-visible-commit.ts"),
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
    expect(indexSource).not.toContain("generated-set-visible-commit");
    expect(indexSource).not.toContain("generated-set-hidden-cas-writer");
  });

  test("public OperationJournal admits reject both internal kinds", async () => {
    const fixture = track(await buildCommitFixture("worldlabs-marble-v1"));
    const journal = new OperationJournal(fixture.root, fixture.lease);
    const generationId = `generation:sha256:${"a".repeat(64)}`;
    const artifactSetDigest = "b".repeat(64);
    const preimage =
      "demiurges-generated-set-publication-v1\0" +
      generationId + "\0" + artifactSetDigest;
    const generatedSet = requireGeneratedSetPublicationBinding({
      schemaVersion: 1,
      operationId: `op:${sha256Hex(new TextEncoder().encode(preimage))}`,
      operationKind: "artifact.publish-generated-set",
      target: { kind: "registry", id: "registry:generated-artifact-sets-v1" },
      expectedIdentity: null,
      candidateIdentity: {
        generationId,
        artifactSetDigest,
        orderedContentRecordDigests: ["c".repeat(64)],
        orderedProvenanceRecordDigests: ["d".repeat(64)],
      },
    });
    expect(() => journal.admit(generatedSet)).toThrow(OperationJournalError);
    const namespace = createGenerationNamespaceInstallBindingFromLeaseDigest(
      "0".repeat(64),
    );
    expect(() => journal.admit(namespace)).toThrow(OperationJournalError);
  }, 120_000);
});
