import { describe, expect, test } from "bun:test";
import { createInitialSnapshot, findEntity, CUBE_REF } from "../kernel/world";
import { WorldRepository } from "./world-repository";

describe("WorldRepository", () => {
  test("edit 创建 child Snapshot，且不改变 base bytes", () => {
    const repository = new WorldRepository();
    const base = repository.write(createInitialSnapshot());
    const before = JSON.stringify(base);

    const edited = repository.editCubeHeight(base.id, 3.25);

    expect(edited.parentId).toBe(base.id);
    expect(edited.source).toBe("edit");
    expect(findEntity(edited, CUBE_REF).state.pose.position[2]).toBe(3.25);
    expect(JSON.stringify(base)).toBe(before);
    expect(findEntity(base, CUBE_REF).state.pose.position[2]).toBe(2);
    expect(repository.readRef().id).toBe(edited.id);
  });

  test("record terminal 不推进 ref，adopt 才推进", () => {
    const repository = new WorldRepository();
    const base = repository.write(createInitialSnapshot());
    const terminal = {
      ...base,
      id: "snapshot:terminal-test" as const,
      parentId: base.id,
      source: "runtime-terminal" as const,
    };

    repository.record(terminal);
    expect(repository.readRef().id).toBe(base.id);

    repository.adopt(terminal.id);
    expect(repository.readRef().id).toBe(terminal.id);
  });

  test("同一 Snapshot ID 不能静默替换已被 ref 指向的内容", () => {
    const repository = new WorldRepository();
    const base = repository.write(createInitialSnapshot());
    const first = {
      ...base,
      id: "snapshot:terminal-collision" as const,
      parentId: base.id,
      source: "runtime-terminal" as const,
    };

    const recorded = repository.record(first);
    repository.adopt(recorded.id);

    expect(Object.isFrozen(recorded)).toBe(true);
    expect(() =>
      repository.record({
        ...first,
        parentId: "snapshot:other",
      }),
    ).toThrow("Snapshot ID 冲突：snapshot:terminal-collision");
    expect(repository.readRef()).toBe(recorded);
    expect(repository.readRef().parentId).toBe(base.id);
  });

  test("即使 Snapshot root 已冻结，Repository 仍递归冻结 children", () => {
    const repository = new WorldRepository();
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
    repository.adopt(recorded.id);

    expect(Object.isFrozen(mutableHeight)).toBe(true);
    expect(() => {
      mutableHeight[2] = 9;
    }).toThrow(TypeError);
    expect(findEntity(repository.readRef(), CUBE_REF).state.pose.position[2]).toBe(2);
  });

  test("Repository 拒绝 parent 不可解析的 orphan lineage", () => {
    const repository = new WorldRepository();
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
    const repository = new WorldRepository();
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

  test("write/record/adopt 按 Snapshot source 分工，terminal 不能绕过 adopt", () => {
    const repository = new WorldRepository();
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
    expect(() => repository.adopt(base.id)).toThrow("adopt 只接纳 runtime-terminal");

    const recorded = repository.record(terminal);
    expect(repository.readRef()).toBe(base);
    expect(repository.adopt(recorded.id)).toBe(recorded);
  });
});
