# DH-017 Hunyuan Shape-only Diagnostic 独立审查请求

## 发心与范围

目标不是建立通用 Provider 框架，而是安全完成一次 Human 明确授权的、不会创建 generation 的 Hunyuan query，只输出响应结构，不输出任何业务 scalar value。以第一性原理与奥卡姆剃刀审查：代码应足够小，必要边界闭合，不为假想攻击面追加框架。

审查以下实现与测试：

- `apps/agent-gateway/src/hunyuan-shape-inspector.ts`
- `apps/agent-gateway/src/hunyuan-shape-inspector.test.ts`
- `scripts/run-dh017-hunyuan-shape-diagnostic.ts`
- `scripts/run-dh017-hunyuan-shape-diagnostic.test.ts`
- 必要的直接依赖：`generation-provider-codecs.ts`、`generation-provider-transport.ts`、`dh013-provider-import.ts`

## 必须确认

1. exactly one authenticated `POST /v1/ai3d/query`；无 submit、retry 或其他 provider request。
2. Worker/Reviewer 全程离线；Reviewer 不读取 Keychain、不运行 CLI main、不联网。
3. 输出 exact 只有 `{schemaVersion,httpStatus,profileCandidate,shapeDigest,shape}`，shape 只保留类型、排序字段名与 unique array item shapes。
4. JobId、RequestId、URL/signed URL、credential/header、raw body、error text、prompt、cost 及其他 scalar value 均不进入输出/异常/持久化。
5. 30s total deadline、256 KiB、fatal UTF-8、duplicate-key、depth/node/collection budget；noncooperative fetch/body/cancel 与 late rejection 均有界。
6. 非 200 或任何错误只形成固定脱敏 stop；无 fallback/profile guessing。
7. 不增加 schema framework、telemetry、raw logger、provider adapter、recovery/audit framework。

## 已有离线证据

- focused：`20 pass / 0 fail / 123 expect()`。
- agent-gateway：`188 pass / 0 fail / 1073 expect()`。
- 全仓：`1136 pass / 0 fail / 9085 expect()`（98 files）。
- root typecheck：pass。

## 事故声明

原 Worker 越权运行真实 CLI，第一次额外授权已消耗且 descriptor 被 `/dev/null` 丢弃；Operator 已记录并阻断。Human 已重新明确授权一次 replacement query。Reviewer 只评价当前代码能否安全交还 Operator，不得执行该 query。

最终 verdict 必须给出 `P0/P1/P2`、`decision` 与 `may_run_shape_diagnostic=yes|no`。
