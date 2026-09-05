import { describe, expect, test } from "bun:test";

import {
  WORLD_TOOL_CONTRACT,
  RuntimeMvpHost,
  WorldToolSurface,
  isDeepFrozen,
} from "@demiurges/world";
import {
  OMP_RESTRICTED_SESSION_POLICY,
  OMP_SINGLE_MODEL_SETTINGS,
  OMP_WORLD_TOOL_NAMES,
  OmpAgentTurnError,
  OmpWorldAgent,
  createPinnedOmpCredentialResolver,
  createOmpWorldTools,
  requireOmpModelSelector,
  requireOmpTerminalAssistantSuccess,
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

    await invoke("world_write", { fixtureId: "fixture:primitive-box" });
    const read = (await invoke("world_read", {})) as {
      ref: { name: string; snapshotId: string; version: number };
    };
    await invoke("world_edit", {
      expected: read.ref,
      targetRef: "entity:cube",
      change: { kind: "pose", frameRef: "frame:world", pose: {
        position: { x: 0, y: 0, z: 2.8 }, rotation: { x: 0, y: 0, z: 0, w: 1 },
      } },
    });
    const run = (await invoke("world_run", {
      runId: "run:omp-fake-1",
      program: { kind: "free-fall", targetRef: "entity:cube", durationSeconds: 2.5, sampleRateHz: 30 },
    })) as {
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
  test("OMP parameters 与唯一 WORLD_TOOL_CONTRACT 逐工具同源", () => {
    const tools = createOmpWorldTools(
      new WorldToolSurface(new RuntimeMvpHost()),
    );
    const byName = Object.fromEntries(tools.map((tool) => [tool.name, tool.parameters]));
    expect(byName.world_read).toEqual(WORLD_TOOL_CONTRACT.read.input);
    expect(byName.world_write).toEqual(WORLD_TOOL_CONTRACT.write.input);
    expect(byName.world_edit).toEqual(WORLD_TOOL_CONTRACT.edit.input);
    expect(byName.world_run).toEqual(WORLD_TOOL_CONTRACT.run.input);
  });

  test("OMP parameters 是可变 deep copy，OMP in-place normalize 不会触碰 frozen contract", () => {
    const tools = createOmpWorldTools(
      new WorldToolSurface(new RuntimeMvpHost()),
    );
    for (const tool of tools) {
      expect(Object.isFrozen(tool.parameters)).toBe(false);
      // 模拟 OMP toolWireSchema 的 in-place normalize（normalizeArkPropertyComments
      // 会重写 required；wire.ts in-place 变更不得落在 frozen contract 上）。
      const parameters = tool.parameters as { required?: string[] };
      if (Array.isArray(parameters.required)) {
        parameters.required = [...parameters.required];
      }
      (tool.parameters as Record<string, unknown>).__ompWireMutation = true;
    }
    expect(Object.isFrozen(WORLD_TOOL_CONTRACT.read.input)).toBe(true);
    expect(Object.isFrozen(WORLD_TOOL_CONTRACT.write.input)).toBe(true);
    expect(Object.isFrozen(WORLD_TOOL_CONTRACT.edit.input)).toBe(true);
    expect(Object.isFrozen(WORLD_TOOL_CONTRACT.run.input)).toBe(true);
    expect(WORLD_TOOL_CONTRACT.read.input).toEqual(
      { type: "object", properties: {}, required: [], additionalProperties: false },
    );
    const writeProperties = (WORLD_TOOL_CONTRACT.write.input as {
      properties: Record<string, unknown>;
    }).properties;
    expect(writeProperties.fixtureId).not.toHaveProperty("__ompWireMutation");
    expect((WORLD_TOOL_CONTRACT.write.input as Record<string, unknown>)).not.toHaveProperty(
      "__ompWireMutation",
    );
  });

  test("合法 nested pose 经真实 restricted tool.execute 到达 Host", async () => {
    const tools = createOmpWorldTools(
      new WorldToolSurface(new RuntimeMvpHost()),
    );
    const invoke = async (name: string, input: Record<string, unknown>) => {
      const tool = tools.find((candidate) => candidate.name === name);
      if (!tool) throw new Error(`缺少工具 ${name}`);
      return resultDetails(await tool.execute(
        `call:${name}`,
        input,
        undefined,
        {} as never,
        new AbortController().signal,
      ));
    };

    await invoke("world_write", { fixtureId: "fixture:primitive-box" });
    const read = (await invoke("world_read", {})) as {
      ref: { name: string; snapshotId: string; version: number };
    };
    await invoke("world_edit", {
      expected: read.ref,
      targetRef: "entity:cube",
      change: { kind: "pose", frameRef: "frame:world", pose: {
        position: { x: 0, y: 0, z: 2.8 }, rotation: { x: 0, y: 0, z: 0, w: 1 },
      } },
    });
    const run = (await invoke("world_run", {
      runId: "run:omp-contract",
      program: { kind: "free-fall", targetRef: "entity:cube", durationSeconds: 2.5, sampleRateHz: 30 },
    })) as { evaluation: { passed: boolean } };
    expect(run.evaluation.passed).toBe(true);
  });

  test("Gateway 与 Host 对 nested 非 data、Array、extra、pattern、bounds、non-finite fail closed", async () => {
    const tools = createOmpWorldTools(
      new WorldToolSurface(new RuntimeMvpHost()),
    );
    const write = tools.find((tool) => tool.name === "world_write");
    const edit = tools.find((tool) => tool.name === "world_edit");
    const run = tools.find((tool) => tool.name === "world_run");
    if (!write || !edit || !run) throw new Error("四工具 surface 不完整");
    const execute = (tool: OmpHostTool, input: unknown) => tool.execute(
      "call:negative",
      input as Record<string, unknown>,
      undefined,
      {} as never,
      new AbortController().signal,
    );

    await expect(execute(write, {
      fixtureId: "fixture:primitive-box",
      extra: true,
    })).rejects.toThrow("字段");
    await expect(execute(edit, {
      expected: { name: "world:current", snapshotId: "snapshot:base", version: 1 },
      targetRef: "entity:cube",
      change: { kind: "pose", frameRef: "frame:world", pose: { position: [0, 0, 2], rotation: { x: 0, y: 0, z: 0, w: 1 } } },
    })).rejects.toThrow("plain JSON data");
    await expect(execute(run, {
      runId: "bad-run-id",
      program: { kind: "free-fall", targetRef: "entity:cube", durationSeconds: 2.5, sampleRateHz: 30 },
    })).rejects.toThrow("runId");
    await expect(execute(edit, {
      expected: { name: "world:current", snapshotId: "snapshot:base", version: 1 },
      targetRef: "entity:cube",
      change: { kind: "pose", frameRef: "frame:world", pose: {
        position: { x: 0, y: 0, z: Number.POSITIVE_INFINITY },
        rotation: { x: 0, y: 0, z: 0, w: 1 },
      } },
    })).rejects.toThrow("finite");

    let reads = 0;
    const accessor = { fixtureId: "fixture:primitive-box" } as Record<string, unknown>;
    Object.defineProperty(accessor, "fixtureId", {
      enumerable: true,
      get: () => {
        reads += 1;
        return "fixture:primitive-box";
      },
    });
    await expect(execute(write, accessor)).rejects.toThrow("plain JSON data");
    expect(reads).toBe(0);
  });

  test("production model selector 必须是唯一显式 provider/model", () => {
    expect(requireOmpModelSelector("kimi-code/k3")).toEqual({
      provider: "kimi-code",
      modelId: "k3",
      selector: "kimi-code/k3",
    });
    for (const invalid of [undefined, "", " kimi-code/k3", "kimi-code", "a/b/c"]) {
      expect(() => requireOmpModelSelector(invalid)).toThrow(
        "DEMIURGES_OMP_MODEL",
      );
    }
    expect(() =>
      requireOmpModelSelector("fireworks/kimi-k2.6-fast"),
    ).toThrow("intrinsic fallback");
  });

  test("production credential authority 固定首次 credential，并在 model identity 漂移前 fail closed", async () => {
    let resolutions = 0;
    const selector = requireOmpModelSelector("kimi-code/k3");
    const getApiKey = createPinnedOmpCredentialResolver(
      selector,
      "provider-session:test",
      async (_model, providerSessionId) => {
        expect(providerSessionId).toBe("provider-session:test");
        resolutions += 1;
        return "synthetic-credential-one";
      },
    );
    type RequestModel = Parameters<typeof getApiKey>[0];
    const allowed = { provider: "kimi-code", id: "k3" } as RequestModel;

    expect(await getApiKey(allowed)).toBe("synthetic-credential-one");
    expect(await getApiKey(allowed)).toBe("synthetic-credential-one");
    expect(resolutions).toBe(1);
    expect(() =>
      getApiKey({ provider: "kimi-code", id: "other" } as RequestModel),
    ).toThrow("model identity 漂移");
    expect(resolutions).toBe(1);
  });

  test("production OMP settings 隔离 ambient config 并关闭所有自动 retry/fallback", () => {
    expect(OMP_SINGLE_MODEL_SETTINGS).toEqual({
      "retry.enabled": false,
      "retry.modelFallback": false,
      "retry.usageAwareFallback": false,
      "contextPromotion.enabled": false,
      "compaction.enabled": false,
      "compaction.midTurnEnabled": false,
      "compaction.strategy": "off",
    });
  });

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
    const write = tools.find((tool) => tool.name === "world_write");
    expect(write?.parameters).toMatchObject({
      properties: {
        fixtureId: {
          enum: [
            "fixture:primitive-box",
            "fixture:diagnostic-wedge-v1",
            "fixture:ball-vessel-v1",
            "fixture:two-joint-planar-reach-v1",
            "fixture:marble-hunyuan-composite-v1",
          ],
        },
      },
      required: ["fixtureId"],
      additionalProperties: false,
    });
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
        { fixtureId: Number.NaN },
        undefined,
        {} as never,
        new AbortController().signal,
      ),
    ).rejects.toThrow("finite");

    expect(trace).toHaveLength(1);
    expect(trace[0]).toMatchObject({
      sequence: 1,
      tool: "world_write",
      status: "failed",
      error: expect.stringContaining("finite"),
    });
    expect(JSON.stringify(trace)).not.toContain("RuntimeMvpHost");
    expect(JSON.stringify(trace)).not.toContain("stack");
  });

  test("gateway admission 在 schema 前递归拒绝 nested non-finite number", async () => {
    const tools = createOmpWorldTools(
      new WorldToolSurface(new RuntimeMvpHost()),
      () => undefined,
    );
    const write = tools.find((tool) => tool.name === "world_write");
    if (!write) throw new Error("缺少 world_write");
    await expect(write.execute(
      "call:nested-non-finite",
      { fixtureId: "fixture:primitive-box", nested: { value: Number.NaN } },
      undefined,
      {} as never,
      new AbortController().signal,
    )).rejects.toThrow("finite");
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

  test("turn AbortSignal 会贯穿到 OMP client，并在 cleanup 前终止等待", async () => {
    class AbortAwareClient extends ScriptedAgentClient {
      receivedSignal: AbortSignal | undefined;

      override async promptAndWait(
        _prompt: string,
        signal?: AbortSignal,
      ): Promise<unknown[]> {
        this.receivedSignal = signal;
        if (!signal) throw new Error("missing abort signal");
        await new Promise<never>((_, reject) => {
          const fail = () => reject(new Error("aborted by test"));
          if (signal.aborted) fail();
          else signal.addEventListener("abort", fail, { once: true });
        });
        return [];
      }
    }

    let client: AbortAwareClient | undefined;
    const agent = new OmpWorldAgent(
      new WorldToolSurface(new RuntimeMvpHost()),
      (tools) => {
        client = new AbortAwareClient(tools);
        return client;
      },
    );
    const controller = new AbortController();
    const pending = agent.run(
      "让方块落下",
      () => undefined,
      controller.signal,
    );
    await Promise.resolve();
    controller.abort();

    await expect(pending).rejects.toBeInstanceOf(OmpAgentTurnError);
    expect(client?.receivedSignal?.aborted).toBe(true);
    expect(client?.stopped).toBe(true);
  });

  test("turn AbortSignal 对忽略 signal 的 start 与 stop 也必须 bounded settle", async () => {
    for (const hangingPhase of ["start", "stop"] as const) {
      let stopped = false;
      const agent = new OmpWorldAgent(
        new WorldToolSurface(new RuntimeMvpHost()),
        (tools) => ({
          async start() {
            if (hangingPhase === "start") {
              await new Promise<never>(() => undefined);
            }
          },
          async stop() {
            stopped = true;
            if (hangingPhase === "stop") {
              await new Promise<never>(() => undefined);
            }
          },
          async getState() {
            const names = tools.map((tool) => tool.name);
            return {
              sessionId: `session:hanging-${hangingPhase}`,
              toolNames: names,
              enabledToolNames: names,
              mountedToolNames: [],
            };
          },
          async promptAndWait() {
            throw new Error("primary failure before cleanup");
          },
          async getLastAssistantText() { return null; },
        }),
      );
      const controller = new AbortController();
      const pending = agent.run("让方块落下", () => undefined, controller.signal);
      await Promise.resolve();
      controller.abort();
      const outcome = await Promise.race([
        pending.catch(() => "settled" as const),
        new Promise<"pending">((resolve) =>
          setTimeout(() => resolve("pending"), 100),
        ),
      ]);

      expect(outcome).toBe("settled");
      expect(stopped).toBe(true);
    }
  });

  test("turn settled 后 fake port 不能用 fresh signal 恢复 world tool capability", async () => {
    const host = new RuntimeMvpHost();
    let lateWrite: OmpHostTool | undefined;
    const agent = new OmpWorldAgent(
      new WorldToolSurface(host),
      (tools) => ({
        async start() {},
        async stop() {},
        async getState() {
          const names = tools.map((tool) => tool.name);
          return {
            sessionId: "session:late-write",
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
      }),
    );
    const controller = new AbortController();
    const pending = agent.run("运行", () => undefined, controller.signal);
    await Promise.resolve();
    controller.abort();
    await expect(pending).rejects.toBeInstanceOf(OmpAgentTurnError);
    if (!lateWrite) throw new Error("fixture 未捕获 world_write");

    await expect(lateWrite.execute(
      "call:late-write",
      { fixtureId: "fixture:primitive-box" },
      undefined,
      {} as never,
      new AbortController().signal,
    )).rejects.toThrow("turn 已取消");
    expect(() => host.readRefRecord()).toThrow("尚未初始化");
  });

  test("正常 completed 后 retained tool closure 也必须永久关闭", async () => {
    const host = new RuntimeMvpHost();
    let lateWrite: OmpHostTool | undefined;
    const agent = new OmpWorldAgent(
      new WorldToolSurface(host),
      (tools) => ({
        async start() {},
        async stop() {},
        async getState() {
          const names = tools.map((tool) => tool.name);
          return {
            sessionId: "session:completed-late-write",
            toolNames: names,
            enabledToolNames: names,
            mountedToolNames: [],
          };
        },
        async promptAndWait() {
          lateWrite = tools.find((tool) => tool.name === "world_write");
        },
        async getLastAssistantText() { return "completed"; },
      }),
    );
    await expect(agent.run("运行")).resolves.toMatchObject({
      responseText: "completed",
    });
    if (!lateWrite) throw new Error("fixture 未捕获 world_write");

    await expect(lateWrite.execute(
      "call:completed-late-write",
      { fixtureId: "fixture:primitive-box" },
      undefined,
      {} as never,
      new AbortController().signal,
    )).rejects.toThrow("turn 已取消");
    expect(() => host.readRefRecord()).toThrow("尚未初始化");
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
          { fixtureId: "fixture:primitive-box" },
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
    const write = directTools.find((tool) => tool.name === "world_write");
    if (!run || !write) throw new Error("缺少 world tool");
    await write.execute(
      "call:write",
      { fixtureId: "fixture:primitive-box" },
      undefined,
      {} as never,
      new AbortController().signal,
    );
    const exactBoundary = await run.execute(
      "call:exact-boundary",
      {
        runId: `run:${"x".repeat(60)}`,
        program: { kind: "free-fall", targetRef: "entity:cube", durationSeconds: 2.5, sampleRateHz: 30 },
      },
      undefined,
      {} as never,
      new AbortController().signal,
    );
    expect((resultDetails(exactBoundary) as {
      episode: { explicitInputs: { runId: string } };
    }).episode.explicitInputs.runId)
      .toHaveLength(64);
    await expect(
      run.execute(
        "call:over-boundary",
        {
          runId: `run:${"x".repeat(65)}`,
          program: { kind: "free-fall", targetRef: "entity:cube", durationSeconds: 2.5, sampleRateHz: 30 },
        },
        undefined,
        {} as never,
        new AbortController().signal,
      ),
    ).rejects.toThrow("runId");
    expect(directTrace).toHaveLength(3);
    expect(directTrace.at(-1)).toMatchObject({
      tool: "world_run",
      status: "failed",
    });
    const serializedOversizedTrace = JSON.stringify(directTrace);
    expect(serializedOversizedTrace.length).toBeLessThan(100_000);

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
    Object.defineProperty(hiddenAccessor, "fixtureId", {
      enumerable: false,
      get: () => {
        getterReads += 1;
        return "fixture:primitive-box";
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
    const oversizedKeyInput: Record<string, unknown> = {
      fixtureId: "fixture:primitive-box",
    };
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

    const protoKeyInput: Record<string, unknown> = {
      fixtureId: "fixture:primitive-box",
    };
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

describe("requireOmpTerminalAssistantSuccess", () => {
  test("terminal stopReason=error 且无 text 的 turn 被显式抛出而非静默为空", () => {
    expect(() =>
      requireOmpTerminalAssistantSuccess([
        { role: "user" },
        { role: "assistant", stopReason: "error" },
      ]),
    ).toThrow("OMP turn 以 stopReason=error 终止");
  });

  test("terminal stopReason=error 携带 bounded errorMessage", () => {
    try {
      requireOmpTerminalAssistantSuccess([
        { role: "assistant", stopReason: "stop" },
        { role: "user" },
        {
          role: "assistant",
          stopReason: "error",
          errorMessage: `provider failed ${"x".repeat(300)}`,
        },
      ]);
      throw new Error("预期 requireOmpTerminalAssistantSuccess 抛错");
    } catch (error) {
      expect((error as Error).message).toMatch(
        /^OMP turn 以 stopReason=error 终止：provider failed x{224}$/,
      );
    }
  });

  test("terminal stopReason=aborted 被显式抛出", () => {
    expect(() =>
      requireOmpTerminalAssistantSuccess([
        { role: "assistant", stopReason: "aborted" },
      ]),
    ).toThrow("OMP turn 以 stopReason=aborted 终止");
  });

  test("正常 settle 的 terminal assistant message 通过（含空 text 的 stop turn）", () => {
    expect(() =>
      requireOmpTerminalAssistantSuccess([
        { role: "user" },
        { role: "assistant", stopReason: "stop" },
        { role: "custom" },
      ]),
    ).not.toThrow();
  });

  test("无 assistant message 的 settle 被拒绝", () => {
    expect(() =>
      requireOmpTerminalAssistantSuccess([{ role: "user" }]),
    ).toThrow("OMP turn 未产生 assistant message");
  });
});
