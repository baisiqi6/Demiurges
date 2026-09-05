# DH-017 implementation request — durable poll failure

## 目标

修复真实 Hunyuan canary 暴露的单一缺口：provider submit 已 durable `remote_bound` 后，poll 明确返回终态失败时，进程结果虽为 `provider-failed`，Generation durable head 仍停留在 `remote_bound`。

遵循第一性原理：复用现有 `GenerationSubmitResultCoordinator` 与 `GenerationRecordJournal`，不新增 coordinator、恢复框架、registry、scheduler 或 retry。

## 允许修改

- `packages/world-project/src/generation-submit-result-coordinator.ts`
- `packages/world-project/src/generation-submit-result-coordinator.test.ts`
- `apps/agent-gateway/src/provider-canary-runner.ts`
- `apps/agent-gateway/src/provider-canary-runner.test.ts`

除本 request 外，不修改其他文件。若确实无法在上述范围完成，先 BLOCK，不自行扩范围。

## 必须实现

1. `GenerationSubmitResultCoordinator.submitResult()` 在 current=`remote_bound` 且 request outcome=`provider-failed` 时，复用既有 pending/witness/capacity/append 路径追加唯一 `provider_failed` record。
2. current=`remote_bound` + exact `remote-bound` 仍是只读 replay；冲突 remote identity、submission ambiguous 或其他非法 outcome 仍 fail closed。
3. exact `provider_failed` retry 仍是只读 replay；append crash 继续复用现有 pending record，不生成第二 successor。
4. `ProviderCanaryRunner` 对 poll outcome 做 closed 分类：
   - provider service `rejected`：durable 写其 exact provider failure code；
   - provider success payload 的 terminal `failure`：durable 写 `PROVIDER_REJECTED`；
   - `contract-mismatch`：返回 `blocked`，不得写 `provider_failed`；
   - `transient` 或 abort/deadline：返回 `timed-out`，不得写 `provider_failed`；
   - download failure 保持 nonterminal process outcome，不伪造 provider terminal failure。
5. Hunyuan 是本次真实缺口；Marble 若共用同一极小分类 helper 可以同步闭合，但不得引入 provider abstraction/framework。

## 测试

- coordinator：`remote_bound -> provider_failed` append、exact replay、conflict zero-mutation、代表性 journal fault resume。
- runner：Hunyuan `Status=FAIL` 后 durable head=`provider_failed`；HTTP rejected exact code；transient/contract mismatch 不写 terminal record。
- 若同步处理 Marble，加入一项 terminal failure durable test即可，不扩展矩阵。

## Non-goals / 禁止

- 不调用真实 provider，不联网，不读 Keychain/credential，不执行 real generation。
- 不重试 Hunyuan 或 Marble；两次 Human paid authority 已消费。
- 不实现 poll/download crash resume、startup recovery、multi-generation、generic lifecycle SDK、audit framework。
- 不修改 Gateway route、Studio、World/四工具、CAS/publication、provider codecs/service contracts。
- 不 reset/clean/stash/commit/push/merge/deploy；保留共享 dirty worktree。

## 验收

1. focused tests 通过。
2. `bun run typecheck` 通过。
3. worker scoped diff clean，无越界修改。
4. Worker 输出 RESULT，但不自我批准；随后由独立 Reviewer 审查。
