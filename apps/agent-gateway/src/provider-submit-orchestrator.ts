import {
  requireGenerationBindingBodyFromIntent,
  type GenerationIntentV1,
  type GenerationStateRecordV1,
  type SubmitResultOutcomeV1,
  type SubmitResultRequestV1,
  type SubmitResultResultV1,
  type WorldProjectFirstGenerationFacade,
} from "@demiurges/world-project";

import type { MarbleOperationResultV1 } from "./generation-provider-codecs";
import {
  MarbleGenerationService,
  type MarbleServiceOutcomeV1,
} from "./marble-generation-service";
import {
  HunyuanGenerationService,
  type HunyuanSubmitOutcomeV1,
} from "./hunyuan-generation-service";

/**
 * Gateway-internal provider submit selector。编排顺序由本类唯一拥有：
 *
 * 1. 先读 exact durable intent/current truth（`inspect`，只读、fail-closed）；
 *    `remote_bound | provider_failed | submission_ambiguous | pre_submit_blocked`
 *    直接返回只读 replay，零 provider call。
 * 2. 否则在 checkpoint 前做本地零 fetch binding/profile preflight；mismatch 必须
 *    durable `pre_submit_blocked(PROVIDER_CONTRACT_MISMATCH)` 且零 fetch。
 * 3. 只有 `checkpoint(ready)` 返回 `replay:false` 才允许恰好一次 submit fetch；
 *    `replay:true`（`submit_started` 已由更早进程/调用 durable）绝不二次提交，
 *    持久化 `submission_ambiguous(PROVIDER_SUBMISSION_AMBIGUOUS)` 后返回。
 *
 * provider-specific 分类在单次 submit 调用后冻结：Marble 只把 documented
 * 400/401/402/422 no-creation rejection 映射为 `provider_failed`，其余一律
 * `submission_ambiguous`；Hunyuan 除 codec 产出的 trustworthy remote bound 外
 * 任何非 success 一律 `submission_ambiguous`，绝不复用 Marble 的 no-creation
 * oracle。
 */

export class ProviderSubmitOrchestratorError extends Error {
  readonly code = "GENERATION_RECOVERY_REQUIRED" as const;

  constructor() {
    super("GENERATION_RECOVERY_REQUIRED");
    this.name = "ProviderSubmitOrchestratorError";
  }
}

export type ProviderSubmitOrchestrationResultV1 =
  | { readonly status: "absent" }
  | { readonly status: "replay"; readonly record: GenerationStateRecordV1 }
  | {
      readonly status: "blocked";
      readonly record: GenerationStateRecordV1;
      readonly replay: boolean;
    }
  | { readonly status: "submitted"; readonly record: GenerationStateRecordV1 }
  | { readonly status: "provider-failed"; readonly record: GenerationStateRecordV1 }
  | { readonly status: "ambiguous"; readonly record: GenerationStateRecordV1 }
  | { readonly status: "capacity-reached" };

export interface ProviderSubmitOrchestratorOptions {
  readonly firstGeneration: WorldProjectFirstGenerationFacade;
  readonly marble: MarbleGenerationService;
  readonly hunyuan: HunyuanGenerationService;
  /** trusted wall clock，输出 RFC3339 毫秒 UTC。 */
  readonly createRecordedAt?: () => string;
}

function recoveryRequired(): never {
  throw new ProviderSubmitOrchestratorError();
}

function classifyMarbleSubmit(
  outcome: MarbleServiceOutcomeV1<MarbleOperationResultV1>,
): SubmitResultOutcomeV1 {
  if (outcome.kind === "success") {
    return { kind: "remote-bound", remoteBound: outcome.result.remoteBound };
  }
  if (outcome.kind === "rejected") {
    // documented submit 400/401/402/422 no-creation matrix 的 frozen code。
    return { kind: "provider-failed", code: outcome.code };
  }
  // contract-mismatch 与一切 transient（429/5xx/transport/deadline/body/
  // malformed）在 checkpoint 之后都不可证明未创建，唯一 durable 结果是 ambiguous。
  return { kind: "submission-ambiguous" };
}

function classifyHunyuanSubmit(outcome: HunyuanSubmitOutcomeV1): SubmitResultOutcomeV1 {
  if (outcome.kind === "success") {
    return { kind: "remote-bound", remoteBound: outcome.remoteBound };
  }
  // 任何非 success——含 pre-submit-aborted、contract-mismatch、submit-ambiguous
  // 与 thrown transport——一律 ambiguous；不存在 provider_failed 分支。
  return { kind: "submission-ambiguous" };
}

export class ProviderSubmitOrchestrator {
  readonly #firstGeneration: WorldProjectFirstGenerationFacade;
  readonly #marble: MarbleGenerationService;
  readonly #hunyuan: HunyuanGenerationService;
  readonly #createRecordedAt: () => string;

  constructor(options: ProviderSubmitOrchestratorOptions) {
    this.#firstGeneration = options.firstGeneration;
    this.#marble = options.marble;
    this.#hunyuan = options.hunyuan;
    this.#createRecordedAt = options.createRecordedAt ??
      (() => new Date().toISOString());
  }

  #preflight(intent: GenerationIntentV1): "ready" | "contract-mismatch" {
    // provider transport 边界只接受 exact binding body；intent 的 canonical
    // body 投影由 package codec 完成。
    const binding = requireGenerationBindingBodyFromIntent(intent);
    if (intent.provider === "worldlabs-marble-v1") {
      return this.#marble.preflightSubmitMarbleWorld(binding).kind;
    }
    return this.#hunyuan.preflightSubmitHunyuanObject(binding).kind;
  }

  #submitResult(
    generationId: `generation:sha256:${string}`,
    outcome: SubmitResultOutcomeV1,
  ): SubmitResultResultV1 {
    const request: SubmitResultRequestV1 = {
      generationId,
      recordedAt: this.#createRecordedAt(),
      outcome,
    };
    return this.#firstGeneration.submitResult(request);
  }

  #fromSubmitResult(result: SubmitResultResultV1): ProviderSubmitOrchestrationResultV1 {
    if (result.status === "capacity-reached") {
      return { status: "capacity-reached" };
    }
    const record = result.record;
    if (record.state === "remote_bound") return { status: "submitted", record };
    if (record.state === "provider_failed") {
      return { status: "provider-failed", record };
    }
    return { status: "ambiguous", record };
  }

  async submit(
    generationIdInput: string,
    callerSignal?: AbortSignal,
  ): Promise<ProviderSubmitOrchestrationResultV1> {
    const inspection = this.#firstGeneration.submitInspect(generationIdInput);
    if (inspection.status !== "present") {
      return { status: "absent" };
    }
    const intent = inspection.intent;
    const current = inspection.current;

    if (
      current.state === "remote_bound" ||
      current.state === "provider_failed" ||
      current.state === "submission_ambiguous" ||
      current.state === "pre_submit_blocked"
    ) {
      // 只读 replay：零 provider call、零新 record、零 inode 替换。
      return { status: "replay", record: current };
    }
    if (current.state === "submit_started") {
      // submit_started 已 durable（更早进程 checkpoint 后或 fetch 后崩溃）：
      // 任何情况下不第二次 fetch；由 package seam 收束为 ambiguous，或收敛
      // 早先中断 append 留下的唯一 pending result（同一 disposition）。
      return this.#fromSubmitResult(
        this.#submitResult(intent.generationId, { kind: "submission-ambiguous" }),
      );
    }
    if (current.state !== "admitted") recoveryRequired();

    const preflight = this.#preflight(intent);
    if (preflight === "contract-mismatch") {
      // 本地 mismatch 在 checkpoint 之前结束：durable pre_submit_blocked，
      // 零 fetch。
      const checkpoint = this.#firstGeneration.checkpoint({
        generationId: intent.generationId,
        recordedAt: this.#createRecordedAt(),
        decision: { kind: "blocked", code: "PROVIDER_CONTRACT_MISMATCH" },
      });
      if (checkpoint.status === "capacity-reached") {
        return { status: "capacity-reached" };
      }
      return { status: "blocked", record: checkpoint.record, replay: checkpoint.replay };
    }

    const checkpoint = this.#firstGeneration.checkpoint({
      generationId: intent.generationId,
      recordedAt: this.#createRecordedAt(),
      decision: { kind: "ready" },
    });
    if (checkpoint.status === "capacity-reached") {
      return { status: "capacity-reached" };
    }
    if (checkpoint.status !== "ready") recoveryRequired();
    if (checkpoint.replay) {
      // 并发/更早进程已取得 submit_started：不第二次提交。
      return this.#fromSubmitResult(
        this.#submitResult(intent.generationId, { kind: "submission-ambiguous" }),
      );
    }

    // replay:false：唯一一次 provider fetch 窗口。
    const binding = requireGenerationBindingBodyFromIntent(intent);
    const outcome = intent.provider === "worldlabs-marble-v1"
      ? await this.#marble.submitMarbleWorld(binding, callerSignal)
      : await this.#hunyuan.submitHunyuanObject(binding, callerSignal);
    const classified = intent.provider === "worldlabs-marble-v1"
      ? classifyMarbleSubmit(outcome as MarbleServiceOutcomeV1<MarbleOperationResultV1>)
      : classifyHunyuanSubmit(outcome as HunyuanSubmitOutcomeV1);
    return this.#fromSubmitResult(
      this.#submitResult(intent.generationId, classified),
    );
  }
}
