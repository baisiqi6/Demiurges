import type {
  Entity,
  EntityState,
  Episode,
  EvaluationRecord,
  RefRecord,
  Snapshot,
} from "./kernel/types";
import { deepFreeze } from "./kernel/world";
import {
  requireDiagnosticRigidCollision,
  requireDiagnosticRigidVisual,
} from "./artifacts/diagnostic-rigid-fixture";
import type {
  ProductSessionEvent,
  ProductSessionProjection,
  ProductWorldEvidence,
  ProductWorldToolName,
} from "./product-session-contract";
import { PRODUCT_WORLD_TOOL_NAMES } from "./product-session-contract";
import type {
  WorldEditResult,
  WorldReadResult,
  WorldRunResult,
  WorldWriteResult,
} from "./world-tools/world-tool-surface";

const MAX_TEXT_LENGTH = 1_024;
const MAX_ENTITIES = 256;
const MAX_SAMPLES = 10_000;
const MAX_EVENTS = 10_000;
const MAX_PLAIN_DATA_DEPTH = 64;
const MAX_PLAIN_DATA_NODES = 100_000;
const MAX_PLAIN_DATA_STRING_CHARS = 2_000_000;
const MAX_PLAIN_DATA_COLLECTION_ITEMS = 10_000;

type DataRecord = Record<string, unknown>;

interface PlainDataBudget {
  nodes: number;
  stringChars: number;
}

function projectPlainData(
  value: unknown,
  label: string,
  budget: PlainDataBudget = {
    nodes: MAX_PLAIN_DATA_NODES,
    stringChars: MAX_PLAIN_DATA_STRING_CHARS,
  },
  depth = 0,
): unknown {
  budget.nodes -= 1;
  if (budget.nodes < 0) throw new Error(`${label} plain-data node budget 超限`);
  if (depth > MAX_PLAIN_DATA_DEPTH) throw new Error(`${label} plain-data depth 超限`);
  if (value === null || typeof value === "boolean") return value;
  if (typeof value === "number") return finite(value, label);
  if (typeof value === "string") {
    budget.stringChars -= value.length;
    if (budget.stringChars < 0) throw new Error(`${label} plain-data string budget 超限`);
    return value;
  }
  if (typeof value !== "object") throw new Error(`${label} 必须是 JSON data`);

  const prototype = Object.getPrototypeOf(value);
  const ownKeys = Reflect.ownKeys(value);
  if (Array.isArray(value)) {
    if (prototype !== Array.prototype) throw new Error(`${label} 必须是 plain dense array`);
    const lengthDescriptor = Object.getOwnPropertyDescriptor(value, "length");
    const length = lengthDescriptor && "value" in lengthDescriptor
      ? lengthDescriptor.value
      : undefined;
    if (
      !Number.isSafeInteger(length) ||
      (length as number) < 0 ||
      (length as number) > MAX_PLAIN_DATA_COLLECTION_ITEMS
    ) {
      throw new Error(`${label} dense array length 非法`);
    }
    const expectedKeys = new Set(["length"]);
    const result: unknown[] = [];
    for (let index = 0; index < (length as number); index += 1) {
      const key = String(index);
      expectedKeys.add(key);
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) {
        throw new Error(`${label} 必须是 plain dense array`);
      }
      result.push(projectPlainData(descriptor.value, `${label}[${index}]`, budget, depth + 1));
    }
    if (
      ownKeys.length !== expectedKeys.size ||
      ownKeys.some((key) => typeof key !== "string" || !expectedKeys.has(key))
    ) {
      throw new Error(`${label} dense array 字段非法`);
    }
    return result;
  }

  if (prototype !== Object.prototype && prototype !== null) {
    throw new Error(`${label} 必须是 plain JSON data record`);
  }
  if (ownKeys.length > MAX_PLAIN_DATA_COLLECTION_ITEMS) {
    throw new Error(`${label} plain-data collection budget 超限`);
  }
  const result = Object.create(null) as DataRecord;
  for (const key of ownKeys) {
    if (typeof key !== "string" || key === "__proto__") {
      throw new Error(`${label} plain-data key 非法`);
    }
    budget.stringChars -= key.length;
    if (budget.stringChars < 0) throw new Error(`${label} plain-data string budget 超限`);
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) {
      throw new Error(`${label}.${key} 必须是 enumerable data descriptor`);
    }
    result[key] = projectPlainData(descriptor.value, `${label}.${key}`, budget, depth + 1);
  }
  return result;
}

function record(value: unknown, label: string, keys?: readonly string[]): DataRecord {
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value) ||
    Object.getPrototypeOf(value) !== null
  ) {
    throw new Error(`${label} 必须是 plain JSON data record`);
  }
  const result = value as DataRecord;
  if (keys) {
    const ownKeys = Reflect.ownKeys(result);
    if (
      ownKeys.some((key) => typeof key !== "string") ||
      ownKeys.length !== keys.length ||
      keys.some((key) => !ownKeys.includes(key))
    ) {
      throw new Error(`${label} 字段非法`);
    }
  }
  return result;
}

function finite(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${label} 必须是有限数值`);
  }
  return value;
}

function safeInteger(value: unknown, label: string, minimum = 0): number {
  if (!Number.isSafeInteger(value) || (value as number) < minimum) {
    throw new Error(`${label} 必须是安全整数`);
  }
  return value as number;
}

function boundedString(value: unknown, label: string, maximum = MAX_TEXT_LENGTH): string {
  if (typeof value !== "string" || value.length > maximum) {
    throw new Error(`${label} 必须是 bounded string`);
  }
  return value;
}

function id(value: unknown, prefix: string, label: string): string {
  if (typeof value !== "string") throw new Error(`${label} identity 非法`);
  const result = value;
  if (!result.startsWith(prefix) || result.length === prefix.length) {
    throw new Error(`${label} identity 非法`);
  }
  return result;
}

function vec3(value: unknown, label: string): void {
  if (!Array.isArray(value) || value.length !== 3) throw new Error(`${label} 必须是 Vec3`);
  for (let index = 0; index < 3; index += 1) {
    finite(value[index], `${label}[${index}]`);
  }
}

function entityState(value: unknown, label: string): EntityState {
  const state = record(value, label, ["pose", "linearVelocity", "angularVelocity"]);
  const pose = record(state.pose, `${label}.pose`, ["position", "rotation"]);
  vec3(pose.position, `${label}.pose.position`);
  const rotation = record(pose.rotation, `${label}.pose.rotation`, ["x", "y", "z", "w"]);
  for (const key of ["x", "y", "z", "w"] as const) finite(rotation[key], `${label}.pose.rotation.${key}`);
  vec3(state.linearVelocity, `${label}.linearVelocity`);
  vec3(state.angularVelocity, `${label}.angularVelocity`);
  return state as unknown as EntityState;
}

function boxVisual(value: unknown, label: string): void {
  const representation = record(value, label, ["kind", "halfExtents", "color"]);
  if (representation.kind !== "box") throw new Error(`${label}.kind 非法`);
  vec3(representation.halfExtents, `${label}.halfExtents`);
  boundedString(representation.color, `${label}.color`, 64);
}

function boxCollision(value: unknown, label: string): void {
  const representation = record(value, label, ["kind", "halfExtents"]);
  if (representation.kind !== "box") throw new Error(`${label}.kind 非法`);
  vec3(representation.halfExtents, `${label}.halfExtents`);
}

function importedVisual(value: unknown, label: string): void {
  const representation = record(value, label, [
    "kind",
    "assetId",
    "contentDigest",
    "sourceFrameRef",
    "sourceUnitMeters",
    "localTransform",
  ]);
  if (representation.kind !== "imported-rigid-mesh") {
    throw new Error(`${label}.kind 非法`);
  }
  id(representation.assetId, "asset:", `${label}.assetId`);
  if (
    typeof representation.contentDigest !== "string" ||
    !/^sha256:[a-f0-9]{64}$/.test(representation.contentDigest)
  ) {
    throw new Error(`${label}.contentDigest 非法`);
  }
  if (representation.sourceFrameRef !== "frame:gltf-y-up") {
    throw new Error(`${label}.sourceFrameRef 非法`);
  }
  if (finite(representation.sourceUnitMeters, `${label}.sourceUnitMeters`) <= 0) {
    throw new Error(`${label}.sourceUnitMeters 必须是正数`);
  }
  const transform = record(representation.localTransform, `${label}.localTransform`, [
    "position",
    "rotation",
    "scale",
  ]);
  vec3(transform.position, `${label}.localTransform.position`);
  vec3(transform.scale, `${label}.localTransform.scale`);
  (transform.scale as number[]).forEach((component) => {
    if (component <= 0) throw new Error(`${label}.localTransform.scale 必须为正数`);
  });
  const rotation = record(transform.rotation, `${label}.localTransform.rotation`, [
    "x", "y", "z", "w",
  ]);
  const values = [rotation.x, rotation.y, rotation.z, rotation.w].map((component, index) =>
    finite(component, `${label}.localTransform.rotation[${index}]`),
  );
  if (Math.abs(Math.hypot(...values) - 1) > 1e-9) {
    throw new Error(`${label}.localTransform.rotation 必须是单位 quaternion`);
  }
  requireDiagnosticRigidVisual(representation as never);
}

function snapshot(value: unknown, label: string): Snapshot {
  const data = record(value, label, ["schemaVersion", "id", "parentId", "source", "entities"]);
  if (data.schemaVersion !== 1) throw new Error(`${label}.schemaVersion 非法`);
  id(data.id, "snapshot:", `${label}.id`);
  if (data.parentId !== null) id(data.parentId, "snapshot:", `${label}.parentId`);
  if (data.source !== "write" && data.source !== "edit" && data.source !== "runtime-terminal") {
    throw new Error(`${label}.source 非法`);
  }
  if (!Array.isArray(data.entities) || data.entities.length > MAX_ENTITIES) {
    throw new Error(`${label}.entities 非法`);
  }
  const refs = new Set<string>();
  data.entities.forEach((value, index) => {
    const entity = record(value, `${label}.entities[${index}]`, [
      "ref", "label", "frameRef", "unitSystemRef", "state", "representations", "physics",
    ]);
    const ref = id(entity.ref, "entity:", `${label}.entities[${index}].ref`);
    if (refs.has(ref)) throw new Error(`${label}.entities ref 重复`);
    refs.add(ref);
    boundedString(entity.label, `${label}.entities[${index}].label`);
    if (entity.frameRef !== "frame:world" || entity.unitSystemRef !== "units:si") {
      throw new Error(`${label}.entities frame/units 非法`);
    }
    entityState(entity.state, `${label}.entities[${index}].state`);
    const representations = record(entity.representations, `${label}.entities[${index}].representations`, [
      "visual", "collision",
    ]);
    const visual = record(
      representations.visual,
      `${label}.entities[${index}].representations.visual`,
    );
    if (visual.kind === "box") {
      boxVisual(visual, `${label}.entities[${index}].representations.visual`);
    } else {
      importedVisual(visual, `${label}.entities[${index}].representations.visual`);
    }
    boxCollision(representations.collision, `${label}.entities[${index}].representations.collision`);
    if (visual.kind === "imported-rigid-mesh") {
      requireDiagnosticRigidCollision(representations.collision as never);
    }
    const physics = record(entity.physics, `${label}.entities[${index}].physics`, [
      "bodyType", "massKg", "friction",
    ]);
    if (physics.bodyType !== "static" && physics.bodyType !== "dynamic") {
      throw new Error(`${label}.entities bodyType 非法`);
    }
    finite(physics.massKg, `${label}.entities massKg`);
    finite(physics.friction, `${label}.entities friction`);
  });
  return data as unknown as Snapshot;
}

function refRecord(value: unknown, label: string): RefRecord {
  const ref = record(value, label, ["name", "snapshotId", "version"]);
  id(ref.name, "world:", `${label}.name`);
  id(ref.snapshotId, "snapshot:", `${label}.snapshotId`);
  safeInteger(ref.version, `${label}.version`, 1);
  return ref as unknown as RefRecord;
}

function worldReadLike(
  value: unknown,
  expectedTool: "read" | "write",
  label: string,
): WorldReadResult | WorldWriteResult {
  const data = record(value, label, ["tool", "ref", "snapshot"]);
  if (data.tool !== expectedTool) throw new Error(`${label}.tool 非法`);
  const ref = refRecord(data.ref, `${label}.ref`);
  const current = snapshot(data.snapshot, `${label}.snapshot`);
  if (ref.snapshotId !== current.id) throw new Error(`${label} ref/snapshot identity 漂移`);
  if (expectedTool === "write" && (current.source !== "write" || current.parentId !== null)) {
    throw new Error(`${label} write Snapshot lineage 非法`);
  }
  return data as unknown as WorldReadResult | WorldWriteResult;
}

function worldEdit(value: unknown, label: string): WorldEditResult {
  const data = record(value, label, ["tool", "update"]);
  if (data.tool !== "edit") throw new Error(`${label}.tool 非法`);
  const update = record(data.update, `${label}.update`, ["status", "operation", "ref", "snapshot"]);
  if (update.status !== "updated" && update.status !== "stale_ref") {
    throw new Error(`${label}.update.status 非法`);
  }
  if (update.operation !== "advance") {
    throw new Error(`${label}.update.operation 非法`);
  }
  const ref = refRecord(update.ref, `${label}.update.ref`);
  const current = snapshot(update.snapshot, `${label}.update.snapshot`);
  if (ref.snapshotId !== current.id) {
    throw new Error(`${label}.update identity 漂移`);
  }
  return data as unknown as WorldEditResult;
}

type WorldAuthorityContext = Pick<WorldReadResult, "ref" | "snapshot">;

function samePlainData(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (Array.isArray(left) || Array.isArray(right)) {
    return Array.isArray(left) &&
      Array.isArray(right) &&
      left.length === right.length &&
      left.every((value, index) => samePlainData(value, right[index]));
  }
  if (
    typeof left !== "object" || left === null ||
    typeof right !== "object" || right === null
  ) return false;
  const leftRecord = left as Record<string, unknown>;
  const rightRecord = right as Record<string, unknown>;
  const leftKeys = Object.keys(leftRecord);
  const rightKeys = Object.keys(rightRecord);
  return leftKeys.length === rightKeys.length &&
    leftKeys.every((key) =>
      Object.prototype.hasOwnProperty.call(rightRecord, key) &&
      samePlainData(leftRecord[key], rightRecord[key])
    );
}

function entityMap(current: Snapshot): Map<Entity["ref"], Entity> {
  return new Map(current.entities.map((entity) => [entity.ref, entity]));
}

function requireExactEntityRefs(
  actual: readonly string[],
  expected: ReadonlySet<string>,
  label: string,
): void {
  if (
    actual.length !== expected.size ||
    new Set(actual).size !== actual.length ||
    actual.some((ref) => !expected.has(ref))
  ) throw new Error(`${label} EntityRef 证据链非法`);
}

function requireEpisodeEvidenceChain(
  runEpisode: Episode,
  baseSnapshot: Snapshot,
  label: string,
): void {
  const baseEntities = entityMap(baseSnapshot);
  const expectedRefs = new Set(baseEntities.keys());
  const terminalEntities = entityMap(runEpisode.terminalSnapshot);
  requireExactEntityRefs(
    [...terminalEntities.keys()],
    expectedRefs,
    `${label}.terminalSnapshot`,
  );

  runEpisode.samples.forEach((sample, index) => {
    requireExactEntityRefs(
      Object.keys(sample.states),
      expectedRefs,
      `${label}.samples[${index}].states`,
    );
  });
  runEpisode.events.forEach((event, index) => {
    requireExactEntityRefs(
      [...event.entities],
      new Set(event.entities),
      `${label}.events[${index}].entities`,
    );
    if (event.entities.some((ref) => !expectedRefs.has(ref))) {
      throw new Error(`${label}.events[${index}].entities EntityRef 证据链非法`);
    }
  });

  for (const [ref, baseEntity] of baseEntities) {
    const terminalEntity = terminalEntities.get(ref);
    if (!terminalEntity) throw new Error(`${label} EntityRef 证据链非法`);
    if (
      terminalEntity.label !== baseEntity.label ||
      terminalEntity.frameRef !== baseEntity.frameRef ||
      terminalEntity.unitSystemRef !== baseEntity.unitSystemRef ||
      !samePlainData(terminalEntity.representations, baseEntity.representations) ||
      !samePlainData(terminalEntity.physics, baseEntity.physics)
    ) throw new Error(`${label}.${ref} representation 证据链非法`);
  }

  const lastSample = runEpisode.samples.at(-1);
  if (!lastSample) throw new Error(`${label}.samples 不能为空`);
  for (const [ref, terminalEntity] of terminalEntities) {
    if (!samePlainData(lastSample.states[ref], terminalEntity.state)) {
      throw new Error(`${label}.${ref} terminal state 证据链非法`);
    }
  }
}

function episode(value: unknown, label: string): Episode {
  const data = record(value, label, [
    "id", "baseSnapshotId", "programId", "runtimeProfileId", "explicitInputs", "completion",
    "samples", "events", "terminalSnapshot", "runtimeEvidence",
  ]);
  id(data.id, "episode:", `${label}.id`);
  id(data.baseSnapshotId, "snapshot:", `${label}.baseSnapshotId`);
  id(data.programId, "program:", `${label}.programId`);
  id(data.runtimeProfileId, "runtime:", `${label}.runtimeProfileId`);
  const inputs = record(data.explicitInputs, `${label}.explicitInputs`, ["runId"]);
  id(inputs.runId, "run:", `${label}.explicitInputs.runId`);
  if (data.completion !== "completed") throw new Error(`${label}.completion 非法`);
  if (!Array.isArray(data.samples) || data.samples.length > MAX_SAMPLES) {
    throw new Error(`${label}.samples 非法`);
  }
  data.samples.forEach((value, index) => {
    const sample = record(value, `${label}.samples[${index}]`, ["timeSeconds", "states", "contactCount"]);
    finite(sample.timeSeconds, `${label}.samples[${index}].timeSeconds`);
    safeInteger(sample.contactCount, `${label}.samples[${index}].contactCount`);
    const states = record(sample.states, `${label}.samples[${index}].states`);
    const stateKeys = Reflect.ownKeys(states);
    if (stateKeys.length > MAX_ENTITIES || stateKeys.some((key) => typeof key !== "string")) {
      throw new Error(`${label}.samples[${index}].states 非法`);
    }
    for (const key of stateKeys as string[]) {
      id(key, "entity:", `${label}.samples[${index}].states key`);
      entityState(states[key], `${label}.samples[${index}].states.${key}`);
    }
  });
  if (!Array.isArray(data.events) || data.events.length > MAX_EVENTS) {
    throw new Error(`${label}.events 非法`);
  }
  data.events.forEach((value, index) => {
    const event = record(value, `${label}.events[${index}]`, ["type", "timeSeconds", "entities"]);
    if (event.type !== "contact-began") throw new Error(`${label}.events type 非法`);
    finite(event.timeSeconds, `${label}.events timeSeconds`);
    if (!Array.isArray(event.entities) || event.entities.length !== 2) {
      throw new Error(`${label}.events entities 非法`);
    }
    event.entities.forEach((entity, entityIndex) =>
      id(entity, "entity:", `${label}.events[${index}].entities[${entityIndex}]`),
    );
  });
  const terminal = snapshot(data.terminalSnapshot, `${label}.terminalSnapshot`);
  const runtime = record(data.runtimeEvidence, `${label}.runtimeEvidence`, ["provider", "version", "modelFormat"]);
  boundedString(runtime.provider, `${label}.runtimeEvidence.provider`);
  boundedString(runtime.version, `${label}.runtimeEvidence.version`);
  if (runtime.modelFormat !== "MJCF") throw new Error(`${label}.runtimeEvidence.modelFormat 非法`);
  if (terminal.source !== "runtime-terminal" || terminal.parentId !== data.baseSnapshotId) {
    throw new Error(`${label}.terminalSnapshot lineage 非法`);
  }
  return data as unknown as Episode;
}

function evaluation(value: unknown, expectedEpisodeId: string, label: string): EvaluationRecord {
  const data = record(value, label, ["id", "evaluatorId", "episodeId", "contractId", "passed", "metrics"]);
  id(data.id, "evaluation:", `${label}.id`);
  id(data.evaluatorId, "evaluator:", `${label}.evaluatorId`);
  id(data.episodeId, "episode:", `${label}.episodeId`);
  if (data.episodeId !== expectedEpisodeId || data.contractId !== "success:stable-on-floor") {
    throw new Error(`${label} identity 非法`);
  }
  if (typeof data.passed !== "boolean") throw new Error(`${label}.passed 非法`);
  const metrics = record(data.metrics, `${label}.metrics`, [
    "terminalCenterHeight", "heightError", "terminalLinearSpeed",
  ]);
  finite(metrics.terminalCenterHeight, `${label}.metrics.terminalCenterHeight`);
  finite(metrics.heightError, `${label}.metrics.heightError`);
  finite(metrics.terminalLinearSpeed, `${label}.metrics.terminalLinearSpeed`);
  return data as unknown as EvaluationRecord;
}

function worldRun(
  value: unknown,
  label: string,
  expectedWorld?: WorldAuthorityContext,
): WorldRunResult {
  const data = record(value, label, ["tool", "baseRef", "episode", "evaluation"]);
  if (data.tool !== "run") throw new Error(`${label}.tool 非法`);
  const baseRef = refRecord(data.baseRef, `${label}.baseRef`);
  const runEpisode = episode(data.episode, `${label}.episode`);
  evaluation(data.evaluation, runEpisode.id, `${label}.evaluation`);
  if (baseRef.snapshotId !== runEpisode.baseSnapshotId) throw new Error(`${label} base identity 漂移`);
  if (expectedWorld) {
    if (
      baseRef.name !== expectedWorld.ref.name ||
      baseRef.snapshotId !== expectedWorld.ref.snapshotId ||
      baseRef.version !== expectedWorld.ref.version ||
      runEpisode.baseSnapshotId !== expectedWorld.snapshot.id
    ) throw new Error(`${label} base ref 证据链非法`);
    if (runEpisode.terminalSnapshot.id === expectedWorld.snapshot.id) {
      throw new Error(`${label} terminal Snapshot identity 必须与 base 不同`);
    }
    requireEpisodeEvidenceChain(runEpisode, expectedWorld.snapshot, `${label}.episode`);
  }
  return data as unknown as WorldRunResult;
}

function evidence(
  value: unknown,
  tool: ProductWorldToolName,
  label: string,
  expectedWorld?: WorldAuthorityContext | null,
): ProductWorldEvidence {
  switch (tool) {
    case "world_read": return worldReadLike(value, "read", label) as WorldReadResult;
    case "world_write": return worldReadLike(value, "write", label) as WorldWriteResult;
    case "world_edit": return worldEdit(value, label);
    case "world_run": {
      if (!expectedWorld) throw new Error(`${label} world_run 缺少 authored world context`);
      return worldRun(value, label, expectedWorld);
    }
  }
}

function toolName(value: unknown, label: string): ProductWorldToolName {
  if (typeof value !== "string" || !(PRODUCT_WORLD_TOOL_NAMES as readonly string[]).includes(value)) {
    throw new Error(`${label} 非法`);
  }
  return value as ProductWorldToolName;
}

export function decodeProductSessionEvent(
  value: unknown,
  expectedSessionId: string,
  expectedSequence: number,
  expectedWorld?: WorldAuthorityContext | null,
): ProductSessionEvent {
  const data = record(projectPlainData(value, "Product Session event"), "Product Session event");
  if (safeInteger(data.sequence, "event.sequence", 1) !== expectedSequence) {
    throw new Error(`Product Session event sequence 必须为 ${expectedSequence}`);
  }
  if (data.sessionId !== expectedSessionId) throw new Error("Product Session event session identity 漂移");
  id(data.turnId, `turn:${expectedSessionId.slice("session:".length)}:`, "event.turnId");
  switch (data.type) {
    case "turn.started":
      record(data, "turn.started event", ["sequence", "sessionId", "turnId", "type"]);
      break;
    case "tool.completed": {
      const keys = data.evidence === undefined
        ? ["sequence", "sessionId", "turnId", "type", "tool", "trace"]
        : ["sequence", "sessionId", "turnId", "type", "tool", "trace", "evidence"];
      record(data, "tool.completed event", keys);
      const tool = toolName(data.tool, "event.tool");
      const trace = record(data.trace, "event.trace");
      const traceKeys = ["sequence", "tool", "input", "status"];
      if (trace.result !== undefined) traceKeys.push("result");
      if (trace.error !== undefined) traceKeys.push("error");
      record(trace, "event.trace", traceKeys);
      safeInteger(trace.sequence, "event.trace.sequence", 1);
      if (trace.tool !== tool || (trace.status !== "succeeded" && trace.status !== "failed")) {
        throw new Error("tool trace 与产品 event 不一致");
      }
      if (trace.status === "failed") {
        boundedString(trace.error, "event.trace.error", 240);
        if (trace.input !== "[redacted]" || trace.result !== undefined || data.evidence !== undefined) {
          throw new Error("failed tool trace 必须脱敏且不能携带 result/evidence");
        }
      } else {
        if (trace.error !== undefined || data.evidence === undefined) {
          throw new Error("succeeded tool evidence 非法");
        }
        evidence(data.evidence, tool, "event.evidence", expectedWorld);
      }
      break;
    }
    case "turn.completed":
      record(data, "turn.completed event", ["sequence", "sessionId", "turnId", "type", "responseText"]);
      boundedString(data.responseText, "event.responseText", 8_000);
      break;
    case "turn.failed":
      record(data, "turn.failed event", ["sequence", "sessionId", "turnId", "type", "error"]);
      boundedString(data.error, "event.error", 240);
      break;
    default:
      throw new Error(`未知 Product Session event type: ${String(data.type)}`);
  }
  return deepFreeze(data) as unknown as ProductSessionEvent;
}

export function decodeProductSessionProjection(
  value: unknown,
  expectedSessionId?: string,
): ProductSessionProjection {
  const data = record(projectPlainData(value, "Product Session projection"), "Product Session projection", [
    "sessionId", "world", "lastRun", "lastSequence", "running",
  ]);
  id(data.sessionId, "session:local-", "projection.sessionId");
  if (expectedSessionId !== undefined && data.sessionId !== expectedSessionId) {
    throw new Error("Product Session projection session identity 漂移");
  }
  safeInteger(data.lastSequence, "projection.lastSequence");
  if (typeof data.running !== "boolean") throw new Error("projection.running 非法");
  const currentWorld = data.world === null
    ? null
    : worldReadLike(data.world, "read", "projection.world") as WorldReadResult;
  if (data.lastRun !== null) {
    if (!currentWorld) throw new Error("projection.lastRun 缺少 authored world context");
    worldRun(data.lastRun, "projection.lastRun", currentWorld);
  }
  return deepFreeze(data) as unknown as ProductSessionProjection;
}
