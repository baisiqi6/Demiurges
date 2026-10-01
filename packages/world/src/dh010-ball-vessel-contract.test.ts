import { describe, expect, test } from "bun:test";

import { createFixtureSnapshot } from "./artifacts/diagnostic-rigid-fixture";
import { evaluateEpisode } from "./evaluation/evaluate-episode";
import { ADOPT_RUNTIME_MVP_POLICY } from "./host/runtime-mvp-adopt-policy";
import {
  ADOPT_STABLE_INSIDE_VESSEL_POLICY,
  RUNTIME_MVP_ADOPT_POLICY_REGISTRY,
} from "./host/runtime-mvp-adopt-policy";
import type {
  AdoptPolicy,
  Entity,
  Episode,
  Snapshot,
} from "./kernel/types";
import {
  MUJOCO_PROFILE,
  BALL_VESSEL_PROGRAM,
  createInitialSnapshot,
  deepFreeze,
} from "./kernel/world";
import { decodeProductSessionProjection } from "./product-session-codec";
import { createWorldRepositoryAuthority } from "./repository/world-repository";
import {
  createFallingCubeMjcf,
  runFallingCube,
} from "./runtime-mujoco/run-falling-cube";
import { RuntimeMvpHost } from "./host/runtime-mvp-host";
import { WorldToolSurface } from "./world-tools/world-tool-surface";
import { BALL_VESSEL_FIXTURE_ID } from "./world-tools/world-tool-contract";

const BALL_REF = "entity:ball" as const;
const VESSEL_REF = "entity:vessel" as const;
const RIM_FRAME_REF = "frame:vessel-rim-center" as const;
const IDENTITY_POSE = deepFreeze({
  position: [0, 0, 0] as const,
  rotation: { x: 0, y: 0, z: 0, w: 1 },
});

const STABLE_INSIDE_CONTRACT = deepFreeze({
  id: "success:stable-inside-vessel",
  targetRef: BALL_REF,
  containerRef: VESSEL_REF,
  rimFrameRef: RIM_FRAME_REF,
  settleWindowSeconds: 0.5,
  maxHorizontalOffsetMeters: 0.29,
  maxFloorDistanceErrorMeters: 0.005,
  maxLinearSpeedMetersPerSecond: 0.02,
  maxPenetrationMeters: 0.005,
});

function proposedBallVesselSnapshot(): Snapshot {
  const floor = createInitialSnapshot().entities[0]!;
  const vessel = {
    ref: VESSEL_REF,
    label: "Vessel",
    frameRef: "frame:world",
    unitSystemRef: "units:si",
    state: {
      pose: IDENTITY_POSE,
      linearVelocity: [0, 0, 0],
      angularVelocity: [0, 0, 0],
    },
    representations: {
      visual: {
        kind: "imported-rigid-mesh",
        assetId: "asset:vessel-v1",
        contentDigest: `sha256:${"0".repeat(64)}`,
        sourceFrameRef: "frame:gltf-y-up",
        sourceUnitMeters: 1,
        localTransform: {
          position: [0, 0, 0],
          rotation: { x: Math.SQRT1_2, y: 0, z: 0, w: Math.SQRT1_2 },
          scale: [1, 1, 1],
        },
      },
      collision: {
        kind: "compound",
        parts: [
          {
            partKey: "base",
            localPose: IDENTITY_POSE,
            shape: { kind: "box", halfExtents: [0.5, 0.5, 0.04] },
          },
          {
            partKey: "wall-00",
            localPose: {
              position: [0.45, 0, 0.325],
              rotation: { x: 0, y: 0, z: 0, w: 1 },
            },
            shape: { kind: "box", halfExtents: [0.05, 0.16, 0.325] },
          },
        ],
      },
      observation: null,
      semantic: {
        kind: "vessel",
        rimFrame: { ref: RIM_FRAME_REF, localPose: IDENTITY_POSE },
        innerEnvelope: {
          radiusMeters: 0.4,
          innerFloorZMeters: 0.08,
          rimZMeters: 0.65,
        },
      },
    },
    physics: { bodyType: "static", massKg: 0, friction: 0.8 },
  } as unknown as Entity;
  const ball = {
    ref: BALL_REF,
    label: "Ball",
    frameRef: "frame:world",
    unitSystemRef: "units:si",
    state: {
      pose: {
        position: [0.1, 0, 1.25],
        rotation: { x: 0, y: 0, z: 0, w: 1 },
      },
      linearVelocity: [0.15, 0, 0],
      angularVelocity: [0, 0, 0],
    },
    representations: {
      visual: { kind: "sphere", radius: 0.1, color: "#d8a657" },
      collision: { kind: "sphere", radius: 0.1 },
      observation: null,
      semantic: null,
    },
    physics: { bodyType: "dynamic", massKg: 0.2, friction: 0.8 },
  } as unknown as Entity;

  return deepFreeze({
    schemaVersion: 1,
    id: "snapshot:base-ball-vessel",
    parentId: null,
    source: "write",
    scenarioId: "scenario:ball-vessel-free-fall-v1",
    entities: [floor, vessel, ball],
  }) as Snapshot;
}

function canonicalBallVesselSnapshot(): Snapshot {
  return createFixtureSnapshot(2, BALL_VESSEL_FIXTURE_ID as never);
}

function closedProxySnapshot(): Snapshot {
  const closedProxy = structuredClone(canonicalBallVesselSnapshot()) as any;
  const vessel = closedProxy.entities.find((entity: Entity) => entity.ref === VESSEL_REF);
  if (!vessel) throw new Error("fixture 缺少 vessel");
  vessel.representations.collision.parts.push({
    partKey: "test-only-top-lid",
    localPose: {
      position: [0, 0, 0.65],
      rotation: { x: 0, y: 0, z: 0, w: 1 },
    },
    shape: { kind: "box", halfExtents: [0.5, 0.5, 0.02] },
  });
  return deepFreeze(closedProxy) as Snapshot;
}

function proposedCompletedEpisode(): Episode {
  const base = proposedBallVesselSnapshot();
  const settledBallState = deepFreeze({
    ...base.entities.find((entity) => entity.ref === BALL_REF)!.state,
    pose: {
      position: [0.1, 0, 0.18] as const,
      rotation: { x: 0, y: 0, z: 0, w: 1 },
    },
    linearVelocity: [0, 0, 0] as const,
  });
  const samples = Array.from({ length: 91 }, (_, index) => {
    const settled = index >= 75;
    return {
      timeSeconds: index / 30,
      states: Object.fromEntries(
        base.entities.map((entity) => [
          entity.ref,
          entity.ref === BALL_REF && settled ? settledBallState : entity.state,
        ]),
      ),
      contactCount: settled ? 1 : 0,
      contacts: settled
        ? [{
            targetRef: BALL_REF,
            otherRef: VESSEL_REF,
            normalOnTargetWorld: [0, 0, 1],
            penetrationMeters: 0.001,
          }]
        : [],
    };
  });
  const terminalSnapshot = deepFreeze({
    ...base,
    id: "snapshot:terminal-ball-vessel",
    parentId: base.id,
    source: "runtime-terminal" as const,
    entities: base.entities.map((entity) => entity.ref === BALL_REF
      ? { ...entity, state: settledBallState }
      : entity),
  }) as Snapshot;
  return deepFreeze({
    id: "episode:ball-vessel-contract",
    baseSnapshotId: base.id,
    scenarioId: base.scenarioId,
    program: BALL_VESSEL_PROGRAM,
    runtimeProfileId: MUJOCO_PROFILE.id,
    explicitInputs: { runId: "run:ball-vessel-contract" },
    completion: "completed",
    samples,
    events: [{
      type: "contact-began",
      timeSeconds: 1.2,
      entities: [BALL_REF, VESSEL_REF],
    }],
    terminalSnapshot,
    runtimeEvidence: {
      provider: MUJOCO_PROFILE.provider,
      version: MUJOCO_PROFILE.version,
      modelFormat: "MJCF",
    },
  }) as Episode;
}

describe("DH-010 ball-vessel RED contract", () => {
  test("fixture registry 产生 floor + one vessel Entity + ball，而非方块替身", () => {
    const snapshot = createFixtureSnapshot(
      2,
      BALL_VESSEL_FIXTURE_ID as never,
    );
    expect(snapshot.entities.map((entity) => entity.ref)).toEqual([
      "entity:floor",
      VESSEL_REF,
      BALL_REF,
    ]);
    const vessel = snapshot.entities.find((entity) => entity.ref === VESSEL_REF) as any;
    expect(vessel?.representations.collision.kind).toBe("compound");
    expect(vessel?.representations.collision.parts).toHaveLength(17);
    expect(vessel?.representations.semantic.rimFrame.ref).toBe(RIM_FRAME_REF);
    expect(snapshot.entities.find((entity) => entity.ref === BALL_REF)
      ?.representations.visual.kind).toBe("sphere");
  });

  test("Kernel/Repository 必须拒绝 duplicate compound partKey，而不是只做 deepFreeze", () => {
    const malformed = structuredClone(proposedBallVesselSnapshot()) as any;
    const vessel = malformed.entities.find((entity: Entity) => entity.ref === VESSEL_REF);
    if (!vessel) throw new Error("fixture 缺少 vessel");
    vessel.representations.collision.parts[1].partKey = "base";
    expect(() => new RuntimeMvpHost().write(deepFreeze(malformed))).toThrow(
      "partKey",
    );
  });

  test("MuJoCo Runtime 接受显式 ball Program 并闭合 multi-entity samples", async () => {
    const episode = await runFallingCube(
      canonicalBallVesselSnapshot(),
      BALL_VESSEL_PROGRAM,
      MUJOCO_PROFILE,
      deepFreeze({ runId: "run:ball-vessel-runtime" }),
    );
    expect(episode.completion).toBe("completed");
    expect(episode.program.id).toBe(BALL_VESSEL_PROGRAM.id);
    expect(episode.samples).toHaveLength(91);
    expect(episode.samples[0]!.timeSeconds).toBe(0);
    expect(episode.samples.at(-1)!.timeSeconds).toBe(3);
    expect(Object.keys(episode.samples[0]!.states).sort()).toEqual([
      BALL_REF,
      "entity:floor",
      VESSEL_REF,
    ]);
    expect((episode.samples.at(-1) as any).contacts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ targetRef: BALL_REF, otherRef: VESSEL_REF }),
      ]),
    );
    const contacts = (episode.samples.at(-1) as any).contacts as any[];
    for (const contact of contacts) {
      expect(Object.keys(contact).sort()).toEqual([
        "normalOnTargetWorld",
        "otherRef",
        "penetrationMeters",
        "targetRef",
      ]);
      expect(contact.normalOnTargetWorld).toHaveLength(3);
      expect(Math.hypot(...contact.normalOnTargetWorld)).toBeCloseTo(1, 6);
      expect(Number.isFinite(contact.penetrationMeters)).toBe(true);
      expect(contact.penetrationMeters).toBeGreaterThanOrEqual(0);
    }
    expect(contacts.some((contact) =>
      contact.otherRef === VESSEL_REF && contact.normalOnTargetWorld[2] >= 0.5,
    )).toBe(true);
  });

  test("MuJoCo compiler 为单一 vessel Entity 生成 exact base + 16 wall geoms", () => {
    const xml = createFallingCubeMjcf(
      canonicalBallVesselSnapshot(),
      BALL_VESSEL_PROGRAM,
      MUJOCO_PROFILE,
    );
    expect(xml).toContain('<mujoco model="demiurges-ball-vessel">');
    expect(xml).toContain('<body name="vessel"');
    expect(xml).toContain('<body name="ball"');
    expect(xml.match(/name="vessel_(?:base|wall-[0-9]{2})"/g)).toHaveLength(17);
    expect(xml).toContain('name="ball_geom" type="sphere" size="0.1"');

    const missingWall = structuredClone(canonicalBallVesselSnapshot()) as any;
    const vessel = missingWall.entities.find((entity: Entity) => entity.ref === VESSEL_REF);
    if (!vessel) throw new Error("fixture 缺少 vessel");
    vessel.representations.collision.parts.splice(8, 1);
    expect(() => createFallingCubeMjcf(
      deepFreeze(missingWall) as Snapshot,
      BALL_VESSEL_PROGRAM,
      MUJOCO_PROFILE,
    )).toThrow(/17|registry|compound/);
  });

  test("wall-sensitive trajectory 产生由 vessel owner 折叠的水平 contact normal", async () => {
    const wallSensitive = structuredClone(canonicalBallVesselSnapshot()) as any;
    wallSensitive.id = "snapshot:wall-sensitive-ball-vessel";
    const ball = wallSensitive.entities.find((entity: Entity) => entity.ref === BALL_REF);
    if (!ball) throw new Error("fixture 缺少 ball");
    ball.state.pose.position = [0.27, 0, 1.1];
    ball.state.linearVelocity = [0.25, 0, 0];

    const episode = await runFallingCube(
      deepFreeze(wallSensitive) as Snapshot,
      BALL_VESSEL_PROGRAM,
      MUJOCO_PROFILE,
      deepFreeze({ runId: "run:wall-sensitive-ball-vessel" }),
    );
    const contacts = episode.samples.flatMap((sample) => (sample as any).contacts ?? []);
    expect(contacts.some((contact: any) =>
      contact.otherRef === VESSEL_REF &&
      Math.hypot(contact.normalOnTargetWorld[0], contact.normalOnTargetWorld[1]) >= 0.8,
    )).toBe(true);
  });

  test("closed proxy 只经 Runtime-direct seam 仍产生 completed Episode", async () => {
    expect(() => new RuntimeMvpHost().write(closedProxySnapshot())).toThrow(
      "Runtime-direct",
    );
    const episode = await runFallingCube(
      closedProxySnapshot(),
      BALL_VESSEL_PROGRAM,
      MUJOCO_PROFILE,
      deepFreeze({ runId: "run:closed-proxy-runtime" }),
    );
    expect(episode.completion).toBe("completed");
    expect(episode.samples).toHaveLength(91);
    expect((episode.samples.at(-1) as any).contacts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ targetRef: BALL_REF, otherRef: VESSEL_REF }),
      ]),
    );
    expect(episode.samples.at(-1)!.states[BALL_REF]!.pose.position[2]).toBeGreaterThan(0.65);
  });

  test("containment Evaluation 使用 0.5s/16 samples 与 semantic support 证据", () => {
    const episode = proposedCompletedEpisode();
    const evaluation = evaluateEpisode(episode, STABLE_INSIDE_CONTRACT as never) as any;
    expect(evaluation.contractId).toBe("success:stable-inside-vessel");
    expect(evaluation.metrics.supportSamples).toBe(16);
    expect(evaluation.metrics.requiredSupportSamples).toBe(16);
    expect(evaluation.passed).toBe(true);
  });

  test("hovering、sidewall-only 与 transient support 都明确 FAIL", () => {
    const hovering = structuredClone(proposedCompletedEpisode()) as any;
    for (const sample of hovering.samples.slice(-16)) {
      sample.states[BALL_REF].pose.position = [0.1, 0, 0.35];
      sample.contacts = [];
      sample.contactCount = 0;
    }
    const sidewallOnly = structuredClone(proposedCompletedEpisode()) as any;
    for (const sample of sidewallOnly.samples.slice(-16)) {
      sample.contacts[0].normalOnTargetWorld = [1, 0, 0];
    }
    const transient = structuredClone(proposedCompletedEpisode()) as any;
    for (const sample of transient.samples.slice(-16, -1)) {
      sample.contacts = [];
      sample.contactCount = 0;
    }

    const bounceApex = structuredClone(proposedCompletedEpisode()) as any;
    for (const sample of bounceApex.samples.slice(-16, -1)) {
      sample.states[BALL_REF].linearVelocity = [0, 0, 0.08];
    }

    for (const episode of [hovering, sidewallOnly, transient, bounceApex]) {
      const evaluation = evaluateEpisode(
        deepFreeze(episode) as Episode,
        STABLE_INSIDE_CONTRACT as never,
      );
      expect(evaluation.passed).toBe(false);
    }
  });

  test("duplicate/gapped tail timestamp 与 penetration 超界 fail closed", () => {
    const gapped = structuredClone(proposedCompletedEpisode()) as any;
    gapped.samples[80].timeSeconds += 1 / 60;
    expect(() => evaluateEpisode(
      deepFreeze(gapped) as Episode,
      STABLE_INSIDE_CONTRACT as never,
    )).toThrow("timestamp");

    const duplicate = structuredClone(proposedCompletedEpisode()) as any;
    duplicate.samples[80].timeSeconds = duplicate.samples[79].timeSeconds;
    expect(() => evaluateEpisode(
      deepFreeze(duplicate) as Episode,
      STABLE_INSIDE_CONTRACT as never,
    )).toThrow("timestamp");

    const penetrated = structuredClone(proposedCompletedEpisode()) as any;
    for (const sample of penetrated.samples.slice(-16)) {
      sample.contacts[0].penetrationMeters = 0.006;
    }
    expect(evaluateEpisode(
      deepFreeze(penetrated) as Episode,
      STABLE_INSIDE_CONTRACT as never,
    ).passed).toBe(false);
  });

  test("semantic contact 只接受 exact EntityRef pair、dense unit normal 与 non-negative penetration", () => {
    const cases: Array<[string, (contact: any) => void]> = [
      ["字段", (contact) => { contact.partKey = "base"; }],
      ["EntityRef", (contact) => { contact.otherRef = "geom:vessel-base"; }],
      ["单位向量", (contact) => { contact.normalOnTargetWorld = [0, 0, 2]; }],
      ["dense", (contact) => { contact.normalOnTargetWorld = new Array(3); }],
      ["不能为负数", (contact) => { contact.penetrationMeters = -0.001; }],
    ];
    for (const [message, mutate] of cases) {
      const malformed = structuredClone(proposedCompletedEpisode()) as any;
      mutate(malformed.samples.at(-1).contacts[0]);
      expect(() => evaluateEpisode(
        deepFreeze(malformed) as Episode,
        STABLE_INSIDE_CONTRACT as never,
      )).toThrow(message);
    }
  });

  test("closed proxy 必须先完成同一 Runtime run，再由 containment Evaluation 判 FAIL", async () => {
    const episode = await runFallingCube(
      closedProxySnapshot(),
      BALL_VESSEL_PROGRAM,
      MUJOCO_PROFILE,
      deepFreeze({ runId: "run:closed-proxy-negative" }),
    );
    expect(episode.completion).toBe("completed");
    expect(evaluateEpisode(episode, STABLE_INSIDE_CONTRACT as never).passed).toBe(false);
  });

  test("AdoptPolicy 必须来自 Host closed registry，Repository 不接纳调用方单 policy 注入", () => {
    const ballPolicy = deepFreeze({
      ...ADOPT_RUNTIME_MVP_POLICY,
      id: "adopt-policy:stable-inside-vessel-v1",
      evaluatorId: "evaluator:stable-inside-vessel-v1",
      contractId: "success:stable-inside-vessel",
    }) as unknown as AdoptPolicy;
    expect(() => createWorldRepositoryAuthority(ballPolicy)).toThrow("registry");
    expect(RUNTIME_MVP_ADOPT_POLICY_REGISTRY).toEqual(expect.arrayContaining([
      expect.objectContaining({ policy: ADOPT_RUNTIME_MVP_POLICY }),
      expect.objectContaining({
        scenarioId: "scenario:ball-vessel-free-fall-v1",
        programKind: "free-fall",
        policy: ADOPT_STABLE_INSIDE_VESSEL_POLICY,
      }),
    ]));
    expect(Object.isFrozen(RUNTIME_MVP_ADOPT_POLICY_REGISTRY)).toBe(true);
  });

  test("Host 为 ball-vessel Program 选择登记 evaluator/policy，只有 PASS 才能 adopt", async () => {
    const host = new RuntimeMvpHost();
    host.write(canonicalBallVesselSnapshot());
    const expected = host.readRefRecord();
    const { episode } = await host.runCurrent(
      deepFreeze({ runId: "run:ball-vessel-host-policy" }),
      BALL_VESSEL_PROGRAM,
    );
    const evaluation = host.evaluateEpisode(episode.id);
    expect(evaluation).toMatchObject({
      evaluatorId: "evaluator:stable-inside-vessel-v1",
      contractId: "success:stable-inside-vessel",
      passed: true,
    });
    expect(host.readRefRecord()).toEqual(expected);
    expect(host.adopt(episode.id, evaluation.id, expected)).toMatchObject({
      status: "updated",
      operation: "adopt",
    });
  });

  test("Product codec 接纳 exact floor/vessel/ball carrier 与 sample contact evidence", async () => {
    const surface = new WorldToolSurface(new RuntimeMvpHost());
    surface.write({ fixtureId: BALL_VESSEL_FIXTURE_ID });
    const current = surface.read();
    const currentRun = await surface.run({
      runId: "run:codec-ball-vessel",
      program: { kind: "free-fall", targetRef: "entity:ball", durationSeconds: 3, sampleRateHz: 30 },
    });
    const projection = {
      sessionId: "session:local-ball-vessel-red",
      world: current,
      lastRun: currentRun,
      lastSequence: 6,
      running: false,
    };

    const decoded = decodeProductSessionProjection(
      projection,
      "session:local-ball-vessel-red",
    );
    expect(decoded.world?.snapshot.entities.map((entity) => entity.ref)).toEqual([
      "entity:floor",
      VESSEL_REF,
      BALL_REF,
    ]);
    expect((decoded.lastRun?.episode.samples.at(-1) as any).contacts.length)
      .toBeGreaterThan(0);

    const jsonRoundTrip = JSON.parse(JSON.stringify(projection));
    expect(() => decodeProductSessionProjection(
      jsonRoundTrip,
      "session:local-ball-vessel-red",
    )).not.toThrow();

    const internalPartLeak = structuredClone(projection) as any;
    internalPartLeak.lastRun.episode.samples.at(-1).contacts[0].partKey = "base";
    expect(() => decodeProductSessionProjection(
      internalPartLeak,
      "session:local-ball-vessel-red",
    )).toThrow("字段");

    const wrongContactPair = structuredClone(projection) as any;
    wrongContactPair.lastRun.episode.samples.at(-1).contacts[0].otherRef = "entity:foreign";
    expect(() => decodeProductSessionProjection(
      wrongContactPair,
      "session:local-ball-vessel-red",
    )).toThrow("pair");
    // floor 接触是合法 FAIL 证据，但不能用它冒充 vessel 支撑并保留原 PASS Evaluation。
    const falseSupport = structuredClone(projection) as any;
    falseSupport.lastRun.episode.samples.at(-1).contacts[0].otherRef = "entity:floor";
    expect(() => decodeProductSessionProjection(falseSupport, "session:local-ball-vessel-red")).toThrow("Evaluation");

    const timestampDrift = structuredClone(projection) as any;
    timestampDrift.lastRun.episode.samples[80].timeSeconds += 1 / 60;
    expect(() => decodeProductSessionProjection(
      timestampDrift,
      "session:local-ball-vessel-red",
    )).toThrow("sample grid");

    const evaluationAlias = structuredClone(projection) as any;
    evaluationAlias.lastRun.evaluation.contractId = "success:stable-on-floor";
    evaluationAlias.lastRun.evaluation.evaluatorId = "evaluator:stable-landing-v1";
    evaluationAlias.lastRun.evaluation.metrics = {
      terminalCenterHeight: 0.18,
      heightError: 0,
      terminalLinearSpeed: 0,
    };
    expect(() => decodeProductSessionProjection(
      evaluationAlias,
      "session:local-ball-vessel-red",
    )).toThrow("Program/Evaluation");
  });
});
