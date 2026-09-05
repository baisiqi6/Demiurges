import { describe, expect, test } from "bun:test";
import {
  chmodSync,
  linkSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  unlinkSync,
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
  createGenerationNamespaceBody,
  createGenerationNamespaceInstallBinding,
  generationNamespaceInstallBindingDigest,
  generationNamespaceSeedDigest,
} from "./generation-namespace";
import { inspectGenerationNamespace } from "./generation-namespace-inspection";
import {
  readStableDirectoryIdentity,
  syncDirectory,
  writeNewSyncedFile,
} from "./safe-filesystem";

async function withRoot(
  run: (
    root: OpenedDataRoot,
    lease: DataRootWriterLease,
    rootPath: string,
  ) => Promise<void> | void,
): Promise<void> {
  const parent = mkdtempSync(join(tmpdir(), "dh017-namespace-inspect-"));
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

function publishIntent(
  root: OpenedDataRoot,
  lease: DataRootWriterLease,
  rootPath: string,
): ReturnType<typeof createGenerationNamespaceInstallBinding> {
  const binding = createGenerationNamespaceInstallBinding(root, lease);
  writeNewSyncedFile(
    join(rootPath, dataRootReceiptIntentPath(binding.operationId)),
    canonicalJsonBytes(binding),
  );
  syncDirectory(join(rootPath, "receipts"));
  return binding;
}

function publishDirectory(
  rootPath: string,
  binding: ReturnType<typeof createGenerationNamespaceInstallBinding>,
): void {
  const namespacePath = join(rootPath, "receipts", "generations");
  mkdirSync(namespacePath, { mode: 0o700 });
  linkSync(
    join(rootPath, dataRootReceiptIntentPath(binding.operationId)),
    join(namespacePath, ".namespace-install-intent.json"),
  );
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
}

function publishResult(
  rootPath: string,
  binding: ReturnType<typeof createGenerationNamespaceInstallBinding>,
): void {
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

describe("Generation namespace read-only inspection", () => {
  test("classifies the four crash-closed namespace capacity phases", async () => {
    await withRoot((root, lease, rootPath) => {
      expect(inspectGenerationNamespace(root, lease).state).toBe(
        "absent-no-intent",
      );
      const binding = publishIntent(root, lease, rootPath);
      expect(inspectGenerationNamespace(root, lease).state).toBe(
        "install-intent-pending",
      );
      publishDirectory(rootPath, binding);
      expect(inspectGenerationNamespace(root, lease).state).toBe(
        "directory-published-result-pending",
      );
      publishResult(rootPath, binding);
      expect(inspectGenerationNamespace(root, lease).state).toBe(
        "terminal-installed",
      );
    });
  });

  test("namespace without its durable intent is never accepted", async () => {
    await withRoot((root, lease, rootPath) => {
      const binding = createGenerationNamespaceInstallBinding(root, lease);
      const namespacePath = join(rootPath, "receipts", "generations");
      mkdirSync(namespacePath, { mode: 0o700 });
      expect(() => inspectGenerationNamespace(root, lease)).toThrow(
        "GENERATION_RECOVERY_REQUIRED",
      );
      expect(binding.operationKind).toBe("generation.namespace.install");
    });
  });

  test("byte-identical marker replacement loses inode provenance", async () => {
    await withRoot((root, lease, rootPath) => {
      const binding = publishIntent(root, lease, rootPath);
      publishDirectory(rootPath, binding);
      const markerPath = join(
        rootPath,
        "receipts",
        "generations",
        ".namespace-install-intent.json",
      );
      unlinkSync(markerPath);
      writeNewSyncedFile(markerPath, canonicalJsonBytes(binding));
      expect(() => inspectGenerationNamespace(root, lease)).toThrow(
        "GENERATION_RECOVERY_REQUIRED",
      );
    });
  });

  test("extra namespace entry fails before any recovery mutation", async () => {
    await withRoot((root, lease, rootPath) => {
      const binding = publishIntent(root, lease, rootPath);
      publishDirectory(rootPath, binding);
      writeNewSyncedFile(
        join(rootPath, "receipts", "generations", "foreign"),
        new Uint8Array([1]),
      );
      expect(() => inspectGenerationNamespace(root, lease)).toThrow(
        "GENERATION_RECOVERY_REQUIRED",
      );
    });
  });

  test("namespace child mode drift is rejected", async () => {
    await withRoot((root, lease, rootPath) => {
      const binding = publishIntent(root, lease, rootPath);
      publishDirectory(rootPath, binding);
      chmodSync(join(rootPath, "receipts", "generations", "catalog"), 0o755);
      expect(() => inspectGenerationNamespace(root, lease)).toThrow(
        "GENERATION_RECOVERY_REQUIRED",
      );
    });
  });
});
