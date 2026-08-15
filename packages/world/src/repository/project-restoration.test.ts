import { describe, expect, test } from "bun:test";

import * as worldPackage from "../index";
import { RuntimeMvpHost } from "../host/runtime-mvp-host";
import { createInitialSnapshot, deepFreeze } from "../kernel/world";
import type { RefRecord, Snapshot } from "../kernel/types";

function editedHost(): RuntimeMvpHost {
  const host = new RuntimeMvpHost();
  host.write(createInitialSnapshot());
  const result = host.editCurrentCubeHeight(host.readRefRecord(), 2.4);
  expect(result.status).toBe("updated");
  return host;
}

describe("World Project Repository seam", () => {
  test("export/restore 保持完整线性 history、cursor 与 exact current Ref", () => {
    const source = editedHost();
    const exported = source.exportProjectHistory();

    expect(exported.snapshots.map((snapshot) => snapshot.id)).toEqual([
      "snapshot:base",
      "snapshot:edit-1",
    ]);
    expect(exported.cursor).toBe(1);
    expect(exported.currentRef).toEqual({
      name: "world:current",
      snapshotId: "snapshot:edit-1",
      version: 2,
    });

    const restored = RuntimeMvpHost.restoreProject(
      exported.snapshots,
      exported.currentRef,
    );
    expect(restored.exportProjectHistory()).toEqual(exported);
    expect(restored.readRef().id).toBe("snapshot:edit-1");
  });

  test("undo/redo 只移动 Ref；undo 后新 edit 截断 redo 且 edit sequence 连续", () => {
    const source = editedHost();
    const exported = source.exportProjectHistory();
    const restored = RuntimeMvpHost.restoreProject(
      exported.snapshots,
      exported.currentRef,
    );

    const undo = restored.moveProjectRef(
      "snapshot:base",
      restored.readRefRecord(),
    );
    expect(undo.status).toBe("updated");
    expect(undo.ref.version).toBe(3);
    expect(restored.exportProjectHistory()).toMatchObject({ cursor: 0 });
    expect(restored.exportProjectHistory().snapshots.map((snapshot) => snapshot.id)).toEqual([
      "snapshot:base",
      "snapshot:edit-1",
    ]);

    const redo = restored.moveProjectRef(
      "snapshot:edit-1",
      restored.readRefRecord(),
    );
    expect(redo.status).toBe("updated");
    expect(redo.ref.version).toBe(4);
    expect(restored.exportProjectHistory().cursor).toBe(1);

    restored.moveProjectRef("snapshot:base", restored.readRefRecord());
    const replacement = restored.editCurrentCubeHeight(restored.readRefRecord(), 2.8);
    expect(replacement.status).toBe("updated");
    expect(replacement.snapshot.id).toBe("snapshot:edit-2");
    expect(restored.exportProjectHistory().snapshots.map((snapshot) => snapshot.id)).toEqual([
      "snapshot:base",
      "snapshot:edit-2",
    ]);
    expect(() => restored.readSnapshot("snapshot:edit-1")).not.toThrow();
  });

  test("restore candidate 失败不改变既有 Host", () => {
    const live = editedHost();
    const before = live.exportProjectHistory();
    const forgedSnapshots = structuredClone(before.snapshots) as Snapshot[];
    forgedSnapshots[1]!.parentId = "snapshot:missing";

    expect(() => RuntimeMvpHost.restoreProject(
      deepFreeze(forgedSnapshots) as readonly Snapshot[],
      before.currentRef,
    )).toThrow("parentId");
    expect(live.exportProjectHistory()).toEqual(before);

    const mutableRef = structuredClone(before.currentRef) as RefRecord;
    expect(() => RuntimeMvpHost.restoreProject(before.snapshots, mutableRef)).toThrow(
      "冻结",
    );
    expect(live.exportProjectHistory()).toEqual(before);
  });

  test("Host 拒绝调用方 authority，package root 不暴露 evidence capability", () => {
    const forgedAuthority = Object.freeze({
      repository: Object.freeze({}),
      evidence: Object.freeze({}),
    });
    const RuntimeHostWithArgument = RuntimeMvpHost as unknown as new (
      authority: unknown,
    ) => RuntimeMvpHost;

    expect(() => new RuntimeHostWithArgument(forgedAuthority)).toThrow(
      "不接纳调用方 Repository authority",
    );
    expect("fromRepositoryAuthority" in RuntimeMvpHost).toBe(false);
    expect("createWorldRepositoryAuthority" in worldPackage).toBe(false);
    expect("restoreRepositoryAuthority" in worldPackage).toBe(false);
    expect("WorldEvidenceWriter" in worldPackage).toBe(false);
  });
});
