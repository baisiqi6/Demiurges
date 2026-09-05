import { readKeychainCredential } from "./dh013-provider-import";
import { hunyuanQueryUrl } from "../apps/agent-gateway/src/generation-provider-transport";
import {
  describeHunyuanResponseShape,
  type HunyuanShapeDescriptorV1,
} from "../apps/agent-gateway/src/hunyuan-shape-inspector";

/**
 * Operator-only Hunyuan shape diagnostic seam。
 *
 * 使用获批的唯一 no-generation query：exact
 * `POST https://api.ai3d.cloud.tencent.com/v1/ai3d/query`，body 只有已验证
 * JobId，credential 只在 `Authorization`。恰好一次 fetch、`redirect:"error"`、
 * 30s total deadline、256 KiB streamed body。HTTP 非 200 或任何
 * malformed/duplicate-key/oversized/depth-node-limit 都只输出
 * `DH017_HUNYUAN_SHAPE_DIAGNOSTIC_STOPPED`，不重试。
 *
 * 该 seam 默认会读取 Keychain 并联网，只允许 Operator 执行；Worker 与
 * Reviewer 必须通过 injected fake credential/fetch 使用。
 */

const HUNYUAN_KEYCHAIN = { service: "demiurges-hunyuan-probe", account: "Admin" } as const;
const HUNYUAN_JOB_ID = /^[0-9]{1,32}$/;
const HUNYUAN_SHAPE_RESPONSE_MAX_BYTES = 256 * 1024;
const HUNYUAN_SHAPE_TOTAL_DEADLINE_MS = 30_000;
export const DH017_HUNYUAN_SHAPE_DIAGNOSTIC_STOPPED =
  "DH017_HUNYUAN_SHAPE_DIAGNOSTIC_STOPPED";

function fail(): never {
  throw new Error(DH017_HUNYUAN_SHAPE_DIAGNOSTIC_STOPPED);
}

function requireInvocation(jobId: string, signal: AbortSignal): void {
  if (signal.aborted || !HUNYUAN_JOB_ID.test(jobId)) fail();
}

async function abortRaced<T>(operation: Promise<T>, signal: AbortSignal): Promise<T> {
  // 同时观察两个结果：注入的 transport 可能在 caller 已停止后的下一个
  // microtask 才 reject，先挂观察避免 late unhandled rejection。
  void operation.then(() => undefined, () => undefined);
  if (signal.aborted) fail();
  return await new Promise<T>((resolve, reject) => {
    const abort = () => reject(new DOMException("aborted", "AbortError"));
    signal.addEventListener("abort", abort, { once: true });
    operation.then(resolve, reject).finally(() => signal.removeEventListener("abort", abort));
  });
}

async function readBounded(response: Response, signal: AbortSignal): Promise<Uint8Array> {
  if (response.body === null) fail();
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    for (;;) {
      const part = await abortRaced(reader.read(), signal);
      if (part.done) break;
      length += part.value.byteLength;
      if (length > HUNYUAN_SHAPE_RESPONSE_MAX_BYTES) fail();
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

export type HunyuanShapeDiagnosticOutcomeV1 =
  | { readonly kind: "shape"; readonly descriptor: HunyuanShapeDescriptorV1 }
  | { readonly kind: "stopped" };

export async function runHunyuanShapeDiagnostic(input: {
  readonly jobId: string;
  readonly readCredential?: typeof readKeychainCredential;
  readonly fetchImpl?: typeof fetch;
  readonly signal?: AbortSignal;
  readonly createDeadlineSignal?: () => AbortSignal;
}): Promise<HunyuanShapeDiagnosticOutcomeV1> {
  try {
    const callerSignal = input.signal ?? new AbortController().signal;
    requireInvocation(input.jobId, callerSignal);
    const deadline = (input.createDeadlineSignal ??
      (() => AbortSignal.timeout(HUNYUAN_SHAPE_TOTAL_DEADLINE_MS)))();
    const signal = AbortSignal.any([callerSignal, deadline]);
    const readCredential = input.readCredential ?? readKeychainCredential;
    const fetchImpl = input.fetchImpl ?? fetch;

    const credential = await abortRaced(readCredential(HUNYUAN_KEYCHAIN, signal), signal);

    const response = await abortRaced(fetchImpl(new Request(hunyuanQueryUrl().href, {
      body: JSON.stringify({ JobId: input.jobId }),
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        Authorization: credential,
      },
      method: "POST",
      redirect: "error",
      signal,
    })), signal);

    if (response.status !== 200) return { kind: "stopped" };
    const bytes = await readBounded(response, signal);
    return { kind: "shape", descriptor: describeHunyuanResponseShape(bytes, response.status) };
  } catch {
    return { kind: "stopped" };
  }
}

if (import.meta.main) {
  const [jobId] = Bun.argv.slice(2);
  if (jobId === undefined || !HUNYUAN_JOB_ID.test(jobId)) {
    process.exitCode = 64;
  } else {
    runHunyuanShapeDiagnostic({ jobId }).then((outcome) => {
      if (outcome.kind === "shape") {
        process.stdout.write(`${JSON.stringify(outcome.descriptor)}\n`);
      } else {
        process.stderr.write(`${DH017_HUNYUAN_SHAPE_DIAGNOSTIC_STOPPED}\n`);
        process.exitCode = 1;
      }
    }).catch(() => {
      process.stderr.write(`${DH017_HUNYUAN_SHAPE_DIAGNOSTIC_STOPPED}\n`);
      process.exitCode = 1;
    });
  }
}
