import { describe, expect, test } from "bun:test";

import { RuntimeMvpHost } from "../../studio/src/host/runtime-mvp-host";
import { isDeepFrozen } from "../../studio/src/kernel/world";
import { WorldToolSurface } from "../../studio/src/world-tools/world-tool-surface";
import {
  OMP_RESTRICTED_SESSION_POLICY,
  OMP_WORLD_TOOL_NAMES,
  OmpAgentTurnError,
  OmpWorldAgent,
  createOmpWorldTools,
  type OmpHostTool,
  type OmpAgentClientFactory,
  type OmpAgentClientPort,
} from "./omp-world-agent";

function resultDetails(result: Awaited<ReturnType<OmpHostTool["execute"]>>): unknown {
  if (typeof result === "string") {
    throw new Error("测试工具预期 structured result");
  }
  return result.details;
}

class ScriptedAgentClient implements OmpAgentClientPort {
  protected readonly tools: readonly OmpHostTool[];
  #lastAssistantText: string | null = null;
  started = false;
  stopped = false;

  constructor(tools: readonly OmpHostTool[]) {
    this.tools = tools;
  }

  async start(): Promise<void> {
    this.started = true;
  }

  async stop(): Promise<void> {
    this.stopped = true;
  }

  async getState(): Promise<{
    sessionId: string;
    toolNames: readonly string[];
    enabledToolNames: readonly string[];
    mountedToolNames: readonly string[];
  }> {
    const toolNames = this.tools.map((tool) => tool.name);
    return {
      sessionId: "session:fake",
      toolNames,
      enabledToolNames: toolNames,
      mountedToolNames: [],
    };
  }

  async promptAndWait(prompt: string): Promise<unknown[]> {
    expect(prompt).toContain("方块");
    const invoke = async (name: string, input: Record<string, unknown>) => {
      const tool = this.tools.find((candidate) => candidate.name === name);
      if (!tool) throw new Error(`缺少工具 ${name}`);
      return resultDetails(
        await tool.execute(
          `call:${name}`,
          input,
          undefined,
          {} as never,
          new AbortController().signal,
        ),
      );
    };

    await invoke("world_write", { cubeHeight: 2 });
    const read = (await invoke("world_read", {})) as {
      ref: { name: string; snapshotId: string; version: number };
    };
    await invoke("world_edit", { expected: read.ref, cubeHeight: 2.8 });
    const run = (await invoke("world_run", { runId: "run:omp-fake-1" })) as {
      evaluation: { passed: boolean };
    };
    this.#lastAssistantText = run.evaluation.passed
      ? "方块已经完成推演，确定性评测通过。"
      : "方块推演未通过评测。";
    return [];
  }

  async getLastAssistantText(): Promise<string | null> {
    return this.#lastAssistantText;
  }
}

describe("OMP World Agent Gateway", () => {
  test("只注册四个 host-owned world tools，并以 SDK restricted session 关闭环境能力", () => {
    const tools = createOmpWorldTools(
      new WorldToolSurface(new RuntimeMvpHost()),
    );

    expect(OMP_WORLD_TOOL_NAMES).toEqual([
      "world_read",
      "world_write",
      "world_edit",
      "world_run",
    ]);
    expect(tools.map((tool) => tool.name)).toEqual([...OMP_WORLD_TOOL_NAMES]);
    expect(tools.some((tool) => tool.name === "adopt")).toBe(false);
    expect(OMP_RESTRICTED_SESSION_POLICY).toEqual({
      restrictToolNames: true,
      allowRestrictedCustomTools: true,
      disableExtensionDiscovery: true,
      enableMCP: false,
      enableIrc: false,
      enableLsp: false,
      useInMemorySession: true,
      expandPromptTemplates: false,
      syntheticPrompt: true,
    });
  });

  test("自然语言 turn 只经四工具完成 falling-cube run，trace 可观察且 run 不推进 ref", async () => {
    const host = new RuntimeMvpHost();
    let client: ScriptedAgentClient | undefined;
    const factory: OmpAgentClientFactory = (tools) => {
      client = new ScriptedAgentClient(tools);
      return client;
    };
    const agent = new OmpWorldAgent(new WorldToolSurface(host), factory);

    const turn = await agent.run(
      "创建一个方块，把高度改到 2.8 米，然后让它落到地面并检查结果。",
    );

    expect(client?.started).toBe(true);
    expect(client?.stopped).toBe(true);
    expect(turn.responseText).toContain("评测通过");
    expect(turn.trace.map((entry) => entry.tool)).toEqual([
      "world_write",
      "world_read",
      "world_edit",
      "world_run",
    ]);
    expect(turn.trace.map((entry) => entry.sequence)).toEqual([1, 2, 3, 4]);
    expect(turn.trace.every((entry) => entry.status === "succeeded")).toBe(true);
    expect(turn.trace[3]?.result).toMatchObject({
      tool: "run",
      evaluation: { passed: true },
    });
    expect(host.readRefRecord().version).toBe(2);
    expect(isDeepFrozen(turn)).toBe(true);
    expect(() => JSON.stringify(turn)).not.toThrow();
  });

  test("失败工具形成 bounded error trace，不泄露 stack 或 Host", async () => {
    const trace: unknown[] = [];
    const tools = createOmpWorldTools(
      new WorldToolSurface(new RuntimeMvpHost()),
      (entry) => trace.push(entry),
    );
    const write = tools.find((tool) => tool.name === "world_write");
    if (!write) throw new Error("缺少 world_write");

    await expect(
      write.execute(
        "call:invalid",
        { cubeHeight: Number.NaN },
        undefined,
        {} as never,
        new AbortController().signal,
      ),
    ).rejects.toThrow("有限数值");

    expect(trace).toHaveLength(1);
    expect(trace[0]).toMatchObject({
      sequence: 1,
      tool: "world_write",
      status: "failed",
      error: "cubeHeight 必须是有限数值",
    });
    expect(JSON.stringify(trace)).not.toContain("RuntimeMvpHost");
    expect(JSON.stringify(trace)).not.toContain("stack");
  });

  test("prompt 前若 active tool surface 多于四工具则 fail closed", async () => {
    class LeakyAgentClient extends ScriptedAgentClient {
      override async getState() {
        const state = await super.getState();
        return {
          ...state,
          toolNames: [...state.toolNames, "mcp__ambient"],
          enabledToolNames: [...state.enabledToolNames, "mcp__ambient"],
        };
      }

      override async promptAndWait(): Promise<unknown[]> {
        throw new Error("权限门失败后不得发送 prompt");
      }
    }

    let client: LeakyAgentClient | undefined;
    const agent = new OmpWorldAgent(
      new WorldToolSurface(new RuntimeMvpHost()),
      (tools) => {
        client = new LeakyAgentClient(tools);
        return client;
      },
    );

    await expect(agent.run("让方块落下")).rejects.toThrow(
      "OMP active tool surface 必须恰好为",
    );
    expect(client?.started).toBe(true);
    expect(client?.stopped).toBe(true);
  });

  test("拒绝 OMP slash/control 与 @file preprocessing syntax", async () => {
    let createdClients = 0;
    const makeAgent = () => {
      return new OmpWorldAgent(
        new WorldToolSurface(new RuntimeMvpHost()),
        (tools) => {
          createdClients += 1;
          return new ScriptedAgentClient(tools);
        },
      );
    };

    await expect(makeAgent().run("/mcp list")).rejects.toThrow(
      "slash/control syntax",
    );
    await expect(makeAgent().run('读取 @"/etc/hosts"')).rejects.toThrow(
      "@file mention syntax",
    );
    expect(createdClients).toBe(0);
  });

  test("失败 turn 保留 frozen trace，cleanup 失败不覆盖 primary error", async () => {
    class FailingAgentClient implements OmpAgentClientPort {
      readonly #tools: readonly OmpHostTool[];

      constructor(tools: readonly OmpHostTool[]) {
        this.#tools = tools;
      }

      async start(): Promise<void> {}

      async stop(): Promise<void> {
        throw new Error("cleanup exploded");
      }

      async getState() {
        const toolNames = this.#tools.map((tool) => tool.name);
        return {
          sessionId: "session:failing",
          toolNames,
          enabledToolNames: toolNames,
          mountedToolNames: [],
        };
      }

      async promptAndWait(): Promise<void> {
        const write = this.#tools.find((tool) => tool.name === "world_write");
        if (!write) throw new Error("缺少 world_write");
        await write.execute(
          "call:write-before-failure",
          { cubeHeight: 2 },
          undefined,
          {} as never,
          new AbortController().signal,
        );
        throw new Error("primary exploded");
      }

      async getLastAssistantText(): Promise<string | null> {
        return null;
      }
    }

    const agent = new OmpWorldAgent(
      new WorldToolSurface(new RuntimeMvpHost()),
      (tools) => new FailingAgentClient(tools),
    );

    try {
      await agent.run("创建一个方块后停止");
      throw new Error("预期 OmpAgentTurnError");
    } catch (error) {
      expect(error).toBeInstanceOf(OmpAgentTurnError);
      const turnError = error as OmpAgentTurnError;
      expect(turnError.message).toBe("primary exploded");
      expect(turnError.cleanupError).toBe("cleanup exploded");
      expect(turnError.trace).toHaveLength(1);
      expect(turnError.trace[0]).toMatchObject({
        sequence: 1,
        tool: "world_write",
        status: "succeeded",
      });
      expect(isDeepFrozen(turnError.trace)).toBe(true);
      expect(JSON.stringify(turnError.trace)).not.toContain("RuntimeMvpHost");
    }
  });

  test("tool input 与单 turn trace 都有明确预算", async () => {
    const directTrace: unknown[] = [];
    const directTools = createOmpWorldTools(
      new WorldToolSurface(new RuntimeMvpHost()),
      (entry) => directTrace.push(entry),
    );
    const run = directTools.find((tool) => tool.name === "world_run");
    if (!run) throw new Error("缺少 world_run");
    await expect(
      run.execute(
        "call:oversized",
        { runId: `run:${"x".repeat(10_000)}` },
        undefined,
        {} as never,
        new AbortController().signal,
      ),
    ).rejects.toThrow("不能超过 512 字符");
    expect(directTrace).toHaveLength(1);
    const serializedOversizedTrace = JSON.stringify(directTrace);
    expect(serializedOversizedTrace.length).toBeLessThan(4_096);
    expect(serializedOversizedTrace).toContain("trace-truncated");

    class ExcessiveCallsClient extends ScriptedAgentClient {
      override async promptAndWait(): Promise<unknown[]> {
        const read = this.tools.find((tool) => tool.name === "world_read");
        if (!read) throw new Error("缺少 world_read");
        for (let index = 0; index < 129; index += 1) {
          try {
            await read.execute(
              `call:read:${index}`,
              {},
              undefined,
              {} as never,
              new AbortController().signal,
            );
          } catch {
            // 前 128 次会因尚无 current world 失败；第 129 次触发 turn budget。
          }
        }
        return [];
      }
    }

    const agent = new OmpWorldAgent(
      new WorldToolSurface(new RuntimeMvpHost()),
      (tools) => new ExcessiveCallsClient(tools),
    );
    try {
      await agent.run("尝试读取世界");
      throw new Error("预期 tool-call budget failure");
    } catch (error) {
      expect(error).toBeInstanceOf(OmpAgentTurnError);
      const turnError = error as OmpAgentTurnError;
      expect(turnError.message).toContain("不能超过 128");
      expect(turnError.trace).toHaveLength(128);
      expect(JSON.stringify(turnError.trace).length).toBeLessThan(100_000);
    }
  });

  test("descriptor admission 拒绝 hidden accessor 与超长 key，trace 不读取 getter 且保持有界", async () => {
    let surfaceWriteCalls = 0;
    const surface = {
      write: () => {
        surfaceWriteCalls += 1;
        return { tool: "write" };
      },
    } as unknown as WorldToolSurface;
    const trace: unknown[] = [];
    const tools = createOmpWorldTools(surface, (entry) => trace.push(entry));
    const write = tools.find((tool) => tool.name === "world_write");
    if (!write) throw new Error("缺少 world_write");

    let getterReads = 0;
    const hiddenAccessor: Record<string, unknown> = {};
    Object.defineProperty(hiddenAccessor, "cubeHeight", {
      enumerable: false,
      get: () => {
        getterReads += 1;
        return 2;
      },
    });
    await expect(
      write.execute(
        "call:hidden-accessor",
        hiddenAccessor,
        undefined,
        {} as never,
        new AbortController().signal,
      ),
    ).rejects.toThrow("plain JSON data");
    expect(getterReads).toBe(0);
    expect(surfaceWriteCalls).toBe(0);

    const hugeKey = "k".repeat(1024 * 1024);
    const oversizedKeyInput: Record<string, unknown> = { cubeHeight: 2 };
    Object.defineProperty(oversizedKeyInput, hugeKey, {
      enumerable: true,
      value: true,
    });
    await expect(
      write.execute(
        "call:oversized-key",
        oversizedKeyInput,
        undefined,
        {} as never,
        new AbortController().signal,
      ),
    ).rejects.toThrow("key 不能超过 512 字符");
    expect(surfaceWriteCalls).toBe(0);
    expect(trace).toHaveLength(2);
    const serializedTrace = JSON.stringify(trace);
    expect(serializedTrace.length).toBeLessThan(8_192);
    expect(serializedTrace).toContain("trace-truncated");
    expect(serializedTrace).not.toContain(hugeKey);

    const protoKeyInput: Record<string, unknown> = { cubeHeight: 2 };
    Object.defineProperty(protoKeyInput, "__proto__", {
      enumerable: true,
      value: { polluted: true },
    });
    await expect(
      write.execute(
        "call:proto-key",
        protoKeyInput,
        undefined,
        {} as never,
        new AbortController().signal,
      ),
    ).rejects.toThrow("不接受 __proto__ key");
    expect(surfaceWriteCalls).toBe(0);
    expect(trace).toHaveLength(3);
    expect(JSON.stringify(trace)).toContain('"__proto__"');
  });
});
