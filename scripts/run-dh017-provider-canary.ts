import { isAbsolute, resolve } from "node:path";

import { openWorldProjectRuntime } from "../packages/world-project/src/index";
import { readKeychainCredential } from "./dh013-provider-import";
import {
  classifyAssetResponse,
  requireHunyuanAssetUrl,
  requireMarbleAssetUrl,
} from "../apps/agent-gateway/src/generation-provider-transport";
import {
  HUNYUAN_CONTRACT_SHAPE_DIGESTS,
  MARBLE_CONTRACT_SHAPE_DIGEST,
} from "../apps/agent-gateway/src/hunyuan-contract-capture";
import { HunyuanGenerationService } from "../apps/agent-gateway/src/hunyuan-generation-service";
import { MarbleGenerationService } from "../apps/agent-gateway/src/marble-generation-service";
import {
  ProviderCanaryRunner,
  type FrozenProviderCanaryV1,
} from "../apps/agent-gateway/src/provider-canary-runner";

const MARBLE = {
  provider: "worldlabs-marble-v1" as const,
  model: "marble-1.0-draft" as const,
  prompt: "A small quiet stone courtyard with a single red wooden stool at the center, flat ground, daylight, no people, no text.",
  keychain: { service: "demiurges-marble-probe", account: "Admin" },
};
const HUNYUAN = {
  provider: "hunyuan-ai3d-v1" as const,
  model: "3.0" as const,
  prompt: "一张结构简单的红色木凳，四条腿，纯色材质，独立单体，无人物，无文字。",
  keychain: { service: "demiurges-hunyuan-probe", account: "Admin" },
};

type Provider = typeof MARBLE.provider | typeof HUNYUAN.provider;

function fail(): never {
  throw new Error("DH017_CANARY_STOPPED");
}

function requireInvocation(input: {
  readonly provider: Provider;
  readonly dataRoot: string;
  readonly existingHunyuanJobId?: never;
}, signal: AbortSignal): void {
  if (signal.aborted || !isAbsolute(input.dataRoot) || input.dataRoot.includes("\0")) fail();
  if (input.provider !== MARBLE.provider && input.provider !== HUNYUAN.provider) fail();
  if ("existingHunyuanJobId" in input) fail();
}

async function abortRaced<T>(operation: Promise<T>, signal: AbortSignal): Promise<T> {
  // Observe both outcomes before the fast abort exit: an injected transport may
  // reject on its next microtask even though the caller has already stopped.
  void operation.then(() => undefined, () => undefined);
  if (signal.aborted) fail();
  return await new Promise<T>((resolve, reject) => {
    const abort = () => reject(new DOMException("aborted", "AbortError"));
    signal.addEventListener("abort", abort, { once: true });
    operation.then(resolve, reject).finally(() => signal.removeEventListener("abort", abort));
  });
}

async function readBounded(response: Response, maximumBytes: number, signal: AbortSignal): Promise<Uint8Array> {
  if (response.body === null) fail();
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    for (;;) {
      const part = await abortRaced(reader.read(), signal);
      if (part.done) break;
      length += part.value.byteLength;
      if (length > maximumBytes) fail();
      chunks.push(part.value);
    }
  } catch {
    fail();
  } finally {
    void reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

function assetDownloader(fetchImpl: typeof fetch) {
  return {
    async download({ provider, format, url, signal }: {
      readonly provider: Provider;
      readonly format: "spz-v2" | "glb-2.0";
      readonly url: string;
      readonly signal: AbortSignal;
    }): Promise<Uint8Array> {
      const requireUrl = provider === "worldlabs-marble-v1"
        ? requireMarbleAssetUrl
        : requireHunyuanAssetUrl;
      let current = requireUrl(url);
      let redirects = 0;
      for (;;) {
        if (signal.aborted) fail();
        let response: Response;
        try {
          response = await abortRaced(fetchImpl(new Request(current, {
            headers: { accept: "application/octet-stream" },
            redirect: "manual",
            signal,
          })), signal);
        } catch {
          fail();
        }
        const location = response.headers.get("location");
        const classification = classifyAssetResponse({
          status: response.status,
          locationValues: location === null ? [] : [location],
          currentUrl: current,
          redirectCount: redirects,
          requireUrl,
        });
        if (classification.kind === "redirect") {
          current = classification.nextUrl;
          redirects = classification.redirectCount;
          continue;
        }
        if (classification.kind !== "success") fail();
        const contentType = response.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase();
        if (format === "spz-v2"
          ? contentType !== "application/octet-stream"
          : contentType !== "model/gltf-binary" && contentType !== "application/octet-stream") fail();
        const maximumBytes = format === "spz-v2"
          ? 16 * 1024 * 1024
          : provider === "worldlabs-marble-v1"
            ? 32 * 1024 * 1024
            : 64 * 1024 * 1024;
        return await readBounded(response, maximumBytes, signal);
      }
    },
  };
}

export async function runDh017ProviderCanary(input: {
  readonly provider: Provider;
  readonly dataRoot: string;
  /** 冻结 seam：旧 JobId capture 参数一律 fail-fast 拒绝，不再接受。 */
  readonly existingHunyuanJobId?: never;
  readonly readCredential?: typeof readKeychainCredential;
  readonly fetchImpl?: typeof fetch;
  readonly signal?: AbortSignal;
}): Promise<unknown> {
  const signal = input.signal ?? AbortSignal.timeout(25 * 60_000);
  requireInvocation(input, signal);
  const dataRoot = resolve(input.dataRoot);
  const readCredential = input.readCredential ?? readKeychainCredential;
  const fetchImpl = input.fetchImpl ?? fetch;
  const runtime = await openWorldProjectRuntime(dataRoot, { enableOperatorCanaryCompletion: true });
  try {
    if (
      runtime.firstGeneration === null ||
      runtime.operatorCanaryCompletion === null ||
      runtime.generatedArtifacts.list().length !== 0
    ) fail();
    if (input.provider === "hunyuan-ai3d-v1") {
      const credential = await readCredential(HUNYUAN.keychain, signal);
      const runner = new ProviderCanaryRunner({
        firstGeneration: runtime.firstGeneration,
        completion: runtime.operatorCanaryCompletion,
        marble: new MarbleGenerationService({ apiKey: "unused", fetch: async () => fail() }),
        hunyuan: new HunyuanGenerationService({
          apiKey: credential,
          contractProfile: "cloud-response-v1",
          contractShapeDigest: HUNYUAN_CONTRACT_SHAPE_DIGESTS["cloud-response-v1"],
          fetch: fetchImpl,
        }),
        downloader: assetDownloader(fetchImpl),
      });
      const canary: FrozenProviderCanaryV1 = {
        provider: HUNYUAN.provider, model: HUNYUAN.model, prompt: HUNYUAN.prompt,
        idempotencyKey: "dh017-hunyuan-real-canary-20260820",
        contract: {
          contractProfile: "cloud-response-v1",
          contractShapeDigest: HUNYUAN_CONTRACT_SHAPE_DIGESTS["cloud-response-v1"],
        },
        maxPollAttempts: 120,
        deadlineAt: new Date(Date.now() + 15 * 60_000).toISOString(),
      };
      return await runner.run(canary, undefined, signal);
    }
    const credential = await readCredential(MARBLE.keychain, signal);
    const runner = new ProviderCanaryRunner({
      firstGeneration: runtime.firstGeneration,
      completion: runtime.operatorCanaryCompletion,
      marble: new MarbleGenerationService({ apiKey: credential, fetch: fetchImpl }),
      hunyuan: new HunyuanGenerationService({
        apiKey: "unused",
        contractProfile: "cloud-response-v1",
        contractShapeDigest: HUNYUAN_CONTRACT_SHAPE_DIGESTS["cloud-response-v1"],
        fetch: async () => fail(),
      }),
      downloader: assetDownloader(fetchImpl),
    });
    const canary: FrozenProviderCanaryV1 = {
      provider: MARBLE.provider, model: MARBLE.model, prompt: MARBLE.prompt,
      idempotencyKey: "dh017-marble-real-canary-20260820",
      contract: { contractProfile: "worldlabs-openapi-2026-08-15-v1", contractShapeDigest: MARBLE_CONTRACT_SHAPE_DIGEST },
      maxPollAttempts: 80,
      deadlineAt: new Date(Date.now() + 20 * 60_000).toISOString(),
    };
    return await runner.run(canary, undefined, signal);
  } finally {
    await runtime.close();
  }
}

if (import.meta.main) {
  const [provider, dataRoot, ...extraArguments] = Bun.argv.slice(2);
  if (
    (provider !== "worldlabs-marble-v1" && provider !== "hunyuan-ai3d-v1") ||
    dataRoot === undefined ||
    extraArguments.length !== 0
  ) {
    process.exitCode = 64;
  } else {
    runDh017ProviderCanary({ provider, dataRoot }).then((result) => {
      // Result is intentionally limited to provider/model/redacted identity/cost-free artifact truth.
      process.stdout.write(`${JSON.stringify(result)}\n`);
    }).catch(() => {
      process.stderr.write("DH017_CANARY_STOPPED\n");
      process.exitCode = 1;
    });
  }
}
