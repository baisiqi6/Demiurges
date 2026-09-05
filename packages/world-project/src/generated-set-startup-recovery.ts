import { linkSync, lstatSync, opendirSync } from "node:fs";
import { join } from "node:path";

import { canonicalJsonBytes, deepFreeze } from "@demiurges/world";

import { requireLiveOpenedDataRoot, type OpenedDataRoot } from "./data-root";
import { requireLiveDataRootWriterLease, type DataRootWriterLease } from "./data-root-lease";
import { generationIdDigest } from "./generation-birth";
import { requireGenerationIntent, type GenerationIntentV1 } from "./generation-contracts";
import { inspectDynamicArtifactBytes } from "./generation-artifact-inspector";
import { GenerationRecordJournal, inspectGenerationRecordJournalPhysicalSnapshot } from "./generation-record-journal";
import { generationStateRecordDigest, type GenerationStateRecordV1 } from "./generation-state";
import { deriveGeneratedSetCandidatePlan } from "./generated-set-candidate-plan";
import {
  deriveGeneratedSetPublicationPlan,
  requireGeneratedSetPublicationOriginForRoot,
  requireGeneratedSetPublicationBinding,
  requireGeneratedSetPublicationResult,
  type GeneratedSetPublicationPlanV1,
} from "./generated-artifact-publication";
import { inspectGeneratedSetStoragePreflight } from "./generated-set-storage-preflight";
import {
  inspectGeneratedSetHiddenCasStartupResume,
  requireAttemptStagingExact,
  resumeGeneratedSetHiddenCasAtStartup,
  type GeneratedSetHiddenCasStartupResumeV1,
} from "./generated-set-hidden-cas-writer";
import { requireGeneratedSetPublishingReceiptTakeover } from "./generated-set-publishing-transition";
import { commitGeneratedSetVisible } from "./generated-set-visible-commit";
import { transitionGeneratedSetVisibleToVerified } from "./generated-set-verified-transition";
import { OperationJournalError } from "./operation-journal";
import { readStableRegularFileSnapshot, syncDirectory, writeNewSyncedFile } from "./safe-filesystem";

/**
 * A deliberately narrow restart bridge for the already-published generated-set
 * tail.  It reconstructs its authority solely from the Generation chain and
 * durable files; none of the live publisher WeakMap evidence survives restart.
 */
export interface GeneratedSetStartupRecoveryPlan {
  readonly kind: "generated-set-startup-recovery-v1";
  readonly action: "append-publishing" | "append-publishing-and-verify" | "complete-result-and-verify" | "verify" | "follow-up" | "replay";
}

interface Authority {
  readonly root: OpenedDataRoot;
  readonly lease: DataRootWriterLease;
  readonly snapshot: Uint8Array;
  readonly intent: GenerationIntentV1;
  readonly publicationPlan: GeneratedSetPublicationPlanV1;
  readonly hiddenResume: GeneratedSetHiddenCasStartupResumeV1 | undefined;
  readonly attemptPath: string;
  consumed: boolean;
}

interface StartupInspection {
  readonly action: GeneratedSetStartupRecoveryPlan["action"];
  readonly intent: GenerationIntentV1;
  readonly plan: GeneratedSetPublicationPlanV1;
  readonly head: GenerationStateRecordV1;
  readonly attempt: string;
  readonly storage: ReturnType<typeof inspectGeneratedSetStoragePreflight>;
  readonly physical: ReturnType<typeof inspectGenerationRecordJournalPhysicalSnapshot>;
  readonly takeover?: ReturnType<typeof requireGeneratedSetPublishingReceiptTakeover>;
  readonly hiddenResume?: GeneratedSetHiddenCasStartupResumeV1;
}

const authorities = new WeakMap<GeneratedSetStartupRecoveryPlan, Authority>();
const MAX = 64 * 1024;
const ATTEMPT = /^[0-9a-f]{24}$/;

export type GeneratedSetStartupRecoveryStage =
  | "after-result-staged-write"
  | "after-result-attempt-fsync"
  | "after-result-link"
  | "after-result-receipts-fsync";

let stageHook: ((stage: GeneratedSetStartupRecoveryStage) => void) | undefined;

function stage(stage: GeneratedSetStartupRecoveryStage): void {
  stageHook?.(stage);
}

/** Startup-only bounded scan; callers supply the closed surface bound. */
function namesAtMost(path: string, maximum: number): string[] | undefined {
  try { lstatSync(path, { bigint: true }); } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT") return undefined;
    return invalid();
  }
  let directory: ReturnType<typeof opendirSync>;
  try { directory = opendirSync(path); } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT") return undefined;
    return invalid();
  }
  const names: string[] = [];
  try {
    while (true) {
      const entry = directory.readSync();
      if (entry === null) break;
      names.push(entry.name);
      if (names.length > maximum) return invalid();
    }
  } finally { directory.closeSync(); }
  return names.sort();
}

function invalid(): never {
  throw new OperationJournalError("OPERATION_RECOVERY_REQUIRED");
}

function parseCanonical(bytes: Uint8Array): unknown {
  try {
    const value = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
    if (!Buffer.from(canonicalJsonBytes(value)).equals(Buffer.from(bytes))) return invalid();
    return value;
  } catch (error) {
    if (error instanceof OperationJournalError) throw error;
    return invalid();
  }
}

function readCanonical(path: string): unknown {
  try {
    return parseCanonical(readStableRegularFileSnapshot(path, MAX).bytes);
  } catch (error) {
    if (error instanceof OperationJournalError) throw error;
    return invalid();
  }
}

function absent(path: string): boolean {
  try {
    lstatSync(path, { bigint: true });
    return false;
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT") return true;
    return invalid();
  }
}

function exact0600Link(left: string, right: string, bytes: Uint8Array): void {
  try {
    const a = lstatSync(left, { bigint: true });
    const b = lstatSync(right, { bigint: true });
    if (
      (a.mode & 0o170000n) !== 0o100000n ||
      (a.mode & 0o777n) !== 0o600n ||
      (b.mode & 0o170000n) !== 0o100000n ||
      (b.mode & 0o777n) !== 0o600n ||
      a.dev !== b.dev || a.ino !== b.ino || a.nlink < 2n ||
      !Buffer.from(readStableRegularFileSnapshot(left, MAX).bytes).equals(Buffer.from(bytes)) ||
      !Buffer.from(readStableRegularFileSnapshot(right, MAX).bytes).equals(Buffer.from(bytes))
    ) return invalid();
  } catch (error) {
    if (error instanceof OperationJournalError) throw error;
    return invalid();
  }
}

function latest(chain: readonly GenerationStateRecordV1[], state: "validating"): GenerationStateRecordV1 {
  for (let i = chain.length - 1; i >= 0; i -= 1) if (chain[i]!.state === state) return chain[i]!;
  return invalid();
}

function remoteBound(chain: readonly GenerationStateRecordV1[]): GenerationStateRecordV1 {
  for (let i = chain.length - 1; i >= 0; i -= 1) if (chain[i]!.state === "remote_bound") return chain[i]!;
  return invalid();
}

function locateIntent(rootPath: string): GenerationIntentV1 | undefined {
  const data = join(rootPath, "receipts", "generations", "data");
  const names = namesAtMost(data, 1);
  if (names === undefined) return undefined;
  if (names.length === 0) return undefined;
  if (names.length !== 1 || !/^[a-f0-9]{64}$/.test(names[0]!)) return invalid();
  const intent = requireGenerationIntent(readCanonical(join(data, names[0]!, "intent.json")));
  if (generationIdDigest(intent.generationId) !== names[0]) return invalid();
  return intent;
}

function derivePlan(root: OpenedDataRoot, intent: GenerationIntentV1, chain: readonly GenerationStateRecordV1[]): GeneratedSetPublicationPlanV1 {
  const validating = latest(chain, "validating");
  const remote = remoteBound(chain);
  const payload = validating.payload as never;
  const rootPath = requireLiveOpenedDataRoot(root).absolutePath;
  const downloads = join(rootPath, "receipts", "generations", "data", generationIdDigest(intent.generationId), "downloads");
  const members = (payload as { readonly downloadBudget: { readonly orderedMembers: readonly { readonly outputRole: string; readonly stage: string; readonly candidate?: { readonly candidateName: string; readonly format: "spz-v2" | "glb-2.0" } }[] } }).downloadBudget.orderedMembers;
  const inspections = members.map((member) => {
    if (member.stage !== "candidate" || member.candidate === undefined) return invalid();
    const bytes = readStableRegularFileSnapshot(join(downloads, member.candidate.candidateName), 64 * 1024 * 1024).bytes;
    return { outputRole: member.outputRole as never, inspection: inspectDynamicArtifactBytes(member.candidate.format, bytes) };
  });
  const candidate = deriveGeneratedSetCandidatePlan(intent, remote.payload as never, payload, inspections);
  const storage = inspectGeneratedSetStoragePreflight(root, candidate);
  return deriveGeneratedSetPublicationPlan(root, candidate, storage);
}

function attemptPath(rootPath: string, operationId: string): string {
  const names = namesAtMost(join(rootPath, "staging"), 2048);
  if (names === undefined) return invalid();
  const matches = names.filter((name) => name.startsWith(`${operationId}-`) && ATTEMPT.test(name.slice(operationId.length + 1)));
  if (matches.length !== 1) return invalid();
  const path = join(rootPath, "staging", matches[0]!);
  try {
    const stat = lstatSync(path, { bigint: true });
    if ((stat.mode & 0o170000n) !== 0o40000n || (stat.mode & 0o777n) !== 0o700n) return invalid();
  } catch { return invalid(); }
  return path;
}

function allPublicTargetsExist(snapshot: ReturnType<typeof inspectGeneratedSetStoragePreflight>): boolean {
  return snapshot.content.every((entry) =>
    entry.bytesCas.status.kind === "existing" &&
    entry.contentRecordTarget.status.kind === "existing" &&
    entry.byBytesPointerTarget.status.kind === "existing",
  ) && snapshot.members.every((entry) => entry.provenanceTarget.status.kind === "existing") && snapshot.setTarget.status.kind === "existing";
}

function allPublicTargetsAbsent(snapshot: ReturnType<typeof inspectGeneratedSetStoragePreflight>): boolean {
  return snapshot.content.every((entry) =>
    entry.bytesCas.status.kind === "absent" &&
    entry.contentRecordTarget.status.kind === "absent" &&
    entry.byBytesPointerTarget.status.kind === "absent",
  ) && snapshot.members.every((entry) => entry.provenanceTarget.status.kind === "absent") && snapshot.setTarget.status.kind === "absent";
}

function hasTerminalPublicationEvidence(
  rootPath: string,
  generationId: string,
  plan: GeneratedSetPublicationPlanV1 | undefined,
): boolean {
  if (!absent(join(rootPath, "artifacts", "catalog", `${generationIdDigest(generationId as `generation:sha256:${string}`)}.json`))) return true;
  if (plan !== undefined && (
    !absent(join(rootPath, plan.receiptIntentPath)) ||
    !absent(join(rootPath, plan.receiptResultPath))
  )) return true;
  const receipts = namesAtMost(join(rootPath, "receipts"), 2048);
  if (receipts === undefined) return invalid();
  for (const name of receipts) {
    if (!name.endsWith(".intent.json")) continue;
    try {
      const binding = requireGeneratedSetPublicationBinding(readCanonical(join(rootPath, "receipts", name)));
      if (binding.candidateIdentity.generationId === generationId) return true;
    } catch {
      // Public OperationJournal independently owns malformed/foreign receipt
      // classification. This probe only asks whether a valid generated-set
      // binding makes a terminal Generation head contradictory.
    }
  }
  return false;
}

function inspect(root: OpenedDataRoot, lease: DataRootWriterLease): StartupInspection | undefined {
  if (requireLiveDataRootWriterLease(lease).root !== root) return invalid();
  const rootPath = requireLiveOpenedDataRoot(root).absolutePath;
  const intent = locateIntent(rootPath);
  if (intent === undefined) return undefined;
  const journal = new GenerationRecordJournal(root, lease, intent);
  const chain = journal.readValidatedChain();
  const physical = inspectGenerationRecordJournalPhysicalSnapshot(root, lease, intent);
  const head = chain[chain.length - 1]!;
  if (head.state !== "validating" && head.state !== "publishing" && head.state !== "verified") {
    // A terminal head after `validating` still has enough immutable chain/data
    // evidence to derive the exact generated-set receipt names.  Check those
    // before yielding to legacy recovery: a partial intent/result/catalog is
    // contradictory durable evidence, not a benign old terminal state.
    const terminalPlan = chain.some((record) => record.state === "validating")
      ? derivePlan(root, intent, chain)
      : undefined;
    if (hasTerminalPublicationEvidence(rootPath, intent.generationId, terminalPlan)) return invalid();
    return undefined;
  }
  const plan = derivePlan(root, intent, chain);
  const bindingBytes = canonicalJsonBytes(plan.binding);
  const intentPath = join(rootPath, plan.receiptIntentPath);
  const resultPath = join(rootPath, plan.receiptResultPath);
  const catalogPath = join(rootPath, plan.catalogPath);
  const hasIntent = !absent(intentPath);
  const hasResult = !absent(resultPath);
  const hasCatalog = !absent(catalogPath);
  if (!hasIntent) {
    if (head.state === "publishing" || hasResult || hasCatalog) return invalid();
    return undefined;
  }
  const binding = requireGeneratedSetPublicationBinding(readCanonical(intentPath));
  if (!Buffer.from(canonicalJsonBytes(binding)).equals(Buffer.from(bindingBytes))) return invalid();
  const attempt = attemptPath(rootPath, plan.binding.operationId);
  exact0600Link(join(attempt, "operation-intent.json"), intentPath, bindingBytes);
  if (hasCatalog) {
    const bytes = canonicalJsonBytes(plan.catalogBody);
    if (!Buffer.from(canonicalJsonBytes(readCanonical(catalogPath))).equals(Buffer.from(bytes))) return invalid();
    exact0600Link(join(attempt, "catalog.json"), catalogPath, bytes);
  }
  if (hasResult) {
    const bytes = canonicalJsonBytes(plan.expectedResult);
    requireGeneratedSetPublicationResult(readCanonical(resultPath), plan.binding);
    exact0600Link(join(attempt, "result.json"), resultPath, bytes);
  }
  const storage = inspectGeneratedSetStoragePreflight(
    root,
    requireGeneratedSetPublicationOriginForRoot(plan, root).candidatePlan,
  );
  const extraStaged = new Map<string, Uint8Array>();
  if (hasCatalog) extraStaged.set("catalog.json", canonicalJsonBytes(plan.catalogBody));
  if (hasResult || (head.state === "publishing" && hasCatalog)) {
    extraStaged.set("result.json", canonicalJsonBytes(plan.expectedResult));
  }
  requireAttemptStagingExact(
    rootPath,
    plan,
    storage,
    attempt,
    extraStaged.size === 0 ? undefined : extraStaged,
  );
  // `derivePlan` already checked the complete candidate/storage join.  A visible
  // catalog or result additionally requires every public member to be present.
  if ((hasCatalog || hasResult) && !allPublicTargetsExist(storage)) return invalid();
  if (hasResult && !hasCatalog) return invalid();
  if (head.state === "verified") {
    if (!hasCatalog || !hasResult || !allPublicTargetsExist(storage)) return invalid();
    if (head.payload.artifactSetDigest !== plan.artifactSetDigest || head.payload.publicationOperationId !== plan.binding.operationId) return invalid();
    return { action: "replay", intent, plan, head, attempt, storage, physical };
  }
  if (head.state === "validating") {
    if (!hasCatalog && !hasResult) {
      if (!allPublicTargetsAbsent(storage)) return invalid();
      const takeover = requireGeneratedSetPublishingReceiptTakeover(root, lease, intent, plan);
      return { action: "append-publishing", intent, plan, head, attempt, storage, physical, takeover };
    }
    if (!hasCatalog || !hasResult || !allPublicTargetsExist(storage)) return invalid();
    const takeover = requireGeneratedSetPublishingReceiptTakeover(
      root,
      lease,
      intent,
      plan,
      "matching-intent-result",
    );
    return {
      action: "append-publishing-and-verify",
      intent,
      plan,
      head,
      attempt,
      storage,
      physical,
      takeover,
    };
  }
  if (!hasCatalog && !hasResult) {
    return {
      action: "follow-up",
      intent,
      plan,
      head,
      attempt,
      storage,
      physical,
      hiddenResume: inspectGeneratedSetHiddenCasStartupResume(
        root,
        lease,
        intent,
        plan,
      ),
    };
  }
  if (hasCatalog && !hasResult) return { action: "complete-result-and-verify", intent, plan, head, attempt, storage, physical };
  return { action: "verify", intent, plan, head, attempt, storage, physical };
}

function snapshotOf(root: OpenedDataRoot, value: ReturnType<typeof inspect>): Uint8Array {
  if (value === undefined) return canonicalJsonBytes({ action: "none" });
  const stat = (path: string): Record<string, string> | null => {
    try {
      const value = lstatSync(path, { bigint: true });
      return {
        dev: value.dev.toString(), ino: value.ino.toString(), mode: value.mode.toString(),
        size: value.size.toString(), mtimeNs: value.mtimeNs.toString(), ctimeNs: value.ctimeNs.toString(),
      };
    } catch (error) {
      if (typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT") return null;
      return invalid();
    }
  };
  const rootPath = requireLiveOpenedDataRoot(root).absolutePath;
  return canonicalJsonBytes({
    action: value.action,
    intent: value.intent,
    binding: value.plan.binding,
    head: value.head,
    attempt: value.attempt,
    storage: value.storage,
    physical: value.physical,
    takeover: value.takeover ?? null,
    receiptIntent: stat(join(rootPath, value.plan.receiptIntentPath)),
    receiptResult: stat(join(rootPath, value.plan.receiptResultPath)),
    catalog: stat(join(rootPath, value.plan.catalogPath)),
    // At most the bounded generated-set staged members plus intent/catalog/result.
    attemptEntries: (namesAtMost(value.attempt, 64) ?? invalid()).map((name) => ({ name, stat: stat(join(value.attempt, name)) })),
  });
}

/** Phase A only; no durable write is performed here. */
export function inspectGeneratedSetStartupRecovery(root: OpenedDataRoot, lease: DataRootWriterLease): GeneratedSetStartupRecoveryPlan | undefined {
  let value = inspect(root, lease);
  if (value === undefined) return undefined;
  const plan = deepFreeze({ kind: "generated-set-startup-recovery-v1", action: value.action }) as GeneratedSetStartupRecoveryPlan;
  authorities.set(plan, {
    root,
    lease,
    snapshot: snapshotOf(root, value),
    intent: value.intent,
    publicationPlan: value.plan,
    hiddenResume: value.hiddenResume,
    attemptPath: value.attempt,
    consumed: false,
  });
  return plan;
}

/**
 * Package-internal only: lets the global startup coordinator mark the exact
 * Phase-A-validated internal attempt as covered before legacy attempt cleanup
 * inspection.  It neither exposes a writer nor validates arbitrary paths.
 */
export function requireGeneratedSetStartupRecoveryAttemptPath(
  plan: GeneratedSetStartupRecoveryPlan,
  root: OpenedDataRoot,
  lease: DataRootWriterLease,
): string {
  const authority = authorities.get(plan);
  if (
    authority === undefined || authority.consumed || authority.root !== root ||
    authority.lease !== lease || requireLiveDataRootWriterLease(lease).root !== root
  ) return invalid();
  const current = inspect(root, lease);
  if (
    current === undefined || current.action !== plan.action ||
    !Buffer.from(snapshotOf(root, current)).equals(Buffer.from(authority.snapshot))
  ) return invalid();
  return authority.attemptPath;
}

function publishResult(rootPath: string, value: NonNullable<ReturnType<typeof inspect>>): void {
  const staged = join(value.attempt, "result.json");
  const finalPath = join(rootPath, value.plan.receiptResultPath);
  const bytes = canonicalJsonBytes(value.plan.expectedResult);
  const requireExactStaged = (): void => {
    try {
      const stat = lstatSync(staged, { bigint: true });
      if (
        (stat.mode & 0o170000n) !== 0o100000n ||
        (stat.mode & 0o777n) !== 0o600n ||
        !Buffer.from(readStableRegularFileSnapshot(staged, MAX).bytes).equals(Buffer.from(bytes))
      ) return invalid();
    } catch { return invalid(); }
  };
  if (absent(staged)) {
    writeNewSyncedFile(staged, bytes);
    stage("after-result-staged-write");
    syncDirectory(value.attempt);
    stage("after-result-attempt-fsync");
  }
  requireExactStaged();
  if (absent(finalPath)) {
    try { linkSync(staged, finalPath); } catch { return invalid(); }
    stage("after-result-link");
  }
  // An existing exact result can be the crash residue after its no-replace link;
  // it still needs the current lease holder's receipt-directory fsync before the
  // Generation terminal record is allowed to name it.
  syncDirectory(join(rootPath, "receipts"));
  stage("after-result-receipts-fsync");
  exact0600Link(staged, finalPath, bytes);
}

/** Apply the original plan once, with a complete reinspection before mutation. */
export function applyGeneratedSetStartupRecovery(plan: GeneratedSetStartupRecoveryPlan, root: OpenedDataRoot, lease: DataRootWriterLease): void {
  const authority = authorities.get(plan);
  if (authority === undefined || authority.consumed || authority.root !== root || authority.lease !== lease) return invalid();
  let value = inspect(root, lease);
  if (value === undefined || !Buffer.from(snapshotOf(root, value)).equals(Buffer.from(authority.snapshot)) || value.action !== plan.action) return invalid();
  authority.consumed = true;
  if (value.action === "replay") return;
  if (value.action === "follow-up") {
    const hiddenResume = authority.hiddenResume;
    if (hiddenResume === undefined) return invalid();
    // The resume entry independently repeats Phase-A durable authority checks,
    // writes only the shared hidden CAS core, and returns the same genuine
    // evidence object consumed by the approved visible/verified tail.
    const hidden = resumeGeneratedSetHiddenCasAtStartup(
      hiddenResume,
      root,
      lease,
      authority.intent,
      authority.publicationPlan,
    );
    const visible = commitGeneratedSetVisible(
      hidden,
      root,
      lease,
      authority.intent,
      authority.publicationPlan,
    );
    transitionGeneratedSetVisibleToVerified(
      visible,
      root,
      lease,
      authority.intent,
      authority.publicationPlan,
      new Date().toISOString(),
    );
    return;
  }
  const journal = new GenerationRecordJournal(root, lease, value.intent);
  let resumed = journal.resumePending();
  if (value.action === "append-publishing" || value.action === "append-publishing-and-verify") {
    if (resumed !== undefined) {
      if (
        resumed.state !== "publishing" ||
        resumed.payload.operationId !== value.plan.binding.operationId ||
        resumed.payload.artifactSetDigest !== value.plan.artifactSetDigest
      ) return invalid();
      if (value.action === "append-publishing") return;
    } else {
      journal.append("publishing", { operationId: value.plan.binding.operationId, artifactSetDigest: value.plan.artifactSetDigest }, new Date().toISOString());
      if (value.action === "append-publishing") return;
    }
    const afterPublishing = inspect(root, lease);
    if (
      afterPublishing === undefined ||
      afterPublishing.action !== "verify" ||
      afterPublishing.intent.generationId !== value.intent.generationId ||
      afterPublishing.plan.binding.operationId !== value.plan.binding.operationId
    ) return invalid();
    value = afterPublishing;
    resumed = undefined;
  }
  const rootPath = requireLiveOpenedDataRoot(root).absolutePath;
  let verifiedHead = value.head;
  if (value.action === "complete-result-and-verify") {
    publishResult(rootPath, value);
    // The result link is a durable mutation. Rebuild the complete visible join
    // before touching the Generation head, rather than carrying Phase-A facts
    // across that mutation in memory.
    const afterResult = inspect(root, lease);
    if (
      afterResult === undefined ||
      afterResult.action !== "verify" ||
      afterResult.intent.generationId !== value.intent.generationId ||
      afterResult.plan.binding.operationId !== value.plan.binding.operationId
    ) return invalid();
    verifiedHead = afterResult.head;
  }
  if (resumed !== undefined && resumed.state === "verified") {
    if (
      resumed.payload.artifactSetDigest !== value.plan.artifactSetDigest ||
      resumed.payload.publicationOperationId !== value.plan.binding.operationId
    ) return invalid();
    return;
  }
  const current = journal.readCurrent();
  if (current.state !== "publishing" || generationStateRecordDigest(current) !== generationStateRecordDigest(verifiedHead)) return invalid();
  if (resumed !== undefined) return invalid();
  if (value.action === "verify") {
    syncDirectory(join(requireLiveOpenedDataRoot(root).absolutePath, "receipts"));
    stage("after-result-receipts-fsync");
  }
  const now = new Date().toISOString();
  journal.append("verified", { artifactSetDigest: value.plan.artifactSetDigest, publicationOperationId: value.plan.binding.operationId }, now);
}

/** Focused durability-test seam; never exported by the package root. */
export const GENERATED_SET_STARTUP_RECOVERY_TEST_SEAMS = Object.freeze({
  replaceStageHook(replacement: (stage: GeneratedSetStartupRecoveryStage) => void): () => void {
    const previous = stageHook;
    stageHook = replacement;
    return () => {
      if (stageHook === replacement) stageHook = previous;
    };
  },
});
