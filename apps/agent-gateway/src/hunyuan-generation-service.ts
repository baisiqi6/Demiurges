import {
  requireGenerationBindingBody,
  type GenerationBindingBodyV1,
  type HunyuanProviderRequestV1,
  type RemoteBoundPayloadV1,
} from "@demiurges/world-project";

import {
  type HunyuanQueryResultV1,
  decodeHunyuanQueryResponse,
  decodeHunyuanSubmitResponse,
  decodeProviderResponseJsonBytes,
} from "./generation-provider-codecs";
import { hunyuanQueryUrl, hunyuanSubmitUrl } from "./generation-provider-transport";

const HUNYUAN_RESPONSE_MAX_BYTES = 256 * 1024;
const HUNYUAN_PROFILE = /^(?:cloud-response-v1|compat-top-level-v1)$/;
const HEX_64 = /^[a-f0-9]{64}$/;
const JOB_ID = /^[0-9]{1,32}$/;
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

type HunyuanProfile = "cloud-response-v1" | "compat-top-level-v1";
type HunyuanFetch = (request: Request) => Promise<Response>;

export interface HunyuanGenerationServiceOptions {
  readonly apiKey: string;
  readonly contractProfile: HunyuanProfile;
  readonly contractShapeDigest: string;
  readonly fetch?: HunyuanFetch;
  readonly createDeadlineSignal?: () => AbortSignal;
}

export type HunyuanSubmitOutcomeV1 =
  | { readonly kind: "success"; readonly remoteBound: RemoteBoundPayloadV1 }
  | { readonly kind: "contract-mismatch"; readonly code: "PROVIDER_CONTRACT_MISMATCH" }
  | { readonly kind: "pre-submit-aborted"; readonly code: "REQUEST_ABORTED" }
  | { readonly kind: "submit-ambiguous"; readonly code: "PROVIDER_SUBMISSION_AMBIGUOUS" };

export type HunyuanQueryOutcomeV1 =
  | { readonly kind: "success"; readonly result: HunyuanQueryResultV1 }
  | {
      readonly kind: "rejected";
      readonly code: "PROVIDER_UNAUTHORIZED" | "PROVIDER_REJECTED";
    }
  | { readonly kind: "contract-mismatch"; readonly code: "PROVIDER_CONTRACT_MISMATCH" }
  | {
      readonly kind: "transient";
      readonly reason:
        | "caller-aborted"
        | "deadline-exceeded"
        | "transport-failure"
        | "body-failure"
        | "rate-limited"
        | "upstream-error"
        | "unsupported-status";
    };

class ResponseBodyLimitError extends Error {}
class ResponseBodyReadError extends Error {}

function contractMismatch<T>(): T & { readonly kind: "contract-mismatch"; readonly code: "PROVIDER_CONTRACT_MISMATCH" } {
  return { kind: "contract-mismatch", code: "PROVIDER_CONTRACT_MISMATCH" } as T & {
    readonly kind: "contract-mismatch";
    readonly code: "PROVIDER_CONTRACT_MISMATCH";
  };
}

function submitAmbiguous(): HunyuanSubmitOutcomeV1 {
  return { kind: "submit-ambiguous", code: "PROVIDER_SUBMISSION_AMBIGUOUS" };
}

function preSubmitAborted(): HunyuanSubmitOutcomeV1 {
  return { kind: "pre-submit-aborted", code: "REQUEST_ABORTED" };
}

function queryAbortOutcome(
  callerSignal: AbortSignal,
  deadlineSignal: AbortSignal,
): HunyuanQueryOutcomeV1 {
  if (callerSignal.aborted) return { kind: "transient", reason: "caller-aborted" };
  if (deadlineSignal.aborted) return { kind: "transient", reason: "deadline-exceeded" };
  return { kind: "transient", reason: "transport-failure" };
}

async function withAbort<T>(operation: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) throw new DOMException("aborted", "AbortError");
  return await new Promise<T>((resolve, reject) => {
    const abort = () => reject(new DOMException("aborted", "AbortError"));
    signal.addEventListener("abort", abort, { once: true });
    operation.then(resolve, reject).finally(() => signal.removeEventListener("abort", abort));
  });
}

async function readBoundedResponse(response: Response, signal: AbortSignal): Promise<Uint8Array> {
  if (response.body === null) throw new ResponseBodyReadError();
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let byteLength = 0;
  try {
    for (;;) {
      try {
        const part = await withAbort(reader.read(), signal);
        if (part.done) break;
        byteLength += part.value.byteLength;
        if (byteLength > HUNYUAN_RESPONSE_MAX_BYTES) throw new ResponseBodyLimitError();
        chunks.push(part.value);
      } catch (error) {
        if (signal.aborted) throw new DOMException("aborted", "AbortError");
        if (error instanceof ResponseBodyLimitError) throw error;
        throw new ResponseBodyReadError();
      }
    }
  } finally {
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
  const bytes = new Uint8Array(byteLength);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

function requireConfiguredProfile(value: string): HunyuanProfile {
  if (!HUNYUAN_PROFILE.test(value)) throw new TypeError("invalid Hunyuan contract profile");
  return value as HunyuanProfile;
}

function requireConfiguredShapeDigest(value: string): string {
  if (!HEX_64.test(value)) throw new TypeError("invalid Hunyuan contract shape digest");
  return value;
}

function requireMatchingBinding(
  input: GenerationBindingBodyV1,
  profile: HunyuanProfile,
  shapeDigest: string,
): HunyuanProviderRequestV1 {
  const binding = requireGenerationBindingBody(input);
  if (
    binding.provider !== "hunyuan-ai3d-v1" ||
    binding.contractProfile !== profile ||
    binding.contractShapeDigest !== shapeDigest ||
    !("Prompt" in binding.providerRequest) ||
    !("Model" in binding.providerRequest)
  ) {
    throw new TypeError("Hunyuan binding mismatch");
  }
  return binding.providerRequest;
}

function requireMatchingRemote(remote: RemoteBoundPayloadV1): string {
  if (
    remote.provider !== "hunyuan-ai3d-v1" ||
    !JOB_ID.test(remote.remoteJobId) ||
    !UUID.test(remote.providerRequestId)
  ) {
    throw new TypeError("Hunyuan remote binding mismatch");
  }
  return remote.remoteJobId;
}

/** Hunyuan authenticated transport 边界；durable lifecycle 仍由后续 coordinator 负责。 */
export class HunyuanGenerationService {
  readonly #apiKey: string;
  readonly #contractProfile: HunyuanProfile;
  readonly #contractShapeDigest: string;
  readonly #fetch: HunyuanFetch;
  readonly #createDeadlineSignal: () => AbortSignal;

  constructor(options: HunyuanGenerationServiceOptions) {
    this.#apiKey = options.apiKey;
    this.#contractProfile = requireConfiguredProfile(options.contractProfile);
    this.#contractShapeDigest = requireConfiguredShapeDigest(options.contractShapeDigest);
    this.#fetch = options.fetch ?? fetch;
    this.#createDeadlineSignal = options.createDeadlineSignal ??
      (() => AbortSignal.timeout(30_000));
  }

  /**
   * 零 fetch binding/profile preflight：复用 submit 的同一 runtime validator，
   * 只暴露 `ready | contract-mismatch`，不揭示 keys/config internals。
   */
  preflightSubmitHunyuanObject(
    bindingInput: GenerationBindingBodyV1,
  ): { readonly kind: "ready" } | { readonly kind: "contract-mismatch" } {
    try {
      requireMatchingBinding(
        bindingInput,
        this.#contractProfile,
        this.#contractShapeDigest,
      );
      return { kind: "ready" };
    } catch {
      return { kind: "contract-mismatch" };
    }
  }

  async submitHunyuanObject(
    bindingInput: GenerationBindingBodyV1,
    callerSignal?: AbortSignal,
  ): Promise<HunyuanSubmitOutcomeV1> {
    let request: HunyuanProviderRequestV1;
    try {
      request = requireMatchingBinding(
        bindingInput,
        this.#contractProfile,
        this.#contractShapeDigest,
      );
    } catch {
      return contractMismatch<HunyuanSubmitOutcomeV1>();
    }

    const caller = callerSignal ?? new AbortController().signal;
    const deadline = this.#createDeadlineSignal();
    const signal = AbortSignal.any([caller, deadline]);
    if (signal.aborted) return preSubmitAborted();

    let response: Response;
    try {
      response = await withAbort(this.#fetch(new Request(hunyuanSubmitUrl().href, {
        body: JSON.stringify(request),
        headers: {
          accept: "application/json",
          "content-type": "application/json",
          Authorization: this.#apiKey,
        },
        method: "POST",
        redirect: "error",
        signal,
      })), signal);
    } catch {
      return submitAmbiguous();
    }
    if (response.status !== 200) return submitAmbiguous();

    try {
      const bytes = await readBoundedResponse(response, signal);
      return {
        kind: "success",
        remoteBound: decodeHunyuanSubmitResponse(
          decodeProviderResponseJsonBytes(bytes),
          this.#contractProfile,
        ),
      };
    } catch {
      return submitAmbiguous();
    }
  }

  async queryHunyuanJob(
    bindingInput: GenerationBindingBodyV1,
    remoteInput: RemoteBoundPayloadV1,
    callerSignal?: AbortSignal,
  ): Promise<HunyuanQueryOutcomeV1> {
    let remoteJobId: string;
    try {
      requireMatchingBinding(
        bindingInput,
        this.#contractProfile,
        this.#contractShapeDigest,
      );
      remoteJobId = requireMatchingRemote(remoteInput);
    } catch {
      return contractMismatch<HunyuanQueryOutcomeV1>();
    }

    const caller = callerSignal ?? new AbortController().signal;
    const deadline = this.#createDeadlineSignal();
    const signal = AbortSignal.any([caller, deadline]);
    if (signal.aborted) return queryAbortOutcome(caller, deadline);

    let response: Response;
    try {
      response = await withAbort(this.#fetch(new Request(hunyuanQueryUrl().href, {
        body: JSON.stringify({ JobId: remoteJobId }),
        headers: {
          accept: "application/json",
          "content-type": "application/json",
          Authorization: this.#apiKey,
        },
        method: "POST",
        redirect: "error",
        signal,
      })), signal);
    } catch {
      return queryAbortOutcome(caller, deadline);
    }

    if (response.status === 401 || response.status === 403) {
      return { kind: "rejected", code: "PROVIDER_UNAUTHORIZED" };
    }
    if (response.status === 400 || response.status === 404 || response.status === 422) {
      return { kind: "rejected", code: "PROVIDER_REJECTED" };
    }
    if (response.status === 429) return { kind: "transient", reason: "rate-limited" };
    if (response.status >= 500 && response.status <= 599) {
      return { kind: "transient", reason: "upstream-error" };
    }
    if (response.status !== 200) return { kind: "transient", reason: "unsupported-status" };

    try {
      const bytes = await readBoundedResponse(response, signal);
      return {
        kind: "success",
        result: decodeHunyuanQueryResponse(
          decodeProviderResponseJsonBytes(bytes),
          this.#contractProfile,
          remoteJobId,
        ),
      };
    } catch (error) {
      if (signal.aborted) return queryAbortOutcome(caller, deadline);
      if (error instanceof ResponseBodyLimitError) return contractMismatch<HunyuanQueryOutcomeV1>();
      if (error instanceof ResponseBodyReadError) {
        return { kind: "transient", reason: "body-failure" };
      }
      return contractMismatch<HunyuanQueryOutcomeV1>();
    }
  }
}
