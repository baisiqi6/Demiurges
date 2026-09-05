import { afterEach, describe, expect, test } from "bun:test";
import {
  linkSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { mkdtempSync } from "node:fs";

import { canonicalJsonBytes } from "@demiurges/world";

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
  GenerationCodecError,
  createGenerationBinding,
  createGenerationIntent,
  requireGenerationRequest,
  type GenerationIntentV1,
} from "./generation-contracts";
import {
  createInitialGenerationStateRecord,
  generationStateRecordDigest,
  generationStateRecordFilename,
  type GenerationStateRecordV1,
} from "./generation-state";
import {
  GENERATION_RECORD_JOURNAL_TEST_SEAMS,
  GenerationRecordJournal,
  GenerationRecordJournalError,
} from "./generation-record-journal";
import {
  artifactInspectorDescriptorDigest,
  createInitialDownloadBudget,
  requireArtifactInspectorDescriptor,
} from "./generation-output-contracts";
import { syncDirectory, writeNewSyncedFile } from "./safe-filesystem";

interface Fixture {
  readonly root: OpenedDataRoot;
  readonly lease: DataRootWriterLease;
  readonly rootPath: string;
  readonly intent: GenerationIntentV1;
  readonly generationPath: string;
  readonly recordsPath: string;
}

const cleanups: Array<() => Promise<void>> = [];

afterEach(async () => {
  while (cleanups.length > 0) await cleanups.pop()!();
});

async function fixture(): Promise<Fixture> {
  const parent = mkdtempSync(join(tmpdir(), "dh017-record-journal-"));
  const rootPath = join(parent, "root");
  bootstrapDataRoot(rootPath);
  const root = openDataRoot(rootPath);
  const acquired = await acquireDataRootWriterLease(root);
  if (acquired.status !== "acquired") throw new Error("test lease unavailable");
  const lease = acquired.lease;
  cleanups.push(async () => {
    await lease.close();
    root.close();
    rmSync(parent, { recursive: true, force: true });
  });
  ensureDataRootLayout(root, lease);

  const prepared = requireGenerationRequest({
    provider: "worldlabs-marble-v1",
    model: "marble-1.1",
    prompt: "a quiet reading room",
    costUnknownAccepted: true,
    waitForCompletionAndDownload: true,
    idempotencyKey: "record-journal",
  });
  const binding = createGenerationBinding(prepared, {
    contractProfile: "worldlabs-openapi-2026-08-15-v1",
    contractShapeDigest: "a".repeat(64),
  });
  const intent = createGenerationIntent(binding, "2026-08-15T10:00:00.000Z");
  const digest = intent.generationId.slice("generation:sha256:".length);
  const generationPath = join(rootPath, "receipts", "generations", "data", digest);
  const recordsPath = join(generationPath, "records");
  mkdirSync(join(rootPath, "receipts", "generations"), { mode: 0o700 });
  mkdirSync(join(rootPath, "receipts", "generations", "data"), { mode: 0o700 });
  mkdirSync(generationPath, { mode: 0o700 });
  mkdirSync(recordsPath, { mode: 0o700 });
  mkdirSync(join(generationPath, "downloads"), { mode: 0o700 });
  writeNewSyncedFile(join(generationPath, "intent.json"), canonicalJsonBytes(intent));
  const initial = createInitialGenerationStateRecord(intent);
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
  syncDirectory(recordsPath);
  syncDirectory(generationPath);
  return { root, lease, rootPath, intent, generationPath, recordsPath };
}

function expectRecovery(action: () => unknown): void {
  let thrown: unknown;
  try {
    action();
  } catch (error) {
    thrown = error;
  }
  expect(thrown).toBeInstanceOf(GenerationRecordJournalError);
  expect(thrown).toMatchObject({ code: "GENERATION_RECOVERY_REQUIRED" });
}

describe("GenerationRecordJournal", () => {
  test("normal append publishes one exact record/head and removes pending authority", async () => {
    const f = await fixture();
    const journal = new GenerationRecordJournal(f.root, f.lease, f.intent);
    const record = journal.append(
      "submit_started",
      { submitAttempt: 1 },
      "2026-08-15T10:00:01.000Z",
    );
    expect(record.sequence).toBe(1);
    expect(journal.readCurrent()).toEqual(record);
    expect(() => readFileSync(join(f.recordsPath, ".record.next"))).toThrow();
    expect(() => readFileSync(join(f.recordsPath, ".record.next.witness"))).toThrow();
  });

  test("crash before witness durability preserves partial next and fails closed", async () => {
    const f = await fixture();
    const restore = GENERATION_RECORD_JOURNAL_TEST_SEAMS.replaceStageHook((stage) => {
      if (stage === "next-file-synced") throw new Error("kill:next-file-synced");
    });
    try {
      const journal = new GenerationRecordJournal(f.root, f.lease, f.intent);
      expect(() => journal.append(
        "submit_started",
        { submitAttempt: 1 },
        "2026-08-15T10:00:01.000Z",
      )).toThrow("kill:next-file-synced");
    } finally {
      restore();
    }
    const restarted = new GenerationRecordJournal(f.root, f.lease, f.intent);
    expectRecovery(() => restarted.resumePending());
    expect(readFileSync(join(f.recordsPath, ".record.next")).byteLength).toBeGreaterThan(0);
  });

  test("crash after witness durability resumes the original inode/digest", async () => {
    const f = await fixture();
    const restore = GENERATION_RECORD_JOURNAL_TEST_SEAMS.replaceStageHook((stage) => {
      if (stage === "witness-directory-synced") {
        throw new Error("kill:witness-directory-synced");
      }
    });
    try {
      const journal = new GenerationRecordJournal(f.root, f.lease, f.intent);
      expect(() => journal.append(
        "submit_started",
        { submitAttempt: 1 },
        "2026-08-15T10:00:01.000Z",
      )).toThrow("kill:witness-directory-synced");
    } finally {
      restore();
    }
    const pendingBytes = readFileSync(join(f.recordsPath, ".record.next"));
    const restarted = new GenerationRecordJournal(f.root, f.lease, f.intent);
    const resumed = restarted.resumePending();
    expect(resumed?.sequence).toBe(1);
    expect(canonicalJsonBytes(resumed)).toEqual(new Uint8Array(pendingBytes));
    expect(restarted.readCurrent()).toEqual(resumed);
  });

  test("byte-identical replacement after witness is rejected without cleanup", async () => {
    const f = await fixture();
    const restore = GENERATION_RECORD_JOURNAL_TEST_SEAMS.replaceStageHook((stage) => {
      if (stage === "witness-directory-synced") throw new Error("kill:witness");
    });
    try {
      const journal = new GenerationRecordJournal(f.root, f.lease, f.intent);
      expect(() => journal.append(
        "submit_started",
        { submitAttempt: 1 },
        "2026-08-15T10:00:01.000Z",
      )).toThrow("kill:witness");
    } finally {
      restore();
    }
    const nextPath = join(f.recordsPath, ".record.next");
    const bytes = readFileSync(nextPath);
    unlinkSync(nextPath);
    writeFileSync(nextPath, bytes, { mode: 0o600, flag: "wx" });
    const restarted = new GenerationRecordJournal(f.root, f.lease, f.intent);
    expectRecovery(() => restarted.resumePending());
    expect(readFileSync(nextPath)).toEqual(bytes);
    expect(readFileSync(join(f.recordsPath, ".record.next.witness")).byteLength).toBeGreaterThan(0);
  });

  for (const stage of [
    "final-link-directory-synced",
    "head-next-synced",
    "head-directory-synced",
    "next-cleanup-directory-synced",
    "witness-cleanup-directory-synced",
  ] as const) {
    test(`crash at ${stage} converges without minting a second record`, async () => {
      const f = await fixture();
      const restore = GENERATION_RECORD_JOURNAL_TEST_SEAMS.replaceStageHook((actual) => {
        if (actual === stage) throw new Error(`kill:${stage}`);
      });
      try {
        const journal = new GenerationRecordJournal(f.root, f.lease, f.intent);
        expect(() => journal.append(
          "submit_started",
          { submitAttempt: 1 },
          "2026-08-15T10:00:01.000Z",
        )).toThrow(`kill:${stage}`);
      } finally {
        restore();
      }
      const restarted = new GenerationRecordJournal(f.root, f.lease, f.intent);
      const resumed = restarted.resumePending();
      const current = restarted.readCurrent();
      expect(current.sequence).toBe(1);
      expect(current.recordedAt).toBe("2026-08-15T10:00:01.000Z");
      if (stage === "witness-cleanup-directory-synced") {
        expect(resumed).toBeUndefined();
      } else {
        expect(resumed).toEqual(current);
      }
    });
  }

  test("replacing both pending names with one byte-identical new inode is rejected", async () => {
    const f = await fixture();
    const restore = GENERATION_RECORD_JOURNAL_TEST_SEAMS.replaceStageHook((stage) => {
      if (stage === "final-link-directory-synced") throw new Error("kill:final-link");
    });
    try {
      const journal = new GenerationRecordJournal(f.root, f.lease, f.intent);
      expect(() => journal.append(
        "submit_started",
        { submitAttempt: 1 },
        "2026-08-15T10:00:01.000Z",
      )).toThrow("kill:final-link");
    } finally {
      restore();
    }
    const nextPath = join(f.recordsPath, ".record.next");
    const bytes = readFileSync(nextPath);
    const finalName = readFileSync(join(f.recordsPath, ".record.next.witness"), "utf8")
      .match(/"recordDigest":"([a-f0-9]{64})"/)?.[1];
    if (!finalName) throw new Error("test witness digest missing");
    const finalPath = join(f.recordsPath, `0000000000000001-${finalName}.json`);
    unlinkSync(nextPath);
    unlinkSync(finalPath);
    writeFileSync(nextPath, bytes, { mode: 0o600, flag: "wx" });
    linkSync(nextPath, finalPath);

    const restarted = new GenerationRecordJournal(f.root, f.lease, f.intent);
    expectRecovery(() => restarted.resumePending());
    expect(readFileSync(nextPath)).toEqual(bytes);
    expect(readFileSync(finalPath)).toEqual(bytes);
  });

  test("unknown and second unreferenced final entries fail closed", async () => {
    const f = await fixture();
    const journal = new GenerationRecordJournal(f.root, f.lease, f.intent);
    writeFileSync(join(f.recordsPath, "foreign"), "", { mode: 0o600 });
    expectRecovery(() => journal.readCurrent());
    unlinkSync(join(f.recordsPath, "foreign"));

    const restore = GENERATION_RECORD_JOURNAL_TEST_SEAMS.replaceStageHook((stage) => {
      if (stage === "final-link-directory-synced") throw new Error("kill:one-final");
    });
    try {
      expect(() => journal.append(
        "submit_started",
        { submitAttempt: 1 },
        "2026-08-15T10:00:01.000Z",
      )).toThrow("kill:one-final");
    } finally {
      restore();
    }
    writeFileSync(
      join(f.recordsPath, `0000000000000001-${"f".repeat(64)}.json`),
      "{}",
      { mode: 0o600 },
    );
    expectRecovery(() => journal.resumePending());
  });

  test("physical entry limit stops at 515 before chain acceptance", async () => {
    const f = await fixture();
    const journal = new GenerationRecordJournal(f.root, f.lease, f.intent);
    for (let index = 0; index < 514; index += 1) {
      const digest = index.toString(16).padStart(64, "0");
      writeFileSync(
        join(f.recordsPath, `${(index + 1).toString().padStart(16, "0")}-${digest}.json`),
        "{}",
        { mode: 0o600 },
      );
    }
    expectRecovery(() => journal.readCurrent());
  });

  const MARBLE_IDENTITY = {
    kind: "marble-world",
    operationId: "operation_1",
    worldId: "world_1",
    spzKey: "500k",
    colliderField: "collider_mesh_url",
  };
  const JOURNAL_POLL_BUDGET = {
    cycleCount: 1 as const,
    attemptCount: 6,
    cycleStartedAt: "2026-08-15T10:00:02.000Z",
    deadlineAt: "2026-08-15T10:20:02.000Z",
  };

  function journalTimestamp(second: number): string {
    return `2026-08-15T10:${String(Math.floor(second / 60)).padStart(2, "0")}:${String(second % 60).padStart(2, "0")}.000Z`;
  }

  function journalCandidate(
    role: "world-spz-500k" | "world-collider-glb",
    checkpoint: string,
    seed: string,
    ino: number,
  ): Record<string, unknown> {
    const descriptor = requireArtifactInspectorDescriptor({
      schemaVersion: 1,
      inspectorProfile: role === "world-spz-500k"
        ? "spz-v2-position-bounds-v1"
        : "glb-2.0-scene-bounds-v1",
      format: role === "world-spz-500k" ? "spz-v2" : "glb-2.0",
      contentDigest: seed.repeat(64),
      byteLength: 8192,
      elementCount: 24,
      sourceBounds: { min: [-1, -1, -1], max: [1, 1, 1] },
    });
    return {
      candidateName: `${role}-c1-a1-${checkpoint}.bin`,
      attemptCheckpointRecordDigest: checkpoint,
      fileIdentity: { dev: "1", ino: String(ino), mode: 0o600, uid: 501, gid: 20 },
      digest: descriptor.contentDigest,
      byteLength: descriptor.byteLength,
      format: descriptor.format,
      elementCount: descriptor.elementCount,
      sourceBounds: descriptor.sourceBounds,
      inspectorDescriptor: descriptor,
      inspectorDescriptorDigest: artifactInspectorDescriptorDigest(descriptor),
    };
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

  function reserved(role: string): Record<string, unknown> {
    return { outputRole: role, downloadAttemptCount: 1, stage: "reserved", candidate: null };
  }

  function ownedNext(role: string, checkpoint: string, ino: number): Record<string, unknown> {
    const basename = `${role}-c1-a1-${checkpoint}`;
    return {
      outputRole: role,
      downloadAttemptCount: 1,
      stage: "owned-next",
      attemptCheckpointRecordDigest: checkpoint,
      nextName: `${basename}.next`,
      ownerName: `${basename}.owner`,
      fileIdentity: { dev: "1", ino: String(ino), mode: 0o600, uid: 501, gid: 20 },
      candidate: null,
    };
  }

  function cleanupAuthorized(
    role: string,
    checkpoint: string,
    candidate: Record<string, unknown>,
  ): Record<string, unknown> {
    return {
      outputRole: role,
      downloadAttemptCount: 1,
      stage: "cleanup-authorized",
      ownerName: `${role}-c1-a1-${checkpoint}.owner`,
      candidate,
    };
  }

  function finalCandidate(
    role: string,
    candidate: Record<string, unknown>,
  ): Record<string, unknown> {
    return { outputRole: role, downloadAttemptCount: 1, stage: "candidate", candidate };
  }

  async function appendEarlyOutputPrefix(
    f: Fixture,
  ): Promise<{ journal: GenerationRecordJournal; budget: Record<string, unknown> }> {
    const journal = new GenerationRecordJournal(f.root, f.lease, f.intent);
    journal.append("submit_started", { submitAttempt: 1 }, journalTimestamp(1));
    journal.append("remote_bound", {
      provider: "worldlabs-marble-v1",
      remoteJobId: "operation_1",
      providerRequestId: null,
    }, journalTimestamp(2));
    journal.append("polling", JOURNAL_POLL_BUDGET, journalTimestamp(3));
    const budget = createInitialDownloadBudget(f.intent, JOURNAL_POLL_BUDGET) as unknown as Record<string, unknown>;
    journal.append("outputs_ready", {
      remoteOutputIdentity: MARBLE_IDENTITY,
      downloadBudget: budget,
    }, journalTimestamp(4));
    journal.append("downloading", {
      remoteOutputIdentity: MARBLE_IDENTITY,
      downloadBudget: budget,
    }, journalTimestamp(5));
    return { journal, budget };
  }

  test("appends the successful output chain through validating and stops there", async () => {
    const f = await fixture();
    const { journal, budget } = await appendEarlyOutputPrefix(f);
    let current: GenerationStateRecordV1 = journal.readCurrent();
    expect(current.sequence).toBe(5);

    let running = budget;
    running = memberWith(running, 0, reserved("world-spz-500k"));
    journal.append("downloading", {
      remoteOutputIdentity: MARBLE_IDENTITY,
      downloadBudget: running,
    }, journalTimestamp(6));
    current = journal.readCurrent();
    const spzCheckpoint = generationStateRecordDigest(current);
    const spzCandidate = journalCandidate("world-spz-500k", spzCheckpoint, "9", 4);
    running = memberWith(running, 0, ownedNext("world-spz-500k", spzCheckpoint, 4));
    journal.append("downloading", {
      remoteOutputIdentity: MARBLE_IDENTITY,
      downloadBudget: running,
    }, journalTimestamp(7));
    running = memberWith(running, 0, cleanupAuthorized("world-spz-500k", spzCheckpoint, spzCandidate));
    journal.append("downloading", {
      remoteOutputIdentity: MARBLE_IDENTITY,
      downloadBudget: running,
    }, journalTimestamp(8));
    running = memberWith(running, 0, finalCandidate("world-spz-500k", spzCandidate));
    journal.append("downloading", {
      remoteOutputIdentity: MARBLE_IDENTITY,
      downloadBudget: running,
    }, journalTimestamp(9));

    running = memberWith(running, 1, reserved("world-collider-glb"));
    journal.append("downloading", {
      remoteOutputIdentity: MARBLE_IDENTITY,
      downloadBudget: running,
    }, journalTimestamp(10));
    current = journal.readCurrent();
    const glbCheckpoint = generationStateRecordDigest(current);
    const glbCandidate = journalCandidate("world-collider-glb", glbCheckpoint, "e", 5);
    running = memberWith(running, 1, ownedNext("world-collider-glb", glbCheckpoint, 5));
    journal.append("downloading", {
      remoteOutputIdentity: MARBLE_IDENTITY,
      downloadBudget: running,
    }, journalTimestamp(11));
    running = memberWith(running, 1, cleanupAuthorized("world-collider-glb", glbCheckpoint, glbCandidate));
    journal.append("downloading", {
      remoteOutputIdentity: MARBLE_IDENTITY,
      downloadBudget: running,
    }, journalTimestamp(12));
    running = memberWith(running, 1, finalCandidate("world-collider-glb", glbCandidate));
    journal.append("downloading", {
      remoteOutputIdentity: MARBLE_IDENTITY,
      downloadBudget: running,
    }, journalTimestamp(13));

    const validating = journal.append("validating", {
      remoteOutputIdentity: MARBLE_IDENTITY,
      downloadBudget: running,
    }, journalTimestamp(14));
    expect(validating.sequence).toBe(14);
    expect(journal.readCurrent()).toEqual(validating);
    const finalNames = readdirSync(f.recordsPath)
      .filter((name) => /^[0-9]{16}-[a-f0-9]{64}\.json$/.test(name));
    expect(finalNames).toHaveLength(15);
    expect(() => readFileSync(join(f.recordsPath, ".record.next"))).toThrow();

    // validating 是本切片的 stop state，journal 层同样 fail closed。
    expect(() => journal.append("downloading", {
      remoteOutputIdentity: MARBLE_IDENTITY,
      downloadBudget: running,
    }, journalTimestamp(15))).toThrow(GenerationCodecError);
    expect(journal.readCurrent()).toEqual(validating);
  });

  test("forged pending pair cannot bypass chain rules after outputs_ready", async () => {
    const f = await fixture();
    const { journal } = await appendEarlyOutputPrefix(f);
    const head = journal.readCurrent();
    expect(head.state).toBe("downloading");

    const forgedCheckpoint = "f".repeat(64);
    const forgedBudget = {
      pollBudget: JOURNAL_POLL_BUDGET,
      metadataRefreshCount: 0,
      orderedMembers: [
        finalCandidate("world-spz-500k", journalCandidate("world-spz-500k", forgedCheckpoint, "9", 4)),
        finalCandidate("world-collider-glb", journalCandidate("world-collider-glb", forgedCheckpoint, "e", 5)),
      ],
    };
    const forged = {
      schemaVersion: 1,
      generationId: f.intent.generationId,
      bindingDigest: f.intent.bindingDigest,
      sequence: head.sequence + 1,
      previousRecordDigest: generationStateRecordDigest(head),
      state: "validating",
      payload: { remoteOutputIdentity: MARBLE_IDENTITY, downloadBudget: forgedBudget },
      recordedAt: journalTimestamp(6),
    };
    const nextPath = join(f.recordsPath, ".record.next");
    const witnessPath = join(f.recordsPath, ".record.next.witness");
    writeNewSyncedFile(nextPath, canonicalJsonBytes(forged));
    const stat = statSync(nextPath, { bigint: true });
    const witness = {
      schemaVersion: 1,
      generationId: f.intent.generationId,
      sequence: forged.sequence,
      recordDigest: generationStateRecordDigest(forged),
      recordName: ".record.next",
      recordFileIdentity: {
        dev: stat.dev.toString(),
        ino: stat.ino.toString(),
        mode: 384,
        uid: stat.uid.toString(),
        gid: stat.gid.toString(),
      },
    };
    writeNewSyncedFile(witnessPath, canonicalJsonBytes(witness));
    syncDirectory(f.recordsPath);

    const restarted = new GenerationRecordJournal(f.root, f.lease, f.intent);
    expectRecovery(() => restarted.resumePending());
    expect(readFileSync(nextPath).byteLength).toBeGreaterThan(0);
    expect(readFileSync(witnessPath).byteLength).toBeGreaterThan(0);
  });

  test("crash during a downloading append resumes the exact chain-supported record", async () => {
    const f = await fixture();
    const { journal, budget } = await appendEarlyOutputPrefix(f);
    const reservedRecord = journal.append("downloading", {
      remoteOutputIdentity: MARBLE_IDENTITY,
      downloadBudget: memberWith(budget, 0, reserved("world-spz-500k")),
    }, journalTimestamp(6));
    const checkpoint = generationStateRecordDigest(reservedRecord);

    const restore = GENERATION_RECORD_JOURNAL_TEST_SEAMS.replaceStageHook((stage) => {
      if (stage === "witness-directory-synced") throw new Error("kill:witness-download");
    });
    try {
      expect(() => journal.append("downloading", {
        remoteOutputIdentity: MARBLE_IDENTITY,
        downloadBudget: memberWith(budget, 0, ownedNext("world-spz-500k", checkpoint, 4)),
      }, journalTimestamp(7))).toThrow("kill:witness-download");
    } finally {
      restore();
    }

    const restarted = new GenerationRecordJournal(f.root, f.lease, f.intent);
    const resumed = restarted.resumePending();
    expect(resumed?.state).toBe("downloading");
    expect(restarted.readCurrent()).toEqual(resumed);
    const members = (restarted.readCurrent().payload.downloadBudget as Record<string, unknown>)
      .orderedMembers as Record<string, unknown>[];
    expect(members[0]).toMatchObject({ stage: "owned-next", attemptCheckpointRecordDigest: checkpoint });
    // resumed record 仍受完整 chain 规则约束：伪造的非 candidate validating 后继不可 append。
    expect(() => restarted.append("validating", {
      remoteOutputIdentity: MARBLE_IDENTITY,
      downloadBudget: memberWith(budget, 0, reserved("world-spz-500k")),
    }, journalTimestamp(8))).toThrow(GenerationCodecError);
  });

  test("foreign extra final after advanced head is rejected before any cleanup", async () => {
    const f = await fixture();
    const restore = GENERATION_RECORD_JOURNAL_TEST_SEAMS.replaceStageHook((stage) => {
      if (stage === "head-directory-synced") throw new Error("kill:head-advanced");
    });
    try {
      const journal = new GenerationRecordJournal(f.root, f.lease, f.intent);
      expect(() => journal.append(
        "submit_started",
        { submitAttempt: 1 },
        "2026-08-15T10:00:01.000Z",
      )).toThrow("kill:head-advanced");
    } finally {
      restore();
    }
    // head 已推进到 sequence 1；注入一个 foreign head+1 final record。
    const foreignName = `0000000000000002-${"f".repeat(64)}.json`;
    writeFileSync(join(f.recordsPath, foreignName), "{}", { mode: 0o600 });

    const restarted = new GenerationRecordJournal(f.root, f.lease, f.intent);
    expectRecovery(() => restarted.resumePending());
    // 证据零 cleanup：pending next/witness 与 foreign final 全部保留。
    expect(readFileSync(join(f.recordsPath, ".record.next")).byteLength).toBeGreaterThan(0);
    expect(readFileSync(join(f.recordsPath, ".record.next.witness")).byteLength).toBeGreaterThan(0);
    expect(readFileSync(join(f.recordsPath, foreignName)).byteLength).toBeGreaterThanOrEqual(0);
    expect(restarted.readCurrent().sequence).toBe(1);
  });
});
