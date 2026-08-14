# DH-013 Phase 1 Cross-review Verdict — Round 3

## Decision

```text
decision: changes_requested
may_enter_phase2: no
P0: 0
P1: 2
P2: 1
```

两位 fresh reviewer 对 aggregate `848b821573415337f85c47c88bed8613c7771c088c2e68ec0e8c595803915116` 结论不一致：

- GPT-5.6 Sol Max：`changes_requested`，给出两个 executable P1；
- OMP DeepSeek V4 Pro Max（session `019ffea8-e837-7000-a007-b610176dab37`）：`approved`，但其 mandatory probe 没有覆盖 `semantic.kind` 与 `runFallingCube` 的 pre-key read。

交叉审查不是多数投票。任一可复现 P1 都关闭 Phase 2 gate，因此严格 verdict 为 `changes_requested`。

## Executable blockers

1. `requireSemantic()` 在 descriptor admission 前直接读取 caller object 的 `semantic.kind`。self-materializing getter 可在读取时把 Snapshot `schemaVersion` 改为 `999`，再把自身重定义成 data property；Repository 接受并初始化 current Ref。直接 `schemaVersion=999` 也未被 shared structural validator 拒绝。
2. `runFallingCube()` 在 `prepareRun()` 的 deep-frozen/structural admission 前调用 `snapshotKey(snapshot)`，因此先读取 `snapshot.id`。ordinary 与 self-materializing root `id` getter 均被执行后才拒绝，不满足 reads=0。

## Non-blocking finding

DeepSeek 记录 Studio legacy `imported-rigid-mesh` 的 GLB Presentation 路径未像 3DGS 一样在前端重新计算 `contentDigest`。该路径不成为 Kernel/Repository authority，列为 P2；Phase 1 不因此扩大到 Presentation importer。

## Required root remediation

- `requireSemantic()` 先形成 descriptor-copy，再按 `kind` 分派；禁止读 caller accessor；
- shared Snapshot structural admission exact 校验 root `schemaVersion/id/parentId/source/scenarioId`；
- `runFallingCube()` 与 compiler seam 在派生 execution key、读取 Program/Profile/Input 字段前完成 deep-frozen/structural admission；
- 增加 semantic self-materialization、direct schema drift、Runtime root id getter 回归，getter 必须 reads=0，Repository 不初始化 Ref；
- 完整 gates 后冻结 Round 4 并重新 fresh cross-review。

本 verdict 不授权 Phase 2、provider/Keychain、commit/push/merge/PR/tag/deploy。
