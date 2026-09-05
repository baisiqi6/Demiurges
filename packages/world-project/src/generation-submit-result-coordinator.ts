import { canonicalJsonBytes } from "@demiurges/world";

import {
  requireLiveOpenedDataRoot,
  type OpenedDataRoot,
} from "./data-root";
import {
  requireLiveDataRootWriterLease,
  type DataRootWriterLease,
} from "./data-root-lease";
import type {
  GenerationIntentV1,
  GenerationProviderV1,
} from "./generation-contracts";
import { FirstGenerationCoordinator } from "./first-generation-coordinator";
import { inspectGenerationTransitionCapacity } from "./generation-transition-capacity";
import {
  GenerationRecordJournal,
  readGenerationIntentForJournal,
} from "./generation-record-journal";
import {
  PROVIDER_FAILED_CODES,
  generationStateRecordDigest,
  requireRemoteBoundPayload,
  type GenerationStateRecordV1,
  type GenerationStateV1,
  type ProviderFailedCodeV1,
  type RemoteBoundPayloadV1,
} from "./generation-state";

/**
 * Package-owned durable submit-result 收束。它不建立第二套 journal：append 与
 * pending/witness/head 收敛全部经由既有 `GenerationRecordJournal`；每次 mutation
 * 前重读 live root/lease、exact intent/binding、current chain/pending record
 * 与 receipt capacity。
 * outcome 的 provider/identity/code 在 mutation 前对 durable intent 校验。
 */

export class GenerationSubmitResultCoordinatorError extends Error {
  readonly code = "GENERATION_RECOVERY_REQUIRED" as const;

  constructor() {
    super("GENERATION_RECOVERY_REQUIRED");
    this.name = "GenerationSubmitResultCoordinatorError";
  }
}

export type SubmitResultOutcomeV1 =
  | { readonly kind: "remote-bound"; readonly remoteBound: RemoteBoundPayloadV1 }
  | { readonly kind: "provider-failed"; readonly code: ProviderFailedCodeV1 }
  | { readonly kind: "submission-ambiguous" };

export interface SubmitResultRequestV1 {
  readonly generationId: `generation:sha256:${string}`;
  readonly recordedAt: string;
  readonly outcome: SubmitResultOutcomeV1;
}

export type SubmitResultResultV1 =
  | { readonly status: "capacity-reached" }
  | { readonly status: "replay"; readonly record: GenerationStateRecordV1 }
  | { readonly status: "appended"; readonly record: GenerationStateRecordV1 };

export type SubmitResultInspectionV1 =
  | { readonly status: "absent" }
  | {
      readonly status: "present";
      readonly intent: GenerationIntentV1;
      readonly current: GenerationStateRecordV1;
    };

const GENERATION_ID = /^generation:sha256:[a-f0-9]{64}$/;
const RFC3339_MILLISECONDS =
  /^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{3}Z$/;
const RESULT_STATES: readonly GenerationStateV1[] = [
  "remote_bound",
  "provider_failed",
  "submission_ambiguous",
];

function recoveryRequired(): never {
  throw new GenerationSubmitResultCoordinatorError();
}

function requireGenerationId(value: unknown): `generation:sha256:${string}` {
  if (typeof value !== "string" || !GENERATION_ID.test(value)) {
    return recoveryRequired();
  }
  return value as `generation:sha256:${string}`;
}

function requireTimestamp(value: unknown): string {
  if (
    typeof value !== "string" ||
    !RFC3339_MILLISECONDS.test(value) ||
    new Date(value).toISOString() !== value
  ) {
    return recoveryRequired();
  }
  return value;
}

/**
 * 边界收口：只接受 generationId、trusted RFC3339-millisecond recordedAt 与
 * 一个 closed outcome；额外字段不参与状态转换，也不会进入持久化记录。
 * outcome 的自洽 shape 在此验证，与
 * durable intent 的 provider 交叉校验留在 mutation 前。
 */
export function requireSubmitResultRequest(
  valueInput: unknown,
): SubmitResultRequestV1 {
  if (typeof valueInput !== "object" || valueInput === null) recoveryRequired();
  const record = valueInput as Record<string, unknown>;
  const generationId = requireGenerationId(record.generationId);
  const recordedAt = requireTimestamp(record.recordedAt);
  if (typeof record.outcome !== "object" || record.outcome === null) {
    recoveryRequired();
  }
  const outcome = record.outcome as Record<string, unknown>;
  if (outcome.kind === "remote-bound") {
    if (typeof outcome.remoteBound !== "object" || outcome.remoteBound === null) {
      recoveryRequired();
    }
    const rawRemote = outcome.remoteBound as Record<string, unknown>;
    const provider = rawRemote.provider;
    if (
      provider !== "worldlabs-marble-v1" &&
      provider !== "hunyuan-ai3d-v1"
    ) {
      return recoveryRequired();
    }
    let remoteBound: RemoteBoundPayloadV1;
    try {
      remoteBound = requireRemoteBoundPayload(
        outcome.remoteBound,
        provider as GenerationProviderV1,
      );
    } catch {
      return recoveryRequired();
    }
    return Object.freeze({
      generationId,
      recordedAt,
      outcome: Object.freeze({
        kind: "remote-bound",
        remoteBound,
      }),
    }) as SubmitResultRequestV1;
  }
  if (outcome.kind === "provider-failed") {
    if (
      typeof outcome.code !== "string" ||
      !PROVIDER_FAILED_CODES.includes(outcome.code as ProviderFailedCodeV1)
    ) {
      return recoveryRequired();
    }
    return Object.freeze({
      generationId,
      recordedAt,
      outcome: Object.freeze({
        kind: "provider-failed",
        code: outcome.code as ProviderFailedCodeV1,
      }),
    }) as SubmitResultRequestV1;
  }
  if (outcome.kind === "submission-ambiguous") {
    return Object.freeze({
      generationId,
      recordedAt,
      outcome: Object.freeze({ kind: "submission-ambiguous" }),
    }) as SubmitResultRequestV1;
  }
  return recoveryRequired();
}

function sameRecord(
  left: GenerationStateRecordV1,
  right: GenerationStateRecordV1,
): boolean {
  return left.sequence === right.sequence &&
    generationStateRecordDigest(left) === generationStateRecordDigest(right);
}

function payloadBytesEqual(
  left: Readonly<Record<string, unknown>>,
  right: Readonly<Record<string, unknown>>,
): boolean {
  return Buffer.from(canonicalJsonBytes(left)).equals(
    Buffer.from(canonicalJsonBytes(right)),
  );
}

/**
 * outcome 对 durable intent 的交叉校验：remote identity 必须与 intent provider
 * byte-exact，provider_failed code 必须属于 closed 集合。任何漂移在此 fail
 * closed；`submit_started` 前驱约束由 append 路径单独检查（terminal replay
 * 不要求）。
 */
function requireOutcomeResult(
  request: SubmitResultRequestV1,
  intent: GenerationIntentV1,
): { readonly state: "remote_bound" | "provider_failed" | "submission_ambiguous"; readonly payload: Readonly<Record<string, unknown>> } {
  const outcome = request.outcome;
  if (outcome.kind === "remote-bound") {
    let remoteBound: RemoteBoundPayloadV1;
    try {
      remoteBound = requireRemoteBoundPayload(outcome.remoteBound, intent.provider);
    } catch {
      return recoveryRequired();
    }
    return { state: "remote_bound", payload: remoteBound };
  }
  if (outcome.kind === "provider-failed") {
    return { state: "provider_failed", payload: { code: outcome.code } };
  }
  return {
    state: "submission_ambiguous",
    payload: { code: "PROVIDER_SUBMISSION_AMBIGUOUS" },
  };
}

/**
 * 已 terminal 且 outcome 与 durable record byte-exact 时的收敛：pending 缺省
 * 时纯只读 replay；pending 与 target byte-exact 一致时由 journal 内部重验
 * witness/head 后收敛物理表面，不生成第二个 successor。
 */
function settledReplay(
  journal: GenerationRecordJournal,
  current: GenerationStateRecordV1,
): SubmitResultResultV1 {
  const pending = journal.readPendingRecord();
  if (pending === undefined) {
    return Object.freeze({ status: "replay", record: current });
  }
  if (!sameRecord(pending, current)) recoveryRequired();
  const resumed = journal.resumePending();
  if (resumed === undefined || !sameRecord(resumed, current)) {
    recoveryRequired();
  }
  return Object.freeze({ status: "replay", record: resumed });
}

/**
 * 只持有 live root/lease 的收束 authority。durable truth 全部来自既有
 * `GenerationRecordJournal` 与 receipt-derived capacity；本类零 fs/path/network/provider
 * surface。
 */
export class GenerationSubmitResultCoordinator {
  readonly #root: OpenedDataRoot;
  readonly #lease: DataRootWriterLease;
  readonly #rootPath: string;

  constructor(root: OpenedDataRoot, lease: DataRootWriterLease) {
    const liveRoot = requireLiveOpenedDataRoot(root);
    if (requireLiveDataRootWriterLease(lease).root !== root) {
      recoveryRequired();
    }
    this.#root = root;
    this.#lease = lease;
    this.#rootPath = liveRoot.absolutePath;
  }

  #assertLive(): void {
    if (
      requireLiveDataRootWriterLease(this.#lease).root !== this.#root ||
      requireLiveOpenedDataRoot(this.#root).absolutePath !== this.#rootPath
    ) {
      recoveryRequired();
    }
  }

  /**
   * 只读 durable submit-state truth：exact intent + full-validated chain 的
   * current，适用于任意 early-chain 状态。`FirstGenerationCoordinator.inspect`
   * 只承认 sequence-0 admitted；chain 已推进时它 fail closed，本方法随后以
   * journal 只读重读同一 intent/chain。真正 corrupt 的状态在这里同样 fail
   * closed。零 mutation、零 provider call。
   */
  inspectSubmitState(generationIdInput: string): SubmitResultInspectionV1 {
    this.#assertLive();
    try {
      const early = new FirstGenerationCoordinator(this.#root, this.#lease)
        .inspect(generationIdInput);
      if (early.status === "absent") {
        return Object.freeze({ status: "absent" });
      }
      return Object.freeze({
        status: "present",
        intent: early.intent,
        current: early.current,
      });
    } catch {
      const generationId = requireGenerationId(generationIdInput);
      const intent = readGenerationIntentForJournal(
        this.#root,
        this.#lease,
        generationId,
      );
      const journal = new GenerationRecordJournal(this.#root, this.#lease, intent);
      const chain = journal.readValidatedChain();
      return Object.freeze({
        status: "present",
        intent,
        current: chain[chain.length - 1]!,
      });
    }
  }

  submitResult(requestInput: SubmitResultRequestV1): SubmitResultResultV1 {
    this.#assertLive();
    const request = requireSubmitResultRequest(requestInput);
    const intent = readGenerationIntentForJournal(
      this.#root,
      this.#lease,
      request.generationId,
    );
    const journal = new GenerationRecordJournal(this.#root, this.#lease, intent);
    const chain = journal.readValidatedChain();
    const current = chain[chain.length - 1]!;
    const next = requireOutcomeResult(request, intent);

    // exact durable outcome replay 是只读的：不产生新 record、不替换 inode；
    // conflicting outcome 在 mutation 前 fail closed。
    if (current.state === "remote_bound") {
      if (next.state === "remote_bound") {
        if (!payloadBytesEqual(next.payload, current.payload)) {
          return recoveryRequired();
        }
        return settledReplay(journal, current);
      }
      // remote_bound 上唯一合法的 result successor 是 provider_failed
      // （poll 终态失败）：复用下方 pending/witness/capacity/append 路径
      // 追加；冲突 remote identity、submission-ambiguous 等一律 fail closed。
      if (next.state !== "provider_failed") {
        return recoveryRequired();
      }
    } else if (current.state === "provider_failed") {
      if (next.state !== "provider_failed" || !payloadBytesEqual(next.payload, current.payload)) {
        return recoveryRequired();
      }
      return settledReplay(journal, current);
    } else if (current.state === "submission_ambiguous") {
      if (next.state !== "submission_ambiguous") {
        return recoveryRequired();
      }
      return settledReplay(journal, current);
    } else if (current.state !== "submit_started") {
      // result append 的合法前驱是 submit_started，以及 provider_failed 的
      // remote_bound；admitted / pre_submit_blocked / polling / 后续
      // advanced state 一律 fail closed。
      return recoveryRequired();
    }

    const pending = journal.readPendingRecord();
    if (pending !== undefined && !sameRecord(pending, current)) {
      // 早先 submitResult 在 append 中中断：durable pending 已是唯一 result
      // authority。无论本次 request outcome 如何，收敛到同一 pending record
      // （同一 disposition digest/recordedAt），绝不产生第二个 successor。
      if (!RESULT_STATES.includes(pending.state)) {
        return recoveryRequired();
      }
      const capacity = inspectGenerationTransitionCapacity(
        this.#root,
        this.#lease,
        current.state,
      );
      if (capacity.status !== "ready") {
        return Object.freeze({ status: "capacity-reached" });
      }
      const resumed = journal.resumePending();
      if (resumed === undefined || !sameRecord(resumed, pending)) {
        return recoveryRequired();
      }
      // 收敛后 settled 表面的 journal 证明（capacity/catalog/receipts）。
      return Object.freeze({ status: "appended", record: resumed });
    }
    if (pending !== undefined) {
      // pending === current：当前 head record 的残留 pending 辅助名，按既有
      // witness/head 协议收敛物理表面后继续 fresh append。
      const resumed = journal.resumePending();
      if (resumed === undefined || !sameRecord(resumed, current)) {
        return recoveryRequired();
      }
    }

    const capacity = inspectGenerationTransitionCapacity(
      this.#root,
      this.#lease,
      current.state,
    );
    if (capacity.status !== "ready") {
      return Object.freeze({ status: "capacity-reached" });
    }
    const record = journal.append(next.state, next.payload, request.recordedAt);
    return Object.freeze({ status: "appended", record });
  }
}
