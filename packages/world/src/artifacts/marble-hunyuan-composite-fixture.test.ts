import { describe, expect, test } from "bun:test";

import type {
  Episode,
  EvaluationRecord,
  Snapshot,
  WorldReadResult,
  WorldRunResult,
} from "../kernel/types";
import { deepFreeze, MUJOCO_PROFILE } from "../kernel/world";
import { MARBLE_HUNYUAN_COMPOSITE_PROGRAM } from "../kernel/world";
import { requireRegisteredSnapshotIdentity } from "./diagnostic-rigid-fixture";
import {
  ENVIRONMENT_REF,
  FLOOR_PROXY,
  GENERATED_OBJECT_PROXY,
  GENERATED_OBJECT_REF,
  MARBLE_HUNYUAN_COMPOSITE_FIXTURE_ID,
  MARBLE_HUNYUAN_COMPOSITE_SCENARIO_ID,
  createMarbleHunyuanCompositeSnapshot,
} from "./marble-hunyuan-composite-fixture";
import { MARBLE_HUNYUAN_MANIFEST_DIGEST } from "./marble-hunyuan-registry";
import { createWorldRepositoryAuthority } from "../repository/world-repository";
import {
  createFallingCubeMjcf,
  runFallingCube,
} from "../runtime-mujoco/run-falling-cube";
import {
  deriveLandingSuccessContract,
  evaluateEpisode,
} from "../evaluation/evaluate-episode";
import { RuntimeMvpHost } from "../host/runtime-mvp-host";
import { WorldToolSurface } from "../world-tools/world-tool-surface";
import {
  decodeProductSessionEvent,
  decodeProductSessionProjection,
  decodeProductSessionProjectionTrusted,
} from "../product-session-codec";

const SESSION_ID = "session:local-composite";
const FLOOR_REF = "entity:floor" as const;

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

type Path = readonly (string | number)[];

function tamperNumeric<T>(value: T, path: Path): T {
  const copy = clone(value);
  let node: unknown = copy;
  for (const segment of path.slice(0, -1)) {
    node = (node as Record<string | number, unknown>)[segment];
  }
  const holder = node as Record<string | number, unknown>;
  holder[path.at(-1)!] = (holder[path.at(-1)!] as number) + 0.001;
  return copy;
}

function tamperString<T>(value: T, path: Path, replacement: string): T {
  const copy = clone(value);
  let node: unknown = copy;
  for (const segment of path.slice(0, -1)) {
    node = (node as Record<string | number, unknown>)[segment];
  }
  (node as Record<string | number, unknown>)[path.at(-1)!] = replacement;
  return copy;
}

interface SeamProbe {
  readonly seam: string;
  readonly run: () => Promise<void>;
}

interface CompositeCase {
  readonly name: string;
  readonly probes: readonly SeamProbe[];
}

function repositoryProbe(seam: string, snapshot: Snapshot): SeamProbe {
  return {
    seam,
    run: async () => {
      const authority = createWorldRepositoryAuthority();
      expect(() => authority.repository.write(snapshot)).toThrow();
    },
  };
}

function runtimeProbe(snapshot: Snapshot): SeamProbe {
  return {
    seam: "runtime",
    run: async () => {
      expect(() =>
        createFallingCubeMjcf(snapshot, MARBLE_HUNYUAN_COMPOSITE_PROGRAM, MUJOCO_PROFILE),
      ).toThrow();
    },
  };
}

function projection(value: {
  world: WorldReadResult;
  lastRun?: WorldRunResult | null;
}): Record<string, unknown> {
  return {
    sessionId: SESSION_ID,
    world: value.world,
    lastRun: value.lastRun ?? null,
    lastSequence: 1,
    running: false,
  };
}

function codecProbe(
  seam: string,
  world: WorldReadResult,
  expectedSessionId = SESSION_ID,
): SeamProbe {
  return {
    seam,
    run: async () => {
      expect(() =>
        decodeProductSessionProjection(projection({ world }), expectedSessionId),
      ).toThrow();
    },
  };
}

function streamProbe(world: WorldReadResult): SeamProbe {
  return {
    seam: "stream",
    run: async () => {
      await expect(
        decodeProductSessionProjectionTrusted(projection({ world }), SESSION_ID),
      ).rejects.toThrow();
    },
  };
}

async function compositeRun(): Promise<{
  read: WorldReadResult;
  run: WorldRunResult;
}> {
  const surface = new WorldToolSurface(new RuntimeMvpHost());
  surface.write({ fixtureId: MARBLE_HUNYUAN_COMPOSITE_FIXTURE_ID });
  const read = surface.read();
  const { id: _programId, ...programContent } = MARBLE_HUNYUAN_COMPOSITE_PROGRAM;
  const run = await surface.run({
    runId: "run:composite-closure",
    program: programContent,
  });
  return { read, run };
}

const snapshotCases = (
  family: string,
  tamper: (snapshot: Snapshot) => Snapshot,
): CompositeCase[] => [
  {
    name: family,
    probes: [
      (() => {
        const tampered = tamper(createMarbleHunyuanCompositeSnapshot());
        return repositoryProbe("repository", tampered);
      })(),
      (() => {
        const tampered = tamper(createMarbleHunyuanCompositeSnapshot());
        return runtimeProbe(tampered);
      })(),
      (() => {
        const read = new WorldToolSurface(new RuntimeMvpHost());
        read.write({ fixtureId: MARBLE_HUNYUAN_COMPOSITE_FIXTURE_ID });
        const world = read.read();
        return codecProbe("codec", {
          tool: "read",
          ref: world.ref,
          snapshot: tamper(world.snapshot),
        });
      })(),
      (() => {
        const read = new WorldToolSurface(new RuntimeMvpHost());
        read.write({ fixtureId: MARBLE_HUNYUAN_COMPOSITE_FIXTURE_ID });
        const world = read.read();
        return streamProbe({
          tool: "read",
          ref: world.ref,
          snapshot: tamper(world.snapshot),
        });
      })(),
    ],
  },
];

const relabelCases: CompositeCase[] = (
  [
    "scenario:primitive-box-free-fall-v1",
    "scenario:diagnostic-rigid-free-fall-v1",
    "scenario:ball-vessel-free-fall-v1",
    "scenario:two-joint-planar-reach-v1",
  ] as const
).map((scenarioId) => ({
  name: `scenarioId → ${scenarioId}`,
  probes: snapshotCases(
    `composite-scenario-relabel :: ${scenarioId}`,
    (snapshot) => tamperString(snapshot, ["scenarioId"], scenarioId),
  )[0]!.probes,
}));

const duplicateRefCases: CompositeCase[] = [
  { path: [1, "ref"], replacement: ENVIRONMENT_REF, label: "floor.ref → entity:environment" },
  { path: [2, "ref"], replacement: FLOOR_REF, label: "generated.ref → entity:floor" },
  { path: [0, "ref"], replacement: GENERATED_OBJECT_REF, label: "environment.ref → entity:generated-object" },
].map(({ path, replacement, label }) => ({
  name: label,
  probes: snapshotCases(
    `composite-duplicate-ref :: ${label}`,
    (snapshot) => tamperString(snapshot, ["entities", ...path], replacement),
  )[0]!.probes,
}));

const environmentRepresentationCases: CompositeCase[] = (
  [
    { label: "observation.assetId", path: ["representations", "observation", "assetId"], replacement: "asset:tampered" },
    { label: "observation.manifestDigest", path: ["representations", "observation", "manifestDigest"], replacement: `sha256:${"0".repeat(64)}` },
    { label: "observation.calibrationId", path: ["representations", "observation", "calibrationId"], replacement: "calibration:tampered-v1" },
    { label: "observation.witnessId", path: ["representations", "observation", "witnessId"], replacement: "witness:tampered-v1" },
    { label: "visual.assetId", path: ["representations", "visual", "assetId"], replacement: "asset:tampered" },
    { label: "visual.manifestDigest", path: ["representations", "visual", "manifestDigest"], replacement: `sha256:${"0".repeat(64)}` },
    { label: "visual.calibrationId", path: ["representations", "visual", "calibrationId"], replacement: "calibration:tampered-v1" },
    { label: "visual.witnessId", path: ["representations", "visual", "witnessId"], replacement: "witness:tampered-v1" },
  ] as const
).map(({ label, path, replacement }) => ({
  name: label,
  probes: snapshotCases(
    `composite-environment-representation :: ${label}`,
    (snapshot) => tamperString(snapshot, ["entities", 0, ...path], replacement),
  )[0]!.probes,
}));

const floorRepresentationCases: CompositeCase[] = [
  {
    name: "semantic.witnessId → witness:tampered-v1",
    probes: snapshotCases(
      "composite-floor-representation :: witnessId",
      (snapshot) =>
        tamperString(snapshot, ["entities", 1, "representations", "semantic", "witnessId"], "witness:tampered-v1"),
    )[0]!.probes,
  },
  {
    name: "collision.halfExtents[0] + 0.001",
    probes: snapshotCases(
      "composite-floor-representation :: collision.halfExtents[0]",
      (snapshot) =>
        tamperNumeric(snapshot, ["entities", 1, "representations", "collision", "halfExtents", 0]),
    )[0]!.probes,
  },
];

const generatedRepresentationCases: CompositeCase[] = (
  [
    { label: "visual.assetId", path: ["representations", "visual", "assetId"], replacement: "asset:tampered" },
    { label: "visual.manifestDigest", path: ["representations", "visual", "manifestDigest"], replacement: `sha256:${"0".repeat(64)}` },
    { label: "visual.calibrationId", path: ["representations", "visual", "calibrationId"], replacement: "calibration:tampered-v1" },
    { label: "visual.witnessId", path: ["representations", "visual", "witnessId"], replacement: "witness:tampered-v1" },
  ] as const
).map(({ label, path, replacement }) => ({
  name: label,
  probes: snapshotCases(
    `composite-generated-representation :: ${label}`,
    (snapshot) => tamperString(snapshot, ["entities", 2, ...path], replacement),
  )[0]!.probes,
}));
generatedRepresentationCases.push({
  name: "collision.halfExtents[0] + 0.001",
  probes: snapshotCases(
    "composite-generated-representation :: collision.halfExtents[0]",
    (snapshot) =>
      tamperNumeric(snapshot, ["entities", 2, "representations", "collision", "halfExtents", 0]),
  )[0]!.probes,
});

const authoredLineageCases: CompositeCase[] = [
  {
    name: "base.parentId → snapshot:foreign",
    probes: [
      (() => {
        const tampered = tamperString(
          createMarbleHunyuanCompositeSnapshot(),
          ["parentId"],
          "snapshot:foreign",
        );
        return repositoryProbe("repository", tampered);
      })(),
      (() => {
        const tampered = tamperString(
          createMarbleHunyuanCompositeSnapshot(),
          ["parentId"],
          "snapshot:foreign",
        );
        return runtimeProbe(tampered);
      })(),
      (() => {
        const read = new WorldToolSurface(new RuntimeMvpHost());
        read.write({ fixtureId: MARBLE_HUNYUAN_COMPOSITE_FIXTURE_ID });
        const world = read.read();
        return codecProbe("codec", {
          tool: "read",
          ref: world.ref,
          snapshot: tamperString(world.snapshot, ["parentId"], "snapshot:foreign"),
        });
      })(),
      (() => {
        const read = new WorldToolSurface(new RuntimeMvpHost());
        read.write({ fixtureId: MARBLE_HUNYUAN_COMPOSITE_FIXTURE_ID });
        const world = read.read();
        return streamProbe({
          tool: "read",
          ref: world.ref,
          snapshot: tamperString(world.snapshot, ["parentId"], "snapshot:foreign"),
        });
      })(),
    ],
  },
  {
    name: "edit.parentId → snapshot:foreign",
    probes: [
      (() => {
        const tamperedEdit = deepFreeze({
          ...createMarbleHunyuanCompositeSnapshot(),
          id: "snapshot:edit-foreign",
          parentId: "snapshot:foreign",
          source: "edit",
        }) as Snapshot;
        return {
          seam: "repository",
          run: async () => {
            const authority = createWorldRepositoryAuthority();
            expect(() => authority.repository.write(tamperedEdit)).toThrow();
          },
        };
      })(),
      (() => {
        const read = new WorldToolSurface(new RuntimeMvpHost());
        read.write({ fixtureId: MARBLE_HUNYUAN_COMPOSITE_FIXTURE_ID });
        const world = read.read();
        const tamperedEdit = deepFreeze({
          ...clone(world.snapshot),
          id: "snapshot:edit-foreign",
          parentId: "snapshot:foreign",
          source: "edit",
        }) as Snapshot;
        return {
          seam: "codec",
          run: async () => {
            const event = {
              sequence: 1,
              sessionId: SESSION_ID,
              turnId: `turn:${SESSION_ID.slice("session:".length)}:1`,
              type: "tool.completed",
              tool: "world_edit",
              trace: { sequence: 1, tool: "world_edit", input: {}, status: "succeeded" },
              evidence: {
                tool: "edit",
                update: {
                  status: "updated",
                  operation: "advance",
                  ref: {
                    name: world.ref.name,
                    snapshotId: tamperedEdit.id,
                    version: world.ref.version + 1,
                  },
                  snapshot: tamperedEdit,
                },
              },
            };
            expect(() =>
              decodeProductSessionEvent(event, SESSION_ID, 1, {
                ref: world.ref,
                snapshot: world.snapshot,
              }),
            ).toThrow();
          },
        };
      })(),
      (() => {
        const read = new WorldToolSurface(new RuntimeMvpHost());
        read.write({ fixtureId: MARBLE_HUNYUAN_COMPOSITE_FIXTURE_ID });
        const world = read.read();
        const tamperedEdit = deepFreeze({
          ...clone(world.snapshot),
          id: "snapshot:edit-foreign",
          parentId: "snapshot:foreign",
          source: "edit",
        }) as Snapshot;
        return {
          seam: "stream",
          run: async () => {
            const event = {
              sequence: 1,
              sessionId: SESSION_ID,
              turnId: `turn:${SESSION_ID.slice("session:".length)}:1`,
              type: "tool.completed",
              tool: "world_edit",
              trace: { sequence: 1, tool: "world_edit", input: {}, status: "succeeded" },
              evidence: {
                tool: "edit",
                update: {
                  status: "updated",
                  operation: "advance",
                  ref: {
                    name: world.ref.name,
                    snapshotId: tamperedEdit.id,
                    version: world.ref.version + 1,
                  },
                  snapshot: tamperedEdit,
                },
              },
            };
            expect(() =>
              decodeProductSessionEvent(event, SESSION_ID, 1, {
                ref: world.ref,
                snapshot: world.snapshot,
              }),
            ).toThrow();
          },
        };
      })(),
    ],
  },
];

function runtimeLineageCase(
  name: string,
  tamper: (episode: Episode, evaluation: EvaluationRecord) => {
    episode?: Episode;
    evaluation?: EvaluationRecord;
  },
): CompositeCase {
  return {
    name,
    probes: [
      {
        seam: "recordEpisode",
        run: async () => {
          const authority = createWorldRepositoryAuthority();
          authority.repository.write(createMarbleHunyuanCompositeSnapshot());
          const base = authority.repository.readRef();
          const episode = await runFallingCube(
            base,
            MARBLE_HUNYUAN_COMPOSITE_PROGRAM,
            MUJOCO_PROFILE,
            deepFreeze({ runId: "run:composite-lineage" }),
          );
          const evaluation = evaluateEpisode(
            episode,
            deriveLandingSuccessContract(episode),
          );
          const tampered = tamper(episode, evaluation);
          if (tampered.episode) {
            expect(() =>
              authority.evidence.recordEpisode(deepFreeze(tampered.episode!)),
            ).toThrow();
          } else {
            authority.evidence.recordEpisode(episode);
            expect(() =>
              authority.evidence.recordEvaluation(deepFreeze(tampered.evaluation!)),
            ).toThrow();
          }
        },
      },
      {
        seam: "codec",
        run: async () => {
          const { read, run } = await compositeRun();
          const tampered = tamper(run.episode, run.evaluation);
          const tamperedRun = {
            ...clone(run),
            episode: tampered.episode ?? clone(run.episode),
            evaluation: tampered.evaluation ?? clone(run.evaluation),
          };
          expect(() =>
            decodeProductSessionProjection(projection({ world: read, lastRun: tamperedRun })),
          ).toThrow();
        },
      },
      {
        seam: "stream",
        run: async () => {
          const { read, run } = await compositeRun();
          const tampered = tamper(run.episode, run.evaluation);
          const tamperedRun = {
            ...clone(run),
            episode: tampered.episode ?? clone(run.episode),
            evaluation: tampered.evaluation ?? clone(run.evaluation),
          };
          await expect(
            decodeProductSessionProjectionTrusted(
              projection({ world: read, lastRun: tamperedRun }),
            ),
          ).rejects.toThrow();
        },
      },
    ],
  };
}

const runtimeLineageCases: CompositeCase[] = [
  runtimeLineageCase("Episode.baseSnapshotId → snapshot:foreign", (episode) => ({
    episode: tamperString(episode, ["baseSnapshotId"], "snapshot:foreign"),
  })),
  runtimeLineageCase("terminal.parentId → snapshot:foreign", (episode) => ({
    episode: tamperString(episode, ["terminalSnapshot", "parentId"], "snapshot:foreign"),
  })),
  runtimeLineageCase("terminal.scenarioId → scenario:primitive-box-free-fall-v1", (episode) => ({
    episode: tamperString(
      episode,
      ["terminalSnapshot", "scenarioId"],
      "scenario:primitive-box-free-fall-v1",
    ),
  })),
  runtimeLineageCase("terminal generated ref → entity:foreign", (episode) => ({
    episode: tamperString(episode, ["terminalSnapshot", "entities", 2, "ref"], "entity:foreign"),
  })),
  runtimeLineageCase("Evaluation.episodeId → episode:foreign", (_episode, evaluation) => ({
    evaluation: tamperString(evaluation, ["episodeId"], "episode:foreign"),
  })),
];

function currentRefCase(
  name: string,
  tamperExpected: (
    expected: WorldReadResult["ref"],
  ) => WorldReadResult["ref"],
  assertion:
    | "throw"
    | "stale",
): CompositeCase {
  return {
    name,
    probes: [
      {
        seam: "repository",
        run: async () => {
          const host = new RuntimeMvpHost();
          host.write(createMarbleHunyuanCompositeSnapshot());
          const baseRef = host.readRefRecord();
          const { episode } = await host.runCurrent(
            deepFreeze({ runId: "run:composite-ref" }),
            MARBLE_HUNYUAN_COMPOSITE_PROGRAM,
          );
          const evaluation = host.evaluateEpisode(episode.id);
          const tampered = deepFreeze(tamperExpected(baseRef));
          if (assertion === "throw") {
            expect(() => host.adopt(episode.id, evaluation.id, tampered)).toThrow();
          } else {
            const update = host.adopt(episode.id, evaluation.id, tampered);
            expect(update.status).toBe("stale_ref");
            expect(host.readRefRecord().snapshotId).toBe(baseRef.snapshotId);
            expect(host.readRefRecord().version).toBe(baseRef.version);
          }
        },
      },
      {
        seam: "codec",
        run: async () => {
          const read = new WorldToolSurface(new RuntimeMvpHost());
          read.write({ fixtureId: MARBLE_HUNYUAN_COMPOSITE_FIXTURE_ID });
          const world = read.read();
          const tamperedRef = tamperExpected({
            ...world.ref,
            snapshotId: "snapshot:edit-ref-case",
          });
          const editSnapshot = deepFreeze({
            ...clone(world.snapshot),
            id: "snapshot:edit-ref-case",
            parentId: world.snapshot.id,
            source: "edit",
          }) as Snapshot;
          const event = {
            sequence: 1,
            sessionId: SESSION_ID,
            turnId: `turn:${SESSION_ID.slice("session:".length)}:1`,
            type: "tool.completed",
            tool: "world_edit",
            trace: { sequence: 1, tool: "world_edit", input: {}, status: "succeeded" },
            evidence: {
              tool: "edit",
              update: {
                status: "updated",
                operation: "advance",
                ref: tamperedRef,
                snapshot: editSnapshot,
              },
            },
          };
          expect(() =>
            decodeProductSessionEvent(event, SESSION_ID, 1, {
              ref: world.ref,
              snapshot: world.snapshot,
            }),
          ).toThrow();
        },
      },
      {
        seam: "stream",
        run: async () => {
          const read = new WorldToolSurface(new RuntimeMvpHost());
          read.write({ fixtureId: MARBLE_HUNYUAN_COMPOSITE_FIXTURE_ID });
          const world = read.read();
          const tamperedRef = tamperExpected({
            ...world.ref,
            snapshotId: "snapshot:edit-ref-case",
          });
          const editSnapshot = deepFreeze({
            ...clone(world.snapshot),
            id: "snapshot:edit-ref-case",
            parentId: world.snapshot.id,
            source: "edit",
          }) as Snapshot;
          const event = {
            sequence: 1,
            sessionId: SESSION_ID,
            turnId: `turn:${SESSION_ID.slice("session:".length)}:1`,
            type: "tool.completed",
            tool: "world_edit",
            trace: { sequence: 1, tool: "world_edit", input: {}, status: "succeeded" },
            evidence: {
              tool: "edit",
              update: {
                status: "updated",
                operation: "advance",
                ref: tamperedRef,
                snapshot: editSnapshot,
              },
            },
          };
          expect(() =>
            decodeProductSessionEvent(event, SESSION_ID, 1, {
              ref: world.ref,
              snapshot: world.snapshot,
            }),
          ).toThrow();
        },
      },
    ],
  };
}

const currentRefCases: CompositeCase[] = [
  currentRefCase(
    "current.name → world:foreign",
    (expected) => ({ ...clone(expected), name: "world:foreign" }),
    "throw",
  ),
  currentRefCase(
    "current.version → +2",
    (expected) => ({ ...clone(expected), version: expected.version + 2 }),
    "stale",
  ),
  currentRefCase(
    "current.snapshotId → snapshot:foreign",
    (expected) => ({ ...clone(expected), snapshotId: "snapshot:foreign" }),
    "throw",
  ),
];

const ALL_COMPOSITE_CASES: readonly CompositeCase[] = [
  ...relabelCases,
  ...duplicateRefCases,
  ...authoredLineageCases,

  ...runtimeLineageCases,
  ...currentRefCases,
  ...environmentRepresentationCases,
  ...floorRepresentationCases,
  ...generatedRepresentationCases,
];

describe("Marble/Hunyuan composite scenario closure", () => {

  test("registered representation/calibration/witness 不进入 MuJoCo physics authority", () => {
    const xml = createFallingCubeMjcf(
      createMarbleHunyuanCompositeSnapshot(),
      MARBLE_HUNYUAN_COMPOSITE_PROGRAM,
      MUJOCO_PROFILE,
    );
    expect(xml).toContain('name="floor"');
    expect(xml).toContain('name="generated_geom"');
    expect(xml).not.toContain("environment");
    expect(xml).not.toContain("gaussian-splat");
    expect(xml).not.toContain("witness");
    expect(xml).not.toContain("calibration");
  });

  test("frozen fixture identity：scenario/refs/proxy 常量与 registry 一致", () => {
    expect(MARBLE_HUNYUAN_COMPOSITE_FIXTURE_ID).toBe("fixture:marble-hunyuan-composite-v1");
    expect(MARBLE_HUNYUAN_COMPOSITE_SCENARIO_ID).toBe("scenario:marble-hunyuan-composite-v1");
    const snapshot = createMarbleHunyuanCompositeSnapshot();
    expect(snapshot.scenarioId).toBe(MARBLE_HUNYUAN_COMPOSITE_SCENARIO_ID);
    expect(snapshot.entities.map((entity) => entity.ref)).toEqual([
      ENVIRONMENT_REF,
      FLOOR_REF,
      GENERATED_OBJECT_REF,
    ]);
    const [environment, floor, generated] = snapshot.entities;
    expect(environment!.representations.visual).toEqual({
      kind: "registered-rigid-mesh",
      assetId: "asset:marble-world-collider-v1",
      manifestDigest: MARBLE_HUNYUAN_MANIFEST_DIGEST,
      calibrationId: "calibration:marble-collider-v1",
      witnessId: "witness:marble-spz-collider-bounds-v1",
    });
    expect(environment!.representations.observation).toEqual({
      kind: "registered-gaussian-splat",
      role: "observation",
      assetId: "asset:marble-world-500k-spz-v1",
      manifestDigest: MARBLE_HUNYUAN_MANIFEST_DIGEST,
      calibrationId: "calibration:marble-spz-v1",
      witnessId: "witness:marble-spz-collider-bounds-v1",
    });
    expect(environment!.representations.observation).not.toBeNull();
    expect(environment!.representations.collision.kind).toBe("none");
    expect(floor!.state.pose.position).toEqual([0, 0, -0.05]);
    expect(floor!.representations.collision).toMatchObject({
      kind: "box",
      halfExtents: FLOOR_PROXY.halfExtents,
    });
    expect(generated!.physics.massKg).toBe(1);
    expect(generated!.state.pose.position).toEqual([0, 0, 1.2]);
    expect(generated!.representations.visual).toEqual({
      kind: "registered-rigid-mesh",
      assetId: "asset:hunyuan-rounded-cube-v1",
      manifestDigest: MARBLE_HUNYUAN_MANIFEST_DIGEST,
      calibrationId: "calibration:hunyuan-glb-v1",
      witnessId: "witness:hunyuan-glb-box-proxy-v1",
    });
    expect(generated!.representations.collision).toMatchObject({
      kind: "box",
      halfExtents: GENERATED_OBJECT_PROXY.halfExtents,
    });
    expect(() => requireRegisteredSnapshotIdentity(snapshot)).not.toThrow();
  });

  test("composite 闭环：write → registered identity → free-fall → deterministic landing evaluation → explicit adopt", async () => {
    const host = new RuntimeMvpHost();
    host.write(createMarbleHunyuanCompositeSnapshot());
    const baseRef = host.readRefRecord();
    expect(baseRef.snapshotId).toBe("snapshot:marble-hunyuan-composite-base");
    expect(baseRef.version).toBe(1);

    const { episode } = await host.runCurrent(
      deepFreeze({ runId: "run:composite-happy" }),
      MARBLE_HUNYUAN_COMPOSITE_PROGRAM,
    );
    expect(episode.samples.length).toBe(76);
    expect(host.readRefRecord().version).toBe(1);

    const evaluation = host.evaluateEpisode(episode.id);
    expect(evaluation.passed).toBe(true);
    expect(evaluation.contractId).toBe("success:stable-on-floor");
    expect(host.readRefRecord().version).toBe(1);

    const update = host.adopt(episode.id, evaluation.id, baseRef);
    expect(update.status).toBe("updated");
    expect(update.ref.version).toBe(2);
    expect(update.ref.snapshotId).toBe(episode.terminalSnapshot.id);
  });

  test("canonical composite projection 与 world_read event 通过 registered codec 正向门", () => {
    const surface = new WorldToolSurface(new RuntimeMvpHost());
    surface.write({ fixtureId: MARBLE_HUNYUAN_COMPOSITE_FIXTURE_ID });
    const world = surface.read();
    expect(() => decodeProductSessionProjection(
      projection({ world }),
      SESSION_ID,
    )).not.toThrow();
    expect(() => decodeProductSessionEvent({
      sequence: 1,
      sessionId: SESSION_ID,
      turnId: `turn:${SESSION_ID.slice("session:".length)}:1`,
      type: "tool.completed",
      tool: "world_read",
      trace: {
        sequence: 1,
        tool: "world_read",
        input: {},
        status: "succeeded",
        result: {},
      },
      evidence: world,
    }, SESSION_ID, 1, world)).not.toThrow();
  });

  test("registered observation 与 Snapshot arrays 拒绝 accessor/extra，且不读取 getter", () => {
    const accessorSnapshot = clone(createMarbleHunyuanCompositeSnapshot());
    const observation = accessorSnapshot.entities[0]!.representations.observation!;
    const assetId = observation.assetId;
    let getterReads = 0;
    Object.defineProperty(observation, "assetId", {
      enumerable: true,
      get() {
        getterReads += 1;
        return assetId;
      },
    });
    expect(() => requireRegisteredSnapshotIdentity(accessorSnapshot)).toThrow("own-data");
    expect(getterReads).toBe(0);

    const extraSnapshot = clone(createMarbleHunyuanCompositeSnapshot());
    Object.defineProperty(extraSnapshot.entities, Symbol("hidden"), {
      value: "ignored",
      enumerable: true,
    });
    const authority = createWorldRepositoryAuthority();
    expect(() => authority.repository.write(extraSnapshot)).toThrow("dense indices");
  });

  test("Repository 在任何 getter 或语义比较前完成 descriptor-only admission", () => {
    const rootAccessor = clone(createMarbleHunyuanCompositeSnapshot()) as unknown as Record<string, unknown>;
    const entities = rootAccessor.entities;
    let rootReads = 0;
    Object.defineProperty(rootAccessor, "entities", {
      enumerable: true,
      get() {
        rootReads += 1;
        return entities;
      },
    });
    const rootAuthority = createWorldRepositoryAuthority();
    expect(() => rootAuthority.repository.write(rootAccessor as unknown as Snapshot)).toThrow("own-data");
    expect(rootReads).toBe(0);

    const observationAccessor = clone(createMarbleHunyuanCompositeSnapshot());
    const observation = observationAccessor.entities[0]!.representations.observation!;
    const observationKind = observation.kind;
    let observationReads = 0;
    Object.defineProperty(observation, "kind", {
      enumerable: true,
      configurable: true,
      get() {
        observationReads += 1;
        Object.defineProperty(observation, "kind", {
          value: observationKind,
          enumerable: true,
        });
        return observationKind;
      },
    });
    const observationAuthority = createWorldRepositoryAuthority();
    expect(() => observationAuthority.repository.write(observationAccessor)).toThrow("own-data");
    expect(observationReads).toBe(0);

    const physicsAccessor = clone(createMarbleHunyuanCompositeSnapshot());
    const floor = physicsAccessor.entities[1]!;
    if (floor.representations.collision.kind !== "box") throw new Error("fixture floor 不是 box");
    const friction = floor.physics.friction;
    let physicsReads = 0;
    Object.defineProperty(floor.physics, "friction", {
      enumerable: true,
      configurable: true,
      get() {
        physicsReads += 1;
        floor.representations.collision.halfExtents[0] = 999;
        Object.defineProperty(floor.physics, "friction", {
          value: friction,
          enumerable: true,
        });
        return friction;
      },
    });
    const physicsAuthority = createWorldRepositoryAuthority();
    expect(() => physicsAuthority.repository.write(physicsAccessor)).toThrow("own-data");
    expect(physicsReads).toBe(0);
    expect(() => physicsAuthority.repository.readRefRecord()).toThrow();
  });

  test("semantic.kind 与 Snapshot schema identity 在 authority admission 前 fail closed", () => {
    const semanticAccessor = clone(createMarbleHunyuanCompositeSnapshot());
    const authoredFloor = semanticAccessor.entities.find(
      (entity) => entity.ref === FLOOR_REF,
    )!;
    const semantic = authoredFloor.representations.semantic;
    if (semantic?.kind !== "authored-box-proxy") {
      throw new Error("composite generated semantic 不是 authored-box-proxy");
    }
    const semanticKind = semantic.kind;
    let semanticReads = 0;
    Object.defineProperty(semantic, "kind", {
      enumerable: true,
      configurable: true,
      get() {
        semanticReads += 1;
        semanticAccessor.schemaVersion = 999 as 1;
        Object.defineProperty(semantic, "kind", {
          value: semanticKind,
          enumerable: true,
        });
        return semanticKind;
      },
    });
    const semanticAuthority = createWorldRepositoryAuthority();
    expect(() => semanticAuthority.repository.write(semanticAccessor)).toThrow("own-data");
    expect(semanticReads).toBe(0);
    expect(() => semanticAuthority.repository.readRefRecord()).toThrow();

    const schemaDrift = clone(createMarbleHunyuanCompositeSnapshot());
    schemaDrift.schemaVersion = 999 as 1;
    const schemaAuthority = createWorldRepositoryAuthority();
    expect(() => schemaAuthority.repository.write(schemaDrift)).toThrow("schemaVersion");
    expect(() => schemaAuthority.repository.readRefRecord()).toThrow();
  });

  test("parameterized closure families 恰好覆盖 32 个 composite mutation 成员", () => {
    expect(ALL_COMPOSITE_CASES.length).toBe(32);
  });

  for (const member of ALL_COMPOSITE_CASES) {
    describe(`composite closure :: ${member.name}`, () => {
      for (const probe of member.probes) {
        test(`composite closure :: ${member.name} @ ${probe.seam} fail closed`, async () => {
          await probe.run();
        });
      }
    });
  }
});
