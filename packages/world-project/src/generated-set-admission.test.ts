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
  symlinkSync,
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
  type GenerationStateRecordV1,
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
import { inspectGeneratedSetStoragePreflight } from "./generated-set-storage-preflight";
import {
  deriveGeneratedSetPublicationPlan,
  requireGeneratedSetPublicationBinding,
  type GeneratedSetPublicationBindingV1,
  type GeneratedSetPublicationPlanV1,
} from "./generated-artifact-publication";
import {
  deriveGeneratedSetPublicationEligibility,
  type GeneratedSetPublicationEligibilityV1,
} from "./generated-set-publication-eligibility";
import {
  authorizeGeneratedSetAdmission,
  consumeGeneratedSetAdmissionCapability,
} from "./generated-set-admission";
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
    prompt: "A bounded admission world",
    costUnknownAccepted: true,
    waitForCompletionAndDownload: true,
    idempotencyKey: `generated-set-admission-${intentNonce}`,
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

interface AdmissionFixture {
  readonly root: OpenedDataRoot;
  readonly lease: DataRootWriterLease;
  readonly rootPath: string;
  readonly intent: GenerationIntentV1;
  readonly downloadsPath: string;
  readonly recordsPath: string;
  readonly journal: GenerationRecordJournal;
  readonly headPayload: Record<string, unknown>;
  readonly plan: GeneratedSetCandidatePlanV1;
  readonly publicationPlan: GeneratedSetPublicationPlanV1;
  readonly eligibility: GeneratedSetPublicationEligibilityV1;
  close(): Promise<void>;
}

function publishTerminalNamespace(
  root: OpenedDataRoot,
  lease: DataRootWriterLease,
  rootPath: string,
): void {
  const binding = createGenerationNamespaceInstallBinding(root, lease);
  const intentPath = join(rootPath, dataRootReceiptIntentPath(binding.operationId));
  writeNewSyncedFile(intentPath, canonicalJsonBytes(binding));
  const namespacePath = join(rootPath, "receipts", "generations");
  mkdirSync(namespacePath, { mode: 0o700 });
  linkSync(intentPath, join(namespacePath, ".namespace-install-intent.json"));
  for (const name of ["data", "catalog", "birth-staging"] as const) {
    mkdirSync(join(namespacePath, name), { mode: 0o700 });
    syncDirectory(join(namespacePath, name));
  }
  writeNewSyncedFile(
    join(namespacePath, "namespace.json"),
    canonicalJsonBytes(createGenerationNamespaceBody(
      binding,
      readStableDirectoryIdentity(namespacePath),
    )),
  );
  syncDirectory(namespacePath);
  syncDirectory(join(rootPath, "receipts"));
  writeNewSyncedFile(
    join(rootPath, dataRootReceiptResultPath(binding.operationId)),
    canonicalJsonBytes({
      schemaVersion: 1,
      operationId: binding.operationId,
      bindingDigest: generationNamespaceInstallBindingDigest(binding),
      variant: "success",
      publishedIdentity: generationNamespaceSeedDigest(),
    }),
  );
  syncDirectory(join(rootPath, "receipts"));
}

function writePublicIntent(rootPath: string, operationId: string): void {
  const binding: OperationBinding = {
    schemaVersion: 1,
    operationId,
    operationKind: "project.save-as",
    target: { kind: "project", id: "project:admission-test" },
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

async function buildAdmissionFixture(
  options: { readonly publicOperations?: number } = {},
): Promise<AdmissionFixture> {
  const members = [
    { outputRole: "world-spz-500k" as const, bytes: createSpzFixture() },
    { outputRole: "world-collider-glb" as const, bytes: createGlbWithPositions([[-1, -2, -3], [4, 5, 6]]) },
  ];

  const parent = mkdtempSync(join(tmpdir(), "dh017-admission-"));
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
    publishTerminalNamespace(root, lease, rootPath);
    const intent = fixtureIntent();
    const digest = generationIdDigest(intent.generationId);
    const namespacePath = join(rootPath, "receipts", "generations");
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

    const headPayload = {
      remoteOutputIdentity: identity,
      downloadBudget: running,
    };
    journal.append("validating", headPayload, journalTimestamp(second));

    const head = journal.readCurrent();
    const inspections = members.map(({ outputRole, bytes }) => ({
      outputRole,
      inspection: inspectDynamicArtifactBytes(
        outputRole === "world-spz-500k" ? "spz-v2" : "glb-2.0",
        bytes,
      ),
    }));
    const plan = deriveGeneratedSetCandidatePlan(
      intent,
      remoteBound as never,
      head.payload as never,
      inspections,
    );
    const snapshot = inspectGeneratedSetStoragePreflight(root, plan);
    const publicationPlan = deriveGeneratedSetPublicationPlan(root, plan, snapshot);
    const eligibility = deriveGeneratedSetPublicationEligibility(
      root,
      lease,
      intent,
      publicationPlan,
    );

    for (let index = 0; index < (options.publicOperations ?? 0); index += 1) {
      writePublicIntent(rootPath, `op:admission-filler-${index}`);
    }

    return {
      root,
      lease,
      rootPath,
      intent,
      downloadsPath,
      recordsPath,
      journal,
      headPayload,
      plan,
      publicationPlan,
      eligibility,
      close,
    };
  } catch (error) {
    await close();
    throw error;
  }
}

function generatedSetReceiptBinding(): GeneratedSetPublicationBindingV1 {
  const generationId = `generation:sha256:${"9".repeat(64)}`;
  const artifactSetDigest = "8".repeat(64);
  const preimage =
    "demiurges-generated-set-publication-v1\0" +
    generationId + "\0" + artifactSetDigest;
  return requireGeneratedSetPublicationBinding({
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
}

const cleanups: Array<() => Promise<void>> = [];

afterEach(async () => {
  while (cleanups.length > 0) await cleanups.pop()!();
});

function track(fixture: AdmissionFixture): AdmissionFixture {
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
  // join 边界统一 fail closed；既有 lease/journal/preflight 层的 raw 错误同样视为拒绝。
  expect(thrown).toBeDefined();
  if (thrown instanceof GenerationCodecError) {
    expect(thrown.code).toBe("GENERATION_RECOVERY_REQUIRED");
  }
}

function authorize(
  fixture: AdmissionFixture,
): ReturnType<typeof authorizeGeneratedSetAdmission> {
  return authorizeGeneratedSetAdmission(
    fixture.root,
    fixture.lease,
    fixture.intent,
    fixture.publicationPlan,
    fixture.eligibility,
  );
}

describe("generated-set admission capability", () => {
  test("authorizes exact first Generation and consumes exactly once", async () => {
    const fixture = track(await buildAdmissionFixture());
    const result = authorize(fixture);
    expect(result.status).toBe("authorized");
    if (result.status !== "authorized") throw new Error("unreachable");
    expect(result.capability.kind).toBe("generated-set-admission-capability-v1");
    expect(result.capability.operationId).toBe(
      fixture.publicationPlan.binding.operationId,
    );
    expect(result.capability.effectiveEntries).toBe(5);
    expect(Object.isFrozen(result.capability)).toBe(true);
    expect(JSON.stringify(result.capability)).not.toContain(fixture.rootPath);
    expect(JSON.stringify(result.capability)).not.toContain("candidateName");

    const repeat = authorize(fixture);
    expect(repeat.status).toBe("authorized");
    if (repeat.status !== "authorized") throw new Error("unreachable");
    expect(repeat.capability).toBe(result.capability);

    const consumed = consumeGeneratedSetAdmissionCapability(
      result.capability,
      fixture.root,
      fixture.lease,
      fixture.intent,
      fixture.publicationPlan,
      fixture.eligibility,
    );
    expect(consumed).toBe(fixture.publicationPlan);
    expectRecovery(() => consumeGeneratedSetAdmissionCapability(
      result.capability,
      fixture.root,
      fixture.lease,
      fixture.intent,
      fixture.publicationPlan,
      fixture.eligibility,
    ));
  });

  test("capacity boundary: 2047 effective authorizes, 2049 returns capacity-reached before mutation", async () => {
    const ready = track(await buildAdmissionFixture({ publicOperations: 1021 }));
    const readyResult = authorize(ready);
    expect(readyResult.status).toBe("authorized");
    if (readyResult.status !== "authorized") throw new Error("unreachable");
    expect(readyResult.capability.effectiveEntries).toBe(2047);

    const full = track(await buildAdmissionFixture({ publicOperations: 1022 }));
    const fullResult = authorize(full);
    expect(fullResult).toEqual({ status: "capacity-reached" });
    // terminal-installed + 唯一 namespace receipt 下 effective entries 恒为奇数
    // （3 个 namespace 条目 + 成对 public 条目 + 2 reservation），2048 不可表示。
    expect(() => inspectEffective(full)).not.toThrow();
  });

  test("competing different publication on the same lease fails closed", async () => {
    const fixture = track(await buildAdmissionFixture());
    const foreign = track(await buildAdmissionFixture());
    expect(authorize(fixture).status).toBe("authorized");
    expectRecovery(() => authorizeGeneratedSetAdmission(
      fixture.root,
      fixture.lease,
      fixture.intent,
      foreign.publicationPlan,
      foreign.eligibility,
    ));
    expectRecovery(() => authorizeGeneratedSetAdmission(
      fixture.root,
      fixture.lease,
      foreign.intent,
      fixture.publicationPlan,
      fixture.eligibility,
    ));
    expect(authorize(fixture).status).toBe("authorized");
  });

  test("post-authorization drift rejects consume with zero mutation and no replay", async () => {
    const receiptMutations: readonly ((fixture: AdmissionFixture) => void)[] = [
      (fixture) => writePublicIntent(fixture.rootPath, "op:admission-extra"),
      (fixture) => unlinkSync(join(
        fixture.rootPath,
        dataRootReceiptResultPath("op:admission-filler-0"),
      )),
    ];
    for (const mutate of receiptMutations) {
      const fixture = track(await buildAdmissionFixture({ publicOperations: 1 }));
      const result = authorize(fixture);
      expect(result.status).toBe("authorized");
      mutate(fixture);
      expectRecovery(() => consumeGeneratedSetAdmissionCapability(
        result.capability,
        fixture.root,
        fixture.lease,
        fixture.intent,
        fixture.publicationPlan,
        fixture.eligibility,
      ));
      expectRecovery(() => consumeGeneratedSetAdmissionCapability(
        result.capability,
        fixture.root,
        fixture.lease,
        fixture.intent,
        fixture.publicationPlan,
        fixture.eligibility,
      ));
    }

    const surfaceMutations: readonly ((fixture: AdmissionFixture) => void)[] = [
      (fixture) => mkdirSync(
        join(fixture.rootPath, "receipts", "generations", "data", "e".repeat(64)),
        { mode: 0o700 },
      ),
      (fixture) => writeFileSync(
        join(fixture.rootPath, "receipts", "generations", "catalog", `${"e".repeat(64)}.json`),
        new Uint8Array([1]),
        { mode: 0o600 },
      ),
      (fixture) => writeFileSync(
        join(fixture.rootPath, "receipts", "generations", "birth-staging", "foreign"),
        new Uint8Array([1]),
        { mode: 0o600 },
      ),
      (fixture) => writeFileSync(
        join(fixture.rootPath, fixture.publicationPlan.receiptIntentPath),
        new Uint8Array([1]),
        { mode: 0o600 },
      ),
      (fixture) => writeFileSync(
        join(fixture.rootPath, fixture.publicationPlan.receiptResultPath),
        new Uint8Array([1]),
        { mode: 0o600 },
      ),
      (fixture) => {
        mkdirSync(join(fixture.rootPath, "artifacts", "catalog"), { mode: 0o700, recursive: true });
        writeFileSync(
          join(fixture.rootPath, fixture.publicationPlan.catalogPath),
          new Uint8Array([1]),
          { mode: 0o600 },
        );
      },
      (fixture) => {
        // head 推进：直接改写 durable head.json（validating 之上没有合法后继状态）。
        const headPath = join(
          fixture.rootPath,
          "receipts",
          "generations",
          "data",
          generationIdDigest(fixture.intent.generationId),
          "head.json",
        );
        const parsed = JSON.parse(new TextDecoder().decode(readFileSync(headPath)));
        writeFileSync(
          headPath,
          canonicalJsonBytes({ ...parsed, sequence: parsed.sequence + 1 }),
          { mode: 0o600 },
        );
      },
      (fixture) => {
        const glbName = fixture.plan.orderedMembers[1]!.candidateName;
        writeFileSync(
          join(fixture.downloadsPath, glbName),
          createGlbWithPositions([[-2, -1, -3], [4, 5, 6]]),
          { mode: 0o600 },
        );
      },
    ];
    for (const mutate of surfaceMutations) {
      const fixture = track(await buildAdmissionFixture());
      const result = authorize(fixture);
      expect(result.status).toBe("authorized");
      mutate(fixture);
      expectRecovery(() => consumeGeneratedSetAdmissionCapability(
        result.capability,
        fixture.root,
        fixture.lease,
        fixture.intent,
        fixture.publicationPlan,
        fixture.eligibility,
      ));
      expectRecovery(() => consumeGeneratedSetAdmissionCapability(
        result.capability,
        fixture.root,
        fixture.lease,
        fixture.intent,
        fixture.publicationPlan,
        fixture.eligibility,
      ));
    }
  }, 60_000);

  test("closed or reacquired lease rejects consume; fresh lease may authorize fresh evidence", async () => {
    const fixture = track(await buildAdmissionFixture());
    const result = authorize(fixture);
    expect(result.status).toBe("authorized");
    await fixture.lease.close();
    expectRecovery(() => consumeGeneratedSetAdmissionCapability(
      result.capability,
      fixture.root,
      fixture.lease,
      fixture.intent,
      fixture.publicationPlan,
      fixture.eligibility,
    ));
    const reacquired = await acquireDataRootWriterLease(fixture.root);
    expect(reacquired.status).toBe("acquired");
    if (reacquired.status !== "acquired") throw new Error("unreachable");
    try {
      expectRecovery(() => consumeGeneratedSetAdmissionCapability(
        result.capability,
        fixture.root,
        reacquired.lease,
        fixture.intent,
        fixture.publicationPlan,
        fixture.eligibility,
      ));
      const freshEligibility = deriveGeneratedSetPublicationEligibility(
        fixture.root,
        reacquired.lease,
        fixture.intent,
        fixture.publicationPlan,
      );
      const fresh = authorizeGeneratedSetAdmission(
        fixture.root,
        reacquired.lease,
        fixture.intent,
        fixture.publicationPlan,
        freshEligibility,
      );
      expect(fresh.status).toBe("authorized");
    } finally {
      await reacquired.lease.close().catch(() => undefined);
    }
  });

  test("wrong-type/symlink evidence and existing generated-set receipt are recovery-required at authorize", async () => {
    const symlinked = track(await buildAdmissionFixture());
    symlinkSync(
      join(symlinked.rootPath, "receipts"),
      join(symlinked.rootPath, "receipts", "generations", "data", "f".repeat(64)),
    );
    expectRecovery(() => authorize(symlinked));

    const wrongType = track(await buildAdmissionFixture());
    writeFileSync(
      join(wrongType.rootPath, "receipts", "generations", "catalog", `${"f".repeat(64)}.json`),
      new Uint8Array([1]),
      { mode: 0o600 },
    );
    expectRecovery(() => authorize(wrongType));

    const existing = track(await buildAdmissionFixture());
    const binding = generatedSetReceiptBinding();
    writeNewSyncedFile(
      join(existing.rootPath, dataRootReceiptIntentPath(binding.operationId)),
      canonicalJsonBytes(binding),
    );
    syncDirectory(join(existing.rootPath, "receipts"));
    expectRecovery(() => authorize(existing));
  });

  test("forged/copied capability, cross-root/cross-lease/cross-plan/cross-eligibility fail closed", async () => {
    const fixture = track(await buildAdmissionFixture());
    const foreign = track(await buildAdmissionFixture());
    const result = authorize(fixture);
    expect(result.status).toBe("authorized");
    if (result.status !== "authorized") throw new Error("unreachable");

    expectRecovery(() => consumeGeneratedSetAdmissionCapability(
      JSON.parse(JSON.stringify(result.capability)),
      fixture.root,
      fixture.lease,
      fixture.intent,
      fixture.publicationPlan,
      fixture.eligibility,
    ));

    const secondRoot = openDataRoot(fixture.rootPath);
    try {
      expectRecovery(() => consumeGeneratedSetAdmissionCapability(
        result.capability,
        secondRoot,
        fixture.lease,
        fixture.intent,
        fixture.publicationPlan,
        fixture.eligibility,
      ));
    } finally {
      secondRoot.close();
    }

    expectRecovery(() => consumeGeneratedSetAdmissionCapability(
      result.capability,
      fixture.root,
      foreign.lease,
      fixture.intent,
      fixture.publicationPlan,
      fixture.eligibility,
    ));
    expectRecovery(() => consumeGeneratedSetAdmissionCapability(
      result.capability,
      fixture.root,
      fixture.lease,
      fixture.intent,
      foreign.publicationPlan,
      fixture.eligibility,
    ));
    expectRecovery(() => consumeGeneratedSetAdmissionCapability(
      result.capability,
      fixture.root,
      fixture.lease,
      fixture.intent,
      fixture.publicationPlan,
      foreign.eligibility,
    ));
    expectRecovery(() => consumeGeneratedSetAdmissionCapability(
      result.capability,
      fixture.root,
      fixture.lease,
      foreign.intent,
      fixture.publicationPlan,
      fixture.eligibility,
    ));
    // 原始 capability 未被上述伪造输入消耗。
    const consumed = consumeGeneratedSetAdmissionCapability(
      result.capability,
      fixture.root,
      fixture.lease,
      fixture.intent,
      fixture.publicationPlan,
      fixture.eligibility,
    );
    expect(consumed).toBe(fixture.publicationPlan);
  });

  test("source scan: package-private, zero mutation surface, no framework dependency", () => {
    const source = readFileSync(
      join(import.meta.dir, "generated-set-admission.ts"),
      "utf8",
    );
    for (const token of [
      "mkdirSync",
      "writeFileSync",
      "writeNewSyncedFile",
      "linkSync",
      "unlinkSync",
      "renameSync",
      "fsyncSync",
      "rmSync",
      "openSync",
      "writeSync",
      "truncateSync",
      "readdirSync",
      "append(",
    ]) {
      expect(source).not.toContain(`${token}(`);
    }
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
    expect(indexSource).not.toContain("generated-set-admission");
  });
});

function inspectEffective(fixture: AdmissionFixture): void {
  // 只读哨兵：capacity-reached 路径没有创建任何 capability 或 receipt。
  const names = readdirSync(join(fixture.rootPath, "receipts"));
  expect(names.length).toBe(2047);
}
