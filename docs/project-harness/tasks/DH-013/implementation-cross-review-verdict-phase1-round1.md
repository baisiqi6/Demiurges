# DH-013 Phase 1 Cross-review Verdict — Round 1

## Decision

```text
decision: changes_requested
may_enter_phase2: no
P0: 0
P1: 3
P2: 0
```

两位 reviewer 对同一 frozen aggregate `4efe0e7f170f99e6c4f486f1bc47935641877e0d246d2a77eb830e573d80a50d` 完成只读审查：

- GPT-5.6 Sol Max：`changes_requested`；
- OMP DeepSeek V4 Pro Max（session `019ffe8b-4e05-7000-918a-ebe34b54500d`）：`approved`。

交叉审查不按多数或平均结论表决。任何可执行 P1 都关闭下一 phase gate，因此采用严格结论。

## Blocking evidence

1. canonical composite projection 自身无法通过 codec：`entity:generated-object` 的 canonical visual 是 `registered-rigid-mesh`，但 composite decoder 把除 environment 外的 entity 统一交给 `boxVisual`。因此若干 codec/stream mutation 测试可能在到达目标 mutation 前提前失败，不能证明 seam closure。
2. registry `denseArray` 未限制完整 `Reflect.ownKeys`。在 `assets`、`axisMap`、`rotation`、`faceDeltas` 等 array 增加 extra string、Symbol 或 extra accessor 会被静默忽略并接受；这违反 exact-key plain-data contract。
3. composite registered observation 没有进入共享 representation integrity 的 exact own-data admission。把 `assetId` 替换为返回 canonical value 的 getter，identity validator 会读取 getter并接受；Repository 后续即使因 deep-freeze 检查拒绝，也已经发生不允许的 accessor read。

## Passed evidence retained

- frozen identity 起止一致；
- focused `292/0/406`、full `434/0/3257`、typecheck、diff、EXharness 均通过；
- manifest digest 语义、三条 calibration 数值重算、三类 witness、MuJoCo 76-frame deterministic run、run/adopt authority、四工具与 Studio empty-cache early return 均未被反例推翻。

## Required remediation

- composite codec 按 exact EntityRef 分派 environment registered visual、floor box visual、generated registered visual，并新增 canonical projection/event 正向测试；
- 将 array admission 统一为 exact dense own-data array，own keys 只能是 indices + `length`，不得读取 accessor；
- registered observation 进入共享 exact-record validator；补 extra string/Symbol/accessor 且 getter read count 为 0 的 Repository/Runtime/codec regressions；
- 修复后重新冻结产品 aggregate，发起 fresh Round 2 双审。

本 verdict 不授权 provider/Keychain、Phase 2、commit、push、merge、PR、tag 或 deploy。
