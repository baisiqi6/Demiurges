import {
  canonicalJsonBytes,
  deepFreeze,
  sha256Hex,
} from "@demiurges/world";

import {
  requireLiveOpenedDataRoot,
  type OpenedDataRoot,
} from "./data-root";
import {
  dataRootLeaseDigest,
  requireLiveDataRootWriterLease,
  type DataRootWriterLease,
} from "./data-root-lease";
import type { StableDirectoryIdentity } from "./safe-filesystem";

export const GENERATION_NAMESPACE_NAME =
  "demiurges-generation-journal-v1" as const;
export const GENERATION_NAMESPACE_ENTRY_NAMES = Object.freeze([
  "namespace.json",
  ".namespace-install-intent.json",
  "data",
  "catalog",
  "birth-staging",
] as const);

export interface NamespaceInstallSeedV1 {
  readonly schemaVersion: 1;
  readonly namespace: typeof GENERATION_NAMESPACE_NAME;
  readonly entryNames: typeof GENERATION_NAMESPACE_ENTRY_NAMES;
}

export const GENERATION_NAMESPACE_SEED = deepFreeze({
  schemaVersion: 1,
  namespace: GENERATION_NAMESPACE_NAME,
  entryNames: GENERATION_NAMESPACE_ENTRY_NAMES,
}) as NamespaceInstallSeedV1;

export interface GenerationNamespaceInstallBindingV1 {
  readonly schemaVersion: 1;
  readonly operationId: string;
  readonly operationKind: "generation.namespace.install";
  readonly target: {
    readonly kind: "receipts-namespace";
    readonly id: "receipts/generations";
  };
  readonly expectedIdentity: null;
  readonly candidateIdentity: {
    readonly namespaceSeedDigest: string;
  };
}

export interface GenerationNamespaceDirectoryIdentityV1 {
  readonly dev: string;
  readonly ino: string;
  readonly mode: 448;
  readonly uid: string;
  readonly gid: string;
}

export interface GenerationNamespaceBodyV1 {
  readonly schemaVersion: 1;
  readonly namespace: typeof GENERATION_NAMESPACE_NAME;
  readonly installOperationId: string;
  readonly installBindingDigest: string;
  readonly candidateDirectoryIdentity: GenerationNamespaceDirectoryIdentityV1;
}

export type GenerationNamespaceInstallResultV1 =
  | {
      readonly schemaVersion: 1;
      readonly operationId: string;
      readonly bindingDigest: string;
      readonly variant: "success";
      readonly publishedIdentity: string;
    }
  | {
      readonly schemaVersion: 1;
      readonly operationId: string;
      readonly bindingDigest: string;
      readonly variant: "aborted-before-publish";
      readonly code: string;
    };

export class GenerationNamespaceError extends Error {
  readonly code = "GENERATION_RECOVERY_REQUIRED" as const;

  constructor() {
    super("GENERATION_RECOVERY_REQUIRED");
    this.name = "GenerationNamespaceError";
  }
}

type PlainRecord = Record<string, unknown>;

const HEX_64 = /^[a-f0-9]{64}$/;
const OPERATION_ID =
  /^op:generation-namespace-install-v1-[a-f0-9]{64}$/;
const DECIMAL = /^(?:0|[1-9][0-9]*)$/;
const PUBLIC_CODE = /^[A-Z][A-Z0-9_]{1,95}$/;

function recoveryRequired(): never {
  throw new GenerationNamespaceError();
}

function plainRecord(value: unknown): PlainRecord {
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Object.prototype
  ) {
    return recoveryRequired();
  }
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== "string") return recoveryRequired();
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (
      descriptor === undefined ||
      !("value" in descriptor) ||
      descriptor.enumerable !== true
    ) {
      return recoveryRequired();
    }
  }
  return value as PlainRecord;
}

function exactKeys(record: PlainRecord, keys: readonly string[]): void {
  const actual = Reflect.ownKeys(record);
  if (
    actual.length !== keys.length ||
    actual.some((key) => typeof key !== "string") ||
    !keys.every((key) => Object.prototype.hasOwnProperty.call(record, key))
  ) {
    recoveryRequired();
  }
}

function requireHex64(value: unknown): string {
  if (typeof value !== "string" || !HEX_64.test(value)) {
    return recoveryRequired();
  }
  return value;
}

function requireDecimal(value: unknown): string {
  if (typeof value !== "string" || !DECIMAL.test(value)) {
    return recoveryRequired();
  }
  return value;
}

function domainDigest(domain: string, value: unknown): string {
  const prefix = new TextEncoder().encode(`${domain}\u0000`);
  const body = canonicalJsonBytes(value);
  const bytes = new Uint8Array(prefix.byteLength + body.byteLength);
  bytes.set(prefix, 0);
  bytes.set(body, prefix.byteLength);
  return sha256Hex(bytes);
}

export function generationNamespaceSeedDigest(): string {
  return domainDigest(
    "demiurges-generation-namespace-seed-v1",
    GENERATION_NAMESPACE_SEED,
  );
}

export function generationNamespaceOperationIdFromLeaseDigest(
  dataRootIdentityDigest: string,
): string {
  const rootDigest = requireHex64(dataRootIdentityDigest);
  const suffix = domainDigest("demiurges-generation-namespace-operation-v1", {
    dataRootIdentityDigest: rootDigest,
    namespaceSeedDigest: generationNamespaceSeedDigest(),
  });
  const operationId = `op:generation-namespace-install-v1-${suffix}`;
  if (!OPERATION_ID.test(operationId)) return recoveryRequired();
  return operationId;
}

export function createGenerationNamespaceInstallBindingFromLeaseDigest(
  dataRootIdentityDigest: string,
): GenerationNamespaceInstallBindingV1 {
  return deepFreeze({
    schemaVersion: 1,
    operationId: generationNamespaceOperationIdFromLeaseDigest(
      dataRootIdentityDigest,
    ),
    operationKind: "generation.namespace.install",
    target: {
      kind: "receipts-namespace",
      id: "receipts/generations",
    },
    expectedIdentity: null,
    candidateIdentity: {
      namespaceSeedDigest: generationNamespaceSeedDigest(),
    },
  }) as GenerationNamespaceInstallBindingV1;
}

export function createGenerationNamespaceInstallBinding(
  root: OpenedDataRoot,
  lease: DataRootWriterLease,
): GenerationNamespaceInstallBindingV1 {
  const liveRoot = requireLiveOpenedDataRoot(root);
  const liveLease = requireLiveDataRootWriterLease(lease);
  if (
    liveLease.root !== root ||
    liveLease.identity.dev !== liveRoot.identity.dev ||
    liveLease.identity.ino !== liveRoot.identity.ino ||
    liveLease.leaseDigest !== dataRootLeaseDigest(liveRoot.identity)
  ) {
    return recoveryRequired();
  }
  return createGenerationNamespaceInstallBindingFromLeaseDigest(
    liveLease.leaseDigest,
  );
}

export function requireGenerationNamespaceInstallBinding(
  value: unknown,
): GenerationNamespaceInstallBindingV1 {
  const record = plainRecord(value);
  exactKeys(record, [
    "schemaVersion",
    "operationId",
    "operationKind",
    "target",
    "expectedIdentity",
    "candidateIdentity",
  ]);
  const target = plainRecord(record.target);
  exactKeys(target, ["kind", "id"]);
  const candidate = plainRecord(record.candidateIdentity);
  exactKeys(candidate, ["namespaceSeedDigest"]);
  if (
    record.schemaVersion !== 1 ||
    record.operationKind !== "generation.namespace.install" ||
    record.expectedIdentity !== null ||
    target.kind !== "receipts-namespace" ||
    target.id !== "receipts/generations" ||
    typeof record.operationId !== "string" ||
    !OPERATION_ID.test(record.operationId) ||
    candidate.namespaceSeedDigest !== generationNamespaceSeedDigest()
  ) {
    return recoveryRequired();
  }
  return deepFreeze({
    schemaVersion: 1,
    operationId: record.operationId,
    operationKind: "generation.namespace.install",
    target: {
      kind: "receipts-namespace",
      id: "receipts/generations",
    },
    expectedIdentity: null,
    candidateIdentity: {
      namespaceSeedDigest: candidate.namespaceSeedDigest,
    },
  }) as GenerationNamespaceInstallBindingV1;
}

export function generationNamespaceInstallBindingDigest(
  binding: GenerationNamespaceInstallBindingV1,
): string {
  return sha256Hex(
    canonicalJsonBytes(requireGenerationNamespaceInstallBinding(binding)),
  );
}

export function generationNamespacePublishedIdentity(
  binding: GenerationNamespaceInstallBindingV1,
): string {
  return requireGenerationNamespaceInstallBinding(binding).candidateIdentity
    .namespaceSeedDigest;
}

export function requireGenerationNamespaceInstallResult(
  value: unknown,
  bindingInput: GenerationNamespaceInstallBindingV1,
): GenerationNamespaceInstallResultV1 {
  const binding = requireGenerationNamespaceInstallBinding(bindingInput);
  const record = plainRecord(value);
  const bindingDigest = generationNamespaceInstallBindingDigest(binding);
  if (record.variant === "success") {
    exactKeys(record, [
      "schemaVersion",
      "operationId",
      "bindingDigest",
      "variant",
      "publishedIdentity",
    ]);
    if (
      record.schemaVersion !== 1 ||
      record.operationId !== binding.operationId ||
      record.bindingDigest !== bindingDigest ||
      record.publishedIdentity !== generationNamespacePublishedIdentity(binding)
    ) {
      return recoveryRequired();
    }
    return deepFreeze({ ...record }) as GenerationNamespaceInstallResultV1;
  }
  exactKeys(record, [
    "schemaVersion",
    "operationId",
    "bindingDigest",
    "variant",
    "code",
  ]);
  if (
    record.schemaVersion !== 1 ||
    record.operationId !== binding.operationId ||
    record.bindingDigest !== bindingDigest ||
    record.variant !== "aborted-before-publish" ||
    typeof record.code !== "string" ||
    !PUBLIC_CODE.test(record.code)
  ) {
    return recoveryRequired();
  }
  return deepFreeze({ ...record }) as GenerationNamespaceInstallResultV1;
}

function directoryIdentityFromStable(
  value: StableDirectoryIdentity,
): GenerationNamespaceDirectoryIdentityV1 {
  if (
    (value.mode & 0o170000n) !== 0o40000n ||
    (value.mode & 0o777n) !== 0o700n ||
    value.dev < 0n ||
    value.ino < 0n ||
    value.uid < 0n ||
    value.gid < 0n
  ) {
    return recoveryRequired();
  }
  return {
    dev: value.dev.toString(),
    ino: value.ino.toString(),
    mode: 448,
    uid: value.uid.toString(),
    gid: value.gid.toString(),
  };
}

function requireDirectoryIdentity(
  value: unknown,
): GenerationNamespaceDirectoryIdentityV1 {
  const record = plainRecord(value);
  exactKeys(record, ["dev", "ino", "mode", "uid", "gid"]);
  if (record.mode !== 448) return recoveryRequired();
  return {
    dev: requireDecimal(record.dev),
    ino: requireDecimal(record.ino),
    mode: 448,
    uid: requireDecimal(record.uid),
    gid: requireDecimal(record.gid),
  };
}

function sameDirectoryIdentity(
  left: GenerationNamespaceDirectoryIdentityV1,
  right: GenerationNamespaceDirectoryIdentityV1,
): boolean {
  return left.dev === right.dev &&
    left.ino === right.ino &&
    left.mode === right.mode &&
    left.uid === right.uid &&
    left.gid === right.gid;
}

export function createGenerationNamespaceBody(
  bindingInput: GenerationNamespaceInstallBindingV1,
  candidateDirectoryIdentity: StableDirectoryIdentity,
): GenerationNamespaceBodyV1 {
  const binding = requireGenerationNamespaceInstallBinding(bindingInput);
  return deepFreeze({
    schemaVersion: 1,
    namespace: GENERATION_NAMESPACE_NAME,
    installOperationId: binding.operationId,
    installBindingDigest: generationNamespaceInstallBindingDigest(binding),
    candidateDirectoryIdentity: directoryIdentityFromStable(
      candidateDirectoryIdentity,
    ),
  }) as GenerationNamespaceBodyV1;
}

export function requireGenerationNamespaceBody(
  value: unknown,
  bindingInput: GenerationNamespaceInstallBindingV1,
  expectedDirectoryIdentity?: GenerationNamespaceDirectoryIdentityV1,
): GenerationNamespaceBodyV1 {
  const binding = requireGenerationNamespaceInstallBinding(bindingInput);
  const record = plainRecord(value);
  exactKeys(record, [
    "schemaVersion",
    "namespace",
    "installOperationId",
    "installBindingDigest",
    "candidateDirectoryIdentity",
  ]);
  const candidateDirectoryIdentity = requireDirectoryIdentity(
    record.candidateDirectoryIdentity,
  );
  if (
    record.schemaVersion !== 1 ||
    record.namespace !== GENERATION_NAMESPACE_NAME ||
    record.installOperationId !== binding.operationId ||
    record.installBindingDigest !== generationNamespaceInstallBindingDigest(binding) ||
    (expectedDirectoryIdentity !== undefined &&
      !sameDirectoryIdentity(candidateDirectoryIdentity, expectedDirectoryIdentity))
  ) {
    return recoveryRequired();
  }
  return deepFreeze({
    schemaVersion: 1,
    namespace: GENERATION_NAMESPACE_NAME,
    installOperationId: binding.operationId,
    installBindingDigest: generationNamespaceInstallBindingDigest(binding),
    candidateDirectoryIdentity,
  }) as GenerationNamespaceBodyV1;
}
