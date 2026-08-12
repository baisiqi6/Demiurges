# DH-011 实现证据

## Outcome

- 四个 model-facing 工具仍严格为 `read / write / edit / run`，没有增加机器人专用第五工具；
- 新增一个 authoritative `entity:arm`，link、joint、actuator、sensor 与 frame 使用稳定 Harness refs，不泄漏 MuJoCo ID；
- `edit(change.kind="joint-state")` 只产生 child Snapshot；`run(program.kind="actuator-sequence")` 才产生 action-conditioned Episode 与 terminal Snapshot；
- WorldProgram 使用 canonical JSON + SHA-256 content identity，Episode 保存完整 Program evidence；
- MuJoCo Runtime 用 private model + fresh data 执行 240Hz physics / 30Hz closed samples，canonical 3 秒 run 产生 91 samples；
- reach Evaluation 从 Episode joint state 与受信 FK 重算，run 不推进 current ref，只有 registered completed+PASS evidence 才能 explicit adopt；
- Product codec、restricted OMP、Gateway、Studio timeline 与 Three.js articulated presentation 已接通，旧 rigid / ball-vessel / 3DGS 路径保持。

## Visible acceptance

- 真实 Studio + scripted Gateway 完成 `world_write → world_read → world_edit → world_run`；
- 页面展示两关节机械臂、稳定 refs、WorldProgram、91-frame Episode 与 `PASS`；
- timeline 可从 frame 0 seek 到 frame 90，terminal joints 为 `0.65 / -1.0 rad`，时间为 `3.00s`；
- run 后 current ref 仍为 authored `snapshot:edit-1@v2`，未把 Runtime terminal 偷换为静态 world authority。

## Final gates

- targeted：`45 pass / 0 fail / 158 assertions`；
- full：`172 pass / 0 fail / 2,958 assertions`；
- `bun run typecheck`：通过；
- `bun run build`：通过，仅既有 MuJoCo browser-external / chunk-size warning；
- `git diff --check`：通过；
- EXharness validation：通过，`0 warning`。

## Frozen identity and cross-review

- Branch：`agent/codex/DH-011`；
- Base HEAD：`06a2c392bbc2a001d1b31b3cde15b2eb3f9f6cca`；
- Product manifest：36 files；
- Final aggregate：`440188d28046b661602a7bd129b6b104b3497a9d6fbb781e48c5e02e9026312c`；
- Fresh executable reviewer A：12 条合法路径接受、14 条伪造路径拒绝，`approved / P0=P1=P2=0 / may_closeout=yes`；
- Fresh executable reviewer B：13 条合法路径接受、20 条伪造路径拒绝，`approved / P0=P1=P2=0 / may_closeout=yes`；
- Kimi K3 static-only review 确认 ball-vessel exact fixture binding 位于共享 validator；其无法执行 gates 的限制不计作产品反例；
- 一个误读旧审查文件名的 replacement attempt 主动报告 contamination 并被弃票，未计入批准。

## Round 6 blocker closure

- 最后一个 blocker 是 ball-vessel Snapshot 可同步错标为其他 scenario；
- 根因修复位于 `requireBallVesselSnapshot()`：fixture 精确绑定 `scenario:ball-vessel-free-fall-v1`；
- Repository/Host、streamed `world_write`、完整 authored + Episode + terminal Product projection 均沿同一 registry fail closed；
- 合法 primitive、diagnostic、ball-vessel、articulated 路径不回归。

## Authority boundary

DH-011 已满足 EXharness closeout/mark-done 条件。Human 本轮授权实现与收口，但未授权 commit、push、merge、PR、tag、deploy、真实 provider prompt 或 credential 使用；上述 Git/外部动作继续作为独立 authority gate。
