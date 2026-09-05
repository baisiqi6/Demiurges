import { randomBytes } from "node:crypto";
import {
  closeSync,
  constants as FS,
  fstatSync,
  linkSync,
  lstatSync,
  mkdirSync,
  openSync,
  opendirSync,
  unlinkSync,
} from "node:fs";
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
import {
  requireGenerationIntent,
  type GenerationIntentV1,
} from "./generation-contracts";
import { inspectGenerationNamespace } from "./generation-namespace-inspection";
import {
  createGenerationBirthHead,
  createGenerationBirthPointer,
  generationCatalogFilename,
  generationIdDigest,
  requireGenerationBirthAttemptToken,
  requireGenerationBirthHead,
  requireGenerationBirthPointer,
  GENERATION_MAX_BIRTH_STAGING_ENTRIES,
  GENERATION_MAX_CATALOG_ENTRIES,
  type GenerationBirthPointerV1,
} from "./generation-birth";
import {
  createInitialGenerationStateRecord,
  generationStateRecordFilename,
  requireGenerationStateRecord,
  type GenerationStateRecordV1,
} from "./generation-state";
import {
  GenerationRecordJournal,
  inspectGenerationRecordJournalPhysicalSnapshot,
} from "./generation-record-journal";
import {
  readStableDirectoryIdentity,
  readStableRegularFile,
  sameStableDirectoryIdentity,
  syncDirectory,
  writeNewSyncedFile,
  type StableDirectoryIdentity,
} from "./safe-filesystem";

export type GenerationBirthJournalStage =
  | "generation-data-directory-synced"
  | "birth-staging-directory-synced"
  | "catalog-directory-synced"
  | "birth-staging-cleanup-directory-synced";

export type GenerationBirthInspection =
  | { readonly status: "absent" }
  | {
      readonly status: "birth-pending" | "born";
      readonly current: GenerationStateRecordV1;
      readonly pointer: GenerationBirthPointerV1 | null;
    };

/** Package-internal, single-use authority minted only by startup preflight. */
export interface GenerationBirthStartupRecoveryPlan {
  readonly kind: "generation-birth-startup-recovery";
}

let stageHook: (stage: GenerationBirthJournalStage) => void = () => undefined;

export class GenerationBirthJournalError extends Error {
  readonly code = "GENERATION_RECOVERY_REQUIRED" as const;

  constructor() {
    super("GENERATION_RECOVERY_REQUIRED");
    this.name = "GenerationBirthJournalError";
  }
}

interface RegularIdentity {
  readonly dev: bigint;
  readonly ino: bigint;
  readonly nlink: bigint;
}

interface StartupBirthInspection {
  readonly intent: GenerationIntentV1;
  readonly snapshot: Uint8Array;
}

interface StartupRecoveryAuthority {
  readonly root: OpenedDataRoot;
  readonly lease: DataRootWriterLease;
  readonly intent: GenerationIntentV1;
  readonly snapshot: Uint8Array;
  consumed: boolean;
}

const startupRecoveryAuthorities = new WeakMap<
  GenerationBirthStartupRecoveryPlan,
  StartupRecoveryAuthority
>();

function recoveryRequired(): never {
  throw new GenerationBirthJournalError();
}

function syscallCode(error: unknown): string | undefined {
  if (typeof error === "object" && error !== null && "code" in error) {
    return typeof error.code === "string" ? error.code : undefined;
  }
  return undefined;
}

function pathExists(path: string): boolean {
  try {
    lstatSync(path);
    return true;
  } catch (error) {
    if (syscallCode(error) === "ENOENT") return false;
    return recoveryRequired();
  }
}

function parseCanonicalJson(path: string, maxBytes = 64 * 1024): unknown {
  const bytes = readStableRegularFile(path, maxBytes);
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

function requireDirectory(path: string): StableDirectoryIdentity {
  try {
    const identity = readStableDirectoryIdentity(path);
    if ((identity.mode & 0o777n) !== 0o700n) return recoveryRequired();
    return identity;
  } catch {
    return recoveryRequired();
  }
}

function requireRegularIdentity(path: string): RegularIdentity {
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
  } finally {
    if (fd !== undefined) closeSync(fd);
  }
}

function sameRegularIdentity(left: RegularIdentity, right: RegularIdentity): boolean {
  return left.dev === right.dev && left.ino === right.ino;
}

function requireExactEntries(path: string, expected: readonly string[]): void {
  const actual = scanBoundedDirectory(
    path,
    expected.length,
    (name) => expected.includes(name),
  );
  const sortedExpected = [...expected].sort();
  if (
    actual.length !== sortedExpected.length ||
    actual.some((name, index) => name !== sortedExpected[index])
  ) {
    recoveryRequired();
  }
}

function scanBoundedDirectory(
  path: string,
  maxEntries: number,
  validateName: (name: string) => boolean,
): readonly string[] {
  const names: string[] = [];
  const directory = opendirSync(path);
  try {
    while (true) {
      const entry = directory.readSync();
      if (entry === null) break;
      names.push(entry.name);
      if (names.length > maxEntries || !validateName(entry.name)) {
        return recoveryRequired();
      }
    }
  } finally {
    directory.closeSync();
  }
  return Object.freeze(names.sort());
}

function sameCanonical(left: unknown, right: unknown): boolean {
  return Buffer.from(canonicalJsonBytes(left)).equals(
    Buffer.from(canonicalJsonBytes(right)),
  );
}

function directorySnapshot(path: string, names: readonly string[]): Record<string, unknown> {
  const identity = requireDirectory(path);
  return {
    path,
    names,
    dev: identity.dev.toString(),
    ino: identity.ino.toString(),
    mode: identity.mode.toString(),
    uid: identity.uid.toString(),
    gid: identity.gid.toString(),
  };
}

function regularSnapshot(path: string, name: string): Record<string, string> {
  const identity = requireRegularIdentity(path);
  const bytes = readStableRegularFile(path, 64 * 1024);
  return {
    name,
    dev: identity.dev.toString(),
    ino: identity.ino.toString(),
    nlink: identity.nlink.toString(),
    bytesDigest: sha256Hex(bytes),
  };
}

function captureGenerationPhysicalSnapshot(
  root: OpenedDataRoot,
  lease: DataRootWriterLease,
  dataPath: string,
  dataName: string,
  intent: GenerationIntentV1,
): Readonly<Record<string, unknown>> {
  const generationPath = join(dataPath, dataName);
  const before = requireDirectory(generationPath);
  requireExactEntries(generationPath, [
    "intent.json",
    "records",
    "head.json",
    "downloads",
  ]);
  const downloadsPath = join(generationPath, "downloads");
  const downloadsBefore = requireDirectory(downloadsPath);
  requireExactEntries(downloadsPath, []);
  const downloadsAfter = requireDirectory(downloadsPath);
  if (!sameStableDirectoryIdentity(downloadsBefore, downloadsAfter)) {
    recoveryRequired();
  }
  const records = inspectGenerationRecordJournalPhysicalSnapshot(
    root,
    lease,
    intent,
  );
  const after = requireDirectory(generationPath);
  if (!sameStableDirectoryIdentity(before, after)) recoveryRequired();
  return Object.freeze({
    dev: before.dev.toString(),
    ino: before.ino.toString(),
    mode: before.mode.toString(),
    uid: before.uid.toString(),
    gid: before.gid.toString(),
    entryNames: Object.freeze([
      "downloads",
      "head.json",
      "intent.json",
      "records",
    ]),
    intent: regularSnapshot(join(generationPath, "intent.json"), "intent.json"),
    head: records.head,
    records,
    downloads: {
      ...directorySnapshot(downloadsPath, []),
      entries: Object.freeze([]),
    },
  });
}

export class GenerationBirthJournal {
  readonly #root: OpenedDataRoot;
  readonly #lease: DataRootWriterLease;
  readonly #rootPath: string;
  readonly #namespacePath: string;
  readonly #dataPath: string;
  readonly #catalogPath: string;
  readonly #birthStagingPath: string;

  constructor(root: OpenedDataRoot, lease: DataRootWriterLease) {
    const liveRoot = requireLiveOpenedDataRoot(root);
    const liveLease = requireLiveDataRootWriterLease(lease);
    if (liveLease.root !== root) recoveryRequired();
    this.#root = root;
    this.#lease = lease;
    this.#rootPath = liveRoot.absolutePath;
    this.#namespacePath = join(this.#rootPath, "receipts", "generations");
    this.#dataPath = join(this.#namespacePath, "data");
    this.#catalogPath = join(this.#namespacePath, "catalog");
    this.#birthStagingPath = join(this.#namespacePath, "birth-staging");
    this.#inspectNamespace();
  }

  #assertLive(): void {
    const liveRoot = requireLiveOpenedDataRoot(this.#root);
    const liveLease = requireLiveDataRootWriterLease(this.#lease);
    if (
      liveLease.root !== this.#root ||
      liveRoot.absolutePath !== this.#rootPath
    ) {
      recoveryRequired();
    }
  }

  #inspectNamespace(): void {
    this.#assertLive();
    if (
      inspectGenerationNamespace(this.#root, this.#lease).state !==
        "terminal-installed"
    ) {
      recoveryRequired();
    }
    scanBoundedDirectory(
      this.#catalogPath,
      GENERATION_MAX_CATALOG_ENTRIES,
      (name) => /^[a-f0-9]{64}\.json$/.test(name),
    );
    scanBoundedDirectory(
      this.#birthStagingPath,
      GENERATION_MAX_BIRTH_STAGING_ENTRIES,
      (name) => /^[a-f0-9]{32}\.json$/.test(name),
    );
  }

  #generationPath(intent: GenerationIntentV1): string {
    return join(this.#dataPath, generationIdDigest(intent.generationId));
  }

  #catalogPointerPath(intent: GenerationIntentV1): string {
    return join(this.#catalogPath, generationCatalogFilename(intent.generationId));
  }

  #inspectGenerationData(
    intent: GenerationIntentV1,
  ): GenerationStateRecordV1 {
    const generationPath = this.#generationPath(intent);
    requireDirectory(generationPath);
    requireExactEntries(generationPath, [
      "intent.json",
      "records",
      "head.json",
      "downloads",
    ]);
    requireDirectory(join(generationPath, "records"));
    requireDirectory(join(generationPath, "downloads"));
    if (
      scanBoundedDirectory(join(generationPath, "downloads"), 0, () => false)
        .length !== 0
    ) {
      recoveryRequired();
    }
    const durableIntent = requireGenerationIntent(
      parseCanonicalJson(join(generationPath, "intent.json")),
    );
    if (!sameCanonical(durableIntent, intent)) recoveryRequired();
    const journal = new GenerationRecordJournal(this.#root, this.#lease, intent);
    const current = journal.readCurrent();
    if (current.sequence !== 0 || current.state !== "admitted") recoveryRequired();
    requireGenerationBirthHead(
      parseCanonicalJson(join(generationPath, "head.json")),
      intent,
      current,
    );
    return current;
  }

  #createGenerationData(intent: GenerationIntentV1): GenerationStateRecordV1 {
    const generationPath = this.#generationPath(intent);
    mkdirSync(generationPath, { mode: 0o700, recursive: false });
    writeNewSyncedFile(
      join(generationPath, "intent.json"),
      canonicalJsonBytes(intent),
    );
    const recordsPath = join(generationPath, "records");
    mkdirSync(recordsPath, { mode: 0o700, recursive: false });
    const admitted = createInitialGenerationStateRecord(intent);
    writeNewSyncedFile(
      join(recordsPath, generationStateRecordFilename(admitted)),
      canonicalJsonBytes(admitted),
    );
    syncDirectory(recordsPath);
    writeNewSyncedFile(
      join(generationPath, "head.json"),
      canonicalJsonBytes(createGenerationBirthHead(intent, admitted)),
    );
    mkdirSync(join(generationPath, "downloads"), { mode: 0o700, recursive: false });
    syncDirectory(join(generationPath, "downloads"));
    syncDirectory(generationPath);
    syncDirectory(this.#dataPath);
    stageHook("generation-data-directory-synced");
    return this.#inspectGenerationData(intent);
  }

  #matchingStagingCandidates(
    intent: GenerationIntentV1,
    admitted: GenerationStateRecordV1,
  ): readonly { readonly path: string; readonly pointer: GenerationBirthPointerV1 }[] {
    const matches: { path: string; pointer: GenerationBirthPointerV1 }[] = [];
    const names = scanBoundedDirectory(
      this.#birthStagingPath,
      GENERATION_MAX_BIRTH_STAGING_ENTRIES,
      (name) => /^[a-f0-9]{32}\.json$/.test(name),
    );
    for (const name of names) {
      const path = join(this.#birthStagingPath, name);
      const value = parseCanonicalJson(path);
      const record = value as { generationId?: unknown };
      if (record.generationId !== intent.generationId) recoveryRequired();
      matches.push({
        path,
        pointer: requireGenerationBirthPointer(value, intent, admitted),
      });
    }
    if (matches.length > 1) recoveryRequired();
    return Object.freeze(matches);
  }

  #finishCatalogPublication(
    intent: GenerationIntentV1,
    admitted: GenerationStateRecordV1,
    stagingPath: string,
    pointer: GenerationBirthPointerV1,
  ): void {
    const catalogPath = this.#catalogPointerPath(intent);
    if (!pathExists(catalogPath)) {
      try {
        linkSync(stagingPath, catalogPath);
        syncDirectory(this.#catalogPath);
      } catch (error) {
        if (syscallCode(error) !== "EEXIST") throw error;
      }
    }
    stageHook("catalog-directory-synced");
    const catalogPointer = requireGenerationBirthPointer(
      parseCanonicalJson(catalogPath),
      intent,
      admitted,
    );
    if (!sameCanonical(catalogPointer, pointer)) recoveryRequired();
    const stagingIdentity = requireRegularIdentity(stagingPath);
    const catalogIdentity = requireRegularIdentity(catalogPath);
    if (
      !sameRegularIdentity(stagingIdentity, catalogIdentity) ||
      stagingIdentity.nlink < 2n
    ) {
      recoveryRequired();
    }
    unlinkSync(stagingPath);
    syncDirectory(this.#birthStagingPath);
    stageHook("birth-staging-cleanup-directory-synced");
  }

  inspect(intentInput: GenerationIntentV1): GenerationBirthInspection {
    this.#inspectNamespace();
    const intent = requireGenerationIntent(intentInput);
    const generationPath = this.#generationPath(intent);
    const catalogPath = this.#catalogPointerPath(intent);
    if (!pathExists(generationPath)) {
      if (pathExists(catalogPath)) recoveryRequired();
      return Object.freeze({ status: "absent" });
    }
    const current = this.#inspectGenerationData(intent);
    const candidates = this.#matchingStagingCandidates(intent, current);
    if (!pathExists(catalogPath)) {
      return Object.freeze({ status: "birth-pending", current, pointer: null });
    }
    const pointer = requireGenerationBirthPointer(
      parseCanonicalJson(catalogPath),
      intent,
      current,
    );
    if (candidates.length === 1) {
      const stagingIdentity = requireRegularIdentity(candidates[0]!.path);
      const catalogIdentity = requireRegularIdentity(catalogPath);
      if (
        !sameRegularIdentity(stagingIdentity, catalogIdentity) ||
        stagingIdentity.nlink < 2n
      ) {
        recoveryRequired();
      }
    }
    return Object.freeze({ status: "born", current, pointer });
  }

  /**
   * Package-internal narrow birth pointer proof for the pre-submit boundary：
   * 校验 terminal namespace、bounded catalog/birth-staging 语法、与 sequence-0
   * admitted record 完全一致的 canonical GenerationBirthPointer、staging 存在时
   * 的 staging/catalog hard-link 规则，并返回 catalog pointer 文件身份。
   * 不重验 generation 目录 exact entries/head —— 因此 journal 协议瞬态
   * （如 head.next）下仍可证明 birth pointer。
   */
  inspectBornPointer(
    intentInput: GenerationIntentV1,
    admittedInput: GenerationStateRecordV1,
  ): {
    readonly pointer: GenerationBirthPointerV1;
    readonly pointerFile: {
      readonly name: "pointer";
      readonly dev: string;
      readonly ino: string;
      readonly nlink: string;
      readonly bytesDigest: string;
    };
  } {
    const intent = requireGenerationIntent(intentInput);
    const admitted = requireGenerationStateRecord(admittedInput, intent, null);
    this.#inspectNamespace();
    const catalogPath = this.#catalogPointerPath(intent);
    if (!pathExists(catalogPath)) return recoveryRequired();
    const candidates = this.#matchingStagingCandidates(intent, admitted);
    const pointer = requireGenerationBirthPointer(
      parseCanonicalJson(catalogPath),
      intent,
      admitted,
    );
    if (candidates.length === 1) {
      const stagingIdentity = requireRegularIdentity(candidates[0]!.path);
      const catalogIdentity = requireRegularIdentity(catalogPath);
      if (
        !sameRegularIdentity(stagingIdentity, catalogIdentity) ||
        stagingIdentity.nlink < 2n
      ) {
        return recoveryRequired();
      }
    }
    return Object.freeze({
      pointer,
      pointerFile: regularSnapshot(catalogPath, "pointer") as {
        readonly name: "pointer";
        readonly dev: string;
        readonly ino: string;
        readonly nlink: string;
        readonly bytesDigest: string;
      },
    });
  }

  admit(
    intentInput: GenerationIntentV1,
    beforeFirstMutation?: () => void,
  ): {
    readonly status: "born" | "replay";
    readonly intent: GenerationIntentV1;
    readonly current: GenerationStateRecordV1;
  } {
    this.#inspectNamespace();
    const intent = requireGenerationIntent(intentInput);
    beforeFirstMutation?.();
    const generationPath = this.#generationPath(intent);
    const catalogPath = this.#catalogPointerPath(intent);
    const admitted = pathExists(generationPath)
      ? this.#inspectGenerationData(intent)
      : this.#createGenerationData(intent);
    const expectedPointer = createGenerationBirthPointer(intent, admitted);
    const candidates = this.#matchingStagingCandidates(intent, admitted);
    if (pathExists(catalogPath)) {
      requireGenerationBirthPointer(
        parseCanonicalJson(catalogPath),
        intent,
        admitted,
      );
      if (candidates.length === 1) {
        this.#finishCatalogPublication(
          intent,
          admitted,
          candidates[0]!.path,
          candidates[0]!.pointer,
        );
      }
      return Object.freeze({ status: "replay", intent, current: admitted });
    }
    let stagingPath: string;
    let pointer: GenerationBirthPointerV1;
    if (candidates.length === 1) {
      stagingPath = candidates[0]!.path;
      pointer = candidates[0]!.pointer;
    } else {
      const token = requireGenerationBirthAttemptToken(
        randomBytes(16).toString("hex"),
      );
      stagingPath = join(this.#birthStagingPath, `${token}.json`);
      pointer = expectedPointer;
      writeNewSyncedFile(stagingPath, canonicalJsonBytes(pointer));
      syncDirectory(this.#birthStagingPath);
      stageHook("birth-staging-directory-synced");
    }
    this.#finishCatalogPublication(intent, admitted, stagingPath, pointer);
    this.#assertLive();
    return Object.freeze({ status: "born", intent, current: admitted });
  }
}

function inspectStartupBirthRecovery(
  root: OpenedDataRoot,
  lease: DataRootWriterLease,
): StartupBirthInspection | undefined {
  const liveRoot = requireLiveOpenedDataRoot(root);
  if (requireLiveDataRootWriterLease(lease).root !== root) recoveryRequired();
  const namespace = inspectGenerationNamespace(root, lease);
  if (
    namespace.state === "absent-no-intent" ||
    namespace.state === "install-intent-pending"
  ) {
    return undefined;
  }

  const namespacePath = join(liveRoot.absolutePath, "receipts", "generations");
  const dataPath = join(namespacePath, "data");
  const catalogPath = join(namespacePath, "catalog");
  const birthStagingPath = join(namespacePath, "birth-staging");
  const dataNames = scanBoundedDirectory(
    dataPath,
    GENERATION_MAX_CATALOG_ENTRIES,
    (name) => /^[a-f0-9]{64}$/.test(name),
  );
  const catalogNames = scanBoundedDirectory(
    catalogPath,
    GENERATION_MAX_CATALOG_ENTRIES,
    (name) => /^[a-f0-9]{64}\.json$/.test(name),
  );
  const stagingNames = scanBoundedDirectory(
    birthStagingPath,
    GENERATION_MAX_BIRTH_STAGING_ENTRIES,
    (name) => /^[a-f0-9]{32}\.json$/.test(name),
  );
  if (namespace.state === "directory-published-result-pending") {
    if (
      dataNames.length !== 0 ||
      catalogNames.length !== 0 ||
      stagingNames.length !== 0
    ) {
      recoveryRequired();
    }
    return undefined;
  }

  if (dataNames.length === 0) {
    if (catalogNames.length !== 0 || stagingNames.length !== 0) recoveryRequired();
    return undefined;
  }
  if (
    dataNames.length !== 1 ||
    catalogNames.length > 1 ||
    stagingNames.length > 1
  ) {
    recoveryRequired();
  }
  const dataName = dataNames[0]!;
  const generationPath = join(dataPath, dataName);
  const intent = requireGenerationIntent(
    parseCanonicalJson(join(generationPath, "intent.json")),
  );
  if (generationIdDigest(intent.generationId) !== dataName) recoveryRequired();
  const expectedCatalogName = generationCatalogFilename(intent.generationId);
  if (catalogNames.length === 1 && catalogNames[0] !== expectedCatalogName) {
    recoveryRequired();
  }

  // Birth recovery owns only the still-admitted publication shape.  Once a
  // real Generation has advanced, retain strict validation of its immutable
  // birth anchor and physical journal surface, but do not misclassify its
  // legitimate private downloads as an unfinished birth.  Generated-set
  // startup recovery remains the owner of candidate/publication joins.
  const recordJournal = new GenerationRecordJournal(root, lease, intent);
  const chain = recordJournal.readValidatedChain();
  const current = chain[chain.length - 1];
  const initial = chain[0];
  if (current === undefined || initial === undefined ||
    initial.state !== "admitted" || initial.sequence !== 0) recoveryRequired();
  if (current.state !== "admitted") {
    if (catalogNames.length !== 1 || stagingNames.length !== 0) recoveryRequired();
    requireExactEntries(generationPath, ["intent.json", "records", "head.json", "downloads"]);
    const downloadsBefore = requireDirectory(join(generationPath, "downloads"));
    inspectGenerationRecordJournalPhysicalSnapshot(root, lease, intent);
    requireGenerationBirthPointer(
      parseCanonicalJson(join(catalogPath, expectedCatalogName)),
      intent,
      initial,
    );
    const expectedDownloads = (() => {
      // Terminal records such as `verified` deliberately contain no download
      // budget.  Private candidates are retained in this slice, so recover the
      // last authoritative all-candidate budget from the validated chain rather
      // than treating the terminal payload as cleanup permission.
      const candidateRecord = [...chain].reverse().find(
        (record) => record.state === "validating",
      );
      if (candidateRecord === undefined) return [] as readonly string[];
      const payload = candidateRecord.payload as unknown as {
        readonly downloadBudget?: { readonly orderedMembers?: readonly {
          readonly stage?: string;
          readonly candidate?: { readonly candidateName?: string } | null;
        }[] };
      };
      const members = payload.downloadBudget?.orderedMembers;
      if (!Array.isArray(members)) recoveryRequired();
      return members.map((member) => {
        if (member.stage !== "candidate" ||
          member.candidate === null || member.candidate === undefined ||
          typeof member.candidate.candidateName !== "string") recoveryRequired();
        return member.candidate.candidateName;
      });
    })();
    requireExactEntries(join(generationPath, "downloads"), expectedDownloads);
    for (const name of expectedDownloads) requireRegularIdentity(join(generationPath, "downloads", name));
    const downloadsAfter = requireDirectory(join(generationPath, "downloads"));
    if (!sameStableDirectoryIdentity(downloadsBefore, downloadsAfter)) recoveryRequired();
    return undefined;
  }

  const journal = new GenerationBirthJournal(root, lease);
  const birth = journal.inspect(intent);
  if (birth.status === "absent") recoveryRequired();
  if (birth.status === "birth-pending" && catalogNames.length !== 0) recoveryRequired();
  if (birth.status === "born" && catalogNames.length !== 1) recoveryRequired();

  const snapshot = canonicalJsonBytes({
    namespace: namespace.state,
    intent,
    birth,
    data: directorySnapshot(dataPath, dataNames),
    catalog: {
      ...directorySnapshot(catalogPath, catalogNames),
      entries: catalogNames.map((name) =>
        regularSnapshot(join(catalogPath, name), name)),
    },
    birthStaging: {
      ...directorySnapshot(birthStagingPath, stagingNames),
      entries: stagingNames.map((name) =>
        regularSnapshot(join(birthStagingPath, name), name)),
    },
    generation: captureGenerationPhysicalSnapshot(
      root,
      lease,
      dataPath,
      dataName,
      intent,
    ),
  });
  return { intent, snapshot };
}

/**
 * Startup Phase A only: validates the closed first-generation birth surface
 * without creating a Journal writer or mutating any durable state.
 */
export function inspectGenerationBirthStartupRecovery(
  root: OpenedDataRoot,
  lease: DataRootWriterLease,
): GenerationBirthStartupRecoveryPlan | undefined {
  const inspection = inspectStartupBirthRecovery(root, lease);
  if (inspection === undefined) return undefined;
  const plan = deepFreeze({
    kind: "generation-birth-startup-recovery" as const,
  }) as GenerationBirthStartupRecoveryPlan;
  startupRecoveryAuthorities.set(plan, {
    root,
    lease,
    intent: inspection.intent,
    snapshot: inspection.snapshot,
    consumed: false,
  });
  return plan;
}

/**
 * Startup apply only. The plan is bound to the Phase-A evidence and is
 * revalidated immediately before the first birth mutation.
 */
export function applyGenerationBirthStartupRecovery(
  plan: GenerationBirthStartupRecoveryPlan,
  root: OpenedDataRoot,
  lease: DataRootWriterLease,
): ReturnType<GenerationBirthJournal["admit"]> {
  const authority = startupRecoveryAuthorities.get(plan);
  if (
    authority === undefined ||
    authority.consumed ||
    authority.root !== root ||
    authority.lease !== lease
  ) {
    recoveryRequired();
  }
  const verify = (): void => {
    const inspection = inspectStartupBirthRecovery(root, lease);
    if (
      inspection === undefined ||
      !sameCanonical(inspection.intent, authority.intent) ||
      !Buffer.from(inspection.snapshot).equals(Buffer.from(authority.snapshot))
    ) {
      recoveryRequired();
    }
  };
  verify();
  authority.consumed = true;
  return new GenerationBirthJournal(root, lease).admit(authority.intent, verify);
}

/** Focused fault injection only; not exported by package root. */
export const GENERATION_BIRTH_JOURNAL_TEST_SEAMS = Object.freeze({
  replaceStageHook(replacement: (stage: GenerationBirthJournalStage) => void): () => void {
    const previous = stageHook;
    stageHook = replacement;
    return () => {
      if (stageHook === replacement) stageHook = previous;
    };
  },
});
