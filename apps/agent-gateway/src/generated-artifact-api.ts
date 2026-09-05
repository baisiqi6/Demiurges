import {
  GeneratedArtifactReaderError,
  type GeneratedArtifactMemberSummaryV1,
  type GeneratedArtifactReader,
  type GeneratedArtifactSetSummaryV1,
} from "@demiurges/world-project";

const ARTIFACTS_PATH = "/api/artifacts";
const ARTIFACTS_PREFIX = `${ARTIFACTS_PATH}/`;
const GENERATION_ID = /^generation:sha256:[a-f0-9]{64}$/;
const ASSET_ID = /^asset:generated-sha256-[a-f0-9]{64}$/;

type GeneratedArtifactReaderPort = Pick<GeneratedArtifactReader, "list" | "read">;

export interface GeneratedArtifactApiOptions {
  readonly reader?: GeneratedArtifactReaderPort;
}

function errorResponse(status: number, code: string): Response {
  return Response.json({ code }, {
    status,
    headers: {
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    },
  });
}

function mediaType(format: GeneratedArtifactMemberSummaryV1["format"]): string {
  return format === "spz-v2" ? "application/octet-stream" : "model/gltf-binary";
}

function decodePathSegments(pathname: string): readonly [string, string] | undefined | null {
  if (!pathname.startsWith(ARTIFACTS_PREFIX)) return undefined;
  const encoded = pathname.slice(ARTIFACTS_PREFIX.length).split("/");
  if (encoded.length !== 2 || encoded.some((segment) => segment.length === 0)) return null;
  try {
    const decoded = encoded.map((segment) => decodeURIComponent(segment));
    if (decoded.some((segment) => /[\\/\0]/.test(segment))) return null;
    return [decoded[0]!, decoded[1]!];
  } catch {
    return null;
  }
}

function findMember(
  sets: readonly GeneratedArtifactSetSummaryV1[],
  generationId: string,
  assetId: string,
): GeneratedArtifactMemberSummaryV1 | undefined {
  return sets.find((set) => set.generationId === generationId)?.members
    .find((member) => member.assetId === assetId);
}

function sameMember(
  left: GeneratedArtifactMemberSummaryV1,
  right: GeneratedArtifactMemberSummaryV1,
): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function readerError(error: unknown): Response | undefined {
  if (!(error instanceof GeneratedArtifactReaderError)) return undefined;
  return error.code === "GENERATION_RECOVERY_REQUIRED"
    ? errorResponse(409, error.code)
    : errorResponse(404, error.code);
}

/** Thin HTTP adapter; generated-set visibility and membership remain package-owned. */
export function createGeneratedArtifactApi(
  options: GeneratedArtifactApiOptions,
): { readonly fetch: (request: Request) => Promise<Response | undefined> } {
  const reader = options.reader;
  return Object.freeze({
    async fetch(request: Request): Promise<Response | undefined> {
      const url = new URL(request.url);
      const dynamicSegments = decodePathSegments(url.pathname);
      const isListRoute = url.pathname === ARTIFACTS_PATH;
      if (!isListRoute && dynamicSegments === undefined) return undefined;
      if (request.method !== "GET") return errorResponse(405, "METHOD_NOT_ALLOWED");
      if (url.search !== "" || request.body !== null) return errorResponse(400, "INVALID_REQUEST");
      if (request.headers.has("range")) return errorResponse(416, "RANGE_NOT_SUPPORTED");
      if (request.signal.aborted) return errorResponse(408, "REQUEST_ABORTED");
      if (reader === undefined) return errorResponse(503, "DATA_ROOT_UNAVAILABLE");
      if (isListRoute) {
        try {
          const sets = reader.list();
          if (request.signal.aborted) return errorResponse(408, "REQUEST_ABORTED");
          return Response.json({ schemaVersion: 1, sets }, {
            headers: {
              "cache-control": "no-store",
              "x-content-type-options": "nosniff",
            },
          });
        } catch (error) {
          return readerError(error) ?? errorResponse(409, "GENERATION_RECOVERY_REQUIRED");
        }
      }
      if (dynamicSegments === null || dynamicSegments === undefined) {
        return errorResponse(400, "INVALID_REQUEST");
      }
      const [generationId, assetId] = dynamicSegments;
      if (!GENERATION_ID.test(generationId) || !ASSET_ID.test(assetId)) {
        return errorResponse(400, "INVALID_REQUEST");
      }
      try {
        const before = findMember(reader.list(), generationId, assetId);
        if (before === undefined) return errorResponse(404, "GENERATED_ARTIFACT_NOT_FOUND");
        if (request.signal.aborted) return errorResponse(408, "REQUEST_ABORTED");
        const bytes = reader.read(generationId, assetId);
        if (request.signal.aborted) return errorResponse(408, "REQUEST_ABORTED");
        const after = findMember(reader.list(), generationId, assetId);
        if (after === undefined || !sameMember(before, after)) {
          return errorResponse(409, "GENERATION_RECOVERY_REQUIRED");
        }
        return new Response(bytes, {
          headers: {
            "content-type": mediaType(after.format),
            "content-length": String(after.byteLength),
            "cache-control": "no-store",
            "x-content-type-options": "nosniff",
            "x-demiurges-generation-id": generationId,
            "x-demiurges-asset-id": assetId,
            "x-demiurges-content-sha256": after.contentDigest,
          },
        });
      } catch (error) {
        return readerError(error) ?? errorResponse(409, "GENERATION_RECOVERY_REQUIRED");
      }
    },
  });
}

export const GENERATED_ARTIFACT_API_TEST_SEAMS = Object.freeze({ decodePathSegments });
