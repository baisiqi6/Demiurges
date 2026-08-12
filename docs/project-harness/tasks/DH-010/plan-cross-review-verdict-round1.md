# DH-010 Plan Cross-review Verdict — Round 1

## Frozen target

- Plan SHA-256：`aca6b9adbb8f8ad72712a01772915665c34c9799e8f8b2a052c4fb23d2d6f2e3`；
- Context aggregate SHA-256：`654af2d224f571ac8158d3949a304924b3af99c8006c2df3023790ceb0bd6d56`；
- Base/HEAD：`22e288690937834135584d023e4140e26696f761`。

## Independent reviewers

1. Sol：`gpt-5.6-sol / max`，`changes_requested`；
2. Kimi Code：请求 `claude-opus-4-8 / max`，经 `cc-switch` 实际路由 `k3`，`changes_requested`。

两位 reviewer 均只读同一个 frozen target，互相未读取对方 verdict。Operator 在两路退出后才开始 reconciliation。

## Reconciled blocking set

以下是进入 implementation 前必须关闭的最小 P1 集合：

1. stable-inside 必须使用连续 settle tail window，并要求真实 support/contact；hover 与 bounce apex 不得 PASS；
2. wall-sensitive trajectory 与 completed closed-proxy negative run 必须证明 `base + N walls` 被编译、参与碰撞且开放腔体是成功原因；
3. compound `partKey`、MuJoCo geom owner mapping、public semantic contact pair 与 penetration bound 必须闭合，内部 id 不得成为 EntityRef/evidence authority；
4. task-local vessel fixture、`worldPose = entityPose ∘ localPose`、rim/inner envelope/visual/collision 对齐必须在 translated + rotated probes 中可证伪；
5. 新 `stable-inside-vessel` evaluator 必须有 closed AdoptPolicy authority，且未注册/错配 contract 继续 fail closed；
6. Studio 只能在 headless contract/runtime/evaluation/adopt gate 全部通过后开始。

P2 只作为对应 phase 的显式检查项，不扩展为通用 scenario framework、frame graph、contact engine 或 artifact plugin。

## Verdict

`changes_requested`

`may_enter_implementation: no`

下一步是修订 canonical plan，产生新 digest，并进行 fresh Round 2；Round 1 verdict 永久保留，不覆盖、不改写为 approval。
