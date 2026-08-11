import { describe, expect, test } from "bun:test";

import { RuntimeMvpHost } from "./host/runtime-mvp-host";
import { CURRENT_WORLD_REF } from "./kernel/world";
import {
  decodeProductSessionEvent,
  decodeProductSessionProjection,
} from "./product-session-codec";
import { WorldToolSurface } from "./world-tools/world-tool-surface";

async function validProjection() {
  const surface = new WorldToolSurface(new RuntimeMvpHost());
  surface.write({ cubeHeight: 2 });
  const world = surface.read();
  const lastRun = await surface.run({ runId: `run:${"x".repeat(508)}` });
  return {
    sessionId: "session:local-1",
    world,
    lastRun,
    lastSequence: 6,
    running: false,
  };
}

describe("Product Session plain-data codec", () => {
  test("接受 producer 合法派生的长 identity，并返回独立 frozen projection", async () => {
    const projection = await validProjection();
    expect(projection.lastRun.episode.explicitInputs.runId).toHaveLength(512);
    expect(projection.lastRun.episode.id.length).toBeGreaterThan(256);
    expect(projection.lastRun.evaluation.id.length).toBeGreaterThan(256);

    const decoded = decodeProductSessionProjection(projection, "session:local-1");

    expect(decoded.lastRun?.episode.id).toBe(projection.lastRun.episode.id);
    expect(decoded).not.toBe(projection);
    expect(Object.isFrozen(decoded)).toBe(true);
  });

  test("拒绝 sparse Vec3 与 accessor-backed event，且不读取 getter", async () => {
    const projection = structuredClone(await validProjection());
    const cube = projection.world.snapshot.entities.find(
      (entity) => entity.ref === "entity:cube",
    );
    if (!cube) throw new Error("fixture 缺少 cube");
    cube.state.linearVelocity = new Array(3) as [number, number, number];
    expect(() => decodeProductSessionProjection(projection)).toThrow("dense array");

    let getterReads = 0;
    const event = {
      sequence: 1,
      sessionId: "session:local-1",
      turnId: "turn:local-1:1",
    } as Record<string, unknown>;
    Object.defineProperty(event, "type", {
      enumerable: true,
      get() {
        getterReads += 1;
        return getterReads === 1 ? "turn.started" : "turn.failed";
      },
    });

    expect(() => decodeProductSessionEvent(event, "session:local-1", 1)).toThrow(
      "data descriptor",
    );
    expect(getterReads).toBe(0);
  });

  test("stale_ref 也必须让 ref 与当前 Snapshot identity 一致，edit 只允许 advance", () => {
    const surface = new WorldToolSurface(new RuntimeMvpHost());
    const initial = surface.write({ cubeHeight: 2 });
    surface.edit({ expected: initial.ref, cubeHeight: 2.8 });
    const stale = structuredClone(surface.edit({
      expected: {
        name: CURRENT_WORLD_REF,
        snapshotId: initial.ref.snapshotId,
        version: initial.ref.version,
      },
      cubeHeight: 3,
    }));
    stale.update.snapshot.id = "snapshot:other";

    const event = {
      sequence: 1,
      sessionId: "session:local-1",
      turnId: "turn:local-1:1",
      type: "tool.completed",
      tool: "world_edit",
      trace: {
        sequence: 1,
        tool: "world_edit",
        input: {},
        status: "succeeded",
        result: {},
      },
      evidence: { tool: "edit", update: stale.update },
    };

    expect(() => decodeProductSessionEvent(event, "session:local-1", 1)).toThrow(
      "identity",
    );
    stale.update.snapshot.id = stale.update.ref.snapshotId;
    stale.update.operation = "adopt";
    expect(() => decodeProductSessionEvent(event, "session:local-1", 1)).toThrow(
      "operation",
    );
  });
});
