# DH-017 冻结 Hunyuan Live Contract 独立审查请求

从产品发心、第一性原理与奥卡姆剃刀审查 `implementation-request-freeze-hunyuan-live-contract.md` 的实现。目标只是把已经真实捕获的 `cloud-response-v1` 冻结给未来 canary，删除旧 JobId pre-submit capture；不得把本片扩成 codec、provider framework、audit 或 recovery 重构。

审查：

- `scripts/run-dh017-provider-canary.ts`
- `scripts/run-dh017-provider-canary.test.ts`
- 直接依赖 `hunyuan-contract-capture.ts`、`hunyuan-generation-service.ts`、`provider-canary-runner.ts`、`generation-provider-codecs.ts` 的必要部分。

必须确认：

1. Hunyuan canary 不再接受旧 JobId，不再发 pre-submit `/query`；第一个 Provider request 是 exact `/submit`。
2. contract exact 为 `cloud-response-v1` 与 `HUNYUAN_CONTRACT_SHAPE_DIGESTS["cloud-response-v1"]`，binding/service/runner 三处一致，无 fallback。
3. stale `existingHunyuanJobId` 在 runtime/credential/fetch 前拒绝；CLI 多余第三参数 exit 64。
4. Marble 路径不变；无真实外部动作、无新增框架。
5. 不要要求 successful query codec 接纳旧 JobId 的 `Response.Error`；该 shape 只证明 envelope。

Operator 已执行：focused `44 pass / 0 fail / 310 expect()`；root typecheck pass；目标文件 whitespace clean。Reviewer 只读离线，不运行 CLI main、不读 Keychain、不联网。

输出 `P0/P1/P2`、`decision`、`may_advance=yes|no`。
