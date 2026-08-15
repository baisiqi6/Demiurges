import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  symlinkSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import {
  MARBLE_HUNYUAN_REGISTRY,
  type ManifestAssetEntry,
} from "@demiurges/world";

import {
  ARTIFACT_STORE_TEST_SEAMS,
  cleanupRecoveredArtifactAttemptCandidates,
  cleanupArtifactAttemptCandidates,
  initializeArtifactStore,
  inspectRegisteredArtifactDestination,
  publishRegisteredArtifactForAdmittedOperation,
  readRegisteredArtifact,
  validateRegisteredProjectArtifactBytes,
} from "./artifact-store";
import {
  DATA_ROOT_LAYOUT,
  bootstrapDataRoot,
  dataRootArtifactPath,
  openDataRoot,
  type OpenedDataRoot,
} from "./data-root";
import {
  acquireDataRootWriterLease,
  type DataRootWriterLease,
} from "./data-root-lease";
import { OperationJournal } from "./operation-journal";
import * as WorldProjectPublicApi from "./index";

interface TestAuthority {
  readonly parent: string;
  readonly path: string;
  readonly root: OpenedDataRoot;
  readonly lease: DataRootWriterLease;
}

async function makeAuthority(): Promise<TestAuthority> {
  const parent = mkdtempSync(join(tmpdir(), "dh016-artifact-store-"));
  const path = join(parent, "root");
  bootstrapDataRoot(path);
  const root = openDataRoot(path);
  const acquired = await acquireDataRootWriterLease(root);
  if (acquired.status !== "acquired") {
    root.close();
    rmSync(parent, { recursive: true, force: true });
    throw new Error("focused test 无法取得 Data Root writer lease");
  }
  return { parent, path, root, lease: acquired.lease };
}

async function cleanup(authority: TestAuthority): Promise<void> {
  await authority.lease.close().catch(() => undefined);
  authority.root.close();
  rmSync(authority.parent, { recursive: true, force: true });
}

function cacheRoot(): string {
  return process.env.DEMIURGES_DH013_TEST_CACHE_ROOT ?? resolve(
    import.meta.dir,
    "../../../../Demiurges-DH-013/.artifacts/provider-cache",
  );
}

function cachedArtifactPath(entry: ManifestAssetEntry): string {
  return join(cacheRoot(), "sha256", entry.digest);
}

const hasDh013Assets = MARBLE_HUNYUAN_REGISTRY.assets.every((entry) =>
  existsSync(cachedArtifactPath(entry)));
const testWithDh013Assets: typeof test = hasDh013Assets ? test : test.skip;

function targetPath(authority: TestAuthority, entry: ManifestAssetEntry): string {
  return join(authority.path, dataRootArtifactPath(entry.digest));
}

function publish(
  authority: TestAuthority,
  entry: ManifestAssetEntry,
  bytes: Uint8Array,
  suffix: string,
) {
  validateRegisteredProjectArtifactBytes(entry, bytes);
  const journal = new OperationJournal(authority.root, authority.lease);
  const admission = journal.admit({
    schemaVersion: 1,
    operationId: `op:artifact-${suffix}`,
    operationKind: "artifact.publish",
    target: { kind: "artifact", id: entry.assetId },
    expectedIdentity: null,
    candidateIdentity: {
      assetId: entry.assetId,
      digest: entry.digest,
      byteLength: entry.byteLength,
      format: entry.format,
      elementCount: entry.elementCount,
      sourceBounds: entry.sourceBounds,
    },
  });
  if (admission.status !== "admitted") throw new Error("test operation replay");
  return publishRegisteredArtifactForAdmittedOperation({
    root: authority.root,
    lease: authority.lease,
    journal,
    operation: admission.operation,
    entry,
    bytes,
  });
}

describe("Artifact Store authority 与 layout", () => {
  test("raw CAS primitive 不在 package root，伪造 admission 零文件系统变更", async () => {
    expect("publishRegisteredArtifactForAdmittedOperation" in WorldProjectPublicApi)
      .toBe(false);
    expect("publishRegisteredArtifact" in WorldProjectPublicApi).toBe(false);
    const authority = await makeAuthority();
    try {
      const entry = MARBLE_HUNYUAN_REGISTRY.assets[0];
      expect(() => publishRegisteredArtifactForAdmittedOperation({
        root: authority.root,
        lease: authority.lease,
        journal: {} as OperationJournal,
        operation: {
          binding: {
            schemaVersion: 1,
            operationId: "op:forged",
            operationKind: "artifact.publish",
            target: { kind: "artifact", id: entry.assetId },
            expectedIdentity: null,
            candidateIdentity: entry,
          },
          bindingDigest: "0".repeat(64),
          attemptPath: join(authority.path, "staging", "forged"),
          attemptToken: "forged",
          intentPath: join(authority.path, "receipts", "forged.intent.json"),
        },
        entry,
        bytes: new Uint8Array(),
      })).toThrow(expect.objectContaining({ code: "OPERATION_RECOVERY_REQUIRED" }));
      expect(readdirSync(authority.path)).toEqual([]);
    } finally {
      await cleanup(authority);
    }
  });

  test("另一 Data Root 的 live lease 不能使用真实 admitted operation", async () => {
    const owner = await makeAuthority();
    const foreign = await makeAuthority();
    try {
      const entry = MARBLE_HUNYUAN_REGISTRY.assets[0];
      const journal = new OperationJournal(owner.root, owner.lease);
      const admission = journal.admit({
        schemaVersion: 1,
        operationId: "op:foreign-root",
        operationKind: "artifact.publish",
        target: { kind: "artifact", id: entry.assetId },
        expectedIdentity: null,
        candidateIdentity: {
          assetId: entry.assetId,
          digest: entry.digest,
          byteLength: entry.byteLength,
          format: entry.format,
          elementCount: entry.elementCount,
          sourceBounds: entry.sourceBounds,
        },
      });
      if (admission.status !== "admitted") throw new Error("unexpected replay");
      expect(() => publishRegisteredArtifactForAdmittedOperation({
        root: foreign.root,
        lease: foreign.lease,
        journal,
        operation: admission.operation,
        entry,
        bytes: new Uint8Array(),
      })).toThrow(expect.objectContaining({ code: "OPERATION_RECOVERY_REQUIRED" }));
      expect(readdirSync(foreign.path)).toEqual([]);
    } finally {
      await cleanup(foreign);
      await cleanup(owner);
    }
  });

  test("伪造 lease 与关闭 lease 均不能创建任何 layout", async () => {
    const authority = await makeAuthority();
    try {
      const forged = {
        identity: authority.root.identity,
        leaseDigest: authority.lease.leaseDigest,
        port: authority.lease.port,
        instanceToken: authority.lease.instanceToken,
        closed: false,
        async close() {},
      } as DataRootWriterLease;
      expect(() => initializeArtifactStore(authority.root, forged)).toThrow(
        expect.objectContaining({ code: "DATA_ROOT_WRITER_LEASE_REQUIRED" }),
      );
      expect(readdirSync(authority.path)).toEqual([]);

      await authority.lease.close();
      expect(() => initializeArtifactStore(authority.root, authority.lease)).toThrow(
        expect.objectContaining({ code: "DATA_ROOT_WRITER_LEASE_REQUIRED" }),
      );
      expect(readdirSync(authority.path)).toEqual([]);
    } finally {
      await cleanup(authority);
    }
  });

  testWithDh013Assets("admitted Artifact 必须 exact 绑定完整 descriptor、target 与 live journal", async () => {
    const authority = await makeAuthority();
    try {
      const entry = MARBLE_HUNYUAN_REGISTRY.assets[0];
      const bytes = readFileSync(cachedArtifactPath(entry));
      const exactCandidate = {
        assetId: entry.assetId,
        digest: entry.digest,
        byteLength: entry.byteLength,
        format: entry.format,
        elementCount: entry.elementCount,
        sourceBounds: entry.sourceBounds,
      };
      const cases: readonly [string, unknown][] = [
        ["byte-length", { ...exactCandidate, byteLength: entry.byteLength + 1 }],
        [
          "format",
          { ...exactCandidate, format: entry.format === "spz-v2" ? "glb-2.0" : "spz-v2" },
        ],
        ["element-count", { ...exactCandidate, elementCount: entry.elementCount + 1 }],
        [
          "bounds",
          {
            ...exactCandidate,
            sourceBounds: {
              min: [entry.sourceBounds.min[0] - 0.01, ...entry.sourceBounds.min.slice(1)],
              max: entry.sourceBounds.max,
            },
          },
        ],
      ];
      for (const [suffix, candidateIdentity] of cases) {
        const journal = new OperationJournal(authority.root, authority.lease);
        const admission = journal.admit({
          schemaVersion: 1,
          operationId: `op:descriptor-${suffix}`,
          operationKind: "artifact.publish",
          target: { kind: "artifact", id: entry.assetId },
          expectedIdentity: null,
          candidateIdentity: candidateIdentity as typeof exactCandidate,
        });
        if (admission.status !== "admitted") throw new Error("unexpected replay");
        const beforeAttempt = readdirSync(admission.operation.attemptPath).sort();
        expect(() => publishRegisteredArtifactForAdmittedOperation({
          root: authority.root,
          lease: authority.lease,
          journal,
          operation: admission.operation,
          entry,
          bytes,
        })).toThrow(expect.objectContaining({ code: "OPERATION_RECOVERY_REQUIRED" }));
        expect(readdirSync(admission.operation.attemptPath).sort()).toEqual(beforeAttempt);
        expect(existsSync(targetPath(authority, entry))).toBe(false);
      }

      const targetJournal = new OperationJournal(authority.root, authority.lease);
      const receiptsBefore = readdirSync(join(authority.path, DATA_ROOT_LAYOUT.receipts)).sort();
      const stagingBefore = readdirSync(join(authority.path, DATA_ROOT_LAYOUT.staging)).sort();
      expect(() => targetJournal.admit({
        schemaVersion: 1,
        operationId: "op:descriptor-target",
        operationKind: "artifact.publish",
        target: { kind: "artifact", id: "asset:wrong-target" },
        expectedIdentity: null,
        candidateIdentity: exactCandidate,
      })).toThrow(expect.objectContaining({ code: "OPERATION_RECOVERY_REQUIRED" }));
      expect(readdirSync(join(authority.path, DATA_ROOT_LAYOUT.receipts)).sort()).toEqual(
        receiptsBefore,
      );
      expect(readdirSync(join(authority.path, DATA_ROOT_LAYOUT.staging)).sort()).toEqual(
        stagingBefore,
      );
      expect(existsSync(targetPath(authority, entry))).toBe(false);

      const owner = new OperationJournal(authority.root, authority.lease);
      const admission = owner.admit({
        schemaVersion: 1,
        operationId: "op:foreign-journal",
        operationKind: "artifact.publish",
        target: { kind: "artifact", id: entry.assetId },
        expectedIdentity: null,
        candidateIdentity: exactCandidate,
      });
      if (admission.status !== "admitted") throw new Error("unexpected replay");
      const foreign = new OperationJournal(authority.root, authority.lease);
      expect(() => publishRegisteredArtifactForAdmittedOperation({
        root: authority.root,
        lease: authority.lease,
        journal: foreign,
        operation: admission.operation,
        entry,
        bytes,
      })).toThrow(expect.objectContaining({ code: "OPERATION_RECOVERY_REQUIRED" }));
      owner.finalizeAborted(admission.operation, "TEST_ABORTED");
      expect(() => publishRegisteredArtifactForAdmittedOperation({
        root: authority.root,
        lease: authority.lease,
        journal: owner,
        operation: admission.operation,
        entry,
        bytes,
      })).toThrow(expect.objectContaining({ code: "OPERATION_RECOVERY_REQUIRED" }));
      expect(existsSync(targetPath(authority, entry))).toBe(false);

      const projectJournal = new OperationJournal(authority.root, authority.lease);
      const projectAdmission = projectJournal.admit({
        schemaVersion: 1,
        operationId: "op:project-capability",
        operationKind: "project.save-as",
        target: { kind: "project", id: "project:not-an-artifact-operation" },
        expectedIdentity: null,
        candidateIdentity: {
          projectRevision: `project-revision:sha256:${"d".repeat(64)}`,
        },
      });
      if (projectAdmission.status !== "admitted") throw new Error("unexpected replay");
      expect(() => publishRegisteredArtifactForAdmittedOperation({
        root: authority.root,
        lease: authority.lease,
        journal: projectJournal,
        operation: projectAdmission.operation,
        entry,
        bytes,
      })).toThrow(expect.objectContaining({ code: "OPERATION_RECOVERY_REQUIRED" }));
      expect(existsSync(targetPath(authority, entry))).toBe(false);
    } finally {
      await cleanup(authority);
    }
  });

  testWithDh013Assets("existing terminal retry可重验并清理exact Artifact candidate attempt", async () => {
    const authority = await makeAuthority();
    try {
      const entry = MARBLE_HUNYUAN_REGISTRY.assets[0];
      const journal = new OperationJournal(authority.root, authority.lease);
      const admission = journal.admit({
        schemaVersion: 1,
        operationId: "op:artifact-terminal-retry",
        operationKind: "artifact.publish",
        target: { kind: "artifact", id: entry.assetId },
        expectedIdentity: null,
        candidateIdentity: {
          assetId: entry.assetId,
          digest: entry.digest,
          byteLength: entry.byteLength,
          format: entry.format,
          elementCount: entry.elementCount,
          sourceBounds: entry.sourceBounds,
        },
      });
      if (admission.status !== "admitted") throw new Error("unexpected replay");
      publishRegisteredArtifactForAdmittedOperation({
        root: authority.root,
        lease: authority.lease,
        journal,
        operation: admission.operation,
        entry,
        bytes: readFileSync(cachedArtifactPath(entry)),
      });
      journal.finalizeSuccess(admission.operation);
      expect(existsSync(admission.operation.attemptPath)).toBe(true);

      const confirmed = journal.confirmExistingTerminal(admission.operation.binding);
      expect(confirmed.attempts).toHaveLength(1);
      cleanupRecoveredArtifactAttemptCandidates(
        authority.root,
        authority.lease,
        journal,
        confirmed.attempts[0]!,
        [entry],
      );
      journal.cleanupAttempt(confirmed.attempts[0]!);
      expect(existsSync(admission.operation.attemptPath)).toBe(false);
    } finally {
      await cleanup(authority);
    }
  });

  testWithDh013Assets("terminal cleanup 只删除本 operation 创建的 exact candidate inode", async () => {
    const authority = await makeAuthority();
    try {
      const entry = MARBLE_HUNYUAN_REGISTRY.assets[0];
      const bytes = readFileSync(cachedArtifactPath(entry));
      const journal = new OperationJournal(authority.root, authority.lease);
      const admission = journal.admit({
        schemaVersion: 1,
        operationId: "op:candidate-cleanup-identity",
        operationKind: "artifact.publish",
        target: { kind: "artifact", id: entry.assetId },
        expectedIdentity: null,
        candidateIdentity: {
          assetId: entry.assetId,
          digest: entry.digest,
          byteLength: entry.byteLength,
          format: entry.format,
          elementCount: entry.elementCount,
          sourceBounds: entry.sourceBounds,
        },
      });
      if (admission.status !== "admitted") throw new Error("unexpected replay");
      publishRegisteredArtifactForAdmittedOperation({
        root: authority.root,
        lease: authority.lease,
        journal,
        operation: admission.operation,
        entry,
        bytes,
      });
      const candidatePath = join(
        admission.operation.attemptPath,
        `artifact-${entry.digest}.candidate`,
      );
      rmSync(candidatePath);
      writeFileSync(candidatePath, bytes, { mode: 0o600 });
      journal.finalizeSuccess(admission.operation);
      expect(() => cleanupArtifactAttemptCandidates(
        authority.root,
        authority.lease,
        journal,
        admission.operation,
        [entry],
      )).toThrow(expect.objectContaining({ code: "OPERATION_RECOVERY_REQUIRED" }));
      expect(existsSync(candidatePath)).toBe(true);
    } finally {
      await cleanup(authority);
    }
  });

  test("匹配 live root/lease 幂等建立固定 0700 layout", async () => {
    const authority = await makeAuthority();
    try {
      initializeArtifactStore(authority.root, authority.lease);
      initializeArtifactStore(authority.root, authority.lease);
      expect(readdirSync(authority.path).sort()).toEqual([
        "artifacts",
        "projects",
        "receipts",
        "staging",
      ]);
      for (const relative of [
        DATA_ROOT_LAYOUT.artifacts,
        DATA_ROOT_LAYOUT.artifactDigestDir,
        DATA_ROOT_LAYOUT.projects,
        DATA_ROOT_LAYOUT.receipts,
        DATA_ROOT_LAYOUT.staging,
      ]) {
        const stat = statSync(join(authority.path, relative));
        expect(stat.isDirectory()).toBe(true);
        expect(stat.mode & 0o777).toBe(0o700);
      }
    } finally {
      await cleanup(authority);
    }
  });

  test("layout 中的 symlink 或 wrong type fail closed 且不覆盖", async () => {
    const authority = await makeAuthority();
    try {
      const outside = join(authority.parent, "outside");
      mkdirSync(outside, { mode: 0o700 });
      const artifacts = join(authority.path, DATA_ROOT_LAYOUT.artifacts);
      symlinkSync(outside, artifacts);
      expect(() => initializeArtifactStore(authority.root, authority.lease)).toThrow(
        expect.objectContaining({ code: "OPERATION_RECOVERY_REQUIRED" }),
      );
      expect(lstatSync(artifacts).isSymbolicLink()).toBe(true);
      expect(readdirSync(outside)).toEqual([]);
    } finally {
      await cleanup(authority);
    }
  });

  test("未登记 entry 或错误 bytes 在 layout mutation 前拒绝", async () => {
    const authority = await makeAuthority();
    try {
      const entry = MARBLE_HUNYUAN_REGISTRY.assets[0];
      expect(() => publish(authority, entry, new Uint8Array([1, 2, 3]), "badbytes")).toThrow(
        expect.objectContaining({ code: "ARTIFACT_IDENTITY_MISMATCH" }),
      );
      expect(readdirSync(authority.path)).toEqual([]);

      const forged = { ...entry, digest: "0".repeat(64) } as ManifestAssetEntry;
      expect(() => publish(authority, forged, new Uint8Array(), "forged")).toThrow(
        expect.objectContaining({ code: "ARTIFACT_NOT_REGISTERED" }),
      );
      expect(readdirSync(authority.path)).toEqual([]);
    } finally {
      await cleanup(authority);
    }
  });
});

describe("Artifact Store immutable CAS", () => {
  testWithDh013Assets("reader拒绝artifacts layout中间symlink逃逸", async () => {
    const authority = await makeAuthority();
    try {
      initializeArtifactStore(authority.root, authority.lease);
      const entry = MARBLE_HUNYUAN_REGISTRY.assets[0]!;
      const outsideArtifacts = join(authority.parent, "outside-artifacts");
      const outsideDigests = join(outsideArtifacts, "sha256");
      mkdirSync(outsideDigests, { mode: 0o700, recursive: true });
      writeFileSync(
        join(outsideDigests, entry.digest),
        readFileSync(cachedArtifactPath(entry)),
        { mode: 0o600 },
      );
      const artifactsPath = join(authority.path, DATA_ROOT_LAYOUT.artifacts);
      rmSync(artifactsPath, { recursive: true });
      symlinkSync(outsideArtifacts, artifactsPath);
      expect(() => readRegisteredArtifact(authority.root, entry)).toThrow(
        expect.objectContaining({ code: "OPERATION_RECOVERY_REQUIRED" }),
      );
      expect(inspectRegisteredArtifactDestination(authority.root, entry))
        .toEqual({ status: "recovery-required" });
    } finally {
      await cleanup(authority);
    }
  });

  testWithDh013Assets("三项 DH-013 SPZ/GLB 均可原子发布并 exact replay", async () => {
    const authority = await makeAuthority();
    try {
      for (const [index, entry] of MARBLE_HUNYUAN_REGISTRY.assets.entries()) {
        const bytes = readFileSync(cachedArtifactPath(entry));
        const first = publish(authority, entry, bytes, `first${index}`);
        expect(first).toMatchObject({
          status: "published",
          artifact: {
            assetId: entry.assetId,
            digest: entry.digest,
            byteLength: entry.byteLength,
            format: entry.format,
            elementCount: entry.elementCount,
          },
        });
        const target = targetPath(authority, entry);
        const targetStat = statSync(target);
        expect(targetStat.isFile()).toBe(true);
        expect(targetStat.mode & 0o777).toBe(0o600);
        expect(targetStat.nlink).toBeGreaterThanOrEqual(2);
        expect(targetStat.size).toBe(entry.byteLength);
        expect(createHash("sha256").update(readFileSync(target)).digest("hex")).toBe(entry.digest);

        const replay = publish(authority, entry, bytes, `replay${index}`);
        expect(replay.status).toBe("already-present");
        expect(replay.artifact).toEqual(first.artifact);
      }
    } finally {
      await cleanup(authority);
    }
  });

  testWithDh013Assets("EEXIST symlink/wrong-type/corrupt target 全部保留原物并 stable conflict", async () => {
    const entry = MARBLE_HUNYUAN_REGISTRY.assets[0];
    const bytes = readFileSync(cachedArtifactPath(entry));

    const symlinkAuthority = await makeAuthority();
    try {
      initializeArtifactStore(symlinkAuthority.root, symlinkAuthority.lease);
      const target = targetPath(symlinkAuthority, entry);
      symlinkSync(cachedArtifactPath(entry), target);
      expect(() => publish(symlinkAuthority, entry, bytes, "symlink")).toThrow(
        expect.objectContaining({ code: "ARTIFACT_DESTINATION_CONFLICT" }),
      );
      expect(lstatSync(target).isSymbolicLink()).toBe(true);
    } finally {
      await cleanup(symlinkAuthority);
    }

    const corruptAuthority = await makeAuthority();
    try {
      initializeArtifactStore(corruptAuthority.root, corruptAuthority.lease);
      const target = targetPath(corruptAuthority, entry);
      writeFileSync(target, "corrupt", { mode: 0o600, flag: "wx" });
      expect(() => publish(corruptAuthority, entry, bytes, "corrupt")).toThrow(
        expect.objectContaining({ code: "ARTIFACT_DESTINATION_CONFLICT" }),
      );
      expect(readFileSync(target, "utf8")).toBe("corrupt");
    } finally {
      await cleanup(corruptAuthority);
    }

    const directoryAuthority = await makeAuthority();
    try {
      initializeArtifactStore(directoryAuthority.root, directoryAuthority.lease);
      const target = targetPath(directoryAuthority, entry);
      mkdirSync(target, { mode: 0o700 });
      expect(() => publish(directoryAuthority, entry, bytes, "directory")).toThrow(
        expect.objectContaining({ code: "ARTIFACT_DESTINATION_CONFLICT" }),
      );
      expect(statSync(target).isDirectory()).toBe(true);
    } finally {
      await cleanup(directoryAuthority);
    }
  });

  testWithDh013Assets("opened destination identity 在读取期间漂移时要求 recovery", async () => {
    const authority = await makeAuthority();
    try {
      const entry = MARBLE_HUNYUAN_REGISTRY.assets[0];
      const bytes = readFileSync(cachedArtifactPath(entry));
      publish(authority, entry, bytes, "driftseed");
      const target = targetPath(authority, entry);
      expect(() => ARTIFACT_STORE_TEST_SEAMS.requireExactDestination(
        authority.root,
        authority.lease,
        entry,
        target,
        () => {
          const changed = new Date(Date.now() + 2_000);
          utimesSync(target, changed, changed);
        },
      )).toThrow(expect.objectContaining({ code: "OPERATION_RECOVERY_REQUIRED" }));
    } finally {
      await cleanup(authority);
    }
  });

  testWithDh013Assets("lease 关闭后 publish 不创建新 attempt 或覆盖 CAS", async () => {
    const authority = await makeAuthority();
    try {
      initializeArtifactStore(authority.root, authority.lease);
      const entry = MARBLE_HUNYUAN_REGISTRY.assets[0];
      const bytes = readFileSync(cachedArtifactPath(entry));
      await authority.lease.close();
      expect(() => publish(authority, entry, bytes, "closedlease")).toThrow();
      expect(readdirSync(join(authority.path, DATA_ROOT_LAYOUT.staging))).toEqual([]);
      expect(readdirSync(join(authority.path, DATA_ROOT_LAYOUT.artifactDigestDir))).toEqual([]);
    } finally {
      await cleanup(authority);
    }
  });
});
