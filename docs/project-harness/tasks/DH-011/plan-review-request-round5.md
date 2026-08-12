# DH-011 Round 5 Fresh 独立计划审查请求

严格只读、fresh、相互隔离。不得读取 Round 1–4 request/verdict/cross-review、另一 reviewer 输出、current packet、transcripts 或 checklist review 字段；不得修改、install、network、provider prompt、Git mutation。只依据本文件及其列出的 current plan/source，不得把计划当实现。

## Frozen target

- cwd：`/Users/Admin/projects/WorkTrees/Demiurges-DH-011`
- branch：`agent/codex/DH-011`
- HEAD：`06a2c392bbc2a001d1b31b3cde15b2eb3f9f6cca`
- fixed-order ten-file double SHA-256：`a46d02e4a7a4d2e69c0c0dfae1e0dff8796d4179e9755a9cdfb62e52a02e93f4`

```text
c4350354f1880ed8af45fcdd69f45a64f42b30e9a7b0198622033fceb1c7917c  docs/project-harness/tasks/DH-011/plan.md
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

1. 全量复核 current plan：four-tool minimality、exact edit/run nested shapes、single canonical bytes authority、integer action loop、scenario lineage/adopt、four sensors/FK/Evaluation、deterministic articulated MJCF、Product/Studio/regression gates。
2. 验证 four-row admission matrix 与两个 golden vectors一致；独立复算 `free-fall(entity:cube,2.5s,30Hz)` digest、actuator digest、FK、720/721/91 与16 samples。
3. 验证 target no-collision、ngeom=3/no target geom、arm contact masks 与 721 次 `mjData.ncon===0` 构成零接触证据，不混用 `nconmax`。
4. 验证 compile-time source/generator evidence 与 loaded `mjModel` readback 分层正确，所有实际影响 no-contact trajectory 的 compiled options/dynamics有唯一 evidence；指出 MuJoCo 不可表达字段或 count 矛盾。
5. 查找任何仍会允许同一 admitted Program 产生两种合法 Episode 的 P1，或 scope creep/fail-open acceptance。

只有 P0=0、P1=0 才 `approved / may_implement=yes`。输出：decision、may_implement、P0/P1/P2、mandatory_checks、minimal_required_changes、frozen_identity_end。完成即停止。
