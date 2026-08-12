# DH-010 Plan-only Independent Review Verdict — Kimi Round 1

## Reviewer

- Role：independent plan reviewer；
- Requested CLI/model：Claude Code `--model opus --effort max`，native request model `claude-opus-4-8`；
- Actual observed model：`k3`，由 `cc-switch` 的 `proxy_request_logs` 对同一 session 连续核验；
- Claude native session id：`067d2d3c-f605-435a-a870-8b3442ef9f99`；
- `cc-switch` routed session id：同为 `067d2d3c-f605-435a-a870-8b3442ef9f99`；
- CLI result：`success`，`duration_ms=3319703`，`num_turns=246`；
- Review mode：`--safe-mode --strict-mcp-config --permission-mode plan`，只允许 `Read,Grep,Glob,Bash`，显式禁用写入、Agent、Web 与 Task 工具；repository 无 reviewer 写入。

> Reviewer 自述无法观察代理层，因而在原始输出中把 actual model 写成 `claude-opus-4-8`。Operator 以相同 session id 查询 `cc-switch` 后纠正为实际路由 `k3`；不改写 reviewer 的功能结论。

## Digest verification

Reviewer 因自身 sandbox 未获准运行 hash 命令；Operator 在 reviewer 退出后、修改 canonical plan 前独立重算：

- Canonical plan SHA-256：`aca6b9adbb8f8ad72712a01772915665c34c9799e8f8b2a052c4fb23d2d6f2e3`，匹配 review request；
- Context aggregate SHA-256：`654af2d224f571ac8158d3949a304924b3af99c8006c2df3023790ceb0bd6d56`，匹配 review request；
- HEAD：`22e288690937834135584d023e4140e26696f761`，匹配 request；
- Reviewer 报告 review 前后 `git status --short` 逐字节一致；Operator 复核既有 harness changes 与 `tasks/DH-010/` 仍是唯一状态集合。

## Findings

### P1-1 — 新 Evaluation contract 没有对应的 AdoptPolicy authority 演进

- 位置：`plan.md` 的 `Evaluation contract`、In scope 6、Acceptance/Exit condition；当前 source `runtime-mvp-host.ts`、`runtime-mvp-adopt-policy.ts`、`world-repository.ts`；
- 失败场景：ball-into-vessel Episode 由新 evaluator 产生 `success:stable-inside-vessel` EvaluationRecord；现有 Host/Repository authority 只接受绑定 `success:stable-on-floor` 的 evaluator/contract，因此 terminal adopt 必然拒绝；
- 为什么现有 acceptance 挡不住：plan 只新增 EvaluationRecord variant，没有说明 Host 的单一 `#adoptPolicy` 如何演进，也没有要求未注册 alternate contract 继续 fail closed；
- 最小修订：增加受信 closed per-scenario policy registry，由 registered Program/scenario identity 选择冻结 policy；禁止从 Agent input、EvaluationRecord 自报字段或 Presentation 推导 policy；两个合法 contract 均可 adopt，未注册/错配 evaluator-contract-policy 仍拒绝，保留 DH-003 lexical-closure authority。

### P1-2 — “无穿透”没有 Episode 中可观察、可归因的证据

- 位置：`Evaluation contract` 的“无穿透/数值爆炸”、Acceptance 3/7、Phase 3/4；当前 `EpisodeSample` 只有聚合 `contactCount`，现有 contact event 固定归因 target-floor；
- 失败场景：球从 compound wall 接缝穿过，随后落到满足 terminal containment predicates 的位置；仅凭低于 rim、高于 inner floor、低速和 aggregate contact count 仍可能 false PASS；
- 为什么现有 acceptance 挡不住：closed single-box proxy 只能验证粗粒度“内部是否开放”，不能证明 wall gaps/tunneling/penetration；计划没有 penetration bound 或 semantic pair contact evidence；
- 最小修订：在受信 Runtime evidence 中记录按 EntityRef pair 折叠的 contact/support 证据与 finite `maxPenetrationMeters`，内部 MuJoCo geom id 不外泄；evaluator 在 settle window 内校验 ball-vessel support 与 penetration bound。若做不到，应删除“无穿透”声明并明确限制；本计划选择前者以保持可证伪目标。

### P2-1 — Studio 默认选择和 footer 仍是 cube/landing specific

- 位置：当前 `App.tsx` 默认 `CUBE_REF`，metrics/footer 固定 `heightError`、`terminalLinearSpeed` 与 falling program；
- 建议：作为 Phase 5 的既定 Studio 泛化子项处理，按 selected scenario/Entity/Evaluation variant 呈现，不新增 UI fallback。

### P2-2 — ThreeViewport artifact URL 仍是 diagnostic fixture 常量

- 位置：当前 `ThreeViewport.tsx` 的 imported GLB/3DGS module constants；
- 建议：从受信 artifact registry/Session projection 解析 vessel visual，保持 URL 不成为 Kernel identity 或 Agent input。

### P2-3 — compound contact 参数应固定

- 位置：Phase 3；
- 建议：对 ball-vessel 的 `contype/conaffinity` 与必要的 deterministic contact parameters 写出 exact Runtime fixture tests；同一 static body 的 compound parts 不发生自碰撞。

## Counterexamples checked

1. forged Episode/Evaluation 与 non-finite terminal 被 authority admission 拒绝；
2. 三 Entity world 被当前 falling-cube Runtime exact-set admission 拒绝；
3. terminal Snapshot 的 floor ref 被替换时 Product codec 拒绝；
4. sample 注入 `entity:spoof` 时 Studio client evidence closure 拒绝；
5. OMP 注入第五个或 ambient tool 时 restricted surface pre-prompt fail closed；
6. edit evidence 夹带 `adopt` operation 时 codec 拒绝；
7. closed proxy 顶部位置能被 rim/inner-floor terminal predicate 拒绝，但该对照不能覆盖 wall seam penetration；
8. 新 contract Evaluation 交给现有 landing-only AdoptPolicy 时 evaluator/contract identity 不匹配。

## Verdict

`changes_requested`

计划的路线、事实诊断与范围约束总体正确；必须先补齐 AdoptPolicy authority 与可归因 penetration/contact evidence，才能成为 implementation authority。

## Implementation gate

`may_enter_implementation: no`
