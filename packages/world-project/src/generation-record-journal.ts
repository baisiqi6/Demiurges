import {
  constants as FS,
  linkSync,
  lstatSync,
  openSync,
  closeSync,
  fstatSync,
  opendirSync,
  renameSync,
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
import {
  createNextChainedGenerationStateRecord,
  generationStateRecordDigest,
  generationStateRecordFilename,
  requireGenerationStateRecordChain,
  type GenerationStateRecordV1,
  type GenerationStateV1,
} from "./generation-state";
import {
  readStableDirectoryIdentity,
  readStableRegularFile,
  syncDirectory,
  writeNewSyncedFile,
} from "./safe-filesystem";

export const GENERATION_RECORD_WITNESS_MAX_BYTES = 1024;
export const GENERATION_RECORD_MAX_PHYSICAL_ENTRIES = 514;
export const GENERATION_RECORD_MAX_UNIQUE_BYTES = 32 * 1024 * 1024;

export type GenerationRecordJournalErrorCode =
  "GENERATION_RECOVERY_REQUIRED";

export class GenerationRecordJournalError extends Error {
  readonly code: GenerationRecordJournalErrorCode;

  constructor() {
    super("GENERATION_RECOVERY_REQUIRED");
    this.name = "GenerationRecordJournalError";
    this.code = "GENERATION_RECOVERY_REQUIRED";
  }
}

/** Package-internal startup evidence; this is not a writer or raw fd surface. */
export interface GenerationRecordJournalPhysicalSnapshot {
  readonly head: Readonly<Record<string, string>>;
  readonly intent: Readonly<Record<string, string>>;
  readonly recordsDirectory: Readonly<Record<string, unknown>>;
  readonly entries: readonly Readonly<Record<string, string>>[];
}

interface RegularIdentity {
  readonly dev: bigint;
  readonly ino: bigint;
  readonly mode: bigint;
  readonly uid: bigint;
  readonly gid: bigint;
}

interface GenerationRecordWitnessV1 {
  readonly schemaVersion: 1;
  readonly generationId: `generation:sha256:${string}`;
  readonly sequence: number;
  readonly recordDigest: string;
  readonly recordName: ".record.next";
  readonly recordFileIdentity: {
    readonly dev: string;
    readonly ino: string;
    readonly mode: 384;
    readonly uid: string;
    readonly gid: string;
  };
}

interface GenerationHeadV1 {
  readonly generationId: `generation:sha256:${string}`;
  readonly sequence: number;
  readonly recordDigest: string;
}

interface ScannedRecordDirectory {
  readonly names: ReadonlySet<string>;
  readonly finalNames: ReadonlySet<string>;
}

type Stage =
  | "next-file-synced"
  | "witness-directory-synced"
  | "final-link-directory-synced"
  | "head-next-synced"
  | "head-directory-synced"
  | "next-cleanup-directory-synced"
  | "witness-cleanup-directory-synced";

let stageHook: (stage: Stage) => void = () => undefined;

function recoveryRequired(): never {
  throw new GenerationRecordJournalError();
}

function syscallCode(error: unknown): string | undefined {
  if (typeof error === "object" && error !== null && "code" in error) {
    return typeof error.code === "string" ? error.code : undefined;
  }
  return undefined;
}

function parseCanonicalJson(path: string, maxBytes: number): unknown {
  const bytes = readStableRegularFile(path, maxBytes);
  let value: unknown;
  try {
    value = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    return recoveryRequired();
  }
  if (!Buffer.from(canonicalJsonBytes(value)).equals(Buffer.from(bytes))) {
    return recoveryRequired();
  }
  return value;
}

function plainRecord(value: unknown): Record<string, unknown> {
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
  return value as Record<string, unknown>;
}

function exactKeys(record: Record<string, unknown>, keys: readonly string[]): void {
  const actual = Reflect.ownKeys(record);
  if (
    actual.length !== keys.length ||
    actual.some((key) => typeof key !== "string") ||
    !keys.every((key) => Object.prototype.hasOwnProperty.call(record, key))
  ) {
    recoveryRequired();
  }
}

function identity(path: string): RegularIdentity {
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
    return {
      dev: stat.dev,
      ino: stat.ino,
      mode: stat.mode,
      uid: stat.uid,
      gid: stat.gid,
    };
  } finally {
    if (fd !== undefined) closeSync(fd);
  }
}

function sameIdentity(left: RegularIdentity, right: RegularIdentity): boolean {
  return left.dev === right.dev &&
    left.ino === right.ino &&
    left.mode === right.mode &&
    left.uid === right.uid &&
    left.gid === right.gid;
}

function requireDirectorySnapshot(path: string): Record<string, string> {
  const identityValue = readStableDirectoryIdentity(path);
  if ((identityValue.mode & 0o777n) !== 0o700n) recoveryRequired();
  return {
    dev: identityValue.dev.toString(),
    ino: identityValue.ino.toString(),
    mode: identityValue.mode.toString(),
    uid: identityValue.uid.toString(),
    gid: identityValue.gid.toString(),
  };
}

function captureRegularSnapshot(
  path: string,
  maxBytes: number,
): Record<string, string> {
  const before = identity(path);
  const bytes = readStableRegularFile(path, maxBytes);
  const after = identity(path);
  if (!sameIdentity(before, after)) recoveryRequired();
  return {
    dev: before.dev.toString(),
    ino: before.ino.toString(),
    mode: before.mode.toString(),
    uid: before.uid.toString(),
    gid: before.gid.toString(),
    bytesDigest: sha256Hex(bytes),
  };
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

function scanRecordDirectory(path: string): ScannedRecordDirectory {
  const names = new Set<string>();
  const finalNames = new Set<string>();
  const uniqueInodes = new Map<string, bigint>();
  const directory = opendirSync(path);
  try {
    while (true) {
      const entry = directory.readSync();
      if (entry === null) break;
      names.add(entry.name);
      if (names.size > GENERATION_RECORD_MAX_PHYSICAL_ENTRIES) {
        return recoveryRequired();
      }
      if (
        entry.name !== ".record.next" &&
        entry.name !== ".record.next.witness" &&
        !/^[0-9]{16}-[a-f0-9]{64}\.json$/.test(entry.name)
      ) {
        return recoveryRequired();
      }
      const stat = lstatSync(join(path, entry.name), { bigint: true });
      if (
        (stat.mode & 0o170000n) !== 0o100000n ||
        (stat.mode & 0o777n) !== 0o600n ||
        stat.size < 0n
      ) {
        return recoveryRequired();
      }
      const maxBytes = entry.name === ".record.next.witness"
        ? BigInt(GENERATION_RECORD_WITNESS_MAX_BYTES)
        : 64n * 1024n;
      if (stat.size > maxBytes) return recoveryRequired();
      const inodeKey = `${stat.dev.toString()}:${stat.ino.toString()}`;
      const existingSize = uniqueInodes.get(inodeKey);
      if (existingSize !== undefined && existingSize !== stat.size) {
        return recoveryRequired();
      }
      uniqueInodes.set(inodeKey, stat.size);
      let total = 0n;
      for (const size of uniqueInodes.values()) total += size;
      if (total > BigInt(GENERATION_RECORD_MAX_UNIQUE_BYTES)) {
        return recoveryRequired();
      }
      if (/^[0-9]{16}-[a-f0-9]{64}\.json$/.test(entry.name)) {
        finalNames.add(entry.name);
      }
    }
  } finally {
    directory.closeSync();
  }
  return { names, finalNames };
}

function witnessIdentity(identityValue: RegularIdentity) {
  return {
    dev: identityValue.dev.toString(),
    ino: identityValue.ino.toString(),
    mode: 384 as const,
    uid: identityValue.uid.toString(),
    gid: identityValue.gid.toString(),
  };
}

function requireDecimal(value: unknown): string {
  if (typeof value !== "string" || !/^(?:0|[1-9][0-9]*)$/.test(value)) {
    return recoveryRequired();
  }
  return value;
}

function requireWitness(
  value: unknown,
  intent: GenerationIntentV1,
): GenerationRecordWitnessV1 {
  const record = plainRecord(value);
  exactKeys(record, [
    "schemaVersion",
    "generationId",
    "sequence",
    "recordDigest",
    "recordName",
    "recordFileIdentity",
  ]);
  const fileIdentity = plainRecord(record.recordFileIdentity);
  exactKeys(fileIdentity, ["dev", "ino", "mode", "uid", "gid"]);
  if (
    record.schemaVersion !== 1 ||
    record.generationId !== intent.generationId ||
    !Number.isSafeInteger(record.sequence) ||
    (record.sequence as number) < 1 ||
    (record.sequence as number) > 511 ||
    typeof record.recordDigest !== "string" ||
    !/^[a-f0-9]{64}$/.test(record.recordDigest) ||
    record.recordName !== ".record.next" ||
    fileIdentity.mode !== 384
  ) {
    return recoveryRequired();
  }
  return {
    schemaVersion: 1,
    generationId: intent.generationId,
    sequence: record.sequence as number,
    recordDigest: record.recordDigest,
    recordName: ".record.next",
    recordFileIdentity: {
      dev: requireDecimal(fileIdentity.dev),
      ino: requireDecimal(fileIdentity.ino),
      mode: 384,
      uid: requireDecimal(fileIdentity.uid),
      gid: requireDecimal(fileIdentity.gid),
    },
  };
}

function identityMatchesWitness(
  actual: RegularIdentity,
  witness: GenerationRecordWitnessV1,
): boolean {
  return actual.dev.toString() === witness.recordFileIdentity.dev &&
    actual.ino.toString() === witness.recordFileIdentity.ino &&
    (actual.mode & 0o777n) === BigInt(witness.recordFileIdentity.mode) &&
    actual.uid.toString() === witness.recordFileIdentity.uid &&
    actual.gid.toString() === witness.recordFileIdentity.gid;
}

function requireHead(value: unknown, intent: GenerationIntentV1): GenerationHeadV1 {
  const record = plainRecord(value);
  exactKeys(record, ["generationId", "sequence", "recordDigest"]);
  if (
    record.generationId !== intent.generationId ||
    !Number.isSafeInteger(record.sequence) ||
    (record.sequence as number) < 0 ||
    (record.sequence as number) > 511 ||
    typeof record.recordDigest !== "string" ||
    !/^[a-f0-9]{64}$/.test(record.recordDigest)
  ) {
    return recoveryRequired();
  }
  return {
    generationId: intent.generationId,
    sequence: record.sequence as number,
    recordDigest: record.recordDigest,
  };
}

export class GenerationRecordJournal {
  readonly #root: OpenedDataRoot;
  readonly #lease: DataRootWriterLease | undefined;
  readonly #intent: GenerationIntentV1;
  readonly #generationPath: string;
  readonly #recordsPath: string;

  constructor(
    root: OpenedDataRoot,
    lease: DataRootWriterLease,
    intentInput: GenerationIntentV1,
  );
  /**
   * Read-only construction deliberately has no writer lease.  It validates the
   * same durable journal chain as the writer facade but cannot append, resume,
   * or otherwise mutate it.
   */
  constructor(root: OpenedDataRoot, intentInput: GenerationIntentV1);
  constructor(
    root: OpenedDataRoot,
    leaseOrIntent: DataRootWriterLease | GenerationIntentV1,
    maybeIntent?: GenerationIntentV1,
  ) {
    const liveRoot = requireLiveOpenedDataRoot(root);
    const lease = maybeIntent === undefined ? undefined : leaseOrIntent as DataRootWriterLease;
    if (lease !== undefined && requireLiveDataRootWriterLease(lease).root !== root) {
      recoveryRequired();
    }
    const intent = requireGenerationIntent(
      maybeIntent === undefined ? leaseOrIntent as GenerationIntentV1 : maybeIntent,
    );
    const digest = intent.generationId.slice("generation:sha256:".length);
    this.#root = root;
    this.#lease = lease;
    this.#intent = intent;
    this.#generationPath = join(
      liveRoot.absolutePath,
      "receipts",
      "generations",
      "data",
      digest,
    );
    this.#recordsPath = join(this.#generationPath, "records");
    this.#assertLive();
    const diskIntent = requireGenerationIntent(
      parseCanonicalJson(join(this.#generationPath, "intent.json"), 64 * 1024),
    );
    if (
      !Buffer.from(canonicalJsonBytes(diskIntent)).equals(
        Buffer.from(canonicalJsonBytes(intent)),
      )
    ) {
      recoveryRequired();
    }
  }

  #assertLive(): void {
    if (this.#lease !== undefined && requireLiveDataRootWriterLease(this.#lease).root !== this.#root) {
      recoveryRequired();
    }
    requireLiveOpenedDataRoot(this.#root);
  }

  #requireWriter(): void {
    if (
      this.#lease === undefined ||
      requireLiveDataRootWriterLease(this.#lease).root !== this.#root
    ) {
      recoveryRequired();
    }
  }

  #readHead(): GenerationHeadV1 {
    return requireHead(
      parseCanonicalJson(join(this.#generationPath, "head.json"), 1024),
      this.#intent,
    );
  }

  #loadValidatedChain(): readonly GenerationStateRecordV1[] {
    const scan = scanRecordDirectory(this.#recordsPath);
    const head = this.#readHead();
    const reversed: unknown[] = [];
    const expectedFinalNames = new Set<string>();
    let sequence = head.sequence;
    let digest = head.recordDigest;
    while (true) {
      const filename = `${sequence.toString().padStart(16, "0")}-${digest}.json`;
      expectedFinalNames.add(filename);
      const raw = parseCanonicalJson(join(this.#recordsPath, filename), 64 * 1024);
      const untrusted = raw as GenerationStateRecordV1;
      if (
        typeof untrusted !== "object" ||
        untrusted === null ||
        untrusted.sequence !== sequence ||
        generationStateRecordDigest(untrusted) !== digest
      ) {
        return recoveryRequired();
      }
      reversed.push(untrusted);
      if (sequence === 0) break;
      if (
        typeof untrusted.previousRecordDigest !== "string" ||
        !/^[a-f0-9]{64}$/.test(untrusted.previousRecordDigest)
      ) {
        return recoveryRequired();
      }
      digest = untrusted.previousRecordDigest;
      sequence -= 1;
    }
    let chain: readonly GenerationStateRecordV1[];
    try {
      chain = requireGenerationStateRecordChain(reversed.reverse(), this.#intent);
    } catch {
      return recoveryRequired();
    }
    const current = chain[chain.length - 1]!;
    if (
      current.sequence !== head.sequence ||
      generationStateRecordDigest(current) !== head.recordDigest
    ) {
      return recoveryRequired();
    }
    const extraFinalNames = [...scan.finalNames]
      .filter((name) => !expectedFinalNames.has(name));
    if (extraFinalNames.length > 1) return recoveryRequired();
    if (extraFinalNames.length === 1) {
      const expectedPrefix = `${(head.sequence + 1).toString().padStart(16, "0")}-`;
      if (!extraFinalNames[0]!.startsWith(expectedPrefix)) recoveryRequired();
    }
    const hasNext = scan.names.has(".record.next");
    const hasWitness = scan.names.has(".record.next.witness");
    if (hasNext && !hasWitness) recoveryRequired();
    if (extraFinalNames.length === 1 && !hasWitness) recoveryRequired();
    return chain;
  }

  readCurrent(): GenerationStateRecordV1 {
    this.#assertLive();
    const chain = this.#loadValidatedChain();
    return chain[chain.length - 1]!;
  }

  /** Package-internal read-only full-chain accessor; 不暴露 writer 或 raw fd。 */
  readValidatedChain(): readonly GenerationStateRecordV1[] {
    this.#assertLive();
    return this.#loadValidatedChain();
  }

  append(
    state: GenerationStateV1,
    payload: Readonly<Record<string, unknown>>,
    recordedAt: string,
  ): GenerationStateRecordV1 {
    this.#assertLive();
    this.#requireWriter();
    const nextPath = join(this.#recordsPath, ".record.next");
    const witnessPath = join(this.#recordsPath, ".record.next.witness");
    if (pathExists(nextPath) || pathExists(witnessPath)) recoveryRequired();
    const chain = this.#loadValidatedChain();
    const next = createNextChainedGenerationStateRecord(
      this.#intent,
      chain,
      state,
      payload,
      recordedAt,
    );
    writeNewSyncedFile(nextPath, canonicalJsonBytes(next));
    stageHook("next-file-synced");
    const recordIdentity = identity(nextPath);
    const witness: GenerationRecordWitnessV1 = {
      schemaVersion: 1,
      generationId: this.#intent.generationId,
      sequence: next.sequence,
      recordDigest: generationStateRecordDigest(next),
      recordName: ".record.next",
      recordFileIdentity: witnessIdentity(recordIdentity),
    };
    writeNewSyncedFile(witnessPath, canonicalJsonBytes(witness));
    syncDirectory(this.#recordsPath);
    stageHook("witness-directory-synced");
    const resumed = this.resumePending();
    if (resumed === undefined) recoveryRequired();
    return resumed;
  }

  /**
   * Package-internal read-only pending decode。与 `resumePending` 的读取阶段共享
   * 同一 witness/chain 验证：不执行任何 mutation，也不要求 writer lease。
   * 无 pending 证据时返回 undefined；任何非法 pending 形态 fail closed。
   */
  readPendingRecord(): GenerationStateRecordV1 | undefined {
    this.#assertLive();
    return this.#decodePending()?.pendingRecord;
  }

  #decodePending(): {
    readonly witness: GenerationRecordWitnessV1;
    readonly pendingRecord: GenerationStateRecordV1;
    readonly headAlreadyAdvanced: boolean;
  } | undefined {
    const nextPath = join(this.#recordsPath, ".record.next");
    const witnessPath = join(this.#recordsPath, ".record.next.witness");
    const nextExists = pathExists(nextPath);
    const witnessExists = pathExists(witnessPath);
    if (!nextExists && !witnessExists) return undefined;
    if (!witnessExists) return recoveryRequired();

    const witness = requireWitness(
      parseCanonicalJson(witnessPath, GENERATION_RECORD_WITNESS_MAX_BYTES),
      this.#intent,
    );
    const chain = this.#loadValidatedChain();
    const current = chain[chain.length - 1]!;
    const headAlreadyAdvanced =
      current.sequence === witness.sequence &&
      generationStateRecordDigest(current) === witness.recordDigest;
    if (
      !headAlreadyAdvanced &&
      witness.sequence !== current.sequence + 1
    ) {
      return recoveryRequired();
    }
    if (headAlreadyAdvanced) {
      // head 已推进时，唯一合法的 physical shape 是 committed head chain 本身加
      // pending 辅助名；“多出一个 head+1 final”只属于 head 未推进的正常 pending
      // 形态。任何 chain 外多余 final 都必须在任何 unlink/cleanup 之前 fail closed。
      const rescan = scanRecordDirectory(this.#recordsPath);
      const committedNames = new Set(chain.map(generationStateRecordFilename));
      if ([...rescan.finalNames].some((name) => !committedNames.has(name))) {
        return recoveryRequired();
      }
    }

    let pendingRecord: GenerationStateRecordV1;
    if (nextExists) {
      const nextIdentity = identity(nextPath);
      if (!identityMatchesWitness(nextIdentity, witness)) return recoveryRequired();
      const pendingRaw = parseCanonicalJson(nextPath, 64 * 1024);
      const prefix = headAlreadyAdvanced ? chain.slice(0, -1) : chain;
      try {
        pendingRecord = requireGenerationStateRecordChain(
          [...prefix, pendingRaw],
          this.#intent,
        )[prefix.length]!;
      } catch {
        return recoveryRequired();
      }
      if (
        pendingRecord.sequence !== witness.sequence ||
        generationStateRecordDigest(pendingRecord) !== witness.recordDigest
      ) {
        return recoveryRequired();
      }
    } else if (headAlreadyAdvanced) {
      pendingRecord = current;
    } else {
      return recoveryRequired();
    }
    return { witness, pendingRecord, headAlreadyAdvanced };
  }

  resumePending(): GenerationStateRecordV1 | undefined {
    this.#assertLive();
    this.#requireWriter();
    const nextPath = join(this.#recordsPath, ".record.next");
    const witnessPath = join(this.#recordsPath, ".record.next.witness");
    const nextExists = pathExists(nextPath);
    const witnessExists = pathExists(witnessPath);
    if (!nextExists && !witnessExists) return undefined;
    if (!witnessExists) return recoveryRequired();

    const witnessFileIdentity = identity(witnessPath);
    const decoded = this.#decodePending();
    if (decoded === undefined) return undefined;
    const { witness, pendingRecord, headAlreadyAdvanced } = decoded;

    const finalName = `${witness.sequence.toString().padStart(16, "0")}-${witness.recordDigest}.json`;
    const finalPath = join(this.#recordsPath, finalName);
    const finalExists = pathExists(finalPath);

    if (finalExists) {
      const finalIdentity = identity(finalPath);
      if (!identityMatchesWitness(finalIdentity, witness)) return recoveryRequired();
      if (nextExists && !sameIdentity(identity(nextPath), finalIdentity)) {
        return recoveryRequired();
      }
    } else {
      if (!nextExists || headAlreadyAdvanced) return recoveryRequired();
      try {
        linkSync(nextPath, finalPath);
      } catch {
        return recoveryRequired();
      }
      if (!identityMatchesWitness(identity(finalPath), witness)) {
        return recoveryRequired();
      }
      syncDirectory(this.#recordsPath);
      stageHook("final-link-directory-synced");
    }

    if (!headAlreadyAdvanced) {
      const headNextPath = join(this.#generationPath, "head.next");
      const nextHead: GenerationHeadV1 = {
        generationId: this.#intent.generationId,
        sequence: witness.sequence,
        recordDigest: witness.recordDigest,
      };
      if (pathExists(headNextPath)) {
        const existing = requireHead(
          parseCanonicalJson(headNextPath, 1024),
          this.#intent,
        );
        if (
          existing.sequence !== nextHead.sequence ||
          existing.recordDigest !== nextHead.recordDigest
        ) {
          return recoveryRequired();
        }
      } else {
        writeNewSyncedFile(headNextPath, canonicalJsonBytes(nextHead));
      }
      stageHook("head-next-synced");
      renameSync(headNextPath, join(this.#generationPath, "head.json"));
      syncDirectory(this.#generationPath);
      stageHook("head-directory-synced");
    }

    if (pathExists(nextPath)) {
      if (!identityMatchesWitness(identity(nextPath), witness)) {
        return recoveryRequired();
      }
      unlinkSync(nextPath);
      syncDirectory(this.#recordsPath);
      stageHook("next-cleanup-directory-synced");
    }
    if (!sameIdentity(identity(witnessPath), witnessFileIdentity)) {
      return recoveryRequired();
    }
    unlinkSync(witnessPath);
    syncDirectory(this.#recordsPath);
    stageHook("witness-cleanup-directory-synced");
    return pendingRecord;
  }
}

/**
 * Reuses the record journal's bounded scanner and chain decoder to freeze the
 * physical head/record evidence consumed by startup birth recovery.
 */
export function inspectGenerationRecordJournalPhysicalSnapshot(
  root: OpenedDataRoot,
  lease: DataRootWriterLease,
  intentInput: GenerationIntentV1,
): GenerationRecordJournalPhysicalSnapshot {
  const rootPath = requireLiveOpenedDataRoot(root).absolutePath;
  if (requireLiveDataRootWriterLease(lease).root !== root) recoveryRequired();
  const intent = requireGenerationIntent(intentInput);
  const generationPath = join(
    rootPath,
    "receipts",
    "generations",
    "data",
    intent.generationId.slice("generation:sha256:".length),
  );
  const recordsPath = join(generationPath, "records");
  const directoryBefore = requireDirectorySnapshot(recordsPath);
  const journal = new GenerationRecordJournal(root, lease, intent);
  journal.readCurrent();
  const scan = scanRecordDirectory(recordsPath);
  const entries = [...scan.names].sort().map((name) => Object.freeze({
    name,
    ...captureRegularSnapshot(
      join(recordsPath, name),
      name === ".record.next.witness"
        ? GENERATION_RECORD_WITNESS_MAX_BYTES
        : 64 * 1024,
    ),
  }));
  const finalScan = scanRecordDirectory(recordsPath);
  if (
    finalScan.names.size !== scan.names.size ||
    [...finalScan.names].some((name) => !scan.names.has(name))
  ) {
    recoveryRequired();
  }
  const directoryAfter = requireDirectorySnapshot(recordsPath);
  if (
    directoryBefore.dev !== directoryAfter.dev ||
    directoryBefore.ino !== directoryAfter.ino ||
    directoryBefore.mode !== directoryAfter.mode ||
    directoryBefore.uid !== directoryAfter.uid ||
    directoryBefore.gid !== directoryAfter.gid
  ) {
    recoveryRequired();
  }
  return deepFreeze({
    head: captureRegularSnapshot(join(generationPath, "head.json"), 1024),
    intent: captureRegularSnapshot(join(generationPath, "intent.json"), 64 * 1024),
    recordsDirectory: {
      ...directoryBefore,
      names: Object.freeze([...scan.names].sort()),
    },
    entries: Object.freeze(entries),
  }) as GenerationRecordJournalPhysicalSnapshot;
}

/**
 * Package-internal read-only durable intent loader。pre-submit coordinator 用它
 * 在 replay/append 前读取 exact intent；intent.json 的 authority 就是本 journal。
 */
export function readGenerationIntentForJournal(
  root: OpenedDataRoot,
  lease: DataRootWriterLease,
  generationId: `generation:sha256:${string}`,
): GenerationIntentV1 {
  const rootPath = requireLiveOpenedDataRoot(root).absolutePath;
  if (requireLiveDataRootWriterLease(lease).root !== root) recoveryRequired();
  let intent: GenerationIntentV1;
  try {
    intent = requireGenerationIntent(
      parseCanonicalJson(
        join(
          rootPath,
          "receipts",
          "generations",
          "data",
          generationId.slice("generation:sha256:".length),
          "intent.json",
        ),
        64 * 1024,
      ),
    );
  } catch {
    return recoveryRequired();
  }
  if (intent.generationId !== generationId) recoveryRequired();
  return intent;
}

/** 同目录 focused crash tests 使用；不从 package root export。 */
export const GENERATION_RECORD_JOURNAL_TEST_SEAMS = Object.freeze({
  replaceStageHook(replacement: (stage: Stage) => void): () => void {
    const previous = stageHook;
    stageHook = replacement;
    return () => {
      if (stageHook === replacement) stageHook = previous;
    };
  },
});
