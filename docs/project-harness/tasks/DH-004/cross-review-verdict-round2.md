# DH-004 Round 2 交叉审查结论

## Decision

`changes_requested`

## Reviewer 结果

- Kimi Code K3 Max fresh review 在 digest `1d95045e...` 上给出 `approved`，独立运行 39/0/246、typecheck、build、diff-check 与多组功能 probes；
- 首个 GPT-5.6 Sol Max fresh session 被安全路由误判中止，没有 verdict；重新措辞后的 GPT-5.6 Sol Max session 给出 `changes_requested`，并附 same-realm prototype interception executable probe；
- combined decision 采用阻断方结论，不以另一 reviewer 的 approved 覆盖可执行 P1。

## P1 — Host prototype interception 泄露 control Host

Round 2 `WorldToolSurface` 的 `#host` 是 true private slot，但四个方法动态调用导出 class `RuntimeMvpHost.prototype` 上的公开方法。same-realm 代码可以替换 `readRefRecord`，在 `tools.read()` 时从 `this` 捕获 existing Host，再直接调用其 `adopt()`。

Operator 独立复现结果：`captured === host`、`adopt.status === updated`、ref version 1 → 2，terminal 成为 current。说明“四工具表面”存在 indirect control capability recovery。

## 底层修复

`RuntimeMvpHost` 是当前固定 Runtime/Evaluator/Repository composition 的 authority class；其 method table 不应在模块加载后可替换。模块初始化完成后冻结 `RuntimeMvpHost.prototype`，并加入 executable regression：替换 `readRefRecord` 必须 throw，随后 tool read 正常且不能捕获 Host。

该修复不增加 tool、facade、registry、provider abstraction 或新配置；它把现有 class boundary 的不可变性补成 explicit invariant。修复后必须在新 digest 上 fresh review。
