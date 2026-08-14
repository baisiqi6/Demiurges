import { describe, expect, test } from "bun:test";

import {
  MARBLE_HUNYUAN_COMPOSITE_FIXTURE_ID,
  RuntimeMvpHost,
  WorldToolSurface,
  canonicalJsonBytes,
} from "@demiurges/world";
import {
  createPoseDraft,
  poseDraftWorldEditInput,
  updatePoseDraft,
} from "./scene-composer";

describe("DH-015 Presentation-local PoseDraft", () => {
  test("Z-up translation/world-Z yaw produces canonical wire without changing authority", () => {
    const surface = new WorldToolSurface(new RuntimeMvpHost());
    surface.write({ fixtureId: MARBLE_HUNYUAN_COMPOSITE_FIXTURE_ID });
    const world = surface.read();
    const entity = world.snapshot.entities.find((candidate) => candidate.ref === "entity:generated-object")!;
    const before = canonicalJsonBytes(world);
    const draft = updatePoseDraft(
      createPoseDraft(world.ref, entity, "translate"),
      [0.4, -0.2, 1.3],
      Math.PI / 2,
    );

    expect(draft.pose.position).toEqual([0.4, -0.2, 1.3]);
    expect(draft.pose.rotation.x).toBe(0);
    expect(draft.pose.rotation.y).toBe(0);
    expect(draft.pose.rotation.z).toBeCloseTo(Math.SQRT1_2);
    expect(draft.pose.rotation.w).toBeCloseTo(Math.SQRT1_2);
    expect(poseDraftWorldEditInput(draft).change.pose.position).toEqual({ x: 0.4, y: -0.2, z: 1.3 });
    expect(canonicalJsonBytes(world)).toEqual(before);
  });

  test("rejects scale-shaped, sparse, non-finite and out-of-envelope draft mutations", () => {
    const surface = new WorldToolSurface(new RuntimeMvpHost());
    surface.write({ fixtureId: MARBLE_HUNYUAN_COMPOSITE_FIXTURE_ID });
    const world = surface.read();
    const entity = world.snapshot.entities[2]!;
    const draft = createPoseDraft(world.ref, entity, "rotate-z");
    expect(() => updatePoseDraft(draft, [0, 0, Number.NaN], 0)).toThrow();
    expect(() => updatePoseDraft(draft, [5, 0, 1.2], 0)).toThrow();
    expect(() => updatePoseDraft(draft, Array(3) as [number, number, number], 0)).toThrow();
    expect(Object.hasOwn(draft, "scale")).toBe(false);
  });

  test("canonicalizes -0 and the 180 degree hemisphere boundary", () => {
    const surface = new WorldToolSurface(new RuntimeMvpHost());
    surface.write({ fixtureId: MARBLE_HUNYUAN_COMPOSITE_FIXTURE_ID });
    const world = surface.read();
    const draft = updatePoseDraft(
      createPoseDraft(world.ref, world.snapshot.entities[2]!, "rotate-z"),
      [-0, 0, 1.2],
      -Math.PI,
    );
    expect(Object.is(draft.pose.position[0], -0)).toBe(false);
    expect(draft.pose.rotation).toEqual({ x: 0, y: 0, z: 1, w: 0 });
  });
});
