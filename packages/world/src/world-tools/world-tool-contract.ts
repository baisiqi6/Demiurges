import { BALL_VESSEL_FIXTURE_ID } from "../artifacts/ball-vessel-fixture";
import {
  DIAGNOSTIC_RIGID_FIXTURE_ID,
  PRIMITIVE_BOX_FIXTURE_ID,
} from "../artifacts/diagnostic-rigid-fixture";
import { MARBLE_HUNYUAN_COMPOSITE_FIXTURE_ID } from "../artifacts/marble-hunyuan-composite-fixture";
import { TWO_JOINT_REACH_FIXTURE_ID } from "../artifacts/two-joint-reach-fixture";
import { canonicalJsonBytes, sha256Hex } from "../kernel/canonical-json";
import type { Entity, Pose, RefRecord, WorldProgram } from "../kernel/types";
import { CURRENT_WORLD_REF, deepFreeze } from "../kernel/world";

export { BALL_VESSEL_FIXTURE_ID, TWO_JOINT_REACH_FIXTURE_ID };

export const WORLD_FIXTURE_IDS = Object.freeze([
  PRIMITIVE_BOX_FIXTURE_ID,
  DIAGNOSTIC_RIGID_FIXTURE_ID,
  BALL_VESSEL_FIXTURE_ID,
  TWO_JOINT_REACH_FIXTURE_ID,
  MARBLE_HUNYUAN_COMPOSITE_FIXTURE_ID,
] as const);

export const FREE_FALL_GOLDEN_DIGEST =
  "b69c174f5e7e2c3e2da941cb21fc0a7437d64314eaa70250d22e4512fd6c0caf" as const;
export const ACTUATOR_SEQUENCE_GOLDEN_DIGEST =
  "a8544a063f5993e976a80d10448890c7a57579d2824ae73ea74bdcf38ab53b55" as const;

const SNAPSHOT_ID_PATTERN = "^snapshot:[A-Za-z0-9][A-Za-z0-9._-]{0,127}$";
const RUN_ID_PATTERN = "^run:[A-Za-z0-9][A-Za-z0-9._-]{0,63}$";
const scalarSchema = deepFreeze({ type: "number", minimum: -4, maximum: 4 });

function objectSchema(properties: Readonly<Record<string, unknown>>, required: readonly string[]) {
  return deepFreeze({ type: "object", properties, required, additionalProperties: false });
}

const positionSchema = objectSchema({
  x: scalarSchema, y: scalarSchema, z: { type: "number", minimum: 0, maximum: 4 },
}, ["x", "y", "z"]);
const rotationSchema = objectSchema({
  x: { type: "number" }, y: { type: "number" }, z: { type: "number" }, w: { type: "number" },
}, ["x", "y", "z", "w"]);
const expectedRefSchema = objectSchema({
  name: { type: "string", const: CURRENT_WORLD_REF },
  snapshotId: { type: "string", pattern: SNAPSHOT_ID_PATTERN, maxLength: 137 },
  version: { type: "integer", minimum: 1 },
}, ["name", "snapshotId", "version"]);
const poseChangeSchema = objectSchema({
  kind: { type: "string", const: "pose" },
  frameRef: { type: "string", const: "frame:world" },
  pose: objectSchema({ position: positionSchema, rotation: rotationSchema }, ["position", "rotation"]),
}, ["kind", "frameRef", "pose"]);
const jointSchema = (jointRef: string) => objectSchema({
  jointRef: { type: "string", const: jointRef },
  positionRadians: { type: "number" },
  velocityRadiansPerSecond: { type: "number", const: 0 },
}, ["jointRef", "positionRadians", "velocityRadiansPerSecond"]);
const jointChangeSchema = objectSchema({
  kind: { type: "string", const: "joint-state" },
  joints: {
    type: "array", minItems: 2, maxItems: 2,
    prefixItems: [jointSchema("joint:arm-shoulder"), jointSchema("joint:arm-elbow")],
  },
}, ["kind", "joints"]);
const freeFallSchema = objectSchema({
  kind: { type: "string", const: "free-fall" },
  targetRef: { type: "string", enum: ["entity:cube", "entity:ball", "entity:generated-object"] },
  durationSeconds: { type: "number", enum: [2.5, 3] },
  sampleRateHz: { type: "number", const: 30 },
}, ["kind", "targetRef", "durationSeconds", "sampleRateHz"]);
const commandSchema = (actuatorRef: string) => objectSchema({
  actuatorRef: { type: "string", const: actuatorRef }, valueRadians: { type: "number" },
}, ["actuatorRef", "valueRadians"]);
const actuatorSequenceSchema = objectSchema({
  kind: { type: "string", const: "actuator-sequence" },
  targetRef: { type: "string", const: "entity:arm" },
  durationSeconds: { type: "number", minimum: 0.5, maximum: 5 },
  sampleRateHz: { type: "number", const: 30 },
  steps: { type: "array", minItems: 1, maxItems: 16, items: objectSchema({
    timeSeconds: { type: "number", minimum: 0, maximum: 5 },
    commands: { type: "array", minItems: 2, maxItems: 2, prefixItems: [
      commandSchema("actuator:arm-shoulder-position"),
      commandSchema("actuator:arm-elbow-position"),
    ] },
  }, ["timeSeconds", "commands"]) },
}, ["kind", "targetRef", "durationSeconds", "sampleRateHz", "steps"]);

export const WORLD_TOOL_CONTRACT = deepFreeze({
  read: { inputBudget: { maxNodes: 128, maxDepth: 6, maxStringLength: 512 }, input: objectSchema({}, []) },
  write: { inputBudget: { maxNodes: 128, maxDepth: 6, maxStringLength: 512 }, input: objectSchema({ fixtureId: { type: "string", enum: WORLD_FIXTURE_IDS } }, ["fixtureId"]) },
  edit: { inputBudget: { maxNodes: 128, maxDepth: 6, maxStringLength: 512 }, input: objectSchema({
    expected: expectedRefSchema,
    targetRef: { type: "string", enum: ["entity:cube", "entity:ball", "entity:arm", "entity:generated-object"] },
    change: { oneOf: [poseChangeSchema, jointChangeSchema] },
  }, ["expected", "targetRef", "change"]) },
  run: { inputBudget: { maxNodes: 256, maxDepth: 8, maxStringLength: 512 }, input: objectSchema({
    runId: { type: "string", pattern: RUN_ID_PATTERN, maxLength: 68 },
    program: { oneOf: [freeFallSchema, actuatorSequenceSchema] },
  }, ["runId", "program"]) },
} as const);

type DataRecord = Readonly<Record<string, unknown>>;
function exactRecord(value: unknown, label: string, keys: readonly string[]): DataRecord {
  if (typeof value !== "object" || value === null || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) {
    throw new Error(`${label} 必须是 plain JSON data record`);
  }
  const ownKeys = Reflect.ownKeys(value);
  if (ownKeys.length !== keys.length || ownKeys.some((key) => typeof key !== "string" || !keys.includes(key)) || keys.some((key) => !ownKeys.includes(key))) {
    throw new Error(`${label} 字段必须恰好为 ${keys.join(", ") || "<none>"}`);
  }
  const result: Record<string, unknown> = {};
  for (const key of keys) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) throw new Error(`${label} 必须是 plain JSON data record`);
    result[key] = descriptor.value;
  }
  return result;
}
function denseArray(value: unknown, label: string, min: number, max: number): readonly unknown[] {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype || value.length < min || value.length > max) {
    throw new Error(`${label} 必须是 ${min}..${max} 项 dense array`);
  }
  const expectedKeys = [
    ...Array.from({ length: value.length }, (_, index) => String(index)),
    "length",
  ];
  const ownKeys = Reflect.ownKeys(value);
  if (
    ownKeys.length !== expectedKeys.length ||
    ownKeys.some((key) => typeof key !== "string" || !expectedKeys.includes(key))
  ) throw new Error(`${label} 只能包含 dense index`);
  return Array.from({ length: value.length }, (_, index) => {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) {
      throw new Error(`${label}[${index}] 必须是 enumerable own data`);
    }
    return descriptor.value;
  });
}
function finite(value: unknown, label: string, minimum: number, maximum: number): number {
  if (typeof value !== "number" || !Number.isFinite(value) || Object.is(value, -0) || value < minimum || value > maximum) throw new Error(`${label} 必须是 [${minimum}, ${maximum}] 内的有限数值`);
  return value;
}
function requireId(value: unknown, pattern: RegExp, label: string): string {
  if (typeof value !== "string" || !pattern.test(value)) throw new Error(`${label} 格式非法`);
  return value;
}

export type WorldFixtureId = (typeof WORLD_FIXTURE_IDS)[number];
export interface WorldWriteInput { readonly fixtureId: WorldFixtureId }
export type WorldEditChange =
  | { readonly kind: "pose"; readonly frameRef: "frame:world"; readonly pose: Pose }
  | { readonly kind: "joint-state"; readonly joints: readonly [
      { readonly jointRef: "joint:arm-shoulder"; readonly positionRadians: number; readonly velocityRadiansPerSecond: 0 },
      { readonly jointRef: "joint:arm-elbow"; readonly positionRadians: number; readonly velocityRadiansPerSecond: 0 },
    ] };
export type JointStateEditChange = Extract<WorldEditChange, { readonly kind: "joint-state" }>;
export interface WorldEditInput { readonly expected: RefRecord; readonly targetRef: Entity["ref"]; readonly change: WorldEditChange }
export interface WorldRunInput { readonly runId: `run:${string}`; readonly program: WorldProgram }

export function requireWorldWriteInput(value: unknown): WorldWriteInput {
  const input = exactRecord(value, "write input", ["fixtureId"]);
  if (!WORLD_FIXTURE_IDS.includes(input.fixtureId as WorldFixtureId)) throw new Error(`fixtureId 必须是 ${WORLD_FIXTURE_IDS.join("、")}`);
  return deepFreeze({ fixtureId: input.fixtureId as WorldFixtureId }) as WorldWriteInput;
}
function requireExpectedRef(value: unknown): RefRecord {
  const expected = exactRecord(value, "expected", ["name", "snapshotId", "version"]);
  if (expected.name !== CURRENT_WORLD_REF) throw new Error(`expected.name 必须是 ${CURRENT_WORLD_REF}`);
  const snapshotId = requireId(expected.snapshotId, /^snapshot:[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/, "expected.snapshotId");
  if (typeof expected.version !== "number" || !Number.isSafeInteger(expected.version) || expected.version < 1) throw new Error("expected.version 必须是大于等于 1 的安全整数");
  return deepFreeze({ name: CURRENT_WORLD_REF, snapshotId, version: expected.version }) as RefRecord;
}
function requirePoseChange(value: unknown): WorldEditChange {
  const change = exactRecord(value, "change", ["kind", "frameRef", "pose"]);
  if (change.kind !== "pose" || change.frameRef !== "frame:world") throw new Error("pose change kind/frameRef 非法");
  const pose = exactRecord(change.pose, "change.pose", ["position", "rotation"]);
  const position = exactRecord(pose.position, "change.pose.position", ["x", "y", "z"]);
  const rotation = exactRecord(pose.rotation, "change.pose.rotation", ["x", "y", "z", "w"]);
  const quaternion = { x: finite(rotation.x,"rotation.x",-1,1), y: finite(rotation.y,"rotation.y",-1,1), z: finite(rotation.z,"rotation.z",-1,1), w: finite(rotation.w,"rotation.w",-1,1) };
  if (Math.abs(Math.hypot(quaternion.x,quaternion.y,quaternion.z,quaternion.w)-1)>1e-9) throw new Error("pose.rotation 必须是单位 quaternion");
  return { kind: "pose", frameRef: "frame:world", pose: { position: [finite(position.x,"position.x",-4,4),finite(position.y,"position.y",-4,4),finite(position.z,"position.z",0,4)], rotation: quaternion } };
}
function requireJointChange(value: unknown): WorldEditChange {
  const change = exactRecord(value,"change",["kind","joints"]);
  if (change.kind !== "joint-state") throw new Error("change.kind 非法");
  const joints = denseArray(change.joints,"change.joints",2,2);
  const refs = ["joint:arm-shoulder","joint:arm-elbow"] as const;
  const limits = [[-1.57,1.57],[-2.2,2.2]] as const;
  return { kind:"joint-state", joints: joints.map((value,index) => {
    const joint=exactRecord(value,`change.joints[${index}]`,["jointRef","positionRadians","velocityRadiansPerSecond"]);
    if (joint.jointRef!==refs[index]) throw new Error("jointRef 必须按 fixture registry 顺序");
    if (joint.velocityRadiansPerSecond!==0 || Object.is(joint.velocityRadiansPerSecond,-0)) throw new Error("velocityRadiansPerSecond 必须逐字为 0");
    return { jointRef:refs[index]!, positionRadians:finite(joint.positionRadians,"positionRadians",limits[index]![0],limits[index]![1]), velocityRadiansPerSecond:0 as const };
  }) as unknown as JointStateEditChange["joints"] };
}
export function requireWorldEditInput(value: unknown): WorldEditInput {
  const input=exactRecord(value,"edit input",["expected","targetRef","change"]);
  if (input.targetRef!=="entity:cube"&&input.targetRef!=="entity:ball"&&input.targetRef!=="entity:arm"&&input.targetRef!=="entity:generated-object") throw new Error("targetRef 非法");
  const kind = exactRecord(input.change,"change preview",Reflect.ownKeys(input.change as object).filter((key): key is string=>typeof key==="string")).kind;
  const change = kind==="pose" ? requirePoseChange(input.change) : requireJointChange(input.change);
  if ((input.targetRef==="entity:arm") !== (change.kind==="joint-state")) throw new Error("targetRef 与 change.kind 不匹配");
  return deepFreeze({ expected:requireExpectedRef(input.expected), targetRef:input.targetRef as Entity["ref"], change }) as WorldEditInput;
}

function withProgramId(content: Omit<WorldProgram,"id">): WorldProgram {
  const digest=sha256Hex(canonicalJsonBytes(content));
  return deepFreeze({ id:`program:sha256:${digest}`, ...content }) as WorldProgram;
}
function requireFreeFall(value: unknown): WorldProgram {
  const p=exactRecord(value,"program",["kind","targetRef","durationSeconds","sampleRateHz"]);
  if (p.kind!=="free-fall" || (p.targetRef!=="entity:cube"&&p.targetRef!=="entity:ball"&&p.targetRef!=="entity:generated-object") || p.sampleRateHz!==30 || ![2.5,3].includes(p.durationSeconds as number)) throw new Error("free-fall Program 非法");
  return withProgramId({ kind:"free-fall", targetRef:p.targetRef, durationSeconds:p.durationSeconds, sampleRateHz:30 } as Omit<WorldProgram,"id">);
}
function requireActuatorSequence(value: unknown): WorldProgram {
  const p=exactRecord(value,"program",["kind","targetRef","durationSeconds","sampleRateHz","steps"]);
  if (p.kind!=="actuator-sequence"||p.targetRef!=="entity:arm"||p.sampleRateHz!==30) throw new Error("actuator-sequence Program 非法");
  const duration=finite(p.durationSeconds,"durationSeconds",0.5,5);
  if (!Number.isSafeInteger(duration*240)||!Number.isSafeInteger(duration*30)) throw new Error("duration 必须落在 action clock grid");
  const steps=denseArray(p.steps,"steps",1,16).map((value,index) => {
    const step=exactRecord(value,`steps[${index}]`,["timeSeconds","commands"]);
    const time=finite(step.timeSeconds,"timeSeconds",0,duration);
    if (time>=duration||!Number.isSafeInteger(time*30)||(index===0?time!==0:time<=(p.steps as any)[index-1].timeSeconds)) throw new Error("step time 必须从 0 严格递增且落在 sample grid");
    const commands=denseArray(step.commands,"commands",2,2).map((commandValue,commandIndex) => {
      const command=exactRecord(commandValue,`commands[${commandIndex}]`,["actuatorRef","valueRadians"]);
      const refs=["actuator:arm-shoulder-position","actuator:arm-elbow-position"] as const;
      const limits=[[-1.57,1.57],[-2.2,2.2]] as const;
      if (command.actuatorRef!==refs[commandIndex]) throw new Error("actuatorRef 必须按 fixture registry 顺序");
      return { actuatorRef:refs[commandIndex]!, valueRadians:finite(command.valueRadians,"valueRadians",limits[commandIndex]![0],limits[commandIndex]![1]) };
    });
    return { timeSeconds:time, commands };
  });
  return withProgramId({ kind:"actuator-sequence", targetRef:"entity:arm", durationSeconds:duration, sampleRateHz:30, steps } as Omit<WorldProgram,"id">);
}

function evidencePlainData(value: unknown, label: string): unknown {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error(`${label} 必须 finite`);
    return value;
  }
  if (typeof value !== "object") throw new Error(`${label} 必须是 plain data`);
  if (Array.isArray(value)) {
    return Array.from({ length: value.length }, (_, index) => {
      if (!Object.hasOwn(value, index)) throw new Error(`${label} 必须是 dense array`);
      return evidencePlainData(value[index], `${label}[${index}]`);
    });
  }
  const result: Record<string, unknown> = {};
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== "string") throw new Error(`${label} 不接受 symbol`);
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) {
      throw new Error(`${label} 必须是 enumerable own data`);
    }
    result[key] = evidencePlainData(descriptor.value, `${label}.${key}`);
  }
  return result;
}

export function requireWorldProgramEvidence(value: unknown): WorldProgram {
  const plain = evidencePlainData(value, "Program evidence");
  const preview = exactRecord(plain, "Program evidence", Reflect.ownKeys(plain as object)
    .filter((key): key is string => typeof key === "string"));
  const program = preview.kind === "free-fall" ? requireFreeFall(plain) : requireActuatorSequence(plain);
  return program;
}

export function requireWorldRunInput(value: unknown): WorldRunInput {
  const input=exactRecord(value,"run input",["runId","program"]);
  const runId=requireId(input.runId,/^run:[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/,"runId") as `run:${string}`;
  const preview=exactRecord(input.program,"program preview",Reflect.ownKeys(input.program as object).filter((key):key is string=>typeof key==="string"));
  const program=preview.kind==="free-fall"?requireFreeFall(input.program):requireActuatorSequence(input.program);
  return deepFreeze({ runId, program }) as WorldRunInput;
}
