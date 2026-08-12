import type { MainModule, MjData, MjModel } from "@mujoco/mujoco";

import { REACH_TARGET_POSITION } from "../artifacts/two-joint-reach-fixture";
import { requireRegisteredSnapshotIdentity } from "../artifacts/diagnostic-rigid-fixture";
import { canonicalJsonBytes, sha256Hex } from "../kernel/canonical-json";
import type {
  ActuatorCommand,
  ActuatorSequenceWorldProgram,
  ArticulatedJointState,
  Episode,
  EpisodeSample,
  ExplicitInputs,
  RuntimeProfile,
  Snapshot,
  Vec3,
} from "../kernel/types";
import { deepFreeze, findEntity, isDeepFrozen } from "../kernel/world";
import { requireWorldRunInput } from "../world-tools/world-tool-contract";

export const ARTICULATED_MJCF = `<mujoco model="demiurges-two-joint-reach">
  <compiler angle="radian" autolimits="false" balanceinertia="false" alignfree="false"/>
  <option timestep="0.004166666666666667" gravity="0 0 -9.81" wind="0 0 0" density="0" viscosity="0" integrator="RK4" solver="Newton" iterations="100" tolerance="1e-12" jacobian="dense" cone="pyramidal" impratio="1"/>
  <worldbody>
    <geom name="floor" type="box" pos="0 0 -0.05" size="3.2 3.2 0.05" contype="1" conaffinity="1"/>
    <body name="arm-base" pos="0 0 0.75">
      <site name="arm-base-site" pos="0 0 0"/>
      <body name="upper" pos="0 0 0">
        <joint name="arm-shoulder" type="hinge" axis="0 0 1" limited="false" damping="1.2" frictionloss="0" armature="0" stiffness="0" ref="0" springref="0"/>
        <inertial pos="0.275 0 0" quat="1 0 0 0" mass="1.2" diaginertia="0.003 0.035 0.035"/>
        <geom name="upper-capsule" type="capsule" fromto="0.05 0 0 0.50 0 0" size="0.05" contype="0" conaffinity="0" condim="1" friction="0 0 0" margin="0" gap="0"/>
        <site name="arm-elbow-site" pos="0.55 0 0"/>
        <body name="forearm" pos="0.55 0 0">
          <joint name="arm-elbow" type="hinge" axis="0 0 1" limited="false" damping="0.9" frictionloss="0" armature="0" stiffness="0" ref="0" springref="0"/>
          <inertial pos="0.225 0 0" quat="1 0 0 0" mass="0.8" diaginertia="0.002 0.015 0.015"/>
          <geom name="forearm-capsule" type="capsule" fromto="0.05 0 0 0.40 0 0" size="0.05" contype="0" conaffinity="0" condim="1" friction="0 0 0" margin="0" gap="0"/>
          <site name="arm-tool-site" pos="0.45 0 0"/>
        </body>
      </body>
    </body>
    <body name="target" pos="0.8605638099833013 0.17854850979986867 0.75"><site name="reach-target-site" pos="0 0 0"/></body>
  </worldbody>
  <actuator>
    <general name="arm-shoulder-position" joint="arm-shoulder" group="0" ctrllimited="true" ctrlrange="-1.57 1.57" forcelimited="true" forcerange="-30 30" gear="1 0 0 0 0 0" dyntype="none" gaintype="fixed" gainprm="40 0 0 0 0 0 0 0 0 0" biastype="affine" biasprm="0 -40 -4 0 0 0 0 0 0 0"/>
    <general name="arm-elbow-position" joint="arm-elbow" group="0" ctrllimited="true" ctrlrange="-2.2 2.2" forcelimited="true" forcerange="-20 20" gear="1 0 0 0 0 0" dyntype="none" gaintype="fixed" gainprm="32 0 0 0 0 0 0 0 0 0" biastype="affine" biasprm="0 -32 -3.2 0 0 0 0 0 0 0"/>
  </actuator>
  <sensor><jointpos name="arm-shoulder-position-sensor" joint="arm-shoulder"/><jointvel name="arm-shoulder-velocity-sensor" joint="arm-shoulder"/><jointpos name="arm-elbow-position-sensor" joint="arm-elbow"/><jointvel name="arm-elbow-velocity-sensor" joint="arm-elbow"/></sensor>
</mujoco>`;

function getMujoco(): Promise<MainModule> {
  return import("@mujoco/mujoco").then(({ default: load }) => load());
}

export function articulatedForwardKinematics(shoulder: number, elbow: number): Vec3 {
  return [
    0.55 * Math.cos(shoulder) + 0.45 * Math.cos(shoulder + elbow),
    0.55 * Math.sin(shoulder) + 0.45 * Math.sin(shoulder + elbow),
    0.75,
  ];
}

function requireModel(model: MjModel): void {
  const counts = [model.nbody, model.njnt, model.nq, model.nv, model.nu, model.na, model.nmocap, model.nuserdata, model.nplugin, model.nsensor, model.nsensordata, model.ngeom, model.nsite];
  const expected = [5,2,2,2,2,0,0,0,0,4,4,3,4];
  if (counts.some((value,index)=>value!==expected[index])) throw new Error("articulated loaded model exact counts 漂移");
}

const CALLBACK_NAMES = [
  "mjcb_control", "mjcb_passive", "mjcb_act_dyn", "mjcb_act_gain", "mjcb_act_bias",
] as const;

export function requireArticulatedNoCallbackSurface(mujoco: MainModule): void {
  const exposed = Reflect.ownKeys(mujoco).filter((key) =>
    typeof key === "string" && CALLBACK_NAMES.includes(key as typeof CALLBACK_NAMES[number]));
  if (exposed.length !== 0) {
    throw new Error(`MuJoCo callback surface 必须不可配置：${exposed.join(",")}`);
  }
  // This binding does not export callback globals. The adapter therefore owns
  // a fresh, unshared Emscripten module for one run and never exposes it.
}

function array(value: ArrayLike<number>, length: number): number[] {
  return Array.from({ length }, (_, index) => {
    const component = value[index];
    if (!Number.isFinite(component)) throw new Error("loaded model causal field 非 finite");
    return Object.is(component, -0) ? 0 : component!;
  });
}

export function articulatedModelCausalDigest(
  model: MjModel,
  mjcfSource: string,
): `sha256:${string}` {
  const causal = {
    mjcfSourceDigest: `sha256:${sha256Hex(new TextEncoder().encode(mjcfSource))}`,
    counts: {
      nbody:model.nbody,njnt:model.njnt,nq:model.nq,nv:model.nv,nu:model.nu,na:model.na,
      nmocap:model.nmocap,nuserdata:model.nuserdata,nplugin:model.nplugin,
      nsensor:model.nsensor,nsensordata:model.nsensordata,ngeom:model.ngeom,nsite:model.nsite,
    },
    option: {
      timestep:model.opt.timestep,gravity:array(model.opt.gravity,3),wind:array(model.opt.wind,3),
      density:model.opt.density,viscosity:model.opt.viscosity,integrator:model.opt.integrator,
      solver:model.opt.solver,iterations:model.opt.iterations,tolerance:model.opt.tolerance,
      jacobian:model.opt.jacobian,cone:model.opt.cone,impratio:model.opt.impratio,
      disableflags:model.opt.disableflags,enableflags:model.opt.enableflags,
      disableactuator:model.opt.disableactuator,
    },
    body: {
      mass:array(model.body_mass,model.nbody),inertia:array(model.body_inertia,3*model.nbody),
      inertialPosition:array(model.body_ipos,3*model.nbody),inertialQuaternion:array(model.body_iquat,4*model.nbody),
      position:array(model.body_pos,3*model.nbody),quaternion:array(model.body_quat,4*model.nbody),
      parent:array(model.body_parentid,model.nbody),mocap:array(model.body_mocapid,model.nbody),
    },
    joint: {
      type:array(model.jnt_type,model.njnt),body:array(model.jnt_bodyid,model.njnt),
      qposAddress:array(model.jnt_qposadr,model.njnt),dofAddress:array(model.jnt_dofadr,model.njnt),
      axis:array(model.jnt_axis,3*model.njnt),position:array(model.jnt_pos,3*model.njnt),
      range:array(model.jnt_range,2*model.njnt),
      stiffness:array(model.jnt_stiffness,model.njnt),damping:array(model.dof_damping,model.nv),
      frictionloss:array(model.dof_frictionloss,model.nv),armature:array(model.dof_armature,model.nv),
    },
    geom: {
      type:array(model.geom_type,model.ngeom),body:array(model.geom_bodyid,model.ngeom),
      position:array(model.geom_pos,3*model.ngeom),quaternion:array(model.geom_quat,4*model.ngeom),
      size:array(model.geom_size,3*model.ngeom),contype:array(model.geom_contype,model.ngeom),
      conaffinity:array(model.geom_conaffinity,model.ngeom),condim:array(model.geom_condim,model.ngeom),
      friction:array(model.geom_friction,3*model.ngeom),margin:array(model.geom_margin,model.ngeom),
      gap:array(model.geom_gap,model.ngeom),
    },
    actuator: {
      transmission:array(model.actuator_trntype,model.nu),transmissionIds:array(model.actuator_trnid,2*model.nu),
      controlRange:array(model.actuator_ctrlrange,2*model.nu),forceRange:array(model.actuator_forcerange,2*model.nu),
      dynamicsType:array(model.actuator_dyntype,model.nu),gainType:array(model.actuator_gaintype,model.nu),
      biasType:array(model.actuator_biastype,model.nu),dynamics:array(model.actuator_dynprm,10*model.nu),
      gain:array(model.actuator_gainprm,10*model.nu),bias:array(model.actuator_biasprm,10*model.nu),
      gear:array(model.actuator_gear,6*model.nu),group:array(model.actuator_group,model.nu),
      // MuJoCo 3.11's JS binding cannot materialize its bool memory_view fields.
      // ctrllimited/forcelimited therefore remain locked by mjcfSourceDigest;
      // the numeric ranges and all readable compiled fields are locked here.
    },
    sensor: {
      type:array(model.sensor_type,model.nsensor),objectType:array(model.sensor_objtype,model.nsensor),
      objectId:array(model.sensor_objid,model.nsensor),dimension:array(model.sensor_dim,model.nsensor),
      address:array(model.sensor_adr,model.nsensor),
    },
    site: {
      body:array(model.site_bodyid,model.nsite),type:array(model.site_type,model.nsite),
      position:array(model.site_pos,3*model.nsite),quaternion:array(model.site_quat,4*model.nsite),
      size:array(model.site_size,3*model.nsite),
    },
  };
  return `sha256:${sha256Hex(canonicalJsonBytes(causal))}`;
}

export const ARTICULATED_CANONICAL_MODEL_CAUSAL_DIGEST =
  "sha256:c628cb3962efa2eeca87f75934814525f5084a972a95a274771f97c1024d001c" as const;

export function requireArticulatedModelCausalDigest(
  model: MjModel,
  mjcfSource: string,
  expected: `sha256:${string}`,
): void {
  requireModel(model);
  if (articulatedModelCausalDigest(model, mjcfSource) !== expected) {
    throw new Error("articulated loaded model causal digest 漂移");
  }
}

export function requireArticulatedZeroInputs(model: MjModel, data: MjData): void {
  const qfrc = data.qfrc_applied as ArrayLike<number>;
  const xfrc = data.xfrc_applied as ArrayLike<number>;
  for (let index=0; index<model.nv; index++) if (qfrc[index]!==0) throw new Error("qfrc_applied 必须为零");
  for (let index=0; index<6*model.nbody; index++) if (xfrc[index]!==0) throw new Error("xfrc_applied 必须为零");
  if (model.opt.disableactuator!==0) throw new Error("disableactuator 必须为零");
}

export function requireArticulatedFreshResetData(model: MjModel, data: MjData): void {
  const arrays = [
    [data.qpos as ArrayLike<number>, model.nq, "qpos"],
    [data.qvel as ArrayLike<number>, model.nv, "qvel"],
    [data.ctrl as ArrayLike<number>, model.nu, "ctrl"],
  ] as const;
  if (data.time !== 0) throw new Error("fresh MjData time 必须为零");
  for (const [values, length, label] of arrays) {
    for (let index = 0; index < length; index += 1) {
      if (values[index] !== 0) throw new Error(`fresh MjData ${label} 必须为零`);
    }
  }
  requireArticulatedZeroInputs(model, data);
}

export function requireArticulatedOwnedModel(model: MjModel, ownedModel: MjModel): void {
  if (model !== ownedModel) throw new Error("articulated Runtime model ownership 漂移");
}

export function requireArticulatedRuntimeBoundary(
  mujoco: MainModule,
  model: MjModel,
  ownedModel: MjModel,
  data: MjData,
  modelCausalDigest: `sha256:${string}`,
): void {
  requireArticulatedNoCallbackSurface(mujoco);
  requireArticulatedOwnedModel(model, ownedModel);
  requireArticulatedModelCausalDigest(model, ARTICULATED_MJCF, modelCausalDigest);
  requireArticulatedZeroInputs(model, data);
  jointState(data);
}

function jointState(data: MjData): readonly [ArticulatedJointState, ArticulatedJointState] {
  const qpos=data.qpos as ArrayLike<number>; const qvel=data.qvel as ArrayLike<number>;
  const values=[qpos[0],qvel[0],qpos[1],qvel[1]];
  if (values.some((value)=>!Number.isFinite(value))) throw new Error("articulated state 非 finite");
  if (qpos[0]! < -1.57 || qpos[0]! > 1.57 || qpos[1]! < -2.2 || qpos[1]! > 2.2) {
    throw new Error("articulated joint state 超出 semantic limit");
  }
  return [
    {jointRef:"joint:arm-shoulder",positionRadians:qpos[0],velocityRadiansPerSecond:qvel[0]},
    {jointRef:"joint:arm-elbow",positionRadians:qpos[1],velocityRadiansPerSecond:qvel[1]},
  ];
}

function sample(snapshot: Snapshot, data: MjData, timeSeconds: number, commands: readonly ActuatorCommand[]): EpisodeSample {
  const joints=jointState(data); const sensor=data.sensordata as ArrayLike<number>;
  const sensorRefs=["sensor:arm-shoulder-position","sensor:arm-shoulder-velocity","sensor:arm-elbow-position","sensor:arm-elbow-velocity"] as const;
  const expected=[joints[0].positionRadians,joints[0].velocityRadiansPerSecond,joints[1].positionRadians,joints[1].velocityRadiansPerSecond];
  const sensors=sensorRefs.map((sensorRef,index)=>{
    if (!Number.isFinite(sensor[index])||Math.abs(sensor[index]-expected[index]!)>1e-9) throw new Error("sensor 与 joint state 不一致");
    return {sensorRef,value:sensor[index]};
  });
  return { timeSeconds, states:Object.fromEntries(snapshot.entities.map((entity) => [
    entity.ref,
    entity.ref === "entity:arm" ? {...entity.state,articulated:{joints}} : entity.state,
  ])), contactCount:0, articulated:{targetRef:"entity:arm",joints,sensors,activeCommands:commands} };
}

function executionKey(runId: string, snapshotId: string, programId: string): string {
  const run = runId.slice("run:".length);
  const snapshot = snapshotId.slice("snapshot:".length);
  const digest = programId.slice("program:sha256:".length);
  return `${run.length}-${run}-${snapshot.length}-${snapshot}-${digest}`;
}

function terminal(snapshot: Snapshot, joints: readonly ArticulatedJointState[], key: string): Snapshot {
  return { ...snapshot, id:`snapshot:terminal-${key}`, parentId:snapshot.id, source:"runtime-terminal", entities:snapshot.entities.map((entity)=>entity.ref==="entity:arm"?{...entity,state:{...entity.state,articulated:{joints}}}:entity) };
}

export async function runArticulatedReach(snapshot: Snapshot, program: ActuatorSequenceWorldProgram, profile: RuntimeProfile, inputs: ExplicitInputs): Promise<Episode> {
  if (!isDeepFrozen(snapshot)||!isDeepFrozen(program)||!isDeepFrozen(profile)||!isDeepFrozen(inputs)) throw new Error("articulated Runtime inputs 必须递归冻结");
  requireRegisteredSnapshotIdentity(snapshot);
  const { id: _programId, ...programContent } = program;
  const admittedProgram = requireWorldRunInput({ runId: inputs.runId, program: programContent }).program;
  if (admittedProgram.id !== program.id || snapshot.scenarioId!=="scenario:two-joint-planar-reach-v1"||program.targetRef!=="entity:arm"||profile.timestepSeconds!==1/240) throw new Error("articulated Runtime scenario/profile mismatch");
  const arm=findEntity(snapshot,"entity:arm"); const initial=arm.state.articulated?.joints;
  if (!initial||initial.length!==2) throw new Error("base articulated joint state 缺失");
  const mujoco=await getMujoco(); requireArticulatedNoCallbackSurface(mujoco); let model:MjModel|undefined; let data:MjData|undefined;
  try {
    model=mujoco.MjModel.from_xml_string(ARTICULATED_MJCF); requireModel(model);
    const ownedModel = model;
    const modelCausalDigest=articulatedModelCausalDigest(model, ARTICULATED_MJCF);
    if (modelCausalDigest !== ARTICULATED_CANONICAL_MODEL_CAUSAL_DIGEST) {
      throw new Error("articulated loaded model 与 canonical registry 不一致");
    }
    data=new mujoco.MjData(model); mujoco.mj_resetData(model,data);
    requireArticulatedFreshResetData(model, data);
    data.qpos[0]=initial[0]!.positionRadians; data.qpos[1]=initial[1]!.positionRadians;
    data.qvel[0]=initial[0]!.velocityRadiansPerSecond; data.qvel[1]=initial[1]!.velocityRadiansPerSecond;
    const durationTicks=program.durationSeconds*240; let held=program.steps[0]!.commands; let stepIndex=0; const samples:EpisodeSample[]=[];
    for(let tick=0;tick<=durationTicks;tick++){
      if(stepIndex+1<program.steps.length&&program.steps[stepIndex+1]!.timeSeconds*240===tick) held=program.steps[++stepIndex]!.commands;
      data.ctrl[0]=held[0]!.valueRadians; data.ctrl[1]=held[1]!.valueRadians;
      requireArticulatedRuntimeBoundary(mujoco, model, ownedModel, data, modelCausalDigest);
      mujoco.mj_forward(model,data);
      if(data.ncon!==0||data.nefc!==0) throw new Error("articulated Runtime 必须无 contact/constraint");
      if(tick%8===0) samples.push(sample(snapshot,data,tick/240,held));
      if(tick===durationTicks) break;
      mujoco.mj_step(model,data);
      requireArticulatedRuntimeBoundary(mujoco, model, ownedModel, data, modelCausalDigest);
    }
    const joints=samples.at(-1)!.articulated!.joints;
    const key=executionKey(inputs.runId,snapshot.id,program.id);
    requireArticulatedRuntimeBoundary(mujoco, model, ownedModel, data, modelCausalDigest);
    return deepFreeze({id:`episode:${key}`,baseSnapshotId:snapshot.id,scenarioId:snapshot.scenarioId,program,runtimeProfileId:profile.id,explicitInputs:inputs,completion:"completed",samples,events:[],terminalSnapshot:terminal(snapshot,joints,key),runtimeEvidence:{provider:"MuJoCo WASM",version:"3.11.0",modelFormat:"MJCF",modelCausalDigest}}) as Episode;
  } finally { try{data?.delete();}finally{model?.delete();} }
}

export function canonicalTargetMatchesFk(): boolean {
  const actual=articulatedForwardKinematics(0.65,-1); return actual.every((value,index)=>value===REACH_TARGET_POSITION[index]);
}
