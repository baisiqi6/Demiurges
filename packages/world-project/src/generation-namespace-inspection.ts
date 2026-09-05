import {
  closeSync,
  constants as FS,
  fstatSync,
  lstatSync,
  openSync,
  opendirSync,
} from "node:fs";
import { join } from "node:path";

import { canonicalJsonBytes, deepFreeze } from "@demiurges/world";

import {
  dataRootReceiptIntentPath,
  dataRootReceiptResultPath,
  requireLiveOpenedDataRoot,
  type OpenedDataRoot,
} from "./data-root";
import {
  dataRootLeaseDigest,
  type DataRootWriterLease,
} from "./data-root-lease";
import {
  GENERATION_NAMESPACE_ENTRY_NAMES,
  GenerationNamespaceError,
  createGenerationNamespaceInstallBinding,
  createGenerationNamespaceInstallBindingFromLeaseDigest,
  generationNamespaceInstallBindingDigest,
  requireGenerationNamespaceBody,
  requireGenerationNamespaceInstallBinding,
  requireGenerationNamespaceInstallResult,
  type GenerationNamespaceBodyV1,
  type GenerationNamespaceDirectoryIdentityV1,
  type GenerationNamespaceInstallBindingV1,
} from "./generation-namespace";
import {
  readStableDirectoryIdentity,
  readStableRegularFile,
  type StableDirectoryIdentity,
} from "./safe-filesystem";

export type GenerationNamespaceInspectionV1 =
  | {
      readonly state: "absent-no-intent";
      readonly binding: GenerationNamespaceInstallBindingV1;
      readonly bindingDigest: string;
    }
  | {
      readonly state: "install-intent-pending";
      readonly binding: GenerationNamespaceInstallBindingV1;
      readonly bindingDigest: string;
    }
  | {
      readonly state:
        | "directory-published-result-pending"
        | "terminal-installed";
      readonly binding: GenerationNamespaceInstallBindingV1;
      readonly bindingDigest: string;
      readonly namespaceBody: GenerationNamespaceBodyV1;
      readonly directoryIdentity: GenerationNamespaceDirectoryIdentityV1;
    };

interface RegularIdentity {
  readonly dev: bigint;
  readonly ino: bigint;
  readonly nlink: bigint;
}

function recoveryRequired(): never {
  throw new GenerationNamespaceError();
}

function syscallCode(error: unknown): string | undefined {
  if (typeof error === "object" && error !== null && "code" in error) {
    return typeof error.code === "string" ? error.code : undefined;
  }
  return undefined;
}

function exists(path: string): boolean {
  try {
    lstatSync(path);
    return true;
  } catch (error) {
    if (syscallCode(error) === "ENOENT") return false;
    return recoveryRequired();
  }
}

function parseCanonical(path: string): unknown {
  const bytes = readStableRegularFile(path, 64 * 1024);
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

function sameCanonical(left: unknown, right: unknown): boolean {
  return Buffer.from(canonicalJsonBytes(left)).equals(
    Buffer.from(canonicalJsonBytes(right)),
  );
}

function regularIdentity(path: string): RegularIdentity {
  let fd: number | undefined;
  try {
    fd = openSync(path, FS.O_RDONLY | FS.O_NOFOLLOW);
    const stat = fstatSync(fd, { bigint: true });
    if (
      (stat.mode & 0o170000n) !== 0o100000n ||
      (stat.mode & 0o777n) !== 0o600n
    ) {
      return recoveryRequired();
    }
    return { dev: stat.dev, ino: stat.ino, nlink: stat.nlink };
  } catch {
    return recoveryRequired();
  } finally {
    if (fd !== undefined) closeSync(fd);
  }
}

function directoryIdentity(path: string): StableDirectoryIdentity {
  try {
    const identity = readStableDirectoryIdentity(path);
    if ((identity.mode & 0o777n) !== 0o700n) return recoveryRequired();
    return identity;
  } catch {
    return recoveryRequired();
  }
}

function exactNamespaceEntries(path: string): void {
  const names: string[] = [];
  const directory = opendirSync(path);
  try {
    while (true) {
      const entry = directory.readSync();
      if (entry === null) break;
      names.push(entry.name);
      if (names.length > GENERATION_NAMESPACE_ENTRY_NAMES.length) {
        return recoveryRequired();
      }
    }
  } catch {
    return recoveryRequired();
  } finally {
    directory.closeSync();
  }
  const expected = [...GENERATION_NAMESPACE_ENTRY_NAMES].sort();
  names.sort();
  if (
    names.length !== expected.length ||
    names.some((name, index) => name !== expected[index])
  ) {
    recoveryRequired();
  }
}

function inspectPublishedNamespace(
  namespacePath: string,
  intentPath: string,
  binding: GenerationNamespaceInstallBindingV1,
): {
  readonly namespaceBody: GenerationNamespaceBodyV1;
  readonly directoryIdentity: GenerationNamespaceDirectoryIdentityV1;
} {
  const observed = directoryIdentity(namespacePath);
  exactNamespaceEntries(namespacePath);
  for (const name of ["data", "catalog", "birth-staging"] as const) {
    directoryIdentity(join(namespacePath, name));
  }
  const markerPath = join(namespacePath, ".namespace-install-intent.json");
  const intentIdentity = regularIdentity(intentPath);
  const markerIdentity = regularIdentity(markerPath);
  if (
    intentIdentity.dev !== markerIdentity.dev ||
    intentIdentity.ino !== markerIdentity.ino ||
    intentIdentity.nlink < 2n ||
    !sameCanonical(parseCanonical(markerPath), binding)
  ) {
    return recoveryRequired();
  }
  const candidateDirectoryIdentity: GenerationNamespaceDirectoryIdentityV1 = {
    dev: observed.dev.toString(),
    ino: observed.ino.toString(),
    mode: 448,
    uid: observed.uid.toString(),
    gid: observed.gid.toString(),
  };
  const namespaceBody = requireGenerationNamespaceBody(
    parseCanonical(join(namespacePath, "namespace.json")),
    binding,
    candidateDirectoryIdentity,
  );
  return { namespaceBody, directoryIdentity: candidateDirectoryIdentity };
}

function inspectGenerationNamespaceCore(
  root: OpenedDataRoot,
  binding: GenerationNamespaceInstallBindingV1,
): GenerationNamespaceInspectionV1 {
  const liveRoot = requireLiveOpenedDataRoot(root);
  const bindingDigest = generationNamespaceInstallBindingDigest(binding);
  const receiptsPath = join(liveRoot.absolutePath, "receipts");
  const namespacePath = join(receiptsPath, "generations");
  const intentPath = join(
    liveRoot.absolutePath,
    dataRootReceiptIntentPath(binding.operationId),
  );
  const resultPath = join(
    liveRoot.absolutePath,
    dataRootReceiptResultPath(binding.operationId),
  );
  const hasIntent = exists(intentPath);
  const hasResult = exists(resultPath);
  const hasNamespace = exists(namespacePath);
  if (!hasIntent) {
    if (hasResult || hasNamespace) return recoveryRequired();
    return deepFreeze({
      state: "absent-no-intent",
      binding,
      bindingDigest,
    }) as GenerationNamespaceInspectionV1;
  }
  const durableBinding = requireGenerationNamespaceInstallBinding(
    parseCanonical(intentPath),
  );
  if (!sameCanonical(durableBinding, binding)) return recoveryRequired();
  if (!hasNamespace) {
    if (hasResult) return recoveryRequired();
    return deepFreeze({
      state: "install-intent-pending",
      binding,
      bindingDigest,
    }) as GenerationNamespaceInspectionV1;
  }
  const published = inspectPublishedNamespace(namespacePath, intentPath, binding);
  if (!hasResult) {
    return deepFreeze({
      state: "directory-published-result-pending",
      binding,
      bindingDigest,
      ...published,
    }) as GenerationNamespaceInspectionV1;
  }
  const result = requireGenerationNamespaceInstallResult(
    parseCanonical(resultPath),
    binding,
  );
  if (result.variant !== "success") return recoveryRequired();
  return deepFreeze({
    state: "terminal-installed",
    binding,
    bindingDigest,
    ...published,
  }) as GenerationNamespaceInspectionV1;
}

export function inspectGenerationNamespace(
  root: OpenedDataRoot,
  lease: DataRootWriterLease,
): GenerationNamespaceInspectionV1 {
  try {
    return inspectGenerationNamespaceCore(root, createGenerationNamespaceInstallBinding(root, lease));
  } catch (error) {
    if (error instanceof GenerationNamespaceError) throw error;
    return recoveryRequired();
  }
}

/**
 * Package-internal reader variant.  Namespace identity is derived from the
 * currently held Data Root fd, never from a writer capability or prior-process
 * state; it performs no lease acquisition and no filesystem mutation.
 */
export function inspectGenerationNamespaceReadOnly(
  root: OpenedDataRoot,
): GenerationNamespaceInspectionV1 {
  try {
    const liveRoot = requireLiveOpenedDataRoot(root);
    return inspectGenerationNamespaceCore(
      root,
      createGenerationNamespaceInstallBindingFromLeaseDigest(
        dataRootLeaseDigest(liveRoot.identity),
      ),
    );
  } catch (error) {
    if (error instanceof GenerationNamespaceError) throw error;
    return recoveryRequired();
  }
}
