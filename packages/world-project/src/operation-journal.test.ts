import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { canonicalJsonBytes } from "@demiurges/world";

import {
  bootstrapDataRoot,
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
