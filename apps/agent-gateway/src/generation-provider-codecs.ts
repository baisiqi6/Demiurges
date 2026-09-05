import type {
  GenerationContractProfileV1,
  RemoteBoundPayloadV1,
} from "@demiurges/world-project";

import {
  requireHunyuanAssetUrl,
  requireMarbleAssetUrl,
} from "./generation-provider-transport";

export type GenerationProviderCodecErrorCode = "PROVIDER_CONTRACT_MISMATCH";

export class GenerationProviderCodecError extends Error {
  readonly code: GenerationProviderCodecErrorCode;

  constructor() {
    super("PROVIDER_CONTRACT_MISMATCH");
    this.name = "GenerationProviderCodecError";
    this.code = "PROVIDER_CONTRACT_MISMATCH";
  }
}

export interface SanitizedHunyuanCostV1 {
  readonly unit: "hunyuan-credit";
  readonly amount: string;
}

export interface SanitizedMarbleCostV1 {
  readonly unit: "worldlabs-credit";
  readonly amount: string;
}

export interface MarbleWorldResultV1 {
  readonly remoteOutputIdentity: {
    readonly kind: "marble-world";
    readonly operationId: string;
    readonly worldId: string;
    readonly spzKey: "500k";
    readonly colliderField: "collider_mesh_url";
  };
  readonly spzUrl: string;
  readonly colliderUrl: string;
}

export type MarbleOperationResultV1 =
  | {
      readonly kind: "pending";
      readonly remoteBound: RemoteBoundPayloadV1;
    }
  | {
      readonly kind: "failure";
      readonly remoteBound: RemoteBoundPayloadV1;
    }
  | ({
      readonly kind: "done";
      readonly remoteBound: RemoteBoundPayloadV1;
      readonly sanitizedCost?: SanitizedMarbleCostV1;
    } & MarbleWorldResultV1);

export type HunyuanQueryResultV1 =
  | {
      readonly kind: "pending";
      readonly status: "WAIT" | "RUN";
      readonly providerRequestId: string;
    }
  | {
      readonly kind: "failure";
      readonly providerRequestId: string;
      readonly sanitizedCost?: SanitizedHunyuanCostV1;
    }
  | {
      readonly kind: "done";
      readonly providerRequestId: string;
      readonly remoteOutputIdentity: {
        readonly kind: "hunyuan-file-set";
        readonly jobId: string;
        readonly glbCount: 1;
        readonly objCount: 0 | 1;
      };
      readonly glbUrl: string;
      readonly sanitizedCost?: SanitizedHunyuanCostV1;
    };

type HunyuanProfile = Extract<
  GenerationContractProfileV1,
  "cloud-response-v1" | "compat-top-level-v1"
>;

type PlainRecord = Record<string, unknown>;

const JOB_ID = /^[0-9]{1,32}$/;
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const COST_AMOUNT = /^(?:0|[1-9][0-9]{0,11})(?:\.[0-9]{0,4}[1-9])?$/;
const MARBLE_ID = /^[A-Za-z0-9_-]{1,256}$/;
const RFC3339 =
  /^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(?:\.[0-9]{1,9})?Z$/;
const PROVIDER_JSON_MAX_BYTES = 256 * 1024;
const PROVIDER_JSON_MAX_DEPTH = 8;
const PROVIDER_JSON_MAX_NODES = 256;
const PROVIDER_JSON_MAX_COLLECTION_ITEMS = 128;
const PROVIDER_JSON_MAX_STRING_BYTES = 16 * 1024;

class ExactJsonSyntaxError extends Error {}

class ExactJsonParser {
  #index = 0;
  readonly #source: string;

  constructor(source: string) {
    this.#source = source;
  }

  parse(): unknown {
    this.#skipWhitespace();
    const value = this.#value();
    this.#skipWhitespace();
    if (this.#index !== this.#source.length) this.#invalid();
    return value;
  }

  #value(): unknown {
    const next = this.#source[this.#index];
    if (next === '"') return this.#string();
    if (next === "{") return this.#object();
    if (next === "[") return this.#array();
    if (next === "t") return this.#literal("true", true);
    if (next === "f") return this.#literal("false", false);
    if (next === "n") return this.#literal("null", null);
    if (next === "-" || (next !== undefined && next >= "0" && next <= "9")) {
      return this.#number();
    }
    return this.#invalid();
  }

  #object(): Record<string, unknown> {
    this.#expect("{");
    this.#skipWhitespace();
    const result: Record<string, unknown> = {};
    const keys = new Set<string>();
    if (this.#consume("}")) return result;
    for (;;) {
      this.#skipWhitespace();
      if (this.#source[this.#index] !== '"') this.#invalid();
      const key = this.#string();
      if (keys.has(key)) this.#invalid();
      keys.add(key);
      this.#skipWhitespace();
      this.#expect(":");
      this.#skipWhitespace();
      const value = this.#value();
      Object.defineProperty(result, key, {
        configurable: true,
        enumerable: true,
        value,
        writable: true,
      });
      this.#skipWhitespace();
      if (this.#consume("}")) return result;
      this.#expect(",");
    }
  }

  #array(): unknown[] {
    this.#expect("[");
    this.#skipWhitespace();
    const result: unknown[] = [];
    if (this.#consume("]")) return result;
    for (;;) {
      this.#skipWhitespace();
      result.push(this.#value());
      this.#skipWhitespace();
      if (this.#consume("]")) return result;
      this.#expect(",");
    }
  }

  #string(): string {
    this.#expect('"');
    let result = "";
    while (this.#index < this.#source.length) {
      const character = this.#source[this.#index++]!;
      if (character === '"') return result;
      if (character === "\\") {
        const escape = this.#source[this.#index++];
        if (escape === '"' || escape === "\\" || escape === "/") {
          result += escape;
          continue;
        }
        if (escape === "b") {
          result += "\b";
          continue;
        }
        if (escape === "f") {
          result += "\f";
          continue;
        }
        if (escape === "n") {
          result += "\n";
          continue;
        }
        if (escape === "r") {
          result += "\r";
          continue;
        }
        if (escape === "t") {
          result += "\t";
          continue;
        }
        if (escape !== "u") this.#invalid();
        const hex = this.#source.slice(this.#index, this.#index + 4);
        if (!/^[0-9a-fA-F]{4}$/.test(hex)) this.#invalid();
        result += String.fromCharCode(Number.parseInt(hex, 16));
        this.#index += 4;
        continue;
      }
      if (character.charCodeAt(0) <= 0x1f) this.#invalid();
      result += character;
    }
    return this.#invalid();
  }

  #number(): number {
    const start = this.#index;
    this.#consume("-");
    if (this.#consume("0")) {
      // 后续数字会在最终 grammar 检查中拒绝。
    } else {
      this.#digits("1", "9");
      while (this.#digit()) this.#index += 1;
    }
    if (this.#consume(".")) {
      this.#digits("0", "9");
      while (this.#digit()) this.#index += 1;
    }
    const exponent = this.#source[this.#index];
    if (exponent === "e" || exponent === "E") {
      this.#index += 1;
      const sign = this.#source[this.#index];
      if (sign === "+" || sign === "-") this.#index += 1;
      this.#digits("0", "9");
      while (this.#digit()) this.#index += 1;
    }
    const text = this.#source.slice(start, this.#index);
    if (/^-?0[0-9]/.test(text)) this.#invalid();
    const value = Number(text);
    if (Number.isNaN(value)) this.#invalid();
    return value;
  }

  #literal<T>(text: string, value: T): T {
    if (this.#source.slice(this.#index, this.#index + text.length) !== text) {
      return this.#invalid();
    }
    this.#index += text.length;
    return value;
  }

  #digits(first: string, last: string): void {
    const next = this.#source[this.#index];
    if (next === undefined || next < first || next > last) this.#invalid();
    this.#index += 1;
  }

  #digit(): boolean {
    const next = this.#source[this.#index];
    return next !== undefined && next >= "0" && next <= "9";
  }

  #skipWhitespace(): void {
    while ([" ", "\n", "\r", "\t"].includes(this.#source[this.#index] ?? "")) {
      this.#index += 1;
    }
  }

  #consume(character: string): boolean {
    if (this.#source[this.#index] !== character) return false;
    this.#index += 1;
    return true;
  }

  #expect(character: string): void {
    if (!this.#consume(character)) this.#invalid();
  }

  #invalid(): never {
    throw new ExactJsonSyntaxError();
  }
}

const QUERY_KEYS = Object.freeze([
  "Status",
  "RequestId",
  "ErrorCode",
  "ErrorMessage",
  "ResultFile3Ds",
  "ResultCreditDetails",
  "ResultCreditConsumed",
]);

function mismatch(): never {
  throw new GenerationProviderCodecError();
}

export function decodeProviderResponseJsonBytes(bytes: Uint8Array): unknown {
  if (!(bytes instanceof Uint8Array) || bytes.byteLength > PROVIDER_JSON_MAX_BYTES) {
    return mismatch();
  }
  try {
    return new ExactJsonParser(new TextDecoder("utf-8", {
      fatal: true,
      ignoreBOM: true,
    }).decode(bytes))
      .parse();
  } catch {
    return mismatch();
  }
}

/**
 * 严格 JSON 语法解析：fatal UTF-8、duplicate-key 拒绝、number grammar 拒绝
 * 前导零。Gateway request body 与 provider response 共用同一 parser；
 * 由调用方先做更紧的 byte budget，超限在此抛 PROVIDER_CONTRACT_MISMATCH。
 */
export function parseExactJsonBytes(bytes: Uint8Array): unknown {
  if (!(bytes instanceof Uint8Array) || bytes.byteLength > PROVIDER_JSON_MAX_BYTES) {
    return mismatch();
  }
  try {
    return new ExactJsonParser(new TextDecoder("utf-8", {
      fatal: true,
      ignoreBOM: true,
    }).decode(bytes))
      .parse();
  } catch {
    return mismatch();
  }
}

function plainRecord(value: unknown): PlainRecord {
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Object.prototype
  ) {
    return mismatch();
  }
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== "string") return mismatch();
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (
      descriptor === undefined ||
      !("value" in descriptor) ||
      descriptor.enumerable !== true
    ) {
      return mismatch();
    }
  }
  return value as PlainRecord;
}

function validateJsonBudget(value: unknown): void {
  let nodes = 0;
  const visit = (current: unknown, depth: number): void => {
    nodes += 1;
    if (nodes > PROVIDER_JSON_MAX_NODES || depth > PROVIDER_JSON_MAX_DEPTH) {
      mismatch();
    }
    if (current === null || typeof current === "boolean") return;
    if (typeof current === "string") {
      if (new TextEncoder().encode(current).byteLength > PROVIDER_JSON_MAX_STRING_BYTES) {
        mismatch();
      }
      return;
    }
    if (typeof current === "number") {
      if (!Number.isFinite(current) || Object.is(current, -0)) mismatch();
      return;
    }
    if (Array.isArray(current)) {
      if (
        current.length > PROVIDER_JSON_MAX_COLLECTION_ITEMS ||
        Reflect.ownKeys(current).length !== current.length + 1 ||
        !current.every((_, index) =>
          Object.prototype.hasOwnProperty.call(current, index))
      ) {
        mismatch();
      }
      for (const item of current) visit(item, depth + 1);
      return;
    }
    const record = plainRecord(current);
    const keys = Reflect.ownKeys(record);
    if (keys.length > PROVIDER_JSON_MAX_COLLECTION_ITEMS) mismatch();
    for (const key of keys) visit(record[key as string], depth + 1);
  };
  visit(value, 0);
  let bytes: number;
  try {
    bytes = new TextEncoder().encode(JSON.stringify(value)).byteLength;
  } catch {
    return mismatch();
  }
  if (bytes > PROVIDER_JSON_MAX_BYTES) mismatch();
}

function exactKeys(record: PlainRecord, keys: readonly string[]): void {
  const actual = Reflect.ownKeys(record);
  if (
    actual.length !== keys.length ||
    actual.some((key) => typeof key !== "string") ||
    !keys.every((key) => Object.prototype.hasOwnProperty.call(record, key))
  ) {
    mismatch();
  }
}

function allowedKeys(
  record: PlainRecord,
  required: readonly string[],
  allowed: readonly string[],
): void {
  const keys = Reflect.ownKeys(record);
  if (
    keys.some((key) => typeof key !== "string" || !allowed.includes(key)) ||
    !required.every((key) => Object.prototype.hasOwnProperty.call(record, key))
  ) {
    mismatch();
  }
}

function requirePattern(value: unknown, pattern: RegExp): string {
  if (typeof value !== "string" || !pattern.test(value)) return mismatch();
  return value;
}

function requireProviderAssetHref(
  value: string,
  requireUrl: (input: string) => URL,
): string {
  try {
    return requireUrl(value).href;
  } catch {
    return mismatch();
  }
}

function unwrap(value: unknown, profile: HunyuanProfile): PlainRecord {
  const top = plainRecord(value);
  if (profile === "cloud-response-v1") {
    exactKeys(top, ["Response"]);
    return plainRecord(top.Response);
  }
  return top;
}

function nullish(record: PlainRecord, key: string): boolean {
  return !Object.prototype.hasOwnProperty.call(record, key) || record[key] === null;
}

function requireNullableString(record: PlainRecord, key: string): void {
  if (nullish(record, key)) return;
  if (
    typeof record[key] !== "string" ||
    new TextEncoder().encode(record[key] as string).byteLength > 16 * 1024
  ) {
    mismatch();
  }
}

function nonExponentDecimal(value: number): string {
  const text = value.toString().toLowerCase();
  if (!text.includes("e")) return text;
  const [coefficient, exponentText] = text.split("e");
  const exponent = Number(exponentText);
  if (!Number.isSafeInteger(exponent) || coefficient === undefined) return mismatch();
  const [whole, fraction = ""] = coefficient.split(".");
  if (whole === undefined) return mismatch();
  const digits = `${whole}${fraction}`;
  const decimalIndex = whole.length + exponent;
  if (decimalIndex <= 0) return `0.${"0".repeat(-decimalIndex)}${digits}`;
  if (decimalIndex >= digits.length) {
    return `${digits}${"0".repeat(decimalIndex - digits.length)}`;
  }
  return `${digits.slice(0, decimalIndex)}.${digits.slice(decimalIndex)}`;
}

function sanitizedCost(value: unknown): SanitizedHunyuanCostV1 | undefined {
  if (value === undefined || value === null) return undefined;
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < 0
  ) {
    return mismatch();
  }
  const rounded = Object.is(value, -0) ? 0 : Number(value.toPrecision(15));
  let amount = nonExponentDecimal(rounded);
  if (amount.includes(".")) amount = amount.replace(/0+$/, "").replace(/\.$/, "");
  if (!COST_AMOUNT.test(amount)) return mismatch();
  return { unit: "hunyuan-credit", amount };
}

function requireNullableTimestamp(record: PlainRecord, key: string): void {
  if (nullish(record, key)) return;
  const value = record[key];
  if (
    typeof value !== "string" ||
    new TextEncoder().encode(value).byteLength > PROVIDER_JSON_MAX_STRING_BYTES ||
    !RFC3339.test(value) ||
    !Number.isFinite(Date.parse(value))
  ) {
    mismatch();
  }
}

function requireNullablePlainRecord(record: PlainRecord, key: string): void {
  if (nullish(record, key)) return;
  plainRecord(record[key]);
}

function requireNullableStringArray(record: PlainRecord, key: string): void {
  if (nullish(record, key)) return;
  const value = record[key];
  if (
    !Array.isArray(value) ||
    value.length > PROVIDER_JSON_MAX_COLLECTION_ITEMS ||
    Reflect.ownKeys(value).length !== value.length + 1 ||
    !value.every((item, index) =>
      Object.prototype.hasOwnProperty.call(value, index) &&
      typeof item === "string")
  ) {
    mismatch();
  }
}

function requirePermission(value: unknown): void {
  const permission = plainRecord(value);
  allowedKeys(permission, [], [
    "allow_id_access",
    "allowed_readers",
    "allowed_writers",
    "public",
  ]);
  for (const key of ["allow_id_access", "public"] as const) {
    if (
      Object.prototype.hasOwnProperty.call(permission, key) &&
      typeof permission[key] !== "boolean"
    ) {
      mismatch();
    }
  }
  for (const key of ["allowed_readers", "allowed_writers"] as const) {
    if (Object.prototype.hasOwnProperty.call(permission, key)) {
      requireNullableStringArray(permission, key);
      if (permission[key] === null) mismatch();
    }
  }
}

function sanitizedMarbleCost(value: unknown): SanitizedMarbleCostV1 | undefined {
  if (value === undefined || value === null) return undefined;
  const cost = plainRecord(value);
  allowedKeys(cost, ["total_credits"], ["total_credits", "line_items"]);
  if (
    !Number.isSafeInteger(cost.total_credits) ||
    (cost.total_credits as number) < 0 ||
    Object.is(cost.total_credits, -0)
  ) {
    mismatch();
  }
  if (Object.prototype.hasOwnProperty.call(cost, "line_items")) {
    const items = cost.line_items;
    if (
      !Array.isArray(items) ||
      items.length > PROVIDER_JSON_MAX_COLLECTION_ITEMS ||
      Reflect.ownKeys(items).length !== items.length + 1 ||
      !items.every((_, index) => Object.prototype.hasOwnProperty.call(items, index))
    ) {
      mismatch();
    }
    for (const valueItem of items) {
      const item = plainRecord(valueItem);
      exactKeys(item, ["name", "credits"]);
      if (
        typeof item.name !== "string" ||
        !Number.isSafeInteger(item.credits) ||
        (item.credits as number) < 0 ||
        Object.is(item.credits, -0)
      ) {
        mismatch();
      }
    }
  }
  return {
    unit: "worldlabs-credit",
    amount: (cost.total_credits as number).toString(),
  };
}

function requireOperationError(value: unknown): void {
  const error = plainRecord(value);
  allowedKeys(error, [], ["code", "message"]);
  if (
    Object.prototype.hasOwnProperty.call(error, "code") &&
    error.code !== null &&
    !Number.isSafeInteger(error.code)
  ) {
    mismatch();
  }
  if (
    Object.prototype.hasOwnProperty.call(error, "message") &&
    error.message !== null &&
    typeof error.message !== "string"
  ) {
    mismatch();
  }
}

function decodeMarbleWorld(
  value: unknown,
  operationId: string,
  expectedWorldId?: string,
): MarbleWorldResultV1 {
  const world = plainRecord(value);
  allowedKeys(
    world,
    ["world_id", "display_name", "world_marble_url"],
    [
      "world_id",
      "display_name",
      "world_marble_url",
      "assets",
      "created_at",
      "updated_at",
      "model",
      "permission",
      "tags",
      "world_prompt",
    ],
  );
  const worldId = requirePattern(world.world_id, MARBLE_ID);
  if (expectedWorldId !== undefined && worldId !== expectedWorldId) mismatch();
  if (
    typeof world.display_name !== "string" ||
    typeof world.world_marble_url !== "string"
  ) {
    mismatch();
  }
  requireNullableTimestamp(world, "created_at");
  requireNullableTimestamp(world, "updated_at");
  for (const key of ["model", "world_prompt"] as const) {
    if (key === "model") requireNullableString(world, key);
    else requireNullablePlainRecord(world, key);
  }
  if (!nullish(world, "permission")) requirePermission(world.permission);
  requireNullableStringArray(world, "tags");
  if (!Object.prototype.hasOwnProperty.call(world, "assets") || world.assets === null) {
    mismatch();
  }
  const assets = plainRecord(world.assets);
  allowedKeys(assets, [], ["caption", "imagery", "mesh", "splats", "thumbnail_url"]);
  for (const key of ["caption", "thumbnail_url"] as const) {
    requireNullableString(assets, key);
  }
  if (!nullish(assets, "imagery")) {
    const imagery = plainRecord(assets.imagery);
    allowedKeys(imagery, [], ["pano_url"]);
    requireNullableString(imagery, "pano_url");
  }
  if (nullish(assets, "mesh") || nullish(assets, "splats")) mismatch();
  const mesh = plainRecord(assets.mesh);
  allowedKeys(mesh, [], ["collider_mesh_url"]);
  if (typeof mesh.collider_mesh_url !== "string") mismatch();
  const splats = plainRecord(assets.splats);
  allowedKeys(splats, [], ["semantics_metadata", "spz_urls"]);
  if (!nullish(splats, "semantics_metadata")) {
    const semantics = plainRecord(splats.semantics_metadata);
    allowedKeys(semantics, [], ["ground_plane_offset", "metric_scale_factor"]);
    for (const key of ["ground_plane_offset", "metric_scale_factor"] as const) {
      if (
        Object.prototype.hasOwnProperty.call(semantics, key) &&
        semantics[key] !== null &&
        (typeof semantics[key] !== "number" || !Number.isFinite(semantics[key]))
      ) {
        mismatch();
      }
    }
  }
  if (nullish(splats, "spz_urls")) mismatch();
  const spzUrls = plainRecord(splats.spz_urls);
  const spzKeys = Reflect.ownKeys(spzUrls);
  if (
    spzKeys.length > 16 ||
    spzKeys.some((key) =>
      typeof key !== "string" ||
      typeof spzUrls[key] !== "string") ||
    typeof spzUrls["500k"] !== "string"
  ) {
    mismatch();
  }
  return {
    remoteOutputIdentity: {
      kind: "marble-world",
      operationId,
      worldId,
      spzKey: "500k",
      colliderField: "collider_mesh_url",
    },
    spzUrl: requireProviderAssetHref(spzUrls["500k"], requireMarbleAssetUrl),
    colliderUrl: requireProviderAssetHref(
      mesh.collider_mesh_url,
      requireMarbleAssetUrl,
    ),
  };
}

export function decodeMarbleWorldResponse(
  value: unknown,
  expectedOperationIdInput: string,
  expectedWorldIdInput: string,
): MarbleWorldResultV1 {
  validateJsonBudget(value);
  const operationId = requirePattern(expectedOperationIdInput, MARBLE_ID);
  const worldId = requirePattern(expectedWorldIdInput, MARBLE_ID);
  return decodeMarbleWorld(value, operationId, worldId);
}

export function decodeMarbleOperationResponse(
  value: unknown,
  expectedOperationIdInput?: string,
): MarbleOperationResultV1 {
  validateJsonBudget(value);
  const payload = plainRecord(value);
  allowedKeys(
    payload,
    ["operation_id", "done"],
    [
      "operation_id",
      "done",
      "created_at",
      "updated_at",
      "expires_at",
      "error",
      "metadata",
      "response",
      "cost",
    ],
  );
  const operationId = requirePattern(payload.operation_id, MARBLE_ID);
  if (
    expectedOperationIdInput !== undefined &&
    operationId !== requirePattern(expectedOperationIdInput, MARBLE_ID)
  ) {
    mismatch();
  }
  if (typeof payload.done !== "boolean") mismatch();
  requireNullableTimestamp(payload, "created_at");
  requireNullableTimestamp(payload, "updated_at");
  requireNullableTimestamp(payload, "expires_at");
  requireNullablePlainRecord(payload, "metadata");
  const remoteBound: RemoteBoundPayloadV1 = {
    provider: "worldlabs-marble-v1",
    remoteJobId: operationId,
    providerRequestId: null,
  };
  if (payload.done === false) {
    if (
      !nullish(payload, "error") ||
      !nullish(payload, "response") ||
      !nullish(payload, "cost")
    ) {
      mismatch();
    }
    return { kind: "pending", remoteBound };
  }
  const hasError = !nullish(payload, "error");
  const hasResponse = !nullish(payload, "response");
  if (hasError === hasResponse) mismatch();
  if (hasError) {
    requireOperationError(payload.error);
    if (!nullish(payload, "cost")) mismatch();
    return { kind: "failure", remoteBound };
  }
  const world = decodeMarbleWorld(payload.response, operationId);
  const cost = sanitizedMarbleCost(payload.cost);
  const result = { kind: "done" as const, remoteBound, ...world };
  return cost === undefined ? result : { ...result, sanitizedCost: cost };
}

export function decodeHunyuanSubmitResponse(
  value: unknown,
  profile: HunyuanProfile,
): RemoteBoundPayloadV1 {
  validateJsonBudget(value);
  const payload = unwrap(value, profile);
  exactKeys(payload, ["JobId", "RequestId"]);
  return {
    provider: "hunyuan-ai3d-v1",
    remoteJobId: requirePattern(payload.JobId, JOB_ID),
    providerRequestId: requirePattern(payload.RequestId, UUID),
  };
}

interface HunyuanFileSet {
  readonly glbUrl: string;
  readonly objCount: 0 | 1;
}

function absentNullOrEmptyString(record: PlainRecord, key: string): boolean {
  return nullish(record, key) || record[key] === "";
}

function absentNullOrEmptyDenseArray(record: PlainRecord, key: string): boolean {
  if (nullish(record, key)) return true;
  const value = record[key];
  return (
    Array.isArray(value) &&
    value.length === 0 &&
    Reflect.ownKeys(value).length === 1
  );
}

function requireDenseArray(value: unknown): readonly unknown[] {
  if (
    !Array.isArray(value) ||
    value.length < 1 ||
    value.length > 2 ||
    Reflect.ownKeys(value).length !== value.length + 1 ||
    !value.every((_, index) => Object.prototype.hasOwnProperty.call(value, index))
  ) {
    return mismatch();
  }
  return value;
}

function requireFileSet(value: unknown): HunyuanFileSet {
  const files = requireDenseArray(value);
  let glbUrl: string | undefined;
  let objCount: 0 | 1 = 0;
  for (const entry of files) {
    const file = plainRecord(entry);
    const hasPreview = Object.prototype.hasOwnProperty.call(file, "PreviewImageUrl");
    exactKeys(file, hasPreview ? ["Type", "Url", "PreviewImageUrl"] : ["Type", "Url"]);
    if (file.Type !== "GLB" && file.Type !== "OBJ") mismatch();
    if (typeof file.Url !== "string") mismatch();
    const canonicalUrl = requireProviderAssetHref(file.Url, requireHunyuanAssetUrl);
    if (hasPreview && file.PreviewImageUrl !== null && typeof file.PreviewImageUrl !== "string") {
      mismatch();
    }
    if (file.Type === "GLB") {
      if (glbUrl !== undefined) mismatch();
      glbUrl = canonicalUrl;
    } else {
      if (objCount === 1) mismatch();
      objCount = 1;
    }
  }
  if (glbUrl === undefined) return mismatch();
  return { glbUrl, objCount };
}

export function decodeHunyuanQueryResponse(
  value: unknown,
  profile: HunyuanProfile,
  expectedJobIdInput: string,
): HunyuanQueryResultV1 {
  validateJsonBudget(value);
  const expectedJobId = requirePattern(expectedJobIdInput, JOB_ID);
  const payload = unwrap(value, profile);
  allowedKeys(payload, ["Status", "RequestId"], QUERY_KEYS);
  const providerRequestId = requirePattern(payload.RequestId, UUID);
  requireNullableString(payload, "ErrorCode");
  requireNullableString(payload, "ErrorMessage");
  requireNullableString(payload, "ResultCreditDetails");

  if (payload.Status === "WAIT" || payload.Status === "RUN") {
    if (
      !absentNullOrEmptyString(payload, "ErrorCode") ||
      !absentNullOrEmptyString(payload, "ErrorMessage") ||
      !absentNullOrEmptyDenseArray(payload, "ResultFile3Ds") ||
      (!nullish(payload, "ResultCreditConsumed") && payload.ResultCreditConsumed !== 0) ||
      !absentNullOrEmptyString(payload, "ResultCreditDetails")
    ) {
      return mismatch();
    }
    return {
      kind: "pending",
      status: payload.Status,
      providerRequestId,
    };
  }

  if (payload.Status === "FAIL") {
    if (!absentNullOrEmptyDenseArray(payload, "ResultFile3Ds")) return mismatch();
    const cost = sanitizedCost(payload.ResultCreditConsumed);
    return cost === undefined
      ? { kind: "failure", providerRequestId }
      : { kind: "failure", providerRequestId, sanitizedCost: cost };
  }

  if (payload.Status === "DONE") {
    if (
      !absentNullOrEmptyString(payload, "ErrorCode") ||
      !absentNullOrEmptyString(payload, "ErrorMessage") ||
      !Object.prototype.hasOwnProperty.call(payload, "ResultFile3Ds")
    ) {
      return mismatch();
    }
    const fileSet = requireFileSet(payload.ResultFile3Ds);
    const cost = sanitizedCost(payload.ResultCreditConsumed);
    const result = {
      kind: "done" as const,
      providerRequestId,
      remoteOutputIdentity: {
        kind: "hunyuan-file-set" as const,
        jobId: expectedJobId,
        glbCount: 1 as const,
        objCount: fileSet.objCount,
      },
      glbUrl: fileSet.glbUrl,
    };
    return cost === undefined ? result : { ...result, sanitizedCost: cost };
  }

  return mismatch();
}
