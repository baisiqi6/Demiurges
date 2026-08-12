# DH-011 Round 8 Fresh 独立计划审查请求

严格 fresh、只读、相互隔离。不得读取 Round 1–7 request/verdict/cross-review、另一 reviewer 输出、current packet、transcripts 或 checklist review；不得修改、install、network、provider prompt、tests/build、Git mutation。只读本文件与下列 current plan/source，不把计划当实现。

## Frozen target

- cwd `/Users/Admin/projects/WorkTrees/Demiurges-DH-011`
- branch `agent/codex/DH-011`
- HEAD `06a2c392bbc2a001d1b31b3cde15b2eb3f9f6cca`
- aggregate algorithm：fixed-order GNU `sha256sum` 十行完整 stdout，再 `sha256sum`
- aggregate `bcbe0ef29d0b6dee94ffe7c1db225915db7b39203d4cee03672ceddda4f2da28`

```text
c4e81813dd3f47cf51074730cc977e6fb4c5f97f749d26e888ca1662723e72c3  docs/project-harness/tasks/DH-011/plan.md
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

任何 drift 立即 blocked。

## Mandatory checks

1. 全量复核完整 plan：four tools、inputs/canonical identity、clock、scenario/adopt、FK/eval、piecewise-smooth Runtime、equivalence、Product/Studio/regressions。
2. 验证 private per-run MjModel/fresh MjData、no sharing/exposure、compile-to-dispose critical section 不 yield/dispatch/reenter，是否关闭 model TOCTOU。
3. 验证 MuJoCo dynamics callbacks（control/passive/act dyn/gain/bias）null checks before/every boundary/after 与 unsupported-introspection fail-closed，是否关闭 callback channel；查找其他 relevant callback。
4. 验证 pre/post full modelCausalDigest、boundary model identity/ownership、mutation negatives，与 zero applied forces/ncon/nefc/flags一起闭合 ODE inputs；查找仍未受控 mutable input。
5. 独立复算 digests/FK/720/721/91/16，并找同 inputs 两 legal Episodes、fail-open、scope creep；确认 piecewise-smooth 表述准确。

仅 P0=0/P1=0 才 approved/may_implement=yes。输出 decision、may_implement、P0/P1/P2、mandatory checks、minimal changes、frozen identity 后停止。
