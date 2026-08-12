import { describe, expect, test } from "bun:test";

import {
  BALL_REF,
  BALL_VESSEL_PROGRAM,
  FALLING_CUBE_PROGRAM,
  MUJOCO_PROFILE,
  createBallVesselSnapshot,
  createFixtureSnapshot,
  createInitialSnapshot,
  deepFreeze,
  type EvaluationRecord,
  type WorldRunResult,
} from "@demiurges/world";
import {
  defaultPresentationMode,
  evaluationMetricRows,
  preferredSelection,
  presentationModeFor,
  runContractSummary,
} from "./presentation-model";

describe("Studio trusted presentation projection", () => {
  test("默认选择来自 Snapshot role，并保留仍存在的用户选择", () => {
    const falling = createInitialSnapshot();
    const vessel = createBallVesselSnapshot();

    expect(preferredSelection(falling)).toBe("entity:cube");
    expect(preferredSelection(vessel)).toBe(BALL_REF);
    expect(preferredSelection(vessel, "entity:vessel")).toBe("entity:vessel");
    expect(preferredSelection(vessel, "entity:stale")).toBe(BALL_REF);
    expect(preferredSelection(undefined, BALL_REF)).toBeUndefined();
  });

  test("没有 Observation 的 Entity 不会进入空白 3DGS mode", () => {
    const vessel = createBallVesselSnapshot();
    const diagnostic = createFixtureSnapshot(2, "fixture:diagnostic-wedge-v1").entities.find(
      (entity) => entity.ref === "entity:cube",
    );
    const ball = vessel.entities.find((entity) => entity.ref === BALL_REF);
    const container = vessel.entities.find((entity) => entity.ref === "entity:vessel");

    expect(presentationModeFor(ball, "3dgs")).toBe("mesh");
    expect(presentationModeFor(container, "3dgs")).toBe("mesh");
    expect(presentationModeFor(container, "overlay")).toBe("overlay");
    expect(defaultPresentationMode(ball)).toBe("mesh");
    expect(defaultPresentationMode(diagnostic)).toBe("3dgs");
  });

  test("两个 closed Evaluation variant 投射为各自的结构化 metrics", () => {
    const landing = deepFreeze({
      id: "evaluation:landing-ui",
      evaluatorId: "evaluator:stable-landing-v1",
      episodeId: "episode:landing-ui",
      contractId: "success:stable-on-floor",
      passed: true,
      metrics: {
        terminalCenterHeight: 0.5,
        heightError: 0.0001,
        terminalLinearSpeed: 0.001,
      },
    }) as EvaluationRecord;
    const containment = deepFreeze({
      id: "evaluation:containment-ui",
      evaluatorId: "evaluator:stable-inside-vessel-v1",
      episodeId: "episode:containment-ui",
      contractId: "success:stable-inside-vessel",
      passed: true,
      metrics: {
        supportSamples: 16,
        requiredSupportSamples: 16,
        maxHorizontalOffsetMeters: 0.12,
        maxLinearSpeedMetersPerSecond: 0.01,
        maxFloorDistanceErrorMeters: 0.001,
        maxPenetrationMeters: 0.0004,
      },
    }) as EvaluationRecord;

    expect(evaluationMetricRows(landing).map((row) => row.key)).toEqual([
      "terminalCenterHeight",
      "heightError",
      "terminalLinearSpeed",
    ]);
    expect(evaluationMetricRows(containment)).toEqual([
      { key: "supportCoverage", label: "support", value: "16/16", unit: "samples" },
      { key: "maxHorizontalOffsetMeters", label: "radial offset", value: 0.12, unit: "m" },
      { key: "maxLinearSpeedMetersPerSecond", label: "max speed", value: 0.01, unit: "m/s" },
      { key: "maxFloorDistanceErrorMeters", label: "floor error", value: 0.001, unit: "m" },
      { key: "maxPenetrationMeters", label: "penetration", value: 0.0004, unit: "m" },
    ]);
  });

  test("Program 与 Runtime 标签来自 lastRun evidence，不来自 UI 常量", () => {
    const falling = {
      episode: {
        programId: FALLING_CUBE_PROGRAM.id,
        runtimeProfileId: MUJOCO_PROFILE.id,
      },
    } as WorldRunResult;
    const vessel = {
      episode: {
        programId: BALL_VESSEL_PROGRAM.id,
        runtimeProfileId: MUJOCO_PROFILE.id,
      },
    } as WorldRunResult;

    expect(runContractSummary(falling)).toEqual({
      programId: FALLING_CUBE_PROGRAM.id,
      runtimeProfileId: MUJOCO_PROFILE.id,
    });
    expect(runContractSummary(vessel)).toEqual({
      programId: BALL_VESSEL_PROGRAM.id,
      runtimeProfileId: MUJOCO_PROFILE.id,
    });
    expect(runContractSummary(undefined)).toEqual({
      programId: "—",
      runtimeProfileId: "—",
    });
  });
});
