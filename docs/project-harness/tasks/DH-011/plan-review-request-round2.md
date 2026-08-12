# DH-011 Round 2 Fresh 独立计划审查请求

## 隔离与权限

你是 fresh independent plan reviewer。严格只读，不修改文件，不 commit/push/merge/install/network/provider prompt/deploy。不得读取 Round 1 request/verdict、另一位 reviewer 输出、`current/review.md`、历史 transcript 或 `/tmp` 中其他 agent 记录。只依据本文件明确列出的 current plan/context/source；不能从 checklist 的 `review` 字段吸收历史判断。

本轮只判断修订后的计划能否进入实现。不得把计划承诺写成当前已实现事实。

## Frozen target

- cwd：`/Users/Admin/projects/WorkTrees/Demiurges-DH-011`
- branch：`agent/codex/DH-011`
- HEAD/base：`06a2c392bbc2a001d1b31b3cde15b2eb3f9f6cca`
- 固定顺序十文件完整 `sha256sum` 文本的二次 SHA-256：`00b39071ad8544bce5b2cc9a90b6ca5b6b9e34f15725d00c86357123b488c9ef`

```text
776c644a8581f5eafa0bfa77a7df23be3b18b8524a14a9ceffd5973c00f9fa0c  docs/project-harness/tasks/DH-011/plan.md
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

先独立复算。任何 frozen file 或 HEAD 漂移则立即 `blocked`。允许 harness bookkeeping 与 `tasks/DH-011/` 中非 frozen review artifact 出现在 status；不要把已明确列出的 plan file 当作“untracked 所以不可审”。

## Current baseline

Operator 在同一 base 运行：`bun test` 153/0/2866、typecheck PASS、build PASS（仅既有 warnings）、`git diff --check` PASS、EXharness validate PASS/0 warnings。它们只证明 baseline 健康。

## Mandatory review

### A. Action clock

验证 plan 是否已唯一冻结：240Hz physics、30Hz sample、integer ticks、step 必须在 sample grid、t=0 required、t=duration forbidden、exact two-actuator coverage、zero-order hold、apply→forward→sample→step 顺序、closed sample count、terminal held commands，以及 tamper tests。查找仍可能导致同一 Program 产生两个合法 Episode 的歧义。

### B. Program identity 与 adopt

验证两个 explicit Program exact shapes、单一 admission、stable canonical JSON + SHA-256（digest 不含 id）、`program:sha256:*`、Episode full Program evidence、Repository/codec recomputation，以及 policy key `(scenario, kind, evaluator, contract)` 是否避免 command catalog，同时保证 trusted completed+passed arbitrary admitted sequence 可以 adopt。查找 circular identity、detached alias 或 unregistered 含义歧义。

### C. 唯一 Evaluation evidence path

验证：joint state 是 evaluator authority；sensor 是闭合 observation 而非第二 authority；tool pose 只由 registry + joint state 的唯一 FK 重算；goal frame 只来自 base Snapshot target；fixed arm/target/topology 在 sample/terminal 不漂移；Euclidean position error、max abs joint speed、0.5s/16 samples 与 thresholds exact。不得保留 `or/optional equivalent path`。

### D. Deterministic articulated dynamics

验证 plan 是否 exact 冻结 root/plane/link lengths/radii/mass/inertia、joint axis/limits/damping/friction、actuator kp/control/force range、sensor mapping、canonical target、multi-step Program，并要求 compiler/load exact 回查与单参数 drift tests。指出任何仍依赖 MuJoCo defaults 或不物理/无法表达的字段。

### E. Product minimality and executable acceptance

重新独立检查：single `entity:arm` authority、四工具数量、edit/run separation、no legacy parser、no robotics SDK/planner/IK/grasp/world model、codec/adopt authority、causal paired control 与 targeted regression matrix。计划应是最小真实 vertical slice，不是通用机器人平台。

## Verdict gate

- P0：根本方向/authority 错误。
- P1：实现前必须修复的歧义、矛盾、不可执行 acceptance、fail-open 或范围蔓延。
- P2：不阻断开工的建议。
- 只有 P0=0 且 P1=0 才 `approved / may_implement=yes`。

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

最终 verdict 后停止；中文主体，保留精确 identifiers/paths/hashes。
