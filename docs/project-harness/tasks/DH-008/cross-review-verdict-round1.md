# DH-008 Round 1 Cross-review Verdict

## Decision

`changes_requested`

GPT-5.6 Sol Max 与 GPT-5.6 Terra Max 在 frozen product digest `66305bb2b078bb20f9181b63d263f35d0277ba61a20600cae94fada0a6a28281` 上独立复现同一 P1：Product codec 只验证 sample/terminal 对象自身格式，没有把 authored Snapshot、Episode samples、terminal Snapshot 与 representation 闭合为同一 EntityRef 证据链。

可执行反例包括：

- 将首个 sample 的 `entity:cube` 改名为 `entity:spoof` 仍被接纳；
- 将 terminal `entity:cube` 改为 `entity:other` 仍被接纳；
- 将 terminal imported visual 替换为 primitive visual 仍被接纳；
- Studio 对缺失 Episode state 静默回退 authored state，因此时间轴仍推进且 Evaluation 可显示 PASS。

两位 reviewer 均复算 digest before/after 一致，`bun test` 为 96/0/516；另共同发现 harness 生成的 `current/review-packet.md` 尾部空行使当时 `git diff --check` 漂移失败。P0 无。

Kimi Code K3 Max reviewer 通道另行尝试：Claude Code `2.1.212` 以 `opus` 请求标签、max effort、plan/read-only 工具面启动，但本地 CC Switch 在 8 次 retry、93.8 秒内未产生 API token/tool event，最终由 operator 停止；cost 为 0。本次没有可信 current request metadata，因此不把历史 `opus → k3` proxy 映射当作本轮 Kimi review 证据，也不记录 Kimi verdict。

## Remediation

- Product codec 现在要求每个 sample 的 EntityRef 集合精确等于 authored Snapshot；contact refs 必须属于同一集合；
- terminal Snapshot 必须保持同一 EntityRef、label、frame/units、visual/collision representation 与 physics，并与 Episode 最后一帧 state 一致；
- `lastRun.baseRef` 精确绑定 projection current world ref/base Snapshot；streamed `world_run` 使用本 turn 已接纳的 authored world 执行同一校验；
- Studio viewport 与 Inspector 删除 Episode state 缺失时回退 authored state 的路径；
- 新增 spoofed sample、renamed terminal、representation drift、base ref drift 与 streamed forged run regressions；review packet EOF whitespace 已清除。

Remediation gate：98 tests / 0 fail / 522 assertions；typecheck、production build、`git diff --check`、GLB digest 与真实 Chromium imported playback/reset 均通过。新 candidate digest 为 `f20e0fc96472615433778fdc0475cb59a0f9a7b17df1ccbf19af9a7edd268910`，需要 fresh Round 2 independent review；Round 1 verdict 永久保留，不被后续批准覆盖。
