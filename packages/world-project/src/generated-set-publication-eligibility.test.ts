import { afterEach, describe, expect, test } from "bun:test";
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gzipSync } from "node:zlib";

import { canonicalJsonBytes } from "@demiurges/world";

import { bootstrapDataRoot, openDataRoot, type OpenedDataRoot } from "./data-root";
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
import {
  createInitialDownloadBudget,
} from "./generation-output-contracts";
import {
  createInitialGenerationStateRecord,
  generationStateRecordDigest,
  generationStateRecordFilename,
  type GenerationStateRecordV1,
} from "./generation-state";
import {
  GenerationRecordJournal,
} from "./generation-record-journal";
import { inspectDynamicArtifactBytes } from "./generation-artifact-inspector";
import {
  deriveGeneratedSetCandidatePlan,
  type GeneratedSetCandidatePlanV1,
} from "./generated-set-candidate-plan";
import {
  inspectGeneratedSetStoragePreflight,
} from "./generated-set-storage-preflight";
import {
  deriveGeneratedSetPublicationPlan,
  type GeneratedSetPublicationPlanV1,
} from "./generated-artifact-publication";
import {
  deriveGeneratedSetPublicationEligibility,
  revalidateGeneratedSetPublicationEligibility,
  type GeneratedSetPublicationEligibilityV1,
} from "./generated-set-publication-eligibility";
import { writeNewSyncedFile } from "./safe-filesystem";

type Provider = "worldlabs-marble-v1" | "hunyuan-ai3d-v1";

const POLL_BUDGET = {
  cycleCount: 1 as const,
  attemptCount: 6,
  cycleStartedAt: "2026-08-15T10:00:02.000Z",
  deadlineAt: "2026-08-15T10:20:02.000Z",
};

function marbleIdentity() {
  return {
    kind: "marble-world" as const,
    operationId: "operation_1",
    worldId: "world_1",
    spzKey: "500k" as const,
    colliderField: "collider_mesh_url" as const,
  };
}

function hunyuanIdentity() {
  return { kind: "hunyuan-file-set" as const, jobId: "12345", glbCount: 1 as const, objCount: 0 as const };
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

function createGlbFixture(): Uint8Array {
  return createGlbWithPositions([[-1, -2, -3], [4, 5, 6]]);
}

function createGlbVariantFixture(): Uint8Array {
  return createGlbWithPositions([[-2, -1, -3], [4, 5, 6]]);
}

function fixtureIntent(provider: Provider): GenerationIntentV1 {
  return createGenerationIntent(createGenerationBinding(requireGenerationRequest(
    provider === "worldlabs-marble-v1"
      ? {
          provider, model: "marble-1.1", prompt: "A bounded eligibility world",
          costUnknownAccepted: true, waitForCompletionAndDownload: true,
          idempotencyKey: "publication-eligibility-marble",
        }
      : {
          provider, model: "3.1", prompt: "A bounded eligibility object",
          costUnknownAccepted: true, waitForCompletionAndDownload: true,
          idempotencyKey: "publication-eligibility-hunyuan",
        },
  ), provider === "worldlabs-marble-v1"
    ? { contractProfile: "worldlabs-openapi-2026-08-15-v1", contractShapeDigest: "a".repeat(64) }
    : { contractProfile: "cloud-response-v1", contractShapeDigest: "b".repeat(64) },
  ), "2026-08-15T10:00:00.000Z");
}

interface FixtureMember {
  readonly outputRole: "world-spz-500k" | "world-collider-glb" | "object-glb";
  readonly bytes: Uint8Array;
}

type StopAt = "polling" | "outputs_ready" | "downloading" | "all-candidates" | "validating";

interface EligibilityFixture {
  readonly root: OpenedDataRoot;
  readonly lease: DataRootWriterLease;
  readonly rootPath: string;
  readonly intent: GenerationIntentV1;
  readonly downloadsPath: string;
  readonly recordsPath: string;
  readonly catalogPointerPath: string;
  readonly journal: GenerationRecordJournal;
  readonly members: readonly FixtureMember[];
  readonly remoteBound: Readonly<Record<string, unknown>>;
  readonly plan?: GeneratedSetCandidatePlanV1;
  readonly publicationPlan?: GeneratedSetPublicationPlanV1;
  readonly eligibility?: GeneratedSetPublicationEligibilityV1;
  readonly close(): Promise<void>;
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

async function buildFixture(
  provider: Provider,
  stopAt: StopAt,
  options: { readonly omitCatalogPointer?: boolean } = {},
): Promise<EligibilityFixture> {
  const members: readonly FixtureMember[] = provider === "worldlabs-marble-v1"
    ? [
        { outputRole: "world-spz-500k", bytes: createSpzFixture() },
        { outputRole: "world-collider-glb", bytes: createGlbFixture() },
      ]
    : [{ outputRole: "object-glb", bytes: createGlbFixture() }];

  const parent = mkdtempSync(join(tmpdir(), "dh017-eligibility-"));
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
    await lease.close();
    root.close();
    rmSync(parent, { recursive: true, force: true });
  };
  try {
    ensureDataRootLayout(root, lease);
    const intent = fixtureIntent(provider);
    const digest = generationIdDigest(intent.generationId);
    const namespacePath = join(rootPath, "receipts", "generations");
    const generationPath = join(namespacePath, "data", digest);
    const recordsPath = join(generationPath, "records");
    const downloadsPath = join(generationPath, "downloads");
    const catalogPointerPath = join(
      namespacePath,
      "catalog",
      `${digest}.json`,
    );
    mkdirSync(join(namespacePath, "data"), { mode: 0o700, recursive: true });
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

    const remoteBound = provider === "worldlabs-marble-v1"
      ? { provider, remoteJobId: "operation_1", providerRequestId: null }
      : {
          provider,
          remoteJobId: "12345",
          providerRequestId: "123e4567-e89b-42d3-a456-426614174000",
        };
    const identity = provider === "worldlabs-marble-v1"
      ? marbleIdentity()
      : hunyuanIdentity();

    const journal = new GenerationRecordJournal(root, lease, intent);
    journal.append("submit_started", { submitAttempt: 1 }, journalTimestamp(1));
    journal.append("remote_bound", remoteBound, journalTimestamp(2));
    journal.append("polling", POLL_BUDGET, journalTimestamp(3));
    if (stopAt === "polling") {
      return finish({ catalogPointerPath, initial });
    }
    const budget = createInitialDownloadBudget(intent, POLL_BUDGET) as unknown as Record<string, unknown>;
    journal.append("outputs_ready", {
      remoteOutputIdentity: identity,
      downloadBudget: budget,
    }, journalTimestamp(4));
    if (stopAt === "outputs_ready") {
      return finish({ catalogPointerPath, initial });
    }
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

    let plan: GeneratedSetCandidatePlanV1 | undefined;
    let publicationPlan: GeneratedSetPublicationPlanV1 | undefined;
    let eligibility: GeneratedSetPublicationEligibilityV1 | undefined;
    if (stopAt === "all-candidates") {
      plan = derivePlanFromHead({
        intent,
        remoteBound,
        journal,
        members,
      });
    } else {
      journal.append("validating", {
        remoteOutputIdentity: identity,
        downloadBudget: running,
      }, journalTimestamp(second));
      plan = derivePlanFromHead({ intent, remoteBound, journal, members });
    }
    if (plan !== undefined) {
      const snapshot = inspectGeneratedSetStoragePreflight(root, plan);
      publicationPlan = deriveGeneratedSetPublicationPlan(root, plan, snapshot);
    }
    return finish({ catalogPointerPath, initial, plan, publicationPlan, eligibility });

    function finish(state: {
      readonly catalogPointerPath: string;
      readonly initial: GenerationStateRecordV1;
      readonly plan?: GeneratedSetCandidatePlanV1;
      readonly publicationPlan?: GeneratedSetPublicationPlanV1;
      readonly eligibility?: GeneratedSetPublicationEligibilityV1;
    }): EligibilityFixture {
      if (!options.omitCatalogPointer) {
        mkdirSync(join(namespacePath, "catalog"), { mode: 0o700, recursive: true });
        writeNewSyncedFile(
          state.catalogPointerPath,
          canonicalJsonBytes(createGenerationBirthPointer(intent, state.initial)),
        );
      }
      return {
        root,
        lease,
        rootPath,
        intent,
        downloadsPath,
        recordsPath,
        catalogPointerPath: state.catalogPointerPath,
        journal,
        members,
        remoteBound,
        plan: state.plan,
        publicationPlan: state.publicationPlan,
        eligibility: state.eligibility,
        close,
      };
    }
  } catch (error) {
    await close();
    throw error;
  }
}

function derivePlanFromHead(input: {
  readonly intent: GenerationIntentV1;
  readonly remoteBound: Readonly<Record<string, unknown>>;
  readonly journal: GenerationRecordJournal;
  readonly members: readonly FixtureMember[];
}): GeneratedSetCandidatePlanV1 {
  const head = input.journal.readCurrent();
  const payload = head.payload as unknown as Record<string, unknown>;
  const inspections = input.members.map(({ outputRole, bytes }) => ({
    outputRole,
    inspection: inspectDynamicArtifactBytes(
      outputRole === "world-spz-500k" ? "spz-v2" : "glb-2.0",
      bytes,
    ),
  }));
  return deriveGeneratedSetCandidatePlan(
    input.intent,
    input.remoteBound as never,
    payload as never,
    inspections,
  );
}

function mint(fixture: EligibilityFixture): GeneratedSetPublicationEligibilityV1 {
  if (fixture.publicationPlan === undefined) throw new Error("fixture has no publication plan");
  return deriveGeneratedSetPublicationEligibility(
    fixture.root,
    fixture.lease,
    fixture.intent,
    fixture.publicationPlan,
  );
}

const cleanups: Array<() => Promise<void>> = [];

afterEach(async () => {
  while (cleanups.length > 0) await cleanups.pop()!();
});

function track(fixture: EligibilityFixture): EligibilityFixture {
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
  // join 边界统一 fail closed；既有 journal/preflight 层的 raw fs 错误同样视为拒绝。
  expect(thrown).toBeDefined();
  if (thrown instanceof GenerationCodecError) {
    expect(thrown.code).toBe("GENERATION_RECOVERY_REQUIRED");
  }
}

describe("generated-set publication eligibility", () => {
  test("mints and revalidates deterministic eligibility for valid Marble and Hunyuan validating chains", async () => {
    const marble = track(await buildFixture("worldlabs-marble-v1", "validating"));
    const hunyuan = track(await buildFixture("hunyuan-ai3d-v1", "validating"));
    const eligibility = mint(marble);
    const second = mint(marble);
    expect(second).toEqual(eligibility);
    expect(second).not.toBe(eligibility);
    expect(eligibility.schemaVersion).toBe(1);
    expect(eligibility.kind).toBe("generated-set-publication-eligibility-v1");
    expect(eligibility.generationId).toBe(marble.intent.generationId);
    expect(eligibility.provider).toBe("worldlabs-marble-v1");
    expect(eligibility.validatingSequence).toBe(14);
    expect(eligibility.validatingRecordDigest).toBe(
      generationStateRecordDigest(marble.journal.readCurrent()),
    );
    expect(eligibility.artifactSetDigest).toBe(
      marble.publicationPlan!.artifactSetDigest,
    );
    expect(eligibility.publicationOperationId).toBe(
      marble.publicationPlan!.binding.operationId,
    );
    expect(eligibility.publicationBindingDigest).toBe(
      marble.publicationPlan!.publicationBindingDigest,
    );
    expect(Object.isFrozen(eligibility)).toBe(true);
    revalidateGeneratedSetPublicationEligibility(
      eligibility, marble.root, marble.lease, marble.intent, marble.publicationPlan!,
    );
    revalidateGeneratedSetPublicationEligibility(
      eligibility, marble.root, marble.lease, marble.intent, marble.publicationPlan!,
    );

    const hunyuanEligibility = mint(hunyuan);
    expect(hunyuanEligibility.generationId).toBe(hunyuan.intent.generationId);
    expect(hunyuanEligibility.provider).toBe("hunyuan-ai3d-v1");
    expect(hunyuanEligibility.validatingSequence).toBe(10);
    revalidateGeneratedSetPublicationEligibility(
      hunyuanEligibility, hunyuan.root, hunyuan.lease, hunyuan.intent, hunyuan.publicationPlan!,
    );

    // readValidatedChain 只读 accessor 的 focused regression。
    const chain = marble.journal.readValidatedChain();
    expect(chain).toHaveLength(15);
    expect(chain[0]!.state).toBe("admitted");
    expect(chain[chain.length - 1]!.state).toBe("validating");

    const serialized = JSON.stringify(eligibility);
    expect(serialized).not.toContain(marble.rootPath);
    expect(serialized).not.toContain("candidateName");
    expect(serialized).not.toContain("downloads");
    expect(serialized).not.toContain("providerRequest");
    expect(serialized).not.toContain("operation_1");
    expect(serialized).not.toContain("12345");
    expect(serialized).not.toContain("A bounded eligibility world");
  });

  test("polling, outputs_ready, incomplete downloading and all-candidates downloading heads cannot mint", async () => {
    for (const stopAt of ["polling", "outputs_ready"] as const) {
      const fixture = track(await buildFixture("worldlabs-marble-v1", stopAt));
      expect(fixture.plan).toBeUndefined();
      // 没有 durable candidate join，就不存在任何可传入的合法 publication plan；
      // 伪造输入同样 fail closed。
      expectRecovery(() => deriveGeneratedSetPublicationEligibility(
        fixture.root, fixture.lease, fixture.intent, {},
      ));
      expectRecovery(() => deriveGeneratedSetPublicationEligibility(
        fixture.root, fixture.lease, fixture.intent, null,
      ));
    }

    // 不完整 downloading：member0 已 candidate、member1 仍 idle，无 plan 可 mint。
    const incomplete = track(
      await buildFixture("worldlabs-marble-v1", "outputs_ready"),
    );
    incomplete.journal.append("downloading", {
      remoteOutputIdentity: marbleIdentity(),
      downloadBudget: createInitialDownloadBudget(
        incomplete.intent,
        POLL_BUDGET,
      ),
    }, journalTimestamp(5));
    expectRecovery(() => deriveGeneratedSetPublicationEligibility(
      incomplete.root, incomplete.lease, incomplete.intent, {},
    ));

    // 全部 member 已 candidate 但 head 仍是 downloading：plan 可派生，head gate 拒绝。
    const allCandidates = track(
      await buildFixture("worldlabs-marble-v1", "all-candidates"),
    );
    expect(allCandidates.publicationPlan).toBeDefined();
    expectRecovery(() => deriveGeneratedSetPublicationEligibility(
      allCandidates.root, allCandidates.lease, allCandidates.intent,
      allCandidates.publicationPlan,
    ));
  });

  test("storage drift between plan derivation and mint fails before any mutation", async () => {
    const content = track(await buildFixture("worldlabs-marble-v1", "validating"));
    const glbName = content.plan!.orderedMembers[1]!.candidateName;
    writeFileSync(join(content.downloadsPath, glbName), createGlbVariantFixture(), { mode: 0o600 });
    chmodSync(join(content.downloadsPath, glbName), 0o600);
    expectRecovery(() => mint(content));
    await content.close();

    const filename = track(await buildFixture("worldlabs-marble-v1", "validating"));
    const spzName = filename.plan!.orderedMembers[0]!.candidateName;
    renameSync(
      join(filename.downloadsPath, spzName),
      join(filename.downloadsPath, `${spzName}.moved`),
    );
    expectRecovery(() => mint(filename));
    await filename.close();

    const inode = track(await buildFixture("hunyuan-ai3d-v1", "validating"));
    const memberName = inode.plan!.orderedMembers[0]!.candidateName;
    const memberPath = join(inode.downloadsPath, memberName);
    const bytes = readFileSync(memberPath);
    unlinkSync(memberPath);
    writeFileSync(memberPath, bytes, { mode: 0o600 });
    chmodSync(memberPath, 0o600);
    expectRecovery(() => mint(inode));
    await inode.close();

    const setDrift = track(await buildFixture("worldlabs-marble-v1", "validating"));
    const setRecord = setDrift.plan!.artifactSetRecord;
    const setRecordPath = join(
      setDrift.rootPath,
      "artifacts",
      "sets",
      "sha256",
      `${setRecord.artifactSetDigest}.json`,
    );
    mkdirSync(join(setDrift.rootPath, "artifacts", "sets", "sha256"), { mode: 0o700, recursive: true });
    writeFileSync(
      setRecordPath,
      canonicalJsonBytes({ ...setRecord, generationId: `generation:sha256:${"0".repeat(64)}` }),
      { mode: 0o600 },
    );
    chmodSync(setRecordPath, 0o600);
    expectRecovery(() => mint(setDrift));
  });

  test("stale eligibility after durable head or record evidence replacement is rejected", async () => {
    const fixture = track(await buildFixture("worldlabs-marble-v1", "validating"));
    const eligibility = mint(fixture);
    const headPath = join(fixture.rootPath, "receipts", "generations", "data", generationIdDigest(fixture.intent.generationId), "head.json");
    const headBytes = readFileSync(headPath);
    const parsedHead = JSON.parse(new TextDecoder().decode(headBytes));
    writeFileSync(headPath, canonicalJsonBytes({ ...parsedHead, sequence: 3 }), { mode: 0o600 });
    chmodSync(headPath, 0o600);
    expectRecovery(() => revalidateGeneratedSetPublicationEligibility(
      eligibility, fixture.root, fixture.lease, fixture.intent, fixture.publicationPlan!,
    ));
    expectRecovery(() => mint(fixture));
    // 恢复 head 后 revalidation 恢复通过。
    writeFileSync(headPath, headBytes, { mode: 0o600 });
    chmodSync(headPath, 0o600);
    revalidateGeneratedSetPublicationEligibility(
      eligibility, fixture.root, fixture.lease, fixture.intent, fixture.publicationPlan!,
    );

    const admittedName = readdirFiltered(fixture.recordsPath)[0]!;
    const admittedPath = join(fixture.recordsPath, admittedName);
    const admittedBytes = readFileSync(admittedPath);
    const parsedAdmitted = JSON.parse(new TextDecoder().decode(admittedBytes));
    writeFileSync(
      admittedPath,
      canonicalJsonBytes({ ...parsedAdmitted, recordedAt: "2026-08-15T10:00:01.000Z" }),
      { mode: 0o600 },
    );
    chmodSync(admittedPath, 0o600);
    expectRecovery(() => revalidateGeneratedSetPublicationEligibility(
      eligibility, fixture.root, fixture.lease, fixture.intent, fixture.publicationPlan!,
    ));
    writeFileSync(admittedPath, admittedBytes, { mode: 0o600 });
    chmodSync(admittedPath, 0o600);

    const extraFinal = join(fixture.recordsPath, `${"9".repeat(16)}-${"9".repeat(64)}.json`);
    writeFileSync(extraFinal, admittedBytes, { mode: 0o600 });
    chmodSync(extraFinal, 0o600);
    expectRecovery(() => revalidateGeneratedSetPublicationEligibility(
      eligibility, fixture.root, fixture.lease, fixture.intent, fixture.publicationPlan!,
    ));
  });

  test("birth anchor failures close the mint", async () => {
    const missing = track(await buildFixture("worldlabs-marble-v1", "validating", {
      omitCatalogPointer: true,
    }));
    expect(missing.publicationPlan).toBeDefined();
    expectRecovery(() => mint(missing));

    const wrongBinding = track(await buildFixture("hunyuan-ai3d-v1", "validating"));
    const pointer = createGenerationBirthPointer(
      wrongBinding.intent,
      createInitialGenerationStateRecord(wrongBinding.intent),
    );
    writeFileSync(
      wrongBinding.catalogPointerPath,
      canonicalJsonBytes({ ...pointer, admittedRecordDigest: "0".repeat(64) }),
      { mode: 0o600 },
    );
    chmodSync(wrongBinding.catalogPointerPath, 0o600);
    expectRecovery(() => mint(wrongBinding));

    const noncanonical = track(await buildFixture("worldlabs-marble-v1", "validating"));
    writeFileSync(
      noncanonical.catalogPointerPath,
      Buffer.concat([
        canonicalJsonBytes(createGenerationBirthPointer(
          noncanonical.intent,
          createInitialGenerationStateRecord(noncanonical.intent),
        )),
        new Uint8Array([0x20]),
      ]),
      { mode: 0o600 },
    );
    chmodSync(noncanonical.catalogPointerPath, 0o600);
    expectRecovery(() => mint(noncanonical));
  });

  test("forged or copied eligibility, cross-root/cross-lease, wrong intent and foreign plan fail closed", async () => {
    const fixture = track(await buildFixture("worldlabs-marble-v1", "validating"));
    const eligibility = mint(fixture);
    const foreign = track(await buildFixture("hunyuan-ai3d-v1", "validating"));

    expectRecovery(() => revalidateGeneratedSetPublicationEligibility(
      JSON.parse(JSON.stringify(eligibility)),
      fixture.root, fixture.lease, fixture.intent, fixture.publicationPlan!,
    ));

    // 同一 durable truth 上重新 mint 的 eligibility 是对同一事实的合法证据，
    // 可以按自己的输入通过 revalidation；它不能冒充原对象（origin 不同）。
    const reminted = mint(fixture);
    expect(reminted).toEqual(eligibility);
    revalidateGeneratedSetPublicationEligibility(
      reminted, fixture.root, fixture.lease, fixture.intent, fixture.publicationPlan!,
    );
    expectRecovery(() => revalidateGeneratedSetPublicationEligibility(
      reminted, foreign.root, foreign.lease, foreign.intent, foreign.publicationPlan!,
    ));
    revalidateGeneratedSetPublicationEligibility(
      eligibility, fixture.root, fixture.lease, fixture.intent, fixture.publicationPlan!,
    );

    // cross-root：同一路径的另一个 root 对象。
    const secondRoot = openDataRoot(fixture.rootPath);
    try {
      expectRecovery(() => revalidateGeneratedSetPublicationEligibility(
        eligibility, secondRoot, fixture.lease, fixture.intent, fixture.publicationPlan!,
      ));
    } finally {
      secondRoot.close();
    }

    // cross-lease：另一个 root 的 lease。
    expectRecovery(() => revalidateGeneratedSetPublicationEligibility(
      eligibility, fixture.root, foreign.lease, fixture.intent, fixture.publicationPlan!,
    ));
    expectRecovery(() => deriveGeneratedSetPublicationEligibility(
      fixture.root, foreign.lease, fixture.intent, fixture.publicationPlan!,
    ));

    // fake lease：live-lease 检查在 join 之前拒绝。
    expect(() => deriveGeneratedSetPublicationEligibility(
      fixture.root, {} as never, fixture.intent, fixture.publicationPlan!,
    )).toThrow();

    // wrong intent：foreign intent 与 durable intent.json 不一致。
    expectRecovery(() => deriveGeneratedSetPublicationEligibility(
      fixture.root, fixture.lease, foreign.intent, fixture.publicationPlan!,
    ));

    // foreign publication plan：来自另一个 root 的 plan。
    expectRecovery(() => deriveGeneratedSetPublicationEligibility(
      fixture.root, fixture.lease, fixture.intent, foreign.publicationPlan,
    ));
    // forged plan copy。
    expectRecovery(() => deriveGeneratedSetPublicationEligibility(
      fixture.root, fixture.lease, fixture.intent,
      JSON.parse(JSON.stringify(fixture.publicationPlan)),
    ));
  });

  test("source scan: eligibility stays package-private with no capacity/Operation/CAS/startup/UI dependency", () => {
    const source = readFileSync(
      join(import.meta.dir, "generated-set-publication-eligibility.ts"),
      "utf8",
    );
    for (const token of [
      "mkdirSync", "writeFileSync", "linkSync", "unlinkSync", "renameSync",
      "fsyncSync", "rmSync", "openSync", "writeSync", "truncateSync",
      "opendirSync", "readdirSync",
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
      "./data-root-capacity",
      "./generation-namespace-installer",
      "./generation-birth-journal",
    ]) {
      expect(source).not.toContain(`from "${dependency}"`);
    }
    for (const framework of [
      "three",
      "@mujoco",
      "solid-js",
      "@oh-my-pi",
      "agent-gateway",
      "apps/studio",
    ]) {
      expect(source).not.toContain(framework);
    }
    const indexSource = readFileSync(join(import.meta.dir, "index.ts"), "utf8");
    expect(indexSource).not.toContain("publication-eligibility");
    expect(indexSource).not.toContain("generated-set-candidate-plan");
    expect(indexSource).not.toContain("generated-artifact-publication");
    expect(indexSource).not.toContain("generation-record-journal");
  });
});

function readdirFiltered(path: string): readonly string[] {
  return readdirSync(path).filter((name) => /^[0-9]{16}-[a-f0-9]{64}\.json$/.test(name));
}
