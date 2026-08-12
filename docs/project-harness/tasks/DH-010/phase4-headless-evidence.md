# DH-010 Phase 4 Headless Closure Evidence

## Authority 与边界

- Human authority：2026-08-11 明确授权进入 Phase 4；
- base：`22e288690937834135584d023e4140e26696f761`；
- branch：`agent/codex/DH-010`；
- 本阶段只完成 stable-inside-vessel Evaluation、Host closed AdoptPolicy registry 与 ball-vessel Product codec/contact evidence closure；
- 没有进入 Phase 5 Studio visible slice；未调用真实 provider，未执行 commit、push、PR、merge、tag、deploy、closeout 或 `mark-done`。

## RED → GREEN

Phase 4 开始时：

```text
bun test packages/world/src/dh010-ball-vessel-contract.test.ts
6 pass / 6 expected fail / 34 assertions
```

六个 RED 精确覆盖：

1. stable-inside-vessel happy path；
2. hovering / sidewall-only / transient support negatives；
3. duplicate/gapped timestamps 与 penetration bound；
4. completed closed-proxy Evaluation FAIL；
5. Host closed AdoptPolicy registry；
6. ball-vessel Product codec/contact evidence closure。

Phase 4 完成后，DH-010 focused suite 为 `14 pass / 0 fail / 61 assertions`。

## Deterministic Evaluation

- `SuccessContract` 与 `EvaluationRecord` 是恰好覆盖两个真实 scenario 的 exact closed union；未退化为任意 metrics map；
- ball-vessel evaluator 只消费递归冻结的 Episode、vessel semantic geometry、sphere collision 与 EntityRef semantic contacts；
- settle window 固定为 terminal 前 `0.5s`，30Hz 闭区间精确 16 samples；timestamp 必须 finite、严格递增并落在 `1e-9s` grid；
- 每个 sample 都检查 local horizontal offset、ball top/rim、ball bottom/inner floor、linear speed、world-up vessel support 与 pair-attributed penetration；
- hovering、bounce-apex、sidewall-only、transient support、duplicate/gapped timestamp、penetration 超界与 completed closed proxy 均明确 FAIL；
- contact evidence 只允许 exact `{targetRef, otherRef, normalOnTargetWorld, penetrationMeters}`。`partKey`/geom identity、错误 pair、sparse/non-unit normal、negative/non-finite penetration 均 fail closed。

Canonical MuJoCo trajectory 的首个 evaluator probe 暴露尾窗最大速度约 `0.062m/s`，高于已冻结的 `0.02m/s` contract。本阶段没有放宽 Success Contract，而是在 ball free joint 增加 task-local damping `0.05`；真实 Runtime 随后取得 16/16 support、全部 window predicates PASS，并通过 Host adopt。falling-rigid Program 与既有 trajectory regressions 保持通过。

## Closed AdoptPolicy authority

- Host module 持有冻结的 exact two-entry registry：falling-rigid 与 ball-vessel 各自绑定唯一 `programId + evaluatorId + contractId + policyId`；
- Repository authority 不再接纳 caller-supplied single policy；任何此类注入直接以 `closed registry` 错误拒绝；
- adopt 同时验证 Episode Program、Evaluation episode/evaluator/contract、passed、completion、terminal source、base Ref 与 recorded terminal identity；
- model-facing surface 仍只有 `read/write/edit/run`，没有暴露 adopt。

## Product Session closure

- codec 只接受两个 exact scenario carrier：floor/cube 或 floor/vessel/ball；
- ball-vessel branch 验证 registered vessel visual artifact、compound collision、semantic rim/envelope、sphere ball、static/dynamic role、frame/units 与 physics；
- Episode 固定 registered Program/Profile、91 samples、30Hz timestamps、exact state EntityRef set、semantic contact pair、finite unit normal、non-negative penetration、terminal lineage 与 final state closure；
- Evaluation 必须与 Program 使用同一个 scenario identity；landing metrics 不能冒充 containment metrics；
- adversarial projection 已覆盖 internal part leak、wrong contact pair、timestamp drift 与 Program/Evaluation alias。

## Full headless gate

```text
bun test
130 pass / 0 fail / 2778 assertions

bun run typecheck  # pass
bun run build      # pass，仅既有 Vite large chunk warning
git diff --check   # pass
```

Deterministic artifact 复验：

```text
generator SHA-256  0b600eded75a33e42cbaa8623b5ed8c8b6428f1c731ef188543bee9565b94693
vessel GLB SHA-256 856788138ecc53d407827a0e67aa9977237dd914809316f8af992e8ee098cd92
```

冻结的 Phase 1–4 headless product digest（排除 `docs/project-harness/**`，纳入 tracked diff 与 untracked product bytes）：

```text
c893c0641d075f9080b1e977a582c0eb5ee5270fcb7129ccf3cb739680b42374
```

## Phase 4 结论

Phase 1–4 headless implementation gate 已关闭：同一四工具 contract 已能创建、编辑和推演球-容器世界；真实 Runtime evidence 能确定性评测并由 closed Host authority adopt；Product Session carrier 不再固定方块场景。下一步可以进入 Phase 5 Studio visible slice，但本阶段没有提前实现 vessel selection、compound overlay、rim frame 或 containment metrics UI。
