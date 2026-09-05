import { deepFreeze } from "@demiurges/world";

export const DATA_ROOT_RECEIPT_ENTRY_LIMIT = 2048;

export type NamespaceCapacityStateV1 =
  | "absent-no-intent"
  | "install-intent-pending"
  | "directory-published-result-pending"
  | "terminal-installed";

export type CapacityGenerationStateV1 =
  | "admitted"
  | "pre_submit_blocked"
  | "submit_started"
  | "remote_bound"
  | "polling"
  | "timed_out_cycle1"
  | "outputs_ready"
  | "downloading"
  | "validating"
  | "publishing"
  | "verified"
  | "provider_failed"
  | "artifact_rejected"
  | "timed_out_cycle2"
  | "submission_ambiguous"
  | "recovery_required";

export type PublicationCapacityEvidenceV1 =
  | "none"
  | "matching-intent-no-result"
  | "matching-intent-result"
  | "conflicting";

export interface CapacityGenerationV1 {
  readonly state: CapacityGenerationStateV1;
  readonly publicationEvidence: PublicationCapacityEvidenceV1;
}

export interface DataRootCapacityInputV1 {
  readonly usedReceiptEntries: number;
  readonly pendingResultReservations: number;
  readonly namespaceState: NamespaceCapacityStateV1;
  readonly generations: readonly CapacityGenerationV1[];
  readonly request: "none" | "operation" | "generation-birth";
}

export interface DataRootCapacityResultV1 {
  readonly status: "ready" | "capacity-reached" | "recovery-required";
  readonly usedReceiptEntries: number;
  readonly pendingResultReservations: number;
  readonly generationPublicationReservations: number;
  readonly namespaceOutstandingReservation: 0 | 1 | 3;
  readonly requestedEntries: 0 | 2;
  readonly effectiveEntries: number;
  readonly canAdmit: boolean;
}

export class DataRootCapacityError extends Error {
  readonly code = "OPERATION_RECOVERY_REQUIRED" as const;

  constructor() {
    super("OPERATION_RECOVERY_REQUIRED");
    this.name = "DataRootCapacityError";
  }
}

type PlainRecord = Record<string, unknown>;

const NAMESPACE_STATES: readonly NamespaceCapacityStateV1[] = [
  "absent-no-intent",
  "install-intent-pending",
  "directory-published-result-pending",
  "terminal-installed",
];

const GENERATION_STATES: readonly CapacityGenerationStateV1[] = [
  "admitted",
  "pre_submit_blocked",
  "submit_started",
  "remote_bound",
  "polling",
  "timed_out_cycle1",
  "outputs_ready",
  "downloading",
  "validating",
  "publishing",
  "verified",
  "provider_failed",
  "artifact_rejected",
  "timed_out_cycle2",
  "submission_ambiguous",
  "recovery_required",
];

const PUBLICATION_EVIDENCE: readonly PublicationCapacityEvidenceV1[] = [
  "none",
  "matching-intent-no-result",
  "matching-intent-result",
  "conflicting",
];

const PUBLISHABLE_STATES: readonly CapacityGenerationStateV1[] = [
  "admitted",
  "pre_submit_blocked",
  "submit_started",
  "remote_bound",
  "polling",
  "timed_out_cycle1",
  "outputs_ready",
  "downloading",
  "validating",
];

const TERMINAL_WITHOUT_PUBLICATION: readonly CapacityGenerationStateV1[] = [
  "provider_failed",
  "artifact_rejected",
  "timed_out_cycle2",
];

function recoveryRequired(): never {
  throw new DataRootCapacityError();
}

function plainRecord(value: unknown): PlainRecord {
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
  return value as PlainRecord;
}

function exactKeys(record: PlainRecord, keys: readonly string[]): void {
  const actual = Reflect.ownKeys(record);
  if (
    actual.length !== keys.length ||
    actual.some((key) => typeof key !== "string") ||
    !keys.every((key) => Object.prototype.hasOwnProperty.call(record, key))
  ) {
    recoveryRequired();
  }
}

function counter(value: unknown): number {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value < 0 ||
    value > DATA_ROOT_RECEIPT_ENTRY_LIMIT ||
    Object.is(value, -0)
  ) {
    return recoveryRequired();
  }
  return value;
}

function namespaceOutstanding(state: NamespaceCapacityStateV1): 0 | 1 | 3 {
  if (state === "absent-no-intent") return 3;
  if (state === "install-intent-pending") return 1;
  return 0;
}

function generationReservation(
  generation: CapacityGenerationV1,
): { readonly slots: 0 | 2; readonly recoveryRequired: boolean } {
  const { state, publicationEvidence } = generation;
  if (publicationEvidence === "conflicting") {
    return { slots: state === "publishing" ? 2 : 0, recoveryRequired: true };
  }
  if (PUBLISHABLE_STATES.includes(state)) {
    return publicationEvidence === "none"
      ? { slots: 2, recoveryRequired: false }
      : { slots: 0, recoveryRequired: false };
  }
  if (state === "publishing") {
    return publicationEvidence === "none"
      ? { slots: 2, recoveryRequired: true }
      : { slots: 0, recoveryRequired: false };
  }
  if (state === "verified") {
    return publicationEvidence === "matching-intent-result"
      ? { slots: 0, recoveryRequired: false }
      : { slots: 0, recoveryRequired: true };
  }
  if (TERMINAL_WITHOUT_PUBLICATION.includes(state)) {
    return publicationEvidence === "none"
      ? { slots: 0, recoveryRequired: false }
      : { slots: 0, recoveryRequired: true };
  }
  if (state === "submission_ambiguous" || state === "recovery_required") {
    return publicationEvidence === "none"
      ? { slots: 2, recoveryRequired: false }
      : { slots: 2, recoveryRequired: true };
  }
  return recoveryRequired();
}

function requireInput(value: unknown): DataRootCapacityInputV1 {
  const record = plainRecord(value);
  exactKeys(record, [
    "usedReceiptEntries",
    "pendingResultReservations",
    "namespaceState",
    "generations",
    "request",
  ]);
  if (
    !NAMESPACE_STATES.includes(record.namespaceState as NamespaceCapacityStateV1) ||
    (record.request !== "none" &&
      record.request !== "operation" &&
      record.request !== "generation-birth") ||
    !Array.isArray(record.generations) ||
    record.generations.length > 256 ||
    Reflect.ownKeys(record.generations).length !== record.generations.length + 1
  ) {
    return recoveryRequired();
  }
  const generations = record.generations.map((valueGeneration) => {
    const generation = plainRecord(valueGeneration);
    exactKeys(generation, ["state", "publicationEvidence"]);
    if (
      !GENERATION_STATES.includes(generation.state as CapacityGenerationStateV1) ||
      !PUBLICATION_EVIDENCE.includes(
        generation.publicationEvidence as PublicationCapacityEvidenceV1,
      )
    ) {
      return recoveryRequired();
    }
    return {
      state: generation.state as CapacityGenerationStateV1,
      publicationEvidence:
        generation.publicationEvidence as PublicationCapacityEvidenceV1,
    };
  });
  return {
    usedReceiptEntries: counter(record.usedReceiptEntries),
    pendingResultReservations: counter(record.pendingResultReservations),
    namespaceState: record.namespaceState as NamespaceCapacityStateV1,
    generations,
    request: record.request,
  };
}

export function calculateDataRootCapacity(
  input: DataRootCapacityInputV1,
): DataRootCapacityResultV1 {
  const value = requireInput(input);
  let generationPublicationReservations = 0;
  let hasRecoveryRequired = false;
  for (const generation of value.generations) {
    const reservation = generationReservation(generation);
    generationPublicationReservations += reservation.slots;
    hasRecoveryRequired ||= reservation.recoveryRequired;
  }
  const namespaceOutstandingReservation = namespaceOutstanding(
    value.namespaceState,
  );
  const requestedEntries = value.request === "none" ? 0 : 2;
  const effectiveEntries =
    value.usedReceiptEntries +
    value.pendingResultReservations +
    generationPublicationReservations +
    namespaceOutstandingReservation +
    requestedEntries;
  const status = hasRecoveryRequired
    ? "recovery-required"
    : effectiveEntries > DATA_ROOT_RECEIPT_ENTRY_LIMIT
      ? "capacity-reached"
      : "ready";
  return deepFreeze({
    status,
    usedReceiptEntries: value.usedReceiptEntries,
    pendingResultReservations: value.pendingResultReservations,
    generationPublicationReservations,
    namespaceOutstandingReservation,
    requestedEntries,
    effectiveEntries,
    canAdmit: status === "ready",
  }) as DataRootCapacityResultV1;
}
