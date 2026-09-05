import { lstatSync } from "node:fs";
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
import { calculateDataRootCapacity } from "./data-root-capacity";
import { inspectDataRootCapacity } from "./data-root-capacity-inspection";
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
  requireAdmittedGeneratedSetIntentProvenance,
  type AdmittedGeneratedSetIntentEvidenceV1,
} from "./generated-set-intent-writer";
import {
  revalidateGeneratedSetPublicationEligibility,
  type GeneratedSetPublicationEligibilityV1,
} from "./generated-set-publication-eligibility";
import type { GeneratedSetPublicationPlanV1 } from "./generated-artifact-publication";
import { readStableRegularFileSnapshot } from "./safe-filesystem";

/**
 * Package-internal、one-shot generated-set publishing transition。
 *
 * 消费上一一切片 durable 的 `AdmittedGeneratedSetIntentEvidenceV1`，先完整重跑
 * 只读 durable checks（eligibility exact revalidation、staged/receipt intent
 * inode/body、result/catalog 缺席、receipt inspection 与共享 capacity takeover
 * 算术），全部通过后在同一同步调用内 append 唯一的 Generation
 * `publishing={operationId,artifactSetDigest}` record/head。本切片到此为止：
 * 不写 public Artifact CAS/catalog/result、不做 startup recovery、不调用
 * package-root public `OperationJournal` facade。
 *
 * 任何失败都保留全部 durable 证据并 fail closed；record/witness/head 的
 * ordering、fsync 与 pending recovery 仍由 `GenerationRecordJournal` 独占。
 */

const RECORD_MAX_BYTES = 64 * 1024;
const ATTEMPT_TOKEN_PATTERN = /^[0-9a-f]{24}$/;

export interface GeneratedSetPublishingTransitionEvidenceV1 {
  readonly schemaVersion: 1;
  readonly kind: "generated-set-publishing-transitioned-v1";
  readonly generationId: `generation:sha256:${string}`;
  readonly provider: GenerationProviderV1;
  readonly operationId: string;
  readonly artifactSetDigest: string;
  readonly publicationBindingDigest: string;
  readonly publishingSequence: number;
  readonly publishingRecordDigest: string;
}

export interface GeneratedSetPublishingTransitionProvenanceV1 {
  readonly plan: GeneratedSetPublicationPlanV1;
  readonly intentPath: string;
  readonly attemptPath: string;
}

interface PublishingTransitionAuthority {
  readonly root: OpenedDataRoot;
  readonly lease: DataRootWriterLease;
  readonly plan: GeneratedSetPublicationPlanV1;
  readonly intentPath: string;
  readonly attemptPath: string;
}

const publishingTransitionAuthorities = new WeakMap<
  GeneratedSetPublishingTransitionEvidenceV1,
  PublishingTransitionAuthority
>();

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

/** staged 与 receipt 必须仍是同一 exact 0600 regular inode/body。 */
function requireExactLinkedIntent(
  stagedPath: string,
  receiptPath: string,
  bindingBytes: Uint8Array,
): void {
  for (const path of [stagedPath, receiptPath]) {
    let stat: ReturnType<typeof lstatSync>;
    try {
      stat = lstatSync(path, { bigint: true });
    } catch {
      return invalid();
    }
    if (
      (stat.mode & 0o170000n) !== 0o100000n ||
      (stat.mode & 0o777n) !== 0o600n ||
      stat.nlink < 2n
    ) {
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
 * 全部只读 durable prechecks：eligibility（含 full chain validating head、birth
 * anchor、candidate/storage binding）→ staged/receipt intent inode/body →
 * result/catalog 缺席 → receipt inspection → capacity takeover 算术。
 */
function runPublishingPrechecks(
  root: OpenedDataRoot,
  lease: DataRootWriterLease,
  intent: GenerationIntentV1,
  plan: GeneratedSetPublicationPlanV1,
  eligibility: GeneratedSetPublicationEligibilityV1,
  evidence: AdmittedGeneratedSetIntentEvidenceV1,
): void {
  const rootPath = requireLiveOpenedDataRoot(root).absolutePath;
  if (requireLiveDataRootWriterLease(lease).root !== root) return invalid();
  revalidateGeneratedSetPublicationEligibility(
    eligibility,
    root,
    lease,
    intent,
    plan,
  );
  if (
    evidence.generationId !== plan.generationId ||
    evidence.provider !== plan.provider ||
    evidence.operationId !== plan.binding.operationId ||
    evidence.artifactSetDigest !== plan.artifactSetDigest ||
    evidence.publicationBindingDigest !== plan.publicationBindingDigest
  ) {
    return invalid();
  }
  if (!ATTEMPT_TOKEN_PATTERN.test(evidence.attemptToken)) return invalid();
  const attemptPath = join(
    rootPath,
    dataRootStagingPath(plan.binding.operationId, evidence.attemptToken),
  );
  const stagedIntentPath = join(attemptPath, "operation-intent.json");
  const receiptIntentPath = join(rootPath, plan.receiptIntentPath);
  const receiptResultPath = join(rootPath, plan.receiptResultPath);
  const catalogPath = join(rootPath, plan.catalogPath);
  requireExactLinkedIntent(
    stagedIntentPath,
    receiptIntentPath,
    canonicalJsonBytes(plan.binding),
  );
  requireAbsent(receiptResultPath);
  requireAbsent(catalogPath);

  const inspection = inspectDataRootCapacity(root, lease);
  if (
    inspection.namespaceState !== "terminal-installed" ||
    inspection.internalOperationCount !== 2 ||
    inspection.publicOperationCount !== evidence.takeover.publicOperationCount ||
    inspection.usedReceiptEntries !== evidence.takeover.usedReceiptEntries ||
    inspection.pendingResultReservations !==
      evidence.takeover.pendingResultReservations
  ) {
    return invalid();
  }
  const capacity = calculateDataRootCapacity({
    usedReceiptEntries: inspection.usedReceiptEntries,
    pendingResultReservations: inspection.pendingResultReservations,
    namespaceState: inspection.namespaceState,
    generations: [
      { state: "validating", publicationEvidence: "matching-intent-no-result" },
    ],
    request: "none",
  });
  if (
    capacity.status !== "ready" ||
    capacity.generationPublicationReservations !== 0 ||
    capacity.requestedEntries !== 0 ||
    capacity.effectiveEntries !== evidence.takeover.effectiveEntries ||
    evidence.preWriteEffectiveEntries !== evidence.takeover.effectiveEntries
  ) {
    return invalid();
  }
}

/**
 * Startup uses this narrow, shared receipt-capacity half of the live
 * intent→publishing handoff.  It deliberately accepts no caller-supplied
 * counters: `inspectDataRootCapacity` and the canonical formula remain the
 * only authority for durable intent taking over the two reserved slots.
 */
export type GeneratedSetPublishingReceiptEvidenceV1 =
  | "matching-intent-no-result"
  | "matching-intent-result";

export function requireGeneratedSetPublishingReceiptTakeover(
  root: OpenedDataRoot,
  lease: DataRootWriterLease,
  intentInput: GenerationIntentV1,
  plan: GeneratedSetPublicationPlanV1,
  receiptEvidence: GeneratedSetPublishingReceiptEvidenceV1 =
    "matching-intent-no-result",
): Readonly<{
  receiptEvidence: GeneratedSetPublishingReceiptEvidenceV1;
  actualPublicationReceiptEntries: 1 | 2;
  namespaceState: "terminal-installed";
  internalOperationCount: number;
  publicOperationCount: number;
  usedReceiptEntries: number;
  pendingResultReservations: number;
  effectiveEntries: number;
}> {
  const intent = requireGenerationIntent(intentInput);
  if (
    requireLiveDataRootWriterLease(lease).root !== root ||
    plan.generationId !== intent.generationId ||
    plan.provider !== intent.provider
  ) return invalid();
  const inspection = inspectDataRootCapacity(root, lease);
  if (inspection.namespaceState !== "terminal-installed" || inspection.internalOperationCount !== 2) {
    return invalid();
  }
  const capacity = calculateDataRootCapacity({
    usedReceiptEntries: inspection.usedReceiptEntries,
    pendingResultReservations: inspection.pendingResultReservations,
    namespaceState: inspection.namespaceState,
    generations: [
      { state: "validating", publicationEvidence: receiptEvidence },
    ],
    request: "none",
  });
  if (
    capacity.status !== "ready" ||
    capacity.generationPublicationReservations !== 0 ||
    capacity.requestedEntries !== 0
  ) return invalid();
  return deepFreeze({
    receiptEvidence,
    actualPublicationReceiptEntries:
      receiptEvidence === "matching-intent-result" ? 2 : 1,
    namespaceState: inspection.namespaceState,
    internalOperationCount: inspection.internalOperationCount,
    publicOperationCount: inspection.publicOperationCount,
    usedReceiptEntries: inspection.usedReceiptEntries,
    pendingResultReservations: inspection.pendingResultReservations,
    effectiveEntries: capacity.effectiveEntries,
  });
}

/**
 * 唯一 live mutation 入口：prechecks 全部通过后，经既有
 * `GenerationRecordJournal.append()` 发布唯一 `publishing` record/head，并重读
 * durable head 证明它与返回 record exact 一致。伪造/复制/重放/cross-root/
 * cross-lease/cross-intent/cross-plan/cross-eligibility 的 admitted evidence 在
 * 任何 Generation mutation 之前失败。
 */
export function transitionGeneratedSetToPublishing(
  evidenceInput: unknown,
  root: OpenedDataRoot,
  lease: DataRootWriterLease,
  intentInput: GenerationIntentV1,
  publicationPlanInput: unknown,
  eligibilityInput: unknown,
  recordedAt: string,
): GeneratedSetPublishingTransitionEvidenceV1 {
  // origin 检查在任何 durable revalidation 之前：伪造 evidence、cross-root、
  // cross-lease、cross-plan 零 mutation 失败。
  const provenance = requireAdmittedGeneratedSetIntentProvenance(
    evidenceInput,
    root,
    lease,
  );
  if (provenance.plan !== publicationPlanInput) return invalid();
  const plan = provenance.plan;
  const intent = requireGenerationIntent(intentInput);
  if (typeof eligibilityInput !== "object" || eligibilityInput === null) {
    return invalid();
  }
  const eligibility = eligibilityInput as GeneratedSetPublicationEligibilityV1;

  runPublishingPrechecks(
    root,
    lease,
    intent,
    plan,
    eligibility,
    evidenceInput as AdmittedGeneratedSetIntentEvidenceV1,
  );

  const journal = new GenerationRecordJournal(root, lease, intent);
  const appended = journal.append(
    "publishing",
    {
      operationId: plan.binding.operationId,
      artifactSetDigest: plan.artifactSetDigest,
    },
    recordedAt,
  );
  const current = journal.readCurrent();
  if (
    current.state !== "publishing" ||
    generationStateRecordDigest(current) !== generationStateRecordDigest(appended)
  ) {
    return invalid();
  }
  const evidence = deepFreeze({
    schemaVersion: 1,
    kind: "generated-set-publishing-transitioned-v1",
    generationId: plan.generationId,
    provider: plan.provider,
    operationId: plan.binding.operationId,
    artifactSetDigest: plan.artifactSetDigest,
    publicationBindingDigest: plan.publicationBindingDigest,
    publishingSequence: current.sequence,
    publishingRecordDigest: generationStateRecordDigest(
      current as GenerationStateRecordV1,
    ),
  }) as GeneratedSetPublishingTransitionEvidenceV1;
  publishingTransitionAuthorities.set(evidence, {
    root,
    lease,
    plan,
    intentPath: provenance.intentPath,
    attemptPath: provenance.attemptPath,
  });
  return evidence;
}

/**
 * Package-internal provenance：仅供同一 root/lease 上的下一个 hidden CAS writer
 * 把 transition evidence 还原为 origin-checked plan 与 durable attempt/staged
 * 定位；mutation authority 不出现在 evidence body 中。
 */
export function requireGeneratedSetPublishingTransitionProvenance(
  evidenceInput: unknown,
  root: OpenedDataRoot,
  lease: DataRootWriterLease,
): GeneratedSetPublishingTransitionProvenanceV1 {
  if (typeof evidenceInput !== "object" || evidenceInput === null) {
    return invalid();
  }
  const authority = publishingTransitionAuthorities.get(
    evidenceInput as GeneratedSetPublishingTransitionEvidenceV1,
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
  }) as GeneratedSetPublishingTransitionProvenanceV1;
}
