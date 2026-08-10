import { describe, expect, test } from "bun:test";

import { RuntimeMvpHost } from "../host/runtime-mvp-host";
import { isDeepFrozen } from "../kernel/world";
import {
  WORLD_TOOL_NAMES,
  WorldToolSurface,
} from "./world-tool-surface";

function jsonRoundTrip<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
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
    tools.write({ cubeHeight: 2 });

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

    const written = tools.write(jsonRoundTrip({ cubeHeight: 2 }));
    expect(written.tool).toBe("write");
    expect(written.ref.version).toBe(1);
    expect(isDeepFrozen(written)).toBe(true);

    const observed = tools.read();
    expect(observed.ref).toBe(written.ref);
    expect(observed.snapshot).toBe(written.snapshot);

    const edited = tools.edit(
      jsonRoundTrip({ expected: observed.ref, cubeHeight: 2.8 }),
    );
    expect(edited.update.status).toBe("updated");
    expect(edited.update.ref.version).toBe(2);
    expect(edited.update.snapshot.parentId).toBe(observed.snapshot.id);

    const beforeRun = tools.read();
    const run = await tools.run(jsonRoundTrip({ runId: "run:scripted-1" }));
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

  test("JSON round-trip expected ref 可用，stale edit 不改变 current", () => {
    const host = new RuntimeMvpHost();
    const tools = new WorldToolSurface(host);
    tools.write({ cubeHeight: 2 });

    const stale = tools.read().ref;
    const first = tools.edit(jsonRoundTrip({ expected: stale, cubeHeight: 2.6 }));
    expect(first.update.status).toBe("updated");

    const repeated = tools.edit(jsonRoundTrip({ expected: stale, cubeHeight: 3 }));
    expect(repeated.update.status).toBe("stale_ref");
    expect(tools.read().ref).toBe(first.update.ref);
    expect(tools.read().snapshot).toBe(first.update.snapshot);
    expect(() => host.readSnapshot("snapshot:edit-2")).toThrow(
      "Repository 中不存在 snapshot:edit-2",
    );
  });

  test("非 JSON data、非法数字、ID 与额外字段 fail closed", async () => {
    const accessorInput = {};
    Object.defineProperty(accessorInput, "cubeHeight", {
      enumerable: true,
      get: () => 2,
    });
    expect(() => new WorldToolSurface(new RuntimeMvpHost()).write(accessorInput)).toThrow(
      "plain JSON data",
    );

    expect(() =>
      new WorldToolSurface(new RuntimeMvpHost()).write({
        cubeHeight: Number.NaN,
      }),
    ).toThrow("有限数值");

    expect(() =>
      new WorldToolSurface(new RuntimeMvpHost()).write({
        cubeHeight: 2,
        ignored: true,
      }),
    ).toThrow("字段");

    const tools = new WorldToolSurface(new RuntimeMvpHost());
    tools.write({ cubeHeight: 2 });
    await expect(tools.run({ runId: "not-a-run-id" })).rejects.toThrow("run:");

    const inherited = Object.create({ cubeHeight: 2 });
    expect(() => tools.edit(inherited)).toThrow("plain JSON data");

    expect(() =>
      tools.edit({
        expected: { ...tools.read().ref, version: 1.5 },
        cubeHeight: 2.4,
      }),
    ).toThrow("version");
  });
});
