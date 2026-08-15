import { join } from "node:path";

import {
  MARBLE_HUNYUAN_MANIFEST_DIGEST,
  MARBLE_HUNYUAN_REGISTRY,
  sha256Hex,
} from "@demiurges/world";

import {
  cleanupArtifactAttemptCandidates,
  publishRegisteredArtifactForAdmittedOperation,
  validateRegisteredProjectArtifactBytes,
} from "./artifact-store";
import type { OpenedDataRoot } from "./data-root";
import type { DataRootWriterLease } from "./data-root-lease";
import {
  OperationJournal,
  OperationSingleFlight,
  artifactCandidateSetDigest,
  isDurablyFinalizedOperation,
  type ArtifactCandidateIdentity,
  type OperationBinding,
  type OperationTerminalResult,
} from "./operation-journal";
import { readStableRegularFile } from "./safe-filesystem";

export const DH013_IMPORT_OPERATION_ID = `op:${sha256Hex(
  new TextEncoder().encode(
    `demiurges-dh013-import-v1\u0000${MARBLE_HUNYUAN_MANIFEST_DIGEST}`,
  ),
)}`;

export interface ImportDh013Result {
  readonly terminal: OperationTerminalResult;
  readonly replayed: boolean;
}

function candidates(): readonly ArtifactCandidateIdentity[] {
  return MARBLE_HUNYUAN_REGISTRY.assets
    .map((entry) => ({
      assetId: entry.assetId,
      digest: entry.digest,
      byteLength: entry.byteLength,
      format: entry.format,
      elementCount: entry.elementCount,
      sourceBounds: entry.sourceBounds,
    }))
    .sort((left, right) => left.digest.localeCompare(right.digest));
}

export async function importDh013ProviderCache(
  root: OpenedDataRoot,
  lease: DataRootWriterLease,
  cacheRoot: string,
  signal?: AbortSignal,
  singleFlight: OperationSingleFlight = new OperationSingleFlight(),
): Promise<ImportDh013Result> {
  // Phase A：在 global admission 前从显式 legacy cache 全量读取、验证；不写 Data Root。
  const candidateArtifacts = candidates();
  const bytesByDigest = new Map<string, Uint8Array>();
  for (const candidate of candidateArtifacts) {
    const bytes = readStableRegularFile(
      join(cacheRoot, "sha256", candidate.digest),
      candidate.byteLength,
    );
    if (bytes.byteLength !== candidate.byteLength) {
      throw new Error("DH-013 cache Artifact byteLength 不一致");
    }
    validateRegisteredProjectArtifactBytes(candidate, bytes);
    bytesByDigest.set(candidate.digest, bytes);
  }

  const binding: OperationBinding = {
    schemaVersion: 1,
    operationId: DH013_IMPORT_OPERATION_ID,
    operationKind: "artifact.import-dh013",
    target: { kind: "registry", id: "registry:marble-hunyuan-v1" },
    expectedIdentity: null,
    candidateIdentity: {
      candidateArtifacts,
      artifactSetDigest: artifactCandidateSetDigest(candidateArtifacts),
    },
  };
  return singleFlight.run(binding, signal, async () => {
    const journal = new OperationJournal(root, lease);
    const admission = journal.admit(binding);
    if (admission.status === "replay") {
      if (admission.result.variant !== "success") {
        throw new Error(admission.result.code);
      }
      return { terminal: admission.result, replayed: true };
    }
    const operation = admission.operation;
    if (operation.attemptToken.length === 0) throw new Error("OPERATION_RECOVERY_REQUIRED");
    try {
      for (const candidate of candidateArtifacts) {
        const entry = MARBLE_HUNYUAN_REGISTRY.assets.find(
          (value) => value.digest === candidate.digest,
        )!;
        publishRegisteredArtifactForAdmittedOperation({
          root,
          lease,
          journal,
          operation,
          entry,
          bytes: bytesByDigest.get(candidate.digest)!,
        });
      }
      const terminal = journal.finalizeSuccess(operation);
      return { terminal, replayed: false };
    } catch (error) {
      const code =
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        error.code === "ARTIFACT_DESTINATION_CONFLICT"
          ? "ARTIFACT_DESTINATION_CONFLICT"
          : undefined;
      if (code !== undefined) journal.finalizeAborted(operation, code);
      throw error;
    } finally {
      let cleanupFailed = false;
      const terminalExists = isDurablyFinalizedOperation(
        operation,
        root,
        lease,
        journal,
      );
      if (terminalExists && !cleanupFailed) {
        try {
          cleanupArtifactAttemptCandidates(
            root,
            lease,
            journal,
            operation,
            candidateArtifacts,
          );
          journal.cleanupAttempt(operation);
        } catch {
          cleanupFailed = true;
        }
      }
      if (cleanupFailed) {
        throw new Error("OPERATION_RECOVERY_REQUIRED");
      }
    }
  });
}
