import { describe, expect, test } from "bun:test";
import {
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
  authorizeFirstGenerationCapacity,
  consumeFirstGenerationCapacity,
  type FirstGenerationCapacityCapability,
} from "./first-generation-capacity";
import { calculateDataRootCapacity } from "./data-root-capacity";
import {
  createGenerationBinding,
  createGenerationIntent,
  requireGenerationRequest,
  type GenerationIntentV1,
} from "./generation-contracts";
import { operationBindingDigest, type OperationBinding } from "./operation-journal";
import { syncDirectory, writeNewSyncedFile } from "./safe-filesystem";

async function withRoot(
  run: (
    root: OpenedDataRoot,
    lease: DataRootWriterLease,
    rootPath: string,
  ) => Promise<void> | void,
): Promise<void> {
  const parent = mkdtempSync(join(tmpdir(), "dh017-first-capacity-"));
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

function addPendingPublicIntent(rootPath: string, operationId: string): void {
  writeNewSyncedFile(
    join(rootPath, dataRootReceiptIntentPath(operationId)),
    canonicalJsonBytes({
      schemaVersion: 1,
      operationId,
      operationKind: "project.save-as",
      target: { kind: "project", id: "project:first-capacity" },
      expectedIdentity: null,
      candidateIdentity: {
        projectRevision: `project-revision:sha256:${"b".repeat(64)}`,
      },
    }),
  );
  syncDirectory(join(rootPath, "receipts"));
}

function testIntent(): GenerationIntentV1 {
  return createGenerationIntent(createGenerationBinding(requireGenerationRequest({
    provider: "worldlabs-marble-v1",
    model: "marble-1.1",
    prompt: "first capacity intent",
    costUnknownAccepted: true,
    waitForCompletionAndDownload: true,
    idempotencyKey: "first-capacity-intent",
  }), {
    contractProfile: "worldlabs-openapi-2026-08-15-v1",
    contractShapeDigest: "a".repeat(64),
  }), "2026-08-15T10:00:00.000Z");
}

describe("first Generation composite capacity capability", () => {
  test("exact active replay at used=2046 consumes only its existing two-slot reservation", () => {
    expect(calculateDataRootCapacity({
      usedReceiptEntries: 2046,
      pendingResultReservations: 0,
      namespaceState: "terminal-installed",
      generations: [{ state: "admitted", publicationEvidence: "none" }],
      request: "none",
    })).toMatchObject({
      status: "ready",
      effectiveEntries: 2048,
      canAdmit: true,
    });
  });

  test("mints one exact five-slot authority from persisted empty-root facts", async () => {
    await withRoot((root, lease, rootPath) => {
      const before = readdirSync(join(rootPath, "receipts"));
      const admitted = authorizeFirstGenerationCapacity(root, lease, testIntent());
      expect(admitted.status).toBe("authorized");
      if (admitted.status !== "authorized") return;
      expect(admitted.capability).toEqual({
        kind: "first-generation-composite-capacity",
        effectiveEntries: 5,
      });
      expect(consumeFirstGenerationCapacity(
        admitted.capability,
        root,
        lease,
      ).effectiveEntries).toBe(5);
      expect(readdirSync(join(rootPath, "receipts"))).toEqual(before);
    });
  });

  test("coalesces one authority and rejects forged or replayed capabilities", async () => {
    await withRoot((root, lease) => {
      const admitted = authorizeFirstGenerationCapacity(root, lease, testIntent());
      expect(admitted.status).toBe("authorized");
      if (admitted.status !== "authorized") return;
      const follower = authorizeFirstGenerationCapacity(root, lease, testIntent());
      expect(follower.status).toBe("authorized");
      if (follower.status !== "authorized") return;
      expect(follower.capability).toBe(admitted.capability);
      const forged = {
        kind: "first-generation-composite-capacity",
        effectiveEntries: 5,
      } as FirstGenerationCapacityCapability;
      expect(() => consumeFirstGenerationCapacity(forged, root, lease)).toThrow(
        "OPERATION_RECOVERY_REQUIRED",
      );
      expect(consumeFirstGenerationCapacity(
        admitted.capability,
        root,
        lease,
      ).canAdmit).toBe(true);
      expect(() =>
        consumeFirstGenerationCapacity(admitted.capability, root, lease)
      ).toThrow("OPERATION_RECOVERY_REQUIRED");
    });
  });

  test("disk drift between authorization and consumption preserves evidence", async () => {
    await withRoot((root, lease, rootPath) => {
      const admitted = authorizeFirstGenerationCapacity(root, lease, testIntent());
      expect(admitted.status).toBe("authorized");
      if (admitted.status !== "authorized") return;
      addPendingPublicIntent(rootPath, "op:capacity-drift");
      const before = readdirSync(join(rootPath, "receipts")).sort();
      expect(() =>
        consumeFirstGenerationCapacity(admitted.capability, root, lease)
      ).toThrow("OPERATION_RECOVERY_REQUIRED");
      expect(readdirSync(join(rootPath, "receipts")).sort()).toEqual(before);
    });
  });

  test("capacity exhaustion returns status without changing receipts", async () => {
    await withRoot((root, lease, rootPath) => {
      const receiptsPath = join(rootPath, "receipts");
      for (let index = 0; index < 1022; index += 1) {
        const operationId = `op:capacity-full-${index}`;
        const projectRevision = `project-revision:sha256:${index.toString(16).padStart(64, "0")}`;
        const binding: OperationBinding = {
          schemaVersion: 1,
          operationId,
          operationKind: "project.save-as",
          target: { kind: "project", id: "project:first-capacity" },
          expectedIdentity: null,
          candidateIdentity: { projectRevision },
        };
        writeFileSync(
          join(rootPath, dataRootReceiptIntentPath(operationId)),
          canonicalJsonBytes(binding),
          { mode: 0o600 },
        );
        writeFileSync(
          join(rootPath, dataRootReceiptResultPath(operationId)),
          canonicalJsonBytes({
            schemaVersion: 1,
            operationId,
            bindingDigest: operationBindingDigest(binding),
            variant: "success",
            publishedIdentity: projectRevision,
          }),
          { mode: 0o600 },
        );
      }
      syncDirectory(receiptsPath);
      const before = readdirSync(receiptsPath).sort();
      expect(authorizeFirstGenerationCapacity(root, lease, testIntent())).toEqual({
        status: "capacity-reached",
      });
      expect(readdirSync(receiptsPath).sort()).toEqual(before);
    });
  });
});
