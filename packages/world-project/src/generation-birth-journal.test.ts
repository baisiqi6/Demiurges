import { describe, expect, test } from "bun:test";
import {
  existsSync,
  linkSync,
  mkdirSync,
  mkdtempSync,
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
import {
  createGenerationBinding,
  createGenerationIntent,
  requireGenerationRequest,
  type GenerationIntentV1,
} from "./generation-contracts";
import {
  createGenerationNamespaceBody,
  createGenerationNamespaceInstallBinding,
  generationNamespaceInstallBindingDigest,
  generationNamespaceSeedDigest,
} from "./generation-namespace";
import {
  GenerationBirthJournal,
  GENERATION_BIRTH_JOURNAL_TEST_SEAMS,
  applyGenerationBirthStartupRecovery,
  inspectGenerationBirthStartupRecovery,
  type GenerationBirthJournalStage,
} from "./generation-birth-journal";
import {
  generationCatalogFilename,
  generationIdDigest,
} from "./generation-birth";
import {
  readStableDirectoryIdentity,
  syncDirectory,
  writeNewSyncedFile,
} from "./safe-filesystem";

function durableIntent(): GenerationIntentV1 {
  const prepared = requireGenerationRequest({
    provider: "worldlabs-marble-v1",
    model: "marble-1.1",
    prompt: "a mossy stone arch",
    costUnknownAccepted: true,
    waitForCompletionAndDownload: true,
    idempotencyKey: "birth-journal-marble",
  });
  return createGenerationIntent(createGenerationBinding(prepared, {
    contractProfile: "worldlabs-openapi-2026-08-15-v1",
    contractShapeDigest: "a".repeat(64),
  }), "2026-08-15T10:00:00.000Z");
}

async function withInstalledNamespace(
  run: (
    journal: GenerationBirthJournal,
    root: OpenedDataRoot,
    lease: DataRootWriterLease,
    rootPath: string,
  ) => Promise<void> | void,
): Promise<void> {
  const parent = mkdtempSync(join(tmpdir(), "dh017-birth-"));
  const rootPath = join(parent, "root");
  bootstrapDataRoot(rootPath);
  const root = openDataRoot(rootPath);
  const leaseResult = await acquireDataRootWriterLease(root);
  expect(leaseResult.status).toBe("acquired");
  if (leaseResult.status !== "acquired") throw new Error("lease unavailable");
  const lease = leaseResult.lease;
  try {
    ensureDataRootLayout(root, lease);
    const binding = createGenerationNamespaceInstallBinding(root, lease);
    const receiptIntent = join(rootPath, dataRootReceiptIntentPath(binding.operationId));
    writeNewSyncedFile(receiptIntent, canonicalJsonBytes(binding));
    const namespacePath = join(rootPath, "receipts", "generations");
    mkdirSync(namespacePath, { mode: 0o700 });
    linkSync(receiptIntent, join(namespacePath, ".namespace-install-intent.json"));
    for (const name of ["data", "catalog", "birth-staging"] as const) {
      mkdirSync(join(namespacePath, name), { mode: 0o700 });
      syncDirectory(join(namespacePath, name));
    }
    writeNewSyncedFile(
      join(namespacePath, "namespace.json"),
      canonicalJsonBytes(createGenerationNamespaceBody(
        binding,
        readStableDirectoryIdentity(namespacePath),
      )),
    );
    syncDirectory(namespacePath);
    syncDirectory(join(rootPath, "receipts"));
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
    syncDirectory(join(rootPath, "receipts"));
    await run(new GenerationBirthJournal(root, lease), root, lease, rootPath);
  } finally {
    await lease.close();
    root.close();
    rmSync(parent, { recursive: true, force: true });
  }
}

function throwAt(target: GenerationBirthJournalStage): () => void {
  return GENERATION_BIRTH_JOURNAL_TEST_SEAMS.replaceStageHook((stage) => {
    if (stage === target) throw new Error(`FAULT:${stage}`);
  });
}

describe("GenerationBirthJournal", () => {
  test("publishes catalog only after the complete admitted data set is durable", async () => {
    await withInstalledNamespace((journal, _root, _lease, rootPath) => {
      const intent = durableIntent();
      const result = journal.admit(intent);
      expect(result.status).toBe("born");
      expect(result.current.state).toBe("admitted");
      const namespacePath = join(rootPath, "receipts", "generations");
      expect(readdirSync(join(namespacePath, "birth-staging"))).toEqual([]);
      expect(readdirSync(join(namespacePath, "catalog"))).toEqual([
        generationCatalogFilename(intent.generationId),
      ]);
      expect(readdirSync(join(
        namespacePath,
        "data",
        generationIdDigest(intent.generationId),
      )).sort()).toEqual(["downloads", "head.json", "intent.json", "records"]);
      expect(journal.admit(intent).status).toBe("replay");
    });
  });

  test("crash after birth staging durability resumes the same candidate", async () => {
    await withInstalledNamespace((journal, root, lease, rootPath) => {
      const intent = durableIntent();
      const restore = throwAt("birth-staging-directory-synced");
      try {
        expect(() => journal.admit(intent)).toThrow("FAULT:birth-staging-directory-synced");
      } finally {
        restore();
      }
      const namespacePath = join(rootPath, "receipts", "generations");
      expect(readdirSync(join(namespacePath, "catalog"))).toEqual([]);
      expect(readdirSync(join(namespacePath, "birth-staging"))).toHaveLength(1);
      expect(new GenerationBirthJournal(root, lease).admit(intent).status).toBe("born");
      expect(readdirSync(join(namespacePath, "birth-staging"))).toEqual([]);
    });
  });

  test("crash after catalog fsync converges by same-inode cleanup", async () => {
    await withInstalledNamespace((journal, root, lease, rootPath) => {
      const intent = durableIntent();
      const restore = throwAt("catalog-directory-synced");
      try {
        expect(() => journal.admit(intent)).toThrow("FAULT:catalog-directory-synced");
      } finally {
        restore();
      }
      const namespacePath = join(rootPath, "receipts", "generations");
      expect(readdirSync(join(namespacePath, "catalog"))).toHaveLength(1);
      expect(readdirSync(join(namespacePath, "birth-staging"))).toHaveLength(1);
      expect(new GenerationBirthJournal(root, lease).admit(intent).status).toBe("replay");
      expect(readdirSync(join(namespacePath, "birth-staging"))).toEqual([]);
    });
  });

  test("partial hidden data never becomes visible or auto-cleaned", async () => {
    await withInstalledNamespace((journal, _root, _lease, rootPath) => {
      const intent = durableIntent();
      const dataPath = join(
        rootPath,
        "receipts",
        "generations",
        "data",
        generationIdDigest(intent.generationId),
      );
      mkdirSync(dataPath, { mode: 0o700 });
      expect(() => journal.admit(intent)).toThrow("GENERATION_RECOVERY_REQUIRED");
      expect(readdirSync(join(rootPath, "receipts", "generations", "catalog")))
        .toEqual([]);
      expect(readdirSync(dataPath)).toEqual([]);
    });
  });

  test("non-empty downloads are rejected through the bounded birth inspection", async () => {
    await withInstalledNamespace((journal, _root, _lease, rootPath) => {
      const intent = durableIntent();
      journal.admit(intent);
      const downloadsPath = join(
        rootPath,
        "receipts",
        "generations",
        "data",
        generationIdDigest(intent.generationId),
        "downloads",
      );
      writeFileSync(join(downloadsPath, "foreign.bin"), "preserve", { mode: 0o600 });
      syncDirectory(downloadsPath);
      expect(() => journal.inspect(intent)).toThrow("GENERATION_RECOVERY_REQUIRED");
    });
  });

  test("startup recovery plan rejects forged, cross-root, and replayed authority", async () => {
    await withInstalledNamespace(async (journal, root, lease, rootPath) => {
      const intent = durableIntent();
      journal.admit(intent);
      const plan = inspectGenerationBirthStartupRecovery(root, lease);
      expect(plan).toBeDefined();
      if (plan === undefined) throw new Error("missing startup plan");
      const beforeCatalog = readdirSync(join(rootPath, "receipts", "generations", "catalog"));
      expect(() => applyGenerationBirthStartupRecovery(
        Object.freeze({ kind: "generation-birth-startup-recovery" }),
        root,
        lease,
      )).toThrow("GENERATION_RECOVERY_REQUIRED");
      expect(() => applyGenerationBirthStartupRecovery(
        plan,
        root,
        Object.freeze({}) as DataRootWriterLease,
      )).toThrow("GENERATION_RECOVERY_REQUIRED");

      const foreignParent = mkdtempSync(join(tmpdir(), "dh017-birth-plan-cross-root-"));
      const foreignRootPath = join(foreignParent, "root");
      bootstrapDataRoot(foreignRootPath);
      const foreignRoot = openDataRoot(foreignRootPath);
      const foreignLease = await acquireDataRootWriterLease(foreignRoot);
      expect(foreignLease.status).toBe("acquired");
      if (foreignLease.status !== "acquired") throw new Error("lease unavailable");
      try {
        expect(() => applyGenerationBirthStartupRecovery(
          plan,
          foreignRoot,
          foreignLease.lease,
        )).toThrow("GENERATION_RECOVERY_REQUIRED");
        expect(existsSync(join(foreignRootPath, "receipts"))).toBe(false);
      } finally {
        await foreignLease.lease.close();
        foreignRoot.close();
        rmSync(foreignParent, { recursive: true, force: true });
      }

      expect(applyGenerationBirthStartupRecovery(plan, root, lease).status).toBe("replay");
      expect(readdirSync(join(rootPath, "receipts", "generations", "catalog")))
        .toEqual(beforeCatalog);
      expect(() => applyGenerationBirthStartupRecovery(plan, root, lease))
        .toThrow("GENERATION_RECOVERY_REQUIRED");
    });
  });

  test("startup plan authority stays out of package-root exports", () => {
    const source = Bun.file(join(import.meta.dir, "index.ts"));
    return source.text().then((text) => {
      for (const token of [
        "GenerationBirthStartupRecoveryPlan",
        "inspectGenerationBirthStartupRecovery",
        "applyGenerationBirthStartupRecovery",
        "GENERATION_BIRTH_JOURNAL_TEST_SEAMS",
      ]) expect(text).not.toContain(token);
    });
  });
});
