import { describe, expect, test } from "bun:test";

import {
  RuntimeMvpHost,
  createInitialSnapshot,
  deepFreeze,
} from "./index";
import { decodeProductSessionProjectHistoryTransition } from "./product-session-codec";
import type { ProductSessionProjection } from "./product-session-contract";

function projection(host: RuntimeMvpHost, version: number): ProductSessionProjection {
  return deepFreeze({
    sessionId: "session:local-history",
    world: {
      tool: "read",
      ref: host.readRefRecord(),
      snapshot: host.readRef(),
    },
    lastRun: null,
    lastSequence: version,
    running: false,
  }) as ProductSessionProjection;
}

describe("Product Session project history transition codec", () => {
  test("只接受相邻 undo/redo、Ref +1 与 settled authority", async () => {
    const host = new RuntimeMvpHost();
    host.write(createInitialSnapshot());
    host.editCurrentCubeHeight(host.readRefRecord(), 3);
    const edited = projection(host, 0);
    host.moveProjectRef(host.exportProjectHistory().snapshots[0]!.id, host.readRefRecord());
    const undone = projection(host, 0);
    expect(await decodeProductSessionProjectHistoryTransition(
      undone,
      edited.sessionId,
      edited,
      "undo",
      "updated",
    )).toEqual(undone);

    host.moveProjectRef(host.exportProjectHistory().snapshots[1]!.id, host.readRefRecord());
    const redone = projection(host, 0);
    expect(await decodeProductSessionProjectHistoryTransition(
      redone,
      edited.sessionId,
      undone,
      "redo",
      "updated",
    )).toEqual(redone);
  });

  test("unchanged drift、方向错误、running 与 lastSequence drift fail closed", async () => {
    const host = new RuntimeMvpHost();
    host.write(createInitialSnapshot());
    host.editCurrentCubeHeight(host.readRefRecord(), 3);
    const edited = projection(host, 2);
    host.moveProjectRef(host.exportProjectHistory().snapshots[0]!.id, host.readRefRecord());
    const undone = projection(host, 2);
    await expect(decodeProductSessionProjectHistoryTransition(
      undone,
      edited.sessionId,
      edited,
      "redo",
      "updated",
    )).rejects.toThrow();
    await expect(decodeProductSessionProjectHistoryTransition(
      { ...edited, running: true },
      edited.sessionId,
      edited,
      "undo",
      "unchanged",
    )).rejects.toThrow();
    await expect(decodeProductSessionProjectHistoryTransition(
      { ...undone, lastSequence: 3 },
      edited.sessionId,
      edited,
      "undo",
      "updated",
    )).rejects.toThrow();
  });
});
