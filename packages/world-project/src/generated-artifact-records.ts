import {
  canonicalJsonBytes,
  deepFreeze,
  sha256Hex,
} from "@demiurges/world";

import {
  requireInspectedDynamicArtifact,
  type DynamicArtifactInspectionV1,
} from "./generation-artifact-inspector";
import {
  GenerationCodecError,
  requireGenerationBindingBody,
  type GenerationBindingBodyV1,
  type GenerationProviderV1,
} from "./generation-contracts";
import {
  artifactInspectorDescriptorDigest,
  requireArtifactInspectorDescriptor,
  requireGenerationProviderJobId,
  type ArtifactInspectorDescriptorV1,
  type GeneratedArtifactOutputRole,
} from "./generation-output-contracts";

export const GENERATED_ARTIFACT_RECORD_MAX_BYTES = 64 * 1024;
export const GENERATED_ARTIFACT_RECORD_MAX_DEPTH = 8;
export const GENERATED_ARTIFACT_RECORD_MAX_NODES = 256;
export const GENERATED_ARTIFACT_RECORD_MAX_COLLECTION_ITEMS = 64;
export const GENERATED_ARTIFACT_RECORD_MAX_STRING_CHARS = 4096;

export interface VerifiedArtifactContentBodyV1 {
  readonly schemaVersion: 1;
  readonly assetId: `asset:generated-sha256-${string}`;
  readonly format: "spz-v2" | "glb-2.0";
  readonly digest: string;
  readonly byteLength: number;
  readonly elementCount: number;
  readonly sourceBounds: ArtifactInspectorDescriptorV1["sourceBounds"];
  readonly inspectorDescriptor: ArtifactInspectorDescriptorV1;
  readonly inspectorDescriptorDigest: string;
  readonly integrityStatus: "verified";
  readonly calibrationStatus: "missing";
  readonly distributionPolicy: "unknown-restricted-local";
}

export interface VerifiedArtifactContentRecordV1 extends VerifiedArtifactContentBodyV1 {
  readonly recordDigest: string;
}

export interface GenerationArtifactProvenanceBodyV1 {
  readonly schemaVersion: 1;
  readonly generationId: `generation:sha256:${string}`;
  readonly provider: GenerationProviderV1;
  readonly providerJobId: string;
  readonly generationRequestDigest: string;
  readonly outputRole: GeneratedArtifactOutputRole;
  readonly contentRecordDigest: string;
}

export interface GenerationArtifactProvenanceRecordV1
  extends GenerationArtifactProvenanceBodyV1 {
  readonly recordDigest: string;
}

export interface GeneratedArtifactSetMemberV1 {
  readonly outputRole: GeneratedArtifactOutputRole;
  readonly contentRecordDigest: string;
  readonly provenanceRecordDigest: string;
}

export interface GeneratedArtifactSetBodyV1 {
  readonly schemaVersion: 1;
  readonly generationId: `generation:sha256:${string}`;
  readonly provider: GenerationProviderV1;
  readonly orderedMembers: readonly GeneratedArtifactSetMemberV1[];
}

export interface GeneratedArtifactSetRecordV1 extends GeneratedArtifactSetBodyV1 {
  readonly artifactSetDigest: string;
}

export interface VerifiedArtifactContentByBytesPointerBodyV1 {
  readonly assetId: `asset:generated-sha256-${string}`;
  readonly contentDigest: string;
  readonly contentRecordDigest: string;
}

export interface GeneratedArtifactSetDerivationMemberV1 {
  readonly content: VerifiedArtifactContentRecordV1;
  readonly provenance: GenerationArtifactProvenanceRecordV1;
}

type PlainRecord = Record<string, unknown>;

const SHA256 = /^[a-f0-9]{64}$/;
const GENERATION_ID = /^generation:sha256:[a-f0-9]{64}$/;

function invalid(): never {
  throw new GenerationCodecError("GENERATION_RECOVERY_REQUIRED");
}

function exactKeys(record: PlainRecord, keys: readonly string[]): void {
  const actual = Reflect.ownKeys(record);
  if (
    actual.length !== keys.length ||
    actual.some((key) => typeof key !== "string") ||
    !keys.every((key) => Object.hasOwn(record, key))
  ) {
    invalid();
  }
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

function boundedPlainData(
  value: unknown,
  depth = 0,
  budget = { nodes: 0, collectionItems: 0 },
  seen = new Set<object>(),
): void {
  if (depth > GENERATED_ARTIFACT_RECORD_MAX_DEPTH) return invalid();
  budget.nodes += 1;
  if (budget.nodes > GENERATED_ARTIFACT_RECORD_MAX_NODES) return invalid();
  if (typeof value === "string") {
    if (Array.from(value).length > GENERATED_ARTIFACT_RECORD_MAX_STRING_CHARS) {
      return invalid();
    }
    return;
  }
  if (
    value === null ||
    typeof value === "boolean" ||
    (typeof value === "number" && Number.isFinite(value) && !Object.is(value, -0))
  ) {
    return;
  }
  if (Array.isArray(value)) {
    if (seen.has(value)) return invalid();
    if (
      Object.getPrototypeOf(value) !== Array.prototype ||
      Reflect.ownKeys(value).length !== value.length + 1
    ) {
      return invalid();
    }
    seen.add(value);
    budget.collectionItems += value.length;
    if (budget.collectionItems > GENERATED_ARTIFACT_RECORD_MAX_COLLECTION_ITEMS) {
      return invalid();
    }
    for (let index = 0; index < value.length; index += 1) {
      if (!Object.hasOwn(value, index)) return invalid();
      boundedPlainData(value[index], depth + 1, budget, seen);
    }
    seen.delete(value);
    return;
  }
  if (typeof value !== "object" || value === null || seen.has(value)) {
    return invalid();
  }
  seen.add(value);
  const record = plainRecord(value);
  const keys = Object.keys(record);
  budget.collectionItems += keys.length;
  if (budget.collectionItems > GENERATED_ARTIFACT_RECORD_MAX_COLLECTION_ITEMS) {
    return invalid();
  }
  for (const key of keys) boundedPlainData(record[key], depth + 1, budget, seen);
  seen.delete(value);
}

function requireRecordByteLimit(value: unknown): void {
  try {
    if (canonicalJsonBytes(value).byteLength > GENERATED_ARTIFACT_RECORD_MAX_BYTES) {
      return invalid();
    }
  } catch {
    return invalid();
  }
}

function requireSha256(value: unknown): string {
  if (typeof value !== "string" || !SHA256.test(value)) return invalid();
  return value;
}

function requireGenerationId(value: unknown): `generation:sha256:${string}` {
  if (typeof value !== "string" || !GENERATION_ID.test(value)) return invalid();
  return value as `generation:sha256:${string}`;
}

function requireRole(value: unknown): GeneratedArtifactOutputRole {
  if (
    value !== "world-spz-500k" &&
    value !== "world-collider-glb" &&
    value !== "object-glb"
  ) {
    return invalid();
  }
  return value;
}

function expectedRoles(
  provider: GenerationProviderV1,
): readonly GeneratedArtifactOutputRole[] {
  return provider === "worldlabs-marble-v1"
    ? ["world-spz-500k", "world-collider-glb"]
    : ["object-glb"];
}

function expectedFormat(
  role: GeneratedArtifactOutputRole,
): ArtifactInspectorDescriptorV1["format"] {
  return role === "world-spz-500k" ? "spz-v2" : "glb-2.0";
}

function contentDigest(body: VerifiedArtifactContentBodyV1): string {
  return sha256Hex(Buffer.concat([
    Buffer.from("demiurges-verified-artifact-content-v1\0", "utf8"),
    Buffer.from(canonicalJsonBytes(body)),
  ]));
}

function provenanceDigest(body: GenerationArtifactProvenanceBodyV1): string {
  return sha256Hex(Buffer.concat([
    Buffer.from("demiurges-generation-artifact-provenance-v1\0", "utf8"),
    Buffer.from(canonicalJsonBytes(body)),
  ]));
}

function setDigest(body: GeneratedArtifactSetBodyV1): string {
  return sha256Hex(Buffer.concat([
    Buffer.from("demiurges-generated-artifact-set-v1\0", "utf8"),
    Buffer.from(canonicalJsonBytes(body)),
  ]));
}

function requireDescriptorFromInspection(
  value: unknown,
): ArtifactInspectorDescriptorV1 {
  const inspection = requireInspectedDynamicArtifact(value);
  const descriptor = requireArtifactInspectorDescriptor(inspection.descriptor);
  if (inspection.descriptorDigest !== artifactInspectorDescriptorDigest(descriptor)) {
    return invalid();
  }
  return descriptor;
}

function requireContentBody(value: unknown): VerifiedArtifactContentBodyV1 {
  boundedPlainData(value);
  requireRecordByteLimit(value);
  const record = plainRecord(value);
  exactKeys(record, [
    "schemaVersion",
    "assetId",
    "format",
    "digest",
    "byteLength",
    "elementCount",
    "sourceBounds",
    "inspectorDescriptor",
    "inspectorDescriptorDigest",
    "integrityStatus",
    "calibrationStatus",
    "distributionPolicy",
  ]);
  const descriptor = requireArtifactInspectorDescriptor(record.inspectorDescriptor);
  const digest = requireSha256(record.digest);
  if (
    record.schemaVersion !== 1 ||
    record.assetId !== `asset:generated-sha256-${digest}` ||
    (record.format !== "spz-v2" && record.format !== "glb-2.0") ||
    !Number.isSafeInteger(record.byteLength) ||
    (record.byteLength as number) < 1 ||
    !Number.isSafeInteger(record.elementCount) ||
    (record.elementCount as number) < 1 ||
    record.inspectorDescriptorDigest !== artifactInspectorDescriptorDigest(descriptor) ||
    record.integrityStatus !== "verified" ||
    record.calibrationStatus !== "missing" ||
    record.distributionPolicy !== "unknown-restricted-local"
  ) {
    return invalid();
  }
  const sourceBounds = descriptor.sourceBounds;
  if (
    record.format !== descriptor.format ||
    digest !== descriptor.contentDigest ||
    record.byteLength !== descriptor.byteLength ||
    record.elementCount !== descriptor.elementCount ||
    Buffer.from(canonicalJsonBytes(record.sourceBounds)).compare(
      Buffer.from(canonicalJsonBytes(sourceBounds)),
    ) !== 0
  ) {
    return invalid();
  }
  return deepFreeze({
    schemaVersion: 1,
    assetId: `asset:generated-sha256-${digest}`,
    format: descriptor.format,
    digest,
    byteLength: descriptor.byteLength,
    elementCount: descriptor.elementCount,
    sourceBounds,
    inspectorDescriptor: descriptor,
    inspectorDescriptorDigest: artifactInspectorDescriptorDigest(descriptor),
    integrityStatus: "verified",
    calibrationStatus: "missing",
    distributionPolicy: "unknown-restricted-local",
  }) as VerifiedArtifactContentBodyV1;
}

export function verifiedArtifactContentRecordDigest(value: unknown): string {
  return contentDigest(requireVerifiedArtifactContentBody(value));
}

export function requireVerifiedArtifactContentBody(
  value: unknown,
): VerifiedArtifactContentBodyV1 {
  return requireContentBody(value);
}

export function requireVerifiedArtifactContentRecord(
  value: unknown,
): VerifiedArtifactContentRecordV1 {
  boundedPlainData(value);
  const record = plainRecord(value);
  exactKeys(record, [
    "schemaVersion",
    "assetId",
    "format",
    "digest",
    "byteLength",
    "elementCount",
    "sourceBounds",
    "inspectorDescriptor",
    "inspectorDescriptorDigest",
    "integrityStatus",
    "calibrationStatus",
    "distributionPolicy",
    "recordDigest",
  ]);
  const body = requireContentBody({
    schemaVersion: record.schemaVersion,
    assetId: record.assetId,
    format: record.format,
    digest: record.digest,
    byteLength: record.byteLength,
    elementCount: record.elementCount,
    sourceBounds: record.sourceBounds,
    inspectorDescriptor: record.inspectorDescriptor,
    inspectorDescriptorDigest: record.inspectorDescriptorDigest,
    integrityStatus: record.integrityStatus,
    calibrationStatus: record.calibrationStatus,
    distributionPolicy: record.distributionPolicy,
  });
  if (record.recordDigest !== contentDigest(body)) return invalid();
  return deepFreeze({ ...body, recordDigest: record.recordDigest }) as VerifiedArtifactContentRecordV1;
}

export function deriveVerifiedArtifactContentRecord(
  inspection: DynamicArtifactInspectionV1,
): VerifiedArtifactContentRecordV1 {
  boundedPlainData(inspection);
  const descriptor = requireDescriptorFromInspection(inspection);
  const body = requireContentBody({
    schemaVersion: 1,
    assetId: `asset:generated-sha256-${descriptor.contentDigest}`,
    format: descriptor.format,
    digest: descriptor.contentDigest,
    byteLength: descriptor.byteLength,
    elementCount: descriptor.elementCount,
    sourceBounds: descriptor.sourceBounds,
    inspectorDescriptor: descriptor,
    inspectorDescriptorDigest: artifactInspectorDescriptorDigest(descriptor),
    integrityStatus: "verified",
    calibrationStatus: "missing",
    distributionPolicy: "unknown-restricted-local",
  });
  return deepFreeze({ ...body, recordDigest: contentDigest(body) }) as VerifiedArtifactContentRecordV1;
}

function requireProvenanceBody(value: unknown): GenerationArtifactProvenanceBodyV1 {
  boundedPlainData(value);
  requireRecordByteLimit(value);
  const record = plainRecord(value);
  exactKeys(record, [
    "schemaVersion",
    "generationId",
    "provider",
    "providerJobId",
    "generationRequestDigest",
    "outputRole",
    "contentRecordDigest",
  ]);
  if (
    record.schemaVersion !== 1 ||
    (record.provider !== "worldlabs-marble-v1" && record.provider !== "hunyuan-ai3d-v1")
  ) {
    return invalid();
  }
  return deepFreeze({
    schemaVersion: 1,
    generationId: requireGenerationId(record.generationId),
    provider: record.provider,
    providerJobId: requireGenerationProviderJobId(record.provider, record.providerJobId),
    generationRequestDigest: requireSha256(record.generationRequestDigest),
    outputRole: (() => {
      const outputRole = requireRole(record.outputRole);
      if (!expectedRoles(record.provider).includes(outputRole)) return invalid();
      return outputRole;
    })(),
    contentRecordDigest: requireSha256(record.contentRecordDigest),
  }) as GenerationArtifactProvenanceBodyV1;
}

export function generationArtifactProvenanceRecordDigest(value: unknown): string {
  return provenanceDigest(requireGenerationArtifactProvenanceBody(value));
}

export function requireGenerationArtifactProvenanceBody(
  value: unknown,
): GenerationArtifactProvenanceBodyV1 {
  return requireProvenanceBody(value);
}

export function requireGenerationArtifactProvenanceRecord(
  value: unknown,
): GenerationArtifactProvenanceRecordV1 {
  boundedPlainData(value);
  const record = plainRecord(value);
  exactKeys(record, [
    "schemaVersion",
    "generationId",
    "provider",
    "providerJobId",
    "generationRequestDigest",
    "outputRole",
    "contentRecordDigest",
    "recordDigest",
  ]);
  const body = requireProvenanceBody({
    schemaVersion: record.schemaVersion,
    generationId: record.generationId,
    provider: record.provider,
    providerJobId: record.providerJobId,
    generationRequestDigest: record.generationRequestDigest,
    outputRole: record.outputRole,
    contentRecordDigest: record.contentRecordDigest,
  });
  if (record.recordDigest !== provenanceDigest(body)) return invalid();
  return deepFreeze({ ...body, recordDigest: record.recordDigest }) as GenerationArtifactProvenanceRecordV1;
}

export function deriveGenerationArtifactProvenanceRecord(
  generation: GenerationBindingBodyV1,
  providerJobId: string,
  outputRole: GeneratedArtifactOutputRole,
  content: VerifiedArtifactContentRecordV1,
): GenerationArtifactProvenanceRecordV1 {
  const binding = requireGenerationBindingBody(generation);
  const contentRecord = requireVerifiedArtifactContentRecord(content);
  if (contentRecord.format !== expectedFormat(outputRole)) return invalid();
  const body = requireProvenanceBody({
    schemaVersion: 1,
    generationId: binding.generationId,
    provider: binding.provider,
    providerJobId,
    generationRequestDigest: binding.requestDigest,
    outputRole,
    contentRecordDigest: contentRecord.recordDigest,
  });
  return deepFreeze({ ...body, recordDigest: provenanceDigest(body) }) as GenerationArtifactProvenanceRecordV1;
}

function requireSetBody(value: unknown): GeneratedArtifactSetBodyV1 {
  boundedPlainData(value);
  requireRecordByteLimit(value);
  const record = plainRecord(value);
  exactKeys(record, ["schemaVersion", "generationId", "provider", "orderedMembers"]);
  if (
    record.schemaVersion !== 1 ||
    (record.provider !== "worldlabs-marble-v1" && record.provider !== "hunyuan-ai3d-v1") ||
    !Array.isArray(record.orderedMembers)
  ) {
    return invalid();
  }
  const roles = expectedRoles(record.provider);
  if (
    record.orderedMembers.length !== roles.length ||
    Reflect.ownKeys(record.orderedMembers).length !== roles.length + 1
  ) {
    return invalid();
  }
  const orderedMembers = record.orderedMembers.map((valueMember, index) => {
    const member = plainRecord(valueMember);
    exactKeys(member, ["outputRole", "contentRecordDigest", "provenanceRecordDigest"]);
    if (member.outputRole !== roles[index]) return invalid();
    return {
      outputRole: roles[index]!,
      contentRecordDigest: requireSha256(member.contentRecordDigest),
      provenanceRecordDigest: requireSha256(member.provenanceRecordDigest),
    };
  });
  const allDigests = new Set<string>();
  for (const member of orderedMembers) {
    if (
      allDigests.has(member.contentRecordDigest) ||
      allDigests.has(member.provenanceRecordDigest)
    ) {
      return invalid();
    }
    allDigests.add(member.contentRecordDigest);
    allDigests.add(member.provenanceRecordDigest);
  }
  return deepFreeze({
    schemaVersion: 1,
    generationId: requireGenerationId(record.generationId),
    provider: record.provider,
    orderedMembers,
  }) as GeneratedArtifactSetBodyV1;
}

export function generatedArtifactSetDigest(value: unknown): string {
  return setDigest(requireGeneratedArtifactSetBody(value));
}

export function requireGeneratedArtifactSetBody(
  value: unknown,
): GeneratedArtifactSetBodyV1 {
  return requireSetBody(value);
}

export function requireGeneratedArtifactSetRecord(
  value: unknown,
): GeneratedArtifactSetRecordV1 {
  boundedPlainData(value);
  const record = plainRecord(value);
  exactKeys(record, [
    "schemaVersion",
    "generationId",
    "provider",
    "orderedMembers",
    "artifactSetDigest",
  ]);
  const body = requireSetBody({
    schemaVersion: record.schemaVersion,
    generationId: record.generationId,
    provider: record.provider,
    orderedMembers: record.orderedMembers,
  });
  if (record.artifactSetDigest !== setDigest(body)) return invalid();
  return deepFreeze({ ...body, artifactSetDigest: record.artifactSetDigest }) as GeneratedArtifactSetRecordV1;
}

export function deriveGeneratedArtifactSetRecord(
  provider: GenerationProviderV1,
  generationId: `generation:sha256:${string}`,
  members: readonly GeneratedArtifactSetDerivationMemberV1[],
): GeneratedArtifactSetRecordV1 {
  const expected = expectedRoles(provider);
  if (members.length !== expected.length) return invalid();
  const orderedMembers = members.map((member, index) => {
    const content = requireVerifiedArtifactContentRecord(member.content);
    const provenance = requireGenerationArtifactProvenanceRecord(member.provenance);
    if (
      provenance.provider !== provider ||
      provenance.generationId !== generationId ||
      provenance.outputRole !== expected[index] ||
      provenance.contentRecordDigest !== content.recordDigest ||
      content.format !== expectedFormat(expected[index]!)
    ) {
      return invalid();
    }
    return {
      outputRole: expected[index]!,
      contentRecordDigest: content.recordDigest,
      provenanceRecordDigest: provenance.recordDigest,
    };
  });
  const body = requireSetBody({ schemaVersion: 1, generationId, provider, orderedMembers });
  return deepFreeze({ ...body, artifactSetDigest: setDigest(body) }) as GeneratedArtifactSetRecordV1;
}

export function createVerifiedArtifactContentByBytesPointer(
  content: VerifiedArtifactContentRecordV1,
): VerifiedArtifactContentByBytesPointerBodyV1 {
  const verified = requireVerifiedArtifactContentRecord(content);
  return deepFreeze({
    assetId: verified.assetId,
    contentDigest: verified.digest,
    contentRecordDigest: verified.recordDigest,
  }) as VerifiedArtifactContentByBytesPointerBodyV1;
}

export function requireVerifiedArtifactContentByBytesPointer(
  value: unknown,
): VerifiedArtifactContentByBytesPointerBodyV1 {
  boundedPlainData(value);
  requireRecordByteLimit(value);
  const record = plainRecord(value);
  exactKeys(record, ["assetId", "contentDigest", "contentRecordDigest"]);
  const contentDigestValue = requireSha256(record.contentDigest);
  if (record.assetId !== `asset:generated-sha256-${contentDigestValue}`) return invalid();
  return deepFreeze({
    assetId: record.assetId as `asset:generated-sha256-${string}`,
    contentDigest: contentDigestValue,
    contentRecordDigest: requireSha256(record.contentRecordDigest),
  }) as VerifiedArtifactContentByBytesPointerBodyV1;
}
