export type GeneratedArtifactProvider = "worldlabs-marble-v1" | "hunyuan-ai3d-v1";
export type GeneratedArtifactRole = "world-spz-500k" | "world-collider-glb" | "object-glb";
export type GeneratedArtifactFormat = "spz-v2" | "glb-2.0";

export interface GeneratedArtifactMember {
  readonly assetId: string;
  readonly role: GeneratedArtifactRole;
  readonly format: GeneratedArtifactFormat;
  readonly contentDigest: string;
  readonly byteLength: number;
  readonly elementCount: number;
  readonly sourceBounds: {
    readonly min: readonly [number, number, number];
    readonly max: readonly [number, number, number];
  };
}

export interface GeneratedArtifactSet {
  readonly generationId: string;
  readonly provider: GeneratedArtifactProvider;
  readonly artifactSetDigest: string;
  readonly members: readonly GeneratedArtifactMember[];
}

type Fetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
type ErrorCategory = "invalid" | "unavailable" | "recovery" | "request";

const SHA256 = /^[a-f0-9]{64}$/;
const GENERATION_ID = /^generation:sha256:[a-f0-9]{64}$/;
const ASSET_ID = /^asset:generated-sha256-[a-f0-9]{64}$/;
const MAX_SETS = 256;
const MAX_BYTES = 64 * 1024 * 1024;

export class GeneratedArtifactsClientError extends Error {
  readonly category: ErrorCategory;

  constructor(category: ErrorCategory) {
    super(messageFor(category));
    this.name = "GeneratedArtifactsClientError";
    this.category = category;
  }
}

function messageFor(category: ErrorCategory): string {
  switch (category) {
    case "unavailable":
      return "资产目录暂不可用，请稍后刷新。";
    case "recovery":
      return "已验证资产暂不可读取，请稍后刷新。";
    case "invalid":
      return "资产列表响应无效，请刷新重试。";
    case "request":
      return "暂时无法加载已验证资产，请刷新重试。";
  }
}

function plainRecord(value: unknown): Record<string, unknown> {
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Object.prototype
  ) throw new GeneratedArtifactsClientError("invalid");
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== "string") throw new GeneratedArtifactsClientError("invalid");
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (descriptor === undefined || !("value" in descriptor) || !descriptor.enumerable) {
      throw new GeneratedArtifactsClientError("invalid");
    }
  }
  return value as Record<string, unknown>;
}

function exactKeys(value: Record<string, unknown>, keys: readonly string[]): void {
  const actual = Object.keys(value);
  if (actual.length !== keys.length || !keys.every((key) => Object.hasOwn(value, key))) {
    throw new GeneratedArtifactsClientError("invalid");
  }
}

function requireArray(value: unknown): readonly unknown[] {
  if (
    !Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Array.prototype ||
    Reflect.ownKeys(value).length !== value.length + 1
  ) {
    throw new GeneratedArtifactsClientError("invalid");
  }
  for (let index = 0; index < value.length; index += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(value, index);
    if (descriptor === undefined || !("value" in descriptor) || !descriptor.enumerable) {
      throw new GeneratedArtifactsClientError("invalid");
    }
  }
  return value;
}

function requireDigest(value: unknown): string {
  if (typeof value !== "string" || !SHA256.test(value)) throw new GeneratedArtifactsClientError("invalid");
  return value;
}

function canonicalCoordinate(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value) || Object.is(value, -0)) {
    throw new GeneratedArtifactsClientError("invalid");
  }
  const normalized = Number(value.toPrecision(15));
  if (normalized !== value) throw new GeneratedArtifactsClientError("invalid");
  return value;
}

function requireBounds(value: unknown): GeneratedArtifactMember["sourceBounds"] {
  const record = plainRecord(value);
  exactKeys(record, ["min", "max"]);
  const vector = (candidate: unknown): [number, number, number] => {
    const values = requireArray(candidate);
    if (values.length !== 3) throw new GeneratedArtifactsClientError("invalid");
    return [
      canonicalCoordinate(values[0]),
      canonicalCoordinate(values[1]),
      canonicalCoordinate(values[2]),
    ];
  };
  const min = vector(record.min);
  const max = vector(record.max);
  if (!min.every((entry, index) => entry < max[index]!)) {
    throw new GeneratedArtifactsClientError("invalid");
  }
  return Object.freeze({ min: Object.freeze(min), max: Object.freeze(max) });
}

function requireMember(value: unknown): GeneratedArtifactMember {
  const record = plainRecord(value);
  exactKeys(record, [
    "assetId",
    "role",
    "format",
    "contentDigest",
    "byteLength",
    "elementCount",
    "sourceBounds",
  ]);
  if (typeof record.assetId !== "string" || !ASSET_ID.test(record.assetId)) {
    throw new GeneratedArtifactsClientError("invalid");
  }
  const contentDigest = requireDigest(record.contentDigest);
  if (record.assetId !== `asset:generated-sha256-${contentDigest}`) {
    throw new GeneratedArtifactsClientError("invalid");
  }
  if (
    (record.role !== "world-spz-500k" && record.role !== "world-collider-glb" && record.role !== "object-glb") ||
    (record.format !== "spz-v2" && record.format !== "glb-2.0") ||
    typeof record.byteLength !== "number" || !Number.isSafeInteger(record.byteLength) || record.byteLength <= 0 || record.byteLength > MAX_BYTES ||
    typeof record.elementCount !== "number" || !Number.isSafeInteger(record.elementCount) || record.elementCount <= 0
  ) throw new GeneratedArtifactsClientError("invalid");
  return Object.freeze({
    assetId: record.assetId,
    role: record.role,
    format: record.format,
    contentDigest,
    byteLength: record.byteLength,
    elementCount: record.elementCount,
    sourceBounds: requireBounds(record.sourceBounds),
  });
}

function requireOrderedMembers(
  provider: GeneratedArtifactProvider,
  value: unknown,
): readonly GeneratedArtifactMember[] {
  const members = requireArray(value).map(requireMember);
  const expected = provider === "worldlabs-marble-v1"
    ? [["world-spz-500k", "spz-v2"], ["world-collider-glb", "glb-2.0"]] as const
    : [["object-glb", "glb-2.0"]] as const;
  if (
    members.length !== expected.length ||
    members.some((member, index) =>
      member.role !== expected[index]![0] || member.format !== expected[index]![1])
  ) throw new GeneratedArtifactsClientError("invalid");
  return Object.freeze(members);
}

export function decodeGeneratedArtifactList(value: unknown): readonly GeneratedArtifactSet[] {
  const root = plainRecord(value);
  exactKeys(root, ["schemaVersion", "sets"]);
  if (root.schemaVersion !== 1) throw new GeneratedArtifactsClientError("invalid");
  const sets = requireArray(root.sets);
  if (sets.length > MAX_SETS) throw new GeneratedArtifactsClientError("invalid");
  const generationIds = new Set<string>();
  const decoded = sets.map((value) => {
    const record = plainRecord(value);
    exactKeys(record, ["generationId", "provider", "artifactSetDigest", "members"]);
    if (typeof record.generationId !== "string" || !GENERATION_ID.test(record.generationId)) {
      throw new GeneratedArtifactsClientError("invalid");
    }
    if (record.provider !== "worldlabs-marble-v1" && record.provider !== "hunyuan-ai3d-v1") {
      throw new GeneratedArtifactsClientError("invalid");
    }
    if (generationIds.has(record.generationId)) throw new GeneratedArtifactsClientError("invalid");
    generationIds.add(record.generationId);
    const members = requireOrderedMembers(record.provider, record.members);
    return Object.freeze({
      generationId: record.generationId,
      provider: record.provider,
      artifactSetDigest: requireDigest(record.artifactSetDigest),
      members,
    });
  });
  return Object.freeze(decoded);
}

function stableErrorCode(value: unknown): string | undefined {
  try {
    const record = plainRecord(value);
    exactKeys(record, ["code"]);
    return typeof record.code === "string" && /^[A-Z_]{1,80}$/.test(record.code)
      ? record.code
      : undefined;
  } catch {
    return undefined;
  }
}

function categoryForResponse(status: number, code: string | undefined): ErrorCategory {
  if (status === 503 || code === "DATA_ROOT_UNAVAILABLE") return "unavailable";
  if (status === 409 || code === "GENERATION_RECOVERY_REQUIRED") return "recovery";
  return "request";
}

/** A one-request reader for the safe generated-artifact list route. */
export class GeneratedArtifactsClient {
  readonly #fetch: Fetch;
  #inFlight: AbortController | undefined;
  #generation = 0;

  constructor(fetcher: Fetch = globalThis.fetch.bind(globalThis)) {
    this.#fetch = fetcher;
  }

  async refresh(): Promise<readonly GeneratedArtifactSet[] | undefined> {
    this.#inFlight?.abort();
    const controller = new AbortController();
    const generation = ++this.#generation;
    this.#inFlight = controller;
    try {
      const response = await this.#fetch("/api/artifacts", { signal: controller.signal });
      if (controller.signal.aborted || generation !== this.#generation) return undefined;
      if (response.status !== 200) {
        let code: string | undefined;
        try {
          code = stableErrorCode(await response.json());
        } catch {
          // A non-200 body is never shown to Studio.
        }
        throw new GeneratedArtifactsClientError(categoryForResponse(response.status, code));
      }
      let body: unknown;
      try {
        body = await response.json();
      } catch {
        throw new GeneratedArtifactsClientError("invalid");
      }
      const decoded = decodeGeneratedArtifactList(body);
      return controller.signal.aborted || generation !== this.#generation ? undefined : decoded;
    } catch (error) {
      if (controller.signal.aborted || generation !== this.#generation) return undefined;
      if (error instanceof GeneratedArtifactsClientError) throw error;
      throw new GeneratedArtifactsClientError("request");
    } finally {
      if (generation === this.#generation) this.#inFlight = undefined;
    }
  }

  dispose(): void {
    this.#generation += 1;
    this.#inFlight?.abort();
    this.#inFlight = undefined;
  }
}

export function generatedArtifactDownloadHref(generationId: string, assetId: string): string {
  return `/api/artifacts/${encodeURIComponent(generationId)}/${encodeURIComponent(assetId)}`;
}
