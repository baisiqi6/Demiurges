# DH-011 Round 3 Fresh 独立计划审查请求

## 隔离与权限

你是 fresh independent plan reviewer。严格只读，不修改文件，不 commit/push/merge/install/network/provider prompt/deploy。不得读取 Round 1/2 request、任何 earlier verdict/cross-review、另一位 reviewer 输出、`current/review.md`、历史 transcript 或 `/tmp` 中其他 agent 记录；也不得从 checklist `review` 字段吸收历史判断。只依据本文件明确列出的 current plan/context/source。

本轮只判断修订后的计划能否进入实现。不得把计划承诺写成当前已实现事实。

## Frozen target

- cwd：`/Users/Admin/projects/WorkTrees/Demiurges-DH-011`
- branch：`agent/codex/DH-011`
- HEAD/base：`06a2c392bbc2a001d1b31b3cde15b2eb3f9f6cca`
- 固定顺序十文件完整 `sha256sum` 文本的二次 SHA-256：`60755543154bf1ac4f8736131efdee706e51241c8a51a7f53442bd6538c380ef`

```text
e8432e9341856aed261803569cae394c906c7208601172b4ab63d860734c9d9d  docs/project-harness/tasks/DH-011/plan.md
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

先独立复算；任何 frozen file 或 HEAD 漂移立即 `blocked`。允许 harness bookkeeping 与 `tasks/DH-011/` 中非 frozen review artifact 出现在 status。

## Current baseline

Operator 在同一 base 运行：`bun test` 153/0/2866、typecheck PASS、build PASS（仅既有 warnings）、`git diff --check` PASS、EXharness validate PASS/0 warnings。它们只证明 baseline 健康。

## Mandatory review

### A. Integer action loop

验证唯一 loop 是否严格得到 720 `mj_step`、721 `mj_forward`、91 samples，terminal sample 后无 step；command 在 sample tick 先 apply、再 forward、再 sample，ZOH 到下个 step。核对 240/30 integer relationship、t=0、t=duration forbidden、exact actuator set/order、closed window 与 tamper tests。

### B. Exact input and Program identity

验证 edit 两 variant、free-fall 与 actuator-sequence 的全部 nested shapes、units、dense/exact plain-data 规则、per-tool budgets。复核 canonical object ordering、ECMAScript token encoding、UTF-8、negative-zero/lone-surrogate rejection、两条 golden bytes/digest，以及 Host/Repository/codec/Node-V8 single-source requirement。查找 circular identity 或同 content 多 digest。

### C. Scenario and evidence authority

验证 Host-owned `scenarioId` 在 write 创建、edit/runtime-terminal 继承，并与 exact registry invariants而非字符串/EntityRef 猜测绑定；Episode/Repository/codec/adopt key 必须闭合。验证 arbitrary admitted command content 不变成 command allowlist，completed+passed trusted evidence仍可 adopt。

### D. Sensors, FK and Evaluation

验证 exact 四 scalar sensors 的 refs/owner/type/order/unit/mapping，joint state 仍是 evaluator 唯一 authority；FK 只用 registry + joint state；goal 只来自 base target；0.5s/16 samples、Euclidean error、max joint speed与 fixed topology/target/root exact。

### E. Deterministic compiled model

逐项检查 root/body/joint/COM/inertial/geom/site transforms、capsule semantics、joint flags/defaults、actuator transmission/gear/dyn/gain/bias/limits、sensor count/order与 entire-model counts 是否唯一、可在 MuJoCo 表达，并且没有隐含 default。复算 FK target 与 golden tick/sample counts；指出任何数值自相矛盾或会允许两种 trajectory 的遗漏。

### F. Product minimality

确认 single `entity:arm`、read/write/edit/run 四工具、static edit/dynamic run、no legacy parser、no fifth tool、no SDK/planner/IK/grasp/world model；目标仍是可见的最小控制 vertical slice，Product codec/Studio/adopt/旧场景 regressions 可执行。

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
