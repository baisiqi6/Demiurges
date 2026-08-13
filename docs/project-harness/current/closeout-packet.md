# Closeout Packet

## Subject

- Checklist item: `DH-012`
- Reviewer: `claude-k3-dh012-final`
- Updated at: `2026-08-13`
- Canonical plan path: `docs/project-harness/tasks/DH-012/plan.md`

## Item Snapshot

- Title: Coordinate-managed Operator 与 Discord 频道自助接入
- Status: doing
- Workflow status: closeout_requested
- Priority: p1
- Owner: codex
- Session: bootstrap-dh012
- Dependencies: None

## Acceptance

production 注册 demiurges workspace/host profile；独立 Remote MCP principal 仅可见 coordinate.channel_create；当前任务不创建频道，交由 Demiurges Operator 以固定 idempotency key 自助创建。

## Verification

production workspace/host/principal exact read-back；authenticated Remote tools/list HTTP 200 且仅
`coordinate.channel_create`；`channel_bindings=0`；service active、lock free；harness
validate/doctor/diff-check 通过；Claude K3 独立 review `APPROVE`，P0/P1=0。

## Handoff

先完成独立 plan review，再进行 production workspace/policy mutation；未通过 exact tools/list 前不得创建频道。

## Review Inputs

- Scope: `docs/project-harness/scope.md`
- Architecture: `docs/project-harness/architecture.md`
- Domain model: `docs/project-harness/domain-model.md`
- Progress: `docs/project-harness/progress.md`
- Review output target: `docs/project-harness/current/review.md`

## Canonical Plan Content

```md
# DH-012：Coordinate-managed Operator 与 Discord 频道自助接入

## 1. 需求来源

Demiurges 的项目 Operator 尝试调用 `coordinate.channel_create` 时正确地 fail closed：

- production Coordinate 尚未注册 `workspace_id=demiurges`；
- canonical main worktree 缺少可稳定重建的 `.artifacts/harness/harnessctl`；
- 当前 Codex 任务没有独立的 Coordinate Remote MCP principal；
- 因此无法证明 `coordinate.channel_create`、`demiurges` 与 `discord` 三个 exact scopes。

本任务不是实现新产品功能，而是补齐一次性的运行与授权 bootstrap。目标是让以后在
`/Users/Admin/projects/Demiurges` 中启动的受信 Codex Operator，能够使用自己的 Remote MCP credential
看到且调用 `coordinate.channel_create`，自行创建并绑定 `demiurges` Discord 频道。

## 2. 第一性原理与最小设计

真正需要解决的只有四件事：

1. 项目有一个稳定、可恢复的本地 harness authority；
2. production Coordinate 能识别 `demiurges` workspace 与 `macbook-local` coding host；
3. Demiurges Operator 有一个独立 principal，权限只覆盖一个 tool、一个 workspace、一个 platform；
4. 新 Codex task 能加载该 principal，并用 Remote `tools/list` 证明权限后自行创建频道。

因此本任务明确不新增第二套 checklist、数据库、adapter、agentd、bridge 或频道创建旁路；不把旧
DH-011 worktree 注册为 authority；不扩大现有 `codex`、`claude`、`qoder` principal；不使用共享 token。

## 3. Authority 与存储边界

- Git / 项目规范 authority：canonical Demiurges repository 的 `main` 与
  `docs/project-harness/`。
- 本地 runtime：`/Users/Admin/projects/Demiurges/.artifacts/harness/harnessctl`，由当前 EXharness
  template 机械实例化，属于 ignored、可重建派生物，不进入 Git。
- production runtime authority：Coordinate DB 中的 workspace、host profile、events 与 channel binding。
- Remote MCP policy authority：production policy JSON；只保存 token digest，不保存 plaintext。
- credential：使用独立 `demiurges-codex-operator` token；plaintext 只进入本机受保护 secret store / process
  environment，不写仓库、plan、日志、shell argv 或 production policy。
- `tasks/DH-012/plan.md` 是本任务 canonical plan；myharness 只保存 task-scoped review/receipt。

## 4. 实施步骤

### A. 本地 harness bootstrap

1. 从当前 EXharness `references/scripts/` 实例化 `.artifacts/harness`，替换：
   - `HARNESS_ROOT=docs/project-harness`
   - `PROJECT_ROOT_DEPTH=2`
   - `SCRIPTS_DIR=.artifacts/harness`
   - `PROJECT_NAME=Demiurges`
2. 拒绝残留 `{{...}}` placeholder。
3. 运行 `harnessctl validate`、`doctor`、`state`。
4. 通过 `harnessctl add-item` 登记 `DH-012`，再按 lifecycle 进入 running；不直接手写 checklist 状态。

### B. production workspace 与 coding-host profile

在生产 mutation lock、零 in-flight mutation 与备份证据满足后：

1. 注册 workspace：
   - id/name：`demiurges` / `Demiurges`
   - path：`/Users/Admin/projects/Demiurges`
   - harness root：`/Users/Admin/projects/Demiurges/docs/project-harness`
   - harnessctl：`/Users/Admin/projects/Demiurges/.artifacts/harness/harnessctl`
   - base branch：`main`
   - branch namespace：`agent/{owner}/{item_id}`
2. 注册 `macbook-local` host profile，使用同一 canonical Mac 路径及
   `/Users/Admin/.local/bin/coord-ssh`。
3. 此 profile 当前只支持 channel/control-plane bootstrap；不给该 Remote principal 授予 file lifecycle tools。
   若未来要求 production daemon 直接消费 Demiurges 文件，必须另开部署镜像契约，不能把 Mac 路径误称
   server-local path。

### C. 独立 Remote MCP principal

创建 principal `demiurges-codex-operator`，actor 为
`mcp-remote:demiurges-codex-operator`，exact grants 只能是：

- tools：`coordinate.channel_create`
- workspaces：`demiurges`
- platforms：`discord`

使用现有 production policy rollout contract：mutation lock、备份、atomic replace、schema validate、
service restart/readiness、read-back。失败采用 forward recovery；不得覆盖其他 principal 或恢复整个活跃 DB。

### D. Codex Remote MCP 配置

依据官方 Codex config contract，使用 `codex mcp add` 在本机用户配置中添加 Remote MCP server；当前
Codex CLI 0.145.0 实测只加载 `~/.codex/config.toml`，没有加载本 worktree 的项目级 `.codex/config.toml`，
因此不提交一份不会生效的项目配置：

- URL 指向 production Coordinate Streamable HTTP endpoint；
- `bearer_token_env_var` 指向 Demiurges 专用环境变量；
- `enabled_tools` 只允许 `coordinate.channel_create`（若当前 Codex 版本支持该配置键）。

token 不进入 Git。当前已启动的 Codex task 不声称热加载；使用新 task / app reload 后验证。

### E. 验证与交还

1. 使用该 principal 的 Remote `tools/list` 验证：
   - 可见且仅可见 `coordinate.channel_create`；
   - policy read-back 的 workspace/platform 精确为 `demiurges`/`discord`。
2. 验证未创建 `demiurges` channel binding，保留实际创建动作给 Demiurges Operator。
3. Operator 调用固定输入：

```json
{
  "input": {
    "workspace_id": "demiurges",
    "channel_name": "demiurges",
    "idempotency_key": "demiurges-channel-create-v1"
  }
}
```

4. 首次为 `pending` 时每 5 秒以完全相同输入重放，最多 12 次；`provisioned` 或 `failed` 立即停止；
   60 秒仍 pending 则保留 durable request 并报告，不换 key、不走 SSH/Discord 旁路。

## 5. 文档与提交范围

允许修改：

- `docs/project-harness/harness-checklist.json`
- `docs/project-harness/events.jsonl`
- `docs/project-harness/harness-state.json`
- `docs/project-harness/current/*` 中由 lifecycle 生成的 current cache
- `docs/project-harness/tasks/DH-012/*`
- `docs/project-harness/runbook.md` 与必要的 current-profile 说明
- 项目 runbook 中的本机 Remote MCP launcher 与配置说明，但不得包含 credential

不允许修改 Demiurges product source、tests、dependencies 或其他历史 task 正文。

## 6. 验收条件

1. canonical main 本地可重建并运行 `.artifacts/harness/harnessctl`，validator/doctor 通过。
2. `DH-012` 是唯一 active item，plan locator 指向本文件。
3. production `workspace list` 包含 `demiurges`，host profile 精确为 `macbook-local` canonical 路径。
4. production policy 有一个独立 principal，权限集合严格等于 1 tool + 1 workspace + 1 platform。
5. credential plaintext 未进入 Git、task artifacts、shell history、process argv、日志或 policy。
6. Remote `tools/list` 对该 principal 可见且仅可见 `coordinate.channel_create`。
7. 当前任务未创建频道；Demiurges Operator 可在 reload/new task 后执行固定 idempotent request。
8. branch 只包含允许路径；validator、`git diff --check` 与独立 reviewer 通过。
9. 提交推送后 read-back remote SHA；是否合并 main 由本任务现有 human authority 决定。

## 7. 回滚与失败语义

- 本地 runtime 失败：保留 Git authority 不变，重新从已 pin 的 EXharness template 实例化。
- policy mutation 失败：atomic writer 保留旧 policy；如 service readiness 失败，恢复 policy backup 并再验证。
- workspace/host registration 部分成功：保持安全但不可用的显式状态，使用同值幂等补齐；不直接编辑 DB。
- Codex config 失败：用 `codex mcp remove coordinate_demiurges` 移除本机 entry；production principal 本身只具一个安全的、workspace-scoped tool。
- 未通过 exact `tools/list` 前，不调用 `coordinate.channel_create`。

## 8. 明确不做

- 不实现新 Coordinate、MultiNexus 或 Demiurges 产品代码；
- 不创建 Discord channel、不调用 Discord API/CLI 旁路；
- 不注册 agent、不启动 agentd；
- 不增加 production file mutation / task lifecycle grants；
- 不清理旧 worktree；
- 不自动建立 server-side Demiurges repository mirror；
- 不把 task artifacts 复制成第二份 authority。
```

## Recent Progress Context

```md
# 进展

## 2026-08-09 — DH-000 bootstrap 已关闭

已完成：

- 接受产品身份 `Demiurges`；
- 在 `/Users/Admin/projects/Demiurges` 创建独立本地 Git 仓库；
- 建立 repo-local scope、architecture、domain model、technical foundation 与 geometry roadmap；
- 将 Lyaup 记录为只读技术捐赠者，而非源码母体；
- 定义 falling-cube walking skeleton；
- 创建一个 bootstrap checklist item 与 review packet；
- 将仓库文档统一为中文主体，并在 `AGENTS.md` 固化语言规则。

本地验证：

- EXharness checklist validation 以 0 warning 通过；
- `harness-checklist.json` 可解析，并只包含一个 active bootstrap item；
- `workflow.branch` 与 `artifacts.branch` 一致；
- 所有已登记 artifact path 均存在；
- 3 条本地 event record 均可独立解析为 JSON；
- 当时全部 Markdown 本地链接均可解析；
- `git diff --check` 通过；
- Git status 只包含已授权的 bootstrap 文件。

Independent review：

- Kimi Code `kimi-code/k3` 以 `max` effort 完成只读审查；
- Decision 为 `approved`，P0 与 P1 均为无；
- Operator 复核 reviewer 前后仓库 SHA-256 manifest 完全一致；
- 完整结论见 `tasks/DH-000/review-verdict.md`。

待完成：无。该段只描述 `DH-000` 关闭时的历史状态。

尚未创建 product code、dependency、remote、commit、deployment、Issue 或 PR。

## 2026-08-09 — Spark/3DGS 路线校准

- 第一条 `falling-cube` Runtime MVP 继续明确不接入 Spark/3DGS；
- 3DGS 被定位为带 provenance 与 alignment 的 appearance/observation representation，不定义 Kernel；
- Spark 被定位为 3DGS 的 Presentation 实现；
- 3DGS 验证阶段移动到 imported mesh 之后、articulated robot 之前；
- Product MVP 早期以 `EntityRef`、frame、units、collision proxy 与 MuJoCo state 的可检查 alignment 为验收目标。

## 2026-08-09 — DH-001 Falling Cube 已实现，等待独立审查

已完成：

- 创建 Bun workspace 与 SolidJS/Vite Studio；
- 建立最小 immutable Kernel records 与内存 `WorldRepository`；
- 用真实 `@mujoco/mujoco 3.11.0` 单线程 WASM 从 Snapshot 编译 MJCF 并生成 Episode；
- 生成 TerminalSnapshot 与独立 deterministic EvaluationRecord；
- 建立 Three.js Observation、结构化 inspector、Episode timeline、evaluate 与 explicit adopt；
- 证明 `run` 不推进 current ref，只有 `adopt` 才推进；
- 完成桌面与移动端真实 Chromium acceptance。

验证结果：

- `bun test`：4 pass、0 fail、22 assertions；
- `bun run typecheck`：通过；
- `bun run build`：通过，实际生成约 10.1 MB 的 `mujoco.wasm`；
- 浏览器：76 samples，terminal 高度约 `0.250 m`，高度误差 `0.00007 m`，末速度约 `0 m/s`，Evaluation 为 `PASS`；
- 浏览器：WebGL context 有效，无 page error/alert；桌面与 390px 移动布局均经截图检查。

当前状态：实现者已完成本切片并准备 reviewer packet；`DH-001` 等待 independent reviewer verdict，Coding agent 不自行标记 `done`。

## 当前风险

- MuJoCo WASM 首次加载成本与 Three.js 主 chunk 体积尚未做真实网络性能预算；当前证据只覆盖本地 Product slice 正确性。
- Repository 尚未 persistence，刷新页面会丢失 Snapshot/Episode；这是明确 non-goal，不用补丁伪装持久化。
- Spark/3DGS 仍不进入第一条 Runtime slice；它们在 imported mesh 之后进入 Product MVP 早期 alignment 验证。

## 下一步

先由独立 reviewer 审查 `DH-001`。只有 approved 后，Operator 才能关闭 item；后续实现必须从新的 checklist item 与用户 authority 出发，不能在本切片顺手扩展 Agent、3DGS、机器人或通用 Adapter SDK。

## 2026-08-09 — DH-001 启动重大变更交叉审查

- 用户授权对重大审查同时使用 `gpt-5.6-sol`（`max`）sub-agent 与 Kimi Code K3（`max`）进行交叉审查；
- 两位 reviewer 使用同一只读 authority、fresh session 和结构化 severity/decision contract，但分别侧重领域 authority 与实现 correctness；
- product artifact 审查前 aggregate SHA-256 为 `48d160ccdb1fdf86955d00f99f55069eddcda31fd1f8f82a42b6e8241ba929e9`；审查后必须复核不变；
- 任一 reviewer 提出 P0/P1，或两者在阻断问题上分歧，都不得自动 close；先由 Operator 对照 source 与测试复核。

## 2026-08-09 — DH-001 交叉审查结论为 changes_requested

- Kimi Code K3 Max：`approved`，无 P0/P1；
- GPT-5.6 Sol Max：`changes_requested`，报告 duplicate identity、Snapshot 初态映射、sample grid、Runtime validation/provenance 与 EvaluationRecord immutability P1；
- Operator 逐项独立复现 Sol 的反例，确认不是 reviewer 推测；
- Operator 重跑 `bun test`、typecheck、build 均通过，说明现有 happy-path checks 不足以覆盖这些 invariant；
- 审查后 product aggregate SHA-256 仍为 `48d160ccdb1fdf86955d00f99f55069eddcda31fd1f8f82a42b6e8241ba929e9`；reviewer 未改产品文件；
- `DH-001` 不关闭，进入 `changes_requested`。下一步从底层 invariant 修复并补 regression tests，不以 UI 文案、兼容 flag 或零散 guard 掩盖。

详细结论：`tasks/DH-001/cross-review-verdict.md`。

## 2026-08-09 — DH-001 开始 invariant 修复

- 用户明确授权修复交叉审查确认的 P1；
- 继续使用同一 `DH-001` item 与 canonical plan，不创建第二套任务事实；
- 实现纪律采用 regression-first：先让 duplicate identity、完整初态映射、exact sample grid、invalid Runtime/provenance 与 EvaluationRecord immutability 测试失败，再做最小实现；
- 不在本轮引入 persistence、provider abstraction、3DGS、Agent 或新的安全/权限层。
- Regression RED 已确认：旧实现运行新 tests 为 4 pass、5 fail、1 error；五类 P1 均有独立失败信号，原有 happy path 仍为 4 pass。

## 2026-08-09 — DH-001 invariant 修复完成本地验证

- Repository 不再允许相同 Snapshot ID 覆盖已有 immutable content，避免 ref 在未 adopt 时改变所指世界；
- Snapshot 的 floor rotation、cube rotation、linear velocity 与 world angular velocity 进入真实 MuJoCo；对 MuJoCo free-joint 的 local angular velocity 语义在 Runtime 边界显式转换；
- 240 Hz physics / 30 Hz observation 以 integer step modulo 采样，76 个 sample 对齐 `index / 30`；
- malformed program、伪造 RuntimeProfile、错误 frame/units 与不受支持状态 fail closed；RuntimeEvidence 只由实际 implementation 常量生成；
- EvaluationRecord 递归冻结，ID 同时编码 Episode、evaluator 与完整 success-contract identity；
- `bun test`：9 pass、0 fail、117 assertions；`bun run typecheck` 与 `bun run build` 通过；
- 真实浏览器 acceptance：edit 后 ref 为 `snapshot:edit-1`，run 得到 76 samples、terminal `0.250 m`，evaluate 为 `PASS`；run/evaluate 不推进 ref，explicit adopt 后才变为 `snapshot:terminal-studio-1`；控制台无 error；
- 修复后 product aggregate SHA-256 为 `a992f412f8b1ced1c8182f492c307f8c9f7b2af1a956ebc80f96451abfb496a7`。当前等待 fresh cross-review，Coding agent 不自行关闭 `DH-001`。

## 2026-08-09 — DH-001 第二次交叉审查仍为 changes_requested

- Kimi Code K3 Max：静态审查 `approved`，唯一 P2 是 world/local angular velocity 的 round-trip test 仍可能同错相消；其 plan-mode 无法独立执行 `bun`/hash/browser；
- GPT-5.6 Sol Max：`changes_requested`，并用只读反例复现四类 P1：固定 identity 未覆盖 program/profile 全参数；浅层 freeze 与 mutable ExplicitInputs 允许 await 期间证据漂移；未实现的 static/extra Entity state 被接受后旁路；contact event 与当前 MuJoCo state 晚 `1/240s`；
- Sol 独立运行 `bun test` 为 9 pass、0 fail、117 assertions，说明第一轮回归已修复原五类问题，但尚未覆盖这四类更深 invariant；
- 两位 reviewer 审查前后 product digest 均为 `a992f412f8b1ced1c8182f492c307f8c9f7b2af1a956ebc80f96451abfb496a7`，未修改产品；
- combined decision 按预设规则采用 `changes_requested`。继续同一 Phase 7，从 input identity/immutability、supported-world closure 与 observation timing 四个根因统一修复，不关闭 item。

## 2026-08-09 — DH-001 第二轮 invariant 修复完成本地验证

- 新回归在旧实现上得到 9 pass / 4 fail / 125 assertions，分别复现不完整 identity、浅层 freeze、旁路 Entity state 与 contact 晚 `1/240s`；
- 固定 `WorldProgram` / `RuntimeProfile` 现在完整约束 id、target、duration、sample rate、provider、version、equivalence、timestep 与 gravity；
- Snapshot、Program、Profile 与 ExplicitInputs 必须在 Runtime 第一个 await 前递归冻结，避免 execution 与 evidence 混合两个输入版本；
- falling-cube slice 的 supported-world set 闭合为恰好 `entity:floor + entity:cube`；静态地面必须使用 0 mass 与 0 velocity，额外未演化 Entity fail closed；
- Runtime 每个 `mj_step` 后执行 `mj_forward` 再观察 contact，使 `contact-began` 与当前 state/time 对齐；cleanup 改为 nested finally；
- angular velocity test 新增 sample 1 的独立数值 quaternion oracle，降低 round-trip 同错相消风险；
- 修复后 `bun test`：13 pass、0 fail、130 assertions；typecheck/build 通过；浏览器 edit/run/evaluate/adopt 再次通过，76 samples、PASS、ref 仅在 adopt 后推进，console 0 warning/error；
- 新 product aggregate SHA-256：`8c1a4015990433dc196e2175f79a8700d351ab6e0ead60e2091d1cddffe14d21`。等待 fresh cross-review，不自行关闭 item。

## 2026-08-09 — DH-001 第三次交叉审查为 changes_requested

- Kimi Code K3 Max fresh static review：`approved`，无 P0/P1；其首个本轮 session 因 transient repo write 越过 authority 被中止，Operator 复核无残留、digest 不变后，以禁用 Bash/Edit/Write 的新 session 重做；
- GPT-5.6 Sol Max：`changes_requested`，独立运行 13/0 tests 后复现 shallow-frozen Repository mutation、orphan lineage adopt、sparse Vec3 → NaN completed evidence、同 runId/不同 base 的派生 identity collision；
- 审查前后 product digest 均为 `8c1a4015990433dc196e2175f79a8700d351ab6e0ead60e2091d1cddffe14d21`；
- combined decision 采用 `changes_requested`。下一轮只修 admission invariant：递归冻结即使 root 已 frozen 也遍历 children；Repository parent 必须可解析；Vec3 显式检查 0/1/2 槽；Episode/Terminal identity 绑定 base Snapshot。

## 2026-08-09 — DH-001 第三轮 invariant 修复完成本地验证

- 新回归旧实现：13 pass / 4 fail / 134 assertions；四类 Sol 反例均有独立 RED；
- 修复后 `bun test`：17 pass、0 fail、140 assertions；typecheck/build 通过；
- `deepFreeze` 在 frozen root 上仍递归 children，并以 WeakSet 避免 cycle 重入；Repository current ref 不再可能因 shallow child 外部 mutation 改变；
- Repository 只接纳 parent 已登记的 Snapshot，orphan terminal 无法 record/adopt；
- Vec3/halfExtents 校验显式访问三个槽位，sparse array 不再绕过；Evaluator 对非 finite terminal evidence fail closed；
- Episode/Terminal/Evaluation identity 绑定 run 与 base Snapshot，不同 base 复用 runId 不再碰撞；
- 浏览器第三次完成 edit/run/evaluate/adopt：76 samples、PASS，ref 从 `snapshot:edit-1` 仅在 adopt 后变为 `snapshot:terminal-studio-1--edit-1`，console 0 warning/error；
- product digest：`52c26a6d7e3de7533a6b8307da52172b75c8be476ef23334662c1a52589c3fe1`。等待 final fresh cross-review，不自行关单。

## 2026-08-09 — DH-001 Final cross-review 仍为 changes_requested

- Kimi K3 Max static review：`approved`，无 P0/P1；
- GPT-5.6 Sol Max：`changes_requested`，复现 length-ambiguous derived ID、accessor-backed frozen Vec3 await mutation、null-parent runtime terminal、derived Evaluation metric overflow；
- Sol 独立运行 tests 为 17 pass / 0 fail / 140 assertions，digest before/after 均为 `52c26a6d7e3de7533a6b8307da52172b75c8be476ef23334662c1a52589c3fe1`；
- 继续最小修复：使用 length-prefixed identity；deep immutable 同时要求 plain own-data property；source-parent 关系一致；输出与派生 metric 均 finite。

## 2026-08-09 — DH-001 第四轮 invariant 修复完成本地验证

- RED：17 pass / 4 fail / 144 assertions；GREEN：21 pass / 0 fail / 146 assertions；
- length-prefixed execution key 消除 run/base segment 编码碰撞；
- immutable record 现在要求 frozen plain own-data graph，accessor-backed Array 在第一个 await 前被拒绝；
- runtime-terminal 必须具有 parent；Repository 不能采纳 null-parent terminal；
- MuJoCo observation 与 Evaluation 派生 metrics 均对 non-finite fail closed；
- typecheck/build 通过；Chromium 76 samples、PASS、ref 只在 adopt 后推进、console 0 warning/error；
- product digest：`528cbf328e469ec1f5b54cbc64aaefeeae46ab0a56ad5bbdbcdbaea0ef7784dc`。等待 approval gate。

## 2026-08-09 — DH-001 Approval gate 为 changes_requested

- Sol 独立确认 accessor Vec3、ambiguous segments、null-parent terminal、MAX_VALUE metric 四类反例已关闭，`bun test` 21/0/146；
- 新复现两项 P1：`write(runtime-terminal)` 可绕过 adopt；accessor Success Contract 可令 Evaluation ID 与 predicate 使用不同 tolerance；
- digest before/after 均为 `528cbf328e469ec1f5b54cbc64aaefeeae46ab0a56ad5bbdbcdbaea0ef7784dc`；
- 继续只收紧现有入口：write/record/adopt 按 source 分工；Evaluator 只消费 plain immutable Episode/Contract。

## 2026-08-09 — DH-001 Operation admission 修复完成

- RED：21 pass / 2 fail / 148 assertions；GREEN：23 pass / 0 fail / 153 assertions；
- `write` 只接纳 `source: write` root，`record` 与 `adopt` 只接纳 `runtime-terminal`，terminal 无法绕过 adopt 推进 ref；
- Evaluator 在读取任何 metric/contract 字段前要求 Episode 与 SuccessContract 都是递归冻结的 plain data record；
- typecheck/build 与 Chromium edit/run/evaluate/adopt 通过；76 samples、PASS、ref 仅 adopt 后推进，console 0 warning/error；
- product digest：`b05bcf70cd8e368cf573329cb733c72a3565241a2f172f2d7aaa03a951e0dec8`。等待聚焦 closure review。

## 2026-08-09 — DH-001 Focused closure review approved

- GPT-5.6 Sol Max 独立 verdict：`approved`，P0/P1/P2 均无；
- reviewer 独立运行 `bun test`：23 pass / 0 fail / 153 assertions；
- operation probe 证明 write/record/adopt 按 source 分工，只有 explicit adopt 推进 terminal ref；
- accessor SuccessContract probe 在读取任何 getter 前被 plain-data gate 拒绝，`reads=0`；
- reviewer digest before/after 均为 `b05bcf70cd8e368cf573329cb733c72a3565241a2f172f2d7aaa03a951e0dec8`，未修改产品；
- 实现者 typecheck/build/browser acceptance 继续有效。`DH-001` 已满足 reviewer gate，但 Coding agent 不自行 `mark-done`，等待 Operator 关单决定。

## 2026-08-09 — DH-002 Episode Player 已实现，等待独立审查

- Human/Operator 授权进入下一切片后，依据 `DH-001` 已存在的 focused approval 正式关闭 `DH-001`，并新建、激活 `DH-002`；
- Runtime 继续离线生成不可变 Episode；新增 `EpisodePlayer` 只在 Presentation 层以 `requestAnimationFrame` 将 wall time 映射到 `EpisodeSample.timeSeconds`；
- 新 Episode 默认从 sample 0 自动回放，支持播放/暂停、重播、前后逐帧、timeline seek 与 `0.5x / 1x / 2x`；reduced-motion 下不自动播放；
- 播放器只选择真实 sample，不插值、不修改 Episode，不调用 Repository；Repository view 失活时 clock 停止，explicit adopt 不会被残余 tick 抢回；
- regression-first 证据从缺少 clock module 的 RED，进入 26 tests / 166 assertions 全绿；typecheck/build 通过；
- 真实浏览器证明自动推进、暂停稳定、逐帧、倍速续播、seek、Evaluation PASS、run/evaluate 不推进 ref，以及播放中 adopt 后稳定进入 terminal authority；
- 当前 product aggregate SHA-256 为 `945b0a827397b44f4570f01891891a4269805b0d6bca8e9fe4d5ebe49e402f36`，准备 independent read-only review。

## 2026-08-09 — DH-002 Independent review approved

- fresh reviewer 未发现 P0/P1/P2，确认播放器只回传 sample index，Repository ref 仍只由 explicit adopt 推进；
- reviewer 确认 `active=false` 会 cancel rAF、清除 playing identity，旧 tick 也因 ID mismatch fail closed；pause、seek、rate change 统一停止并重锚，terminal 不再请求下一帧；
- reviewer 独立运行 `bun test`：26 pass / 0 fail / 166 assertions；
- reviewer digest before/after 均为 `945b0a827397b44f4570f01891891a4269805b0d6bca8e9fe4d5ebe49e402f36`；
- 最终 decision 为 `approved`。Coding agent 不自行 `mark-done`，等待 Operator 关闭 `DH-002`。

## 2026-08-09 — DH-002 获得 release authority

- 用户明确授权 commit、发布与 `mark-done`；
- 当前 Git `main` 尚无首个 commit，remote 与 deployment target 均不存在，根 package 为 `private`；
- 本轮 release boundary 为：Operator close → 首个本地 commit → annotated tag → `/Users/Admin/projects/my release/Demiurges/` 下的 committed source/build/checksum/receipt；
- 不创建未授权 remote，不伪称 GitHub、npm 或公网 deployment。

## 2026-08-09 — DH-002 Operator close 完成

- release gate：`bun test` 26 pass / 0 fail / 166 assertions，typecheck/build 通过，checklist validation 0 warning；
- Operator 运行 `mark-done`，事件为 `evt-20260810T023458Z-706fa171`；`DH-002` 已为 `done/closed`，lease 已释放；
- Git release locator 为 `release/dh-002-episode-player`；本地正式发布 locator 为 `/Users/Admin/projects/my release/Demiurges/dh-002-episode-player/`；
- 最终 commit SHA 与 artifact checksum 由 Git tag和外部 release receipt 自描述，repo 内不维护自引用 SHA。
- staged whitespace cleanup 仅删除 `episode-player-clock.ts` 末尾多余空行；release product digest 为 `899f2bba2090a6cffa839d8b33111eccca1b96f956b9a941deec10b8caa230f4`，targeted clock tests 为 3/0/13，gitleaks staged scan 无泄漏。

## 2026-08-09 — GitHub repository 建立并发布首个 release

- 用户明确授权：若 GitHub repository 尚不存在则使用 `gh` 创建，并要求以后在获得 commit authority 后同步 push；
- 已在 active `gh` account `baisiqi6` 下创建 private repository `https://github.com/baisiqi6/Demiurges`，配置为 canonical `origin`；
- `main` 已推送至 `526c5cf83901f68caad19e3ee911ef3740c1a2ad`；annotated tag `release/dh-002-episode-player` 的 remote dereferenced target 同为该 commit；
- 后续 commit + push 纪律已写入 `AGENTS.md` 与 `runbook.md`；该持续规则只规定已授权 commit 的交付方式，不扩大 commit、push 或 release authority；
- GitHub source publication 不代表 deployment；当前仍无 deployment target。

## 2026-08-09 — DH-003 World Ref 与安全 Adopt 实现完成，等待独立审查

- 新 item `DH-003` 已在独立 branch/worktree `agent/codex/DH-003` / `/Users/Admin/projects/WorkTrees/Demiurges-DH-003` 激活；
- 基线为 26 tests / 166 assertions；新增 authority test 在旧实现上因缺少 Host AdoptPolicy contract 明确进入 RED；
- Repository ref 现在是递归冻结的 `{ name, snapshotId, version }`，root write 初始化 v1，成功 advance/adopt 各自只递增一次；
- authored edit 只记录 child，explicit advance 才推进；Runtime Episode、Evaluation、record 与 Playback 均不推进 ref；
- AdoptPolicy 由 Host composition 显式注入；adopt 只接受已登记 Episode、同一 Episode 的已登记通过 Evaluation、匹配 evaluator/contract/policy、runtime terminal 与 fresh `expectedCurrent + expectedRefVersion`；
- stale CAS、相同 Snapshot 但旧 version、失败 Evaluation、错配 Episode/evaluator/contract/policy、未登记 evidence 与 terminal-only bypass 均有 executable regression；
- GREEN 为 32 tests / 0 fail / 200 assertions，typecheck/build 通过；build 仅保留既有 MuJoCo browser-external notice 与大 chunk warning；
- 真实浏览器证明 `v1 → edit/advance v2 → run/playback/evaluate 仍为 v2 → PASS adopt v3`，Evaluate 前 Adopt disabled，成功后再次 disabled；
- 当前 product source aggregate SHA-256 为 `2cd5edf7cdebaccd74851baa5cd65281f9d8f99bedb0397354626a3a0f174a7d`。下一步是 independent read-only review；Coding agent 不自行批准或关单。

## 2026-08-09 — DH-003 Round 1 审查缺口已从 Host 边界修复

- `gpt-5.6-sol/max` 在 digest `2cd5edf...` 上给出 `changes_requested`，并以可执行 probes 证明两个 P1：同名不同参数的 SuccessContract 可绕过 policy；伪造 frozen Episode/Evaluation 可把 height 99、`NaN` terminal 提升为 current；
- 新增回归先因缺少 `RuntimeMvpHost` 明确进入 RED（0 pass / 1 fail / 1 error）；
- 修复没有增加零散 provenance 字段：新增最小 `RuntimeMvpHost` effect boundary，私有持有 evidence capability，并只组合固定 MuJoCo Runtime、Program/Profile、Landing evaluator 与 canonical SuccessContract；
- Studio 只调用 `runCurrent`、`evaluateEpisode` 与 `adopt`，不再能提交任意 Episode/Evaluation；外部 capability 在任何 terminal Snapshot 入库前 fail closed；
- 修复后 34 tests / 0 fail / 210 assertions，typecheck/build 与 `git diff --check` 通过；build 仍只有既有 MuJoCo browser-external notice 与大 chunk warning；
- 真实浏览器复验仍为 `v1 → edit/advance v2 → run/evaluate 保持 v2 → PASS adopt v3`，Evaluate 前 disabled、Adopt 后再次 disabled；
- 修复后 product source digest 为 `d9ca6da0c6f1fd459ca786ae3d2d3545b84a12d3793ec6b75f94608f2c87411e`，进入 fresh cross-review。

## 2026-08-09 — DH-003 evidence authority 收束为 lexical closure

- Round 2 Kimi/K3 对 digest `d9ca6da...` 给出 approved；Sol/max 随后在同一 digest 上复现更强反例：在 Host 构造前替换导出的 `WorldRepository.prototype.recordEpisode`，可从 existing Host 截获 symbol capability 并 Adopt forged height 99 / `NaN` terminal；
- 实现者把该 executable probe 视为 changes requested；新增 regression 先证明旧 module 仍导出可拦截 class（expected false / received true）；
- 修复没有增加 token 隐藏层：Repository implementation 改为 module-private `WorldRepositoryState`，factory 只返回冻结 facade 与 evidence-writer lexical closures；`RuntimeMvpHost` 私有持有该 authority，admission 不再通过动态方法参数传递 symbol；
- 独立创建的另一 authority 只能影响它自己的 Repository，无法登记到 existing Host；
- 修复后 35 tests / 0 fail / 213 assertions，typecheck/build/diff-check 通过；真实浏览器第三次复验仍为 v1→explicit advance v2→run/evaluate 保持 v2→PASS adopt v3；
- product source digest 为 `495a6c95299e19bd3e714e381f2cb2b472a12b0aec45e7a8b647077fd96feec2`，等待 final fresh cross-review。

## 2026-08-09 — DH-003 Final cross-review approved

- Kimi/K3 与 GPT-5.6 Sol Max route 分别执行 fresh read-only review；两者都独立运行 35 tests / 0 fail / 213 assertions 与聚焦 `bun -e` probes；
- 两份 verdict 均为 `approved`，P0/P1/P2 none；digest before/after 都是 `495a6c95299e19bd3e714e381f2cb2b472a12b0aec45e7a8b647077fd96feec2`，工作树 status 前后不变；
- Final review 明确确认：Repository implementation 不导出；Host 私有持有 lexical repository/evidence closures；没有 symbol/token dynamic dispatch；foreign factory 只能影响自己的世界；forged evidence 与 alternate contract 无法进入 existing Host；
- `DH-003` 满足关单条件，进入 Operator close 与已授权 commit + push gate。

## 2026-08-09 — DH-003 Operator close 完成

- Closeout packet 经 final cross-review approval；`mark-done` 事件为 `evt-20260810T044915Z-946886aa`；
- `DH-003` 已为 `done/closed`，lease 于 `2026-08-10T04:49:15Z` 释放；checklist validation 0 warning；
- 发布边界为 commit + push `agent/codex/DH-003` 并回查 remote SHA；不 merge `main`，不伪称 deployment。

## 2026-08-09 — DH-003 已集成，DH-004 World Tool Surface 已实现

- Human 授权把已审查的 `agent/codex/DH-003` fast-forward merge 到 `main` 并 push；local `main`、`origin/main` 与 GitHub remote ref 均为 `15744fb3aeae2f995765047d657aef9821f653cb`；
- 新建 `agent/codex/DH-004` 与 `/Users/Admin/projects/WorkTrees/Demiurges-DH-004`，登记并激活 `DH-004`；
- 增加直接组合 `RuntimeMvpHost` 的 `WorldToolSurface`，model-facing prototype 恰好为 `read`、`write`、`edit`、`run`；
- `run` 返回同一 Host 产生的 Episode、deterministic Evaluation 与 base ref，但不推进 current；`adopt` 不进入模型工具面，只由持有同一 Host 的 Harness control boundary 执行；
- JSON round-trip input 会按 exact plain-data fields 复制、校验、冻结；accessor、错误 prototype、额外字段、非法 number/ID/ref version fail closed；
- scripted operator 证明四个工具可以完成 write → read → edit → run/evidence，随后 control side 才能显式 adopt；
- 当前验证为 39 tests / 0 fail / 245 assertions，typecheck、build、`git diff --check` 通过。下一步生成 review packet 并接受 independent read-only review；Coding agent 不自行审批或关单。

## 2026-08-09 — DH-004 Round 1 P1 已从 Repository transaction 修复

- Kimi Code K3 Max Round 1 给出 `changes_requested`：stale model edit 先插入 authored child、后 CAS 拒绝，导致 orphan Snapshot partial side effect；Sol reviewer 因 worktree 随后变化被标记 superseded，没有在混合 digest 上给 verdict；
- Operator 独立运行反例，确认 `stale_ref` 同时存在 `snapshot:edit-2` orphan；
- 修复从底层 authority transaction 出发：Repository 的同步 `editCurrentCubeHeight` 先检查 expected ref，fresh 时才创建 child 并推进；tool surface 不增加 guard、mode 或第五个工具；
- 回归现在证明 stale edit 后 current 不变且 orphan 不存在；修复后 39 tests / 0 fail / 246 assertions，typecheck、build、diff-check 通过；
- 当前 product source digest 为 `1d95045e02f39c676b2f362535a1846cd7b25747d6ab9f98b2e2545a7ed3076d`，下一步只在该 digest 上执行 fresh cross-review。

## 2026-08-09 — DH-004 Round 2 P1 已从 Host method-table invariant 修复

- Kimi Code K3 Max 在 digest `1d95045e...` 上 fresh approved；GPT-5.6 Sol Max 随后以 executable probe 证明可替换 `RuntimeMvpHost.prototype.readRefRecord`，从 tool dynamic dispatch 的 `this` 捕获 existing Host 并调用 `adopt`；combined verdict 为 `changes_requested`；
- Operator 独立复现 `captured === host`、adopt `updated`、ref v1 → v2，确认不是 reviewer 推测；
- 修复不增加 facade/registry/provider abstraction，而是在模块初始化时冻结作为 authority boundary 的 `RuntimeMvpHost.prototype`；
- regression 证明 `defineProperty`/assignment replacement 被拒绝、tool read 正常且 existing Host 未泄露；Round 1 atomic edit regression 同时保持；
- 当前 40 tests / 0 fail / 250 assertions，typecheck、build、diff-check 通过；product source digest 为 `9575362e701a6c980898ce448c6847522941c9cb102eaae28cedd0af7c4896db`，等待 final fresh cross-review。

## 2026-08-09 — DH-004 Final fresh cross-review approved

- Kimi Code K3 Max 与 GPT-5.6 Sol Max 在同一 product digest `9575362e701a6c980898ce448c6847522941c9cb102eaae28cedd0af7c4896db` 上完成 fresh/focused read-only review；
- 两份 verdict 均为 `approved`，P0/P1/P2 none；review 前后 digest 与 Git scope 不变；
- reviewer 独立验证 Host prototype 的 assignment/`defineProperty` interception 均被阻止，既有 capture probe 不再成立；
- Round 1 stale edit atomicity、四工具形状、run ref 不变、control-side adopt、JSON admission/output freeze 均保持；
- reviewer 独立运行 40 tests / 0 fail / 250 assertions。DH-004 已满足 reviewer gate，进入 Operator close 与已授权 commit + push；不 merge `main`。

## 2026-08-09 — DH-004 Operator close 完成

- Closeout request 事件：`evt-20260810T063932Z-9baaf80a`；final cross-review approval 事件：`evt-20260810T063932Z-5e55cf4c`；
- Operator `mark-done` 事件：`evt-20260810T063932Z-b294cfaf`；DH-004 已为 `done/closed`，lease 于 `2026-08-10T06:39:32Z` 释放；
- checklist validation 为 0 warning；最终 verification 绑定 40/0/250、typecheck/build/diff-check、完整 product digest 与双 reviewer approval；
- 当前发布边界为 commit + push `agent/codex/DH-004` 并回查 remote SHA；不 merge `main`，不代表 deployment。

## 2026-08-10 — DH-005 OMP Agent Runtime vertical slice 已实现

- Human 确认把所需能力内置到 Demiurges，但边界是不复制或 fork OMP 源码；OMP 作为锁定版本的可替换 Agent Runtime，Demiurges 保留 World Kernel 与 control authority；
- 新建 `agent/codex/DH-005` 与 `/Users/Admin/projects/WorkTrees/Demiurges-DH-005`，登记并激活 `DH-005`；
- 新增本地 Bun Agent Gateway，固定 `@oh-my-pi/pi-coding-agent@17.2.12`，只注册 `world_read`、`world_write`、`world_edit`、`world_run` 四个 host-owned tools；
- Round 1 executable cross-review 发现原 CLI/RPC composition 仍继承 ambient MCP，并处理 slash command 与 `@file` mention；combined verdict 为 `changes_requested`，原 digest `6bb22b193648b6f3d36d9176809409f10415d2f54d102fbd23393882da30f0d3` 未获批准；
- 修复没有继续叠加 CLI flags，而是从 composition 根部改为 OMP SDK restricted session：关闭 MCP、built-ins、extension discovery、skills/rules、IRC、LSP 与持久 session；任何 prompt 前核验 active/enabled 四工具与空 mounted surface；
- Gateway admission 拒绝 slash/control 与 `@file` preprocessing syntax；失败 turn 通过 `OmpAgentTurnError` 保留 frozen bounded trace，cleanup failure 不覆盖 primary failure；
- fake Agent walking skeleton 从自然语言请求出发，按 write → read → edit → run 完成 falling-cube task，Evaluation 为 PASS，run 后 ref 保持 authored version 2；Gateway boundary tests 当前为 6 pass / 0 fail / 32 assertions；
- 真实 OMP SDK boot smoke 在未发送 prompt、未发起 provider model call 的情况下成功：从 package manifest 读取 runtime `17.2.12`，effective tool surface 恰好为四工具，读取 state 后干净退出；
- Studio 尚未连接 Agent Gateway，真实 provider/model prompt 也未获授权、未执行。下一步是全量验证与 independent review，不自行 `mark-done`、commit 或 push。
- 修复后 full gate 已通过：46 tests / 0 fail / 282 assertions；Gateway + Studio typecheck、Gateway bundle + Studio Vite build、no-prompt SDK smoke、`git diff --check` 与 checklist validation 均通过；新 product source digest 为 `72675cebc90d57d45e33f1bb4c40199a6929b3609e79c0d098e1f65805237ff7`。现在对该冻结 snapshot 发起 fresh independent cross-review；在双审批准前不 `mark-done`、commit 或 push。
- Round 2 Kimi static review 为 `approved`，但 Sol executable review 发现 admission 晚于 SDK start、trace 仍无整体预算，combined verdict 再次为 `changes_requested`；
- 最终修复把 prompt admission 提到 client factory/start 前，并对 tool input、trace data 与单 turn tool-call count 建立明确预算；oversized input 与 129-call regression 证明 failure evidence 有界且超限 turn 失败；
- 新 full gate 为 47 tests / 0 fail / 291 assertions，typecheck/build/no-prompt SDK smoke/diff-check/checklist validation 通过；final candidate product digest 为 `fdbf25f25d81ff7028a56d3a71d5687ceace624ecdec9189b4341e6e3ce1b23a`，等待 final fresh cross-review。
- Round 3 Kimi static review 为 `approved`，Sol executable review 继续发现 descriptor admission 与 trace key budget 两个 P1，combined verdict 为 `changes_requested`；
- 最终修复使用 `Reflect.ownKeys + descriptor`，拒绝 hidden/symbol/accessor/array/`__proto__` input；trace key bounded 后写入 null-prototype projection，budget 整个 turn 共享；getter reads 与 surface calls 均为 0，1 MiB key trace 保持小于 8 KiB；
- 最新 full gate 为 48 tests / 0 fail / 304 assertions，typecheck/build/no-prompt SDK smoke/diff-check/checklist validation 通过；final candidate digest 为 `1b3b6496f1f27fe7bd89f0db105f60745e027108922507eb3301f7f1ca594dae`。
- Round 4 final cross-review 已双审批准：GPT-5.6 Sol Max executable review 与 Kimi Code K3 Max static review 均为 `approved`，P0/P1/P2 全无；允许进入 EXharness closeout 与 operator `mark-done`，但不包含真实 provider prompt、merge main、tag 或 deploy authority。

## 2026-08-10 — DH-006 本地 Agent—Studio 闭环已规划

- Human 确认下一条 vertical slice 是把已验证的 Agent Runtime 接成 Studio 可观察的本地产品闭环；
- `DH-006` 采用 Gateway-owned Product Session 单一事实面：connected Studio 只提交输入并呈现权威 `Snapshot`、`Episode` 与 `EvaluationRecord`，不维护第二个可写 Host；
- 当前 Gateway 对 `apps/studio/src` 的反向复用将在出现第二个真实调用方后提升为最小内部 world module，不用 transport patch 固化错误 ownership；
- 首个传输选择 bounded HTTP streaming NDJSON 加只读 resync，不提前引入 WebSocket 或通用 event bus；
- 首先使用 scripted/fake Agent 完成 `write → read → edit → run`，真实 provider/model prompt、credential 与费用仍需单独授权；
- 已创建独立 `agent/codex/DH-006` branch/worktree 与 canonical plan，随后获得 Human implementation authority 并完成 ASSIGN/ACCEPT 激活；当前 authority 仍不包含真实 provider prompt、commit、push、merge、tag 或 deploy。

## 2026-08-10 — DH-006 本地 Agent—Studio 闭环已实现，等待独立审查

- 在 Studio 与 Gateway 成为两个真实调用方后，把既有 Kernel、Repository、MuJoCo Runtime、Evaluation、Host 与 world tools 提取为内部 workspace package `@demiurges/world`；Gateway 不再反向 import `apps/studio/src`，Presentation 与 OMP 均未进入共享 package；
- 新增 Gateway-owned `ProductSession`：每个 session 私有持有唯一 `RuntimeMvpHost`，scripted Agent 按 `world_write → world_read → world_edit → world_run` 执行；`world_run` 返回 Episode、TerminalSnapshot 与 Evaluation，但 current ref 保持 authored edit version 2；
- 新增 product-owned `ProductSessionEvent`/`ProductSessionProjection` contract；OMP observer 在 Gateway 内转换为产品证据，OMP message/event shape 不穿透 transport；
- 新增本地 HTTP API：`POST /api/sessions`、只读 `GET /api/sessions/:id` resync，以及 bounded ordered `POST /api/sessions/:id/turns` NDJSON stream；未知 session、非法 route、oversized/非法输入 fail closed，未暴露 Agent-facing adopt route；
- Studio 删除 connected path 的本地 Host，改用 `ProductSessionClient`；自然语言输入、四工具 trace、3D Observation、EpisodePlayer 与 PASS/FAIL 全部由 Gateway authoritative evidence 驱动；
- TDD 增加 import boundary、single authority、Product Session、真实 Bun HTTP、NDJSON arbitrary-chunk parser 与 connected Studio source boundary tests；当前 full gate 为 56 tests / 0 fail / 340 assertions，`bun run typecheck`、`bun run build`、`git diff --check` 与 checklist validation 均通过；
- 真实 Chromium 验收通过：首个 session 从空世界提交任务后显示四工具 trace，Episode timeline 从约 frame 8/75 继续推进到 frame 75/75，而非终态闪现；Evaluation 为 PASS，current ref 始终是 `snapshot:edit-1` version 2，terminal Snapshot identity 与 current ref 不同；新建第二个 session 后全部呈现状态清空，再次执行同样通过，浏览器无 warning/error；
- 未发送真实 OMP/provider prompt，未读取 credential、未产生模型费用。现进入 Phase 4 independent cross-review；批准前不 `mark-done`、commit 或 push。
- Round 1 Kimi Code K3 Max static review 与 GPT-5.6 Sol Max executable review 均为 `changes_requested`。两者共同确认并发 HTTP admission TOCTOU 会让竞争失败请求返回空 `200 NDJSON`；Sol 另以真实 probes 复现空流误判成功、断流不 resync、DTO/lifecycle admission 过浅、chunked UTF-8 byte/content-type bound 绕过，以及 synthetic internal/credential-like error 泄露；
- Round 1 product digest 在 executable review 前后均为 `20ed24ff354f9ac178d8aef2560f959f44ef12bc984dcfc64f20503af28c755a`，56/0/340 与既有 gates 仍绿，但这些 green tests 未覆盖 transport adversarial boundary。Combined verdict 阻断 closeout，下一步从原子 reservation、严格 product admission、failure resync、真实 byte/media-type limit 与 public error code 五个根部修复，不 commit/push。
- Round 1 remediation 已从 transport contract 根部完成：`ProductSession.tryRunTurn` 在构造 200 stream 前同步原子取得 turn authority；HTTP request 逐 chunk 统计 UTF-8 bytes、精确匹配 `application/json`；`@demiurges/world` 新增 product codec，深验 event lifecycle、session/turn identity、trace sequence、tool/evidence association 与 Snapshot/Ref/Episode/Evaluation DTO；
- Studio 对空流、缺 terminal、断流、parse、fetch/abort error 都执行只读 resync，并通过 frozen `ProductSessionTurnError.projection` 覆盖 partial cache；Gateway failure trace/event 只暴露 `world_tool_failed`/`agent_turn_failed`，不转发 OMP、Host、path、credential-like internal message；import boundary regression 扩展为扫描全部非测试 source；
- 新 adversarial tests 直接覆盖并发慢 body、chunked 18KB UTF-8 body、`application/jsonp`、synthetic secret/internal error、空 200、partial stream disconnect、cross-turn identity、负 trace sequence、tool/evidence mismatch、2.5MB malformed projection 与伪装 response media type；full gate 为 62 tests / 0 fail / 375 assertions，typecheck/build/diff/check/checklist 全绿；
- 真实 Chromium Round 1 fix acceptance：session 1 首 turn 在约 120ms 显示 frame 7/75，最终 frame 75/75、PASS、current ref `snapshot:edit-1` v2；同 session 第二 turn 只显示 `agent_turn_failed` 与 failed `world_write`，经 resync 保留原权威 ref/Episode/Evaluation，DOM 与 console 无 internal 泄露；新建 session 2 后再次得到四工具、75-frame、PASS，console 无 warning/error。新 digest 为 `af5167ef946d4190127e5bf70d2ad290dbb50377bbc549f0197bbf42b87a02db`，等待 fresh focused cross-review；批准前不 close/commit/push。
- Round 2 combined verdict 为 `changes_requested`：Kimi K3 Max 静态 review 为 approved，但明确发现 runId producer 与 256 字符 codec identity budget 不一致；Sol Max 以 executable probes 证明合法长 identity 已被错误拒绝，并复现断流后一次 resync 可永久卡在 `running:true`、stale_ref ref/snapshot 漂移、sparse/accessor codec 绕过和 failed trace input 泄露；
- 由于可执行 P1 优先于静态 approved，本轮不关单、不提交。修复方向是 bounded settled resync、descriptor-safe plain-data projection、producer-aligned identity budget 与 failed trace input redaction；完成 RED regressions、full gates 和 Chromium 复验后再进行 Round 3 fresh cross-review。
- Round 2 remediation 从 contract 根部完成：Studio 在失败后 bounded follow-up resync 到 `running:false`，预算耗尽则清空 partial authority；codec 在任何语义读取前以 own descriptors 复制全新 plain-data graph，拒绝 sparse/accessor/non-enumerable/symbol/超预算输入，getter regression 保持 0 reads；
- 删除错误的 256 字符派生 identity 上界，合法 300 字符 runId 已通过真实 MuJoCo run、产生长 Episode/Evaluation identity 并被 projection codec 接纳；整体 2M char、100k node、64 depth 与 collection budget 继续 fail closed；
- `world_edit` 对 updated/stale_ref 都绑定 ref/snapshot 且 Agent 只允许 advance；failed product trace input 固定为 `[redacted]`；单 turn 最多接受 start + 128 tool events + terminal；
- 最新 full gate 为 68 tests / 0 fail / 395 assertions，typecheck/build/diff-check/checklist validation 通过。真实 Chromium 为 frame 7/75 → 75/75、PASS、ref v2；失败 turn 只显示 public code 并保留 resync evidence，DOM/console 无 internal marker；fresh session 再次成功。新 digest `b476912e93c8417e00e79c930597c6aa2a8711c2e3aa4e2a847f3f530cb5bff8` 进入 Round 3 fresh cross-review，批准前不 close/commit/push。
- Round 3 combined verdict 为 `changes_requested`：Kimi K3 Max static approved；Sol Max executable review 证明 attempt count 不约束悬挂 resync GET，并用当前 OMP producer 复现 failed tool 经模型纠正后合法 completed/PASS 被 Studio 误拒；
- 修复方向不是隐藏 failed tool，而是让 terminal event 成为 turn outcome authority，并用单一 wall-clock deadline 覆盖每个 resync GET。透明 Proxy traps 记录为 JSON wire 不可达的 P2，不引入 Node-only 复杂度。
- Round 3 remediation 已完成：`#readSettledSession` 的单一 wall-clock deadline 覆盖首个与后续 GET，每次真实 fetch 带 AbortSignal，Promise deadline 同时覆盖忽略 signal 的 port；30ms 悬挂 GET regression 在 100ms 外部 guard 前稳定拒绝；
- Studio 不再从历史 tool statuses 推导 turn outcome；failed tool 保持可见和脱敏，当前 OMP client 可纠正后继续四工具并以 `turn.completed`、Evaluation PASS 收口。130-event 正边界与 131-event 拒绝均有测试；
- 最新 gate 为 71 tests / 0 fail / 403 assertions，typecheck/build/diff/check/checklist 通过。Chromium 为 frame 9/75 → 75/75、PASS/ref-v2；失败 turn 显示 public code并保留 resync evidence，DOM 无 internal marker、console 为空。Final digest `f1d58ab9a72c88edb53a5ca56a1eedb3a94727198da3360628349c0ece7f4a64` 进入 Round 4 final review，批准前不 close/commit/push。
- Round 4 final cross-review 已双审批准：GPT-5.6 Sol Max executable review 与 Kimi Code K3 Max static review 均为 `approved`，无 P0/P1；Sol 独立复现悬挂 resync 的 wall-clock 拒绝、当前 OMP failure→correction→completed/PASS、130/131 event 边界与全部快速回归；
- Kimi 记录两项非阻断 P2：成功路径的最终 projection GET/turn POST timeout 纵深，以及 exact 512-char runId 正例尚未单独落测。Final product digest 保持 `f1d58ab9a72c88edb53a5ca56a1eedb3a94727198da3360628349c0ece7f4a64`；DH-006 已满足 reviewer gate，可生成 closeout packet，但 commit/push/merge/tag/deploy 与真实 provider prompt 仍未授权。

## 2026-08-10 — DH-006 Operator close 完成

- Human 明确授权 `mark-done`、commit、push，并授权把已批准分支合并到 `main`；
- Operator `mark-done` 事件为 `evt-20260810T153512Z-08901f39`；DH-006 已为 `done/closed`，lease 于 `2026-08-10T15:35:12Z` 释放；
- 发布候选仍绑定 product digest `f1d58ab9a72c88edb53a5ca56a1eedb3a94727198da3360628349c0ece7f4a64`、71/0/403、typecheck/build/diff/check/checklist、Chromium acceptance 与 Round 4 双审批准；
- Git 发布边界为先 push `agent/codex/DH-006` 并回查 remote SHA，再以 fast-forward 方式推进 `main` 并再次回查；不创建 tag，不代表 deployment，也不授权真实 provider prompt。

## 2026-08-10 — DH-007 离线实现与最终交叉审查通过

- production Gateway 已切换到显式 `DEMIURGES_OMP_MODEL=provider/model` 的 restricted OMP composition；scripted Agent 仅保留为显式 test/browser fixture；
- provider/model/credential session affinity、ambient/intrinsic fallback、ancillary inference、统一 deadline/cancellation 与 turn-owned tool capability 均经过五轮 adversarial review；
- Round 5 Sol Max 与 Terra Max 在 frozen product digest `4b157dbb4c04946ce0a238aa9fbd71df1380ea37c07ac7d4ac5ff34a2023935b` 上独立批准，P0/P1/P2 均无；full gate 为 87 tests / 0 fail / 459 assertions；
- 当前只证明 offline product composition 已准备好。下一 gate 是 Human 对唯一 provider/model、credential source、调用/时间/费用边界明确授权的一次真实 canary；未授权前不调用、不 closeout、不 commit/push。

## 2026-08-10 — DH-007 首次真实模型闭环成立

- Human 单独授权后，production Gateway 以 `kimi-code/k3` 和 OMP `17.2.12` 执行唯一一次 bounded canary；credential 仅经 OMP AuthStorage 使用，未读取或写入证据；
- 自然语言任务在 27,833 ms 内自主完成 `world_write → world_edit → world_run`，产生 76-sample Episode 与确定性 Evaluation PASS；current ref 保持 authored `snapshot:edit-1 / v2`，terminal Snapshot 未被 Agent adopt；
- 该结果首次证明 Demiurges 的真实模型路径不是 scripted fixture：模型只通过四工具改变/推演世界，产品仍以 Snapshot/Episode/Evaluation 为 authority；
- Gateway 已停止，没有第二个 turn。DH-007 的产品验收已满足，但 closeout、mark-done、commit、push、merge、tag 与 deploy 仍是独立 authority gate。

## 2026-08-10 — DH-007 Operator close 完成

- Human 在看到 Round 5 双审、完整本地 gates 与真实 canary receipt 后明确授权 closeout、mark-done、commit 和 push；
- closeout `evt-20260811T014025Z-f9f64fb3`、Human final acceptance `evt-20260811T014025Z-7d048edc`、CLOSE `evt-20260811T014025Z-ee79bfc5` 已顺序落盘，未使用 force override；
- `DH-007` 已为 `done/closed`，lease 已释放，checklist validation 为 0 warning；下一动作仅为发布 `agent/codex/DH-007` branch，不隐含 merge `main`、PR、tag 或 deploy。

## 2026-08-10 — DH-007 集成完成，DH-008 Imported Rigid Entity 已规划

- 修正 `architecture.md` 与 `runbook.md` 中“仍只有 scripted Agent / live canary 未执行”的过时事实，product digest 保持 `4b157dbb4c04946ce0a238aa9fbd71df1380ea37c07ac7d4ac5ff34a2023935b`；
- docs correction commit `ac293318c8a6b2fe7433146df7417cc3c83e2726` 已 push，随后 `main` 从 `a570064a7292821166fd65f074577a22b0390c14` fast-forward 到同一 SHA；GitHub `main` 与 `agent/codex/DH-007` refs 已回查一致；
- 从新 `main` 创建 `agent/codex/DH-008` 与 `/Users/Admin/projects/WorkTrees/Demiurges-DH-008`；canonical plan 将下一切片限定为一个 repo-owned imported GLB rigid fixture、独立 box collision proxy，以及跨 EntityRef/Frame/Units/Three.js/MuJoCo/Episode/Evaluation 的可检查 alignment；
- `DH-008` ASSIGN `evt-20260811T015218Z-debb1144`、ACCEPT `evt-20260811T015218Z-acc5ffed` 已落盘，checklist validation 0 warning。当前只授权规划，不开始产品实现、资产下载、真实模型调用或 Git 发布。

## 2026-08-10 — DH-008 Imported Rigid Entity 已实现，等待独立审查

- Kernel 已分离 imported visual mesh 与 box collision proxy；repo-owned asymmetric GLB 以固定 digest/provenance/frame/units/alignment 登记，MuJoCo 只消费 collision evidence，Three.js 以稳定 `EntityRef` 完成加载、选择、Episode playback 与 session reset；
- scripted Product Session 仍经 `read/write/edit/run` 四工具完成 imported wedge 推演，76-sample Episode 与 collision-derived Evaluation PASS；URL/path/file input 与 identity/alignment drift fail closed；
- 当前门禁为 96 tests / 0 fail / 516 assertions，typecheck/build/diff-check 与真实 Chromium acceptance 通过。未调用真实 provider，未 commit/push；进入 frozen-digest independent review gate。

## 2026-08-10 — DH-008 Round 1 reviewer blocker 已根部修复

- Sol/Terra executable cross-review 共同复现 Product codec 未绑定 authored Snapshot、Episode samples、terminal EntityRef/representation 的 P1；Kimi reviewer 通道因 CC Switch 无 token/tool event 连接失败而停止，未伪造 verdict；
- remediation 建立 exact EntityRef set、immutable representation/physics/frame/units、terminal-last-sample、base-ref 与 streamed-turn authored-world 证据闭环，并删除 Studio 缺帧回退；
- 修复后为 98 tests / 0 fail / 522 assertions，typecheck/build/diff-check/GLB digest/Chromium 通过；新 digest `f20e0fc96472615433778fdc0475cb59a0f9a7b17df1ccbf19af9a7edd268910`，进入 fresh Round 2 review。

## 2026-08-10 — DH-008 Round 2 terminal identity blocker 已修复

- Sol 批准原证据链 remediation；Terra 发现 terminal Snapshot ID 可与 base ID 相同的 lineage P1，combined verdict 继续阻断；
- codec 已拒绝 terminal/base identity 冲突，Studio episode source label 同步 fail-accurate；98 tests / 0 fail / 523 assertions 与 typecheck/build/diff-check 通过，新 digest `7879c0cf637ea64092daebc4c51fe4cb32422cfc160b52b9e11268dd39aec5f7` 等待 final focused review。

## 2026-08-10 — DH-008 final cross-review approved

- Round 3 Sol/Terra 在 digest `7879c0cf637ea64092daebc4c51fe4cb32422cfc160b52b9e11268dd39aec5f7` 上双审批准，P0/P1/P2 均无；
- final Chromium 复验 imported asset、逐帧 Episode、PASS 与 reset 清理；DH-008 已进入 Human closeout gate，未 commit/push/真实 prompt。

## 2026-08-10 — DH-008 Operator close 完成

- Human 授权后完成 closeout packet、fresh closeout approval 与正常 `mark-done`，未使用 force override；
- CLOSE event `evt-20260811T050106Z-c2088c45`，DH-008 为 `done/closed` 且 lease 已释放；
- 下一动作仅为提交并 push `agent/codex/DH-008`，不隐含 merge `main`、PR、tag、deploy 或真实 provider prompt。

## 2026-08-10 — DH-008 集成完成，DH-009 3DGS / Spark 切片已规划

- `main` 已从 `ac293318c8a6b2fe7433146df7417cc3c83e2726` fast-forward 到 `fdbbf680122c06810f58da37d9973d4f0aa2c984` 并推送，远端 `main` SHA 已回查一致；
- 从新 `main` 创建 `agent/codex/DH-009` 与 `/Users/Admin/projects/WorkTrees/Demiurges-DH-009`；
- canonical plan 把 3DGS 明确为同一 imported rigid Entity 的独立 `observation` representation：GLB visual、box collision proxy、MuJoCo state 与 Episode authority 保持不变，Spark 只在 Presentation 层消费经过 digest/frame/units/alignment 校验的 repo-owned bytes；
- 计划选择一个确定性生成的小型 PLY diagnostic fixture、单一 SparkRenderer、`mesh / 3dgs / overlay` Studio-local mode，以及来自真实 loaded bounds 与 Episode pose 的结构化 AlignmentEvidence；不建立通用 Artifact SDK、远程资产通道或第五个 world tool；
- 只读 dependency gate 确认候选 `@sparkjsdev/spark@2.1.0` 为 MIT、要求 `three >=0.180.0`，当前 `three 0.185.1` 满足。精确 dependency 只在实现阶段按 plan 锁定；
- 当前 Human authority 要求计划完成后再进入实现，但不包含 `DH-009` commit/push、真实 provider prompt、PR、merge、tag 或 deploy。

## 2026-08-10 — DH-009 3DGS Observation / Spark Presentation 已实现

- 同一 imported rigid Entity 现在同时持有 GLB visual、repo-owned 3DGS observation 与 box collision proxy；observation 不能绑定 primitive，Product codec、Runtime admission 与跨 Episode evidence closure 均 fail closed；
- Spark 在现有 Three.js scene 内呈现经过 digest 验证的 2,048-splat PLY，Studio 提供 GLB/3DGS/overlay 与 measured AlignmentEvidence；MuJoCo trajectory/Evaluation 不消费 3DGS；四工具 surface 未扩张；
- 最终 operator gate 为 102 tests / 0 fail / 2,615 assertions，typecheck/build/diff-check、deterministic asset、harness validation 与真实 Chromium playback/reset 通过；Spark disposal race 已从根部关闭；
- 下一步是冻结 product digest 并进行 fresh independent cross-review。批准前不 closeout/mark-done，Human 未授权前不 commit/push。

## 2026-08-10 — DH-009 product candidate frozen for Round 1 review

- 最终 product digest 为 `e9d9b1eb1a51f04342cc3aff4ab7211714e705021a910117ccd6d75bb54a5053`；digest 排除 harness/review 文档，纳入所有 tracked diff 与 untracked product bytes；
- final Chromium 重新验证 resize、GLB/3DGS/overlay、frame 12/75、alignment PASS、Evaluation PASS、reset 清空与第二 Session 重载；无 page error、非 favicon console/HTTP error，server log 只剩 Spark 的 `THREE.Clock` upstream warning；
- 现进入两个 fresh reviewer 互相隔离的 Round 1 gate，未 closeout/mark-done/commit/push。

## 2026-08-10 — DH-009 Round 1 cross-review blocked

- Sol/Terra 对 digest `e9d9b1eb1a51f04342cc3aff4ab7211714e705021a910117ccd6d75bb54a5053` 均给出 `changes_requested`；
- blockers 为 quaternion/bounds 可产生虚假 alignment PASS、observation 可绑定错误 EntityRef、Splat initialized rejection 资源泄漏；另有 stale error dataset P2；
- Round 1 历史已保留，进入根部 remediation 与新 digest gate，不 closeout/commit/push。

## 2026-08-10 — DH-009 Round 1 remediation frozen for Round 2

- codec/Runtime 已把 observation 锁到 `entity:cube`，并拒绝非单位 Entity pose；alignment 独立拒绝非法 pose、reversed/sparse/non-finite bounds 与 observation transform；
- Splat reject/stale 路径现在先释放实例，observation dataset 在 loading/error/reset 成组清理；
- remediation gate 为 102/0/2,626，typecheck/build/diff/artifact/harness/Chromium 通过；新 digest `03550f8693a990a20f5a4555c11635831dbf6c1653400590596a2fa3f328939b` 进入 fresh Round 2，仍未 closeout/commit/push。

## 2026-08-10 — DH-009 Round 2 combined alias blocked

- Terra approved，Sol `changes_requested`：同时交换 Ref 与 representations 可让 observation 位于名义 `entity:cube`、实际 static floor record；
- Product decoder 正与唯一 Runtime role contract 对齐，验证精确 floor/cube、static/dynamic、mass/velocity/friction 与 positive geometry，并加入 JSON round-trip 组合反例；
- Round 1/2 verdict 永久保留，未 closeout/commit/push。

## 2026-08-10 — DH-009 fixed-role final candidate

- Product decoder 已与 falling-cube Runtime role contract 对齐，组合 Ref/representation/state/event alias regression fail closed；
- final gate 102/0/2,627、typecheck/build/diff/harness/Chromium 通过；digest `79b9050ee69ea8c6869fb51521aa9b128da40d070b6ad27b0e27249fe2aebec5` 进入 Round 3 final cross-review；
- 仍未 closeout/mark-done/commit/push。

## 2026-08-10 — DH-009 Round 3 final cross-review approved

- Sol/Terra 在 final digest `79b9050ee69ea8c6869fb51521aa9b128da40d070b6ad27b0e27249fe2aebec5` 上双审批准，P0/P1/P2 无；
- fixed-role identity、Round 1 alignment/lifecycle、四工具、artifact、Runtime/Episode/Evaluation authority 全部闭合；
- item 进入 Human closeout gate，未 closeout/mark-done/commit/push。

## 2026-08-10 — DH-009 closeout authorized

- Human 已授权 closeout、mark-done、commit 与 push feature branch；不授权 merge `main`、PR、tag、deploy 或真实 prompt；
- closeout 继续绑定 final digest `79b9050ee69ea8c6869fb51521aa9b128da40d070b6ad27b0e27249fe2aebec5` 与 Round 3 双审证据。

## 2026-08-10 — DH-009 closeout audit approved

- fresh closeout auditor 批准当前 packet，P0/P1/P2 无；digest 前后一致，diff/checklist 通过；
- 正常 mark-done gate 已满足，不使用 force。

## 2026-08-10 — DH-009 Operator close completed

- closeout review `evt-20260811T064924Z-c2d5a8f6`、CLOSE `evt-20260811T064924Z-55360c81` 已顺序落盘；
- item 为 `done/closed`，lease 已释放，未使用 force；
- 发布只包含 commit/push feature branch，不包含 main merge、PR、tag、deploy 或真实 prompt。

## 2026-08-11 — DH-009 集成完成，DH-010 曲面容器切片已规划

- `main` 已从 `fdbbf680122c06810f58da37d9973d4f0aa2c984` fast-forward 到 `22e288690937834135584d023e4140e26696f761` 并推送，远端 `main` SHA 已回查一致；
- 从新 `main` 创建 `agent/codex/DH-010` 与 `/Users/Admin/projects/WorkTrees/Demiurges-DH-010`；
- canonical plan 选择“ball into vessel”作为第二个真实世界任务：一个 smooth curved vessel visual、一个保留开放腔体的 compound collision proxy、一个 dynamic sphere 与 stable-inside-vessel Evaluation；
- 计划明确 vessel 仍是单一 Entity，多个 collision parts / MuJoCo geoms 不获得 EntityRef；visual、collision、physics、semantic frame 与 Evaluation 保持独立 authority；
- 第二个任务已证明 `cubeHeight`、固定 `entity:cube`、single-box collision 与 landing-only metrics 是 walking-skeleton 偶然细节，因此计划允许一次恰好覆盖两个真实任务的最小根部泛化，但不建立通用 CAD、Adapter SDK、plugin system、机器人或 world-model provider；
- 当前只完成设计与验收计划，等待 Human/Architect 确认后再进入实现；未改产品 source、未安装 dependency、未调用真实 provider，也未授权 commit/push 当前 feature branch。

## 2026-08-11 — DH-010 canonical plan 经四轮交叉审查批准

- Round 1/2/3 的 P1 依次推动计划补齐 continuous support/penetration、wall-sensitive physical control、compound part ownership、task-local transform、AdoptPolicy closure、唯一 model-facing JSON contract、Gateway pre-admission parity、`world:current` 与 quaternion `1e-9` authority；历史 verdict 均 append-only 保留；
- Round 4 在 frozen plan digest `2738b3135434507dd5b53aea74bb87e45af21912fa72789a7b1096ca33ffa21a` 与 context aggregate `c52a8ddb38ee15692a828fce9fd3dacb9e9710915691f8822612286ce7769e0d` 上完成 fresh Sol Max + Kimi K3 Max 交叉审查；两路均 `approved`，P0/P1 为 0；
- approved plan 冻结三个 fixture、两个 Program、nested object pose、30Hz/0.5s/16-sample/16-of-16 support、pair-attributed penetration、16-wall compound、semantic rim carrier、Runtime-direct closed proxy、closed AdoptPolicy registry 与 Phase 1–4 headless gate；
- 当前批准只表示 plan 可成为 implementation authority。`DH-010` 继续为 `todo/planned`，未改产品 source、未安装 dependency、未调用 provider，也未授权 commit/push/PR/merge/tag/deploy；下一步等待 Human 明确授权进入 Phase 1 Contract RED。

## 2026-08-11 — DH-010 Phase 1 Contract RED 已冻结

- Human 授权后激活 `DH-010` lease，并严格停在已批准 plan 的 Phase 1：冻结唯一 `WORLD_TOOL_CONTRACT`、三 fixture、两 Program、nested world-frame pose 与 input budget；
- 新增 executable RED 覆盖真实 Gateway/OMP/Host parity、legacy shape 删除、scenario mismatch/floor penetration、floor/vessel/ball carrier、sphere/compound/semantic rim、multi-entity Episode/contact、0.5s/16-sample containment、closed proxy、closed AdoptPolicy registry 与 Product codec closure；
- targeted 为 16 pass / 16 expected fail / 105 assertions；全量为 102 existing regression pass + 1 new contract-parser pass / 16 expected RED fail / 2,649 assertions。`bun run typecheck`、`bun run build` 与 `git diff --check` 通过；
- 证据见 `docs/project-harness/tasks/DH-010/phase1-red-evidence.md`。当前未进入 GREEN/geometry/Studio，未调用真实 provider，未 commit/push/PR/merge/tag/deploy，也未 close/mark-done。

## 2026-08-11 — DH-010 Phase 2 Artifact / Representation 已完成

- deterministic profile-of-revolution generator 连续两次产生 byte-identical `smooth-vessel-v1.glb`：26,256 bytes，SHA-256 `856788138ecc53d407827a0e67aa9977237dd914809316f8af992e8ee098cd92`；
- Kernel 增加 closed sphere、compound collision 与 vessel semantic carrier；canonical Snapshot 精确包含 floor/vessel/ball，vessel 的 base + 16 walls 仍只属于同一个 `EntityRef`；
- Repository admission 与 artifact registry 已拒绝 digest/bounds/provenance、part alias、sparse/accessor/non-finite pose、quaternion、semantic frame/envelope drift；local-to-world transform probe 覆盖 translated + yaw off-axis composition；
- targeted 21/0/2,197，全量 110 pass / 14 expected RED fail / 2,705；typecheck/build/diff-check 通过。14 个 RED 继续保留给 Phase 3/4，Presentation 对尚未实现的 sphere/compound visible path 明确 fail closed；
- 证据见 `docs/project-harness/tasks/DH-010/phase2-artifact-evidence.md`。未进入 Runtime/Evaluation/visible slice，未调用真实 provider，未 commit/push/PR/merge/tag/deploy，也未 close/mark-done。

## 2026-08-11 — DH-010 Phase 3 Authoring / MuJoCo Runtime 已完成

- 唯一 `WORLD_TOOL_CONTRACT` 已成为 Surface、Host 与 OMP 的共同输入权威：三个 fixture、nested Entity pose 与两个 explicit Program 均可达，legacy model-facing `cubeHeight`/run-only shape 已删除；
- MuJoCo Runtime 现在闭合支持 falling-rigid 与 ball-vessel 两个 scenario；vessel 单一 Entity 编译为 exact base + 16 wall geoms，dynamic sphere 产生 91-sample multi-entity Episode；
- 内部 geom-owner map 将 contact 折叠为只含 EntityRef、unit world normal 与 finite penetration 的 public evidence；wall-sensitive trajectory 真实观测到水平 vessel contact，closed lid 只可从 Runtime-direct seam 运行且不能进入 Repository；
- full gate 为 122 pass / 6 expected Phase 4 RED fail / 2,751 assertions；typecheck/build/diff-check/artifact digest 通过。6 个 RED 精确保留给 containment Evaluation、closed AdoptPolicy registry 与 ball-vessel Product codec；
- 证据见 `docs/project-harness/tasks/DH-010/phase3-runtime-evidence.md`。未进入 Phase 4/5，未调用真实 provider，未 commit/push/PR/merge/tag/deploy，也未 close/mark-done。

## 2026-08-11 — DH-010 Phase 4 Headless Gate 已完成

- stable-inside-vessel evaluator 已按 exact 0.5s/16-sample/30Hz tail、16/16 world-up semantic support、inner-floor distance、speed 与 pair-attributed penetration 生成 closed EvaluationRecord；hovering、bounce-apex、sidewall/transient、timestamp drift、penetration、malformed contact 与 completed closed proxy 均失败；
- Host 现在持有 falling-rigid / ball-vessel 两-entry frozen AdoptPolicy registry；Repository 不接纳 caller single policy，并将 Program、evaluator、contract、passed、terminal 与 Ref evidence 一起闭合；
- Product codec 接受 exact floor/vessel/ball carrier 与 91-sample semantic contacts，同时拒绝 part/geom 泄漏、wrong pair、sample grid drift 和 Program/Evaluation alias；
- full headless gate 为 130 pass / 0 fail / 2,778 assertions，typecheck/build/diff-check 与 deterministic GLB digest 通过；公共 evaluator 已从首个 scenario 的 `evaluateLanding` 机械收敛为 task-neutral `evaluateEpisode`，不保留双入口；Phase 1–4 product digest 为 `c893c0641d075f9080b1e977a582c0eb5ee5270fcb7129ccf3cb739680b42374`；
- 证据见 `docs/project-harness/tasks/DH-010/phase4-headless-evidence.md`。DH-010 继续 `doing/running`；Phase 5 Studio visible slice 尚未开始，未 commit/push/PR/merge/tag/deploy/closeout/mark-done。

## 2026-08-11 — DH-010 Phase 5 Visible Product Slice 已完成

- Studio 现在从受信 Snapshot/WorldRunResult 解析默认 Entity selection、Program/Profile、artifact 与 landing/containment metrics；App 不再硬编码 cube/landing/diagnostic fixture；
- smooth vessel、sphere、box/compound overlay 与 semantic rim-center frame 已进入同一个 Three.js viewport，所有 visual/collision/helper node 都解析回唯一 EntityRef；ball-vessel 无 3DGS 时明确 disabled，diagnostic wedge 的 GLB + Spark 3DGS 路径保持；
- 真实 Chromium 首次揭示 Bun/JavaScriptCore 与 Chromium/V8 对 runtime trig wall pose 的末位差异；fixture registry 已改为 16 个固定 plain-data pose，不放宽 codec equality，并补跨引擎 source 与 JSON round-trip regressions；
- Chromium 已通过 ball/vessel selection、91-frame playback、17-part overlay、rim frame、structured containment metrics、second Session、受控 late GLB release、diagnostic 3DGS alignment 与 820×700 resize；无 alert；
- full gate 为 139 pass / 0 fail / 2,826 assertions；typecheck/build/diff/artifact 通过；Phase 1–5 product digest `5e944de6896b697d30e4c58a1580bb7babae12fe41edf2d3c27dda3ebdb0a750`；
- 证据见 `docs/project-harness/tasks/DH-010/phase5-visible-evidence.md`。DH-010 继续 `doing/running`；等待 Human 授权 Phase 6 independent review，未 commit/push/PR/merge/tag/deploy/closeout/mark-done。

## 2026-08-11 — DH-010 Phase 6 Independent Cross-review 要求修改

- operator 在 frozen Phase 1–5 product digest `5e944de6896b697d30e4c58a1580bb7babae12fe41edf2d3c27dda3ebdb0a750` 上重跑 `139/0/2,826`、typecheck、build、diff 与 checklist，全部通过；
- fresh `GPT-5.6 Sol Max` 独立复算 digest/gates 后发现 4 个可执行 P1：Product codec 接受伪造 Evaluation、canonical friction/Ref drift；Host/Repository 接受 duplicate EntityRef；Studio asset registry 可被永久污染；operator 原样复现全部反例；
- CC Switch fresh reviewer 请求 `claude-opus-4-8 / effort max`，current-session proxy 证据确认实际 `model=k3`。其静态审查未发现产品 P0/P1，但因 `plan` 权限拒绝独立运行必要 gates，结论同样为 `changes_requested / may_closeout=no`；
- combined verdict 为 `P0=0, P1=4, P2=2, changes_requested, may_closeout=no`。证据见 `docs/project-harness/tasks/DH-010/phase6-cross-review-evidence.md`；
- `DH-010` 保持 `doing`，workflow 已进入 `changes_requested`。等待 Human 授权 bounded P1 remediation；未 commit/push/PR/merge/tag/deploy/closeout/mark-done。

## 2026-08-11 — DH-010 Phase 6 P1 remediation 完成

- Human 授权后，将四个 reviewer counterexample 先固化为 RED：伪造 Evaluation、canonical friction/Ref drift、duplicate EntityRef 与 mutable Presentation registry；修复前 targeted 为 `14 pass / 4 fail`；
- Snapshot admission 现在保证 EntityRef 全局唯一；Product codec 只接受 `world:current`、canonical fixture physics，并通过受信 contract/evaluator 重算整条 Evaluation；Presentation asset registry 递归冻结；
- codec 的 null-prototype 安全投影与 evaluator plain-data admission 已闭合，仍拒绝 accessor/class instance；没有增加 scenario patch、兼容入口或 renderer fallback；
- remediation gate 为 `142 pass / 0 fail / 2,834 assertions`，typecheck/build/diff-check 通过；generator/GLB digest 未漂移；新 product digest 为 `8687ad0dea2c675d8d04a61ebcacf4649bc41989d33d6163a3b5680619cacc6e`；
- 证据见 `docs/project-harness/tasks/DH-010/phase6-remediation-evidence.md`。历史 `changes_requested` 保留，等待 Human 另行授权 fresh independent re-review；未 commit/push/PR/merge/tag/deploy/closeout/mark-done。

## 2026-08-11 — DH-010 remediation fresh cross-review 仍要求修改

- Sol Max 与 CC Switch Kimi K3 Max 在 product digest `8687ad0dea2c675d8d04a61ebcacf4649bc41989d33d6163a3b5680619cacc6e` 上独立完成四类 mandatory probe 与 full gates；原四个 P1 均确认已修复；
- Kimi 批准并记录孤立 `world_read.ref.version` 未绑定 P2；Sol 发现新的 executable P1：registered floor/ball representation 仍可在 authored + terminal carrier 中同步漂移并携带原 PASS Evaluation；
- operator 原样复现 ball-vessel floor visual/collision `halfExtents=[30,30,0.5]` 仍被 codec 接受，Evaluation 仍为 PASS；product/status digest 前后未漂移；
- combined verdict 为 `P0=0, P1=1, P2=1, changes_requested, may_closeout=no`。证据见 `docs/project-harness/tasks/DH-010/phase6-remediation-cross-review-evidence.md`；
- DH-010 保持 `doing/running`，等待 Human 另行授权 bounded canonical representation remediation；未 commit/push/PR/merge/tag/deploy/closeout/mark-done。

## 2026-08-11 — DH-010 canonical representation P1 remediation 完成

- Human 授权后，先将 ball-vessel floor extent、ball visual color 与 falling-rigid floor extent 三种 authored + terminal 同步漂移固化为 RED；修复前为 `7 pass / 3 fail / 31 assertions`；
- Product codec 直接复用 canonical fixture Entity 闭合已登记 representation，没有新增第二套 geometry constant 或 scenario patch；dynamic `state/pose` 演进保持合法，diagnostic imported cube 继续由既有 exact artifact/collision/3DGS validator 闭合；
- targeted 为 `34 pass / 0 fail / 2,213 assertions`；full gate 为 `145 pass / 0 fail / 2,837 assertions`，typecheck/build/diff-check 通过，generator/GLB digest 未漂移；
- 新 product digest 为 `88a5d1e787df9cc5b73ae5fb117bc079c64665f5976e4b8795b5b22d2e863150`；证据见 `docs/project-harness/tasks/DH-010/phase6-representation-remediation-evidence.md`；
- 历史 `changes_requested` 保留，等待 Human 另行授权 fresh independent re-review；本轮未处理孤立 `world_read.ref.version` P2，未 commit/push/PR/merge/tag/deploy/closeout/mark-done。

## 2026-08-11 — DH-010 canonical representation remediation fresh cross-review 仍要求修改

- 有效 Sol Max Round 2 与 CC Switch Kimi K3 Max Round 3 在 frozen product digest `88a5d1e787df9cc5b73ae5fb117bc079c64665f5976e4b8795b5b22d2e863150` 上完成 full gates 与 executable probes；`145/0/2,837`、typecheck/build/diff/checklist/artifact 全通过；
- Sol 发现合法多轮 `run → 下一 turn edit-only` 会推进 current world 却保留旧 `lastRun`，最终 projection 因 base Ref 不一致而无法被 Studio codec 解码；operator 原样复现；
- Kimi 发现本轮 exact representation closure 只存在于 Product codec：Repository/Runtime 仍可写入 floor extent / ball color 漂移的 registered Snapshot，Evaluation PASS 后成功 adopt canonical Ref；operator 原样复现；
- Kimi 请求 `claude-opus-4-8 / max`，current-session provider/proxy 证据确认实际 `model=k3`、`status_code=200`；两次因 permission/isolation 失效的 attempt 被明确丢弃，不计入 verdict；
- combined verdict 为 `P0=1, P1=1, changes_requested, may_closeout=no`；证据见 `docs/project-harness/tasks/DH-010/phase6-representation-remediation-cross-review-evidence.md`；
- DH-010 保持 `doing/running`，等待 Human 另行授权 bounded root-authority + stale-lastRun remediation；未修改产品代码，未 commit/push/PR/merge/tag/deploy/closeout/mark-done。

## 2026-08-11 — DH-010 root authority / stale `lastRun` remediation 完成

- Human 授权后，先把 Repository/Runtime 接纳 registered representation 漂移与多轮 `run → edit-only` 保留 stale `lastRun` 固化为 RED；修复前定向为 `38 pass / 4 fail / 266 assertions`；
- 新增唯一 repo-owned `requireRegisteredSnapshotIdentity`，由 Repository、Runtime 与 Product codec 共同消费；registered static representation/physics 在世界 authority 根部 fail closed，动态 state/pose 与 diagnostic optional Observation 仍保持合法；
- ProductSession 在成功 `world_write/world_edit` 后失效旧 `lastRun`，`world_read` 保留 evidence，`world_run` 产生新 evidence，静态快照不再与旧动态历程自相矛盾；
- 最终 full gate 为 `149 pass / 0 fail / 2,849 assertions`；typecheck/build/diff-check/EXharness 通过，generator 与 vessel GLB digest 未漂移；新 product digest 为 `8be5fadc4393a69b70ffeaef602368e9d9fa4cf8e91a1cf0ab482d918c06b9a8`；
- 证据见 `docs/project-harness/tasks/DH-010/phase6-root-authority-remediation-evidence.md`。历史 `changes_requested` 保留，等待 Human 另行授权 fresh independent re-review；未 commit/push/PR/merge/tag/deploy/closeout/mark-done。

## 2026-08-11 — DH-010 root authority remediation fresh review 仍要求修改

- Sol Max 在 frozen product digest `8be5fadc4393a69b70ffeaef602368e9d9fa4cf8e91a1cf0ab482d918c06b9a8` 上完成 full gates 与 executable probes，发现 vessel static friction 未进入 shared registered Snapshot identity，漂移可被 Repository 接纳、进入 MJCF，并由同步 transport carrier 接受；
- 同一 reviewer 发现 stale CAS edit 虽返回 `update.status=stale_ref`、current Ref 完全未变，ProductSession 仍无条件清除有效 `lastRun`；operator 独立重放两项，分别确认 `world:current@1 + Runtime consumes 0.01` 与 `beforeHadLastRun=true → afterHadLastRun=false`；
- CC Switch 当前 session `c7d1ba43-cf5a-42e3-a2f4-711ce8586bfb` 的 proxy records 确认实际 `model=k3`；其批准结论因自报 accidental isolation exposure 不作为独立关单票，且任何 approval 都不能覆盖 Sol 的 executable blockers；
- `harnessctl review` 生成的 review packet 尾部空行使 reviewer 当时全 repo diff-check 失败，operator 在审查结束后只修正该 harness artifact；product digest 未变化；
- combined verdict 为 `P0=1, P1=1, changes_requested, may_closeout=no`；证据见 `docs/project-harness/tasks/DH-010/phase6-root-authority-remediation-cross-review-evidence.md`；
- DH-010 保持 `doing/changes_requested`，等待 Human 另行授权 bounded vessel-physics identity + stale-ref lifecycle remediation；未修改产品代码，未 commit/push/PR/merge/tag/deploy/closeout/mark-done。

## 2026-08-11 — DH-010 vessel physics / stale-ref remediation 完成

- Human 授权后，先将 vessel friction 漂移进入 Kernel/Repository/Runtime 与 `stale_ref` no-op 错误清除 `lastRun` 固化为 RED；修复前为 `38 pass / 4 fail / 273 assertions`；
- canonical vessel Snapshot 与 validator 共同消费 file-local frozen `VESSEL_PHYSICS`，闭合 `static / massKg=0 / friction=0.8`；Repository、Runtime 与 Product codec 通过既有 single registered Snapshot validator 同步 fail closed，没有增加第二套常量或 patch stack；
- ProductSession 现在只在 `world_write` 或 `world_edit.update.status=updated` 时失效旧 run evidence；`stale_ref` 保留与未变化 current Ref 一致的 `lastRun`；
- 最终 targeted 为 `52 pass / 0 fail / 312 assertions`，full gate 为 `149 pass / 0 fail / 2,857 assertions`；typecheck/build/diff-check/EXharness 与 artifact hashes 通过；
- operator 原反例回放确认 vessel friction 在 Repository/Runtime 均被 `vessel physics 与 fixture registry 漂移` 拒绝，且 stale-ref 前后 Ref 相同、`lastRun` 均存在；新 product digest 为 `85534951b9146283ffbceddec652a0440d0d38a7543ad4828a86eb42b5df1c57`；
- 证据见 `docs/project-harness/tasks/DH-010/phase6-vessel-physics-stale-ref-remediation-evidence.md`。历史 `changes_requested` 保留，等待 Human 另行授权 fresh independent re-review；未 commit/push/PR/merge/tag/deploy/closeout/mark-done。

## 2026-08-11 — DH-010 final remediation fresh cross-review 批准

- 两路 fresh、互相隔离的 reviewer 在 frozen product digest `85534951b9146283ffbceddec652a0440d0d38a7543ad4828a86eb42b5df1c57` 上完成 full gates 与 adversarial probes，起止 HEAD/product digest/status 均未漂移；
- CC Switch path 请求 `claude-opus-4-8 / max`，current-session proxy records 证明实际 downstream `model=k3`；其完成 `149/0/2,857` 与 42/42 额外断言，批准 `may_closeout=yes`；
- replacement GPT-5.6 Sol Max path 完成 `149/0`、typecheck/build/diff/checklist/artifact 与 Repository/Runtime/codec/stale-ref/run-adopt probes，bounded scan 未发现 P0/P1，终点 frozen identity 通过，批准 `may_closeout=yes`；首个无法收口 final verdict 的 Sol attempt 已中止且不计票；
- combined verdict 为 `P0=0, P1=0, approved, may_closeout=yes`，证据见 `docs/project-harness/tasks/DH-010/phase6-vessel-physics-stale-ref-cross-review-evidence.md`；
- EXharness 状态为 `doing / review_approved`。本轮只打开 closeout gate，尚未执行 closeout、`mark-done`、commit、push、PR、merge、tag 或 deploy。

## 2026-08-11 — DH-010 closeout 与 mark-done

- Human 授权后生成 `docs/project-harness/current/closeout-packet.md`，将两路 final approval 记录为 `phase=closeout_requested / decision=approved`；
- `harnessctl mark-done` 已将 DH-010 更新为 `done / closed`，清空 owner 与 current task pointer，并于 `2026-08-12T03:30:01Z` 释放 lease；
- closeout verification 继续绑定 frozen product digest `85534951b9146283ffbceddec652a0440d0d38a7543ad4828a86eb42b5df1c57`、`149/0/2,857`、typecheck/build/diff/checklist/artifact hashes 与两路 adversarial review；
- 当前仅获授权提交并推送 `agent/codex/DH-010`；未授权 PR、合并 `main`、tag 或 deploy。

## 2026-08-11 — DH-010.1 跨引擎 Evaluation 收尾候选

- 真实浏览器发现 Bun/JavaScriptCore producer 与 Chromium/V8 verifier 对同一 `Math.hypot` 结果存在约 `5.17e-26` 的末位差，旧 codec 因逐位相等错误拒绝合法 PASS projection；
- 新跨引擎 regression 先在旧实现上以 `Evaluation 与受信 evaluator 结果不一致` 明确 RED，再由共享 evaluator 将派生连续数值 canonicalize 为 15 位有效数字；codec 没有增加 tolerance bypass，transport 仍需与受信 canonical Evaluation 完全相等；
- V8 已接受真实 Bun ball-vessel projection，并拒绝被改写 `1e-12` relative 的 canonical metric；full gate 为 `151/0/2,863`，typecheck/build/diff/EXharness 与 scripted Chromium 91-frame playback/PASS 均通过；
- frozen product aggregate 为 `6bc13dfec1c33927105bfa29fbc47ac2f95dc3d47a60732ecb1ccc98ebb20465`，详细证据见 `docs/project-harness/tasks/DH-010.1/progress.md`；当前等待 independent reviewer，未 closeout、mark-done、commit 或 push。

## 2026-08-11 — DH-010.1 Round 1 probe boundedness remediation

- fresh reviewer 在 aggregate `6bc13dfe...` 上确认产品数值语义、跨引擎路径与全部 authority 反例通过，但发现 Node/Vite probe 无 wall-clock deadline，给出 `changes_requested / P1=1 / may_closeout=no`；
- remediation 先以 hung child missing runner 进入 RED，再加入 2 MB UTF-8 input budget、5 秒 parent 总 deadline、`SIGKILL + await reaping`、4 秒 probe stdin/create/load/close step deadline 与实际 hung-child regression；
- full gate 更新为 `153/0/2,866`，typecheck/build/diff/EXharness 通过；新 aggregate `299414f7a4c78b1979ff1e73468b4c822286a9bb5bf71276a128e377f7271676` 进入 fresh Round 2；未 closeout、mark-done、commit 或 push。

## 2026-08-11 — DH-010.1 Round 2 fresh review approved

- fresh reviewer 在 frozen aggregate `299414f7...` 上确认起止 branch/HEAD/status/digest 不漂移；
- focused `14/0/41`、full `153/0/2,866`、typecheck/build/diff/EXharness 均独立通过；
- reviewer 实际确认 hung Node child 被 `SIGKILL` 并 await 回收，2 MB UTF-8 budget 与 4 秒 step / 5 秒 total deadline 生效，合法/篡改跨引擎路径符合预期；
- verdict 为 `approved / P0=P1=P2=0 / may_closeout=yes`。Operator 可执行正常 closeout 与 mark-done；本结论不授权 merge `main`、tag、deploy 或真实 provider prompt。

## 2026-08-11 — DH-010.1 Operator close completed

- closeout packet 后重新登记 frozen Round 2 approval，正常 `mark-done` 成功；第一次缺少 closeout-phase approval 的 mark-done 被护栏拒绝，未使用 force override；
- CLOSE event 为 `evt-20260812T060501Z-9debaaa1`，DH-010.1 已为 `done / closed`，lease 已释放，current task pointer 已清空；
- 后续 authority 仅覆盖 commit + push `agent/codex/DH-010.1` 并回查 remote SHA；不包含 merge `main`、tag、deploy 或真实 provider prompt。
```

## Current Review Content

```md
# DH-010 Final Review Verdict

当前 frozen product digest：`85534951b9146283ffbceddec652a0440d0d38a7543ad4828a86eb42b5df1c57`。

- CC Switch / Kimi K3 Max：`approved / may_closeout=yes`；
- GPT-5.6 Sol Max：`approved / may_closeout=yes`；
- 两路均完成 full gates、mandatory authority/lifecycle probes 与终点冻结复核；
- combined decision：`P0=0 / P1=0 / approved`；
- product digest、HEAD 与 Git status 在审查前后未漂移。

Canonical evidence：`docs/project-harness/tasks/DH-010/phase6-vessel-physics-stale-ref-cross-review-evidence.md`。

本文件记录 reviewer 已批准 closeout；不自行授予 commit、push、merge 或 deploy authority。
```

## Closeout Questions

1. 当前实现是否已经覆盖 acceptance
2. verification 是否足以支持从 `doing` 进入 `done`
3. 还有没有阻止 closeout 的高优先级问题
4. 如果不能 done，最关键的剩余工作是什么
