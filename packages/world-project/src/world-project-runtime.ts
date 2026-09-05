import { ArtifactStoreReader } from "./artifact-store";
import { WorldProjectBundleStore } from "./bundle-store";
import { GeneratedArtifactReader } from "./generated-artifact-reader";
import { openDataRoot, type OpenedDataRoot } from "./data-root";
import {
  acquireDataRootWriterLease,
  type DataRootWriterLease,
} from "./data-root-lease";
import {
  WorldProjectReader,
  WorldProjectWriter,
} from "./project-store";
import { OperationSingleFlight } from "./operation-journal";
import {
  FirstGenerationCoordinator,
  type FirstGenerationAdmissionResultV1,
  type FirstGenerationInspectionV1,
} from "./first-generation-coordinator";
import {
  FirstGenerationPreSubmitCoordinator,
  type PreSubmitCheckpointRequestV1,
  type PreSubmitCheckpointResultV1,
} from "./first-generation-pre-submit-coordinator";
import {
  GenerationSubmitResultCoordinator,
  type SubmitResultInspectionV1,
  type SubmitResultRequestV1,
  type SubmitResultResultV1,
} from "./generation-submit-result-coordinator";
import type { GenerationIntentV1 } from "./generation-contracts";
import {
  DownloadedGenerationCompletionCoordinator,
  type DownloadedGenerationCompletionRequestV1,
  type DownloadedGenerationCompletionResultV1,
} from "./fake-generation-completion-coordinator";
import { recoverPendingOperations } from "./startup-recovery";

export type WorldProjectRuntimeMode = "writer" | "reader";

/**
 * 安全的第一代 admission facade：内部持有 writer lease，只暴露
 * 只读 inspect 与 admit 结果 DTO，绝不把 lease/journal/filesystem authority
 * 交给 Gateway。
 */
export interface WorldProjectFirstGenerationFacade {
  readonly inspect: (generationId: string) => FirstGenerationInspectionV1;
  readonly admit: (intent: GenerationIntentV1) => FirstGenerationAdmissionResultV1;
  readonly checkpoint: (request: PreSubmitCheckpointRequestV1) => PreSubmitCheckpointResultV1;
  readonly submitResult: (request: SubmitResultRequestV1) => SubmitResultResultV1;
  readonly submitInspect: (generationId: string) => SubmitResultInspectionV1;
}

export interface WorldProjectDevelopmentFakeGenerationFacade {
  readonly complete: (
    intent: GenerationIntentV1,
    request: DownloadedGenerationCompletionRequestV1,
  ) => DownloadedGenerationCompletionResultV1;
}

/**
 * Operator-only completion seam. It accepts only already downloaded bytes;
 * networking and credential access stay in the caller, and no HTTP route
 * composes this capability.
 */
export interface WorldProjectDownloadedGenerationFacade {
  readonly completeDownloaded: (
    intent: GenerationIntentV1,
    request: DownloadedGenerationCompletionRequestV1,
  ) => DownloadedGenerationCompletionResultV1;
}

export interface OpenWorldProjectRuntimeOptions {
  readonly enableDevelopmentFakeGeneration?: boolean;
  readonly enableOperatorCanaryCompletion?: boolean;
}

export interface WorldProjectRuntime {
  readonly mode: WorldProjectRuntimeMode;
  readonly root: OpenedDataRoot;
  readonly artifacts: ArtifactStoreReader;
  readonly generatedArtifacts: GeneratedArtifactReader;
  readonly reader: WorldProjectReader;
  readonly writer: WorldProjectWriter | null;
  readonly bundles: WorldProjectBundleStore;
  readonly firstGeneration: WorldProjectFirstGenerationFacade | null;
  readonly developmentFakeGeneration: WorldProjectDevelopmentFakeGenerationFacade | null;
  readonly operatorCanaryCompletion: WorldProjectDownloadedGenerationFacade | null;
  readonly writerUnavailableReason: string | null;
  readonly closed: boolean;
  close(): Promise<void>;
}

export async function openWorldProjectRuntime(
  absolutePath: string,
  options: OpenWorldProjectRuntimeOptions = {},
): Promise<WorldProjectRuntime> {
  const root = openDataRoot(absolutePath);
  let lease: DataRootWriterLease | undefined;
  try {
    const acquired = await acquireDataRootWriterLease(root);
    if (acquired.status === "acquired") lease = acquired.lease;
    const artifacts = new ArtifactStoreReader(root);
    const generatedArtifacts = new GeneratedArtifactReader(root);
    const reader = new WorldProjectReader(root, artifacts);
    const singleFlight = new OperationSingleFlight();
    const writer = lease === undefined
      ? null
      : new WorldProjectWriter(root, lease, artifacts, singleFlight);
    if (lease !== undefined) {
      // mutation routes 只能在 recovery 全部唯一收敛后对外可见。
      recoverPendingOperations(root, lease, reader);
    }
    const bundles = new WorldProjectBundleStore(root, lease, singleFlight);
    const firstGenerationLease = lease;
    const firstGeneration = firstGenerationLease === undefined
      ? null
      : Object.freeze<WorldProjectFirstGenerationFacade>({
          inspect: (generationId) =>
            new FirstGenerationCoordinator(root, firstGenerationLease).inspect(generationId),
          admit: (intent) =>
            new FirstGenerationCoordinator(root, firstGenerationLease).admit(intent),
          checkpoint: (request) =>
            new FirstGenerationPreSubmitCoordinator(root, firstGenerationLease)
              .checkpoint(request),
          submitResult: (request) =>
            new GenerationSubmitResultCoordinator(root, firstGenerationLease)
              .submitResult(request),
          submitInspect: (generationId) =>
            new GenerationSubmitResultCoordinator(root, firstGenerationLease)
              .inspectSubmitState(generationId),
        });
    const developmentFakeGeneration = firstGenerationLease !== undefined &&
        options.enableDevelopmentFakeGeneration === true
      ? Object.freeze<WorldProjectDevelopmentFakeGenerationFacade>({
          complete: (intent, request) =>
            new DownloadedGenerationCompletionCoordinator(root, firstGenerationLease)
              .complete(intent, request),
        })
      : null;
    const operatorCanaryCompletion = firstGenerationLease !== undefined &&
        options.enableOperatorCanaryCompletion === true
      ? Object.freeze<WorldProjectDownloadedGenerationFacade>({
          completeDownloaded: (intent, request) =>
            new DownloadedGenerationCompletionCoordinator(root, firstGenerationLease)
              .complete(intent, request),
        })
      : null;
    let closed = false;
    const runtime: WorldProjectRuntime = Object.freeze({
      mode: lease === undefined ? "reader" : "writer",
      root,
      artifacts,
      generatedArtifacts,
      reader,
      writer,
      bundles,
      firstGeneration,
      developmentFakeGeneration,
      operatorCanaryCompletion,
      writerUnavailableReason:
        acquired.status === "unavailable" ? acquired.reason : null,
      get closed() {
        return closed;
      },
      async close() {
        if (closed) return;
        if (lease !== undefined) await lease.close();
        root.close();
        closed = true;
      },
    });
    return runtime;
  } catch (error) {
    if (lease !== undefined) await lease.close().catch(() => undefined);
    root.close();
    throw error;
  }
}
