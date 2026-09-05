# DH-017 真实 Provider Canary 独立实现审查请求

## 审查目标

从 DH-017 的底层需求审查本次 Operator-only canary slice，而不是只对照 Worker 自报指标。核心问题是：在不引入 provider framework 或 multi-generation 架构的前提下，实现是否能证明每家 provider 只有一次 paid submit，在 crash/restart/ambiguity 下不重提，有界 poll/download，并将真实 bytes 通过已有 durable Artifact 路径发布，同时不泄露 credential/signed URL。

审查以第一性原理、奥卡姆剃刀与可证伪反例为准；不要因历史计划庞大而要求本切片增加与真实 canary 无关的防御性框架。

## 隔离边界

- 审查全程只读；禁止 Keychain、credential、网络、provider 请求、真实 generation、Git mutation、commit/push/deploy。
- 不读 Worker RESULT/session 或历史 Reviewer 结论；从本请求、`implementation-request-real-provider-canary.md`、canonical `plan.md` 与实际源码/测试独立形成结论。
- 当前 MVP 决策是每 provider 一个隔离 fresh Data Root，每个 root 只有一条 first generation；不得把 multi-generation 当作本轮阻断项。
- Reviewer 可读取直接依赖以证明 authority，但不得读取 `docs/project-harness/current/review-packet.md` 或 Worker 输出。

## 主要实现 surface

- `scripts/run-dh017-provider-canary.ts`
- `scripts/run-dh017-provider-canary.test.ts`
- `apps/agent-gateway/src/provider-canary-runner.ts`
- `apps/agent-gateway/src/provider-canary-runner.test.ts`
- `apps/agent-gateway/src/hunyuan-contract-capture.ts`
- `apps/agent-gateway/src/hunyuan-contract-capture.test.ts`
- `apps/agent-gateway/src/provider-submit-orchestrator.ts`
- `apps/agent-gateway/src/marble-generation-service.ts`
- `apps/agent-gateway/src/hunyuan-generation-service.ts`
- `apps/agent-gateway/src/generation-provider-codecs.ts`
- `apps/agent-gateway/src/generation-provider-transport.ts`
- `packages/world-project/src/fake-generation-completion-coordinator.ts`
- `packages/world-project/src/world-project-runtime.ts`
- 上述模块使用的 Generation journal/state/publication/reader 直接依赖。

## 必查事实

1. **唯一 paid submit**：Marble/Hunyuan 都只有 durable `submit_started` 后的一个 fetch 窗口；post-fetch crash、timeout、malformed 2xx、transport/body failure都不得造成第二次 submit。本 MVP 对中断的真实 canary 是“保留 evidence 后停止”，不自动 resume poll/download。
2. **pre-submit 零副作用**：provider/model/prompt/profile/shape/fresh-root/abort 任一不满足，必须在 Keychain read/provider fetch 前拒绝。
3. **Hunyuan capture**：恰好一次 no-generation query 可选定 `cloud-response-v1 | compat-top-level-v1`，shape digest 必须来自 package-owned exact descriptor；不得对 paid response 自动猜 profile，不得返回 raw body/signed URL/RequestId/credential。
4. **有界 poll/download**：总 deadline、attempt 上限、abort 真正有效；只有 authenticated provider route 带 credential，asset CDN/COS request 绝不带 credential；redirect/host/status/body budget 不被 runner 绕过。
5. **真实 durable closure**：runner 使用真实 remote output identity 与下载 bytes，进入 provider-neutral package-internal completion/publication。fake 可复用同一内核，但真实路径不得造假 poll/download 或持久 signed URL。
6. **fresh-root per provider**：两个独立 root 各自只有一条 generation；复用已有 generation evidence 的 root 在 Keychain/provider 副作用前拒绝。中断的 root 不由本 script 自动 resume。
7. **脱敏与最小性**：script/runner result/error/stringify/source 不泄露 key、header、raw response、signed URL 或本机路径；无新 route/UI/main production wiring、provider registry/plugin、scheduler/retry framework、World/viewport/四工具改动。

## 必须主动构造的反例

- pre-aborted submit：fetch=0、credential read=0。
- paid fetch 开始后突然断电：restart submit=0、durable outcome 不被误当作 safe retry。
- capture 同时匹配两 profile、不匹配任一 profile、duplicate key、oversized/body stream failure：稳定拒绝。
- 第二次在同 root 运行：credential read=0、provider fetch=0、已发布 inode/bytes 不变。
- poll deadline/attempt exhaustion：终止且不重提；其后同 root 第二次 script 在 credential read/provider fetch 前拒绝。
- asset redirect 到 foreign host，或企图继承 `Authorization`/`WLT-Api-Key`：在发送前拒绝。
- runner 结果与 error 做 `JSON.stringify`：不得含 key、signed URL、raw body、prompt 之外的 provider secret data。

## 审查输出

结构化输出 `decision: approved | changes_requested`、`may_run_live_canary: yes | no`、P0/P1/P2 findings、实际命令与结果、边界声明。任一 P0/P1 必须立即直报 `/root`，但仅继续 request-scoped closure。
