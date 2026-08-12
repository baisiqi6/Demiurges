import { describe, expect, test } from "bun:test";

import { RuntimeMvpHost } from "./host/runtime-mvp-host";
import { BALL_VESSEL_FIXTURE_ID } from "./artifacts/ball-vessel-fixture";
import { DIAGNOSTIC_RIGID_FIXTURE_ID } from "./artifacts/diagnostic-rigid-fixture";
import { CURRENT_WORLD_REF } from "./kernel/world";
import {
  decodeProductSessionEvent,
  decodeProductSessionProjection,
} from "./product-session-codec";
import { WorldToolSurface } from "./world-tools/world-tool-surface";

async function validProjection() {
  const surface = new WorldToolSurface(new RuntimeMvpHost());
  surface.write({ fixtureId: "fixture:primitive-box" });
  const world = surface.read();
  const lastRun = await surface.run({
    runId: `run:${"x".repeat(60)}`,
    programId: "program:free-fall-rigid-v1",
  });
  return {
    sessionId: "session:local-1",
    world,
    lastRun,
    lastSequence: 6,
    running: false,
  };
}

async function validImportedProjection() {
  const surface = new WorldToolSurface(new RuntimeMvpHost());
  surface.write({
    fixtureId: DIAGNOSTIC_RIGID_FIXTURE_ID,
  });
  return {
    sessionId: "session:local-imported",
    world: surface.read(),
    lastRun: await surface.run({
      runId: "run:imported-codec",
      programId: "program:free-fall-rigid-v1",
    }),
    lastSequence: 5,
    running: false,
  };
}

async function validBallVesselProjection() {
  const surface = new WorldToolSurface(new RuntimeMvpHost());
  surface.write({ fixtureId: BALL_VESSEL_FIXTURE_ID });
  const world = surface.read();
  const lastRun = await surface.run({
    runId: "run:ball-vessel-codec",
    programId: "program:free-fall-ball-vessel-v1",
  });
  return {
    sessionId: "session:local-ball-vessel",
    world,
    lastRun,
    lastSequence: 6,
    running: false,
  };
}

describe("Product Session plain-data codec", () => {
  test("拒绝同 ID 但 predicate/metrics 与受信 evaluator 不一致的 Evaluation", async () => {
    const projection = structuredClone(await validBallVesselProjection());
    const evaluation = projection.lastRun.evaluation;
    if (evaluation.contractId !== "success:stable-inside-vessel") throw new Error();
    evaluation.passed = true;
    evaluation.metrics.supportSamples = 0;
    evaluation.metrics.requiredSupportSamples = 16;
    evaluation.metrics.maxPenetrationMeters = 999;

    expect(() => decodeProductSessionProjection(projection)).toThrow(
      "Evaluation 与受信 evaluator 结果不一致",
    );
  });

  test("只接受 canonical current ref 与 fixture physics", async () => {
    const frictionDrift = structuredClone(await validBallVesselProjection());
    for (const snapshot of [
      frictionDrift.world.snapshot,
      frictionDrift.lastRun.episode.terminalSnapshot,
    ]) {
      const ball = snapshot.entities.find((entity) => entity.ref === "entity:ball");
      if (!ball) throw new Error("fixture 缺少 ball");
      ball.physics.friction = 0.123;
    }
    expect(() => decodeProductSessionProjection(frictionDrift)).toThrow(
      "physics 与 fixture registry 漂移",
    );

    const vesselFrictionDrift = structuredClone(await validBallVesselProjection());
    for (const snapshot of [
      vesselFrictionDrift.world.snapshot,
      vesselFrictionDrift.lastRun.episode.terminalSnapshot,
    ]) {
      const vessel = snapshot.entities.find((entity) => entity.ref === "entity:vessel");
      if (!vessel) throw new Error("fixture 缺少 vessel");
      vessel.physics.friction = 0.01;
    }
    expect(() => decodeProductSessionProjection(vesselFrictionDrift)).toThrow(
      "vessel physics 与 fixture registry 漂移",
    );

    const refAlias = structuredClone(await validBallVesselProjection());
    refAlias.world.ref.name = "world:attacker";
    refAlias.lastRun.baseRef.name = "world:attacker";
    expect(() => decodeProductSessionProjection(refAlias)).toThrow(
      "必须是 world:current",
    );
  });

  test("拒绝 authored 与 terminal 同步漂移的 ball-vessel floor representation", async () => {
    const projection = structuredClone(await validBallVesselProjection());
    for (const snapshot of [
      projection.world.snapshot,
      projection.lastRun.episode.terminalSnapshot,
    ]) {
      const floor = snapshot.entities.find((entity) => entity.ref === "entity:floor");
      if (
        !floor ||
        floor.representations.visual.kind !== "box" ||
        floor.representations.collision.kind !== "box"
      ) throw new Error("fixture 缺少 box floor");
      floor.representations.visual.halfExtents = [30, 30, 0.5];
      floor.representations.collision.halfExtents = [30, 30, 0.5];
    }

    expect(() => decodeProductSessionProjection(projection)).toThrow(
      "fixture registry 漂移",
    );
  });

  test("拒绝 authored 与 terminal 同步漂移的 ball visual color", async () => {
    const projection = structuredClone(await validBallVesselProjection());
    for (const snapshot of [
      projection.world.snapshot,
      projection.lastRun.episode.terminalSnapshot,
    ]) {
      const ball = snapshot.entities.find((entity) => entity.ref === "entity:ball");
      if (!ball || ball.representations.visual.kind !== "sphere") {
        throw new Error("fixture 缺少 sphere ball");
      }
      ball.representations.visual.color = "#000000";
    }

    expect(() => decodeProductSessionProjection(projection)).toThrow(
      "fixture registry 漂移",
    );
  });

  test("拒绝 authored 与 terminal 同步漂移的 falling-rigid floor representation", async () => {
    const projection = structuredClone(await validProjection());
    for (const snapshot of [
      projection.world.snapshot,
      projection.lastRun.episode.terminalSnapshot,
    ]) {
      const floor = snapshot.entities.find((entity) => entity.ref === "entity:floor");
      if (
        !floor ||
        floor.representations.visual.kind !== "box" ||
        floor.representations.collision.kind !== "box"
      ) throw new Error("fixture 缺少 box floor");
      floor.representations.visual.halfExtents = [30, 30, 0.05];
      floor.representations.collision.halfExtents = [30, 30, 0.05];
    }

    expect(() => decodeProductSessionProjection(projection)).toThrow(
      "fixture registry 漂移",
    );
  });

  test("imported visual projection 保留 EntityRef 并拒绝 artifact identity 漂移", async () => {
    const projection = await validImportedProjection();
    const decoded = decodeProductSessionProjection(
      projection,
      "session:local-imported",
    );
    const entity = decoded.world?.snapshot.entities.find(
      (candidate) => candidate.ref === "entity:cube",
    );
    expect(entity?.representations.visual.kind).toBe("imported-rigid-mesh");
    expect(decoded.lastRun?.episode.samples[0]?.states["entity:cube"]).toBeDefined();

    const forged = structuredClone(projection);
    const forgedEntity = forged.world.snapshot.entities.find(
      (candidate) => candidate.ref === "entity:cube",
    );
    if (!forgedEntity || forgedEntity.representations.visual.kind !== "imported-rigid-mesh") {
      throw new Error("fixture 缺少 imported visual");
    }
    forgedEntity.representations.visual.contentDigest = `sha256:${"0".repeat(64)}`;
    expect(() => decodeProductSessionProjection(forged)).toThrow("artifact identity");

    const forgedObservation = structuredClone(projection);
    const observationEntity = forgedObservation.world.snapshot.entities.find(
      (candidate) => candidate.ref === "entity:cube",
    );
    if (!observationEntity?.representations.observation) {
      throw new Error("fixture 缺少 3DGS observation");
    }
    observationEntity.representations.observation.contentDigest = `sha256:${"0".repeat(64)}`;
    expect(() => decodeProductSessionProjection(forgedObservation)).toThrow(
      "3DGS observation",
    );

    const primitiveWithObservation = structuredClone(await validProjection());
    const primitiveCube = primitiveWithObservation.world.snapshot.entities.find(
      (candidate) => candidate.ref === "entity:cube",
    );
    if (!primitiveCube || !observationEntity.representations.observation) {
      throw new Error("fixture 缺少 observation closure evidence");
    }
    primitiveCube.representations.observation = structuredClone(
      observationEntity.representations.observation,
    );
    expect(() => decodeProductSessionProjection(primitiveWithObservation)).toThrow(
      "只允许绑定登记 imported visual",
    );

    const wrongEntityBinding = structuredClone(projection);
    for (const snapshot of [
      wrongEntityBinding.world.snapshot,
      wrongEntityBinding.lastRun.episode.terminalSnapshot,
    ]) {
      const floor = snapshot.entities.find((candidate) => candidate.ref === "entity:floor");
      const cube = snapshot.entities.find((candidate) => candidate.ref === "entity:cube");
      if (!floor || !cube) throw new Error("fixture 缺少 floor/cube");
      const floorRepresentations = floor.representations;
      floor.representations = cube.representations;
      cube.representations = floorRepresentations;
    }
    expect(() => decodeProductSessionProjection(wrongEntityBinding)).toThrow(
      "必须绑定 entity:cube",
    );

    const combinedAlias = JSON.parse(JSON.stringify(projection)) as typeof projection;
    for (const snapshot of [
      combinedAlias.world.snapshot,
      combinedAlias.lastRun.episode.terminalSnapshot,
    ]) {
      const floor = snapshot.entities.find((candidate) => candidate.ref === "entity:floor");
      const cube = snapshot.entities.find((candidate) => candidate.ref === "entity:cube");
      if (!floor || !cube) throw new Error("fixture 缺少 floor/cube");
      const floorRepresentations = floor.representations;
      floor.ref = "entity:cube";
      cube.ref = "entity:floor";
      floor.representations = cube.representations;
      cube.representations = floorRepresentations;
    }
    for (const sample of combinedAlias.lastRun.episode.samples) {
      const floorState = sample.states["entity:floor"];
      const cubeState = sample.states["entity:cube"];
      if (!floorState || !cubeState) throw new Error("fixture 缺少 sample states");
      sample.states["entity:floor"] = cubeState;
      sample.states["entity:cube"] = floorState;
    }
    for (const event of combinedAlias.lastRun.episode.events) {
      event.entities = event.entities.map((ref) =>
        ref === "entity:floor" ? "entity:cube" :
          ref === "entity:cube" ? "entity:floor" : ref,
      );
    }
    expect(() => decodeProductSessionProjection(combinedAlias)).toThrow(
      "registered fixture scenario",
    );
  });

  test("imported run 的 base、samples 与 terminal 必须闭合为同一 EntityRef/representation 证据链", async () => {
    const projection = await validImportedProjection();

    const spoofedSample = structuredClone(projection);
    const firstStates = spoofedSample.lastRun.episode.samples[0]?.states;
    if (!firstStates?.["entity:cube"]) throw new Error("fixture 缺少 cube sample");
    firstStates["entity:spoof"] = firstStates["entity:cube"];
    delete firstStates["entity:cube"];
    expect(() => decodeProductSessionProjection(spoofedSample)).toThrow(
      "EntityRef 证据链",
    );

    const renamedTerminal = JSON.parse(JSON.stringify(projection)) as typeof projection;
    const renamedFloor = renamedTerminal.lastRun.episode.terminalSnapshot.entities.find(
      (entity) => entity.ref === "entity:floor",
    );
    if (!renamedFloor) throw new Error("fixture 缺少 terminal floor");
    renamedFloor.ref = "entity:other";
    expect(() => decodeProductSessionProjection(renamedTerminal)).toThrow("只支持");

    const changedRepresentation = structuredClone(projection);
    const changedTerminalCube = changedRepresentation.lastRun.episode.terminalSnapshot.entities.find(
      (entity) => entity.ref === "entity:cube",
    );
    const terminalFloor = changedRepresentation.lastRun.episode.terminalSnapshot.entities.find(
      (entity) => entity.ref === "entity:floor",
    );
    if (!changedTerminalCube || !terminalFloor) throw new Error("fixture 缺少 terminal entities");
    changedTerminalCube.representations = {
      visual: structuredClone(terminalFloor.representations.visual),
      collision: structuredClone(changedTerminalCube.representations.collision),
      observation: null,
      semantic: null,
    };
    expect(() => decodeProductSessionProjection(changedRepresentation)).toThrow(
      "fixture registry 漂移",
    );

    const driftedBaseRef = structuredClone(projection);
    driftedBaseRef.lastRun.baseRef = {
      ...driftedBaseRef.lastRun.baseRef,
      version: driftedBaseRef.lastRun.baseRef.version + 1,
    };
    expect(() => decodeProductSessionProjection(driftedBaseRef)).toThrow(
      "base ref 证据链",
    );

    const conflictingTerminalIdentity = structuredClone(projection);
    conflictingTerminalIdentity.lastRun.episode.terminalSnapshot.id =
      conflictingTerminalIdentity.world.snapshot.id;
    expect(() => decodeProductSessionProjection(conflictingTerminalIdentity)).toThrow(
      "terminal Snapshot identity",
    );

    const runEvent = {
      sequence: 1,
      sessionId: "session:local-imported",
      turnId: "turn:local-imported:1",
      type: "tool.completed",
      tool: "world_run",
      trace: {
        sequence: 1,
        tool: "world_run",
        input: { runId: "run:imported-codec" },
        status: "succeeded",
        result: { tool: "run" },
      },
      evidence: spoofedSample.lastRun,
    };
    expect(() => decodeProductSessionEvent(
      runEvent,
      "session:local-imported",
      1,
      projection.world,
    )).toThrow("EntityRef 证据链");
  });

  test("接受 producer 合法派生的 bounded identity，并返回独立 frozen projection", async () => {
    const projection = await validProjection();
    expect(projection.lastRun.episode.explicitInputs.runId).toHaveLength(64);
    expect(projection.lastRun.episode.id.length).toBeGreaterThan(64);
    expect(projection.lastRun.evaluation.id.length).toBeGreaterThan(128);

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

    const nonUnitPose = structuredClone(await validImportedProjection());
    const forgedRotation = { x: 0, y: 0, z: 0, w: 2 };
    const authoredCube = nonUnitPose.world.snapshot.entities.find(
      (entity) => entity.ref === "entity:cube",
    );
    const terminalCube = nonUnitPose.lastRun.episode.terminalSnapshot.entities.find(
      (entity) => entity.ref === "entity:cube",
    );
    if (!authoredCube || !terminalCube) throw new Error("fixture 缺少 cube pose");
    authoredCube.state.pose.rotation = forgedRotation;
    terminalCube.state.pose.rotation = forgedRotation;
    for (const sample of nonUnitPose.lastRun.episode.samples) {
      const sampleCube = sample.states["entity:cube"];
      if (!sampleCube) throw new Error("fixture 缺少 cube sample");
      sampleCube.pose.rotation = forgedRotation;
    }
    expect(() => decodeProductSessionProjection(nonUnitPose)).toThrow(
      "必须是单位 quaternion",
    );

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
    const initial = surface.write({ fixtureId: "fixture:primitive-box" });
    const pose = (z: number) => ({
      targetRef: "entity:cube",
      frameRef: "frame:world",
      pose: {
        position: { x: 0, y: 0, z },
        rotation: { x: 0, y: 0, z: 0, w: 1 },
      },
    });
    surface.edit({ expected: initial.ref, ...pose(2.8) });
    const stale = structuredClone(surface.edit({
      expected: {
        name: CURRENT_WORLD_REF,
        snapshotId: initial.ref.snapshotId,
        version: initial.ref.version,
      },
      ...pose(3),
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
