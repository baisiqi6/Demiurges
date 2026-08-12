import { describe, expect, test } from "bun:test";
import { createBallVesselSnapshot } from "../artifacts/ball-vessel-fixture";
import { ADOPT_RUNTIME_MVP_POLICY } from "../host/runtime-mvp-adopt-policy";
import { createInitialSnapshot, findEntity, CUBE_REF } from "../kernel/world";
import { createWorldRepositoryAuthority } from "./world-repository";

const createRepository = () => {
  const authority = createWorldRepositoryAuthority();
  return { ...authority.repository, ...authority.evidence };
};

describe("WorldRepository", () => {
  test("write 在建立 canonical Ref 前拒绝 registered scenario 静态 identity 漂移", () => {
    const ballVesselAuthority = createRepository();
    const ballVesselDrift = structuredClone(createBallVesselSnapshot());
    const floor = ballVesselDrift.entities.find((entity) => entity.ref === "entity:floor")!;
    if (floor.representations.collision.kind !== "box") {
      throw new Error("fixture floor 必须是 box collision");
    }
    floor.representations.collision.halfExtents = [9.9, 9.9, 0.05];
    expect(() => ballVesselAuthority.write(ballVesselDrift)).toThrow(
      "fixture registry 漂移",
    );
    expect(() => ballVesselAuthority.readRef()).toThrow("尚未初始化");

    const vesselPhysicsAuthority = createRepository();
    const vesselPhysicsDrift = structuredClone(createBallVesselSnapshot());
    const vessel = vesselPhysicsDrift.entities.find((entity) => entity.ref === "entity:vessel")!;
    vessel.physics.friction = 0.01;
    expect(() => vesselPhysicsAuthority.write(vesselPhysicsDrift)).toThrow(
      "vessel physics 与 fixture registry 漂移",
    );
    expect(() => vesselPhysicsAuthority.readRef()).toThrow("尚未初始化");

    const fallingAuthority = createRepository();
    const fallingDrift = structuredClone(createInitialSnapshot());
    const fallingFloor = fallingDrift.entities.find((entity) => entity.ref === "entity:floor")!;
    if (fallingFloor.representations.collision.kind !== "box") {
      throw new Error("fixture floor 必须是 box collision");
    }
    fallingFloor.representations.collision.halfExtents = [9.9, 9.9, 0.05];
    expect(() => fallingAuthority.write(fallingDrift)).toThrow(
      "fixture registry 漂移",
    );
    expect(() => fallingAuthority.readRef()).toThrow("尚未初始化");
  });

  test("write 在初始化 authority ref 前拒绝重复 EntityRef", () => {
    const repository = createRepository();
    const duplicate = structuredClone(createInitialSnapshot());
    duplicate.id = "snapshot:duplicate-entity-ref";
    duplicate.entities[1]!.ref = duplicate.entities[0]!.ref;

    expect(() => repository.write(duplicate)).toThrow("EntityRef 必须唯一");
  });

  test("edit 创建 child Snapshot，且不改变 base bytes", () => {
    const repository = createRepository();
    const base = repository.write(createInitialSnapshot());
    const before = JSON.stringify(base);
    const observed = repository.readRefRecord();

    const edited = repository.editCubeHeight(base.id, 3.25);

    expect(edited.parentId).toBe(base.id);
    expect(edited.source).toBe("edit");
    expect(findEntity(edited, CUBE_REF).state.pose.position[2]).toBe(3.25);
    expect(JSON.stringify(base)).toBe(before);
    expect(findEntity(base, CUBE_REF).state.pose.position[2]).toBe(2);
    expect(repository.readRef()).toBe(base);
    expect(repository.advance(edited.id, observed).status).toBe("updated");
    expect(repository.readRef().id).toBe(edited.id);
  });

  test("单独 record terminal 不推进 ref，也不能代替 Episode evidence", () => {
    const repository = createRepository();
    const base = repository.write(createInitialSnapshot());
    const terminal = {
      ...base,
      id: "snapshot:terminal-test" as const,
      parentId: base.id,
      source: "runtime-terminal" as const,
    };

    repository.record(terminal);
    expect(repository.readRef().id).toBe(base.id);
    expect(repository.readSnapshot(terminal.id)).toBe(terminal);
  });

  test("同一 Snapshot ID 不能静默替换已被 ref 指向的内容", () => {
    const repository = createRepository();
    const base = repository.write(createInitialSnapshot());
    const first = {
      ...base,
      id: "snapshot:terminal-collision" as const,
      parentId: base.id,
      source: "runtime-terminal" as const,
    };

    const recorded = repository.record(first);

    expect(Object.isFrozen(recorded)).toBe(true);
    expect(() =>
      repository.record({
        ...first,
        parentId: "snapshot:other",
      }),
    ).toThrow("Snapshot ID 冲突：snapshot:terminal-collision");
    expect(repository.readSnapshot(recorded.id)).toBe(recorded);
    expect(repository.readRef()).toBe(base);
  });

  test("即使 Snapshot root 已冻结，Repository 仍递归冻结 children", () => {
    const repository = createRepository();
    const base = repository.write(createInitialSnapshot());
    const shallow = Object.freeze({
      ...structuredClone(base),
      id: "snapshot:terminal-shallow" as const,
      parentId: base.id,
      source: "runtime-terminal" as const,
    });
    const mutableHeight = shallow.entities.find((entity) => entity.ref === CUBE_REF)!
      .state.pose.position as unknown as number[];

    const recorded = repository.record(shallow);

    expect(Object.isFrozen(mutableHeight)).toBe(true);
    expect(() => {
      mutableHeight[2] = 9;
    }).toThrow(TypeError);
    expect(findEntity(repository.readSnapshot(recorded.id), CUBE_REF).state.pose.position[2]).toBe(2);
  });

  test("Repository 拒绝 parent 不可解析的 orphan lineage", () => {
    const repository = createRepository();
    const base = repository.write(createInitialSnapshot());

    expect(() =>
      repository.record({
        ...base,
        id: "snapshot:orphan" as const,
        parentId: "snapshot:missing",
        source: "runtime-terminal" as const,
      }),
    ).toThrow("parent Snapshot 不存在：snapshot:missing");
    expect(repository.readRef()).toBe(base);
  });

  test("runtime-terminal 不能以 null parent 冒充新的 root", () => {
    const repository = createRepository();
    const base = repository.write(createInitialSnapshot());

    expect(() =>
      repository.record({
        ...base,
        id: "snapshot:terminal-null-parent" as const,
        parentId: null,
        source: "runtime-terminal" as const,
      }),
    ).toThrow("runtime-terminal 必须声明 parentId");
    expect(repository.readRef()).toBe(base);
  });

  test("write/record/advance 按 Snapshot source 分工，terminal 不能绕过 authority gate", () => {
    const repository = createRepository();
    const base = repository.write(createInitialSnapshot());
    const terminal = {
      ...base,
      id: "snapshot:terminal-operation-boundary" as const,
      parentId: base.id,
      source: "runtime-terminal" as const,
    };

    expect(() => repository.write(terminal)).toThrow("write 只接纳 source: write");
    expect(repository.readRef()).toBe(base);
    expect(() => repository.record(base)).toThrow("record 只接纳 runtime-terminal");
    expect(() => repository.advance(base.id, repository.readRefRecord())).toThrow(
      "advance 只接纳 authored edit Snapshot",
    );

    const recorded = repository.record(terminal);
    expect(repository.readRef()).toBe(base);
    expect(repository.readSnapshot(recorded.id)).toBe(recorded);
  });
});
