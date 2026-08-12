# DH-010 Phase 6 P1 Remediation Evidence

## Authority 与范围

- Human authority：2026-08-11 明确授权修复 Phase 6 cross-review 已复现的四个 P1；
- cwd：`/Users/Admin/projects/WorkTrees/Demiurges-DH-010`；
- branch：`agent/codex/DH-010`；
- base / HEAD：`22e288690937834135584d023e4140e26696f761`；
- 本轮未获得 independent re-review、commit、push、PR、merge、tag、deploy、closeout 或 `mark-done` authority。

## RED → GREEN

四组 reviewer counterexample 先写成 public-boundary regression：

1. same-ID/different-content containment Evaluation：`passed=true`、`supportSamples=0/16`、`maxPenetrationMeters=999`；
2. ball physics friction 从 canonical `0.8` 漂移为 `0.123`，以及 `world:attacker` Ref alias；
3. root Snapshot 含两个相同 `EntityRef`；
4. 调用方修改 resolver 返回的 imported visual URL，污染后续 resolve。

修复前 targeted gate：`14 pass / 4 fail`。失败与四个已复现 P1 一一对应。

修复后 targeted gate：

```text
bun test \
  packages/world/src/product-session-codec.test.ts \
  packages/world/src/repository/world-repository.test.ts \
  apps/studio/src/presentation-three/entity-presentation.test.ts \
  packages/world/src/evaluation/evaluate-episode.test.ts

22 pass / 0 fail / 86 assertions
```

## 根部修复

- Snapshot authority：`requireSnapshotRepresentationIntegrity()` 在 Repository 插入前验证全局 `EntityRef` 唯一性；
- Product codec：Ref 只接受唯一 lexical authority `world:current`；每个已登记 scenario 的 `physics` 必须与 canonical fixture 完全一致；
- Evaluation evidence：codec 对已解析且冻结的 Episode 使用受信 contract derivation 与 `evaluateEpisode()` 重算 Evaluation，并对整条 record 做 plain-data equality，拒绝 ID 相同但 predicate/metrics 不同的伪证据；
- plain-data composition：evaluator 明确接受 `Object.prototype` 或 null-prototype 的 frozen own-data record，仍拒绝 accessor、class instance 与非 plain data；
- Presentation asset registry：登记数组、entry 与 nested provenance 递归冻结，resolver 不再暴露可污染的 mutable internal state。

没有增加 scenario patch、兼容入口、第二 evaluator 或 renderer fallback。

## Full gate

```text
bun test            142 pass / 0 fail / 2,834 assertions
bun run typecheck   pass
bun run build       pass; Vite large chunk warning only
git diff --check    pass
```

Deterministic artifact identity 未漂移：

```text
generator SHA-256  0b600eded75a33e42cbaa8623b5ed8c8b6428f1c731ef188543bee9565b94693
vessel GLB SHA-256 856788138ecc53d407827a0e67aa9977237dd914809316f8af992e8ee098cd92
```

Phase 6 remediation product digest（沿用 review request 的 base、排除 harness docs、包含排序后的 untracked product manifest）：

```text
8687ad0dea2c675d8d04a61ebcacf4649bc41989d33d6163a3b5680619cacc6e
```

## 当前结论

四个已知 P1 均有 executable regression 且 operator full gate 通过。历史 `changes_requested` verdict 保留；本轮只能形成新的 review candidate，不能覆盖旧 verdict。下一步需要 Human 另行授权 fresh independent re-review；批准前不得 closeout、`mark-done`、commit 或 push。
