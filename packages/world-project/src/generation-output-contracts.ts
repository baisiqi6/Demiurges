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
  requireRemoteBoundPayload,
  type PollBudgetV1,
  type RemoteBoundPayloadV1,
} from "./generation-state";

export type GeneratedArtifactOutputRole =
  | "world-spz-500k"
  | "world-collider-glb"
  | "object-glb";

export type RemoteOutputIdentityV1 =
  | {
      readonly kind: "marble-world";
      readonly operationId: string;
      readonly worldId: string;
      readonly spzKey: "500k";
      readonly colliderField: "collider_mesh_url";
    }
  | {
      readonly kind: "hunyuan-file-set";
      readonly jobId: string;
      readonly glbCount: 1;
      readonly objCount: 0 | 1;
    };

export type SanitizedCostV1 =
  | { readonly unit: "worldlabs-credit"; readonly amount: string }
  | { readonly unit: "hunyuan-credit"; readonly amount: string };

export interface IdleDownloadMemberV1 {
  readonly outputRole: GeneratedArtifactOutputRole;
  readonly downloadAttemptCount: 0;
  readonly stage: "idle";
  readonly candidate: null;
}

export interface InitialDownloadBudgetV1 {
  readonly pollBudget: PollBudgetV1;
  readonly metadataRefreshCount: 0;
  readonly orderedMembers: readonly IdleDownloadMemberV1[];
}

export interface ArtifactFileIdentityV1 {
  readonly dev: string;
  readonly ino: string;
  readonly mode: 0o600;
  readonly uid: number;
  readonly gid: number;
}

export interface ArtifactInspectorDescriptorV1 {
  readonly schemaVersion: 1;
  readonly inspectorProfile:
    | "spz-v2-position-bounds-v1"
    | "glb-2.0-scene-bounds-v1";
  readonly format: "spz-v2" | "glb-2.0";
  readonly contentDigest: string;
  readonly byteLength: number;
  readonly elementCount: number;
  readonly sourceBounds: {
    readonly min: readonly [number, number, number];
    readonly max: readonly [number, number, number];
  };
}

export interface DownloadCandidateV1 {
  readonly candidateName: string;
  readonly attemptCheckpointRecordDigest: string;
  readonly fileIdentity: ArtifactFileIdentityV1;
  readonly digest: string;
  readonly byteLength: number;
  readonly format: "spz-v2" | "glb-2.0";
  readonly elementCount: number;
  readonly sourceBounds: ArtifactInspectorDescriptorV1["sourceBounds"];
  readonly inspectorDescriptor: ArtifactInspectorDescriptorV1;
  readonly inspectorDescriptorDigest: string;
}

export type DownloadDiscardDispositionV1 =
  | { readonly kind: "retry-transient" }
  | {
      readonly kind: "reject-artifact";
      readonly code: "DOWNLOAD_REJECTED" | "ARTIFACT_VALIDATION_FAILED";
    };

export interface DownloadDiscardWitnessV1 {
  readonly outputRole: GeneratedArtifactOutputRole;
  readonly cycleCount: 1 | 2;
  readonly downloadAttemptCount: 1 | 2;
  readonly attemptCheckpointRecordDigest: string;
  readonly dataName: string;
  readonly ownerName: string;
  readonly fileIdentity: ArtifactFileIdentityV1;
  readonly disposition: DownloadDiscardDispositionV1;
}

export type DownloadMemberBudgetV1 =
  | IdleDownloadMemberV1
  | {
      readonly outputRole: GeneratedArtifactOutputRole;
      readonly downloadAttemptCount: 1 | 2;
      readonly stage: "reserved";
      readonly candidate: null;
    }
  | {
      readonly outputRole: GeneratedArtifactOutputRole;
      readonly downloadAttemptCount: 1 | 2;
      readonly stage: "owned-next";
      readonly attemptCheckpointRecordDigest: string;
      readonly nextName: string;
      readonly ownerName: string;
      readonly fileIdentity: ArtifactFileIdentityV1;
      readonly candidate: null;
    }
  | {
      readonly outputRole: GeneratedArtifactOutputRole;
      readonly downloadAttemptCount: 1 | 2;
      readonly stage: "discard-authorized" | "discarded";
      readonly discardWitness: DownloadDiscardWitnessV1;
      readonly candidate: null;
    }
  | {
      readonly outputRole: GeneratedArtifactOutputRole;
      readonly downloadAttemptCount: 1 | 2;
      readonly stage: "cleanup-authorized";
      readonly ownerName: string;
      readonly candidate: DownloadCandidateV1;
    }
  | {
      readonly outputRole: GeneratedArtifactOutputRole;
      readonly downloadAttemptCount: 1 | 2;
      readonly stage: "candidate";
      readonly candidate: DownloadCandidateV1;
    };

export interface DownloadBudgetV1 {
  readonly pollBudget: PollBudgetV1;
  readonly metadataRefreshCount: 0 | 1;
  readonly orderedMembers: readonly DownloadMemberBudgetV1[];
}

export interface OutputsReadyPayloadV1 {
  readonly remoteOutputIdentity: RemoteOutputIdentityV1;
  readonly downloadBudget: InitialDownloadBudgetV1;
  readonly sanitizedCost?: SanitizedCostV1;
}

export interface ActiveDownloadPayloadV1 {
  readonly remoteOutputIdentity: RemoteOutputIdentityV1;
  readonly downloadBudget: DownloadBudgetV1;
}

export interface ArtifactRejectedPayloadV1 {
  readonly code: "DOWNLOAD_REJECTED" | "ARTIFACT_VALIDATION_FAILED";
  readonly discardWitness: DownloadDiscardWitnessV1;
}

type PlainRecord = Record<string, unknown>;

const MARBLE_ID = /^[A-Za-z0-9_-]{1,256}$/;
const HUNYUAN_JOB_ID = /^[0-9]{1,32}$/;
const COST_AMOUNT = /^(?:0|[1-9][0-9]{0,11})(?:\.[0-9]{0,5}[1-9])?$/;
const SHA256 = /^[0-9a-f]{64}$/;
const DECIMAL = /^(?:0|[1-9][0-9]*)$/;
const RFC3339_MILLISECONDS =
  /^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{3}Z$/;

function invalid(): never {
  throw new GenerationCodecError("GENERATION_RECOVERY_REQUIRED");
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

function requireFileIdentity(value: unknown): ArtifactFileIdentityV1 {
  const record = plainRecord(value);
  exactKeys(record, ["dev", "ino", "mode", "uid", "gid"]);
  if (
    typeof record.dev !== "string" ||
    !DECIMAL.test(record.dev) ||
    typeof record.ino !== "string" ||
    !DECIMAL.test(record.ino) ||
    record.mode !== 0o600 ||
    !Number.isSafeInteger(record.uid) ||
    (record.uid as number) < 0 ||
    !Number.isSafeInteger(record.gid) ||
    (record.gid as number) < 0
  ) {
    return invalid();
  }
  return {
    dev: record.dev,
    ino: record.ino,
    mode: 0o600,
    uid: record.uid as number,
    gid: record.gid as number,
  };
}

function canonicalCoordinate(value: number): number {
  const withoutNegativeZero = Object.is(value, -0) ? 0 : value;
  const rounded = Number(withoutNegativeZero.toPrecision(15));
  return Object.is(rounded, -0) ? 0 : rounded;
}

function requireVec3(value: unknown): readonly [number, number, number] {
  if (
    !Array.isArray(value) ||
    value.length !== 3 ||
    Reflect.ownKeys(value).length !== 4 ||
    !value.every((entry) =>
      Number.isFinite(entry) &&
      !Object.is(entry, -0) &&
      entry === canonicalCoordinate(entry))
  ) {
    return invalid();
  }
  return [value[0] as number, value[1] as number, value[2] as number];
}

function requireBounds(value: unknown): ArtifactInspectorDescriptorV1["sourceBounds"] {
  const record = plainRecord(value);
  exactKeys(record, ["min", "max"]);
  const min = requireVec3(record.min);
  const max = requireVec3(record.max);
  if (!min.every((entry, index) => entry < max[index]!)) return invalid();
  return { min, max };
}

function expectedFormat(
  role: GeneratedArtifactOutputRole,
): ArtifactInspectorDescriptorV1["format"] {
  return role === "world-spz-500k" ? "spz-v2" : "glb-2.0";
}

function maxBytes(role: GeneratedArtifactOutputRole): number {
  if (role === "world-spz-500k") return 16 * 1024 * 1024;
  if (role === "world-collider-glb") return 32 * 1024 * 1024;
  return 64 * 1024 * 1024;
}

/** Exact provider-issued job identity, shared by private output and record codecs. */
export function requireGenerationProviderJobId(
  provider: GenerationProviderV1,
  value: unknown,
): string {
  if (
    typeof value !== "string" ||
    (provider === "worldlabs-marble-v1"
      ? !MARBLE_ID.test(value)
      : !HUNYUAN_JOB_ID.test(value))
  ) {
    return invalid();
  }
  return value;
}

function attemptBasename(
  role: GeneratedArtifactOutputRole,
  cycleCount: 1 | 2,
  downloadAttemptCount: 1 | 2,
  checkpointDigest: string,
): string {
  if (!SHA256.test(checkpointDigest)) return invalid();
  return `${role}-c${cycleCount}-a${downloadAttemptCount}-${checkpointDigest}`;
}

export function requireArtifactInspectorDescriptor(
  value: unknown,
): ArtifactInspectorDescriptorV1 {
  const record = plainRecord(value);
  exactKeys(record, [
    "schemaVersion",
    "inspectorProfile",
    "format",
    "contentDigest",
    "byteLength",
    "elementCount",
    "sourceBounds",
  ]);
  const profileMatches =
    (record.format === "spz-v2" &&
      record.inspectorProfile === "spz-v2-position-bounds-v1") ||
    (record.format === "glb-2.0" &&
      record.inspectorProfile === "glb-2.0-scene-bounds-v1");
  if (
    record.schemaVersion !== 1 ||
    !profileMatches ||
    typeof record.contentDigest !== "string" ||
    !SHA256.test(record.contentDigest) ||
    !Number.isSafeInteger(record.byteLength) ||
    (record.byteLength as number) <= 0 ||
    (record.byteLength as number) > 64 * 1024 * 1024 ||
    !Number.isSafeInteger(record.elementCount) ||
    (record.elementCount as number) <= 0
  ) {
    return invalid();
  }
  return deepFreeze({
    schemaVersion: 1,
    inspectorProfile: record.inspectorProfile,
    format: record.format,
    contentDigest: record.contentDigest,
    byteLength: record.byteLength,
    elementCount: record.elementCount,
    sourceBounds: requireBounds(record.sourceBounds),
  }) as ArtifactInspectorDescriptorV1;
}

export function artifactInspectorDescriptorDigest(value: unknown): string {
  const descriptor = requireArtifactInspectorDescriptor(value);
  return sha256Hex(
    Buffer.concat([
      Buffer.from("demiurges-artifact-inspector-descriptor-v1\0", "utf8"),
      Buffer.from(canonicalJsonBytes(descriptor)),
    ]),
  );
}

export function requireDownloadCandidate(
  value: unknown,
  outputRole: GeneratedArtifactOutputRole,
  cycleCount: 1 | 2,
  downloadAttemptCount: 1 | 2,
  attemptCheckpointRecordDigest: string,
): DownloadCandidateV1 {
  const record = plainRecord(value);
  exactKeys(record, [
    "candidateName",
    "attemptCheckpointRecordDigest",
    "fileIdentity",
    "digest",
    "byteLength",
    "format",
    "elementCount",
    "sourceBounds",
    "inspectorDescriptor",
    "inspectorDescriptorDigest",
  ]);
  const descriptor = requireArtifactInspectorDescriptor(record.inspectorDescriptor);
  const sourceBounds = requireBounds(record.sourceBounds);
  const basename = attemptBasename(
    outputRole,
    cycleCount,
    downloadAttemptCount,
    attemptCheckpointRecordDigest,
  );
  if (
    record.candidateName !== `${basename}.bin` ||
    record.attemptCheckpointRecordDigest !== attemptCheckpointRecordDigest ||
    typeof record.digest !== "string" ||
    !SHA256.test(record.digest) ||
    record.digest !== descriptor.contentDigest ||
    !Number.isSafeInteger(record.byteLength) ||
    (record.byteLength as number) <= 0 ||
    (record.byteLength as number) > maxBytes(outputRole) ||
    record.byteLength !== descriptor.byteLength ||
    record.format !== expectedFormat(outputRole) ||
    record.format !== descriptor.format ||
    record.elementCount !== descriptor.elementCount ||
    Buffer.from(canonicalJsonBytes(sourceBounds)).compare(
      Buffer.from(canonicalJsonBytes(descriptor.sourceBounds)),
    ) !== 0 ||
    record.inspectorDescriptorDigest !== artifactInspectorDescriptorDigest(descriptor)
  ) {
    return invalid();
  }
  return deepFreeze({
    candidateName: record.candidateName,
    attemptCheckpointRecordDigest,
    fileIdentity: requireFileIdentity(record.fileIdentity),
    digest: record.digest,
    byteLength: record.byteLength,
    format: record.format,
    elementCount: record.elementCount,
    sourceBounds,
    inspectorDescriptor: descriptor,
    inspectorDescriptorDigest: record.inspectorDescriptorDigest,
  }) as DownloadCandidateV1;
}

export function requireDownloadDiscardWitness(
  value: unknown,
): DownloadDiscardWitnessV1 {
  const record = plainRecord(value);
  exactKeys(record, [
    "outputRole",
    "cycleCount",
    "downloadAttemptCount",
    "attemptCheckpointRecordDigest",
    "dataName",
    "ownerName",
    "fileIdentity",
    "disposition",
  ]);
  if (
    record.outputRole !== "world-spz-500k" &&
    record.outputRole !== "world-collider-glb" &&
    record.outputRole !== "object-glb"
  ) {
    return invalid();
  }
  if (
    (record.cycleCount !== 1 && record.cycleCount !== 2) ||
    (record.downloadAttemptCount !== 1 && record.downloadAttemptCount !== 2) ||
    typeof record.attemptCheckpointRecordDigest !== "string"
  ) {
    return invalid();
  }
  const basename = attemptBasename(
    record.outputRole,
    record.cycleCount,
    record.downloadAttemptCount,
    record.attemptCheckpointRecordDigest,
  );
  if (
    (record.dataName !== `${basename}.next` &&
      record.dataName !== `${basename}.bin`) ||
    record.ownerName !== `${basename}.owner`
  ) {
    return invalid();
  }
  const disposition = plainRecord(record.disposition);
  if (disposition.kind === "retry-transient") {
    exactKeys(disposition, ["kind"]);
  } else if (disposition.kind === "reject-artifact") {
    exactKeys(disposition, ["kind", "code"]);
    if (
      disposition.code !== "DOWNLOAD_REJECTED" &&
      disposition.code !== "ARTIFACT_VALIDATION_FAILED"
    ) {
      return invalid();
    }
  } else {
    return invalid();
  }
  return deepFreeze({
    outputRole: record.outputRole,
    cycleCount: record.cycleCount,
    downloadAttemptCount: record.downloadAttemptCount,
    attemptCheckpointRecordDigest: record.attemptCheckpointRecordDigest,
    dataName: record.dataName,
    ownerName: record.ownerName,
    fileIdentity: requireFileIdentity(record.fileIdentity),
    disposition: { ...disposition },
  }) as DownloadDiscardWitnessV1;
}

function sameCanonical(left: unknown, right: unknown): boolean {
  return Buffer.from(canonicalJsonBytes(left)).equals(
    Buffer.from(canonicalJsonBytes(right)),
  );
}

function requireDownloadMember(
  value: unknown,
  role: GeneratedArtifactOutputRole,
  cycleCount: 1 | 2,
): DownloadMemberBudgetV1 {
  const record = plainRecord(value);
  if (record.outputRole !== role || typeof record.stage !== "string") {
    return invalid();
  }
  if (record.stage === "idle") {
    exactKeys(record, ["outputRole", "downloadAttemptCount", "stage", "candidate"]);
    if (record.downloadAttemptCount !== 0 || record.candidate !== null) return invalid();
    return { outputRole: role, downloadAttemptCount: 0, stage: "idle", candidate: null };
  }
  if (record.downloadAttemptCount !== 1 && record.downloadAttemptCount !== 2) {
    return invalid();
  }
  const attempt = record.downloadAttemptCount;
  if (record.stage === "reserved") {
    exactKeys(record, ["outputRole", "downloadAttemptCount", "stage", "candidate"]);
    if (record.candidate !== null) return invalid();
    return { outputRole: role, downloadAttemptCount: attempt, stage: "reserved", candidate: null };
  }
  if (record.stage === "owned-next") {
    exactKeys(record, [
      "outputRole",
      "downloadAttemptCount",
      "stage",
      "attemptCheckpointRecordDigest",
      "nextName",
      "ownerName",
      "fileIdentity",
      "candidate",
    ]);
    if (
      record.candidate !== null ||
      typeof record.attemptCheckpointRecordDigest !== "string"
    ) {
      return invalid();
    }
    const basename = attemptBasename(
      role,
      cycleCount,
      attempt,
      record.attemptCheckpointRecordDigest,
    );
    if (
      record.nextName !== `${basename}.next` ||
      record.ownerName !== `${basename}.owner`
    ) {
      return invalid();
    }
    return {
      outputRole: role,
      downloadAttemptCount: attempt,
      stage: "owned-next",
      attemptCheckpointRecordDigest: record.attemptCheckpointRecordDigest,
      nextName: record.nextName,
      ownerName: record.ownerName,
      fileIdentity: requireFileIdentity(record.fileIdentity),
      candidate: null,
    };
  }
  if (record.stage === "discard-authorized" || record.stage === "discarded") {
    exactKeys(record, [
      "outputRole",
      "downloadAttemptCount",
      "stage",
      "discardWitness",
      "candidate",
    ]);
    if (record.candidate !== null) return invalid();
    const discardWitness = requireDownloadDiscardWitness(record.discardWitness);
    if (
      discardWitness.outputRole !== role ||
      discardWitness.cycleCount !== cycleCount ||
      discardWitness.downloadAttemptCount !== attempt
    ) {
      return invalid();
    }
    return {
      outputRole: role,
      downloadAttemptCount: attempt,
      stage: record.stage,
      discardWitness,
      candidate: null,
    };
  }
  if (record.stage === "cleanup-authorized") {
    exactKeys(record, [
      "outputRole",
      "downloadAttemptCount",
      "stage",
      "ownerName",
      "candidate",
    ]);
    const candidateRecord = plainRecord(record.candidate);
    if (typeof candidateRecord.attemptCheckpointRecordDigest !== "string") {
      return invalid();
    }
    const candidate = requireDownloadCandidate(
      candidateRecord,
      role,
      cycleCount,
      attempt,
      candidateRecord.attemptCheckpointRecordDigest,
    );
    const basename = candidate.candidateName.slice(0, -".bin".length);
    if (record.ownerName !== `${basename}.owner`) return invalid();
    return {
      outputRole: role,
      downloadAttemptCount: attempt,
      stage: "cleanup-authorized",
      ownerName: record.ownerName,
      candidate,
    };
  }
  if (record.stage === "candidate") {
    exactKeys(record, ["outputRole", "downloadAttemptCount", "stage", "candidate"]);
    const candidateRecord = plainRecord(record.candidate);
    if (typeof candidateRecord.attemptCheckpointRecordDigest !== "string") {
      return invalid();
    }
    return {
      outputRole: role,
      downloadAttemptCount: attempt,
      stage: "candidate",
      candidate: requireDownloadCandidate(
        candidateRecord,
        role,
        cycleCount,
        attempt,
        candidateRecord.attemptCheckpointRecordDigest,
      ),
    };
  }
  return invalid();
}

export function requireDownloadBudget(
  value: unknown,
  intentInput: GenerationIntentV1,
): DownloadBudgetV1 {
  const intent = requireGenerationIntent(intentInput);
  const record = plainRecord(value);
  exactKeys(record, ["pollBudget", "metadataRefreshCount", "orderedMembers"]);
  if (
    (record.metadataRefreshCount !== 0 && record.metadataRefreshCount !== 1) ||
    !Array.isArray(record.orderedMembers)
  ) {
    return invalid();
  }
  const pollBudget = requirePollBudget(record.pollBudget, intent.provider);
  const roles = expectedRoles(intent.provider);
  if (
    record.orderedMembers.length !== roles.length ||
    Reflect.ownKeys(record.orderedMembers).length !== roles.length + 1
  ) {
    return invalid();
  }
  const orderedMembers = record.orderedMembers.map((member, index) =>
    requireDownloadMember(member, roles[index]!, pollBudget.cycleCount)
  );
  let activeSeen = false;
  let idleSeen = false;
  for (const member of orderedMembers) {
    if (member.stage === "candidate") {
      if (activeSeen || idleSeen) return invalid();
      continue;
    }
    if (member.stage === "idle") {
      idleSeen = true;
      continue;
    }
    if (activeSeen || idleSeen) return invalid();
    activeSeen = true;
  }
  return deepFreeze({
    pollBudget,
    metadataRefreshCount: record.metadataRefreshCount,
    orderedMembers,
  }) as DownloadBudgetV1;
}

export function requireDownloadBudgetTransition(
  nextInput: unknown,
  previousInput: unknown,
  intentInput: GenerationIntentV1,
  previousRecordDigest: string,
): DownloadBudgetV1 {
  if (!SHA256.test(previousRecordDigest)) return invalid();
  const intent = requireGenerationIntent(intentInput);
  const previous = requireDownloadBudget(previousInput, intent);
  const next = requireDownloadBudget(nextInput, intent);
  if (next.pollBudget.cycleCount !== previous.pollBudget.cycleCount) return invalid();
  const changedMembers = next.orderedMembers
    .map((member, index) => sameCanonical(member, previous.orderedMembers[index]) ? -1 : index)
    .filter((index) => index >= 0);
  const pollChanged = !sameCanonical(next.pollBudget, previous.pollBudget);
  const refreshChanged = next.metadataRefreshCount !== previous.metadataRefreshCount;
  if (changedMembers.length > 1) return invalid();
  if (changedMembers.length === 0) {
    if (!pollChanged || !refreshChanged) return invalid();
    if (
      previous.metadataRefreshCount !== 0 ||
      next.metadataRefreshCount !== 1 ||
      next.pollBudget.attemptCount !== previous.pollBudget.attemptCount + 1 ||
      next.pollBudget.cycleStartedAt !== previous.pollBudget.cycleStartedAt ||
      next.pollBudget.deadlineAt !== previous.pollBudget.deadlineAt
    ) {
      return invalid();
    }
    return next;
  }
  if (pollChanged || refreshChanged) return invalid();
  const index = changedMembers[0]!;
  const before = previous.orderedMembers[index]!;
  const after = next.orderedMembers[index]!;
  if (before.outputRole !== after.outputRole) return invalid();
  if (before.stage === "idle" && after.stage === "reserved") {
    if (after.downloadAttemptCount !== 1) return invalid();
  } else if (before.stage === "reserved" && after.stage === "owned-next") {
    if (
      after.downloadAttemptCount !== before.downloadAttemptCount ||
      after.attemptCheckpointRecordDigest !== previousRecordDigest
    ) {
      return invalid();
    }
  } else if (before.stage === "owned-next" && after.stage === "cleanup-authorized") {
    if (
      after.downloadAttemptCount !== before.downloadAttemptCount ||
      after.candidate.attemptCheckpointRecordDigest !== before.attemptCheckpointRecordDigest ||
      !sameCanonical(after.candidate.fileIdentity, before.fileIdentity)
    ) {
      return invalid();
    }
  } else if (before.stage === "cleanup-authorized" && after.stage === "candidate") {
    if (
      after.downloadAttemptCount !== before.downloadAttemptCount ||
      !sameCanonical(after.candidate, before.candidate)
    ) {
      return invalid();
    }
  } else if (before.stage === "owned-next" && after.stage === "discard-authorized") {
    const witness = after.discardWitness;
    const expectedDataNames = [before.nextName, before.nextName.slice(0, -5) + ".bin"];
    if (
      after.downloadAttemptCount !== before.downloadAttemptCount ||
      witness.attemptCheckpointRecordDigest !== before.attemptCheckpointRecordDigest ||
      witness.ownerName !== before.ownerName ||
      !expectedDataNames.includes(witness.dataName) ||
      !sameCanonical(witness.fileIdentity, before.fileIdentity)
    ) {
      return invalid();
    }
  } else if (before.stage === "discard-authorized" && after.stage === "discarded") {
    if (!sameCanonical(after.discardWitness, before.discardWitness)) return invalid();
  } else if (before.stage === "discarded" && after.stage === "reserved") {
    if (
      before.downloadAttemptCount !== 1 ||
      after.downloadAttemptCount !== 2 ||
      before.discardWitness.disposition.kind !== "retry-transient"
    ) {
      return invalid();
    }
  } else {
    return invalid();
  }
  return next;
}

export function requireOutputsReadyPayload(
  value: unknown,
  intentInput: GenerationIntentV1,
  remoteBoundInput: RemoteBoundPayloadV1,
  currentPollBudgetInput: PollBudgetV1,
): OutputsReadyPayloadV1 {
  const intent = requireGenerationIntent(intentInput);
  const record = plainRecord(value);
  const hasCost = Object.prototype.hasOwnProperty.call(record, "sanitizedCost");
  exactKeys(record, hasCost
    ? ["remoteOutputIdentity", "downloadBudget", "sanitizedCost"]
    : ["remoteOutputIdentity", "downloadBudget"]);
  const currentPollBudget = requirePollBudget(currentPollBudgetInput, intent.provider);
  const downloadBudget = requireInitialDownloadBudget(record.downloadBudget, intent);
  if (!sameCanonical(downloadBudget.pollBudget, currentPollBudget)) return invalid();
  const result: OutputsReadyPayloadV1 = {
    remoteOutputIdentity: requireRemoteOutputIdentity(
      record.remoteOutputIdentity,
      intent,
      remoteBoundInput,
    ),
    downloadBudget,
    ...(hasCost
      ? { sanitizedCost: requireSanitizedCost(record.sanitizedCost, intent.provider) }
      : {}),
  };
  return deepFreeze(result) as OutputsReadyPayloadV1;
}

export function requireActiveDownloadPayload(
  value: unknown,
  intentInput: GenerationIntentV1,
  remoteBoundInput: RemoteBoundPayloadV1,
): ActiveDownloadPayloadV1 {
  const intent = requireGenerationIntent(intentInput);
  const record = plainRecord(value);
  exactKeys(record, ["remoteOutputIdentity", "downloadBudget"]);
  return deepFreeze({
    remoteOutputIdentity: requireRemoteOutputIdentity(
      record.remoteOutputIdentity,
      intent,
      remoteBoundInput,
    ),
    downloadBudget: requireDownloadBudget(record.downloadBudget, intent),
  }) as ActiveDownloadPayloadV1;
}

export function requireArtifactRejectedPayload(
  value: unknown,
): ArtifactRejectedPayloadV1 {
  const record = plainRecord(value);
  exactKeys(record, ["code", "discardWitness"]);
  const discardWitness = requireDownloadDiscardWitness(record.discardWitness);
  if (
    discardWitness.disposition.kind !== "reject-artifact" ||
    record.code !== discardWitness.disposition.code
  ) {
    return invalid();
  }
  return deepFreeze({
    code: record.code,
    discardWitness,
  }) as ArtifactRejectedPayloadV1;
}

function requirePollBudget(
  value: unknown,
  provider: GenerationProviderV1,
): PollBudgetV1 {
  const record = plainRecord(value);
  exactKeys(record, ["cycleCount", "attemptCount", "cycleStartedAt", "deadlineAt"]);
  const maxAttempts = provider === "worldlabs-marble-v1" ? 80 : 120;
  if (
    (record.cycleCount !== 1 && record.cycleCount !== 2) ||
    !Number.isSafeInteger(record.attemptCount) ||
    (record.attemptCount as number) < 0 ||
    (record.attemptCount as number) > maxAttempts ||
    typeof record.cycleStartedAt !== "string" ||
    typeof record.deadlineAt !== "string" ||
    !RFC3339_MILLISECONDS.test(record.cycleStartedAt) ||
    !RFC3339_MILLISECONDS.test(record.deadlineAt) ||
    new Date(record.cycleStartedAt).toISOString() !== record.cycleStartedAt ||
    new Date(record.deadlineAt).toISOString() !== record.deadlineAt ||
    Date.parse(record.deadlineAt) <= Date.parse(record.cycleStartedAt)
  ) {
    return invalid();
  }
  return {
    cycleCount: record.cycleCount,
    attemptCount: record.attemptCount as number,
    cycleStartedAt: record.cycleStartedAt,
    deadlineAt: record.deadlineAt,
  };
}

function requireRemoteBound(
  value: RemoteBoundPayloadV1,
  intent: GenerationIntentV1,
): RemoteBoundPayloadV1 {
  try {
    return requireRemoteBoundPayload(value, intent.provider);
  } catch {
    return invalid();
  }
}

export function requireRemoteOutputIdentity(
  value: unknown,
  intentInput: GenerationIntentV1,
  remoteBoundInput: RemoteBoundPayloadV1,
): RemoteOutputIdentityV1 {
  const intent = requireGenerationIntent(intentInput);
  const remoteBound = requireRemoteBound(remoteBoundInput, intent);
  const record = plainRecord(value);
  if (intent.provider === "worldlabs-marble-v1") {
    exactKeys(record, [
      "kind",
      "operationId",
      "worldId",
      "spzKey",
      "colliderField",
    ]);
    if (
      record.kind !== "marble-world" ||
      record.operationId !== remoteBound.remoteJobId ||
      typeof record.worldId !== "string" ||
      !MARBLE_ID.test(record.worldId) ||
      record.spzKey !== "500k" ||
      record.colliderField !== "collider_mesh_url"
    ) {
      return invalid();
    }
    return deepFreeze({ ...record }) as RemoteOutputIdentityV1;
  }
  exactKeys(record, ["kind", "jobId", "glbCount", "objCount"]);
  if (
    record.kind !== "hunyuan-file-set" ||
    record.jobId !== remoteBound.remoteJobId ||
    record.glbCount !== 1 ||
    (record.objCount !== 0 && record.objCount !== 1)
  ) {
    return invalid();
  }
  return deepFreeze({ ...record }) as RemoteOutputIdentityV1;
}

export function requireSanitizedCost(
  value: unknown,
  provider: GenerationProviderV1,
): SanitizedCostV1 {
  const record = plainRecord(value);
  exactKeys(record, ["unit", "amount"]);
  const expectedUnit = provider === "worldlabs-marble-v1"
    ? "worldlabs-credit"
    : "hunyuan-credit";
  if (
    record.unit !== expectedUnit ||
    typeof record.amount !== "string" ||
    !COST_AMOUNT.test(record.amount)
  ) {
    return invalid();
  }
  return deepFreeze({
    unit: expectedUnit,
    amount: record.amount,
  }) as SanitizedCostV1;
}

function expectedRoles(provider: GenerationProviderV1): readonly GeneratedArtifactOutputRole[] {
  return provider === "worldlabs-marble-v1"
    ? ["world-spz-500k", "world-collider-glb"]
    : ["object-glb"];
}

export function createInitialDownloadBudget(
  intentInput: GenerationIntentV1,
  pollBudgetInput: PollBudgetV1,
): InitialDownloadBudgetV1 {
  const intent = requireGenerationIntent(intentInput);
  const pollBudget = requirePollBudget(pollBudgetInput, intent.provider);
  return deepFreeze({
    pollBudget,
    metadataRefreshCount: 0,
    orderedMembers: expectedRoles(intent.provider).map((outputRole) => ({
      outputRole,
      downloadAttemptCount: 0 as const,
      stage: "idle" as const,
      candidate: null,
    })),
  }) as InitialDownloadBudgetV1;
}

export function requireInitialDownloadBudget(
  value: unknown,
  intentInput: GenerationIntentV1,
): InitialDownloadBudgetV1 {
  const intent = requireGenerationIntent(intentInput);
  const record = plainRecord(value);
  exactKeys(record, ["pollBudget", "metadataRefreshCount", "orderedMembers"]);
  if (record.metadataRefreshCount !== 0 || !Array.isArray(record.orderedMembers)) {
    return invalid();
  }
  const roles = expectedRoles(intent.provider);
  if (
    record.orderedMembers.length !== roles.length ||
    Reflect.ownKeys(record.orderedMembers).length !== roles.length + 1
  ) {
    return invalid();
  }
  const orderedMembers = record.orderedMembers.map((valueMember, index) => {
    const member = plainRecord(valueMember);
    exactKeys(member, ["outputRole", "downloadAttemptCount", "stage", "candidate"]);
    if (
      member.outputRole !== roles[index] ||
      member.downloadAttemptCount !== 0 ||
      member.stage !== "idle" ||
      member.candidate !== null
    ) {
      return invalid();
    }
    return {
      outputRole: roles[index]!,
      downloadAttemptCount: 0 as const,
      stage: "idle" as const,
      candidate: null,
    };
  });
  return deepFreeze({
    pollBudget: requirePollBudget(record.pollBudget, intent.provider),
    metadataRefreshCount: 0,
    orderedMembers,
  }) as InitialDownloadBudgetV1;
}
