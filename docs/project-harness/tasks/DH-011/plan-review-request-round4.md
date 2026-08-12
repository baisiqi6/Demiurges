# DH-011 Round 4 Fresh 独立计划审查请求

## 隔离与权限

你是 fresh independent plan reviewer。严格只读，不修改、commit/push/merge/install/network/provider prompt/deploy。不得读取 Round 1–3 request、任何 earlier verdict/cross-review、另一 reviewer 输出、current review packet、transcripts 或 checklist review 字段。只依据本文件列出的 current plan/context/source；不得把计划当作已实现事实。

## Frozen target

- cwd：`/Users/Admin/projects/WorkTrees/Demiurges-DH-011`
- branch：`agent/codex/DH-011`
- HEAD/base：`06a2c392bbc2a001d1b31b3cde15b2eb3f9f6cca`
- fixed-order ten-file `sha256sum` text double SHA-256：`9f214d6376d963bc230aa814dfd5e7a80260823caca29b04e4f13f8b456ebe98`

```text
3c0c24ad29d3508eb47178d14317dcdd3f2e6ccecf9ebb1fe5d900f86f002ae2  docs/project-harness/tasks/DH-011/plan.md
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

先复算；任何 frozen drift 立即 `blocked`。允许 harness bookkeeping 与 `tasks/DH-011/` 中非 frozen review artifacts。

## Mandatory review

1. 验证 exact four-row `fixtureId → scenarioId → edit → Program` matrix 是否使 write/edit/run/codec admission 唯一，articulated fixture 可由四工具创建，goal marker 不可编辑。
2. 验证 target 的 `{kind:"none"}` collision、无 target geom、arm capsule non-contact policy是否消除 canonical reach 的物理阻挡，同时仍保留可见/可寻址 target 与 exact counts。
3. 验证 MuJoCo 3.11 compiler/options、joint/inertial/actuator/contact/sensor fields 与 loaded-model readback 足以避免影响 canonical no-contact trajectory 的 defaults；指出字段不可表达或 count 矛盾。
4. 复核 Round 3 既有完整 plan 的 action loop、nested schemas/canonical bytes、scenario lineage、four sensors、FK/Evaluation、four-tool minimality 与 regression gates，不能只看新增段落。
5. 独立复算两条 golden digest、FK target、720/721/91、16-sample window，以及 target/capsule 不再形成 contact 的结构性证据。

## Verdict gate

只有 P0=0 且 P1=0 才输出 `approved / may_implement=yes`。P1 包括歧义、不可执行 acceptance、fail-open、物理矛盾、MuJoCo 不可表达字段与范围蔓延。

输出：

```text
decision: approved | changes_requested | blocked
may_implement: yes | no
P0:
P1:
P2:
mandatory_checks:
minimal_required_changes:
frozen_identity_end:
```
