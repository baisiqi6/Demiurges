import { describe, expect, test } from "bun:test";

import {
  GenerationProviderCodecError,
  decodeProviderResponseJsonBytes,
  decodeMarbleOperationResponse,
  decodeMarbleWorldResponse,
  decodeHunyuanQueryResponse,
  decodeHunyuanSubmitResponse,
} from "./generation-provider-codecs";

const REQUEST_ID = "123e4567-e89b-12d3-a456-426614174000";
const MARBLE_OPERATION_ID = "marble_operation_1";
const MARBLE_WORLD_ID = "marble_world_1";

function marbleWorld(overrides: Record<string, unknown> = {}) {
  return {
    world_id: MARBLE_WORLD_ID,
    display_name: "Mossy arch",
    world_marble_url: "https://marble.worldlabs.ai/worlds/demo",
    assets: {
      splats: {
        spz_urls: {
          "100k": "https://cdn.marble.worldlabs.ai/world-100k.spz?sig=x",
          "500k": "https://cdn.marble.worldlabs.ai/world-500k.spz?sig=x",
        },
      },
      mesh: {
        collider_mesh_url: "https://cdn.marble.worldlabs.ai/collider.glb?sig=x",
      },
    },
    ...overrides,
  };
}

function expectCode(action: () => unknown, code: string): void {
  let thrown: unknown;
  try {
    action();
  } catch (error) {
    thrown = error;
  }
  expect(thrown).toBeInstanceOf(GenerationProviderCodecError);
  expect(thrown).toMatchObject({ code });
}

describe("provider response JSON bytes decoder", () => {
  test("accepts exact JSON grammar without changing normal object semantics", () => {
    expect(decodeProviderResponseJsonBytes(new TextEncoder().encode(
      '{"value":[true,false,null,"\\u0041",-12.5e+2]}',
    ))).toEqual({ value: [true, false, null, "A", -1250] });
  });

  for (const bytes of [
    new TextEncoder().encode('{"operation_id":"one","operation_id":"two"}'),
    new TextEncoder().encode('{"outer":{"key":1,"key":2}}'),
    new TextEncoder().encode('{"value":01}'),
    new TextEncoder().encode('{"value":true,}'),
    new Uint8Array([0xef, 0xbb, 0xbf, 0x7b, 0x7d]),
    new Uint8Array([0x7b, 0x22, 0x78, 0x22, 0x3a, 0xc3, 0x7d]),
    new Uint8Array(256 * 1024 + 1),
  ]) {
    test("rejects malformed, duplicate, invalid UTF-8, or oversized response bytes", () => {
      expectCode(
        () => decodeProviderResponseJsonBytes(bytes),
        "PROVIDER_CONTRACT_MISMATCH",
      );
    });
  }
});

describe("Marble operation/world codec", () => {
  test("pending operation freezes the trustworthy remote binding", () => {
    expect(decodeMarbleOperationResponse({
      operation_id: MARBLE_OPERATION_ID,
      done: false,
      created_at: "2026-08-15T10:00:00Z",
      metadata: { progress: 10 },
    })).toEqual({
      kind: "pending",
      remoteBound: {
        provider: "worldlabs-marble-v1",
        remoteJobId: MARBLE_OPERATION_ID,
        providerRequestId: null,
      },
    });
  });

  test("completed operation selects exact 500k SPZ and collider as one set", () => {
    expect(decodeMarbleOperationResponse({
      operation_id: MARBLE_OPERATION_ID,
      done: true,
      error: null,
      response: marbleWorld(),
      cost: {
        total_credits: 7,
        line_items: [{ name: "generation", credits: 7 }],
      },
    }, MARBLE_OPERATION_ID)).toEqual({
      kind: "done",
      remoteBound: {
        provider: "worldlabs-marble-v1",
        remoteJobId: MARBLE_OPERATION_ID,
        providerRequestId: null,
      },
      remoteOutputIdentity: {
        kind: "marble-world",
        operationId: MARBLE_OPERATION_ID,
        worldId: MARBLE_WORLD_ID,
        spzKey: "500k",
        colliderField: "collider_mesh_url",
      },
      spzUrl: "https://cdn.marble.worldlabs.ai/world-500k.spz?sig=x",
      colliderUrl: "https://cdn.marble.worldlabs.ai/collider.glb?sig=x",
      sanitizedCost: { unit: "worldlabs-credit", amount: "7" },
    });
  });

  test("get-world reuses the same identity and asset codec", () => {
    expect(decodeMarbleWorldResponse(
      marbleWorld(),
      MARBLE_OPERATION_ID,
      MARBLE_WORLD_ID,
    ).remoteOutputIdentity.worldId).toBe(MARBLE_WORLD_ID);
    expectCode(() => decodeMarbleWorldResponse(
      marbleWorld(),
      MARBLE_OPERATION_ID,
      "other_world",
    ), "PROVIDER_CONTRACT_MISMATCH");
  });

  test("failure forbids cost and success requires both exact assets", () => {
    expect(decodeMarbleOperationResponse({
      operation_id: MARBLE_OPERATION_ID,
      done: true,
      error: { code: 500, message: "raw provider detail" },
      response: null,
      cost: null,
    })).toEqual({
      kind: "failure",
      remoteBound: {
        provider: "worldlabs-marble-v1",
        remoteJobId: MARBLE_OPERATION_ID,
        providerRequestId: null,
      },
    });
    expectCode(() => decodeMarbleOperationResponse({
      operation_id: MARBLE_OPERATION_ID,
      done: true,
      error: { code: 500 },
      cost: { total_credits: 1 },
    }), "PROVIDER_CONTRACT_MISMATCH");
    expectCode(() => decodeMarbleOperationResponse({
      operation_id: MARBLE_OPERATION_ID,
      done: true,
      response: marbleWorld({
        assets: { splats: { spz_urls: { "500k": "https://cdn.marble.worldlabs.ai/a.spz" } } },
      }),
    }), "PROVIDER_CONTRACT_MISMATCH");
  });

  test("identity, unknown keys and asset origin drift fail closed", () => {
    expectCode(() => decodeMarbleOperationResponse({
      operation_id: MARBLE_OPERATION_ID,
      done: false,
      unknown: true,
    }), "PROVIDER_CONTRACT_MISMATCH");
    expectCode(() => decodeMarbleOperationResponse({
      operation_id: "../escape",
      done: false,
    }), "PROVIDER_CONTRACT_MISMATCH");
    expectCode(() => decodeMarbleOperationResponse({
      operation_id: MARBLE_OPERATION_ID,
      done: true,
      response: marbleWorld({
        assets: {
          splats: { spz_urls: { "500k": "https://evil.example/a.spz" } },
          mesh: { collider_mesh_url: "https://cdn.marble.worldlabs.ai/a.glb" },
        },
      }),
    }), "PROVIDER_CONTRACT_MISMATCH");
  });
});

describe("Hunyuan submit codec", () => {
  test("decodes the two frozen profiles without runtime guessing", () => {
    expect(decodeHunyuanSubmitResponse({
      Response: { JobId: "12345", RequestId: REQUEST_ID },
    }, "cloud-response-v1")).toEqual({
      provider: "hunyuan-ai3d-v1",
      remoteJobId: "12345",
      providerRequestId: REQUEST_ID,
    });
    expect(decodeHunyuanSubmitResponse({
      JobId: "67890",
      RequestId: REQUEST_ID,
    }, "compat-top-level-v1")).toEqual({
      provider: "hunyuan-ai3d-v1",
      remoteJobId: "67890",
      providerRequestId: REQUEST_ID,
    });
  });

  test("profile drift, unknown keys and bad identities fail closed", () => {
    expectCode(() => decodeHunyuanSubmitResponse({
      JobId: "12345",
      RequestId: REQUEST_ID,
    }, "cloud-response-v1"), "PROVIDER_CONTRACT_MISMATCH");
    expectCode(() => decodeHunyuanSubmitResponse({
      Response: { JobId: "job-1", RequestId: REQUEST_ID },
    }, "cloud-response-v1"), "PROVIDER_CONTRACT_MISMATCH");
    expectCode(() => decodeHunyuanSubmitResponse({
      Response: { JobId: "12345", RequestId: REQUEST_ID, extra: true },
    }, "cloud-response-v1"), "PROVIDER_CONTRACT_MISMATCH");
  });
});

describe("Hunyuan query codec", () => {
  test("WAIT/RUN carry no output or cost", () => {
    expect(decodeHunyuanQueryResponse({
      Response: { Status: "WAIT", RequestId: REQUEST_ID },
    }, "cloud-response-v1", "12345")).toEqual({
      kind: "pending",
      status: "WAIT",
      providerRequestId: REQUEST_ID,
    });
    expect(decodeHunyuanQueryResponse({
      Status: "RUN",
      RequestId: REQUEST_ID,
      ResultFile3Ds: null,
      ResultCreditConsumed: null,
    }, "compat-top-level-v1", "12345")).toEqual({
      kind: "pending",
      status: "RUN",
      providerRequestId: REQUEST_ID,
    });
    expectCode(() => decodeHunyuanQueryResponse({
      Status: "RUN",
      RequestId: REQUEST_ID,
      ResultCreditConsumed: 1,
    }, "compat-top-level-v1", "12345"), "PROVIDER_CONTRACT_MISMATCH");
  });

  test("FAIL preserves only sanitized total cost", () => {
    expect(decodeHunyuanQueryResponse({
      Response: {
        Status: "FAIL",
        RequestId: REQUEST_ID,
        ErrorCode: "ProviderFailure",
        ErrorMessage: "raw detail that must not be persisted",
        ResultCreditConsumed: 12.5,
      },
    }, "cloud-response-v1", "12345")).toEqual({
      kind: "failure",
      providerRequestId: REQUEST_ID,
      sanitizedCost: { unit: "hunyuan-credit", amount: "12.5" },
    });
  });

  test("DONE selects exactly one GLB and never selects OBJ", () => {
    const result = decodeHunyuanQueryResponse({
      Response: {
        Status: "DONE",
        RequestId: REQUEST_ID,
        ResultFile3Ds: [
          { Type: "OBJ", Url: "https://bucket.cos.ap-guangzhou.tencentcos.cn/a.obj" },
          { Type: "GLB", Url: "https://bucket.cos.ap-guangzhou.tencentcos.cn/a.glb" },
        ],
        ResultCreditConsumed: 3,
      },
    }, "cloud-response-v1", "12345");
    expect(result).toEqual({
      kind: "done",
      providerRequestId: REQUEST_ID,
      remoteOutputIdentity: {
        kind: "hunyuan-file-set",
        jobId: "12345",
        glbCount: 1,
        objCount: 1,
      },
      glbUrl: "https://bucket.cos.ap-guangzhou.tencentcos.cn/a.glb",
      sanitizedCost: { unit: "hunyuan-credit", amount: "3" },
    });
  });

  for (const files of [
    [{ Type: "OBJ", Url: "https://bucket.cos.ap-guangzhou.tencentcos.cn/a.obj" }],
    [
      { Type: "GLB", Url: "https://bucket.cos.ap-guangzhou.tencentcos.cn/a.glb" },
      { Type: "GLB", Url: "https://bucket.cos.ap-guangzhou.tencentcos.cn/b.glb" },
    ],
    [{ Type: "FBX", Url: "https://bucket.cos.ap-guangzhou.tencentcos.cn/a.fbx" }],
  ]) {
    test(`rejects invalid DONE file set ${JSON.stringify(files)}`, () => {
      expectCode(() => decodeHunyuanQueryResponse({
        Status: "DONE",
        RequestId: REQUEST_ID,
        ResultFile3Ds: files,
      }, "compat-top-level-v1", "12345"), "PROVIDER_CONTRACT_MISMATCH");
    });
  }

  test("invalid cost and unknown payload keys fail closed", () => {
    expectCode(() => decodeHunyuanQueryResponse({
      Status: "FAIL",
      RequestId: REQUEST_ID,
      ResultCreditConsumed: -1,
    }, "compat-top-level-v1", "12345"), "PROVIDER_CONTRACT_MISMATCH");
    expectCode(() => decodeHunyuanQueryResponse({
      Status: "WAIT",
      RequestId: REQUEST_ID,
      Unknown: true,
    }, "compat-top-level-v1", "12345"), "PROVIDER_CONTRACT_MISMATCH");
  });
  test("WAIT/RUN tolerate live empty placeholder fields", () => {
    expect(decodeHunyuanQueryResponse({
      Status: "WAIT",
      RequestId: REQUEST_ID,
      ErrorCode: "",
      ErrorMessage: "",
      ResultFile3Ds: [],
      ResultCreditConsumed: 0,
      ResultCreditDetails: "",
    }, "compat-top-level-v1", "12345")).toEqual({
      kind: "pending",
      status: "WAIT",
      providerRequestId: REQUEST_ID,
    });
    expect(decodeHunyuanQueryResponse({
      Response: {
        Status: "RUN",
        RequestId: REQUEST_ID,
        ErrorCode: "",
        ErrorMessage: "",
        ResultFile3Ds: [],
        ResultCreditConsumed: 0,
        ResultCreditDetails: "",
      },
    }, "cloud-response-v1", "12345")).toEqual({
      kind: "pending",
      status: "RUN",
      providerRequestId: REQUEST_ID,
    });
  });

  test("official DONE placeholder error fields and credit details are tolerated", () => {
    expect(decodeHunyuanQueryResponse({
      Response: {
        Status: "DONE",
        RequestId: REQUEST_ID,
        ErrorCode: "",
        ErrorMessage: "",
        ResultFile3Ds: [
          { Type: "GLB", Url: "https://bucket.cos.ap-guangzhou.tencentcos.cn/a.glb" },
        ],
        ResultCreditConsumed: 3,
        ResultCreditDetails: '{"Model":"hunyuan3d","Credits":2.5}',
      },
    }, "cloud-response-v1", "12345")).toEqual({
      kind: "done",
      providerRequestId: REQUEST_ID,
      remoteOutputIdentity: {
        kind: "hunyuan-file-set",
        jobId: "12345",
        glbCount: 1,
        objCount: 0,
      },
      glbUrl: "https://bucket.cos.ap-guangzhou.tencentcos.cn/a.glb",
      sanitizedCost: { unit: "hunyuan-credit", amount: "3" },
    });
  });

  test("FAIL tolerates empty dense file array and ignores credit details", () => {
    expect(decodeHunyuanQueryResponse({
      Status: "FAIL",
      RequestId: REQUEST_ID,
      ErrorCode: "ProviderFailure",
      ErrorMessage: "raw detail that must not be persisted",
      ResultFile3Ds: [],
      ResultCreditConsumed: 12.5,
      ResultCreditDetails: '{"Error":"raw"}',
    }, "compat-top-level-v1", "12345")).toEqual({
      kind: "failure",
      providerRequestId: REQUEST_ID,
      sanitizedCost: { unit: "hunyuan-credit", amount: "12.5" },
    });
  });

  test("non-empty or malformed placeholder fields fail closed", () => {
    const payloads: Array<Record<string, unknown>> = [
      { Status: "WAIT", RequestId: REQUEST_ID, ErrorCode: "PENDING" },
      { Status: "WAIT", RequestId: REQUEST_ID, ErrorMessage: "busy" },
      { Status: "WAIT", RequestId: REQUEST_ID, ResultFile3Ds: [{ Type: "GLB", Url: "https://bucket.cos.ap-guangzhou.tencentcos.cn/a.glb" }] },
      { Status: "WAIT", RequestId: REQUEST_ID, ResultFile3Ds: {} },
      { Status: "WAIT", RequestId: REQUEST_ID, ResultCreditConsumed: 0.5 },
      { Status: "WAIT", RequestId: REQUEST_ID, ResultCreditDetails: "raw" },
      { Status: "RUN", RequestId: REQUEST_ID, ResultCreditDetails: 5 },
      { Status: "DONE", RequestId: REQUEST_ID, ResultFile3Ds: [{ Type: "GLB", Url: "https://bucket.cos.ap-guangzhou.tencentcos.cn/a.glb" }], ErrorCode: "late" },
      { Status: "DONE", RequestId: REQUEST_ID, ResultFile3Ds: [{ Type: "GLB", Url: "https://bucket.cos.ap-guangzhou.tencentcos.cn/a.glb" }], ErrorMessage: "late" },
      { Status: "DONE", RequestId: REQUEST_ID, ResultFile3Ds: [] },
    ];
    for (const payload of payloads) {
      expectCode(() => decodeHunyuanQueryResponse(payload, "compat-top-level-v1", "12345"), "PROVIDER_CONTRACT_MISMATCH");
    }
  });

  test("non-dense empty file array fails closed", () => {
    const tagged: unknown[] = [];
    (tagged as unknown as Record<string, unknown>).extra = true;
    expectCode(() => decodeHunyuanQueryResponse({
      Status: "WAIT",
      RequestId: REQUEST_ID,
      ResultFile3Ds: tagged,
    }, "compat-top-level-v1", "12345"), "PROVIDER_CONTRACT_MISMATCH");
  });
});
