import { describe, expect, test } from "bun:test";

import {
  HUNYUAN_CONTRACT_SHAPE_DIGESTS,
  captureHunyuanContract,
} from "./hunyuan-contract-capture";

const JOB_ID = "123456";
const REQUEST_ID = "123e4567-e89b-42d3-a456-426614174000";

function bytes(value: unknown): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(value));
}

describe("captureHunyuanContract", () => {
  test("uses exactly one injected no-generation query and returns only a closed selection", async () => {
    let calls = 0;
    const result = await captureHunyuanContract(async () => {
      calls += 1;
      return bytes({ Response: { Status: "RUN", RequestId: REQUEST_ID } });
    }, JOB_ID);
    expect(calls).toBe(1);
    expect(result).toEqual({
      contractProfile: "cloud-response-v1",
      contractShapeDigest: HUNYUAN_CONTRACT_SHAPE_DIGESTS["cloud-response-v1"],
    });
    expect(JSON.stringify(result)).not.toContain(REQUEST_ID);
  });

  test("accepts the explicit top-level compatibility profile without retaining raw bytes", async () => {
    const result = await captureHunyuanContract(async () =>
      bytes({ Status: "WAIT", RequestId: REQUEST_ID }), JOB_ID);
    expect(result).toEqual({
      contractProfile: "compat-top-level-v1",
      contractShapeDigest: HUNYUAN_CONTRACT_SHAPE_DIGESTS["compat-top-level-v1"],
    });
  });

  test("rejects malformed or unsupported shapes without selecting a fallback", async () => {
    await expect(captureHunyuanContract(async () => bytes({
      Response: { Status: "RUN", RequestId: REQUEST_ID },
      unexpected: true,
    }), JOB_ID)).rejects.toThrow("PROVIDER_CONTRACT_MISMATCH");
    await expect(captureHunyuanContract(async () => new TextEncoder().encode(
      `{\"Response\":{\"Status\":\"RUN\",\"RequestId\":\"${REQUEST_ID}\"},\"Response\":{\"Status\":\"RUN\",\"RequestId\":\"${REQUEST_ID}\"}}`,
    ), JOB_ID)).rejects.toThrow("PROVIDER_CONTRACT_MISMATCH");
    await expect(captureHunyuanContract(async () => new Uint8Array(256 * 1024 + 1), JOB_ID))
      .rejects.toThrow("PROVIDER_CONTRACT_MISMATCH");
  });
});
