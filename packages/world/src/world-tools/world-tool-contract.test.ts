import { describe, expect, test } from "bun:test";

import { RuntimeMvpHost } from "../host/runtime-mvp-host";
import { FALLING_CUBE_PROGRAM, deepFreeze, isDeepFrozen } from "../kernel/world";
import { WorldToolSurface } from "./world-tool-surface";
import {
  FREE_FALL_BALL_VESSEL_PROGRAM_ID,
  FREE_FALL_RIGID_PROGRAM_ID,
  WORLD_TOOL_CONTRACT,
  requireWorldEditInput,
  requireWorldRunInput,
  requireWorldWriteInput,
} from "./world-tool-contract";

const identityPose = {
  position: { x: 0, y: 0, z: 2.8 },
  rotation: { x: 0, y: 0, z: 0, w: 1 },
} as const;

describe("WORLD_TOOL_CONTRACT", () => {
  test("唯一 contract 冻结三 fixture、两 Program 与 nested object pose", () => {
    expect(isDeepFrozen(WORLD_TOOL_CONTRACT)).toBe(true);
    expect(WORLD_TOOL_CONTRACT.inputBudget).toEqual({
      maxNodes: 128,
      maxDepth: 6,
      maxStringLength: 512,
    });
    expect(WORLD_TOOL_CONTRACT.write.input.properties.fixtureId.enum).toEqual([
      "fixture:primitive-box",
      "fixture:diagnostic-wedge-v1",
      "fixture:ball-vessel-v1",
    ]);
    expect(WORLD_TOOL_CONTRACT.run.input.properties.programId.enum).toEqual([
      "program:free-fall-rigid-v1",
      "program:free-fall-ball-vessel-v1",
    ]);
    expect(FALLING_CUBE_PROGRAM.id).toBe(FREE_FALL_RIGID_PROGRAM_ID);
    expect(WORLD_TOOL_CONTRACT.edit.input.properties.pose).toMatchObject({
      type: "object",
      required: ["position", "rotation"],
      additionalProperties: false,
    });
  });

  test("model input admission 只接受 exact plain-data contract", () => {
    expect(requireWorldWriteInput({ fixtureId: "fixture:primitive-box" })).toEqual({
      fixtureId: "fixture:primitive-box",
    });
    expect(() => requireWorldWriteInput({ cubeHeight: 2 })).toThrow("fixtureId");
    expect(() =>
      requireWorldWriteInput({ fixtureId: "fixture:primitive-box", cubeHeight: 2 }),
    ).toThrow("字段");

    expect(requireWorldRunInput({
      runId: "run:contract-1",
      programId: FREE_FALL_RIGID_PROGRAM_ID,
    })).toEqual({
      runId: "run:contract-1",
      programId: FREE_FALL_RIGID_PROGRAM_ID,
    });
    expect(() => requireWorldRunInput({ runId: "run:legacy" })).toThrow("programId");

    const expected = {
      name: "world:current",
      snapshotId: "snapshot:base",
      version: 1,
    } as const;
    expect(requireWorldEditInput({
      expected,
      targetRef: "entity:cube",
      frameRef: "frame:world",
      pose: identityPose,
    }).pose.position).toEqual([0, 0, 2.8]);
    expect(() => requireWorldEditInput({
      expected,
      targetRef: "entity:cube",
      frameRef: "frame:world",
      pose: { position: [0, 0, 2.8], rotation: [0, 0, 0, 1] },
    })).toThrow("plain JSON data");
  });

  test("现有 falling-rigid vertical slice 迁移到新 contract，legacy surface 消失", async () => {
    const tools = new WorldToolSurface(new RuntimeMvpHost());
    const written = tools.write({ fixtureId: "fixture:primitive-box" });
    const edited = tools.edit({
      expected: written.ref,
      targetRef: "entity:cube",
      frameRef: "frame:world",
      pose: identityPose,
    });
    expect(edited.update.status).toBe("updated");
    expect(edited.update.snapshot.entities.find((entity) => entity.ref === "entity:cube")
      ?.state.pose.position).toEqual([0, 0, 2.8]);

    const run = await tools.run({
      runId: "run:contract-surface",
      programId: FREE_FALL_RIGID_PROGRAM_ID,
    });
    expect(run.evaluation.passed).toBe(true);
    expect(() => tools.write({ cubeHeight: 2 })).toThrow("fixtureId");
  });

  test("diagnostic GLB + 3DGS fixture 保留同一 read → JSON → edit → run 入口", async () => {
    const tools = new WorldToolSurface(new RuntimeMvpHost());
    tools.write({ fixtureId: "fixture:diagnostic-wedge-v1" });
    const read = JSON.parse(JSON.stringify(tools.read())) as ReturnType<WorldToolSurface["read"]>;
    const edited = tools.edit({
      expected: read.ref,
      targetRef: "entity:cube",
      frameRef: "frame:world",
      pose: identityPose,
    });
    const cube = edited.update.snapshot.entities.find(
      (entity) => entity.ref === "entity:cube",
    );
    expect(cube?.representations.visual.kind).toBe("imported-rigid-mesh");
    expect(cube?.representations.observation?.kind).toBe("gaussian-splat");
    expect((await tools.run({
      runId: "run:diagnostic-contract",
      programId: FREE_FALL_RIGID_PROGRAM_ID,
    })).evaluation.passed).toBe(true);
  });

  test("scenario target/Program mismatch 与 floor penetration 在 Runtime 前 fail closed", async () => {
    const tools = new WorldToolSurface(new RuntimeMvpHost());
    const written = tools.write({ fixtureId: "fixture:primitive-box" });
    expect(() => tools.edit({
      expected: written.ref,
      targetRef: "entity:ball",
      frameRef: "frame:world",
      pose: identityPose,
    })).toThrow("scenario 不匹配");
    expect(() => tools.edit({
      expected: written.ref,
      targetRef: "entity:cube",
      frameRef: "frame:world",
      pose: {
        position: { x: 0, y: 0, z: 0 },
        rotation: { x: 0, y: 0, z: 0, w: 1 },
      },
    })).toThrow("穿透 floor");
    await expect(tools.run({
      runId: "run:mismatch",
      programId: FREE_FALL_BALL_VESSEL_PROGRAM_ID,
    })).rejects.toThrow("scenario 不匹配");
  });

  test("ball-vessel 经同一 write/edit contract 到达显式 Host Program run", async () => {
    const host = new RuntimeMvpHost();
    const tools = new WorldToolSurface(host);
    const written = tools.write({ fixtureId: "fixture:ball-vessel-v1" });
    const edited = tools.edit({
      expected: written.ref,
      targetRef: "entity:ball",
      frameRef: "frame:world",
      pose: {
        position: { x: 0.18, y: 0.02, z: 1.2 },
        rotation: { x: 0, y: 0, z: 0, w: 1 },
      },
    });
    expect(edited.update.snapshot.entities.find((entity) => entity.ref === "entity:ball")
      ?.state.pose.position).toEqual([0.18, 0.02, 1.2]);

    const result = await host.runCurrent(
      deepFreeze({ runId: "run:ball-vessel-host" }),
      FREE_FALL_BALL_VESSEL_PROGRAM_ID,
    );
    expect(result.episode.programId).toBe(FREE_FALL_BALL_VESSEL_PROGRAM_ID);
    expect(result.episode.samples).toHaveLength(91);
    expect(result.baseRef).toBe(edited.update.ref);
  });
});
