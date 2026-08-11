import type { MainModule, MjData, MjModel } from "@mujoco/mujoco";

import type {
  Entity,
  EntityState,
  Episode,
  EpisodeEvent,
  EpisodeSample,
  ExplicitInputs,
  RuntimeProfile,
  Snapshot,
  WorldProgram,
} from "../kernel/types";
import { requireDiagnosticGaussianSplatObservation } from "../artifacts/diagnostic-gaussian-splat";
import {
  requireDiagnosticRigidCollision,
  requireDiagnosticRigidVisual,
} from "../artifacts/diagnostic-rigid-fixture";
import { CUBE_REF, deepFreeze, findEntity, FLOOR_REF, isDeepFrozen } from "../kernel/world";

const PROGRAM_ID = "program:falling-cube";
const PROGRAM_DURATION_SECONDS = 2.5;
const PROGRAM_SAMPLE_RATE_HZ = 30;
const RUNTIME_PROFILE_ID = "runtime:mujoco-wasm-single-3.11.0";
const RUNTIME_PROVIDER = "MuJoCo WASM";
const RUNTIME_VERSION = "3.11.0";
const RUNTIME_TIMESTEP_SECONDS = 1 / 240;
const RUNTIME_GRAVITY = [0, 0, -9.81] as const;

interface PreparedRun {
  readonly floor: Entity;
  readonly cube: Entity;
  readonly stepCount: number;
  readonly sampleEverySteps: number;
}

let modulePromise: Promise<MainModule> | undefined;

function getMujoco(): Promise<MainModule> {
  modulePromise ??= import("@mujoco/mujoco").then(({ default: loadMujoco }) => loadMujoco());
  return modulePromise;
}

function xmlNumber(value: number): string {
  if (!Number.isFinite(value)) {
    throw new Error(`MJCF 不能包含非有限数值：${value}`);
  }
  return String(value);
}

function xmlVec(values: readonly number[]): string {
  return values.map(xmlNumber).join(" ");
}

function requirePositive(value: number, label: string): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${label} 必须是有限正数`);
  }
}

function requireFiniteVec(values: readonly number[], label: string): void {
  if (
    !Array.isArray(values) ||
    values.length !== 3 ||
    !Number.isFinite(values[0]) ||
    !Number.isFinite(values[1]) ||
    !Number.isFinite(values[2])
  ) {
    throw new Error(`${label} 必须是 3 个有限数值`);
  }
}

function sameVec(left: readonly number[], right: readonly number[]): boolean {
  if (left.length !== right.length) return false;
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) return false;
  }
  return true;
}

function isZeroVec(values: readonly number[]): boolean {
  return values.length === 3 && values[0] === 0 && values[1] === 0 && values[2] === 0;
}

function requireUnitQuaternion(
  rotation: EntityState["pose"]["rotation"],
  label: string,
): void {
  const values = [rotation.x, rotation.y, rotation.z, rotation.w];
  if (values.some((value) => !Number.isFinite(value))) {
    throw new Error(`${label} 必须是有限 quaternion`);
  }
  const norm = Math.hypot(...values);
  if (Math.abs(norm - 1) > 1e-9) {
    throw new Error(`${label} 必须是单位 quaternion`);
  }
}

function requireExactOwnKeys(
  value: object,
  label: string,
  expected: readonly string[],
): void {
  const keys = Reflect.ownKeys(value);
  if (
    keys.length !== expected.length ||
    keys.some((key) => typeof key !== "string" || !expected.includes(key))
  ) {
    throw new Error(`${label} 字段非法`);
  }
}

function requireEntity(entity: Entity): void {
  if (entity.frameRef !== "frame:world") {
    throw new Error(`${entity.ref} 必须使用 frame:world`);
  }
  if (entity.unitSystemRef !== "units:si") {
    throw new Error(`${entity.ref} 必须使用 units:si`);
  }
  requireFiniteVec(entity.state.pose.position, `${entity.ref} position`);
  requireUnitQuaternion(entity.state.pose.rotation, `${entity.ref} rotation`);
  requireFiniteVec(entity.state.linearVelocity, `${entity.ref} linearVelocity`);
  requireFiniteVec(entity.state.angularVelocity, `${entity.ref} angularVelocity`);

  const collision = entity.representations.collision;
  requireExactOwnKeys(collision, `${entity.ref} collision`, ["kind", "halfExtents"]);
  if (collision.kind !== "box") {
    throw new Error(`${entity.ref} 只支持 box collision`);
  }
  requireFiniteVec(collision.halfExtents, `${entity.ref} halfExtents`);
  for (let index = 0; index < 3; index += 1) {
    requirePositive(collision.halfExtents[index]!, `${entity.ref} halfExtents[${index}]`);
  }

  const visual = entity.representations.visual;
  if (visual.kind === "box") {
    requireExactOwnKeys(visual, `${entity.ref} box visual`, ["kind", "halfExtents", "color"]);
    requireFiniteVec(visual.halfExtents, `${entity.ref} visual halfExtents`);
    for (let index = 0; index < 3; index += 1) {
      requirePositive(visual.halfExtents[index]!, `${entity.ref} visual halfExtents[${index}]`);
    }
    if (typeof visual.color !== "string" || visual.color.length === 0 || visual.color.length > 64) {
      throw new Error(`${entity.ref} visual color 非法`);
    }
  } else if (visual.kind === "imported-rigid-mesh") {
    requireExactOwnKeys(visual, `${entity.ref} imported visual`, [
      "kind",
      "assetId",
      "contentDigest",
      "sourceFrameRef",
      "sourceUnitMeters",
      "localTransform",
    ]);
    requireDiagnosticRigidVisual(visual);
    requireDiagnosticRigidCollision(collision);
    requirePositive(visual.sourceUnitMeters, `${entity.ref} sourceUnitMeters`);
    requireExactOwnKeys(visual.localTransform, `${entity.ref} localTransform`, [
      "position",
      "rotation",
      "scale",
    ]);
    requireFiniteVec(visual.localTransform.position, `${entity.ref} local position`);
    requireUnitQuaternion(visual.localTransform.rotation, `${entity.ref} local rotation`);
    requireFiniteVec(visual.localTransform.scale, `${entity.ref} local scale`);
    for (let index = 0; index < 3; index += 1) {
      requirePositive(visual.localTransform.scale[index]!, `${entity.ref} local scale[${index}]`);
    }
  } else {
    throw new Error(`${entity.ref} visual kind 非法`);
  }
  const observation = entity.representations.observation;
  if (observation !== null) {
    if (entity.ref !== CUBE_REF) {
      throw new Error(`${entity.ref} observation 必须绑定 ${CUBE_REF}`);
    }
    if (visual.kind !== "imported-rigid-mesh") {
      throw new Error(`${entity.ref} observation 只允许绑定登记 imported visual`);
    }
    requireDiagnosticRigidCollision(collision);
    requireExactOwnKeys(observation, `${entity.ref} observation`, [
      "kind",
      "role",
      "assetId",
      "contentDigest",
      "sourceFrameRef",
      "sourceUnitMeters",
      "localTransform",
    ]);
    requireDiagnosticGaussianSplatObservation(observation);
  }
  if (!Number.isFinite(entity.physics.friction) || entity.physics.friction < 0) {
    throw new Error(`${entity.ref} friction 必须是有限非负数`);
  }
}

function integerRatio(value: number, label: string): number {
  const rounded = Math.round(value);
  if (!Number.isFinite(value) || rounded <= 0 || Math.abs(value - rounded) > 1e-9) {
    throw new Error(`${label} 必须对齐 integer physics-step`);
  }
  return rounded;
}

function prepareRun(
  snapshot: Snapshot,
  program: WorldProgram,
  profile: RuntimeProfile,
): PreparedRun {
  if (program.kind !== "free-fall") {
    throw new Error(`MuJoCo Runtime 尚不支持 ${program.kind}`);
  }
  requirePositive(program.durationSeconds, "durationSeconds");
  requirePositive(program.sampleRateHz, "sampleRateHz");
  if (
    program.id !== PROGRAM_ID ||
    program.targetRef !== CUBE_REF ||
    program.durationSeconds !== PROGRAM_DURATION_SECONDS ||
    program.sampleRateHz !== PROGRAM_SAMPLE_RATE_HZ
  ) {
    throw new Error(`不受支持的 WorldProgram：${program.id}`);
  }

  if (
    profile.id !== RUNTIME_PROFILE_ID ||
    profile.provider !== RUNTIME_PROVIDER ||
    profile.version !== RUNTIME_VERSION ||
    profile.equivalence !== "numeric"
  ) {
    throw new Error(`不受支持的 RuntimeProfile：${profile.id}`);
  }
  requirePositive(profile.timestepSeconds, "timestepSeconds");
  requireFiniteVec(profile.gravity, "gravity");
  if (
    profile.timestepSeconds !== RUNTIME_TIMESTEP_SECONDS ||
    !sameVec(profile.gravity, RUNTIME_GRAVITY)
  ) {
    throw new Error(`RuntimeProfile identity 与执行参数不一致：${profile.id}`);
  }

  if (!isDeepFrozen(snapshot) || !isDeepFrozen(program) || !isDeepFrozen(profile)) {
    throw new Error("Snapshot、WorldProgram 与 RuntimeProfile 必须是递归冻结的 plain data record");
  }
  if (snapshot.schemaVersion !== 1) {
    throw new Error(`不受支持的 Snapshot schemaVersion：${snapshot.schemaVersion}`);
  }
  const entityRefs = new Set(snapshot.entities.map((entity) => entity.ref));
  if (entityRefs.size !== snapshot.entities.length) {
    throw new Error("Snapshot 不能包含重复 EntityRef");
  }
  if (
    snapshot.entities.length !== 2 ||
    !entityRefs.has(FLOOR_REF) ||
    !entityRefs.has(CUBE_REF)
  ) {
    throw new Error("falling-cube Runtime 只支持 entity:floor 与 entity:cube");
  }

  const floor = findEntity(snapshot, FLOOR_REF);
  const cube = findEntity(snapshot, program.targetRef);
  requireEntity(floor);
  requireEntity(cube);
  if (floor.physics.bodyType !== "static" || cube.physics.bodyType !== "dynamic") {
    throw new Error("falling-cube 要求静态地面与动态目标物体");
  }
  if (
    floor.physics.massKg !== 0 ||
    !isZeroVec(floor.state.linearVelocity) ||
    !isZeroVec(floor.state.angularVelocity)
  ) {
    throw new Error("静态地面必须使用 0 massKg、0 linearVelocity 与 0 angularVelocity");
  }
  requirePositive(cube.physics.massKg, `${cube.ref} massKg`);

  return {
    floor,
    cube,
    stepCount: integerRatio(
      program.durationSeconds / profile.timestepSeconds,
      "durationSeconds / timestepSeconds",
    ),
    sampleEverySteps: integerRatio(
      1 / (program.sampleRateHz * profile.timestepSeconds),
      "sampleRateHz / physics-step",
    ),
  };
}

function quaternionValues(entity: Entity): readonly [number, number, number, number] {
  const { x, y, z, w } = entity.state.pose.rotation;
  return [w, x, y, z];
}

function rotateVector(
  vector: readonly [number, number, number],
  rotation: EntityState["pose"]["rotation"],
): readonly [number, number, number] {
  const [vx, vy, vz] = vector;
  const tx = 2 * (rotation.y * vz - rotation.z * vy);
  const ty = 2 * (rotation.z * vx - rotation.x * vz);
  const tz = 2 * (rotation.x * vy - rotation.y * vx);
  return [
    vx + rotation.w * tx + rotation.y * tz - rotation.z * ty,
    vy + rotation.w * ty + rotation.z * tx - rotation.x * tz,
    vz + rotation.w * tz + rotation.x * ty - rotation.y * tx,
  ];
}

function renderMjcf(prepared: PreparedRun, profile: RuntimeProfile): string {
  const { floor, cube } = prepared;
  const floorShape = floor.representations.collision;
  const cubeShape = cube.representations.collision;

  return `<mujoco model="demiurges-falling-cube">
  <compiler angle="radian" alignfree="false"/>
  <option timestep="${xmlNumber(profile.timestepSeconds)}" gravity="${xmlVec(profile.gravity)}"/>
  <worldbody>
    <geom name="floor" type="box" pos="${xmlVec(floor.state.pose.position)}" quat="${xmlVec(quaternionValues(floor))}" size="${xmlVec(floorShape.halfExtents)}" friction="${xmlNumber(floor.physics.friction)} 0.005 0.0001"/>
    <body name="cube" pos="${xmlVec(cube.state.pose.position)}" quat="${xmlVec(quaternionValues(cube))}">
      <freejoint name="cube_free" align="false"/>
      <geom name="cube_geom" type="box" size="${xmlVec(cubeShape.halfExtents)}" mass="${xmlNumber(cube.physics.massKg)}" friction="${xmlNumber(cube.physics.friction)} 0.005 0.0001"/>
    </body>
  </worldbody>
</mujoco>`;
}

export function createFallingCubeMjcf(
  snapshot: Snapshot,
  program: WorldProgram,
  profile: RuntimeProfile,
): string {
  return renderMjcf(prepareRun(snapshot, program, profile), profile);
}

function copyDynamicState(data: MjData): EntityState {
  const qpos = data.qpos as ArrayLike<number>;
  const qvel = data.qvel as ArrayLike<number>;
  const rotation = { x: qpos[4], y: qpos[5], z: qpos[6], w: qpos[3] };
  const angularVelocity = rotateVector(
    [qvel[3], qvel[4], qvel[5]],
    rotation,
  );
  const state: EntityState = {
    pose: {
      position: [qpos[0], qpos[1], qpos[2]],
      rotation,
    },
    linearVelocity: [qvel[0], qvel[1], qvel[2]],
    angularVelocity,
  };
  requireFiniteVec(state.pose.position, "MuJoCo position");
  requireUnitQuaternion(state.pose.rotation, "MuJoCo rotation");
  requireFiniteVec(state.linearVelocity, "MuJoCo linearVelocity");
  requireFiniteVec(state.angularVelocity, "MuJoCo angularVelocity");
  return state;
}

function applyInitialVelocity(data: MjData, cube: Entity): void {
  const qvel = data.qvel as { [index: number]: number };
  const [vx, vy, vz] = cube.state.linearVelocity;
  const rotation = cube.state.pose.rotation;
  const localAngularVelocity = rotateVector(cube.state.angularVelocity, {
    x: -rotation.x,
    y: -rotation.y,
    z: -rotation.z,
    w: rotation.w,
  });
  [qvel[0], qvel[1], qvel[2]] = [vx, vy, vz];
  [qvel[3], qvel[4], qvel[5]] = localAngularVelocity;
}

function createSample(
  snapshot: Snapshot,
  targetRef: Entity["ref"],
  data: MjData,
): EpisodeSample {
  if (!Number.isFinite(data.time) || !Number.isInteger(data.ncon) || data.ncon < 0) {
    throw new Error("MuJoCo observation 包含非有限 time 或无效 contact count");
  }
  const states = Object.fromEntries(
    snapshot.entities.map((entity) => [
      entity.ref,
      entity.ref === targetRef ? copyDynamicState(data) : entity.state,
    ]),
  ) as Record<Entity["ref"], EntityState>;

  return {
    timeSeconds: data.time,
    states,
    contactCount: data.ncon,
  };
}

function createTerminalSnapshot(
  base: Snapshot,
  targetRef: Entity["ref"],
  terminalState: EntityState,
  runKey: string,
): Snapshot {
  return {
    schemaVersion: 1,
    id: `snapshot:terminal-${runKey}`,
    parentId: base.id,
    source: "runtime-terminal",
    entities: base.entities.map((entity) =>
      entity.ref === targetRef ? { ...entity, state: terminalState } : entity,
    ),
  };
}

function runKey(inputs: ExplicitInputs): string {
  if (typeof inputs.runId !== "string" || !inputs.runId.startsWith("run:")) {
    throw new Error("runId 必须以 run: 开头");
  }
  const value = inputs.runId.slice("run:".length);
  if (!/^[a-zA-Z0-9._-]+$/.test(value)) {
    throw new Error("runId 仅允许字母、数字、点、下划线与连字符");
  }
  if (!isDeepFrozen(inputs)) {
    throw new Error("ExplicitInputs 必须递归冻结");
  }
  return value;
}

function snapshotKey(snapshot: Snapshot): string {
  if (!snapshot.id.startsWith("snapshot:")) {
    throw new Error("Snapshot id 必须以 snapshot: 开头");
  }
  const value = snapshot.id.slice("snapshot:".length);
  if (!/^[a-zA-Z0-9._-]+$/.test(value)) {
    throw new Error("Snapshot id 仅允许字母、数字、点、下划线与连字符");
  }
  return value;
}

function executionKey(run: string, snapshot: string): string {
  return `${run.length}-${run}-${snapshot.length}-${snapshot}`;
}

export async function runFallingCube(
  snapshot: Snapshot,
  program: WorldProgram,
  profile: RuntimeProfile,
  inputs: ExplicitInputs,
): Promise<Episode> {
  const key = executionKey(runKey(inputs), snapshotKey(snapshot));
  const prepared = prepareRun(snapshot, program, profile);
  const modelXml = renderMjcf(prepared, profile);
  const mujoco = await getMujoco();
  let model: MjModel | undefined;
  let data: MjData | undefined;

  try {
    model = mujoco.MjModel.from_xml_string(modelXml);
    data = new mujoco.MjData(model);
    applyInitialVelocity(data, prepared.cube);
    mujoco.mj_forward(model, data);

    const samples: EpisodeSample[] = [createSample(snapshot, program.targetRef, data)];
    const events: EpisodeEvent[] = [];
    let contactRecorded = data.ncon > 0;
    if (contactRecorded) {
      events.push({
        type: "contact-began",
        timeSeconds: data.time,
        entities: [program.targetRef, FLOOR_REF],
      });
    }

    for (let step = 1; step <= prepared.stepCount; step += 1) {
      mujoco.mj_step(model, data);
      mujoco.mj_forward(model, data);

      if (!contactRecorded && data.ncon > 0) {
        events.push({
          type: "contact-began",
          timeSeconds: data.time,
          entities: [program.targetRef, FLOOR_REF],
        });
        contactRecorded = true;
      }

      if (step % prepared.sampleEverySteps === 0) {
        samples.push(createSample(snapshot, program.targetRef, data));
      }
    }

    const lastSample = samples.at(-1);
    if (!lastSample || Math.abs(lastSample.timeSeconds - data.time) > 1e-9) {
      samples.push(createSample(snapshot, program.targetRef, data));
    }

    const terminalState = samples.at(-1)?.states[program.targetRef];
    if (!terminalState) {
      throw new Error("MuJoCo 未产生 terminal state");
    }

    return deepFreeze({
      id: `episode:${key}`,
      baseSnapshotId: snapshot.id,
      programId: program.id,
      runtimeProfileId: profile.id,
      explicitInputs: inputs,
      completion: "completed",
      samples,
      events,
      terminalSnapshot: createTerminalSnapshot(snapshot, program.targetRef, terminalState, key),
      runtimeEvidence: {
        provider: RUNTIME_PROVIDER,
        version: RUNTIME_VERSION,
        modelFormat: "MJCF",
      },
    }) as Episode;
  } finally {
    try {
      data?.delete();
    } finally {
      model?.delete();
    }
  }
}
