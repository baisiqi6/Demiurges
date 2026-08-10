# DH-005 Round 1 — GPT-5.6 Sol Max Independent Review

- Reviewed product digest: `6bb22b193648b6f3d36d9176809409f10415d2f54d102fbd23393882da30f0d3`
- Decision: `changes_requested`
- Review mode: fresh read-only executable review; no model prompt; no worktree mutation.

## P1

1. 原 RPC smoke 只检查 `setCustomTools()` 的 definition echo；真实 `getState().dumpTools` 同时暴露四个 `world_*` 与八个 ambient `mcp__*` tools。`--no-tools`/`--no-extensions` 没有形成 effective tool closure。
2. RPC prompt path 在模型前仍处理 built-in slash commands，并由 OMP session 自动读取 `@file` mentions；因此 filesystem/control capability 可以绕过四工具边界。

## P2

- 失败 turn 丢失已形成 trace，且 `stop()` 失败可能覆盖 primary error。
- smoke 的 version 来自项目常量而非已解析 package manifest。

## Required remediation

- 不在 CLI flags 上继续打补丁；改为 OMP SDK restricted session，在 session construction 时关闭 MCP、extension discovery、skills/rules、IRC、LSP 与持久 session。
- 任一 prompt 前核验 active/enabled/mounted effective tool surface；多一个、少一个或 mounted tool 非空都 fail closed。
- 禁止 slash/control 与 `@file` preprocessing syntax，并保留失败 turn 的 frozen trace 与 primary/cleanup error distinction。
