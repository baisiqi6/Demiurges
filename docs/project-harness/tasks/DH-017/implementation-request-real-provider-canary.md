# DH-017 真实 Provider Canary 实现请求

## 目标

为已有 DH-017 Generation 闭环增加一个最小的 Operator-only canary runner：先用 fake transport 证明唯一 submit、bounded poll/download、durable publication 与脱敏，再由 Codex Operator 在 Reviewer 批准后亲自读取 Keychain 并执行真实 canary。

这不是新 provider framework、SDK adapter 或 production generation UI。优先复用已有 Marble/Hunyuan direct services、submit orchestrator、durable Generation lifecycle、artifact inspector/publication、Gateway reader 与 Studio panel。

## 冻结的 Human 授权

- Marble：`worldlabs-marble-v1` / `marble-1.0-draft` / `A small quiet stone courtyard with a single red wooden stool at the center, flat ground, daylight, no people, no text.` / 最多一次 submit / 预期 `230 credits`。
- Hunyuan：`hunyuan-ai3d-v1` / `3.0` / `Normal` / `一张结构简单的红色木凳，四条腿，纯色材质，独立单体，无人物，无文字。` / 最多一次 submit / 预期 `20 credits`。
- 两者均为 `costUnknownAccepted=true` 且 `waitForCompletionAndDownload=true`。
- Hunyuan paid submit 前必须对已有 JobId 做一次 no-generation authenticated query contract capture。
- credential 仅由 Operator 从 Keychain 读取；Worker/Reviewer 不得读取、接收或输出 credential。
- 真实完成需等待 provider terminal success、下载、检查、durable publication，最后从 Gateway/Studio 证明可见。
- 当前 first-generation MVP 不支持在同一 Data Root 安全追加第二条 generation；因此两家 provider 各用一个隔离的 fresh canary Data Root，各自完成一次完整闭环和 Studio 证明。本切片不实现 multi-generation capacity/recovery。
- 不授权 commit/push/merge/deploy、自动重提、第三个 provider 或 World/viewport 改动。

## Worker 范围

Worker 只实现与验证最小 runner，不得访问 Keychain、credential、网络或真实 provider。

1. 复用现有 exact provider services 和 durable submit authority；禁止另写 provider lifecycle 抽象。
2. 以 injected fake transport/clock 验证每 provider 恰好一次 submit，任意 ambiguous outcome 都停止。真实 canary 是一次连续 Operator 进程；进程在 `verified` 前中断时不自动重运行，所以也不实现本切片的 poll/download crash-resume。
3. 对 poll/download 使用明确 total deadline、attempt 上限与 `AbortSignal`；不增加自动 paid-submit retry。
4. 下载成功后仅把真实 provider output identity 与已验证 bytes 交给现有 Generation/Artifact publication 路径；不得把 fake identity 或 signed URL 持久化。
5. Hunyuan contract capture 只接受 injected bytes/transport，产出 closed profile 与 package-owned shape digest；禁止 raw response/signed URL 进入结果或日志。
6. runner 的结果只包含 provider/model、脱敏 remote public identity、耗时、sanitized cost、Artifact IDs/digests与完成状态；禁止 credential、header、raw body、signed URL、本机绝对路径。
7. 如现有 fake completion 名称/边界不适合真实 bytes，只允许抽出一个 provider-neutral、package-internal 的“已下载 bytes 完成”内核；fake 路径继续复用它。不得引入 registry/plugin/transaction framework。

## 必须的 fake 验收

- Marble/Hunyuan happy path：submit count 各 `1`，poll/download 有上界，最终生成 provider-correct ordered Artifact set。
- pre-submit abort：fetch `0`，可安全停止。
- post-fetch transport/body/malformed 2xx/timeout：按 provider 冻结语义进入 ambiguous/transient/contract mismatch，且 paid submit 永不再发。
- provider/model/prompt/profile/shape digest 任一漂移：在 provider call 前 fail closed。
- signed URL 不得进入 durable state、runner result、error 或 stringify output；credential 不发往 asset host。
- 进程在 `verified` 前异常终止时，root 保留 durable evidence；对同 root 的第二次 script 执行必须在 credential read/provider fetch 前拒绝。不自动 resume poll/download，submit count 始终最多为 `1`。
- Gateway reader 和 Studio 展示 `VERIFIED` + `CALIBRATION MISSING`，不修改 World/viewport。

## Reviewer gate

Reviewer 只读、不读 Keychain、不联网、不调真实 provider。从底层需求、唯一付费副作用、可恢复闭环、脱敏和最小性审查；P0/P1 为零且 `may_run_live_canary=yes` 后，才能将真实执行权交回 Codex Operator。

## Operator-only 真实顺序

1. 核对官方 model/pricing/endpoint，以及 Keychain locator 存在性（不输出 secret）。
2. 执行恰好一次 Hunyuan no-generation contract capture；若 profile/shape 不受支持则停止。
3. 以冻结参数各执行一次 Hunyuan 和 Marble submit；每个 provider 的 submit counter 一旦变为 `1`，任何恢复都不得再提交。
4. 等待 terminal、下载、检查并发布。若失败/timeout/ambiguous，保留 durable evidence 并停止，不自动修复或重提。
5. 从 Gateway 与 Studio 做最终可见性验证，写入脱敏 canary receipt；不提交、推送或部署。

## 停止条件

- Keychain locator 缺失，或 secret 可能出现在命令行、输出、日志、文档、URL 或浏览器。
- 无法从 durable truth 证明当前 provider 尚未 submit，或任何路径可能造成第二次 paid submit。
- 官方 contract、model、endpoint、output shape 与冻结实现不一致。
- 实际参数、provider/model 或预期费用超出 Human 冻结值。
- 需要扩大为通用 provider framework、改 World/viewport/四工具，或绕过现有 durable authority 才能继续。
