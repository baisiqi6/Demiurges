import { lstatSync, opendirSync } from "node:fs";
import { join } from "node:path";

import { canonicalJsonBytes, deepFreeze } from "@demiurges/world";

import {
  requireLiveOpenedDataRoot,
  type OpenedDataRoot,
} from "./data-root";
import {
  requireLiveDataRootWriterLease,
  type DataRootWriterLease,
} from "./data-root-lease";
import {
  DATA_ROOT_RECEIPT_ENTRY_LIMIT,
  DataRootCapacityError,
  type NamespaceCapacityStateV1,
} from "./data-root-capacity";
import { inspectGenerationNamespace } from "./generation-namespace-inspection";
import {
  requireGenerationNamespaceInstallBinding,
  requireGenerationNamespaceInstallResult,
  type GenerationNamespaceInstallBindingV1,
} from "./generation-namespace";
import {
  requireOperationBinding,
  requireOperationTerminalResult,
  type OperationBinding,
} from "./operation-journal";
import {
  requireGeneratedSetPublicationBinding,
  requireGeneratedSetPublicationResult,
  type GeneratedSetPublicationBindingV1,
} from "./generated-artifact-publication";
import { readStableRegularFile } from "./safe-filesystem";

const RECORD_MAX_BYTES = 64 * 1024;
const INTENT_SUFFIX = ".intent.json";
const RESULT_SUFFIX = ".result.json";

type ReceiptBinding =
  | { readonly visibility: "public"; readonly binding: OperationBinding }
  | {
      readonly visibility: "internal-namespace";
      readonly binding: GenerationNamespaceInstallBindingV1;
    }
  | {
      readonly visibility: "internal-generated-set";
      readonly binding: GeneratedSetPublicationBindingV1;
    };

export interface DataRootCapacityInspectionV1 {
  readonly usedReceiptEntries: number;
  readonly pendingResultReservations: number;
  readonly namespaceState: NamespaceCapacityStateV1;
  readonly publicOperationCount: number;
  readonly internalOperationCount: number;
}

function recoveryRequired(): never {
  throw new DataRootCapacityError();
}

function parseCanonical(path: string): unknown {
  const bytes = readStableRegularFile(path, RECORD_MAX_BYTES);
  let value: unknown;
  try {
    value = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    return recoveryRequired();
  }
  if (!Buffer.from(bytes).equals(Buffer.from(canonicalJsonBytes(value)))) {
    return recoveryRequired();
  }
  return value;
}

function requireRegularReceipt(path: string): void {
  try {
    const stat = lstatSync(path, { bigint: true });
    if (
      (stat.mode & 0o170000n) !== 0o100000n ||
      (stat.mode & 0o777n) !== 0o600n ||
      stat.nlink < 1n
    ) {
      recoveryRequired();
    }
  } catch {
    recoveryRequired();
  }
}

function decodeBinding(value: unknown): ReceiptBinding {
  try {
    return { visibility: "public", binding: requireOperationBinding(value) };
  } catch {
    try {
      return {
        visibility: "internal-namespace",
        binding: requireGenerationNamespaceInstallBinding(value),
      };
    } catch {
      try {
        return {
          visibility: "internal-generated-set",
          binding: requireGeneratedSetPublicationBinding(value),
        };
      } catch {
        return recoveryRequired();
      }
    }
  }
}

function validateResult(value: unknown, classified: ReceiptBinding): void {
  if (classified.visibility === "public") {
    requireOperationTerminalResult(value, classified.binding);
    return;
  }
  if (classified.visibility === "internal-namespace") {
    requireGenerationNamespaceInstallResult(value, classified.binding);
    return;
  }
  requireGeneratedSetPublicationResult(value, classified.binding);
}

function sameCanonical(left: unknown, right: unknown): boolean {
  return Buffer.from(canonicalJsonBytes(left)).equals(
    Buffer.from(canonicalJsonBytes(right)),
  );
}

export function inspectDataRootCapacity(
  root: OpenedDataRoot,
  lease: DataRootWriterLease,
): DataRootCapacityInspectionV1 {
  const liveRoot = requireLiveOpenedDataRoot(root);
  const liveLease = requireLiveDataRootWriterLease(lease);
  if (liveLease.root !== root) return recoveryRequired();
  const namespace = inspectGenerationNamespace(root, lease);
  const receiptsPath = join(liveRoot.absolutePath, "receipts");
  const names: string[] = [];
  const directory = opendirSync(receiptsPath);
  try {
    while (true) {
      const entry = directory.readSync();
      if (entry === null) break;
      names.push(entry.name);
      if (names.length > DATA_ROOT_RECEIPT_ENTRY_LIMIT) recoveryRequired();
    }
  } catch {
    return recoveryRequired();
  } finally {
    directory.closeSync();
  }

  const intentNames = new Map<string, string>();
  const resultNames = new Map<string, string>();
  let hasNamespaceDirectory = false;
  for (const name of names) {
    const path = join(receiptsPath, name);
    if (name === "generations") {
      if (hasNamespaceDirectory) return recoveryRequired();
      const stat = lstatSync(path, { bigint: true });
      if (
        (stat.mode & 0o170000n) !== 0o40000n ||
        (stat.mode & 0o777n) !== 0o700n
      ) {
        return recoveryRequired();
      }
      hasNamespaceDirectory = true;
      continue;
    }
    const suffix = name.endsWith(INTENT_SUFFIX)
      ? INTENT_SUFFIX
      : name.endsWith(RESULT_SUFFIX)
        ? RESULT_SUFFIX
        : undefined;
    if (suffix === undefined) return recoveryRequired();
    const operationId = name.slice(0, -suffix.length);
    if (operationId.length === 0) return recoveryRequired();
    requireRegularReceipt(path);
    const target = suffix === INTENT_SUFFIX ? intentNames : resultNames;
    if (target.has(operationId)) return recoveryRequired();
    target.set(operationId, path);
  }

  if (
    hasNamespaceDirectory !==
      (namespace.state === "directory-published-result-pending" ||
        namespace.state === "terminal-installed")
  ) {
    return recoveryRequired();
  }

  const bindings = new Map<string, ReceiptBinding>();
  let publicOperationCount = 0;
  let internalOperationCount = 0;
  for (const [operationId, path] of intentNames) {
    const classified = decodeBinding(parseCanonical(path));
    if (classified.binding.operationId !== operationId) return recoveryRequired();
    if (classified.visibility === "public") publicOperationCount += 1;
    else internalOperationCount += 1;
    if (
      classified.visibility === "internal-generated-set" &&
      namespace.state !== "terminal-installed"
    ) {
      // generated-set 发布只可能发生在 namespace 安装完成后。
      return recoveryRequired();
    }
    bindings.set(operationId, classified);
  }
  for (const [operationId, path] of resultNames) {
    const classified = bindings.get(operationId);
    if (classified === undefined) return recoveryRequired();
    validateResult(parseCanonical(path), classified);
  }

  const namespaceBinding = bindings.get(namespace.binding.operationId);
  if (
    namespace.state === "absent-no-intent"
      ? namespaceBinding !== undefined
      : namespaceBinding?.visibility !== "internal-namespace" ||
        !sameCanonical(namespaceBinding.binding, namespace.binding)
  ) {
    return recoveryRequired();
  }
  if (internalOperationCount < (namespace.state === "absent-no-intent" ? 0 : 1)) {
    return recoveryRequired();
  }

  return deepFreeze({
    usedReceiptEntries: names.length,
    pendingResultReservations: [...intentNames.keys()].filter(
      (operationId) => !resultNames.has(operationId),
    ).length,
    namespaceState: namespace.state,
    publicOperationCount,
    internalOperationCount,
  }) as DataRootCapacityInspectionV1;
}
