import { describe, expect, test } from "bun:test";
import {
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
import {
  createGenerationBinding,
  createGenerationIntent,
  requireGenerationRequest,
  type GenerationIntentV1,
} from "./generation-contracts";
import { FirstGenerationCoordinator } from "./first-generation-coordinator";
import {
  FirstGenerationPreSubmitCoordinator,
  type PreSubmitCheckpointRequestV1,
} from "./first-generation-pre-submit-coordinator";
import {
  GENERATION_RECORD_JOURNAL_TEST_SEAMS,
  GenerationRecordJournal,
} from "./generation-record-journal";
import {
  createInitialGenerationStateRecord,
  createNextGenerationStateRecord,
  generationStateRecordDigest,
  generationStateRecordFilename,
} from "./generation-state";
import { operationBindingDigest, type OperationBinding } from "./operation-journal";
import { syncDirectory } from "./safe-filesystem";

async function withRoot(
  run: (
    root: OpenedDataRoot,
    lease: DataRootWriterLease,
    rootPath: string,
  ) => Promise<void> | void,
): Promise<void> {
  const parent = mkdtempSync(join(tmpdir(), "dh017-pre-submit-"));
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
): GenerationIntentV1 {
  const prepared = requireGenerationRequest(provider === "worldlabs-marble-v1"
    ? {
        provider,
        model: "marble-1.1",
        prompt: "a mossy stone arch",
        costUnknownAccepted: true,
        waitForCompletionAndDownload: true,
        idempotencyKey: "pre-submit-marble",
      }
    : {
        provider,
        model: "3.1",
        prompt: "a mossy stone arch",
        costUnknownAccepted: true,
        waitForCompletionAndDownload: true,
        idempotencyKey: "pre-submit-hunyuan",
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

function request(
  durableIntent: GenerationIntentV1,
  decision: PreSubmitCheckpointRequestV1["decision"],
  recordedAt = "2026-08-15T10:00:01.000Z",
): PreSubmitCheckpointRequestV1 {
  return { generationId: durableIntent.generationId, recordedAt, decision };
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

function expectSettledSubmit(recordsPath: string, durableIntent: GenerationIntentV1): void {
  const names = readdirSync(recordsPath).sort();
  expect(names).toHaveLength(2);
  expect(names).not.toContain(".record.next");
  expect(names).not.toContain(".record.next.witness");
  expect(names[0]).toBe(generationStateRecordFilename(createInitialGenerationStateRecord(durableIntent)));
  expect(names[1]).toMatch(/^0000000000000001-[a-f0-9]{64}\.json$/);
}

function fillPublicOperations(rootPath: string, count: number): void {
  for (let index = 0; index < count; index += 1) {
    const operationId = `op:pre-submit-cap-${index}`;
    const revision = `project-revision:sha256:${index.toString(16).padStart(64, "0")}`;
    const binding: OperationBinding = {
      schemaVersion: 1,
      operationId,
      operationKind: "project.save-as",
      target: { kind: "project", id: "project:pre-submit-cap" },
      expectedIdentity: null,
      candidateIdentity: { projectRevision: revision },
    };
    writeFileSync(
      join(rootPath, dataRootReceiptIntentPath(operationId)),
      canonicalJsonBytes(binding),
      { mode: 0o600 },
    );
    writeFileSync(
      join(rootPath, dataRootReceiptResultPath(operationId)),
      canonicalJsonBytes({
        schemaVersion: 1,
        operationId,
        bindingDigest: operationBindingDigest(binding),
        variant: "success",
        publishedIdentity: revision,
      }),
      { mode: 0o600 },
    );
  }
  syncDirectory(join(rootPath, "receipts"));
}

describe("FirstGenerationPreSubmitCoordinator", () => {
  test("Marble admitted chain reaches exactly one submit_started; replay is read-only", async () => {
    await withRoot((root, lease, rootPath) => {
      const durableIntent = intent("worldlabs-marble-v1");
      admitted(root, lease, durableIntent);
      const recordsPath = recordsPathOf(rootPath, durableIntent);
      const coordinator = new FirstGenerationPreSubmitCoordinator(root, lease);
      const req = request(durableIntent, { kind: "ready" });
      const first = coordinator.checkpoint(req);
      expect(first).toMatchObject({
        status: "ready",
        replay: false,
        record: {
          state: "submit_started",
          sequence: 1,
          payload: { submitAttempt: 1 },
          recordedAt: req.recordedAt,
          previousRecordDigest: generationStateRecordDigest(
            createInitialGenerationStateRecord(durableIntent),
          ),
        },
      });
      expectSettledSubmit(recordsPath, durableIntent);
      const afterAppend = snapshot(rootPath);
      const replay = coordinator.checkpoint(req);
      expect(replay).toMatchObject({
        status: "ready",
        replay: true,
        record: { state: "submit_started", sequence: 1 },
      });
      expect(snapshot(rootPath)).toEqual(afterAppend);
      const head = JSON.parse(
        readFileSync(join(recordsPathOf(rootPath, durableIntent), "..", "head.json"), "utf8"),
      );
      expect(head.sequence).toBe(1);
    });
  });

  test("Hunyuan admitted chain reaches exactly one submit_started", async () => {
    await withRoot((root, lease, rootPath) => {
      const durableIntent = intent("hunyuan-ai3d-v1");
      admitted(root, lease, durableIntent);
      const coordinator = new FirstGenerationPreSubmitCoordinator(root, lease);
      const first = coordinator.checkpoint(request(durableIntent, { kind: "ready" }));
      expect(first).toMatchObject({
        status: "ready",
        replay: false,
        record: { state: "submit_started", sequence: 1, payload: { submitAttempt: 1 } },
      });
      expect(coordinator.checkpoint(request(durableIntent, { kind: "ready" })))
        .toMatchObject({ status: "ready", replay: true });
      expectSettledSubmit(recordsPathOf(rootPath, durableIntent), durableIntent);
    });
  });

  for (const code of [
    "CREDENTIAL_UNAVAILABLE",
    "REQUEST_ABORTED",
    "GENERATION_CAPACITY_REACHED",
    "PROVIDER_CONTRACT_MISMATCH",
  ] as const) {
    test(`blocked ${code} reaches exactly one pre_submit_blocked with resume count 0`, async () => {
      await withRoot((root, lease, rootPath) => {
        const durableIntent = intent("worldlabs-marble-v1");
        admitted(root, lease, durableIntent);
        const coordinator = new FirstGenerationPreSubmitCoordinator(root, lease);
        const req = request(durableIntent, { kind: "blocked", code });
        const first = coordinator.checkpoint(req);
        expect(first).toMatchObject({
          status: "blocked",
          replay: false,
          record: {
            state: "pre_submit_blocked",
            sequence: 1,
            payload: { code, preSubmitResumeCount: 0 },
          },
        });
        expectSettledSubmit(recordsPathOf(rootPath, durableIntent), durableIntent);
        const after = snapshot(rootPath);
        expect(coordinator.checkpoint(req))
          .toMatchObject({ status: "blocked", replay: true, record: { sequence: 1 } });
        expect(snapshot(rootPath)).toEqual(after);
        // 不同 blocked code / ready 决策冲突：fail closed，不产生第二条记录。
        const other = code === "REQUEST_ABORTED" ? "CREDENTIAL_UNAVAILABLE" : "REQUEST_ABORTED";
        expect(() => coordinator.checkpoint(request(durableIntent, { kind: "blocked", code: other })))
          .toThrow("GENERATION_RECOVERY_REQUIRED");
        expect(() => coordinator.checkpoint(request(durableIntent, { kind: "ready" })))
          .toThrow("GENERATION_RECOVERY_REQUIRED");
        expect(snapshot(rootPath)).toEqual(after);
      });
    });
  }

  test("conflicting ready-vs-blocked decisions never produce two records", async () => {
    await withRoot((root, lease, rootPath) => {
      const durableIntent = intent("worldlabs-marble-v1");
      admitted(root, lease, durableIntent);
      const coordinator = new FirstGenerationPreSubmitCoordinator(root, lease);
      coordinator.checkpoint(request(durableIntent, { kind: "ready" }));
      const after = snapshot(rootPath);
      expect(() => coordinator.checkpoint(
        request(durableIntent, { kind: "blocked", code: "REQUEST_ABORTED" }),
      )).toThrow("GENERATION_RECOVERY_REQUIRED");
      expect(snapshot(rootPath)).toEqual(after);
    });
  });

  test("unknown/provider/runtime/raw blocked codes reject without mutation", async () => {
    await withRoot((root, lease, rootPath) => {
      const durableIntent = intent("worldlabs-marble-v1");
      admitted(root, lease, durableIntent);
      const coordinator = new FirstGenerationPreSubmitCoordinator(root, lease);
      const before = snapshot(rootPath);
      for (const code of [
        "PROVIDER_UNAUTHORIZED",
        "PROVIDER_PAYMENT_REQUIRED",
        "PROVIDER_SUBMISSION_AMBIGUOUS",
        "GENERATION_RECOVERY_REQUIRED",
        "raw-garbage",
        "",
      ]) {
        expect(() => coordinator.checkpoint(
          request(durableIntent, { kind: "blocked", code: code as never }),
        )).toThrow("GENERATION_RECOVERY_REQUIRED");
      }
      expect(snapshot(rootPath)).toEqual(before);
    });
  });

  test("malformed request shapes fail at the boundary", async () => {
    await withRoot((root, lease) => {
      const durableIntent = intent("worldlabs-marble-v1");
      admitted(root, lease, durableIntent);
      const coordinator = new FirstGenerationPreSubmitCoordinator(root, lease);
      const bad: unknown[] = [
        request(durableIntent, { kind: "ready" }, "2026-08-15T10:00:01Z"),
        request(durableIntent, { kind: "ready" }, "not-a-timestamp"),
        { generationId: "generation:sha256:xyz", recordedAt: "2026-08-15T10:00:01.000Z", decision: { kind: "ready" } },
        { ...request(durableIntent, { kind: "ready" }), decision: { kind: "blocked" } },
      ];
      for (const value of bad) {
        expect(() => coordinator.checkpoint(value as never))
          .toThrow("GENERATION_RECOVERY_REQUIRED");
      }
    });
  });

  test("advanced state fails closed with evidence preserved", async () => {
    await withRoot((root, lease, rootPath) => {
      const durableIntent = intent("worldlabs-marble-v1");
      admitted(root, lease, durableIntent);
      const journal = new GenerationRecordJournal(root, lease, durableIntent);
      journal.append("submit_started", { submitAttempt: 1 }, "2026-08-15T10:00:01.000Z");
      journal.append(
        "remote_bound",
        {
          provider: "worldlabs-marble-v1",
          remoteJobId: "operation_1",
          providerRequestId: null,
        },
        "2026-08-15T10:00:02.000Z",
      );
      const before = snapshot(rootPath);
      expect(() => new FirstGenerationPreSubmitCoordinator(root, lease)
        .checkpoint(request(durableIntent, { kind: "ready" })))
        .toThrow("GENERATION_RECOVERY_REQUIRED");
      expect(snapshot(rootPath)).toEqual(before);
    });
  });

  test("capacity near-boundary rejects before .record.next creation", async () => {
    await withRoot((root, lease, rootPath) => {
      const durableIntent = intent("worldlabs-marble-v1");
      admitted(root, lease, durableIntent);
      fillPublicOperations(rootPath, 1022); // usedReceiptEntries 3 -> 2047 -> effective 2049
      const coordinator = new FirstGenerationPreSubmitCoordinator(root, lease);
      const before = snapshot(rootPath);
      expect(coordinator.checkpoint(request(durableIntent, { kind: "ready" })))
        .toEqual({ status: "capacity-reached" });
      expect(coordinator.checkpoint(
        request(durableIntent, { kind: "blocked", code: "GENERATION_CAPACITY_REACHED" }),
      )).toEqual({ status: "capacity-reached" });
      expect(snapshot(rootPath)).toEqual(before);
      expect(readdirSync(recordsPathOf(rootPath, durableIntent)).sort())
        .toEqual([generationStateRecordFilename(createInitialGenerationStateRecord(durableIntent))]);
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
    test(`journal kill at ${stage} converges to the same record on retry`, async () => {
      await withRoot((root, lease, rootPath) => {
        const durableIntent = intent("worldlabs-marble-v1");
        admitted(root, lease, durableIntent);
        const coordinator = new FirstGenerationPreSubmitCoordinator(root, lease);
        const req = request(durableIntent, { kind: "ready" });
        const restore = GENERATION_RECORD_JOURNAL_TEST_SEAMS.replaceStageHook((actual) => {
          if (actual === stage) throw new Error(`kill:${stage}`);
        });
        try {
          expect(() => coordinator.checkpoint(req)).toThrow(`kill:${stage}`);
        } finally {
          restore();
        }
        const retry = coordinator.checkpoint(req);
        expect(retry).toMatchObject({
          status: "ready",
          replay: true,
          record: {
            state: "submit_started",
            sequence: 1,
            recordedAt: req.recordedAt,
          },
        });
        expectSettledSubmit(recordsPathOf(rootPath, durableIntent), durableIntent);
        const head = JSON.parse(readFileSync(join(
          recordsPathOf(rootPath, durableIntent),
          "..",
          "head.json",
        ), "utf8"));
        expect(head.sequence).toBe(1);
      });
    });
  }

  test("journal kill before the witness is written fails closed on retry with evidence preserved", async () => {
    await withRoot((root, lease, rootPath) => {
      const durableIntent = intent("worldlabs-marble-v1");
      admitted(root, lease, durableIntent);
      const coordinator = new FirstGenerationPreSubmitCoordinator(root, lease);
      const req = request(durableIntent, { kind: "ready" });
      const restore = GENERATION_RECORD_JOURNAL_TEST_SEAMS.replaceStageHook((actual) => {
        if (actual === "next-file-synced") throw new Error("kill:next-file-synced");
      });
      try {
        expect(() => coordinator.checkpoint(req)).toThrow("kill:next-file-synced");
      } finally {
        restore();
      }
      expect(() => coordinator.checkpoint(req))
        .toThrow("GENERATION_RECOVERY_REQUIRED");
      const recordsPath = recordsPathOf(rootPath, durableIntent);
      const names = readdirSync(recordsPath);
      expect(names).toContain(".record.next");
      expect(names.filter((name) => name.startsWith("0000000000000001-"))).toEqual([]);
    });
  });

  test("pending-at-witness converges through the journal authority", async () => {
    await withRoot((root, lease, rootPath) => {
      const durableIntent = intent("worldlabs-marble-v1");
      admitted(root, lease, durableIntent);
      const recordsPath = recordsPathOf(rootPath, durableIntent);
      const kill = GENERATION_RECORD_JOURNAL_TEST_SEAMS.replaceStageHook((actual) => {
        if (actual === "witness-directory-synced") throw new Error("kill:witness");
      });
      try {
        expect(() => new FirstGenerationPreSubmitCoordinator(root, lease)
          .checkpoint(request(durableIntent, { kind: "ready" })))
          .toThrow("kill:witness");
      } finally {
        kill();
      }
      expect(new FirstGenerationPreSubmitCoordinator(root, lease)
        .checkpoint(request(durableIntent, { kind: "ready" })))
        .toMatchObject({
          status: "ready",
          replay: true,
          record: { state: "submit_started", sequence: 1 },
        });
      expectSettledSubmit(recordsPath, durableIntent);
    });
  });

  test("foreign pending record for a different decision fails closed with evidence preserved", async () => {
    await withRoot((root, lease, rootPath) => {
      const durableIntent = intent("worldlabs-marble-v1");
      admitted(root, lease, durableIntent);
      const recordsPath = recordsPathOf(rootPath, durableIntent);
      const admittedRecord = createInitialGenerationStateRecord(durableIntent);
      const blocked = createNextGenerationStateRecord(
        durableIntent,
        admittedRecord,
        "pre_submit_blocked",
        { code: "CREDENTIAL_UNAVAILABLE", preSubmitResumeCount: 0 },
        "2026-08-15T10:00:01.000Z",
      );
      const nextPath = join(recordsPath, ".record.next");
      writeFileSync(nextPath, canonicalJsonBytes(blocked), { mode: 0o600 });
      const stat = lstatSync(nextPath, { bigint: true });
      writeFileSync(
        join(recordsPath, ".record.next.witness"),
        canonicalJsonBytes({
          schemaVersion: 1,
          generationId: durableIntent.generationId,
          sequence: 1,
          recordDigest: generationStateRecordDigest(blocked),
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
      const before = snapshot(rootPath);
      expect(() => new FirstGenerationPreSubmitCoordinator(root, lease)
        .checkpoint(request(durableIntent, { kind: "ready" })))
        .toThrow("GENERATION_RECOVERY_REQUIRED");
      expect(snapshot(rootPath)).toEqual(before);
    });
  });

  test("wrong generation and cross-root/cross-lease fail closed", async () => {
    await withRoot(async (root, lease) => {
      const durableIntent = intent("worldlabs-marble-v1");
      admitted(root, lease, durableIntent);
      const coordinator = new FirstGenerationPreSubmitCoordinator(root, lease);
      const foreign = intent("hunyuan-ai3d-v1");
      expect(() => coordinator.checkpoint(request(foreign, { kind: "ready" })))
        .toThrow("GENERATION_RECOVERY_REQUIRED");
      await lease.close();
      expect(() => coordinator.checkpoint(request(durableIntent, { kind: "ready" })))
        .toThrow("Data Root writer lease 非本包所有或已关闭");
    });
  });

  test("keeps coordinator, journal, intent loader, and seams out of package-root exports", () => {
    const source = readFileSync(join(import.meta.dir, "index.ts"), "utf8");
    for (const token of [
      "FirstGenerationPreSubmitCoordinator",
      "GenerationRecordJournal",
      "readGenerationIntentForJournal",
      "inspectGenerationRecordJournalPhysicalSnapshot",
      "FirstGenerationCapacityCapability",
      "inspectGenerationTransitionCapacity",
    ]) expect(source).not.toContain(token);
    for (const token of [
      "PreSubmitCheckpointRequestV1",
      "PreSubmitCheckpointResultV1",
      "PreSubmitCheckpointDecisionV1",
    ]) expect(source).toContain(token);
  });

  test("pre-submit coordinator source touches no fs/path/network/provider/credential surface", () => {
    const source = readFileSync(
      join(import.meta.dir, "first-generation-pre-submit-coordinator.ts"),
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
});
