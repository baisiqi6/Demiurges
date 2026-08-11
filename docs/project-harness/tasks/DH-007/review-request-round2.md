# DH-007 Round 2 — Fresh Final Cross-review Request

## Role / Authority

Independent final reviewer；cwd `/Users/Admin/projects/WorkTrees/Demiurges-DH-007`；严格只读。允许读取 base diff、Round 1 request/verdict/remediation code、本地锁定 OMP source，并运行不会修改 product source 的 tests/probes。禁止编辑或创建文件、读取 credential、发送真实 provider/model prompt、联网、build、commit、push、merge、reset、clean、deploy 或调用外部 coding agent。

Base：`a570064a7292821166fd65f074577a22b0390c14`。Round 1 verdict 永久保留。

## Frozen candidate

Product digest：`def0c72e9ccfc88066bcee572fd8b0e973afd6470c8c61888290a9d32f239480`

```bash
{ printf '%s\0' package.json bun.lock; find apps packages -type f \
  \( -name '*.ts' -o -name '*.tsx' -o -name '*.css' -o -name '*.json' \) \
  -not -path '*/dist/*' -not -path '*/node_modules/*' -print0; } \
  | sort -z | xargs -0 shasum -a 256 | shasum -a 256
```

Operator gates：80 tests / 0 fail / 429 assertions；typecheck、build、diff-check 通过；scripted Chromium 为四工具、76 samples、中间 frame 59/75、PASS、current ref `snapshot:edit-1 / v2`、console/errors 为空。普通 no-prompt smoke 未在 remediation 后重跑，因为锁定 SDK construction 可能执行 host preconnect；这不影响本地 source/tests 的 tool-surface evidence，也不得误称真实模型成功。

## Round 1 blockers to close

1. `Settings.isolated` 必须真正阻断 ambient user/project retry/fallback；`retry.enabled/modelFallback/usageAwareFallback` 均为 false。无论 ambient fallback chain 如何配置，production turn 都不得切到第二 model/provider/credential。
2. explicit model identity 必须在 OMP session start 与 prompt completion 后核验；post-check 只是检测层，不能替代第一项 prevention。
3. Studio caller abort、HTTP Request abort 与 Gateway absolute timeout 必须到达 ProductSession、OmpWorldAgent 与真实 OMP `session.abort()`；Gateway authority 最终必须 `running:false`。
4. abort 后新的 model-facing tool call 必须在进入 `WorldToolSurface` 前拒绝，不生成后续 `tool.completed` product event，也不创建 world/lastRun side effect。
5. 快速回归 production/scripted composition separation、exact four tools/mounted empty、slash/`@file`、512/513 runId、failure correction、terminal outcome、public error redaction、run 不推进 authored ref、Studio shared deadline。

`smoke:sdk` 可能 preconnect 的 limitation 已写入 runbook；除非能证明 billed inference、prompt 或 product authority 受影响，不要把已披露的 preconnect 提升为本轮 closeout P1。UI contrast debt 不在 scope。

## Output

第一行严格 `decision=approved|changes_requested|blocked`；P0/P1/P2、精确行/可执行证据、digest before/after、命令结果、limitations。中文为主体，不输出 private chain-of-thought，不写 repo-local verdict。
