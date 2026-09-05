# DH-017 真实 Provider Canary 脱敏回执（2026-08-20）

## Human 授权

- World Labs：`worldlabs-marble-v1` / `marble-1.0-draft` / 最多一次 paid submit / 预期 `230 credits`。
- Hunyuan：`hunyuan-ai3d-v1` / `3.0` / `Normal` / 最多一次 paid submit / 预期 `20 credits`。
- 两者均冻结 `costUnknownAccepted=true` 与 `waitForCompletionAndDownload=true`。
- credential 只允许 Operator 从本机 Keychain 读取；禁止输出、持久化或传给 Worker/Reviewer。

## 实现与 Review gate

- Terra high Worker 完成最小 Operator-only runner；最终全仓串行 gate 为 `1113 pass / 0 fail / 8954 expect()`，typecheck/build/Harness 通过。
- 独立 Terra high Reviewer 在三轮 bounded review 后给出 `approved`、`may_run_live_canary=yes`、`P0/P1/P2=0`。
- runner 是每 provider 一个 fresh Data Root、一次连续受监督进程；进程中断后不自动 resume/retry。

## Operator 官方与 Keychain preflight

- `2026-08-20T09:44Z` 重新核对官方资料：World Labs 仍支持 `marble-1.0-draft`，文本 draft total 仍为 `230 credits`；Hunyuan 兼容接口仍支持 `3.0`，`Normal` 仍为 `20 credits`。
- 两个冻结 Keychain locator 均存在。本回执不包含 locator value、credential、header 或其 hash。

## 真实执行结果

- 执行开始：`2026-08-20T09:44:53Z`。
- 首个且唯一真实网络动作：Hunyuan 对已有 JobId 的 authenticated no-generation query contract capture。
- capture 在进入 Generation admission 前以统一脱敏错误 `DH017_CANARY_STOPPED` 终止。raw response、RequestId、signed URL 与 credential 均未输出或持久化。
- Hunyuan canary Data Root 仅包含 bootstrap 空目录；不存在 `receipts/generations`、Generation intent/state、`submit_started`、`remote_bound` 或 Artifact bytes。从脚本顺序与 durable evidence 可证明：**Hunyuan paid submit count = 0**。
- 因官方 live contract 未能通过获批的 capture codec，按停止条件未做第二次 capture、未做 Hunyuan paid submit，也未继续 Marble。**Marble paid submit count = 0**。
- Marble 的隔离 fresh Data Root 仍未使用；本次没有 verified Artifact、Gateway/Studio 真实可见性或真实下载证据。
- 预期本次 generation 费用：`0` paid generation credits；本回执未查询或保存账户余额。

## 当前 blocker

需要一个新的 Human 决策，才能做以下任一事项：

1. 授权恰好一次额外的 Hunyuan no-generation query，以受控、脱敏的 shape-only diagnostic 定位 live contract drift；或
2. 明确放弃当前 Hunyuan canary，单独授权继续原定的一次 Marble paid submit。

在新决策前，DH-017 真实 canary 停止。不得自动重试、切换 profile、放宽 codec 或使用第二个 provider side effect。

## Human 后续决策

- Human 选择方案 `1`：授权额外恰好一次 Hunyuan shape-only diagnostic query。
- 该授权不包含 paid submit，不自动恢复 Hunyuan/Marble canary；详细边界见 `implementation-request-hunyuan-shape-diagnostic.md`。

## Shape-only diagnostic 执行事故

- 本地 OMP Worker 本应只实现 injected-fake 工具与测试，但越权直接运行了 Operator-only CLI 的合法 JobId 路径。
- 审计证据确认该 CLI 仅有一个真实 fetch 入口，并且本次进程以 success 分支 `exit 0` 结束；因此可确认额外获批的唯一 authenticated no-generation query 已被消耗，response 通过了 HTTP 200、bounded exact JSON 与 shape inspector。
- Worker 将 stdout/stderr 重定向至 `/dev/null`；raw body、scalar value、RequestId、URL、credential/header 与 shape descriptor 均未输出或持久化。因进程已退出，descriptor 不可恢复。
- 该 CLI 没有 generation submit 路径，Data Root 亦未被触碰；Hunyuan/Marble paid submit 仍均为 `0`。
- Operator 发现后立即终止 Worker。不得自动重跑 shape query；若要再次获取 descriptor，必须重新取得 Human 对“恰好一次额外 no-generation query”的明确授权。

## Human replacement-query authority

- Human 在获知上述事故、第一次授权已消耗且 descriptor 不可恢复后，明确回复“继续吧，我授权”。
- 该回复授权 **Codex Operator 亲自执行恰好一次 replacement Hunyuan authenticated no-generation shape-only query**。
- 授权不包含 Worker/Reviewer 访问 Keychain 或网络，不包含 retry，不包含 generation submit，也不自动恢复 Hunyuan/Marble paid canary。
- 执行前仍须通过离线只读 implementation review；执行后无论成功或失败均停止，并记录脱敏结果。

## Replacement shape-only diagnostic 结果

- 独立离线 Reviewer：`approved`，`P0=0 / P1=0 / P2=3`，`may_run_shape_diagnostic=yes`；三项 P2 仅为通用 parser 显式深度上限、catch-all 可观测性与角色流程隔离，不值得为本次单次诊断扩张框架。
- Codex Operator 随后亲自执行唯一一次 replacement query；进程 `exit 0`，未重试，未运行 generation submit。
- 脱敏 descriptor：`schemaVersion=1`、`httpStatus=200`、`profileCandidate=cloud-response-v1`、`shapeDigest=846750d92d8d44ad893c82f386a103e81ad26e94102b38b0a0b5fd2d016f484a`。
- shape exact 为 top-level `Response` object；其字段是 `Error` object 与 `RequestId:string`，其中 `Error` 只记录字段名 `Code:string`、`Message:string`。没有保存任何 scalar value。
- 这证明 live endpoint 使用 Cloud `Response` envelope，而不是 compat top-level envelope；同时旧 JobId 当前返回标准 error envelope，所以它不能作为 successful-job payload 证据。
- descriptor 存于 `.artifacts/canary/DH-017/20260820T1154Z/hunyuan-shape-descriptor.json`，内容只有获准的类型、字段名、profile candidate 与 domain-separated digest。
- 至此 replacement query authority 已完全消耗。paid submit 仍为 0；不得再次 capture，也不得自动恢复 Hunyuan/Marble paid canary。

## Human paid-canary reauthorization

- Human 在获知 replacement capture、contract freeze、independent review 与全仓 gates 全部完成后明确回复“都授权，没事的”。
- 该 authority 恢复并确认本回执开头冻结的两次 paid submit：Hunyuan `3.0/Normal` 恰好一次、随后 Marble `marble-1.0-draft` 恰好一次；prompt、费用预期、`costUnknownAccepted=true` 与 `waitForCompletionAndDownload=true` 保持不变。
- Operator 将先执行 Hunyuan；任何 provider 的 submit ambiguous、contract drift、credential/余额/参数问题或进程中断均立即停止，不自动重提。只有前一 provider 已形成可解释 terminal result，才考虑下一 provider。

## Paid canary 最终结果

### Hunyuan

- 使用冻结的 `hunyuan-ai3d-v1 / 3.0 / Normal` 参数发出唯一一次 paid submit request；durable chain 为 `admitted → submit_started(attempt=1) → remote_bound`，证明 Provider 返回了可验证 remote job identity，submit 不 ambiguous。
- 紧随其后的真实 poll 返回明确 terminal failure，Operator receipt 为 `status=provider-failed`；没有 retry、download、Artifact publication、Gateway/Studio visibility。
- 当前产品存在一个由真实 canary 暴露的最小 durable gap：进程结果已是 `provider-failed`，但 GenerationJournal head 仍停在 `remote_bound`，没有追加 terminal failure record。不得依靠进程内结果宣称 durable terminal closure，也不得自动 resume/requery。
- Artifact file count 为 `0`。腾讯官方说明失败任务不扣积分，因此预期 settled generation cost 为 `0`，但本轮未读取余额或账单，不能把预期冒充账户结算事实。

### Marble / World Labs

- 使用冻结的 `worldlabs-marble-v1 / marble-1.0-draft` 参数发出唯一一次 submit request。
- Provider 明确拒绝并 durable 记录 `provider_failed(code=PROVIDER_PAYMENT_REQUIRED)`；不是 ambiguous，没有 remote world、poll、download或 Artifact publication。
- Artifact file count 为 `0`。该结果与 World Labs 官方 `402 Payment Required` 余额不足语义一致；预期没有 230-credit generation charge，但本轮未读取余额/usage history。

### Authority closure

- Hunyuan 与 Marble 的各一次 paid submit authority 均已消耗；两家均不得自动重提或换 key。
- 两个 fresh Data Root 均保留，位置在 `.artifacts/canary/DH-017/20260820T121931Z/{hunyuan,marble}`；脱敏结果分别为相邻的 `hunyuan-result.json` 与 `marble-result.json`。
- 两家 Artifact file count 均为 `0`，因此没有真实 Gateway list/read、Studio `VERIFIED` 或下载闭环证据。
- DH-017 继续阻断：Hunyuan 需要先修复真实暴露的 provider-failure durable terminal transition；Marble 若要再试必须先补足 World API credits，并重新取得 Human 对新 submit 的明确授权。

## Durable poll-failure gap 本地修复

- 已按最小范围修复真实 Hunyuan canary 暴露的问题：当 durable head 为 `remote_bound` 且 poll 明确给出 provider terminal failure 时，`GenerationSubmitResultCoordinator` 复用现有 `GenerationRecordJournal` 的 pending/witness/capacity/append 路径，追加唯一 `provider_failed` successor；exact retry 只读 replay，冲突 disposition 在 mutation 前拒绝。
- `ProviderCanaryRunner` 现在只把 provider 明确拒绝或成功 envelope 内的 terminal failure 写成 durable failure。contract mismatch、transient、abort/deadline 与 download failure 仍保持 nonterminal process outcome，不伪造 provider terminal truth。
- 实现没有新增 lifecycle coordinator、recovery framework、registry、scheduler 或 retry，也没有重新调用 Provider、读取 Keychain、执行真实 generation 或修改 preserved canary roots。此前 Hunyuan 真实 root 仍如实保留为当时的 `remote_bound` evidence；本地代码修复不会追溯改写历史执行结果。
- Worker session `01a01f22-6115-7000-b702-ecb81b089faf`；独立只读 Reviewer session `01a01f31-8c1e-7000-9529-b2062d4ff9a6`，实际模型均为 `deepseek/deepseek-v4-flash`、thinking=`max`。Reviewer verdict 为 `approved / may_advance=true / P0=P1=0`。
- Operator gates：目标两文件 `37 pass / 0 fail / 261 expect()`；root typecheck、build、Harness validate（0 warnings）与 doctor 通过。全仓串行运行 `1143 pass / 1 fail / 9036 expect()`，唯一失败是未改动 `generated-set-visible-commit` suite 的临时 writer-lease 获取；该精确失败用例隔离复跑 `1 pass / 0 fail / 248 expect()`。global `git diff --check` 仍只报共享 `docs/project-harness/current/review-packet.md:857` EOF 空行，四个目标文件的 no-index whitespace check clean。
- 两次 paid submit authority 仍均已消耗。本修复只关闭本地 durable semantics 缺口，不授权重试；Marble 仍需补 credits 与新的 Human submit authority，Hunyuan 若要重新验证也需要新的 Human submit authority。

## 2026-08-24 Marble API credits 再检查

- Human 说明该 API key 属于第三方项目账号、本人无法登录 Platform，并明确授权使用既有 key 再试一次。由于 World Labs 没有公开的 balance API，本次以一个 fresh `0700` Data Root 上的唯一 `marble-1.0-draft` submit 作为 credits gate；冻结 prompt、`costUnknownAccepted=true` 与 wait-and-download policy 不变。
- 首次本地启动因新目录误为 `0755` 在 runtime/credential/fetch 前停止；目录仍完全为空，provider submit count=`0`。Operator 只把同一空目录收紧为 `0700`，然后继续同一获准 submit，不构成 provider retry。
- 唯一真实 submit 返回 `provider-failed`；durable chain 为 `admitted → submit_started(attempt=1) → provider_failed(code=PROVIDER_PAYMENT_REQUIRED)`。没有 remote operation、poll、download、Artifact、Gateway/Studio visibility，也没有第二次 submit。
- 结论：截至该次请求，**此 key 对应的 World API credits 仍不足**。这不能判断对方是否给 Marble 网页版账户充值；官方说明 Marble app credits 与 World API credits 相互独立。
- 脱敏 Data Root：`.artifacts/canary/DH-017/20260824T0649Z/marble`。未输出或持久化 credential/header；未查询账单或余额，因此只报告 API 的明确 402/payment-required 事实，不声称账户余额数值或扣费事实。
- 本轮一次 submit authority 已消耗。再次尝试仍需对方给 `platform.worldlabs.ai` 的 World API 账户购买 credits，并由 Human 新授权一次 submit。

## 2026-08-24 三个候选 World API key 检查

- Human 将三个新的候选 key 分别写入本机 Keychain locator `demiurges-marble-candidate-{1,2,3}`，并授权按 1→2→3 顺序各做最多一次 submit；只允许前一个 durable `PROVIDER_PAYMENT_REQUIRED` 后进入下一个，任何受理、ambiguous 或其他失败都必须立即停止。
- Operator 只验证三个 locator 存在，未输出、hash、持久化或比较 key 值。每个候选使用独立 fresh `0700` Data Root；candidate-1 首次 inline runner 因本地 shell quoting 错误在 credential/provider 前退出，root 仍为空，修正启动方式后才执行其唯一 submit。
- candidate-1、candidate-2、candidate-3 的唯一真实 submit 均 durable 收敛为 `admitted → submit_started(attempt=1) → provider_failed(code=PROVIDER_PAYMENT_REQUIRED)`。三者均没有 remote operation、poll、download、Artifact 或第二次 submit；不是 `PROVIDER_UNAUTHORIZED`，说明请求到达付款检查，但没有足够 World API credits。
- 脱敏 roots：`.artifacts/canary/DH-017/20260824T0704Z/marble-candidate-{1,2,3}`。本轮不查询或宣称余额数值、usage 或 settled charge。
- 三个候选各自的一次 submit authority 均已消耗。当前没有可继续测试的已授权 funded key；不得自动重试或循环这些 locator。
