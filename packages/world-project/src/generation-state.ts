import {
  canonicalJsonBytes,
  deepFreeze,
  sha256Hex,
} from "@demiurges/world";

import {
  GenerationCodecError,
  requireGenerationIntent,
  type GenerationIntentV1,
  type GenerationProviderV1,
} from "./generation-contracts";
import {
  requireActiveDownloadPayload,
  requireDownloadBudgetTransition,
  requireOutputsReadyPayload,
  requireSanitizedCost,
  type ActiveDownloadPayloadV1,
  type OutputsReadyPayloadV1,
  type SanitizedCostV1,
} from "./generation-output-contracts";

export const GENERATION_STATE_RECORD_MAX_BYTES = 64 * 1024;
export const GENERATION_STATE_MAX_SEQUENCE = 511;

export type PreSubmitBlockedCodeV1 =
  | "CREDENTIAL_UNAVAILABLE"
  | "REQUEST_ABORTED"
  | "GENERATION_CAPACITY_REACHED"
  | "PROVIDER_CONTRACT_MISMATCH";

export type ProviderFailedCodeV1 =
  | "PROVIDER_UNAUTHORIZED"
  | "PROVIDER_PAYMENT_REQUIRED"
  | "PROVIDER_REJECTED"
  | "PROVIDER_CONTRACT_MISMATCH";

export interface PollBudgetV1 {
  readonly cycleCount: 1 | 2;
  readonly attemptCount: number;
  readonly cycleStartedAt: string;
  readonly deadlineAt: string;
}

export type RemoteBoundPayloadV1 =
  | {
      readonly provider: "worldlabs-marble-v1";
      readonly remoteJobId: string;
      readonly providerRequestId: null;
    }
  | {
      readonly provider: "hunyuan-ai3d-v1";
      readonly remoteJobId: string;
      readonly providerRequestId: string;
    };

/** `publishing` payload：exact plan-derived publication 身份，shape 与 generated-artifact-publication 一致。 */
export interface PublishingPayloadV1 {
  readonly operationId: string;
  readonly artifactSetDigest: string;
}

/** `verified` payload：已完成 visible publication 的精确 terminal 身份。 */
export interface VerifiedPayloadV1 {
  readonly artifactSetDigest: string;
  readonly publicationOperationId: string;
}

export type EarlyGenerationStatePayloadV1 =
  | { readonly state: "admitted"; readonly payload: Readonly<Record<never, never>> }
  | {
      readonly state: "pre_submit_blocked";
      readonly payload: {
        readonly code: PreSubmitBlockedCodeV1;
        readonly preSubmitResumeCount: number;
      };
    }
  | {
      readonly state: "submit_started";
      readonly payload: { readonly submitAttempt: 1 };
    }
  | { readonly state: "remote_bound"; readonly payload: RemoteBoundPayloadV1 }
  | { readonly state: "polling"; readonly payload: PollBudgetV1 }
  | {
      readonly state: "provider_failed";
      readonly payload: {
        readonly code: ProviderFailedCodeV1;
        readonly sanitizedCost?: SanitizedCostV1;
      };
    }
  | {
      readonly state: "submission_ambiguous";
      readonly payload: { readonly code: "PROVIDER_SUBMISSION_AMBIGUOUS" };
    }
  | {
      readonly state: "recovery_required";
      readonly payload: { readonly code: "GENERATION_RECOVERY_REQUIRED" };
    }
  | { readonly state: "outputs_ready"; readonly payload: OutputsReadyPayloadV1 }
  | { readonly state: "downloading"; readonly payload: ActiveDownloadPayloadV1 }
  | { readonly state: "validating"; readonly payload: ActiveDownloadPayloadV1 }
  | { readonly state: "publishing"; readonly payload: PublishingPayloadV1 }
  | { readonly state: "verified"; readonly payload: VerifiedPayloadV1 };

export type EarlyGenerationStateV1 = EarlyGenerationStatePayloadV1["state"];

// 三个 output 状态已经通过 EarlyGenerationStatePayloadV1 的扩宽成员包含在
// EarlyGenerationStateV1 内；这里只保留别名，不重复列出成员。
export type GenerationStateV1 = EarlyGenerationStateV1;

export interface GenerationStateRecordV1 {
  readonly schemaVersion: 1;
  readonly generationId: `generation:sha256:${string}`;
  readonly bindingDigest: string;
  readonly sequence: number;
  readonly previousRecordDigest: string | null;
  readonly state: GenerationStateV1;
  readonly payload: Readonly<Record<string, unknown>>;
  readonly recordedAt: string;
}

type PlainRecord = Record<string, unknown>;

const HEX_64 = /^[a-f0-9]{64}$/;
const OPERATION_ID = /^op:[A-Za-z0-9._-]{1,127}$/;
const MARBLE_REMOTE_ID = /^[A-Za-z0-9_-]{1,256}$/;
const HUNYUAN_JOB_ID = /^[0-9]{1,32}$/;
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const RFC3339_MILLISECONDS =
  /^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{3}Z$/;

/** closed pre-submit blocked code set；pre-submit 边界与 payload codec 共用。 */
export const PRE_SUBMIT_BLOCKED_CODES: readonly PreSubmitBlockedCodeV1[] = [
  "CREDENTIAL_UNAVAILABLE",
  "REQUEST_ABORTED",
  "GENERATION_CAPACITY_REACHED",
  "PROVIDER_CONTRACT_MISMATCH",
];

export const PROVIDER_FAILED_CODES: readonly ProviderFailedCodeV1[] = [
  "PROVIDER_UNAUTHORIZED",
  "PROVIDER_PAYMENT_REQUIRED",
  "PROVIDER_REJECTED",
  "PROVIDER_CONTRACT_MISMATCH",
];

const TERMINAL_STATES: readonly GenerationStateV1[] = [
  "provider_failed",
  "submission_ambiguous",
  "recovery_required",
  "verified",
];

const TRANSITIONS: Readonly<Record<GenerationStateV1, readonly GenerationStateV1[]>> =
  Object.freeze({
    admitted: ["pre_submit_blocked", "submit_started", "recovery_required"],
    pre_submit_blocked: ["admitted", "recovery_required"],
    submit_started: [
      "remote_bound",
      "provider_failed",
      "submission_ambiguous",
      "recovery_required",
    ],
    remote_bound: ["polling", "provider_failed", "recovery_required"],
    polling: ["polling", "provider_failed", "outputs_ready"],
    outputs_ready: ["downloading"],
    downloading: ["downloading", "validating"],
    validating: ["publishing"],
    publishing: ["verified"],
    verified: [],
    provider_failed: [],
    submission_ambiguous: [],
    recovery_required: [],
  });

function invalid(): never {
  throw new GenerationCodecError("INVALID_REQUEST");
}

function plainRecord(value: unknown): PlainRecord {
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Object.prototype
  ) {
    return invalid();
  }
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== "string") return invalid();
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (
      descriptor === undefined ||
      !("value" in descriptor) ||
      descriptor.enumerable !== true
    ) {
      return invalid();
    }
  }
  return value as PlainRecord;
}

function exactKeys(record: PlainRecord, keys: readonly string[]): void {
  const actual = Reflect.ownKeys(record);
  if (
    actual.length !== keys.length ||
    actual.some((key) => typeof key !== "string") ||
    !keys.every((key) => Object.prototype.hasOwnProperty.call(record, key))
  ) {
    invalid();
  }
}

function requireInteger(
  value: unknown,
  minimum: number,
  maximum: number,
): number {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value < minimum ||
    value > maximum ||
    Object.is(value, -0)
  ) {
    return invalid();
  }
  return value;
}

function requireTimestamp(value: unknown): string {
  if (
    typeof value !== "string" ||
    !RFC3339_MILLISECONDS.test(value) ||
    new Date(value).toISOString() !== value
  ) {
    return invalid();
  }
  return value;
}

function requireHex64(value: unknown): string {
  if (typeof value !== "string" || !HEX_64.test(value)) return invalid();
  return value;
}

function requireEmptyPayload(value: unknown): Readonly<Record<string, never>> {
  const record = plainRecord(value);
  exactKeys(record, []);
  return record as Readonly<Record<string, never>>;
}

/** Package-internal exact decoder shared by state and output payload codecs. */
export function requireRemoteBoundPayload(
  value: unknown,
  provider: GenerationProviderV1,
): RemoteBoundPayloadV1 {
  const record = plainRecord(value);
  exactKeys(record, ["provider", "remoteJobId", "providerRequestId"]);
  if (record.provider !== provider) return invalid();
  if (provider === "worldlabs-marble-v1") {
    if (
      typeof record.remoteJobId !== "string" ||
      !MARBLE_REMOTE_ID.test(record.remoteJobId) ||
      record.providerRequestId !== null
    ) {
      return invalid();
    }
    return {
      provider,
      remoteJobId: record.remoteJobId,
      providerRequestId: null,
    };
  }
  if (
    typeof record.remoteJobId !== "string" ||
    !HUNYUAN_JOB_ID.test(record.remoteJobId) ||
    typeof record.providerRequestId !== "string" ||
    !UUID.test(record.providerRequestId)
  ) {
    return invalid();
  }
  return {
    provider,
    remoteJobId: record.remoteJobId,
    providerRequestId: record.providerRequestId,
  };
}

function requirePollBudget(
  value: unknown,
  provider: GenerationProviderV1,
): PollBudgetV1 {
  const record = plainRecord(value);
  exactKeys(record, [
    "cycleCount",
    "attemptCount",
    "cycleStartedAt",
    "deadlineAt",
  ]);
  const cycleCount = requireInteger(record.cycleCount, 1, 2) as 1 | 2;
  const attemptCount = requireInteger(
    record.attemptCount,
    0,
    provider === "worldlabs-marble-v1" ? 80 : 120,
  );
  const cycleStartedAt = requireTimestamp(record.cycleStartedAt);
  const deadlineAt = requireTimestamp(record.deadlineAt);
  if (Date.parse(deadlineAt) <= Date.parse(cycleStartedAt)) return invalid();
  return { cycleCount, attemptCount, cycleStartedAt, deadlineAt };
}

function requirePayload(
  state: GenerationStateV1,
  value: unknown,
  provider: GenerationProviderV1,
): Readonly<Record<string, unknown>> {
  // outputs_ready/downloading/validating 需要完整 chain 上下文（durable remote_bound
  // ancestor 与 immediate predecessor payload），pairwise 路径无法提供，必须 fail closed。
  if (state === "outputs_ready" || state === "downloading" || state === "validating") {
    return invalid();
  }
  if (state === "admitted") return requireEmptyPayload(value);
  if (state === "pre_submit_blocked") {
    const record = plainRecord(value);
    exactKeys(record, ["code", "preSubmitResumeCount"]);
    if (!PRE_SUBMIT_BLOCKED_CODES.includes(record.code as PreSubmitBlockedCodeV1)) {
      return invalid();
    }
    return {
      code: record.code as PreSubmitBlockedCodeV1,
      preSubmitResumeCount: requireInteger(record.preSubmitResumeCount, 0, 8),
    };
  }
  if (state === "submit_started") {
    const record = plainRecord(value);
    exactKeys(record, ["submitAttempt"]);
    if (record.submitAttempt !== 1) return invalid();
    return { submitAttempt: 1 };
  }
  if (state === "remote_bound") {
    return requireRemoteBoundPayload(value, provider) as unknown as PlainRecord;
  }
  if (state === "polling") {
    return requirePollBudget(value, provider) as unknown as PlainRecord;
  }
  if (state === "provider_failed") {
    const record = plainRecord(value);
    const hasCost = Object.prototype.hasOwnProperty.call(record, "sanitizedCost");
    exactKeys(record, hasCost ? ["code", "sanitizedCost"] : ["code"]);
    if (!PROVIDER_FAILED_CODES.includes(record.code as ProviderFailedCodeV1)) {
      return invalid();
    }
    if (hasCost) {
      if (provider !== "hunyuan-ai3d-v1") return invalid();
      return {
        code: record.code as ProviderFailedCodeV1,
        sanitizedCost: requireSanitizedCost(record.sanitizedCost, provider),
      };
    }
    return { code: record.code as ProviderFailedCodeV1 };
  }
  if (state === "publishing") {
    const record = plainRecord(value);
    exactKeys(record, ["operationId", "artifactSetDigest"]);
    if (
      typeof record.operationId !== "string" ||
      !OPERATION_ID.test(record.operationId)
    ) {
      return invalid();
    }
    return {
      operationId: record.operationId,
      artifactSetDigest: requireHex64(record.artifactSetDigest),
    };
  }
  if (state === "verified") {
    const record = plainRecord(value);
    exactKeys(record, ["artifactSetDigest", "publicationOperationId"]);
    if (
      typeof record.publicationOperationId !== "string" ||
      !/^op:[a-z0-9._-]{1,127}$/.test(record.publicationOperationId)
    ) {
      return invalid();
    }
    return {
      artifactSetDigest: requireHex64(record.artifactSetDigest),
      publicationOperationId: record.publicationOperationId,
    };
  }
  const record = plainRecord(value);
  exactKeys(record, ["code"]);
  if (
    state === "submission_ambiguous" &&
    record.code === "PROVIDER_SUBMISSION_AMBIGUOUS"
  ) {
    return { code: "PROVIDER_SUBMISSION_AMBIGUOUS" };
  }
  if (
    state === "recovery_required" &&
    record.code === "GENERATION_RECOVERY_REQUIRED"
  ) {
    return { code: "GENERATION_RECOVERY_REQUIRED" };
  }
  return invalid();
}

function requireState(value: unknown): GenerationStateV1 {
  if (typeof value !== "string" || !(value in TRANSITIONS)) return invalid();
  return value as GenerationStateV1;
}

interface RecordShell {
  readonly sequence: number;
  readonly previousRecordDigest: string | null;
  readonly state: GenerationStateV1;
  readonly rawPayload: unknown;
  readonly recordedAt: string;
}

function recordShell(
  value: unknown,
  intent: GenerationIntentV1,
): RecordShell {
  const record = plainRecord(value);
  exactKeys(record, [
    "schemaVersion",
    "generationId",
    "bindingDigest",
    "sequence",
    "previousRecordDigest",
    "state",
    "payload",
    "recordedAt",
  ]);
  if (
    record.schemaVersion !== 1 ||
    record.generationId !== intent.generationId ||
    record.bindingDigest !== intent.bindingDigest
  ) {
    return invalid();
  }
  return {
    sequence: requireInteger(record.sequence, 0, GENERATION_STATE_MAX_SEQUENCE),
    previousRecordDigest: record.previousRecordDigest === null
      ? null
      : requireHex64(record.previousRecordDigest),
    state: requireState(record.state),
    rawPayload: record.payload,
    recordedAt: requireTimestamp(record.recordedAt),
  };
}

function assembleRecord(
  shell: RecordShell,
  intent: GenerationIntentV1,
  payload: Readonly<Record<string, unknown>>,
): GenerationStateRecordV1 {
  const canonical: GenerationStateRecordV1 = {
    schemaVersion: 1,
    generationId: intent.generationId,
    bindingDigest: intent.bindingDigest,
    sequence: shell.sequence,
    previousRecordDigest: shell.previousRecordDigest,
    state: shell.state,
    payload,
    recordedAt: shell.recordedAt,
  };
  if (canonicalJsonBytes(canonical).byteLength > GENERATION_STATE_RECORD_MAX_BYTES) {
    return invalid();
  }
  return canonical;
}

function recordCore(
  value: unknown,
  intentInput: GenerationIntentV1,
): GenerationStateRecordV1 {
  const intent = requireGenerationIntent(intentInput);
  const shell = recordShell(value, intent);
  return assembleRecord(
    shell,
    intent,
    requirePayload(shell.state, shell.rawPayload, intent.provider) as PlainRecord,
  );
}

function bytesWithDomain(domain: string, body: Uint8Array): Uint8Array {
  const prefix = new TextEncoder().encode(`${domain}\u0000`);
  const combined = new Uint8Array(prefix.byteLength + body.byteLength);
  combined.set(prefix, 0);
  combined.set(body, prefix.byteLength);
  return combined;
}

export function generationStateRecordDigest(
  record: GenerationStateRecordV1,
): string {
  return sha256Hex(
    bytesWithDomain(
      "demiurges-generation-state-v1",
      canonicalJsonBytes(record),
    ),
  );
}

export function generationStateRecordFilename(
  record: GenerationStateRecordV1,
): string {
  return `${record.sequence.toString().padStart(16, "0")}-${generationStateRecordDigest(record)}.json`;
}

export function requireGenerationStateRecord(
  value: unknown,
  intentInput: GenerationIntentV1,
  previousInput: GenerationStateRecordV1 | null,
): GenerationStateRecordV1 {
  const intent = requireGenerationIntent(intentInput);
  const record = recordCore(value, intent);
  if (previousInput === null) {
    if (
      record.sequence !== 0 ||
      record.previousRecordDigest !== null ||
      record.state !== "admitted" ||
      record.recordedAt !== intent.createdAt
    ) {
      return invalid();
    }
  } else {
    const previous = recordCore(previousInput, intent);
    if (
      TERMINAL_STATES.includes(previous.state) ||
      record.sequence !== previous.sequence + 1 ||
      record.previousRecordDigest !== generationStateRecordDigest(previous) ||
      Date.parse(record.recordedAt) < Date.parse(previous.recordedAt) ||
      !TRANSITIONS[previous.state].includes(record.state)
    ) {
      return invalid();
    }
  }
  return deepFreeze(record) as GenerationStateRecordV1;
}

export function createInitialGenerationStateRecord(
  intentInput: GenerationIntentV1,
): GenerationStateRecordV1 {
  const intent = requireGenerationIntent(intentInput);
  return requireGenerationStateRecord(
    {
      schemaVersion: 1,
      generationId: intent.generationId,
      bindingDigest: intent.bindingDigest,
      sequence: 0,
      previousRecordDigest: null,
      state: "admitted",
      payload: {},
      recordedAt: intent.createdAt,
    },
    intent,
    null,
  );
}

export function createNextGenerationStateRecord(
  intentInput: GenerationIntentV1,
  previousInput: GenerationStateRecordV1,
  state: GenerationStateV1,
  payload: Readonly<Record<string, unknown>>,
  recordedAt: string,
): GenerationStateRecordV1 {
  const intent = requireGenerationIntent(intentInput);
  const previous = recordCore(previousInput, intent);
  return requireGenerationStateRecord(
    {
      schemaVersion: 1,
      generationId: intent.generationId,
      bindingDigest: intent.bindingDigest,
      sequence: previous.sequence + 1,
      previousRecordDigest: generationStateRecordDigest(previous),
      state,
      payload,
      recordedAt,
    },
    intent,
    previous,
  );
}

function canonicalBytesEqual(left: unknown, right: unknown): boolean {
  return Buffer.from(canonicalJsonBytes(left)).equals(
    Buffer.from(canonicalJsonBytes(right)),
  );
}

function requirePairwiseSequence(
  record: GenerationStateRecordV1,
  intent: GenerationIntentV1,
  previous: GenerationStateRecordV1 | null,
): void {
  if (previous === null) {
    if (
      record.sequence !== 0 ||
      record.previousRecordDigest !== null ||
      record.state !== "admitted" ||
      record.recordedAt !== intent.createdAt
    ) {
      return invalid();
    }
    return;
  }
  if (
    TERMINAL_STATES.includes(previous.state) ||
    record.sequence !== previous.sequence + 1 ||
    record.previousRecordDigest !== generationStateRecordDigest(previous) ||
    Date.parse(record.recordedAt) < Date.parse(previous.recordedAt) ||
    !TRANSITIONS[previous.state].includes(record.state)
  ) {
    return invalid();
  }
}

/**
 * Package-internal full-chain decoder。仅在 bounded（≤512、sequence/digest 严格
 * 有序）chain 上逐 record 解码：outputs_ready/downloading/validating 的 payload
 * authority 来自 chain 内的 durable remote_bound ancestor 与 immediate
 * predecessor payload，而不是 caller 传入的第二个 remote identity。它本身不是
 * writer，也不从 package root 导出。
 */
export function requireGenerationStateRecordChain(
  recordsInput: readonly unknown[],
  intentInput: GenerationIntentV1,
): readonly GenerationStateRecordV1[] {
  const intent = requireGenerationIntent(intentInput);
  if (
    recordsInput.length === 0 ||
    recordsInput.length > GENERATION_STATE_MAX_SEQUENCE + 1
  ) {
    return invalid();
  }
  const decoded: GenerationStateRecordV1[] = [];
  let remoteBound: RemoteBoundPayloadV1 | null = null;
  let lastPollBudget: PollBudgetV1 | null = null;
  let previous: GenerationStateRecordV1 | null = null;
  for (const raw of recordsInput) {
    const shell = recordShell(raw, intent);
    let payload: PlainRecord;
    if (shell.state === "outputs_ready") {
      if (remoteBound === null || lastPollBudget === null) return invalid();
      try {
        payload = requireOutputsReadyPayload(
          shell.rawPayload,
          intent,
          remoteBound,
          lastPollBudget,
        ) as unknown as PlainRecord;
      } catch {
        return invalid();
      }
    } else if (shell.state === "downloading" || shell.state === "validating") {
      if (remoteBound === null || previous === null) return invalid();
      if (
        previous.state !== "outputs_ready" &&
        previous.state !== "downloading"
      ) {
        return invalid();
      }
      let active: ActiveDownloadPayloadV1;
      try {
        active = requireActiveDownloadPayload(shell.rawPayload, intent, remoteBound);
      } catch {
        return invalid();
      }
      const previousPayload = previous.payload as unknown as
        | OutputsReadyPayloadV1
        | ActiveDownloadPayloadV1;
      if (
        !canonicalBytesEqual(
          active.remoteOutputIdentity,
          previousPayload.remoteOutputIdentity,
        )
      ) {
        return invalid();
      }
      if (shell.state === "validating") {
        if (previous.state !== "downloading") return invalid();
        if (
          !canonicalBytesEqual(active.downloadBudget, previousPayload.downloadBudget)
        ) {
          return invalid();
        }
        if (
          !active.downloadBudget.orderedMembers.every(
            (member) => member.stage === "candidate",
          )
        ) {
          return invalid();
        }
      } else if (previous.state === "outputs_ready") {
        // 冻结规则：outputs_ready -> downloading 只携带 byte-exact 未变的
        // initial budget（全部 idle、metadataRefreshCount=0）；任何 member 跳变
        // 或全局字段变化都必须走 downloading -> downloading 的单步 transition。
        if (
          !canonicalBytesEqual(active.downloadBudget, previousPayload.downloadBudget)
        ) {
          return invalid();
        }
      } else {
        try {
          requireDownloadBudgetTransition(
            active.downloadBudget,
            previousPayload.downloadBudget,
            intent,
            generationStateRecordDigest(previous),
          );
        } catch {
          return invalid();
        }
      }
      payload = active as unknown as PlainRecord;
    } else {
      payload = requirePayload(
        shell.state,
        shell.rawPayload,
        intent.provider,
      ) as PlainRecord;
    }
    const record = assembleRecord(shell, intent, payload);
    requirePairwiseSequence(record, intent, previous);
    if (record.state === "remote_bound") {
      remoteBound = record.payload as unknown as RemoteBoundPayloadV1;
    }
    if (record.state === "polling") {
      lastPollBudget = record.payload as unknown as PollBudgetV1;
    }
    const frozen = deepFreeze(record) as GenerationStateRecordV1;
    decoded.push(frozen);
    previous = frozen;
  }
  return decoded;
}

/**
 * Package-internal chained constructor：先完整重验 durable chain（含 early
 * states 的既有 pairwise 语义），再铸造唯一的下一条 candidate record。它不是
 * authority——authority 仍是 GenerationRecordJournal 的 durable publish 协议。
 */
export function createNextChainedGenerationStateRecord(
  intentInput: GenerationIntentV1,
  chainInput: readonly GenerationStateRecordV1[],
  state: GenerationStateV1,
  payload: Readonly<Record<string, unknown>>,
  recordedAt: string,
): GenerationStateRecordV1 {
  const intent = requireGenerationIntent(intentInput);
  if (chainInput.length === 0) return invalid();
  const previous = chainInput[chainInput.length - 1]!;
  const candidate = {
    schemaVersion: 1,
    generationId: intent.generationId,
    bindingDigest: intent.bindingDigest,
    sequence: previous.sequence + 1,
    previousRecordDigest: generationStateRecordDigest(previous),
    state,
    payload,
    recordedAt,
  };
  const validated = requireGenerationStateRecordChain([...chainInput, candidate], intent);
  return validated[validated.length - 1]!;
}
