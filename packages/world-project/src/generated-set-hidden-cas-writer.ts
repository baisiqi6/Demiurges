import {
  linkSync,
  lstatSync,
  mkdirSync,
  opendirSync,
  type BigIntStats,
} from "node:fs";
import { join } from "node:path";

import { canonicalJsonBytes, deepFreeze } from "@demiurges/world";

import {
  dataRootStagingPath,
  requireLiveOpenedDataRoot,
  type OpenedDataRoot,
} from "./data-root";
import {
  requireLiveDataRootWriterLease,
  type DataRootWriterLease,
} from "./data-root-lease";
import { generationIdDigest } from "./generation-birth";
import {
  GenerationCodecError,
  requireGenerationIntent,
  type GenerationIntentV1,
  type GenerationProviderV1,
} from "./generation-contracts";
import {
  generationStateRecordDigest,
  type GenerationStateRecordV1,
} from "./generation-state";
import { GenerationRecordJournal } from "./generation-record-journal";
import {
  requireGeneratedSetPublishingTransitionProvenance,
  type GeneratedSetPublishingTransitionEvidenceV1,
  type GeneratedSetPublishingTransitionProvenanceV1,
} from "./generated-set-publishing-transition";
import { requireGeneratedSetPublishingReceiptTakeover } from "./generated-set-publishing-transition";
import {
  requireGeneratedSetPublicationOriginForRoot,
  type GeneratedSetPublicationPlanV1,
} from "./generated-artifact-publication";
import {
  deriveVerifiedArtifactContentRecord,
  GENERATED_ARTIFACT_RECORD_MAX_BYTES,
  type VerifiedArtifactContentRecordV1,
} from "./generated-artifact-records";
import {
  generatedArtifactByBytesPointerPath,
  generatedArtifactBytesPath,
  generatedArtifactContentRecordPath,
  generatedArtifactProvenanceRecordPath,
  generatedArtifactSetRecordPath,
} from "./generated-artifact-layout";
import {
  inspectGeneratedSetStoragePreflight,
  type GeneratedSetStorageContentObservationV1,
  type GeneratedSetStorageMemberObservationV1,
  type GeneratedSetStoragePreflightSnapshotV1,
} from "./generated-set-storage-preflight";
import { inspectDynamicArtifactBytes } from "./generation-artifact-inspector";
import {
  readStableRegularFileSnapshot,
  syncDirectory,
  writeNewSyncedFile,
} from "./safe-filesystem";

/**
 * Package-internal、同步 set-level hidden CAS writer。
 *
 * 消费上一一切片 durable 的 `GeneratedSetPublishingTransitionEvidenceV1`（head 已
 * 为 `publishing={operationId,artifactSetDigest}`），在同一同步调用内把完整
 * generated set 写入隐藏的不可变 CAS 命名空间，phase 顺序固定：
 *
 * 1. 全部 unique bytes CAS（`artifacts/sha256/<contentDigest>`，private candidate
 *    是唯一 trusted source，no-replace hard-link + parent fsync）；
 * 2. 每个 unique content 的 content record（`artifacts/records/content/sha256/…`）
 *    与 exact by-bytes pointer（`artifacts/records/content/by-bytes/sha256/<digest>.json`，
 *    先 staged canonical pointer 文件再 no-replace hard-link + parent fsync）；
 * 3. 全部 provenance records（`artifacts/records/provenance/sha256/…`）；
 * 4. set record（`artifacts/sets/sha256/…`）。
 *
 * 本切片到此为止：不写 `artifacts/catalog/…`、不写 Operation result、不 append
 * Generation state、不做 startup recovery、不调用 package-root public facade。
 * 任何失败都保留全部 durable 证据并 fail closed：不 unlink、不 overwrite、不
 * 猜测 cleanup。deterministic staging 名只存在于已 admit 的 Operation attempt
 * 目录内，grammar/count 封闭，属于后续 startup 切片的 hidden evidence。
 */

const RECORD_MAX_BYTES = GENERATED_ARTIFACT_RECORD_MAX_BYTES;
const ATTEMPT_TOKEN_PATTERN = /^[0-9a-f]{24}$/;
const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const STAGED_NAME_PATTERN = /^[a-f0-9]{64}\.(content|pointer|provenance|set)\.json$/;
const CANDIDATE_NAME_PATTERN = /^[a-z0-9-]+-c[12]-a[12]-[a-f0-9]{64}\.bin$/;
/** attempt 目录 entry 上界：operation-intent.json + 最多 16×2 + 16 + 1 个 staged 名。 */
const MAX_ATTEMPT_STAGED_ENTRIES = 64;

export interface GeneratedSetHiddenCasEvidenceV1 {
  readonly schemaVersion: 1;
  readonly kind: "generated-set-hidden-cas-written-v1";
  readonly generationId: `generation:sha256:${string}`;
  readonly provider: GenerationProviderV1;
  readonly publicationOperationId: string;
  readonly publicationBindingDigest: string;
  readonly artifactSetDigest: string;
  readonly publishingSequence: number;
  readonly publishingRecordDigest: string;
  readonly hiddenPhase: "complete";
  readonly uniqueContentCount: number;
  readonly orderedContentDigests: readonly string[];
  readonly orderedContentRecordDigests: readonly string[];
  readonly orderedProvenanceRecordDigests: readonly string[];
  readonly setRecordDigest: string;
}

export interface GeneratedSetHiddenCasProvenanceV1 {
  readonly plan: GeneratedSetPublicationPlanV1;
  readonly intentPath: string;
  readonly attemptPath: string;
}

interface HiddenCasAuthority {
  readonly root: OpenedDataRoot;
  readonly lease: DataRootWriterLease;
  readonly plan: GeneratedSetPublicationPlanV1;
  readonly intentPath: string;
  readonly attemptPath: string;
}

/**
 * Startup Phase A produces this opaque, one-shot handle after deriving the
 * current-process intent/plan from durable Generation evidence.  Its body is
 * deliberately not a path/record/storage capability; the private WeakMap
 * carries the inspected authority and apply re-runs every precheck.
 */
export interface GeneratedSetHiddenCasStartupResumeV1 {
  readonly schemaVersion: 1;
  readonly kind: "generated-set-hidden-cas-startup-resume-v1";
  readonly generationId: `generation:sha256:${string}`;
  readonly publicationOperationId: string;
  readonly artifactSetDigest: string;
}

interface HiddenCasStartupAuthority {
  readonly root: OpenedDataRoot;
  readonly lease: DataRootWriterLease;
  readonly intent: GenerationIntentV1;
  readonly plan: GeneratedSetPublicationPlanV1;
  readonly snapshot: Uint8Array;
  consumed: boolean;
}

const hiddenCasAuthorities = new WeakMap<
  GeneratedSetHiddenCasEvidenceV1,
  HiddenCasAuthority
>();
const hiddenCasStartupAuthorities = new WeakMap<
  GeneratedSetHiddenCasStartupResumeV1,
  HiddenCasStartupAuthority
>();

interface UniqueContent {
  readonly content: GeneratedSetStorageContentObservationV1;
  readonly member: GeneratedSetStorageMemberObservationV1;
}

function invalid(): never {
  throw new GenerationCodecError("GENERATION_RECOVERY_REQUIRED");
}

function syscallCode(error: unknown): string | undefined {
  if (typeof error === "object" && error !== null && "code" in error) {
    return typeof error.code === "string" ? error.code : undefined;
  }
  return undefined;
}

function requireAbsent(path: string): void {
  try {
    lstatSync(path);
  } catch (error) {
    if (syscallCode(error) === "ENOENT") return;
    return invalid();
  }
  return invalid();
}

function canonicalBytes(value: unknown): Uint8Array {
  try {
    return canonicalJsonBytes(value);
  } catch {
    return invalid();
  }
}

function sameCanonical(left: unknown, right: unknown): boolean {
  return Buffer.from(canonicalBytes(left)).equals(Buffer.from(canonicalBytes(right)));
}

type BigIntStat = BigIntStats;

function lstatNoFollow(path: string): BigIntStat | null {
  try {
    return lstatSync(path, { bigint: true });
  } catch (error) {
    if (syscallCode(error) === "ENOENT") return null;
    return invalid();
  }
}

function isExact0600Regular(stat: BigIntStat): boolean {
  return (
    (stat.mode & 0o170000n) === 0o100000n &&
    (stat.mode & 0o7777n) === 0o600n
  );
}

function isExact0700Directory(stat: BigIntStat): boolean {
  return (
    (stat.mode & 0o170000n) === 0o40000n &&
    (stat.mode & 0o7777n) === 0o700n
  );
}

/**
 * 目标分类：ENOENT → `absent`；存在则必须以 no-follow 稳定快照读到 exact
 * 0600 regular canonical bytes，否则任何 drift（symlink、wrong type/mode、size、
 * identity、body）一律 fail closed。
 */
export function classifyExactFile(
  path: string,
  expectedBytes: Uint8Array,
  maxBytes: number,
): "absent" | "exact" {
  if (lstatNoFollow(path) === null) return "absent";
  let bytes: Uint8Array;
  try {
    bytes = readStableRegularFileSnapshot(path, maxBytes).bytes;
  } catch {
    return invalid();
  }
  if (!Buffer.from(bytes).equals(Buffer.from(expectedBytes))) return invalid();
  return "exact";
}

/** 从 root 沿固定 segments 建立 0700 目录链；每个新目录先 mkdir 再 fsync parent。 */
export function ensureParentDirectories(rootPath: string, relativeDir: string): void {
  if (relativeDir === "") return;
  const segments = relativeDir.split("/");
  if (
    segments.length === 0 ||
    segments.some((segment) =>
      segment.length === 0 || segment === "." || segment === "..")
  ) {
    return invalid();
  }
  let parent = "";
  for (const segment of segments) {
    const relative = parent === "" ? segment : `${parent}/${segment}`;
    const path = join(rootPath, relative);
    const stat = lstatNoFollow(path);
    if (stat === null) {
      try {
        mkdirSync(path, { mode: 0o700, recursive: false });
      } catch (error) {
        if (syscallCode(error) !== "EEXIST") return invalid();
      }
      const after = lstatNoFollow(path);
      if (after === null || !isExact0700Directory(after)) return invalid();
      syncDirectory(join(rootPath, parent));
    } else if (!isExact0700Directory(stat)) {
      return invalid();
    }
    parent = relative;
  }
}

function requireLiveRootLease(
  root: OpenedDataRoot,
  lease: DataRootWriterLease,
): void {
  requireLiveOpenedDataRoot(root);
  if (requireLiveDataRootWriterLease(lease).root !== root) return invalid();
}

/** staged 与 final 必须是同一 exact 0600 regular inode（nlink ≥ 2）。 */
export function requireLinkedTargetExact(
  finalPath: string,
  stagedPath: string,
  expectedBytes: Uint8Array,
): void {
  let finalBytes: Uint8Array;
  try {
    finalBytes = readStableRegularFileSnapshot(finalPath, RECORD_MAX_BYTES).bytes;
  } catch {
    return invalid();
  }
  if (!Buffer.from(finalBytes).equals(Buffer.from(expectedBytes))) return invalid();
  const finalStat = lstatNoFollow(finalPath);
  const stagedStat = lstatNoFollow(stagedPath);
  if (
    finalStat === null ||
    stagedStat === null ||
    !isExact0600Regular(finalStat) ||
    !isExact0600Regular(stagedStat) ||
    finalStat.dev !== stagedStat.dev ||
    finalStat.ino !== stagedStat.ino ||
    finalStat.nlink < 2n ||
    stagedStat.nlink < 2n
  ) {
    return invalid();
  }
}

// ---- 只供同目录 focused durability tests 注入 fault/drift，不进入 package root ----

export type GeneratedSetHiddenCasWriterStage =
  | "after-bytes-link"
  | "after-bytes-dir-fsync"
  | "after-content-staged-write"
  | "after-content-link"
  | "after-content-dir-fsync"
  | "after-pointer-staged-write"
  | "after-pointer-link"
  | "after-pointer-dir-fsync"
  | "after-provenance-staged-write"
  | "after-provenance-link"
  | "after-provenance-dir-fsync"
  | "after-set-staged-write"
  | "after-set-link"
  | "after-set-dir-fsync";

type StageHook = (stage: GeneratedSetHiddenCasWriterStage) => void;

const stageHooks = new Map<GeneratedSetHiddenCasWriterStage, StageHook>();

export const GENERATED_SET_HIDDEN_CAS_WRITER_TEST_SEAMS = Object.freeze({
  replaceStageHook(
    stage: GeneratedSetHiddenCasWriterStage,
    hook: StageHook,
  ): () => void {
    const previous = stageHooks.get(stage);
    stageHooks.set(stage, hook);
    return () => {
      if (stageHooks.get(stage) === hook) {
        if (previous === undefined) stageHooks.delete(stage);
        else stageHooks.set(stage, previous);
      }
    };
  },
});

function runStageHook(stage: GeneratedSetHiddenCasWriterStage): void {
  const hook = stageHooks.get(stage);
  if (hook !== undefined) hook(stage);
}

/**
 * Record/pointer/set 的 exact publication：staged canonical 文件（新 0600 regular，
 * 写后 fsync 文件 + fsync attempt 目录）→ no-replace hard-link → parent fsync →
 * 重开验证 staged/final 同一 inode 且 body byte-exact。已有 exact final 幂等复用；
 * EEXIST race 只接受 resulting target 为 exact canonical 文件。
 */
function publishRecordTarget(
  rootPath: string,
  attemptPath: string,
  stagedName: string,
  relativeTarget: string,
  expectedBytes: Uint8Array,
  stagePrefix: "content" | "pointer" | "provenance" | "set",
): void {
  if (!STAGED_NAME_PATTERN.test(stagedName)) return invalid();
  const parent = relativeTarget.slice(0, relativeTarget.lastIndexOf("/"));
  ensureParentDirectories(rootPath, parent);
  const finalPath = join(rootPath, relativeTarget);
  if (classifyExactFile(finalPath, expectedBytes, RECORD_MAX_BYTES) === "exact") {
    return;
  }
  const stagedPath = join(attemptPath, stagedName);
  const stagedStat = lstatNoFollow(stagedPath);
  if (stagedStat === null) {
    try {
      writeNewSyncedFile(stagedPath, expectedBytes);
    } catch {
      return invalid();
    }
    syncDirectory(attemptPath);
  } else {
    let stagedBytes: Uint8Array;
    try {
      stagedBytes = readStableRegularFileSnapshot(stagedPath, RECORD_MAX_BYTES).bytes;
    } catch {
      return invalid();
    }
    if (!Buffer.from(stagedBytes).equals(Buffer.from(expectedBytes))) {
      return invalid();
    }
  }
  runStageHook(`after-${stagePrefix}-staged-write`);
  let linked = false;
  try {
    linkSync(stagedPath, finalPath);
    linked = true;
  } catch (error) {
    if (syscallCode(error) !== "EEXIST") return invalid();
  }
  runStageHook(`after-${stagePrefix}-link`);
  syncDirectory(join(rootPath, parent));
  runStageHook(`after-${stagePrefix}-dir-fsync`);
  if (linked) {
    requireLinkedTargetExact(finalPath, stagedPath, expectedBytes);
  } else {
    // race：只接受 exact canonical pointer/record，否则 fail closed。
    if (classifyExactFile(finalPath, expectedBytes, RECORD_MAX_BYTES) !== "exact") {
      return invalid();
    }
  }
}

/**
 * Bytes CAS 的 exact publication：private candidate（已由 durable download record
 * 冻结 inode）是唯一 trusted source；no-replace hard-link + parent fsync，随后
 * 以 no-follow 重开并重新 inspect bytes 证明与 content record exact 一致。
 */
function publishBytesCas(
  rootPath: string,
  plan: GeneratedSetPublicationPlanV1,
  member: GeneratedSetStorageMemberObservationV1,
  content: GeneratedSetStorageContentObservationV1,
): void {
  ensureParentDirectories(rootPath, "artifacts/sha256");
  const contentRecord = content.contentRecord;
  const relativeTarget = generatedArtifactBytesPath(content.contentDigest);
  const finalPath = join(rootPath, relativeTarget);
  const verifyContent = (bytes: Uint8Array): void => {
    if (bytes.byteLength !== contentRecord.byteLength) return invalid();
    let derived: VerifiedArtifactContentRecordV1;
    try {
      derived = deriveVerifiedArtifactContentRecord(
        inspectDynamicArtifactBytes(contentRecord.format, bytes),
      );
    } catch {
      return invalid();
    }
    if (!sameCanonical(derived, contentRecord)) return invalid();
  };

  const existing = lstatNoFollow(finalPath);
  if (existing !== null) {
    let bytes: Uint8Array;
    try {
      bytes = readStableRegularFileSnapshot(
        finalPath,
        contentRecord.byteLength,
      ).bytes;
    } catch {
      return invalid();
    }
    verifyContent(bytes);
    return;
  }

  if (!CANDIDATE_NAME_PATTERN.test(member.candidateName)) return invalid();
  const candidatePath = join(
    rootPath,
    "receipts",
    "generations",
    "data",
    generationIdDigest(plan.generationId),
    "downloads",
    member.candidateName,
  );
  const candidateStat = lstatNoFollow(candidatePath);
  if (
    candidateStat === null ||
    !isExact0600Regular(candidateStat) ||
    candidateStat.dev.toString() !== member.expectedFileIdentity.dev ||
    candidateStat.ino.toString() !== member.expectedFileIdentity.ino ||
    Number(candidateStat.uid) !== member.expectedFileIdentity.uid ||
    Number(candidateStat.gid) !== member.expectedFileIdentity.gid
  ) {
    return invalid();
  }
  let candidateBytes: Uint8Array;
  try {
    candidateBytes = readStableRegularFileSnapshot(
      candidatePath,
      contentRecord.byteLength,
    ).bytes;
  } catch {
    return invalid();
  }
  verifyContent(candidateBytes);

  try {
    linkSync(candidatePath, finalPath);
  } catch (error) {
    if (syscallCode(error) !== "EEXIST") return invalid();
  }
  runStageHook("after-bytes-link");
  syncDirectory(join(rootPath, "artifacts/sha256"));
  runStageHook("after-bytes-dir-fsync");
  let finalBytes: Uint8Array;
  try {
    finalBytes = readStableRegularFileSnapshot(
      finalPath,
      contentRecord.byteLength,
    ).bytes;
  } catch {
    return invalid();
  }
  verifyContent(finalBytes);
  const finalStat = lstatNoFollow(finalPath);
  if (
    finalStat === null ||
    !isExact0600Regular(finalStat) ||
    finalStat.dev !== candidateStat.dev ||
    finalStat.ino !== candidateStat.ino
  ) {
    return invalid();
  }
}

/** staged 与 receipt intent 必须仍是同一 exact 0600 regular canonical binding inode/body。 */
export function requireExactLinkedIntent(
  stagedPath: string,
  receiptPath: string,
  bindingBytes: Uint8Array,
): void {
  for (const path of [stagedPath, receiptPath]) {
    const stat = lstatNoFollow(path);
    if (stat === null || !isExact0600Regular(stat) || stat.nlink < 2n) {
      return invalid();
    }
  }
  const staged = readStableRegularFileSnapshot(stagedPath, RECORD_MAX_BYTES);
  const receipt = readStableRegularFileSnapshot(receiptPath, RECORD_MAX_BYTES);
  if (
    staged.identity.ino !== receipt.identity.ino ||
    staged.identity.dev !== receipt.identity.dev ||
    staged.identity.mode !== receipt.identity.mode ||
    staged.identity.size !== receipt.identity.size ||
    !Buffer.from(staged.bytes).equals(Buffer.from(bindingBytes)) ||
    !Buffer.from(receipt.bytes).equals(Buffer.from(bindingBytes))
  ) {
    return invalid();
  }
}

/**
 * Attempt 目录现场：closed grammar、bounded count；`operation-intent.json` 之外
 * 的每个 entry 必须落在本 plan 的 expected staged 集合内且 bytes exact。
 * extra/foreign/wrong-type 证据一律 fail closed，不删除、不忽略。
 *
 * `extraStaged` 供 visible commit facade 注入本协议额外的确定性 staged 名
 * （catalog/result），其 bytes 同样要求 exact；缺省时行为与历史完全一致。
 */
export function requireAttemptStagingExact(
  rootPath: string,
  plan: GeneratedSetPublicationPlanV1,
  snapshot: GeneratedSetStoragePreflightSnapshotV1,
  attemptPath: string,
  extraStaged?: ReadonlyMap<string, Uint8Array>,
): void {
  const basename = attemptPath.slice(attemptPath.lastIndexOf("/") + 1);
  const prefix = `${plan.binding.operationId}-`;
  if (!basename.startsWith(prefix)) return invalid();
  const token = basename.slice(prefix.length);
  if (!ATTEMPT_TOKEN_PATTERN.test(token)) return invalid();
  if (
    attemptPath !== join(rootPath, dataRootStagingPath(plan.binding.operationId, token))
  ) {
    return invalid();
  }

  const expected = new Map<string, Uint8Array>();
  const seenContent = new Set<string>();
  for (const [index, member] of snapshot.members.entries()) {
    const content = snapshot.content[index]!;
    expected.set(
      `${content.contentRecord.recordDigest}.content.json`,
      canonicalBytes(content.contentRecord),
    );
    expected.set(
      `${content.contentDigest}.pointer.json`,
      canonicalBytes(content.byBytesPointer),
    );
    expected.set(
      `${member.provenanceRecord.recordDigest}.provenance.json`,
      canonicalBytes(member.provenanceRecord),
    );
    seenContent.add(content.contentDigest);
  }
  expected.set(
    `${snapshot.setRecord.artifactSetDigest}.set.json`,
    canonicalBytes(snapshot.setRecord),
  );
  if (extraStaged !== undefined) {
    for (const [name, bytes] of extraStaged) {
      if (expected.has(name)) return invalid();
      expected.set(name, bytes);
    }
  }

  let count = 0;
  const directory = opendirSync(attemptPath);
  try {
    while (true) {
      const entry = directory.readSync();
      if (entry === null) break;
      count += 1;
      if (count > MAX_ATTEMPT_STAGED_ENTRIES) return invalid();
      if (entry.name === "operation-intent.json") continue;
      const expectedBytes = expected.get(entry.name);
      if (expectedBytes === undefined) return invalid();
      let bytes: Uint8Array;
      try {
        bytes = readStableRegularFileSnapshot(
          join(attemptPath, entry.name),
          RECORD_MAX_BYTES,
        ).bytes;
      } catch {
        return invalid();
      }
      if (!Buffer.from(bytes).equals(Buffer.from(expectedBytes))) {
        return invalid();
      }
    }
  } finally {
    directory.closeSync();
  }
}

/**
 * 只读 plan↔snapshot 交叉校验（member/content 顺序、digest 绑定、set 身份）。
 * 同时被 hidden CAS writer 与本包可见 commit facade 复用；不读 filesystem。
 */
export function requireGeneratedSetPlanSnapshotCrossCheck(
  plan: GeneratedSetPublicationPlanV1,
  snapshot: GeneratedSetStoragePreflightSnapshotV1,
): void {
  if (
    snapshot.generationId !== plan.generationId ||
    snapshot.provider !== plan.provider ||
    snapshot.artifactSetDigest !== plan.artifactSetDigest ||
    snapshot.setRecord.artifactSetDigest !== plan.artifactSetDigest ||
    snapshot.content.length !== plan.orderedContentRecordDigests.length ||
    snapshot.members.length !== plan.orderedProvenanceRecordDigests.length
  ) {
    return invalid();
  }
  for (const [index, content] of snapshot.content.entries()) {
    if (
      content.contentRecord.recordDigest !==
        plan.orderedContentRecordDigests[index] ||
      content.contentRecord.digest !== content.contentDigest
    ) {
      return invalid();
    }
  }
  for (const [index, member] of snapshot.members.entries()) {
    if (
      member.provenanceRecord.recordDigest !==
        plan.orderedProvenanceRecordDigests[index] ||
      member.contentObservationIndex !== index ||
      member.provenanceRecord.contentRecordDigest !==
        snapshot.content[member.contentObservationIndex]!.contentRecord.recordDigest
    ) {
      return invalid();
    }
  }
}

/**
 * 全部只读 durable prechecks：transition evidence origin → intent/plan 身份 →
 * plan/candidate/storage origin 与 current target observations exact → Generation
 * chain 当前 head exact 等于 evidence 携带的 publishing sequence/digest →
 * staged/receipt intent inode/body → result/catalog 缺席 → attempt staging 现场
 * closed grammar。任一失败在第一个 CAS mutation 前停止并保留证据。
 */
function runHiddenCasPrechecks(
  root: OpenedDataRoot,
  lease: DataRootWriterLease,
  plan: GeneratedSetPublicationPlanV1,
  evidence: GeneratedSetPublishingTransitionEvidenceV1,
  intent: GenerationIntentV1,
  provenance: GeneratedSetPublishingTransitionProvenanceV1,
): GeneratedSetStoragePreflightSnapshotV1 {
  const rootPath = requireLiveOpenedDataRoot(root).absolutePath;
  if (
    evidence.generationId !== plan.generationId ||
    evidence.provider !== plan.provider ||
    evidence.operationId !== plan.binding.operationId ||
    evidence.artifactSetDigest !== plan.artifactSetDigest ||
    evidence.publicationBindingDigest !== plan.publicationBindingDigest ||
    !Number.isSafeInteger(evidence.publishingSequence) ||
    evidence.publishingSequence < 0 ||
    typeof evidence.publishingRecordDigest !== "string" ||
    !SHA256_PATTERN.test(evidence.publishingRecordDigest)
  ) {
    return invalid();
  }
  // plan origin（candidate plan origin + storage snapshot near-revalidation）
  // 与同一 live root 对象绑定。
  const originEvidence = requireGeneratedSetPublicationOriginForRoot(plan, root);
  // 当前 durable Generation chain 必须 exact 结束于 evidence 携带的 publishing head。
  const journal = new GenerationRecordJournal(root, lease, intent);
  const current = journal.readCurrent();
  if (
    current.state !== "publishing" ||
    current.sequence !== evidence.publishingSequence ||
    generationStateRecordDigest(current as GenerationStateRecordV1) !==
      evidence.publishingRecordDigest
  ) {
    return invalid();
  }
  requireExactLinkedIntent(
    join(provenance.attemptPath, "operation-intent.json"),
    provenance.intentPath,
    canonicalBytes(plan.binding),
  );
  requireAbsent(join(rootPath, plan.receiptResultPath));
  requireAbsent(join(rootPath, plan.catalogPath));
  // fresh current target observations（含 private candidate inode/bytes 复核）。
  const snapshot = inspectGeneratedSetStoragePreflight(
    root,
    originEvidence.candidatePlan,
  );
  requireGeneratedSetPlanSnapshotCrossCheck(plan, snapshot);
  requireAttemptStagingExact(rootPath, plan, snapshot, provenance.attemptPath);
  requireLiveRootLease(root, lease);
  return snapshot;
}

/**
 * 唯一 live mutation 入口：要求与 publishing-transition 相同的 live
 * `OpenedDataRoot`/`DataRootWriterLease`、exact intent/plan 与 origin-valid
 * `GeneratedSetPublishingTransitionEvidenceV1`。全部只读 prechecks 通过后按固定
 * phase 顺序写入 hidden CAS；伪造/复制/cross-root/cross-lease/cross-intent/
 * cross-plan/cross-evidence 或非当前 publishing head 在第一个 CAS mutation 前
 * fail closed。不写 catalog/result、不 append Generation state。
 */
function writeHiddenCasCore(
  root: OpenedDataRoot,
  lease: DataRootWriterLease,
  intent: GenerationIntentV1,
  plan: GeneratedSetPublicationPlanV1,
  evidence: GeneratedSetPublishingTransitionEvidenceV1,
  provenance: GeneratedSetPublishingTransitionProvenanceV1,
): GeneratedSetHiddenCasEvidenceV1 {
  const snapshot = runHiddenCasPrechecks(
    root,
    lease,
    plan,
    evidence,
    intent,
    provenance,
  );
  const rootPath = requireLiveOpenedDataRoot(root).absolutePath;
  const attemptPath = provenance.attemptPath;

  // Phase 1：全部 unique bytes CAS（按 member 顺序去重，共享内容只写一份）。
  const uniqueContents: UniqueContent[] = [];
  const seenContent = new Set<string>();
  for (const [index, member] of snapshot.members.entries()) {
    const content = snapshot.content[index]!;
    if (seenContent.has(content.contentDigest)) continue;
    seenContent.add(content.contentDigest);
    uniqueContents.push({ content, member });
  }
  for (const { content, member } of uniqueContents) {
    publishBytesCas(rootPath, plan, member, content);
    requireLiveRootLease(root, lease);
  }

  // Phase 2：每个 unique content 先分类 by-bytes pointer，再 content record →
  // pointer。existing exact 幂等复用；drift 在下一个 record/provenance/set
  // mutation 前 fail closed；pointer 背后 record 缺失/漂移拒绝。
  for (const { content } of uniqueContents) {
    const pointerBytes = canonicalBytes(content.byBytesPointer);
    const pointerTarget = generatedArtifactByBytesPointerPath(content.contentDigest);
    const recordBytes = canonicalBytes(content.contentRecord);
    const recordTarget = generatedArtifactContentRecordPath(
      content.contentRecord.recordDigest,
    );
    if (
      classifyExactFile(
        join(rootPath, pointerTarget),
        pointerBytes,
        RECORD_MAX_BYTES,
      ) === "exact"
    ) {
      if (
        classifyExactFile(
          join(rootPath, recordTarget),
          recordBytes,
          RECORD_MAX_BYTES,
        ) !== "exact"
      ) {
        return invalid();
      }
      continue;
    }
    publishRecordTarget(
      rootPath,
      attemptPath,
      `${content.contentRecord.recordDigest}.content.json`,
      recordTarget,
      recordBytes,
      "content",
    );
    requireLiveRootLease(root, lease);
    publishRecordTarget(
      rootPath,
      attemptPath,
      `${content.contentDigest}.pointer.json`,
      pointerTarget,
      pointerBytes,
      "pointer",
    );
    requireLiveRootLease(root, lease);
  }

  // Phase 3：全部 provenance records（member 顺序）。
  for (const member of snapshot.members) {
    publishRecordTarget(
      rootPath,
      attemptPath,
      `${member.provenanceRecord.recordDigest}.provenance.json`,
      generatedArtifactProvenanceRecordPath(
        member.provenanceRecord.recordDigest,
      ),
      canonicalBytes(member.provenanceRecord),
      "provenance",
    );
    requireLiveRootLease(root, lease);
  }

  // Phase 4：set record。
  publishRecordTarget(
    rootPath,
    attemptPath,
    `${snapshot.setRecord.artifactSetDigest}.set.json`,
    generatedArtifactSetRecordPath(snapshot.setRecord.artifactSetDigest),
    canonicalBytes(snapshot.setRecord),
    "set",
  );
  requireLiveRootLease(root, lease);

  const result = deepFreeze({
    schemaVersion: 1,
    kind: "generated-set-hidden-cas-written-v1",
    generationId: plan.generationId,
    provider: plan.provider,
    publicationOperationId: plan.binding.operationId,
    publicationBindingDigest: plan.publicationBindingDigest,
    artifactSetDigest: plan.artifactSetDigest,
    publishingSequence: evidence.publishingSequence,
    publishingRecordDigest: evidence.publishingRecordDigest,
    hiddenPhase: "complete",
    uniqueContentCount: uniqueContents.length,
    orderedContentDigests: Object.freeze(
      uniqueContents.map(({ content }) => content.contentDigest),
    ),
    orderedContentRecordDigests: Object.freeze(
      uniqueContents.map(({ content }) => content.contentRecord.recordDigest),
    ),
    orderedProvenanceRecordDigests: Object.freeze(
      snapshot.members.map((member) => member.provenanceRecord.recordDigest),
    ),
    setRecordDigest: snapshot.setRecord.artifactSetDigest,
  }) as GeneratedSetHiddenCasEvidenceV1;
  hiddenCasAuthorities.set(result, {
    root,
    lease,
    plan,
    intentPath: provenance.intentPath,
    attemptPath: provenance.attemptPath,
  });
  return result;
}

/** Live publisher entry: preserves the original transition-evidence contract. */
export function writeGeneratedSetHiddenCas(
  evidenceInput: unknown,
  root: OpenedDataRoot,
  lease: DataRootWriterLease,
  intentInput: GenerationIntentV1,
  publicationPlanInput: unknown,
): GeneratedSetHiddenCasEvidenceV1 {
  const provenance = requireGeneratedSetPublishingTransitionProvenance(
    evidenceInput,
    root,
    lease,
  );
  if (provenance.plan !== publicationPlanInput ||
    typeof evidenceInput !== "object" || evidenceInput === null) return invalid();
  const plan = provenance.plan;
  const intent = requireGenerationIntent(intentInput);
  if (plan.generationId !== intent.generationId || plan.provider !== intent.provider) {
    return invalid();
  }
  requireLiveRootLease(root, lease);
  return writeHiddenCasCore(
    root,
    lease,
    intent,
    plan,
    evidenceInput as GeneratedSetPublishingTransitionEvidenceV1,
    provenance,
  );
}

interface StartupHiddenCasInspection {
  readonly evidence: GeneratedSetPublishingTransitionEvidenceV1;
  readonly provenance: GeneratedSetPublishingTransitionProvenanceV1;
  readonly snapshot: Uint8Array;
}

function startupAttemptPath(
  rootPath: string,
  operationId: string,
): string {
  const stagingPath = join(rootPath, "staging");
  const directory = opendirSync(stagingPath);
  const matches: string[] = [];
  try {
    while (true) {
      const entry = directory.readSync();
      if (entry === null) break;
      if (!entry.name.startsWith(`${operationId}-`)) continue;
      const token = entry.name.slice(operationId.length + 1);
      if (ATTEMPT_TOKEN_PATTERN.test(token)) matches.push(token);
      if (matches.length > 1) return invalid();
    }
  } catch {
    return invalid();
  } finally {
    directory.closeSync();
  }
  if (matches.length !== 1) return invalid();
  const path = join(rootPath, dataRootStagingPath(operationId, matches[0]!));
  const stat = lstatNoFollow(path);
  if (stat === null || !isExact0700Directory(stat)) return invalid();
  return path;
}

function startupSnapshot(
  rootPath: string,
  intent: GenerationIntentV1,
  plan: GeneratedSetPublicationPlanV1,
  head: GenerationStateRecordV1,
  attemptPath: string,
  storage: GeneratedSetStoragePreflightSnapshotV1,
  takeover: ReturnType<typeof requireGeneratedSetPublishingReceiptTakeover>,
): Uint8Array {
  const identity = (path: string): Record<string, string> | null => {
    const stat = lstatNoFollow(path);
    if (stat === null) return null;
    return {
      dev: stat.dev.toString(), ino: stat.ino.toString(), mode: stat.mode.toString(),
      size: stat.size.toString(), mtimeNs: stat.mtimeNs.toString(), ctimeNs: stat.ctimeNs.toString(),
    };
  };
  const names: { name: string; identity: Record<string, string> | null }[] = [];
  const directory = opendirSync(attemptPath);
  try {
    while (true) {
      const entry = directory.readSync();
      if (entry === null) break;
      names.push({ name: entry.name, identity: identity(join(attemptPath, entry.name)) });
      if (names.length > MAX_ATTEMPT_STAGED_ENTRIES) return invalid();
    }
  } finally {
    directory.closeSync();
  }
  names.sort((left, right) => left.name.localeCompare(right.name));
  return canonicalBytes({
    intent,
    binding: plan.binding,
    head,
    storage,
    takeover,
    receiptIntent: identity(join(rootPath, plan.receiptIntentPath)),
    receiptResult: identity(join(rootPath, plan.receiptResultPath)),
    catalog: identity(join(rootPath, plan.catalogPath)),
    attemptEntries: names,
  });
}

/**
 * Startup-specific durable revalidation.  It accepts no caller path, record
 * bytes, storage observation, capacity counter, descriptor, or output role:
 * all of those facts are re-derived from the current root before the common
 * writer can be reached.
 */
function inspectStartupHiddenCas(
  root: OpenedDataRoot,
  lease: DataRootWriterLease,
  intentInput: GenerationIntentV1,
  planInput: unknown,
): StartupHiddenCasInspection {
  const intent = requireGenerationIntent(intentInput);
  if (typeof planInput !== "object" || planInput === null) return invalid();
  const plan = planInput as GeneratedSetPublicationPlanV1;
  if (plan.generationId !== intent.generationId || plan.provider !== intent.provider) {
    return invalid();
  }
  requireLiveRootLease(root, lease);
  const rootPath = requireLiveOpenedDataRoot(root).absolutePath;
  const origin = requireGeneratedSetPublicationOriginForRoot(plan, root);
  const journal = new GenerationRecordJournal(root, lease, intent);
  const chain = journal.readValidatedChain();
  const head = chain[chain.length - 1];
  if (
    head === undefined ||
    head.state !== "publishing" ||
    head.payload.operationId !== plan.binding.operationId ||
    head.payload.artifactSetDigest !== plan.artifactSetDigest
  ) return invalid();
  // A resumed write requires the validated remote + candidate lineage that the
  // current-process plan was re-derived from; do not accept a bare publishing head.
  if (!chain.some((record) => record.state === "remote_bound") ||
    !chain.some((record) => record.state === "validating")) return invalid();
  const attemptPath = startupAttemptPath(rootPath, plan.binding.operationId);
  const intentPath = join(rootPath, plan.receiptIntentPath);
  requireExactLinkedIntent(
    join(attemptPath, "operation-intent.json"),
    intentPath,
    canonicalBytes(plan.binding),
  );
  requireAbsent(join(rootPath, plan.receiptResultPath));
  requireAbsent(join(rootPath, plan.catalogPath));
  const takeover = requireGeneratedSetPublishingReceiptTakeover(root, lease, intent, plan);
  const storage = inspectGeneratedSetStoragePreflight(root, origin.candidatePlan);
  requireGeneratedSetPlanSnapshotCrossCheck(plan, storage);
  requireAttemptStagingExact(rootPath, plan, storage, attemptPath);
  requireLiveRootLease(root, lease);
  const evidence = deepFreeze({
    schemaVersion: 1,
    kind: "generated-set-publishing-transitioned-v1",
    generationId: plan.generationId,
    provider: plan.provider,
    operationId: plan.binding.operationId,
    artifactSetDigest: plan.artifactSetDigest,
    publicationBindingDigest: plan.publicationBindingDigest,
    publishingSequence: head.sequence,
    publishingRecordDigest: generationStateRecordDigest(head),
  }) as GeneratedSetPublishingTransitionEvidenceV1;
  return {
    evidence,
    provenance: deepFreeze({ plan, intentPath, attemptPath }) as GeneratedSetPublishingTransitionProvenanceV1,
    snapshot: startupSnapshot(rootPath, intent, plan, head, attemptPath, storage, takeover),
  };
}

/** Phase-A startup authority mint; it performs no mutation. */
export function inspectGeneratedSetHiddenCasStartupResume(
  root: OpenedDataRoot,
  lease: DataRootWriterLease,
  intentInput: GenerationIntentV1,
  publicationPlanInput: unknown,
): GeneratedSetHiddenCasStartupResumeV1 {
  const intent = requireGenerationIntent(intentInput);
  const inspection = inspectStartupHiddenCas(root, lease, intent, publicationPlanInput);
  const plan = inspection.provenance.plan;
  const resume = deepFreeze({
    schemaVersion: 1,
    kind: "generated-set-hidden-cas-startup-resume-v1",
    generationId: plan.generationId,
    publicationOperationId: plan.binding.operationId,
    artifactSetDigest: plan.artifactSetDigest,
  }) as GeneratedSetHiddenCasStartupResumeV1;
  hiddenCasStartupAuthorities.set(resume, {
    root,
    lease,
    intent,
    plan,
    snapshot: inspection.snapshot,
    consumed: false,
  });
  return resume;
}

/**
 * Resume the sole hidden writer after Phase A.  Reinspection must be byte and
 * identity equal to the original startup authority, then the live writer's
 * exact core is reused to mint normal hidden evidence for visible commit.
 */
export function resumeGeneratedSetHiddenCasAtStartup(
  resume: GeneratedSetHiddenCasStartupResumeV1,
  root: OpenedDataRoot,
  lease: DataRootWriterLease,
  intentInput: GenerationIntentV1,
  publicationPlanInput: unknown,
): GeneratedSetHiddenCasEvidenceV1 {
  const authority = hiddenCasStartupAuthorities.get(resume);
  if (
    authority === undefined || authority.consumed || authority.root !== root ||
    authority.lease !== lease ||
    authority.plan !== publicationPlanInput
  ) return invalid();
  const currentIntent = requireGenerationIntent(intentInput);
  if (!sameCanonical(authority.intent, currentIntent)) return invalid();
  const inspection = inspectStartupHiddenCas(root, lease, intentInput, publicationPlanInput);
  if (!Buffer.from(inspection.snapshot).equals(Buffer.from(authority.snapshot))) return invalid();
  authority.consumed = true;
  return writeHiddenCasCore(
    root,
    lease,
    authority.intent,
    authority.plan,
    inspection.evidence,
    inspection.provenance,
  );
}

/**
 * Package-internal provenance：仅供同一 root/lease 上的下一个 catalog/result
 * commit slice 把 hidden CAS evidence 还原为 origin-checked plan 与 durable
 * attempt/staged 定位；mutation authority 不出现在 evidence body 中。
 */
export function requireGeneratedSetHiddenCasProvenance(
  evidenceInput: unknown,
  root: OpenedDataRoot,
  lease: DataRootWriterLease,
): GeneratedSetHiddenCasProvenanceV1 {
  if (typeof evidenceInput !== "object" || evidenceInput === null) {
    return invalid();
  }
  const authority = hiddenCasAuthorities.get(
    evidenceInput as GeneratedSetHiddenCasEvidenceV1,
  );
  if (
    authority === undefined ||
    authority.root !== root ||
    authority.lease !== lease ||
    requireLiveDataRootWriterLease(lease).root !== root
  ) {
    return invalid();
  }
  return deepFreeze({
    plan: authority.plan,
    intentPath: authority.intentPath,
    attemptPath: authority.attemptPath,
  }) as GeneratedSetHiddenCasProvenanceV1;
}
