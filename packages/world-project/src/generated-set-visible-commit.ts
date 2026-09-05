import { linkSync, lstatSync, type BigIntStats } from "node:fs";
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
  GenerationCodecError,
  requireGenerationIntent,
  type GenerationIntentV1,
  type GenerationProviderV1,
} from "./generation-contracts";
import {
  generationStateRecordDigest,
  type GenerationStateRecordV1,
  type VerifiedPayloadV1,
} from "./generation-state";
import { GenerationRecordJournal } from "./generation-record-journal";
import { inspectGeneratedSetStoragePreflight } from "./generated-set-storage-preflight";
import {
  generatedSetCatalogDigest,
  generatedSetPublicationBindingDigest,
  requireGeneratedSetPublicationBinding,
  requireGeneratedSetPublicationOriginForVisibleCommit,
  requireGeneratedSetPublicationResult,
  type GeneratedSetPublicationPlanV1,
} from "./generated-artifact-publication";
import {
  classifyExactFile,
  ensureParentDirectories,
  requireAttemptStagingExact,
  requireExactLinkedIntent,
  requireGeneratedSetHiddenCasProvenance,
  requireGeneratedSetPlanSnapshotCrossCheck,
  requireLinkedTargetExact,
  type GeneratedSetHiddenCasEvidenceV1,
  type GeneratedSetHiddenCasProvenanceV1,
} from "./generated-set-hidden-cas-writer";
import {
  readStableRegularFileSnapshot,
  syncDirectory,
  writeNewSyncedFile,
} from "./safe-filesystem";

/**
 * Package-internal、同步 generated-set visible commit facade。
 *
 * 消费 hidden CAS writer 铸造的 `GeneratedSetHiddenCasEvidenceV1` object identity，
 * 在同一 live Data Root/lease 与 exact intent/plan 下，先从 durable files 重建完整
 * published join（bytes CAS / content record / by-bytes pointer / provenance / set
 * 全部重读并交叉校验、receipt intent same-inode/body、Generation head 仍为 exact
 * `publishing`、catalog/result 状态按 crash 现场分类、attempt staging closed
 * grammar），随后按固定顺序做两次 no-replace hard-link 提交：
 *
 * 1. 在既有 admitted Operation attempt 内用确定性名 `catalog.json` staged 精确
 *    `plan.catalogBody`，fsync staged 文件与 attempt 目录后 no-replace hard-link
 *    到 `plan.catalogPath`，fsync `artifacts/catalog/`；EEXIST 只接受 exact
 *    canonical bytes 且 staged/final 同一 inode；
 * 2. 只有 catalog 已 durable（重新完成完整 published join）后才 staged
 *    `result.json`（精确 `plan.expectedResult`），fsync 后 no-replace hard-link
 *    到 `plan.receiptResultPath`，fsync `receipts/`；EEXIST 规则同上；
 * 3. 最终完整 join 通过后返回 deep-frozen 安全身份摘要，mutation/list/serve
 *    authority 只存在于 module-private WeakMap。
 *
 * 本切片到此为止：不 append Generation `verified`、不清理 attempt/staged、
 * 不做 startup recovery、不暴露 list/serve、不触碰 package-root public facade。
 * 任何失败都保留全部 durable 证据并 fail closed；catalog durable 而 result
 * absent 的现场由下一次 live 调用精确 resume（catalog 不变、只补 result）。
 */

const RECORD_MAX_BYTES = 64 * 1024;
const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const STAGED_CATALOG_NAME = "catalog.json";
const STAGED_RESULT_NAME = "result.json";
const CATALOG_PARENT = "artifacts/catalog";
const RECEIPTS_PARENT = "receipts";

export interface GeneratedSetVisibleCommitEvidenceV1 {
  readonly schemaVersion: 1;
  readonly kind: "generated-set-visible-commit-v1";
  readonly generationId: `generation:sha256:${string}`;
  readonly provider: GenerationProviderV1;
  readonly publicationOperationId: string;
  readonly publicationBindingDigest: string;
  readonly artifactSetDigest: string;
  readonly publishingSequence: number;
  readonly publishingRecordDigest: string;
  /** `plan.catalogDigest`：catalog 文件字节 digest（domain-separated）。 */
  readonly catalogDigest: string;
  /** 精确 `plan.expectedResult` canonical bytes 的 SHA-256。 */
  readonly resultDigest: string;
  readonly setRecordDigest: string;
  readonly orderedContentRecordDigests: readonly string[];
  readonly orderedProvenanceRecordDigests: readonly string[];
}

interface VisibleCommitAuthority {
  readonly root: OpenedDataRoot;
  readonly lease: DataRootWriterLease;
  readonly plan: GeneratedSetPublicationPlanV1;
  readonly intent: GenerationIntentV1;
  readonly originIntent: GenerationIntentV1;
  readonly intentPath: string;
  readonly attemptPath: string;
  readonly catalogPath: string;
  readonly resultPath: string;
  readonly catalogIdentity: { readonly dev: bigint; readonly ino: bigint };
  readonly resultIdentity: { readonly dev: bigint; readonly ino: bigint };
  readonly catalogDigest: string;
  readonly resultDigest: string;
  readonly hiddenEvidence: GeneratedSetHiddenCasEvidenceV1;
}

const visibleCommitAuthorities = new WeakMap<
  GeneratedSetVisibleCommitEvidenceV1,
  VisibleCommitAuthority
>();

interface VisibleJoinExpectationsV1 {
  readonly catalogStatus: "absent" | "exact";
  readonly resultStatus: "absent" | "exact";
  readonly extraStaged: ReadonlyMap<string, Uint8Array>;
  readonly generationHead: VisibleGenerationHeadExpectationV1;
}

export type VisibleGenerationHeadExpectationV1 =
  | {
      readonly state: "publishing";
      readonly sequence: number;
      readonly recordDigest: string;
    }
  | {
      readonly state: "verified";
      readonly sequence: number;
      readonly recordDigest: string;
      readonly payload: VerifiedPayloadV1;
    };

export interface GeneratedSetVisibleCommitRevalidationV1 {
  readonly plan: GeneratedSetPublicationPlanV1;
  readonly intent: GenerationIntentV1;
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
    const stat = lstatNoFollow(path);
    if (stat !== null) return invalid();
  } catch {
    return invalid();
  }
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

function requireLiveRootLease(
  root: OpenedDataRoot,
  lease: DataRootWriterLease,
): void {
  requireLiveOpenedDataRoot(root);
  if (requireLiveDataRootWriterLease(lease).root !== root) return invalid();
}

// ---- 只供同目录 focused durability tests 注入 fault，不进入 package root ----

export type GeneratedSetVisibleCommitStage =
  | "after-catalog-staged-write"
  | "after-catalog-attempt-fsync"
  | "after-catalog-link"
  | "after-catalog-dir-fsync"
  | "after-result-staged-write"
  | "after-result-attempt-fsync"
  | "after-result-link"
  | "after-receipts-fsync";

type StageHook = (stage: GeneratedSetVisibleCommitStage) => void;

const stageHooks = new Map<GeneratedSetVisibleCommitStage, StageHook>();

export const GENERATED_SET_VISIBLE_COMMIT_TEST_SEAMS = Object.freeze({
  replaceStageHook(
    stage: GeneratedSetVisibleCommitStage,
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

function runStageHook(stage: GeneratedSetVisibleCommitStage): void {
  const hook = stageHooks.get(stage);
  if (hook !== undefined) hook(stage);
}

interface VisibleTargetHooksV1 {
  readonly stagedWrite: GeneratedSetVisibleCommitStage;
  readonly attemptFsync: GeneratedSetVisibleCommitStage;
  readonly link: GeneratedSetVisibleCommitStage;
  readonly dirFsync: GeneratedSetVisibleCommitStage;
}

const CATALOG_HOOKS: VisibleTargetHooksV1 = Object.freeze({
  stagedWrite: "after-catalog-staged-write",
  attemptFsync: "after-catalog-attempt-fsync",
  link: "after-catalog-link",
  dirFsync: "after-catalog-dir-fsync",
});

const RESULT_HOOKS: VisibleTargetHooksV1 = Object.freeze({
  stagedWrite: "after-result-staged-write",
  attemptFsync: "after-result-attempt-fsync",
  link: "after-result-link",
  dirFsync: "after-receipts-fsync",
});

/**
 * Catalog/result 的 exact publication：deterministic staged 名写在已 admit 的
 * Operation attempt 内（新 0600 regular 写后 fsync 文件 + fsync attempt 目录，
 * 已有 staged 只接受 exact bytes 并补 fsync attempt），no-replace hard-link 到
 * final；EEXIST 只接受 exact canonical bytes 且 staged/final 同一 inode，否则
 * recovery-required。随后 fsync final parent（catalog 目录 / receipts）并重开
 * 验证 staged/final same inode、nlink ≥ 2、bytes exact。
 */
function publishVisibleTarget(
  rootPath: string,
  attemptPath: string,
  stagedName: string,
  finalPath: string,
  expectedBytes: Uint8Array,
  relativeParent: string,
  hooks: VisibleTargetHooksV1,
): void {
  const stagedPath = join(attemptPath, stagedName);
  const stagedStat = lstatNoFollow(stagedPath);
  if (stagedStat === null) {
    try {
      writeNewSyncedFile(stagedPath, expectedBytes);
    } catch {
      return invalid();
    }
    runStageHook(hooks.stagedWrite);
    syncDirectory(attemptPath);
    runStageHook(hooks.attemptFsync);
  } else {
    if (!isExact0600Regular(stagedStat)) return invalid();
    let stagedBytes: Uint8Array;
    try {
      stagedBytes = readStableRegularFileSnapshot(stagedPath, RECORD_MAX_BYTES).bytes;
    } catch {
      return invalid();
    }
    if (!Buffer.from(stagedBytes).equals(Buffer.from(expectedBytes))) {
      return invalid();
    }
    syncDirectory(attemptPath);
  }
  try {
    linkSync(stagedPath, finalPath);
  } catch (error) {
    if (syscallCode(error) !== "EEXIST") return invalid();
    requireLinkedTargetExact(finalPath, stagedPath, expectedBytes);
  }
  runStageHook(hooks.link);
  syncDirectory(join(rootPath, relativeParent));
  runStageHook(hooks.dirFsync);
  requireLinkedTargetExact(finalPath, stagedPath, expectedBytes);
}

/**
 * 完整 published join：全部只读 durable revalidation。不信任 caller 提供的
 * descriptor/member 列表；hidden evidence 与 plan 只用于定位 expected truth，
 * 所有文件都以 no-follow 稳定快照重读并重跑 cross-record checks。
 */
function runVisibleJoin(
  root: OpenedDataRoot,
  lease: DataRootWriterLease,
  plan: GeneratedSetPublicationPlanV1,
  intent: GenerationIntentV1,
  evidence: GeneratedSetHiddenCasEvidenceV1,
  provenance: GeneratedSetHiddenCasProvenanceV1,
  expectations: VisibleJoinExpectationsV1,
): void {
  const rootPath = requireLiveOpenedDataRoot(root).absolutePath;
  requireLiveRootLease(root, lease);

  // hidden evidence ↔ plan 身份（零信任 caller body）。
  if (
    evidence.generationId !== plan.generationId ||
    evidence.provider !== plan.provider ||
    evidence.publicationOperationId !== plan.binding.operationId ||
    evidence.publicationBindingDigest !== plan.publicationBindingDigest ||
    evidence.artifactSetDigest !== plan.artifactSetDigest ||
    evidence.hiddenPhase !== "complete" ||
    !Number.isSafeInteger(evidence.publishingSequence) ||
    evidence.publishingSequence < 0 ||
    typeof evidence.publishingRecordDigest !== "string" ||
    !SHA256_PATTERN.test(evidence.publishingRecordDigest) ||
    evidence.uniqueContentCount !== evidence.orderedContentRecordDigests.length
  ) {
    return invalid();
  }

  // plan origin（post-write 变体）与 candidate plan origin。
  const originEvidence = requireGeneratedSetPublicationOriginForVisibleCommit(plan, root);

  // plan 自洽 re-derivation：binding/operation id/binding digest/catalog body/
  // catalog digest/result 全部从 binding 与 set 身份重算。
  const binding = requireGeneratedSetPublicationBinding(plan.binding);
  if (
    generatedSetPublicationBindingDigest(binding) !== plan.publicationBindingDigest ||
    !sameCanonical(plan.catalogBody, {
      generationId: plan.generationId,
      artifactSetDigest: plan.artifactSetDigest,
      publicationOperationId: binding.operationId,
      publicationBindingDigest: plan.publicationBindingDigest,
    }) ||
    generatedSetCatalogDigest(plan.catalogBody) !== plan.catalogDigest
  ) {
    return invalid();
  }
  requireGeneratedSetPublicationResult(plan.expectedResult, binding);

  // Generation chain 当前 head 必须 exact 等于调用方指定的已证明身份。
  const journal = new GenerationRecordJournal(root, lease, intent);
  const current = journal.readCurrent();
  if (
    current.state !== expectations.generationHead.state ||
    current.sequence !== expectations.generationHead.sequence ||
    generationStateRecordDigest(current as GenerationStateRecordV1) !==
      expectations.generationHead.recordDigest ||
    (expectations.generationHead.state === "verified" &&
      !sameCanonical(current.payload, expectations.generationHead.payload))
  ) {
    return invalid();
  }

  // receipt intent 仍为 staged/receipt same inode、exact canonical binding bytes。
  requireExactLinkedIntent(
    join(provenance.attemptPath, "operation-intent.json"),
    provenance.intentPath,
    canonicalBytes(plan.binding),
  );

  // catalog/result 状态按预期分类；exact 还要求 staged/final 同一 inode。
  const catalogBytes = canonicalBytes(plan.catalogBody);
  const resultBytes = canonicalBytes(plan.expectedResult);
  const catalogFinalPath = join(rootPath, plan.catalogPath);
  const resultFinalPath = join(rootPath, plan.receiptResultPath);
  const stagedCatalogPath = join(provenance.attemptPath, STAGED_CATALOG_NAME);
  const stagedResultPath = join(provenance.attemptPath, STAGED_RESULT_NAME);
  if (expectations.catalogStatus === "absent") {
    requireAbsent(catalogFinalPath);
  } else {
    if (classifyExactFile(catalogFinalPath, catalogBytes, RECORD_MAX_BYTES) !== "exact") {
      return invalid();
    }
    requireLinkedTargetExact(catalogFinalPath, stagedCatalogPath, catalogBytes);
  }
  if (expectations.resultStatus === "absent") {
    requireAbsent(resultFinalPath);
  } else {
    if (classifyExactFile(resultFinalPath, resultBytes, RECORD_MAX_BYTES) !== "exact") {
      return invalid();
    }
    requireLinkedTargetExact(resultFinalPath, stagedResultPath, resultBytes);
  }

  // 从 durable files 重建 storage join；hidden targets 必须全部 exact existing。
  const snapshot = inspectGeneratedSetStoragePreflight(root, originEvidence.candidatePlan);
  for (const content of snapshot.content) {
    if (
      content.bytesCas.status.kind !== "existing" ||
      content.contentRecordTarget.status.kind !== "existing" ||
      content.byBytesPointerTarget.status.kind !== "existing"
    ) {
      return invalid();
    }
    if (
      content.byBytesPointer.contentDigest !== content.contentDigest ||
      content.byBytesPointer.contentRecordDigest !== content.contentRecord.recordDigest ||
      content.byBytesPointer.assetId !== content.contentRecord.assetId
    ) {
      return invalid();
    }
  }
  for (const member of snapshot.members) {
    if (member.provenanceTarget.status.kind !== "existing") return invalid();
    if (
      member.provenanceRecord.outputRole !== member.outputRole ||
      member.provenanceRecord.generationId !== snapshot.generationId ||
      member.provenanceRecord.provider !== snapshot.provider ||
      member.provenanceRecord.contentRecordDigest !==
        snapshot.content[member.contentObservationIndex]!.contentRecord.recordDigest
    ) {
      return invalid();
    }
  }
  if (snapshot.setTarget.status.kind !== "existing") return invalid();

  // cross-record join：plan ↔ snapshot、evidence ↔ snapshot。
  requireGeneratedSetPlanSnapshotCrossCheck(plan, snapshot);
  if (
    snapshot.setRecord.artifactSetDigest !== evidence.setRecordDigest ||
    snapshot.content.length !== evidence.orderedContentRecordDigests.length ||
    snapshot.members.length !== evidence.orderedProvenanceRecordDigests.length ||
    !sameCanonical(
      snapshot.content.map((content) => content.contentDigest),
      evidence.orderedContentDigests,
    ) ||
    !sameCanonical(
      snapshot.content.map((content) => content.contentRecord.recordDigest),
      evidence.orderedContentRecordDigests,
    ) ||
    !sameCanonical(
      snapshot.members.map((member) => member.provenanceRecord.recordDigest),
      evidence.orderedProvenanceRecordDigests,
    )
  ) {
    return invalid();
  }

  // attempt staging closed grammar：durable intent + hidden staged + 本协议 extras。
  requireAttemptStagingExact(
    rootPath,
    plan,
    snapshot,
    provenance.attemptPath,
    expectations.extraStaged,
  );
}

function publishingHeadExpectation(
  evidence: GeneratedSetHiddenCasEvidenceV1,
): VisibleGenerationHeadExpectationV1 {
  return {
    state: "publishing",
    sequence: evidence.publishingSequence,
    recordDigest: evidence.publishingRecordDigest,
  };
}

/**
 * 唯一 live mutation 入口：要求与 hidden CAS writer 相同的 live
 * `OpenedDataRoot`/`DataRootWriterLease`、exact intent/plan 与 origin-valid
 * `GeneratedSetHiddenCasEvidenceV1` object identity。全部只读 published join
 * 通过后按固定顺序提交 catalog → Operation result；伪造/复制/cross-root/
 * cross-lease/cross-intent/cross-plan/stale publishing head 或任何 durable
 * drift 在第一个 catalog/result mutation 前 fail closed。
 *
 * Crash 语义：catalog/result 均 absent → 全新发布；catalog exact 且 result
 * absent → 精确 resume（catalog 不变，只补 result）；两者 exact → 只读 replay
 * 后重新铸造 evidence；result exact 而 catalog absent → recovery-required。
 */
export function commitGeneratedSetVisible(
  evidenceInput: unknown,
  root: OpenedDataRoot,
  lease: DataRootWriterLease,
  intentInput: GenerationIntentV1,
  publicationPlanInput: unknown,
): GeneratedSetVisibleCommitEvidenceV1 {
  // origin 检查在任何 durable revalidation 之前：伪造 evidence、cross-root、
  // cross-lease、cross-plan 零 mutation 失败。
  const provenance = requireGeneratedSetHiddenCasProvenance(
    evidenceInput,
    root,
    lease,
  );
  if (provenance.plan !== publicationPlanInput) return invalid();
  const plan = provenance.plan;
  if (typeof evidenceInput !== "object" || evidenceInput === null) {
    return invalid();
  }
  const evidence = evidenceInput as GeneratedSetHiddenCasEvidenceV1;
  const intent = requireGenerationIntent(intentInput);
  if (
    plan.generationId !== intent.generationId ||
    plan.provider !== intent.provider
  ) {
    return invalid();
  }
  requireLiveRootLease(root, lease);

  const rootPath = requireLiveOpenedDataRoot(root).absolutePath;
  const catalogBytes = canonicalBytes(plan.catalogBody);
  const resultBytes = canonicalBytes(plan.expectedResult);
  const catalogFinalPath = join(rootPath, plan.catalogPath);
  const resultFinalPath = join(rootPath, plan.receiptResultPath);
  const stagedCatalogPath = join(provenance.attemptPath, STAGED_CATALOG_NAME);
  const stagedResultPath = join(provenance.attemptPath, STAGED_RESULT_NAME);

  // Crash 现场分类：result 不得先于 catalog；result staged 证据不得出现在
  // durable catalog 之前。
  const catalogStatus = classifyExactFile(catalogFinalPath, catalogBytes, RECORD_MAX_BYTES);
  const resultStatus = classifyExactFile(resultFinalPath, resultBytes, RECORD_MAX_BYTES);
  if (catalogStatus === "absent" && resultStatus === "exact") return invalid();
  if (
    catalogStatus === "absent" &&
    lstatNoFollow(stagedResultPath) !== null
  ) {
    return invalid();
  }

  const currentStagedExtras = (): Map<string, Uint8Array> => {
    const extras = new Map<string, Uint8Array>();
    if (lstatNoFollow(stagedCatalogPath) !== null) {
      extras.set(STAGED_CATALOG_NAME, catalogBytes);
    }
    if (lstatNoFollow(stagedResultPath) !== null) {
      extras.set(STAGED_RESULT_NAME, resultBytes);
    }
    return extras;
  };

  // Join 1：任何 catalog/result mutation 之前的完整 published join。
  runVisibleJoin(root, lease, plan, intent, evidence, provenance, {
    catalogStatus,
    resultStatus,
    extraStaged: currentStagedExtras(),
    generationHead: publishingHeadExpectation(evidence),
  });

  if (catalogStatus === "absent") {
    ensureParentDirectories(rootPath, CATALOG_PARENT);
    publishVisibleTarget(
      rootPath,
      provenance.attemptPath,
      STAGED_CATALOG_NAME,
      catalogFinalPath,
      catalogBytes,
      CATALOG_PARENT,
      CATALOG_HOOKS,
    );
    requireLiveRootLease(root, lease);
    // Join 2：catalog durable 后、result mutation 前再次完整证明。
    runVisibleJoin(root, lease, plan, intent, evidence, provenance, {
      catalogStatus: "exact",
      resultStatus: "absent",
      extraStaged: currentStagedExtras(),
      generationHead: publishingHeadExpectation(evidence),
    });
  } else {
    // Resume：catalog 已 durable（exact + same inode 已在 Join 1 证明），补完
    // catalog 目录 fsync（可能崩溃于 link 与 dir-fsync 之间）。
    syncDirectory(join(rootPath, CATALOG_PARENT));
  }

  if (resultStatus === "absent") {
    publishVisibleTarget(
      rootPath,
      provenance.attemptPath,
      STAGED_RESULT_NAME,
      resultFinalPath,
      resultBytes,
      RECEIPTS_PARENT,
      RESULT_HOOKS,
    );
    requireLiveRootLease(root, lease);
  } else {
    // Replay：result 已 durable，补完 receipts fsync（可能崩溃于 link 与 fsync 之间）。
    syncDirectory(join(rootPath, RECEIPTS_PARENT));
  }

  // Join 3：最终完整 join（catalog 与 result 都必须 exact + same inode）。
  runVisibleJoin(root, lease, plan, intent, evidence, provenance, {
    catalogStatus: "exact",
    resultStatus: "exact",
    extraStaged: currentStagedExtras(),
    generationHead: publishingHeadExpectation(evidence),
  });

  const resultDigest = sha256Hex(Buffer.from(resultBytes));
  const resultEvidence = deepFreeze({
    schemaVersion: 1,
    kind: "generated-set-visible-commit-v1",
    generationId: plan.generationId,
    provider: plan.provider,
    publicationOperationId: plan.binding.operationId,
    publicationBindingDigest: plan.publicationBindingDigest,
    artifactSetDigest: plan.artifactSetDigest,
    publishingSequence: evidence.publishingSequence,
    publishingRecordDigest: evidence.publishingRecordDigest,
    catalogDigest: plan.catalogDigest,
    resultDigest,
    setRecordDigest: evidence.setRecordDigest,
    orderedContentRecordDigests: Object.freeze([
      ...evidence.orderedContentRecordDigests,
    ]),
    orderedProvenanceRecordDigests: Object.freeze([
      ...evidence.orderedProvenanceRecordDigests,
    ]),
  }) as GeneratedSetVisibleCommitEvidenceV1;

  const catalogStat = lstatNoFollow(catalogFinalPath);
  const resultStat = lstatNoFollow(resultFinalPath);
  if (
    catalogStat === null ||
    resultStat === null ||
    !isExact0600Regular(catalogStat) ||
    !isExact0600Regular(resultStat)
  ) {
    return invalid();
  }
  visibleCommitAuthorities.set(resultEvidence, {
    root,
    lease,
    plan,
    intent,
    originIntent: intentInput,
    intentPath: provenance.intentPath,
    attemptPath: provenance.attemptPath,
    catalogPath: plan.catalogPath,
    resultPath: plan.receiptResultPath,
    catalogIdentity: { dev: catalogStat.dev, ino: catalogStat.ino },
    resultIdentity: { dev: resultStat.dev, ino: resultStat.ino },
    catalogDigest: plan.catalogDigest,
    resultDigest,
    hiddenEvidence: evidence,
  });
  return resultEvidence;
}

/**
 * Narrow package-internal visible-evidence revalidator. It accepts only the
 * original in-process visible evidence object, replays the complete durable
 * published join, and returns no path, root, lease, writer, or list authority.
 */
export function revalidateGeneratedSetVisibleCommitEvidence(
  evidenceInput: unknown,
  root: OpenedDataRoot,
  lease: DataRootWriterLease,
  intentInput: GenerationIntentV1,
  publicationPlanInput: unknown,
  generationHead: VisibleGenerationHeadExpectationV1,
): GeneratedSetVisibleCommitRevalidationV1 {
  if (typeof evidenceInput !== "object" || evidenceInput === null) return invalid();
  const evidence = evidenceInput as GeneratedSetVisibleCommitEvidenceV1;
  const authority = visibleCommitAuthorities.get(evidence);
  if (
    authority === undefined ||
    authority.root !== root ||
    authority.lease !== lease ||
    authority.originIntent !== intentInput ||
    authority.plan !== publicationPlanInput
  ) {
    return invalid();
  }
  requireLiveRootLease(root, lease);
  requireGenerationIntent(intentInput);
  const catalogPath = join(requireLiveOpenedDataRoot(root).absolutePath, authority.catalogPath);
  const resultPath = join(requireLiveOpenedDataRoot(root).absolutePath, authority.resultPath);
  runVisibleJoin(root, lease, authority.plan, authority.intent, authority.hiddenEvidence, {
    plan: authority.plan,
    intentPath: authority.intentPath,
    attemptPath: authority.attemptPath,
  }, {
    catalogStatus: "exact",
    resultStatus: "exact",
    extraStaged: new Map([
      [STAGED_CATALOG_NAME, canonicalBytes(authority.plan.catalogBody)],
      [STAGED_RESULT_NAME, canonicalBytes(authority.plan.expectedResult)],
    ]),
    generationHead,
  });
  const catalogStat = lstatNoFollow(catalogPath);
  const resultStat = lstatNoFollow(resultPath);
  if (
    catalogStat === null || resultStat === null ||
    catalogStat.dev !== authority.catalogIdentity.dev ||
    catalogStat.ino !== authority.catalogIdentity.ino ||
    resultStat.dev !== authority.resultIdentity.dev ||
    resultStat.ino !== authority.resultIdentity.ino
  ) {
    return invalid();
  }
  return deepFreeze({ plan: authority.plan, intent: authority.intent }) as
    GeneratedSetVisibleCommitRevalidationV1;
}

/** 只验证 in-process origin identity；不读路径、不返回 durable capability。 */
export function requireGeneratedSetVisibleCommitOrigin(
  evidenceInput: unknown,
  root: OpenedDataRoot,
  lease: DataRootWriterLease,
  intentInput: GenerationIntentV1,
  publicationPlanInput: unknown,
): GeneratedSetVisibleCommitRevalidationV1 {
  if (typeof evidenceInput !== "object" || evidenceInput === null) return invalid();
  const authority = visibleCommitAuthorities.get(
    evidenceInput as GeneratedSetVisibleCommitEvidenceV1,
  );
  if (
    authority === undefined ||
    authority.root !== root ||
    authority.lease !== lease ||
    authority.originIntent !== intentInput ||
    authority.plan !== publicationPlanInput
  ) {
    return invalid();
  }
  requireLiveRootLease(root, lease);
  return deepFreeze({ plan: authority.plan, intent: authority.intent }) as
    GeneratedSetVisibleCommitRevalidationV1;
}
