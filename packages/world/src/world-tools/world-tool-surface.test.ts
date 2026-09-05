import { describe, expect, test } from "bun:test";

import { RuntimeMvpHost } from "../host/runtime-mvp-host";
import {
  DIAGNOSTIC_RIGID_FIXTURE_ID,
  PRIMITIVE_BOX_FIXTURE_ID,
} from "../artifacts/diagnostic-rigid-fixture";
import { MARBLE_HUNYUAN_COMPOSITE_FIXTURE_ID } from "../artifacts/marble-hunyuan-composite-fixture";
import type { GeneratedObjectWorldBinding } from "../artifacts/marble-hunyuan-generated-session";
import { isDeepFrozen } from "../kernel/world";
import {
  WORLD_TOOL_NAMES,
  WorldToolSurface,
} from "./world-tool-surface";

function jsonRoundTrip<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function poseAt(z: number) {
  return {
    targetRef: "entity:cube",
    change: {
      kind: "pose",
      frameRef: "frame:world",
      pose: {
        position: { x: 0, y: 0, z },
        rotation: { x: 0, y: 0, z: 0, w: 1 },
      },
    },
  } as const;
}

function rigidRun(runId: string) {
  return { runId, program: { kind: "free-fall", targetRef: "entity:cube", durationSeconds: 2.5, sampleRateHz: 30 } } as const;
}

describe("WorldToolSurface", () => {
  test("模型侧只获得 read/write/edit/run 四个工具", () => {
    expect(WORLD_TOOL_NAMES).toEqual(["read", "write", "edit", "run"]);
    expect(
      Object.getOwnPropertyNames(WorldToolSurface.prototype).filter(
        (name) => name !== "constructor",
      ),
    ).toEqual([...WORLD_TOOL_NAMES]);
  });

  test("Host method table 不可替换，tool call 不会泄露 existing control Host", () => {
    const host = new RuntimeMvpHost();
    const tools = new WorldToolSurface(host);
    tools.write({ fixtureId: PRIMITIVE_BOX_FIXTURE_ID });

    expect(Object.isFrozen(RuntimeMvpHost.prototype)).toBe(true);
    const original = RuntimeMvpHost.prototype.readRefRecord;
    let captured: RuntimeMvpHost | undefined;
    expect(() =>
      Object.defineProperty(RuntimeMvpHost.prototype, "readRefRecord", {
        configurable: true,
        writable: true,
        value: function (this: RuntimeMvpHost) {
          captured = this;
          return original.call(this);
        },
      }),
    ).toThrow();

    expect(tools.read().ref.version).toBe(1);
    expect(captured).toBeUndefined();
  });

  test("scripted operator 只通过四个工具产生可评测 world run，control boundary 才能 adopt", async () => {
    const host = new RuntimeMvpHost();
    const tools = new WorldToolSurface(host);

    const written = tools.write(jsonRoundTrip({ fixtureId: PRIMITIVE_BOX_FIXTURE_ID }));
    expect(written.tool).toBe("write");
    expect(written.ref.version).toBe(1);
    expect(isDeepFrozen(written)).toBe(true);

    const observed = tools.read();
    expect(observed.ref).toBe(written.ref);
    expect(observed.snapshot).toBe(written.snapshot);

    const edited = tools.edit(
      jsonRoundTrip({ expected: observed.ref, ...poseAt(2.8) }),
    );
    expect(edited.update.status).toBe("updated");
    expect(edited.update.ref.version).toBe(2);
    expect(edited.update.snapshot.parentId).toBe(observed.snapshot.id);

    const beforeRun = tools.read();
    const run = await tools.run(jsonRoundTrip(rigidRun("run:scripted-1")));
    const afterRun = tools.read();

    expect(run.baseRef).toBe(beforeRun.ref);
    expect(run.episode.baseSnapshotId).toBe(beforeRun.snapshot.id);
    expect(run.evaluation.episodeId).toBe(run.episode.id);
    expect(run.evaluation.passed).toBe(true);
    expect(afterRun.ref).toBe(beforeRun.ref);
    expect(afterRun.snapshot).toBe(beforeRun.snapshot);
    expect(isDeepFrozen(run)).toBe(true);
    expect(() => JSON.stringify(run)).not.toThrow();
    expect("adopt" in (tools as unknown as Record<string, unknown>)).toBe(false);

    const adopted = host.adopt(
      run.episode.id,
      run.evaluation.id,
      run.baseRef,
    );
    expect(adopted.status).toBe("updated");
    expect(adopted.ref.version).toBe(3);
    expect(tools.read().snapshot).toBe(run.episode.terminalSnapshot);
  });

  test("同一四工具 surface 可创建并推演登记的 imported rigid fixture", async () => {
    const host = new RuntimeMvpHost();
    const tools = new WorldToolSurface(host);
    const written = tools.write({
      fixtureId: DIAGNOSTIC_RIGID_FIXTURE_ID,
    });
    const target = written.snapshot.entities.find((entity) => entity.ref === "entity:cube")!;

    expect(target.representations.visual.kind).toBe("imported-rigid-mesh");
    const run = await tools.run(rigidRun("run:imported-tool"));
    expect(run.evaluation.passed).toBe(true);
    expect(run.episode.samples[0]?.states[target.ref]).toBeDefined();
    expect(tools.read().snapshot).toBe(written.snapshot);
    expect(host.adopt(run.episode.id, run.evaluation.id, written.ref)).toMatchObject({
      status: "updated",
      operation: "adopt",
      ref: { version: 2 },
    });
  });

  test("Host 可选 binding 只替换 composite generated-object，未绑定时保持旧 fixture", async () => {
    const binding: GeneratedObjectWorldBinding = {
      artifactSetDigest: "5641bf040c5dc881a553332493957627c8557edc5d7aa7d4f65b42139259e69d",
      assetId: "asset:generated-sha256-65dc7eb3d71393e624925c6848e88b55cf0bd6fd8d1ca63b956743fddd55e05a",
      sourceBounds: {
        min: [-0.48395800590515137, -3.736129973702895e-8, -0.2797180492002527],
        max: [0.4801819920539856, 0.574190135291325, 0.2780711007797188],
      },
    };
    const legacy = new WorldToolSurface(new RuntimeMvpHost());
    const bound = new WorldToolSurface(new RuntimeMvpHost(), binding);

    const legacyVisual = legacy.write({ fixtureId: MARBLE_HUNYUAN_COMPOSITE_FIXTURE_ID })
      .snapshot.entities[2]!.representations.visual;
    const boundWrite = bound.write({ fixtureId: MARBLE_HUNYUAN_COMPOSITE_FIXTURE_ID });
    const boundVisual = boundWrite.snapshot.entities[2]!.representations.visual;

    expect(legacyVisual).toMatchObject({ assetId: "asset:hunyuan-rounded-cube-v1" });
    expect(boundVisual).toMatchObject({
      assetId: binding.assetId,
      manifestDigest: `sha256:${binding.artifactSetDigest}`,
    });
    const run = await bound.run({
      runId: "run:generated-session-surface",
      program: { kind: "free-fall", targetRef: "entity:generated-object", durationSeconds: 2.5, sampleRateHz: 30 },
    });
    expect(run.evaluation.passed).toBe(true);
    expect(run.baseRef).toBe(boundWrite.ref);
  });

  test("JSON round-trip expected ref 可用，stale edit 不改变 current", () => {
    const host = new RuntimeMvpHost();
    const tools = new WorldToolSurface(host);
    tools.write({ fixtureId: PRIMITIVE_BOX_FIXTURE_ID });

    const stale = tools.read().ref;
    const first = tools.edit(jsonRoundTrip({ expected: stale, ...poseAt(2.6) }));
    expect(first.update.status).toBe("updated");

    const repeated = tools.edit(jsonRoundTrip({ expected: stale, ...poseAt(3) }));
    expect(repeated.update.status).toBe("stale_ref");
    expect(tools.read().ref).toBe(first.update.ref);
    expect(tools.read().snapshot).toBe(first.update.snapshot);
    expect(() => host.readSnapshot("snapshot:edit-2")).toThrow(
      "Repository 中不存在 snapshot:edit-2",
    );
  });

  test("非 JSON data、非法数字、ID 与额外字段 fail closed", async () => {
    const accessorInput = {};
    Object.defineProperty(accessorInput, "fixtureId", {
      enumerable: true,
      get: () => PRIMITIVE_BOX_FIXTURE_ID,
    });
    expect(() => new WorldToolSurface(new RuntimeMvpHost()).write(accessorInput)).toThrow(
      "plain JSON data",
    );

    expect(() =>
      new WorldToolSurface(new RuntimeMvpHost()).write({
        fixtureId: Number.NaN,
      }),
    ).toThrow("fixtureId");

    expect(() =>
      new WorldToolSurface(new RuntimeMvpHost()).write({
        fixtureId: PRIMITIVE_BOX_FIXTURE_ID,
        ignored: true,
      }),
    ).toThrow("字段");

    expect(() =>
      new WorldToolSurface(new RuntimeMvpHost()).write({
        fixtureId: "https://example.com/remote.glb",
      }),
    ).toThrow("fixtureId");

    expect(() =>
      new WorldToolSurface(new RuntimeMvpHost()).write({
        fixtureId: "/tmp/local.glb",
      }),
    ).toThrow("fixtureId");

    expect(() =>
      new WorldToolSurface(new RuntimeMvpHost()).write({
        fixtureId: PRIMITIVE_BOX_FIXTURE_ID,
      }),
    ).not.toThrow();

    const tools = new WorldToolSurface(new RuntimeMvpHost());
    tools.write({ fixtureId: PRIMITIVE_BOX_FIXTURE_ID });
    await expect(tools.run(rigidRun("not-a-run-id"))).rejects.toThrow("runId");

    const inherited = Object.create({ expected: tools.read().ref });
    expect(() => tools.edit(inherited)).toThrow("plain JSON data");

    expect(() =>
      tools.edit({
        expected: { ...tools.read().ref, version: 1.5 },
        ...poseAt(2.4),
      }),
    ).toThrow("version");
  });
});
