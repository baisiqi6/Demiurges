import { describe, expect, test } from "bun:test";

import {
  CURRENT_WORLD_REF,
  BALL_VESSEL_FIXTURE_ID,
  DIAGNOSTIC_RIGID_FIXTURE_ID,
  TWO_JOINT_REACH_FIXTURE_ID,
  MARBLE_HUNYUAN_COMPOSITE_FIXTURE_ID,
  PRIMITIVE_BOX_FIXTURE_ID,
  RuntimeMvpHost,
  WorldToolSurface,
  createInitialSnapshot,
  decodeProductSessionAuthoringTransition,
  isDeepFrozen,
} from "@demiurges/world";
import {
  ProductSessionClient,
  ProductSessionAuthoringError,
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
  test("human authoring client 验证 root/child transition，并在 no-op 时不发请求", async () => {
    const sessionId = "session:local-authoring";
    const surface = new WorldToolSurface(new RuntimeMvpHost());
    const empty = { sessionId, world: null, lastRun: null, lastSequence: 0, running: false } as const;
    let calls = 0;
    const client = new ProductSessionClient(async (input, init) => {
      calls += 1;
      const url = String(input);
      if (url.endsWith("/world/write")) {
        surface.write({ fixtureId: MARBLE_HUNYUAN_COMPOSITE_FIXTURE_ID });
      } else if (url.endsWith("/world/edit")) {
        surface.edit(JSON.parse(String(init?.body)));
      }
      return Response.json({
        sessionId,
        world: surface.read(),
        lastRun: null,
        lastSequence: 0,
        running: false,
      });
    });
    const written = await client.writeWorld(sessionId, {
      fixtureId: MARBLE_HUNYUAN_COMPOSITE_FIXTURE_ID,
    }, empty);
    expect(written.world?.ref.version).toBe(1);

    const noOp = await client.editWorld(sessionId, {
      expected: { ...written.world!.ref },
      targetRef: "entity:generated-object",
      change: { kind: "pose", frameRef: "frame:world", pose: {
        position: { x: 0, y: 0, z: 1.2 },
        rotation: { x: 0, y: 0, z: 0, w: 1 },
      } },
    }, written);
    expect(noOp).toEqual(written);
    expect(calls).toBe(1);

    const edited = await client.editWorld(sessionId, {
      expected: { ...written.world!.ref },
      targetRef: "entity:generated-object",
      change: { kind: "pose", frameRef: "frame:world", pose: {
        position: { x: 0.2, y: 0, z: 1.2 },
        rotation: { x: 0, y: 0, z: 0, w: 1 },
      } },
    }, written);
    expect(edited.world?.ref.version).toBe(2);
    expect(calls).toBe(2);
  });

  test("semantic no-op 也必须通过 settled transition authority", async () => {
    const sessionId = "session:local-running-no-op";
    const surface = new WorldToolSurface(new RuntimeMvpHost());
    surface.write({ fixtureId: MARBLE_HUNYUAN_COMPOSITE_FIXTURE_ID });
    const world = surface.read();
    const prior = {
      sessionId,
      world,
      lastRun: null,
      lastSequence: 0,
      running: true,
    } as const;
    let calls = 0;
    const client = new ProductSessionClient(async () => {
      calls += 1;
      return Response.json(prior);
    });

    await expect(client.editWorld(sessionId, {
      expected: { ...world.ref },
      targetRef: "entity:generated-object",
      change: { kind: "pose", frameRef: "frame:world", pose: {
        position: { x: 0, y: 0, z: 1.2 },
        rotation: { x: 0, y: 0, z: 0, w: 1 },
      } },
    }, prior)).rejects.toThrow("prior 必须 settled");
    expect(calls).toBe(0);
  });

  test("forged authoring transition fail closed 后以无旧 expectedWorld 的 GET resync", async () => {
    const sessionId = "session:local-forged-authoring";
    const surface = new WorldToolSurface(new RuntimeMvpHost());
    surface.write({ fixtureId: MARBLE_HUNYUAN_COMPOSITE_FIXTURE_ID });
    const prior = { sessionId, world: surface.read(), lastRun: null, lastSequence: 0, running: false } as const;
    const forged = structuredClone(prior) as any;
    forged.world.ref.version = 2;
    forged.world.snapshot.id = "snapshot:edit-forged";
    forged.world.ref.snapshotId = forged.world.snapshot.id;
    forged.world.snapshot.parentId = prior.world.snapshot.id;
    forged.world.snapshot.source = "edit";
    forged.world.snapshot.entities[0].label = "forged environment";
    let calls = 0;
    const client = new ProductSessionClient(async () => {
      calls += 1;
      return Response.json(calls === 1 ? forged : prior);
    });

    await expect(client.editWorld(sessionId, {
      expected: { ...prior.world.ref },
      targetRef: "entity:generated-object",
      change: { kind: "pose", frameRef: "frame:world", pose: {
        position: { x: 0.2, y: 0, z: 1.2 },
        rotation: { x: 0, y: 0, z: 0, w: 1 },
      } },
    }, prior)).rejects.toBeInstanceOf(ProductSessionAuthoringError);
    expect(calls).toBe(2);
  });

  test("authoring transition 拒绝仍在 running 的 prior projection", async () => {
    const sessionId = "session:local-running-prior";
    const surface = new WorldToolSurface(new RuntimeMvpHost());
    surface.write({ fixtureId: MARBLE_HUNYUAN_COMPOSITE_FIXTURE_ID });
    const prior = {
      sessionId,
      world: null,
      lastRun: null,
      lastSequence: 0,
      running: true,
    } as const;
    const returned = {
      sessionId,
      world: surface.read(),
      lastRun: null,
      lastSequence: 0,
      running: false,
    } as const;

    await expect(decodeProductSessionAuthoringTransition(
      returned,
      sessionId,
      prior,
      { kind: "write", input: { fixtureId: MARBLE_HUNYUAN_COMPOSITE_FIXTURE_ID } },
    )).rejects.toThrow("prior 必须 settled");
  });

  test("authoring transition 的 unchanged/updated 都拒绝 non-composite authority", async () => {
    const sessionId = "session:local-non-composite-authoring";
    const surface = new WorldToolSurface(new RuntimeMvpHost());
    surface.write({ fixtureId: PRIMITIVE_BOX_FIXTURE_ID });
    const primitive = surface.read();
    const prior = {
      sessionId,
      world: primitive,
      lastRun: null,
      lastSequence: 0,
      running: false,
    } as const;

    await expect(decodeProductSessionAuthoringTransition(
      prior,
      sessionId,
      prior,
      { kind: "edit", outcome: "unchanged" },
    )).rejects.toThrow("exact composite world authority");

    const cube = primitive.snapshot.entities.find((entity) => entity.ref === "entity:cube");
    if (!cube) throw new Error("primitive fixture 缺少 cube");
    const pose = cube.state.pose;
    surface.edit({
      expected: { ...primitive.ref },
      targetRef: "entity:cube",
      change: {
        kind: "pose",
        frameRef: "frame:world",
        pose: {
          position: { x: pose.position[0], y: pose.position[1], z: pose.position[2] },
          rotation: { ...pose.rotation },
        },
      },
    });
    const returned = {
      ...prior,
      world: surface.read(),
    } as const;
    await expect(decodeProductSessionAuthoringTransition(
      returned,
      sessionId,
      prior,
      {
        kind: "edit",
        outcome: "updated",
        input: {
          expected: primitive.ref,
          targetRef: "entity:generated-object",
          change: { kind: "pose", frameRef: "frame:world", pose },
        },
      },
    )).rejects.toThrow("exact composite world authority");
  });

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
          input: { fixtureId: "fixture:primitive-box" },
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

  test("streamed world_run 必须绑定当前 authored world 的完整 EntityRef 证据链", async () => {
    const surface = new WorldToolSurface(new RuntimeMvpHost());
    surface.write({ fixtureId: DIAGNOSTIC_RIGID_FIXTURE_ID });
    const world = surface.read();
    const forgedRun = structuredClone(await surface.run({
      runId: "run:stream-forged",
      program: { kind: "free-fall", targetRef: "entity:cube", durationSeconds: 2.5, sampleRateHz: 30 },
    }));
    const firstStates = forgedRun.episode.samples[0]?.states;
    if (!firstStates?.["entity:cube"]) throw new Error("fixture 缺少 cube sample");
    const mutableStates = firstStates as Record<string, (typeof firstStates)[`entity:${string}`]>;
    mutableStates["entity:spoof"] = firstStates["entity:cube"];
    delete mutableStates["entity:cube"];

    const lines = [
      {
        sequence: 1,
        sessionId: "session:local-stream",
        turnId: "turn:local-stream:1",
        type: "turn.started",
      },
      {
        sequence: 2,
        sessionId: "session:local-stream",
        turnId: "turn:local-stream:1",
        type: "tool.completed",
        tool: "world_run",
        trace: {
          sequence: 1,
          tool: "world_run",
          input: {
            runId: "run:stream-forged",
            program: { kind: "free-fall", targetRef: "entity:cube", durationSeconds: 2.5, sampleRateHz: 30 },
          },
          status: "succeeded",
          result: { tool: "run" },
        },
        evidence: forgedRun,
      },
      {
        sequence: 3,
        sessionId: "session:local-stream",
        turnId: "turn:local-stream:1",
        type: "turn.completed",
        responseText: "完成",
      },
    ].map((event) => JSON.stringify(event)).join("\n") + "\n";

    await expect(readProductSessionEvents(
      chunkedResponse([lines]),
      "session:local-stream",
      () => undefined,
      1,
      undefined,
      world,
    )).rejects.toThrow("EntityRef 证据链");
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

  test("completed、failed 与断流后的 projection 都不能替换已验证的 world lineage", async () => {
    const armSurface = new WorldToolSurface(new RuntimeMvpHost());
    armSurface.write({ fixtureId: TWO_JOINT_REACH_FIXTURE_ID });
    const armWorld = armSurface.read();
    const vesselSurface = new WorldToolSurface(new RuntimeMvpHost());
    vesselSurface.write({ fixtureId: BALL_VESSEL_FIXTURE_ID });
    const vesselWorld = vesselSurface.read();
    const sessionId = "session:local-edit-continuity";
    const turnId = "turn:local-edit-continuity:1";
    const projection = {
      sessionId,
      world: vesselWorld,
      lastRun: null,
      lastSequence: 3,
      running: false,
    };

    for (const lifecycle of ["completed", "failed", "disconnected"] as const) {
      const terminal = lifecycle === "failed"
        ? { sequence: 2, sessionId, turnId, type: "turn.failed", error: "failed" }
        : { sequence: 2, sessionId, turnId, type: "turn.completed", responseText: "done" };
      const events = [
        { sequence: 1, sessionId, turnId, type: "turn.started" },
        terminal,
      ];
      let calls = 0;
      const client = new ProductSessionClient(async () => {
        calls += 1;
        if (calls === 1) {
          if (lifecycle !== "disconnected") {
            return chunkedResponse([`${events.map((event) => JSON.stringify(event)).join("\n")}\n`]);
          }
          const encoder = new TextEncoder();
          return new Response(new ReadableStream<Uint8Array>({
            start(controller) {
              controller.enqueue(encoder.encode(`${JSON.stringify(events[0])}\n`));
              controller.error(new Error("simulated disconnect"));
            },
          }), { headers: { "content-type": "application/x-ndjson" } });
        }
        return Response.json(projection);
      }, 2_000);

      await expect(client.runTurn(
        sessionId,
        "go",
        1,
        () => undefined,
        undefined,
        armWorld,
      )).rejects.toThrow("world authority");
      expect(calls).toBe(2);
    }
  });

  test("streamed world_read/write 不能替换已验证 world lineage", async () => {
    const armSurface = new WorldToolSurface(new RuntimeMvpHost());
    armSurface.write({ fixtureId: TWO_JOINT_REACH_FIXTURE_ID });
    const armWorld = armSurface.read();
    const vesselSurface = new WorldToolSurface(new RuntimeMvpHost());
    const vesselWrite = vesselSurface.write({ fixtureId: BALL_VESSEL_FIXTURE_ID });
    const vesselRead = { ...vesselSurface.read(), tool: "read" as const };
    const sessionId = "session:local-event-continuity";
    const turnId = "turn:local-event-continuity:1";

    for (const [tool, evidence] of [
      ["world_read", vesselRead],
      ["world_write", vesselWrite],
    ] as const) {
      const events = [
        { sequence: 1, sessionId, turnId, type: "turn.started" },
        {
          sequence: 2,
          sessionId,
          turnId,
          type: "tool.completed",
          tool,
          trace: { sequence: 1, tool, input: {}, status: "succeeded", result: {} },
          evidence,
        },
      ];
      await expect(readProductSessionEvents(
        chunkedResponse([`${events.map((event) => JSON.stringify(event)).join("\n")}\n`]),
        sessionId,
        () => undefined,
        1,
        undefined,
        armWorld,
      )).rejects.toThrow(tool === "world_write" ? "不得替换" : "前序 world authority");
    }
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
