# DH-010 Plan-only Independent Cross-review Request — Round 1

## Review identity

- Item：`DH-010`；
- Review type：canonical design/acceptance plan，只读、实现前审查；
- Worktree：`/Users/Admin/projects/WorkTrees/Demiurges-DH-010`；
- Branch：`agent/codex/DH-010`；
- Base/HEAD：`22e288690937834135584d023e4140e26696f761`；
- Canonical plan：`docs/project-harness/tasks/DH-010/plan.md`；
- Plan SHA-256：`aca6b9adbb8f8ad72712a01772915665c34c9799e8f8b2a052c4fb23d2d6f2e3`；
- Context manifest aggregate SHA-256：`654af2d224f571ac8158d3949a304924b3af99c8006c2df3023790ceb0bd6d56`。

Context aggregate 按以下文件、以下顺序的 `shasum -a 256` 行再次 SHA-256 得到：

1. `docs/project-harness/tasks/DH-010/plan.md`
2. `docs/project-harness/scope.md`
3. `docs/project-harness/architecture.md`
4. `docs/project-harness/domain-model.md`
5. `docs/project-harness/geometry-roadmap.md`
6. `docs/project-harness/technical-foundation.md`
7. `docs/project-harness/harness-checklist.json`

## Reviewer authority

角色：independent plan reviewer。

允许：

- 读取上述 context、`AGENTS.md`、当前相关 product source 和 tests；
- 运行 `git status`、`git diff`、`rg`、`sed`、`shasum`、JSON/checklist validation 等只读命令；
- 为核验可行性运行不会写入仓库的只读 source probe。

禁止：

- 修改任何文件；
- 安装 dependency、运行 formatter/build 或生成 artifact；
- `git add/commit/push/merge/rebase/reset/clean/checkout`；
- 创建 PR、tag、Issue、worktree 或 branch；
- 调用真实 provider/world Agent、读取 credential、联网、SSH、deploy 或生产 mutation；
- 读取另一位 reviewer 的输出，或根据预期答案调整 verdict。

发现需要实现 probe、外部事实或新增 authority 才能判断时，输出 `blocked` 和最小缺口，不自行扩大权限。

## Review problem

判断这份计划是否足够简单、完备、可证伪，能够作为 DH-010 implementation authority。重点不是润色文档，而是寻找会导致错误架构、补丁堆叠、无法验收或范围爆炸的 P0/P1。

必须独立检查：

1. **路线正确性**：ball-into-vessel 是否是 imported mesh + 3DGS 之后、articulated robot 之前合理的第二真实任务；是否真正验证 task-driven fidelity，而不是为了展示曲面增加 demo。
2. **根部抽象**：计划是否正确识别 `cubeHeight`、固定 `entity:cube`、single-box collision、landing-only metrics 与 cube-centric Studio 为偶然脚手架；拟议修复是否又过度泛化成 world ontology、plugin SDK 或 scenario framework。
3. **单切片可执行性**：在当前 codebase 中同时引入 smooth artifact、sphere/compound collision、第二 scenario、model-facing contract migration、multi-entity Runtime、Evaluation 与 UI，是否大到应拆分；若必须拆，给出仍保持 end-to-end value 的最小切法。
4. **语义颗粒度**：一个 vessel Entity 对应多个 collision parts/MuJoCo geoms 是否闭合；part local pose、rim-center frame、Entity identity 与 Presentation overlay 是否有遗漏的 authority/alias 风险。
5. **四工具 contract**：保持 tool count 为四的同时，`write/edit/run` 的最小演进方向是否足够明确；“Phase 1 才冻结字段名”是否会让 plan 无法约束实现，还是避免过早 schema 设计所必需。
6. **Runtime 与 Evaluation 可证伪性**：closed-proxy negative control、stable-inside-vessel metrics、contact/penetration/terminal state 是否足以证明开放内部空间真实可用；是否存在 visual 正确但物理/评测仍虚假 PASS 的反例。
7. **回归与 authority**：Snapshot/Episode/ref/adopt、Product Session codec、OMP restricted surface、3DGS/Spark Presentation 与 transport boundaries 是否被完整保护；有无计划未覆盖的 identity/lifecycle/JSON admission 攻击。
8. **Non-goals 与退出条件**：是否能阻止 CAD、任意 authoring、机器人、world-model provider、第二 Runtime 与兼容层顺手进入；Exit condition 是否客观、可运行、可失败。
9. **当前事实一致性**：plan、checklist acceptance、scope、architecture、domain model、geometry roadmap 与当前 source 是否冲突或陈旧。

## Severity contract

- `P0`：会破坏 authority、安全或使项目方向根本错误，无法进入实现；
- `P1`：计划缺陷会导致错误实现、无法客观验收、重大回归或不可控范围，必须先修订并重新审查；
- `P2`：非阻断改进；可以后移，不得用来把 approved 伪装成 changes_requested；
- `approved`：无 P0/P1，当前 plan 可以进入 Human implementation gate；
- `changes_requested`：至少一个有证据的 P0/P1；
- `blocked`：缺少 reviewer authority 内无法取得的必要事实。

## Required output

中文为主体，精确 English token 保留。输出必须包含：

1. `Reviewer`：请求模型、实际观察模型、provider session id（能核验则写；不能核验明确写 unknown）；
2. `Digest verification`：plan SHA、context aggregate、review 前后 `git status --short` 是否一致；
3. `Findings`：按 P0/P1/P2 排序，每项给出 plan/source 精确位置、具体失败场景、为什么现有 acceptance 挡不住、最小修订建议；
4. `Counterexamples checked`：至少列出实际检查过的 5 个反例；
5. `Verdict`：`approved | changes_requested | blocked`；
6. `Implementation gate`：明确写 `may_enter_implementation: yes | no`。

不要输出 private chain-of-thought；只给可复核证据、简要推理与最终 verdict。
