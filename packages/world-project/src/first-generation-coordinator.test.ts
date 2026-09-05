import { describe, expect, test } from "bun:test";
import {
  mkdirSync,
  lstatSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
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
import {
  generationCatalogFilename,
  generationIdDigest,
} from "./generation-birth";
import {
  createGenerationBinding,
  createGenerationIntent,
  requireGenerationRequest,
  type GenerationIntentV1,
} from "./generation-contracts";
import {
  FirstGenerationCoordinator,
  FIRST_GENERATION_COORDINATOR_TEST_SEAMS,
} from "./first-generation-coordinator";
import { authorizeFirstGenerationCapacity } from "./first-generation-capacity";
import {
  GenerationBirthJournal,
  GENERATION_BIRTH_JOURNAL_TEST_SEAMS,
  type GenerationBirthJournalStage,
} from "./generation-birth-journal";
import {
  GenerationNamespaceInstaller,
  GENERATION_NAMESPACE_INSTALLER_TEST_SEAMS,
  type GenerationNamespaceInstallerStage,
} from "./generation-namespace-installer";
import { inspectGenerationNamespace } from "./generation-namespace-inspection";
import { operationBindingDigest, type OperationBinding } from "./operation-journal";
import { syncDirectory } from "./safe-filesystem";

async function withRoot(
  run: (
    root: OpenedDataRoot,
    lease: DataRootWriterLease,
    rootPath: string,
  ) => Promise<void> | void,
): Promise<void> {
  const parent = mkdtempSync(join(tmpdir(), "dh017-first-coordinator-"));
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

function intent(prompt = "a mossy stone arch"): GenerationIntentV1 {
  const prepared = requireGenerationRequest({
    provider: "worldlabs-marble-v1",
    model: "marble-1.1",
    prompt,
    costUnknownAccepted: true,
    waitForCompletionAndDownload: true,
    idempotencyKey: "first-generation-coordinator",
  });
  return createGenerationIntent(createGenerationBinding(prepared, {
    contractProfile: "worldlabs-openapi-2026-08-15-v1",
    contractShapeDigest: "a".repeat(64),
  }), "2026-08-15T10:00:00.000Z");
}

function otherIntent(): GenerationIntentV1 {
  const prepared = requireGenerationRequest({
    provider: "worldlabs-marble-v1",
    model: "marble-1.1",
    prompt: "a separate generation",
    costUnknownAccepted: true,
    waitForCompletionAndDownload: true,
    idempotencyKey: "other-first-generation",
  });
  return createGenerationIntent(createGenerationBinding(prepared, {
    contractProfile: "worldlabs-openapi-2026-08-15-v1",
    contractShapeDigest: "a".repeat(64),
  }), "2026-08-15T10:00:00.000Z");
}

function replaceBeforeBirthAdmissionHook(replacement: () => void): () => void {
  return FIRST_GENERATION_COORDINATOR_TEST_SEAMS
    .replaceBeforeBirthAdmissionHook(replacement);
}

function installNamespace(root: OpenedDataRoot, lease: DataRootWriterLease): void {
  const capacity = authorizeFirstGenerationCapacity(root, lease, intent());
  expect(capacity.status).toBe("authorized");
  if (capacity.status !== "authorized") throw new Error("capacity unavailable");
  new GenerationNamespaceInstaller(root, lease).install(capacity.capability);
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

function throwNamespaceAt(target: GenerationNamespaceInstallerStage): () => void {
  return GENERATION_NAMESPACE_INSTALLER_TEST_SEAMS.replaceStageHook((stage) => {
    if (stage === target) throw new Error(`FAULT:${stage}`);
  });
}

function throwBirthAt(target: GenerationBirthJournalStage): () => void {
  return GENERATION_BIRTH_JOURNAL_TEST_SEAMS.replaceStageHook((stage) => {
    if (stage === target) throw new Error(`FAULT:${stage}`);
  });
}

describe("FirstGenerationCoordinator", () => {
  test("creates one terminal namespace and one exact catalog pointer, then replays", async () => {
    await withRoot((root, lease, rootPath) => {
      const durableIntent = intent();
      const coordinator = new FirstGenerationCoordinator(root, lease);
      expect(coordinator.admit(durableIntent)).toMatchObject({
        status: "admitted",
        namespaceStatus: "installed",
        birthStatus: "born",
        current: { state: "admitted", sequence: 0 },
      });
      const namespacePath = join(rootPath, "receipts", "generations");
      expect(inspectGenerationNamespace(root, lease).state).toBe("terminal-installed");
      expect(readdirSync(join(namespacePath, "catalog"))).toEqual([
        generationCatalogFilename(durableIntent.generationId),
      ]);
      expect(coordinator.admit(durableIntent)).toMatchObject({
        status: "admitted",
        namespaceStatus: "replay",
        birthStatus: "replay",
      });
      expect(readdirSync(join(rootPath, "staging"))).toEqual([]);
      expect(readdirSync(join(namespacePath, "catalog"))).toHaveLength(1);
    });
  });

  test("uses a new two-slot authorization to birth after namespace-only completion", async () => {
    await withRoot((root, lease, rootPath) => {
      const durableIntent = intent();
      installNamespace(root, lease);
      const namespacePath = join(rootPath, "receipts", "generations");
      expect(readdirSync(join(namespacePath, "catalog"))).toEqual([]);
      expect(new FirstGenerationCoordinator(root, lease).admit(durableIntent))
        .toMatchObject({ namespaceStatus: "replay", birthStatus: "born" });
    });
  });

  test("exact active replay keeps its existing two-slot reservation near capacity", async () => {
    await withRoot((root, lease, rootPath) => {
      const durableIntent = intent();
      new FirstGenerationCoordinator(root, lease).admit(durableIntent);
      for (let index = 0; index < 1021; index += 1) {
        const operationId = `op:coordinator-near-cap-${index}`;
        const revision = `project-revision:sha256:${index.toString(16).padStart(64, "0")}`;
        const binding: OperationBinding = {
          schemaVersion: 1,
          operationId,
          operationKind: "project.save-as",
          target: { kind: "project", id: "project:near-cap" },
          expectedIdentity: null,
          candidateIdentity: { projectRevision: revision },
        };
        writeFileSync(join(rootPath, dataRootReceiptIntentPath(operationId)), canonicalJsonBytes(binding), { mode: 0o600 });
        writeFileSync(join(rootPath, dataRootReceiptResultPath(operationId)), canonicalJsonBytes({
          schemaVersion: 1,
          operationId,
          bindingDigest: operationBindingDigest(binding),
          variant: "success",
          publishedIdentity: revision,
        }), { mode: 0o600 });
      }
      syncDirectory(join(rootPath, "receipts"));
      const capacity = authorizeFirstGenerationCapacity(root, lease, durableIntent);
      expect(capacity.status).toBe("authorized");
      if (capacity.status !== "authorized") return;
      expect(capacity.capability.effectiveEntries).toBe(2047);
      expect(new GenerationNamespaceInstaller(root, lease).install(capacity.capability).status)
        .toBe("replay");
      expect(new GenerationBirthJournal(root, lease).admit(durableIntent).status).toBe("replay");
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
    test(`retries namespace ${stage} through the coordinator without a second namespace`, async () => {
      await withRoot((root, lease, rootPath) => {
        const restore = throwNamespaceAt(stage);
        try {
          expect(() => new FirstGenerationCoordinator(root, lease).admit(intent()))
            .toThrow(`FAULT:${stage}`);
        } finally {
          restore();
        }
        expect(new FirstGenerationCoordinator(root, lease).admit(intent()))
          .toMatchObject({ status: "admitted", birthStatus: "born" });
        expect(readdirSync(join(rootPath, "receipts", "generations", "catalog")))
          .toHaveLength(1);
      });
    });
  }

  for (const stage of [
    "generation-data-directory-synced",
    "birth-staging-directory-synced",
    "catalog-directory-synced",
    "birth-staging-cleanup-directory-synced",
  ] as const) {
    test(`retries birth ${stage} through the coordinator with one catalog pointer`, async () => {
      await withRoot((root, lease, rootPath) => {
        const restore = throwBirthAt(stage);
        try {
          expect(() => new FirstGenerationCoordinator(root, lease).admit(intent()))
            .toThrow(`FAULT:${stage}`);
        } finally {
          restore();
        }
        const durableIntent = intent();
        expect(new FirstGenerationCoordinator(root, lease).admit(durableIntent))
          .toMatchObject({ status: "admitted" });
        expect(readdirSync(join(rootPath, "receipts", "generations", "catalog")))
          .toEqual([generationCatalogFilename(durableIntent.generationId)]);
      });
    });
  }

  test("capacity reached leaves receipt, staging, and namespace bytes unchanged", async () => {
    await withRoot((root, lease, rootPath) => {
      const receiptsPath = join(rootPath, "receipts");
      for (let index = 0; index < 1022; index += 1) {
        const operationId = `op:first-coordinator-capacity-${index}`;
        const revision = `project-revision:sha256:${index.toString(16).padStart(64, "0")}`;
        const binding: OperationBinding = {
          schemaVersion: 1,
          operationId,
          operationKind: "project.save-as",
          target: { kind: "project", id: "project:first-coordinator" },
          expectedIdentity: null,
          candidateIdentity: { projectRevision: revision },
        };
        writeFileSync(join(rootPath, dataRootReceiptIntentPath(operationId)), canonicalJsonBytes(binding), { mode: 0o600 });
        writeFileSync(join(rootPath, dataRootReceiptResultPath(operationId)), canonicalJsonBytes({
          schemaVersion: 1,
          operationId,
          bindingDigest: operationBindingDigest(binding),
          variant: "success",
          publishedIdentity: revision,
        }), { mode: 0o600 });
      }
      syncDirectory(receiptsPath);
      const before = snapshot(rootPath);
      expect(new FirstGenerationCoordinator(root, lease).admit(intent()))
        .toEqual({ status: "capacity-reached" });
      expect(snapshot(rootPath)).toEqual(before);
    });
  });

  test("binding drift and foreign first-generation evidence fail closed without cleanup", async () => {
    await withRoot(async (root, lease, rootPath) => {
      const durableIntent = intent();
      const coordinator = new FirstGenerationCoordinator(root, lease);
      coordinator.admit(durableIntent);
      const beforeDrift = snapshot(rootPath);
      expect(() => coordinator.admit(intent("a different mossy arch")))
        .toThrow("GENERATION_RECOVERY_REQUIRED");
      expect(snapshot(rootPath)).toEqual(beforeDrift);

      const foreignParent = mkdtempSync(join(tmpdir(), "dh017-foreign-evidence-"));
      try {
        const foreignRootPath = join(foreignParent, "root");
        bootstrapDataRoot(foreignRootPath);
        const foreignRoot = openDataRoot(foreignRootPath);
        const acquired = await acquireDataRootWriterLease(foreignRoot);
        expect(acquired.status).toBe("acquired");
        if (acquired.status !== "acquired") throw new Error("lease unavailable");
        try {
          ensureDataRootLayout(foreignRoot, acquired.lease);
          installNamespace(foreignRoot, acquired.lease);
          const foreignDataPath = join(foreignRootPath, "receipts", "generations", "data", "b".repeat(64));
          mkdirSync(foreignDataPath, { mode: 0o700 });
          const beforeForeign = snapshot(foreignRootPath);
          expect(() => new FirstGenerationCoordinator(foreignRoot, acquired.lease).admit(durableIntent))
            .toThrow("OPERATION_RECOVERY_REQUIRED");
          expect(snapshot(foreignRootPath)).toEqual(beforeForeign);
        } finally {
          await acquired.lease.close();
          foreignRoot.close();
        }
      } finally {
        rmSync(foreignParent, { recursive: true, force: true });
      }
    });
  });

  test("foreign staging is rejected before capacity consumption with bytes and inode unchanged", async () => {
    await withRoot((root, lease, rootPath) => {
      installNamespace(root, lease);
      const stagingPath = join(rootPath, "receipts", "generations", "birth-staging", `${"c".repeat(32)}.json`);
      const bytes = canonicalJsonBytes({ generationId: otherIntent().generationId });
      writeFileSync(stagingPath, bytes, { mode: 0o600 });
      syncDirectory(join(rootPath, "receipts", "generations", "birth-staging"));
      const before = lstatSync(stagingPath, { bigint: true });
      expect(() => new FirstGenerationCoordinator(root, lease).admit(intent()))
        .toThrow("OPERATION_RECOVERY_REQUIRED");
      const after = lstatSync(stagingPath, { bigint: true });
      expect(Buffer.from(readFileSync(stagingPath))).toEqual(Buffer.from(bytes));
      expect({ dev: after.dev, ino: after.ino, mode: after.mode }).toEqual({
        dev: before.dev,
        ino: before.ino,
        mode: before.mode,
      });
    });
  });

  test("snapshot drift and a symlink evidence entry fail closed before installer mutation", async () => {
    await withRoot((root, lease, rootPath) => {
      const durableIntent = intent();
      installNamespace(root, lease);
      const capacity = authorizeFirstGenerationCapacity(root, lease, durableIntent);
      expect(capacity.status).toBe("authorized");
      if (capacity.status !== "authorized") return;
      const dataPath = join(
        rootPath,
        "receipts",
        "generations",
        "data",
        generationIdDigest(durableIntent.generationId),
      );
      symlinkSync("/tmp", dataPath);
      const before = lstatSync(dataPath, { bigint: true });
      expect(() => new GenerationNamespaceInstaller(root, lease).install(capacity.capability))
        .toThrow("OPERATION_RECOVERY_REQUIRED");
      const after = lstatSync(dataPath, { bigint: true });
      expect({ dev: after.dev, ino: after.ino, mode: after.mode }).toEqual({
        dev: before.dev,
        ino: before.ino,
        mode: before.mode,
      });
    });
  });

  test("post-installer foreign staging is rejected at the birth mutation boundary", async () => {
    await withRoot((root, lease, rootPath) => {
      installNamespace(root, lease);
      const stagingPath = join(rootPath, "receipts", "generations", "birth-staging", `${"e".repeat(32)}.json`);
      const bytes = canonicalJsonBytes({ generationId: otherIntent().generationId });
      let before: ReturnType<typeof lstatSync> | undefined;
      const restore = replaceBeforeBirthAdmissionHook(() => {
        writeFileSync(stagingPath, bytes, { mode: 0o600 });
        syncDirectory(join(rootPath, "receipts", "generations", "birth-staging"));
        before = lstatSync(stagingPath, { bigint: true });
      });
      try {
        expect(() => new FirstGenerationCoordinator(root, lease).admit(intent()))
          .toThrow("OPERATION_RECOVERY_REQUIRED");
      } finally {
        restore();
      }
      const after = lstatSync(stagingPath, { bigint: true });
      expect(Buffer.from(readFileSync(stagingPath))).toEqual(Buffer.from(bytes));
      expect({ dev: after.dev, ino: after.ino, mode: after.mode }).toEqual({
        dev: before?.dev,
        ino: before?.ino,
        mode: before?.mode,
      });
      expect(readdirSync(join(rootPath, "receipts", "generations", "data"))).toEqual([]);
      expect(readdirSync(join(rootPath, "receipts", "generations", "catalog"))).toEqual([]);
    });
  });

  test("post-installer foreign data and pending-namespace evidence block every next mutation", async () => {
    await withRoot((root, lease, rootPath) => {
      installNamespace(root, lease);
      const foreignData = join(rootPath, "receipts", "generations", "data", "f".repeat(64));
      let before: ReturnType<typeof lstatSync> | undefined;
      const restore = replaceBeforeBirthAdmissionHook(() => {
        mkdirSync(foreignData, { mode: 0o700 });
        syncDirectory(join(rootPath, "receipts", "generations", "data"));
        before = lstatSync(foreignData, { bigint: true });
      });
      try {
        expect(() => new FirstGenerationCoordinator(root, lease).admit(intent()))
          .toThrow("OPERATION_RECOVERY_REQUIRED");
      } finally {
        restore();
      }
      const after = lstatSync(foreignData, { bigint: true });
      expect({ dev: after.dev, ino: after.ino, mode: after.mode }).toEqual({
        dev: before?.dev,
        ino: before?.ino,
        mode: before?.mode,
      });
      expect(readdirSync(join(rootPath, "receipts", "generations", "catalog"))).toEqual([]);
    });
  });

  test("post-prepare receipt capacity drift rejects birth before its first mutation", async () => {
    await withRoot((root, lease, rootPath) => {
      installNamespace(root, lease);
      const operationId = "op:birth-admission-capacity-drift";
      const revision = `project-revision:sha256:${"c".repeat(64)}`;
      const binding: OperationBinding = {
        schemaVersion: 1,
        operationId,
        operationKind: "project.save-as",
        target: { kind: "project", id: "project:birth-admission" },
        expectedIdentity: null,
        candidateIdentity: { projectRevision: revision },
      };
      const receiptPath = join(rootPath, dataRootReceiptIntentPath(operationId));
      const receiptBytes = canonicalJsonBytes(binding);
      let before: ReturnType<typeof lstatSync> | undefined;
      const restore = replaceBeforeBirthAdmissionHook(() => {
        writeFileSync(receiptPath, receiptBytes, { mode: 0o600 });
        syncDirectory(join(rootPath, "receipts"));
        before = lstatSync(receiptPath, { bigint: true });
      });
      try {
        expect(() => new FirstGenerationCoordinator(root, lease).admit(intent()))
          .toThrow("OPERATION_RECOVERY_REQUIRED");
      } finally {
        restore();
      }
      const after = lstatSync(receiptPath, { bigint: true });
      expect(Buffer.from(readFileSync(receiptPath))).toEqual(Buffer.from(receiptBytes));
      expect({ dev: after.dev, ino: after.ino, mode: after.mode }).toEqual({
        dev: before?.dev,
        ino: before?.ino,
        mode: before?.mode,
      });
      const namespacePath = join(rootPath, "receipts", "generations");
      expect(readdirSync(join(namespacePath, "data"))).toEqual([]);
      expect(readdirSync(join(namespacePath, "catalog"))).toEqual([]);
      expect(readdirSync(join(namespacePath, "birth-staging"))).toEqual([]);
    });
  });

  test("published namespace pending its result rejects foreign birth evidence before result publication", async () => {
    await withRoot((root, lease, rootPath) => {
      const restore = throwNamespaceAt("namespace-directory-synced");
      try {
        expect(() => new FirstGenerationCoordinator(root, lease).admit(intent()))
          .toThrow("FAULT:namespace-directory-synced");
      } finally {
        restore();
      }
      const receiptsPath = join(rootPath, "receipts");
      expect(readdirSync(receiptsPath).filter((name) => name.endsWith(".result.json"))).toEqual([]);
      const foreignData = join(rootPath, "receipts", "generations", "data", "a".repeat(64));
      mkdirSync(foreignData, { mode: 0o700 });
      syncDirectory(join(rootPath, "receipts", "generations", "data"));
      const before = lstatSync(foreignData, { bigint: true });
      expect(() => new FirstGenerationCoordinator(root, lease).admit(intent()))
        .toThrow("OPERATION_RECOVERY_REQUIRED");
      const after = lstatSync(foreignData, { bigint: true });
      expect({ dev: after.dev, ino: after.ino, mode: after.mode }).toEqual({
        dev: before.dev,
        ino: before.ino,
        mode: before.mode,
      });
      expect(readdirSync(receiptsPath).filter((name) => name.endsWith(".result.json"))).toEqual([]);
    });
  });

  test("keeps the coordinator, capacity capability, and test seams out of package-root exports", () => {
    const source = readFileSync(join(import.meta.dir, "index.ts"), "utf8");
    for (const token of [
      "FirstGenerationCoordinator",
      "FirstGenerationCapacityCapability",
      "FirstGenerationBirthAdmission",
      "GENERATION_BIRTH_JOURNAL_TEST_SEAMS",
      "GENERATION_NAMESPACE_INSTALLER_TEST_SEAMS",
      "FIRST_GENERATION_COORDINATOR_TEST_SEAMS",
    ]) expect(source).not.toContain(token);
    for (const token of [
      "FirstGenerationAdmissionResultV1",
      "FirstGenerationInspectionV1",
    ]) expect(source).toContain(token);
  });

  test("read-only inspect: absent before namespace install and after namespace-only completion", async () => {
    await withRoot((root, lease) => {
      const durableIntent = intent();
      const coordinator = new FirstGenerationCoordinator(root, lease);
      expect(coordinator.inspect(durableIntent.generationId))
        .toEqual({ status: "absent" });
      installNamespace(root, lease);
      expect(coordinator.inspect(durableIntent.generationId))
        .toEqual({ status: "absent" });
    });
  });

  test("read-only inspect: admitted truth after birth, stable across a fresh coordinator", async () => {
    await withRoot((root, lease) => {
      const durableIntent = intent();
      new FirstGenerationCoordinator(root, lease).admit(durableIntent);
      const inspection = new FirstGenerationCoordinator(root, lease)
        .inspect(durableIntent.generationId);
      expect(inspection.status).toBe("admitted");
      if (inspection.status !== "admitted") return;
      expect(inspection.intent).toEqual(durableIntent);
      expect(inspection.current).toMatchObject({
        state: "admitted",
        sequence: 0,
        generationId: durableIntent.generationId,
      });
      expect(inspection.current.bindingDigest).toBe(durableIntent.bindingDigest);
    });
  });

  test("read-only inspect: foreign generation id is absent with zero mutation", async () => {
    await withRoot((root, lease, rootPath) => {
      const durableIntent = intent();
      new FirstGenerationCoordinator(root, lease).admit(durableIntent);
      const before = snapshot(rootPath);
      expect(new FirstGenerationCoordinator(root, lease)
        .inspect(otherIntent().generationId)).toEqual({ status: "absent" });
      expect(snapshot(rootPath)).toEqual(before);
    });
  });

  test("read-only inspect: corrupt intent bytes fail closed with recovery required", async () => {
    await withRoot((root, lease, rootPath) => {
      const durableIntent = intent();
      new FirstGenerationCoordinator(root, lease).admit(durableIntent);
      const digest = generationIdDigest(durableIntent.generationId);
      const intentPath = join(
        rootPath,
        "receipts",
        "generations",
        "data",
        digest,
        "intent.json",
      );
      writeFileSync(intentPath, "not canonical", { mode: 0o600 });
      expect(() => new FirstGenerationCoordinator(root, lease)
        .inspect(durableIntent.generationId))
        .toThrow("GENERATION_RECOVERY_REQUIRED");
    });
  });
});
