import {
  DIAGNOSTIC_RIGID_FIXTURE_ID,
  PRIMITIVE_BOX_FIXTURE_ID,
} from "../artifacts/diagnostic-rigid-fixture";
import { BALL_VESSEL_FIXTURE_ID } from "../artifacts/ball-vessel-fixture";

export { BALL_VESSEL_FIXTURE_ID };
import type { Entity, EntityState, RefRecord } from "../kernel/types";
import { CURRENT_WORLD_REF, deepFreeze } from "../kernel/world";

export const FREE_FALL_RIGID_PROGRAM_ID = "program:free-fall-rigid-v1" as const;
export const FREE_FALL_BALL_VESSEL_PROGRAM_ID =
  "program:free-fall-ball-vessel-v1" as const;

export const WORLD_FIXTURE_IDS = Object.freeze([
  PRIMITIVE_BOX_FIXTURE_ID,
  DIAGNOSTIC_RIGID_FIXTURE_ID,
  BALL_VESSEL_FIXTURE_ID,
] as const);

export const WORLD_PROGRAM_IDS = Object.freeze([
  FREE_FALL_RIGID_PROGRAM_ID,
  FREE_FALL_BALL_VESSEL_PROGRAM_ID,
] as const);

const SNAPSHOT_ID_PATTERN = "^snapshot:[A-Za-z0-9][A-Za-z0-9._-]{0,127}$";
const RUN_ID_PATTERN = "^run:[A-Za-z0-9][A-Za-z0-9._-]{0,63}$";

const scalarSchema = deepFreeze({ type: "number", minimum: -4, maximum: 4 });
const positionSchema = deepFreeze({
  type: "object",
  properties: {
    x: scalarSchema,
    y: scalarSchema,
    z: { type: "number", minimum: 0, maximum: 4 },
  },
  required: ["x", "y", "z"],
  additionalProperties: false,
});
const rotationSchema = deepFreeze({
  type: "object",
  properties: {
    x: { type: "number" },
    y: { type: "number" },
    z: { type: "number" },
    w: { type: "number" },
  },
  required: ["x", "y", "z", "w"],
  additionalProperties: false,
});
const expectedRefSchema = deepFreeze({
  type: "object",
  properties: {
    name: { type: "string", const: CURRENT_WORLD_REF },
    snapshotId: { type: "string", pattern: SNAPSHOT_ID_PATTERN, maxLength: 137 },
    version: { type: "integer", minimum: 1 },
  },
  required: ["name", "snapshotId", "version"],
  additionalProperties: false,
});

function objectSchema(
  properties: Readonly<Record<string, unknown>>,
  required: readonly string[],
): Readonly<Record<string, unknown>> {
  return deepFreeze({
    type: "object",
    properties,
    required,
    additionalProperties: false,
  });
}

export const WORLD_TOOL_CONTRACT = deepFreeze({
  inputBudget: {
    maxNodes: 128,
    maxDepth: 6,
    maxStringLength: 512,
  },
  read: {
    input: objectSchema({}, []),
  },
  write: {
    input: objectSchema(
      {
        fixtureId: { type: "string", enum: WORLD_FIXTURE_IDS },
      },
      ["fixtureId"],
    ),
  },
  edit: {
    input: objectSchema(
      {
        expected: expectedRefSchema,
        targetRef: { type: "string", enum: ["entity:cube", "entity:ball"] },
        frameRef: { type: "string", const: "frame:world" },
        pose: objectSchema(
          { position: positionSchema, rotation: rotationSchema },
          ["position", "rotation"],
        ),
      },
      ["expected", "targetRef", "frameRef", "pose"],
    ),
  },
  run: {
    input: objectSchema(
      {
        runId: { type: "string", pattern: RUN_ID_PATTERN, maxLength: 68 },
        programId: { type: "string", enum: WORLD_PROGRAM_IDS },
      },
      ["runId", "programId"],
    ),
  },
} as const);

type DataRecord = Readonly<Record<string, unknown>>;

function exactRecord(value: unknown, label: string, keys: readonly string[]): DataRecord {
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
    ownKeys.length !== keys.length ||
    ownKeys.some((key) => typeof key !== "string" || !keys.includes(key)) ||
    keys.some((key) => !ownKeys.includes(key))
  ) {
    throw new Error(`${label} 字段必须恰好为 ${keys.join(", ") || "<none>"}`);
  }
  const result: Record<string, unknown> = {};
  for (const key of keys) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) {
      throw new Error(`${label} 必须是 plain JSON data record`);
    }
    result[key] = descriptor.value;
  }
  return result;
}

function finite(value: unknown, label: string, minimum: number, maximum: number): number {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < minimum ||
    value > maximum
  ) {
    throw new Error(`${label} 必须是 [${minimum}, ${maximum}] 内的有限数值`);
  }
  return value;
}

function requireId(value: unknown, pattern: RegExp, label: string): string {
  if (typeof value !== "string" || !pattern.test(value)) {
    throw new Error(`${label} 格式非法`);
  }
  return value;
}

export type WorldFixtureId = (typeof WORLD_FIXTURE_IDS)[number];
export type WorldProgramId = (typeof WORLD_PROGRAM_IDS)[number];

export interface WorldWriteInput {
  readonly fixtureId: WorldFixtureId;
}

export interface WorldEditInput {
  readonly expected: RefRecord;
  readonly targetRef: Entity["ref"];
  readonly frameRef: "frame:world";
  readonly pose: EntityState["pose"];
}

export interface WorldRunInput {
  readonly runId: `run:${string}`;
  readonly programId: WorldProgramId;
}

export function requireWorldWriteInput(value: unknown): WorldWriteInput {
  const input = exactRecord(value, "write input", ["fixtureId"]);
  if (!WORLD_FIXTURE_IDS.includes(input.fixtureId as WorldFixtureId)) {
    throw new Error(`fixtureId 必须是 ${WORLD_FIXTURE_IDS.join("、")}`);
  }
  return deepFreeze({ fixtureId: input.fixtureId as WorldFixtureId }) as WorldWriteInput;
}

function requireExpectedRef(value: unknown): RefRecord {
  const expected = exactRecord(value, "expected", ["name", "snapshotId", "version"]);
  if (expected.name !== CURRENT_WORLD_REF) {
    throw new Error(`expected.name 必须是 ${CURRENT_WORLD_REF}`);
  }
  const snapshotId = requireId(
    expected.snapshotId,
    /^snapshot:[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/,
    "expected.snapshotId",
  );
  if (
    typeof expected.version !== "number" ||
    !Number.isSafeInteger(expected.version) ||
    expected.version < 1
  ) {
    throw new Error("expected.version 必须是大于等于 1 的安全整数");
  }
  return deepFreeze({
    name: CURRENT_WORLD_REF,
    snapshotId: snapshotId as RefRecord["snapshotId"],
    version: expected.version,
  }) as RefRecord;
}

export function requireWorldEditInput(value: unknown): WorldEditInput {
  const input = exactRecord(value, "edit input", [
    "expected",
    "targetRef",
    "frameRef",
    "pose",
  ]);
  if (input.targetRef !== "entity:cube" && input.targetRef !== "entity:ball") {
    throw new Error("targetRef 必须是 entity:cube 或 entity:ball");
  }
  if (input.frameRef !== "frame:world") {
    throw new Error("frameRef 必须是 frame:world");
  }
  const pose = exactRecord(input.pose, "pose", ["position", "rotation"]);
  const position = exactRecord(pose.position, "pose.position", ["x", "y", "z"]);
  const rotation = exactRecord(pose.rotation, "pose.rotation", ["x", "y", "z", "w"]);
  const quaternion = {
    x: finite(rotation.x, "pose.rotation.x", -1, 1),
    y: finite(rotation.y, "pose.rotation.y", -1, 1),
    z: finite(rotation.z, "pose.rotation.z", -1, 1),
    w: finite(rotation.w, "pose.rotation.w", -1, 1),
  };
  if (Math.abs(Math.hypot(quaternion.x, quaternion.y, quaternion.z, quaternion.w) - 1) > 1e-9) {
    throw new Error("pose.rotation 必须是单位 quaternion");
  }
  return deepFreeze({
    expected: requireExpectedRef(input.expected),
    targetRef: input.targetRef,
    frameRef: "frame:world",
    pose: {
      position: [
        finite(position.x, "pose.position.x", -4, 4),
        finite(position.y, "pose.position.y", -4, 4),
        finite(position.z, "pose.position.z", 0, 4),
      ],
      rotation: quaternion,
    },
  }) as WorldEditInput;
}

export function requireWorldRunInput(value: unknown): WorldRunInput {
  const input = exactRecord(value, "run input", ["runId", "programId"]);
  const runId = requireId(
    input.runId,
    /^run:[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/,
    "runId",
  );
  if (!WORLD_PROGRAM_IDS.includes(input.programId as WorldProgramId)) {
    throw new Error(`programId 必须是 ${WORLD_PROGRAM_IDS.join("、")}`);
  }
  return deepFreeze({
    runId: runId as `run:${string}`,
    programId: input.programId as WorldProgramId,
  }) as WorldRunInput;
}
