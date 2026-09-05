import { readFileSync } from "node:fs";

import {
  createGenerationBinding,
  createGenerationIntent,
  requireGenerationRequest,
  type WorldProjectDevelopmentFakeGenerationFacade,
  type WorldProjectFirstGenerationFacade,
} from "@demiurges/world-project";

const PATH = "/api/dev/fake-generation";
const REMOTE_JOB_ID = "12345678";
const PROVIDER_REQUEST_ID = "5b0a1e2e-4c3d-4e5f-8a9b-0c1d2e3f4a5b";
const OBJECT_BYTES = readFileSync(new URL(
  "../../../packages/world/assets/smooth-vessel-v1.glb",
  import.meta.url,
));

export interface DevelopmentFakeGenerationApiOptions {
  readonly firstGeneration?: WorldProjectFirstGenerationFacade | null;
  readonly completion?: WorldProjectDevelopmentFakeGenerationFacade | null;
}

function error(status: number, code: string): Response {
  return Response.json({ code }, { status, headers: { "cache-control": "no-store" } });
}

function fakeIntent() {
  return createGenerationIntent(createGenerationBinding(requireGenerationRequest({
    provider: "hunyuan-ai3d-v1",
    model: "3.1",
    prompt: "local scripted fixture object",
    costUnknownAccepted: true,
    waitForCompletionAndDownload: true,
    idempotencyKey: "development-fake-generation-v1",
  }), {
    contractProfile: "cloud-response-v1",
    contractShapeDigest: "a".repeat(64),
  }), "2026-08-15T10:00:00.000Z");
}

/** Explicit scripted-fixture route; production main never composes it. */
export function createDevelopmentFakeGenerationApi(
  options: DevelopmentFakeGenerationApiOptions,
): { readonly fetch: (request: Request) => Promise<Response | undefined> } {
  return Object.freeze({
    async fetch(request: Request): Promise<Response | undefined> {
      const url = new URL(request.url);
      if (url.pathname !== PATH) return undefined;
      if (request.method !== "POST") return error(405, "METHOD_NOT_ALLOWED");
      if (url.search !== "" || request.body !== null) return error(400, "INVALID_REQUEST");
      const firstGeneration = options.firstGeneration;
      const completion = options.completion;
      if (firstGeneration == null || completion == null) {
        return error(503, "DATA_ROOT_UNAVAILABLE");
      }

      const intent = fakeIntent();
      try {
        let inspection = firstGeneration.submitInspect(intent.generationId);
        if (inspection.status === "absent") {
          const admitted = firstGeneration.admit(intent);
          if (admitted.status !== "admitted") return error(409, "GENERATION_CAPACITY_REACHED");
          inspection = firstGeneration.submitInspect(intent.generationId);
        }
        if (inspection.status !== "present") return error(409, "GENERATION_RECOVERY_REQUIRED");
        if (inspection.current.state === "admitted") {
          const checkpoint = firstGeneration.checkpoint({
            generationId: intent.generationId,
            recordedAt: "2026-08-15T10:00:01.000Z",
            decision: { kind: "ready" },
          });
          if (checkpoint.status !== "ready") return error(409, "GENERATION_CAPACITY_REACHED");
          inspection = firstGeneration.submitInspect(intent.generationId);
        }
        if (inspection.status !== "present") return error(409, "GENERATION_RECOVERY_REQUIRED");
        if (inspection.current.state === "submit_started") {
          const submitted = firstGeneration.submitResult({
            generationId: intent.generationId,
            recordedAt: "2026-08-15T10:00:02.000Z",
            outcome: {
              kind: "remote-bound",
              remoteBound: {
                provider: "hunyuan-ai3d-v1",
                remoteJobId: REMOTE_JOB_ID,
                providerRequestId: PROVIDER_REQUEST_ID,
              },
            },
          });
          if (submitted.status === "capacity-reached") {
            return error(409, "GENERATION_CAPACITY_REACHED");
          }
          inspection = firstGeneration.submitInspect(intent.generationId);
        }
        if (
          inspection.status !== "present" ||
          (inspection.current.state !== "remote_bound" &&
            inspection.current.state !== "verified")
        ) {
          return error(409, "GENERATION_RECOVERY_REQUIRED");
        }
        const completed = completion.complete(intent, {
          remoteOutputIdentity: {
            kind: "hunyuan-file-set",
            jobId: REMOTE_JOB_ID,
            glbCount: 1,
            objCount: 0,
          },
          orderedArtifacts: [{
            outputRole: "object-glb",
            format: "glb-2.0",
            bytes: OBJECT_BYTES,
          }],
          recordedAt: "2026-08-15T10:00:03.000Z",
        });
        return Response.json({
          schemaVersion: 1,
          status: completed.status,
          generationId: completed.set.generationId,
          artifactSetDigest: completed.set.artifactSetDigest,
        }, { headers: { "cache-control": "no-store" } });
      } catch {
        return error(409, "GENERATION_RECOVERY_REQUIRED");
      }
    },
  });
}
