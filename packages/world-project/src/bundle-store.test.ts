import { describe, expect, test } from "bun:test";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { RuntimeMvpHost, createInitialSnapshot } from "@demiurges/world";

import { ArtifactStoreReader } from "./artifact-store";
import { WorldProjectBundleStore } from "./bundle-store";
import { bootstrapDataRoot, openDataRoot, type OpenedDataRoot } from "./data-root";
import {
  acquireDataRootWriterLease,
  type DataRootWriterLease,
} from "./data-root-lease";
import {
  WorldProjectWriter,
  createWorldProjectManifest,
} from "./project-store";
import { PROJECT_DIRECTORY_MARKER_TEST_SEAMS } from "./project-directory-marker";
import { recoverPendingOperations } from "./startup-recovery";

interface RootAuthority {
  readonly parent: string;
  readonly root: OpenedDataRoot;
  readonly lease: DataRootWriterLease;
}

async function makeRoot(): Promise<RootAuthority> {
  const parent = mkdtempSync(join(tmpdir(), "dh016-bundle-store-"));
  const path = join(parent, "root");
  bootstrapDataRoot(path);
  const root = openDataRoot(path);
  const lease = await acquireDataRootWriterLease(root);
  if (lease.status !== "acquired") throw new Error("lease unavailable");
  return { parent, root, lease: lease.lease };
}

async function cleanup(authority: RootAuthority): Promise<void> {
  await authority.lease.close();
  authority.root.close();
  rmSync(authority.parent, { recursive: true, force: true });
}

describe("WorldProjectBundleStore", () => {
  test("Phase A把ownerless empty target视为冲突且不发布receipt", async () => {
    const source = await makeRoot();
    const target = await makeRoot();
    try {
      const host = new RuntimeMvpHost();
      host.write(createInitialSnapshot());
      const manifest = createWorldProjectManifest(
        "project:bundle-ownerless-target",
        "Ownerless target",
        host.exportProjectHistory(),
      );
      const sourceWriter = new WorldProjectWriter(
        source.root,
        source.lease,
        new ArtifactStoreReader(source.root),
      );
      await sourceWriter.save(manifest, "op:bundle-ownerless-source", null);
      const bytes = new WorldProjectBundleStore(source.root, source.lease)
        .export(manifest.projectId);

      const rootPath = target.root.absolutePath;
      mkdirSync(join(rootPath, "projects"), { mode: 0o700 });
      mkdirSync(join(rootPath, "projects", manifest.projectId), { mode: 0o700 });
      await expect(
        new WorldProjectBundleStore(target.root, target.lease)
          .import(bytes, "op:bundle-ownerless-target"),
      ).rejects.toMatchObject({ code: "PROJECT_ID_CONFLICT" });
      expect(readdirSync(rootPath)).toEqual(["projects"]);
      expect(readdirSync(join(rootPath, "projects", manifest.projectId))).toEqual([]);
    } finally {
      await cleanup(source);
      await cleanup(target);
    }
  });

  test("Phase A拒绝exact Project旁的foreign entry且不发布新receipt", async () => {
    const source = await makeRoot();
    const target = await makeRoot();
    try {
      const host = new RuntimeMvpHost();
      host.write(createInitialSnapshot());
      const manifest = createWorldProjectManifest(
        "project:bundle-exact-foreign",
        "Exact plus foreign",
        host.exportProjectHistory(),
      );
      const sourceWriter = new WorldProjectWriter(
        source.root,
        source.lease,
        new ArtifactStoreReader(source.root),
      );
      const targetWriter = new WorldProjectWriter(
        target.root,
        target.lease,
        new ArtifactStoreReader(target.root),
      );
      await sourceWriter.save(manifest, "op:bundle-exact-foreign-source", null);
      await targetWriter.save(manifest, "op:bundle-exact-foreign-target-save", null);
      const bytes = new WorldProjectBundleStore(source.root, source.lease)
        .export(manifest.projectId);
      const targetPath = join(target.root.absolutePath, "projects", manifest.projectId);
      writeFileSync(join(targetPath, "foreign"), "preserve", { mode: 0o600 });

      await expect(
        new WorldProjectBundleStore(target.root, target.lease)
          .import(bytes, "op:bundle-exact-foreign-import"),
      ).rejects.toMatchObject({ code: "PROJECT_ID_CONFLICT" });
      expect(readdirSync(targetPath).sort()).toEqual(["foreign", "project.json"]);
      expect(existsSync(join(
        target.root.absolutePath,
        "receipts",
        "op:bundle-exact-foreign-import.intent.json",
      ))).toBe(false);
      expect(existsSync(join(
        target.root.absolutePath,
        "receipts",
        "op:bundle-exact-foreign-import.result.json",
      ))).toBe(false);
    } finally {
      await cleanup(source);
      await cleanup(target);
    }
  });

  test("Phase A对malformed、symlink与wrong-type target保持零Data Root publish", async () => {
    const source = await makeRoot();
    try {
      const host = new RuntimeMvpHost();
      host.write(createInitialSnapshot());
      const manifest = createWorldProjectManifest(
        "project:bundle-invalid-target-matrix",
        "Invalid target matrix",
        host.exportProjectHistory(),
      );
      const sourceWriter = new WorldProjectWriter(
        source.root,
        source.lease,
        new ArtifactStoreReader(source.root),
      );
      await sourceWriter.save(manifest, "op:bundle-invalid-target-source", null);
      const bytes = new WorldProjectBundleStore(source.root, source.lease)
        .export(manifest.projectId);

      for (const targetKind of ["malformed", "symlink", "wrong-type"] as const) {
        const target = await makeRoot();
        try {
          const rootPath = target.root.absolutePath;
          const projectsPath = join(rootPath, "projects");
          const projectPath = join(projectsPath, manifest.projectId);
          mkdirSync(projectsPath, { mode: 0o700 });
          if (targetKind === "malformed") {
            mkdirSync(projectPath, { mode: 0o700 });
            writeFileSync(join(projectPath, "project.json"), "not-json", { mode: 0o600 });
          } else if (targetKind === "symlink") {
            const outside = join(target.parent, "outside-project");
            mkdirSync(outside, { mode: 0o700 });
            symlinkSync(outside, projectPath);
          } else {
            writeFileSync(projectPath, "not-a-directory", { mode: 0o600 });
          }

          await expect(
            new WorldProjectBundleStore(target.root, target.lease)
              .import(bytes, `op:bundle-invalid-target-${targetKind}`),
          ).rejects.toBeDefined();
          expect(existsSync(join(rootPath, "receipts"))).toBe(false);
          expect(existsSync(join(rootPath, "staging"))).toBe(false);
          expect(existsSync(join(rootPath, "artifacts"))).toBe(false);
        } finally {
          await cleanup(target);
        }
      }
    } finally {
      await cleanup(source);
    }
  });

  test("空 Data Root import 后 identity exact；same key replay；export byte-identical", async () => {
    const source = await makeRoot();
    const target = await makeRoot();
    try {
      const host = new RuntimeMvpHost();
      host.write(createInitialSnapshot());
      host.editCurrentCubeHeight(host.readRefRecord(), 3);
      const manifest = createWorldProjectManifest(
        "project:portable",
        "Portable World",
        host.exportProjectHistory(),
      );
      const sourceArtifacts = new ArtifactStoreReader(source.root);
      const sourceWriter = new WorldProjectWriter(
        source.root,
        source.lease,
        sourceArtifacts,
      );
      await sourceWriter.save(manifest, "op:source-save", null);
      const sourceBundles = new WorldProjectBundleStore(source.root, source.lease);
      const bytes = sourceBundles.export(manifest.projectId);
      expect(sourceBundles.export(manifest.projectId)).toEqual(bytes);

      const targetBundles = new WorldProjectBundleStore(target.root, target.lease);
      const imported = await targetBundles.import(bytes, "op:bundle-import");
      expect(imported).toMatchObject({
        projectId: manifest.projectId,
        revision: manifest.revision,
        replayed: false,
        terminal: { variant: "success" },
      });
      const targetReader = new WorldProjectWriter(
        target.root,
        target.lease,
        new ArtifactStoreReader(target.root),
      ).reader();
      expect(targetReader.open(manifest.projectId)).toEqual(manifest);
      expect(targetBundles.export(manifest.projectId)).toEqual(bytes);

      const replay = await targetBundles.import(bytes, "op:bundle-import");
      expect(replay.replayed).toBe(true);
      expect(replay.terminal).toEqual(imported.terminal);
    } finally {
      await cleanup(source);
      await cleanup(target);
    }
  });

  test("Phase A invalid bundle 不创建 layout", async () => {
    const target = await makeRoot();
    try {
      const store = new WorldProjectBundleStore(target.root, target.lease);
      await expect(store.import(new Uint8Array([1, 2, 3]), "op:invalid"))
        .rejects.toMatchObject({ code: "BUNDLE_INVALID" });
      const rootPath = target.root.absolutePath;
      expect(readdirSync(rootPath)).toEqual([]);
    } finally {
      await cleanup(target);
    }
  });

  test("bundle import 在atomic directory publish前中断，restart只回收完整candidate", async () => {
    const source = await makeRoot();
    const targetParent = mkdtempSync(join(tmpdir(), "dh016-bundle-candidate-crash-"));
    const targetPath = join(targetParent, "root");
    bootstrapDataRoot(targetPath);
    let targetRoot = openDataRoot(targetPath);
    let targetLeaseResult = await acquireDataRootWriterLease(targetRoot);
    if (targetLeaseResult.status !== "acquired") throw new Error("lease unavailable");
    try {
      const host = new RuntimeMvpHost();
      host.write(createInitialSnapshot());
      const manifest = createWorldProjectManifest(
        "project:bundle-candidate-crash",
        "Bundle candidate crash",
        host.exportProjectHistory(),
      );
      const sourceWriter = new WorldProjectWriter(
        source.root,
        source.lease,
        new ArtifactStoreReader(source.root),
      );
      await sourceWriter.save(manifest, "op:bundle-candidate-source", null);
      const bytes = new WorldProjectBundleStore(source.root, source.lease)
        .export(manifest.projectId);

      const restorePublish = PROJECT_DIRECTORY_MARKER_TEST_SEAMS
        .replaceBeforeCandidatePublish(() => {
          throw new Error("injected bundle candidate publish failure");
        });
      try {
        const store = new WorldProjectBundleStore(
          targetRoot,
          targetLeaseResult.lease,
        );
        await expect(store.import(bytes, "op:bundle-candidate-crash")).rejects.toThrow(
          "injected bundle candidate publish failure",
        );
        expect(existsSync(join(targetPath, "projects", manifest.projectId))).toBe(false);
        const [attemptName] = readdirSync(join(targetPath, "staging"));
        expect(readdirSync(join(targetPath, "staging", attemptName!))).toContain(
          "project-directory.candidate",
        );
      } finally {
        restorePublish();
        await targetLeaseResult.lease.close();
        targetRoot.close();
      }

      targetRoot = openDataRoot(targetPath);
      targetLeaseResult = await acquireDataRootWriterLease(targetRoot);
      if (targetLeaseResult.status !== "acquired") throw new Error("lease unavailable");
      const targetWriter = new WorldProjectWriter(
        targetRoot,
        targetLeaseResult.lease,
        new ArtifactStoreReader(targetRoot),
      );
      expect(recoverPendingOperations(
        targetRoot,
        targetLeaseResult.lease,
        targetWriter.reader(),
      )).toMatchObject({ recovered: [{ operationId: "op:bundle-candidate-crash" }] });
      expect(readdirSync(join(targetPath, "staging"))).toEqual([]);
      await expect(
        new WorldProjectBundleStore(targetRoot, targetLeaseResult.lease)
          .import(bytes, "op:bundle-candidate-retry"),
      ).resolves.toMatchObject({ projectId: manifest.projectId, replayed: false });
    } finally {
      await targetLeaseResult.lease.close().catch(() => undefined);
      targetRoot.close();
      rmSync(targetParent, { recursive: true, force: true });
      await cleanup(source);
    }
  });
});
