# DH-005 计划：Oh My Pi Agent Runtime Vertical Slice

## 目标

把 Oh My Pi（OMP）作为第一个可替换的 Agent Runtime 接入 Demiurges，同时保持 World Kernel、Repository、MuJoCo Runtime 与 `adopt` authority 完全由 Demiurges 拥有。

本切片只内置我们真正需要的边界：OMP SDK 负责模型 turn loop 与对话；Demiurges 负责四个 world tools 的定义、执行、证据、trace 与控制面。项目不启动完整 OMP CLI，不复制、裁剪或 fork OMP 源码。

## 已授权范围

- 创建独立 `agent/codex/DH-005` branch/worktree；
- 增加一个本地 Agent Gateway package，并锁定 OMP 依赖版本；
- 通过 OMP SDK restricted session 暴露 `world_read`、`world_write`、`world_edit`、`world_run`；
- tool closure 只持有现有 `WorldToolSurface`，不向 OMP 暴露 `RuntimeMvpHost`、Repository、evidence writer、`advance` 或 `adopt`；
- OMP session construction 时关闭 MCP、内建 coding tools、extension discovery、skills、rules、IRC、LSP 与 session persistence，使用 Demiurges 自己的极小 system prompt；
- 记录不可变、JSON-safe 的 Agent/tool trace；
- 以 fake Agent client 完成一个自然语言 falling-cube walking skeleton，并以不触发模型调用的 OMP SDK boot smoke 验证真实 effective tool surface；
- 更新必要的 architecture、runbook、progress 与 checklist。

未经另行授权，不执行真实模型 prompt、不读取或使用 provider credential、不产生模型费用；不 commit、push、merge、tag、deploy 或发布 package。

## Invariants

- OMP 是 Agent Runtime，不是 Kernel，也不是世界状态 authority；
- OMP 只能获得四个 host-owned world tools，工具执行发生在 Demiurges Host 进程；
- transport 名使用 `world_*` 防止与 OMP 内建工具混淆，内部 canonical 语义仍是 `read/write/edit/run`；
- `world_run` 不推进 current ref，`adopt` 不进入 Agent tool definitions；
- OMP 的 event/message/tool shape 不进入 Kernel contract；
- tool argument 与 result 都在 Gateway 边界进行 JSON data admission/serialization；
- trace 是观察证据，不是 Repository、Episode 或 Evaluation authority；
- OMP dependency 被精确锁定，升级必须通过本切片的 contract tests。

## Non-goals

- 从 OMP 仓库复制、改写或抽取源码；
- 把 OMP 包装成通用 AgentRuntime SDK，或同时支持 OpenCode/Claude/Codex；
- 给 Agent 暴露 filesystem、bash、edit、write、browser、web、subagent、skills、rules 或 extensions；
- 让 Agent 自动 adopt、merge、deploy 或执行真实设备动作；
- 完成聊天 UI、WebSocket/SSE、云端服务、鉴权、持久 session 或多用户并发；
- imported mesh、Spark/3DGS、机器人、VLM 或第二 Runtime provider；
- 真实 provider/model acceptance；该动作需要单独的 credential/cost authority。

## 验收标准

1. Gateway 注册且只注册 `world_read`、`world_write`、`world_edit`、`world_run` 四个 OMP host tools。
2. 每个 tool closure 只委托现有 `WorldToolSurface`；`adopt` 不存在于 OMP definitions 或 Agent-facing object。
3. 一个 fake Agent turn 从自然语言请求出发，通过四工具完成 write → read → edit → run，并得到通过的 Evaluation；run 前后 current ref 不变。
4. Gateway 返回按 sequence 排序、递归冻结、可 `JSON.stringify` 的 turn/tool trace；失败调用也形成 bounded error evidence，且不泄露 stack、Host 或 Repository object。
5. OMP restricted session 明确关闭 MCP、coding tools、extensions、skills、rules、IRC、LSP 与 session persistence；slash/control 和 `@file` preprocessing 被 admission 拒绝。
6. 锁定版本的真实 OMP SDK session 可以在不发送 prompt 的情况下启动；active/enabled tools 恰好为四个 world tools、mounted tools 为空，读取已安装 runtime version 后干净停止；该 smoke 不发起 provider model call。
7. `bun test`、`bun run typecheck`、`bun run build`、`git diff --check` 与 checklist validation 通过。

## 实现阶段

### Phase 1 — Harness 与契约 RED

Status: completed

- 登记并激活 `DH-005`；
- 记录当前 40 tests / 250 assertions 基线；
- 先写四工具注册、authority separation、trace 与 walking skeleton tests。

基线为 40 tests / 0 fail / 250 assertions，typecheck 通过。新增 Gateway contract test 因 `Cannot find module './omp-world-agent'` 明确进入 RED，证明 OMP Agent Runtime 尚不存在。

### Phase 2 — OMP Gateway 最小实现

Status: completed

- 新增 Agent Gateway workspace；
- 锁定 OMP dependency；
- 实现四个 host-owned tool closures、最小 OMP SDK client composition 与 trace。

Agent Gateway 已固定 `@oh-my-pi/pi-coding-agent@17.2.12`。Round 1 executable review 证明 CLI flags 无法隔离 ambient MCP，因此 composition 已从完整 CLI/RPC 改为 SDK restricted session：MCP、built-ins、extension discovery、skills/rules、IRC、LSP 与持久 session 在 construction 时关闭，prompt 前再以 effective state fail closed。fake Agent walking skeleton 与 boundary regressions 现为 6 tests / 0 fail / 32 assertions；run 后 current ref 仍为 authored version 2。

### Phase 3 — 真实 SDK boot smoke 与文档

Status: completed

- 运行无模型 prompt 的真实 OMP SDK restricted-session boot smoke；
- 更新 architecture、runbook 与 progress；
- 明确 live provider acceptance 仍未授权、未执行。

真实 OMP SDK restricted session 已在不发送 prompt 的情况下启动；active/enabled tool surface 恰好为四个 world tools，mounted surface 为空，并从已安装 package manifest 读取 runtime `17.2.12` 后干净停止。architecture/runbook/progress 记录 authority 与未验证边界；没有发起 provider model call。

### Phase 4 — 验证与交接

Status: completed

- 完成全量 tests/typecheck/build/diff-check/checklist validation；
- 准备 independent review 所需的聚焦边界与证据；
- Coding agent 不自行审批、`mark-done`、commit 或 push。

Round 1、Round 2、Round 3 combined verdict 均为 `changes_requested`，每轮 executable reviewer 都发现了新的 effective boundary 反例。最终实现改用 `Reflect.ownKeys + descriptor` admission，拒绝 non-enumerable、symbol、accessor、数组与 `__proto__`；trace key 在写入 null-prototype projection 前先截断，budget 整个 turn 共享。regression 证明 getter reads=0、surface calls=0、1 MiB key trace 小于 8 KiB 且 `__proto__` 作为 own key 安全保留。最终 full gate 为 48 tests / 0 fail / 304 assertions，typecheck/build/SDK smoke/diff-check/checklist validation 全部通过；product source digest 为 `1b3b6496f1f27fe7bd89f0db105f60745e027108922507eb3301f7f1ca594dae`。Round 4 GPT-5.6 Sol Max executable review 与 Kimi Code K3 Max static review 均为 `approved`，无 P0/P1/P2；实现可进入 harness closeout 与 operator `mark-done`。

## 错误记录

| 错误 | 尝试 | 处理 |
| --- | --- | --- |
| 实例化临时 harness runtime 时 `cp references/scripts/*` 遇到模板目录中的 `__pycache__` 并中止 | DH-005 harness init attempt 1 | 改为只复制 regular files；产品文件未受影响，也不把临时 runtime 纳入 Git。 |
| walking skeleton test 把注册顺序 `read/write/edit/run` 错当成实际调用顺序 | Gateway GREEN attempt 1 | 测试改为断言真实任务调用顺序 `write/read/edit/run`；实现与 authority 状态无需修改。 |
| 首次 Gateway typecheck 暴露 readonly tuple matcher 与 tool result union 的窄化缺口 | Gateway typecheck attempt 1 | 测试比较使用 mutable copy；`resultForModel` 返回类型收窄为 structured result，不增加 runtime 分支。 |
| 合并文档 patch 假设 `runbook.md` 存在 `## 本地开发` 标题，context verification 失败 | Documentation attempt 1 | 原 patch 原子失败、未留下部分修改；先读取实际 runbook heading，再分文件做聚焦 patch。 |
| harness 生成的 `current/review-packet.md` 末尾多出一个 blank line，`git diff --check` 拒绝 | Final gate attempt 1 | 只删除生成 artifact 的末尾空行；canonical plan 与产品实现不变。 |
| Round 1 executable review 发现 `--no-tools`/`--no-extensions` 后仍有 8 个 ambient `mcp__*` tools，且 smoke 只验证 host-definition echo | Cross-review round 1 | 不补更多 CLI flags；删除完整 CLI/RPC composition，改用 OMP SDK `restrictToolNames + enableMCP:false + disableExtensionDiscovery` 的 restricted session，并在任何 prompt 前核验 active/enabled/mounted effective surface。 |
| OMP session 会自动处理 slash/control 与 `@file` mention，可能绕过四工具读取文件或产生控制副作用 | Cross-review round 1 | Gateway admission 拒绝这两类 syntax；SDK prompt 同时关闭 prompt-template expansion 并标记 synthetic，regression 证明 prompt 前 fail closed。 |
| 失败 turn 丢失 trace，cleanup error 可能覆盖 primary error | Cross-review round 1 | 新增 `OmpAgentTurnError`，保留 frozen bounded trace，并分别保存 primary 与 cleanup error。 |
| Prompt syntax admission 仍晚于 OMP SDK session start | Cross-review round 2 | 在创建 tools、client 或 session 前先完成 `requirePrompt()`；regression 断言被拒绝输入不会调用 client factory。 |
| error string 有界但 trace payload 与 entry count 无整体预算 | Cross-review round 2 | 对 tool input 和 trace data 建立显式 node/depth/string/char/collection budget；每 turn 最多 128 次 world tool calls，超限停止执行并使 turn 失败；新增 oversized input 与 129-call regressions。 |
| non-enumerable/symbol/accessor own property 绕过 Gateway input admission | Cross-review round 3 | 使用 `Reflect.ownKeys` 与 data/enumerable descriptor admission；数组、symbol、accessor、non-enumerable 与 `__proto__` 均 fail closed，regression 证明 getter 与 surface 都未被调用。 |
| 超长 object key 在 trace 中按原 key 写出，绕过 char budget | Cross-review round 3 | key 先经过 bounded projection 再写入 null-prototype trace object；trace budget 在整个 turn 共享；1 MiB key 与 `__proto__` regressions 验证 size 与保真边界。 |
