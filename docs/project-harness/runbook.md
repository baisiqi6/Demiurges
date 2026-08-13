# Runbook

## 恢复步骤

```bash
cd /Users/Admin/projects/Demiurges
git status --short --branch
sed -n '1,240p' docs/project-harness/progress.md
python3 -m json.tool docs/project-harness/harness-checklist.json >/dev/null
python3 /Users/Admin/projects/EXharness/skills/long-running-project-harness/scripts/validate-checklist.py \
  docs/project-harness/harness-checklist.json
sed -n '1,220p' docs/project-harness/current/task_plan.md
```

随后阅读 `current/task_plan.md` 指向的 canonical plan。

## Authority 检查

- `harness-checklist.json` 与 `mvp-checklist.json` 必须恰好只存在一个；Demiurges 使用前者。
- Active item 的 `workflow.branch` 与 `artifacts.branch` 必须一致。
- Active item 中每个 artifact path 都必须存在。
- Active plan 是 `tasks/<id>/plan.md`；`current/task_plan.md` 只是指针。
- Obsidian 与 Lyaup 是输入，不是 Demiurges 的实现事实。

## 产品校验

```bash
git diff --check
git status --short
bun test
bun run typecheck
bun run build
```

`bun run build` 会生成 ignored `apps/studio/dist/` 与 `*.tsbuildinfo`。不得把 process exit、HTTP 200 或单独一张 rendered page 当作产品验收。

## OMP Agent Runtime

Agent Gateway 固定使用 `@oh-my-pi/pi-coding-agent@17.2.12`。验证 SDK restricted session 而不触发模型调用：

```bash
bun --cwd apps/agent-gateway smoke:sdk
```

成功信号必须同时包含：从已安装 package manifest 读取的 runtime version 为 `17.2.12`；active/enabled tool names 恰好为 `world_read`、`world_write`、`world_edit`、`world_run`；mounted tools 为空；命令正常退出。该 smoke 只创建 restricted session、读取 effective state 并停止，不发送 prompt，也不证明任一 provider/model 可以完成世界任务。锁定 OMP SDK 在 session construction 中可能对已选 model host 执行 best-effort `fetch.preconnect`；因此该 smoke 不是“完全无 network/provider contact”的证明。需要严格 network-free evidence 时，应依赖 source/tests 或在 OS/network sandbox 中执行，不得把普通 smoke 的成功扩大解释。

真实 Agent prompt 会使用本机 provider credential 并可能产生费用；必须获得单独的 credential/cost authority 后才能执行。不得为了 smoke 给 OMP 开启 filesystem、bash、edit、write、browser、web、subagent、MCP、skills、rules、extensions、IRC 或 LSP，也不得向它增加 `adopt`。Gateway 必须拒绝以 `/` 开头的 OMP control syntax 与可被 OMP 解析为 `@file` mention 的输入。

## 本地运行与浏览器验收

离线 UI 验收必须使用显式 scripted fixture，避免误触真实 provider：

```bash
bun install
# terminal 1
DEMIURGES_GATEWAY_PORT=8787 bun --cwd apps/agent-gateway dev:scripted-fixture

# terminal 2
DEMIURGES_GATEWAY_URL=http://127.0.0.1:8787 \
  bun run dev -- --host 127.0.0.1 --port 5173 --strictPort
```

端口被其他 worktree 占用时，两处可以改成同一组空闲 loopback 端口；`DEMIURGES_GATEWAY_URL` 只控制 Vite dev proxy，不进入 production build contract。

生产 Gateway 则使用 `bun run dev:gateway`，并要求在进程环境中显式提供 `DEMIURGES_OMP_MODEL=provider/model`。启动 production composition 本身不会发送 prompt，但从 Studio 提交 turn 会使用 OMP credential 并可能产生费用；未获 live-canary authority 时不得进行该提交。不要把 selector 或 credential 写入仓库、测试输出或产品事件。

在真实浏览器中至少核对：

1. 页面创建一个 Gateway Product Session，初始没有 current ref、Episode 或 Evaluation；
2. 在 scripted fixture 中提交自然语言 falling-cube task 后，tool trace 严格按 `world_write → world_read → world_edit → world_run` 展示；
3. WebGL canvas 根据 Gateway 返回的 authoritative Snapshot 显示 floor 与 cube；
4. EpisodePlayer 使用真实 samples 从 frame 0 推进到 terminal frame，而不是直接跳到地面；
5. 结构化 Evaluation 给出 `PASS`，并展示 Episode 与 terminal Snapshot identity；
6. `world_run` 完成后 current ref 仍为 authored edit Snapshot version 2，而不是 terminal Snapshot；
7. 创建新 Session 后 ref、trace、Episode、Evaluation 与 viewport 全部清空，不沿用前一 Session 的浏览器缓存状态。
8. 同一 scripted Session 再次运行会得到稳定 `agent_turn_failed`，但 resync 后先前权威 ref/Episode/Evaluation 仍可呈现；页面与 console 不出现 OMP、Host、path、credential-like internal message 或 stack。
9. 断流/Abort failure 的 resync 必须最终到达 `running:false`；一次中间 `running:true` 不算恢复完成，bounded budget 耗尽必须 fail closed。
10. product codec 必须接受 producer 合法长 runId 的派生 evidence，并拒绝 sparse/accessor/non-enumerable/symbol DTO；failed trace 只能看到 `[redacted]` 与 public error code。
11. 模拟 resync GET 永不 resolve 时，wall-clock deadline 必须拒绝；不能只证明持续返回 `running:true` 会在 attempt 上限结束。
12. 模拟 Agent 首次 tool failure、纠正后完成时，最终必须是 `turn.completed` 与 PASS projection；中间 failed trace 仍可见且脱敏。

## 模块事实

```text
@demiurges/world
  ├── kernel → repository / authoring
  ├── kernel → runtime-mujoco
  ├── kernel → evaluation
  ├── RuntimeMvpHost + WorldToolSurface
  └── product-owned session contract

Agent Gateway → sole Product Session authority + HTTP NDJSON/resync
Studio → ProductSessionClient → Three.js + EpisodePlayer
```

- MuJoCo 是 Evolution Runtime；
- Three.js 是 Presentation；
- Episode Player 只把不可变 Episode samples 映射为 transient Presentation time；
- Gateway Product Session 内的 Snapshot/Repository 是 connected 世界状态 authority；
- Evaluation 读取 Episode，不读取画布；
- Studio 不实例化 `RuntimeMvpHost`，也不把 OMP event/message 当作产品 contract；
- Runtime object handle 必须在 `finally` 中 `.delete()`。

## 当前 execution profile

项目文件继续使用 repo-local、file-backed authority；`harness-checklist.json` 与
`tasks/<id>/plan.md` 仍是规范事实。DH-012 只增加 Coordinate-managed **channel/control-plane profile**：
production Coordinate 保存 workspace identity、`macbook-local` host profile、Remote MCP principal、events
与 Discord channel binding。它不把 Mac 路径伪装成 server-local checkout，也不给 Demiurges principal
授予 server-side file lifecycle tools；未来若需要服务器直接消费项目文件，必须另开部署镜像契约。

本机 Codex 配置使用 `codex mcp add coordinate_demiurges ...` 写入 `~/.codex/config.toml`，只声明 Remote MCP URL、
`bearer_token_env_var=COORDINATE_DEMIURGES_MCP_TOKEN` 与单工具 allowlist
`coordinate.channel_create`；`/Users/Admin/.local/bin/codex-demiurges` 从本机 Keychain 注入 token 后启动
Codex。当前 Codex CLI 0.145.0 实测没有加载 worktree 内 `.codex/config.toml`，所以不维护一份无效的
project-local 副本。token 明文不进入 Git、文档、日志或 policy。新 Operator task 必须先用其
authenticated Remote `tools/list` 证明 exact tool 可见，再创建频道。

`.artifacts/harness/` 是 ignored、worktree-local runtime。canonical main 缺失时，从当前 EXharness
`skills/long-running-project-harness/references/scripts/` 复制普通文件，并机械替换：
`HARNESS_ROOT=docs/project-harness`、`PROJECT_ROOT_DEPTH=2`、
`SCRIPTS_DIR=.artifacts/harness`、`PROJECT_NAME=Demiurges`；拒绝任何残留 `{{...}}`，随后运行
`.artifacts/harness/harnessctl validate`、`doctor` 与 `state`。不得从历史 worktree 注册长期路径。

Studio 与本地 Bun Agent Gateway 已通过 loopback HTTP NDJSON/resync 建立 Product Session transport；
每个 session 的 Repository、MuJoCo Runtime 与 current ref 只存在于 Gateway 内存，因此刷新或重启
Gateway 会丢失 session。Gateway production entry 要求显式设置
`DEMIURGES_OMP_MODEL=provider/model`，并使用 OMP SDK restricted session；凭证继续由 OMP 自身解析，
Demiurges 不接收或传输 credential。scripted Agent client 仅保留为显式注入的 test fixture。
`DH-007` 的唯一授权 `kimi-code/k3` live canary 已执行并通过，脱敏 receipt 位于
`docs/project-harness/tasks/DH-007/live-canary-receipt.md`；它不构成持续 provider 调用 authority。
canonical Git remote 为 private GitHub repository `https://github.com/baisiqi6/Demiurges`；当前不存在
产品 deployment target、鉴权/TLS、Spark/3DGS Runtime 或 world-model provider。

## Commit 与 push 验证

只有在用户或 active task 明确授予 commit authority 后，才执行 commit。授权存在时，commit 与 push 是同一交付动作：

```bash
git status --short --branch
git push origin HEAD
git rev-parse HEAD
git ls-remote --heads origin "$(git branch --show-current)"
```

若本轮创建 release tag，还需执行并回查：

```bash
git push origin <tag>
git rev-list -n 1 <tag>
git ls-remote --tags origin <tag> '<tag>^{}'
```

remote branch SHA 必须等于本地 `HEAD`；annotated tag 的 remote dereferenced SHA 必须等于本地 tag target。GitHub source publication 不等于 deployment target，不得据此宣称产品已公网部署。
