import { deepFreeze } from "@demiurges/world";

import {
  type OpenedDataRoot,
} from "./data-root";
import {
  type DataRootWriterLease,
} from "./data-root-lease";
import {
  GenerationCodecError,
  type GenerationIntentV1,
} from "./generation-contracts";
import {
  generationStateRecordDigest,
  type GenerationStateRecordV1,
  type VerifiedPayloadV1,
} from "./generation-state";
import { GenerationRecordJournal } from "./generation-record-journal";
import {
  revalidateGeneratedSetVisibleCommitEvidence,
  requireGeneratedSetVisibleCommitOrigin,
  type GeneratedSetVisibleCommitEvidenceV1,
  type VisibleGenerationHeadExpectationV1,
} from "./generated-set-visible-commit";

/**
 * Package-internal `publishing → verified` coordinator. The original visible
 * evidence object is the only in-process authority; every call reconstructs
 * the complete durable visible join before it can append or replay a terminal
 * record. It neither cleans an Operation attempt nor exposes a public writer.
 */

export interface GeneratedSetVerifiedTransitionResultV1 {
  readonly schemaVersion: 1;
  readonly kind: "generated-set-verified-transitioned-v1";
  readonly generationId: `generation:sha256:${string}`;
  readonly artifactSetDigest: string;
  readonly publicationOperationId: string;
  readonly verifiedSequence: number;
  readonly verifiedRecordDigest: string;
}

function invalid(): never {
  throw new GenerationCodecError("GENERATION_RECOVERY_REQUIRED");
}

function verifiedPayload(
  evidence: GeneratedSetVisibleCommitEvidenceV1,
): VerifiedPayloadV1 {
  return {
    artifactSetDigest: evidence.artifactSetDigest,
    publicationOperationId: evidence.publicationOperationId,
  };
}

function exactVerifiedHead(
  record: GenerationStateRecordV1,
  evidence: GeneratedSetVisibleCommitEvidenceV1,
): VisibleGenerationHeadExpectationV1 {
  const payload = verifiedPayload(evidence);
  if (
    record.state !== "verified" ||
    record.sequence !== evidence.publishingSequence + 1 ||
    record.previousRecordDigest !== evidence.publishingRecordDigest ||
    record.payload.artifactSetDigest !== payload.artifactSetDigest ||
    record.payload.publicationOperationId !== payload.publicationOperationId
  ) {
    return invalid();
  }
  return {
    state: "verified",
    sequence: record.sequence,
    recordDigest: generationStateRecordDigest(record),
    payload,
  };
}

function resultFromRecord(
  record: GenerationStateRecordV1,
  evidence: GeneratedSetVisibleCommitEvidenceV1,
): GeneratedSetVerifiedTransitionResultV1 {
  const head = exactVerifiedHead(record, evidence);
  if (head.state !== "verified") return invalid();
  return deepFreeze({
    schemaVersion: 1,
    kind: "generated-set-verified-transitioned-v1",
    generationId: evidence.generationId,
    artifactSetDigest: evidence.artifactSetDigest,
    publicationOperationId: evidence.publicationOperationId,
    verifiedSequence: head.sequence,
    verifiedRecordDigest: head.recordDigest,
  }) as GeneratedSetVerifiedTransitionResultV1;
}

/**
 * Append exactly one terminal `verified` state after proving the currently
 * published catalog/result/member join. If a prior call already advanced this
 * in-process evidence to the exact terminal record, rebuild the same join and
 * return that record without appending a successor.
 */
export function transitionGeneratedSetVisibleToVerified(
  evidenceInput: unknown,
  root: OpenedDataRoot,
  lease: DataRootWriterLease,
  intentInput: GenerationIntentV1,
  publicationPlanInput: unknown,
  recordedAt: string,
): GeneratedSetVerifiedTransitionResultV1 {
  const origin = requireGeneratedSetVisibleCommitOrigin(
    evidenceInput,
    root,
    lease,
    intentInput,
    publicationPlanInput,
  );
  if (typeof evidenceInput !== "object" || evidenceInput === null) return invalid();
  const evidence = evidenceInput as GeneratedSetVisibleCommitEvidenceV1;
  const expectedPayload = verifiedPayload(evidence);
  const journal = new GenerationRecordJournal(root, lease, origin.intent);
  const current = journal.readCurrent();

  if (current.state === "verified") {
    const head = exactVerifiedHead(current, evidence);
    revalidateGeneratedSetVisibleCommitEvidence(
      evidence,
      root,
      lease,
      intentInput,
      publicationPlanInput,
      head,
    );
    return resultFromRecord(journal.readCurrent(), evidence);
  }
  if (
    current.state !== "publishing" ||
    current.sequence !== evidence.publishingSequence ||
    generationStateRecordDigest(current) !== evidence.publishingRecordDigest ||
    current.payload.operationId !== evidence.publicationOperationId ||
    current.payload.artifactSetDigest !== evidence.artifactSetDigest
  ) {
    return invalid();
  }

  revalidateGeneratedSetVisibleCommitEvidence(
    evidence,
    root,
    lease,
    intentInput,
    publicationPlanInput,
    {
      state: "publishing",
      sequence: evidence.publishingSequence,
      recordDigest: evidence.publishingRecordDigest,
    },
  );
  // The visible join has now been proved while the durable head still names the
  // exact publishing record. Delegate any pre-existing journal pending record
  // to its approved recovery protocol; a resumed terminal head is revalidated
  // again before it can be returned.
  const resumed = journal.resumePending();
  if (resumed !== undefined) {
    const head = exactVerifiedHead(resumed, evidence);
    revalidateGeneratedSetVisibleCommitEvidence(
      evidence,
      root,
      lease,
      intentInput,
      publicationPlanInput,
      head,
    );
    return resultFromRecord(journal.readCurrent(), evidence);
  }
  if (
    origin.plan.expectedResult.variant !== "success" ||
    origin.plan.expectedResult.publishedIdentity !== evidence.artifactSetDigest
  ) {
    return invalid();
  }

  const appended = journal.append(
    "verified",
    expectedPayload as unknown as Readonly<Record<string, unknown>>,
    recordedAt,
  );
  const durableHead = journal.readCurrent();
  if (
    generationStateRecordDigest(durableHead) !== generationStateRecordDigest(appended)
  ) {
    return invalid();
  }
  return resultFromRecord(durableHead, evidence);
}
