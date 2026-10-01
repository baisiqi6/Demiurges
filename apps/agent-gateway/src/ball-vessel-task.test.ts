import { afterEach, describe, expect, mock, spyOn, test } from "bun:test";
import {
  BALL_REF, BALL_VESSEL_FIXTURE_ID, RuntimeMvpHost, WorldToolSurface,
  admitBallVesselTaskEdit, decodeBallVesselTaskPreview, decodeBallVesselTaskTransition,
  decodeProductSessionProjection, deepFreeze, deriveBallVesselPoseRepair, requireBallVesselTaskWorld,
  type ProductSessionProjection,
} from "@demiurges/world";
import { ProductSession, ProductSessionAuthoringFailure } from "./product-session";
import { createProductSessionApi } from "./product-session-api";
import { ProductSessionClient, ProductSessionAuthoringError, ProductSessionAuthorityUnavailableError } from "../../studio/src/product-session-client";

afterEach(() => mock.restore());
const offline = () => { throw new Error("测试不允许调用 Agent"); };
const edit = (prior: ProductSessionProjection, x: number, y: number, z: number) => ({
  expected: { ...prior.world!.ref }, targetRef: BALL_REF,
  change: { kind: "pose", frameRef: "frame:world", pose: {
    position: { x, y, z }, rotation: { x: 0, y: 0, z: 0, w: 1 },
  } },
});
function connected() {
  const api = createProductSessionApi(offline);
  const client = new ProductSessionClient((input, init) => api.fetch(new Request(`http://local.test${String(input)}`, init)));
  return { api, client };
}

describe("DH-023 离线 Ball-Vessel 任务", () => {
  test("三组不同失败初态通过真实 Gateway/client 完成 preview→edit→PASS，run 保持 Ref", async () => {
    const { client } = connected();
    const ids = new Set<string>();
    for (const [x, y, z] of [[1, 0, 1], [-1.2, 0.35, 1.6], [0.8, -1, 0.9]]) {
      const empty = await client.createSession();
      const created = await client.createBallWorld(empty);
      const positioned = await client.editBallWorld(created, edit(created, x!, y!, z!));
      const failed = await client.runBallWorld(positioned);
      expect(failed.world).toEqual(positioned.world);
      expect(failed.lastRun!.evaluation.passed).toBe(false);
      expect(ids.has(failed.lastRun!.episode.id)).toBe(false);
      ids.add(failed.lastRun!.episode.id);
      const preview = await client.previewBallRepair(failed);
      expect(preview.projection).toEqual(failed);
      expect(preview.proposal.status).toBe("available");
      if (preview.proposal.status !== "available") throw new Error("缺少 candidate");
      expect(preview.proposal.sourceRef).toEqual(failed.world!.ref);
      expect(preview.proposal.edit.change.pose.position).toEqual({ x: 0, y: 0, z: 0.7 });
      const fixed = await client.editBallWorld(failed, preview.proposal.edit);
      expect(fixed.world!.snapshot.parentId).toBe(failed.world!.snapshot.id);
      expect(fixed.lastRun).toBeNull();
      const passed = await client.runBallWorld(fixed);
      expect(passed.world).toEqual(fixed.world);
      expect(passed.lastRun!.evaluation.passed).toBe(true);
      expect((await client.previewBallRepair(passed)).proposal).toEqual({ status: "unavailable", reason: "already_passed" });
    }
  });

  test("HTTP preview 不接受外带 Episode，旧 candidate 的 expected Ref 不能覆盖新的初态", async () => {
    const { client, api } = connected();
    const created = await client.createBallWorld(await client.createSession());
    expect((await client.previewBallRepair(created)).proposal).toEqual({ status: "unavailable", reason: "run_required" });
    const failed = await client.runBallWorld(await client.editBallWorld(created, edit(created, 1, 0, 1)));
    const preview = await client.previewBallRepair(failed);
    if (preview.proposal.status !== "available") throw new Error("缺少 candidate");
    const next = await client.editBallWorld(failed, edit(failed, -1, 0.1, 1.4));
    const post = (path: string, body: unknown) => api.fetch(new Request(
      `http://local.test/api/sessions/${next.sessionId}/ball-vessel/${path}`, {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
      }));
    const stale = await post("edit", preview.proposal.edit);
    expect(stale.status).toBe(409);
    expect(await stale.json()).toEqual({ error: "STALE_REF" });
    expect((await post("run", { expected: failed.world!.ref })).status).toBe(409);
    expect((await post("repair", { episode: failed.lastRun!.episode })).status).toBe(413);
    expect((await post("repair", { episode: { id: failed.lastRun!.episode.id } })).status).toBe(400);
    expect(await client.readSession(next.sessionId)).toEqual(next);
  });

  test("world admission 拒绝移位的容器、修改的 geometry、velocity、rotation 与越界球位置", () => {
    const surface = new WorldToolSurface(new RuntimeMvpHost());
    surface.write({ fixtureId: BALL_VESSEL_FIXTURE_ID });
    const read = surface.read();
    for (const mutate of [
      (world: any) => { world.snapshot.scenarioId = "scenario:foreign"; },
      (world: any) => { world.snapshot.entities[1].state.pose.position[0] = 0.1; },
      (world: any) => { world.snapshot.entities[0].state.pose.position[2] = 1; },
      (world: any) => { world.snapshot.entities[2].representations.collision.radius = 0.2; },
      (world: any) => { world.snapshot.entities[2].state.linearVelocity[0] = 0; },
      (world: any) => { world.snapshot.entities[2].state.pose.position[0] = 3; },
      (world: any) => { world.snapshot.entities[2].state.pose.rotation.w = -1; },
      (world: any) => { world.ref.snapshotId = "snapshot:foreign"; },
    ]) {
      const changed = structuredClone(read); mutate(changed);
      expect(() => requireBallVesselTaskWorld(changed)).toThrow();
    }
    const prior = { world: read } as ProductSessionProjection;
    expect(() => admitBallVesselTaskEdit(read, edit(prior, 3, 0, 1))).toThrow();
  });

  test("shared decoder 拒绝不一致的 Evaluation、preview edit/source 与 transition lineage/sequence", async () => {
    const { client } = connected();
    const empty = await client.createSession(), created = await client.createBallWorld(empty);
    const positioned = await client.editBallWorld(created, edit(created, 1, 0, 1));
    const failed = await client.runBallWorld(positioned);
    const forged = structuredClone(failed) as any;
    forged.lastRun.evaluation.metrics.maxHorizontalOffsetMeters = 0;
    expect(() => decodeProductSessionProjection(forged)).toThrow();
    expect(deriveBallVesselPoseRepair(failed.world!, deepFreeze(forged.lastRun) as NonNullable<typeof failed.lastRun>)).toMatchObject({ status: "unavailable", reason: "invalid_evidence" });
    const preview = await client.previewBallRepair(failed);
    for (const mutate of [
      (value: any) => { value.proposal.edit.change.pose.position.x = 1; },
      (value: any) => { value.proposal.sourceRef.version += 1; },
      (value: any) => { value.proposal.sourceEpisodeId = "episode:foreign"; },
      (value: any) => { value.projection.lastSequence += 1; },
    ]) {
      const value = structuredClone(preview); mutate(value);
      expect(() => decodeBallVesselTaskPreview(value, failed.sessionId, failed)).toThrow();
    }
    let getterCalls = 0;
    const accessor = { projection: preview.projection, get proposal() { getterCalls += 1; return preview.proposal; } };
    expect(() => decodeBallVesselTaskPreview(accessor, failed.sessionId, failed)).toThrow();
    const nestedAccessor = structuredClone(preview) as any;
    Object.defineProperty(nestedAccessor.proposal.edit.change.pose.position, "x", { enumerable: true, get() { getterCalls += 1; return 0; } });
    expect(() => decodeBallVesselTaskPreview(nestedAccessor, failed.sessionId, failed)).toThrow();
    expect(getterCalls).toBe(0);
    for (const mutate of [
      (value: any) => { value.lastSequence += 1; },
      (value: any) => { value.world.snapshot.parentId = null; },
      (value: any) => { value.world.snapshot.entities[2].state.pose.position[0] = 0.5; },
    ]) {
      const value = structuredClone(positioned); mutate(value);
      expect(() => decodeBallVesselTaskTransition(value, created.sessionId, created, {
        kind: "edit", input: edit(created, 1, 0, 1) as any,
      })).toThrow();
    }
    expect(() => decodeBallVesselTaskTransition(failed, failed.sessionId, failed, {
      kind: "run", expected: failed.world!.ref,
    })).toThrow();
  });

  test("请求取消后 reservation 保持到 Runtime settle；迟到 run 不更新 lastRun，后续编辑可恢复", async () => {
    const session = new ProductSession("session:local-abort", offline);
    const created = session.tryCreateBallTask({})!;
    const before = session.tryEditBallTask(edit(created, 1, 0, 1))!;
    const original = WorldToolSurface.prototype.run;
    let release!: () => void;
    const waiting = new Promise<void>((resolve) => { release = resolve; });
    spyOn(WorldToolSurface.prototype, "run").mockImplementation(async function(this: WorldToolSurface, input: unknown) {
      await waiting;
      return original.call(this, input);
    });
    const controller = new AbortController();
    const pending = session.tryRunBallTask({ expected: before.world!.ref }, controller.signal)!;
    const rejected = pending.catch((error) => error);
    controller.abort();
    expect(session.readProjection().running).toBe(true);
    expect(session.tryEditBallTask(edit(before, -1, 0, 1))).toBeUndefined();
    expect(session.tryRunBallTask({ expected: before.world!.ref })).toBeUndefined();
    expect(session.tryPreviewBallTask({})).toBeUndefined();
    expect(session.tryRunTurn("ignored", () => undefined)).toBeUndefined();
    release();
    expect(await rejected).toBeInstanceOf(ProductSessionAuthoringFailure);
    expect(session.readProjection()).toEqual(before);
    expect(session.tryEditBallTask(edit(before, -1, 0, 1))!.world!.ref.version).toBe(before.world!.ref.version + 1);
  });

  test("client 拒绝伪造成功响应，并从 settled GET 恢复 actual authority", async () => {
    const session = new ProductSession("session:local-recovery", offline);
    const before = session.tryCreateBallTask({})!;
    const client = new ProductSessionClient(async (_input, init) => {
      if (init?.method === "POST") {
        const actual = session.tryEditBallTask(JSON.parse(String(init.body)))!;
        const forged = structuredClone(actual) as any; forged.lastSequence += 1;
        return Response.json(forged);
      }
      return Response.json(session.readProjection());
    });
    try { await client.editBallWorld(before, edit(before, 1, 0, 1)); throw new Error("应拒绝伪造成功"); }
    catch (error) {
      expect(error).toBeInstanceOf(ProductSessionAuthoringError);
      expect((error as ProductSessionAuthoringError).projection).toEqual(session.readProjection());
    }
  });

  test("POST 已改变世界但响应与 recovery GET 均丢失时，返回无 projection 的 authority error", async () => {
    const session = new ProductSession("session:local-disconnected", offline);
    const before = session.tryCreateBallTask({})!;
    const client = new ProductSessionClient(async (_input, init) => {
      if (init?.method === "POST") {
        session.tryEditBallTask(JSON.parse(String(init.body)));
        throw new Error("POST response lost");
      }
      throw new Error("GET unavailable");
    });
    try { await client.editBallWorld(before, edit(before, 1, 0, 1)); throw new Error("应失去 authority"); }
    catch (error) {
      expect(error).toBeInstanceOf(ProductSessionAuthorityUnavailableError);
      expect((error as ProductSessionAuthorityUnavailableError).sessionId).toBe(before.sessionId);
      expect(Object.hasOwn(error as object, "projection")).toBe(false);
      expect(session.readProjection().world!.ref.version).toBe(before.world!.ref.version + 1);
    }
  });
});
