import { describe, expect, test } from "bun:test";

import {
  DIAGNOSTIC_RIGID_FIXTURE_ID,
  isDeepFrozen,
} from "@demiurges/world";
import {
  ProductSession,
  createScriptedAgentClientFactory,
} from "./product-session";
import type { OmpAgentClientFactory, OmpAgentClientPort } from "./omp-world-agent";

describe("Gateway-owned ProductSession", () => {
  test("scripted Product Session 通过同一四工具闭环 imported rigid fixture", async () => {
    const session = new ProductSession(
      "session:test-imported",
      createScriptedAgentClientFactory(DIAGNOSTIC_RIGID_FIXTURE_ID),
    );
    const projection = await session.runTurn("运行 imported rigid fixture", () => undefined);
    const target = projection.world?.snapshot.entities.find(
      (entity) => entity.ref === "entity:cube",
    );

    expect(target?.representations.visual.kind).toBe("imported-rigid-mesh");
    expect(projection.lastRun?.episode.samples[0]?.states["entity:cube"]).toBeDefined();
    expect(projection.lastRun?.evaluation.passed).toBe(true);
    expect(projection.world?.ref.version).toBe(2);
    expect(projection.world?.snapshot.id).not.toBe(
      projection.lastRun?.episode.terminalSnapshot.id,
    );
  });

  test("同一 Host 将自然语言 turn 展开为有序四工具 evidence，run 不推进 ref", async () => {
    const session = new ProductSession(
      "session:test-1",
      createScriptedAgentClientFactory(),
    );
    const events: unknown[] = [];

    const returnedProjection = await session.runTurn(
      "创建一个方块，把高度改到 2.8 米，然后让它落到地面并检查结果。",
      (event) => {
        events.push(event);
      },
    );
    expect(returnedProjection.running).toBe(false);

    expect(
      events
        .filter((event): event is { type: string; tool: string } =>
          typeof event === "object" &&
          event !== null &&
          (event as { type?: unknown }).type === "tool.completed",
        )
        .map((event) => event.tool),
    ).toEqual([
      "world_write",
      "world_read",
      "world_edit",
      "world_run",
    ]);
    expect(
      events.map((event) => (event as { sequence: number }).sequence),
    ).toEqual([1, 2, 3, 4, 5, 6]);

    const projection = session.readProjection();
    expect(projection.world?.ref.version).toBe(2);
    expect(projection.world?.snapshot.id).toContain("snapshot:edit-");
    expect(projection.lastRun?.episode.terminalSnapshot?.id).not.toBe(
      projection.world?.snapshot.id,
    );
    expect(projection.lastRun?.evaluation.passed).toBe(true);
    expect(projection.lastSequence).toBe(6);
    expect(isDeepFrozen(projection)).toBe(true);
    expect(() => JSON.stringify({ events, projection })).not.toThrow();
    expect(Object.keys(session)).toEqual([]);
  });

  test("同一 session 不允许并发 turn 交错修改世界", async () => {
    const session = new ProductSession(
      "session:test-2",
      createScriptedAgentClientFactory(),
    );
    let releaseFirst: (() => void) | undefined;
    const firstEvent = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    const first = session.runTurn("让方块落下", async () => {
      await firstEvent;
    });

    await expect(session.runTurn("再次运行", () => undefined)).rejects.toThrow(
      "已有 turn 正在运行",
    );
    releaseFirst?.();
    await first;
  });

  test("abort 后迟到 client 即使用 fresh signal 也不能污染后续世界 authority", async () => {
    let lateWrite: Parameters<OmpAgentClientFactory>[0][number] | undefined;
    const factory: OmpAgentClientFactory = (tools) => ({
      async start() {},
      async stop() {},
      async getState() {
        const names = tools.map((tool) => tool.name);
        return {
          sessionId: "session:late-product-write",
          toolNames: names,
          enabledToolNames: names,
          mountedToolNames: [],
        };
      },
      async promptAndWait() {
        lateWrite = tools.find((tool) => tool.name === "world_write");
        await new Promise<never>(() => undefined);
      },
      async getLastAssistantText() { return null; },
    });
    const session = new ProductSession("session:test-late-write", factory);
    const controller = new AbortController();
    const pending = session.runTurn("运行", () => undefined, controller.signal);
    await Promise.resolve();
    controller.abort();
    await expect(pending).rejects.toThrow();
    expect(session.readProjection()).toMatchObject({
      running: false,
      world: null,
      lastRun: null,
    });
    if (!lateWrite) throw new Error("fixture 未捕获 world_write");

    await expect(lateWrite.execute(
      "call:late-product-write",
      { cubeHeight: 2 },
      undefined,
      {} as never,
      new AbortController().signal,
    )).rejects.toThrow("turn 已取消");
    expect(session.readProjection()).toMatchObject({
      running: false,
      world: null,
      lastRun: null,
    });
  });

  test("正常 completed 后 retained tool closure 不能产生晚到 world 或 event", async () => {
    let lateWrite: Parameters<OmpAgentClientFactory>[0][number] | undefined;
    const factory: OmpAgentClientFactory = (tools) => ({
      async start() {},
      async stop() {},
      async getState() {
        const names = tools.map((tool) => tool.name);
        return {
          sessionId: "session:completed-product-write",
          toolNames: names,
          enabledToolNames: names,
          mountedToolNames: [],
        };
      },
      async promptAndWait() {
        lateWrite = tools.find((tool) => tool.name === "world_write");
      },
      async getLastAssistantText() { return "completed"; },
    });
    const events: unknown[] = [];
    const session = new ProductSession("session:test-completed-write", factory);
    const completed = await session.runTurn("运行", (event) => {
      events.push(event);
    });
    expect(completed).toMatchObject({
      running: false,
      world: null,
      lastRun: null,
      lastSequence: 2,
    });
    if (!lateWrite) throw new Error("fixture 未捕获 world_write");

    await expect(lateWrite.execute(
      "call:completed-product-write",
      { cubeHeight: 2 },
      undefined,
      {} as never,
      new AbortController().signal,
    )).rejects.toThrow("turn 已取消");
    expect(session.readProjection()).toEqual(completed);
    expect(events).toHaveLength(2);
  });

  test("失败 product trace 不复制原始 tool input", async () => {
    const marker = "OMP RuntimeMvpHost /private/path apiKey=SYNTHETIC_SECRET_DO_NOT_USE";
    const factory: OmpAgentClientFactory = (tools) => {
      const client: OmpAgentClientPort = {
        async start() {},
        async stop() {},
        async getState() {
          const names = tools.map((tool) => tool.name);
          return {
            sessionId: "session:failing-input",
            toolNames: names,
            enabledToolNames: names,
            mountedToolNames: [],
          };
        },
        async promptAndWait() {
          const write = tools.find((tool) => tool.name === "world_write");
          if (!write) throw new Error("fixture 缺少 world_write");
          await write.execute(
            "call:failed-write",
            { cubeHeight: 2, marker },
            undefined,
            {} as never,
            new AbortController().signal,
          );
        },
        async getLastAssistantText() { return null; },
      };
      return client;
    };
    const events: unknown[] = [];
    const session = new ProductSession("session:test-redaction", factory);

    await expect(session.runTurn("运行", (event) => { events.push(event); })).rejects.toThrow();

    const serialized = JSON.stringify(events);
    expect(serialized).not.toContain(marker);
    expect(serialized).not.toContain("SYNTHETIC_SECRET_DO_NOT_USE");
    expect(serialized).toContain('"input":"[redacted]"');
    expect(serialized).toContain('"error":"world_tool_failed"');
  });

  test("Agent 可从 tool failure 自我纠正，并以 terminal completed 产生 PASS authority", async () => {
    const factory: OmpAgentClientFactory = (tools) => {
      let responseText: string | null = null;
      const invoke = async (name: string, input: Record<string, unknown>) => {
        const tool = tools.find((candidate) => candidate.name === name);
        if (!tool) throw new Error(`fixture 缺少 ${name}`);
        return tool.execute(
          `call:${name}`,
          input,
          undefined,
          {} as never,
          new AbortController().signal,
        );
      };
      const client: OmpAgentClientPort = {
        async start() {},
        async stop() {},
        async getState() {
          const names = tools.map((tool) => tool.name);
          return {
            sessionId: "session:recovering",
            toolNames: names,
            enabledToolNames: names,
            mountedToolNames: [],
          };
        },
        async promptAndWait() {
          await invoke("world_write", { cubeHeight: 2, extra: true }).catch(() => undefined);
          await invoke("world_write", { cubeHeight: 2 });
          const read = await invoke("world_read", {}) as { details: { ref: unknown } };
          await invoke("world_edit", { expected: read.details.ref, cubeHeight: 2.8 });
          await invoke("world_run", { runId: "run:recovered" });
          responseText = "已纠正并完成";
        },
        async getLastAssistantText() { return responseText; },
      };
      return client;
    };
    const events: Array<{ type: string; trace?: { status: string } }> = [];
    const session = new ProductSession("session:test-recovery", factory);

    const projection = await session.runTurn("运行并自行纠正", (event) => {
      events.push(event as { type: string; trace?: { status: string } });
    });

    expect(events.some((event) => event.trace?.status === "failed")).toBe(true);
    expect(events.at(-1)?.type).toBe("turn.completed");
    expect(projection.lastRun?.evaluation.passed).toBe(true);
    expect(projection.world?.ref.version).toBe(2);
  });
});
