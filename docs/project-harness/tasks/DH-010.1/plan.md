# DH-010.1 跨引擎 Evaluation 数值一致性收尾

## 目标

修复 Gateway 在 Bun/JavaScriptCore 中生成合法 `EvaluationRecord`，却因 Chromium/V8 在浮点末位产生微小差异而被 Studio 拒绝的问题。修复必须维护现有 evidence authority，不能把校验关闭、移到 UI 特判或退化为只比较 `passed`。

## 已确认根因

- Bun producer 对同一 Episode 得到 `maxLinearSpeedMetersPerSecond = 2.36609919285099e-10`；
- V8 verifier 重算得到 `2.3660991928509905e-10`；
- 两者差值约为 `5.17e-26`，`passed` 与全部 contract boundary 均一致；
- `product-session-codec` 使用递归逐值精确相等比较整个 `EvaluationRecord`，因此错误拒绝合法 projection；
- `RuntimeProfile` 已声明目标是显式 tolerance 下的 `numeric equivalence`，不是跨 JavaScript engine 的 bitwise identity。

## 范围

1. 先增加一个由 Node/V8 运行的跨引擎 regression，消费 Bun scripted Gateway 产生的真实 JSON projection，并在旧实现上稳定失败。
2. 在 Evaluation evidence 的共享语义层引入单一、确定性的数值规范化或等价判定，使 producer 与 verifier 对已登记 evaluator 得到同一 canonical evidence。
3. 保持 `id`、`episodeId`、`contractId`、`evaluatorId`、`passed`、离散 metrics 与 object shape 精确闭合。
4. 保持现有 forged Evaluation、physics/ref/representation drift、sparse/accessor/non-finite 等反例继续 fail closed。
5. 真实 Chromium 中完成 ball-vessel scripted turn，显示 91-frame Episode 与 `PASS`，并可从头播放。

## Non-goals

- 不引入 browser-only fallback、关闭 Product codec 重算或放宽为只信任 Gateway；
- 不改变 MuJoCo trajectory、Success Contract threshold、Evaluation identity 或 Repository/Ref authority；
- 不增加新的 Runtime mode、provider abstraction、world tool、3DGS 能力或 UI redesign；
- 不发送真实模型 prompt，不 merge `main`、tag、deploy 或发布 package。

## TDD 顺序

1. **RED**：新增 Node/V8 跨引擎测试，证明旧 codec 拒绝 Bun 合法 projection。
2. **GREEN**：实现最小共享数值语义，使同一 projection 在 Bun 与 V8 均通过。
3. **ADVERSARIAL**：验证超过语义 tolerance、改变 `passed`、identity 或离散 metric 的证据仍被拒绝。
4. **FULL GATE**：`bun test`、`bun run typecheck`、`bun run build`、`git diff --check`、EXharness validation、scripted browser acceptance。
5. **REVIEW**：独立 reviewer 只读检查 diff、跨引擎复现、authority 反例与 frozen product digest；无 P0/P1 才允许 closeout。

## 验收

- 旧实现上的 V8 regression 因 `Evaluation 与受信 evaluator 结果不一致` 明确 RED；
- 修复后同一真实 projection 在 Bun 与 V8 均能通过 `decodeProductSessionProjection`；
- 合法末位 engine rounding 只影响连续数值等价，不改变证据身份和判定；
- 任何足以跨越 contract threshold 或改变实际 metric 语义的漂移仍 fail closed；
- 全量门禁与真实 Chromium 回放通过，且 scripted fixture 不触发 provider cost；
- independent reviewer 给出 `approved` 后，才可 closeout、commit 并 push `agent/codex/DH-010.1`。
