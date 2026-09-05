import { lstatSync, opendirSync } from "node:fs";
import { join } from "node:path";

import { canonicalJsonBytes, deepFreeze, sha256Hex } from "@demiurges/world";

import {
  requireLiveOpenedDataRoot,
  type OpenedDataRoot,
} from "./data-root";
import {
  requireLiveDataRootWriterLease,
  type DataRootWriterLease,
} from "./data-root-lease";
import { inspectDataRootCapacity } from "./data-root-capacity-inspection";
import {
  calculateDataRootCapacity,
  DataRootCapacityError,
  type DataRootCapacityResultV1,
} from "./data-root-capacity";
import {
  generationCatalogFilename,
  generationIdDigest,
} from "./generation-birth";
import {
  GenerationBirthJournal,
  type GenerationBirthInspection,
} from "./generation-birth-journal";
import {
  requireGenerationIntent,
  type GenerationIntentV1,
} from "./generation-contracts";
import { readStableDirectoryIdentity, readStableRegularFile } from "./safe-filesystem";

export interface FirstGenerationCapacityCapability {
  readonly kind: "first-generation-composite-capacity";
  readonly effectiveEntries: number;
}

export type FirstGenerationCapacityAdmission =
  | {
      readonly status: "authorized";
      readonly capability: FirstGenerationCapacityCapability;
    }
  | { readonly status: "capacity-reached" };

interface CapabilityAuthority {
  readonly root: OpenedDataRoot;
  readonly lease: DataRootWriterLease;
  readonly inspectionBytes: Uint8Array;
  readonly capacityBytes: Uint8Array;
  readonly intentBytes: Uint8Array;
  readonly evidenceBytes: Uint8Array;
  readonly intent: GenerationIntentV1;
  consumed: boolean;
}

const capabilityAuthorities = new WeakMap<
  FirstGenerationCapacityCapability,
  CapabilityAuthority
>();
const activeCapabilities = new WeakMap<
  DataRootWriterLease,
  FirstGenerationCapacityCapability
>();
const birthAdmissions = new WeakMap<FirstGenerationBirthAdmission, {
  readonly root: OpenedDataRoot;
  readonly lease: DataRootWriterLease;
  readonly intent: GenerationIntentV1;
  readonly inspectionBytes: Uint8Array;
  readonly capacityBytes: Uint8Array;
  readonly evidenceBytes: Uint8Array;
  consumed: boolean;
}>();

function recoveryRequired(): never {
  throw new DataRootCapacityError();
}

interface EntryEvidence {
  readonly name: string;
  readonly kind: "directory" | "regular";
  readonly dev: string;
  readonly ino: string;
  readonly mode: string;
  readonly uid: string;
  readonly gid: string;
  readonly bytesDigest?: string;
}

interface FirstGenerationEvidenceSnapshot {
  readonly namespaceState: ReturnType<typeof inspectDataRootCapacity>["namespaceState"];
  readonly dataDirectory: EntryEvidence;
  readonly catalogDirectory: EntryEvidence;
  readonly birthStagingDirectory: EntryEvidence;
  readonly dataEntries: readonly EntryEvidence[];
  readonly catalogEntries: readonly EntryEvidence[];
  readonly birthStagingEntries: readonly EntryEvidence[];
  readonly birth: GenerationBirthInspection | "namespace-result-pending";
}

export interface FirstGenerationBirthAdmission {
  readonly kind: "first-generation-birth-admission";
}

function recoveryCode<T>(run: () => T): T {
  try {
    return run();
  } catch {
    return recoveryRequired();
  }
}

function directoryEvidence(path: string, name: string): EntryEvidence {
  return recoveryCode(() => {
    const identity = readStableDirectoryIdentity(path);
    return Object.freeze({
      name,
      kind: "directory" as const,
      dev: identity.dev.toString(),
      ino: identity.ino.toString(),
      mode: identity.mode.toString(),
      uid: identity.uid.toString(),
      gid: identity.gid.toString(),
    });
  });
}

function regularEvidence(path: string, name: string): EntryEvidence {
  return recoveryCode(() => {
    const stat = lstatSync(path, { bigint: true });
    if (
      (stat.mode & 0o170000n) !== 0o100000n ||
      (stat.mode & 0o777n) !== 0o600n
    ) {
      return recoveryRequired();
    }
    const bytes = readStableRegularFile(path, 64 * 1024);
    return Object.freeze({
      name,
      kind: "regular" as const,
      dev: stat.dev.toString(),
      ino: stat.ino.toString(),
      mode: stat.mode.toString(),
      uid: stat.uid.toString(),
      gid: stat.gid.toString(),
      bytesDigest: sha256Hex(bytes),
    });
  });
}

function requireOnlyFirstGenerationEntry(
  path: string,
  expected: string | RegExp | undefined,
  kind: "directory" | "regular",
): readonly EntryEvidence[] {
  const directory = opendirSync(path);
  try {
    const entries: EntryEvidence[] = [];
    while (true) {
      const entry = directory.readSync();
      if (entry === null) break;
      if (
        entries.length > 0 ||
        expected === undefined ||
        (typeof expected === "string"
          ? entry.name !== expected
          : !expected.test(entry.name))
      ) {
        return recoveryRequired();
      }
      const entryPath = join(path, entry.name);
      entries.push(kind === "directory"
        ? directoryEvidence(entryPath, entry.name)
        : regularEvidence(entryPath, entry.name));
    }
    return Object.freeze(entries);
  } catch {
    recoveryRequired();
  } finally {
    directory.closeSync();
  }
}

function requireCurrentBirthStagingEntry(
  path: string,
  intent: GenerationIntentV1,
): readonly EntryEvidence[] {
  const entries = requireOnlyFirstGenerationEntry(
    path,
    /^[a-f0-9]{32}\.json$/,
    "regular",
  );
  if (entries.length === 0) return entries;
  const bytes = readStableRegularFile(join(path, entries[0]!.name), 64 * 1024);
  let value: unknown;
  try {
    value = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    return recoveryRequired();
  }
  if (
    !Buffer.from(bytes).equals(Buffer.from(canonicalJsonBytes(value))) ||
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Object.prototype ||
    (value as { generationId?: unknown }).generationId !== intent.generationId
  ) {
    return recoveryRequired();
  }
  return entries;
}

function inspectFirstGenerationCapacity(
  root: OpenedDataRoot,
  lease: DataRootWriterLease,
  intent: GenerationIntentV1,
): {
  readonly inspection: ReturnType<typeof inspectDataRootCapacity>;
  readonly capacity: DataRootCapacityResultV1;
  readonly evidence: FirstGenerationEvidenceSnapshot | null;
} {
  const liveRoot = requireLiveOpenedDataRoot(root);
  const liveLease = requireLiveDataRootWriterLease(lease);
  if (liveLease.root !== root) return recoveryRequired();
  const inspection = inspectDataRootCapacity(root, lease);
  let evidence: FirstGenerationEvidenceSnapshot | null = null;
  let generations: readonly { readonly state: "admitted"; readonly publicationEvidence: "none" }[] = [];
  let request: "none" | "generation-birth" = "generation-birth";
  if (
    inspection.namespaceState === "directory-published-result-pending" ||
    inspection.namespaceState === "terminal-installed"
  ) {
    const namespacePath = join(liveRoot.absolutePath, "receipts", "generations");
    const dataPath = join(namespacePath, "data");
    const catalogPath = join(namespacePath, "catalog");
    const birthStagingPath = join(namespacePath, "birth-staging");
    const dataEntries = requireOnlyFirstGenerationEntry(
      dataPath,
      generationIdDigest(intent.generationId),
      "directory",
    );
    const catalogEntries = requireOnlyFirstGenerationEntry(
      catalogPath,
      generationCatalogFilename(intent.generationId),
      "regular",
    );
    const terminal = inspection.namespaceState === "terminal-installed";
    const birthStagingEntries = terminal
      ? requireCurrentBirthStagingEntry(birthStagingPath, intent)
      : requireOnlyFirstGenerationEntry(birthStagingPath, undefined, "regular");
    const birth = terminal
      ? new GenerationBirthJournal(root, lease).inspect(intent)
      : "namespace-result-pending" as const;
    if (!terminal && (
      dataEntries.length !== 0 ||
      catalogEntries.length !== 0 ||
      birthStagingEntries.length !== 0
    )) {
      return recoveryRequired();
    }
    if (
      terminal &&
      birth !== "namespace-result-pending" &&
      birth.status === "absent" &&
      birthStagingEntries.length !== 0
    ) {
      return recoveryRequired();
    }
    evidence = Object.freeze({
      namespaceState: inspection.namespaceState,
      dataDirectory: directoryEvidence(dataPath, "data"),
      catalogDirectory: directoryEvidence(catalogPath, "catalog"),
      birthStagingDirectory: directoryEvidence(birthStagingPath, "birth-staging"),
      dataEntries,
      catalogEntries,
      birthStagingEntries,
      birth,
    });
    if (
      terminal &&
      birth !== "namespace-result-pending" &&
      birth.status !== "absent"
    ) {
      generations = Object.freeze([{ state: "admitted", publicationEvidence: "none" }]);
      request = "none";
    }
  }
  const capacity = calculateDataRootCapacity({
    usedReceiptEntries: inspection.usedReceiptEntries,
    pendingResultReservations: inspection.pendingResultReservations,
    namespaceState: inspection.namespaceState,
    generations,
    request,
  });
  if (capacity.status === "recovery-required") return recoveryRequired();
  return { inspection, capacity, evidence };
}

export function authorizeFirstGenerationCapacity(
  root: OpenedDataRoot,
  lease: DataRootWriterLease,
  intentInput: GenerationIntentV1,
): FirstGenerationCapacityAdmission {
  const intent = requireGenerationIntent(intentInput);
  const current = inspectFirstGenerationCapacity(root, lease, intent);
  if (!current.capacity.canAdmit) {
    return deepFreeze({ status: "capacity-reached" });
  }
  const existing = activeCapabilities.get(lease);
  if (existing !== undefined) {
    const authority = capabilityAuthorities.get(existing);
    if (
      authority === undefined ||
      authority.consumed ||
      authority.root !== root ||
      !Buffer.from(canonicalJsonBytes(intent)).equals(
        Buffer.from(authority.intentBytes),
      ) ||
      !Buffer.from(canonicalJsonBytes(current.inspection)).equals(
        Buffer.from(authority.inspectionBytes),
      ) ||
      !Buffer.from(canonicalJsonBytes(current.capacity)).equals(
        Buffer.from(authority.capacityBytes),
      ) ||
      !Buffer.from(canonicalJsonBytes(current.evidence)).equals(
        Buffer.from(authority.evidenceBytes),
      )
    ) {
      return recoveryRequired();
    }
    return deepFreeze({ status: "authorized", capability: existing });
  }
  const capability = deepFreeze({
    kind: "first-generation-composite-capacity",
    effectiveEntries: current.capacity.effectiveEntries,
  }) as FirstGenerationCapacityCapability;
  capabilityAuthorities.set(capability, {
    root,
    lease,
    inspectionBytes: canonicalJsonBytes(current.inspection),
    capacityBytes: canonicalJsonBytes(current.capacity),
    intentBytes: canonicalJsonBytes(intent),
    evidenceBytes: canonicalJsonBytes(current.evidence),
    intent,
    consumed: false,
  });
  activeCapabilities.set(lease, capability);
  return deepFreeze({ status: "authorized", capability });
}

/**
 * The future namespace+birth coordinator calls this immediately before its
 * synchronous first filesystem mutation. It deliberately returns no reusable
 * writer object.
 */
export function consumeFirstGenerationCapacity(
  capability: FirstGenerationCapacityCapability,
  root: OpenedDataRoot,
  lease: DataRootWriterLease,
): DataRootCapacityResultV1 {
  const authority = capabilityAuthorities.get(capability);
  if (
    authority === undefined ||
    authority.root !== root ||
    authority.lease !== lease ||
    authority.consumed
  ) {
    return recoveryRequired();
  }
  authority.consumed = true;
  activeCapabilities.delete(lease);
  const current = inspectFirstGenerationCapacity(root, lease, authority.intent);
  if (
    !current.capacity.canAdmit ||
    !Buffer.from(canonicalJsonBytes(current.inspection)).equals(
      Buffer.from(authority.inspectionBytes),
    ) ||
    !Buffer.from(canonicalJsonBytes(current.capacity)).equals(
      Buffer.from(authority.capacityBytes),
    ) ||
    !Buffer.from(canonicalJsonBytes(current.evidence)).equals(
      Buffer.from(authority.evidenceBytes),
    )
  ) {
    return recoveryRequired();
  }
  return current.capacity;
}

export function prepareFirstGenerationBirthAdmission(
  capability: FirstGenerationCapacityCapability,
  root: OpenedDataRoot,
  lease: DataRootWriterLease,
  intentInput: GenerationIntentV1,
): FirstGenerationBirthAdmission {
  const authority = capabilityAuthorities.get(capability);
  const intent = requireGenerationIntent(intentInput);
  if (
    authority === undefined ||
    authority.root !== root ||
    authority.lease !== lease ||
    !authority.consumed ||
    !Buffer.from(canonicalJsonBytes(intent)).equals(
      Buffer.from(authority.intentBytes),
    )
  ) return recoveryRequired();
  const current = inspectFirstGenerationCapacity(root, lease, intent);
  if (current.evidence === null || !current.capacity.canAdmit) {
    return recoveryRequired();
  }
  const admission = deepFreeze({
    kind: "first-generation-birth-admission" as const,
  }) as FirstGenerationBirthAdmission;
  birthAdmissions.set(admission, {
    root,
    lease,
    intent,
    inspectionBytes: canonicalJsonBytes(current.inspection),
    capacityBytes: canonicalJsonBytes(current.capacity),
    evidenceBytes: canonicalJsonBytes(current.evidence),
    consumed: false,
  });
  return admission;
}

export function consumeFirstGenerationBirthAdmission(
  admission: FirstGenerationBirthAdmission,
  root: OpenedDataRoot,
  lease: DataRootWriterLease,
  intentInput: GenerationIntentV1,
): void {
  const authority = birthAdmissions.get(admission);
  const intent = requireGenerationIntent(intentInput);
  if (
    authority === undefined ||
    authority.consumed ||
    authority.root !== root ||
    authority.lease !== lease ||
    !Buffer.from(canonicalJsonBytes(intent)).equals(
      Buffer.from(canonicalJsonBytes(authority.intent)),
    )
  ) return recoveryRequired();
  authority.consumed = true;
  const current = inspectFirstGenerationCapacity(root, lease, intent);
  if (
    !current.capacity.canAdmit ||
    current.evidence === null ||
    !Buffer.from(canonicalJsonBytes(current.inspection)).equals(
      Buffer.from(authority.inspectionBytes),
    ) ||
    !Buffer.from(canonicalJsonBytes(current.capacity)).equals(
      Buffer.from(authority.capacityBytes),
    ) ||
    !Buffer.from(canonicalJsonBytes(current.evidence)).equals(
      Buffer.from(authority.evidenceBytes),
    )
  ) return recoveryRequired();
}
