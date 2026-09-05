import { canonicalJsonBytes, deepFreeze } from "@demiurges/world";
import { join } from "node:path";

import {
  requireLiveOpenedDataRoot,
  type OpenedDataRoot,
} from "./data-root";
import {
  requireLiveDataRootWriterLease,
  type DataRootWriterLease,
} from "./data-root-lease";
import {
  requireGenerationBirthPointer,
  generationIdDigest,
} from "./generation-birth";
import {
  GenerationCodecError,
  requireGenerationIntent,
  type GenerationIntentV1,
  type GenerationProviderV1,
} from "./generation-contracts";
import { GenerationRecordJournal } from "./generation-record-journal";
import {
  generationStateRecordDigest,
  type GenerationStateRecordV1,
  type RemoteBoundPayloadV1,
} from "./generation-state";
import {
  requireGeneratedSetCandidatePlanStateBinding,
} from "./generated-set-candidate-plan";
import type { ActiveDownloadPayloadV1 } from "./generation-output-contracts";
import {
  requireGeneratedSetPublicationOriginForRoot,
  type GeneratedSetPublicationPlanV1,
} from "./generated-artifact-publication";
import { readStableRegularFileSnapshot } from "./safe-filesystem";

/**
 * 只读 publication eligibility join：证明一个 origin-checked
 * `GeneratedSetPublicationPlanV1` 仍是当前 durable Generation `validating` head 的
 * exact publication truth。本模块零 mutation（不铸造 admission capability、不预留
 * capacity、不进入 single-flight、不写 Operation intent / `publishing` state /
 * CAS / catalog / result、不修改 startup recovery），结果可重复 revalidate。
 */

export interface GeneratedSetPublicationEligibilityV1 {
  readonly schemaVersion: 1;
  readonly kind: "generated-set-publication-eligibility-v1";
  readonly generationId: `generation:sha256:${string}`;
  readonly provider: GenerationProviderV1;
  readonly validatingSequence: number;
  readonly validatingRecordDigest: string;
  readonly publicationOperationId: string;
  readonly publicationBindingDigest: string;
  readonly artifactSetDigest: string;
}

interface EligibilityOrigin {
  readonly root: OpenedDataRoot;
  readonly lease: DataRootWriterLease;
  readonly intent: GenerationIntentV1;
  readonly publicationPlan: GeneratedSetPublicationPlanV1;
  readonly validatingSequence: number;
  readonly validatingRecordDigest: string;
}

const eligibilityOrigins = new WeakMap<object, EligibilityOrigin>();

function invalid(): never {
  throw new GenerationCodecError("GENERATION_RECOVERY_REQUIRED");
}

function parseCanonicalJsonBytes(bytes: Uint8Array): unknown {
  let value: unknown;
  try {
    value = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    return invalid();
  }
  if (!Buffer.from(canonicalJsonBytes(value)).equals(Buffer.from(bytes))) {
    return invalid();
  }
  return value;
}

/** 选定 Generation 的 durable birth anchor：intent.json、admitted record、catalog pointer。 */
function requireBirthAnchor(
  rootPath: string,
  intent: GenerationIntentV1,
  admitted: GenerationStateRecordV1,
): void {
  const pointerPath = join(
    rootPath,
    "receipts",
    "generations",
    "catalog",
    `${generationIdDigest(intent.generationId)}.json`,
  );
  let bytes: Uint8Array;
  try {
    bytes = readStableRegularFileSnapshot(pointerPath, 4096).bytes;
  } catch {
    return invalid();
  }
  try {
    requireGenerationBirthPointer(
      parseCanonicalJsonBytes(bytes),
      intent,
      admitted,
    );
  } catch {
    return invalid();
  }
}

function requireRemoteBoundAncestor(
  chain: readonly GenerationStateRecordV1[],
): RemoteBoundPayloadV1 {
  for (let index = chain.length - 1; index >= 0; index -= 1) {
    const record = chain[index]!;
    if (record.state === "remote_bound") {
      return record.payload as unknown as RemoteBoundPayloadV1;
    }
  }
  return invalid();
}

interface VerifiedEligibilityInputs {
  readonly intent: GenerationIntentV1;
  readonly publicationPlan: GeneratedSetPublicationPlanV1;
  readonly validatingSequence: number;
  readonly validatingRecordDigest: string;
}

function verifyEligibilityInputs(
  root: OpenedDataRoot,
  lease: DataRootWriterLease,
  intentInput: GenerationIntentV1,
  publicationPlanInput: unknown,
): VerifiedEligibilityInputs {
  const liveRoot = requireLiveOpenedDataRoot(root);
  if (requireLiveDataRootWriterLease(lease).root !== root) return invalid();
  const intent = requireGenerationIntent(intentInput);
  const originEvidence = requireGeneratedSetPublicationOriginForRoot(
    publicationPlanInput,
    root,
  );
  const publicationPlan = originEvidence.plan;
  if (
    publicationPlan.generationId !== intent.generationId ||
    publicationPlan.provider !== intent.provider
  ) {
    return invalid();
  }

  // GenerationRecordJournal 构造即重读 durable intent.json 并要求与传入 intent
  // byte-equal；readValidatedChain 复用既有 bounded full-chain decoder。
  const journal = new GenerationRecordJournal(root, lease, intent);
  const chain = journal.readValidatedChain();
  const head = chain[chain.length - 1]!;
  if (head.state !== "validating") return invalid();
  const admitted = chain[0]!;
  if (
    admitted.sequence !== 0 ||
    admitted.state !== "admitted" ||
    head.sequence <= admitted.sequence
  ) {
    return invalid();
  }
  requireBirthAnchor(liveRoot.absolutePath, intent, admitted);
  requireGeneratedSetCandidatePlanStateBinding(
    originEvidence.candidatePlan,
    intent,
    requireRemoteBoundAncestor(chain),
    head.payload as unknown as ActiveDownloadPayloadV1,
  );
  return {
    intent,
    publicationPlan,
    validatingSequence: head.sequence,
    validatingRecordDigest: generationStateRecordDigest(head),
  };
}

/** 只读 mint：全部 join 通过后返回 deep-frozen immutable eligibility evidence。 */
export function deriveGeneratedSetPublicationEligibility(
  root: OpenedDataRoot,
  lease: DataRootWriterLease,
  intentInput: GenerationIntentV1,
  publicationPlanInput: unknown,
): GeneratedSetPublicationEligibilityV1 {
  const verified = verifyEligibilityInputs(root, lease, intentInput, publicationPlanInput);
  const eligibility = deepFreeze({
    schemaVersion: 1,
    kind: "generated-set-publication-eligibility-v1",
    generationId: verified.intent.generationId,
    provider: verified.intent.provider,
    validatingSequence: verified.validatingSequence,
    validatingRecordDigest: verified.validatingRecordDigest,
    publicationOperationId: verified.publicationPlan.binding.operationId,
    publicationBindingDigest: verified.publicationPlan.publicationBindingDigest,
    artifactSetDigest: verified.publicationPlan.artifactSetDigest,
  }) as GeneratedSetPublicationEligibilityV1;
  eligibilityOrigins.set(eligibility, {
    root,
    lease,
    intent: verified.intent,
    publicationPlan: verified.publicationPlan,
    validatingSequence: verified.validatingSequence,
    validatingRecordDigest: verified.validatingRecordDigest,
  });
  return eligibility;
}

/**
 * 可重复的只读 revalidation：要求本模块铸造的 eligibility、同一 live root/lease、
 * 同一 exact intent 与同一 origin publication plan，并重跑 durable chain head、
 * birth anchor、publication-plan origin/storage snapshot 与 state-to-candidate
 * equality 的全部检查。伪造/复制的 eligibility、cross-root/cross-lease、stale
 * head、被替换的 intent/catalog/record/candidate 或后续 state 推进一律
 * `GENERATION_RECOVERY_REQUIRED`，零 mutation。
 */
export function revalidateGeneratedSetPublicationEligibility(
  eligibilityInput: unknown,
  root: OpenedDataRoot,
  lease: DataRootWriterLease,
  intentInput: GenerationIntentV1,
  publicationPlanInput: unknown,
): void {
  if (typeof eligibilityInput !== "object" || eligibilityInput === null) {
    return invalid();
  }
  const origin = eligibilityOrigins.get(eligibilityInput);
  if (
    origin === undefined ||
    origin.root !== root ||
    origin.lease !== lease ||
    origin.publicationPlan !== publicationPlanInput
  ) {
    return invalid();
  }
  const intent = requireGenerationIntent(intentInput);
  if (
    !Buffer.from(canonicalJsonBytes(origin.intent)).equals(
      Buffer.from(canonicalJsonBytes(intent)),
    )
  ) {
    return invalid();
  }
  const verified = verifyEligibilityInputs(root, lease, intent, publicationPlanInput);
  if (
    verified.validatingSequence !== origin.validatingSequence ||
    verified.validatingRecordDigest !== origin.validatingRecordDigest
  ) {
    return invalid();
  }
}
