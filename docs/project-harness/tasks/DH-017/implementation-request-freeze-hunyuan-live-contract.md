# DH-017 冻结 Hunyuan Live Contract 最小实现请求

## 事实

Human 授权的 replacement no-generation query 已完成。shape-only descriptor 证明 live endpoint top-level exact 为 `Response`，因此 profile 是 `cloud-response-v1`。旧 JobId 返回 `Response.Error + RequestId`；这只证明 envelope，不是 successful-job payload。

## 目标

让未来单独获准的 paid canary 直接使用已经捕获并冻结的 `cloud-response-v1` + 现有 package-owned contract digest，不再为旧 JobId 发 capture query。

## 最小范围

- 只修改 `scripts/run-dh017-provider-canary.ts` 与对应测试；若确需一个同目录小常量可增加，但优先直接复用 `HUNYUAN_CONTRACT_SHAPE_DIGESTS["cloud-response-v1"]`。
- Hunyuan canary CLI 不再要求/接受 `existingHunyuanJobId`，不再调用 `captureHunyuanContract`，也不发 pre-submit query。
- 保留 `hunyuan-contract-capture.ts` 及其 tests 不动；它是历史/独立 seam，本 slice 不做清理重构。
- 不修改 successful query codec，不把 `Response.Error` 猜成 job failure/unauthorized；未来 paid submit/query 仍按现有 fail-closed matrix。

## 验收

- fake Hunyuan canary 证明 runtime contract exact 为 `cloud-response-v1` 与现有 package-owned digest。
- credential 读取后，第一个 provider request 必须是 `/v1/ai3d/submit`；不存在 `/v1/ai3d/query` capture。
- CLI Hunyuan 参数只接受 provider + fresh Data Root；多余旧 JobId 参数 fail-fast，credential read/fetch 均为 0。
- Marble 路径不变；无 retry、无真实 Keychain/网络/provider/generation。
- 不新增 registry/adapter/config framework/audit/recovery 代码。

Worker 只能用 injected fake 与静态编辑；禁止运行 CLI main、Keychain、网络或 Provider。Operator 负责测试执行，Worker RESULT 不等于 Reviewer approval。
