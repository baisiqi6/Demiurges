# DH-006 Round 4 — Final Fresh Cross-review Request

## Role / Authority

Independent final reviewer；cwd `/Users/Admin/projects/WorkTrees/Demiurges-DH-006`；严格只读。允许读取 target diff/history 并运行 executable tests/probes；禁止编辑、repo-local verdict、commit、push、merge、reset、clean、联网、真实 provider prompt、credential 读取或输出。

Base：`7304410`。Round 1–3 verdict 永久保留。

## Frozen candidate

Product digest：`f1d58ab9a72c88edb53a5ca56a1eedb3a94727198da3360628349c0ece7f4a64`

```bash
{ printf '%s\0' package.json bun.lock; find apps packages -type f \
  \( -name '*.ts' -o -name '*.tsx' -o -name '*.css' -o -name '*.json' \) \
  -not -path '*/dist/*' -not -path '*/node_modules/*' -print0; } \
  | sort -z | xargs -0 shasum -a 256 | shasum -a 256
```

Operator gates：71 tests / 0 fail / 403 assertions；typecheck/build/diff/checklist 通过；真实 Chromium 为中间 frame 9/75、终态 75/75、PASS/ref-v2，sanitized failure+settled resync evidence 保留，DOM/console 无 internal marker。

## Focused blockers to close

1. settled resync 必须由单一 wall-clock deadline 约束，包括第一/后续每次悬挂 GET；真实 fetch 应收到 AbortSignal，忽略 signal 的 fake fetch 也必须由 Promise deadline 拒绝。预算耗尽后 App fail closed，不永久 `running`。
2. `tool.completed(status=failed)` 是可恢复中间 evidence；`turn.completed`/`turn.failed` 是唯一 terminal outcome authority。当前 pinned OMP producer 的 `failed → corrected succeeded tools → completed/PASS` 必须被 Studio 接纳，failed trace 仍保持 `[redacted]`。
3. 130-event 正边界与 131-event 拒绝都必须有 executable coverage，无 off-by-one。
4. 快速回归：合法 512-char runId 派生 evidence、descriptor plain-data admission、stale_ref identity/advance-only、HTTP atomic/byte/media admission、single Gateway Host、run 不推进 ref、failure redaction。

Transparent Proxy traps 是 JSON wire 不可达的已记录 P2；除非能从当前 product transport 构造可执行影响，否则不得把未来 Node-only 纵深方案提升为本轮 P1。不得扩展 UI style 或未来 protocol opportunities。

## Output

第一行严格 `decision=approved|changes_requested|blocked`；P0/P1/P2、精确行/可执行证据、digest before/after、命令结果、limitations。中文为主体，不输出 private chain-of-thought。
