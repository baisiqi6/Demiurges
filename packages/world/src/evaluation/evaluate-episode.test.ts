import { describe, expect, test } from "bun:test";

import {
  CUBE_REF,
  createInitialSnapshot,
  deepFreeze,
  FALLING_CUBE_PROGRAM,
  LANDING_SUCCESS_CONTRACT,
  MUJOCO_PROFILE,
  isDeepFrozen,
} from "../kernel/world";
import type { Entity, Episode } from "../kernel/types";
import { runFallingCube } from "../runtime-mujoco/run-falling-cube";
import {
  deriveLandingSuccessContract,
  evaluateEpisode,
  LANDING_EVALUATOR_ID,
} from "./evaluate-episode";

describe("episode evaluator", () => {
  test("Success Contract 的 center height 从 terminal collision proxy 推导", async () => {
    const episode = await runFallingCube(
      createInitialSnapshot(2),
      FALLING_CUBE_PROGRAM,
      MUJOCO_PROFILE,
      deepFreeze({ runId: "run:collision-contract" }),
    );
    const contract = deriveLandingSuccessContract(episode);

    expect(contract.targetRef).toBe(CUBE_REF);
    expect(contract.expectedCenterHeight).toBeCloseTo(0.25, 12);
    expect(evaluateEpisode(episode, contract).passed).toBe(true);
    expect(isDeepFrozen(contract)).toBe(true);
  });

  test("EvaluationRecord 是带 evaluator/contract identity 的不可变证据", async () => {
    const episode = await runFallingCube(
      createInitialSnapshot(),
      FALLING_CUBE_PROGRAM,
      MUJOCO_PROFILE,
      deepFreeze({ runId: "run:evaluation-record" }),
    );
    const passed = evaluateEpisode(episode, LANDING_SUCCESS_CONTRACT);
    const changedContract = evaluateEpisode(episode, deepFreeze({
      ...LANDING_SUCCESS_CONTRACT,
      expectedCenterHeight: 0.5,
    }));

    expect(passed.evaluatorId).toBe(LANDING_EVALUATOR_ID);
    expect(passed.id).not.toBe(changedContract.id);
    expect(Object.isFrozen(passed)).toBe(true);
    expect(Object.isFrozen(passed.metrics)).toBe(true);
    expect(() => {
      (passed as unknown as { passed: boolean }).passed = false;
    }).toThrow(TypeError);
    expect(() => {
      (passed.metrics as unknown as { heightError: number }).heightError = 999;
    }).toThrow(TypeError);
  });

  test("finite terminal components 的派生 metric 溢出时 fail closed", async () => {
    const episode = await runFallingCube(
      createInitialSnapshot(),
      FALLING_CUBE_PROGRAM,
      MUJOCO_PROFILE,
      deepFreeze({ runId: "run:evaluation-overflow" }),
    );
    const overflowEpisode = deepFreeze({
      ...episode,
      id: "episode:overflow" as const,
      terminalSnapshot: {
        ...episode.terminalSnapshot,
        id: "snapshot:terminal-overflow" as const,
        entities: episode.terminalSnapshot.entities.map((entity): Entity =>
          entity.ref === CUBE_REF
            ? {
                ...entity,
                state: {
                  ...entity.state,
                  linearVelocity: [Number.MAX_VALUE, Number.MAX_VALUE, Number.MAX_VALUE],
                },
              }
            : entity,
        ),
      },
    }) as Episode;

    expect(() => evaluateEpisode(overflowEpisode, LANDING_SUCCESS_CONTRACT)).toThrow(
      "terminal linear speed 必须是有限数值",
    );
  });

  test("accessor-backed Success Contract 不能让 identity 与 predicate 分裂", async () => {
    const episode = await runFallingCube(
      createInitialSnapshot(),
      FALLING_CUBE_PROGRAM,
      MUJOCO_PROFILE,
      deepFreeze({ runId: "run:evaluation-accessor" }),
    );
    let reads = 0;
    const contract = {
      id: LANDING_SUCCESS_CONTRACT.id,
      targetRef: LANDING_SUCCESS_CONTRACT.targetRef,
      expectedCenterHeight: LANDING_SUCCESS_CONTRACT.expectedCenterHeight,
      maxLinearSpeed: LANDING_SUCCESS_CONTRACT.maxLinearSpeed,
    } as Record<string, unknown>;
    Object.defineProperty(contract, "heightTolerance", {
      enumerable: true,
      get: () => (++reads <= 3 ? 0 : 1),
    });
    Object.freeze(contract);

    expect(() => evaluateEpisode(episode, contract as never)).toThrow("plain data");
  });
});
