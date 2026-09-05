import { lstatSync, opendirSync } from "node:fs";
import { join } from "node:path";

import { canonicalJsonBytes, deepFreeze } from "@demiurges/world";

import {
  dataRootReceiptIntentPath,
  dataRootReceiptResultPath,
  requireLiveOpenedDataRoot,
  type OpenedDataRoot,
} from "./data-root";
import {
  requireLiveDataRootWriterLease,
  type DataRootWriterLease,
} from "./data-root-lease";
import { calculateDataRootCapacity } from "./data-root-capacity";
import { inspectDataRootCapacity } from "./data-root-capacity-inspection";
import { generationIdDigest } from "./generation-birth";
import {
  GenerationCodecError,
  requireGenerationIntent,
  type GenerationIntentV1,
} from "./generation-contracts";
import { generatedArtifactCatalogPath } from "./generated-artifact-layout";
import type { GeneratedSetPublicationPlanV1 } from "./generated-artifact-publication";
import {
  revalidateGeneratedSetPublicationEligibility,
  type GeneratedSetPublicationEligibilityV1,
} from "./generated-set-publication-eligibility";

/**
 * Package-internal、one-shot `GeneratedSetAdmissionCapability`。
 *
 * 本模块在 `artifact.publish-generated-set` durable intent 写入之前执行当前 MVP 的
 * exact Data Root capacity/single-flight preflight 并铸造 admission capability：
 *
 * - capacity 只来自当前 durable receipts + 当前 durable Generation truth
 *   （`inspectDataRootCapacity` + `calculateDataRootCapacity`），从不信任 caller 计数；
 * - 当前产品 surface 只接纳唯一 born-first Generation：data/catalog/birth-staging
 *   中出现第二个 Generation、多余 entry、wrong type/symlink 或既有
 *   generated-set receipt 一律 recovery-required（fail closed）；
 * - 同一 live writer lease 同时最多一个 active admission；byte-exact 相同的
 *   root/intent/plan/eligibility/durable snapshot 重复 authorize 返回同一
 *   capability，竞争的不同 publication fail closed。跨进程互斥由 Data Root
 *   writer lease 负责，本模块只做同进程 single-flight；
 * - `consumeGeneratedSetAdmissionCapability` 是 one-shot：在 near-revalidation
 *   之前先标记 consumed；失败后旧 capability 永久 poisoned，只能待 durable
 *   evidence 重新合法后重新 authorize。本模块自身零 durable mutation。
 *
 * 契约：`consume` 返回 origin-checked publication plan 后，下一个 writer 必须
 * 不经过任何 `await` 间隙立即执行它的第一个同步 durable intent mutation；
 * 本模块不为此引入锁或 writer surface。
 */

export interface GeneratedSetAdmissionCapabilityV1 {
  readonly kind: "generated-set-admission-capability-v1";
  readonly operationId: string;
  readonly effectiveEntries: number;
}

export type GeneratedSetAdmissionResultV1 =
  | {
    readonly status: "authorized";
    readonly capability: GeneratedSetAdmissionCapabilityV1;
  }
  | { readonly status: "capacity-reached" };

interface AdmissionSnapshot {
  readonly usedReceiptEntries: number;
  readonly pendingResultReservations: number;
  readonly namespaceState: "terminal-installed";
  readonly publicOperationCount: number;
  readonly effectiveEntries: number;
}

interface AdmissionAuthority {
  readonly root: OpenedDataRoot;
  readonly lease: DataRootWriterLease;
  readonly intent: GenerationIntentV1;
  readonly plan: GeneratedSetPublicationPlanV1;
  readonly eligibility: GeneratedSetPublicationEligibilityV1;
  readonly snapshot: AdmissionSnapshot;
}

interface ActiveAdmission {
  readonly root: OpenedDataRoot;
  readonly intentBytes: Uint8Array;
  readonly plan: GeneratedSetPublicationPlanV1;
  readonly eligibility: GeneratedSetPublicationEligibilityV1;
  readonly capability: GeneratedSetAdmissionCapabilityV1;
}

/** 全部 authority 都在 WeakMap 里；capability body 只含安全标识。 */
const admissionAuthorities = new WeakMap<object, AdmissionAuthority>();
const activeAdmissions = new WeakMap<DataRootWriterLease, ActiveAdmission>();

function invalid(): never {
  throw new GenerationCodecError("GENERATION_RECOVERY_REQUIRED");
}

function sameIntentBytes(left: Uint8Array, right: GenerationIntentV1): boolean {
  return Buffer.from(left).equals(Buffer.from(canonicalJsonBytes(right)));
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

/** Bounded directory scan：entry 数量超过 limit 立即 fail closed。 */
function listEntries(path: string, limit: number): readonly string[] {
  const names: string[] = [];
  let directory: ReturnType<typeof opendirSync> | undefined;
  try {
    directory = opendirSync(path);
    while (true) {
      const entry = directory.readSync();
      if (entry === null) break;
      names.push(entry.name);
      if (names.length > limit) return invalid();
    }
  } catch {
    return invalid();
  } finally {
    directory?.closeSync();
  }
  return names;
}

function requireDirectoryEntry(path: string): void {
  try {
    const stat = lstatSync(path, { bigint: true });
    if ((stat.mode & 0o170000n) !== 0o40000n || (stat.mode & 0o777n) !== 0o700n) {
      return invalid();
    }
  } catch {
    return invalid();
  }
}

function requireRegularEntry(path: string): void {
  try {
    const stat = lstatSync(path, { bigint: true });
    if ((stat.mode & 0o170000n) !== 0o100000n || (stat.mode & 0o777n) !== 0o600n) {
      return invalid();
    }
  } catch {
    return invalid();
  }
}

/**
 * 只读 exact first-generation namespace surface：`receipts/generations/data` 恰好
 * 只含选定 Generation 目录，`catalog` 恰好只含它的 birth pointer，`birth-staging`
 * 为空。wrong type/symlink/extra/second-generation evidence 均 recovery-required。
 */
function inspectFirstGenerationSurface(
  rootPath: string,
  intent: GenerationIntentV1,
): void {
  const namespacePath = join(rootPath, "receipts", "generations");
  const digest = generationIdDigest(intent.generationId);
  for (const name of ["data", "catalog", "birth-staging"] as const) {
    requireDirectoryEntry(join(namespacePath, name));
  }
  const dataEntries = listEntries(join(namespacePath, "data"), 2);
  if (dataEntries.length !== 1 || dataEntries[0] !== digest) return invalid();
  requireDirectoryEntry(join(namespacePath, "data", digest));
  const catalogEntries = listEntries(join(namespacePath, "catalog"), 2);
  const catalogName = `${digest}.json`;
  if (
    catalogEntries.length !== 1 ||
    catalogEntries[0] !== catalogName
  ) {
    return invalid();
  }
  requireRegularEntry(join(namespacePath, "catalog", catalogName));
  if (listEntries(join(namespacePath, "birth-staging"), 1).length !== 0) {
    return invalid();
  }
}

/**
 * 共享 preflight：eligibility exact revalidation → exact first-generation
 * namespace surface → durable receipt inspection（terminal-installed、唯一
 * namespace internal Operation、无 generated-set receipt）→ publication target
 * 缺席 → capacity 计算。capacity 只使用
 * `{state:"validating",publicationEvidence:"none"}` 与 `request:"none"`：
 * Generation 已持有的 future publication reservation 恰为 2，不再请求额外 2。
 */
function runAdmissionPreflight(
  root: OpenedDataRoot,
  lease: DataRootWriterLease,
  intent: GenerationIntentV1,
  publicationPlan: GeneratedSetPublicationPlanV1,
  eligibility: GeneratedSetPublicationEligibilityV1,
): { readonly snapshot: AdmissionSnapshot; readonly ready: boolean } {
  const liveRoot = requireLiveOpenedDataRoot(root);
  if (requireLiveDataRootWriterLease(lease).root !== root) return invalid();
  revalidateGeneratedSetPublicationEligibility(
    eligibility,
    root,
    lease,
    intent,
    publicationPlan,
  );
  if (
    publicationPlan.receiptIntentPath !==
      dataRootReceiptIntentPath(publicationPlan.binding.operationId) ||
    publicationPlan.receiptResultPath !==
      dataRootReceiptResultPath(publicationPlan.binding.operationId) ||
    publicationPlan.catalogPath !==
      generatedArtifactCatalogPath(publicationPlan.generationId)
  ) {
    return invalid();
  }
  inspectFirstGenerationSurface(liveRoot.absolutePath, intent);
  const inspection = inspectDataRootCapacity(root, lease);
  if (
    inspection.namespaceState !== "terminal-installed" ||
    inspection.internalOperationCount !== 1
  ) {
    return invalid();
  }
  requireAbsent(
    join(liveRoot.absolutePath, publicationPlan.receiptIntentPath),
  );
  requireAbsent(
    join(liveRoot.absolutePath, publicationPlan.receiptResultPath),
  );
  requireAbsent(join(liveRoot.absolutePath, publicationPlan.catalogPath));
  const capacity = calculateDataRootCapacity({
    usedReceiptEntries: inspection.usedReceiptEntries,
    pendingResultReservations: inspection.pendingResultReservations,
    namespaceState: inspection.namespaceState,
    generations: [{ state: "validating", publicationEvidence: "none" }],
    request: "none",
  });
  if (capacity.status === "recovery-required") return invalid();
  return {
    snapshot: {
      usedReceiptEntries: inspection.usedReceiptEntries,
      pendingResultReservations: inspection.pendingResultReservations,
      namespaceState: "terminal-installed",
      publicOperationCount: inspection.publicOperationCount,
      effectiveEntries: capacity.effectiveEntries,
    },
    ready: capacity.canAdmit,
  };
}

/**
 * 铸造（或返回同一 live lease 上 byte-exact 重复请求的）admission capability。
 * 同一 lease 上的竞争不同 publication fail closed；有效但 effective entries
 * 超过 2048 的非漂移 snapshot 返回 `capacity-reached`。零 durable mutation。
 */
export function authorizeGeneratedSetAdmission(
  root: OpenedDataRoot,
  lease: DataRootWriterLease,
  intentInput: GenerationIntentV1,
  publicationPlanInput: unknown,
  eligibilityInput: unknown,
): GeneratedSetAdmissionResultV1 {
  if (typeof publicationPlanInput !== "object" || publicationPlanInput === null) {
    return invalid();
  }
  if (typeof eligibilityInput !== "object" || eligibilityInput === null) {
    return invalid();
  }
  const intent = requireGenerationIntent(intentInput);
  const publicationPlan = publicationPlanInput as GeneratedSetPublicationPlanV1;
  const eligibility = eligibilityInput as GeneratedSetPublicationEligibilityV1;

  const active = activeAdmissions.get(lease);
  if (active !== undefined) {
    if (
      active.root !== root ||
      active.plan !== publicationPlan ||
      active.eligibility !== eligibility ||
      !sameIntentBytes(active.intentBytes, intent)
    ) {
      return invalid();
    }
    const repeat = runAdmissionPreflight(
      root,
      lease,
      intent,
      publicationPlan,
      eligibility,
    );
    return repeat.ready
      ? { status: "authorized", capability: active.capability }
      : { status: "capacity-reached" };
  }

  const preflight = runAdmissionPreflight(
    root,
    lease,
    intent,
    publicationPlan,
    eligibility,
  );
  if (!preflight.ready) return { status: "capacity-reached" };
  const capability = deepFreeze({
    kind: "generated-set-admission-capability-v1",
    operationId: eligibility.publicationOperationId,
    effectiveEntries: preflight.snapshot.effectiveEntries,
  }) as GeneratedSetAdmissionCapabilityV1;
  admissionAuthorities.set(capability, {
    root,
    lease,
    intent,
    plan: publicationPlan,
    eligibility,
    snapshot: preflight.snapshot,
  });
  activeAdmissions.set(lease, {
    root,
    intentBytes: Buffer.from(canonicalJsonBytes(intent)),
    plan: publicationPlan,
    eligibility,
    capability,
  });
  return { status: "authorized", capability };
}

/**
 * One-shot consume：在 near-revalidation 之前先移除 authority（旧 capability
 * 随即 poisoned，失败后不可 replay）。随后重跑完整 preflight 并要求与 authorize
 * 时完全一致的 exact snapshot 与 `canAdmit=true`。成功时仅返回 origin-checked
 * publication plan 给紧随其后的同步 durable intent writer；不暴露 reusable
 * writer 或 raw journal authority。
 */
export function consumeGeneratedSetAdmissionCapability(
  capabilityInput: unknown,
  root: OpenedDataRoot,
  lease: DataRootWriterLease,
  intentInput: GenerationIntentV1,
  publicationPlanInput: unknown,
  eligibilityInput: unknown,
): GeneratedSetPublicationPlanV1 {
  if (typeof capabilityInput !== "object" || capabilityInput === null) {
    return invalid();
  }
  const authority = admissionAuthorities.get(capabilityInput);
  if (authority === undefined) return invalid();
  if (
    authority.root !== root ||
    authority.lease !== lease ||
    authority.plan !== publicationPlanInput ||
    authority.eligibility !== eligibilityInput ||
    !sameIntentBytes(canonicalJsonBytes(authority.intent), intentInput)
  ) {
    return invalid();
  }
  admissionAuthorities.delete(capabilityInput);
  const active = activeAdmissions.get(lease);
  if (active !== undefined && active.capability === capabilityInput) {
    activeAdmissions.delete(lease);
  }

  const intent = requireGenerationIntent(intentInput);
  const preflight = runAdmissionPreflight(
    root,
    lease,
    intent,
    authority.plan,
    authority.eligibility,
  );
  const snapshot = preflight.snapshot;
  const expected = authority.snapshot;
  if (
    !preflight.ready ||
    snapshot.usedReceiptEntries !== expected.usedReceiptEntries ||
    snapshot.pendingResultReservations !== expected.pendingResultReservations ||
    snapshot.namespaceState !== expected.namespaceState ||
    snapshot.publicOperationCount !== expected.publicOperationCount ||
    snapshot.effectiveEntries !== expected.effectiveEntries
  ) {
    return invalid();
  }
  return authority.plan;
}
