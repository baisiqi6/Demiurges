import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readdirSync, rmdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  bootstrapDataRoot,
  openDataRoot,
  type OpenedDataRoot,
} from "./data-root";
import {
  acquireDataRootWriterLease,
  type DataRootWriterLease,
} from "./data-root-lease";
import { ArtifactStoreReader } from "./artifact-store";
import { ensureDataRootLayout } from "./data-root-layout";
import { authorizeFirstGenerationCapacity } from "./first-generation-capacity";
import {
  createGenerationBinding,
  createGenerationIntent,
  requireGenerationRequest,
} from "./generation-contracts";
import {
  GenerationNamespaceInstaller,
  GENERATION_NAMESPACE_INSTALLER_TEST_SEAMS,
  type GenerationNamespaceRecoveryPlan,
  type GenerationNamespaceInstallerStage,
} from "./generation-namespace-installer";
import { inspectGenerationNamespace } from "./generation-namespace-inspection";
import { WorldProjectWriter } from "./project-store";
import { recoverPendingOperations } from "./startup-recovery";

async function withRoot(
  run: (
    root: OpenedDataRoot,
    lease: DataRootWriterLease,
    rootPath: string,
  ) => Promise<void> | void,
): Promise<void> {
  const parent = mkdtempSync(join(tmpdir(), "dh017-namespace-installer-"));
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

function install(
  root: OpenedDataRoot,
  lease: DataRootWriterLease,
): "installed" | "replay" {
  const admission = authorizeFirstGenerationCapacity(root, lease, createGenerationIntent(
    createGenerationBinding(requireGenerationRequest({
      provider: "worldlabs-marble-v1",
      model: "marble-1.1",
      prompt: "namespace installer capacity",
      costUnknownAccepted: true,
      waitForCompletionAndDownload: true,
      idempotencyKey: "namespace-installer-capacity",
    }), {
      contractProfile: "worldlabs-openapi-2026-08-15-v1",
      contractShapeDigest: "a".repeat(64),
    }), "2026-08-15T10:00:00.000Z"));
  expect(admission.status).toBe("authorized");
  if (admission.status !== "authorized") throw new Error("capacity unavailable");
  return new GenerationNamespaceInstaller(root, lease)
    .install(admission.capability).status;
}

function throwAt(target: GenerationNamespaceInstallerStage): () => void {
  return GENERATION_NAMESPACE_INSTALLER_TEST_SEAMS.replaceStageHook((stage) => {
    if (stage === target) throw new Error(`FAULT:${stage}`);
  });
}

function snapshotTree(path: string, prefix = ""): readonly string[] {
  const entries: string[] = [];
  for (const entry of readdirSync(path, { withFileTypes: true }).sort((left, right) =>
    left.name.localeCompare(right.name))) {
    const name = `${prefix}${entry.name}`;
    entries.push(`${name}:${entry.isDirectory() ? "d" : "f"}`);
    if (entry.isDirectory()) {
      entries.push(...snapshotTree(join(path, entry.name), `${name}/`));
    }
  }
  return entries;
}

describe("Generation namespace installer", () => {
  test("installs the exact namespace and replays without a second attempt", async () => {
    await withRoot((root, lease, rootPath) => {
      expect(install(root, lease)).toBe("installed");
      expect(inspectGenerationNamespace(root, lease).state).toBe("terminal-installed");
      expect(readdirSync(join(rootPath, "staging"))).toEqual([]);
      expect(readdirSync(join(rootPath, "receipts")).sort()).toHaveLength(3);
      expect(install(root, lease)).toBe("replay");
      expect(readdirSync(join(rootPath, "staging"))).toEqual([]);
    });
  });

  for (const stage of [
    "intent-directory-synced",
    "probe-directory-synced",
    "probe-absent-rename-synced",
    "probe-existing-directory-checked",
    "probe-existing-file-checked",
    "probe-existing-symlink-checked",
    "candidate-directory-synced",
    "namespace-directory-synced",
    "result-directory-synced",
    "probe-cleanup-entry-directory-synced",
    "probe-cleanup-directory-synced",
  ] as const) {
    test(`inspects without mutation and recovers the same attempt after ${stage}`, async () => {
      await withRoot((root, lease, rootPath) => {
        const restore = throwAt(stage);
        try {
          expect(() => install(root, lease)).toThrow(`FAULT:${stage}`);
        } finally {
          restore();
        }
        expect(readdirSync(join(rootPath, "staging"))).toHaveLength(1);
        const installer = new GenerationNamespaceInstaller(root, lease);
        const beforeInspect = snapshotTree(rootPath);
        const plan = installer.inspectRecovery();
        expect(plan?.state).not.toBe("absent-no-intent");
        expect(snapshotTree(rootPath)).toEqual(beforeInspect);
        expect(plan).toBeDefined();
        if (plan === undefined) throw new Error("missing recovery plan");
        expect(installer.applyRecovery(plan).status).toBe("recovered");
        expect(inspectGenerationNamespace(root, lease).state).toBe("terminal-installed");
        expect(readdirSync(join(rootPath, "staging"))).toEqual([]);
      });
    });
  }

  test("rejects forged and replayed recovery plans", async () => {
    await withRoot((root, lease) => {
      const restore = throwAt("intent-directory-synced");
      try {
        expect(() => install(root, lease)).toThrow("FAULT:intent-directory-synced");
      } finally {
        restore();
      }
      const installer = new GenerationNamespaceInstaller(root, lease);
      expect(() => installer.applyRecovery(Object.freeze({
        kind: "generation-namespace-recovery",
        state: "install-intent-pending",
        attemptToken: "0".repeat(24),
      }) as GenerationNamespaceRecoveryPlan)).toThrow("GENERATION_RECOVERY_REQUIRED");
      const plan = installer.inspectRecovery();
      expect(plan).toBeDefined();
      if (plan === undefined) throw new Error("missing recovery plan");
      expect(installer.applyRecovery(plan).status).toBe("recovered");
      expect(() => installer.applyRecovery(plan)).toThrow(
        "GENERATION_RECOVERY_REQUIRED",
      );
      expect(installer.inspectRecovery()).toBeUndefined();
    });
  });

  test("rejects attempt drift before recovery apply and preserves the evidence", async () => {
    await withRoot((root, lease, rootPath) => {
      const restore = throwAt("intent-directory-synced");
      try {
        expect(() => install(root, lease)).toThrow("FAULT:intent-directory-synced");
      } finally {
        restore();
      }
      const installer = new GenerationNamespaceInstaller(root, lease);
      const plan = installer.inspectRecovery();
      expect(plan).toBeDefined();
      if (plan === undefined) throw new Error("missing recovery plan");
      const attemptName = readdirSync(join(rootPath, "staging"))[0];
      if (attemptName === undefined) throw new Error("missing attempt");
      const foreignPath = join(rootPath, "staging", attemptName, "foreign");
      mkdirSync(foreignPath, { mode: 0o700 });
      expect(() => installer.applyRecovery(plan)).toThrow(
        "GENERATION_RECOVERY_REQUIRED",
      );
      expect(readdirSync(join(rootPath, "staging", attemptName))).toContain("foreign");
      expect(inspectGenerationNamespace(root, lease).state).toBe(
        "install-intent-pending",
      );
    });
  });

  test("rejects a same-name replacement inside the durable rename probe", async () => {
    await withRoot((root, lease, rootPath) => {
      const restore = throwAt("probe-directory-synced");
      try {
        expect(() => install(root, lease)).toThrow("FAULT:probe-directory-synced");
      } finally {
        restore();
      }
      const attemptName = readdirSync(join(rootPath, "staging"))[0];
      if (attemptName === undefined) throw new Error("missing attempt");
      const sourcePath = join(
        rootPath,
        "staging",
        attemptName,
        ".rename-probe",
        "directory-source",
      );
      rmdirSync(sourcePath);
      mkdirSync(sourcePath, { mode: 0o700 });
      const installer = new GenerationNamespaceInstaller(root, lease);
      expect(() => installer.inspectRecovery()).toThrow(
        "GENERATION_RECOVERY_REQUIRED",
      );
      expect(readdirSync(join(sourcePath, ".."))).toContain("directory-source");
      expect(inspectGenerationNamespace(root, lease).state).toBe(
        "install-intent-pending",
      );
    });
  });

  test("startup recovery applies a preflighted namespace plan", async () => {
    await withRoot((root, lease, rootPath) => {
      const restore = throwAt("candidate-directory-synced");
      try {
        expect(() => install(root, lease)).toThrow("FAULT:candidate-directory-synced");
      } finally {
        restore();
      }
      const reader = new WorldProjectWriter(
        root,
        lease,
        new ArtifactStoreReader(root),
      ).reader();
      const recovered = recoverPendingOperations(root, lease, reader);
      expect(recovered.recovered).toEqual([]);
      expect(recovered.alreadyTerminal).toEqual([]);
      expect(inspectGenerationNamespace(root, lease).state).toBe("terminal-installed");
      expect(readdirSync(join(rootPath, "staging"))).toEqual([]);
    });
  });

  test("startup leaves namespace evidence unchanged when global preflight fails", async () => {
    await withRoot((root, lease, rootPath) => {
      const restore = throwAt("intent-directory-synced");
      try {
        expect(() => install(root, lease)).toThrow("FAULT:intent-directory-synced");
      } finally {
        restore();
      }
      mkdirSync(join(rootPath, "staging", "foreign-orphan"), { mode: 0o700 });
      const beforeRecovery = snapshotTree(rootPath);
      const reader = new WorldProjectWriter(
        root,
        lease,
        new ArtifactStoreReader(root),
      ).reader();
      expect(() => recoverPendingOperations(root, lease, reader)).toThrow(
        "OPERATION_RECOVERY_REQUIRED",
      );
      expect(snapshotTree(rootPath)).toEqual(beforeRecovery);
      expect(inspectGenerationNamespace(root, lease).state).toBe(
        "install-intent-pending",
      );
    });
  });
});
