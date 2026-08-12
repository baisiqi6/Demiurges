import { describe, expect, test } from "bun:test";

import { evaluateEpisode } from "../evaluation/evaluate-episode";
import {
  DIAGNOSTIC_RIGID_ASSET,
  DIAGNOSTIC_RIGID_FIXTURE_ID,
  createFixtureSnapshot,
} from "../artifacts/diagnostic-rigid-fixture";
import {
  DIAGNOSTIC_GAUSSIAN_SPLAT_ASSET,
  createDiagnosticGaussianSplatObservation,
} from "../artifacts/diagnostic-gaussian-splat";
import { ADOPT_RUNTIME_MVP_POLICY } from "../host/runtime-mvp-adopt-policy";
import {
  VESSEL_REF,
  createBallVesselSnapshot,
} from "../artifacts/ball-vessel-fixture";
import {
  BALL_VESSEL_PROGRAM,
  CUBE_REF,
  createInitialSnapshot,
  deepFreeze,
  FALLING_CUBE_PROGRAM,
  FLOOR_REF,
  LANDING_SUCCESS_CONTRACT,
  MUJOCO_PROFILE,
} from "../kernel/world";
import type { Entity, ExplicitInputs, RuntimeProfile, Snapshot, WorldProgram } from "../kernel/types";
import { createWorldRepositoryAuthority } from "../repository/world-repository";
import { createFallingCubeMjcf, runFallingCube } from "./run-falling-cube";

function explicitInputs(runId: ExplicitInputs["runId"]): ExplicitInputs {
  return deepFreeze({ runId }) as ExplicitInputs;
}

describe("MuJoCo falling-cube Runtime", () => {
  test("Runtime 在编译前拒绝 registered falling-rigid floor 与 ball-vessel physics identity 漂移", () => {
    const drifted = structuredClone(createInitialSnapshot());
    const floor = drifted.entities.find((entity) => entity.ref === FLOOR_REF)!;
    if (floor.representations.collision.kind !== "box") {
      throw new Error("fixture floor 必须是 box collision");
    }
    floor.representations.collision.halfExtents = [9.9, 9.9, 0.05];
    const frozen = deepFreeze(drifted) as Snapshot;

    expect(() => createFallingCubeMjcf(
      frozen,
      FALLING_CUBE_PROGRAM,
      MUJOCO_PROFILE,
    )).toThrow("fixture registry 漂移");

    const ballVesselDrift = structuredClone(createBallVesselSnapshot());
    ballVesselDrift.entities.find((entity) => entity.ref === VESSEL_REF)!.physics.friction = 0.01;
    expect(() => createFallingCubeMjcf(
      deepFreeze(ballVesselDrift) as Snapshot,
      BALL_VESSEL_PROGRAM,
      MUJOCO_PROFILE,
    )).toThrow("vessel physics 与 fixture registry 漂移");
  });

  test("imported visual 不进入 MJCF，collision proxy 与 EntityRef 驱动同一 Episode", async () => {
    const snapshot = createFixtureSnapshot(2.4, DIAGNOSTIC_RIGID_FIXTURE_ID);
    const xml = createFallingCubeMjcf(snapshot, FALLING_CUBE_PROGRAM, MUJOCO_PROFILE);

    expect(xml).toContain('body name="cube" pos="0 0 2.4"');
    expect(xml).toContain('geom name="cube_geom" type="box" size="0.32 0.22 0.25"');
    expect(xml).not.toContain(DIAGNOSTIC_RIGID_ASSET.assetId);
    expect(xml).not.toContain(DIAGNOSTIC_RIGID_ASSET.repoPath);
    expect(xml).not.toContain(DIAGNOSTIC_GAUSSIAN_SPLAT_ASSET.assetId);
    expect(xml).not.toContain(DIAGNOSTIC_GAUSSIAN_SPLAT_ASSET.repoPath);

    const episode = await runFallingCube(
      snapshot,
      FALLING_CUBE_PROGRAM,
      MUJOCO_PROFILE,
      explicitInputs("run:imported-rigid"),
    );
    expect(episode.samples[0]?.states[CUBE_REF]?.pose.position[2]).toBeCloseTo(2.4, 12);
    expect(episode.terminalSnapshot.entities.find((entity) => entity.ref === CUBE_REF)
      ?.representations.visual).toBe(snapshot.entities.find((entity) => entity.ref === CUBE_REF)
      ?.representations.visual);
    expect(episode.terminalSnapshot.entities.find((entity) => entity.ref === CUBE_REF)
      ?.representations.observation).toBe(snapshot.entities.find((entity) => entity.ref === CUBE_REF)
      ?.representations.observation);
    expect(evaluateEpisode(episode, LANDING_SUCCESS_CONTRACT).passed).toBe(true);
  });

  test("3DGS observation 不改变 MuJoCo trajectory 或 landing metrics", async () => {
    const withObservation = createFixtureSnapshot(2.4, DIAGNOSTIC_RIGID_FIXTURE_ID);
    const withoutObservation = deepFreeze({
      ...withObservation,
      id: "snapshot:base-diagnostic-wedge-no-observation" as const,
      entities: withObservation.entities.map((entity): Entity =>
        entity.ref === CUBE_REF
          ? {
              ...entity,
              representations: { ...entity.representations, observation: null },
            }
          : entity,
      ),
    }) as Snapshot;
    const left = await runFallingCube(
      withObservation,
      FALLING_CUBE_PROGRAM,
      MUJOCO_PROFILE,
      explicitInputs("run:observation-present"),
    );
    const right = await runFallingCube(
      withoutObservation,
      FALLING_CUBE_PROGRAM,
      MUJOCO_PROFILE,
      explicitInputs("run:observation-absent"),
    );

    expect(left.samples.map((sample) => ({
      timeSeconds: sample.timeSeconds,
      state: sample.states[CUBE_REF],
      contactCount: sample.contactCount,
    }))).toEqual(right.samples.map((sample) => ({
      timeSeconds: sample.timeSeconds,
      state: sample.states[CUBE_REF],
      contactCount: sample.contactCount,
    })));
    expect(evaluateEpisode(left, LANDING_SUCCESS_CONTRACT).metrics).toEqual(
      evaluateEpisode(right, LANDING_SUCCESS_CONTRACT).metrics,
    );
  });

  test("imported artifact identity 与 alignment transform 在 Runtime admission fail closed", () => {
    const base = createFixtureSnapshot(2.4, DIAGNOSTIC_RIGID_FIXTURE_ID);
    const forgedDigest = deepFreeze({
      ...base,
      id: "snapshot:forged-imported-digest" as const,
      entities: base.entities.map((entity): Entity => {
        if (entity.ref !== CUBE_REF || entity.representations.visual.kind !== "imported-rigid-mesh") {
          return entity;
        }
        return {
          ...entity,
          representations: {
            ...entity.representations,
            visual: {
              ...entity.representations.visual,
              contentDigest: `sha256:${"0".repeat(64)}`,
            },
          },
        };
      }),
    }) as Snapshot;
    expect(() =>
      createFallingCubeMjcf(forgedDigest, FALLING_CUBE_PROGRAM, MUJOCO_PROFILE),
    ).toThrow("artifact identity");

    const forgedScale = deepFreeze({
      ...base,
      id: "snapshot:forged-imported-scale" as const,
      entities: base.entities.map((entity): Entity => {
        if (entity.ref !== CUBE_REF || entity.representations.visual.kind !== "imported-rigid-mesh") {
          return entity;
        }
        return {
          ...entity,
          representations: {
            ...entity.representations,
            visual: {
              ...entity.representations.visual,
              localTransform: {
                ...entity.representations.visual.localTransform,
                scale: [1, 2, 1],
              },
            },
          },
        };
      }),
    }) as Snapshot;
    expect(() =>
      createFallingCubeMjcf(forgedScale, FALLING_CUBE_PROGRAM, MUJOCO_PROFILE),
    ).toThrow("alignment transform");

    const forgedCollision = deepFreeze({
      ...base,
      id: "snapshot:forged-imported-collision" as const,
      entities: base.entities.map((entity): Entity =>
        entity.ref === CUBE_REF
          ? {
              ...entity,
              representations: {
                ...entity.representations,
                collision: { kind: "box", halfExtents: [1, 1, 1] },
              },
            }
          : entity,
      ),
    }) as Snapshot;
    expect(() =>
      createFallingCubeMjcf(forgedCollision, FALLING_CUBE_PROGRAM, MUJOCO_PROFILE),
    ).toThrow("登记 proxy");

    const primitive = createInitialSnapshot(2.4);
    const primitiveWithObservation = deepFreeze({
      ...primitive,
      id: "snapshot:primitive-with-observation" as const,
      entities: primitive.entities.map((entity): Entity =>
        entity.ref === CUBE_REF
          ? {
              ...entity,
              representations: {
                ...entity.representations,
                observation: createDiagnosticGaussianSplatObservation(),
              },
            }
          : entity,
      ),
    }) as Snapshot;
    expect(() =>
      createFallingCubeMjcf(
        primitiveWithObservation,
        FALLING_CUBE_PROGRAM,
        MUJOCO_PROFILE,
      ),
    ).toThrow("fixture registry 漂移");

    const wrongEntityBinding = deepFreeze({
      ...base,
      id: "snapshot:observation-on-floor" as const,
      entities: base.entities.map((entity): Entity => {
        const counterpart = base.entities.find((candidate) =>
          candidate.ref === (entity.ref === CUBE_REF ? FLOOR_REF : CUBE_REF),
        );
        if (!counterpart) throw new Error("fixture 缺少 counterpart");
        return { ...entity, representations: counterpart.representations };
      }),
    }) as Snapshot;
    expect(() =>
      createFallingCubeMjcf(
        wrongEntityBinding,
        FALLING_CUBE_PROGRAM,
        MUJOCO_PROFILE,
      ),
    ).toThrow("fixture registry 漂移");
  });

  test("由 Snapshot 编译 MJCF，并保留显式单位和 collision representation", () => {
    const xml = createFallingCubeMjcf(
      createInitialSnapshot(2.8),
      FALLING_CUBE_PROGRAM,
      MUJOCO_PROFILE,
    );

    expect(xml).toContain('timestep="0.004166666666666667"');
    expect(xml).toContain('gravity="0 0 -9.81"');
    expect(xml).toContain('body name="cube" pos="0 0 2.8"');
    expect(xml).toContain('geom name="cube_geom" type="box" size="0.25 0.25 0.25"');
  });

  test("真实 MuJoCo 推演产生 Episode，record 不推进 ref，adopt 才推进", async () => {
    const authority = createWorldRepositoryAuthority();
    const repository = authority.repository;
    const base = repository.write(createInitialSnapshot());
    const rootRef = repository.readRefRecord();
    const edited = repository.editCubeHeight(base.id, 2.8);
    expect(repository.advance(edited.id, rootRef).status).toBe("updated");
    const refBeforeRun = repository.readRefRecord();

    const episode = await runFallingCube(
      edited,
      FALLING_CUBE_PROGRAM,
      MUJOCO_PROFILE,
      explicitInputs("run:test"),
    );

    expect(episode.samples.length).toBeGreaterThan(60);
    expect(episode.samples[0]?.states[CUBE_REF]?.pose.position[2]).toBeCloseTo(2.8, 6);
    expect(episode.events.some((event) => event.type === "contact-began")).toBe(true);
    expect(episode.runtimeEvidence).toEqual({
      provider: "MuJoCo WASM",
      version: "3.11.0",
      modelFormat: "MJCF",
    });
    expect(episode.terminalSnapshot.parentId).toBe(edited.id);

    authority.evidence.recordEpisode(episode);
    expect(repository.readRefRecord()).toBe(refBeforeRun);

    const evaluation = evaluateEpisode(episode, LANDING_SUCCESS_CONTRACT);
    authority.evidence.recordEvaluation(evaluation);
    expect(evaluation.passed).toBe(true);
    expect(evaluation.metrics.terminalCenterHeight).toBeCloseTo(0.25, 2);
    expect(
      evaluateEpisode(
        episode,
        deepFreeze({
          ...LANDING_SUCCESS_CONTRACT,
          expectedCenterHeight: 0.5,
        }),
      ).passed,
    ).toBe(false);

    repository.adopt(
      episode.id,
      evaluation.id,
      ADOPT_RUNTIME_MVP_POLICY.id,
      refBeforeRun,
    );
    expect(repository.readRef().id).toBe(episode.terminalSnapshot.id);
  });

  test("Snapshot 的完整受支持初态进入 MuJoCo，包含 floor rotation 与 cube velocity", async () => {
    const base = createInitialSnapshot(2.8);
    const snapshot = deepFreeze({
      ...base,
      id: "snapshot:stateful" as const,
      entities: base.entities.map((entity): Entity => {
        if (entity.ref === FLOOR_REF) {
          return {
            ...entity,
            state: {
              ...entity.state,
              pose: {
                ...entity.state.pose,
                rotation: { x: 0, y: 0, z: Math.SQRT1_2, w: Math.SQRT1_2 },
              },
            },
          };
        }
        return {
          ...entity,
          state: {
            ...entity.state,
            pose: {
              ...entity.state.pose,
              rotation: { x: 0, y: 0, z: Math.SQRT1_2, w: Math.SQRT1_2 },
            },
            linearVelocity: [0, 0, -2],
            angularVelocity: [0.1, 0.2, 0.3],
          },
        };
      }),
    }) as Snapshot;

    const xml = createFallingCubeMjcf(snapshot, FALLING_CUBE_PROGRAM, MUJOCO_PROFILE);
    expect(xml).toContain(
      `name="floor" type="box" pos="0 0 -0.05" quat="${Math.SQRT1_2} 0 0 ${Math.SQRT1_2}"`,
    );

    const episode = await runFallingCube(
      snapshot,
      FALLING_CUBE_PROGRAM,
      MUJOCO_PROFILE,
      explicitInputs("run:stateful"),
    );
    expect(episode.samples[0]?.states[CUBE_REF]?.linearVelocity).toEqual([0, 0, -2]);
    episode.samples[0]?.states[CUBE_REF]?.angularVelocity.forEach((value, index) => {
      expect(value).toBeCloseTo([0.1, 0.2, 0.3][index]!, 12);
    });
    const evolvedRotation = episode.samples[1]?.states[CUBE_REF]?.pose.rotation;
    expect(evolvedRotation?.x).toBeCloseTo(0.0035355109904797585, 12);
    expect(evolvedRotation?.y).toBeCloseTo(0.0011785036634932523, 12);
    expect(evolvedRotation?.z).toBeCloseTo(0.7106285429230621, 12);
    expect(evolvedRotation?.w).toBeCloseTo(0.7035575209421028, 12);
  });

  test("固定 240 Hz / 30 Hz 使用整数 physics-step 采样网格", async () => {
    const episode = await runFallingCube(
      createInitialSnapshot(),
      FALLING_CUBE_PROGRAM,
      MUJOCO_PROFILE,
      explicitInputs("run:sample-grid"),
    );

    expect(episode.samples).toHaveLength(76);
    episode.samples.forEach((sample, index) => {
      expect(sample.timeSeconds).toBeCloseTo(index / 30, 12);
    });
  });

  test("malformed program、伪造 profile 与不受支持的 frame 均 fail closed", async () => {
    await expect(
      runFallingCube(
        createInitialSnapshot(),
        { ...FALLING_CUBE_PROGRAM, durationSeconds: -1 },
        MUJOCO_PROFILE,
        explicitInputs("run:negative-duration"),
      ),
    ).rejects.toThrow("durationSeconds");

    await expect(
      runFallingCube(
        createInitialSnapshot(),
        FALLING_CUBE_PROGRAM,
        { ...MUJOCO_PROFILE, id: "runtime:fake", provider: "Fake Runtime", version: "999" },
        explicitInputs("run:fake-profile"),
      ),
    ).rejects.toThrow("RuntimeProfile");

    const base = createInitialSnapshot();
    const wrongFrame = deepFreeze({
      ...base,
      id: "snapshot:wrong-frame" as const,
      entities: base.entities.map((entity) =>
        entity.ref === CUBE_REF ? { ...entity, frameRef: "frame:other" } : entity,
      ),
    }) as unknown as Snapshot;
    await expect(
      runFallingCube(
        wrongFrame,
        FALLING_CUBE_PROGRAM,
        MUJOCO_PROFILE,
        explicitInputs("run:wrong-frame"),
      ),
    ).rejects.toThrow("frame:world");
  });

  test("固定 Program/Profile identity 覆盖完整执行语义", async () => {
    const wrongProgram = deepFreeze({
      ...FALLING_CUBE_PROGRAM,
      id: "program:other",
    }) as unknown as WorldProgram;
    await expect(
      runFallingCube(
        createInitialSnapshot(),
        wrongProgram,
        MUJOCO_PROFILE,
        explicitInputs("run:wrong-program-id"),
      ),
    ).rejects.toThrow("WorldProgram");

    const changedDuration = deepFreeze({
      ...FALLING_CUBE_PROGRAM,
      durationSeconds: 1,
    }) as WorldProgram;
    await expect(
      runFallingCube(
        createInitialSnapshot(),
        changedDuration,
        MUJOCO_PROFILE,
        explicitInputs("run:changed-duration"),
      ),
    ).rejects.toThrow("WorldProgram");

    const changedGravity = deepFreeze({
      ...MUJOCO_PROFILE,
      gravity: [0, 0, 9.81],
    }) as RuntimeProfile;
    await expect(
      runFallingCube(
        createInitialSnapshot(),
        FALLING_CUBE_PROGRAM,
        changedGravity,
        explicitInputs("run:changed-gravity"),
      ),
    ).rejects.toThrow("RuntimeProfile");
  });

  test("所有 Runtime inputs 必须在 await 前递归冻结", async () => {
    const shallowSnapshot = Object.freeze(
      structuredClone(createInitialSnapshot()),
    ) as Snapshot;
    await expect(
      runFallingCube(
        shallowSnapshot,
        FALLING_CUBE_PROGRAM,
        MUJOCO_PROFILE,
        explicitInputs("run:shallow-snapshot"),
      ),
    ).rejects.toThrow("递归冻结");

    await expect(
      runFallingCube(
        createInitialSnapshot(),
        FALLING_CUBE_PROGRAM,
        MUJOCO_PROFILE,
        { runId: "run:mutable-inputs" },
      ),
    ).rejects.toThrow("ExplicitInputs");
  });

  test("当前 Runtime 只接受完整参与演化的 floor + cube 世界", async () => {
    const base = createInitialSnapshot();
    const movingFloor = deepFreeze({
      ...base,
      id: "snapshot:moving-floor" as const,
      entities: base.entities.map((entity): Entity =>
        entity.ref === FLOOR_REF
          ? {
              ...entity,
              state: { ...entity.state, linearVelocity: [1, 0, 0] },
            }
          : entity,
      ),
    }) as Snapshot;
    await expect(
      runFallingCube(
        movingFloor,
        FALLING_CUBE_PROGRAM,
        MUJOCO_PROFILE,
        explicitInputs("run:moving-floor"),
      ),
    ).rejects.toThrow("静态地面");

    const massiveFloor = deepFreeze({
      ...base,
      id: "snapshot:massive-floor" as const,
      entities: base.entities.map((entity): Entity =>
        entity.ref === FLOOR_REF
          ? { ...entity, physics: { ...entity.physics, massKg: 999 } }
          : entity,
      ),
    }) as Snapshot;
    await expect(
      runFallingCube(
        massiveFloor,
        FALLING_CUBE_PROGRAM,
        MUJOCO_PROFILE,
        explicitInputs("run:massive-floor"),
      ),
    ).rejects.toThrow("fixture registry 漂移");

    const cube = base.entities.find((entity) => entity.ref === CUBE_REF)!;
    const extraEntity = deepFreeze({
      ...base,
      id: "snapshot:extra-entity" as const,
      entities: [
        ...base.entities,
        {
          ...cube,
          ref: "entity:extra" as const,
          state: { ...cube.state, linearVelocity: [0, 0, -1] },
        },
      ],
    }) as Snapshot;
    await expect(
      runFallingCube(
        extraEntity,
        FALLING_CUBE_PROGRAM,
        MUJOCO_PROFILE,
        explicitInputs("run:extra-entity"),
      ),
    ).rejects.toThrow("registered fixture scenario");
  });

  test("contact event 时间对应 mj_forward 后的当前 MuJoCo state", async () => {
    const episode = await runFallingCube(
      createInitialSnapshot(),
      FALLING_CUBE_PROGRAM,
      MUJOCO_PROFILE,
      explicitInputs("run:contact-time"),
    );
    const contact = episode.events.find((event) => event.type === "contact-began");

    expect(contact?.timeSeconds).toBeCloseTo(143 / 240, 12);
  });

  test("sparse Vec3 不能绕过 finite validation", async () => {
    const base = createInitialSnapshot();
    const sparseVelocity = new Array<number>(3);
    const snapshot = deepFreeze({
      ...base,
      id: "snapshot:sparse-velocity" as const,
      entities: base.entities.map((entity): Entity =>
        entity.ref === CUBE_REF
          ? {
              ...entity,
              state: {
                ...entity.state,
                linearVelocity: sparseVelocity as unknown as Entity["state"]["linearVelocity"],
              },
            }
          : entity,
      ),
    }) as Snapshot;

    await expect(
      runFallingCube(
        snapshot,
        FALLING_CUBE_PROGRAM,
        MUJOCO_PROFILE,
        explicitInputs("run:sparse-velocity"),
      ),
    ).rejects.toThrow("dense Vec3");
  });

  test("accessor-backed Vec3 不是可跨 await 信任的 plain immutable data", async () => {
    let firstComponent = 0;
    const accessorVelocity = new Array<number>(3);
    Object.defineProperty(accessorVelocity, 0, {
      enumerable: true,
      get: () => firstComponent,
    });
    accessorVelocity[1] = 0;
    accessorVelocity[2] = 0;
    Object.freeze(accessorVelocity);

    const base = createInitialSnapshot();
    const snapshot = deepFreeze({
      ...base,
      id: "snapshot:accessor-velocity" as const,
      entities: base.entities.map((entity): Entity =>
        entity.ref === CUBE_REF
          ? {
              ...entity,
              state: {
                ...entity.state,
                linearVelocity:
                  accessorVelocity as unknown as Entity["state"]["linearVelocity"],
              },
            }
          : entity,
      ),
    }) as Snapshot;

    const run = runFallingCube(
      snapshot,
      FALLING_CUBE_PROGRAM,
      MUJOCO_PROFILE,
      explicitInputs("run:accessor-velocity"),
    );
    firstComponent = Number.NaN;

    await expect(run).rejects.toThrow("plain data");
  });

  test("派生 evidence identity 同时绑定 run 与 base Snapshot", async () => {
    const firstBase = deepFreeze({
      ...createInitialSnapshot(),
      id: "snapshot:identity-a" as const,
    }) as Snapshot;
    const secondSeed = createInitialSnapshot();
    const secondBase = deepFreeze({
      ...secondSeed,
      id: "snapshot:identity-b" as const,
      entities: secondSeed.entities.map((entity): Entity =>
        entity.ref === CUBE_REF
          ? { ...entity, state: { ...entity.state, linearVelocity: [0, 0, 20] } }
          : entity,
      ),
    }) as Snapshot;
    const inputs = explicitInputs("run:identity-collision");

    const first = await runFallingCube(
      firstBase,
      FALLING_CUBE_PROGRAM,
      MUJOCO_PROFILE,
      inputs,
    );
    const second = await runFallingCube(
      secondBase,
      FALLING_CUBE_PROGRAM,
      MUJOCO_PROFILE,
      inputs,
    );
    const firstEvaluation = evaluateEpisode(first, LANDING_SUCCESS_CONTRACT);
    const secondEvaluation = evaluateEpisode(second, LANDING_SUCCESS_CONTRACT);

    expect(first.id).not.toBe(second.id);
    expect(first.terminalSnapshot.id).not.toBe(second.terminalSnapshot.id);
    expect(firstEvaluation.id).not.toBe(secondEvaluation.id);
    expect(firstEvaluation.passed).not.toBe(secondEvaluation.passed);
  });

  test("派生 identity 的 run/base segment 编码无歧义", async () => {
    const firstBase = deepFreeze({
      ...createInitialSnapshot(2),
      id: "snapshot:c" as const,
    }) as Snapshot;
    const secondBase = deepFreeze({
      ...createInitialSnapshot(3),
      id: "snapshot:b--c" as const,
    }) as Snapshot;

    const first = await runFallingCube(
      firstBase,
      FALLING_CUBE_PROGRAM,
      MUJOCO_PROFILE,
      explicitInputs("run:a--b"),
    );
    const second = await runFallingCube(
      secondBase,
      FALLING_CUBE_PROGRAM,
      MUJOCO_PROFILE,
      explicitInputs("run:a"),
    );

    expect(first.id).not.toBe(second.id);
    expect(first.terminalSnapshot.id).not.toBe(second.terminalSnapshot.id);
  });
});
