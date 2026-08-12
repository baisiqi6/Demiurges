# DH-010 Phase 6 Canonical Representation Remediation Evidence

## Authority 与范围

- Human authority：2026-08-11 明确授权修复 remediation cross-review 已复现的 canonical representation P1；
- cwd：`/Users/Admin/projects/WorkTrees/Demiurges-DH-010`；
- branch：`agent/codex/DH-010`；
- base / HEAD：`22e288690937834135584d023e4140e26696f761`；
- 本轮不处理 Kimi 记录的孤立 `world_read.ref.version` P2；
- 本轮未获得 fresh independent re-review、commit、push、PR、merge、tag、deploy、closeout 或 `mark-done` authority。

## RED → GREEN

先将 cross-review 的三个可执行变体固化为 Product codec public-boundary regression：

1. authored world 与 terminal Snapshot 同步放大 ball-vessel floor visual/collision `halfExtents`；
2. authored world 与 terminal Snapshot 同步漂移 ball visual color；
3. authored world 与 terminal Snapshot 同步放大 falling-rigid floor horizontal extent。

修复前 targeted gate：

```text
7 pass / 3 fail / 31 assertions
```

三个失败都表现为 decoder 接受与 registered fixture 不一致的 representation，同时保留原 Evaluation evidence。

修复后相关 codec / contract / fixture targeted gate：

```text
34 pass / 0 fail / 2,213 assertions
```

## 根部修复

- Product codec 直接从 `createInitialSnapshot()` 与 `createBallVesselSnapshot()` 建立 frozen `CANONICAL_ENTITIES`，没有创建第二套 geometry constant 或 scenario patch registry；
- 已登记 ball-vessel scenario 的全部 Entity representation，以及 falling-rigid floor / primitive box representation，必须与 canonical fixture plain-data 完全一致；
- diagnostic imported cube 继续由既有 artifact、collision 与 3DGS exact validator 闭合，避免错误套用 primitive cube representation；
- `physics` 继续与同一个 canonical Entity 比较；合法的 dynamic `state/pose` 演进不受影响。

这使 authored world、terminal Snapshot 与 trusted Runtime fixture 形成三方闭合，而不仅是 authored/terminal 两份不可信 carrier 互相一致。

## Full gate

```text
bun test            145 pass / 0 fail / 2,837 assertions
bun run typecheck   pass
bun run build       pass; Vite browser externalization / large chunk warning only
git diff --check    pass
```

Deterministic artifact identity 未漂移：

```text
generator SHA-256  0b600eded75a33e42cbaa8623b5ed8c8b6428f1c731ef188543bee9565b94693
vessel GLB SHA-256 856788138ecc53d407827a0e67aa9977237dd914809316f8af992e8ee098cd92
```

Canonical representation remediation product digest（base 为 `22e288690937834135584d023e4140e26696f761`，排除 harness docs，包含排序后的 untracked product manifest）：

```text
88a5d1e787df9cc5b73ae5fb117bc079c64665f5976e4b8795b5b22d2e863150
```

## 当前结论

已复现的 representation P1 现在有三个 executable regression，并在 full gate 中通过。历史 `changes_requested` verdict append-only 保留；本轮只形成新的 remediation candidate，不能自行覆盖旧 verdict。下一步需要 Human 另行授权 fresh independent re-review；批准前不得 closeout、`mark-done`、commit 或 push。
