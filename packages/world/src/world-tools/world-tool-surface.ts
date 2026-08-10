import { RuntimeMvpHost } from "../host/runtime-mvp-host";
import type {
  Episode,
  EvaluationRecord,
  RefRecord,
  RefUpdateResult,
  Snapshot,
} from "../kernel/types";
import {
  createInitialSnapshot,
  CURRENT_WORLD_REF,
  deepFreeze,
} from "../kernel/world";

export const WORLD_TOOL_NAMES = Object.freeze([
  "read",
  "write",
  "edit",
  "run",
] as const);

export interface WorldReadResult {
  readonly tool: "read";
  readonly ref: RefRecord;
  readonly snapshot: Snapshot;
}

export interface WorldWriteResult {
  readonly tool: "write";
  readonly ref: RefRecord;
  readonly snapshot: Snapshot;
}

export interface WorldEditResult {
  readonly tool: "edit";
  readonly update: RefUpdateResult;
}

export interface WorldRunResult {
  readonly tool: "run";
  readonly baseRef: RefRecord;
  readonly episode: Episode;
  readonly evaluation: EvaluationRecord;
}

type DataRecord = Readonly<Record<string, unknown>>;

function requireExactDataRecord(
  value: unknown,
  label: string,
  expectedKeys: readonly string[],
): DataRecord {
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Object.prototype
  ) {
    throw new Error(`${label} 必须是 plain JSON data record`);
  }

  const ownKeys = Reflect.ownKeys(value);
  if (
    ownKeys.some((key) => typeof key !== "string") ||
    ownKeys.length !== expectedKeys.length ||
    expectedKeys.some((key) => !ownKeys.includes(key))
  ) {
    throw new Error(`${label} 字段必须恰好为 ${expectedKeys.join(", ")}`);
  }

  const result: Record<string, unknown> = {};
  for (const key of expectedKeys) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) {
      throw new Error(`${label} 必须是 plain JSON data record`);
    }
    result[key] = descriptor.value;
  }
  return result;
}

function requireCubeHeight(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error("cubeHeight 必须是有限数值");
  }
  if (value < 0.5 || value > 4) {
    throw new Error("cubeHeight 必须在 0.5m 到 4m 之间");
  }
  return value;
}

function requireRunId(value: unknown): `run:${string}` {
  if (typeof value !== "string" || !value.startsWith("run:") || value.length === 4) {
    throw new Error("runId 必须是带非空后缀的 run: ID");
  }
  return value as `run:${string}`;
}

function copyRef(value: unknown): RefRecord {
  const record = requireExactDataRecord(value, "expected", [
    "name",
    "snapshotId",
    "version",
  ]);
  if (record.name !== CURRENT_WORLD_REF) {
    throw new Error(`expected.name 必须是 ${CURRENT_WORLD_REF}`);
  }
  if (
    typeof record.snapshotId !== "string" ||
    !record.snapshotId.startsWith("snapshot:") ||
    record.snapshotId.length === "snapshot:".length
  ) {
    throw new Error("expected.snapshotId 必须是带非空后缀的 snapshot: ID");
  }
  if (
    typeof record.version !== "number" ||
    !Number.isSafeInteger(record.version) ||
    record.version < 1
  ) {
    throw new Error("expected.version 必须是大于等于 1 的安全整数");
  }

  return deepFreeze({
    name: CURRENT_WORLD_REF,
    snapshotId: record.snapshotId as Snapshot["id"],
    version: record.version,
  }) as RefRecord;
}

export class WorldToolSurface {
  readonly #host: RuntimeMvpHost;

  constructor(host: RuntimeMvpHost) {
    this.#host = host;
  }

  read(): WorldReadResult {
    return deepFreeze({
      tool: "read",
      ref: this.#host.readRefRecord(),
      snapshot: this.#host.readRef(),
    }) as WorldReadResult;
  }

  write(input: unknown): WorldWriteResult {
    const record = requireExactDataRecord(input, "write input", ["cubeHeight"]);
    const snapshot = this.#host.write(
      createInitialSnapshot(requireCubeHeight(record.cubeHeight)),
    );
    return deepFreeze({
      tool: "write",
      ref: this.#host.readRefRecord(),
      snapshot,
    }) as WorldWriteResult;
  }

  edit(input: unknown): WorldEditResult {
    const record = requireExactDataRecord(input, "edit input", [
      "expected",
      "cubeHeight",
    ]);
    const expected = copyRef(record.expected);
    const update = this.#host.editCurrentCubeHeight(
      expected,
      requireCubeHeight(record.cubeHeight),
    );
    return deepFreeze({ tool: "edit", update }) as WorldEditResult;
  }

  async run(input: unknown): Promise<WorldRunResult> {
    const record = requireExactDataRecord(input, "run input", ["runId"]);
    const result = await this.#host.runCurrent(
      deepFreeze({ runId: requireRunId(record.runId) }),
    );
    const evaluation = this.#host.evaluateEpisode(result.episode.id);
    return deepFreeze({
      tool: "run",
      baseRef: result.baseRef,
      episode: result.episode,
      evaluation,
    }) as WorldRunResult;
  }
}
