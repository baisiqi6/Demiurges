import { CUBE_REF, CURRENT_WORLD_REF, deepFreeze, findEntity, isDeepFrozen } from "../kernel/world";
import type { Entity, Snapshot } from "../kernel/types";

export class WorldRepository {
  readonly #snapshots = new Map<Snapshot["id"], Snapshot>();
  readonly #refs = new Map<string, Snapshot["id"]>();
  #editSequence = 0;

  #insert(snapshot: Snapshot): Snapshot {
    if (this.#snapshots.has(snapshot.id)) {
      throw new Error(`Snapshot ID 冲突：${snapshot.id}`);
    }
    if (snapshot.source === "write" && snapshot.parentId !== null) {
      throw new Error("write Snapshot 的 parentId 必须为 null");
    }
    if (snapshot.source !== "write" && snapshot.parentId === null) {
      throw new Error(`${snapshot.source} 必须声明 parentId`);
    }
    if (snapshot.parentId !== null && !this.#snapshots.has(snapshot.parentId)) {
      throw new Error(`parent Snapshot 不存在：${snapshot.parentId}`);
    }
    const frozen = deepFreeze(snapshot) as Snapshot;
    if (!isDeepFrozen(frozen)) {
      throw new Error("Snapshot 必须是递归冻结的 plain data record");
    }
    this.#snapshots.set(frozen.id, frozen);
    return frozen;
  }

  write(snapshot: Snapshot, ref = CURRENT_WORLD_REF): Snapshot {
    if (snapshot.source !== "write") {
      throw new Error("write 只接纳 source: write 的 root Snapshot");
    }
    const inserted = this.#insert(snapshot);
    this.#refs.set(ref, inserted.id);
    return inserted;
  }

  record(snapshot: Snapshot): Snapshot {
    if (snapshot.source !== "runtime-terminal") {
      throw new Error("record 只接纳 runtime-terminal Snapshot");
    }
    return this.#insert(snapshot);
  }

  readSnapshot(id: Snapshot["id"]): Snapshot {
    const snapshot = this.#snapshots.get(id);
    if (!snapshot) {
      throw new Error(`Repository 中不存在 ${id}`);
    }
    return snapshot;
  }

  readRef(ref = CURRENT_WORLD_REF): Snapshot {
    const id = this.#refs.get(ref);
    if (!id) {
      throw new Error(`Repository ref ${ref} 尚未初始化`);
    }
    return this.readSnapshot(id);
  }

  editCubeHeight(parentId: Snapshot["id"], height: number, ref = CURRENT_WORLD_REF): Snapshot {
    if (!Number.isFinite(height) || height < 0.5 || height > 4) {
      throw new Error("方块高度必须在 0.5m 到 4m 之间");
    }

    const parent = this.readSnapshot(parentId);
    findEntity(parent, CUBE_REF);
    this.#editSequence += 1;

    const entities = parent.entities.map((entity): Entity => {
      if (entity.ref !== CUBE_REF) {
        return entity;
      }
      return {
        ...entity,
        state: {
          ...entity.state,
          pose: {
            ...entity.state.pose,
            position: [
              entity.state.pose.position[0],
              entity.state.pose.position[1],
              height,
            ],
          },
        },
      };
    });

    const child = deepFreeze({
      schemaVersion: 1,
      id: `snapshot:edit-${this.#editSequence}`,
      parentId: parent.id,
      source: "edit",
      entities,
    }) as Snapshot;

    const inserted = this.#insert(child);
    this.#refs.set(ref, inserted.id);
    return inserted;
  }

  adopt(snapshotId: Snapshot["id"], ref = CURRENT_WORLD_REF): Snapshot {
    const snapshot = this.readSnapshot(snapshotId);
    if (snapshot.source !== "runtime-terminal") {
      throw new Error("adopt 只接纳 runtime-terminal Snapshot");
    }
    this.#refs.set(ref, snapshot.id);
    return snapshot;
  }
}
