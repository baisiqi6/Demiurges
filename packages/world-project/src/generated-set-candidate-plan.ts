import {
  canonicalJsonBytes,
  deepFreeze,
} from "@demiurges/world";

import {
  requireInspectedDynamicArtifact,
  type DynamicArtifactInspectionV1,
} from "./generation-artifact-inspector";
import {
  GenerationCodecError,
  requireGenerationIntent,
  type GenerationBindingBodyV1,
  type GenerationIntentV1,
  type GenerationProviderV1,
} from "./generation-contracts";
import {
  createVerifiedArtifactContentByBytesPointer,
  deriveGeneratedArtifactSetRecord,
  deriveGenerationArtifactProvenanceRecord,
  deriveVerifiedArtifactContentRecord,
  type GeneratedArtifactSetRecordV1,
  type GenerationArtifactProvenanceRecordV1,
  type VerifiedArtifactContentByBytesPointerBodyV1,
  type VerifiedArtifactContentRecordV1,
} from "./generated-artifact-records";
import {
  artifactInspectorDescriptorDigest,
  requireActiveDownloadPayload,
  requireArtifactInspectorDescriptor,
  type ActiveDownloadPayloadV1,
  type ArtifactFileIdentityV1,
  type GeneratedArtifactOutputRole,
  type RemoteOutputIdentityV1,
} from "./generation-output-contracts";
import type { RemoteBoundPayloadV1 } from "./generation-state";

export interface GeneratedSetCandidateInspectionV1 {
  readonly outputRole: GeneratedArtifactOutputRole;
  readonly inspection: DynamicArtifactInspectionV1;
}

export interface GeneratedSetCandidatePlanMemberV1 {
  readonly outputRole: GeneratedArtifactOutputRole;
  /** Expected private evidence only; later filesystem preflight must re-observe it. */
  readonly candidateName: string;
  /** Expected private evidence only; later filesystem preflight must re-observe it. */
  readonly fileIdentity: ArtifactFileIdentityV1;
  readonly contentRecord: VerifiedArtifactContentRecordV1;
  readonly byBytesPointer: VerifiedArtifactContentByBytesPointerBodyV1;
  readonly provenanceRecord: GenerationArtifactProvenanceRecordV1;
}

export interface GeneratedSetCandidatePlanV1 {
  readonly generationId: `generation:sha256:${string}`;
  readonly provider: GenerationProviderV1;
  readonly remoteJobId: string;
  readonly remoteOutputIdentity: RemoteOutputIdentityV1;
  readonly orderedMembers: readonly GeneratedSetCandidatePlanMemberV1[];
  readonly artifactSetRecord: GeneratedArtifactSetRecordV1;
}

type PlainRecord = Record<string, unknown>;

const generatedSetCandidatePlans = new WeakSet<object>();

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
    !keys.every((key) => Object.hasOwn(record, key))
  ) {
    return invalid();
  }
}

function expectedRoles(
  provider: GenerationProviderV1,
): readonly GeneratedArtifactOutputRole[] {
  return provider === "worldlabs-marble-v1"
    ? ["world-spz-500k", "world-collider-glb"]
    : ["object-glb"];
}

function sameCanonical(left: unknown, right: unknown): boolean {
  return Buffer.from(canonicalJsonBytes(left)).equals(
    Buffer.from(canonicalJsonBytes(right)),
  );
}

function bindingFromIntent(intent: GenerationIntentV1): GenerationBindingBodyV1 {
  return {
    schemaVersion: intent.schemaVersion,
    generationId: intent.generationId,
    idempotencyKey: intent.idempotencyKey,
    provider: intent.provider,
    model: intent.model,
    contractProfile: intent.contractProfile,
    contractShapeDigest: intent.contractShapeDigest,
    requestDigest: intent.requestDigest,
    canonicalRequest: intent.canonicalRequest,
    providerRequest: intent.providerRequest,
    costPolicy: intent.costPolicy,
    executionPolicy: intent.executionPolicy,
  };
}

function requireInspections(
  value: readonly GeneratedSetCandidateInspectionV1[],
  roles: readonly GeneratedArtifactOutputRole[],
): readonly GeneratedSetCandidateInspectionV1[] {
  if (
    !Array.isArray(value) ||
    value.length !== roles.length ||
    Reflect.ownKeys(value).length !== roles.length + 1
  ) {
    return invalid();
  }
  return value.map((entry, index) => {
    const record = plainRecord(entry);
    exactKeys(record, ["outputRole", "inspection"]);
    if (record.outputRole !== roles[index]) return invalid();
    return {
      outputRole: roles[index]!,
      inspection: requireInspectedDynamicArtifact(record.inspection),
    };
  });
}

function requireCandidateMatchesInspection(
  candidate: ActiveDownloadPayloadV1["downloadBudget"]["orderedMembers"][number],
  inspection: DynamicArtifactInspectionV1,
): asserts candidate is Extract<typeof candidate, { readonly stage: "candidate" }> {
  if (candidate.stage !== "candidate") return invalid();
  const descriptor = requireArtifactInspectorDescriptor(inspection.descriptor);
  if (
    inspection.descriptorDigest !== artifactInspectorDescriptorDigest(descriptor) ||
    candidate.candidate.digest !== descriptor.contentDigest ||
    candidate.candidate.byteLength !== descriptor.byteLength ||
    candidate.candidate.format !== descriptor.format ||
    candidate.candidate.elementCount !== descriptor.elementCount ||
    !sameCanonical(candidate.candidate.sourceBounds, descriptor.sourceBounds) ||
    candidate.candidate.inspectorDescriptorDigest !== inspection.descriptorDigest ||
    !sameCanonical(candidate.candidate.inspectorDescriptor, descriptor)
  ) {
    return invalid();
  }
}

/**
 * Package-internal read-only provenance guard. It does not consume a plan: the original
 * may be checked repeatedly, while a structurally equal copy or forge is rejected.
 */
export function requireGeneratedSetCandidatePlanOrigin(
  value: unknown,
): GeneratedSetCandidatePlanV1 {
  if (
    typeof value !== "object" ||
    value === null ||
    !generatedSetCandidatePlans.has(value)
  ) {
    return invalid();
  }
  return value as GeneratedSetCandidatePlanV1;
}

/** Pure semantic join; it deliberately does not observe the filesystem or CAS. */
export function deriveGeneratedSetCandidatePlan(
  intentInput: GenerationIntentV1,
  remoteBoundInput: RemoteBoundPayloadV1,
  activePayloadInput: ActiveDownloadPayloadV1,
  inspectionInputs: readonly GeneratedSetCandidateInspectionV1[],
): GeneratedSetCandidatePlanV1 {
  const intent = requireGenerationIntent(intentInput);
  const activePayload = requireActiveDownloadPayload(
    activePayloadInput,
    intent,
    remoteBoundInput,
  );
  const roles = expectedRoles(intent.provider);
  const inspections = requireInspections(inspectionInputs, roles);
  const remoteJobId = activePayload.remoteOutputIdentity.kind === "marble-world"
    ? activePayload.remoteOutputIdentity.operationId
    : activePayload.remoteOutputIdentity.jobId;
  const members = activePayload.downloadBudget.orderedMembers.map((candidate, index) => {
    const inspection = inspections[index]!.inspection;
    requireCandidateMatchesInspection(candidate, inspection);
    const contentRecord = deriveVerifiedArtifactContentRecord(inspection);
    const provenanceRecord = deriveGenerationArtifactProvenanceRecord(
      bindingFromIntent(intent),
      remoteJobId,
      candidate.outputRole,
      contentRecord,
    );
    return {
      outputRole: candidate.outputRole,
      candidateName: candidate.candidate.candidateName,
      fileIdentity: candidate.candidate.fileIdentity,
      contentRecord,
      byBytesPointer: createVerifiedArtifactContentByBytesPointer(contentRecord),
      provenanceRecord,
    };
  });
  const plan = deepFreeze({
    generationId: intent.generationId,
    provider: intent.provider,
    remoteJobId,
    remoteOutputIdentity: activePayload.remoteOutputIdentity,
    orderedMembers: members,
    artifactSetRecord: deriveGeneratedArtifactSetRecord(
      intent.provider,
      intent.generationId,
      members.map(({ contentRecord, provenanceRecord }) => ({
        content: contentRecord,
        provenance: provenanceRecord,
      })),
    ),
  }) as GeneratedSetCandidatePlanV1;
  generatedSetCandidatePlans.add(plan);
  return plan;
}

/**
 * Package-internal pure state-binding checker：证明 durable chain 携带的
 * `ActiveDownloadPayloadV1` 与 origin candidate plan 逐 member byte-exact 对应
 * （role/顺序/cardinality、candidate filename、file identity、content digest、
 * byte length、format、element count、bounds、inspector descriptor 与 digest）。
 * 复用既有 payload codec 的全部 cross-record 规则，不复制第二套 validator。
 */
export function requireGeneratedSetCandidatePlanStateBinding(
  planInput: unknown,
  intentInput: GenerationIntentV1,
  remoteBoundInput: RemoteBoundPayloadV1,
  activePayloadInput: ActiveDownloadPayloadV1,
): void {
  const plan = requireGeneratedSetCandidatePlanOrigin(planInput);
  const intent = requireGenerationIntent(intentInput);
  const payload = requireActiveDownloadPayload(
    activePayloadInput,
    intent,
    remoteBoundInput,
  );
  const remoteJobId = payload.remoteOutputIdentity.kind === "marble-world"
    ? payload.remoteOutputIdentity.operationId
    : payload.remoteOutputIdentity.jobId;
  if (
    plan.generationId !== intent.generationId ||
    plan.provider !== intent.provider ||
    plan.remoteJobId !== remoteJobId ||
    !sameCanonical(plan.remoteOutputIdentity, payload.remoteOutputIdentity)
  ) {
    return invalid();
  }
  const members = payload.downloadBudget.orderedMembers;
  if (members.length !== plan.orderedMembers.length) return invalid();
  for (const [index, member] of members.entries()) {
    const planMember = plan.orderedMembers[index]!;
    if (
      member.outputRole !== planMember.outputRole ||
      member.stage !== "candidate"
    ) {
      return invalid();
    }
    const candidate = member.candidate;
    const content = planMember.contentRecord;
    if (
      candidate.candidateName !== planMember.candidateName ||
      !sameCanonical(candidate.fileIdentity, planMember.fileIdentity) ||
      candidate.digest !== content.digest ||
      candidate.byteLength !== content.byteLength ||
      candidate.format !== content.format ||
      candidate.elementCount !== content.elementCount ||
      !sameCanonical(candidate.sourceBounds, content.sourceBounds) ||
      !sameCanonical(candidate.inspectorDescriptor, content.inspectorDescriptor) ||
      candidate.inspectorDescriptorDigest !== content.inspectorDescriptorDigest
    ) {
      return invalid();
    }
  }
}
