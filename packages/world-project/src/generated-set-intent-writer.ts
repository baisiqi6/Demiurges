import { linkSync, lstatSync, mkdirSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { join } from "node:path";

import { canonicalJsonBytes, deepFreeze } from "@demiurges/world";

import {
  dataRootReceiptIntentPath,
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
  consumeGeneratedSetAdmissionCapability,
  type GeneratedSetAdmissionCapabilityV1,
} from "./generated-set-admission";
import type {
  GeneratedSetPublicationPlanV1,
} from "./generated-artifact-publication";
import {
  readStableRegularFileSnapshot,
  syncDirectory,
  writeNewSyncedFile,
  type StableRegularFileSnapshotIdentity,
} from "./safe-filesystem";

/**
 * Package-internal、one-shot generated-set durable intent writer。
 *
 * 消费上一切片铸造的 `GeneratedSetAdmissionCapability`（consume 内部已重跑完整
 * preflight 并要求与 authorize 时 exact 一致的 capacity snapshot），然后在同一
 * 同步调用、无任何 `await` 间隙内，沿用既有 Data Root flat Operation attempt
 * grammar 发布唯一的 internal `artifact.publish-generated-set` intent receipt：
 *
 * 1. `staging/<operationId>-<24 位 lowercase hex attemptToken>/` mkdir 0700 并
 *    fsync `staging/`；
 * 2. exact canonical binding bytes 写入 `operation-intent.json`（新 0600 regular
 *    file，写后 fsync 文件），再 fsync attempt 目录；
 * 3. no-replace hard-link 同一 inode 为 plan-derived receipt intent 路径，再
 *    fsync `receipts/`；
 * 4. 以 stable read 证明 staged 与 receipt 仍是同一 exact 0600 regular inode、
 *    body byte-equal，且 root/lease 未漂移；
 * 5. 重跑 durable receipt inspection 与共享 capacity 计算，证明原
 *    generation 2-slot publication reservation 已被 actual intent `1` +
 *    pending result reservation `1` exact 接管。
 *
 * 任何失败（fault、EEXIST、same-bytes replacement inode、mode/body/identity
 * drift、capacity mismatch、lease drift）都保留全部现场证据并 fail closed：不
 * unlink、不 overwrite、不猜测 cleanup。本模块不追加 Generation `publishing`
 * state、不写 public CAS/catalog/result、不调用 package-root public
 * `OperationJournal` facade、不做 startup recovery。
 */

const RECORD_MAX_BYTES = 64 * 1024;
const ATTEMPT_TOKEN_PATTERN = /^[0-9a-f]{24}$/;

export interface GeneratedSetIntentTakeoverProofV1 {
  readonly status: "ready";
  readonly namespaceState: "terminal-installed";
  readonly publicOperationCount: number;
  readonly internalOperationCount: 2;
  readonly usedReceiptEntries: number;
  readonly pendingResultReservations: number;
  readonly generationPublicationReservations: 0;
  readonly requestedEntries: 0;
  readonly effectiveEntries: number;
  readonly generationClassification: {
    readonly state: "validating";
    readonly publicationEvidence: "matching-intent-no-result";
  };
}

export interface AdmittedGeneratedSetIntentEvidenceV1 {
  readonly schemaVersion: 1;
  readonly kind: "generated-set-publication-intent-admitted-v1";
  readonly generationId: `generation:sha256:${string}`;
  readonly provider: GenerationProviderV1;
  readonly artifactSetDigest: string;
  readonly operationId: string;
  readonly publicationBindingDigest: string;
  readonly attemptToken: string;
  readonly preWriteEffectiveEntries: number;
  readonly takeover: GeneratedSetIntentTakeoverProofV1;
}

export interface AdmittedGeneratedSetIntentProvenanceV1 {
  readonly plan: GeneratedSetPublicationPlanV1;
  readonly intentPath: string;
  readonly attemptPath: string;
}

interface IntentWriterAuthority {
  readonly root: OpenedDataRoot;
  readonly lease: DataRootWriterLease;
  readonly plan: GeneratedSetPublicationPlanV1;
  readonly intentPath: string;
  readonly attemptPath: string;
}

const intentWriterAuthorities = new WeakMap<
  AdmittedGeneratedSetIntentEvidenceV1,
  IntentWriterAuthority
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

function sameIdentity(
  left: StableRegularFileSnapshotIdentity,
  right: StableRegularFileSnapshotIdentity,
): boolean {
  return (
    left.dev === right.dev &&
    left.ino === right.ino &&
    left.mode === right.mode &&
    left.uid === right.uid &&
    left.gid === right.gid &&
    left.size === right.size &&
    left.mtimeNs === right.mtimeNs &&
    left.ctimeNs === right.ctimeNs
  );
}

// ---- 只供同目录 focused durability tests 注入 fault/drift，不进入 package root ----

export type GeneratedSetIntentWriterStage =
  | "after-attempt-mkdir"
  | "after-staging-dir-fsync"
  | "after-staged-intent-write"
  | "after-attempt-dir-fsync"
  | "after-hard-link"
  | "after-receipts-dir-fsync"
  | "before-takeover-inspection";

type StageHook = () => void;

const stageHooks = new Map<GeneratedSetIntentWriterStage, StageHook>();

export const GENERATED_SET_INTENT_WRITER_TEST_SEAMS = Object.freeze({
  replaceStageHook(
    stage: GeneratedSetIntentWriterStage,
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

function runStageHook(stage: GeneratedSetIntentWriterStage): void {
  const hook = stageHooks.get(stage);
  if (hook !== undefined) hook();
}

function syncStageDirectory(
  path: string,
  stage: GeneratedSetIntentWriterStage,
): void {
  try {
    syncDirectory(path);
  } catch {
    return invalid();
  }
  runStageHook(stage);
}

/**
 * 唯一 live mutation 入口：要求与 admission 相同的 live `OpenedDataRoot` 与
 * `DataRootWriterLease`、exact intent/plan/eligibility 输入，以及 origin-valid、
 * 尚未消费的 `GeneratedSetAdmissionCapability`。capability 在任何 filesystem
 * mutation 之前被 one-shot 消费；伪造/复制/重放/cross-root/cross-lease/
 * cross-plan/cross-eligibility 输入零 mutation 即失败，原 capability 不被错误
 * 输入消耗。
 */
export function writeGeneratedSetPublicationIntent(
  capabilityInput: unknown,
  root: OpenedDataRoot,
  lease: DataRootWriterLease,
  intentInput: GenerationIntentV1,
  publicationPlanInput: unknown,
  eligibilityInput: unknown,
): AdmittedGeneratedSetIntentEvidenceV1 {
  if (typeof capabilityInput !== "object" || capabilityInput === null) {
    return invalid();
  }
  const capability = capabilityInput as GeneratedSetAdmissionCapabilityV1;
  if (
    capability.kind !== "generated-set-admission-capability-v1" ||
    !Number.isSafeInteger(capability.effectiveEntries)
  ) {
    return invalid();
  }
  const intent = requireGenerationIntent(intentInput);

  // One-shot consume：内部已重验 root/lease/plan/eligibility origin、durable
  // receipt inspection 与 authorize 时 exact 一致的 capacity snapshot。
  const plan = consumeGeneratedSetAdmissionCapability(
    capability,
    root,
    lease,
    intent,
    publicationPlanInput,
    eligibilityInput,
  );

  // consume 成功即证明当前磁盘状态与 authorize snapshot exact 一致；这里读取的
  // pre-write inspection 就是被授权的 exact pre-write snapshot。
  const preInspection = inspectDataRootCapacity(root, lease);
  if (
    preInspection.namespaceState !== "terminal-installed" ||
    preInspection.internalOperationCount !== 1
  ) {
    return invalid();
  }
  const rootPath = requireLiveOpenedDataRoot(root).absolutePath;
  if (requireLiveDataRootWriterLease(lease).root !== root) return invalid();
  const intentPath = join(rootPath, plan.receiptIntentPath);
  const resultPath = join(rootPath, plan.receiptResultPath);
  const catalogPath = join(rootPath, plan.catalogPath);
  requireAbsent(intentPath);
  requireAbsent(resultPath);
  requireAbsent(catalogPath);
  const preCapacity = calculateDataRootCapacity({
    usedReceiptEntries: preInspection.usedReceiptEntries,
    pendingResultReservations: preInspection.pendingResultReservations,
    namespaceState: preInspection.namespaceState,
    generations: [{ state: "validating", publicationEvidence: "none" }],
    request: "none",
  });
  if (
    !preCapacity.canAdmit ||
    preCapacity.effectiveEntries !== capability.effectiveEntries
  ) {
    return invalid();
  }

  // 从这里开始是 durable mutation；任何失败保留证据并 fail closed。
  const bindingBytes = canonicalJsonBytes(plan.binding);
  const attemptToken = randomBytes(12).toString("hex");
  if (!ATTEMPT_TOKEN_PATTERN.test(attemptToken)) return invalid();
  const attemptPath = join(
    rootPath,
    dataRootStagingPath(plan.binding.operationId, attemptToken),
  );
  const stagedIntentPath = join(attemptPath, "operation-intent.json");
  try {
    mkdirSync(attemptPath, { mode: 0o700, recursive: false });
  } catch {
    return invalid();
  }
  runStageHook("after-attempt-mkdir");
  syncStageDirectory(join(rootPath, "staging"), "after-staging-dir-fsync");
  try {
    writeNewSyncedFile(stagedIntentPath, bindingBytes);
  } catch {
    return invalid();
  }
  runStageHook("after-staged-intent-write");
  syncStageDirectory(attemptPath, "after-attempt-dir-fsync");
  try {
    linkSync(stagedIntentPath, intentPath);
  } catch {
    // EEXIST（conflicting 或 same-bytes 既有 receipt）与任何其他失败同样保留
    // 证据并 fail closed；既有 intent 属于 restart/recovery，不是 fresh admission。
    return invalid();
  }
  runStageHook("after-hard-link");
  syncStageDirectory(join(rootPath, "receipts"), "after-receipts-dir-fsync");

  // staged 与 receipt 必须仍指向同一 exact 0600 regular inode/body。
  let linkStat: ReturnType<typeof lstatSync>;
  try {
    linkStat = lstatSync(intentPath, { bigint: true });
  } catch {
    return invalid();
  }
  if (
    (linkStat.mode & 0o170000n) !== 0o100000n ||
    linkStat.nlink < 2n
  ) {
    return invalid();
  }
  const stagedSnapshot = readStableRegularFileSnapshot(
    stagedIntentPath,
    RECORD_MAX_BYTES,
  );
  const receiptSnapshot = readStableRegularFileSnapshot(
    intentPath,
    RECORD_MAX_BYTES,
  );
  if (
    !sameIdentity(stagedSnapshot.identity, receiptSnapshot.identity) ||
    !Buffer.from(stagedSnapshot.bytes).equals(Buffer.from(bindingBytes)) ||
    !Buffer.from(receiptSnapshot.bytes).equals(Buffer.from(bindingBytes))
  ) {
    return invalid();
  }
  const intentReceiptPath = join(
    rootPath,
    dataRootReceiptIntentPath(plan.binding.operationId),
  );
  if (intentReceiptPath !== intentPath) return invalid();
  requireLiveOpenedDataRoot(root);
  if (
    requireLiveDataRootWriterLease(lease).root !== root ||
    requireLiveOpenedDataRoot(root).absolutePath !== rootPath
  ) {
    return invalid();
  }

  runStageHook("before-takeover-inspection");

  // 权威 takeover proof：actual intent 1 + pending result reservation 1 已
  // exact 接管原 generation 2-slot publication reservation。
  const post = inspectDataRootCapacity(root, lease);
  if (
    post.namespaceState !== "terminal-installed" ||
    post.internalOperationCount !== 2 ||
    post.publicOperationCount !== preInspection.publicOperationCount ||
    post.usedReceiptEntries !== preInspection.usedReceiptEntries + 1 ||
    post.pendingResultReservations !==
      preInspection.pendingResultReservations + 1
  ) {
    return invalid();
  }
  requireAbsent(resultPath);
  requireAbsent(catalogPath);
  const postCapacity = calculateDataRootCapacity({
    usedReceiptEntries: post.usedReceiptEntries,
    pendingResultReservations: post.pendingResultReservations,
    namespaceState: post.namespaceState,
    generations: [
      { state: "validating", publicationEvidence: "matching-intent-no-result" },
    ],
    request: "none",
  });
  if (
    postCapacity.status !== "ready" ||
    postCapacity.generationPublicationReservations !== 0 ||
    postCapacity.requestedEntries !== 0 ||
    postCapacity.effectiveEntries !== capability.effectiveEntries
  ) {
    return invalid();
  }

  const evidence = deepFreeze({
    schemaVersion: 1,
    kind: "generated-set-publication-intent-admitted-v1",
    generationId: plan.generationId,
    provider: plan.provider,
    artifactSetDigest: plan.artifactSetDigest,
    operationId: plan.binding.operationId,
    publicationBindingDigest: plan.publicationBindingDigest,
    attemptToken,
    preWriteEffectiveEntries: capability.effectiveEntries,
    takeover: deepFreeze({
      status: "ready",
      namespaceState: "terminal-installed",
      publicOperationCount: post.publicOperationCount,
      internalOperationCount: 2,
      usedReceiptEntries: post.usedReceiptEntries,
      pendingResultReservations: post.pendingResultReservations,
      generationPublicationReservations: 0,
      requestedEntries: 0,
      effectiveEntries: postCapacity.effectiveEntries,
      generationClassification: deepFreeze({
        state: "validating",
        publicationEvidence: "matching-intent-no-result",
      }),
    }),
  }) as AdmittedGeneratedSetIntentEvidenceV1;
  intentWriterAuthorities.set(evidence, {
    root,
    lease,
    plan,
    intentPath,
    attemptPath,
  });
  return evidence;
}

/**
 * Package-internal provenance：仅供同一 root/lease 上的下一个 `publishing`
 * append slice 把 admitted evidence 还原为 origin-checked plan 与 durable
 * attempt 定位；mutation authority 不出现在 evidence body 中。
 */
export function requireAdmittedGeneratedSetIntentProvenance(
  evidenceInput: unknown,
  root: OpenedDataRoot,
  lease: DataRootWriterLease,
): AdmittedGeneratedSetIntentProvenanceV1 {
  if (typeof evidenceInput !== "object" || evidenceInput === null) {
    return invalid();
  }
  const authority = intentWriterAuthorities.get(
    evidenceInput as AdmittedGeneratedSetIntentEvidenceV1,
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
  }) as AdmittedGeneratedSetIntentProvenanceV1;
}
