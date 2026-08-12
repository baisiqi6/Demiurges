# DH-011 Round 3 Fresh 独立实现交叉审查请求

你是 fresh independent implementation reviewer，严格只读。不得修改文件、commit/push/merge/reset/clean，不得网络、SSH、deploy、真实 provider prompt 或 credential 读取。

- cwd：`/Users/Admin/projects/WorkTrees/Demiurges-DH-011`
- branch：`agent/codex/DH-011`
- base/HEAD：`06a2c392bbc2a001d1b31b3cde15b2eb3f9f6cca`
- canonical plan：`docs/project-harness/tasks/DH-011/plan.md`
- product manifest：自行运行 `{ git diff --name-only 06a2c392bbc2a001d1b31b3cde15b2eb3f9f6cca -- apps packages scripts; git ls-files --others --exclude-standard -- apps packages scripts; } | LC_ALL=C sort -u`，必须恰好 36 个文件。
- aggregate：按 manifest 顺序逐文件 `shasum -a 256`，对完整输出文本再 `shasum -a 256`，必须为 `91090b242ff04bd4610dd03fe4ef2f0722a4eb14d25a289b074368e1c27b488b`。

禁止读取任何 DH-011 `*verdict*`、`*cross-review*`、Round 1/2 implementation request/reviewer transcript 和 `docs/project-harness/current/review-packet.md` reviewer summary。若起点 identity 不匹配，立即 `blocked`，不得审查移动目标。

## 实现目标

审查 `read/write/edit/run → one entity:arm → explicit actuator-sequence Program → private MuJoCo → action-conditioned Episode → trusted Evaluation → Product/Studio`。不要要求 DH-012/world model、IK、planner、grasp、robot SDK、arbitrary importer、第五工具或 UI redesign。

## Mandatory checks

1. 起止复算 branch/HEAD/status、36-file manifest 与 aggregate，确认冻结期间零漂移。
2. 运行 focused DH-011 tests、`bun test`、`bun run typecheck`、`bun run build`、`git diff --check`、`.artifacts/harness/harnessctl validate`。
3. Host/Gateway nested plain-data admission 对 sparse/accessor/extra string key/symbol/non-finite fail closed 且不读 getter；仍只有四工具，无 legacy `programId`。
4. Runtime 每 run 创建 fresh private Emscripten `MainModule`、private `MjModel`、fresh `MjData`，不缓存/暴露；审计 callback 与跨 run hidden state 是否由 private ownership 真正闭合。
5. canonical causal identity 必须同时绑定 exact MJCF source 与 compiled-model readback。当前 MuJoCo 3.11 JS binding 对 `actuator_ctrllimited/actuator_forcelimited` 的 `memory_view<bool>` 会抛出 unknown-type，因此这两个 flag 必须由实际送入 compiler 的 exact source digest 锁定，不得伪称 loaded readback；site body/type/pose/size 及其余可读 causal fields 必须由 compiled-model digest 锁定。执行 source 中单独 flag drift、compiled site pose drift、mass/inertia/damping/option/gain/bias/gear/range/group/mapping drift，均应在首 sample 前拒绝。
6. 每 tick 校验 semantic joint limits、`qfrc_applied/xfrc_applied=0`、`ncon/nefc=0`，terminal 后再验；action clock 是 `720 mj_step / 721 mj_forward / 91 samples / 16 settle`，0.5s command 在同 timestamp sample 前生效。
7. 执行两次连续 authority run：第一次 completed+PASS 后 explicit adopt terminal，再次 run 的 sample 0 必须 exact 使用 adopted Snapshot 的 qpos 与非零 qvel，不能 reset 为零；run 本身不得推进 Ref。
8. Product articulated projection 必须由 async trusted verifier 对 independent authored-world authority 做 exact 比对，再从该 authority 重放 base/program/inputs 并 exact 比对 Episode。最终 projection 不能把自己携带的 `world` 当成独立 authority；sync decoder 对 articulated 必须 fail closed。
9. 执行同步 lineage 攻击：同时改写 projection world Snapshot ID/ref、run baseRef/baseSnapshotId、terminal parent（以及必要的 Episode/Evaluation ID）但保持物理内容自洽；以改写前的 independently verified world 作为 expected authority，必须 fail closed。再执行 qpos/qvel/sensor/terminal/Evaluation、Program/activeCommands/trajectory、runtime digest 的同步伪造。
10. 验证 Studio 正常 stream 返回最后一个 verified write/edit world 给 final GET；断流 resync 使用已消费并验证的最新 world，而不是原始或 response 自带 world。正常、失败、断流均 bounded，不能产生未验证 articulated projection。
11. Episode/Evaluation/adopt、paired control、semantic read inventory、scripted four-tool refs、Studio structured Program/link hierarchy/reset 均满足 canonical plan；DH-001–010.1 全绿。
12. bounded fresh scan 只寻找会让 accepted input 产生错误 world/evidence、让 forged evidence 被接受、或破坏四工具/authority 的 P0/P1；不要扩展到 DH-012 或泛化平台设计。

## 输出

中文为主，结构化给出 reviewer identity、commands、frozen identity before/after、P0/P1/P2（文件行号+可执行反例）、Acceptance 1–12、未验证项、`decision=approved|changes_requested|blocked`、`may_closeout=yes|no`。只有 P0=0/P1=0 才能 approved。完成即停止，不得继续扩大扫描。
