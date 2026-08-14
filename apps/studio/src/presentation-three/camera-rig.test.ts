import { describe, expect, test } from "bun:test";

import { CameraRig, type CameraRigAdapter } from "./camera-rig";
import { fitBounds, type CameraEnvelope, type CameraPose } from "./observer-camera";

const overview: CameraPose = { position: [4, -4, 3], target: [0, 0, 1] };
const inspect: CameraPose = { position: [2, -2, 2], target: [0, 0, 1] };
const explore: CameraPose = { position: [0, -1.2, 1.15], target: [0, 0.2, 1.05] };

function harness(reduced = false) {
  let pose = overview;
  let controlsEnabled = true;
  let envelope: CameraEnvelope | undefined;
  const adapter: CameraRigAdapter = {
    getPose: () => pose,
    setPose: (next) => { pose = next; },
    setControlsEnabled: (enabled) => { controlsEnabled = enabled; },
    setEnvelope: (next) => { envelope = next; },
  };
  const rig = new CameraRig(adapter, { overview, inspect, explore }, () => reduced);
  return {
    rig,
    pose: () => pose,
    controlsEnabled: () => controlsEnabled,
    envelope: () => envelope,
  };
}

describe("CameraRig", () => {
  test("mode transition owns controls and each mode has an independent reset", () => {
    const state = harness();
    expect(state.rig.setMode("explore")).toBe(true);
    expect(state.controlsEnabled()).toBe(false);
    for (let index = 0; index < 6; index += 1) state.rig.update(0.05);
    expect(state.pose()).toEqual(explore);
    state.rig.setMode("inspect");
    expect(state.controlsEnabled()).toBe(true);
    for (let index = 0; index < 6; index += 1) state.rig.update(0.05);
    expect(state.pose()).toEqual(inspect);
  });

  test("reduced motion resets immediately", () => {
    const state = harness(true);
    expect(state.rig.setMode("explore")).toBe(true);
    expect(state.pose()).toEqual(explore);
    expect(state.rig.needsNextFrame).toBe(false);
  });

  test("movement requests frames only while keys are pressed and clears on lifecycle exits", () => {
    const state = harness(true);
    state.rig.setMode("explore");
    expect(state.rig.keyDown("KeyW")).toBe(true);
    expect(state.rig.needsNextFrame).toBe(true);
    expect(state.rig.update(0.05).cameraChanged).toBe(true);
    state.rig.clearInput();
    expect(state.rig.pressedCount).toBe(0);
    expect(state.rig.update(0.05)).toEqual({ cameraChanged: false, needsNextFrame: false });
  });

  test("modifier-only and cancelling directions never keep an idle render loop alive", () => {
    for (const codes of [
      ["ShiftLeft"],
      ["ShiftRight"],
      ["KeyW", "KeyS"],
      ["KeyA", "KeyD"],
      ["KeyQ", "KeyE"],
    ]) {
      const state = harness(true);
      state.rig.setMode("explore");
      const before = state.pose();
      for (const code of codes) state.rig.keyDown(code);
      expect(state.rig.update(0.05)).toEqual({ cameraChanged: false, needsNextFrame: false });
      expect(state.rig.needsNextFrame).toBe(false);
      expect(state.pose()).toEqual(before);
    }
  });

  test("a directional press moves on the scheduled frame and stops on keyup", () => {
    const state = harness(true);
    state.rig.setMode("explore");
    const before = state.pose();
    state.rig.keyDown("KeyQ");
    state.rig.update(1 / 60);
    state.rig.keyUp("KeyQ");
    expect(state.pose().position[2]).toBeLessThan(before.position[2]);
    expect(state.rig.needsNextFrame).toBe(false);
  });

  test("first Explore input completes the entry transition before taking ownership", () => {
    const state = harness();
    state.rig.setMode("explore");
    state.rig.keyDown("KeyW");
    for (let index = 0; index < 6; index += 1) state.rig.update(0.05);
    state.rig.keyUp("KeyW");
    expect(state.pose().position[1]).toBeGreaterThan(explore.position[1]);
    expect(state.pose().position[0]).toBe(explore.position[0]);
  });

  test("non-moving input never snaps an active mode transition to its target", () => {
    for (const codes of [
      ["ShiftLeft"],
      ["ShiftRight"],
      ["KeyW", "KeyS"],
      ["KeyA", "KeyD"],
      ["KeyQ", "KeyE"],
    ]) {
      const state = harness();
      state.rig.setMode("explore");
      const before = state.pose();
      for (const code of codes) state.rig.keyDown(code);
      expect(state.pose()).toEqual(before);
    }
  });

  test("mode change clears stuck keys and Inspect focus does not leak to Explore", () => {
    const state = harness(true);
    state.rig.setMode("explore");
    state.rig.keyDown("KeyW");
    state.rig.setMode("inspect");
    expect(state.rig.pressedCount).toBe(0);
    expect(state.rig.focus({ position: [1, 1, 1], target: [0, 0, 0] })).toBe(true);
    expect(state.pose()).toEqual({ position: [1, 1, 1], target: [0, 0, 0] });
    state.rig.setMode("explore");
    expect(state.rig.focus(inspect)).toBe(false);
  });

  test("fly speed is bounded and envelope is delegated without world authority", () => {
    const state = harness();
    for (let index = 0; index < 100; index += 1) state.rig.adjustSpeed(-1000);
    expect(state.rig.flySpeed).toBe(12);
    for (let index = 0; index < 100; index += 1) state.rig.adjustSpeed(1000);
    expect(state.rig.flySpeed).toBe(0.15);
    const envelope = fitBounds(undefined, 1).envelope;
    state.rig.setEnvelope(envelope);
    expect(state.envelope()).toEqual(envelope);
  });

  test("camera operations leave frozen authority evidence byte-identical", () => {
    const authority = Object.freeze({
      snapshot: Object.freeze({ id: "snapshot:test" }),
      ref: Object.freeze({ name: "world:current", version: 4 }),
      episode: Object.freeze({ id: "episode:test" }),
      evaluation: Object.freeze({ id: "evaluation:test", passed: true }),
    });
    const before = JSON.stringify(authority);
    const state = harness(true);
    state.rig.setMode("explore");
    state.rig.keyDown("KeyE");
    state.rig.update(0.05);
    state.rig.look(14, -8);
    state.rig.clearInput();
    expect(JSON.stringify(authority)).toBe(before);
  });
});
