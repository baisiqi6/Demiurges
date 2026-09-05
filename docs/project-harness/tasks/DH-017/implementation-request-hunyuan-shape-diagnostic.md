# DH-017 Hunyuan Shape-only Diagnostic 实现请求

## 目标

在不创建 generation、不泄露 provider 数据值的前提下，用额外获批的唯一 Hunyuan query 定位 live response 与当前 exact codec 的 shape 差异。

## Worker 范围

- 只实现一个 shape-only pure inspector 与一个 Operator-only script seam；复用现有 bounded exact JSON parser、Keychain reader 和 fixed Hunyuan query URL。
- Worker 只用 injected fake bytes/fetch/credential source；禁止 Keychain、网络、provider、真实 JobId query、generation submit、Git mutation。
- 禁止为此引入 schema framework、telemetry pipeline、raw-response logger 或 provider adapter。

## Shape descriptor

- 递归仅保留 `object | array | string | number | boolean | null` 与 sorted object field names；array 只保留长度上界内的 unique item shapes。
- 不保留任何 scalar value，包括 ID、URL、错误文本、cost、status value。
- 输出 exact 为 `{schemaVersion:1,httpStatus,profileCandidate,shapeDigest,shape}`；`shapeDigest` 来自 domain-separated canonical descriptor bytes，不是 raw response digest。
- 结果与异常 `JSON.stringify` 后不得含 fake 响应中的任一 scalar sentinel。

## 网络边界

- exact `POST https://api.ai3d.cloud.tencent.com/v1/ai3d/query`，body 只有已验证 JobId，credential 只在 `Authorization`。
- 恰好一次 fetch，`redirect:error`，30s total deadline，256 KiB streamed body，abort/fetch/body/cancel 全部有界。
- HTTP 非 200、malformed/duplicate-key/oversized/depth-node-limit 都只输出 `DH017_HUNYUAN_SHAPE_DIAGNOSTIC_STOPPED`，不重试。

## Review gate

Reviewer 只读、离线，不读 Keychain，不联网。必须主动用包含 JobId/RequestId/signed URL/error/cost/prompt/key sentinel 的 fake response 证明输出不含任一 value，并验证 fetch/body/cancel 不合作时仍有界。`P0/P1=0` 且 `may_run_shape_diagnostic=yes` 后才交还 Operator。
