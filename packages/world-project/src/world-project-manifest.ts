import {
  canonicalJsonBytes,
  deepFreeze,
  isDeepFrozen,
  MARBLE_HUNYUAN_MANIFEST_DIGEST,
  MARBLE_HUNYUAN_REGISTRY,
  requireRegisteredSnapshotIdentity,
  requireSnapshotRepresentationIntegrity,
  sha256Hex,
  type RefRecord,
  type Snapshot,
} from "@demiurges/world";
import { requireDataRootProjectId } from "./data-root";

/**
 * `WorldProjectManifestV1` 的 package-owned exact codec。
 *
 * - exact-key、dense-array、plain-data、finite、无 `-0`、未知字段拒绝；
 *   Snapshot/Ref 与 registered representation 语义复用 `@demiurges/world`
 *   的 `requireSnapshotRepresentationIntegrity` / `requireRegisteredSnapshotIdentity`，
 *   不复制规则。
 * - `revision` 是除自身外其余语义字段 canonical bytes 的 SHA-256；
 *   metadata 不含时间戳，同一语义内容得到同一 revision。
 * - legacy `imported-rigid-mesh` / `gaussian-splat` 或任何不能从 manifest
 *   `artifacts` 与受信 registry 闭合的 external representation 以
 *   `PROJECT_ARTIFACT_UNBACKED` fail closed，不误认成 Store-backed registered assets。
 * - 磁盘 JSON/bytes 能解析不自动成为 authority：只有本 codec 全量通过才可信。
 */

export const WORLD_PROJECT_MANIFEST_SCHEMA_VERSION = 1;
export const WORLD_PROJECT_REGISTRY_ID = "registry:marble-hunyuan-v1";

export const WORLD_PROJECT_MANIFEST_MAX_BYTES = 4 * 1024 * 1024;
export const WORLD_PROJECT_PLAIN_DATA_MAX_DEPTH = 64;
export const WORLD_PROJECT_PLAIN_DATA_MAX_NODES = 200_000;
export const WORLD_PROJECT_PLAIN_DATA_MAX_STRING_CHARS = 2_000_000;
export const WORLD_PROJECT_PLAIN_DATA_MAX_COLLECTION_ITEMS = 10_000;
export const WORLD_PROJECT_MAX_SNAPSHOTS = 1024;
export const WORLD_PROJECT_MAX_ENTITIES_PER_SNAPSHOT = 256;
export const WORLD_PROJECT_MAX_ARTIFACTS = 64;
export const WORLD_PROJECT_DISPLAY_NAME_MAX_CHARS = 128;

export const WORLD_PROJECT_REVISION_PATTERN = /^project-revision:sha256:[a-f0-9]{64}$/;
export const WORLD_PROJECT_ARTIFACT_DIGEST_PATTERN = /^[a-f0-9]{64}$/;
export const WORLD_PROJECT_ASSET_ID_PATTERN = /^asset:[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;

export type WorldProjectCodecErrorCode =
  | "PROJECT_SCHEMA_UNSUPPORTED"
  | "PROJECT_MANIFEST_INVALID"
  | "PROJECT_REVISION_MISMATCH"
  | "PROJECT_LINEAGE_INVALID"
  | "PROJECT_CURSOR_INVALID"
  | "PROJECT_CURRENT_REF_INVALID"
  | "PROJECT_REGISTRY_INVALID"
  | "PROJECT_ARTIFACT_INVALID"
  | "PROJECT_ARTIFACT_UNBACKED";

export class WorldProjectCodecError extends Error {
  readonly code: WorldProjectCodecErrorCode;

  constructor(code: WorldProjectCodecErrorCode, message: string) {
    super(message);
    this.name = "WorldProjectCodecError";
    this.code = code;
  }
}

export interface WorldProjectArtifactEntry {
  readonly assetId: `asset:${string}`;
  readonly digest: string;
  readonly byteLength: number;
  readonly format: "spz-v2" | "glb-2.0";
}

export interface WorldProjectManifestV1 {
  readonly schemaVersion: 1;
  readonly projectId: `project:${string}`;
  readonly revision: `project-revision:sha256:${string}`;
  readonly metadata: { readonly displayName: string };
  readonly registry: {
    readonly id: typeof WORLD_PROJECT_REGISTRY_ID;
    readonly manifestDigest: typeof MARBLE_HUNYUAN_MANIFEST_DIGEST;
  };
  readonly snapshots: readonly Snapshot[];
  readonly history: {
    readonly snapshotIds: readonly Snapshot["id"][];
    readonly cursor: number;
  };
  readonly currentRef: RefRecord;
  readonly artifacts: readonly WorldProjectArtifactEntry[];
}

/** revision 覆盖除 `revision` 自身外的全部语义字段。 */
export type WorldProjectManifestRevisionBody = Omit<
  WorldProjectManifestV1,
  "revision"
>;

type DataRecord = Record<string, unknown>;

function fail(code: WorldProjectCodecErrorCode, message: string): never {
  throw new WorldProjectCodecError(code, message);
}

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message.length > 0) return error.message;
  return String(error);
}

// —— 有界 plain-data 投影：own descriptor 复制为全新 plain-data graph ——

interface PlainDataBudget {
  nodes: number;
  stringChars: number;
  collectionItems: number;
}

function projectPlainData(
  value: unknown,
  label: string,
  budget: PlainDataBudget = { nodes: 0, stringChars: 0, collectionItems: 0 },
  depth = 0,
): unknown {
  if (depth > WORLD_PROJECT_PLAIN_DATA_MAX_DEPTH) {
    fail("PROJECT_MANIFEST_INVALID", `${label} plain-data 深度超限`);
  }
  if (value === null || typeof value === "boolean") return value;
  if (typeof value === "string") {
    if (
      /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?:^|[^\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(
        value,
      )
    ) {
      fail("PROJECT_MANIFEST_INVALID", `${label} 不得包含 lone surrogate`);
    }
    budget.stringChars += value.length;
    if (budget.stringChars > WORLD_PROJECT_PLAIN_DATA_MAX_STRING_CHARS) {
      fail("PROJECT_MANIFEST_INVALID", `${label} plain-data 字符串 budget 超限`);
    }
    return value;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value) || Object.is(value, -0)) {
      fail("PROJECT_MANIFEST_INVALID", `${label} 只接受 finite 非 -0 number`);
    }
    return value;
  }
  if (typeof value !== "object") {
    fail("PROJECT_MANIFEST_INVALID", `${label} 类型非法`);
  }
  budget.nodes += 1;
  if (budget.nodes > WORLD_PROJECT_PLAIN_DATA_MAX_NODES) {
    fail("PROJECT_MANIFEST_INVALID", `${label} plain-data node budget 超限`);
  }
  if (Array.isArray(value)) {
    if (Object.getPrototypeOf(value) !== Array.prototype) {
      fail("PROJECT_MANIFEST_INVALID", `${label} 必须是 plain dense array`);
    }
    const lengthDescriptor = Object.getOwnPropertyDescriptor(value, "length");
    if (
      !lengthDescriptor ||
      !("value" in lengthDescriptor) ||
      !Number.isSafeInteger(lengthDescriptor.value) ||
      lengthDescriptor.value < 0
    ) {
      fail("PROJECT_MANIFEST_INVALID", `${label}.length 非法`);
    }
    const length = lengthDescriptor.value;
    budget.collectionItems += length;
    if (
      budget.collectionItems > WORLD_PROJECT_PLAIN_DATA_MAX_COLLECTION_ITEMS
    ) {
      fail("PROJECT_MANIFEST_INVALID", `${label} collection budget 超限`);
    }
    const expectedKeys = new Set<PropertyKey>([
      ...Array.from({ length }, (_, index) => String(index)),
      "length",
    ]);
    const ownKeys = Reflect.ownKeys(value);
    if (
      ownKeys.length !== expectedKeys.size ||
      ownKeys.some((key) => typeof key !== "string" || !expectedKeys.has(key))
    ) {
      fail("PROJECT_MANIFEST_INVALID", `${label} 只能包含 dense indices 与 length`);
    }
    const result: unknown[] = new Array<unknown>(length);
    for (let index = 0; index < length; index += 1) {
      const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
      if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) {
        fail(
          "PROJECT_MANIFEST_INVALID",
          `${label}[${index}] 必须是 enumerable own data property`,
        );
      }
      result[index] = projectPlainData(
        descriptor.value,
        `${label}[${index}]`,
        budget,
        depth + 1,
      );
    }
    return result;
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    fail("PROJECT_MANIFEST_INVALID", `${label} 必须是 plain data record`);
  }
  const ownKeys = Reflect.ownKeys(value);
  budget.collectionItems += ownKeys.length;
  if (budget.collectionItems > WORLD_PROJECT_PLAIN_DATA_MAX_COLLECTION_ITEMS) {
    fail("PROJECT_MANIFEST_INVALID", `${label} collection budget 超限`);
  }
  const result: DataRecord = {};
  for (const key of ownKeys) {
    if (typeof key !== "string" || key === "__proto__") {
      fail("PROJECT_MANIFEST_INVALID", `${label} key 非法`);
    }
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) {
      fail(
        "PROJECT_MANIFEST_INVALID",
        `${label} 必须是 enumerable own-data record`,
      );
    }
    result[key] = projectPlainData(
      descriptor.value,
      `${label}.${key}`,
      budget,
      depth + 1,
    );
  }
  return result;
}

// —— 结构 decode helpers（全部作用于已投影的 plain data） ——

function exactRecord(
  value: unknown,
  label: string,
  keys: readonly string[],
): DataRecord {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    fail("PROJECT_MANIFEST_INVALID", `${label} 必须是 plain data record`);
  }
  const ownKeys = Object.keys(value as DataRecord);
  if (
    ownKeys.length !== keys.length ||
    ownKeys.some((key) => !keys.includes(key)) ||
    keys.some((key) => !ownKeys.includes(key))
  ) {
    fail(
      "PROJECT_MANIFEST_INVALID",
      `${label} 字段必须恰好为 ${keys.join(", ") || "<none>"}`,
    );
  }
  return value as DataRecord;
}

function denseArray(
  value: unknown,
  label: string,
  maximum: number,
): readonly unknown[] {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype) {
    fail("PROJECT_MANIFEST_INVALID", `${label} 必须是 plain dense array`);
  }
  if (value.length > maximum) {
    fail("PROJECT_MANIFEST_INVALID", `${label} 长度超限（>${maximum}）`);
  }
  return value;
}

function requireProjectId(value: unknown): `project:${string}` {
  try {
    // requireDataRootProjectId 已用共享正则验证；字面量类型只描述已验证形状。
    return requireDataRootProjectId(value) as `project:${string}`;
  } catch (error) {
    fail("PROJECT_MANIFEST_INVALID", `projectId 非法：${errorMessage(error)}`);
  }
}

function requireDisplayName(value: unknown): string {
  if (typeof value !== "string") {
    fail("PROJECT_MANIFEST_INVALID", "displayName 必须是 string");
  }
  if (
    value.length === 0 ||
    value.length > WORLD_PROJECT_DISPLAY_NAME_MAX_CHARS
  ) {
    fail(
      "PROJECT_MANIFEST_INVALID",
      `displayName 长度必须为 1-${WORLD_PROJECT_DISPLAY_NAME_MAX_CHARS} 字符`,
    );
  }
  if (value.normalize("NFC") !== value) {
    fail("PROJECT_MANIFEST_INVALID", "displayName 必须是 NFC 规范化文本");
  }
  if (/[\u0000-\u001F\u007F]/.test(value)) {
    fail("PROJECT_MANIFEST_INVALID", "displayName 不得含控制字符");
  }
  return value;
}
function requireRevision(value: unknown): `project-revision:sha256:${string}` {
  if (typeof value !== "string" || !WORLD_PROJECT_REVISION_PATTERN.test(value)) {
    fail(
      "PROJECT_MANIFEST_INVALID",
      "revision 必须是 project-revision:sha256:<64 位 lowercase hex>",
    );
  }
  // 正则已精确验证形状；字面量类型只描述已验证值。
  return value as `project-revision:sha256:${string}`;
}

function requireSnapshot(value: unknown, label: string): Snapshot {
  try {
    requireSnapshotRepresentationIntegrity(value as Snapshot);
    requireRegisteredSnapshotIdentity(value as Snapshot);
  } catch (error) {
    fail("PROJECT_MANIFEST_INVALID", `${label} 非法：${errorMessage(error)}`);
  }
  const snapshot = value as Snapshot;
  if (snapshot.entities.length > WORLD_PROJECT_MAX_ENTITIES_PER_SNAPSHOT) {
    fail("PROJECT_MANIFEST_INVALID", `${label} entities 数量超限`);
  }
  // external-bytes closure：legacy/未登记 external representation 不进入 v1 Project。
  for (const entity of snapshot.entities) {
    if (entity.representations.visual.kind === "imported-rigid-mesh") {
      fail(
        "PROJECT_ARTIFACT_UNBACKED",
        `${label} 含 legacy imported-rigid-mesh external representation，v1 Store 不支持`,
      );
    }
    if (entity.representations.observation?.kind === "gaussian-splat") {
      fail(
        "PROJECT_ARTIFACT_UNBACKED",
        `${label} 含 legacy gaussian-splat external representation，v1 Store 不支持`,
      );
    }
  }
  const frozen = deepFreeze(snapshot);
  if (!isDeepFrozen(frozen)) {
    fail("PROJECT_MANIFEST_INVALID", `${label} 不是递归冻结的 plain data record`);
  }
  return frozen;
}

function requireArtifactEntry(
  value: unknown,
  label: string,
): WorldProjectArtifactEntry {
  const entry = exactRecord(value, label, [
    "assetId",
    "digest",
    "byteLength",
    "format",
  ]);
  if (
    typeof entry.assetId !== "string" ||
    !WORLD_PROJECT_ASSET_ID_PATTERN.test(entry.assetId)
  ) {
    fail("PROJECT_MANIFEST_INVALID", `${label}.assetId 非法`);
  }
  if (
    typeof entry.digest !== "string" ||
    !WORLD_PROJECT_ARTIFACT_DIGEST_PATTERN.test(entry.digest)
  ) {
    fail("PROJECT_MANIFEST_INVALID", `${label}.digest 必须是 64 位 lowercase hex`);
  }
  if (
    typeof entry.byteLength !== "number" ||
    !Number.isSafeInteger(entry.byteLength) ||
    entry.byteLength < 1
  ) {
    fail("PROJECT_MANIFEST_INVALID", `${label}.byteLength 必须是正 safe integer`);
  }
  if (entry.format !== "spz-v2" && entry.format !== "glb-2.0") {
    fail("PROJECT_MANIFEST_INVALID", `${label}.format 非法`);
  }
  return {
    assetId: entry.assetId as `asset:${string}`,
    digest: entry.digest,
    byteLength: entry.byteLength,
    format: entry.format,
  };
}


/** 除 revision 外的语义字段 canonical bytes 的 SHA-256（unknown 入口，纯 canonical digest）。 */
function computeRevisionFromRaw(body: unknown): string {
  return `project-revision:sha256:${sha256Hex(canonicalJsonBytes(body))}`;
}

/** 供受信调用方（Save/恢复）使用的类型化 revision 计算；内部校验走 raw 入口。 */
export function computeWorldProjectRevision(
  body: WorldProjectManifestRevisionBody,
): string {
  if (typeof body === "object" && body !== null && "revision" in body) {
    throw new Error("revision body 不得包含 revision 字段");
  }
  return computeRevisionFromRaw(body);
}
function collectRegisteredAsset(
  assetId: string,
  manifestDigest: string,
  byDigest: Map<string, WorldProjectArtifactEntry>,
): void {
  if (manifestDigest !== MARBLE_HUNYUAN_MANIFEST_DIGEST) {
    fail(
      "PROJECT_ARTIFACT_UNBACKED",
      `${assetId} 的 manifestDigest 与当前受信 registry 不一致`,
    );
  }
  const registryEntry = MARBLE_HUNYUAN_REGISTRY.assets.find(
    (asset) => asset.assetId === assetId,
  );
  if (!registryEntry) {
    fail(
      "PROJECT_ARTIFACT_UNBACKED",
      `${assetId} 不在当前受信 registry，无法闭合 external bytes`,
    );
  }
  byDigest.set(registryEntry.digest, {
    assetId: registryEntry.assetId,
    digest: registryEntry.digest,
    byteLength: registryEntry.byteLength,
    format: registryEntry.format,
  });
}

export function validateWorldProjectManifest(
  value: unknown,
): WorldProjectManifestV1 {
  const projected = projectPlainData(value, "WorldProjectManifestV1");
  const root = exactRecord(projected, "WorldProjectManifestV1", [
    "schemaVersion",
    "projectId",
    "revision",
    "metadata",
    "registry",
    "snapshots",
    "history",
    "currentRef",
    "artifacts",
  ]);

  if (root.schemaVersion === undefined) {
    fail("PROJECT_MANIFEST_INVALID", "缺少 schemaVersion");
  }
  if (root.schemaVersion !== WORLD_PROJECT_MANIFEST_SCHEMA_VERSION) {
    fail(
      "PROJECT_SCHEMA_UNSUPPORTED",
      `不支持 schemaVersion ${String(root.schemaVersion)}，不猜测迁移`,
    );
  }

  const projectId = requireProjectId(root.projectId);
  const metadata = exactRecord(root.metadata, "metadata", ["displayName"]);
  const displayName = requireDisplayName(metadata.displayName);
  const revision = requireRevision(root.revision);
  const registryRecord = exactRecord(root.registry, "registry", [
    "id",
    "manifestDigest",
  ]);
  // forged revision 优先：在深校验前重算，同一语义内容得到同一 revision。
  // raw 语义字段尚未完成语义校验，因此走 unknown 入口，不做类型断言。
  const expectedRevision = computeRevisionFromRaw({
    schemaVersion: root.schemaVersion,
    projectId,
    metadata: { displayName },
    registry: registryRecord,
    snapshots: root.snapshots,
    history: root.history,
    currentRef: root.currentRef,
    artifacts: root.artifacts,
  });
  if (expectedRevision !== revision) {
    fail("PROJECT_REVISION_MISMATCH", "revision 与语义字段 canonical digest 不一致");
  }

  const snapshots = denseArray(
    root.snapshots,
    "snapshots",
    WORLD_PROJECT_MAX_SNAPSHOTS,
  ).map((snapshotValue, index) =>
    requireSnapshot(snapshotValue, `snapshots[${index}]`),
  );
  if (snapshots.length === 0) {
    fail("PROJECT_LINEAGE_INVALID", "snapshots 不能为空");
  }

  // lineage：snapshotIds 与 snapshots 一一对应；root → tip 单线；ID 唯一。
  const historyRecord = exactRecord(root.history, "history", [
    "snapshotIds",
    "cursor",
  ]);
  const snapshotIds = denseArray(
    historyRecord.snapshotIds,
    "history.snapshotIds",
    WORLD_PROJECT_MAX_SNAPSHOTS,
  );
  if (snapshotIds.length !== snapshots.length) {
    fail(
      "PROJECT_LINEAGE_INVALID",
      "history.snapshotIds 与 snapshots 数量不一致",
    );
  }
  const seenIds = new Set<string>();
  snapshots.forEach((snapshot, index) => {
    if (seenIds.has(snapshot.id)) {
      fail("PROJECT_LINEAGE_INVALID", `重复 Snapshot ID：${snapshot.id}`);
    }
    seenIds.add(snapshot.id);
    if (snapshotIds[index] !== snapshot.id) {
      fail(
        "PROJECT_LINEAGE_INVALID",
        `history.snapshotIds[${index}] 必须等于 snapshots[${index}].id`,
      );
    }
    if (index === 0) {
      if (snapshot.source !== "write" || snapshot.parentId !== null) {
        fail(
          "PROJECT_LINEAGE_INVALID",
          "lineage 首项必须是 source=write 且 parentId=null",
        );
      }
    } else if (snapshot.parentId !== snapshots[index - 1]!.id) {
      fail(
        "PROJECT_LINEAGE_INVALID",
        `lineage 第 ${index} 项 parentId 必须等于前一项 id`,
      );
    }
  });

  const cursor = historyRecord.cursor;
  if (
    typeof cursor !== "number" ||
    !Number.isSafeInteger(cursor) ||
    cursor < 0 ||
    cursor >= snapshots.length
  ) {
    fail("PROJECT_CURSOR_INVALID", "cursor 必须是 history 内的 safe integer");
  }

  const currentRefRecord = exactRecord(root.currentRef, "currentRef", [
    "name",
    "snapshotId",
    "version",
  ]);
  if (currentRefRecord.name !== "world:current") {
    fail("PROJECT_CURRENT_REF_INVALID", "currentRef.name 必须为 world:current");
  }
  if (currentRefRecord.snapshotId !== snapshotIds[cursor]) {
    fail(
      "PROJECT_CURRENT_REF_INVALID",
      "currentRef.snapshotId 必须等于 history cursor 处 Snapshot",
    );
  }
  if (
    typeof currentRefRecord.version !== "number" ||
    !Number.isSafeInteger(currentRefRecord.version) ||
    currentRefRecord.version < 1
  ) {
    fail(
      "PROJECT_CURRENT_REF_INVALID",
      "currentRef.version 必须是正 safe integer，且不由 cursor 推导",
    );
  }

  if (registryRecord.id !== WORLD_PROJECT_REGISTRY_ID) {
    fail("PROJECT_REGISTRY_INVALID", "registry.id 非法");
  }
  if (registryRecord.manifestDigest !== MARBLE_HUNYUAN_MANIFEST_DIGEST) {
    fail(
      "PROJECT_REGISTRY_INVALID",
      "registry.manifestDigest 与当前受信 registry 不一致",
    );
  }

  const declaredArtifacts = denseArray(
    root.artifacts,
    "artifacts",
    WORLD_PROJECT_MAX_ARTIFACTS,
  ).map((entryValue, index) =>
    requireArtifactEntry(entryValue, `artifacts[${index}]`),
  );
  for (let index = 1; index < declaredArtifacts.length; index += 1) {
    if (
      declaredArtifacts[index]!.digest <= declaredArtifacts[index - 1]!.digest
    ) {
      fail(
        "PROJECT_ARTIFACT_INVALID",
        "artifacts 必须按 digest 严格升序且无重复",
      );
    }
  }

  // 从全部持久 Snapshot 的 registered representations 推导精确、排序、无重复集合。
  const expectedByDigest = new Map<string, WorldProjectArtifactEntry>();
  for (const snapshot of snapshots) {
    for (const entity of snapshot.entities) {
      const visual = entity.representations.visual;
      if (visual.kind === "registered-rigid-mesh") {
        collectRegisteredAsset(visual.assetId, visual.manifestDigest, expectedByDigest);
      }
      const observation = entity.representations.observation;
      if (observation?.kind === "registered-gaussian-splat") {
        collectRegisteredAsset(
          observation.assetId,
          observation.manifestDigest,
          expectedByDigest,
        );
      }
    }
  }
  const expectedArtifacts = [...expectedByDigest.values()].sort((left, right) =>
    left.digest < right.digest ? -1 : left.digest > right.digest ? 1 : 0,
  );
  const artifactsMatch =
    declaredArtifacts.length === expectedArtifacts.length &&
    declaredArtifacts.every(
      (declared, index) =>
        declared.assetId === expectedArtifacts[index]!.assetId &&
        declared.digest === expectedArtifacts[index]!.digest &&
        declared.byteLength === expectedArtifacts[index]!.byteLength &&
        declared.format === expectedArtifacts[index]!.format,
    );
  if (!artifactsMatch) {
    fail(
      "PROJECT_ARTIFACT_INVALID",
      "artifacts 与 Snapshots 推导集合不一致（missing/extra/duplicate/order/drift）",
    );
  }

  return deepFreeze({
    schemaVersion: 1,
    projectId,
    revision,
    metadata: deepFreeze({ displayName }),
    registry: deepFreeze({
      id: WORLD_PROJECT_REGISTRY_ID,
      manifestDigest: MARBLE_HUNYUAN_MANIFEST_DIGEST,
    }),
    snapshots,
    history: deepFreeze({
      snapshotIds: snapshots.map((snapshot) => snapshot.id),
      cursor,
    }),
    currentRef: deepFreeze({
      name: "world:current",
      snapshotId: snapshots[cursor]!.id,
      version: currentRefRecord.version,
    }) as RefRecord,
    artifacts: deepFreeze(declaredArtifacts),
  }) as WorldProjectManifestV1;
}

function decodeJsonBytes(bytes: Uint8Array, label: string): unknown {
  if (bytes.length > WORLD_PROJECT_MANIFEST_MAX_BYTES) {
    fail("PROJECT_MANIFEST_INVALID", `${label} 超过 byte budget`);
  }
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    fail("PROJECT_MANIFEST_INVALID", `${label} 不是合法 UTF-8`);
  }
  try {
    return JSON.parse(text);
  } catch {
    fail("PROJECT_MANIFEST_INVALID", `${label} 不是合法 JSON`);
  }
}

/** 从 canonical bytes/string/plain data 解码并全量验证；返回递归冻结 manifest。 */
export function decodeWorldProjectManifestV1(
  input: unknown,
): WorldProjectManifestV1 {
  if (input instanceof Uint8Array) {
    return validateWorldProjectManifest(decodeJsonBytes(input, "manifest bytes"));
  }
  if (typeof input === "string") {
    return validateWorldProjectManifest(
      decodeJsonBytes(new TextEncoder().encode(input), "manifest string"),
    );
  }
  return validateWorldProjectManifest(input);
}

/** exact canonical 编码：先走同一验证管线，再输出 sorted-key canonical JSON bytes。 */
export function encodeWorldProjectManifestV1(
  manifest: WorldProjectManifestV1,
): Uint8Array {
  return canonicalJsonBytes(validateWorldProjectManifest(manifest));
}
