import { describe, expect, test } from "bun:test";
import {
  linkSync,
  lstatSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

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
import { generationIdDigest } from "./generation-birth";
import {
  createGenerationBinding,
  createGenerationIntent,
  requireGenerationRequest,
  type GenerationIntentV1,
} from "./generation-contracts";
import { FirstGenerationCoordinator } from "./first-generation-coordinator";
import { FirstGenerationPreSubmitCoordinator } from "./first-generation-pre-submit-coordinator";
import {
  GENERATION_RECORD_JOURNAL_TEST_SEAMS,
  GenerationRecordJournal,
} from "./generation-record-journal";
import {
  createInitialGenerationStateRecord,
  createNextGenerationStateRecord,
  generationStateRecordDigest,
  generationStateRecordFilename,
  type GenerationStateRecordV1,
} from "./generation-state";
import {
  GenerationSubmitResultCoordinator,
  type SubmitResultOutcomeV1,
  type SubmitResultRequestV1,
} from "./generation-submit-result-coordinator";
import { syncDirectory } from "./safe-filesystem";

const MARBLE_REMOTE = {
  provider: "worldlabs-marble-v1" as const,
  remoteJobId: "marble_operation_1",
  providerRequestId: null,
};
const HUNYUAN_REMOTE = {
  provider: "hunyuan-ai3d-v1" as const,
  remoteJobId: "123456",
  providerRequestId: "123e4567-e89b-42d3-a456-426614174000",
};

async function withRoot(
  run: (
    root: OpenedDataRoot,
    lease: DataRootWriterLease,
    rootPath: string,
  ) => Promise<void> | void,
): Promise<void> {
  const parent = mkdtempSync(join(tmpdir(), "dh017-submit-result-"));
  const rootPath = join(parent, "root");
  bootstrapDataRoot(rootPath);
  const root = openDataRoot(rootPath);
  const acquired = await acquireDataRootWriterLease(root);
  expect(acquired.status).toBe("acquired");
  if (acquired.status !== "acquired") throw new Error("lease unavailable");
  try {
    ensureDataRootLayout(root, acquired.lease);
    await run(root, acquired.lease, rootPath);
  } finally {
    await acquired.lease.close();
    root.close();
    rmSync(parent, { recursive: true, force: true });
  }
}

function intent(
  provider: "worldlabs-marble-v1" | "hunyuan-ai3d-v1",
  key = "submit-result",
): GenerationIntentV1 {
  const prepared = requireGenerationRequest(provider === "worldlabs-marble-v1"
    ? {
        provider,
        model: "marble-1.1",
        prompt: "a mossy stone arch",
        costUnknownAccepted: true,
        waitForCompletionAndDownload: true,
        idempotencyKey: key,
      }
    : {
        provider,
        model: "3.1",
        prompt: "a mossy stone arch",
        costUnknownAccepted: true,
        waitForCompletionAndDownload: true,
        idempotencyKey: key,
      });
  return createGenerationIntent(createGenerationBinding(prepared, {
    contractProfile: provider === "worldlabs-marble-v1"
      ? "worldlabs-openapi-2026-08-15-v1"
      : "cloud-response-v1",
    contractShapeDigest: "a".repeat(64),
  }), "2026-08-15T10:00:00.000Z");
}

function admitted(root: OpenedDataRoot, lease: DataRootWriterLease, durableIntent: GenerationIntentV1): void {
  const result = new FirstGenerationCoordinator(root, lease).admit(durableIntent);
  expect(result).toMatchObject({ status: "admitted", birthStatus: "born" });
}

function submitted(
  root: OpenedDataRoot,
  lease: DataRootWriterLease,
  durableIntent: GenerationIntentV1,
  recordedAt = "2026-08-15T10:00:01.000Z",
): void {
  const result = new FirstGenerationPreSubmitCoordinator(root, lease)
    .checkpoint({ generationId: durableIntent.generationId, recordedAt, decision: { kind: "ready" } });
  expect(result).toMatchObject({ status: "ready", replay: false });
}

function request(
  durableIntent: GenerationIntentV1,
  outcome: SubmitResultOutcomeV1,
  recordedAt = "2026-08-15T10:00:02.000Z",
): SubmitResultRequestV1 {
  return { generationId: durableIntent.generationId, recordedAt, outcome };
}

function recordsPathOf(rootPath: string, durableIntent: GenerationIntentV1): string {
  return join(
    rootPath,
    "receipts",
    "generations",
    "data",
    generationIdDigest(durableIntent.generationId),
    "records",
  );
}

function settledNames(recordsPath: string): string[] {
  const names = readdirSync(recordsPath).sort();
  expect(names).not.toContain(".record.next");
  expect(names).not.toContain(".record.next.witness");
  return names;
}

function snapshot(path: string, prefix = ""): readonly string[] {
  const entries: string[] = [];
  for (const entry of readdirSync(path, { withFileTypes: true }).sort((a, b) =>
    a.name.localeCompare(b.name))) {
    const name = `${prefix}${entry.name}`;
    entries.push(`${name}:${entry.isDirectory() ? "d" : "f"}`);
    if (entry.isDirectory()) entries.push(...snapshot(join(path, entry.name), `${name}/`));
  }
  return entries;
}

/** 手工铸造 pending 辅助名：witness 必须引用 `.record.next` 的真实 file identity。 */
function stagePending(
  recordsPath: string,
  pendingRecord: GenerationStateRecordV1,
  durableIntent: GenerationIntentV1,
): void {
  const nextPath = join(recordsPath, ".record.next");
  writeFileSync(nextPath, canonicalJsonBytes(pendingRecord), { mode: 0o600 });
  const stat = lstatSync(nextPath, { bigint: true });
  writeFileSync(
    join(recordsPath, ".record.next.witness"),
    canonicalJsonBytes({
      schemaVersion: 1,
      generationId: durableIntent.generationId,
      sequence: pendingRecord.sequence,
      recordDigest: generationStateRecordDigest(pendingRecord),
      recordName: ".record.next",
      recordFileIdentity: {
        dev: stat.dev.toString(),
        ino: stat.ino.toString(),
        mode: 384,
        uid: stat.uid.toString(),
        gid: stat.gid.toString(),
      },
    }),
    { mode: 0o600 },
  );
  syncDirectory(recordsPath);
}

describe("GenerationSubmitResultCoordinator", () => {
  test("Marble trustworthy submit response appends exactly one remote_bound; exact retry is read-only replay", async () => {
    await withRoot((root, lease, rootPath) => {
      const durableIntent = intent("worldlabs-marble-v1");
      admitted(root, lease, durableIntent);
      submitted(root, lease, durableIntent);
      const coordinator = new GenerationSubmitResultCoordinator(root, lease);
      const req = request(durableIntent, { kind: "remote-bound", remoteBound: MARBLE_REMOTE });
      const first = coordinator.submitResult(req);
      expect(first).toMatchObject({
        status: "appended",
        record: {
          state: "remote_bound",
          sequence: 2,
          payload: MARBLE_REMOTE,
          recordedAt: req.recordedAt,
        },
      });
      expect(first.record.previousRecordDigest).toBe(
        generationStateRecordDigest(createNextGenerationStateRecord(
          durableIntent,
          createInitialGenerationStateRecord(durableIntent),
          "submit_started",
          { submitAttempt: 1 },
          "2026-08-15T10:00:01.000Z",
        )),
      );
      const names = settledNames(recordsPathOf(rootPath, durableIntent));
      expect(names).toHaveLength(3);
      const after = snapshot(rootPath);
      const replay = coordinator.submitResult(req);
      expect(replay).toMatchObject({ status: "replay", record: { state: "remote_bound", sequence: 2 } });
      expect(snapshot(rootPath)).toEqual(after);
      // conflicting outcome 在 mutation 前 fail closed。
      const conflict = request(durableIntent, {
        kind: "remote-bound",
        remoteBound: { ...MARBLE_REMOTE, remoteJobId: "other_operation" },
      });
      expect(() => coordinator.submitResult(conflict)).toThrow("GENERATION_RECOVERY_REQUIRED");
      expect(snapshot(rootPath)).toEqual(after);
    });
  });

  test("Hunyuan trustworthy submit response appends exactly one remote_bound", async () => {
    await withRoot((root, lease, rootPath) => {
      const durableIntent = intent("hunyuan-ai3d-v1");
      admitted(root, lease, durableIntent);
      submitted(root, lease, durableIntent);
      const coordinator = new GenerationSubmitResultCoordinator(root, lease);
      const req = request(durableIntent, { kind: "remote-bound", remoteBound: HUNYUAN_REMOTE });
      expect(coordinator.submitResult(req)).toMatchObject({
        status: "appended",
        record: { state: "remote_bound", sequence: 2, payload: HUNYUAN_REMOTE },
      });
      expect(coordinator.submitResult(req)).toMatchObject({ status: "replay" });
      expect(settledNames(recordsPathOf(rootPath, durableIntent))).toHaveLength(3);
    });
  });

  test("remote_bound head appends exactly one provider_failed; exact retry is read-only replay; conflicting outcomes zero-mutation", async () => {
    await withRoot((root, lease, rootPath) => {
      const durableIntent = intent("hunyuan-ai3d-v1");
      admitted(root, lease, durableIntent);
      submitted(root, lease, durableIntent);
      const coordinator = new GenerationSubmitResultCoordinator(root, lease);
      const bound = coordinator.submitResult(
        request(durableIntent, { kind: "remote-bound", remoteBound: HUNYUAN_REMOTE }),
      );
      expect(bound).toMatchObject({ status: "appended", record: { state: "remote_bound", sequence: 2 } });
      const req = request(durableIntent, { kind: "provider-failed", code: "PROVIDER_REJECTED" });
      const failed = coordinator.submitResult(req);
      expect(failed).toMatchObject({
        status: "appended",
        record: {
          state: "provider_failed",
          sequence: 3,
          payload: { code: "PROVIDER_REJECTED" },
          recordedAt: req.recordedAt,
        },
      });
      expect(failed.record.previousRecordDigest).toBe(
        generationStateRecordDigest(bound.record),
      );
      expect(settledNames(recordsPathOf(rootPath, durableIntent))).toHaveLength(4);
      const after = snapshot(rootPath);
      // exact provider_failed retry 是只读 replay，不生成第二个 successor。
      expect(coordinator.submitResult(req)).toMatchObject({
        status: "replay",
        record: { state: "provider_failed", sequence: 3 },
      });
      expect(snapshot(rootPath)).toEqual(after);
      // 冲突 code、退回 remote_bound、submission-ambiguous 全部 fail closed。
      expect(() => coordinator.submitResult(
        request(durableIntent, { kind: "provider-failed", code: "PROVIDER_UNAUTHORIZED" }),
      )).toThrow("GENERATION_RECOVERY_REQUIRED");
      expect(() => coordinator.submitResult(
        request(durableIntent, { kind: "remote-bound", remoteBound: HUNYUAN_REMOTE }),
      )).toThrow("GENERATION_RECOVERY_REQUIRED");
      expect(() => coordinator.submitResult(
        request(durableIntent, { kind: "submission-ambiguous" }),
      )).toThrow("GENERATION_RECOVERY_REQUIRED");
      expect(snapshot(rootPath)).toEqual(after);
    });
  });

  test("journal kill at witness-directory-synced converges remote_bound to the same provider_failed record on retry", async () => {
    await withRoot((root, lease, rootPath) => {
      const durableIntent = intent("hunyuan-ai3d-v1");
      admitted(root, lease, durableIntent);
      submitted(root, lease, durableIntent);
      const coordinator = new GenerationSubmitResultCoordinator(root, lease);
      coordinator.submitResult(
        request(durableIntent, { kind: "remote-bound", remoteBound: HUNYUAN_REMOTE }),
      );
      const req = request(durableIntent, { kind: "provider-failed", code: "PROVIDER_REJECTED" });
      const restore = GENERATION_RECORD_JOURNAL_TEST_SEAMS.replaceStageHook((actual) => {
        if (actual === "witness-directory-synced") throw new Error("kill:witness-directory-synced");
      });
      try {
        expect(() => coordinator.submitResult(req)).toThrow("kill:witness-directory-synced");
      } finally {
        restore();
      }
      // head 推进前 kill 留下的 pending provider_failed 是唯一 result authority：
      // retry 走 pending-resume appended，收敛到同一 disposition，不生成第二 successor。
      const retry = coordinator.submitResult(req);
      expect(retry).toMatchObject({
        status: "appended",
        record: {
          state: "provider_failed",
          sequence: 3,
          payload: { code: "PROVIDER_REJECTED" },
          recordedAt: req.recordedAt,
        },
      });
      expect(settledNames(recordsPathOf(rootPath, durableIntent))).toHaveLength(4);
      expect(coordinator.submitResult(req)).toMatchObject({
        status: "replay",
        record: { state: "provider_failed", sequence: 3 },
      });
    });
  });

  for (const code of [
    "PROVIDER_UNAUTHORIZED",
    "PROVIDER_PAYMENT_REQUIRED",
    "PROVIDER_REJECTED",
    "PROVIDER_CONTRACT_MISMATCH",
  ] as const) {
    test(`Marble rejected ${code} appends exact provider_failed and replays read-only`, async () => {
      await withRoot((root, lease, rootPath) => {
        const durableIntent = intent("worldlabs-marble-v1");
        admitted(root, lease, durableIntent);
        submitted(root, lease, durableIntent);
        const coordinator = new GenerationSubmitResultCoordinator(root, lease);
        const req = request(durableIntent, { kind: "provider-failed", code });
        expect(coordinator.submitResult(req)).toMatchObject({
          status: "appended",
          record: { state: "provider_failed", sequence: 2, payload: { code } },
        });
        const after = snapshot(rootPath);
        expect(coordinator.submitResult(req)).toMatchObject({
          status: "replay",
          record: { state: "provider_failed", sequence: 2 },
        });
        expect(snapshot(rootPath)).toEqual(after);
        const other = code === "PROVIDER_UNAUTHORIZED" ? "PROVIDER_REJECTED" : "PROVIDER_UNAUTHORIZED";
        expect(() => coordinator.submitResult(
          request(durableIntent, { kind: "provider-failed", code: other }),
        )).toThrow("GENERATION_RECOVERY_REQUIRED");
        expect(snapshot(rootPath)).toEqual(after);
      });
    });
  }

  test("submission_ambiguous appends once and replays read-only; conflicting outcome fails closed", async () => {
    await withRoot((root, lease, rootPath) => {
      const durableIntent = intent("hunyuan-ai3d-v1");
      admitted(root, lease, durableIntent);
      submitted(root, lease, durableIntent);
      const coordinator = new GenerationSubmitResultCoordinator(root, lease);
      const req = request(durableIntent, { kind: "submission-ambiguous" });
      expect(coordinator.submitResult(req)).toMatchObject({
        status: "appended",
        record: {
          state: "submission_ambiguous",
          sequence: 2,
          payload: { code: "PROVIDER_SUBMISSION_AMBIGUOUS" },
        },
      });
      const after = snapshot(rootPath);
      expect(coordinator.submitResult(req)).toMatchObject({ status: "replay" });
      expect(snapshot(rootPath)).toEqual(after);
      expect(() => coordinator.submitResult(
        request(durableIntent, { kind: "remote-bound", remoteBound: HUNYUAN_REMOTE }),
      )).toThrow("GENERATION_RECOVERY_REQUIRED");
      expect(snapshot(rootPath)).toEqual(after);
    });
  });

  test("cross-provider outcome against durable intent fails closed with zero mutation", async () => {
    await withRoot((root, lease, rootPath) => {
      const durableIntent = intent("worldlabs-marble-v1");
      admitted(root, lease, durableIntent);
      submitted(root, lease, durableIntent);
      const coordinator = new GenerationSubmitResultCoordinator(root, lease);
      const before = snapshot(rootPath);
      expect(() => coordinator.submitResult(
        request(durableIntent, { kind: "remote-bound", remoteBound: HUNYUAN_REMOTE }),
      )).toThrow("GENERATION_RECOVERY_REQUIRED");
      expect(snapshot(rootPath)).toEqual(before);
    });
    await withRoot((root, lease, rootPath) => {
      const durableIntent = intent("hunyuan-ai3d-v1");
      admitted(root, lease, durableIntent);
      submitted(root, lease, durableIntent);
      const coordinator = new GenerationSubmitResultCoordinator(root, lease);
      const before = snapshot(rootPath);
      expect(() => coordinator.submitResult(
        request(durableIntent, { kind: "remote-bound", remoteBound: MARBLE_REMOTE }),
      )).toThrow("GENERATION_RECOVERY_REQUIRED");
      expect(snapshot(rootPath)).toEqual(before);
    });
  });

  test("admitted current fails closed with evidence preserved", async () => {
    await withRoot((root, lease, rootPath) => {
      const durableIntent = intent("worldlabs-marble-v1");
      admitted(root, lease, durableIntent);
      const coordinator = new GenerationSubmitResultCoordinator(root, lease);
      const before = snapshot(rootPath);
      expect(() => coordinator.submitResult(
        request(durableIntent, { kind: "remote-bound", remoteBound: MARBLE_REMOTE }),
      )).toThrow("GENERATION_RECOVERY_REQUIRED");
      expect(snapshot(rootPath)).toEqual(before);
    });
  });

  test("pre_submit_blocked current fails closed with evidence preserved", async () => {
    await withRoot((root, lease, rootPath) => {
      const durableIntent = intent("worldlabs-marble-v1");
      admitted(root, lease, durableIntent);
      new FirstGenerationPreSubmitCoordinator(root, lease).checkpoint({
        generationId: durableIntent.generationId,
        recordedAt: "2026-08-15T10:00:01.000Z",
        decision: { kind: "blocked", code: "CREDENTIAL_UNAVAILABLE" },
      });
      const coordinator = new GenerationSubmitResultCoordinator(root, lease);
      const blocked = snapshot(rootPath);
      expect(() => coordinator.submitResult(
        request(durableIntent, { kind: "submission-ambiguous" }),
      )).toThrow("GENERATION_RECOVERY_REQUIRED");
      expect(snapshot(rootPath)).toEqual(blocked);
    });
  });

  test("polling advanced current fails closed with evidence preserved", async () => {
    await withRoot((root, lease, rootPath) => {
      const durableIntent = intent("worldlabs-marble-v1");
      admitted(root, lease, durableIntent);
      submitted(root, lease, durableIntent);
      const journal = new GenerationRecordJournal(root, lease, durableIntent);
      journal.append("remote_bound", MARBLE_REMOTE, "2026-08-15T10:00:02.000Z");
      journal.append(
        "polling",
        {
          cycleCount: 1,
          attemptCount: 1,
          cycleStartedAt: "2026-08-15T10:00:03.000Z",
          deadlineAt: "2026-08-15T10:00:33.000Z",
        },
        "2026-08-15T10:00:03.000Z",
      );
      const coordinator = new GenerationSubmitResultCoordinator(root, lease);
      const advanced = snapshot(rootPath);
      expect(() => coordinator.submitResult(
        request(durableIntent, { kind: "remote-bound", remoteBound: MARBLE_REMOTE }),
      )).toThrow("GENERATION_RECOVERY_REQUIRED");
      expect(() => coordinator.submitResult(
        request(durableIntent, { kind: "submission-ambiguous" }),
      )).toThrow("GENERATION_RECOVERY_REQUIRED");
      expect(snapshot(rootPath)).toEqual(advanced);
    });
  });

  test("malformed request shapes fail at the boundary without mutation", async () => {
    await withRoot((root, lease, rootPath) => {
      const durableIntent = intent("worldlabs-marble-v1");
      admitted(root, lease, durableIntent);
      submitted(root, lease, durableIntent);
      const coordinator = new GenerationSubmitResultCoordinator(root, lease);
      const bad: unknown[] = [
        request(durableIntent, { kind: "submission-ambiguous" }, "2026-08-15T10:00:02Z"),
        request(durableIntent, { kind: "submission-ambiguous" }, "not-a-timestamp"),
        { generationId: "generation:sha256:xyz", recordedAt: "2026-08-15T10:00:02.000Z", outcome: { kind: "submission-ambiguous" } },
        { ...request(durableIntent, { kind: "submission-ambiguous" }), outcome: { kind: "unknown" } },
        { ...request(durableIntent, { kind: "remote-bound" }), outcome: { kind: "remote-bound", remoteBound: { provider: "worldlabs-marble-v1", remoteJobId: "op_1" } } },
        { ...request(durableIntent, { kind: "remote-bound" }), outcome: { kind: "remote-bound", remoteBound: { provider: "other-provider", remoteJobId: "op_1", providerRequestId: null } } },
        { ...request(durableIntent, { kind: "provider-failed" }), outcome: { kind: "provider-failed", code: "PROVIDER_SUBMISSION_AMBIGUOUS" } },
        { ...request(durableIntent, { kind: "provider-failed" }), outcome: { kind: "provider-failed" } },
      ];
      const before = snapshot(rootPath);
      for (const value of bad) {
        expect(() => coordinator.submitResult(value as never))
          .toThrow("GENERATION_RECOVERY_REQUIRED");
      }
      expect(snapshot(rootPath)).toEqual(before);
    });
  });

  for (const stage of [
    "witness-directory-synced",
    "final-link-directory-synced",
    "head-next-synced",
    "head-directory-synced",
    "next-cleanup-directory-synced",
    "witness-cleanup-directory-synced",
  ] as const) {
    test(`journal kill at ${stage} converges to the same result record on retry`, async () => {
      await withRoot((root, lease, rootPath) => {
        const durableIntent = intent("worldlabs-marble-v1");
        admitted(root, lease, durableIntent);
        submitted(root, lease, durableIntent);
        const coordinator = new GenerationSubmitResultCoordinator(root, lease);
        const req = request(durableIntent, { kind: "remote-bound", remoteBound: MARBLE_REMOTE });
        const restore = GENERATION_RECORD_JOURNAL_TEST_SEAMS.replaceStageHook((actual) => {
          if (actual === stage) throw new Error(`kill:${stage}`);
        });
        try {
          expect(() => coordinator.submitResult(req)).toThrow(`kill:${stage}`);
        } finally {
          restore();
        }
        // head 已推进后的 kill（head-directory-synced 及之后）只留 pending
        // 辅助名，retry 走 settled replay；head 推进前的 kill 走 pending-resume
        // appended。两者都收敛到同一 record。
        const headAlreadyAdvanced = [
          "head-directory-synced",
          "next-cleanup-directory-synced",
          "witness-cleanup-directory-synced",
        ].includes(stage);
        const retry = coordinator.submitResult(req);
        expect(retry).toMatchObject({
          status: headAlreadyAdvanced ? "replay" : "appended",
          record: {
            state: "remote_bound",
            sequence: 2,
            recordedAt: req.recordedAt,
          },
        });
        const names = settledNames(recordsPathOf(rootPath, durableIntent));
        expect(names).toHaveLength(3);
        expect(coordinator.submitResult(req)).toMatchObject({ status: "replay" });
      });
    });
  }

  test("journal kill before the witness is written fails closed on retry with evidence preserved", async () => {
    await withRoot((root, lease, rootPath) => {
      const durableIntent = intent("worldlabs-marble-v1");
      admitted(root, lease, durableIntent);
      submitted(root, lease, durableIntent);
      const coordinator = new GenerationSubmitResultCoordinator(root, lease);
      const req = request(durableIntent, { kind: "submission-ambiguous" });
      const restore = GENERATION_RECORD_JOURNAL_TEST_SEAMS.replaceStageHook((actual) => {
        if (actual === "next-file-synced") throw new Error("kill:next-file-synced");
      });
      try {
        expect(() => coordinator.submitResult(req)).toThrow("kill:next-file-synced");
      } finally {
        restore();
      }
      expect(() => coordinator.submitResult(req))
        .toThrow("GENERATION_RECOVERY_REQUIRED");
      const recordsPath = recordsPathOf(rootPath, durableIntent);
      const names = readdirSync(recordsPath);
      expect(names).toContain(".record.next");
      expect(names).not.toContain(".record.next.witness");
      expect(names.filter((name) => name.startsWith("0000000000000002-"))).toEqual([]);
    });
  });

  test("crash mid-result-append converges to the same pending disposition regardless of retry outcome", async () => {
    await withRoot((root, lease, rootPath) => {
      const durableIntent = intent("worldlabs-marble-v1");
      admitted(root, lease, durableIntent);
      submitted(root, lease, durableIntent);
      const recordsPath = recordsPathOf(rootPath, durableIntent);
      const pending = createNextGenerationStateRecord(
        durableIntent,
        createNextGenerationStateRecord(
          durableIntent,
          createInitialGenerationStateRecord(durableIntent),
          "submit_started",
          { submitAttempt: 1 },
          "2026-08-15T10:00:01.000Z",
        ),
        "remote_bound",
        MARBLE_REMOTE,
        "2026-08-15T10:00:02.000Z",
      );
      stagePending(recordsPath, pending, durableIntent);
      const coordinator = new GenerationSubmitResultCoordinator(root, lease);
      // retry 携带保守的 submission-ambiguous：pending remote_bound 仍是唯一
      // result authority，收敛到同一 disposition digest/recordedAt。
      const resumed = coordinator.submitResult(
        request(durableIntent, { kind: "submission-ambiguous" }),
      );
      expect(resumed).toMatchObject({
        status: "appended",
        record: { state: "remote_bound", sequence: 2, recordedAt: pending.recordedAt },
      });
      expect(generationStateRecordDigest(resumed.record)).toBe(
        generationStateRecordDigest(pending),
      );
      expect(settledNames(recordsPath)).toHaveLength(3);
      expect(coordinator.submitResult(
        request(durableIntent, { kind: "remote-bound", remoteBound: MARBLE_REMOTE }),
      )).toMatchObject({ status: "replay" });
    });
  });

  test("crash mid-result-append with provider_failed pending converges to that disposition", async () => {
    await withRoot((root, lease, rootPath) => {
      const durableIntent = intent("worldlabs-marble-v1");
      admitted(root, lease, durableIntent);
      submitted(root, lease, durableIntent);
      const recordsPath = recordsPathOf(rootPath, durableIntent);
      const pending = createNextGenerationStateRecord(
        durableIntent,
        createNextGenerationStateRecord(
          durableIntent,
          createInitialGenerationStateRecord(durableIntent),
          "submit_started",
          { submitAttempt: 1 },
          "2026-08-15T10:00:01.000Z",
        ),
        "provider_failed",
        { code: "PROVIDER_REJECTED" },
        "2026-08-15T10:00:02.000Z",
      );
      stagePending(recordsPath, pending, durableIntent);
      const coordinator = new GenerationSubmitResultCoordinator(root, lease);
      const resumed = coordinator.submitResult(
        request(durableIntent, { kind: "submission-ambiguous" }),
      );
      expect(resumed).toMatchObject({
        status: "appended",
        record: { state: "provider_failed", sequence: 2, payload: { code: "PROVIDER_REJECTED" } },
      });
      expect(generationStateRecordDigest(resumed.record)).toBe(
        generationStateRecordDigest(pending),
      );
      expect(settledNames(recordsPath)).toHaveLength(3);
    });
  });

  test("leftover pending aux for current submit_started head is protocol-cleaned before fresh append", async () => {
    await withRoot((root, lease, rootPath) => {
      const durableIntent = intent("worldlabs-marble-v1");
      admitted(root, lease, durableIntent);
      submitted(root, lease, durableIntent);
      const recordsPath = recordsPathOf(rootPath, durableIntent);
      const current = createNextGenerationStateRecord(
        durableIntent,
        createInitialGenerationStateRecord(durableIntent),
        "submit_started",
        { submitAttempt: 1 },
        "2026-08-15T10:00:01.000Z",
      );
      // 真实 crash 窗口：head 已推进到 submit_started，witness 指向同一 inode。
      const nextPath = join(recordsPath, ".record.next");
      linkSync(join(recordsPath, generationStateRecordFilename(current)), nextPath);
      const stat = lstatSync(nextPath, { bigint: true });
      writeFileSync(
        join(recordsPath, ".record.next.witness"),
        canonicalJsonBytes({
          schemaVersion: 1,
          generationId: durableIntent.generationId,
          sequence: current.sequence,
          recordDigest: generationStateRecordDigest(current),
          recordName: ".record.next",
          recordFileIdentity: {
            dev: stat.dev.toString(),
            ino: stat.ino.toString(),
            mode: 384,
            uid: stat.uid.toString(),
            gid: stat.gid.toString(),
          },
        }),
        { mode: 0o600 },
      );
      syncDirectory(recordsPath);
      const coordinator = new GenerationSubmitResultCoordinator(root, lease);
      const appended = coordinator.submitResult(
        request(durableIntent, { kind: "remote-bound", remoteBound: MARBLE_REMOTE }),
      );
      expect(appended).toMatchObject({
        status: "appended",
        record: { state: "remote_bound", sequence: 2 },
      });
      const names = settledNames(recordsPath);
      expect(names).toHaveLength(3);
    });
  });

  test("keeps coordinator and seams out of package-root exports", () => {
    const source = readFileSync(join(import.meta.dir, "index.ts"), "utf8");
    for (const token of [
      "GenerationSubmitResultCoordinator",
      "generation-transition-capacity",
      "inspectGenerationTransitionCapacity",
    ]) expect(source).not.toContain(token);
    for (const token of [
      "SubmitResultRequestV1",
      "SubmitResultResultV1",
      "SubmitResultOutcomeV1",
    ]) expect(source).toContain(token);
  });

  test("submit-result coordinator source touches no fs/path/network/provider/credential surface", () => {
    const source = readFileSync(
      join(import.meta.dir, "generation-submit-result-coordinator.ts"),
      "utf8",
    );
    const specifiers = [...source.matchAll(/(?:from|import)\s*\(\s*["']([^"']+)["']/g)]
      .map((match) => match[1]);
    for (const specifier of specifiers) {
      expect(specifier.startsWith("node:")).toBe(false);
      expect(specifier).not.toMatch(
        /marble|hunyuan|provider|transport|keychain|credential|agent-gateway|studio/i,
      );
    }
    expect(source).not.toMatch(/\bfetch\s*\(/);
    expect(source).not.toMatch(/process\.env/);
    expect(source).not.toMatch(/WebSocket|Bun\.serve|node:http/);
  });

  test("capacity helper source touches no network/provider/credential surface", () => {
    const source = readFileSync(
      join(import.meta.dir, "generation-transition-capacity.ts"),
      "utf8",
    );
    const specifiers = [...source.matchAll(/(?:from|import)\s*\(\s*["']([^"']+)["']/g)]
      .map((match) => match[1]);
    for (const specifier of specifiers) {
      expect(specifier.startsWith("node:")).toBe(false);
      expect(specifier).not.toMatch(
        /marble|hunyuan|provider|transport|keychain|credential|agent-gateway|studio/i,
      );
    }
    expect(source).not.toMatch(/\bfetch\s*\(/);
    expect(source).not.toMatch(/process\.env/);
  });
});
