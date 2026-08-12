# DH-010.1 实现证据

## RED

- Bun/JavaScriptCore scripted Runtime 产生合法 ball-vessel projection；
- Node/V8 通过 Vite SSR 加载同一 `decodeProductSessionProjection`；
- 旧实现稳定失败，错误为 `projection.lastRun.evaluation Evaluation 与受信 evaluator 结果不一致`；
- 实测唯一差异是 `maxLinearSpeedMetersPerSecond`：Bun 为 `2.36609919285099e-10`，V8 为 `2.3660991928509905e-10`，差约 `5.17e-26`，两边 `passed=true`。

## GREEN

- evaluator-derived continuous numbers 在共享 Evaluation 层转换为 15 位十进制有效数字，并把 `-0` canonicalize 为 `0`；
- landing contract 派生高度、vessel contract 派生半径余量、逐 sample containment metric 与 landing terminal metric 均在 predicate 和输出前使用同一 canonical number；
- Product codec 未增加 approximate comparator，仍要求 transport Evaluation 与受信 evaluator 的 canonical plain data 完全一致；
- V8 接受真实 Bun projection，同时拒绝 transport 中被改写 `1e-12` relative 的 canonical speed metric。

## 验证

- focused product codec：`12 pass / 0 fail / 38 assertions`；
- evaluator + DH-010 contract：`18 pass / 0 fail / 74 assertions`；
- full：`151 pass / 0 fail / 2,863 assertions`；
- `bun run typecheck`：通过；
- `bun run build`：通过，仅保留既有 MuJoCo browser-external 与 chunk-size warning；
- `git diff --check`：通过；
- EXharness checklist：`0 warning`；
- scripted Chromium：`world_write → world_read → world_edit → world_run`，91 samples，Evaluation `PASS`，current ref 保持 `snapshot:edit-1@v2`；从头重播约 0.65 秒后位于 `frame 26 / 90`，无 alert。

## Frozen product identity

基线 `HEAD`：`4d37444f41e3db9164f3f614861ca971a489bfa3`

按下列固定顺序对文件 SHA-256 文本再次做 SHA-256：

1. `packages/world/src/evaluation/evaluate-episode.ts`：`ea2cca89fd6069151a4bf0f1dc6d18993356dbf525d377523eb855566273c75f`
2. `packages/world/src/product-session-codec.test.ts`：`3d8554dacf67b7862ce8dff911008a03ba70886e37404853b5d116d4bb9c15f3`
3. `scripts/probe-product-session-codec-v8.mjs`：`9368fe97624bcdb34579ff1b2efc02d7976d3244131727c159005841e09f4c93`

Aggregate：`6bc13dfec1c33927105bfa29fbc47ac2f95dc3d47a60732ecb1ccc98ebb20465`

当前状态：实现完成，等待 independent reviewer；尚未 closeout、mark-done、commit 或 push。

## Round 1 remediation

- Round 1 reviewer 给出 `changes_requested / P1=1 / may_closeout=no`：跨引擎 probe 缺少 wall-clock bound，Node/Vite hang 可让测试无限等待；历史结论保留在 `review-verdict-round1.md`；
- hung child regression 先因 `runNodeV8Probe is not defined` 进入 RED；
- parent 现在限制 2,000,000 UTF-8 bytes，并以 5 秒总 deadline 终止 `SIGKILL`、等待 child exit 与 stdout/stderr 回收；
- Node probe 对 stdin、Vite create/load/close 分别使用 4 秒 step deadline，正常/错误/close-timeout 都返回结构化结果；
- remediation focused 为 `14/0/41`，full 为 `153/0/2,866`，typecheck/build/diff/EXharness 均通过；
- Round 2 product aggregate 为 `299414f7a4c78b1979ff1e73468b4c822286a9bb5bf71276a128e377f7271676`，等待 fresh reviewer；尚未 closeout、mark-done、commit 或 push。

## Round 2 approval

- fresh reviewer 在 aggregate `299414f7...` 上独立重跑 focused `14/0/41`、full `153/0/2,866`、typecheck/build/diff/EXharness；
- reviewer 以真实 hung Node child 确认 `SIGKILL + await reaping`，并独立验证 2 MB UTF-8 budget、4 秒 Vite step deadline、5 秒 parent total deadline、合法/篡改 Bun→JSON→V8 路径；
- verdict 为 `approved / P0=P1=P2=0 / may_closeout=yes`，详见 `review-verdict-round2.md`；
- closeout gate 已打开，等待 Operator 正常 closeout 与 mark-done。

## Operator close

- `closeout` 后按 EXharness 顺序重新登记同一 frozen Round 2 approval，再执行正常 `mark-done`；
- 第一次在 closeout 后、重新登记 approval 前的 `mark-done` 被护栏拒绝，未使用 `--force`；
- 最终 CLOSE event：`evt-20260812T060501Z-9debaaa1`，item 为 `done / closed`，lease 已释放；
- 下一步仅执行已授权的 feature branch commit + push，并回查 remote SHA；不 merge `main`、tag 或 deploy。
