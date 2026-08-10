# DH-006 Round 4 — Kimi Code K3 Max Static Review

## Decision

`approved`

Reviewer 在 isolated `KIMI_CODE_HOME` 下使用 `kimi-code/k3`、`thinkingEffort=max` 与只读工具完成 fresh static review；未读取既有 verdict，未修改工作树。申报 frozen digest 为 `f1d58ab9a72c88edb53a5ca56a1eedb3a94727198da3360628349c0ece7f4a64`。

## Findings

- 单一 wall-clock deadline 覆盖 settled resync 的第一与后续 GET；真实 fetch 接收 AbortSignal，Promise deadline 同时覆盖忽略 signal 的 port，预算耗尽后 App fail closed。
- `turn.completed` / `turn.failed` 是唯一 terminal outcome authority；failed tool 保留为脱敏、可纠正的中间 evidence。当前 producer 与 client regressions 覆盖 failure → correction → completed/PASS。
- 130-event 正边界和 131-event 拒绝逻辑自洽；producer 的 128 tool cap 与 client 总量上限一致。
- 长 derived identity、descriptor admission、`stale_ref` identity、HTTP byte/media/atomic admission、single Host、run 不推进 ref 与 failure redaction的 source/test evidence 均成立。

## Residual P2 / limitations

1. 成功路径的最终 projection GET 与 turn POST 本身没有内置 client timeout，依赖调用方 AbortSignal；这不推翻本轮失败恢复 blocker 的关闭。
2. 恰好 512-char runId 的正边界由 `> 512` 谓词静态保证；现有独立正例为 300-char，已覆盖此前错误的 256 局部上界。
3. Reviewer 工具集严格只读，未独立执行 digest、tests、build 或 Chromium；这些采用 operator evidence，并逐项核对对应 source 与 regression。
