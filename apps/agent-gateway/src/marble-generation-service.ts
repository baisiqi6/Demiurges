import {
  requireGenerationBindingBody,
  type GenerationBindingBodyV1,
  type MarbleProviderRequestV1,
} from "@demiurges/world-project";

import {
  type MarbleOperationResultV1,
  type MarbleWorldResultV1,
  decodeMarbleOperationResponse,
  decodeMarbleWorldResponse,
  decodeProviderResponseJsonBytes,
} from "./generation-provider-codecs";
import {
  marbleOperationUrl,
  marbleSubmitUrl,
  marbleWorldUrl,
} from "./generation-provider-transport";

const MARBLE_RESPONSE_MAX_BYTES = 256 * 1024;

type MarbleFetch = (request: Request) => Promise<Response>;

export interface MarbleGenerationServiceOptions {
  readonly apiKey: string;
  readonly fetch?: MarbleFetch;
  readonly createDeadlineSignal?: () => AbortSignal;
}

export type MarbleServiceOutcomeV1<T> =
  | { readonly kind: "success"; readonly result: T }
  | {
      readonly kind: "rejected";
      readonly code:
        | "PROVIDER_UNAUTHORIZED"
        | "PROVIDER_PAYMENT_REQUIRED"
        | "PROVIDER_REJECTED";
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

function contractMismatch<T>(): MarbleServiceOutcomeV1<T> {
  return { kind: "contract-mismatch", code: "PROVIDER_CONTRACT_MISMATCH" };
}

function abortOutcome<T>(
  callerSignal: AbortSignal,
  deadlineSignal: AbortSignal,
): MarbleServiceOutcomeV1<T> {
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

async function readBoundedResponse(
  response: Response,
  signal: AbortSignal,
): Promise<Uint8Array> {
  if (response.body === null) throw new ResponseBodyReadError();
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let byteLength = 0;
  try {
    for (;;) {
      try {
        const part = await withAbort(reader.read(), signal);
        if (part.done) break;
        const bytes = part.value;
        byteLength += bytes.byteLength;
        if (byteLength > MARBLE_RESPONSE_MAX_BYTES) throw new ResponseBodyLimitError();
        chunks.push(bytes);
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
  const responseBytes = new Uint8Array(byteLength);
  let offset = 0;
  for (const chunk of chunks) {
    responseBytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return responseBytes;
}

/** Marble transport 边界；lifecycle 决策仍由后续 coordinator 负责。 */
export class MarbleGenerationService {
  readonly #apiKey: string;
  readonly #fetch: MarbleFetch;
  readonly #createDeadlineSignal: () => AbortSignal;

  constructor(options: MarbleGenerationServiceOptions) {
    this.#apiKey = options.apiKey;
    this.#fetch = options.fetch ?? fetch;
    this.#createDeadlineSignal = options.createDeadlineSignal ??
      (() => AbortSignal.timeout(30_000));
  }

  /**
   * 零 fetch binding/profile preflight：复用 submit 的同一 runtime validator，
   * 只暴露 `ready | contract-mismatch`，不揭示 keys/config internals。
   */
  preflightSubmitMarbleWorld(
    bindingInput: GenerationBindingBodyV1,
  ): { readonly kind: "ready" } | { readonly kind: "contract-mismatch" } {
    return this.#requireSubmitBinding(bindingInput) === null
      ? { kind: "contract-mismatch" }
      : { kind: "ready" };
  }

  #requireSubmitBinding(bindingInput: GenerationBindingBodyV1): MarbleProviderRequestV1 | null {
    try {
      const binding = requireGenerationBindingBody(bindingInput);
      if (
        binding.provider !== "worldlabs-marble-v1" ||
        binding.contractProfile !== "worldlabs-openapi-2026-08-15-v1" ||
        !("world_prompt" in binding.providerRequest)
      ) {
        return null;
      }
      return binding.providerRequest;
    } catch {
      return null;
    }
  }

  async submitMarbleWorld(
    bindingInput: GenerationBindingBodyV1,
    callerSignal?: AbortSignal,
  ): Promise<MarbleServiceOutcomeV1<MarbleOperationResultV1>> {
    const request = this.#requireSubmitBinding(bindingInput);
    if (request === null) return contractMismatch();
    const body = new TextEncoder().encode(JSON.stringify(request));
    return await this.#request(
      marbleSubmitUrl(),
      {
        body,
        headers: {
          accept: "application/json",
          "content-type": "application/json",
          "WLT-Api-Key": this.#apiKey,
        },
        method: "POST",
      },
      callerSignal,
      true,
      (value) => decodeMarbleOperationResponse(value),
    );
  }

  async queryMarbleOperation(
    operationId: string,
    callerSignal?: AbortSignal,
  ): Promise<MarbleServiceOutcomeV1<MarbleOperationResultV1>> {
    try {
      return await this.#request(
        marbleOperationUrl(operationId),
        { headers: { accept: "application/json", "WLT-Api-Key": this.#apiKey }, method: "GET" },
        callerSignal,
        false,
        (value) => decodeMarbleOperationResponse(value, operationId),
      );
    } catch {
      return contractMismatch();
    }
  }

  async getMarbleWorld(
    operationId: string,
    worldId: string,
    callerSignal?: AbortSignal,
  ): Promise<MarbleServiceOutcomeV1<MarbleWorldResultV1>> {
    try {
      return await this.#request(
        marbleWorldUrl(worldId),
        { headers: { accept: "application/json", "WLT-Api-Key": this.#apiKey }, method: "GET" },
        callerSignal,
        false,
        (value) => decodeMarbleWorldResponse(value, operationId, worldId),
      );
    } catch {
      return contractMismatch();
    }
  }

  async #request<T>(
    url: URL,
    init: RequestInit,
    callerSignal: AbortSignal | undefined,
    submitRejection: boolean,
    decode: (value: unknown) => T,
  ): Promise<MarbleServiceOutcomeV1<T>> {
    const caller = callerSignal ?? new AbortController().signal;
    const deadline = this.#createDeadlineSignal();
    const signal = AbortSignal.any([caller, deadline]);
    if (signal.aborted) return abortOutcome(caller, deadline);

    let response: Response;
    try {
      response = await withAbort(this.#fetch(new Request(url.href, {
        ...init,
        redirect: "error",
        signal,
      })), signal);
    } catch {
      return abortOutcome(caller, deadline);
    }

    if (response.status !== 200) {
      if (submitRejection) {
        if (response.status === 401) {
          return { kind: "rejected", code: "PROVIDER_UNAUTHORIZED" };
        }
        if (response.status === 402) {
          return { kind: "rejected", code: "PROVIDER_PAYMENT_REQUIRED" };
        }
        if (response.status === 400 || response.status === 422) {
          return { kind: "rejected", code: "PROVIDER_REJECTED" };
        }
      } else {
        if (response.status === 401 || response.status === 403) {
          return { kind: "rejected", code: "PROVIDER_UNAUTHORIZED" };
        }
        if (
          response.status === 400 ||
          response.status === 404 ||
          response.status === 422
        ) {
          return { kind: "rejected", code: "PROVIDER_REJECTED" };
        }
      }
      if (response.status === 429) return { kind: "transient", reason: "rate-limited" };
      if (response.status >= 500 && response.status <= 599) {
        return { kind: "transient", reason: "upstream-error" };
      }
      return { kind: "transient", reason: "unsupported-status" };
    }

    let bytes: Uint8Array;
    try {
      bytes = await readBoundedResponse(response, signal);
    } catch (error) {
      if (signal.aborted) return abortOutcome(caller, deadline);
      if (error instanceof ResponseBodyLimitError) return contractMismatch();
      return { kind: "transient", reason: "body-failure" };
    }

    try {
      return { kind: "success", result: decode(decodeProviderResponseJsonBytes(bytes)) };
    } catch {
      return contractMismatch();
    }
  }
}
