import { describe, expect, test } from "bun:test";
import {
  linkSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

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
import { ensureDataRootLayout } from "./data-root-layout";
import { inspectDataRootCapacity } from "./data-root-capacity-inspection";
import {
  createGenerationNamespaceBody,
  createGenerationNamespaceInstallBinding,
  generationNamespaceInstallBindingDigest,
  generationNamespaceSeedDigest,
} from "./generation-namespace";
import {
  readStableDirectoryIdentity,
  syncDirectory,
  writeNewSyncedFile,
} from "./safe-filesystem";
import { operationBindingDigest, type OperationBinding } from "./operation-journal";
import {
  generatedSetPublicationBindingDigest,
  requireGeneratedSetPublicationBinding,
  type GeneratedSetPublicationBindingV1,
} from "./generated-artifact-publication";

async function withRoot(
  run: (
    root: OpenedDataRoot,
    lease: DataRootWriterLease,
    rootPath: string,
  ) => Promise<void> | void,
): Promise<void> {
  const parent = mkdtempSync(join(tmpdir(), "dh017-capacity-inspect-"));
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

function writePublicIntent(rootPath: string, operationId: string): OperationBinding {
  const projectRevision = `project-revision:sha256:${"a".repeat(64)}`;
  const binding: OperationBinding = {
    schemaVersion: 1,
    operationId,
    operationKind: "project.save-as",
    target: { kind: "project", id: "project:capacity-test" },
    expectedIdentity: null,
    candidateIdentity: {
      projectRevision,
    },
  };
  writeNewSyncedFile(
    join(rootPath, dataRootReceiptIntentPath(operationId)),
    canonicalJsonBytes(binding),
  );
  syncDirectory(join(rootPath, "receipts"));
  return binding;
}

function publishNamespace(
  root: OpenedDataRoot,
  lease: DataRootWriterLease,
  rootPath: string,
  withResult: boolean,
): void {
  const binding = createGenerationNamespaceInstallBinding(root, lease);
  const intentPath = join(rootPath, dataRootReceiptIntentPath(binding.operationId));
  writeNewSyncedFile(intentPath, canonicalJsonBytes(binding));
  const namespacePath = join(rootPath, "receipts", "generations");
  mkdirSync(namespacePath, { mode: 0o700 });
  linkSync(intentPath, join(namespacePath, ".namespace-install-intent.json"));
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
  if (withResult) {
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
  }
}

describe("Data Root capacity disk inspection", () => {
  test("counts actual receipts and pending result reservations without mutation", async () => {
    await withRoot((root, lease, rootPath) => {
      expect(inspectDataRootCapacity(root, lease)).toEqual({
        usedReceiptEntries: 0,
        pendingResultReservations: 0,
        namespaceState: "absent-no-intent",
        publicOperationCount: 0,
        internalOperationCount: 0,
      });
      const binding = writePublicIntent(rootPath, "op:capacity-pending");
      expect(inspectDataRootCapacity(root, lease)).toMatchObject({
        usedReceiptEntries: 1,
        pendingResultReservations: 1,
        publicOperationCount: 1,
      });
      writeNewSyncedFile(
        join(rootPath, dataRootReceiptResultPath(binding.operationId)),
        canonicalJsonBytes({
          schemaVersion: 1,
          operationId: binding.operationId,
          bindingDigest: operationBindingDigest(binding),
          variant: "success",
          publishedIdentity: `project-revision:sha256:${"a".repeat(64)}`,
        }),
      );
      syncDirectory(join(rootPath, "receipts"));
      expect(inspectDataRootCapacity(root, lease)).toMatchObject({
        usedReceiptEntries: 2,
        pendingResultReservations: 0,
        publicOperationCount: 1,
      });
    });
  });

  test("namespace actual entries replace its outstanding reservations one for one", async () => {
    await withRoot((root, lease, rootPath) => {
      const binding = createGenerationNamespaceInstallBinding(root, lease);
      writeNewSyncedFile(
        join(rootPath, dataRootReceiptIntentPath(binding.operationId)),
        canonicalJsonBytes(binding),
      );
      syncDirectory(join(rootPath, "receipts"));
      expect(inspectDataRootCapacity(root, lease)).toMatchObject({
        usedReceiptEntries: 1,
        pendingResultReservations: 1,
        namespaceState: "install-intent-pending",
        internalOperationCount: 1,
      });
    });
    await withRoot((root, lease, rootPath) => {
      publishNamespace(root, lease, rootPath, false);
      expect(inspectDataRootCapacity(root, lease)).toMatchObject({
        usedReceiptEntries: 2,
        pendingResultReservations: 1,
        namespaceState: "directory-published-result-pending",
      });
    });
    await withRoot((root, lease, rootPath) => {
      publishNamespace(root, lease, rootPath, true);
      expect(inspectDataRootCapacity(root, lease)).toMatchObject({
        usedReceiptEntries: 3,
        pendingResultReservations: 0,
        namespaceState: "terminal-installed",
      });
    });
  });

  test("unknown and symlink receipt entries fail closed", async () => {
    await withRoot((root, lease, rootPath) => {
      writeNewSyncedFile(join(rootPath, "receipts", "foreign"), new Uint8Array([1]));
      expect(() => inspectDataRootCapacity(root, lease)).toThrow(
        "OPERATION_RECOVERY_REQUIRED",
      );
    });
    await withRoot((root, lease, rootPath) => {
      symlinkSync(
        join(rootPath, "missing"),
        join(rootPath, "receipts", "op:foreign.intent.json"),
      );
      expect(() => inspectDataRootCapacity(root, lease)).toThrow(
        "OPERATION_RECOVERY_REQUIRED",
      );
    });
  });

  test("stops incrementally at receipt entry 2049", async () => {
    await withRoot((root, lease, rootPath) => {
      for (let index = 0; index < 2049; index += 1) {
        writeNewSyncedFile(
          join(rootPath, "receipts", `foreign-${index}`),
          new Uint8Array([1]),
        );
      }
      expect(() => inspectDataRootCapacity(root, lease)).toThrow(
        "OPERATION_RECOVERY_REQUIRED",
      );
    });
  });

  test("generated-set receipts 仅在 terminal-installed 下接受并精确计数", async () => {
    await withRoot((root, lease, rootPath) => {
      const pending = generatedSetBinding(`generation:sha256:${"1".repeat(64)}`);
      writeNewSyncedFile(
        join(rootPath, dataRootReceiptIntentPath(pending.operationId)),
        canonicalJsonBytes(pending),
      );
      syncDirectory(join(rootPath, "receipts"));
      expect(() => inspectDataRootCapacity(root, lease)).toThrow(
        "OPERATION_RECOVERY_REQUIRED",
      );
    });
    await withRoot((root, lease, rootPath) => {
      const install = createGenerationNamespaceInstallBinding(root, lease);
      writeNewSyncedFile(
        join(rootPath, dataRootReceiptIntentPath(install.operationId)),
        canonicalJsonBytes(install),
      );
      const generatedSet = generatedSetBinding(`generation:sha256:${"2".repeat(64)}`);
      writeNewSyncedFile(
        join(rootPath, dataRootReceiptIntentPath(generatedSet.operationId)),
        canonicalJsonBytes(generatedSet),
      );
      syncDirectory(join(rootPath, "receipts"));
      expect(() => inspectDataRootCapacity(root, lease)).toThrow(
        "OPERATION_RECOVERY_REQUIRED",
      );
    });
    await withRoot((root, lease, rootPath) => {
      publishNamespace(root, lease, rootPath, false);
      const generatedSet = generatedSetBinding(`generation:sha256:${"3".repeat(64)}`);
      writeNewSyncedFile(
        join(rootPath, dataRootReceiptIntentPath(generatedSet.operationId)),
        canonicalJsonBytes(generatedSet),
      );
      syncDirectory(join(rootPath, "receipts"));
      expect(() => inspectDataRootCapacity(root, lease)).toThrow(
        "OPERATION_RECOVERY_REQUIRED",
      );
    });
    await withRoot((root, lease, rootPath) => {
      publishNamespace(root, lease, rootPath, true);
      const pending = generatedSetBinding(`generation:sha256:${"4".repeat(64)}`);
      writeNewSyncedFile(
        join(rootPath, dataRootReceiptIntentPath(pending.operationId)),
        canonicalJsonBytes(pending),
      );
      syncDirectory(join(rootPath, "receipts"));
      expect(inspectDataRootCapacity(root, lease)).toMatchObject({
        usedReceiptEntries: 4,
        pendingResultReservations: 1,
        namespaceState: "terminal-installed",
        publicOperationCount: 0,
        internalOperationCount: 2,
      });

      const success = generatedSetBinding(`generation:sha256:${"5".repeat(64)}`);
      writeNewSyncedFile(
        join(rootPath, dataRootReceiptIntentPath(success.operationId)),
        canonicalJsonBytes(success),
      );
      writeNewSyncedFile(
        join(rootPath, dataRootReceiptResultPath(success.operationId)),
        canonicalJsonBytes(generatedSetResult(success, "success")),
      );
      const aborted = generatedSetBinding(`generation:sha256:${"6".repeat(64)}`);
      writeNewSyncedFile(
        join(rootPath, dataRootReceiptIntentPath(aborted.operationId)),
        canonicalJsonBytes(aborted),
      );
      writeNewSyncedFile(
        join(rootPath, dataRootReceiptResultPath(aborted.operationId)),
        canonicalJsonBytes(generatedSetResult(aborted, "aborted-before-publish")),
      );
      syncDirectory(join(rootPath, "receipts"));
      expect(inspectDataRootCapacity(root, lease)).toMatchObject({
        usedReceiptEntries: 8,
        pendingResultReservations: 1,
        namespaceState: "terminal-installed",
        publicOperationCount: 0,
        internalOperationCount: 4,
      });
    });
  });

  test("namespace、generated-set 与 public receipts 共存计数 exact 且 namespace 分类不变", async () => {
    await withRoot((root, lease, rootPath) => {
      publishNamespace(root, lease, rootPath, true);
      const publicBinding = writePublicIntent(rootPath, "op:coexist-public");
      writeNewSyncedFile(
        join(rootPath, dataRootReceiptResultPath(publicBinding.operationId)),
        canonicalJsonBytes({
          schemaVersion: 1,
          operationId: publicBinding.operationId,
          bindingDigest: operationBindingDigest(publicBinding),
          variant: "success",
          publishedIdentity: `project-revision:sha256:${"a".repeat(64)}`,
        }),
      );
      const generatedSet = generatedSetBinding();
      writeNewSyncedFile(
        join(rootPath, dataRootReceiptIntentPath(generatedSet.operationId)),
        canonicalJsonBytes(generatedSet),
      );
      writeNewSyncedFile(
        join(rootPath, dataRootReceiptResultPath(generatedSet.operationId)),
        canonicalJsonBytes(generatedSetResult(generatedSet, "success")),
      );
      syncDirectory(join(rootPath, "receipts"));
      expect(inspectDataRootCapacity(root, lease)).toMatchObject({
        usedReceiptEntries: 7,
        pendingResultReservations: 0,
        namespaceState: "terminal-installed",
        publicOperationCount: 1,
        internalOperationCount: 2,
      });
    });
    await withRoot((root, lease, rootPath) => {
      publishNamespace(root, lease, rootPath, false);
      const generatedSet = generatedSetBinding();
      writeNewSyncedFile(
        join(rootPath, dataRootReceiptIntentPath(generatedSet.operationId)),
        canonicalJsonBytes(generatedSet),
      );
      syncDirectory(join(rootPath, "receipts"));
      expect(() => inspectDataRootCapacity(root, lease)).toThrow(
        "OPERATION_RECOVERY_REQUIRED",
      );
    });
  });

  test("generated-set receipt 错误形态在 capacity inspection fail closed", async () => {
    await withRoot((root, lease, rootPath) => {
      const orphan = generatedSetBinding(`generation:sha256:${"1".repeat(64)}`);
      writeNewSyncedFile(
        join(rootPath, dataRootReceiptResultPath(orphan.operationId)),
        canonicalJsonBytes(generatedSetResult(orphan, "success")),
      );
      syncDirectory(join(rootPath, "receipts"));
      expect(() => inspectDataRootCapacity(root, lease)).toThrow(
        "OPERATION_RECOVERY_REQUIRED",
      );
    });
    await withRoot((root, lease, rootPath) => {
      publishNamespace(root, lease, rootPath, true);
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
      syncDirectory(join(rootPath, "receipts"));
      expect(() => inspectDataRootCapacity(root, lease)).toThrow(
        "GENERATION_RECOVERY_REQUIRED",
      );
    });
    await withRoot((root, lease, rootPath) => {
      const unknownKey = generatedSetBinding(`generation:sha256:${"3".repeat(64)}`);
      writeNewSyncedFile(
        join(rootPath, dataRootReceiptIntentPath(unknownKey.operationId)),
        canonicalJsonBytes({ ...unknownKey, extra: "x" }),
      );
      syncDirectory(join(rootPath, "receipts"));
      expect(() => inspectDataRootCapacity(root, lease)).toThrow(
        "OPERATION_RECOVERY_REQUIRED",
      );
    });
    await withRoot((root, lease, rootPath) => {
      const malformed = generatedSetBinding(`generation:sha256:${"4".repeat(64)}`);
      writeNewSyncedFile(
        join(rootPath, dataRootReceiptIntentPath(malformed.operationId)),
        new TextEncoder().encode('{"schemaVersion": 1}'),
      );
      expect(() => inspectDataRootCapacity(root, lease)).toThrow(
        "OPERATION_RECOVERY_REQUIRED",
      );
    });
    await withRoot((root, lease, rootPath) => {
      const wrongName = generatedSetBinding(`generation:sha256:${"5".repeat(64)}`);
      writeNewSyncedFile(
        join(rootPath, dataRootReceiptIntentPath("op:wrong-name-1")),
        canonicalJsonBytes(wrongName),
      );
      syncDirectory(join(rootPath, "receipts"));
      expect(() => inspectDataRootCapacity(root, lease)).toThrow(
        "OPERATION_RECOVERY_REQUIRED",
      );
    });
  });
});
