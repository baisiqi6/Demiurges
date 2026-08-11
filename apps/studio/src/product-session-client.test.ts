import { describe, expect, test } from "bun:test";

import {
  CURRENT_WORLD_REF,
  createInitialSnapshot,
  isDeepFrozen,
} from "@demiurges/world";
import {
  ProductSessionClient,
  ProductSessionTurnError,
  readProductSessionEvents,
} from "./product-session-client";

function chunkedResponse(chunks: readonly string[]): Response {
  const encoder = new TextEncoder();
  return new Response(
    new ReadableStream<Uint8Array>({
      start(controller) {
        for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
        controller.close();
      },
    }),
    { headers: { "content-type": "application/x-ndjson" } },
  );
}

describe("Studio Product Session client", () => {
  test("NDJSON 可跨任意 chunk 边界解析，并冻结有序产品事件", async () => {
    const snapshot = createInitialSnapshot();
    const lines = [
      JSON.stringify({
        sequence: 1,
        sessionId: "session:local-1",
        turnId: "turn:local-1:1",
        type: "turn.started",
      }),
      JSON.stringify({
        sequence: 2,
        sessionId: "session:local-1",
        turnId: "turn:local-1:1",
        type: "tool.completed",
        tool: "world_write",
        trace: {
          sequence: 1,
          tool: "world_write",
          input: { cubeHeight: 2 },
          status: "succeeded",
          result: { tool: "write" },
        },
        evidence: {
          tool: "write",
          ref: { name: CURRENT_WORLD_REF, snapshotId: snapshot.id, version: 1 },
          snapshot,
        },
      }),
      JSON.stringify({
        sequence: 3,
        sessionId: "session:local-1",
        turnId: "turn:local-1:1",
        type: "turn.completed",
        responseText: "完成",
      }),
    ].join("\n") + "\n";
    const split = Math.floor(lines.length / 2);
    const events: unknown[] = [];

    await readProductSessionEvents(
      chunkedResponse([lines.slice(0, split), lines.slice(split)]),
      "session:local-1",
      (event) => {
        events.push(event);
      },
    );

    expect(events).toHaveLength(3);
    expect(isDeepFrozen(events)).toBe(false);
    expect(events.every((event) => isDeepFrozen(event))).toBe(true);
  });

  test("sequence 缺口与 session identity 漂移 fail closed", async () => {
    const invalid = `${JSON.stringify({
      sequence: 2,
      sessionId: "session:other",
      turnId: "turn:other:1",
      type: "turn.started",
    })}\n`;

    await expect(
      readProductSessionEvents(
        chunkedResponse([invalid]),
        "session:local-1",
        () => undefined,
      ),
    ).rejects.toThrow("event sequence");
  });

  test("空 200 NDJSON 与缺少 terminal event 都 fail closed，且失败后执行权威 resync", async () => {
    let calls = 0;
    const projection = {
      sessionId: "session:local-1",
      world: null,
      lastRun: null,
      lastSequence: 0,
      running: false,
    };
    const client = new ProductSessionClient(async () => {
      calls += 1;
      if (calls === 1) return chunkedResponse([]);
      return Response.json(projection);
    });

    let caught: unknown;
    try {
      await client.runTurn("session:local-1", "运行", 1, () => undefined);
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(ProductSessionTurnError);
    expect((caught as ProductSessionTurnError).projection).toEqual(projection);
    expect(calls).toBe(2);
  });

  test("断流后 resync，并拒绝跨 turn identity、负 trace sequence 与 tool/evidence 错配", async () => {
    const invalidEvent = JSON.stringify({
      sequence: 1,
      sessionId: "session:local-1",
      turnId: "turn:other-session:999",
      type: "tool.completed",
      tool: "world_write",
      trace: {
        sequence: -99,
        tool: "world_write",
        input: {},
        status: "succeeded",
      },
      evidence: { tool: "run" },
    });

    await expect(
      readProductSessionEvents(
        chunkedResponse([`${invalidEvent}\n`]),
        "session:local-1",
        () => undefined,
      ),
    ).rejects.toThrow();

    let calls = 0;
    const client = new ProductSessionClient(async () => {
      calls += 1;
      if (calls === 1) {
        const encoder = new TextEncoder();
        return new Response(
          new ReadableStream<Uint8Array>({
            start(controller) {
              controller.enqueue(encoder.encode(`${JSON.stringify({
                sequence: 1,
                sessionId: "session:local-1",
                turnId: "turn:local-1:1",
                type: "turn.started",
              })}\n`));
              controller.error(new Error("simulated disconnect"));
            },
          }),
          { headers: { "content-type": "application/x-ndjson" } },
        );
      }
      return Response.json({
        sessionId: "session:local-1",
        world: null,
        lastRun: null,
        lastSequence: 1,
        running: false,
      });
    });

    await expect(
      client.runTurn("session:local-1", "运行", 1, () => undefined),
    ).rejects.toBeInstanceOf(ProductSessionTurnError);
    expect(calls).toBe(2);
  });

  test("断流后的 resync 会 bounded follow-up 到 non-running authoritative projection", async () => {
    let calls = 0;
    const client = new ProductSessionClient(async () => {
      calls += 1;
      if (calls === 1) {
        const encoder = new TextEncoder();
        return new Response(new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(encoder.encode(`${JSON.stringify({
              sequence: 1,
              sessionId: "session:local-1",
              turnId: "turn:local-1:1",
              type: "turn.started",
            })}\n`));
            controller.error(new Error("simulated disconnect"));
          },
        }), { headers: { "content-type": "application/x-ndjson" } });
      }
      return Response.json({
        sessionId: "session:local-1",
        world: null,
        lastRun: null,
        lastSequence: calls === 2 ? 1 : 2,
        running: calls === 2,
      });
    });

    let caught: unknown;
    try {
      await client.runTurn("session:local-1", "运行", 1, () => undefined);
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(ProductSessionTurnError);
    expect((caught as ProductSessionTurnError).projection.running).toBe(false);
    expect((caught as ProductSessionTurnError).projection.lastSequence).toBe(2);
    expect(calls).toBe(3);
  });

  test("settled resync 的 wall-clock deadline 同时约束悬挂 GET", async () => {
    let calls = 0;
    const client = new ProductSessionClient(async () => {
      calls += 1;
      if (calls === 1) {
        return new Response(new ReadableStream<Uint8Array>({
          start(controller) {
            controller.error(new Error("simulated disconnect"));
          },
        }), { headers: { "content-type": "application/x-ndjson" } });
      }
      return new Promise<Response>(() => undefined);
    }, 30);

    const outcome = await Promise.race([
      client.runTurn("session:local-1", "运行", 1, () => undefined).then(
        () => "resolved",
        () => "rejected",
      ),
      new Promise<string>((resolve) => setTimeout(() => resolve("still_pending"), 100)),
    ]);

    expect(outcome).toBe("rejected");
    expect(calls).toBe(2);
  });

  test("单一 turn deadline 约束忽略 AbortSignal 的悬挂 POST", async () => {
    const client = new ProductSessionClient(
      async () => new Promise<Response>(() => undefined),
      30,
    );

    const outcome = await Promise.race([
      client.runTurn("session:local-1", "运行", 1, () => undefined).then(
        () => "resolved",
        () => "rejected",
      ),
      new Promise<string>((resolve) => setTimeout(() => resolve("still_pending"), 120)),
    ]);

    expect(outcome).toBe("rejected");
  });

  test("同一 turn deadline 也约束 terminal stream 后悬挂的 final GET", async () => {
    let calls = 0;
    const completed = [
      {
        sequence: 1,
        sessionId: "session:local-1",
        turnId: "turn:local-1:1",
        type: "turn.started",
      },
      {
        sequence: 2,
        sessionId: "session:local-1",
        turnId: "turn:local-1:1",
        type: "turn.completed",
        responseText: "完成",
      },
    ];
    const client = new ProductSessionClient(async () => {
      calls += 1;
      if (calls === 1) {
        return chunkedResponse([
          `${completed.map((event) => JSON.stringify(event)).join("\n")}\n`,
        ]);
      }
      return new Promise<Response>(() => undefined);
    }, 30);

    const outcome = await Promise.race([
      client.runTurn("session:local-1", "运行", 1, () => undefined).then(
        () => "resolved",
        () => "rejected",
      ),
      new Promise<string>((resolve) => setTimeout(() => resolve("still_pending"), 120)),
    ]);

    expect(outcome).toBe("rejected");
    expect(calls).toBe(2);
  });

  test("调用方 abort 即使遇到忽略 signal 的 port 也会 bounded reject", async () => {
    const controller = new AbortController();
    const client = new ProductSessionClient(
      async () => new Promise<Response>(() => undefined),
      5_000,
    );
    const pending = client.runTurn(
      "session:local-1",
      "运行",
      1,
      () => undefined,
      controller.signal,
    );

    controller.abort();
    const outcome = await Promise.race([
      pending.then(() => "resolved", () => "rejected"),
      new Promise<string>((resolve) => setTimeout(() => resolve("still_pending"), 100)),
    ]);

    expect(outcome).toBe("rejected");
  });

  test("tool failure 是可恢复中间 evidence，turn outcome 由 terminal event 决定", async () => {
    const events = [
      {
        sequence: 1,
        sessionId: "session:local-1",
        turnId: "turn:local-1:1",
        type: "turn.started",
      },
      {
        sequence: 2,
        sessionId: "session:local-1",
        turnId: "turn:local-1:1",
        type: "tool.completed",
        tool: "world_write",
        trace: {
          sequence: 1,
          tool: "world_write",
          input: "[redacted]",
          status: "failed",
          error: "world_tool_failed",
        },
      },
      {
        sequence: 3,
        sessionId: "session:local-1",
        turnId: "turn:local-1:1",
        type: "turn.completed",
        responseText: "已纠正并完成",
      },
    ];
    const terminal = await readProductSessionEvents(
      chunkedResponse([`${events.map((event) => JSON.stringify(event)).join("\n")}\n`]),
      "session:local-1",
      () => undefined,
    );

    expect(terminal.type).toBe("turn.completed");
  });

  test("单 turn event 总量超过 start + 128 tools + terminal 时 fail closed", async () => {
    const events = [{
      sequence: 1,
      sessionId: "session:local-1",
      turnId: "turn:local-1:1",
      type: "turn.started",
    }];
    for (let index = 1; index <= 129; index += 1) {
      events.push({
        sequence: index + 1,
        sessionId: "session:local-1",
        turnId: "turn:local-1:1",
        type: "tool.completed",
        tool: "world_write",
        trace: {
          sequence: index,
          tool: "world_write",
          input: "[redacted]",
          status: "failed",
          error: "world_tool_failed",
        },
      } as never);
    }
    events.push({
      sequence: 131,
      sessionId: "session:local-1",
      turnId: "turn:local-1:1",
      type: "turn.failed",
      error: "agent_turn_failed",
    } as never);
    const ndjson = `${events.map((event) => JSON.stringify(event)).join("\n")}\n`;

    await expect(readProductSessionEvents(
      chunkedResponse([ndjson]),
      "session:local-1",
      () => undefined,
    )).rejects.toThrow("event 总量");

    const legal = events.slice(0, 129);
    legal.push({
      sequence: 130,
      sessionId: "session:local-1",
      turnId: "turn:local-1:1",
      type: "turn.failed",
      error: "agent_turn_failed",
    } as never);
    const legalNdjson = `${legal.map((event) => JSON.stringify(event)).join("\n")}\n`;
    const terminal = await readProductSessionEvents(
      chunkedResponse([legalNdjson]),
      "session:local-1",
      () => undefined,
    );
    expect(terminal.type).toBe("turn.failed");
  });

  test("projection 与 response media type 有严格 DTO 和总 byte budget", async () => {
    const malformed = JSON.stringify({
      sessionId: "session:local-1",
      world: { unexpected: "x".repeat(2_500_000) },
      lastRun: { tool: "write" },
      lastSequence: 0,
      running: false,
    });
    const oversizedClient = new ProductSessionClient(async () =>
      new Response(malformed, { headers: { "content-type": "application/json" } }),
    );
    await expect(oversizedClient.createSession()).rejects.toThrow("bytes");

    const disguised = chunkedResponse([
      `${JSON.stringify({
        sequence: 1,
        sessionId: "session:local-1",
        turnId: "turn:local-1:1",
        type: "turn.started",
      })}\n`,
    ]);
    disguised.headers.set(
      "content-type",
      "text/plain; profile=application/x-ndjson",
    );
    await expect(
      readProductSessionEvents(disguised, "session:local-1", () => undefined),
    ).rejects.toThrow("NDJSON");
  });
});
