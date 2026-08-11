# DH-007 — `kimi-code/k3` Live Canary Receipt

## Authority

- Human 在 2026-08-10 明确授权此前列明的一次 bounded live canary；
- 唯一 prompt：`创建一个方块，把高度改到 2.8 米，然后让它落到地面并检查结果。`；
- authority 只覆盖一个 Product Session、一个用户 turn、120 秒 absolute deadline、最多 128 次 world tool call，以及该 Agent loop 对本机 OMP AuthStorage 和 Kimi Code 订阅额度的使用；
- 不包含第二个 turn、credential 内容读取/输出、自动 retry/fallback/model switch、commit、push、merge、tag 或 deploy。

## Runtime identity and boundary

- CLI/runtime：`omp/17.2.12`；
- requested model：`kimi-code/k3`；
- model catalog 在调用前实时列出 `kimi-code/k3`；
- production Gateway 以 `DEMIURGES_OMP_MODEL=kimi-code/k3` 启动；SDK 在 prompt 前后执行 exact provider/model identity gate；
- credential 仅由 OMP AuthStorage resolver 使用，receipt 未读取或保存 secret；
- Gateway 监听隔离 loopback port `127.0.0.1:18787`，调用完成后已停止。

## Product receipt

- session create：HTTP `201`，`session:local-1`；
- turn stream：HTTP `200`，`application/x-ndjson; charset=utf-8`；
- elapsed：`27,833 ms`；
- product events：5；terminal 为 `turn.completed`，sequence 5；
- model-facing tool trace：
  1. sequence 2：`world_write` → `succeeded`；
  2. sequence 3：`world_edit` → `succeeded`；
  3. sequence 4：`world_run` → `succeeded`，Evaluation PASS；
- 模型没有调用非必要的 `world_read`；`world_edit` 使用 `world_write` 返回的 ref，因此仍处于 exact four-tool authority 内；
- settled projection：`running=false`、`lastSequence=5`；
- current ref：`world:current → snapshot:edit-1 / v2`，source=`edit`；
- Episode：`episode:14-fall-2.8-check-6-edit-1`，76 samples；
- terminal Snapshot：由该 Episode/Runtime 产生，未 adopt；
- Evaluation：`evaluation:14-fall-2.8-check-6-edit-1:stable-landing-v1:stable-on-floor:cube:0.25:0.015:0.08`，`passed=true`。

## Verdict

`live_canary=passed`

真实模型已通过 Demiurges Product Session 的受限 OMP composition，自主选择 world tools，产生可回放 Episode 与确定性 Evaluation PASS；run 没有推进 authored current ref。该 receipt 只证明本次 bounded canary，不代表公网 deployment、任意任务泛化能力或多模型支持。
