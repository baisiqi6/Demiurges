# DH-014 Plan Review Request — Round 1

## Role

你是 DH-014 的 independent plan reviewer。只读、fresh、bounded；不得实现、修改文件、安装依赖、调用 provider、启动长期 server，或执行任何 Git mutation。

## Frozen identity

- cwd：`/Users/Admin/projects/WorkTrees/Demiurges-DH-014`
- branch：`agent/codex/DH-014`
- HEAD / base：`c655c544bb88010f42e0dd9e570f7f04923d9b6e`
- plan SHA-256：`13392abcfa9dddef4ea0d7068ec06b7a2dafc644c49c09c665d673974e1ad59f`
- 16-file ordered `sha256sum` text aggregate：`372d35fbdc4f3e8247f1640cfed2de88cb715e0e9f7ea84778dbf9a8f042e561`

Ordered manifest：

1. `docs/project-harness/tasks/DH-014/plan.md`
2. `docs/project-harness/scope.md`
3. `docs/project-harness/architecture.md`
4. `docs/project-harness/domain-model.md`
5. `docs/project-harness/observer-embodiment.md`
6. `docs/project-harness/progress.md`
7. `docs/project-harness/harness-checklist.json`
8. `docs/project-harness/current/task_plan.md`
9. `apps/studio/src/presentation-three/ThreeViewport.tsx`
10. `apps/studio/src/presentation-three/registered-presentation.ts`
11. `apps/studio/src/presentation-three/entity-presentation.ts`
12. `apps/studio/src/presentation-model.ts`
13. `apps/studio/src/App.tsx`
14. `apps/studio/src/styles.css`
15. `package.json`
16. `bun.lock`

Aggregate algorithm：在 cwd 中按上述顺序执行完整 `sha256sum <16 paths> | sha256sum`，取第一列。起止均需复算，任何漂移立即 `blocked`。

## Review objective

判断 canonical plan 是否足够简洁、完备、可验收，并是否严格满足用户的 Observer slice：

- 三模式语义与可见入口；
- Marble registered Presentation entry pose 与 provenance/truth boundary；
- Z-up Fly、Inspect trusted focus、Overview fit registered bounds；
- editable/input ownership、stuck-key cleanup、reduced motion；
- 不建立 permanent idle rAF；
- 相机不改变任何 world authority；
- primitive/imported/3DGS missing/Marble fallback；
- 真实 Chromium acceptance；
- 不修改 `packages/world/**`、不新增 provider generation、不抄 Lyaup/Y-up 数学、不扩展 plugin framework。

## Required adversarial questions

1. `entry pose` 的 registration、bounds、truth/provenance 是否避免成为第二个 world truth？
2. 单一 rAF scheduler 是否能同时涵盖 movement、transition、Episode reactive update、Spark dirty，并在 idle 停止？
3. keyboard/pointer ownership 是否会让 Agent 输入框、其他 editable 或 pointer-lock exit 产生移动/stuck key？
4. Inspect focus 的 trusted bounds 来源是否闭合，missing/corrupt representation 是否 finite fail-safe？
5. Overview fit 是否兼容 world-scale 3DGS、imported mesh、primitive 与 degenerate/missing bounds？
6. Explore mouse look 与 OrbitControls 的 enable/disable、mode transition、dispose 是否有冲突或重复 listener 风险？
7. 现有 SolidJS/Three/Spark 架构中，计划允许的文件与测试 seam 是否足以实现而不触碰 Kernel？
8. Chromium 证明是否能观察 camera pose、rAF idle 与 authority invariants，而非只凭视觉主观判断？

## Allowed read-only verification

- `git status --short`、`git diff --check`、`git rev-parse`、`sha256sum`；
- `rg`、`sed`、`find`（不得读取旧 DH-014 reviewer verdict；Round 1 目前不存在 verdict）；
- 读取 ordered manifest 及由其直接 import 的少量 Studio Presentation source/test；
- 不运行 build/install/provider/browser；plan gate 不要求产品 tests。

## Verdict contract

中文为主体，输出结构化：

```text
decision: approved | changes_requested | blocked
may_implement: yes | no
P0: ...
P1: ...
P2: ...
evidence: ...
start_identity: ...
end_identity: ...
```

只有 `P0=0`、`P1=0` 且 frozen identity 起止一致才可 `approved / may_implement=yes`。P2 必须具体但不阻止本切片。发现边界外需要时停止并报告，不自行改计划。
