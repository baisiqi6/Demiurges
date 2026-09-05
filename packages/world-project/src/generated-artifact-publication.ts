import {
  canonicalJsonBytes,
  deepFreeze,
  sha256Hex,
} from "@demiurges/world";

import {
  dataRootReceiptIntentPath,
  dataRootReceiptResultPath,
  requireLiveOpenedDataRoot,
  type OpenedDataRoot,
} from "./data-root";
import { generatedArtifactCatalogPath } from "./generated-artifact-layout";
import {
  GenerationCodecError,
  type GenerationProviderV1,
} from "./generation-contracts";
import {
  requireGeneratedSetCandidatePlanOrigin,
  type GeneratedSetCandidatePlanV1,
} from "./generated-set-candidate-plan";
import {
  revalidateGeneratedSetStoragePreflight,
  type GeneratedSetStoragePreflightSnapshotV1,
} from "./generated-set-storage-preflight";

/**
 * 只读 publication plan：把 origin-checked candidate plan 与其 origin-checked storage
 * preflight 结合为 `artifact.publish-generated-set` 的 immutable desired truth。
 * 本模块零 mutation（不 admit Operation、不写 CAS/catalog/receipts、不创建 capability、
 * 不修改 Generation state、不做 startup recovery）；plan 只是可重复核验的证据。
 */

export interface GeneratedSetPublicationBindingV1 {
  readonly schemaVersion: 1;
  readonly operationId: string;
  readonly operationKind: "artifact.publish-generated-set";
  readonly target: {
    readonly kind: "registry";
    readonly id: "registry:generated-artifact-sets-v1";
  };
  readonly expectedIdentity: null;
  readonly candidateIdentity: {
    readonly generationId: `generation:sha256:${string}`;
    readonly artifactSetDigest: string;
    readonly orderedContentRecordDigests: readonly string[];
    readonly orderedProvenanceRecordDigests: readonly string[];
  };
}

export interface GeneratedSetCatalogBodyV1 {
  readonly generationId: `generation:sha256:${string}`;
  readonly artifactSetDigest: string;
  readonly publicationOperationId: string;
  readonly publicationBindingDigest: string;
}

export type GeneratedSetPublicationResultV1 =
  | {
      readonly schemaVersion: 1;
      readonly operationId: string;
      readonly bindingDigest: string;
      readonly variant: "success";
      readonly publishedIdentity: string;
    }
  | {
      readonly schemaVersion: 1;
      readonly operationId: string;
      readonly bindingDigest: string;
      readonly variant: "aborted-before-publish";
      readonly code: string;
    };

export interface GeneratedSetPublicationPlanV1 {
  readonly schemaVersion: 1;
  readonly kind: "generated-set-publication-plan-v1";
  readonly generationId: `generation:sha256:${string}`;
  readonly provider: GenerationProviderV1;
  readonly artifactSetDigest: string;
  /** 精确 set-member 顺序；只从 candidate plan/set record 派生，不接受 caller 数组。 */
  readonly orderedContentRecordDigests: readonly string[];
  readonly orderedProvenanceRecordDigests: readonly string[];
  readonly binding: GeneratedSetPublicationBindingV1;
  readonly publicationBindingDigest: string;
  readonly catalogBody: GeneratedSetCatalogBodyV1;
  readonly catalogDigest: string;
  readonly expectedResult: GeneratedSetPublicationResultV1;
  readonly receiptIntentPath: string;
  readonly receiptResultPath: string;
  readonly catalogPath: string;
}

interface PublicationOrigin {
  readonly root: OpenedDataRoot;
  readonly rootIdentity: { readonly dev: bigint; readonly ino: bigint };
  readonly plan: GeneratedSetCandidatePlanV1;
  readonly snapshot: GeneratedSetStoragePreflightSnapshotV1;
}

const publicationOrigins = new WeakMap<object, PublicationOrigin>();

type PlainRecord = Record<string, unknown>;

const SHA256 = /^[a-f0-9]{64}$/;
const GENERATION_ID = /^generation:sha256:[a-f0-9]{64}$/;
const OPERATION_ID = /^op:[A-Za-z0-9._-]{1,127}$/;
const PUBLIC_CODE = /^[A-Z][A-Z0-9_]{1,95}$/;

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

function requireSha256(value: unknown): string {
  if (typeof value !== "string" || !SHA256.test(value)) return invalid();
  return value;
}

function requireGenerationId(value: unknown): `generation:sha256:${string}` {
  if (typeof value !== "string" || !GENERATION_ID.test(value)) return invalid();
  return value as `generation:sha256:${string}`;
}

function requireOperationId(value: unknown): string {
  if (typeof value !== "string" || !OPERATION_ID.test(value)) return invalid();
  return value;
}

function requirePublicCode(value: unknown): string {
  if (typeof value !== "string" || !PUBLIC_CODE.test(value)) return invalid();
  return value;
}

function requireDigestArray(value: unknown): readonly string[] {
  if (
    !Array.isArray(value) ||
    value.length === 0 ||
    value.length > 16 ||
    Reflect.ownKeys(value).length !== value.length + 1
  ) {
    return invalid();
  }
  return value.map((entry) => requireSha256(entry));
}

/** 固定 domain-separated preimage：catalog 证据不进入 binding 身份。 */
function publicationOperationId(
  generationId: `generation:sha256:${string}`,
  artifactSetDigest: string,
): string {
  const preimage =
    "demiurges-generated-set-publication-v1\0" +
    generationId + "\0" + artifactSetDigest;
  return `op:${sha256Hex(new TextEncoder().encode(preimage))}`;
}

/** Catalog 文件字节 digest（domain-separated）。visible commit 用它从 body 重算。 */
export function generatedSetCatalogDigest(body: GeneratedSetCatalogBodyV1): string {
  return sha256Hex(Buffer.concat([
    Buffer.from("demiurges-generated-artifact-catalog-v1\0", "utf8"),
    Buffer.from(canonicalJsonBytes(body)),
  ]));
}

export function requireGeneratedSetPublicationBinding(
  value: unknown,
): GeneratedSetPublicationBindingV1 {
  const record = plainRecord(value);
  exactKeys(record, [
    "schemaVersion",
    "operationId",
    "operationKind",
    "target",
    "expectedIdentity",
    "candidateIdentity",
  ]);
  const target = plainRecord(record.target);
  exactKeys(target, ["kind", "id"]);
  const candidate = plainRecord(record.candidateIdentity);
  exactKeys(candidate, [
    "generationId",
    "artifactSetDigest",
    "orderedContentRecordDigests",
    "orderedProvenanceRecordDigests",
  ]);
  const generationId = requireGenerationId(candidate.generationId);
  const artifactSetDigest = requireSha256(candidate.artifactSetDigest);
  const orderedContentRecordDigests = requireDigestArray(
    candidate.orderedContentRecordDigests,
  );
  const orderedProvenanceRecordDigests = requireDigestArray(
    candidate.orderedProvenanceRecordDigests,
  );
  if (
    record.schemaVersion !== 1 ||
    record.operationKind !== "artifact.publish-generated-set" ||
    record.expectedIdentity !== null ||
    target.kind !== "registry" ||
    target.id !== "registry:generated-artifact-sets-v1" ||
    orderedContentRecordDigests.length !== orderedProvenanceRecordDigests.length
  ) {
    return invalid();
  }
  const operationId = requireOperationId(record.operationId);
  if (operationId !== publicationOperationId(generationId, artifactSetDigest)) {
    return invalid();
  }
  return deepFreeze({
    schemaVersion: 1,
    operationId,
    operationKind: "artifact.publish-generated-set",
    target: { kind: "registry", id: "registry:generated-artifact-sets-v1" },
    expectedIdentity: null,
    candidateIdentity: {
      generationId,
      artifactSetDigest,
      orderedContentRecordDigests,
      orderedProvenanceRecordDigests,
    },
  }) as GeneratedSetPublicationBindingV1;
}

/** 与既有 Operation binding digest 算法 byte-compatible：SHA-256 of canonical binding bytes。 */
export function generatedSetPublicationBindingDigest(
  binding: GeneratedSetPublicationBindingV1,
): string {
  return sha256Hex(
    canonicalJsonBytes(requireGeneratedSetPublicationBinding(binding)),
  );
}

/** success / aborted-before-publish 的 exact decoder：不暴露任何 journal writer。 */
export function requireGeneratedSetPublicationResult(
  value: unknown,
  bindingInput: GeneratedSetPublicationBindingV1,
): GeneratedSetPublicationResultV1 {
  const binding = requireGeneratedSetPublicationBinding(bindingInput);
  const record = plainRecord(value);
  const bindingDigest = generatedSetPublicationBindingDigest(binding);
  if (record.variant === "success") {
    exactKeys(record, [
      "schemaVersion",
      "operationId",
      "bindingDigest",
      "variant",
      "publishedIdentity",
    ]);
    if (
      record.schemaVersion !== 1 ||
      record.operationId !== binding.operationId ||
      record.bindingDigest !== bindingDigest ||
      record.publishedIdentity !== binding.candidateIdentity.artifactSetDigest
    ) {
      return invalid();
    }
    return deepFreeze({
      schemaVersion: 1,
      operationId: binding.operationId,
      bindingDigest,
      variant: "success",
      publishedIdentity: binding.candidateIdentity.artifactSetDigest,
    }) as GeneratedSetPublicationResultV1;
  }
  exactKeys(record, [
    "schemaVersion",
    "operationId",
    "bindingDigest",
    "variant",
    "code",
  ]);
  if (
    record.schemaVersion !== 1 ||
    record.operationId !== binding.operationId ||
    record.bindingDigest !== bindingDigest ||
    record.variant !== "aborted-before-publish"
  ) {
    return invalid();
  }
  return deepFreeze({
    schemaVersion: 1,
    operationId: binding.operationId,
    bindingDigest,
    variant: "aborted-before-publish",
    code: requirePublicCode(record.code),
  }) as GeneratedSetPublicationResultV1;
}

/**
 * 把 origin-checked candidate plan 与其 origin-checked storage preflight 结合为
 * deep-frozen immutable publication plan。只读：不 admit Operation、不写任何路径。
 * storage near-revalidation 已证明 snapshot 与当前 root/plan 的关系 exact，
 * 不需要额外 identity 比较层。
 */
export function deriveGeneratedSetPublicationPlan(
  rootInput: OpenedDataRoot,
  candidatePlanInput: unknown,
  storageSnapshotInput: unknown,
): GeneratedSetPublicationPlanV1 {
  const plan = requireGeneratedSetCandidatePlanOrigin(candidatePlanInput);
  const liveRoot = requireLiveOpenedDataRoot(rootInput);
  revalidateGeneratedSetStoragePreflight(
    storageSnapshotInput,
    rootInput,
    candidatePlanInput,
  );
  const snapshot = storageSnapshotInput as GeneratedSetStoragePreflightSnapshotV1;

  const generationId = plan.generationId;
  const provider = plan.provider;
  const artifactSetDigest = plan.artifactSetRecord.artifactSetDigest;
  const orderedContentRecordDigests = plan.artifactSetRecord.orderedMembers.map(
    (member) => member.contentRecordDigest,
  );
  const orderedProvenanceRecordDigests = plan.artifactSetRecord.orderedMembers.map(
    (member) => member.provenanceRecordDigest,
  );
  const operationId = publicationOperationId(generationId, artifactSetDigest);

  const binding = deepFreeze({
    schemaVersion: 1,
    operationId,
    operationKind: "artifact.publish-generated-set",
    target: { kind: "registry", id: "registry:generated-artifact-sets-v1" },
    expectedIdentity: null,
    candidateIdentity: {
      generationId,
      artifactSetDigest,
      orderedContentRecordDigests,
      orderedProvenanceRecordDigests,
    },
  }) as GeneratedSetPublicationBindingV1;
  const publicationBindingDigest = generatedSetPublicationBindingDigest(binding);

  const catalogBody = deepFreeze({
    generationId,
    artifactSetDigest,
    publicationOperationId: operationId,
    publicationBindingDigest,
  }) as GeneratedSetCatalogBodyV1;

  const expectedResult = deepFreeze({
    schemaVersion: 1,
    operationId,
    bindingDigest: publicationBindingDigest,
    variant: "success",
    publishedIdentity: artifactSetDigest,
  }) as GeneratedSetPublicationResultV1;
  requireGeneratedSetPublicationResult(expectedResult, binding);

  const publicationPlan = deepFreeze({
    schemaVersion: 1,
    kind: "generated-set-publication-plan-v1",
    generationId,
    provider,
    artifactSetDigest,
    orderedContentRecordDigests,
    orderedProvenanceRecordDigests,
    binding,
    publicationBindingDigest,
    catalogBody,
    catalogDigest: generatedSetCatalogDigest(catalogBody),
    expectedResult,
    receiptIntentPath: dataRootReceiptIntentPath(operationId),
    receiptResultPath: dataRootReceiptResultPath(operationId),
    catalogPath: generatedArtifactCatalogPath(generationId),
  }) as GeneratedSetPublicationPlanV1;

  publicationOrigins.set(publicationPlan, {
    root: rootInput,
    rootIdentity: liveRoot.identity,
    plan,
    snapshot,
  });
  return publicationPlan;
}

/**
 * 可重复的只读 origin/revalidation check：要求本模块铸造的 plan、其候选 plan origin
 * 与其 storage snapshot origin/当前 root 均保持 exact。不 consume，不是 admission
 * capability。
 */
export function requireGeneratedSetPublicationPlanOrigin(
  value: unknown,
): GeneratedSetPublicationPlanV1 {
  if (typeof value !== "object" || value === null) return invalid();
  const origin = publicationOrigins.get(value);
  if (origin === undefined) return invalid();
  requireGeneratedSetCandidatePlanOrigin(origin.plan);
  revalidateGeneratedSetStoragePreflight(origin.snapshot, origin.root, origin.plan);
  return value as GeneratedSetPublicationPlanV1;
}

/**
 * Package-internal：在 `requireGeneratedSetPublicationPlanOrigin` 基础上额外要求
 * plan 正是为传入的这一个 live root 对象派生的，并把 origin candidate plan 一并
 * 交给下游 join（如 publication eligibility），不暴露 storage snapshot 本身。
 */
export interface GeneratedSetPublicationOriginEvidenceV1 {
  readonly plan: GeneratedSetPublicationPlanV1;
  readonly candidatePlan: GeneratedSetCandidatePlanV1;
}

export function requireGeneratedSetPublicationOriginForRoot(
  value: unknown,
  root: OpenedDataRoot,
): GeneratedSetPublicationOriginEvidenceV1 {
  if (typeof value !== "object" || value === null) return invalid();
  const origin = publicationOrigins.get(value);
  if (origin === undefined || origin.root !== root) return invalid();
  const candidatePlan = requireGeneratedSetCandidatePlanOrigin(origin.plan);
  revalidateGeneratedSetStoragePreflight(origin.snapshot, origin.root, origin.plan);
  return deepFreeze({
    plan: value as GeneratedSetPublicationPlanV1,
    candidatePlan,
  }) as GeneratedSetPublicationOriginEvidenceV1;
}

/**
 * Visible commit 专用只读 origin 变体：hidden CAS 写入后 storage targets 已由
 * absent 变为 existing，因此不再要求 pre-write storage snapshot byte-exact；
 * 仍要求 plan 由本模块为这同一个 live root 铸造、root 身份 exact，并重验
 * candidate plan origin。下游用返回的 candidate plan 对当前 durable 文件重建
 * 完整 published join。
 */
export function requireGeneratedSetPublicationOriginForVisibleCommit(
  value: unknown,
  root: OpenedDataRoot,
): GeneratedSetPublicationOriginEvidenceV1 {
  if (typeof value !== "object" || value === null) return invalid();
  const origin = publicationOrigins.get(value);
  if (origin === undefined || origin.root !== root) return invalid();
  const liveRoot = requireLiveOpenedDataRoot(root);
  if (
    liveRoot.identity.dev !== origin.rootIdentity.dev ||
    liveRoot.identity.ino !== origin.rootIdentity.ino
  ) {
    return invalid();
  }
  const candidatePlan = requireGeneratedSetCandidatePlanOrigin(origin.plan);
  return deepFreeze({
    plan: value as GeneratedSetPublicationPlanV1,
    candidatePlan,
  }) as GeneratedSetPublicationOriginEvidenceV1;
}
