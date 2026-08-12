# DH-011 Round 2 Fresh 独立实现审查请求

你是 fresh independent implementation reviewer，严格只读。不得修改文件、commit/push/merge/reset/clean，不得网络、SSH、deploy、真实 provider prompt 或 credential 读取。

- cwd：`/Users/Admin/projects/WorkTrees/Demiurges-DH-011`
- branch：`agent/codex/DH-011`
- base/HEAD：`06a2c392bbc2a001d1b31b3cde15b2eb3f9f6cca`
- canonical plan：`docs/project-harness/tasks/DH-011/plan.md`
- product manifest：自行运行 `{ git diff --name-only 06a2c392bbc2a001d1b31b3cde15b2eb3f9f6cca -- apps packages; git ls-files --others --exclude-standard -- apps packages; } | LC_ALL=C sort -u`，应为 35 个文件。
- aggregate：按 manifest 顺序逐文件 `shasum -a 256`，对完整输出文本再 `shasum -a 256`，应为 `64b5c47f7a656ab82a1c41dc6fa0b0a77d3ccaaa4f244dd4919cbb8b1f3a387e`。

禁止读取任何 DH-011 `*verdict*`、`*cross-review*`、Round 1 implementation request/reviewer transcript 和 `docs/project-harness/current/review-packet.md` reviewer summary。

## 实现目标

审查 `read/write/edit/run → one entity:arm → explicit actuator-sequence Program → private MuJoCo → action-conditioned Episode → trusted Evaluation → Product/Studio`。不要要求 DH-012/world model、IK、planner、grasp、robot SDK、arbitrary importer、第五工具或 UI redesign。

## Mandatory checks

1. 复算冻结身份并在结束时再复算，确认零漂移。
2. 运行 focused DH-011 tests、`bun test`、`bun run typecheck`、`bun run build`、`git diff --check`、EXharness validate。
3. Host/Gateway 两层 nested array 对 sparse/accessor/extra string key/symbol/non-finite fail closed，不读 getter；仍只有四工具且无 legacy `programId`。
4. Runtime 每 run 创建 fresh private Emscripten `MainModule` + private `MjModel` + fresh `MjData`，不缓存或暴露三者；审计 callback 不可配置的证明是否真正由 private module ownership 闭合，特别寻找可在 run 前污染该 module 的路径。
5. `ARTICULATED_CANONICAL_MODEL_CAUSAL_DIGEST` 必须与 canonical MJCF loaded readback exact 匹配；任一 mass/inertia/damping/option/gain/bias/gear/range/group/mapping/field 漂移在首 sample 前拒绝，boundary/terminal 再验。
6. 每 tick 校验 semantic joint limits，`qfrc_applied/xfrc_applied=0`、`ncon/nefc=0`，terminal 后再验；action clock 仍是 `720 mj_step / 721 mj_forward / 91 samples / 16 settle`，0.5s command 在同时刻 sample 前生效。
7. Product 的 articulated 信任入口必须使用 async trusted verifier，真实重放同一 base/program/inputs 并 exact 比对 Episode；旧 sync decoder 必须对 articulated fail closed，不能形成暗路。
8. 执行反例：zero/forged runtime digest；Program content+id+activeCommands 同步更改但 trajectory 不改；Episode/Evaluation/lineage 同步伪造；qpos/qvel/sensor/terminal/Evaluation 同步伪造。合法 projection 通过，伪造必须 fail closed。
9. Episode/Evaluation/adopt 仍闭合；paired control 0.65→0.55 在 `<0.5s` equivalent、`≥0.5s` 有 `>1e-6` 差异；run 不推进 ref，只有 recorded completed+passed policy 可 adopt。
10. `world_read` articulated semantic 必须包含 root frame、link local pose/visual/collision mapping、joint type/axis/limits/units、actuator mode/range/unit、sensor source/order/unit、frame parent-link 绑定；scripted four-tool flow 的 ref 从 read evidence 取得，不再硬编码所有 joint/actuator refs。
11. Studio 显示结构化 Program kind/steps/command values，且仍由 Episode joints 驱动 link hierarchy；reset/new Session 清空旧状态。
12. DH-001–010.1 回归全绿，无第五工具、第二 parser/schema、fixture-specific codec copy、renderer-to-state fallback 或范围外平台化。

## 输出

中文为主，结构化给出 reviewer identity、commands、frozen identity before/after、P0/P1/P2（文件行号+可执行反例）、Acceptance 1–12、未验证项、`decision=approved|changes_requested|blocked`、`may_closeout=yes|no`。只有 P0=0/P1=0 才能 approved。发现问题不得扩展到 DH-012。
