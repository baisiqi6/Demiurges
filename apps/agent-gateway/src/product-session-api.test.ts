import { afterEach, describe, expect, test } from "bun:test";

import { createProductSessionApi } from "./product-session-api";
import { createScriptedAgentClientFactory } from "./product-session";
import type {
  OmpAgentClientFactory,
  OmpAgentClientPort,
} from "./omp-world-agent";

let server: ReturnType<typeof Bun.serve> | undefined;

afterEach(() => {
  server?.stop(true);
  server = undefined;
});

async function startApi(): Promise<URL> {
  const api = createProductSessionApi(createScriptedAgentClientFactory());
  server = Bun.serve({ port: 0, fetch: api.fetch });
  return new URL(server.url.toString());
}

function turnRequest(
  sessionId: string,
  body: string | ReadableStream<Uint8Array>,
  contentType = "application/json",
): Request {
  return new Request(`http://local.test/api/sessions/${sessionId}/turns`, {
    method: "POST",
    headers: { "content-type": contentType },
    body,
    duplex: "half",
  } as RequestInit & { duplex: "half" });
}

function controlledBody(
  text: string,
  ready: () => void,
  release: Promise<void>,
): ReadableStream<Uint8Array> {
  const bytes = new TextEncoder().encode(text);
  let sent = false;
  return new ReadableStream({
    async pull(controller) {
      if (sent) return;
      sent = true;
      ready();
      await release;
      controller.enqueue(bytes);
      controller.close();
    },
  });
}

describe("Product Session HTTP API", () => {
  test("Gateway absolute deadline 会 abort ProductSession/Agent 并恢复 settled authority", async () => {
    let receivedSignal: AbortSignal | undefined;
    const waitingFactory: OmpAgentClientFactory = (tools) => ({
      async start() {},
      async stop() {},
      async getState() {
        const names = tools.map((tool) => tool.name);
        return {
          sessionId: "session:waiting",
          toolNames: names,
          enabledToolNames: names,
          mountedToolNames: [],
        };
      },
      async promptAndWait(_message: string, signal?: AbortSignal) {
        receivedSignal = signal;
        if (!signal) return new Promise<never>(() => undefined);
        await new Promise<void>((resolve) => {
          if (signal.aborted) resolve();
          else signal.addEventListener("abort", () => resolve(), { once: true });
        });
        const write = tools.find((tool) => tool.name === "world_write");
        if (!write) throw new Error("缺少 world_write");
        await write.execute(
          "call:after-abort",
          { fixtureId: "fixture:primitive-box" },
          undefined,
          {} as never,
          signal,
        );
      },
      async getLastAssistantText() { return null; },
    });
    const api = createProductSessionApi(waitingFactory, 30);
    const created = await api.fetch(
      new Request("http://local.test/api/sessions", { method: "POST" }),
    );
    const { sessionId } = (await created.json()) as { sessionId: string };
    const response = await api.fetch(
      turnRequest(sessionId, JSON.stringify({ prompt: "运行" })),
    );
    const outcome = await Promise.race([
      response.text().then((text) => ({ kind: "settled", text })),
      new Promise<{ kind: "pending" }>((resolve) =>
        setTimeout(() => resolve({ kind: "pending" }), 150),
      ),
    ]);

    expect(outcome.kind).toBe("settled");
    expect(receivedSignal?.aborted).toBe(true);
    if (outcome.kind !== "settled") throw new Error("Gateway turn 未 settled");
    const events = outcome.text.trim().split("\n").map((line) => JSON.parse(line));
    expect(events.map((event) => event.type)).toEqual([
      "turn.started",
      "turn.failed",
    ]);
    const projection = await api.fetch(
      new Request(`http://local.test/api/sessions/${sessionId}`),
    );
    expect(await projection.json()).toMatchObject({
      running: false,
      world: null,
      lastRun: null,
    });
  });

  test("HTTP request abort 会贯穿到 Agent，不等待 Gateway max timeout", async () => {
    let receivedSignal: AbortSignal | undefined;
    const waitingFactory: OmpAgentClientFactory = (tools) => ({
      async start() {},
      async stop() {},
      async getState() {
        const names = tools.map((tool) => tool.name);
        return {
          sessionId: "session:request-abort",
          toolNames: names,
          enabledToolNames: names,
          mountedToolNames: [],
        };
      },
      async promptAndWait(_message: string, signal?: AbortSignal) {
        receivedSignal = signal;
        if (!signal) return new Promise<never>(() => undefined);
        await new Promise<never>((_, reject) => {
          const fail = () => reject(new Error("request aborted"));
          if (signal.aborted) fail();
          else signal.addEventListener("abort", fail, { once: true });
        });
      },
      async getLastAssistantText() { return null; },
    });
    const api = createProductSessionApi(waitingFactory, 5_000);
    const created = await api.fetch(
      new Request("http://local.test/api/sessions", { method: "POST" }),
    );
    const { sessionId } = (await created.json()) as { sessionId: string };
    const abort = new AbortController();
    const response = await api.fetch(new Request(
      `http://local.test/api/sessions/${sessionId}/turns`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ prompt: "运行" }),
        signal: abort.signal,
      },
    ));
    const settled = response.text();
    abort.abort();

    const outcome = await Promise.race([
      settled.then(() => "settled"),
      new Promise<string>((resolve) => setTimeout(() => resolve("pending"), 150)),
    ]);
    expect(outcome).toBe("settled");
    expect(receivedSignal?.aborted).toBe(true);
  });

  test("Gateway deadline 覆盖忽略 signal 的 OMP start/stop lifecycle 并恢复 running:false", async () => {
    for (const hangingPhase of ["start", "stop"] as const) {
      const factory: OmpAgentClientFactory = (tools) => ({
        async start() {
          if (hangingPhase === "start") {
            await new Promise<never>(() => undefined);
          }
        },
        async stop() {
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
          throw new Error("synthetic lifecycle failure");
        },
        async getLastAssistantText() { return null; },
      });
      const api = createProductSessionApi(factory, 30);
      const created = await api.fetch(
        new Request("http://local.test/api/sessions", { method: "POST" }),
      );
      const { sessionId } = (await created.json()) as { sessionId: string };
      const response = await api.fetch(
        turnRequest(sessionId, JSON.stringify({ prompt: "运行" })),
      );
      const outcome = await Promise.race([
        response.text().then(() => "settled" as const),
        new Promise<"pending">((resolve) =>
          setTimeout(() => resolve("pending"), 150),
        ),
      ]);

      expect(outcome).toBe("settled");
      const projection = await api.fetch(
        new Request(`http://local.test/api/sessions/${sessionId}`),
      );
      expect(await projection.json()).toMatchObject({ running: false });
    }
  });

  test("创建 session、流式执行 scripted turn，并从同一 authority resync", async () => {
    const baseUrl = await startApi();
    const createdResponse = await fetch(new URL("/api/sessions", baseUrl), {
      method: "POST",
    });
    expect(createdResponse.status).toBe(201);
    const created = (await createdResponse.json()) as {
      sessionId: string;
      world: unknown;
    };
    expect(created.sessionId).toMatch(/^session:local-\d+$/);
    expect(created.world).toBeNull();

    const turnResponse = await fetch(
      new URL(`/api/sessions/${created.sessionId}/turns`, baseUrl),
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          prompt: "创建一个方块，把高度改到 2.8 米，然后让它落到地面并检查结果。",
        }),
      },
    );
    expect(turnResponse.status).toBe(200);
    expect(turnResponse.headers.get("content-type")).toContain(
      "application/x-ndjson",
    );
    const events = (await turnResponse.text())
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line) as Record<string, unknown>);
    expect(events.map((event) => event.sequence)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(events.map((event) => event.type)).toEqual([
      "turn.started",
      "tool.completed",
      "tool.completed",
      "tool.completed",
      "tool.completed",
      "turn.completed",
    ]);
    expect(
      events
        .filter((event) => event.type === "tool.completed")
        .map((event) => event.tool),
    ).toEqual([
      "world_write",
      "world_read",
      "world_edit",
      "world_run",
    ]);

    const resyncResponse = await fetch(
      new URL(`/api/sessions/${created.sessionId}`, baseUrl),
    );
    expect(resyncResponse.status).toBe(200);
    const projection = (await resyncResponse.json()) as {
      world: { ref: { version: number }; snapshot: { id: string } };
      lastRun: {
        episode: { terminalSnapshot: { id: string } };
        evaluation: { passed: boolean };
      };
    };
    expect(projection.world.ref.version).toBe(2);
    expect(projection.lastRun.evaluation.passed).toBe(true);
    expect(projection.lastRun.episode.terminalSnapshot.id).not.toBe(
      projection.world.snapshot.id,
    );
  });

  test("非法 body、未知 session 与 Agent-facing adopt route 都 fail closed", async () => {
    const baseUrl = await startApi();
    const badBody = await fetch(new URL("/api/sessions/missing/turns", baseUrl), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ prompt: "运行", extra: true }),
    });
    expect(badBody.status).toBe(404);

    const adopt = await fetch(new URL("/api/sessions/session:local-1/adopt", baseUrl), {
      method: "POST",
    });
    expect(adopt.status).toBe(404);
    expect(await adopt.text()).not.toContain("RuntimeMvpHost");
  });

  test("同一 session 的并发 HTTP turn 只有一个能原子取得 execution authority", async () => {
    const api = createProductSessionApi(createScriptedAgentClientFactory());
    const created = await api.fetch(
      new Request("http://local.test/api/sessions", { method: "POST" }),
    );
    const { sessionId } = (await created.json()) as { sessionId: string };
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    let readyCount = 0;
    let bothReady!: () => void;
    const ready = new Promise<void>((resolve) => { bothReady = resolve; });
    const markReady = () => {
      readyCount += 1;
      if (readyCount === 2) bothReady();
    };
    const body = JSON.stringify({ prompt: "让方块落下" });
    const first = api.fetch(turnRequest(sessionId, controlledBody(body, markReady, gate)));
    const second = api.fetch(turnRequest(sessionId, controlledBody(body, markReady, gate)));
    await ready;
    release();
    const responses = await Promise.all([first, second]);
    const results = await Promise.all(
      responses.map(async (response) => ({
        status: response.status,
        lines: (await response.text()).trim().split("\n").filter(Boolean).length,
      })),
    );

    expect(results.map((result) => result.status).sort()).toEqual([200, 409]);
    expect(results.find((result) => result.status === 200)?.lines).toBe(6);
    expect(results.find((result) => result.status === 409)?.lines).toBe(1);
  });

  test("HTTP admission 按真实 UTF-8 bytes 限额并精确解析 JSON media type", async () => {
    const api = createProductSessionApi(createScriptedAgentClientFactory());
    const created = await api.fetch(
      new Request("http://local.test/api/sessions", { method: "POST" }),
    );
    const { sessionId } = (await created.json()) as { sessionId: string };
    const oversized = JSON.stringify({ prompt: "界".repeat(6_000) });
    const chunked = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(oversized));
        controller.close();
      },
    });

    const tooLarge = await api.fetch(turnRequest(sessionId, chunked));
    expect(tooLarge.status).toBe(400);
    expect(await tooLarge.json()).toEqual({ error: "turn_body_too_large" });

    const jsonp = await api.fetch(
      turnRequest(sessionId, JSON.stringify({ prompt: "运行" }), "application/jsonp"),
    );
    expect(jsonp.status).toBe(400);
    expect(await jsonp.json()).toEqual({ error: "invalid_content_type" });
  });

  test("产品 failure event 不转发 OMP、Host、path 或 credential-like internal message", async () => {
    const failingFactory: OmpAgentClientFactory = (tools) => {
      const client: OmpAgentClientPort = {
        async start() {},
        async stop() {},
        async getState() {
          const names = tools.map((tool) => tool.name);
          return {
            sessionId: "session:failing",
            toolNames: names,
            enabledToolNames: names,
            mountedToolNames: [],
          };
        },
        async promptAndWait() {
          throw new Error(
            "RuntimeMvpHost OMP /private/path apiKey=SYNTHETIC_SECRET_DO_NOT_USE",
          );
        },
        async getLastAssistantText() { return null; },
      };
      return client;
    };
    const api = createProductSessionApi(failingFactory);
    const created = await api.fetch(
      new Request("http://local.test/api/sessions", { method: "POST" }),
    );
    const { sessionId } = (await created.json()) as { sessionId: string };
    const response = await api.fetch(
      turnRequest(sessionId, JSON.stringify({ prompt: "运行" })),
    );
    const events = (await response.text()).trim().split("\n").map((line) => JSON.parse(line));
    const failed = events.at(-1) as {
      sequence: number;
      sessionId: string;
      turnId: string;
      type: string;
      error: string;
    };

    expect(failed).toEqual({
      sequence: 2,
      sessionId,
      turnId: `turn:${sessionId.slice("session:".length)}:1`,
      type: "turn.failed",
      error: "agent_turn_failed",
    });
    expect(JSON.stringify(events)).not.toContain("SYNTHETIC_SECRET_DO_NOT_USE");
    expect(JSON.stringify(events)).not.toContain("RuntimeMvpHost");
    expect(JSON.stringify(events)).not.toContain("OMP");
    expect(JSON.stringify(events)).not.toContain("/private/path");
  });
});
