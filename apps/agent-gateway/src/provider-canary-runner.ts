import { createHash } from "node:crypto";

import {
  createGenerationBinding,
  createGenerationIntent,
  requireGenerationBindingBodyFromIntent,
  requireGenerationIntent,
  requireGenerationRequest,
  type GenerationContractSelectionV1,
  type GenerationIntentV1,
  type GenerationProviderV1,
  type ProviderFailedCodeV1,
  type RemoteBoundPayloadV1,
  type WorldProjectDownloadedGenerationFacade,
  type WorldProjectFirstGenerationFacade,
} from "@demiurges/world-project";

import { HunyuanGenerationService } from "./hunyuan-generation-service";
import { MarbleGenerationService } from "./marble-generation-service";
import { ProviderSubmitOrchestrator } from "./provider-submit-orchestrator";

type CanaryProvider = GenerationProviderV1;

export interface FrozenProviderCanaryV1 {
  readonly provider: CanaryProvider;
  readonly model: "marble-1.0-draft" | "3.0";
  readonly prompt: string;
  readonly idempotencyKey: string;
  readonly contract: GenerationContractSelectionV1;
  readonly maxPollAttempts: number;
  readonly deadlineAt: string;
}

export interface CanaryAssetDownloader {
  /** The caller must not attach credential headers to the signed asset host. */
  readonly download: (input: {
    readonly provider: CanaryProvider;
    readonly format: "spz-v2" | "glb-2.0";
    readonly url: string;
    readonly signal: AbortSignal;
  }) => Promise<Uint8Array>;
}

export interface ProviderCanaryRunnerOptions {
  readonly firstGeneration: WorldProjectFirstGenerationFacade;
  readonly completion: WorldProjectDownloadedGenerationFacade;
  readonly marble: MarbleGenerationService;
  readonly hunyuan: HunyuanGenerationService;
  readonly downloader: CanaryAssetDownloader;
  readonly now?: () => number;
  readonly sleep?: (milliseconds: number, signal: AbortSignal) => Promise<void>;
  readonly createRecordedAt?: () => string;
}

export type ProviderCanaryRunResultV1 =
  | {
      readonly status: "verified" | "replay";
      readonly generationId: string;
      readonly provider: CanaryProvider;
      readonly model: string;
      readonly remotePublicIdentity: string;
      readonly artifactSetDigest: string;
      readonly elapsedMs: number;
      readonly sanitizedCost: { readonly unit: string; readonly amount: string } | null;
      readonly artifacts: readonly {
        readonly assetId: string;
        readonly role: string;
        readonly format: string;
        readonly contentDigest: string;
      }[];
    }
  | {
      readonly status: "blocked" | "provider-failed" | "ambiguous" | "timed-out" | "download-failed";
      readonly generationId: string;
      readonly provider: CanaryProvider;
      readonly model: string;
    };

function publicIdentity(remote: RemoteBoundPayloadV1): string {
  return `sha256:${createHash("sha256")
    .update(`demiurges-provider-public-identity-v1\\0${remote.provider}\\0${remote.remoteJobId}`)
    .digest("hex")}`;
}

function requirePositiveInteger(provider: CanaryProvider, value: number): number {
  const maximum = provider === "worldlabs-marble-v1" ? 80 : 120;
  if (!Number.isSafeInteger(value) || value < 1 || value > maximum) {
    throw new TypeError("invalid canary poll attempt limit");
  }
  return value;
}

function pollDelay(provider: CanaryProvider, attempt: number): number {
  if (provider === "hunyuan-ai3d-v1") return 5_000;
  if (attempt < 12) return 5_000;
  if (attempt < 36) return 10_000;
  return 20_000;
}

/**
 * poll outcome 的 closed 分类（Marble/Hunyuan 共用同一极小 helper，不引入
 * provider abstraction）：service rejected 写 exact code；success payload
 * 终态 failure 的唯一 durable 语义是 PROVIDER_REJECTED；contract-mismatch
 * 是 blocked 而非 provider 拒绝；transient/abort/deadline 一律 timed-out。
 */
type PollQueryOutcomeV1 =
  | {
      readonly kind: "success";
      readonly result: { readonly kind: "pending" | "failure" };
    }
  | { readonly kind: "rejected"; readonly code: ProviderFailedCodeV1 }
  | { readonly kind: "contract-mismatch"; readonly code: "PROVIDER_CONTRACT_MISMATCH" }
  | { readonly kind: "transient"; readonly reason: string };

type PollQueryVerdictV1 =
  | { readonly kind: "pending" }
  | { readonly kind: "provider-failed"; readonly code: ProviderFailedCodeV1 }
  | { readonly kind: "blocked" }
  | { readonly kind: "timed-out" };

function classifyPollQuery(outcome: PollQueryOutcomeV1): PollQueryVerdictV1 {
  if (outcome.kind === "success") {
    return outcome.result.kind === "failure"
      ? { kind: "provider-failed", code: "PROVIDER_REJECTED" }
      : { kind: "pending" };
  }
  if (outcome.kind === "rejected") {
    return { kind: "provider-failed", code: outcome.code };
  }
  if (outcome.kind === "contract-mismatch") {
    return { kind: "blocked" };
  }
  return { kind: "timed-out" };
}

type SettledDownloadedArtifactV1 = {
  readonly kind: "done";
  readonly completion: Parameters<WorldProjectDownloadedGenerationFacade["completeDownloaded"]>[1];
  readonly sanitizedCost: { readonly unit: string; readonly amount: string } | null;
};

type PollSettlementV1 =
  | PollQueryVerdictV1
  | { readonly kind: "download-failed" }
  | SettledDownloadedArtifactV1;

function requireDeadline(value: string): number {
  const milliseconds = Date.parse(value);
  if (!Number.isFinite(milliseconds) || new Date(milliseconds).toISOString() !== value) {
    throw new TypeError("invalid canary deadline");
  }
  return milliseconds;
}

function frozenIntent(input: FrozenProviderCanaryV1, recordedAt: string): GenerationIntentV1 {
  const request = requireGenerationRequest({
    provider: input.provider,
    model: input.model,
    prompt: input.prompt,
    costUnknownAccepted: true,
    waitForCompletionAndDownload: true,
    idempotencyKey: input.idempotencyKey,
  });
  return createGenerationIntent(createGenerationBinding(request, input.contract), recordedAt);
}

function matchesFrozenIntent(intent: GenerationIntentV1, input: FrozenProviderCanaryV1): boolean {
  return intent.provider === input.provider &&
    intent.model === input.model &&
    intent.canonicalRequest.prompt === input.prompt &&
    intent.canonicalRequest.costUnknownAccepted === true &&
    intent.canonicalRequest.waitForCompletionAndDownload === true &&
    intent.contractProfile === input.contract.contractProfile &&
    intent.contractShapeDigest === input.contract.contractShapeDigest;
}

/**
 * 从 durable 状态记录的 payload 提取 provider-specific remote binding，语义
 * 与既有 inline 校验完全一致：形状不符返回 null（blocked）；Hunyuan 缺
 * providerRequestId 视为编程错误抛 TypeError。fresh submit 与 resume 共用。
 */
function durableRemoteBound(
  payload: Readonly<Record<string, unknown>>,
  provider: CanaryProvider,
): RemoteBoundPayloadV1 | null {
  if (
    payload.provider !== provider ||
    typeof payload.remoteJobId !== "string" ||
    !(payload.providerRequestId === null || typeof payload.providerRequestId === "string")
  ) {
    return null;
  }
  if (provider === "worldlabs-marble-v1") {
    return { provider, remoteJobId: payload.remoteJobId, providerRequestId: null };
  }
  if (payload.providerRequestId === null) {
    throw new TypeError("invalid Hunyuan remote binding");
  }
  return {
    provider: "hunyuan-ai3d-v1",
    remoteJobId: payload.remoteJobId,
    providerRequestId: payload.providerRequestId,
  };
}

async function defaultSleep(milliseconds: number, signal: AbortSignal): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(resolve, milliseconds);
    signal.addEventListener("abort", () => {
      clearTimeout(timer);
      reject(new DOMException("aborted", "AbortError"));
    }, { once: true });
  });
}

/**
 * Operator-only orchestration for the two frozen providers。它没有 HTTP
 * route、registry、retry loop 或 credential source。唯一付费 submit 委托给
 * ProviderSubmitOrchestrator。第二次 invocation 只允许 resume 精确的 durable
 * `remote_bound` generation（跳过 admission 与 submit，直接续跑既有 bounded
 * poll/download/`completeDownloaded` 路径）；任何其它 durable 状态在零
 * provider fetch 下 blocked。
 */
export class ProviderCanaryRunner {
  readonly #firstGeneration: WorldProjectFirstGenerationFacade;
  readonly #completion: WorldProjectDownloadedGenerationFacade;
  readonly #marble: MarbleGenerationService;
  readonly #hunyuan: HunyuanGenerationService;
  readonly #downloader: CanaryAssetDownloader;
  readonly #now: () => number;
  readonly #sleep: (milliseconds: number, signal: AbortSignal) => Promise<void>;
  readonly #createRecordedAt: () => string;

  constructor(options: ProviderCanaryRunnerOptions) {
    this.#firstGeneration = options.firstGeneration;
    this.#completion = options.completion;
    this.#marble = options.marble;
    this.#hunyuan = options.hunyuan;
    this.#downloader = options.downloader;
    this.#now = options.now ?? Date.now;
    this.#sleep = options.sleep ?? defaultSleep;
    this.#createRecordedAt = options.createRecordedAt ?? (() => new Date().toISOString());
  }

  async run(
    input: FrozenProviderCanaryV1,
    intentInput?: GenerationIntentV1,
    callerSignal?: AbortSignal,
  ): Promise<ProviderCanaryRunResultV1> {
    const startedAt = this.#now();
    const maxPollAttempts = requirePositiveInteger(input.provider, input.maxPollAttempts);
    const deadline = requireDeadline(input.deadlineAt);
    const candidateIntent = requireGenerationIntent(
      intentInput ?? frozenIntent(input, this.#createRecordedAt()),
    );
    const existing = this.#firstGeneration.submitInspect(candidateIntent.generationId);
    const base = { generationId: candidateIntent.generationId, provider: input.provider, model: input.model } as const;
    if (callerSignal?.aborted) return { ...base, status: "blocked" };

    // resume 分支：durable `remote_bound` 是唯一可续跑的既有状态。使用 durable
    // intent（而非新建 candidate），并要求它与 frozen 契约逐字段一致；跳过
    // admission 与 submit，直接进入既有 bounded poll/download 路径。
    let intent = candidateIntent;
    let remoteBound: RemoteBoundPayloadV1 | null = null;
    if (existing.status === "present") {
      if (existing.current.state !== "remote_bound") return { ...base, status: "blocked" };
      intent = existing.intent;
      if (!matchesFrozenIntent(intent, input)) return { ...base, status: "blocked" };
      remoteBound = durableRemoteBound(existing.current.payload, input.provider);
      if (remoteBound === null) return { ...base, status: "blocked" };
    } else if (!matchesFrozenIntent(intent, input)) {
      return { ...base, status: "blocked" };
    }
    if (this.#now() >= deadline) return { ...base, status: "timed-out" };
    const remainingMs = deadline - this.#now();
    const totalDeadline = AbortSignal.timeout(remainingMs);
    const signal = callerSignal === undefined ? totalDeadline : AbortSignal.any([callerSignal, totalDeadline]);
    if (signal.aborted) return { ...base, status: "timed-out" };

    if (existing.status === "absent") {
      const admitted = this.#firstGeneration.admit(intent);
      if (admitted.status !== "admitted") return { ...base, status: "blocked" };
      const submit = new ProviderSubmitOrchestrator({
        firstGeneration: this.#firstGeneration,
        marble: this.#marble,
        hunyuan: this.#hunyuan,
        createRecordedAt: this.#createRecordedAt,
      });
      const submitted = await submit.submit(intent.generationId, signal);
      if (submitted.status === "blocked" || submitted.status === "capacity-reached") {
        return { ...base, status: "blocked" };
      }
      if (submitted.status === "provider-failed") return { ...base, status: "provider-failed" };
      if (submitted.status === "ambiguous") return { ...base, status: "ambiguous" };

      const inspection = this.#firstGeneration.submitInspect(intent.generationId);
      if (inspection.status !== "present" || inspection.current.state !== "remote_bound") {
        return { ...base, status: "blocked" };
      }
      remoteBound = durableRemoteBound(inspection.current.payload, input.provider);
      if (remoteBound === null) return { ...base, status: "blocked" };
    }
    // 两条路径（resume 或 fresh submit 后 inspection）都已保证非空；此收口只
    // 服务类型收窄，运行时不可达。
    if (remoteBound === null) return { ...base, status: "blocked" };
    for (let attempt = 0; attempt < maxPollAttempts && this.#now() < deadline; attempt += 1) {
      const polled = input.provider === "worldlabs-marble-v1"
        ? await this.#pollMarble(intent, remoteBound, signal)
        : await this.#pollHunyuan(intent, remoteBound, signal);
      if (polled.kind === "pending") {
        try {
          await this.#sleep(pollDelay(input.provider, attempt), signal);
        } catch {
          return { ...base, status: "timed-out" };
        }
        continue;
      }
      if (polled.kind === "provider-failed") {
        // durable 收束：remote_bound head 上追加唯一 provider_failed record
        // （exact retry 只读 replay；recovery 故障 fail closed）。
        const settled = this.#firstGeneration.submitResult({
          generationId: intent.generationId,
          recordedAt: this.#createRecordedAt(),
          outcome: { kind: "provider-failed", code: polled.code },
        });
        if (settled.status === "capacity-reached") {
          return { ...base, status: "blocked" };
        }
        return { ...base, status: "provider-failed" };
      }
      if (polled.kind === "blocked") return { ...base, status: "blocked" };
      if (polled.kind === "timed-out") return { ...base, status: "timed-out" };
      if (polled.kind === "download-failed") return { ...base, status: "download-failed" };
      const completed = this.#completion.completeDownloaded(intent, polled.completion);
      return {
        ...base,
        status: completed.status,
        remotePublicIdentity: publicIdentity(remoteBound),
        artifactSetDigest: completed.set.artifactSetDigest,
        elapsedMs: Math.max(0, this.#now() - startedAt),
        sanitizedCost: polled.sanitizedCost,
        artifacts: completed.set.members.map((member) => ({
          assetId: member.assetId,
          role: member.role,
          format: member.format,
          contentDigest: member.contentDigest,
        })),
      };
    }
    return { ...base, status: "timed-out" };
  }

  async #pollMarble(
    intent: GenerationIntentV1,
    remote: RemoteBoundPayloadV1,
    signal: AbortSignal,
  ): Promise<PollSettlementV1> {
    const operation = await this.#marble.queryMarbleOperation(remote.remoteJobId, signal);
    if (signal.aborted) return { kind: "timed-out" };
    if (operation.kind !== "success") return classifyPollQuery(operation);
    const result = operation.result;
    if (result.kind === "done") {
      try {
        const world = await this.#marble.getMarbleWorld(
          remote.remoteJobId,
          result.remoteOutputIdentity.worldId,
          signal,
        );
        if (signal.aborted) return { kind: "timed-out" };
        if (world.kind !== "success") return { kind: "download-failed" };
        const spz = await this.#downloader.download({
          provider: intent.provider,
          format: "spz-v2",
          url: world.result.spzUrl,
          signal,
        });
        const collider = await this.#downloader.download({
          provider: intent.provider,
          format: "glb-2.0",
          url: world.result.colliderUrl,
          signal,
        });
        return {
          kind: "done",
          sanitizedCost: result.sanitizedCost ?? null,
          completion: {
            remoteOutputIdentity: world.result.remoteOutputIdentity,
            orderedArtifacts: [
              { outputRole: "world-spz-500k", format: "spz-v2", bytes: spz },
              { outputRole: "world-collider-glb", format: "glb-2.0", bytes: collider },
            ],
            recordedAt: this.#createRecordedAt(),
          },
        };
      } catch {
        return { kind: "download-failed" };
      }
    }
    return classifyPollQuery({ kind: "success", result });
  }

  async #pollHunyuan(
    intent: GenerationIntentV1,
    remote: RemoteBoundPayloadV1,
    signal: AbortSignal,
  ): Promise<PollSettlementV1> {
    const binding = requireGenerationBindingBodyFromIntent(intent);
    const response = await this.#hunyuan.queryHunyuanJob(binding, remote, signal);
    if (signal.aborted) return { kind: "timed-out" };
    if (response.kind !== "success") return classifyPollQuery(response);
    const result = response.result;
    if (result.kind === "done") {
      try {
        const bytes = await this.#downloader.download({
          provider: intent.provider,
          format: "glb-2.0",
          url: result.glbUrl,
          signal,
        });
        if (signal.aborted) return { kind: "timed-out" };
        return {
          kind: "done",
          sanitizedCost: result.sanitizedCost ?? null,
          completion: {
            remoteOutputIdentity: result.remoteOutputIdentity,
            orderedArtifacts: [{ outputRole: "object-glb", format: "glb-2.0", bytes }],
            recordedAt: this.#createRecordedAt(),
          },
        };
      } catch {
        return { kind: "download-failed" };
      }
    }
    return classifyPollQuery({ kind: "success", result });
  }
}
