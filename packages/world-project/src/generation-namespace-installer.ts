import { randomBytes } from "node:crypto";
import {
  constants as FS,
  linkSync,
  lstatSync,
  mkdirSync,
  openSync,
  closeSync,
  fstatSync,
  opendirSync,
  readlinkSync,
  rmdirSync,
  symlinkSync,
  unlinkSync,
} from "node:fs";
import { join } from "node:path";

import { canonicalJsonBytes } from "@demiurges/world";

import {
  dataRootReceiptIntentPath,
  dataRootReceiptResultPath,
  dataRootStagingPath,
  requireLiveOpenedDataRoot,
  type OpenedDataRoot,
} from "./data-root";
import {
  requireLiveDataRootWriterLease,
  type DataRootWriterLease,
} from "./data-root-lease";
import {
  consumeFirstGenerationCapacity,
  type FirstGenerationCapacityCapability,
} from "./first-generation-capacity";
import {
  createGenerationNamespaceBody,
  createGenerationNamespaceInstallBinding,
  generationNamespaceInstallBindingDigest,
  generationNamespaceSeedDigest,
  requireGenerationNamespaceBody,
  requireGenerationNamespaceInstallResult,
  type GenerationNamespaceInstallBindingV1,
} from "./generation-namespace";
import { inspectGenerationNamespace } from "./generation-namespace-inspection";
import {
  hasRenameDirectoryNoReplaceSymbol,
  renameDirectoryNoReplace,
} from "./rename-directory-no-replace";
import {
  readStableDirectoryIdentity,
  readStableRegularFile,
  sameStableDirectoryIdentity,
  syncDirectory,
  writeNewSyncedFile,
} from "./safe-filesystem";

export type GenerationNamespaceInstallerStage =
  | "intent-directory-synced"
  | "probe-directory-synced"
  | "probe-absent-rename-synced"
  | "probe-existing-directory-checked"
  | "probe-existing-file-checked"
  | "probe-existing-symlink-checked"
  | "candidate-directory-synced"
  | "namespace-directory-synced"
  | "result-directory-synced"
  | "probe-cleanup-entry-directory-synced"
  | "probe-cleanup-directory-synced"
  | "attempt-cleanup-directory-synced";

let stageHook: (stage: GenerationNamespaceInstallerStage) => void = () => undefined;

export class GenerationNamespaceInstallerError extends Error {
  readonly code = "GENERATION_RECOVERY_REQUIRED" as const;

  constructor() {
    super("GENERATION_RECOVERY_REQUIRED");
    this.name = "GenerationNamespaceInstallerError";
  }
}

export interface GenerationNamespaceRecoveryPlan {
  readonly kind: "generation-namespace-recovery";
  readonly state:
    | "install-intent-pending"
    | "directory-published-result-pending"
    | "terminal-installed";
  readonly attemptToken: string;
}

/** Package-internal Phase-A guard for namespace child birth evidence. */
export interface GenerationNamespaceBirthPreflight {
  readonly kind: "generation-namespace-birth-preflight";
  readonly state:
    | "install-intent-pending"
    | "directory-published-result-pending";
  readonly attemptToken: string;
}

interface AttemptSnapshotV1 {
  readonly token: string;
  readonly directoryIdentity: {
    readonly dev: string;
    readonly ino: string;
    readonly mode: string;
    readonly uid: string;
    readonly gid: string;
  };
  readonly entryNames: readonly string[];
  readonly entryIdentities: readonly {
    readonly name: string;
    readonly dev: string;
    readonly ino: string;
    readonly mode: string;
    readonly uid: string;
    readonly gid: string;
  }[];
}

interface RecoveryAuthority {
  readonly installer: GenerationNamespaceInstaller;
  readonly root: OpenedDataRoot;
  readonly lease: DataRootWriterLease;
  readonly inspectionBytes: Uint8Array;
  readonly attemptBytes: Uint8Array;
  birthPreflight?: GenerationNamespaceBirthPreflight;
  consumed: boolean;
}

interface BirthPreflightAuthority {
  readonly installer: GenerationNamespaceInstaller;
  readonly root: OpenedDataRoot;
  readonly lease: DataRootWriterLease;
  readonly recoveryPlan: GenerationNamespaceRecoveryPlan;
  readonly snapshotBytes: Uint8Array;
}

interface ProbeEntryIdentityV1 {
  readonly dev: string;
  readonly ino: string;
  readonly mode: string;
  readonly uid: string;
  readonly gid: string;
}

interface RenameProbeManifestV1 {
  readonly schemaVersion: 1;
  readonly bindingDigest: string;
  readonly absentSourceIdentity: ProbeEntryIdentityV1;
  readonly directorySourceIdentity: ProbeEntryIdentityV1;
  readonly directoryDestinationIdentity: ProbeEntryIdentityV1;
  readonly fileSourceIdentity: ProbeEntryIdentityV1;
  readonly fileDestinationIdentity: ProbeEntryIdentityV1;
  readonly symlinkSourceIdentity: ProbeEntryIdentityV1;
  readonly symlinkDestinationIdentity: ProbeEntryIdentityV1;
}

const PROBE_DIRECTORY_NAME = ".rename-probe";
const PROBE_MARKER_NAME = "operation-intent.json";
const PROBE_MANIFEST_NAME = "probe.json";
const PROBE_FILE_BYTES = new TextEncoder().encode("rename-probe-v1");
const PROBE_SYMLINK_TARGET = "missing-target";
const PROBE_CASE_NAMES = Object.freeze([
  "absent-source",
  "absent-destination",
  "directory-source",
  "directory-destination",
  "file-source",
  "file-destination",
  "symlink-source",
  "symlink-destination",
] as const);
const PROBE_ALLOWED_NAMES = new Set([
  PROBE_MARKER_NAME,
  PROBE_MANIFEST_NAME,
  ...PROBE_CASE_NAMES,
]);

const recoveryAuthorities = new WeakMap<
  GenerationNamespaceRecoveryPlan,
  RecoveryAuthority
>();
const birthPreflightAuthorities = new WeakMap<
  GenerationNamespaceBirthPreflight,
  BirthPreflightAuthority
>();

function recoveryRequired(): never {
  throw new GenerationNamespaceInstallerError();
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

type PlainRecord = Record<string, unknown>;

function plainRecord(value: unknown): PlainRecord {
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Object.prototype
  ) {
    return recoveryRequired();
  }
  return value as PlainRecord;
}

function requireExactKeys(record: PlainRecord, keys: readonly string[]): void {
  const actual = Reflect.ownKeys(record);
  if (
    actual.length !== keys.length ||
    actual.some((key) => typeof key !== "string") ||
    !keys.every((key) => Object.prototype.hasOwnProperty.call(record, key))
  ) {
    recoveryRequired();
  }
}

function requireProbeIdentity(value: unknown): ProbeEntryIdentityV1 {
  const record = plainRecord(value);
  requireExactKeys(record, ["dev", "ino", "mode", "uid", "gid"]);
  for (const key of ["dev", "ino", "mode", "uid", "gid"] as const) {
    if (typeof record[key] !== "string" || !/^(?:0|[1-9][0-9]*)$/.test(record[key])) {
      recoveryRequired();
    }
  }
  return Object.freeze({
    dev: record.dev as string,
    ino: record.ino as string,
    mode: record.mode as string,
    uid: record.uid as string,
    gid: record.gid as string,
  });
}

function requireProbeManifest(
  value: unknown,
  binding: GenerationNamespaceInstallBindingV1,
): RenameProbeManifestV1 {
  const record = plainRecord(value);
  const identityKeys = [
    "absentSourceIdentity",
    "directorySourceIdentity",
    "directoryDestinationIdentity",
    "fileSourceIdentity",
    "fileDestinationIdentity",
    "symlinkSourceIdentity",
    "symlinkDestinationIdentity",
  ] as const;
  requireExactKeys(record, ["schemaVersion", "bindingDigest", ...identityKeys]);
  if (
    record.schemaVersion !== 1 ||
    record.bindingDigest !== generationNamespaceInstallBindingDigest(binding)
  ) {
    recoveryRequired();
  }
  return Object.freeze({
    schemaVersion: 1,
    bindingDigest: record.bindingDigest,
    absentSourceIdentity: requireProbeIdentity(record.absentSourceIdentity),
    directorySourceIdentity: requireProbeIdentity(record.directorySourceIdentity),
    directoryDestinationIdentity: requireProbeIdentity(
      record.directoryDestinationIdentity,
    ),
    fileSourceIdentity: requireProbeIdentity(record.fileSourceIdentity),
    fileDestinationIdentity: requireProbeIdentity(record.fileDestinationIdentity),
    symlinkSourceIdentity: requireProbeIdentity(record.symlinkSourceIdentity),
    symlinkDestinationIdentity: requireProbeIdentity(
      record.symlinkDestinationIdentity,
    ),
  });
}

function probeEntryIdentity(path: string): ProbeEntryIdentityV1 {
  const stat = lstatSync(path, { bigint: true });
  return Object.freeze({
    dev: stat.dev.toString(),
    ino: stat.ino.toString(),
    mode: stat.mode.toString(),
    uid: stat.uid.toString(),
    gid: stat.gid.toString(),
  });
}

function requireProbeEntryIdentity(
  path: string,
  expected: ProbeEntryIdentityV1,
  kind: "directory" | "file" | "symlink",
): void {
  const stat = lstatSync(path, { bigint: true });
  const expectedType = kind === "directory"
    ? 0o40000n
    : kind === "file"
      ? 0o100000n
      : 0o120000n;
  if (
    (stat.mode & 0o170000n) !== expectedType ||
    (kind === "directory" && (stat.mode & 0o777n) !== 0o700n) ||
    (kind === "file" && (stat.mode & 0o777n) !== 0o600n) ||
    stat.dev.toString() !== expected.dev ||
    stat.ino.toString() !== expected.ino ||
    stat.mode.toString() !== expected.mode ||
    stat.uid.toString() !== expected.uid ||
    stat.gid.toString() !== expected.gid
  ) {
    recoveryRequired();
  }
}

function requireSameRegularInode(leftPath: string, rightPath: string): void {
  const left = lstatSync(leftPath, { bigint: true });
  const right = lstatSync(rightPath, { bigint: true });
  if (
    (left.mode & 0o170000n) !== 0o100000n ||
    (right.mode & 0o170000n) !== 0o100000n ||
    (left.mode & 0o777n) !== 0o600n ||
    (right.mode & 0o777n) !== 0o600n ||
    left.dev !== right.dev ||
    left.ino !== right.ino ||
    left.nlink < 2n
  ) {
    recoveryRequired();
  }
}

function requireExactEntries(path: string, expected: readonly string[]): void {
  const actual: string[] = [];
  const directory = opendirSync(path);
  try {
    while (true) {
      const entry = directory.readSync();
      if (entry === null) break;
      actual.push(entry.name);
      if (actual.length > expected.length) recoveryRequired();
    }
  } finally {
    directory.closeSync();
  }
  actual.sort();
  const sortedExpected = [...expected].sort();
  if (
    actual.length !== sortedExpected.length ||
    actual.some((name, index) => name !== sortedExpected[index])
  ) {
    recoveryRequired();
  }
}

function requireAttemptDirectory(path: string): void {
  let fd: number | undefined;
  try {
    fd = openSync(path, FS.O_RDONLY | FS.O_DIRECTORY | FS.O_NOFOLLOW);
    const stat = fstatSync(fd, { bigint: true });
    if (
      (stat.mode & 0o170000n) !== 0o40000n ||
      (stat.mode & 0o777n) !== 0o700n
    ) {
      recoveryRequired();
    }
  } finally {
    if (fd !== undefined) closeSync(fd);
  }
}

function captureAttemptSnapshot(
  attempt: { readonly path: string; readonly token: string },
  expectedEntries: readonly string[],
): AttemptSnapshotV1 {
  const before = readStableDirectoryIdentity(attempt.path);
  requireExactEntries(attempt.path, expectedEntries);
  const after = readStableDirectoryIdentity(attempt.path);
  if (!sameStableDirectoryIdentity(before, after)) recoveryRequired();
  const entryNames = [...expectedEntries].sort();
  return Object.freeze({
    token: attempt.token,
    directoryIdentity: Object.freeze({
      dev: before.dev.toString(),
      ino: before.ino.toString(),
      mode: before.mode.toString(),
      uid: before.uid.toString(),
      gid: before.gid.toString(),
    }),
    entryNames: Object.freeze(entryNames),
    entryIdentities: Object.freeze(entryNames.map((name) => {
      const stat = lstatSync(join(attempt.path, name), { bigint: true });
      return Object.freeze({
        name,
        dev: stat.dev.toString(),
        ino: stat.ino.toString(),
        mode: stat.mode.toString(),
        uid: stat.uid.toString(),
        gid: stat.gid.toString(),
      });
    })),
  });
}

function attemptTokenFromName(name: string, operationId: string): string | undefined {
  const prefix = `${operationId}-`;
  if (!name.startsWith(prefix)) return undefined;
  const token = name.slice(prefix.length);
  return /^[a-f0-9]{24}$/.test(token) ? token : recoveryRequired();
}

function findAttempt(
  stagingPath: string,
  binding: GenerationNamespaceInstallBindingV1,
  intentPath: string,
): { readonly path: string; readonly token: string } | undefined {
  let match: { readonly path: string; readonly token: string } | undefined;
  let count = 0;
  const directory = opendirSync(stagingPath);
  try {
    while (true) {
      const entry = directory.readSync();
      if (entry === null) break;
      count += 1;
      if (count > 2048) recoveryRequired();
      const token = attemptTokenFromName(entry.name, binding.operationId);
      if (token === undefined) continue;
      if (match !== undefined) recoveryRequired();
      const path = join(stagingPath, entry.name);
      requireAttemptDirectory(path);
      const stagedIntent = join(path, "operation-intent.json");
      requireSameRegularInode(stagedIntent, intentPath);
      if (!sameCanonical(parseCanonical(stagedIntent), binding)) {
        recoveryRequired();
      }
      match = { path, token };
    }
  } finally {
    directory.closeSync();
  }
  return match;
}

export class GenerationNamespaceInstaller {
  readonly #root: OpenedDataRoot;
  readonly #lease: DataRootWriterLease;
  readonly #rootPath: string;
  readonly #receiptsPath: string;
  readonly #stagingPath: string;
  readonly #namespacePath: string;

  constructor(root: OpenedDataRoot, lease: DataRootWriterLease) {
    const liveRoot = requireLiveOpenedDataRoot(root);
    const liveLease = requireLiveDataRootWriterLease(lease);
    if (liveLease.root !== root) recoveryRequired();
    this.#root = root;
    this.#lease = lease;
    this.#rootPath = liveRoot.absolutePath;
    this.#receiptsPath = join(this.#rootPath, "receipts");
    this.#stagingPath = join(this.#rootPath, "staging");
    this.#namespacePath = join(this.#receiptsPath, "generations");
  }

  #assertLive(): void {
    if (
      requireLiveDataRootWriterLease(this.#lease).root !== this.#root ||
      requireLiveOpenedDataRoot(this.#root).absolutePath !== this.#rootPath
    ) {
      recoveryRequired();
    }
  }

  #createAttempt(
    binding: GenerationNamespaceInstallBindingV1,
    intentPath: string,
  ): { readonly path: string; readonly token: string } {
    const token = randomBytes(12).toString("hex");
    const path = join(this.#rootPath, dataRootStagingPath(binding.operationId, token));
    mkdirSync(path, { mode: 0o700, recursive: false });
    syncDirectory(this.#stagingPath);
    const stagedIntent = join(path, "operation-intent.json");
    writeNewSyncedFile(stagedIntent, canonicalJsonBytes(binding));
    syncDirectory(path);
    linkSync(stagedIntent, intentPath);
    syncDirectory(this.#receiptsPath);
    requireSameRegularInode(stagedIntent, intentPath);
    stageHook("intent-directory-synced");
    return { path, token };
  }

  #probeNames(probePath: string): readonly string[] {
    const names: string[] = [];
    const directory = opendirSync(probePath);
    try {
      while (true) {
        const entry = directory.readSync();
        if (entry === null) break;
        if (!PROBE_ALLOWED_NAMES.has(entry.name)) recoveryRequired();
        names.push(entry.name);
        if (names.length > PROBE_ALLOWED_NAMES.size) recoveryRequired();
      }
    } finally {
      directory.closeSync();
    }
    return Object.freeze(names.sort());
  }

  #createRenameProbe(
    binding: GenerationNamespaceInstallBindingV1,
    attemptPath: string,
    intentPath: string,
  ): void {
    const probePath = join(attemptPath, PROBE_DIRECTORY_NAME);
    mkdirSync(probePath, { mode: 0o700, recursive: false });
    syncDirectory(attemptPath);
    linkSync(intentPath, join(probePath, PROBE_MARKER_NAME));
    for (const name of [
      "absent-source",
      "directory-source",
      "directory-destination",
      "file-source",
      "symlink-source",
    ] as const) {
      const path = join(probePath, name);
      mkdirSync(path, { mode: 0o700, recursive: false });
      syncDirectory(path);
    }
    writeNewSyncedFile(join(probePath, "file-destination"), PROBE_FILE_BYTES);
    symlinkSync(PROBE_SYMLINK_TARGET, join(probePath, "symlink-destination"));
    const manifest: RenameProbeManifestV1 = Object.freeze({
      schemaVersion: 1,
      bindingDigest: generationNamespaceInstallBindingDigest(binding),
      absentSourceIdentity: probeEntryIdentity(join(probePath, "absent-source")),
      directorySourceIdentity: probeEntryIdentity(
        join(probePath, "directory-source"),
      ),
      directoryDestinationIdentity: probeEntryIdentity(
        join(probePath, "directory-destination"),
      ),
      fileSourceIdentity: probeEntryIdentity(join(probePath, "file-source")),
      fileDestinationIdentity: probeEntryIdentity(
        join(probePath, "file-destination"),
      ),
      symlinkSourceIdentity: probeEntryIdentity(
        join(probePath, "symlink-source"),
      ),
      symlinkDestinationIdentity: probeEntryIdentity(
        join(probePath, "symlink-destination"),
      ),
    });
    writeNewSyncedFile(
      join(probePath, PROBE_MANIFEST_NAME),
      canonicalJsonBytes(manifest),
    );
    syncDirectory(probePath);
    this.#requireRenameProbe(binding, attemptPath, intentPath, false);
    stageHook("probe-directory-synced");
  }

  #probeEntrySpecification(
    manifest: RenameProbeManifestV1,
    name: typeof PROBE_CASE_NAMES[number],
  ): {
    readonly identity: ProbeEntryIdentityV1;
    readonly kind: "directory" | "file" | "symlink";
  } {
    switch (name) {
      case "absent-source":
      case "absent-destination":
        return { identity: manifest.absentSourceIdentity, kind: "directory" };
      case "directory-source":
        return { identity: manifest.directorySourceIdentity, kind: "directory" };
      case "directory-destination":
        return { identity: manifest.directoryDestinationIdentity, kind: "directory" };
      case "file-source":
        return { identity: manifest.fileSourceIdentity, kind: "directory" };
      case "file-destination":
        return { identity: manifest.fileDestinationIdentity, kind: "file" };
      case "symlink-source":
        return { identity: manifest.symlinkSourceIdentity, kind: "directory" };
      case "symlink-destination":
        return { identity: manifest.symlinkDestinationIdentity, kind: "symlink" };
    }
  }

  #requireRenameProbe(
    binding: GenerationNamespaceInstallBindingV1,
    attemptPath: string,
    intentPath: string,
    allowCleanupResidue: boolean,
  ):
    | { readonly state: "ready" | "completed"; readonly manifest: RenameProbeManifestV1 }
    | { readonly state: "cleanup-residue" } {
    const probePath = join(attemptPath, PROBE_DIRECTORY_NAME);
    requireAttemptDirectory(probePath);
    const before = readStableDirectoryIdentity(probePath);
    const names = this.#probeNames(probePath);
    const manifestPath = join(probePath, PROBE_MANIFEST_NAME);
    if (!names.includes(PROBE_MANIFEST_NAME)) {
      if (allowCleanupResidue && names.length === 0) {
        const after = readStableDirectoryIdentity(probePath);
        if (!sameStableDirectoryIdentity(before, after)) recoveryRequired();
        return { state: "cleanup-residue" };
      }
      recoveryRequired();
    }
    const manifest = requireProbeManifest(parseCanonical(manifestPath), binding);
    const markerPath = join(probePath, PROBE_MARKER_NAME);
    if (names.includes(PROBE_MARKER_NAME)) {
      requireSameRegularInode(markerPath, intentPath);
      if (!sameCanonical(parseCanonical(markerPath), binding)) recoveryRequired();
    } else if (!allowCleanupResidue) {
      recoveryRequired();
    }

    const sourcePresent = names.includes("absent-source");
    const destinationPresent = names.includes("absent-destination");
    if (
      (sourcePresent && destinationPresent) ||
      (!allowCleanupResidue && sourcePresent === destinationPresent) ||
      (allowCleanupResidue && sourcePresent)
    ) {
      recoveryRequired();
    }
    for (const name of PROBE_CASE_NAMES) {
      if (!names.includes(name)) {
        if (
          !allowCleanupResidue &&
          name !== (sourcePresent ? "absent-destination" : "absent-source")
        ) {
          recoveryRequired();
        }
        continue;
      }
      const specification = this.#probeEntrySpecification(manifest, name);
      const path = join(probePath, name);
      requireProbeEntryIdentity(path, specification.identity, specification.kind);
      if (
        name === "file-destination" &&
        !Buffer.from(readStableRegularFile(path, PROBE_FILE_BYTES.byteLength)).equals(
          Buffer.from(PROBE_FILE_BYTES),
        )
      ) {
        recoveryRequired();
      }
      if (
        name === "symlink-destination" &&
        readlinkSync(path) !== PROBE_SYMLINK_TARGET
      ) {
        recoveryRequired();
      }
    }
    const after = readStableDirectoryIdentity(probePath);
    if (!sameStableDirectoryIdentity(before, after)) recoveryRequired();
    return {
      state: destinationPresent || (allowCleanupResidue && !sourcePresent)
        ? "completed"
        : "ready",
      manifest,
    };
  }

  #runRenameProbe(
    binding: GenerationNamespaceInstallBindingV1,
    attemptPath: string,
    intentPath: string,
  ): void {
    const probePath = join(attemptPath, PROBE_DIRECTORY_NAME);
    if (!exists(probePath)) {
      this.#createRenameProbe(binding, attemptPath, intentPath);
    }
    let inspected = this.#requireRenameProbe(
      binding,
      attemptPath,
      intentPath,
      false,
    );
    if (inspected.state === "cleanup-residue") recoveryRequired();
    if (inspected.state === "ready") {
      renameDirectoryNoReplace(
        join(probePath, "absent-source"),
        join(probePath, "absent-destination"),
      );
      syncDirectory(probePath);
      inspected = this.#requireRenameProbe(
        binding,
        attemptPath,
        intentPath,
        false,
      );
      if (inspected.state !== "completed") recoveryRequired();
      stageHook("probe-absent-rename-synced");
    }
    for (const [sourceName, destinationName, stage] of [
      [
        "directory-source",
        "directory-destination",
        "probe-existing-directory-checked",
      ],
      ["file-source", "file-destination", "probe-existing-file-checked"],
      [
        "symlink-source",
        "symlink-destination",
        "probe-existing-symlink-checked",
      ],
    ] as const) {
      let rejected = false;
      try {
        renameDirectoryNoReplace(
          join(probePath, sourceName),
          join(probePath, destinationName),
        );
      } catch {
        rejected = true;
      }
      if (!rejected) recoveryRequired();
      const current = this.#requireRenameProbe(
        binding,
        attemptPath,
        intentPath,
        false,
      );
      if (current.state !== "completed") recoveryRequired();
      stageHook(stage);
    }
  }

  #requireCandidate(
    binding: GenerationNamespaceInstallBindingV1,
    attemptPath: string,
    intentPath: string,
  ): string {
    const candidatePath = join(attemptPath, "generation-namespace");
    requireAttemptDirectory(candidatePath);
    requireExactEntries(candidatePath, [
      "namespace.json",
      ".namespace-install-intent.json",
      "data",
      "catalog",
      "birth-staging",
    ]);
    for (const name of ["data", "catalog", "birth-staging"] as const) {
      requireAttemptDirectory(join(candidatePath, name));
    }
    const markerPath = join(candidatePath, ".namespace-install-intent.json");
    requireSameRegularInode(markerPath, intentPath);
    if (!sameCanonical(parseCanonical(markerPath), binding)) recoveryRequired();
    const identity = readStableDirectoryIdentity(candidatePath);
    requireGenerationNamespaceBody(
      parseCanonical(join(candidatePath, "namespace.json")),
      binding,
      {
        dev: identity.dev.toString(),
        ino: identity.ino.toString(),
        mode: 448,
        uid: identity.uid.toString(),
        gid: identity.gid.toString(),
      },
    );
    return candidatePath;
  }

  #captureEmptyBirthChildDirectories(
    namespacePath: string,
  ): Readonly<Record<string, unknown>> {
    const entries = ["data", "catalog", "birth-staging"] as const;
    const snapshot = entries.map((name) => {
      const path = join(namespacePath, name);
      requireAttemptDirectory(path);
      const before = readStableDirectoryIdentity(path);
      requireExactEntries(path, []);
      const after = readStableDirectoryIdentity(path);
      if (!sameStableDirectoryIdentity(before, after)) recoveryRequired();
      return Object.freeze({
        name,
        dev: before.dev.toString(),
        ino: before.ino.toString(),
        mode: before.mode.toString(),
        uid: before.uid.toString(),
        gid: before.gid.toString(),
        entries: Object.freeze([]),
      });
    });
    return Object.freeze({ entries: Object.freeze(snapshot) });
  }

  #createCandidate(
    binding: GenerationNamespaceInstallBindingV1,
    attemptPath: string,
    intentPath: string,
  ): string {
    const candidatePath = join(attemptPath, "generation-namespace");
    mkdirSync(candidatePath, { mode: 0o700, recursive: false });
    const identity = readStableDirectoryIdentity(candidatePath);
    linkSync(intentPath, join(candidatePath, ".namespace-install-intent.json"));
    syncDirectory(candidatePath);
    writeNewSyncedFile(
      join(candidatePath, "namespace.json"),
      canonicalJsonBytes(createGenerationNamespaceBody(binding, identity)),
    );
    for (const name of ["data", "catalog", "birth-staging"] as const) {
      const path = join(candidatePath, name);
      mkdirSync(path, { mode: 0o700, recursive: false });
      syncDirectory(path);
    }
    syncDirectory(candidatePath);
    stageHook("candidate-directory-synced");
    return this.#requireCandidate(binding, attemptPath, intentPath);
  }

  #publishCandidate(
    binding: GenerationNamespaceInstallBindingV1,
    attemptPath: string,
    intentPath: string,
  ): void {
    const candidatePath = exists(join(attemptPath, "generation-namespace"))
      ? this.#requireCandidate(binding, attemptPath, intentPath)
      : this.#createCandidate(binding, attemptPath, intentPath);
    renameDirectoryNoReplace(candidatePath, this.#namespacePath);
    syncDirectory(this.#receiptsPath);
    stageHook("namespace-directory-synced");
    const inspection = inspectGenerationNamespace(this.#root, this.#lease);
    if (inspection.state !== "directory-published-result-pending") {
      recoveryRequired();
    }
  }

  #publishResult(
    binding: GenerationNamespaceInstallBindingV1,
    attemptPath: string,
  ): void {
    const result = this.#expectedResult(binding);
    const stagedResult = join(attemptPath, "operation-result.json");
    const resultPath = join(
      this.#rootPath,
      dataRootReceiptResultPath(binding.operationId),
    );
    if (!exists(stagedResult)) {
      writeNewSyncedFile(stagedResult, canonicalJsonBytes(result));
      syncDirectory(attemptPath);
    } else if (!sameCanonical(parseCanonical(stagedResult), result)) {
      recoveryRequired();
    }
    if (!exists(resultPath)) {
      linkSync(stagedResult, resultPath);
    }
    requireSameRegularInode(stagedResult, resultPath);
    syncDirectory(this.#receiptsPath);
    stageHook("result-directory-synced");
    if (inspectGenerationNamespace(this.#root, this.#lease).state !== "terminal-installed") {
      recoveryRequired();
    }
  }

  #expectedResult(binding: GenerationNamespaceInstallBindingV1) {
    return requireGenerationNamespaceInstallResult({
      schemaVersion: 1,
      operationId: binding.operationId,
      bindingDigest: generationNamespaceInstallBindingDigest(binding),
      variant: "success",
      publishedIdentity: generationNamespaceSeedDigest(),
    }, binding);
  }

  #inspectExistingAttempt() {
    const binding = createGenerationNamespaceInstallBinding(this.#root, this.#lease);
    const intentPath = join(
      this.#rootPath,
      dataRootReceiptIntentPath(binding.operationId),
    );
    const inspection = inspectGenerationNamespace(this.#root, this.#lease);
    const attempt = findAttempt(this.#stagingPath, binding, intentPath);
    if (inspection.state === "absent-no-intent") {
      if (attempt !== undefined) recoveryRequired();
      return { binding, intentPath, inspection, attempt: undefined };
    }
    if (attempt === undefined) {
      if (inspection.state === "terminal-installed") {
        return { binding, intentPath, inspection, attempt: undefined };
      }
      recoveryRequired();
    }

    const expectedEntries = ["operation-intent.json"];
    const probePath = join(attempt.path, PROBE_DIRECTORY_NAME);
    if (exists(probePath)) {
      const probe = this.#requireRenameProbe(
        binding,
        attempt.path,
        intentPath,
        inspection.state === "terminal-installed",
      );
      if (
        inspection.state !== "install-intent-pending" &&
        probe.state === "ready"
      ) {
        recoveryRequired();
      }
      expectedEntries.push(PROBE_DIRECTORY_NAME);
    } else if (inspection.state === "directory-published-result-pending") {
      recoveryRequired();
    }
    if (inspection.state === "install-intent-pending") {
      if (exists(join(attempt.path, "generation-namespace"))) {
        this.#requireCandidate(binding, attempt.path, intentPath);
        expectedEntries.push("generation-namespace");
      }
    } else {
      const stagedResult = join(attempt.path, "operation-result.json");
      if (exists(stagedResult)) {
        if (!sameCanonical(parseCanonical(stagedResult), this.#expectedResult(binding))) {
          recoveryRequired();
        }
        expectedEntries.push("operation-result.json");
      }
      if (inspection.state === "terminal-installed" && !exists(stagedResult)) {
        recoveryRequired();
      }
    }
    const snapshot = captureAttemptSnapshot(attempt, expectedEntries);
    return { binding, intentPath, inspection, attempt, snapshot };
  }

  #inspectRecoveryPlan(plan: GenerationNamespaceRecoveryPlan) {
    const authority = recoveryAuthorities.get(plan);
    if (
      authority === undefined ||
      authority.installer !== this ||
      authority.root !== this.#root ||
      authority.lease !== this.#lease ||
      authority.consumed
    ) {
      recoveryRequired();
    }
    this.#assertLive();
    const inspected = this.#inspectExistingAttempt();
    if (
      inspected.attempt === undefined ||
      inspected.snapshot === undefined ||
      inspected.attempt.token !== plan.attemptToken ||
      !Buffer.from(canonicalJsonBytes(inspected.inspection)).equals(
        Buffer.from(authority.inspectionBytes),
      ) ||
      !Buffer.from(canonicalJsonBytes(inspected.snapshot)).equals(
        Buffer.from(authority.attemptBytes),
      )
    ) {
      recoveryRequired();
    }
    return { authority, inspected };
  }

  #unlinkAttemptLinkIfPresent(linkPath: string, receiptPath: string, attemptPath: string): void {
    if (!exists(linkPath)) return;
    requireSameRegularInode(linkPath, receiptPath);
    unlinkSync(linkPath);
    syncDirectory(attemptPath);
  }

  #removeProbeCaseEntryIfPresent(
    probePath: string,
    name: typeof PROBE_CASE_NAMES[number],
    manifest: RenameProbeManifestV1,
  ): void {
    const path = join(probePath, name);
    if (!exists(path)) return;
    const specification = this.#probeEntrySpecification(manifest, name);
    requireProbeEntryIdentity(path, specification.identity, specification.kind);
    if (specification.kind === "directory") rmdirSync(path);
    else unlinkSync(path);
    syncDirectory(probePath);
    stageHook("probe-cleanup-entry-directory-synced");
  }

  #cleanupRenameProbe(
    attemptPath: string,
    binding: GenerationNamespaceInstallBindingV1,
    intentPath: string,
  ): void {
    const probePath = join(attemptPath, PROBE_DIRECTORY_NAME);
    if (!exists(probePath)) return;
    const inspected = this.#requireRenameProbe(
      binding,
      attemptPath,
      intentPath,
      true,
    );
    if (inspected.state === "cleanup-residue") {
      rmdirSync(probePath);
      syncDirectory(attemptPath);
      stageHook("probe-cleanup-directory-synced");
      return;
    }
    for (const name of PROBE_CASE_NAMES) {
      this.#removeProbeCaseEntryIfPresent(probePath, name, inspected.manifest);
    }
    const markerPath = join(probePath, PROBE_MARKER_NAME);
    if (exists(markerPath)) {
      requireSameRegularInode(markerPath, intentPath);
      unlinkSync(markerPath);
      syncDirectory(probePath);
      stageHook("probe-cleanup-entry-directory-synced");
    }
    const manifestPath = join(probePath, PROBE_MANIFEST_NAME);
    if (exists(manifestPath)) {
      requireProbeManifest(parseCanonical(manifestPath), binding);
      unlinkSync(manifestPath);
      syncDirectory(probePath);
      stageHook("probe-cleanup-entry-directory-synced");
    }
    requireExactEntries(probePath, []);
    rmdirSync(probePath);
    syncDirectory(attemptPath);
    stageHook("probe-cleanup-directory-synced");
  }

  #cleanupAttempt(
    attemptPath: string,
    binding: GenerationNamespaceInstallBindingV1,
  ): void {
    const intentPath = join(
      this.#rootPath,
      dataRootReceiptIntentPath(binding.operationId),
    );
    const resultPath = join(
      this.#rootPath,
      dataRootReceiptResultPath(binding.operationId),
    );
    this.#cleanupRenameProbe(attemptPath, binding, intentPath);
    this.#unlinkAttemptLinkIfPresent(
      join(attemptPath, "operation-result.json"),
      resultPath,
      attemptPath,
    );
    this.#unlinkAttemptLinkIfPresent(
      join(attemptPath, "operation-intent.json"),
      intentPath,
      attemptPath,
    );
    requireExactEntries(attemptPath, []);
    rmdirSync(attemptPath);
    syncDirectory(this.#stagingPath);
    stageHook("attempt-cleanup-directory-synced");
  }

  #continueExisting(
    inspection: ReturnType<typeof inspectGenerationNamespace>,
    attempt: { readonly path: string; readonly token: string } | undefined,
    binding: GenerationNamespaceInstallBindingV1,
    intentPath: string,
  ): { readonly status: "installed" | "replay" } {
    if (inspection.state === "install-intent-pending") {
      if (attempt === undefined) recoveryRequired();
      this.#runRenameProbe(binding, attempt.path, intentPath);
      this.#publishCandidate(binding, attempt.path, intentPath);
      inspection = inspectGenerationNamespace(this.#root, this.#lease);
    }
    if (inspection.state === "directory-published-result-pending") {
      if (attempt === undefined) recoveryRequired();
      this.#publishResult(binding, attempt.path);
      inspection = inspectGenerationNamespace(this.#root, this.#lease);
    }
    if (inspection.state !== "terminal-installed") recoveryRequired();
    if (attempt !== undefined) this.#cleanupAttempt(attempt.path, binding);
    return { status: attempt === undefined ? "replay" : "installed" };
  }

  inspectRecovery(): GenerationNamespaceRecoveryPlan | undefined {
    this.#assertLive();
    const inspected = this.#inspectExistingAttempt();
    if (inspected.attempt === undefined || inspected.snapshot === undefined) {
      return undefined;
    }
    const plan = Object.freeze({
      kind: "generation-namespace-recovery" as const,
      state: inspected.inspection.state,
      attemptToken: inspected.attempt.token,
    });
    recoveryAuthorities.set(plan, {
      installer: this,
      root: this.#root,
      lease: this.#lease,
      inspectionBytes: canonicalJsonBytes(inspected.inspection),
      attemptBytes: canonicalJsonBytes(inspected.snapshot),
      consumed: false,
    });
    return plan;
  }

  inspectBirthPreflight(
    plan: GenerationNamespaceRecoveryPlan,
  ): GenerationNamespaceBirthPreflight | undefined {
    const { authority, inspected } = this.#inspectRecoveryPlan(plan);
    if (
      inspected.attempt === undefined ||
      (inspected.inspection.state !== "install-intent-pending" &&
        inspected.inspection.state !== "directory-published-result-pending")
    ) {
      recoveryRequired();
    }
    if (
      inspected.inspection.state === "install-intent-pending" &&
      !exists(join(inspected.attempt.path, "generation-namespace"))
    ) {
      return undefined;
    }
    const namespacePath = inspected.inspection.state === "install-intent-pending"
      ? this.#requireCandidate(
          inspected.binding,
          inspected.attempt.path,
          inspected.intentPath,
        )
      : this.#namespacePath;
    const snapshotBytes = canonicalJsonBytes({
      state: inspected.inspection.state,
      children: this.#captureEmptyBirthChildDirectories(namespacePath),
    });
    const preflight = Object.freeze({
      kind: "generation-namespace-birth-preflight" as const,
      state: inspected.inspection.state,
      attemptToken: inspected.attempt.token,
    });
    birthPreflightAuthorities.set(preflight, {
      installer: this,
      root: this.#root,
      lease: this.#lease,
      recoveryPlan: plan,
      snapshotBytes,
    });
    authority.birthPreflight = preflight;
    return preflight;
  }

  revalidateBirthPreflight(
    preflight: GenerationNamespaceBirthPreflight,
  ): void {
    const authority = birthPreflightAuthorities.get(preflight);
    if (
      authority === undefined ||
      authority.installer !== this ||
      authority.root !== this.#root ||
      authority.lease !== this.#lease
    ) {
      recoveryRequired();
    }
    const { inspected } = this.#inspectRecoveryPlan(authority.recoveryPlan);
    if (
      inspected.attempt === undefined ||
      inspected.attempt.token !== preflight.attemptToken ||
      inspected.inspection.state !== preflight.state
    ) {
      recoveryRequired();
    }
    const namespacePath = preflight.state === "install-intent-pending"
      ? this.#requireCandidate(
          inspected.binding,
          inspected.attempt.path,
          inspected.intentPath,
        )
      : this.#namespacePath;
    const current = canonicalJsonBytes({
      state: preflight.state,
      children: this.#captureEmptyBirthChildDirectories(namespacePath),
    });
    if (!Buffer.from(current).equals(Buffer.from(authority.snapshotBytes))) {
      recoveryRequired();
    }
  }

  applyRecovery(plan: GenerationNamespaceRecoveryPlan): {
    readonly status: "recovered";
  } {
    const { authority, inspected } = this.#inspectRecoveryPlan(plan);
    if (authority.birthPreflight !== undefined) {
      this.revalidateBirthPreflight(authority.birthPreflight);
    }
    authority.consumed = true;
    if (!hasRenameDirectoryNoReplaceSymbol()) recoveryRequired();
    if (inspected.attempt === undefined) recoveryRequired();
    this.#continueExisting(
      inspected.inspection,
      inspected.attempt,
      inspected.binding,
      inspected.intentPath,
    );
    return { status: "recovered" };
  }

  install(capability: FirstGenerationCapacityCapability): {
    readonly status: "installed" | "replay";
  } {
    this.#assertLive();
    if (!hasRenameDirectoryNoReplaceSymbol()) recoveryRequired();
    consumeFirstGenerationCapacity(capability, this.#root, this.#lease);
    const binding = createGenerationNamespaceInstallBinding(this.#root, this.#lease);
    const intentPath = join(
      this.#rootPath,
      dataRootReceiptIntentPath(binding.operationId),
    );
    let inspection = inspectGenerationNamespace(this.#root, this.#lease);
    let attempt = findAttempt(this.#stagingPath, binding, intentPath);
    if (inspection.state === "absent-no-intent") {
      if (attempt !== undefined) recoveryRequired();
      attempt = this.#createAttempt(binding, intentPath);
      inspection = inspectGenerationNamespace(this.#root, this.#lease);
    }
    return this.#continueExisting(inspection, attempt, binding, intentPath);
  }
}

export const GENERATION_NAMESPACE_INSTALLER_TEST_SEAMS = Object.freeze({
  replaceStageHook(
    replacement: (stage: GenerationNamespaceInstallerStage) => void,
  ): () => void {
    const previous = stageHook;
    stageHook = replacement;
    return () => {
      if (stageHook === replacement) stageHook = previous;
    };
  },
});
