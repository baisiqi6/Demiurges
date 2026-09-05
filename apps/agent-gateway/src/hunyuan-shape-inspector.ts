import { canonicalJsonBytes, sha256Hex } from "@demiurges/world";

import { parseExactJsonBytes } from "./generation-provider-codecs";

/**
 * Hunyuan shape-only diagnostic inspector.
 *
 * 递归只保留 `object | array | string | number | boolean | null` 与 sorted
 * object field names；array 只保留长度上界内的 unique item shapes。不保留任何
 * scalar value（JobId、RequestId、URL、signed URL、error text、cost、status
 * value、prompt、credential 等一律不进入输出）。
 */

export type HunyuanProfile = "cloud-response-v1" | "compat-top-level-v1";

export type HunyuanShapeNode =
  | { readonly kind: "object"; readonly fields: readonly HunyuanShapeField[] }
  | { readonly kind: "array"; readonly items: readonly HunyuanShapeNode[] }
  | { readonly kind: "string" }
  | { readonly kind: "number" }
  | { readonly kind: "boolean" }
  | { readonly kind: "null" };

export interface HunyuanShapeField {
  readonly name: string;
  readonly shape: HunyuanShapeNode;
}

export interface HunyuanShapeDescriptorV1 {
  readonly schemaVersion: 1;
  readonly httpStatus: number;
  readonly profileCandidate: HunyuanProfile | null;
  readonly shapeDigest: string;
  readonly shape: HunyuanShapeNode;
}

const SHAPE_DOMAIN_SEPARATOR = "demiurges-hunyuan-live-shape-v1\0";
const SHAPE_MAX_DEPTH = 8;
const SHAPE_MAX_NODES = 256;
const SHAPE_MAX_COLLECTION_ITEMS = 128;
const SHAPE_MAX_FIELD_NAME_BYTES = 16 * 1024;

export class HunyuanShapeInspectionError extends Error {
  constructor() {
    super("HUNYUAN_SHAPE_INSPECTION_REJECTED");
    this.name = "HunyuanShapeInspectionError";
  }
}

function rejectShape(): never {
  throw new HunyuanShapeInspectionError();
}

function inspectShape(
  value: unknown,
  state: { nodes: number },
  depth: number,
): HunyuanShapeNode {
  state.nodes += 1;
  if (state.nodes > SHAPE_MAX_NODES || depth > SHAPE_MAX_DEPTH) rejectShape();
  if (value === null) return { kind: "null" };
  if (typeof value === "string") return { kind: "string" };
  if (typeof value === "number") return { kind: "number" };
  if (typeof value === "boolean") return { kind: "boolean" };
  if (Array.isArray(value)) {
    if (value.length > SHAPE_MAX_COLLECTION_ITEMS) rejectShape();
    const items: HunyuanShapeNode[] = [];
    const seen = new Set<string>();
    for (const item of value) {
      const itemShape = inspectShape(item, state, depth + 1);
      // fields 已排序、items 按首次出现顺序，JSON.stringify 因此稳定；
      // 仅用于 array item shape 去重，不参与 digest。
      const key = JSON.stringify(itemShape);
      if (!seen.has(key)) {
        seen.add(key);
        items.push(itemShape);
      }
    }
    return { kind: "array", items: Object.freeze(items) };
  }
  if (typeof value === "object") {
    const keys = Reflect.ownKeys(value);
    if (
      keys.length > SHAPE_MAX_COLLECTION_ITEMS ||
      keys.some((key) => typeof key !== "string")
    ) {
      rejectShape();
    }
    const fields = (keys as readonly string[]).slice().sort().map((name) => {
      if (new TextEncoder().encode(name).byteLength > SHAPE_MAX_FIELD_NAME_BYTES) {
        rejectShape();
      }
      return {
        name,
        shape: inspectShape((value as Record<string, unknown>)[name], state, depth + 1),
      };
    });
    return { kind: "object", fields: Object.freeze(fields) };
  }
  return rejectShape();
}

function candidateProfile(shape: HunyuanShapeNode): HunyuanProfile | null {
  if (shape.kind !== "object") return null;
  if (shape.fields.length === 1 && shape.fields[0]!.name === "Response") {
    return "cloud-response-v1";
  }
  return "compat-top-level-v1";
}

function shapeDigest(shape: HunyuanShapeNode): string {
  const domain = new TextEncoder().encode(SHAPE_DOMAIN_SEPARATOR);
  const body = canonicalJsonBytes(shape);
  const bytes = new Uint8Array(domain.byteLength + body.byteLength);
  bytes.set(domain);
  bytes.set(body, domain.byteLength);
  return sha256Hex(bytes);
}

/**
 * 复用现有 bounded exact JSON parser（fatal UTF-8、duplicate-key、number
 * grammar、256 KiB byte budget），再独立执行 depth/node/collection/field-name
 * 预算。输出中不存在任何 provider scalar value；shapeDigest 是
 * domain-separated canonical descriptor bytes 的 SHA-256，不是 raw response
 * digest。
 */
export function describeHunyuanResponseShape(
  bytes: Uint8Array,
  httpStatus: number,
): HunyuanShapeDescriptorV1 {
  if (!Number.isSafeInteger(httpStatus) || httpStatus < 100 || httpStatus > 599) {
    rejectShape();
  }
  const decoded = parseExactJsonBytes(bytes);
  const shape = inspectShape(decoded, { nodes: 0 }, 0);
  return Object.freeze({
    schemaVersion: 1,
    httpStatus,
    profileCandidate: candidateProfile(shape),
    shapeDigest: shapeDigest(shape),
    shape,
  });
}
