# DH-017 Worker bootstrap — Hunyuan live query placeholders

角色：bounded coding Worker。收到后先回复 `ACCEPT`；若边界不清或无法满足则回复 `DECLINE` 并停止。

## 底层目标

让当前 Hunyuan `cloud-response-v1` query codec 接受腾讯官方 schema 与 2026-08-24 scalar-free live descriptor 已证明存在的 provider placeholder 字段，从而能继续 poll 已经 durable `remote_bound` 的 Job。只解决这个真实 mismatch，不新增 abstraction、normalizer、fallback profile、retry/recovery framework 或第二次 submit。

## cwd / authority

- cwd: `/Users/Admin/projects/WorkTrees/Demiurges-DH-017`
- 允许修改：
  - `apps/agent-gateway/src/generation-provider-codecs.ts`
  - `apps/agent-gateway/src/generation-provider-codecs.test.ts`
  - `apps/agent-gateway/src/hunyuan-generation-service.test.ts`（仅当 service-level regression test 确有必要）
  - 新增 `.artifacts/canary/DH-017/20260824T153710Z/hunyuan/worker-result-live-placeholders.md`
- 禁止修改其他文件。
- 禁止 Keychain、网络、provider query/submit/poll/download、真实 JobId、生产、SSH、Coordinate/Discord、commit/push/merge/reset/clean。
- 不读取或输出 live raw response、scalar、credential、JobId、RequestId、ErrorMessage 或 signed URL。

## 当前真实证据

- fresh Generation durable head: `remote_bound`; paid submit=`1`; duplicate submit=`0`。
- scalar-free descriptor digest: `529ada927c6471d3a40c1e511f2a0fcd0301055f3602229ac10cb6735c687572`。
- field/type shape: `Response.{Status:string,ErrorCode:string,ErrorMessage:string,ResultFile3Ds:array,ResultCreditDetails:string,ResultCreditConsumed:number,RequestId:string}`。
- 当前 codec 在 status branching 前无条件拒绝 non-nullish `ResultCreditDetails`。
- 官方 `QueryHunyuanTo3DProJob` schema 明确上述字段类型；DONE 示例使用 `ErrorCode:""`、`ErrorMessage:""`、non-empty JSON-string `ResultCreditDetails`、numeric cost 与 result array。
- 官方状态语义：WAIT/RUN 继续；FAIL 读取 error；DONE 读取 files。

## 最小行为契约

先用测试表达，再实现：

1. `ResultCreditDetails`：仍须 absent/null/string 且受既有 string budget；允许 string，但永不返回/持久化。
2. WAIT/RUN：只接受 error fields 为 absent/null/empty string；files 为 absent/null/exact empty dense array；cost 为 absent/null/exact numeric zero；credit details 为 absent/null/empty string。任一非空/非零 placeholder 仍 `PROVIDER_CONTRACT_MISMATCH`。
3. FAIL：允许 files absent/null/exact empty dense array；保留现有 sanitized total cost 与 failure result；details 只做 nullable-string validation并忽略。不要输出 ErrorMessage/详情。
4. DONE：允许 success error fields absent/null/empty string；保留现有 exact file-set、URL origin、identity、cost规则；details 只做 nullable-string validation并忽略。
5. 未知 key、非法类型、非 dense array、pending 非空 files、pending 非零 cost、pending 非空 details、DONE 非空 error field 继续 fail closed。
6. 不改变 submit codec、Marble codec、profile freeze、HTTP service、durable state 或 public result type。

若你从现有代码发现上述某项无法在不扩大范围的前提下成立，停止并说明，不自行改需求。

## 成功标准

- 精准 diff，优先在现有 `decodeHunyuanQueryResponse` 内完成；不新增通用抽象。
- 现有 tests 全过；新增 exact regression 覆盖 live WAIT/RUN placeholder、官方 DONE placeholder、FAIL empty files，以及上述拒绝矩阵。
- 至少运行：
  - `bun test apps/agent-gateway/src/generation-provider-codecs.test.ts apps/agent-gateway/src/hunyuan-generation-service.test.ts`
  - `bun run typecheck`
- RESULT 用中文说明修改、测试、未验证项、实际模型/session evidence；不得宣称真实 provider poll 已通过。
