import { createHash } from "node:crypto";

import { describe, expect, test } from "bun:test";

import { canonicalJsonBytes } from "@demiurges/world";

import {
  describeHunyuanResponseShape,
  HunyuanShapeInspectionError,
  type HunyuanShapeNode,
} from "./hunyuan-shape-inspector";

// Fake response 中的 scalar sentinel：任何 JobId/RequestId/signed URL/error
// text/cost/prompt/key 都不得出现在输出或异常中。
const JOB_ID = "1479369951965601792";
const REQUEST_ID = "123e4567-e89b-42d3-a456-426614174000";
const SIGNED_URL =
  "https://hunyuan-prod-1258344699.cos.ap-guangzhou.tencentcos.cn/result.glb?sign=top-secret";
const ERROR_MESSAGE = "internal failure key=SECRET_TOKEN";
const COST = 1234.5;
const PROMPT = "红色木凳 prompt-red-wooden-stool";
const API_KEY = "synthetic-api-key-sentinel";
const SENTINELS = [JOB_ID, REQUEST_ID, SIGNED_URL, ERROR_MESSAGE, "1234.5", PROMPT, API_KEY];

const SHAPE_DOMAIN = "demiurges-hunyuan-live-shape-v1\0";

function bytes(value: unknown): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(value));
}

function envelope(
  profile: "cloud-response-v1" | "compat-top-level-v1",
  payload: Record<string, unknown>,
): Record<string, unknown> {
  return profile === "cloud-response-v1" ? { Response: payload } : payload;
}

function independentDigest(shape: HunyuanShapeNode): string {
  const domain = new TextEncoder().encode(SHAPE_DOMAIN);
  const body = canonicalJsonBytes(shape);
  const combined = new Uint8Array(domain.byteLength + body.byteLength);
  combined.set(domain);
  combined.set(body, domain.byteLength);
  return createHash("sha256").update(combined).digest("hex");
}

function fileSet(types: readonly ("GLB" | "OBJ")[]): unknown[] {
  return types.map((type, index) => ({
    Type: type,
    Url: `${SIGNED_URL}/${type}/${index}`,
    PreviewImageUrl: index === 0 ? `${SIGNED_URL}/preview/${index}` : null,
  }));
}

const CLOUD_DONE_RESPONSE = {
  Response: {
    Status: "DONE",
    RequestId: REQUEST_ID,
    ErrorCode: null,
    ErrorMessage: null,
    ResultFile3Ds: [
      { Type: "GLB", Url: `${SIGNED_URL}/glb`, PreviewImageUrl: `${SIGNED_URL}/preview` },
      { Type: "OBJ", Url: `${SIGNED_URL}/obj`, PreviewImageUrl: null },
    ],
    ResultCreditDetails: null,
    ResultCreditConsumed: COST,
  },
};

const CLOUD_DONE_SHAPE: HunyuanShapeNode = {
  kind: "object",
  fields: [
    {
      name: "Response",
      shape: {
        kind: "object",
        fields: [
          { name: "ErrorCode", shape: { kind: "null" } },
          { name: "ErrorMessage", shape: { kind: "null" } },
          { name: "RequestId", shape: { kind: "string" } },
          { name: "ResultCreditConsumed", shape: { kind: "number" } },
          { name: "ResultCreditDetails", shape: { kind: "null" } },
          {
            name: "ResultFile3Ds",
            shape: {
              kind: "array",
              items: [
                {
                  kind: "object",
                  fields: [
                    { name: "PreviewImageUrl", shape: { kind: "string" } },
                    { name: "Type", shape: { kind: "string" } },
                    { name: "Url", shape: { kind: "string" } },
                  ],
                },
                {
                  kind: "object",
                  fields: [
                    { name: "PreviewImageUrl", shape: { kind: "null" } },
                    { name: "Type", shape: { kind: "string" } },
                    { name: "Url", shape: { kind: "string" } },
                  ],
                },
              ],
            },
          },
          { name: "Status", shape: { kind: "string" } },
        ],
      },
    },
  ],
};

describe("describeHunyuanResponseShape", () => {
  test("cloud profile: 只输出类型、排序字段名、unique item shapes 与 digest，不含任何 scalar sentinel", () => {
    const descriptor = describeHunyuanResponseShape(bytes(CLOUD_DONE_RESPONSE), 200);
    expect(descriptor.schemaVersion).toBe(1);
    expect(descriptor.httpStatus).toBe(200);
    expect(descriptor.profileCandidate).toBe("cloud-response-v1");
    expect(descriptor.shape).toEqual(CLOUD_DONE_SHAPE);
    const serialized = JSON.stringify(descriptor);
    for (const sentinel of SENTINELS) {
      expect(serialized).not.toContain(sentinel);
    }
  });

  test("compat top-level profile 与 non-object top-level 的 candidate 判定", () => {
    const compat = describeHunyuanResponseShape(bytes(envelope("compat-top-level-v1", {
      Status: "WAIT",
      RequestId: REQUEST_ID,
      ErrorCode: null,
      ErrorMessage: null,
    })), 200);
    expect(compat.profileCandidate).toBe("compat-top-level-v1");
    expect(compat.shape).toEqual({
      kind: "object",
      fields: [
        { name: "ErrorCode", shape: { kind: "null" } },
        { name: "ErrorMessage", shape: { kind: "null" } },
        { name: "RequestId", shape: { kind: "string" } },
        { name: "Status", shape: { kind: "string" } },
      ],
    });

    for (const scalar of ["text", 42, true, null]) {
      const descriptor = describeHunyuanResponseShape(bytes(scalar), 200);
      expect(descriptor.profileCandidate).toBeNull();
    }
  });

  test("field names 排序与 array unique item shapes 去重", () => {
    // 乱序 key 输入 → 输出按字典序。
    const unordered = describeHunyuanResponseShape(bytes({
      Response: {
        ResultFile3Ds: fileSet(["GLB", "OBJ"]),
        Status: "RUN",
        RequestId: REQUEST_ID,
      },
    }), 200);
    expect(unordered.shape.kind).toBe("object");
    if (unordered.shape.kind !== "object") return;
    expect(unordered.shape.fields.map((field) => field.name)).toEqual(["Response"]);
    const response = unordered.shape.fields[0]!.shape;
    expect(response.kind).toBe("object");
    if (response.kind !== "object") return;
    expect(response.fields.map((field) => field.name)).toEqual([
      "RequestId",
      "ResultFile3Ds",
      "Status",
    ]);

    // 两个相同 item shape（都是 string-only object）→ 只保留一个。
    const deduplicated = describeHunyuanResponseShape(bytes({
      Response: {
        Status: "RUN",
        RequestId: REQUEST_ID,
        ResultFile3Ds: [
          { Type: "GLB", Url: `${SIGNED_URL}/a` },
          { Type: "OBJ", Url: `${SIGNED_URL}/b` },
        ],
      },
    }), 200);
    const files = (deduplicated.shape as { kind: "object"; fields: readonly { name: string; shape: HunyuanShapeNode }[] })
      .fields[0]!.shape as { kind: "object"; fields: readonly { name: string; shape: HunyuanShapeNode }[] };
    const filesShape = files.fields.find((field) => field.name === "ResultFile3Ds")!.shape;
    expect(filesShape.kind).toBe("array");
    if (filesShape.kind !== "array") return;
    expect(filesShape.items).toEqual([{
      kind: "object",
      fields: [
        { name: "Type", shape: { kind: "string" } },
        { name: "Url", shape: { kind: "string" } },
      ],
    }]);
  });

  test("shapeDigest 是 domain-separated canonical descriptor bytes 的 SHA-256，不是 raw response digest", () => {
    const descriptor = describeHunyuanResponseShape(bytes(CLOUD_DONE_RESPONSE), 200);
    expect(descriptor.shapeDigest).toMatch(/^[a-f0-9]{64}$/);
    // 独立重算（node:crypto），不依赖实现的 sha256Hex。
    expect(descriptor.shapeDigest).toBe(independentDigest(descriptor.shape));
    // 与 raw response bytes digest 不同。
    expect(descriptor.shapeDigest).not.toBe(
      createHash("sha256").update(bytes(CLOUD_DONE_RESPONSE)).digest("hex"),
    );
    // 相同 shape 相同 digest；httpStatus 不进入 digest。
    expect(describeHunyuanResponseShape(bytes(CLOUD_DONE_RESPONSE), 201).shapeDigest)
      .toBe(descriptor.shapeDigest);
    // 不同 shape → 不同 digest。
    const pending = describeHunyuanResponseShape(bytes(envelope("cloud-response-v1", {
      Status: "RUN",
      RequestId: REQUEST_ID,
    })), 200);
    expect(pending.shapeDigest).not.toBe(descriptor.shapeDigest);
  });

  test("shapeDigest 冻结 golden vector，防止序列化漂移", () => {
    const descriptor = describeHunyuanResponseShape(bytes(CLOUD_DONE_RESPONSE), 200);
    expect(descriptor.shapeDigest).toBe("ba3e8115e3e724bb1d3c4a3591dfcc35024955d8fa60dff2a699b791dd69fba2");
  });

  test("duplicate-key、malformed 与 fatal UTF-8 一律拒绝且异常不含 sentinel", () => {
    const duplicated = `{"Response":{"Status":"DONE","RequestId":"${REQUEST_ID}"},"Response":{"Status":"DONE","RequestId":"${REQUEST_ID}"}}`;
    for (const input of [
      new TextEncoder().encode(duplicated),
      new TextEncoder().encode(`{"Status":"DONE",`),
      new TextEncoder().encode(`{"Status":"DONE","RequestId":${REQUEST_ID}}`),
      new TextEncoder().encode(`{"Status":"DONE","RequestId":"${REQUEST_ID}","ErrorCode":01}`),
    ]) {
      expect(() => describeHunyuanResponseShape(input, 200)).toThrow();
    }
    // 非法 UTF-8 字节序列（0xFF 无法出现在合法 UTF-8 中）。
    const fatal = new Uint8Array([0x7b, 0x22, 0x53, 0x22, 0x3a, 0x22, 0xff, 0x22, 0x7d]);
    expect(() => describeHunyuanResponseShape(fatal, 200)).toThrow();
    // 256 KiB + 1 超界。
    expect(() => describeHunyuanResponseShape(new Uint8Array(256 * 1024 + 1), 200)).toThrow();
  });

  test("depth / node / collection / field-name 预算独立 fail-closed", () => {
    // 合法 JSON 但 depth 9（现有 parser 只保证 byte budget，深度由本 inspector 拒绝）。
    const deep = bytes({
      Response: {
        Status: "RUN",
        RequestId: REQUEST_ID,
        nested: { a: { b: { c: { d: { e: { f: { g: { h: 1 } } } } } } } },
      },
    });
    expect(() => describeHunyuanResponseShape(deep, 200)).toThrow(HunyuanShapeInspectionError);

    // 300 个字段（node budget 256）。
    const manyFields: Record<string, unknown> = { Response: {} };
    const payload = manyFields.Response as Record<string, unknown>;
    for (let index = 0; index < 300; index += 1) payload[`key${index}`] = index;
    expect(() => describeHunyuanResponseShape(bytes(manyFields), 200))
      .toThrow(HunyuanShapeInspectionError);

    // array 超过 collection budget 128。
    const oversizedArray = { Response: { Status: "RUN", RequestId: REQUEST_ID, items: Array.from({ length: 129 }, (_, index) => index) } };
    expect(() => describeHunyuanResponseShape(bytes(oversizedArray), 200))
      .toThrow(HunyuanShapeInspectionError);

    // 超长 field name（> 16 KiB）拒绝。
    const longKey = { Response: { Status: "RUN", RequestId: REQUEST_ID, [`x`.repeat(16 * 1024 + 1)]: 1 } };
    expect(() => describeHunyuanResponseShape(bytes(longKey), 200))
      .toThrow(HunyuanShapeInspectionError);
  });

  test("httpStatus 越界拒绝", () => {
    for (const status of [99, 600, 200.5, Number.NaN]) {
      expect(() => describeHunyuanResponseShape(bytes({ Status: "WAIT" }), status)).toThrow();
    }
  });

  test("WAIT/FAIL 等其余 query shape 只保留类型", () => {
    const failDescriptor = describeHunyuanResponseShape(bytes(envelope("compat-top-level-v1", {
      Status: "FAIL",
      RequestId: REQUEST_ID,
      ErrorCode: "InternalError",
      ErrorMessage: ERROR_MESSAGE,
      ResultCreditConsumed: COST,
    })), 200);
    const serialized = JSON.stringify(failDescriptor);
    expect(serialized).not.toContain("FAIL");
    expect(serialized).not.toContain(ERROR_MESSAGE);
    expect(serialized).not.toContain("1234.5");
    expect(serialized).toContain('"name":"Status"');
    expect(serialized).toContain('"kind":"string"');
  });
});
