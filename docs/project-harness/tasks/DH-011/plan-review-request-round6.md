# DH-011 Round 6 Fresh 独立计划审查请求

严格 fresh、只读、相互隔离。不得读取 Round 1–5 request/verdict/cross-review、另一 reviewer 输出、current packet、transcripts 或 checklist review 字段；不得修改、install、network、provider prompt、tests/build 或 Git mutation。只依据本文件与列出的 current plan/source，不把计划当实现。

## Frozen target

- cwd：`/Users/Admin/projects/WorkTrees/Demiurges-DH-011`
- branch：`agent/codex/DH-011`
- HEAD：`06a2c392bbc2a001d1b31b3cde15b2eb3f9f6cca`
- aggregate 算法：对以下固定顺序十文件运行 GNU `sha256sum`，保留其完整十行 UTF-8 stdout（每行 `<64hex><two spaces><path>\n`），再对该 stdout 运行 `sha256sum`。
- aggregate：`3e220dea53e724be1b8347e0ef274e6504da122558b95480ae19839610ec1be8`

```text
8df0f9b5a7a55c019c63619fb4f85ddbf3553ada4f182985aff8cf247bc7cbbd  docs/project-harness/tasks/DH-011/plan.md
a335dafd9d996f7bf15346890d3056333f3a9efaec98df3820d69cd5360b20c4  docs/project-harness/scope.md
1701548340dec0dc4b7ed17d884e7418b76377850b4f7dc3d207e1259c510b70  docs/project-harness/architecture.md
b43bce3384171920fdd34175c9644413ab4840a98d4e597e9cf0fe73c7590b3b  docs/project-harness/domain-model.md
8e9d0b211dac419c6e1a7242c4c6b18c376db3440a669469103a2142e1c4ac9c  docs/project-harness/geometry-roadmap.md
1bb5448baa9badc0f33d3fce5b8370eecc461ac171223138a9790c212b7f8a24  packages/world/src/kernel/types.ts
33c19d094f94cf06e6bde104fc702e0a32f13f47b47d4a0fe080610fcf794e23  packages/world/src/world-tools/world-tool-contract.ts
48aae90ed2e1a1183d2940a40ad372a26b70618d2ef11643079126df55a8c97f  packages/world/src/world-tools/world-tool-surface.ts
8caf15938f0dcf6896616dad994b7d04cfa519378dcc0352ae5145098663ed1b  packages/world/src/host/runtime-mvp-host.ts
49b2ddaa76bf8ee70162bc0d64205aa0be3264409c13719abb825f32d12a094b  packages/world/src/product-session-codec.ts
```

任何 frozen drift 立即 `blocked`。

## Mandatory checks

1. 全量复核 current plan 的 four-tool minimality、exact inputs/canonical bytes、action loop、scenario/adopt、sensor/FK/Evaluation、MJCF/Product/Studio/regressions。
2. 验证 accepted articulated path 是否真正不激活 contact、joint-limit 或 frictionloss constraints：initial velocity exact zero、semantic limits由 Harness fail closed、MJCF limited=false/frictionloss=0、ncon=0/nefc=0；判断这是否仍提供真实 limit semantics而非绕过任务。
3. 验证 wind/density/viscosity/options/flags/actuation/passive/sensors 与 source/loaded/runtime evidence layering，查找仍影响 smooth ODE 但未冻结的 default。
4. 验证 RuntimeProfile equivalence formula覆盖逐 sample qpos/qvel/four sensors/terminal，discrete/timestamps exact，negative boundary可执行；paired causal control 的阈值不与 equivalence矛盾。
5. 独立复算 two digests、FK、720/721/91/16，并找出任何仍允许同一 admitted Program 产生两种合法 Episode、fail-open 或 scope creep 的 P1。

只有 P0=0、P1=0 才 `approved / may_implement=yes`。输出 decision、may_implement、P0/P1/P2、mandatory_checks、minimal_required_changes、frozen_identity_end 后停止。
