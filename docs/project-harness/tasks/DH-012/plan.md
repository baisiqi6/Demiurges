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
