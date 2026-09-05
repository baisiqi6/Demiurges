# DH-018 Worker Result — OMP empty-turn diagnostic

状态：COMPLETE（含 correction 轮 readonly 修复；待 Operator 复核与真实 canary 重跑；Worker 不自批）。

## Correction 轮 — readonly mutation target 已证明

Operator 重跑 canary 后，terminal-boundary 修复把空 turn 正确转换为
`OmpAgentTurnError: OMP turn 以 stopReason=error 终止：Attempted to assign to readonly property.`（trace 仍为空）。

**精确根因（已在本机 SDK 源码上复现到行号）**：

1. `createOmpWorldTools` 把 deep-frozen 的 `WORLD_TOOL_CONTRACT.<tool>.input` 直接作为
   customTool 的 `parameters` 传入 OMP。
2. OMP 17.2.12（`@oh-my-pi/pi-ai` `src/utils/schema/wire.ts`）`toolWireSchema(tool)` 先调
   `upgradeJsonSchemaTo202012(input)`；我们的 contract 已是 2020-12 形状，该函数**原样返回
   同一个 frozen 对象**（`draft.ts`：`if (!schemaNeedsDraft202012Upgrade(schema)) return schema;`）。
3. 随后 `postProcessJsonSchema` → `normalizeArkPropertyComments`（wire.ts:239）执行
   `obj.required = required.map(...)` —— 对 frozen root 的 in-place 赋值，在严格模式下抛
   "Attempted to assign to readonly property"。
4. 该赋值发生在构建首次 provider 请求时，早于任何 tool call，因此 trace 为空、terminal
   assistant message 为 `stopReason=error` 且无 text —— 与两轮 canary 证据完全一致。

复现脚本（已从 worktree 删除）在修复前对全部四个 tool 抛出同一错误，堆栈定位到
`normalizeArkPropertyComments`；`stamp`/`once` 对 frozen host 有显式跳过，可排除。

**最小边界修复**：仅改 `apps/agent-gateway/src/omp-world-agent.ts` 与其测试。新增私有
`wireParameters()`（`structuredClone`）在 OMP 边界为四个 customTool 交出可变 deep copy；
`WORLD_TOOL_CONTRACT` 本身保持 deep-frozen domain authority，未加 retry/fallback。修复后用
真实 SDK `toolWireSchema` + `adaptSchemaForStrict` 路径验证四个 tool 全部通过。

## 首轮 — terminal stopReason 边界（保留）

安装位置：`apps/agent-gateway/node_modules/@oh-my-pi/pi-coding-agent`（package.json `version: "17.2.12"`）。

1. Provider turn 失败时，SDK 不从 `prompt()`/`waitForIdle()` 抛错，而是把失败记录为一条
   terminal assistant message（`stopReason: "error" | "aborted"`、`errorMessage`），然后正常
   settle 为 idle：
   - `src/session/agent-session.ts`（OMP SDK）错误尾部路径注释明确写着 "No retry, fallback,
     or compaction continuation fired: this errored turn ends the run"，并调用
     `persistTerminalEmptyErrorTurn(msg)` —— 即 SDK 自己承认存在 **empty error turn**。
   - `StopReason = "stop" | "length" | "toolUse" | "error" | "aborted"`、
     `errorMessage?: string` 定义于 `@oh-my-pi/pi-ai` `src/types.ts`（`AssistantMessage`）。
2. `AgentSession.getLastAssistantText()`（SDK `agent-session.ts`）拼接 terminal assistant
   message 的 text content；error turn 无 text 时返回 `undefined`。其内部候选筛选只跳过
   `stopReason === "aborted" && content.length === 0` 的 message，`error` 空内容 message 会
   被选中并折叠成 `undefined`。
3. 我们的 `RestrictedOmpSdkClient.promptAndWait()`（`apps/agent-gateway/src/omp-world-agent.ts`）
   只做 `prompt → waitForIdle → model identity check`，从不检查 terminal
   `stopReason`；`getLastAssistantText()` 返回 `null` 时 `run()` 以 `responseText: ""`、
   空 trace 成功返回 → Product Session 发出 `turn.completed`。这正是 canary 观察到的
   empty turn。

结论：canary 的空 turn 是 provider turn 失败（`stopReason=error`，如 deepseek 请求失败）被
idle-settle 边界静默吞掉，不是 generated-artifact 选择或 MuJoCo 问题。

## 最小修复

仅改 `apps/agent-gateway/src/omp-world-agent.ts` 与 `omp-world-agent.test.ts`：

- 新增导出 `requireOmpTerminalAssistantSuccess(messages)`：从 messages 尾部找 terminal
  assistant message；`stopReason=error|aborted` 时抛 `OMP turn 以 stopReason=<reason> 终止`
  （附 `boundedError` 截断到 240 字符的 `errorMessage`），完全无 assistant message 时拒绝。
- `promptAndWait()` 在 `waitForIdle` + model identity check 之后调用该检查，失败 turn 现在
  以 `OmpAgentTurnError` 失败，Product Session 发出 `turn.failed`（公开事件仍是 opaque
  `agent_turn_failed`，不暴露 raw provider error；provider 细节只进入 server 端错误对象）。
- 未改变行为边界：正常 `stopReason=stop` 的无工具、空 text 对话 turn 仍合法通过；未加
  retry/fallback/orchestration。

## 验证

- `bun test src/omp-world-agent.test.ts`：25 pass / 0 fail（含 5 个
  `requireOmpTerminalAssistantSuccess` 用例 + 1 个 boundary deep-copy 回归用例）。
- 根 `bun run typecheck`（world-project、agent-gateway、studio）全部通过。
- 修复后用真实 OMP 17.2.12 `toolWireSchema`/`adaptSchemaForStrict` 对四个工具实测通过
  （scratch 复现脚本已删除，未引入新依赖）。

## Operator 后续

重跑真实 restricted OMP canary。现在 provider 请求可以真正发出；若仍有失败会得到明确的
`turn.failed` 与 `stopReason=error` 诊断信息，而不是静默空 turn。
