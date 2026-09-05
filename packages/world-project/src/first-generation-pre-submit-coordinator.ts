import { canonicalJsonBytes } from "@demiurges/world";

import {
  requireLiveOpenedDataRoot,
  type OpenedDataRoot,
} from "./data-root";
import {
  requireLiveDataRootWriterLease,
  type DataRootWriterLease,
} from "./data-root-lease";
import { inspectGenerationTransitionCapacity } from "./generation-transition-capacity";
import {
  GenerationRecordJournal,
  readGenerationIntentForJournal,
} from "./generation-record-journal";
import {
  PRE_SUBMIT_BLOCKED_CODES,
  generationStateRecordDigest,
  type GenerationStateRecordV1,
  type PreSubmitBlockedCodeV1,
} from "./generation-state";

/**
 * Provider-independent pre-submit checkpoint。只做 closed decision 解码与
 * append/replay/conflict 编排：durable truth 全部来自既有 authority
 * （`GenerationRecordJournal` 与 receipt-derived capacity），本模块零
 * fs/path/network/provider surface。
 */

export class FirstGenerationPreSubmitCoordinatorError extends Error {
  readonly code = "GENERATION_RECOVERY_REQUIRED" as const;

  constructor() {
    super("GENERATION_RECOVERY_REQUIRED");
    this.name = "FirstGenerationPreSubmitCoordinatorError";
  }
}

export type PreSubmitCheckpointDecisionV1 =
  | { readonly kind: "ready" }
  | { readonly kind: "blocked"; readonly code: PreSubmitBlockedCodeV1 };

export interface PreSubmitCheckpointRequestV1 {
  readonly generationId: `generation:sha256:${string}`;
  readonly recordedAt: string;
  readonly decision: PreSubmitCheckpointDecisionV1;
}

export type PreSubmitCheckpointResultV1 =
  | { readonly status: "capacity-reached" }
  | {
      readonly status: "ready";
      readonly record: GenerationStateRecordV1;
      readonly replay: boolean;
    }
  | {
      readonly status: "blocked";
      readonly record: GenerationStateRecordV1;
      readonly replay: boolean;
    };

const GENERATION_ID = /^generation:sha256:[a-f0-9]{64}$/;
const RFC3339_MILLISECONDS =
  /^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{3}Z$/;

function recoveryRequired(): never {
  throw new FirstGenerationPreSubmitCoordinatorError();
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
 * 一个 closed decision；额外字段不参与状态转换，也不会进入持久化记录。
 */
export function requirePreSubmitCheckpointRequest(
  valueInput: unknown,
): PreSubmitCheckpointRequestV1 {
  if (typeof valueInput !== "object" || valueInput === null) recoveryRequired();
  const record = valueInput as Record<string, unknown>;
  const generationId = requireGenerationId(record.generationId);
  const recordedAt = requireTimestamp(record.recordedAt);
  if (typeof record.decision !== "object" || record.decision === null) {
    recoveryRequired();
  }
  const decision = record.decision as Record<string, unknown>;
  if (decision.kind === "ready") {
    return Object.freeze({
      generationId,
      recordedAt,
      decision: Object.freeze({ kind: "ready" }),
    }) as PreSubmitCheckpointRequestV1;
  }
  if (decision.kind === "blocked") {
    if (
      typeof decision.code !== "string" ||
      !PRE_SUBMIT_BLOCKED_CODES.includes(
        decision.code as PreSubmitBlockedCodeV1,
      )
    ) {
      return recoveryRequired();
    }
    return Object.freeze({
      generationId,
      recordedAt,
      decision: Object.freeze({
        kind: "blocked",
        code: decision.code as PreSubmitBlockedCodeV1,
      }),
    }) as PreSubmitCheckpointRequestV1;
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

function recordMatchesRequest(
  record: GenerationStateRecordV1,
  request: PreSubmitCheckpointRequestV1,
): boolean {
  if (request.decision.kind === "ready") {
    return record.state === "submit_started" &&
      record.recordedAt === request.recordedAt &&
      Buffer.from(canonicalJsonBytes(record.payload)).equals(
        Buffer.from(canonicalJsonBytes({ submitAttempt: 1 })),
      );
  }
  return record.state === "pre_submit_blocked" &&
    record.recordedAt === request.recordedAt &&
    record.payload.code === request.decision.code &&
    record.payload.preSubmitResumeCount === 0;
}

/**
 * 第一个 durable record mutation 之前的最小只读证明。本类只持有 live
 * root/lease；证明所需全部来自既有 authority，自身零 mutation。
 */
export class FirstGenerationPreSubmitCoordinator {
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
   * replay/收敛：durable target record 已存在，pending 缺省时纯只读；pending
   * 与 target byte-exact 一致时由 journal 内部重验 witness/head 后收敛物理表面，
   * 不生成第二个 successor。
   */
  #settledReplay(
    journal: GenerationRecordJournal,
    current: GenerationStateRecordV1,
    status: "ready" | "blocked",
  ): PreSubmitCheckpointResultV1 {
    const pending = journal.readPendingRecord();
    if (pending === undefined) {
      return Object.freeze({ status, record: current, replay: true });
    }
    if (!sameRecord(pending, current)) recoveryRequired();
    const resumed = journal.resumePending();
    if (resumed === undefined || !sameRecord(resumed, current)) {
      recoveryRequired();
    }
    return Object.freeze({ status, record: resumed, replay: true });
  }

  checkpoint(requestInput: PreSubmitCheckpointRequestV1): PreSubmitCheckpointResultV1 {
    this.#assertLive();
    const request = requirePreSubmitCheckpointRequest(requestInput);
    const intent = readGenerationIntentForJournal(
      this.#root,
      this.#lease,
      request.generationId,
    );
    const journal = new GenerationRecordJournal(this.#root, this.#lease, intent);
    const chain = journal.readValidatedChain();
    const current = chain[chain.length - 1]!;

    // replay：exact durable target record 已存在；不同 decision/advanced state
    // 一律 fail closed，不产生第二条记录。
    if (current.state === "submit_started") {
      if (request.decision.kind !== "ready") recoveryRequired();
      return this.#settledReplay(journal, current, "ready");
    }
    if (current.state === "pre_submit_blocked") {
      if (
        request.decision.kind !== "blocked" ||
        request.decision.code !== current.payload.code
      ) {
        recoveryRequired();
      }
      return this.#settledReplay(journal, current, "blocked");
    }
    if (current.state !== "admitted") recoveryRequired();

    const next = request.decision.kind === "ready"
      ? { state: "submit_started" as const, payload: { submitAttempt: 1 } }
      : {
          state: "pre_submit_blocked" as const,
          payload: {
            code: request.decision.code,
            preSubmitResumeCount: 0,
          },
        };
    const pending = journal.readPendingRecord();
    if (pending !== undefined) {
      // 同一目标的中断 append：current/pending/capacity 在 resume 前必须稳定。
      if (!recordMatchesRequest(pending, request)) recoveryRequired();
      const capacity = inspectGenerationTransitionCapacity(
        this.#root,
        this.#lease,
        current.state,
      );
      if (capacity.status !== "ready") {
        return Object.freeze({ status: "capacity-reached" });
      }
      const resumed = journal.resumePending();
      if (resumed === undefined || !recordMatchesRequest(resumed, request)) {
        recoveryRequired();
      }
      return Object.freeze({
        status: next.state === "submit_started" ? "ready" : "blocked",
        record: resumed,
        replay: true,
      });
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
    return Object.freeze({
      status: next.state === "submit_started" ? "ready" : "blocked",
      record,
      replay: false,
    });
  }
}
