import { describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import {
  RuntimeMvpHost,
  createInitialSnapshot,
  type RepositoryHistory,
} from "@demiurges/world";

import { bootstrapDataRoot, openDataRoot } from "./data-root";
import { acquireDataRootWriterLease } from "./data-root-lease";
import {
  ProjectStoreError,
  WorldProjectReader,
  WorldProjectWriter,
  createWorldProjectManifest,
  type ProjectArtifactVerifier,
} from "./project-store";
import { encodeWorldProjectManifestV1 } from "./world-project-manifest";
import { SAFE_FILESYSTEM_TEST_SEAMS } from "./safe-filesystem";
import { PROJECT_DIRECTORY_MARKER_TEST_SEAMS } from "./project-directory-marker";
import { recoverPendingOperations } from "./startup-recovery";

const NO_EXTERNAL_ARTIFACTS: ProjectArtifactVerifier = Object.freeze({
  verify() {
    throw new Error("primitive project 不应请求 external Artifact");
  },
});

function primitiveHistory(edited = false): RepositoryHistory {
  const host = new RuntimeMvpHost();
  host.write(createInitialSnapshot());
  if (edited) host.editCurrentCubeHeight(host.readRefRecord(), 3);
  return host.exportProjectHistory();
}

async function withStore(
  run: (
    writer: WorldProjectWriter,
    reader: WorldProjectReader,
    rootPath: string,
  ) => Promise<void>,
): Promise<void> {
  const parent = mkdtempSync(join(tmpdir(), "dh016-project-store-"));
  const rootPath = join(parent, "root");
  bootstrapDataRoot(rootPath);
  const root = openDataRoot(rootPath);
  const leaseResult = await acquireDataRootWriterLease(root);
  expect(leaseResult.status).toBe("acquired");
  if (leaseResult.status !== "acquired") throw new Error("lease unavailable");
  const writer = new WorldProjectWriter(root, leaseResult.lease, NO_EXTERNAL_ARTIFACTS);
  try {
    await run(writer, writer.reader(), rootPath);
  } finally {
    await leaseResult.lease.close();
    root.close();
    rmSync(parent, { recursive: true, force: true });
  }
}

describe("World Project store", () => {
  test("Save As → Open/restore → Save CAS 保持 exact lineage/ref/revision", async () => {
    await withStore(async (writer, reader) => {
      const v1 = createWorldProjectManifest(
        "project:demo",
        "演示世界",
        primitiveHistory(false),
      );
      const first = await writer.save(v1, "op:save-v1", null);
      expect(first.replayed).toBe(false);
      expect(reader.open(v1.projectId)).toEqual(v1);
      const restored = reader.restoreHost(v1.projectId);
      expect(restored.host.exportProjectHistory()).toEqual({
        snapshots: v1.snapshots,
        cursor: v1.history.cursor,
        currentRef: v1.currentRef,
      });

      const v2 = createWorldProjectManifest(
        "project:demo",
        "演示世界",
        primitiveHistory(true),
      );
      const second = await writer.save(v2, "op:save-v2", v1.revision);
      expect(second.manifest.revision).toBe(v2.revision);
      expect(reader.open(v2.projectId)).toEqual(v2);
      expect(reader.list()).toMatchObject({
        projects: [{
          projectId: "project:demo",
          displayName: "演示世界",
          revision: v2.revision,
        }],
        rejectedEntryCount: 0,
      });
    });
  });

  test("same key replay；binding drift 与 stale expected 均不覆盖 published Project", async () => {
    await withStore(async (writer, reader) => {
      const v1 = createWorldProjectManifest("project:demo", "v1", primitiveHistory());
      const first = await writer.save(v1, "op:stable", null);
      const replay = await writer.save(v1, "op:stable", null);
      expect(replay.replayed).toBe(true);
      expect(replay.terminal).toEqual(first.terminal);

      const v2 = createWorldProjectManifest("project:demo", "v2", primitiveHistory(true));
      await expect(writer.save(v2, "op:stable", v1.revision)).rejects.toMatchObject({
        code: "OPERATION_BINDING_CONFLICT",
      });
      await expect(
        writer.save(v2, "op:stale", `project-revision:sha256:${"f".repeat(64)}`),
      ).rejects.toMatchObject({ code: "PROJECT_REVISION_CONFLICT" });
      expect(reader.open(v1.projectId)).toEqual(v1);
    });
  });

  test("Save As 在建目录/锁后 abort 会精确回收 operation-created 空目录", async () => {
    await withStore(async (writer, _reader, rootPath) => {
      const manifest = createWorldProjectManifest(
        "project:abort-orphan",
        "Abort cleanup",
        primitiveHistory(),
      );
      let abortedReads = 0;
      const signal = {
        get aborted() {
          abortedReads += 1;
          return abortedReads >= 4;
        },
        addEventListener() {},
        removeEventListener() {},
      } as unknown as AbortSignal;
      await expect(
        writer.save(manifest, "op:saveas-abort", null, signal),
      ).rejects.toMatchObject({ code: "REQUEST_ABORTED" });
      const projectPath = join(rootPath, "projects", manifest.projectId);
      expect(existsSync(projectPath)).toBe(false);
      expect(readdirSync(join(rootPath, "staging"))).toEqual([]);

      await expect(
        writer.save(manifest, "op:saveas-abort", null),
      ).rejects.toMatchObject({ code: "REQUEST_ABORTED" });
      expect(existsSync(projectPath)).toBe(false);
    });
  });

  test("Save As 创建目录后 projects fsync 失败，restart 可凭 marker 回收并以新 operation 重试", async () => {
    const parent = mkdtempSync(join(tmpdir(), "dh016-project-parent-fsync-"));
    const rootPath = join(parent, "root");
    bootstrapDataRoot(rootPath);
    let root = openDataRoot(rootPath);
    let leaseResult = await acquireDataRootWriterLease(root);
    if (leaseResult.status !== "acquired") throw new Error("lease unavailable");
    const manifest = createWorldProjectManifest(
      "project:parent-fsync-retry",
      "Parent fsync retry",
      primitiveHistory(),
    );
    const projectsPath = join(rootPath, "projects");
    const restoreSync = SAFE_FILESYSTEM_TEST_SEAMS.replaceDirectorySync(
      (path, actual) => {
        if (path === projectsPath) throw new Error("injected projects fsync failure");
        actual(path);
      },
    );
    try {
      const writer = new WorldProjectWriter(root, leaseResult.lease, NO_EXTERNAL_ARTIFACTS);
      await expect(writer.save(manifest, "op:parent-fsync-fail", null)).rejects.toThrow(
        "injected projects fsync failure",
      );
      const projectPath = join(projectsPath, manifest.projectId);
      expect(readdirSync(projectPath)).toContain(".created-directory.json");
      expect(readdirSync(join(rootPath, "staging")).length).toBe(1);
    } finally {
      restoreSync();
      await leaseResult.lease.close();
      root.close();
    }

    root = openDataRoot(rootPath);
    leaseResult = await acquireDataRootWriterLease(root);
    if (leaseResult.status !== "acquired") throw new Error("lease unavailable");
    try {
      const writer = new WorldProjectWriter(root, leaseResult.lease, NO_EXTERNAL_ARTIFACTS);
      const recovered = recoverPendingOperations(root, leaseResult.lease, writer.reader());
      expect(recovered.recovered).toEqual([
        expect.objectContaining({
          operationId: "op:parent-fsync-fail",
          variant: "aborted-before-publish",
        }),
      ]);
      expect(existsSync(join(projectsPath, manifest.projectId))).toBe(false);
      expect(readdirSync(join(rootPath, "staging"))).toEqual([]);
      await expect(writer.save(manifest, "op:parent-fsync-retry", null)).resolves.toMatchObject({
        manifest: { projectId: manifest.projectId },
        replayed: false,
      });
    } finally {
      await leaseResult.lease.close();
      root.close();
      rmSync(parent, { recursive: true, force: true });
    }
  });

  test("Save As 在atomic directory publish前中断，只留下完整staged candidate并可restart收束", async () => {
    const parent = mkdtempSync(join(tmpdir(), "dh016-project-candidate-crash-"));
    const rootPath = join(parent, "root");
    bootstrapDataRoot(rootPath);
    let root = openDataRoot(rootPath);
    let leaseResult = await acquireDataRootWriterLease(root);
    if (leaseResult.status !== "acquired") throw new Error("lease unavailable");
    const manifest = createWorldProjectManifest(
      "project:candidate-crash",
      "Candidate crash",
      primitiveHistory(),
    );
    const restorePublish = PROJECT_DIRECTORY_MARKER_TEST_SEAMS
      .replaceBeforeCandidatePublish(() => {
        throw new Error("injected before candidate publish");
      });
    try {
      const writer = new WorldProjectWriter(root, leaseResult.lease, NO_EXTERNAL_ARTIFACTS);
      await expect(writer.save(manifest, "op:candidate-crash", null)).rejects.toThrow(
        "injected before candidate publish",
      );
      expect(existsSync(join(rootPath, "projects", manifest.projectId))).toBe(false);
      const [attemptName] = readdirSync(join(rootPath, "staging"));
      const attemptPath = join(rootPath, "staging", attemptName!);
      expect(readdirSync(attemptPath).sort()).toEqual([
        "operation-intent.json",
        "project-directory.candidate",
        "project-directory.json",
      ]);
      expect(readdirSync(join(attemptPath, "project-directory.candidate")))
        .toEqual([".created-directory.json"]);
    } finally {
      restorePublish();
      await leaseResult.lease.close();
      root.close();
    }

    root = openDataRoot(rootPath);
    leaseResult = await acquireDataRootWriterLease(root);
    if (leaseResult.status !== "acquired") throw new Error("lease unavailable");
    try {
      const writer = new WorldProjectWriter(root, leaseResult.lease, NO_EXTERNAL_ARTIFACTS);
      expect(recoverPendingOperations(root, leaseResult.lease, writer.reader()))
        .toMatchObject({ recovered: [{ operationId: "op:candidate-crash" }] });
      expect(readdirSync(join(rootPath, "staging"))).toEqual([]);
      await expect(writer.save(manifest, "op:candidate-retry", null)).resolves.toMatchObject({
        replayed: false,
      });
    } finally {
      await leaseResult.lease.close();
      root.close();
      rmSync(parent, { recursive: true, force: true });
    }
  });

  test("operation-created 目录出现未知 entry 时保留现场并 fail closed", async () => {
    await withStore(async (writer, _reader, rootPath) => {
      const manifest = createWorldProjectManifest(
        "project:abort-foreign-entry",
        "Abort foreign entry",
        primitiveHistory(),
      );
      const projectPath = join(rootPath, "projects", manifest.projectId);
      let abortedReads = 0;
      const signal = {
        get aborted() {
          abortedReads += 1;
          if (abortedReads === 4) {
            writeFileSync(join(projectPath, "foreign"), "preserve", { mode: 0o600 });
          }
          return abortedReads >= 4;
        },
        addEventListener() {},
        removeEventListener() {},
      } as unknown as AbortSignal;
      await expect(
        writer.save(manifest, "op:saveas-foreign-entry", null, signal),
      ).rejects.toMatchObject({ code: "OPERATION_RECOVERY_REQUIRED" });
      expect(readdirSync(projectPath).sort()).toEqual([
        ".created-directory.json",
        "foreign",
      ]);
      expect(readdirSync(join(rootPath, "receipts")))
        .toContain("op:saveas-foreign-entry.result.json");
    });
  });

  test("损坏/非 canonical/symlink Project 不会成为可恢复 authority", async () => {
    await withStore(async (writer, reader, rootPath) => {
      const v1 = createWorldProjectManifest("project:demo", "v1", primitiveHistory());
      await writer.save(v1, "op:save", null);
      const projectFile = join(rootPath, "projects", "project:demo", "project.json");
      writeFileSync(projectFile, `${JSON.stringify(v1)}\n`);
      expect(() => reader.open(v1.projectId)).toThrow(ProjectStoreError);
      expect(reader.list()).toMatchObject({ projects: [], rejectedEntryCount: 1 });
    });
  });

  test("Project中间目录symlink不能把Open/List带出Data Root", async () => {
    await withStore(async (_writer, reader, rootPath) => {
      const projectId = "project:outside";
      const outside = join(rootPath, "..", "outside-project");
      mkdirSync(outside, { mode: 0o700 });
      const manifest = createWorldProjectManifest(projectId, "Outside", primitiveHistory());
      writeFileSync(join(outside, "project.json"), encodeWorldProjectManifestV1(manifest), {
        mode: 0o600,
      });
      symlinkSync(outside, join(rootPath, "projects", projectId));
      expect(() => reader.open(projectId)).toThrow(
        expect.objectContaining({ code: "PROJECT_RECOVERY_REQUIRED" }),
      );
      expect(reader.list()).toMatchObject({ projects: [], rejectedEntryCount: 1 });
    });
  });

  test("projects layout目录symlink不能把Open/List带出Data Root", async () => {
    await withStore(async (_writer, reader, rootPath) => {
      const projectId = "project:outside-layout";
      const outside = join(rootPath, "..", "outside-projects");
      mkdirSync(join(outside, projectId), { mode: 0o700, recursive: true });
      const manifest = createWorldProjectManifest(projectId, "Outside layout", primitiveHistory());
      writeFileSync(
        join(outside, projectId, "project.json"),
        encodeWorldProjectManifestV1(manifest),
        { mode: 0o600 },
      );
      rmdirSync(join(rootPath, "projects"));
      symlinkSync(outside, join(rootPath, "projects"));
      expect(() => reader.open(projectId)).toThrow(
        expect.objectContaining({ code: "PROJECT_RECOVERY_REQUIRED" }),
      );
      expect(() => reader.list()).toThrow(
        expect.objectContaining({ code: "PROJECT_RECOVERY_REQUIRED" }),
      );
    });
  });
});
