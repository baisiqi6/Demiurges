import { describe, expect, test } from "bun:test";
import loadMujoco from "@mujoco/mujoco";

import {
  ACTUATOR_SEQUENCE_GOLDEN_DIGEST,
  ARTICULATED_CANONICAL_MODEL_CAUSAL_DIGEST,
  ARTICULATED_MJCF,
  FREE_FALL_GOLDEN_DIGEST,
  TWO_JOINT_REACH_FIXTURE_ID,
  articulatedModelCausalDigest,
  canonicalJsonBytes,
  createTwoJointReachSnapshot,
  requireWorldEditInput,
  requireWorldRunInput,
  requireArticulatedModelCausalDigest,
  RuntimeMvpHost,
  WorldToolSurface,
  decodeProductSessionProjection,
  decodeProductSessionProjectionTrusted,
  deepFreeze,
} from "./index";
import { ProductSession, createScriptedAgentClientFactory } from "../../../apps/agent-gateway/src/product-session";
import {
  requireArticulatedFreshResetData,
  requireArticulatedOwnedModel,
  requireArticulatedRuntimeBoundary,
  requireArticulatedZeroInputs,
} from "./runtime-mujoco/run-articulated-reach";

const expected = {
  name: "world:current",
  snapshotId: "snapshot:base-two-joint-reach",
  version: 1,
} as const;

const actuatorProgram = {
  kind: "actuator-sequence",
  targetRef: "entity:arm",
  durationSeconds: 3,
  sampleRateHz: 30,
  steps: [
    {
      timeSeconds: 0,
      commands: [
        { actuatorRef: "actuator:arm-shoulder-position", valueRadians: 0.35 },
        { actuatorRef: "actuator:arm-elbow-position", valueRadians: -0.35 },
      ],
    },
    {
      timeSeconds: 0.5,
      commands: [
        { actuatorRef: "actuator:arm-shoulder-position", valueRadians: 0.65 },
        { actuatorRef: "actuator:arm-elbow-position", valueRadians: -1 },
      ],
    },
  ],
} as const;

describe("DH-011 articulated control contract", () => {
  test("fixture keeps one top-level arm Entity and stable readable sub-refs", () => {
    const snapshot = createTwoJointReachSnapshot();
    expect(TWO_JOINT_REACH_FIXTURE_ID).toBe("fixture:two-joint-planar-reach-v1");
    expect(snapshot.scenarioId).toBe("scenario:two-joint-planar-reach-v1");
    expect(snapshot.entities.map((entity) => entity.ref)).toEqual([
      "entity:floor",
      "entity:arm",
      "entity:target",
    ]);
    const arm = snapshot.entities[1]!;
    expect(arm.representations.semantic?.kind).toBe("articulated");
    expect(arm.state.articulated?.joints.map((joint) => joint.jointRef)).toEqual([
      "joint:arm-shoulder",
      "joint:arm-elbow",
    ]);
    expect(JSON.stringify(snapshot)).not.toContain("mujocoId");
  });

  test("edit is a closed joint-state description change", () => {
    const parsed = requireWorldEditInput({
      expected,
      targetRef: "entity:arm",
      change: {
        kind: "joint-state",
        joints: [
          { jointRef: "joint:arm-shoulder", positionRadians: 0.1, velocityRadiansPerSecond: 0 },
          { jointRef: "joint:arm-elbow", positionRadians: -0.2, velocityRadiansPerSecond: 0 },
        ],
      },
    });
    expect(parsed.change.kind).toBe("joint-state");
    expect(() => requireWorldEditInput({
      expected,
      targetRef: "entity:arm",
      change: {
        kind: "joint-state",
        joints: [
          { jointRef: "joint:arm-shoulder", positionRadians: 0.1, velocityRadiansPerSecond: 0.1 },
          { jointRef: "joint:arm-elbow", positionRadians: -0.2, velocityRadiansPerSecond: 0 },
        ],
      },
    })).toThrow("velocityRadiansPerSecond");
  });

  test("run accepts explicit bounded Program and rejects legacy programId", () => {
    const parsed = requireWorldRunInput({ runId: "run:reach", program: actuatorProgram });
    expect(parsed.program.id).toBe(`program:sha256:${ACTUATOR_SEQUENCE_GOLDEN_DIGEST}`);
    expect(() => requireWorldRunInput({
      runId: "run:legacy",
      programId: "program:free-fall-rigid-v1",
    })).toThrow("字段");
    expect(() => requireWorldRunInput({
      runId: "run:too-many",
      program: { ...actuatorProgram, steps: Array.from({ length: 17 }, (_, index) => ({
        ...actuatorProgram.steps[0],
        timeSeconds: index / 30,
      })) },
    })).toThrow("16");
    const invalidPrograms = [
      { ...actuatorProgram, durationSeconds: 0.49 },
      { ...actuatorProgram, durationSeconds: 3.01 },
      { ...actuatorProgram, steps: [actuatorProgram.steps[0], { ...actuatorProgram.steps[1], timeSeconds: 3 }] },
      { ...actuatorProgram, steps: [actuatorProgram.steps[0], { ...actuatorProgram.steps[1], timeSeconds: 0.51 }] },
      { ...actuatorProgram, steps: [{ ...actuatorProgram.steps[0], commands: [actuatorProgram.steps[0].commands[0]] }] },
      { ...actuatorProgram, steps: [{ ...actuatorProgram.steps[0], commands: [...actuatorProgram.steps[0].commands, actuatorProgram.steps[0].commands[0]] }] },
    ];
    for (const program of invalidPrograms) {
      expect(() => requireWorldRunInput({ runId: "run:invalid-clock", program })).toThrow();
    }
  });

  test("canonical Program bytes and SHA-256 golden vectors are stable", () => {
    expect(new TextDecoder().decode(canonicalJsonBytes({
      kind: "free-fall",
      targetRef: "entity:cube",
      durationSeconds: 2.5,
      sampleRateHz: 30,
    }))).toBe('{"durationSeconds":2.5,"kind":"free-fall","sampleRateHz":30,"targetRef":"entity:cube"}');
    expect(FREE_FALL_GOLDEN_DIGEST).toBe(
      "b69c174f5e7e2c3e2da941cb21fc0a7437d64314eaa70250d22e4512fd6c0caf",
    );
    expect(ACTUATOR_SEQUENCE_GOLDEN_DIGEST).toBe(
      "a8544a063f5993e976a80d10448890c7a57579d2824ae73ea74bdcf38ab53b55",
    );
  });

  test("real MuJoCo run produces action-conditioned Episode and deterministic PASS", async () => {
    const tools = new WorldToolSurface(new RuntimeMvpHost());
    const written = tools.write({ fixtureId: TWO_JOINT_REACH_FIXTURE_ID });
    tools.edit({
      expected: written.ref,
      targetRef: "entity:arm",
      change: { kind: "joint-state", joints: [
        { jointRef: "joint:arm-shoulder", positionRadians: 0, velocityRadiansPerSecond: 0 },
        { jointRef: "joint:arm-elbow", positionRadians: 0, velocityRadiansPerSecond: 0 },
      ] },
    });
    const beforeRun = tools.read().ref;
    const result = await tools.run({ runId: "run:reach-contract", program: actuatorProgram });
    expect(result.episode.samples).toHaveLength(91);
    expect(result.episode.samples[15]?.articulated?.activeCommands[0]?.valueRadians).toBe(0.65);
    expect(result.evaluation.passed).toBe(true);
    expect(result.evaluation.contractId).toBe("success:end-effector-reaches-frame");
    expect(tools.read().ref).toBe(beforeRun);
  });

  test("causal identity binds exact MJCF source plus loaded site transforms", async () => {
    const mujoco = await loadMujoco();
    const canonical = mujoco.MjModel.from_xml_string(ARTICULATED_MJCF);
    try {
      expect(articulatedModelCausalDigest(canonical, ARTICULATED_MJCF)).toBe(
        ARTICULATED_CANONICAL_MODEL_CAUSAL_DIGEST,
      );

      const controlFlagDrift = ARTICULATED_MJCF.replace(
        'ctrllimited="true"',
        'ctrllimited="false"',
      );
      expect(articulatedModelCausalDigest(canonical, controlFlagDrift)).not.toBe(
        ARTICULATED_CANONICAL_MODEL_CAUSAL_DIGEST,
      );

      canonical.site_pos[0] += 0.001;
      expect(() => requireArticulatedModelCausalDigest(
        canonical,
        ARTICULATED_MJCF,
        ARTICULATED_CANONICAL_MODEL_CAUSAL_DIGEST,
      )).toThrow("causal digest");
    } finally {
      canonical.delete();
    }
  });

  test("Runtime ownership、callback、applied-force 与 fresh-data guards fail closed", async () => {
    const mujoco = await loadMujoco();
    const model = mujoco.MjModel.from_xml_string(ARTICULATED_MJCF);
    const other = mujoco.MjModel.from_xml_string(ARTICULATED_MJCF);
    const data = new mujoco.MjData(model);
    try {
      mujoco.mj_resetData(model, data);
      expect(() => requireArticulatedFreshResetData(model, data)).not.toThrow();
      data.time = 0.01;
      expect(() => requireArticulatedFreshResetData(model, data)).toThrow("time");
      data.time = 0;
      data.qvel[0] = 0.01;
      expect(() => requireArticulatedFreshResetData(model, data)).toThrow("qvel");
      data.qvel[0] = 0;
      data.qfrc_applied[0] = 1;
      expect(() => requireArticulatedZeroInputs(model, data)).toThrow("qfrc_applied");
      data.qfrc_applied[0] = 0;
      data.xfrc_applied[0] = 1;
      expect(() => requireArticulatedZeroInputs(model, data)).toThrow("xfrc_applied");
      data.xfrc_applied[0] = 0;
      model.opt.disableactuator = 1;
      expect(() => requireArticulatedZeroInputs(model, data)).toThrow("disableactuator");
      model.opt.disableactuator = 0;
      expect(() => requireArticulatedOwnedModel(model, other)).toThrow("ownership");

      const digest = articulatedModelCausalDigest(model, ARTICULATED_MJCF);
      model.body_mass[2] += 0.01;
      expect(() => requireArticulatedRuntimeBoundary(
        mujoco,
        model,
        model,
        data,
        digest,
      )).toThrow("causal digest");
      model.body_mass[2] -= 0.01;
      expect(() => requireArticulatedRuntimeBoundary(
        mujoco,
        other,
        model,
        data,
        digest,
      )).toThrow("ownership");

      for (const callback of ["mjcb_control", "mjcb_passive", "mjcb_act_gain"] as const) {
        const exposed = Object.create(mujoco) as typeof mujoco;
        Object.defineProperty(exposed, callback, { enumerable: true, value: () => undefined });
        expect(() => requireArticulatedRuntimeBoundary(
          exposed,
          model,
          model,
          data,
          digest,
        )).toThrow(callback);
      }
    } finally {
      data.delete();
      other.delete();
      model.delete();
    }
  });

  test("action sequence changes causal trajectory only after its command boundary", async () => {
    const run = async (shoulder: number, runId: `run:${string}`) => {
      const tools = new WorldToolSurface(new RuntimeMvpHost());
      tools.write({ fixtureId: TWO_JOINT_REACH_FIXTURE_ID });
      return tools.run({ runId, program: {
        ...actuatorProgram,
        steps: [actuatorProgram.steps[0], {
          ...actuatorProgram.steps[1],
          commands: [
            { ...actuatorProgram.steps[1].commands[0], valueRadians: shoulder },
            actuatorProgram.steps[1].commands[1],
          ],
        }],
      } });
    };
    const canonical = await run(0.65, "run:causal-canonical");
    const changed = await run(0.55, "run:causal-changed");
    expect(changed.episode.program.id).not.toBe(canonical.episode.program.id);
    for (let index = 0; index < 15; index += 1) {
      expect(changed.episode.samples[index]?.articulated?.joints).toEqual(
        canonical.episode.samples[index]?.articulated?.joints,
      );
    }
    const after = changed.episode.samples.slice(15).some((sample, index) =>
      Math.abs(
        sample.articulated!.joints[0]!.positionRadians -
        canonical.episode.samples[index + 15]!.articulated!.joints[0]!.positionRadians,
      ) > 1e-6);
    expect(after).toBe(true);
  });

  test("Product codec recomputes articulated Program, fixed target and Evaluation", async () => {
    const session = new ProductSession(
      "session:local-codec-articulated",
      createScriptedAgentClientFactory(TWO_JOINT_REACH_FIXTURE_ID),
    );
    const projection = await session.runTurn("reach", () => undefined);
    expect(await decodeProductSessionProjectionTrusted(
      JSON.parse(JSON.stringify(projection)),
      projection.sessionId,
      projection.world,
    )).toEqual(projection);

    const forgedMetric = JSON.parse(JSON.stringify(projection));
    forgedMetric.lastRun.evaluation.metrics.maxPositionErrorMeters += 0.001;
    expect(() => decodeProductSessionProjection(forgedMetric)).toThrow("受信 evaluator");

    const forgedTarget = JSON.parse(JSON.stringify(projection));
    forgedTarget.world.snapshot.entities[2].state.pose.position[0] += 0.1;
    forgedTarget.lastRun.episode.terminalSnapshot.entities[2].state.pose.position[0] += 0.1;
    forgedTarget.lastRun.episode.samples.forEach((sample: { states: Record<string, unknown> }) => {
      (sample.states["entity:target"] as { pose: { position: number[] } }).pose.position[0] += 0.1;
    });
    expect(() => decodeProductSessionProjection(forgedTarget)).toThrow("fixture registry");

    const forgedProgram = JSON.parse(JSON.stringify(projection));
    forgedProgram.lastRun.episode.program.steps[1].commands[0].valueRadians = 0.55;
    expect(() => decodeProductSessionProjection(forgedProgram)).toThrow("canonical Program");
  });

  test("registered reach PASS alone does not advance ref; explicit adopt does", async () => {
    const host = new RuntimeMvpHost();
    host.write(createTwoJointReachSnapshot());
    const expectedRef = host.readRefRecord();
    const program = requireWorldRunInput({ runId: "run:adopt", program: actuatorProgram }).program;
    const { episode } = await host.runCurrent(deepFreeze({ runId: "run:adopt" }), program);
    const evaluation = host.evaluateEpisode(episode.id);
    expect(evaluation.passed).toBe(true);
    expect(host.readRefRecord()).toBe(expectedRef);
    expect(host.adopt(episode.id, evaluation.id, expectedRef)).toMatchObject({
      status: "updated", operation: "adopt", ref: { version: 2 },
    });
  });

  test("adopted terminal qvel is the next run's actual initial state", async () => {
    const host = new RuntimeMvpHost();
    host.write(createTwoJointReachSnapshot());
    const firstRef = host.readRefRecord();
    const program = requireWorldRunInput({ runId: "run:adopt-qvel-1", program: actuatorProgram }).program;
    const first = await host.runCurrent(deepFreeze({ runId: "run:adopt-qvel-1" }), program);
    const evaluation = host.evaluateEpisode(first.episode.id);
    const adopted = host.adopt(first.episode.id, evaluation.id, firstRef);
    if (adopted.status !== "updated") throw new Error("fixture adopt 未更新");
    const terminalJoints = first.episode.terminalSnapshot.entities
      .find((entity) => entity.ref === "entity:arm")?.state.articulated?.joints;
    const second = await host.runCurrent(
      deepFreeze({ runId: "run:adopt-qvel-2" }),
      program,
    );
    expect(second.episode.samples[0]?.articulated?.joints).toEqual(terminalJoints);
  });

  test("trusted Product replay rejects synchronized trajectory and causal-digest forgery", async () => {
    const session = new ProductSession(
      "session:local-codec-causal",
      createScriptedAgentClientFactory(TWO_JOINT_REACH_FIXTURE_ID),
    );
    const projection = await session.runTurn("reach", () => undefined);
    const forgedDigest = JSON.parse(JSON.stringify(projection));
    forgedDigest.lastRun.episode.runtimeEvidence.modelCausalDigest = `sha256:${"0".repeat(64)}`;
    await expect(decodeProductSessionProjectionTrusted(
      forgedDigest,
      projection.sessionId,
      projection.world,
    )).rejects.toThrow("canonical Runtime registry");

    const forgedTrajectory = JSON.parse(JSON.stringify(projection));
    const sample = forgedTrajectory.lastRun.episode.samples[20];
    sample.articulated.joints[0].positionRadians += 0.01;
    sample.states["entity:arm"].articulated.joints[0].positionRadians += 0.01;
    sample.articulated.sensors[0].value += 0.01;
    await expect(decodeProductSessionProjectionTrusted(
      forgedTrajectory,
      projection.sessionId,
      projection.world,
    )).rejects.toThrow("trusted Runtime replay");

    const forgedLineage = JSON.parse(JSON.stringify(projection));
    forgedLineage.world.snapshot.id = "snapshot:attacker-authored";
    forgedLineage.world.ref.snapshotId = "snapshot:attacker-authored";
    forgedLineage.lastRun.baseRef.snapshotId = "snapshot:attacker-authored";
    forgedLineage.lastRun.episode.baseSnapshotId = "snapshot:attacker-authored";
    forgedLineage.lastRun.episode.terminalSnapshot.parentId = "snapshot:attacker-authored";
    await expect(decodeProductSessionProjectionTrusted(
      forgedLineage,
      projection.sessionId,
      projection.world,
    )).rejects.toThrow("authored world authority");
  });
});
