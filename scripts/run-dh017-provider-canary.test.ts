import { describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { bootstrapDataRoot } from "../packages/world-project/src/index";
import { runDh017ProviderCanary } from "./run-dh017-provider-canary";

const REQUEST_ID = "123e4567-e89b-42d3-a456-426614174000";
const GLB = readFileSync(new URL("../packages/world/assets/smooth-vessel-v1.glb", import.meta.url));

describe("runDh017ProviderCanary", () => {
  test("an already-aborted asset race observes a later microtask rejection", async () => {
    const parent = mkdtempSync(join(tmpdir(), "dh017-late-rejection-root-"));
    const root = join(parent, "root");
    bootstrapDataRoot(root);
    const controller = new AbortController();
    const unhandled: unknown[] = [];
    const observe = (reason: unknown) => { unhandled.push(reason); };
    process.on("unhandledRejection", observe);
    try {
      const result = await runDh017ProviderCanary({
        provider: "hunyuan-ai3d-v1",
        dataRoot: root,
        signal: controller.signal,
        readCredential: async () => "test-key-never-log",
        fetchImpl: (request) => {
          if (request.url.includes("tencentcos.cn")) {
            controller.abort();
            return Promise.resolve().then(() => { throw new Error("late injected rejection"); });
          }
          if (request.url.endsWith("/submit")) {
            return Promise.resolve(Response.json({ Response: { JobId: "123456", RequestId: REQUEST_ID } }));
          }
          return Promise.resolve(Response.json({ Response: { Status: "DONE", RequestId: REQUEST_ID, ResultFile3Ds: [{ Type: "GLB", Url: "https://bucket.cos.ap-guangzhou.tencentcos.cn/object.glb?signature=secret" }] } }));
        },
      });
      expect(result).toMatchObject({ status: "download-failed" });
      await Promise.resolve();
      expect(unhandled).toEqual([]);
    } finally {
      process.off("unhandledRejection", observe);
      rmSync(parent, { recursive: true, force: true });
    }
  });

  test("an injected Hunyuan submit fetch that ignores abort cannot hold the Operator", async () => {
    const parent = mkdtempSync(join(tmpdir(), "dh017-submit-abort-root-"));
    const root = join(parent, "root");
    bootstrapDataRoot(root);
    const controller = new AbortController();
    try {
      const result = await runDh017ProviderCanary({
        provider: "hunyuan-ai3d-v1",
        dataRoot: root,
        signal: controller.signal,
        readCredential: async () => "test-key-never-log",
        fetchImpl: () => {
          controller.abort();
          return new Promise<Response>(() => undefined);
        },
      });
      expect(result).toMatchObject({ status: "ambiguous" });
    } finally {
      rmSync(parent, { recursive: true, force: true });
    }
  });

  test("an injected asset fetch that ignores abort cannot hold the Operator", async () => {
    const parent = mkdtempSync(join(tmpdir(), "dh017-asset-abort-root-"));
    const root = join(parent, "root");
    bootstrapDataRoot(root);
    const controller = new AbortController();
    try {
      const result = await runDh017ProviderCanary({
        provider: "hunyuan-ai3d-v1",
        dataRoot: root,
        signal: controller.signal,
        readCredential: async () => "test-key-never-log",
        fetchImpl: (request) => {
          if (request.url.includes("tencentcos.cn")) {
            controller.abort();
            return new Promise<Response>(() => undefined);
          }
          if (request.url.endsWith("/submit")) {
            return Promise.resolve(Response.json({ Response: { JobId: "123456", RequestId: REQUEST_ID } }));
          }
          return Promise.resolve(Response.json({ Response: { Status: "DONE", RequestId: REQUEST_ID, ResultFile3Ds: [{ Type: "GLB", Url: "https://bucket.cos.ap-guangzhou.tencentcos.cn/object.glb?signature=secret" }] } }));
        },
      });
      expect(result).toMatchObject({ status: "download-failed" });
    } finally {
      rmSync(parent, { recursive: true, force: true });
    }
  });

  test("a never-settling asset body cancel does not hold the abort path", async () => {
    const parent = mkdtempSync(join(tmpdir(), "dh017-cancel-abort-root-"));
    const root = join(parent, "root");
    bootstrapDataRoot(root);
    const controller = new AbortController();
    let cancelCalls = 0;
    try {
      const result = await runDh017ProviderCanary({
        provider: "hunyuan-ai3d-v1",
        dataRoot: root,
        signal: controller.signal,
        readCredential: async () => "test-key-never-log",
        fetchImpl: (request) => {
          if (request.url.includes("tencentcos.cn")) {
            return Promise.resolve(new Response(new ReadableStream<Uint8Array>({
              start(stream) {
                stream.enqueue(new Uint8Array(GLB));
              },
              pull() {
                controller.abort();
              },
              cancel() {
                cancelCalls += 1;
                return new Promise<void>(() => undefined);
              },
            }), { status: 200, headers: { "content-type": "application/octet-stream" } }));
          }
          if (request.url.endsWith("/submit")) {
            return Promise.resolve(Response.json({ Response: { JobId: "123456", RequestId: REQUEST_ID } }));
          }
          return Promise.resolve(Response.json({ Response: { Status: "DONE", RequestId: REQUEST_ID, ResultFile3Ds: [{ Type: "GLB", Url: "https://bucket.cos.ap-guangzhou.tencentcos.cn/object.glb?signature=secret" }] } }));
        },
      });
      expect(result).toMatchObject({ status: "download-failed" });
      expect(cancelCalls).toBe(1);
    } finally {
      rmSync(parent, { recursive: true, force: true });
    }
  });

  test("pre-aborted Marble and Hunyuan invocations stop before runtime, credential, or fetch", async () => {
    for (const input of [
      { provider: "worldlabs-marble-v1" as const },
      { provider: "hunyuan-ai3d-v1" as const },
    ]) {
      const controller = new AbortController();
      controller.abort();
      let credentialReads = 0;
      let fetches = 0;
      await expect(runDh017ProviderCanary({
        ...input,
        dataRoot: "/tmp/dh017-pre-aborted-root",
        signal: controller.signal,
        readCredential: async () => { credentialReads += 1; return "test-key-never-log"; },
        fetchImpl: async () => { fetches += 1; return Response.json({}); },
      })).rejects.toThrow("DH017_CANARY_STOPPED");
      expect(credentialReads).toBe(0);
      expect(fetches).toBe(0);
    }
  });

  test("a stale existingHunyuanJobId argument stops before credential or fetch", async () => {
    let credentialReads = 0;
    let fetches = 0;
    const staleInput = {
      provider: "hunyuan-ai3d-v1" as const,
      dataRoot: "/tmp/dh017-stale-job-root",
      existingHunyuanJobId: "1479369951965601792",
      readCredential: async () => { credentialReads += 1; return "test-key-never-log"; },
      fetchImpl: async () => { fetches += 1; return Response.json({}); },
    };
    await expect(runDh017ProviderCanary(staleInput as never))
      .rejects.toThrow("DH017_CANARY_STOPPED");
    expect(credentialReads).toBe(0);
    expect(fetches).toBe(0);
  });

  test("rejects a signed asset response with the wrong exact content type without exposing its URL", async () => {
    const parent = mkdtempSync(join(tmpdir(), "dh017-content-type-root-"));
    const root = join(parent, "root");
    bootstrapDataRoot(root);
    try {
      const result = await runDh017ProviderCanary({
        provider: "hunyuan-ai3d-v1",
        dataRoot: root,
        readCredential: async () => "test-key-never-log",
        fetchImpl: async (request) => {
          if (request.url.includes("tencentcos.cn")) return new Response(GLB, {
            status: 200, headers: { "content-type": "text/plain" },
          });
          if (request.url.endsWith("/submit")) {
            return Response.json({ Response: { JobId: "123456", RequestId: REQUEST_ID } });
          }
          return Response.json({ Response: { Status: "DONE", RequestId: REQUEST_ID, ResultFile3Ds: [{ Type: "GLB", Url: "https://bucket.cos.ap-guangzhou.tencentcos.cn/object.glb?signature=secret" }] } });
        },
      });
      expect(result).toMatchObject({ status: "download-failed", provider: "hunyuan-ai3d-v1" });
      expect(JSON.stringify(result)).not.toContain("signature");
    } finally {
      rmSync(parent, { recursive: true, force: true });
    }
  });

  test("Hunyuan uses injected Keychain/fetch seams, submits before any query capture, and never sends auth to COS", async () => {
    const parent = mkdtempSync(join(tmpdir(), "dh017-real-canary-script-"));
    const root = join(parent, "root");
    bootstrapDataRoot(root);
    const locators: unknown[] = [];
    const requests: Request[] = [];
    let queryCount = 0;
    try {
      const result = await runDh017ProviderCanary({
        provider: "hunyuan-ai3d-v1",
        dataRoot: root,
        readCredential: async (locator) => {
          locators.push(locator);
          return "test-key-never-log";
        },
        fetchImpl: async (request) => {
          requests.push(request);
          if (request.url.includes("tencentcos.cn")) return new Response(GLB, { status: 200, headers: { "content-type": "application/octet-stream" } });
          if (request.url.endsWith("/submit")) {
            return Response.json({ Response: { JobId: "123456", RequestId: REQUEST_ID } });
          }
          queryCount += 1;
          return Response.json({ Response: { Status: "DONE", RequestId: REQUEST_ID, ResultFile3Ds: [{ Type: "GLB", Url: "https://bucket.cos.ap-guangzhou.tencentcos.cn/object.glb?signature=secret" }] } });
        },
      });
      expect(locators).toEqual([{ service: "demiurges-hunyuan-probe", account: "Admin" }]);
      expect(requests[0].url.endsWith("/v1/ai3d/submit")).toBe(true);
      expect(requests.filter((request) => request.url.endsWith("/submit"))).toHaveLength(1);
      expect(queryCount).toBe(1);
      expect(requests.find((request) => request.url.includes("tencentcos.cn"))?.headers.get("authorization")).toBeNull();
      expect(JSON.stringify(result)).not.toContain("test-key-never-log");
      expect(JSON.stringify(result)).not.toContain("signature");
      expect(result).toMatchObject({ status: "verified", provider: "hunyuan-ai3d-v1" });
      // verified 后已有发布 artifact：保留的 zero-artifact 前置条件在 credential
      // 与任何 provider fetch 之前停住第二次 invocation。
      await expect(runDh017ProviderCanary({
        provider: "hunyuan-ai3d-v1",
        dataRoot: root,
        readCredential: async (locator) => {
          locators.push(locator);
          return "test-key-never-log";
        },
        fetchImpl: async () => {
          throw new Error("zero-artifact precondition must precede all provider fetches");
        },
      })).rejects.toThrow("DH017_CANARY_STOPPED");
      expect(locators).toHaveLength(1);
    } finally {
      rmSync(parent, { recursive: true, force: true });
    }
  });

  test("a second invocation resumes the exact remote_bound Hunyuan canary to verified with exactly one submit", async () => {
    const parent = mkdtempSync(join(tmpdir(), "dh017-resume-root-"));
    const root = join(parent, "root");
    bootstrapDataRoot(root);
    const requests: Request[] = [];
    let submits = 0;
    let queries = 0;
    const firstController = new AbortController();
    try {
      // 第一次 invocation：submit 恰好一次；第一个 poll query 处 caller abort →
      // timed-out，durable 停在 remote_bound，无 artifact。
      const first = await runDh017ProviderCanary({
        provider: "hunyuan-ai3d-v1",
        dataRoot: root,
        signal: firstController.signal,
        readCredential: async () => "test-key-never-log",
        fetchImpl: async (request) => {
          requests.push(request);
          if (request.url.endsWith("/submit")) {
            submits += 1;
            return Response.json({ Response: { JobId: "123456", RequestId: REQUEST_ID } });
          }
          queries += 1;
          firstController.abort();
          return Response.json({ Response: { Status: "RUN", RequestId: REQUEST_ID } });
        },
      });
      expect(first).toMatchObject({ status: "timed-out", provider: "hunyuan-ai3d-v1" });
      expect(submits).toBe(1);
      expect(queries).toBe(1);
      // 第二次 invocation：不 submit，resume poll 到 DONE，bounded download
      // 不带 Authorization header，发布 verified。
      const resumed = await runDh017ProviderCanary({
        provider: "hunyuan-ai3d-v1",
        dataRoot: root,
        readCredential: async () => "test-key-never-log",
        fetchImpl: async (request) => {
          requests.push(request);
          if (request.url.includes("tencentcos.cn")) {
            return new Response(GLB, { status: 200, headers: { "content-type": "application/octet-stream" } });
          }
          if (request.url.endsWith("/submit")) {
            submits += 1;
            return Response.json({ Response: { JobId: "123456", RequestId: REQUEST_ID } });
          }
          queries += 1;
          return Response.json({ Response: { Status: "DONE", RequestId: REQUEST_ID, ResultFile3Ds: [{ Type: "GLB", Url: "https://bucket.cos.ap-guangzhou.tencentcos.cn/object.glb?signature=secret" }] } });
        },
      });
      expect(resumed).toMatchObject({ status: "verified", provider: "hunyuan-ai3d-v1" });
      expect(submits).toBe(1);
      expect(queries).toBe(2);
      expect(requests.find((request) => request.url.includes("tencentcos.cn"))?.headers.get("authorization")).toBeNull();
      expect(JSON.stringify(resumed)).not.toContain("test-key-never-log");
      expect(JSON.stringify(resumed)).not.toContain("signature");
    } finally {
      rmSync(parent, { recursive: true, force: true });
    }
  });
});
