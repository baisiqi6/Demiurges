import { describe, expect, test } from "bun:test";

import {
  GenerationProviderTransportError,
  classifyAssetResponse,
  hunyuanQueryUrl,
  hunyuanSubmitUrl,
  marbleOperationUrl,
  marbleSubmitUrl,
  marbleWorldUrl,
  requireHunyuanAssetUrl,
  requireMarbleAssetUrl,
} from "./generation-provider-transport";

function expectCode(action: () => unknown, code: string): void {
  let thrown: unknown;
  try {
    action();
  } catch (error) {
    thrown = error;
  }
  expect(thrown).toBeInstanceOf(GenerationProviderTransportError);
  expect(thrown).toMatchObject({ code });
}

describe("credential-bearing provider URLs", () => {
  test("constructs only the exact frozen Marble and Hunyuan routes", () => {
    expect(marbleSubmitUrl().href).toBe(
      "https://api.worldlabs.ai/marble/v1/worlds:generate",
    );
    expect(marbleOperationUrl("operation_123").href).toBe(
      "https://api.worldlabs.ai/marble/v1/operations/operation_123",
    );
    expect(marbleWorldUrl("world_123").href).toBe(
      "https://api.worldlabs.ai/marble/v1/worlds/world_123",
    );
    expect(hunyuanSubmitUrl().href).toBe(
      "https://api.ai3d.cloud.tencent.com/v1/ai3d/submit",
    );
    expect(hunyuanQueryUrl().href).toBe(
      "https://api.ai3d.cloud.tencent.com/v1/ai3d/query",
    );
  });

  for (const unsafe of [
    ".",
    "..",
    "x/y",
    "x\\y",
    "x%2fy",
    "x?y",
    "x#y",
    "x\u2028y",
  ]) {
    test(`rejects unsafe Marble path segment ${JSON.stringify(unsafe)}`, () => {
      expectCode(() => marbleOperationUrl(unsafe), "PROVIDER_CONTRACT_MISMATCH");
      expectCode(() => marbleWorldUrl(unsafe), "PROVIDER_CONTRACT_MISMATCH");
    });
  }
});

describe("asset URL and redirect closure", () => {
  test("accepts only the frozen Marble and Hunyuan CDN/COS hosts", () => {
    expect(requireMarbleAssetUrl("https://cdn.marble.worldlabs.ai/a.glb").hostname)
      .toBe("cdn.marble.worldlabs.ai");
    expect(requireHunyuanAssetUrl(
      "https://bucket-1.cos.ap-guangzhou.tencentcos.cn/a.glb?sign=x",
    ).hostname).toBe("bucket-1.cos.ap-guangzhou.tencentcos.cn");
    expect(requireHunyuanAssetUrl(
      "https://cos.ap-guangzhou.tencentcos.cn/a.glb",
    ).hostname).toBe("cos.ap-guangzhou.tencentcos.cn");
  });

  for (const unsafe of [
    "http://cdn.marble.worldlabs.ai/a.glb",
    "https://user@cdn.marble.worldlabs.ai/a.glb",
    "https://cdn.marble.worldlabs.ai:444/a.glb",
    "https://evil.example/a.glb",
  ]) {
    test(`rejects unsafe Marble asset URL ${unsafe}`, () => {
      expectCode(() => requireMarbleAssetUrl(unsafe), "DOWNLOAD_REJECTED");
    });
  }

  test("follows only exact allowed redirect statuses and one valid Location", () => {
    const current = requireMarbleAssetUrl(
      "https://cdn.marble.worldlabs.ai/path/a.glb",
    );
    const redirected = classifyAssetResponse({
      status: 307,
      locationValues: ["../b.glb"],
      currentUrl: current,
      redirectCount: 0,
      requireUrl: requireMarbleAssetUrl,
    });
    expect(redirected).toEqual({
      kind: "redirect",
      nextUrl: new URL("https://cdn.marble.worldlabs.ai/b.glb"),
      redirectCount: 1,
    });
    expect(classifyAssetResponse({
      status: 200,
      locationValues: [],
      currentUrl: current,
      redirectCount: 0,
      requireUrl: requireMarbleAssetUrl,
    })).toEqual({ kind: "success" });
  });

  for (const probe of [
    { status: 307, locations: [] },
    { status: 307, locations: ["/a", "/b"] },
    { status: 307, locations: ["bad\nlocation"] },
    { status: 300, locations: ["/a"] },
    { status: 304, locations: ["/a"] },
    { status: 204, locations: [] },
    { status: 206, locations: [] },
    { status: 404, locations: [] },
  ]) {
    test(`rejects status/location matrix ${JSON.stringify(probe)}`, () => {
      const current = requireMarbleAssetUrl(
        "https://cdn.marble.worldlabs.ai/a.glb",
      );
      expectCode(() => classifyAssetResponse({
        status: probe.status,
        locationValues: probe.locations,
        currentUrl: current,
        redirectCount: 0,
        requireUrl: requireMarbleAssetUrl,
      }), "DOWNLOAD_REJECTED");
    });
  }

  test("rejects a third redirect before issuing a fourth raw GET", () => {
    const current = requireMarbleAssetUrl(
      "https://cdn.marble.worldlabs.ai/a.glb",
    );
    expectCode(() => classifyAssetResponse({
      status: 308,
      locationValues: ["/b.glb"],
      currentUrl: current,
      redirectCount: 2,
      requireUrl: requireMarbleAssetUrl,
    }), "DOWNLOAD_REJECTED");
  });
});
