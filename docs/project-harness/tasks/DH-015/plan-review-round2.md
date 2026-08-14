# DH-015 Plan Review — Round 2

## Reviewers

1. `gpt-5.6-sol`，max reasoning，Codex sub-agent：`/root/dh015_plan_review_sol_r2`
2. OMP `deepseek/deepseek-v4-pro`，thinking `max`：session `01a0013f-f1dc-7000-ade4-398bd65e55e6`

两位 reviewer 都只读 current source 且没有读取 Round 1 或对方输出；起点与终点 branch、HEAD、plan 与 Git status 均未漂移。

## Combined decision

- `decision: blocked`
- `may_implement: no`

原因：review request 在调用 `harnessctl review` 前冻结；该命令随后合法更新 `harness-checklist.json` 的 workflow bookkeeping，使 request 中 checklist SHA 与 23-file aggregate 过期。两位 reviewer 均确认其余 22 个 manifest file 一致。该流程错误不构成产品代码 finding，但本轮不能充当 fresh approval。

## Plan findings

- 必须为 ±180° world-Z yaw 增加 total hemisphere rule：`w > 0 || (w === 0 && z >= 0)`，避免 `(z=1,w=0)` / `(z=-1,w=0)` 产生不同 canonical bytes。
- write transition 必须 pin canonical root Snapshot ID，不能只验证同内容的 registered root。
- operation-aware decoder 固定落在 `product-session-codec.ts` 并由 `packages/world/src/index.ts` 显式导出。
- human write route 在 shared `WorldWriteInput` parse 后只接纳 Marble/Hunyuan composite fixture；不把其他 fixture 变成 Scene Composer 入口。
- 增加 pre-authored-world deterministic Agent fixture：只执行 `world_read → world_run`，证明 human-authored v2 能由既有四工具继续推演；保留 empty-session 原四步 fixture，不恢复 direct human run。

## Round 3 procedure correction

1. 先记录本轮 `changes_requested/blocked`、同步 current pointer、生成新的 EXharness review workflow/packet。
2. 修复 packet formatting，完成 validate/doctor/diff-check。
3. 最后冻结 plan、checklist 与 source manifest，生成 Round 3 request。
4. 冻结后不再执行任何会修改 checklist/current/source 的 harness 命令，直到 reviewers 全部结束。
