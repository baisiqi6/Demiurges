# DH-010 Vessel Physics / stale-ref Remediation Evidence

## Authority 与范围

- Human 于 2026-08-11 授权 bounded vessel-physics registered identity 与 stale-ref `lastRun` lifecycle remediation；
- cwd：`/Users/Admin/projects/WorkTrees/Demiurges-DH-010`；
- branch：`agent/codex/DH-010`；
- base / HEAD：`22e288690937834135584d023e4140e26696f761`；
- 本轮未获得 fresh reviewer、commit、push、PR、merge、tag、deploy、closeout 或 `mark-done` authority。

历史 `changes_requested` verdict append-only 保留；本文件只证明当前 remediation candidate。

## RED

先将 reviewer/operator 的两个 executable blocker 固化到 public behavior tests：

1. canonical vessel friction `0.8 → 0.01` 必须在 Kernel fixture validator、Repository Ref 初始化、Runtime MJCF compile 与 Product codec transport admission 前 fail closed；
2. 第一 turn 产生有效 `lastRun` 后，第二 turn 的 stale CAS edit 返回 `update.status="stale_ref"`、current Ref 不变时必须保留该 evidence；后续 fresh edit 真正 `updated` 时才清除。

修复前定向结果：

```text
38 pass / 4 fail / 273 assertions
```

四个失败恰好是 Kernel、Repository、Runtime 的 vessel friction fail-open 与 ProductSession stale-ref evidence loss。

## 最小根修复

### Registered vessel physics

`ball-vessel-fixture.ts` 增加 file-local、递归冻结的唯一 `VESSEL_PHYSICS` 常量；canonical Snapshot 构造与 `requireRegisteredVessel()` 共同消费它。validator 现在分别闭合：

- `bodyType="static"`；
- `massKg=0`；
- `friction=0.8`。

没有新增 exported registry、scenario patch 或第二套 codec constant。由于 Repository、Runtime 与 Product codec 已共同消费 `requireRegisteredSnapshotIdentity → requireBallVesselSnapshot`，该一处修复同时关闭三条 authority path。physics drift 使用独立错误 `vessel physics 与 fixture registry 漂移`，不再误报为 semantic drift。

### `stale_ref` lifecycle

ProductSession 的 `#observeTool()` 现在：

- 成功 `world_write`：清除旧 `lastRun`；
- 成功 `world_edit` 且 `WorldEditResult.update.status === "updated"`：清除旧 `lastRun`；
- `world_edit` 返回 `stale_ref`：current world 未变化，保留仍然有效的 `lastRun`；
- 成功 `world_run`：写入新的 run evidence；
- `world_read`：保持 evidence。

这保持了静态描述 mutation 与动态历程 evidence 的边界，没有引入额外状态机。

## GREEN 与完整门禁

最终定向结果：

```text
52 pass / 0 fail / 312 assertions
```

完整门禁：

```text
bun test            149 pass / 0 fail / 2,857 assertions
bun run typecheck   pass
bun run build       pass; Vite browser externalization / large chunk warning only
git diff --check    pass
EXharness validate  pass; 0 warnings
```

Deterministic artifact identity 未漂移：

```text
generator SHA-256  0b600eded75a33e42cbaa8623b5ed8c8b6428f1c731ef188543bee9565b94693
vessel GLB SHA-256 856788138ecc53d407827a0e67aa9977237dd914809316f8af992e8ee098cd92
```

本轮 product digest（base 为 `22e288690937834135584d023e4140e26696f761`，排除 `docs/project-harness/**`，包含排序后的 untracked product manifest）：

```text
85534951b9146283ffbceddec652a0440d0d38a7543ad4828a86eb42b5df1c57
```

## Operator replay

同一 repo 外 `/tmp/dh010-operator-repro.ts` 在最终实现上返回：

```json
{
  "vesselFriction": {
    "authorityResult": {
      "accepted": false,
      "error": "Error: vessel physics 与 fixture registry 漂移"
    },
    "runtimeResult": {
      "accepted": false,
      "error": "Error: vessel physics 与 fixture registry 漂移"
    }
  },
  "staleRef": {
    "updateStatus": "stale_ref",
    "beforeRef": {
      "snapshotId": "snapshot:edit-1",
      "version": 2
    },
    "afterRef": {
      "snapshotId": "snapshot:edit-1",
      "version": 2
    },
    "beforeHadLastRun": true,
    "afterHadLastRun": true
  }
}
```

## 当前结论

cross-review 的 vessel-physics P0 与 stale-ref lifecycle P1 都已有 executable regression，operator full gate 与原反例回放通过。历史 verdict 不被实现自行改写；DH-010 继续 `doing / changes_requested`。下一步须由 Human 另行授权 fresh independent re-review；批准前不得 closeout、`mark-done`、commit 或 push。
