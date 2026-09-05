import { createHash } from "node:crypto";

import { decodeHunyuanQueryResponse, decodeProviderResponseJsonBytes } from "./generation-provider-codecs";

type HunyuanProfile = "cloud-response-v1" | "compat-top-level-v1";

export interface HunyuanContractCaptureV1 {
  readonly contractProfile: HunyuanProfile;
  /** package-owned descriptor digest, never a provider response digest. */
  readonly contractShapeDigest: string;
}

const HUNYUAN_DESCRIPTOR = Object.freeze({
  envelope: Object.freeze({ cloud: ["Response"], compat: [] }),
  query: Object.freeze([
    "Status", "RequestId", "ErrorCode", "ErrorMessage", "ResultFile3Ds",
    "ResultCreditDetails", "ResultCreditConsumed",
  ]),
  schema: "demiurges-hunyuan-submit-query-shape-v1",
  submit: Object.freeze(["JobId", "RequestId"]),
});

function shapeDigest(profile: HunyuanProfile): string {
  return createHash("sha256")
    .update(`demiurges-hunyuan-submit-query-shape-v1\\0${profile}\\0${JSON.stringify(HUNYUAN_DESCRIPTOR)}`)
    .digest("hex");
}

export const HUNYUAN_CONTRACT_SHAPE_DIGESTS = Object.freeze({
  "cloud-response-v1": shapeDigest("cloud-response-v1"),
  "compat-top-level-v1": shapeDigest("compat-top-level-v1"),
});

export const MARBLE_CONTRACT_SHAPE_DIGEST = createHash("sha256")
  .update(JSON.stringify({
    operation: ["operation_id", "done", "response", "error"],
    schema: "demiurges-marble-operation-world-shape-v1",
    world: ["world_id", "assets", "world_marble_url"],
  }))
  .digest("hex");

function selectProfile(value: unknown): HunyuanProfile {
  if (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Reflect.ownKeys(value).length === 1 &&
    Object.prototype.hasOwnProperty.call(value, "Response")
  ) {
    return "cloud-response-v1";
  }
  return "compat-top-level-v1";
}

/**
 * One authenticated no-generation query is injected by the Operator boundary.
 * Raw bytes are decoded solely to select and validate the closed profile, then
 * discarded; no raw response, asset URL, request id, or credential is returned.
 */
export async function captureHunyuanContract(
  queryBytes: () => Promise<Uint8Array>,
  existingJobId: string,
): Promise<HunyuanContractCaptureV1> {
  const bytes = await queryBytes();
  const decoded = decodeProviderResponseJsonBytes(bytes);
  const contractProfile = selectProfile(decoded);
  // Validates the selected envelope and all permitted query shapes. The result
  // deliberately remains local so signed output URLs cannot escape this seam.
  decodeHunyuanQueryResponse(decoded, contractProfile, existingJobId);
  return Object.freeze({
    contractProfile,
    contractShapeDigest: HUNYUAN_CONTRACT_SHAPE_DIGESTS[contractProfile],
  });
}
