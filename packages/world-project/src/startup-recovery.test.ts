import { describe, expect, test } from "bun:test";
import { existsSync, linkSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import {
  MARBLE_HUNYUAN_REGISTRY,
  RuntimeMvpHost,
  canonicalJsonBytes,
  createInitialSnapshot,
} from "@demiurges/world";

import { ArtifactStoreReader } from "./artifact-store";
import {
  bootstrapDataRoot,
  dataRootProjectPath,
  dataRootReceiptIntentPath,
  dataRootReceiptResultPath,
  openDataRoot,
} from "./data-root";
import { acquireDataRootWriterLease } from "./data-root-lease";
import {
  OPERATION_JOURNAL_TEST_SEAMS,
  OperationJournal,
  artifactCandidateSetDigest,
  operationBindingDigest,
  type OperationBinding,
} from "./operation-journal";
import {
  publishProjectDirectoryMarker,
  publishStagedProjectDirectoryCandidate,
  stageProjectDirectoryCandidate,
} from "./project-directory-marker";
import { WorldProjectWriter, createWorldProjectManifest } from "./project-store";
import {
  SAFE_FILESYSTEM_TEST_SEAMS,
  readStableDirectoryIdentity,
  syncDirectory,
  writeNewSyncedFile,
} from "./safe-filesystem";
import {
  STARTUP_RECOVERY_TEST_SEAMS,
  recoverPendingOperations,
} from "./startup-recovery";

describe("startup recovery", () => {
  for (const operationKind of ["project.save-as", "bundle.import"] as const) {
    test(`pending ${operationKind} 在directory evidence创建前fail closed并保留intent`, async () => {
      const parent = mkdtempSync(join(tmpdir(), "dh016-recovery-no-directory-evidence-"));
      const rootPath = join(parent, "root");
      bootstrapDataRoot(rootPath);
      const root = openDataRoot(rootPath);
      const leaseResult = await acquireDataRootWriterLease(root);
      if (leaseResult.status !== "acquired") throw new Error("lease unavailable");
      try {
        const operationSlug = operationKind === "project.save-as" ? "save-as" : "bundle-import";
        const projectId = `project:no-directory-evidence-${operationSlug}`;
        const operationId = `op:no-directory-evidence-${operationKind}`;
        const journal = new OperationJournal(root, leaseResult.lease);
        const admission = journal.admit({
          schemaVersion: 1,
          operationId,
          operationKind,
          target: { kind: "project", id: projectId },
          expectedIdentity: null,
          candidateIdentity: operationKind === "bundle.import"
            ? {
                projectRevision: `project-revision:sha256:${"0".repeat(64)}`,
                candidateArtifacts: [],
                artifactSetDigest: artifactCandidateSetDigest([]),
              }
            : { projectRevision: `project-revision:sha256:${"0".repeat(64)}` },
        });
        if (admission.status !== "admitted") throw new Error("unexpected replay");

        const reader = new WorldProjectWriter(
          root,
          leaseResult.lease,
          new ArtifactStoreReader(root),
        ).reader();
        expect(() => recoverPendingOperations(root, leaseResult.lease, reader))
          .toThrow("OPERATION_RECOVERY_REQUIRED");
        expect(existsSync(join(rootPath, dataRootReceiptResultPath(operationId))))
          .toBe(false);
        expect(existsSync(join(rootPath, dataRootReceiptIntentPath(operationId))))
          .toBe(true);
        expect(existsSync(admission.operation.attemptPath)).toBe(true);
        expect(existsSync(join(rootPath, dataRootProjectPath(projectId)))).toBe(false);
      } finally {
        await leaseResult.lease.close();
        root.close();
        rmSync(parent, { recursive: true, force: true });
      }
    });
  }

  test("pending Save As 的final marker存在但staged marker丢失时零partial terminalization", async () => {
    const parent = mkdtempSync(join(tmpdir(), "dh016-recovery-staged-marker-missing-"));
    const rootPath = join(parent, "root");
    bootstrapDataRoot(rootPath);
    const root = openDataRoot(rootPath);
    const leaseResult = await acquireDataRootWriterLease(root);
    if (leaseResult.status !== "acquired") throw new Error("lease unavailable");
    try {
      const projectId = "project:staged-marker-missing";
      const operationId = "op:staged-marker-missing";
      const journal = new OperationJournal(root, leaseResult.lease);
      const admission = journal.admit({
        schemaVersion: 1,
        operationId,
        operationKind: "project.save-as",
        target: { kind: "project", id: projectId },
        expectedIdentity: null,
        candidateIdentity: { projectRevision: `project-revision:sha256:${"9".repeat(64)}` },
      });
      if (admission.status !== "admitted") throw new Error("unexpected replay");
      const candidate = stageProjectDirectoryCandidate(admission.operation);
      const projectPath = join(rootPath, dataRootProjectPath(projectId));
      publishStagedProjectDirectoryCandidate(
        admission.operation,
        candidate,
        projectPath,
        join(rootPath, "projects"),
      );
      unlinkSync(join(admission.operation.attemptPath, "project-directory.json"));
      syncDirectory(admission.operation.attemptPath);

      const reader = new WorldProjectWriter(
        root,
        leaseResult.lease,
        new ArtifactStoreReader(root),
      ).reader();
      expect(() => recoverPendingOperations(root, leaseResult.lease, reader))
        .toThrow("OPERATION_RECOVERY_REQUIRED");
      expect(existsSync(join(rootPath, dataRootReceiptResultPath(operationId))))
        .toBe(false);
      expect(existsSync(join(projectPath, ".created-directory.json"))).toBe(true);
      expect(existsSync(admission.operation.attemptPath)).toBe(true);
    } finally {
      await leaseResult.lease.close();
      root.close();
      rmSync(parent, { recursive: true, force: true });
    }
  });

  test("本轮terminalized pending仍以startup时的strict marker provenance重验", async () => {
    const parent = mkdtempSync(join(tmpdir(), "dh016-recovery-phase-b-marker-loss-"));
    const rootPath = join(parent, "root");
    bootstrapDataRoot(rootPath);
    const root = openDataRoot(rootPath);
    const leaseResult = await acquireDataRootWriterLease(root);
    if (leaseResult.status !== "acquired") throw new Error("lease unavailable");
    try {
      const projectId = "project:phase-b-marker-loss";
      const operationId = "op:phase-b-marker-loss";
      const journal = new OperationJournal(root, leaseResult.lease);
      const admission = journal.admit({
        schemaVersion: 1,
        operationId,
        operationKind: "project.save-as",
        target: { kind: "project", id: projectId },
        expectedIdentity: null,
        candidateIdentity: { projectRevision: `project-revision:sha256:${"6".repeat(64)}` },
      });
      if (admission.status !== "admitted") throw new Error("unexpected replay");
      const candidate = stageProjectDirectoryCandidate(admission.operation);
      const projectPath = join(rootPath, dataRootProjectPath(projectId));
      publishStagedProjectDirectoryCandidate(
        admission.operation,
        candidate,
        projectPath,
        join(rootPath, "projects"),
      );

      let markerRemoved = false;
      const restoreSync = OPERATION_JOURNAL_TEST_SEAMS.replaceReceiptsDirectorySync(
        (receiptsPath) => {
          if (!markerRemoved) {
            unlinkSync(join(projectPath, ".created-directory.json"));
            syncDirectory(projectPath);
            markerRemoved = true;
          }
          syncDirectory(receiptsPath);
        },
      );
      try {
        const reader = new WorldProjectWriter(
          root,
          leaseResult.lease,
          new ArtifactStoreReader(root),
        ).reader();
        expect(() => recoverPendingOperations(root, leaseResult.lease, reader))
          .toThrow("OPERATION_RECOVERY_REQUIRED");
      } finally {
        restoreSync();
      }
      expect(markerRemoved).toBe(true);
      expect(existsSync(join(rootPath, dataRootReceiptResultPath(operationId)))).toBe(true);
      expect(existsSync(projectPath)).toBe(true);
      expect(existsSync(admission.operation.attemptPath)).toBe(true);
    } finally {
      await leaseResult.lease.close();
      root.close();
      rmSync(parent, { recursive: true, force: true });
    }
  });

  test("Phase A存在的exact lock在本轮terminalization后丢失必须保留Project evidence", async () => {
    const parent = mkdtempSync(join(tmpdir(), "dh016-recovery-phase-b-lock-loss-"));
    const rootPath = join(parent, "root");
    bootstrapDataRoot(rootPath);
    const root = openDataRoot(rootPath);
    const leaseResult = await acquireDataRootWriterLease(root);
    if (leaseResult.status !== "acquired") throw new Error("lease unavailable");
    try {
      const projectId = "project:phase-b-lock-loss";
      const operationId = "op:phase-b-lock-loss";
      const journal = new OperationJournal(root, leaseResult.lease);
      const admission = journal.admit({
        schemaVersion: 1,
        operationId,
        operationKind: "project.save-as",
        target: { kind: "project", id: projectId },
        expectedIdentity: null,
        candidateIdentity: { projectRevision: `project-revision:sha256:${"5".repeat(64)}` },
      });
      if (admission.status !== "admitted") throw new Error("unexpected replay");
      const candidate = stageProjectDirectoryCandidate(admission.operation);
      const projectPath = join(rootPath, dataRootProjectPath(projectId));
      publishStagedProjectDirectoryCandidate(
        admission.operation,
        candidate,
        projectPath,
        join(rootPath, "projects"),
      );
      const lockPath = join(projectPath, ".write-lock");
      linkSync(admission.operation.intentPath, lockPath);
      syncDirectory(projectPath);

      let lockRemoved = false;
      const restoreSync = OPERATION_JOURNAL_TEST_SEAMS.replaceReceiptsDirectorySync(
        (receiptsPath) => {
          if (!lockRemoved) {
            unlinkSync(lockPath);
            syncDirectory(projectPath);
            lockRemoved = true;
          }
          syncDirectory(receiptsPath);
        },
      );
      try {
        const reader = new WorldProjectWriter(
          root,
          leaseResult.lease,
          new ArtifactStoreReader(root),
        ).reader();
        expect(() => recoverPendingOperations(root, leaseResult.lease, reader))
          .toThrow("OPERATION_RECOVERY_REQUIRED");
      } finally {
        restoreSync();
      }
      expect(lockRemoved).toBe(true);
      expect(existsSync(join(rootPath, dataRootReceiptResultPath(operationId)))).toBe(true);
      expect(existsSync(join(projectPath, ".created-directory.json"))).toBe(true);
      expect(existsSync(projectPath)).toBe(true);
      expect(existsSync(admission.operation.attemptPath)).toBe(true);
    } finally {
      await leaseResult.lease.close();
      root.close();
      rmSync(parent, { recursive: true, force: true });
    }
  });

  test("Phase C在任何cleanup前全局拒绝Phase B后的foreign entry drift", async () => {
    const parent = mkdtempSync(join(tmpdir(), "dh016-recovery-global-phase-c-drift-"));
    const rootPath = join(parent, "root");
    bootstrapDataRoot(rootPath);
    const root = openDataRoot(rootPath);
    const leaseResult = await acquireDataRootWriterLease(root);
    if (leaseResult.status !== "acquired") throw new Error("lease unavailable");
    try {
      const journal = new OperationJournal(root, leaseResult.lease);
      const projects = ["project:phase-c-first", "project:phase-c-second"] as const;
      const evidence = projects.map((projectId, index) => {
        const admission = journal.admit({
          schemaVersion: 1,
          operationId: `op:phase-c-${index === 0 ? "first" : "second"}`,
          operationKind: "project.save-as",
          target: { kind: "project", id: projectId },
          expectedIdentity: null,
          candidateIdentity: {
            projectRevision: `project-revision:sha256:${String(index + 1).repeat(64)}`,
          },
        });
        if (admission.status !== "admitted") throw new Error("unexpected replay");
        const candidate = stageProjectDirectoryCandidate(admission.operation);
        const projectPath = join(rootPath, dataRootProjectPath(projectId));
        publishStagedProjectDirectoryCandidate(
          admission.operation,
          candidate,
          projectPath,
          join(rootPath, "projects"),
        );
        const lockPath = join(projectPath, ".write-lock");
        linkSync(admission.operation.intentPath, lockPath);
        syncDirectory(projectPath);
        return { admission, projectPath, lockPath };
      });

      let receiptSyncCount = 0;
      const foreignPath = join(evidence[1]!.projectPath, "foreign-after-phase-b");
      const restoreSync = OPERATION_JOURNAL_TEST_SEAMS.replaceReceiptsDirectorySync(
        (receiptsPath) => {
          receiptSyncCount += 1;
          if (receiptSyncCount === 2) {
            writeFileSync(foreignPath, "preserve", { mode: 0o600 });
            syncDirectory(evidence[1]!.projectPath);
          }
          syncDirectory(receiptsPath);
        },
      );
      try {
        const reader = new WorldProjectWriter(
          root,
          leaseResult.lease,
          new ArtifactStoreReader(root),
        ).reader();
        expect(() => recoverPendingOperations(root, leaseResult.lease, reader))
          .toThrow("OPERATION_RECOVERY_REQUIRED");
      } finally {
        restoreSync();
      }
      expect(receiptSyncCount).toBeGreaterThanOrEqual(2);
      expect(existsSync(foreignPath)).toBe(true);
      for (const item of evidence) {
        expect(existsSync(item.projectPath)).toBe(true);
        expect(existsSync(item.lockPath)).toBe(true);
        expect(existsSync(join(item.projectPath, ".created-directory.json"))).toBe(true);
        expect(existsSync(item.admission.operation.attemptPath)).toBe(true);
      }
    } finally {
      await leaseResult.lease.close();
      root.close();
      rmSync(parent, { recursive: true, force: true });
    }
  });

  test("cooperative single writer可完整收敛多个pending Project", async () => {
    const parent = mkdtempSync(join(tmpdir(), "dh016-recovery-cooperative-multi-"));
    const rootPath = join(parent, "root");
    bootstrapDataRoot(rootPath);
    const root = openDataRoot(rootPath);
    const leaseResult = await acquireDataRootWriterLease(root);
    if (leaseResult.status !== "acquired") throw new Error("lease unavailable");
    try {
      const journal = new OperationJournal(root, leaseResult.lease);
      const evidence = ["first", "second"].map((suffix, index) => {
        const projectId = `project:cooperative-${suffix}`;
        const operationId = `op:cooperative-${suffix}`;
        const admission = journal.admit({
          schemaVersion: 1,
          operationId,
          operationKind: "project.save-as",
          target: { kind: "project", id: projectId },
          expectedIdentity: null,
          candidateIdentity: {
            projectRevision: `project-revision:sha256:${String(index + 3).repeat(64)}`,
          },
        });
        if (admission.status !== "admitted") throw new Error("unexpected replay");
        const candidate = stageProjectDirectoryCandidate(admission.operation);
        const projectPath = join(rootPath, dataRootProjectPath(projectId));
        publishStagedProjectDirectoryCandidate(
          admission.operation,
          candidate,
          projectPath,
          join(rootPath, "projects"),
        );
        const lockPath = join(projectPath, ".write-lock");
        linkSync(admission.operation.intentPath, lockPath);
        syncDirectory(projectPath);
        return { admission, operationId, projectPath };
      });

      const reader = new WorldProjectWriter(
        root,
        leaseResult.lease,
        new ArtifactStoreReader(root),
      ).reader();
      const result = recoverPendingOperations(root, leaseResult.lease, reader);
      expect(result.recovered).toHaveLength(2);
      for (const item of evidence) {
        expect(existsSync(join(rootPath, dataRootReceiptResultPath(item.operationId))))
          .toBe(true);
        expect(existsSync(item.projectPath)).toBe(false);
        expect(existsSync(item.admission.operation.attemptPath)).toBe(false);
      }
    } finally {
      await leaseResult.lease.close();
      root.close();
      rmSync(parent, { recursive: true, force: true });
    }
  });

  test("已完成cleanup后出现out-of-band drift只停止并保留剩余evidence", async () => {
    const parent = mkdtempSync(join(tmpdir(), "dh016-recovery-cooperative-drift-"));
    const rootPath = join(parent, "root");
    bootstrapDataRoot(rootPath);
    const root = openDataRoot(rootPath);
    const leaseResult = await acquireDataRootWriterLease(root);
    if (leaseResult.status !== "acquired") throw new Error("lease unavailable");
    try {
      const journal = new OperationJournal(root, leaseResult.lease);
      const evidence = ["first", "second"].map((suffix, index) => {
        const projectId = `project:cooperative-drift-${suffix}`;
        const operationId = `op:cooperative-drift-${suffix}`;
        const admission = journal.admit({
          schemaVersion: 1,
          operationId,
          operationKind: "project.save-as",
          target: { kind: "project", id: projectId },
          expectedIdentity: null,
          candidateIdentity: {
            projectRevision: `project-revision:sha256:${String(index + 5).repeat(64)}`,
          },
        });
        if (admission.status !== "admitted") throw new Error("unexpected replay");
        const candidate = stageProjectDirectoryCandidate(admission.operation);
        const projectPath = join(rootPath, dataRootProjectPath(projectId));
        publishStagedProjectDirectoryCandidate(
          admission.operation,
          candidate,
          projectPath,
          join(rootPath, "projects"),
        );
        const lockPath = join(projectPath, ".write-lock");
        linkSync(admission.operation.intentPath, lockPath);
        syncDirectory(projectPath);
        return { admission, lockPath, operationId, projectPath };
      });
      const foreignPath = join(evidence[1]!.projectPath, "foreign-after-first-cleanup");
      let cleanupCount = 0;
      const restoreHook = STARTUP_RECOVERY_TEST_SEAMS.replaceConfirmedCleanupHook(
        () => {
          cleanupCount += 1;
          if (cleanupCount === 1) {
            writeFileSync(foreignPath, "environment-corruption", { mode: 0o600 });
            syncDirectory(evidence[1]!.projectPath);
          }
        },
      );
      try {
        const reader = new WorldProjectWriter(
          root,
          leaseResult.lease,
          new ArtifactStoreReader(root),
        ).reader();
        expect(() => recoverPendingOperations(root, leaseResult.lease, reader))
          .toThrow("OPERATION_RECOVERY_REQUIRED");
      } finally {
        restoreHook();
      }

      expect(cleanupCount).toBe(1);
      expect(existsSync(evidence[0]!.projectPath)).toBe(false);
      expect(existsSync(evidence[0]!.admission.operation.attemptPath)).toBe(false);
      expect(existsSync(evidence[1]!.projectPath)).toBe(true);
      expect(existsSync(evidence[1]!.lockPath)).toBe(true);
      expect(existsSync(join(evidence[1]!.projectPath, ".created-directory.json")))
        .toBe(true);
      expect(existsSync(evidence[1]!.admission.operation.attemptPath)).toBe(true);
      expect(readFileSync(foreignPath, "utf8")).toBe("environment-corruption");
      for (const item of evidence) {
        expect(existsSync(join(rootPath, dataRootReceiptIntentPath(item.operationId))))
          .toBe(true);
        expect(existsSync(join(rootPath, dataRootReceiptResultPath(item.operationId))))
          .toBe(true);
      }
    } finally {
      await leaseResult.lease.close();
      root.close();
      rmSync(parent, { recursive: true, force: true });
    }
  });

  test("已完成cleanup后第二项attempt drift会在Project cleanup前停止", async () => {
    for (const mutation of [
      "foreign-entry",
      "intent-new-inode",
      "attempt-new-inode",
    ] as const) {
      const parent = mkdtempSync(join(tmpdir(), `dh016-recovery-attempt-${mutation}-`));
      const rootPath = join(parent, "root");
      bootstrapDataRoot(rootPath);
      const root = openDataRoot(rootPath);
      const leaseResult = await acquireDataRootWriterLease(root);
      if (leaseResult.status !== "acquired") throw new Error("lease unavailable");
      try {
        const journal = new OperationJournal(root, leaseResult.lease);
        const evidence = ["first", "second"].map((suffix, index) => {
          const projectId = `project:attempt-drift-${mutation}-${suffix}`;
          const operationId = `op:attempt-drift-${mutation}-${suffix}`;
          const admission = journal.admit({
            schemaVersion: 1,
            operationId,
            operationKind: "project.save-as",
            target: { kind: "project", id: projectId },
            expectedIdentity: null,
            candidateIdentity: {
              projectRevision: `project-revision:sha256:${String(index + 7).repeat(64)}`,
            },
          });
          if (admission.status !== "admitted") throw new Error("unexpected replay");
          const candidate = stageProjectDirectoryCandidate(admission.operation);
          const projectPath = join(rootPath, dataRootProjectPath(projectId));
          publishStagedProjectDirectoryCandidate(
            admission.operation,
            candidate,
            projectPath,
            join(rootPath, "projects"),
          );
          const lockPath = join(projectPath, ".write-lock");
          linkSync(admission.operation.intentPath, lockPath);
          syncDirectory(projectPath);
          return { admission, lockPath, operationId, projectPath };
        });
        const secondAttempt = evidence[1]!.admission.operation.attemptPath;
        const foreignPath = join(secondAttempt, "foreign-after-first-cleanup");
        const stagedIntentPath = join(secondAttempt, "operation-intent.json");
        const originalIntentIdentity = lstatSync(stagedIntentPath, { bigint: true });
        const originalAttemptIdentity = readStableDirectoryIdentity(secondAttempt);
        let replacementAttemptIdentity = originalAttemptIdentity;
        let cleanupCount = 0;
        const restoreHook = STARTUP_RECOVERY_TEST_SEAMS.replaceConfirmedCleanupHook(
          () => {
            cleanupCount += 1;
            if (cleanupCount !== 1) return;
            if (mutation === "foreign-entry") {
              writeFileSync(foreignPath, "environment-corruption", { mode: 0o600 });
            } else if (mutation === "intent-new-inode") {
              const bytes = readFileSync(stagedIntentPath);
              unlinkSync(stagedIntentPath);
              writeFileSync(stagedIntentPath, bytes, { mode: 0o600 });
            } else {
              rmSync(secondAttempt, { recursive: true });
              mkdirSync(secondAttempt, { mode: 0o700 });
              linkSync(
                join(rootPath, dataRootReceiptIntentPath(evidence[1]!.operationId)),
                join(secondAttempt, "operation-intent.json"),
              );
              linkSync(
                join(rootPath, dataRootReceiptResultPath(evidence[1]!.operationId)),
                join(secondAttempt, "operation-result.json"),
              );
              linkSync(
                join(evidence[1]!.projectPath, ".created-directory.json"),
                join(secondAttempt, "project-directory.json"),
              );
              replacementAttemptIdentity = readStableDirectoryIdentity(secondAttempt);
            }
            syncDirectory(secondAttempt);
            syncDirectory(join(rootPath, "staging"));
          },
        );
        try {
          const reader = new WorldProjectWriter(
            root,
            leaseResult.lease,
            new ArtifactStoreReader(root),
          ).reader();
          expect(() => recoverPendingOperations(root, leaseResult.lease, reader))
            .toThrow("OPERATION_RECOVERY_REQUIRED");
        } finally {
          restoreHook();
        }

        expect(cleanupCount).toBe(1);
        expect(existsSync(evidence[0]!.projectPath)).toBe(false);
        expect(existsSync(evidence[0]!.admission.operation.attemptPath)).toBe(false);
        expect(existsSync(evidence[1]!.projectPath)).toBe(true);
        expect(existsSync(evidence[1]!.lockPath)).toBe(true);
        expect(existsSync(join(evidence[1]!.projectPath, ".created-directory.json")))
          .toBe(true);
        expect(existsSync(secondAttempt)).toBe(true);
        if (mutation === "foreign-entry") {
          expect(readFileSync(foreignPath, "utf8")).toBe("environment-corruption");
        } else if (mutation === "intent-new-inode") {
          const currentIntentIdentity = lstatSync(stagedIntentPath, { bigint: true });
          expect(
            currentIntentIdentity.dev !== originalIntentIdentity.dev ||
            currentIntentIdentity.ino !== originalIntentIdentity.ino,
          ).toBe(true);
        } else {
          expect(
            replacementAttemptIdentity.dev !== originalAttemptIdentity.dev ||
            replacementAttemptIdentity.ino !== originalAttemptIdentity.ino,
          ).toBe(true);
          expect(readdirSync(secondAttempt).sort()).toEqual([
            "operation-intent.json",
            "operation-result.json",
            "project-directory.json",
          ]);
        }
        for (const item of evidence) {
          expect(existsSync(join(rootPath, dataRootReceiptIntentPath(item.operationId))))
            .toBe(true);
          expect(existsSync(join(rootPath, dataRootReceiptResultPath(item.operationId))))
            .toBe(true);
        }
      } finally {
        await leaseResult.lease.close();
        root.close();
        rmSync(parent, { recursive: true, force: true });
      }
    }
  });

  test("terminal-at-startup marker drift不会借用历史cleanup例外", async () => {
    const parent = mkdtempSync(join(tmpdir(), "dh016-recovery-terminal-marker-drift-"));
    const rootPath = join(parent, "root");
    bootstrapDataRoot(rootPath);
    const root = openDataRoot(rootPath);
    const leaseResult = await acquireDataRootWriterLease(root);
    if (leaseResult.status !== "acquired") throw new Error("lease unavailable");
    try {
      const journal = new OperationJournal(root, leaseResult.lease);
      const evidence = ["first", "second"].map((suffix, index) => {
        const projectId = `project:terminal-marker-drift-${suffix}`;
        const operationId = `op:terminal-marker-drift-${suffix}`;
        const admission = journal.admit({
          schemaVersion: 1,
          operationId,
          operationKind: "project.save-as",
          target: { kind: "project", id: projectId },
          expectedIdentity: null,
          candidateIdentity: {
            projectRevision: `project-revision:sha256:${String(index + 1).repeat(64)}`,
          },
        });
        if (admission.status !== "admitted") throw new Error("unexpected replay");
        const candidate = stageProjectDirectoryCandidate(admission.operation);
        const projectPath = join(rootPath, dataRootProjectPath(projectId));
        publishStagedProjectDirectoryCandidate(
          admission.operation,
          candidate,
          projectPath,
          join(rootPath, "projects"),
        );
        const lockPath = join(projectPath, ".write-lock");
        linkSync(admission.operation.intentPath, lockPath);
        syncDirectory(projectPath);
        journal.finalizeAborted(admission.operation, "OPERATION_INTERRUPTED");
        return { admission, lockPath, operationId, projectPath };
      });
      const secondMarker = join(
        evidence[1]!.projectPath,
        ".created-directory.json",
      );
      let cleanupCount = 0;
      const restoreHook = STARTUP_RECOVERY_TEST_SEAMS.replaceConfirmedCleanupHook(
        () => {
          cleanupCount += 1;
          if (cleanupCount === 1) {
            unlinkSync(secondMarker);
            syncDirectory(evidence[1]!.projectPath);
          }
        },
      );
      try {
        const reader = new WorldProjectWriter(
          root,
          leaseResult.lease,
          new ArtifactStoreReader(root),
        ).reader();
        expect(() => recoverPendingOperations(root, leaseResult.lease, reader))
          .toThrow("OPERATION_RECOVERY_REQUIRED");
      } finally {
        restoreHook();
      }

      expect(cleanupCount).toBe(1);
      expect(existsSync(evidence[0]!.projectPath)).toBe(false);
      expect(existsSync(evidence[0]!.admission.operation.attemptPath)).toBe(false);
      expect(existsSync(evidence[1]!.projectPath)).toBe(true);
      expect(existsSync(evidence[1]!.lockPath)).toBe(true);
      expect(existsSync(secondMarker)).toBe(false);
      expect(existsSync(evidence[1]!.admission.operation.attemptPath)).toBe(true);
      for (const item of evidence) {
        expect(existsSync(join(rootPath, dataRootReceiptIntentPath(item.operationId))))
          .toBe(true);
        expect(existsSync(join(rootPath, dataRootReceiptResultPath(item.operationId))))
          .toBe(true);
      }
    } finally {
      await leaseResult.lease.close();
      root.close();
      rmSync(parent, { recursive: true, force: true });
    }
  });

  test("历史cleanup完成的Project目录在逐项cleanup间丢失或换inode时停止", async () => {
    for (const mutation of ["missing", "replacement-inode"] as const) {
      const parent = mkdtempSync(join(tmpdir(), `dh016-recovery-project-${mutation}-`));
      const rootPath = join(parent, "root");
      bootstrapDataRoot(rootPath);
      const root = openDataRoot(rootPath);
      const leaseResult = await acquireDataRootWriterLease(root);
      if (leaseResult.status !== "acquired") throw new Error("lease unavailable");
      try {
        const writer = new WorldProjectWriter(
          root,
          leaseResult.lease,
          new ArtifactStoreReader(root),
        );
        const host = new RuntimeMvpHost();
        host.write(createInitialSnapshot());
        const projects = ["first", "second"].map((suffix) => {
          const projectId = `project:terminal-directory-${mutation}-${suffix}`;
          return {
            operationId: `op:terminal-directory-${mutation}-${suffix}`,
            manifest: createWorldProjectManifest(
              projectId,
              `Terminal directory ${mutation} ${suffix}`,
              host.exportProjectHistory(),
            ),
            projectPath: join(rootPath, dataRootProjectPath(projectId)),
          };
        });
        for (const project of projects) {
          await writer.save(project.manifest, project.operationId, null);
        }

        const second = projects[1]!;
        const startupIdentity = readStableDirectoryIdentity(second.projectPath);
        const projectBytes = readFileSync(join(second.projectPath, "project.json"));
        let replacementIdentity = startupIdentity;
        let cleanupCount = 0;
        const restoreHook = STARTUP_RECOVERY_TEST_SEAMS.replaceConfirmedCleanupHook(
          () => {
            cleanupCount += 1;
            if (cleanupCount !== 1) return;
            rmSync(second.projectPath, { recursive: true });
            if (mutation === "replacement-inode") {
              mkdirSync(second.projectPath, { mode: 0o700 });
              writeFileSync(join(second.projectPath, "project.json"), projectBytes, {
                mode: 0o600,
              });
              syncDirectory(second.projectPath);
              replacementIdentity = readStableDirectoryIdentity(second.projectPath);
            }
            syncDirectory(join(rootPath, "projects"));
          },
        );
        try {
          expect(() => recoverPendingOperations(
            root,
            leaseResult.lease,
            writer.reader(),
          )).toThrow("OPERATION_RECOVERY_REQUIRED");
        } finally {
          restoreHook();
        }

        expect(cleanupCount).toBe(1);
        expect(existsSync(projects[0]!.projectPath)).toBe(true);
        expect(existsSync(second.projectPath)).toBe(mutation === "replacement-inode");
        if (mutation === "replacement-inode") {
          expect(
            replacementIdentity.dev !== startupIdentity.dev ||
            replacementIdentity.ino !== startupIdentity.ino,
          ).toBe(true);
          expect(readFileSync(join(second.projectPath, "project.json")))
            .toEqual(projectBytes);
        }
        for (const project of projects) {
          expect(existsSync(join(
            rootPath,
            dataRootReceiptIntentPath(project.operationId),
          ))).toBe(true);
          expect(existsSync(join(
            rootPath,
            dataRootReceiptResultPath(project.operationId),
          ))).toBe(true);
        }
      } finally {
        await leaseResult.lease.close();
        root.close();
        rmSync(parent, { recursive: true, force: true });
      }
    }
  });

  for (const operationKind of ["project.save-as", "bundle.import"] as const) {
    test(`pending ${operationKind} 不会把ownerless foreign final目录terminalize`, async () => {
      const parent = mkdtempSync(join(tmpdir(), "dh016-recovery-ownerless-final-"));
      const rootPath = join(parent, "root");
      bootstrapDataRoot(rootPath);
      const root = openDataRoot(rootPath);
      const leaseResult = await acquireDataRootWriterLease(root);
      if (leaseResult.status !== "acquired") throw new Error("lease unavailable");
      try {
        const operationSlug = operationKind === "project.save-as" ? "save-as" : "bundle-import";
        const projectId = `project:ownerless-final-${operationSlug}`;
        const operationId = `op:ownerless-final-${operationSlug}`;
        const journal = new OperationJournal(root, leaseResult.lease);
        const admission = journal.admit({
          schemaVersion: 1,
          operationId,
          operationKind,
          target: { kind: "project", id: projectId },
          expectedIdentity: null,
          candidateIdentity: operationKind === "bundle.import"
            ? {
                projectRevision: `project-revision:sha256:${"7".repeat(64)}`,
                candidateArtifacts: [],
                artifactSetDigest: artifactCandidateSetDigest([]),
              }
            : { projectRevision: `project-revision:sha256:${"7".repeat(64)}` },
        });
        if (admission.status !== "admitted") throw new Error("unexpected replay");
        stageProjectDirectoryCandidate(admission.operation);
        const projectPath = join(rootPath, dataRootProjectPath(projectId));
        mkdirSync(projectPath, { mode: 0o700 });
        writeFileSync(join(projectPath, "foreign"), "preserve", { mode: 0o600 });
        syncDirectory(projectPath);
        syncDirectory(join(rootPath, "projects"));

        const reader = new WorldProjectWriter(
          root,
          leaseResult.lease,
          new ArtifactStoreReader(root),
        ).reader();
        expect(() => recoverPendingOperations(root, leaseResult.lease, reader))
          .toThrow("OPERATION_RECOVERY_REQUIRED");
        expect(existsSync(join(rootPath, dataRootReceiptResultPath(operationId))))
          .toBe(false);
        expect(readFileSync(join(projectPath, "foreign"), "utf8")).toBe("preserve");
        expect(existsSync(admission.operation.attemptPath)).toBe(true);
      } finally {
        await leaseResult.lease.close();
        root.close();
        rmSync(parent, { recursive: true, force: true });
      }
    });
  }

  test("pending Save As 的final marker缺失时在terminalize前fail closed", async () => {
    const parent = mkdtempSync(join(tmpdir(), "dh016-recovery-final-marker-missing-"));
    const rootPath = join(parent, "root");
    bootstrapDataRoot(rootPath);
    const root = openDataRoot(rootPath);
    const leaseResult = await acquireDataRootWriterLease(root);
    if (leaseResult.status !== "acquired") throw new Error("lease unavailable");
    try {
      const projectId = "project:final-marker-missing";
      const journal = new OperationJournal(root, leaseResult.lease);
      const admission = journal.admit({
        schemaVersion: 1,
        operationId: "op:final-marker-missing",
        operationKind: "project.save-as",
        target: { kind: "project", id: projectId },
        expectedIdentity: null,
        candidateIdentity: { projectRevision: `project-revision:sha256:${"1".repeat(64)}` },
      });
      if (admission.status !== "admitted") throw new Error("unexpected replay");
      const candidate = stageProjectDirectoryCandidate(admission.operation);
      const projectPath = join(rootPath, dataRootProjectPath(projectId));
      publishStagedProjectDirectoryCandidate(
        admission.operation,
        candidate,
        projectPath,
        join(rootPath, "projects"),
      );
      unlinkSync(join(projectPath, ".created-directory.json"));
      syncDirectory(projectPath);

      const reader = new WorldProjectWriter(
        root,
        leaseResult.lease,
        new ArtifactStoreReader(root),
      ).reader();
      expect(() => recoverPendingOperations(root, leaseResult.lease, reader))
        .toThrow("OPERATION_RECOVERY_REQUIRED");
      expect(existsSync(join(rootPath, dataRootReceiptResultPath("op:final-marker-missing"))))
        .toBe(false);
      expect(existsSync(projectPath)).toBe(true);
      expect(existsSync(admission.operation.attemptPath)).toBe(true);
    } finally {
      await leaseResult.lease.close();
      root.close();
      rmSync(parent, { recursive: true, force: true });
    }
  });

  test("pending bundle final marker被替换为byte-identical新inode时零partial cleanup", async () => {
    const parent = mkdtempSync(join(tmpdir(), "dh016-recovery-final-marker-inode-"));
    const rootPath = join(parent, "root");
    bootstrapDataRoot(rootPath);
    const root = openDataRoot(rootPath);
    const leaseResult = await acquireDataRootWriterLease(root);
    if (leaseResult.status !== "acquired") throw new Error("lease unavailable");
    try {
      const projectId = "project:final-marker-inode";
      const operationId = "op:final-marker-inode";
      const journal = new OperationJournal(root, leaseResult.lease);
      const admission = journal.admit({
        schemaVersion: 1,
        operationId,
        operationKind: "bundle.import",
        target: { kind: "project", id: projectId },
        expectedIdentity: null,
        candidateIdentity: {
          projectRevision: `project-revision:sha256:${"2".repeat(64)}`,
          candidateArtifacts: [],
          artifactSetDigest: artifactCandidateSetDigest([]),
        },
      });
      if (admission.status !== "admitted") throw new Error("unexpected replay");
      const candidate = stageProjectDirectoryCandidate(admission.operation);
      const projectPath = join(rootPath, dataRootProjectPath(projectId));
      publishStagedProjectDirectoryCandidate(
        admission.operation,
        candidate,
        projectPath,
        join(rootPath, "projects"),
      );
      const markerPath = join(projectPath, ".created-directory.json");
      const markerBytes = readFileSync(markerPath);
      unlinkSync(markerPath);
      writeFileSync(markerPath, markerBytes, { mode: 0o600 });
      syncDirectory(projectPath);

      const reader = new WorldProjectWriter(
        root,
        leaseResult.lease,
        new ArtifactStoreReader(root),
      ).reader();
      expect(() => recoverPendingOperations(root, leaseResult.lease, reader))
        .toThrow("OPERATION_RECOVERY_REQUIRED");
      expect(existsSync(join(rootPath, dataRootReceiptResultPath(operationId)))).toBe(false);
      expect(existsSync(projectPath)).toBe(true);
      expect(existsSync(admission.operation.attemptPath)).toBe(true);
    } finally {
      await leaseResult.lease.close();
      root.close();
      rmSync(parent, { recursive: true, force: true });
    }
  });

  test("pending final Project含unknown entry时在terminalize前全局fail closed", async () => {
    const parent = mkdtempSync(join(tmpdir(), "dh016-recovery-final-extra-entry-"));
    const rootPath = join(parent, "root");
    bootstrapDataRoot(rootPath);
    const root = openDataRoot(rootPath);
    const leaseResult = await acquireDataRootWriterLease(root);
    if (leaseResult.status !== "acquired") throw new Error("lease unavailable");
    try {
      const projectId = "project:final-extra-entry";
      const operationId = "op:final-extra-entry";
      const journal = new OperationJournal(root, leaseResult.lease);
      const admission = journal.admit({
        schemaVersion: 1,
        operationId,
        operationKind: "project.save-as",
        target: { kind: "project", id: projectId },
        expectedIdentity: null,
        candidateIdentity: { projectRevision: `project-revision:sha256:${"3".repeat(64)}` },
      });
      if (admission.status !== "admitted") throw new Error("unexpected replay");
      const candidate = stageProjectDirectoryCandidate(admission.operation);
      const projectPath = join(rootPath, dataRootProjectPath(projectId));
      publishStagedProjectDirectoryCandidate(
        admission.operation,
        candidate,
        projectPath,
        join(rootPath, "projects"),
      );
      writeFileSync(join(projectPath, "foreign"), "preserve", { mode: 0o600 });
      syncDirectory(projectPath);

      const reader = new WorldProjectWriter(
        root,
        leaseResult.lease,
        new ArtifactStoreReader(root),
      ).reader();
      expect(() => recoverPendingOperations(root, leaseResult.lease, reader))
        .toThrow("OPERATION_RECOVERY_REQUIRED");
      expect(existsSync(join(rootPath, dataRootReceiptResultPath(operationId)))).toBe(false);
      expect(readdirSync(projectPath).sort()).toEqual([
        ".created-directory.json",
        "foreign",
      ]);
      expect(existsSync(admission.operation.attemptPath)).toBe(true);
    } finally {
      await leaseResult.lease.close();
      root.close();
      rmSync(parent, { recursive: true, force: true });
    }
  });

  test("Project rmdir 后 projects fsync 失败，restart 补 fsync 后才 cleanup attempt", async () => {
    const parent = mkdtempSync(join(tmpdir(), "dh016-recovery-project-rmdir-fsync-"));
    const rootPath = join(parent, "root");
    bootstrapDataRoot(rootPath);
    let root = openDataRoot(rootPath);
    let leaseResult = await acquireDataRootWriterLease(root);
    if (leaseResult.status !== "acquired") throw new Error("lease unavailable");
    const host = new RuntimeMvpHost();
    host.write(createInitialSnapshot());
    const manifest = createWorldProjectManifest(
      "project:rmdir-fsync-retry",
      "rmdir fsync retry",
      host.exportProjectHistory(),
    );
    const journal = new OperationJournal(root, leaseResult.lease);
    const admission = journal.admit({
      schemaVersion: 1,
      operationId: "op:rmdir-fsync-fail",
      operationKind: "project.save-as",
      target: { kind: "project", id: manifest.projectId },
      expectedIdentity: null,
      candidateIdentity: { projectRevision: manifest.revision },
    });
    if (admission.status !== "admitted") throw new Error("unexpected replay");
    const projectPath = join(rootPath, dataRootProjectPath(manifest.projectId));
    mkdirSync(projectPath, { mode: 0o700 });
    publishProjectDirectoryMarker(
      projectPath,
      admission.operation,
      readStableDirectoryIdentity(projectPath),
    );
    syncDirectory(join(rootPath, "projects"));
    journal.finalizeAborted(admission.operation, "OPERATION_INTERRUPTED");

    let projectsSyncs = 0;
    const projectsPath = join(rootPath, "projects");
    const restoreSync = SAFE_FILESYSTEM_TEST_SEAMS.replaceDirectorySync(
      (path, actual) => {
        if (path === projectsPath && ++projectsSyncs === 2) {
          throw new Error("injected projects removal fsync failure");
        }
        actual(path);
      },
    );
    try {
      const reader = new WorldProjectWriter(
        root,
        leaseResult.lease,
        new ArtifactStoreReader(root),
      ).reader();
      expect(() => recoverPendingOperations(root, leaseResult.lease, reader)).toThrow(
        "injected projects removal fsync failure",
      );
      expect(existsSync(projectPath)).toBe(false);
      expect(existsSync(admission.operation.attemptPath)).toBe(true);
    } finally {
      restoreSync();
      await leaseResult.lease.close();
      root.close();
    }

    root = openDataRoot(rootPath);
    leaseResult = await acquireDataRootWriterLease(root);
    if (leaseResult.status !== "acquired") throw new Error("lease unavailable");
    try {
      const writer = new WorldProjectWriter(
        root,
        leaseResult.lease,
        new ArtifactStoreReader(root),
      );
      expect(recoverPendingOperations(root, leaseResult.lease, writer.reader()))
        .toMatchObject({ recovered: [], alreadyTerminal: [{ operationId: "op:rmdir-fsync-fail" }] });
      expect(readdirSync(join(rootPath, "staging"))).toEqual([]);
      await expect(writer.save(manifest, "op:rmdir-fsync-retry", null)).resolves.toMatchObject({
        replayed: false,
      });
    } finally {
      await leaseResult.lease.close();
      root.close();
      rmSync(parent, { recursive: true, force: true });
    }
  });

  test("attempt rmdir 后 staging fsync 失败，restart 补 fsync 后完成 terminal recovery", async () => {
    const parent = mkdtempSync(join(tmpdir(), "dh016-recovery-attempt-fsync-"));
    const rootPath = join(parent, "root");
    bootstrapDataRoot(rootPath);
    let root = openDataRoot(rootPath);
    let leaseResult = await acquireDataRootWriterLease(root);
    if (leaseResult.status !== "acquired") throw new Error("lease unavailable");
    const registered = MARBLE_HUNYUAN_REGISTRY.assets[0]!;
    const journal = new OperationJournal(root, leaseResult.lease);
    const admission = journal.admit({
      schemaVersion: 1,
      operationId: "op:attempt-fsync-fail",
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
    if (admission.status !== "admitted") throw new Error("unexpected replay");
    journal.finalizeAborted(admission.operation, "OPERATION_INTERRUPTED");
    const stagingPath = join(rootPath, "staging");
    const restoreSync = SAFE_FILESYSTEM_TEST_SEAMS.replaceDirectorySync(
      (path, actual) => {
        if (path === stagingPath) throw new Error("injected staging removal fsync failure");
        actual(path);
      },
    );
    try {
      expect(() => journal.cleanupAttempt(admission.operation)).toThrow(
        "injected staging removal fsync failure",
      );
      expect(existsSync(admission.operation.attemptPath)).toBe(false);
    } finally {
      restoreSync();
      await leaseResult.lease.close();
      root.close();
    }

    root = openDataRoot(rootPath);
    leaseResult = await acquireDataRootWriterLease(root);
    if (leaseResult.status !== "acquired") throw new Error("lease unavailable");
    try {
      const reader = new WorldProjectWriter(
        root,
        leaseResult.lease,
        new ArtifactStoreReader(root),
      ).reader();
      expect(recoverPendingOperations(root, leaseResult.lease, reader)).toMatchObject({
        recovered: [],
        alreadyTerminal: [{ operationId: "op:attempt-fsync-fail" }],
      });
      expect(readdirSync(stagingPath)).toEqual([]);
    } finally {
      await leaseResult.lease.close();
      root.close();
      rmSync(parent, { recursive: true, force: true });
    }
  });

  test("prefix-confusable operation attempts 保持 complete coverage 与 exact cleanup", async () => {
    const parent = mkdtempSync(join(tmpdir(), "dh016-recovery-prefix-attempts-"));
    const rootPath = join(parent, "root");
    bootstrapDataRoot(rootPath);
    const root = openDataRoot(rootPath);
    const leaseResult = await acquireDataRootWriterLease(root);
    if (leaseResult.status !== "acquired") throw new Error("lease unavailable");
    try {
      const registered = MARBLE_HUNYUAN_REGISTRY.assets[0]!;
      const journal = new OperationJournal(root, leaseResult.lease);
      for (const operationId of ["op:a", "op:a-b"]) {
        const admission = journal.admit({
          schemaVersion: 1,
          operationId,
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
        if (admission.status !== "admitted") throw new Error("unexpected replay");
        journal.finalizeAborted(admission.operation, "OPERATION_INTERRUPTED");
      }
      const reader = new WorldProjectWriter(
        root,
        leaseResult.lease,
        new ArtifactStoreReader(root),
      ).reader();
      const result = recoverPendingOperations(root, leaseResult.lease, reader);
      expect(result.alreadyTerminal.map((entry) => entry.operationId)).toEqual([
        "op:a",
        "op:a-b",
      ]);
      expect(readdirSync(join(rootPath, "staging"))).toEqual([]);
    } finally {
      await leaseResult.lease.close();
      root.close();
      rmSync(parent, { recursive: true, force: true });
    }
  });

  test("有staged marker的未发布candidate收敛OPERATION_INTERRUPTED", async () => {
    const parent = mkdtempSync(join(tmpdir(), "dh016-recovery-"));
    const rootPath = join(parent, "root");
    bootstrapDataRoot(rootPath);
    const root = openDataRoot(rootPath);
    const leaseResult = await acquireDataRootWriterLease(root);
    if (leaseResult.status !== "acquired") throw new Error("lease unavailable");
    try {
      const writer = new WorldProjectWriter(
        root,
        leaseResult.lease,
        new ArtifactStoreReader(root),
      );

      const interruptedBinding: OperationBinding = {
        schemaVersion: 1,
        operationId: "op:interrupted",
        operationKind: "project.save-as",
        target: { kind: "project", id: "project:absent" },
        expectedIdentity: null,
        candidateIdentity: {
          projectRevision: `project-revision:sha256:${"b".repeat(64)}`,
        },
      };
      const interruptedAdmission = new OperationJournal(
        root,
        leaseResult.lease,
      ).admit(interruptedBinding);
      if (interruptedAdmission.status !== "admitted") {
        throw new Error("unexpected replay");
      }
      stageProjectDirectoryCandidate(interruptedAdmission.operation);

      const result = recoverPendingOperations(
        root,
        leaseResult.lease,
        writer.reader(),
      );
      expect(result.recovered).toEqual([
        expect.objectContaining({
          operationId: "op:interrupted",
          variant: "aborted-before-publish",
          code: "OPERATION_INTERRUPTED",
        }),
      ]);
      expect(recoverPendingOperations(root, leaseResult.lease, writer.reader()))
        .toMatchObject({ recovered: [], alreadyTerminal: [{}] });
    } finally {
      await leaseResult.lease.close();
      root.close();
      rmSync(parent, { recursive: true, force: true });
    }
  });

  test("foreign project lock 保留并阻断恢复", async () => {
    const parent = mkdtempSync(join(tmpdir(), "dh016-recovery-lock-"));
    const rootPath = join(parent, "root");
    bootstrapDataRoot(rootPath);
    const root = openDataRoot(rootPath);
    const leaseResult = await acquireDataRootWriterLease(root);
    if (leaseResult.status !== "acquired") throw new Error("lease unavailable");
    try {
      const artifacts = new ArtifactStoreReader(root);
      const writer = new WorldProjectWriter(root, leaseResult.lease, artifacts);
      const host = new RuntimeMvpHost();
      host.write(createInitialSnapshot());
      const manifest = createWorldProjectManifest(
        "project:foreign-lock",
        "Foreign Lock",
        host.exportProjectHistory(),
      );
      await writer.save(manifest, "op:foreign-lock", null);
      const lockPath = join(rootPath, dataRootProjectPath(manifest.projectId), ".write-lock");
      writeFileSync(lockPath, "foreign", { mode: 0o600 });
      expect(() => recoverPendingOperations(root, leaseResult.lease, writer.reader()))
        .toThrow("OPERATION_RECOVERY_REQUIRED");
      expect(existsSync(lockPath)).toBe(true);
    } finally {
      await leaseResult.lease.close();
      root.close();
      rmSync(parent, { recursive: true, force: true });
    }
  });

  test("project 状态无法唯一分类时保留 exact lock、intent 与 staging evidence", async () => {
    const parent = mkdtempSync(join(tmpdir(), "dh016-recovery-ambiguous-"));
    const rootPath = join(parent, "root");
    bootstrapDataRoot(rootPath);
    const root = openDataRoot(rootPath);
    const leaseResult = await acquireDataRootWriterLease(root);
    if (leaseResult.status !== "acquired") throw new Error("lease unavailable");
    try {
      const operationId = "op:ambiguous-project";
      const projectId = "project:ambiguous";
      const journal = new OperationJournal(root, leaseResult.lease);
      const admission = journal.admit({
        schemaVersion: 1,
        operationId,
        operationKind: "project.save-as",
        target: { kind: "project", id: projectId },
        expectedIdentity: null,
        candidateIdentity: {
          projectRevision: `project-revision:sha256:${"c".repeat(64)}`,
        },
      });
      if (admission.status !== "admitted") throw new Error("unexpected replay");
      const projectPath = join(rootPath, dataRootProjectPath(projectId));
      mkdirSync(projectPath, { mode: 0o700 });
      const lockPath = join(projectPath, ".write-lock");
      linkSync(admission.operation.intentPath, lockPath);
      writeFileSync(join(projectPath, "project.json"), "{malformed", { mode: 0o600 });

      const reader = new WorldProjectWriter(
        root,
        leaseResult.lease,
        new ArtifactStoreReader(root),
      ).reader();
      expect(() => recoverPendingOperations(root, leaseResult.lease, reader))
        .toThrow("OPERATION_RECOVERY_REQUIRED");
      expect(existsSync(lockPath)).toBe(true);
      expect(existsSync(admission.operation.intentPath)).toBe(true);
      expect(existsSync(admission.operation.attemptPath)).toBe(true);
      expect(existsSync(join(rootPath, dataRootReceiptResultPath(operationId))))
        .toBe(false);
      expect(existsSync(join(projectPath, "project.json"))).toBe(true);
    } finally {
      await leaseResult.lease.close();
      root.close();
      rmSync(parent, { recursive: true, force: true });
    }
  });

  test("startup 只回收由 durable marker 证明归属的 aborted Save As 目录", async () => {
    const parent = mkdtempSync(join(tmpdir(), "dh016-recovery-created-dir-"));
    const rootPath = join(parent, "root");
    bootstrapDataRoot(rootPath);
    const root = openDataRoot(rootPath);
    const leaseResult = await acquireDataRootWriterLease(root);
    if (leaseResult.status !== "acquired") throw new Error("lease unavailable");
    try {
      const binding: OperationBinding = {
        schemaVersion: 1,
        operationId: "op:created-dir",
        operationKind: "project.save-as",
        target: { kind: "project", id: "project:created-dir" },
        expectedIdentity: null,
        candidateIdentity: {
          projectRevision: `project-revision:sha256:${"d".repeat(64)}`,
        },
      };
      const journal = new OperationJournal(root, leaseResult.lease);
      const admission = journal.admit(binding);
      if (admission.status !== "admitted") throw new Error("unexpected replay");
      const projectPath = join(rootPath, dataRootProjectPath("project:created-dir"));
      mkdirSync(projectPath, { mode: 0o700 });
      publishProjectDirectoryMarker(
        projectPath,
        admission.operation,
        readStableDirectoryIdentity(projectPath),
      );
      linkSync(admission.operation.intentPath, join(projectPath, ".write-lock"));

      const reader = new WorldProjectWriter(
        root,
        leaseResult.lease,
        new ArtifactStoreReader(root),
      ).reader();
      expect(recoverPendingOperations(root, leaseResult.lease, reader).recovered)
        .toEqual([expect.objectContaining({
          operationId: binding.operationId,
          variant: "aborted-before-publish",
          code: "OPERATION_INTERRUPTED",
        })]);
      expect(existsSync(projectPath)).toBe(false);
    } finally {
      await leaseResult.lease.close();
      root.close();
      rmSync(parent, { recursive: true, force: true });
    }
  });

  test("可读 result 必须重新 fsync receipts 后才能清理 Project evidence", async () => {
    const parent = mkdtempSync(join(tmpdir(), "dh016-recovery-visible-result-"));
    const rootPath = join(parent, "root");
    bootstrapDataRoot(rootPath);
    const root = openDataRoot(rootPath);
    const leaseResult = await acquireDataRootWriterLease(root);
    if (leaseResult.status !== "acquired") throw new Error("lease unavailable");
    try {
      const binding: OperationBinding = {
        schemaVersion: 1,
        operationId: "op:visible-result",
        operationKind: "project.save-as",
        target: { kind: "project", id: "project:visible-result" },
        expectedIdentity: null,
        candidateIdentity: {
          projectRevision: `project-revision:sha256:${"e".repeat(64)}`,
        },
      };
      const journal = new OperationJournal(root, leaseResult.lease);
      const admission = journal.admit(binding);
      if (admission.status !== "admitted") throw new Error("unexpected replay");
      const projectPath = join(rootPath, dataRootProjectPath("project:visible-result"));
      mkdirSync(projectPath, { mode: 0o700 });
      publishProjectDirectoryMarker(
        projectPath,
        admission.operation,
        readStableDirectoryIdentity(projectPath),
      );
      const lockPath = join(projectPath, ".write-lock");
      linkSync(admission.operation.intentPath, lockPath);
      syncDirectory(projectPath);

      const stagedResult = join(admission.operation.attemptPath, "operation-result.json");
      writeNewSyncedFile(stagedResult, canonicalJsonBytes({
        schemaVersion: 1,
        operationId: binding.operationId,
        bindingDigest: operationBindingDigest(binding),
        variant: "aborted-before-publish",
        code: "OPERATION_INTERRUPTED",
      }));
      syncDirectory(admission.operation.attemptPath);
      const publishedResult = join(
        rootPath,
        dataRootReceiptResultPath(binding.operationId),
      );
      linkSync(stagedResult, publishedResult);

      const reader = new WorldProjectWriter(
        root,
        leaseResult.lease,
        new ArtifactStoreReader(root),
      ).reader();
      const restoreSync = OPERATION_JOURNAL_TEST_SEAMS.replaceReceiptsDirectorySync(
        () => {
          throw new Error("injected receipts fsync failure");
        },
      );
      try {
        expect(() => recoverPendingOperations(root, leaseResult.lease, reader))
          .toThrow("OPERATION_RECOVERY_REQUIRED");
      } finally {
        restoreSync();
      }
      expect(existsSync(publishedResult)).toBe(true);
      expect(existsSync(lockPath)).toBe(true);
      expect(existsSync(projectPath)).toBe(true);
      expect(existsSync(admission.operation.attemptPath)).toBe(true);

      expect(recoverPendingOperations(root, leaseResult.lease, reader))
        .toMatchObject({
          recovered: [],
          alreadyTerminal: [{ operationId: binding.operationId }],
        });
      expect(existsSync(projectPath)).toBe(false);
      expect(existsSync(admission.operation.attemptPath)).toBe(false);
    } finally {
      await leaseResult.lease.close();
      root.close();
      rmSync(parent, { recursive: true, force: true });
    }
  });

  test("历史 terminal 不得阻断同一 Project 的较新 pending lock owner", async () => {
    const parent = mkdtempSync(join(tmpdir(), "dh016-recovery-lock-order-"));
    const rootPath = join(parent, "root");
    bootstrapDataRoot(rootPath);
    const root = openDataRoot(rootPath);
    const leaseResult = await acquireDataRootWriterLease(root);
    if (leaseResult.status !== "acquired") throw new Error("lease unavailable");
    try {
      const artifacts = new ArtifactStoreReader(root);
      const writer = new WorldProjectWriter(root, leaseResult.lease, artifacts);
      const host = new RuntimeMvpHost();
      host.write(createInitialSnapshot());
      const manifest = createWorldProjectManifest(
        "project:lock-order",
        "Lock Order",
        host.exportProjectHistory(),
      );
      await writer.save(manifest, "op:a-history", null);

      const pending: OperationBinding = {
        schemaVersion: 1,
        operationId: "op:z-pending",
        operationKind: "project.save",
        target: { kind: "project", id: manifest.projectId },
        expectedIdentity: manifest.revision,
        candidateIdentity: {
          projectRevision: `project-revision:sha256:${"f".repeat(64)}`,
        },
      };
      const journal = new OperationJournal(root, leaseResult.lease);
      const admission = journal.admit(pending);
      if (admission.status !== "admitted") throw new Error("unexpected replay");
      const lockPath = join(
        rootPath,
        dataRootProjectPath(manifest.projectId),
        ".write-lock",
      );
      linkSync(admission.operation.intentPath, lockPath);

      const result = recoverPendingOperations(root, leaseResult.lease, writer.reader());
      expect(result.alreadyTerminal).toEqual([
        expect.objectContaining({ operationId: "op:a-history", variant: "success" }),
      ]);
      expect(result.recovered).toEqual([
        expect.objectContaining({
          operationId: pending.operationId,
          variant: "aborted-before-publish",
          code: "OPERATION_INTERRUPTED",
        }),
      ]);
      expect(existsSync(lockPath)).toBe(false);
    } finally {
      await leaseResult.lease.close();
      root.close();
      rmSync(parent, { recursive: true, force: true });
    }
  });

  test("历史 aborted Save As 不得清理较新 pending Save As 的marker与目录", async () => {
    const parent = mkdtempSync(join(tmpdir(), "dh016-recovery-marker-order-"));
    const rootPath = join(parent, "root");
    bootstrapDataRoot(rootPath);
    const root = openDataRoot(rootPath);
    const leaseResult = await acquireDataRootWriterLease(root);
    if (leaseResult.status !== "acquired") throw new Error("lease unavailable");
    try {
      const projectId = "project:marker-order";
      const journal = new OperationJournal(root, leaseResult.lease);
      const historicalBinding: OperationBinding = {
        schemaVersion: 1,
        operationId: "op:a-history-marker",
        operationKind: "project.save-as",
        target: { kind: "project", id: projectId },
        expectedIdentity: null,
        candidateIdentity: {
          projectRevision: `project-revision:sha256:${"1".repeat(64)}`,
        },
      };
      const historical = journal.admit(historicalBinding);
      if (historical.status !== "admitted") throw new Error("unexpected replay");
      journal.finalizeAborted(historical.operation, "OPERATION_INTERRUPTED");
      journal.cleanupAttempt(historical.operation);

      const pendingBinding: OperationBinding = {
        ...historicalBinding,
        operationId: "op:z-pending-marker",
        candidateIdentity: {
          projectRevision: `project-revision:sha256:${"2".repeat(64)}`,
        },
      };
      const pending = journal.admit(pendingBinding);
      if (pending.status !== "admitted") throw new Error("unexpected replay");
      const projectPath = join(rootPath, dataRootProjectPath(projectId));
      mkdirSync(projectPath, { mode: 0o700 });
      publishProjectDirectoryMarker(
        projectPath,
        pending.operation,
        readStableDirectoryIdentity(projectPath),
      );
      linkSync(pending.operation.intentPath, join(projectPath, ".write-lock"));

      const reader = new WorldProjectWriter(
        root,
        leaseResult.lease,
        new ArtifactStoreReader(root),
      ).reader();
      const result = recoverPendingOperations(root, leaseResult.lease, reader);
      expect(result.alreadyTerminal).toEqual([
        expect.objectContaining({ operationId: historicalBinding.operationId }),
      ]);
      expect(result.recovered).toEqual([
        expect.objectContaining({
          operationId: pendingBinding.operationId,
          variant: "aborted-before-publish",
          code: "OPERATION_INTERRUPTED",
        }),
      ]);
      expect(existsSync(projectPath)).toBe(false);
    } finally {
      await leaseResult.lease.close();
      root.close();
      rmSync(parent, { recursive: true, force: true });
    }
  });

  test("marker已发布但lock未发布的pending Save As仍由marker owner收束", async () => {
    const parent = mkdtempSync(join(tmpdir(), "dh016-recovery-marker-only-"));
    const rootPath = join(parent, "root");
    bootstrapDataRoot(rootPath);
    const root = openDataRoot(rootPath);
    const leaseResult = await acquireDataRootWriterLease(root);
    if (leaseResult.status !== "acquired") throw new Error("lease unavailable");
    try {
      const projectId = "project:marker-only";
      const journal = new OperationJournal(root, leaseResult.lease);
      const historical = journal.admit({
        schemaVersion: 1,
        operationId: "op:a-marker-history",
        operationKind: "project.save-as",
        target: { kind: "project", id: projectId },
        expectedIdentity: null,
        candidateIdentity: { projectRevision: `project-revision:sha256:${"3".repeat(64)}` },
      });
      if (historical.status !== "admitted") throw new Error("unexpected replay");
      journal.finalizeAborted(historical.operation, "OPERATION_INTERRUPTED");
      journal.cleanupAttempt(historical.operation);

      const pending = journal.admit({
        schemaVersion: 1,
        operationId: "op:z-marker-owner",
        operationKind: "project.save-as",
        target: { kind: "project", id: projectId },
        expectedIdentity: null,
        candidateIdentity: { projectRevision: `project-revision:sha256:${"4".repeat(64)}` },
      });
      if (pending.status !== "admitted") throw new Error("unexpected replay");
      const projectPath = join(rootPath, dataRootProjectPath(projectId));
      mkdirSync(projectPath, { mode: 0o700 });
      publishProjectDirectoryMarker(
        projectPath,
        pending.operation,
        readStableDirectoryIdentity(projectPath),
      );

      const reader = new WorldProjectWriter(
        root,
        leaseResult.lease,
        new ArtifactStoreReader(root),
      ).reader();
      const result = recoverPendingOperations(root, leaseResult.lease, reader);
      expect(result.recovered).toEqual([
        expect.objectContaining({
          operationId: "op:z-marker-owner",
          variant: "aborted-before-publish",
        }),
      ]);
      expect(existsSync(projectPath)).toBe(false);
    } finally {
      await leaseResult.lease.close();
      root.close();
      rmSync(parent, { recursive: true, force: true });
    }
  });

  test("existing terminal Artifact也必须在任何Project cleanup前通过registry preflight", async () => {
    const parent = mkdtempSync(join(tmpdir(), "dh016-recovery-terminal-artifact-"));
    const rootPath = join(parent, "root");
    bootstrapDataRoot(rootPath);
    const root = openDataRoot(rootPath);
    const leaseResult = await acquireDataRootWriterLease(root);
    if (leaseResult.status !== "acquired") throw new Error("lease unavailable");
    try {
      const journal = new OperationJournal(root, leaseResult.lease);
      const invalid = journal.admit({
        schemaVersion: 1,
        operationId: "op:z-terminal-foreign-artifact",
        operationKind: "artifact.publish",
        target: { kind: "artifact", id: "asset:foreign" },
        expectedIdentity: null,
        candidateIdentity: {
          assetId: "asset:foreign",
          digest: "5".repeat(64),
          byteLength: 1,
          format: "spz-v2",
          elementCount: 1,
          sourceBounds: { min: [0, 0, 0], max: [1, 1, 1] },
        },
      });
      if (invalid.status !== "admitted") throw new Error("unexpected replay");
      journal.finalizeAborted(invalid.operation, "OPERATION_INTERRUPTED");
      const reader = new WorldProjectWriter(
        root,
        leaseResult.lease,
        new ArtifactStoreReader(root),
      ).reader();
      expect(() => recoverPendingOperations(root, leaseResult.lease, reader))
        .toThrow("OPERATION_RECOVERY_REQUIRED");
      expect(existsSync(invalid.operation.intentPath)).toBe(true);
      expect(existsSync(invalid.operation.attemptPath)).toBe(true);
    } finally {
      await leaseResult.lease.close();
      root.close();
      rmSync(parent, { recursive: true, force: true });
    }
  });

  test("existing terminal 的 corrupt Artifact candidate 必须在 Project cleanup 前 fail closed", async () => {
    const parent = mkdtempSync(join(tmpdir(), "dh016-recovery-terminal-candidate-"));
    const rootPath = join(parent, "root");
    bootstrapDataRoot(rootPath);
    const root = openDataRoot(rootPath);
    const leaseResult = await acquireDataRootWriterLease(root);
    if (leaseResult.status !== "acquired") throw new Error("lease unavailable");
    try {
      const projectId = "project:terminal-candidate";
      const registered = MARBLE_HUNYUAN_REGISTRY.assets[0]!;
      const candidateArtifacts = [{
        assetId: registered.assetId,
        digest: registered.digest,
        byteLength: registered.byteLength,
        format: registered.format,
        elementCount: registered.elementCount,
        sourceBounds: registered.sourceBounds,
      }];
      const journal = new OperationJournal(root, leaseResult.lease);
      const admission = journal.admit({
        schemaVersion: 1,
        operationId: "op:terminal-corrupt-candidate",
        operationKind: "bundle.import",
        target: { kind: "project", id: projectId },
        expectedIdentity: null,
        candidateIdentity: {
          projectRevision: `project-revision:sha256:${"6".repeat(64)}`,
          candidateArtifacts,
          artifactSetDigest: artifactCandidateSetDigest(candidateArtifacts),
        },
      });
      if (admission.status !== "admitted") throw new Error("unexpected replay");
      const projectPath = join(rootPath, dataRootProjectPath(projectId));
      mkdirSync(projectPath, { mode: 0o700 });
      publishProjectDirectoryMarker(
        projectPath,
        admission.operation,
        readStableDirectoryIdentity(projectPath),
      );
      const lockPath = join(projectPath, ".write-lock");
      linkSync(admission.operation.intentPath, lockPath);
      const candidatePath = join(
        admission.operation.attemptPath,
        `artifact-${registered.digest}.candidate`,
      );
      writeFileSync(candidatePath, "corrupt", { mode: 0o600 });
      syncDirectory(admission.operation.attemptPath);
      journal.finalizeAborted(admission.operation, "OPERATION_INTERRUPTED");

      const reader = new WorldProjectWriter(
        root,
        leaseResult.lease,
        new ArtifactStoreReader(root),
      ).reader();
      expect(() => recoverPendingOperations(root, leaseResult.lease, reader))
        .toThrow("OPERATION_RECOVERY_REQUIRED");
      expect(existsSync(lockPath)).toBe(true);
      expect(existsSync(join(projectPath, ".created-directory.json"))).toBe(true);
      expect(existsSync(candidatePath)).toBe(true);
      expect(existsSync(admission.operation.attemptPath)).toBe(true);
    } finally {
      await leaseResult.lease.close();
      root.close();
      rmSync(parent, { recursive: true, force: true });
    }
  });

  test("existing terminal 的 malformed staged Project 必须在 Project cleanup 前 fail closed", async () => {
    const parent = mkdtempSync(join(tmpdir(), "dh016-recovery-terminal-project-"));
    const rootPath = join(parent, "root");
    bootstrapDataRoot(rootPath);
    const root = openDataRoot(rootPath);
    const leaseResult = await acquireDataRootWriterLease(root);
    if (leaseResult.status !== "acquired") throw new Error("lease unavailable");
    try {
      const projectId = "project:terminal-project";
      const journal = new OperationJournal(root, leaseResult.lease);
      const admission = journal.admit({
        schemaVersion: 1,
        operationId: "op:terminal-malformed-project",
        operationKind: "project.save-as",
        target: { kind: "project", id: projectId },
        expectedIdentity: null,
        candidateIdentity: {
          projectRevision: `project-revision:sha256:${"7".repeat(64)}`,
        },
      });
      if (admission.status !== "admitted") throw new Error("unexpected replay");
      const projectPath = join(rootPath, dataRootProjectPath(projectId));
      mkdirSync(projectPath, { mode: 0o700 });
      publishProjectDirectoryMarker(
        projectPath,
        admission.operation,
        readStableDirectoryIdentity(projectPath),
      );
      const lockPath = join(projectPath, ".write-lock");
      linkSync(admission.operation.intentPath, lockPath);
      const candidatePath = join(admission.operation.attemptPath, "project.json");
      writeFileSync(candidatePath, "{malformed", { mode: 0o600 });
      syncDirectory(admission.operation.attemptPath);
      journal.finalizeAborted(admission.operation, "OPERATION_INTERRUPTED");

      const reader = new WorldProjectWriter(
        root,
        leaseResult.lease,
        new ArtifactStoreReader(root),
      ).reader();
      expect(() => recoverPendingOperations(root, leaseResult.lease, reader))
        .toThrow("OPERATION_RECOVERY_REQUIRED");
      expect(existsSync(lockPath)).toBe(true);
      expect(existsSync(join(projectPath, ".created-directory.json"))).toBe(true);
      expect(existsSync(candidatePath)).toBe(true);
      expect(existsSync(admission.operation.attemptPath)).toBe(true);
    } finally {
      await leaseResult.lease.close();
      root.close();
      rmSync(parent, { recursive: true, force: true });
    }
  });

  test("较晚invalid attempt必须在较早terminal Project cleanup前被全局preflight拒绝", async () => {
    const parent = mkdtempSync(join(tmpdir(), "dh016-recovery-global-preflight-"));
    const rootPath = join(parent, "root");
    bootstrapDataRoot(rootPath);
    const root = openDataRoot(rootPath);
    const leaseResult = await acquireDataRootWriterLease(root);
    if (leaseResult.status !== "acquired") throw new Error("lease unavailable");
    try {
      const journal = new OperationJournal(root, leaseResult.lease);
      const projectId = "project:global-preflight";
      const earlier = journal.admit({
        schemaVersion: 1,
        operationId: "op:a-terminal-project",
        operationKind: "project.save-as",
        target: { kind: "project", id: projectId },
        expectedIdentity: null,
        candidateIdentity: {
          projectRevision: `project-revision:sha256:${"8".repeat(64)}`,
        },
      });
      if (earlier.status !== "admitted") throw new Error("unexpected replay");
      const projectPath = join(rootPath, dataRootProjectPath(projectId));
      mkdirSync(projectPath, { mode: 0o700 });
      publishProjectDirectoryMarker(
        projectPath,
        earlier.operation,
        readStableDirectoryIdentity(projectPath),
      );
      const lockPath = join(projectPath, ".write-lock");
      linkSync(earlier.operation.intentPath, lockPath);
      journal.finalizeAborted(earlier.operation, "OPERATION_INTERRUPTED");

      const registered = MARBLE_HUNYUAN_REGISTRY.assets[0]!;
      const later = journal.admit({
        schemaVersion: 1,
        operationId: "op:z-terminal-artifact",
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
      if (later.status !== "admitted") throw new Error("unexpected replay");
      const corruptCandidate = join(
        later.operation.attemptPath,
        `artifact-${registered.digest}.candidate`,
      );
      writeFileSync(corruptCandidate, "corrupt", { mode: 0o600 });
      syncDirectory(later.operation.attemptPath);
      journal.finalizeAborted(later.operation, "OPERATION_INTERRUPTED");

      const reader = new WorldProjectWriter(
        root,
        leaseResult.lease,
        new ArtifactStoreReader(root),
      ).reader();
      expect(() => recoverPendingOperations(root, leaseResult.lease, reader))
        .toThrow("OPERATION_RECOVERY_REQUIRED");
      expect(existsSync(projectPath)).toBe(true);
      expect(existsSync(lockPath)).toBe(true);
      expect(existsSync(earlier.operation.attemptPath)).toBe(true);
      expect(existsSync(corruptCandidate)).toBe(true);
      expect(existsSync(later.operation.attemptPath)).toBe(true);
    } finally {
      await leaseResult.lease.close();
      root.close();
      rmSync(parent, { recursive: true, force: true });
    }
  });

  test("orphan staging entry必须在较早terminal cleanup前被全局coverage拒绝", async () => {
    const parent = mkdtempSync(join(tmpdir(), "dh016-recovery-orphan-staging-"));
    const rootPath = join(parent, "root");
    bootstrapDataRoot(rootPath);
    const root = openDataRoot(rootPath);
    const leaseResult = await acquireDataRootWriterLease(root);
    if (leaseResult.status !== "acquired") throw new Error("lease unavailable");
    try {
      const journal = new OperationJournal(root, leaseResult.lease);
      const projectId = "project:orphan-staging";
      const terminal = journal.admit({
        schemaVersion: 1,
        operationId: "op:a-orphan-victim",
        operationKind: "project.save-as",
        target: { kind: "project", id: projectId },
        expectedIdentity: null,
        candidateIdentity: {
          projectRevision: `project-revision:sha256:${"9".repeat(64)}`,
        },
      });
      if (terminal.status !== "admitted") throw new Error("unexpected replay");
      const projectPath = join(rootPath, dataRootProjectPath(projectId));
      mkdirSync(projectPath, { mode: 0o700 });
      publishProjectDirectoryMarker(
        projectPath,
        terminal.operation,
        readStableDirectoryIdentity(projectPath),
      );
      const lockPath = join(projectPath, ".write-lock");
      linkSync(terminal.operation.intentPath, lockPath);
      journal.finalizeAborted(terminal.operation, "OPERATION_INTERRUPTED");
      const orphanPath = join(rootPath, "staging", "orphan-entry");
      mkdirSync(orphanPath, { mode: 0o700 });
      syncDirectory(join(rootPath, "staging"));

      const reader = new WorldProjectWriter(
        root,
        leaseResult.lease,
        new ArtifactStoreReader(root),
      ).reader();
      expect(() => recoverPendingOperations(root, leaseResult.lease, reader))
        .toThrow("OPERATION_RECOVERY_REQUIRED");
      expect(existsSync(projectPath)).toBe(true);
      expect(existsSync(lockPath)).toBe(true);
      expect(existsSync(terminal.operation.attemptPath)).toBe(true);
      expect(existsSync(orphanPath)).toBe(true);
    } finally {
      await leaseResult.lease.close();
      root.close();
      rmSync(parent, { recursive: true, force: true });
    }
  });

  test("较晚pending Project destination必须在较早terminal cleanup与beginRecovery前全局分类", async () => {
    const parent = mkdtempSync(join(tmpdir(), "dh016-recovery-pending-destination-"));
    const rootPath = join(parent, "root");
    bootstrapDataRoot(rootPath);
    const root = openDataRoot(rootPath);
    const leaseResult = await acquireDataRootWriterLease(root);
    if (leaseResult.status !== "acquired") throw new Error("lease unavailable");
    try {
      const journal = new OperationJournal(root, leaseResult.lease);
      const earlierProjectId = "project:pending-victim";
      const earlier = journal.admit({
        schemaVersion: 1,
        operationId: "op:a-terminal-pending-victim",
        operationKind: "project.save-as",
        target: { kind: "project", id: earlierProjectId },
        expectedIdentity: null,
        candidateIdentity: {
          projectRevision: `project-revision:sha256:${"a".repeat(64)}`,
        },
      });
      if (earlier.status !== "admitted") throw new Error("unexpected replay");
      const earlierProjectPath = join(rootPath, dataRootProjectPath(earlierProjectId));
      mkdirSync(earlierProjectPath, { mode: 0o700 });
      publishProjectDirectoryMarker(
        earlierProjectPath,
        earlier.operation,
        readStableDirectoryIdentity(earlierProjectPath),
      );
      linkSync(earlier.operation.intentPath, join(earlierProjectPath, ".write-lock"));
      journal.finalizeAborted(earlier.operation, "OPERATION_INTERRUPTED");

      const laterProjectId = "project:pending-invalid";
      const later = journal.admit({
        schemaVersion: 1,
        operationId: "op:z-invalid-project",
        operationKind: "project.save-as",
        target: { kind: "project", id: laterProjectId },
        expectedIdentity: null,
        candidateIdentity: {
          projectRevision: `project-revision:sha256:${"b".repeat(64)}`,
        },
      });
      if (later.status !== "admitted") throw new Error("unexpected replay");
      const laterProjectPath = join(rootPath, dataRootProjectPath(laterProjectId));
      mkdirSync(laterProjectPath, { mode: 0o700 });
      writeFileSync(join(laterProjectPath, "project.json"), "{malformed", { mode: 0o600 });
      const stagingBefore = new Set(
        [earlier.operation.attemptPath, later.operation.attemptPath],
      );

      const reader = new WorldProjectWriter(
        root,
        leaseResult.lease,
        new ArtifactStoreReader(root),
      ).reader();
      expect(() => recoverPendingOperations(root, leaseResult.lease, reader))
        .toThrow("OPERATION_RECOVERY_REQUIRED");
      expect(existsSync(earlierProjectPath)).toBe(true);
      expect(existsSync(earlier.operation.attemptPath)).toBe(true);
      expect(existsSync(later.operation.attemptPath)).toBe(true);
      expect(new Set(
        readdirSync(join(rootPath, "staging")).map((name) => join(rootPath, "staging", name)),
      )).toEqual(stagingBefore);
    } finally {
      await leaseResult.lease.close();
      root.close();
      rmSync(parent, { recursive: true, force: true });
    }
  });

  test("startup 对 Artifact descriptor 或 target 漂移保留 evidence 并拒绝 terminalize", async () => {
    const parent = mkdtempSync(join(tmpdir(), "dh016-recovery-artifact-binding-"));
    const rootPath = join(parent, "root");
    bootstrapDataRoot(rootPath);
    const root = openDataRoot(rootPath);
    const leaseResult = await acquireDataRootWriterLease(root);
    if (leaseResult.status !== "acquired") throw new Error("lease unavailable");
    try {
      const registered = MARBLE_HUNYUAN_REGISTRY.assets[0]!;
      const binding: OperationBinding = {
        schemaVersion: 1,
        operationId: "op:bad-artifact-descriptor",
        operationKind: "artifact.publish",
        target: { kind: "artifact", id: registered.assetId },
        expectedIdentity: null,
        candidateIdentity: {
          assetId: registered.assetId,
          digest: registered.digest,
          byteLength: registered.byteLength,
          format: registered.format,
          elementCount: registered.elementCount + 1,
          sourceBounds: registered.sourceBounds,
        },
      };
      const journal = new OperationJournal(root, leaseResult.lease);
      const admission = journal.admit(binding);
      if (admission.status !== "admitted") throw new Error("unexpected replay");
      const reader = new WorldProjectWriter(
        root,
        leaseResult.lease,
        new ArtifactStoreReader(root),
      ).reader();
      expect(() => recoverPendingOperations(root, leaseResult.lease, reader))
        .toThrow("OPERATION_RECOVERY_REQUIRED");
      expect(existsSync(admission.operation.intentPath)).toBe(true);
      expect(existsSync(admission.operation.attemptPath)).toBe(true);
      expect(existsSync(join(
        rootPath,
        dataRootReceiptResultPath(binding.operationId),
      ))).toBe(false);
    } finally {
      await leaseResult.lease.close();
      root.close();
      rmSync(parent, { recursive: true, force: true });
    }
  });
});
