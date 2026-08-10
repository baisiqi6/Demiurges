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

成功信号必须同时包含：从已安装 package manifest 读取的 runtime version 为 `17.2.12`；active/enabled tool names 恰好为 `world_read`、`world_write`、`world_edit`、`world_run`；mounted tools 为空；命令正常退出。该 smoke 只创建 restricted session、读取 effective state 并停止，不发送 prompt，也不证明任一 provider/model 可以完成世界任务。

真实 Agent prompt 会使用本机 provider credential 并可能产生费用；必须获得单独的 credential/cost authority 后才能执行。不得为了 smoke 给 OMP 开启 filesystem、bash、edit、write、browser、web、subagent、MCP、skills、rules、extensions、IRC 或 LSP，也不得向它增加 `adopt`。Gateway 必须拒绝以 `/` 开头的 OMP control syntax 与可被 OMP 解析为 `@file` mention 的输入。

## 本地运行与浏览器验收

```bash
bun install
bun run dev -- --host 127.0.0.1 --port 4173 --strictPort
```

在真实浏览器中至少核对：

1. WebGL canvas 有有效尺寸并显示 floor 与 cube；
2. `创建 child Snapshot` 后 current ref 从 base 变为 edit child；
3. `运行 MuJoCo` 后产生 Episode 与 terminal pose，但 current ref 仍是 edit child；
4. 时间轴回到 frame 0 时 cube 恢复初始高度，current ref 不变；
5. `Evaluate` 由结构化 metric 给出 `PASS`/`FAIL`；
6. `Adopt terminal` 后 current ref 才切换到 TerminalSnapshot，且 parent 指向 run 的 base Snapshot。

## 模块事实

```text
kernel → repository
kernel → runtime-mujoco
kernel → evaluation
kernel → presentation-episode
kernel → presentation-three
App 只组合上述边界
```

- MuJoCo 是 Evolution Runtime；
- Three.js 是 Presentation；
- Episode Player 只把不可变 Episode samples 映射为 transient Presentation time；
- Snapshot/Repository 是世界状态 authority；
- Evaluation 读取 Episode，不读取画布；
- Runtime object handle 必须在 `finally` 中 `.delete()`。

## 当前 execution profile

当前使用 Standalone、file-backed 项目 authority。Studio Product Runtime 为浏览器内单线程 MuJoCo WASM，Agent Gateway 为本地 Bun 进程并嵌入 OMP SDK restricted session；两者尚未建立产品 transport。Repository 为内存实现。canonical Git remote 为 private GitHub repository `https://github.com/baisiqi6/Demiurges`；当前不存在 Coordinate workspace、deployment target、Spark/3DGS Runtime 或 world-model provider。

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
