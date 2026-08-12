# DH-010 Plan-only Independent Review Verdict — Sol Round 2

## Reviewer and digest

- Reviewer：`GPT-5.6 Sol Max`，fresh、只读，未读取 Round 1 verdict；
- Plan SHA-256：`017b24a2e235a18026282e268c1b20c0971952fe8ee4ab230b06ed2e017496a9`，match；
- Context aggregate SHA-256：`ddf75a6253ac841d44f2d1a2779c435e28f537bf057610b88b511e613bf698d8`，match；
- HEAD/branch、checklist `0 warning`、`git diff --check` 均通过；前后 target/status 未漂移。

## Findings

### P1-1 — settle window 与 semantic support 仍未冻结成 exact executable contract

当前 plan 没有定义 tail window 的时间覆盖、严格递增与最大 sample gap，也没有定义“support”是否只是任意 contact。仍可能出现：单帧 transient support、sidewall-only contact、duplicate/gapped timestamps、penetration 未绑定 pair，却被实现解释为 PASS。

最小修订：冻结 positive window、sample coverage/gap、每个 sample 的 finite/height/radial/speed predicates；定义由 internal contact normal/owner map 生成的 EntityRef semantic support direction、窗口覆盖，以及 pair-attributed non-negative penetration 聚合；增加 sidewall-only、transient support 与 duplicate/gapped timestamp RED controls。

### P1-2 — model-facing exact JSON contract 被推迟到 Phase 1

`world_write/edit/run` 只描述了方向，字段名/keys/enum/frame/bounds/Program binding 仍由实现者决定；WorldToolSurface、OMP schema、scripted fixture、Product codec 与 Studio 可能各选不兼容 shape，现有 primitive 与 imported+3DGS falling-rigid 也可能在迁移中失去入口。

最小修订：canonical plan 在实现前冻结四工具 exact required/optional keys、closed enum、unknown/prototype/accessor/sparse/finite/string bounds；明确三个现有/新增 fixture、entity-targeted world-frame pose、registered Program compatibility；选择一个 model contract source of truth 或强制 executable parity；删除 legacy `cubeHeight` 后只留一个入口。

### P2-1 — rotationally symmetric vessel 削弱 yaw alignment probe

surface-of-revolution 的 AABB/rim/envelope 在 yaw 后可能不变。应比较 composed transform/matrix，或使用 fixture-local off-axis probe，不只比较 AABB。

## Counterexamples checked

包括 hover、bounce apex、sidewall-only contact、transient support、duplicate/gapped timestamps、missing/misaligned walls、completed closed proxy、part/owner alias、policy injection、translated/yaw drift、旧 imported+3DGS fixture 在新 schema 中丢失入口、Studio second-session lifecycle。

## Verdict

`changes_requested`

## Implementation gate

`may_enter_implementation: no`
