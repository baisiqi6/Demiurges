import { lstatSync, opendirSync } from "node:fs";
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
  GenerationCodecError,
  requireGenerationIntent,
  type GenerationIntentV1,
} from "./generation-contracts";
import {
  inspectDynamicArtifactBytes,
  type DynamicArtifactInspectionV1,
} from "./generation-artifact-inspector";
import {
  createInitialDownloadBudget,
  requireRemoteOutputIdentity,
  type DownloadBudgetV1,
  type DownloadCandidateV1,
  type DownloadMemberBudgetV1,
  type GeneratedArtifactOutputRole,
  type RemoteOutputIdentityV1,
} from "./generation-output-contracts";
import { GenerationRecordJournal } from "./generation-record-journal";
import {
  generationStateRecordDigest,
  requireRemoteBoundPayload,
  type PollBudgetV1,
} from "./generation-state";
import { deriveGeneratedSetCandidatePlan } from "./generated-set-candidate-plan";
import { inspectGeneratedSetStoragePreflight } from "./generated-set-storage-preflight";
import { deriveGeneratedSetPublicationPlan } from "./generated-artifact-publication";
import { deriveGeneratedSetPublicationEligibility } from "./generated-set-publication-eligibility";
import { authorizeGeneratedSetAdmission } from "./generated-set-admission";
import { writeGeneratedSetPublicationIntent } from "./generated-set-intent-writer";
import { transitionGeneratedSetToPublishing } from "./generated-set-publishing-transition";
import { writeGeneratedSetHiddenCas } from "./generated-set-hidden-cas-writer";
import { commitGeneratedSetVisible } from "./generated-set-visible-commit";
import { transitionGeneratedSetVisibleToVerified } from "./generated-set-verified-transition";
import {
  GeneratedArtifactReader,
  type GeneratedArtifactSetSummaryV1,
} from "./generated-artifact-reader";
import { syncDirectory, writeNewSyncedFile } from "./safe-filesystem";

/**
 * 已完成受信下载、但尚未发布的 provider output。这里的 bytes 不携带 URL、
 * header 或 credential；调用方负责在本边界之外完成有界 poll/download。
 */
export interface DownloadedGenerationArtifactV1 {
  readonly outputRole: GeneratedArtifactOutputRole;
  readonly format: "spz-v2" | "glb-2.0";
  readonly bytes: Uint8Array;
}

export interface DownloadedGenerationCompletionRequestV1 {
  readonly remoteOutputIdentity: RemoteOutputIdentityV1;
  readonly orderedArtifacts: readonly DownloadedGenerationArtifactV1[];
  readonly recordedAt: string;
}

export interface DownloadedGenerationCompletionResultV1 {
  readonly status: "verified" | "replay";
  readonly set: GeneratedArtifactSetSummaryV1;
}

interface PreparedArtifact {
  readonly outputRole: GeneratedArtifactOutputRole;
  readonly format: "spz-v2" | "glb-2.0";
  readonly bytes: Uint8Array;
  readonly inspection: DynamicArtifactInspectionV1;
}

function recoveryRequired(): never {
  throw new GenerationCodecError("GENERATION_RECOVERY_REQUIRED");
}

function expectedArtifacts(intent: GenerationIntentV1): readonly {
  readonly outputRole: GeneratedArtifactOutputRole;
  readonly format: "spz-v2" | "glb-2.0";
}[] {
  return intent.provider === "worldlabs-marble-v1"
    ? [
        { outputRole: "world-spz-500k", format: "spz-v2" },
        { outputRole: "world-collider-glb", format: "glb-2.0" },
      ]
    : [{ outputRole: "object-glb", format: "glb-2.0" }];
}

function prepareArtifacts(
  intent: GenerationIntentV1,
  artifacts: readonly DownloadedGenerationArtifactV1[],
): readonly PreparedArtifact[] {
  const expected = expectedArtifacts(intent);
  if (!Array.isArray(artifacts) || artifacts.length !== expected.length) {
    return recoveryRequired();
  }
  return artifacts.map((artifact, index) => {
    const shape = expected[index]!;
    if (
      artifact.outputRole !== shape.outputRole ||
      artifact.format !== shape.format ||
      !(artifact.bytes instanceof Uint8Array)
    ) {
      return recoveryRequired();
    }
    try {
      return {
        outputRole: artifact.outputRole,
        format: artifact.format,
        bytes: new Uint8Array(artifact.bytes),
        inspection: inspectDynamicArtifactBytes(artifact.format, artifact.bytes),
      };
    } catch {
      return recoveryRequired();
    }
  });
}

function requireTimestamp(value: string): number {
  const milliseconds = Date.parse(value);
  if (!Number.isFinite(milliseconds) || new Date(milliseconds).toISOString() !== value) {
    return recoveryRequired();
  }
  return milliseconds;
}

function requireEmptyDirectory(path: string): void {
  const directory = opendirSync(path);
  try {
    if (directory.readSync() !== null) return recoveryRequired();
  } finally {
    directory.closeSync();
  }
}

function replaceMember(
  budget: DownloadBudgetV1,
  index: number,
  member: DownloadMemberBudgetV1,
): DownloadBudgetV1 {
  return {
    ...budget,
    orderedMembers: budget.orderedMembers.map((current, memberIndex) =>
      memberIndex === index ? member : current),
  };
}

function matchingSet(
  root: OpenedDataRoot,
  intent: GenerationIntentV1,
  artifacts: readonly PreparedArtifact[],
): GeneratedArtifactSetSummaryV1 {
  const found = new GeneratedArtifactReader(root).list().find((set) =>
    set.generationId === intent.generationId);
  if (
    found === undefined ||
    found.provider !== intent.provider ||
    found.members.length !== artifacts.length ||
    found.members.some((member, index) => {
      const artifact = artifacts[index]!;
      return member.role !== artifact.outputRole ||
        member.format !== artifact.format ||
        member.contentDigest !== artifact.inspection.descriptor.contentDigest ||
        member.byteLength !== artifact.inspection.descriptor.byteLength;
    })
  ) {
    return recoveryRequired();
  }
  return found;
}

/**
 * 将已完成、有界下载的 bytes 接入既有 durable publication。它不发网络请求、
 * 不读取 credential，也不实现 scheduler、retry 或第二套 recovery；fake 路径
 * 与 Operator canary 都必须先在本边界外完成各自的 poll/download。
 */
export class DownloadedGenerationCompletionCoordinator {
  readonly #root: OpenedDataRoot;
  readonly #lease: DataRootWriterLease;

  constructor(root: OpenedDataRoot, lease: DataRootWriterLease) {
    requireLiveOpenedDataRoot(root);
    if (requireLiveDataRootWriterLease(lease).root !== root) recoveryRequired();
    this.#root = root;
    this.#lease = lease;
  }

  complete(
    intentInput: GenerationIntentV1,
    request: DownloadedGenerationCompletionRequestV1,
  ): DownloadedGenerationCompletionResultV1 {
    const intent = requireGenerationIntent(intentInput);
    const artifacts = prepareArtifacts(intent, request.orderedArtifacts);
    let nextRecordedAt = requireTimestamp(request.recordedAt);
    const recordedAt = (): string => new Date(nextRecordedAt++).toISOString();
    const journal = new GenerationRecordJournal(this.#root, this.#lease, intent);
    const current = journal.readCurrent();

    if (current.state === "verified") {
      return Object.freeze({
        status: "replay",
        set: matchingSet(this.#root, intent, artifacts),
      });
    }
    if (current.state !== "remote_bound") return recoveryRequired();
    if (nextRecordedAt < Date.parse(current.recordedAt)) return recoveryRequired();

    const remoteBound = requireRemoteBoundPayload(current.payload, intent.provider);
    const remoteOutputIdentity = requireRemoteOutputIdentity(
      request.remoteOutputIdentity,
      intent,
      remoteBound,
    );
    const rootPath = requireLiveOpenedDataRoot(this.#root).absolutePath;
    const generationDigest = intent.generationId.slice("generation:sha256:".length);
    const downloadsPath = join(
      rootPath,
      "receipts",
      "generations",
      "data",
      generationDigest,
      "downloads",
    );
    requireEmptyDirectory(downloadsPath);

    const cycleStartedAt = recordedAt();
    const pollBudget: PollBudgetV1 = {
      cycleCount: 1,
      attemptCount: 1,
      cycleStartedAt,
      deadlineAt: new Date(Date.parse(cycleStartedAt) + 20 * 60 * 1000).toISOString(),
    };
    journal.append("polling", { ...pollBudget }, cycleStartedAt);
    let budget: DownloadBudgetV1 = createInitialDownloadBudget(intent, pollBudget);
    journal.append("outputs_ready", {
      remoteOutputIdentity,
      downloadBudget: budget,
    }, recordedAt());
    journal.append("downloading", {
      remoteOutputIdentity,
      downloadBudget: budget,
    }, recordedAt());

    for (const [index, artifact] of artifacts.entries()) {
      budget = replaceMember(budget, index, {
        outputRole: artifact.outputRole,
        downloadAttemptCount: 1,
        stage: "reserved",
        candidate: null,
      });
      journal.append("downloading", {
        remoteOutputIdentity,
        downloadBudget: budget,
      }, recordedAt());

      const checkpoint = generationStateRecordDigest(journal.readCurrent());
      const basename = `${artifact.outputRole}-c1-a1-${checkpoint}`;
      const candidateName = `${basename}.bin`;
      const candidatePath = join(downloadsPath, candidateName);
      writeNewSyncedFile(candidatePath, artifact.bytes);
      syncDirectory(downloadsPath);
      const stat = lstatSync(candidatePath, { bigint: true });
      const candidate: DownloadCandidateV1 = {
        candidateName,
        attemptCheckpointRecordDigest: checkpoint,
        fileIdentity: {
          dev: stat.dev.toString(),
          ino: stat.ino.toString(),
          mode: 0o600,
          uid: Number(stat.uid),
          gid: Number(stat.gid),
        },
        digest: artifact.inspection.descriptor.contentDigest,
        byteLength: artifact.inspection.descriptor.byteLength,
        format: artifact.inspection.descriptor.format,
        elementCount: artifact.inspection.descriptor.elementCount,
        sourceBounds: artifact.inspection.descriptor.sourceBounds,
        inspectorDescriptor: artifact.inspection.descriptor,
        inspectorDescriptorDigest: artifact.inspection.descriptorDigest,
      };
      budget = replaceMember(budget, index, {
        outputRole: artifact.outputRole,
        downloadAttemptCount: 1,
        stage: "owned-next",
        attemptCheckpointRecordDigest: checkpoint,
        nextName: `${basename}.next`,
        ownerName: `${basename}.owner`,
        fileIdentity: candidate.fileIdentity,
        candidate: null,
      });
      journal.append("downloading", {
        remoteOutputIdentity,
        downloadBudget: budget,
      }, recordedAt());
      budget = replaceMember(budget, index, {
        outputRole: artifact.outputRole,
        downloadAttemptCount: 1,
        stage: "cleanup-authorized",
        ownerName: `${basename}.owner`,
        candidate,
      });
      journal.append("downloading", {
        remoteOutputIdentity,
        downloadBudget: budget,
      }, recordedAt());
      budget = replaceMember(budget, index, {
        outputRole: artifact.outputRole,
        downloadAttemptCount: 1,
        stage: "candidate",
        candidate,
      });
      journal.append("downloading", {
        remoteOutputIdentity,
        downloadBudget: budget,
      }, recordedAt());
    }

    const validating = journal.append("validating", {
      remoteOutputIdentity,
      downloadBudget: budget,
    }, recordedAt());
    const candidatePlan = deriveGeneratedSetCandidatePlan(
      intent,
      remoteBound,
      validating.payload as never,
      artifacts.map((artifact) => ({
        outputRole: artifact.outputRole,
        inspection: artifact.inspection,
      })),
    );
    const storage = inspectGeneratedSetStoragePreflight(this.#root, candidatePlan);
    const publication = deriveGeneratedSetPublicationPlan(
      this.#root,
      candidatePlan,
      storage,
    );
    const eligibility = deriveGeneratedSetPublicationEligibility(
      this.#root,
      this.#lease,
      intent,
      publication,
    );
    const admission = authorizeGeneratedSetAdmission(
      this.#root,
      this.#lease,
      intent,
      publication,
      eligibility,
    );
    if (admission.status !== "authorized") return recoveryRequired();
    const admitted = writeGeneratedSetPublicationIntent(
      admission.capability,
      this.#root,
      this.#lease,
      intent,
      publication,
      eligibility,
    );
    const publishing = transitionGeneratedSetToPublishing(
      admitted,
      this.#root,
      this.#lease,
      intent,
      publication,
      eligibility,
      recordedAt(),
    );
    const hidden = writeGeneratedSetHiddenCas(
      publishing,
      this.#root,
      this.#lease,
      intent,
      publication,
    );
    const visible = commitGeneratedSetVisible(
      hidden,
      this.#root,
      this.#lease,
      intent,
      publication,
    );
    transitionGeneratedSetVisibleToVerified(
      visible,
      this.#root,
      this.#lease,
      intent,
      publication,
      recordedAt(),
    );
    return Object.freeze({
      status: "verified",
      set: matchingSet(this.#root, intent, artifacts),
    });
  }
}

/** 兼容开发 fixture 的旧名称；它只是同一已下载 bytes 内核的别名。 */
export {
  DownloadedGenerationCompletionCoordinator as FakeGenerationCompletionCoordinator,
};
export type {
  DownloadedGenerationArtifactV1 as FakeGenerationArtifactV1,
  DownloadedGenerationCompletionRequestV1 as FakeGenerationCompletionRequestV1,
  DownloadedGenerationCompletionResultV1 as FakeGenerationCompletionResultV1,
};
