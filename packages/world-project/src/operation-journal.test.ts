import { describe, expect, test } from "bun:test";
import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

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
import {
  OperationJournal,
  OperationJournalError,
  OperationSingleFlight,
  artifactCandidateSetDigest,
  isDurablyFinalizedOperation,
  operationBindingDigest,
  requireOperationBinding,
  type ArtifactCandidateIdentity,
  type OperationBinding,
} from "./operation-journal";
import { writeNewSyncedFile } from "./safe-filesystem";
import {
  createGenerationNamespaceInstallBindingFromLeaseDigest,
  generationNamespaceInstallBindingDigest,
  generationNamespaceSeedDigest,
} from "./generation-namespace";
import {
  generatedSetPublicationBindingDigest,
  requireGeneratedSetPublicationBinding,
  type GeneratedSetPublicationBindingV1,
} from "./generated-artifact-publication";

function projectBinding(
  operationId = "op:save-1",
  revision = `project-revision:sha256:${"a".repeat(64)}`,
): OperationBinding {
  return {
    schemaVersion: 1,
    operationId,
    operationKind: "project.save-as",
    target: { kind: "project", id: "project:demo" },
    expectedIdentity: null,
    candidateIdentity: { projectRevision: revision },
  };
}

function generatedSetBinding(
  generationId = `generation:sha256:${"a".repeat(64)}`,
  artifactSetDigest = "b".repeat(64),
): GeneratedSetPublicationBindingV1 {
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

function generatedSetResult(
  binding: GeneratedSetPublicationBindingV1,
  variant: "success" | "aborted-before-publish",
): Record<string, unknown> {
  const base = {
    schemaVersion: 1,
    operationId: binding.operationId,
    bindingDigest: generatedSetPublicationBindingDigest(binding),
    variant,
  };
  return variant === "success"
    ? { ...base, publishedIdentity: binding.candidateIdentity.artifactSetDigest }
    : { ...base, code: "GENERATION_RECOVERY_REQUIRED" };
}

async function withJournal(
  run: (
    journal: OperationJournal,
    root: OpenedDataRoot,
    lease: DataRootWriterLease,
    rootPath: string,
  ) => Promise<void> | void,
): Promise<void> {
  const parent = mkdtempSync(join(tmpdir(), "dh016-journal-"));
  const rootPath = join(parent, "root");
  bootstrapDataRoot(rootPath);
  const root = openDataRoot(rootPath);
  const leaseResult = await acquireDataRootWriterLease(root);
  expect(leaseResult.status).toBe("acquired");
  if (leaseResult.status !== "acquired") throw new Error("lease unavailable");
  try {
    await run(new OperationJournal(root, leaseResult.lease), root, leaseResult.lease, rootPath);
  } finally {
    await leaseResult.lease.close();
    root.close();
    rmSync(parent, { recursive: true, force: true });
  }
}

describe("operation binding codec", () => {
  test("canonical binding deterministic，未知字段/错误 candidate fail closed", () => {
    const binding = projectBinding();
    expect(operationBindingDigest(binding)).toMatch(/^[a-f0-9]{64}$/);
    expect(requireOperationBinding(binding)).toEqual(binding);
    expect(() => requireOperationBinding({ ...binding, secret: "x" })).toThrow(
      OperationJournalError,
    );
    expect(() => requireOperationBinding({
      ...binding,
      candidateIdentity: { projectRevision: "not-a-digest" },
    })).toThrow(OperationJournalError);
  });

  test("operation kind、target 与 expectedIdentity 必须形成唯一语义边界", () => {
    const projectRevision = `project-revision:sha256:${"a".repeat(64)}`;
    const artifactCandidate: ArtifactCandidateIdentity = {
      assetId: "asset:demo",
      digest: "b".repeat(64),
      byteLength: 1,
      format: "spz-v2" as const,
      elementCount: 1,
      sourceBounds: { min: [0, 0, 0], max: [1, 1, 1] },
    };
    const artifactSetDigest = artifactCandidateSetDigest([artifactCandidate]);
    const validBindings: readonly OperationBinding[] = [
      {
        ...projectBinding("op:save-valid"),
        operationKind: "project.save",
        expectedIdentity: projectRevision,
      },
      projectBinding("op:save-as-valid"),
      {
        schemaVersion: 1,
        operationId: "op:artifact-valid",
        operationKind: "artifact.publish",
        target: { kind: "artifact", id: artifactCandidate.assetId },
        expectedIdentity: null,
        candidateIdentity: artifactCandidate,
      },
      {
        schemaVersion: 1,
        operationId: "op:registry-valid",
        operationKind: "artifact.import-dh013",
        target: { kind: "registry", id: "registry:marble-hunyuan-v1" },
        expectedIdentity: null,
        candidateIdentity: { candidateArtifacts: [artifactCandidate], artifactSetDigest },
      },
      {
        schemaVersion: 1,
        operationId: "op:bundle-valid",
        operationKind: "bundle.import",
        target: { kind: "project", id: "project:demo" },
        expectedIdentity: null,
        candidateIdentity: {
          projectRevision,
          candidateArtifacts: [artifactCandidate],
          artifactSetDigest,
        },
      },
    ];
    for (const value of validBindings) {
      expect(requireOperationBinding(value)).toEqual(value);
    }
    const cases: readonly unknown[] = [
      {
        ...projectBinding("op:save-null"),
        operationKind: "project.save",
        expectedIdentity: null,
      },
      {
        ...projectBinding("op:save-as-non-null"),
        expectedIdentity: projectRevision,
      },
      {
        schemaVersion: 1,
        operationId: "op:artifact-wrong-target",
        operationKind: "artifact.publish",
        target: { kind: "artifact", id: "asset:other" },
        expectedIdentity: null,
        candidateIdentity: artifactCandidate,
      },
      {
        schemaVersion: 1,
        operationId: "op:registry-wrong-target",
        operationKind: "artifact.import-dh013",
        target: { kind: "registry", id: "registry:other" },
        expectedIdentity: null,
        candidateIdentity: { candidateArtifacts: [artifactCandidate], artifactSetDigest },
      },
      {
        schemaVersion: 1,
        operationId: "op:registry-non-null",
        operationKind: "artifact.import-dh013",
        target: { kind: "registry", id: "registry:marble-hunyuan-v1" },
        expectedIdentity: projectRevision,
        candidateIdentity: { candidateArtifacts: [artifactCandidate], artifactSetDigest },
      },
      {
        schemaVersion: 1,
        operationId: "op:bundle-wrong-target",
        operationKind: "bundle.import",
        target: { kind: "registry", id: "registry:marble-hunyuan-v1" },
        expectedIdentity: null,
        candidateIdentity: {
          projectRevision,
          candidateArtifacts: [artifactCandidate],
          artifactSetDigest,
        },
      },
      {
        schemaVersion: 1,
        operationId: "op:bundle-non-null",
        operationKind: "bundle.import",
        target: { kind: "project", id: "project:demo" },
        expectedIdentity: projectRevision,
        candidateIdentity: {
          projectRevision,
          candidateArtifacts: [artifactCandidate],
          artifactSetDigest,
        },
      },
    ];
    for (const value of cases) {
      expect(() => requireOperationBinding(value)).toThrow(
        expect.objectContaining({ code: "OPERATION_RECOVERY_REQUIRED" }),
      );
    }
  });
});

describe("OperationJournal", () => {
  test("receipt scan validates internal namespace evidence without exposing public authority", async () => {
    await withJournal((journal, _root, _lease, rootPath) => {
      const binding = createGenerationNamespaceInstallBindingFromLeaseDigest(
        "0".repeat(64),
      );
      writeNewSyncedFile(
        join(rootPath, dataRootReceiptIntentPath(binding.operationId)),
        canonicalJsonBytes(binding),
      );
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
      expect(journal.listBindings()).toEqual([]);
      const receiptsBefore = readdirSync(join(rootPath, "receipts")).sort();
      const stagingBefore = readdirSync(join(rootPath, "staging")).sort();
      expect(() => journal.admit(binding as never)).toThrow(
        "OPERATION_RECOVERY_REQUIRED",
      );
      expect(readdirSync(join(rootPath, "receipts")).sort()).toEqual(receiptsBefore);
      expect(readdirSync(join(rootPath, "staging")).sort()).toEqual(stagingBefore);
    });
  });

  test("可读 result 文件不等于当前 live operation 已完成 directory fsync", async () => {
    await withJournal((journal, root, lease, rootPath) => {
      const binding = projectBinding("op:visible-not-durable");
      const admission = journal.admit(binding);
      if (admission.status !== "admitted") throw new Error("unexpected replay");
      const result = {
        schemaVersion: 1 as const,
        operationId: binding.operationId,
        bindingDigest: operationBindingDigest(binding),
        variant: "aborted-before-publish" as const,
        code: "FAULT_AFTER_LINK",
      };
      writeNewSyncedFile(
        join(rootPath, dataRootReceiptResultPath(binding.operationId)),
        canonicalJsonBytes(result),
      );
      expect(journal.readResult(binding.operationId, binding)).toEqual(result);
      expect(isDurablyFinalizedOperation(
        admission.operation,
        root,
        lease,
        journal,
      )).toBe(false);
      expect(() => journal.cleanupAttempt(admission.operation)).toThrow(
        "OPERATION_RECOVERY_REQUIRED",
      );
      expect(journal.finalizeAborted(
        admission.operation,
        "FAULT_AFTER_LINK",
      )).toEqual(result);
      expect(isDurablyFinalizedOperation(
        admission.operation,
        root,
        lease,
        journal,
      )).toBe(true);
      journal.cleanupAttempt(admission.operation);
    });
  });

  test("durable intent/result no-replace；same binding replay，drift conflict", async () => {
    await withJournal((journal) => {
      const binding = projectBinding();
      const admission = journal.admit(binding);
      expect(admission.status).toBe("admitted");
      if (admission.status !== "admitted") return;
      expect(journal.readIntent(binding.operationId)).toEqual(binding);
      const result = journal.finalizeSuccess(admission.operation);
      expect(result).toMatchObject({
        variant: "success",
        publishedIdentity: `project-revision:sha256:${"a".repeat(64)}`,
      });
      journal.cleanupAttempt(admission.operation);

      const replay = journal.admit(binding);
      expect(replay).toEqual({ status: "replay", result });
      expect(() => journal.admit(projectBinding("op:save-1", `project-revision:sha256:${"b".repeat(64)}`)))
        .toThrow("OPERATION_BINDING_CONFLICT");
    });
  });

  test("aborted-before-publish 是 durable terminal，cleanup 不删除 receipts", async () => {
    await withJournal((journal) => {
      const binding = projectBinding("op:abort-1");
      const admission = journal.admit(binding);
      if (admission.status !== "admitted") throw new Error("unexpected replay");
      const result = journal.finalizeAborted(
        admission.operation,
        "PROJECT_REVISION_CONFLICT",
      );
      journal.cleanupAttempt(admission.operation);
      expect(journal.admit(binding)).toEqual({ status: "replay", result });
    });
  });

  test("未 terminal 的已发布 intent 不能由普通 replay 继续执行", async () => {
    await withJournal((journal) => {
      const binding = projectBinding("op:crashed-1");
      const first = journal.admit(binding);
      expect(first.status).toBe("admitted");
      const recovered = journal.admit(binding);
      expect(recovered.status).toBe("admitted");
      if (recovered.status === "admitted") {
        expect(recovered.operation.attemptPath).toBe("");
        expect(() => journal.finalizeSuccess(recovered.operation)).toThrow(
          "OPERATION_RECOVERY_REQUIRED",
        );
      }
    });
  });

  test("receipts enumerator只跳过exact real 0700 generations directory", async () => {
    await withJournal((journal, _root, _lease, rootPath) => {
      const generations = join(rootPath, "receipts", "generations");
      mkdirSync(generations, { mode: 0o700 });
      expect(journal.listBindings()).toEqual([]);

      rmSync(generations, { recursive: true });
      writeFileSync(generations, "not-a-directory", { mode: 0o600 });
      expect(() => journal.listBindings()).toThrow("OPERATION_RECOVERY_REQUIRED");
      rmSync(generations);

      const outside = join(rootPath, "outside-generations");
      mkdirSync(outside, { mode: 0o700 });
      symlinkSync(outside, generations);
      expect(() => journal.listBindings()).toThrow("OPERATION_RECOVERY_REQUIRED");
    });
  });

  test("receipts enumerator在第2049项incremental fail closed", async () => {
    await withJournal((journal, _root, _lease, rootPath) => {
      const receipts = join(rootPath, "receipts");
      for (let index = 0; index < 2049; index += 1) {
        writeFileSync(
          join(receipts, `unknown-${index.toString().padStart(4, "0")}`),
          "",
          { mode: 0o600 },
        );
      }
      expect(() => journal.listBindings()).toThrow("OPERATION_RECOVERY_REQUIRED");
    });
  });

  test("generated-set internal receipt 被 exact 验证且不暴露为 public binding", async () => {
    await withJournal((journal, _root, _lease, rootPath) => {
      const pending = generatedSetBinding(`generation:sha256:${"1".repeat(64)}`);
      writeNewSyncedFile(
        join(rootPath, dataRootReceiptIntentPath(pending.operationId)),
        canonicalJsonBytes(pending),
      );
      const success = generatedSetBinding(`generation:sha256:${"2".repeat(64)}`);
      writeNewSyncedFile(
        join(rootPath, dataRootReceiptIntentPath(success.operationId)),
        canonicalJsonBytes(success),
      );
      writeNewSyncedFile(
        join(rootPath, dataRootReceiptResultPath(success.operationId)),
        canonicalJsonBytes(generatedSetResult(success, "success")),
      );
      const aborted = generatedSetBinding(`generation:sha256:${"3".repeat(64)}`);
      writeNewSyncedFile(
        join(rootPath, dataRootReceiptIntentPath(aborted.operationId)),
        canonicalJsonBytes(aborted),
      );
      writeNewSyncedFile(
        join(rootPath, dataRootReceiptResultPath(aborted.operationId)),
        canonicalJsonBytes(generatedSetResult(aborted, "aborted-before-publish")),
      );
      expect(journal.listBindings()).toEqual([]);
    });
  });

  test("generated-set result without intent fail closed", async () => {
    await withJournal((journal, _root, _lease, rootPath) => {
      const resultWithoutIntent = generatedSetBinding(
        `generation:sha256:${"1".repeat(64)}`,
      );
      writeNewSyncedFile(
        join(rootPath, dataRootReceiptResultPath(resultWithoutIntent.operationId)),
        canonicalJsonBytes(generatedSetResult(resultWithoutIntent, "success")),
      );
      expect(() => journal.listBindings()).toThrow("OPERATION_RECOVERY_REQUIRED");
    });
  });

  test("generated-set binding/result drift fail closed", async () => {
    await withJournal((journal, _root, _lease, rootPath) => {
      const drift = generatedSetBinding(`generation:sha256:${"2".repeat(64)}`);
      writeNewSyncedFile(
        join(rootPath, dataRootReceiptIntentPath(drift.operationId)),
        canonicalJsonBytes(drift),
      );
      const driftedResult = generatedSetResult(drift, "success");
      driftedResult.bindingDigest = "f".repeat(64);
      writeNewSyncedFile(
        join(rootPath, dataRootReceiptResultPath(drift.operationId)),
        canonicalJsonBytes(driftedResult),
      );
      expect(() => journal.listBindings()).toThrow("GENERATION_RECOVERY_REQUIRED");
    });
  });

  test("generated-set intent 未知字段 fail closed", async () => {
    await withJournal((journal, _root, _lease, rootPath) => {
      const unknownKey = generatedSetBinding(`generation:sha256:${"3".repeat(64)}`);
      writeNewSyncedFile(
        join(rootPath, dataRootReceiptIntentPath(unknownKey.operationId)),
        canonicalJsonBytes({ ...unknownKey, extra: "x" }),
      );
      expect(() => journal.listBindings()).toThrow("OPERATION_RECOVERY_REQUIRED");
    });
  });

  test("generated-set intent 非 canonical bytes fail closed", async () => {
    await withJournal((journal, _root, _lease, rootPath) => {
      const malformed = generatedSetBinding(`generation:sha256:${"4".repeat(64)}`);
      writeNewSyncedFile(
        join(rootPath, dataRootReceiptIntentPath(malformed.operationId)),
        new TextEncoder().encode('{"schemaVersion": 1}'),
      );
      expect(() => journal.listBindings()).toThrow("OPERATION_RECOVERY_REQUIRED");
    });
  });

  test("generated-set binding 在错误文件名下 fail closed", async () => {
    await withJournal((journal, _root, _lease, rootPath) => {
      const wrongName = generatedSetBinding(`generation:sha256:${"5".repeat(64)}`);
      writeNewSyncedFile(
        join(rootPath, dataRootReceiptIntentPath("op:wrong-filename-1")),
        canonicalJsonBytes(wrongName),
      );
      expect(() => journal.listBindings()).toThrow("OPERATION_RECOVERY_REQUIRED");
    });
  });

  test("package-root mutation/authority 入口拒绝 generated-set binding 且零磁盘改动", async () => {
    await withJournal(async (journal, _root, _lease, rootPath) => {
      const binding = generatedSetBinding();
      const structural = JSON.parse(JSON.stringify(binding)) as never;
      const receiptIntent = join(
        rootPath,
        dataRootReceiptIntentPath(binding.operationId),
      );
      writeNewSyncedFile(receiptIntent, canonicalJsonBytes(binding));
      const receiptResult = join(
        rootPath,
        dataRootReceiptResultPath(binding.operationId),
      );
      writeNewSyncedFile(
        receiptResult,
        canonicalJsonBytes(generatedSetResult(binding, "success")),
      );
      for (const input of [binding as never, structural]) {
        const receiptsBefore = readdirSync(join(rootPath, "receipts")).sort();
        const stagingBefore = readdirSync(join(rootPath, "staging")).sort();
        expect(() => journal.admit(input)).toThrow("OPERATION_RECOVERY_REQUIRED");
        expect(() => journal.beginRecovery(input)).toThrow(
          "OPERATION_RECOVERY_REQUIRED",
        );
        expect(() => journal.inspectExistingAttempts(input)).toThrow(
          "OPERATION_RECOVERY_REQUIRED",
        );
        expect(() => journal.confirmExistingTerminal(input)).toThrow(
          "OPERATION_RECOVERY_REQUIRED",
        );
        expect(readdirSync(join(rootPath, "receipts")).sort()).toEqual(
          receiptsBefore,
        );
        expect(readdirSync(join(rootPath, "staging")).sort()).toEqual(
          stagingBefore,
        );
      }
      expect(() => journal.readIntent(binding.operationId)).toThrow(
        "OPERATION_RECOVERY_REQUIRED",
      );
      expect(() => journal.readResult(binding.operationId, binding as never)).toThrow(
        "OPERATION_RECOVERY_REQUIRED",
      );
      const forged = {
        binding: binding as never,
        bindingDigest: "0".repeat(64),
        attemptPath: "",
        attemptToken: "",
        intentPath: receiptIntent,
      } as never;
      expect(() => journal.finalizeSuccess(forged)).toThrow(
        "OPERATION_RECOVERY_REQUIRED",
      );
      expect(() => journal.finalizeAborted(forged, "SOME_CODE")).toThrow(
        "OPERATION_RECOVERY_REQUIRED",
      );
      expect(() => journal.cleanupAttempt(forged)).toThrow(
        "OPERATION_RECOVERY_REQUIRED",
      );
      const singleFlight = new OperationSingleFlight();
      await expect(
        singleFlight.run(binding as never, undefined, async () => "wrong"),
      ).rejects.toMatchObject({ code: "OPERATION_RECOVERY_REQUIRED" });
    });
  });
});

describe("OperationSingleFlight", () => {
  test("same binding follower 共享 leader；drift/abort 不取消 leader", async () => {
    const singleFlight = new OperationSingleFlight();
    const binding = projectBinding("op:flight-1");
    let release!: () => void;
    let calls = 0;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const leader = singleFlight.run(binding, undefined, async () => {
      calls += 1;
      await gate;
      return "done";
    });
    const follower = singleFlight.run(binding, undefined, async () => "wrong");
    await expect(
      singleFlight.run(projectBinding("op:flight-1", `project-revision:sha256:${"b".repeat(64)}`), undefined, async () => "wrong"),
    ).rejects.toMatchObject({ code: "OPERATION_BINDING_CONFLICT" });
    const abort = new AbortController();
    const abortedFollower = singleFlight.run(binding, abort.signal, async () => "wrong");
    abort.abort();
    await expect(abortedFollower).rejects.toMatchObject({ code: "REQUEST_ABORTED" });
    release();
    expect(await leader).toBe("done");
    expect(await follower).toBe("done");
    expect(calls).toBe(1);
  });
});
