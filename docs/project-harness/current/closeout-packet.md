# Closeout Packet

## Subject

- Checklist item: `DH-022`
- Reviewer: `dh022-independent-reviewer`
- Updated at: `2026-09-29`
- Canonical plan path: `docs/project-harness/tasks/DH-022/plan.md`

## Item Snapshot

- Title: 区分 Program 与 Pose Edit 的内部候选边界
- Status: doing
- Workflow status: closeout_requested
- Priority: p1
- Owner: codex
- Session: dh022-20260922
- Dependencies: DH-021

## Acceptance

两种候选记录同一来源；pose 候选带 expected Ref 直接走既有 edit admission；过期候选拒绝；两条离线闭环、类型和回归通过。

## Verification

独立 Reviewer APPROVED/P0=P1=P2=0，亲跑 focused 12/0/55、authoring typecheck；Operator 本轮 root typecheck/build 通过；产品 hash 一致；9月22日全量1180/0/9300日志已核对。

## Handoff

独立审查批准，Operator 按 closeout→review-result→mark-done 完成关单；会话已有 Git 授权下衔接发布。

## Review Inputs

- Scope: `docs/project-harness/scope.md`
- Architecture: `docs/project-harness/architecture.md`
- Domain model: `docs/project-harness/domain-model.md`
- Progress: `docs/project-harness/progress.md`
- Review output target: `docs/project-harness/current/review.md`

## Canonical Plan Content

```md
# DH-022：明确 Program 与 Pose Edit 候选边界

## 问题与选择

DH-020 返回 canonical Program，DH-021 返回无 target/expected Ref 的 Pose，调用端需要手工补齐 edit 输入。第二个调用方已经出现；本次只统一内部结果的类型与来源，不抽 strategy registry、executor、插件接口或公共 package export。

## 实现

- 内部 discriminated union：`kind: program` 保留 canonical Program；`kind: pose-edit` 返回既有 `WorldEditPoseWireInput`，绑定推导时 `read.ref`、`entity:ball` 与 pose。
- 共用只读 sourceRef、sourceEpisodeId、sourceEvaluationId、basis；available 候选递归冻结。
- 两个推导函数和现有调用端迁移到该类型，不再保留 Pose 兼容字段。
- Program 调用端继续去掉 id 后显式 run；Pose 调用端直接显式 edit。没有自动执行，run 没有新增 CAS 语义；sourceRef 对 Program 仅是来源信息。
- golden evidence admission、数值策略、DH-019 receipt、Kernel 与四工具 API 保持现状。摘要表示固定样本内容一致，不是来源认证；不宣称支持任意世界。

## 验收

1. 两类候选均记录 sourceRef，推导不修改 Host；已有 FAIL→repair→PASS 通过。
2. ball 候选直接通过 edit admission；世界前进后再次执行原候选得到 stale_ref，不允许偷偷换成最新 Ref。
3. TypeScript exhaustive narrowing 区分 program/edit，错误 payload 被类型检查拒绝；候选及 nested input 冻结。
4. 显式检查包含未公开 authoring helper 的 TypeScript 文件，避免仅靠 app 引用图漏检。
5. focused regressions、全量 tests、root typecheck/build、Harness validation 和 whitespace 检查；准确记录失败，不能用单测重跑冒充全量通过。

## 交付边界

由 Operator 组织实现、独立审查与 closeout。实现者不审批自己的实现；独立 reviewer 提供结论后，Operator 按正式 Harness transition 关闭任务。发布按会话授权处理；职责分离不是要求用户接手流程的停止条件。
```

## Recent Progress Context

```md
# 进展

## 2026-08-09 — DH-000 bootstrap 已关闭

已完成：

- 接受产品身份 `Demiurges`；
- 在 `/Users/Admin/projects/Demiurges` 创建独立本地 Git 仓库；
- 建立 repo-local scope、architecture、domain model、technical foundation 与 geometry roadmap；
- 将 Lyaup 记录为只读技术捐赠者，而非源码母体；
- 定义 falling-cube walking skeleton；
- 创建一个 bootstrap checklist item 与 review packet；
- 将仓库文档统一为中文主体，并在 `AGENTS.md` 固化语言规则。

本地验证：

- EXharness checklist validation 以 0 warning 通过；
- `harness-checklist.json` 可解析，并只包含一个 active bootstrap item；
- `workflow.branch` 与 `artifacts.branch` 一致；
- 所有已登记 artifact path 均存在；
- 3 条本地 event record 均可独立解析为 JSON；
- 当时全部 Markdown 本地链接均可解析；
- `git diff --check` 通过；
- Git status 只包含已授权的 bootstrap 文件。

Independent review：

- Kimi Code `kimi-code/k3` 以 `max` effort 完成只读审查；
- Decision 为 `approved`，P0 与 P1 均为无；
- Operator 复核 reviewer 前后仓库 SHA-256 manifest 完全一致；
- 完整结论见 `tasks/DH-000/review-verdict.md`。

待完成：无。该段只描述 `DH-000` 关闭时的历史状态。

尚未创建 product code、dependency、remote、commit、deployment、Issue 或 PR。

## 2026-08-09 — Spark/3DGS 路线校准

- 第一条 `falling-cube` Runtime MVP 继续明确不接入 Spark/3DGS；
- 3DGS 被定位为带 provenance 与 alignment 的 appearance/observation representation，不定义 Kernel；
- Spark 被定位为 3DGS 的 Presentation 实现；
- 3DGS 验证阶段移动到 imported mesh 之后、articulated robot 之前；
- Product MVP 早期以 `EntityRef`、frame、units、collision proxy 与 MuJoCo state 的可检查 alignment 为验收目标。

## 2026-08-09 — DH-001 Falling Cube 已实现，等待独立审查

已完成：

- 创建 Bun workspace 与 SolidJS/Vite Studio；
- 建立最小 immutable Kernel records 与内存 `WorldRepository`；
- 用真实 `@mujoco/mujoco 3.11.0` 单线程 WASM 从 Snapshot 编译 MJCF 并生成 Episode；
- 生成 TerminalSnapshot 与独立 deterministic EvaluationRecord；
- 建立 Three.js Observation、结构化 inspector、Episode timeline、evaluate 与 explicit adopt；
- 证明 `run` 不推进 current ref，只有 `adopt` 才推进；
- 完成桌面与移动端真实 Chromium acceptance。

验证结果：

- `bun test`：4 pass、0 fail、22 assertions；
- `bun run typecheck`：通过；
- `bun run build`：通过，实际生成约 10.1 MB 的 `mujoco.wasm`；
- 浏览器：76 samples，terminal 高度约 `0.250 m`，高度误差 `0.00007 m`，末速度约 `0 m/s`，Evaluation 为 `PASS`；
- 浏览器：WebGL context 有效，无 page error/alert；桌面与 390px 移动布局均经截图检查。

当前状态：实现者已完成本切片并准备 reviewer packet；`DH-001` 等待 independent reviewer verdict，Coding agent 不自行标记 `done`。

## 当前风险

- MuJoCo WASM 首次加载成本与 Three.js 主 chunk 体积尚未做真实网络性能预算；当前证据只覆盖本地 Product slice 正确性。
- Repository 尚未 persistence，刷新页面会丢失 Snapshot/Episode；这是明确 non-goal，不用补丁伪装持久化。
- Spark/3DGS 仍不进入第一条 Runtime slice；它们在 imported mesh 之后进入 Product MVP 早期 alignment 验证。

## 下一步

先由独立 reviewer 审查 `DH-001`。只有 approved 后，Operator 才能关闭 item；后续实现必须从新的 checklist item 与用户 authority 出发，不能在本切片顺手扩展 Agent、3DGS、机器人或通用 Adapter SDK。

## 2026-08-09 — DH-001 启动重大变更交叉审查

- 用户授权对重大审查同时使用 `gpt-5.6-sol`（`max`）sub-agent 与 Kimi Code K3（`max`）进行交叉审查；
- 两位 reviewer 使用同一只读 authority、fresh session 和结构化 severity/decision contract，但分别侧重领域 authority 与实现 correctness；
- product artifact 审查前 aggregate SHA-256 为 `48d160ccdb1fdf86955d00f99f55069eddcda31fd1f8f82a42b6e8241ba929e9`；审查后必须复核不变；
- 任一 reviewer 提出 P0/P1，或两者在阻断问题上分歧，都不得自动 close；先由 Operator 对照 source 与测试复核。

## 2026-08-09 — DH-001 交叉审查结论为 changes_requested

- Kimi Code K3 Max：`approved`，无 P0/P1；
- GPT-5.6 Sol Max：`changes_requested`，报告 duplicate identity、Snapshot 初态映射、sample grid、Runtime validation/provenance 与 EvaluationRecord immutability P1；
- Operator 逐项独立复现 Sol 的反例，确认不是 reviewer 推测；
- Operator 重跑 `bun test`、typecheck、build 均通过，说明现有 happy-path checks 不足以覆盖这些 invariant；
- 审查后 product aggregate SHA-256 仍为 `48d160ccdb1fdf86955d00f99f55069eddcda31fd1f8f82a42b6e8241ba929e9`；reviewer 未改产品文件；
- `DH-001` 不关闭，进入 `changes_requested`。下一步从底层 invariant 修复并补 regression tests，不以 UI 文案、兼容 flag 或零散 guard 掩盖。

详细结论：`tasks/DH-001/cross-review-verdict.md`。

## 2026-08-09 — DH-001 开始 invariant 修复

- 用户明确授权修复交叉审查确认的 P1；
- 继续使用同一 `DH-001` item 与 canonical plan，不创建第二套任务事实；
- 实现纪律采用 regression-first：先让 duplicate identity、完整初态映射、exact sample grid、invalid Runtime/provenance 与 EvaluationRecord immutability 测试失败，再做最小实现；
- 不在本轮引入 persistence、provider abstraction、3DGS、Agent 或新的安全/权限层。
- Regression RED 已确认：旧实现运行新 tests 为 4 pass、5 fail、1 error；五类 P1 均有独立失败信号，原有 happy path 仍为 4 pass。

## 2026-08-09 — DH-001 invariant 修复完成本地验证

- Repository 不再允许相同 Snapshot ID 覆盖已有 immutable content，避免 ref 在未 adopt 时改变所指世界；
- Snapshot 的 floor rotation、cube rotation、linear velocity 与 world angular velocity 进入真实 MuJoCo；对 MuJoCo free-joint 的 local angular velocity 语义在 Runtime 边界显式转换；
- 240 Hz physics / 30 Hz observation 以 integer step modulo 采样，76 个 sample 对齐 `index / 30`；
- malformed program、伪造 RuntimeProfile、错误 frame/units 与不受支持状态 fail closed；RuntimeEvidence 只由实际 implementation 常量生成；
- EvaluationRecord 递归冻结，ID 同时编码 Episode、evaluator 与完整 success-contract identity；
- `bun test`：9 pass、0 fail、117 assertions；`bun run typecheck` 与 `bun run build` 通过；
- 真实浏览器 acceptance：edit 后 ref 为 `snapshot:edit-1`，run 得到 76 samples、terminal `0.250 m`，evaluate 为 `PASS`；run/evaluate 不推进 ref，explicit adopt 后才变为 `snapshot:terminal-studio-1`；控制台无 error；
- 修复后 product aggregate SHA-256 为 `a992f412f8b1ced1c8182f492c307f8c9f7b2af1a956ebc80f96451abfb496a7`。当前等待 fresh cross-review，Coding agent 不自行关闭 `DH-001`。

## 2026-08-09 — DH-001 第二次交叉审查仍为 changes_requested

- Kimi Code K3 Max：静态审查 `approved`，唯一 P2 是 world/local angular velocity 的 round-trip test 仍可能同错相消；其 plan-mode 无法独立执行 `bun`/hash/browser；
- GPT-5.6 Sol Max：`changes_requested`，并用只读反例复现四类 P1：固定 identity 未覆盖 program/profile 全参数；浅层 freeze 与 mutable ExplicitInputs 允许 await 期间证据漂移；未实现的 static/extra Entity state 被接受后旁路；contact event 与当前 MuJoCo state 晚 `1/240s`；
- Sol 独立运行 `bun test` 为 9 pass、0 fail、117 assertions，说明第一轮回归已修复原五类问题，但尚未覆盖这四类更深 invariant；
- 两位 reviewer 审查前后 product digest 均为 `a992f412f8b1ced1c8182f492c307f8c9f7b2af1a956ebc80f96451abfb496a7`，未修改产品；
- combined decision 按预设规则采用 `changes_requested`。继续同一 Phase 7，从 input identity/immutability、supported-world closure 与 observation timing 四个根因统一修复，不关闭 item。

## 2026-08-09 — DH-001 第二轮 invariant 修复完成本地验证

- 新回归在旧实现上得到 9 pass / 4 fail / 125 assertions，分别复现不完整 identity、浅层 freeze、旁路 Entity state 与 contact 晚 `1/240s`；
- 固定 `WorldProgram` / `RuntimeProfile` 现在完整约束 id、target、duration、sample rate、provider、version、equivalence、timestep 与 gravity；
- Snapshot、Program、Profile 与 ExplicitInputs 必须在 Runtime 第一个 await 前递归冻结，避免 execution 与 evidence 混合两个输入版本；
- falling-cube slice 的 supported-world set 闭合为恰好 `entity:floor + entity:cube`；静态地面必须使用 0 mass 与 0 velocity，额外未演化 Entity fail closed；
- Runtime 每个 `mj_step` 后执行 `mj_forward` 再观察 contact，使 `contact-began` 与当前 state/time 对齐；cleanup 改为 nested finally；
- angular velocity test 新增 sample 1 的独立数值 quaternion oracle，降低 round-trip 同错相消风险；
- 修复后 `bun test`：13 pass、0 fail、130 assertions；typecheck/build 通过；浏览器 edit/run/evaluate/adopt 再次通过，76 samples、PASS、ref 仅在 adopt 后推进，console 0 warning/error；
- 新 product aggregate SHA-256：`8c1a4015990433dc196e2175f79a8700d351ab6e0ead60e2091d1cddffe14d21`。等待 fresh cross-review，不自行关闭 item。

## 2026-08-09 — DH-001 第三次交叉审查为 changes_requested

- Kimi Code K3 Max fresh static review：`approved`，无 P0/P1；其首个本轮 session 因 transient repo write 越过 authority 被中止，Operator 复核无残留、digest 不变后，以禁用 Bash/Edit/Write 的新 session 重做；
- GPT-5.6 Sol Max：`changes_requested`，独立运行 13/0 tests 后复现 shallow-frozen Repository mutation、orphan lineage adopt、sparse Vec3 → NaN completed evidence、同 runId/不同 base 的派生 identity collision；
- 审查前后 product digest 均为 `8c1a4015990433dc196e2175f79a8700d351ab6e0ead60e2091d1cddffe14d21`；
- combined decision 采用 `changes_requested`。下一轮只修 admission invariant：递归冻结即使 root 已 frozen 也遍历 children；Repository parent 必须可解析；Vec3 显式检查 0/1/2 槽；Episode/Terminal identity 绑定 base Snapshot。

## 2026-08-09 — DH-001 第三轮 invariant 修复完成本地验证

- 新回归旧实现：13 pass / 4 fail / 134 assertions；四类 Sol 反例均有独立 RED；
- 修复后 `bun test`：17 pass、0 fail、140 assertions；typecheck/build 通过；
- `deepFreeze` 在 frozen root 上仍递归 children，并以 WeakSet 避免 cycle 重入；Repository current ref 不再可能因 shallow child 外部 mutation 改变；
- Repository 只接纳 parent 已登记的 Snapshot，orphan terminal 无法 record/adopt；
- Vec3/halfExtents 校验显式访问三个槽位，sparse array 不再绕过；Evaluator 对非 finite terminal evidence fail closed；
- Episode/Terminal/Evaluation identity 绑定 run 与 base Snapshot，不同 base 复用 runId 不再碰撞；
- 浏览器第三次完成 edit/run/evaluate/adopt：76 samples、PASS，ref 从 `snapshot:edit-1` 仅在 adopt 后变为 `snapshot:terminal-studio-1--edit-1`，console 0 warning/error；
- product digest：`52c26a6d7e3de7533a6b8307da52172b75c8be476ef23334662c1a52589c3fe1`。等待 final fresh cross-review，不自行关单。

## 2026-08-09 — DH-001 Final cross-review 仍为 changes_requested

- Kimi K3 Max static review：`approved`，无 P0/P1；
- GPT-5.6 Sol Max：`changes_requested`，复现 length-ambiguous derived ID、accessor-backed frozen Vec3 await mutation、null-parent runtime terminal、derived Evaluation metric overflow；
- Sol 独立运行 tests 为 17 pass / 0 fail / 140 assertions，digest before/after 均为 `52c26a6d7e3de7533a6b8307da52172b75c8be476ef23334662c1a52589c3fe1`；
- 继续最小修复：使用 length-prefixed identity；deep immutable 同时要求 plain own-data property；source-parent 关系一致；输出与派生 metric 均 finite。

## 2026-08-09 — DH-001 第四轮 invariant 修复完成本地验证

- RED：17 pass / 4 fail / 144 assertions；GREEN：21 pass / 0 fail / 146 assertions；
- length-prefixed execution key 消除 run/base segment 编码碰撞；
- immutable record 现在要求 frozen plain own-data graph，accessor-backed Array 在第一个 await 前被拒绝；
- runtime-terminal 必须具有 parent；Repository 不能采纳 null-parent terminal；
- MuJoCo observation 与 Evaluation 派生 metrics 均对 non-finite fail closed；
- typecheck/build 通过；Chromium 76 samples、PASS、ref 只在 adopt 后推进、console 0 warning/error；
- product digest：`528cbf328e469ec1f5b54cbc64aaefeeae46ab0a56ad5bbdbcdbaea0ef7784dc`。等待 approval gate。

## 2026-08-09 — DH-001 Approval gate 为 changes_requested

- Sol 独立确认 accessor Vec3、ambiguous segments、null-parent terminal、MAX_VALUE metric 四类反例已关闭，`bun test` 21/0/146；
- 新复现两项 P1：`write(runtime-terminal)` 可绕过 adopt；accessor Success Contract 可令 Evaluation ID 与 predicate 使用不同 tolerance；
- digest before/after 均为 `528cbf328e469ec1f5b54cbc64aaefeeae46ab0a56ad5bbdbcdbaea0ef7784dc`；
- 继续只收紧现有入口：write/record/adopt 按 source 分工；Evaluator 只消费 plain immutable Episode/Contract。

## 2026-08-09 — DH-001 Operation admission 修复完成

- RED：21 pass / 2 fail / 148 assertions；GREEN：23 pass / 0 fail / 153 assertions；
- `write` 只接纳 `source: write` root，`record` 与 `adopt` 只接纳 `runtime-terminal`，terminal 无法绕过 adopt 推进 ref；
- Evaluator 在读取任何 metric/contract 字段前要求 Episode 与 SuccessContract 都是递归冻结的 plain data record；
- typecheck/build 与 Chromium edit/run/evaluate/adopt 通过；76 samples、PASS、ref 仅 adopt 后推进，console 0 warning/error；
- product digest：`b05bcf70cd8e368cf573329cb733c72a3565241a2f172f2d7aaa03a951e0dec8`。等待聚焦 closure review。

## 2026-08-09 — DH-001 Focused closure review approved

- GPT-5.6 Sol Max 独立 verdict：`approved`，P0/P1/P2 均无；
- reviewer 独立运行 `bun test`：23 pass / 0 fail / 153 assertions；
- operation probe 证明 write/record/adopt 按 source 分工，只有 explicit adopt 推进 terminal ref；
- accessor SuccessContract probe 在读取任何 getter 前被 plain-data gate 拒绝，`reads=0`；
- reviewer digest before/after 均为 `b05bcf70cd8e368cf573329cb733c72a3565241a2f172f2d7aaa03a951e0dec8`，未修改产品；
- 实现者 typecheck/build/browser acceptance 继续有效。`DH-001` 已满足 reviewer gate，但 Coding agent 不自行 `mark-done`，等待 Operator 关单决定。

## 2026-08-09 — DH-002 Episode Player 已实现，等待独立审查

- Human/Operator 授权进入下一切片后，依据 `DH-001` 已存在的 focused approval 正式关闭 `DH-001`，并新建、激活 `DH-002`；
- Runtime 继续离线生成不可变 Episode；新增 `EpisodePlayer` 只在 Presentation 层以 `requestAnimationFrame` 将 wall time 映射到 `EpisodeSample.timeSeconds`；
- 新 Episode 默认从 sample 0 自动回放，支持播放/暂停、重播、前后逐帧、timeline seek 与 `0.5x / 1x / 2x`；reduced-motion 下不自动播放；
- 播放器只选择真实 sample，不插值、不修改 Episode，不调用 Repository；Repository view 失活时 clock 停止，explicit adopt 不会被残余 tick 抢回；
- regression-first 证据从缺少 clock module 的 RED，进入 26 tests / 166 assertions 全绿；typecheck/build 通过；
- 真实浏览器证明自动推进、暂停稳定、逐帧、倍速续播、seek、Evaluation PASS、run/evaluate 不推进 ref，以及播放中 adopt 后稳定进入 terminal authority；
- 当前 product aggregate SHA-256 为 `945b0a827397b44f4570f01891891a4269805b0d6bca8e9fe4d5ebe49e402f36`，准备 independent read-only review。

## 2026-08-09 — DH-002 Independent review approved

- fresh reviewer 未发现 P0/P1/P2，确认播放器只回传 sample index，Repository ref 仍只由 explicit adopt 推进；
- reviewer 确认 `active=false` 会 cancel rAF、清除 playing identity，旧 tick 也因 ID mismatch fail closed；pause、seek、rate change 统一停止并重锚，terminal 不再请求下一帧；
- reviewer 独立运行 `bun test`：26 pass / 0 fail / 166 assertions；
- reviewer digest before/after 均为 `945b0a827397b44f4570f01891891a4269805b0d6bca8e9fe4d5ebe49e402f36`；
- 最终 decision 为 `approved`。Coding agent 不自行 `mark-done`，等待 Operator 关闭 `DH-002`。

## 2026-08-09 — DH-002 获得 release authority

- 用户明确授权 commit、发布与 `mark-done`；
- 当前 Git `main` 尚无首个 commit，remote 与 deployment target 均不存在，根 package 为 `private`；
- 本轮 release boundary 为：Operator close → 首个本地 commit → annotated tag → `/Users/Admin/projects/my release/Demiurges/` 下的 committed source/build/checksum/receipt；
- 不创建未授权 remote，不伪称 GitHub、npm 或公网 deployment。

## 2026-08-09 — DH-002 Operator close 完成

- release gate：`bun test` 26 pass / 0 fail / 166 assertions，typecheck/build 通过，checklist validation 0 warning；
- Operator 运行 `mark-done`，事件为 `evt-20260810T023458Z-706fa171`；`DH-002` 已为 `done/closed`，lease 已释放；
- Git release locator 为 `release/dh-002-episode-player`；本地正式发布 locator 为 `/Users/Admin/projects/my release/Demiurges/dh-002-episode-player/`；
- 最终 commit SHA 与 artifact checksum 由 Git tag和外部 release receipt 自描述，repo 内不维护自引用 SHA。
- staged whitespace cleanup 仅删除 `episode-player-clock.ts` 末尾多余空行；release product digest 为 `899f2bba2090a6cffa839d8b33111eccca1b96f956b9a941deec10b8caa230f4`，targeted clock tests 为 3/0/13，gitleaks staged scan 无泄漏。

## 2026-08-09 — GitHub repository 建立并发布首个 release

- 用户明确授权：若 GitHub repository 尚不存在则使用 `gh` 创建，并要求以后在获得 commit authority 后同步 push；
- 已在 active `gh` account `baisiqi6` 下创建 private repository `https://github.com/baisiqi6/Demiurges`，配置为 canonical `origin`；
- `main` 已推送至 `526c5cf83901f68caad19e3ee911ef3740c1a2ad`；annotated tag `release/dh-002-episode-player` 的 remote dereferenced target 同为该 commit；
- 后续 commit + push 纪律已写入 `AGENTS.md` 与 `runbook.md`；该持续规则只规定已授权 commit 的交付方式，不扩大 commit、push 或 release authority；
- GitHub source publication 不代表 deployment；当前仍无 deployment target。

## 2026-08-09 — DH-003 World Ref 与安全 Adopt 实现完成，等待独立审查

- 新 item `DH-003` 已在独立 branch/worktree `agent/codex/DH-003` / `/Users/Admin/projects/WorkTrees/Demiurges-DH-003` 激活；
- 基线为 26 tests / 166 assertions；新增 authority test 在旧实现上因缺少 Host AdoptPolicy contract 明确进入 RED；
- Repository ref 现在是递归冻结的 `{ name, snapshotId, version }`，root write 初始化 v1，成功 advance/adopt 各自只递增一次；
- authored edit 只记录 child，explicit advance 才推进；Runtime Episode、Evaluation、record 与 Playback 均不推进 ref；
- AdoptPolicy 由 Host composition 显式注入；adopt 只接受已登记 Episode、同一 Episode 的已登记通过 Evaluation、匹配 evaluator/contract/policy、runtime terminal 与 fresh `expectedCurrent + expectedRefVersion`；
- stale CAS、相同 Snapshot 但旧 version、失败 Evaluation、错配 Episode/evaluator/contract/policy、未登记 evidence 与 terminal-only bypass 均有 executable regression；
- GREEN 为 32 tests / 0 fail / 200 assertions，typecheck/build 通过；build 仅保留既有 MuJoCo browser-external notice 与大 chunk warning；
- 真实浏览器证明 `v1 → edit/advance v2 → run/playback/evaluate 仍为 v2 → PASS adopt v3`，Evaluate 前 Adopt disabled，成功后再次 disabled；
- 当前 product source aggregate SHA-256 为 `2cd5edf7cdebaccd74851baa5cd65281f9d8f99bedb0397354626a3a0f174a7d`。下一步是 independent read-only review；Coding agent 不自行批准或关单。

## 2026-08-09 — DH-003 Round 1 审查缺口已从 Host 边界修复

- `gpt-5.6-sol/max` 在 digest `2cd5edf...` 上给出 `changes_requested`，并以可执行 probes 证明两个 P1：同名不同参数的 SuccessContract 可绕过 policy；伪造 frozen Episode/Evaluation 可把 height 99、`NaN` terminal 提升为 current；
- 新增回归先因缺少 `RuntimeMvpHost` 明确进入 RED（0 pass / 1 fail / 1 error）；
- 修复没有增加零散 provenance 字段：新增最小 `RuntimeMvpHost` effect boundary，私有持有 evidence capability，并只组合固定 MuJoCo Runtime、Program/Profile、Landing evaluator 与 canonical SuccessContract；
- Studio 只调用 `runCurrent`、`evaluateEpisode` 与 `adopt`，不再能提交任意 Episode/Evaluation；外部 capability 在任何 terminal Snapshot 入库前 fail closed；
- 修复后 34 tests / 0 fail / 210 assertions，typecheck/build 与 `git diff --check` 通过；build 仍只有既有 MuJoCo browser-external notice 与大 chunk warning；
- 真实浏览器复验仍为 `v1 → edit/advance v2 → run/evaluate 保持 v2 → PASS adopt v3`，Evaluate 前 disabled、Adopt 后再次 disabled；
- 修复后 product source digest 为 `d9ca6da0c6f1fd459ca786ae3d2d3545b84a12d3793ec6b75f94608f2c87411e`，进入 fresh cross-review。

## 2026-08-09 — DH-003 evidence authority 收束为 lexical closure

- Round 2 Kimi/K3 对 digest `d9ca6da...` 给出 approved；Sol/max 随后在同一 digest 上复现更强反例：在 Host 构造前替换导出的 `WorldRepository.prototype.recordEpisode`，可从 existing Host 截获 symbol capability 并 Adopt forged height 99 / `NaN` terminal；
- 实现者把该 executable probe 视为 changes requested；新增 regression 先证明旧 module 仍导出可拦截 class（expected false / received true）；
- 修复没有增加 token 隐藏层：Repository implementation 改为 module-private `WorldRepositoryState`，factory 只返回冻结 facade 与 evidence-writer lexical closures；`RuntimeMvpHost` 私有持有该 authority，admission 不再通过动态方法参数传递 symbol；
- 独立创建的另一 authority 只能影响它自己的 Repository，无法登记到 existing Host；
- 修复后 35 tests / 0 fail / 213 assertions，typecheck/build/diff-check 通过；真实浏览器第三次复验仍为 v1→explicit advance v2→run/evaluate 保持 v2→PASS adopt v3；
- product source digest 为 `495a6c95299e19bd3e714e381f2cb2b472a12b0aec45e7a8b647077fd96feec2`，等待 final fresh cross-review。

## 2026-08-09 — DH-003 Final cross-review approved

- Kimi/K3 与 GPT-5.6 Sol Max route 分别执行 fresh read-only review；两者都独立运行 35 tests / 0 fail / 213 assertions 与聚焦 `bun -e` probes；
- 两份 verdict 均为 `approved`，P0/P1/P2 none；digest before/after 都是 `495a6c95299e19bd3e714e381f2cb2b472a12b0aec45e7a8b647077fd96feec2`，工作树 status 前后不变；
- Final review 明确确认：Repository implementation 不导出；Host 私有持有 lexical repository/evidence closures；没有 symbol/token dynamic dispatch；foreign factory 只能影响自己的世界；forged evidence 与 alternate contract 无法进入 existing Host；
- `DH-003` 满足关单条件，进入 Operator close 与已授权 commit + push gate。

## 2026-08-09 — DH-003 Operator close 完成

- Closeout packet 经 final cross-review approval；`mark-done` 事件为 `evt-20260810T044915Z-946886aa`；
- `DH-003` 已为 `done/closed`，lease 于 `2026-08-10T04:49:15Z` 释放；checklist validation 0 warning；
- 发布边界为 commit + push `agent/codex/DH-003` 并回查 remote SHA；不 merge `main`，不伪称 deployment。

## 2026-08-09 — DH-003 已集成，DH-004 World Tool Surface 已实现

- Human 授权把已审查的 `agent/codex/DH-003` fast-forward merge 到 `main` 并 push；local `main`、`origin/main` 与 GitHub remote ref 均为 `15744fb3aeae2f995765047d657aef9821f653cb`；
- 新建 `agent/codex/DH-004` 与 `/Users/Admin/projects/WorkTrees/Demiurges-DH-004`，登记并激活 `DH-004`；
- 增加直接组合 `RuntimeMvpHost` 的 `WorldToolSurface`，model-facing prototype 恰好为 `read`、`write`、`edit`、`run`；
- `run` 返回同一 Host 产生的 Episode、deterministic Evaluation 与 base ref，但不推进 current；`adopt` 不进入模型工具面，只由持有同一 Host 的 Harness control boundary 执行；
- JSON round-trip input 会按 exact plain-data fields 复制、校验、冻结；accessor、错误 prototype、额外字段、非法 number/ID/ref version fail closed；
- scripted operator 证明四个工具可以完成 write → read → edit → run/evidence，随后 control side 才能显式 adopt；
- 当前验证为 39 tests / 0 fail / 245 assertions，typecheck、build、`git diff --check` 通过。下一步生成 review packet 并接受 independent read-only review；Coding agent 不自行审批或关单。

## 2026-08-09 — DH-004 Round 1 P1 已从 Repository transaction 修复

- Kimi Code K3 Max Round 1 给出 `changes_requested`：stale model edit 先插入 authored child、后 CAS 拒绝，导致 orphan Snapshot partial side effect；Sol reviewer 因 worktree 随后变化被标记 superseded，没有在混合 digest 上给 verdict；
- Operator 独立运行反例，确认 `stale_ref` 同时存在 `snapshot:edit-2` orphan；
- 修复从底层 authority transaction 出发：Repository 的同步 `editCurrentCubeHeight` 先检查 expected ref，fresh 时才创建 child 并推进；tool surface 不增加 guard、mode 或第五个工具；
- 回归现在证明 stale edit 后 current 不变且 orphan 不存在；修复后 39 tests / 0 fail / 246 assertions，typecheck、build、diff-check 通过；
- 当前 product source digest 为 `1d95045e02f39c676b2f362535a1846cd7b25747d6ab9f98b2e2545a7ed3076d`，下一步只在该 digest 上执行 fresh cross-review。

## 2026-08-09 — DH-004 Round 2 P1 已从 Host method-table invariant 修复

- Kimi Code K3 Max 在 digest `1d95045e...` 上 fresh approved；GPT-5.6 Sol Max 随后以 executable probe 证明可替换 `RuntimeMvpHost.prototype.readRefRecord`，从 tool dynamic dispatch 的 `this` 捕获 existing Host 并调用 `adopt`；combined verdict 为 `changes_requested`；
- Operator 独立复现 `captured === host`、adopt `updated`、ref v1 → v2，确认不是 reviewer 推测；
- 修复不增加 facade/registry/provider abstraction，而是在模块初始化时冻结作为 authority boundary 的 `RuntimeMvpHost.prototype`；
- regression 证明 `defineProperty`/assignment replacement 被拒绝、tool read 正常且 existing Host 未泄露；Round 1 atomic edit regression 同时保持；
- 当前 40 tests / 0 fail / 250 assertions，typecheck、build、diff-check 通过；product source digest 为 `9575362e701a6c980898ce448c6847522941c9cb102eaae28cedd0af7c4896db`，等待 final fresh cross-review。

## 2026-08-09 — DH-004 Final fresh cross-review approved

- Kimi Code K3 Max 与 GPT-5.6 Sol Max 在同一 product digest `9575362e701a6c980898ce448c6847522941c9cb102eaae28cedd0af7c4896db` 上完成 fresh/focused read-only review；
- 两份 verdict 均为 `approved`，P0/P1/P2 none；review 前后 digest 与 Git scope 不变；
- reviewer 独立验证 Host prototype 的 assignment/`defineProperty` interception 均被阻止，既有 capture probe 不再成立；
- Round 1 stale edit atomicity、四工具形状、run ref 不变、control-side adopt、JSON admission/output freeze 均保持；
- reviewer 独立运行 40 tests / 0 fail / 250 assertions。DH-004 已满足 reviewer gate，进入 Operator close 与已授权 commit + push；不 merge `main`。

## 2026-08-09 — DH-004 Operator close 完成

- Closeout request 事件：`evt-20260810T063932Z-9baaf80a`；final cross-review approval 事件：`evt-20260810T063932Z-5e55cf4c`；
- Operator `mark-done` 事件：`evt-20260810T063932Z-b294cfaf`；DH-004 已为 `done/closed`，lease 于 `2026-08-10T06:39:32Z` 释放；
- checklist validation 为 0 warning；最终 verification 绑定 40/0/250、typecheck/build/diff-check、完整 product digest 与双 reviewer approval；
- 当前发布边界为 commit + push `agent/codex/DH-004` 并回查 remote SHA；不 merge `main`，不代表 deployment。

## 2026-08-10 — DH-005 OMP Agent Runtime vertical slice 已实现

- Human 确认把所需能力内置到 Demiurges，但边界是不复制或 fork OMP 源码；OMP 作为锁定版本的可替换 Agent Runtime，Demiurges 保留 World Kernel 与 control authority；
- 新建 `agent/codex/DH-005` 与 `/Users/Admin/projects/WorkTrees/Demiurges-DH-005`，登记并激活 `DH-005`；
- 新增本地 Bun Agent Gateway，固定 `@oh-my-pi/pi-coding-agent@17.2.12`，只注册 `world_read`、`world_write`、`world_edit`、`world_run` 四个 host-owned tools；
- Round 1 executable cross-review 发现原 CLI/RPC composition 仍继承 ambient MCP，并处理 slash command 与 `@file` mention；combined verdict 为 `changes_requested`，原 digest `6bb22b193648b6f3d36d9176809409f10415d2f54d102fbd23393882da30f0d3` 未获批准；
- 修复没有继续叠加 CLI flags，而是从 composition 根部改为 OMP SDK restricted session：关闭 MCP、built-ins、extension discovery、skills/rules、IRC、LSP 与持久 session；任何 prompt 前核验 active/enabled 四工具与空 mounted surface；
- Gateway admission 拒绝 slash/control 与 `@file` preprocessing syntax；失败 turn 通过 `OmpAgentTurnError` 保留 frozen bounded trace，cleanup failure 不覆盖 primary failure；
- fake Agent walking skeleton 从自然语言请求出发，按 write → read → edit → run 完成 falling-cube task，Evaluation 为 PASS，run 后 ref 保持 authored version 2；Gateway boundary tests 当前为 6 pass / 0 fail / 32 assertions；
- 真实 OMP SDK boot smoke 在未发送 prompt、未发起 provider model call 的情况下成功：从 package manifest 读取 runtime `17.2.12`，effective tool surface 恰好为四工具，读取 state 后干净退出；
- Studio 尚未连接 Agent Gateway，真实 provider/model prompt 也未获授权、未执行。下一步是全量验证与 independent review，不自行 `mark-done`、commit 或 push。
- 修复后 full gate 已通过：46 tests / 0 fail / 282 assertions；Gateway + Studio typecheck、Gateway bundle + Studio Vite build、no-prompt SDK smoke、`git diff --check` 与 checklist validation 均通过；新 product source digest 为 `72675cebc90d57d45e33f1bb4c40199a6929b3609e79c0d098e1f65805237ff7`。现在对该冻结 snapshot 发起 fresh independent cross-review；在双审批准前不 `mark-done`、commit 或 push。
- Round 2 Kimi static review 为 `approved`，但 Sol executable review 发现 admission 晚于 SDK start、trace 仍无整体预算，combined verdict 再次为 `changes_requested`；
- 最终修复把 prompt admission 提到 client factory/start 前，并对 tool input、trace data 与单 turn tool-call count 建立明确预算；oversized input 与 129-call regression 证明 failure evidence 有界且超限 turn 失败；
- 新 full gate 为 47 tests / 0 fail / 291 assertions，typecheck/build/no-prompt SDK smoke/diff-check/checklist validation 通过；final candidate product digest 为 `fdbf25f25d81ff7028a56d3a71d5687ceace624ecdec9189b4341e6e3ce1b23a`，等待 final fresh cross-review。
- Round 3 Kimi static review 为 `approved`，Sol executable review 继续发现 descriptor admission 与 trace key budget 两个 P1，combined verdict 为 `changes_requested`；
- 最终修复使用 `Reflect.ownKeys + descriptor`，拒绝 hidden/symbol/accessor/array/`__proto__` input；trace key bounded 后写入 null-prototype projection，budget 整个 turn 共享；getter reads 与 surface calls 均为 0，1 MiB key trace 保持小于 8 KiB；
- 最新 full gate 为 48 tests / 0 fail / 304 assertions，typecheck/build/no-prompt SDK smoke/diff-check/checklist validation 通过；final candidate digest 为 `1b3b6496f1f27fe7bd89f0db105f60745e027108922507eb3301f7f1ca594dae`。
- Round 4 final cross-review 已双审批准：GPT-5.6 Sol Max executable review 与 Kimi Code K3 Max static review 均为 `approved`，P0/P1/P2 全无；允许进入 EXharness closeout 与 operator `mark-done`，但不包含真实 provider prompt、merge main、tag 或 deploy authority。

## 2026-08-10 — DH-006 本地 Agent—Studio 闭环已规划

- Human 确认下一条 vertical slice 是把已验证的 Agent Runtime 接成 Studio 可观察的本地产品闭环；
- `DH-006` 采用 Gateway-owned Product Session 单一事实面：connected Studio 只提交输入并呈现权威 `Snapshot`、`Episode` 与 `EvaluationRecord`，不维护第二个可写 Host；
- 当前 Gateway 对 `apps/studio/src` 的反向复用将在出现第二个真实调用方后提升为最小内部 world module，不用 transport patch 固化错误 ownership；
- 首个传输选择 bounded HTTP streaming NDJSON 加只读 resync，不提前引入 WebSocket 或通用 event bus；
- 首先使用 scripted/fake Agent 完成 `write → read → edit → run`，真实 provider/model prompt、credential 与费用仍需单独授权；
- 已创建独立 `agent/codex/DH-006` branch/worktree 与 canonical plan，随后获得 Human implementation authority 并完成 ASSIGN/ACCEPT 激活；当前 authority 仍不包含真实 provider prompt、commit、push、merge、tag 或 deploy。

## 2026-08-10 — DH-006 本地 Agent—Studio 闭环已实现，等待独立审查

- 在 Studio 与 Gateway 成为两个真实调用方后，把既有 Kernel、Repository、MuJoCo Runtime、Evaluation、Host 与 world tools 提取为内部 workspace package `@demiurges/world`；Gateway 不再反向 import `apps/studio/src`，Presentation 与 OMP 均未进入共享 package；
- 新增 Gateway-owned `ProductSession`：每个 session 私有持有唯一 `RuntimeMvpHost`，scripted Agent 按 `world_write → world_read → world_edit → world_run` 执行；`world_run` 返回 Episode、TerminalSnapshot 与 Evaluation，但 current ref 保持 authored edit version 2；
- 新增 product-owned `ProductSessionEvent`/`ProductSessionProjection` contract；OMP observer 在 Gateway 内转换为产品证据，OMP message/event shape 不穿透 transport；
- 新增本地 HTTP API：`POST /api/sessions`、只读 `GET /api/sessions/:id` resync，以及 bounded ordered `POST /api/sessions/:id/turns` NDJSON stream；未知 session、非法 route、oversized/非法输入 fail closed，未暴露 Agent-facing adopt route；
- Studio 删除 connected path 的本地 Host，改用 `ProductSessionClient`；自然语言输入、四工具 trace、3D Observation、EpisodePlayer 与 PASS/FAIL 全部由 Gateway authoritative evidence 驱动；
- TDD 增加 import boundary、single authority、Product Session、真实 Bun HTTP、NDJSON arbitrary-chunk parser 与 connected Studio source boundary tests；当前 full gate 为 56 tests / 0 fail / 340 assertions，`bun run typecheck`、`bun run build`、`git diff --check` 与 checklist validation 均通过；
- 真实 Chromium 验收通过：首个 session 从空世界提交任务后显示四工具 trace，Episode timeline 从约 frame 8/75 继续推进到 frame 75/75，而非终态闪现；Evaluation 为 PASS，current ref 始终是 `snapshot:edit-1` version 2，terminal Snapshot identity 与 current ref 不同；新建第二个 session 后全部呈现状态清空，再次执行同样通过，浏览器无 warning/error；
- 未发送真实 OMP/provider prompt，未读取 credential、未产生模型费用。现进入 Phase 4 independent cross-review；批准前不 `mark-done`、commit 或 push。
- Round 1 Kimi Code K3 Max static review 与 GPT-5.6 Sol Max executable review 均为 `changes_requested`。两者共同确认并发 HTTP admission TOCTOU 会让竞争失败请求返回空 `200 NDJSON`；Sol 另以真实 probes 复现空流误判成功、断流不 resync、DTO/lifecycle admission 过浅、chunked UTF-8 byte/content-type bound 绕过，以及 synthetic internal/credential-like error 泄露；
- Round 1 product digest 在 executable review 前后均为 `20ed24ff354f9ac178d8aef2560f959f44ef12bc984dcfc64f20503af28c755a`，56/0/340 与既有 gates 仍绿，但这些 green tests 未覆盖 transport adversarial boundary。Combined verdict 阻断 closeout，下一步从原子 reservation、严格 product admission、failure resync、真实 byte/media-type limit 与 public error code 五个根部修复，不 commit/push。
- Round 1 remediation 已从 transport contract 根部完成：`ProductSession.tryRunTurn` 在构造 200 stream 前同步原子取得 turn authority；HTTP request 逐 chunk 统计 UTF-8 bytes、精确匹配 `application/json`；`@demiurges/world` 新增 product codec，深验 event lifecycle、session/turn identity、trace sequence、tool/evidence association 与 Snapshot/Ref/Episode/Evaluation DTO；
- Studio 对空流、缺 terminal、断流、parse、fetch/abort error 都执行只读 resync，并通过 frozen `ProductSessionTurnError.projection` 覆盖 partial cache；Gateway failure trace/event 只暴露 `world_tool_failed`/`agent_turn_failed`，不转发 OMP、Host、path、credential-like internal message；import boundary regression 扩展为扫描全部非测试 source；
- 新 adversarial tests 直接覆盖并发慢 body、chunked 18KB UTF-8 body、`application/jsonp`、synthetic secret/internal error、空 200、partial stream disconnect、cross-turn identity、负 trace sequence、tool/evidence mismatch、2.5MB malformed projection 与伪装 response media type；full gate 为 62 tests / 0 fail / 375 assertions，typecheck/build/diff/check/checklist 全绿；
- 真实 Chromium Round 1 fix acceptance：session 1 首 turn 在约 120ms 显示 frame 7/75，最终 frame 75/75、PASS、current ref `snapshot:edit-1` v2；同 session 第二 turn 只显示 `agent_turn_failed` 与 failed `world_write`，经 resync 保留原权威 ref/Episode/Evaluation，DOM 与 console 无 internal 泄露；新建 session 2 后再次得到四工具、75-frame、PASS，console 无 warning/error。新 digest 为 `af5167ef946d4190127e5bf70d2ad290dbb50377bbc549f0197bbf42b87a02db`，等待 fresh focused cross-review；批准前不 close/commit/push。
- Round 2 combined verdict 为 `changes_requested`：Kimi K3 Max 静态 review 为 approved，但明确发现 runId producer 与 256 字符 codec identity budget 不一致；Sol Max 以 executable probes 证明合法长 identity 已被错误拒绝，并复现断流后一次 resync 可永久卡在 `running:true`、stale_ref ref/snapshot 漂移、sparse/accessor codec 绕过和 failed trace input 泄露；
- 由于可执行 P1 优先于静态 approved，本轮不关单、不提交。修复方向是 bounded settled resync、descriptor-safe plain-data projection、producer-aligned identity budget 与 failed trace input redaction；完成 RED regressions、full gates 和 Chromium 复验后再进行 Round 3 fresh cross-review。
- Round 2 remediation 从 contract 根部完成：Studio 在失败后 bounded follow-up resync 到 `running:false`，预算耗尽则清空 partial authority；codec 在任何语义读取前以 own descriptors 复制全新 plain-data graph，拒绝 sparse/accessor/non-enumerable/symbol/超预算输入，getter regression 保持 0 reads；
- 删除错误的 256 字符派生 identity 上界，合法 300 字符 runId 已通过真实 MuJoCo run、产生长 Episode/Evaluation identity 并被 projection codec 接纳；整体 2M char、100k node、64 depth 与 collection budget 继续 fail closed；
- `world_edit` 对 updated/stale_ref 都绑定 ref/snapshot 且 Agent 只允许 advance；failed product trace input 固定为 `[redacted]`；单 turn 最多接受 start + 128 tool events + terminal；
- 最新 full gate 为 68 tests / 0 fail / 395 assertions，typecheck/build/diff-check/checklist validation 通过。真实 Chromium 为 frame 7/75 → 75/75、PASS、ref v2；失败 turn 只显示 public code 并保留 resync evidence，DOM/console 无 internal marker；fresh session 再次成功。新 digest `b476912e93c8417e00e79c930597c6aa2a8711c2e3aa4e2a847f3f530cb5bff8` 进入 Round 3 fresh cross-review，批准前不 close/commit/push。
- Round 3 combined verdict 为 `changes_requested`：Kimi K3 Max static approved；Sol Max executable review 证明 attempt count 不约束悬挂 resync GET，并用当前 OMP producer 复现 failed tool 经模型纠正后合法 completed/PASS 被 Studio 误拒；
- 修复方向不是隐藏 failed tool，而是让 terminal event 成为 turn outcome authority，并用单一 wall-clock deadline 覆盖每个 resync GET。透明 Proxy traps 记录为 JSON wire 不可达的 P2，不引入 Node-only 复杂度。
- Round 3 remediation 已完成：`#readSettledSession` 的单一 wall-clock deadline 覆盖首个与后续 GET，每次真实 fetch 带 AbortSignal，Promise deadline 同时覆盖忽略 signal 的 port；30ms 悬挂 GET regression 在 100ms 外部 guard 前稳定拒绝；
- Studio 不再从历史 tool statuses 推导 turn outcome；failed tool 保持可见和脱敏，当前 OMP client 可纠正后继续四工具并以 `turn.completed`、Evaluation PASS 收口。130-event 正边界与 131-event 拒绝均有测试；
- 最新 gate 为 71 tests / 0 fail / 403 assertions，typecheck/build/diff/check/checklist 通过。Chromium 为 frame 9/75 → 75/75、PASS/ref-v2；失败 turn 显示 public code并保留 resync evidence，DOM 无 internal marker、console 为空。Final digest `f1d58ab9a72c88edb53a5ca56a1eedb3a94727198da3360628349c0ece7f4a64` 进入 Round 4 final review，批准前不 close/commit/push。
- Round 4 final cross-review 已双审批准：GPT-5.6 Sol Max executable review 与 Kimi Code K3 Max static review 均为 `approved`，无 P0/P1；Sol 独立复现悬挂 resync 的 wall-clock 拒绝、当前 OMP failure→correction→completed/PASS、130/131 event 边界与全部快速回归；
- Kimi 记录两项非阻断 P2：成功路径的最终 projection GET/turn POST timeout 纵深，以及 exact 512-char runId 正例尚未单独落测。Final product digest 保持 `f1d58ab9a72c88edb53a5ca56a1eedb3a94727198da3360628349c0ece7f4a64`；DH-006 已满足 reviewer gate，可生成 closeout packet，但 commit/push/merge/tag/deploy 与真实 provider prompt 仍未授权。

## 2026-08-10 — DH-006 Operator close 完成

- Human 明确授权 `mark-done`、commit、push，并授权把已批准分支合并到 `main`；
- Operator `mark-done` 事件为 `evt-20260810T153512Z-08901f39`；DH-006 已为 `done/closed`，lease 于 `2026-08-10T15:35:12Z` 释放；
- 发布候选仍绑定 product digest `f1d58ab9a72c88edb53a5ca56a1eedb3a94727198da3360628349c0ece7f4a64`、71/0/403、typecheck/build/diff/check/checklist、Chromium acceptance 与 Round 4 双审批准；
- Git 发布边界为先 push `agent/codex/DH-006` 并回查 remote SHA，再以 fast-forward 方式推进 `main` 并再次回查；不创建 tag，不代表 deployment，也不授权真实 provider prompt。

## 2026-08-10 — DH-007 离线实现与最终交叉审查通过

- production Gateway 已切换到显式 `DEMIURGES_OMP_MODEL=provider/model` 的 restricted OMP composition；scripted Agent 仅保留为显式 test/browser fixture；
- provider/model/credential session affinity、ambient/intrinsic fallback、ancillary inference、统一 deadline/cancellation 与 turn-owned tool capability 均经过五轮 adversarial review；
- Round 5 Sol Max 与 Terra Max 在 frozen product digest `4b157dbb4c04946ce0a238aa9fbd71df1380ea37c07ac7d4ac5ff34a2023935b` 上独立批准，P0/P1/P2 均无；full gate 为 87 tests / 0 fail / 459 assertions；
- 当前只证明 offline product composition 已准备好。下一 gate 是 Human 对唯一 provider/model、credential source、调用/时间/费用边界明确授权的一次真实 canary；未授权前不调用、不 closeout、不 commit/push。

## 2026-08-10 — DH-007 首次真实模型闭环成立

- Human 单独授权后，production Gateway 以 `kimi-code/k3` 和 OMP `17.2.12` 执行唯一一次 bounded canary；credential 仅经 OMP AuthStorage 使用，未读取或写入证据；
- 自然语言任务在 27,833 ms 内自主完成 `world_write → world_edit → world_run`，产生 76-sample Episode 与确定性 Evaluation PASS；current ref 保持 authored `snapshot:edit-1 / v2`，terminal Snapshot 未被 Agent adopt；
- 该结果首次证明 Demiurges 的真实模型路径不是 scripted fixture：模型只通过四工具改变/推演世界，产品仍以 Snapshot/Episode/Evaluation 为 authority；
- Gateway 已停止，没有第二个 turn。DH-007 的产品验收已满足，但 closeout、mark-done、commit、push、merge、tag 与 deploy 仍是独立 authority gate。

## 2026-08-10 — DH-007 Operator close 完成

- Human 在看到 Round 5 双审、完整本地 gates 与真实 canary receipt 后明确授权 closeout、mark-done、commit 和 push；
- closeout `evt-20260811T014025Z-f9f64fb3`、Human final acceptance `evt-20260811T014025Z-7d048edc`、CLOSE `evt-20260811T014025Z-ee79bfc5` 已顺序落盘，未使用 force override；
- `DH-007` 已为 `done/closed`，lease 已释放，checklist validation 为 0 warning；下一动作仅为发布 `agent/codex/DH-007` branch，不隐含 merge `main`、PR、tag 或 deploy。

## 2026-08-10 — DH-007 集成完成，DH-008 Imported Rigid Entity 已规划

- 修正 `architecture.md` 与 `runbook.md` 中“仍只有 scripted Agent / live canary 未执行”的过时事实，product digest 保持 `4b157dbb4c04946ce0a238aa9fbd71df1380ea37c07ac7d4ac5ff34a2023935b`；
- docs correction commit `ac293318c8a6b2fe7433146df7417cc3c83e2726` 已 push，随后 `main` 从 `a570064a7292821166fd65f074577a22b0390c14` fast-forward 到同一 SHA；GitHub `main` 与 `agent/codex/DH-007` refs 已回查一致；
- 从新 `main` 创建 `agent/codex/DH-008` 与 `/Users/Admin/projects/WorkTrees/Demiurges-DH-008`；canonical plan 将下一切片限定为一个 repo-owned imported GLB rigid fixture、独立 box collision proxy，以及跨 EntityRef/Frame/Units/Three.js/MuJoCo/Episode/Evaluation 的可检查 alignment；
- `DH-008` ASSIGN `evt-20260811T015218Z-debb1144`、ACCEPT `evt-20260811T015218Z-acc5ffed` 已落盘，checklist validation 0 warning。当前只授权规划，不开始产品实现、资产下载、真实模型调用或 Git 发布。

## 2026-08-10 — DH-008 Imported Rigid Entity 已实现，等待独立审查

- Kernel 已分离 imported visual mesh 与 box collision proxy；repo-owned asymmetric GLB 以固定 digest/provenance/frame/units/alignment 登记，MuJoCo 只消费 collision evidence，Three.js 以稳定 `EntityRef` 完成加载、选择、Episode playback 与 session reset；
- scripted Product Session 仍经 `read/write/edit/run` 四工具完成 imported wedge 推演，76-sample Episode 与 collision-derived Evaluation PASS；URL/path/file input 与 identity/alignment drift fail closed；
- 当前门禁为 96 tests / 0 fail / 516 assertions，typecheck/build/diff-check 与真实 Chromium acceptance 通过。未调用真实 provider，未 commit/push；进入 frozen-digest independent review gate。

## 2026-08-10 — DH-008 Round 1 reviewer blocker 已根部修复

- Sol/Terra executable cross-review 共同复现 Product codec 未绑定 authored Snapshot、Episode samples、terminal EntityRef/representation 的 P1；Kimi reviewer 通道因 CC Switch 无 token/tool event 连接失败而停止，未伪造 verdict；
- remediation 建立 exact EntityRef set、immutable representation/physics/frame/units、terminal-last-sample、base-ref 与 streamed-turn authored-world 证据闭环，并删除 Studio 缺帧回退；
- 修复后为 98 tests / 0 fail / 522 assertions，typecheck/build/diff-check/GLB digest/Chromium 通过；新 digest `f20e0fc96472615433778fdc0475cb59a0f9a7b17df1ccbf19af9a7edd268910`，进入 fresh Round 2 review。

## 2026-08-10 — DH-008 Round 2 terminal identity blocker 已修复

- Sol 批准原证据链 remediation；Terra 发现 terminal Snapshot ID 可与 base ID 相同的 lineage P1，combined verdict 继续阻断；
- codec 已拒绝 terminal/base identity 冲突，Studio episode source label 同步 fail-accurate；98 tests / 0 fail / 523 assertions 与 typecheck/build/diff-check 通过，新 digest `7879c0cf637ea64092daebc4c51fe4cb32422cfc160b52b9e11268dd39aec5f7` 等待 final focused review。

## 2026-08-10 — DH-008 final cross-review approved

- Round 3 Sol/Terra 在 digest `7879c0cf637ea64092daebc4c51fe4cb32422cfc160b52b9e11268dd39aec5f7` 上双审批准，P0/P1/P2 均无；
- final Chromium 复验 imported asset、逐帧 Episode、PASS 与 reset 清理；DH-008 已进入 Human closeout gate，未 commit/push/真实 prompt。

## 2026-08-10 — DH-008 Operator close 完成

- Human 授权后完成 closeout packet、fresh closeout approval 与正常 `mark-done`，未使用 force override；
- CLOSE event `evt-20260811T050106Z-c2088c45`，DH-008 为 `done/closed` 且 lease 已释放；
- 下一动作仅为提交并 push `agent/codex/DH-008`，不隐含 merge `main`、PR、tag、deploy 或真实 provider prompt。

## 2026-08-10 — DH-008 集成完成，DH-009 3DGS / Spark 切片已规划

- `main` 已从 `ac293318c8a6b2fe7433146df7417cc3c83e2726` fast-forward 到 `fdbbf680122c06810f58da37d9973d4f0aa2c984` 并推送，远端 `main` SHA 已回查一致；
- 从新 `main` 创建 `agent/codex/DH-009` 与 `/Users/Admin/projects/WorkTrees/Demiurges-DH-009`；
- canonical plan 把 3DGS 明确为同一 imported rigid Entity 的独立 `observation` representation：GLB visual、box collision proxy、MuJoCo state 与 Episode authority 保持不变，Spark 只在 Presentation 层消费经过 digest/frame/units/alignment 校验的 repo-owned bytes；
- 计划选择一个确定性生成的小型 PLY diagnostic fixture、单一 SparkRenderer、`mesh / 3dgs / overlay` Studio-local mode，以及来自真实 loaded bounds 与 Episode pose 的结构化 AlignmentEvidence；不建立通用 Artifact SDK、远程资产通道或第五个 world tool；
- 只读 dependency gate 确认候选 `@sparkjsdev/spark@2.1.0` 为 MIT、要求 `three >=0.180.0`，当前 `three 0.185.1` 满足。精确 dependency 只在实现阶段按 plan 锁定；
- 当前 Human authority 要求计划完成后再进入实现，但不包含 `DH-009` commit/push、真实 provider prompt、PR、merge、tag 或 deploy。

## 2026-08-10 — DH-009 3DGS Observation / Spark Presentation 已实现

- 同一 imported rigid Entity 现在同时持有 GLB visual、repo-owned 3DGS observation 与 box collision proxy；observation 不能绑定 primitive，Product codec、Runtime admission 与跨 Episode evidence closure 均 fail closed；
- Spark 在现有 Three.js scene 内呈现经过 digest 验证的 2,048-splat PLY，Studio 提供 GLB/3DGS/overlay 与 measured AlignmentEvidence；MuJoCo trajectory/Evaluation 不消费 3DGS；四工具 surface 未扩张；
- 最终 operator gate 为 102 tests / 0 fail / 2,615 assertions，typecheck/build/diff-check、deterministic asset、harness validation 与真实 Chromium playback/reset 通过；Spark disposal race 已从根部关闭；
- 下一步是冻结 product digest 并进行 fresh independent cross-review。批准前不 closeout/mark-done，Human 未授权前不 commit/push。

## 2026-08-10 — DH-009 product candidate frozen for Round 1 review

- 最终 product digest 为 `e9d9b1eb1a51f04342cc3aff4ab7211714e705021a910117ccd6d75bb54a5053`；digest 排除 harness/review 文档，纳入所有 tracked diff 与 untracked product bytes；
- final Chromium 重新验证 resize、GLB/3DGS/overlay、frame 12/75、alignment PASS、Evaluation PASS、reset 清空与第二 Session 重载；无 page error、非 favicon console/HTTP error，server log 只剩 Spark 的 `THREE.Clock` upstream warning；
- 现进入两个 fresh reviewer 互相隔离的 Round 1 gate，未 closeout/mark-done/commit/push。

## 2026-08-10 — DH-009 Round 1 cross-review blocked

- Sol/Terra 对 digest `e9d9b1eb1a51f04342cc3aff4ab7211714e705021a910117ccd6d75bb54a5053` 均给出 `changes_requested`；
- blockers 为 quaternion/bounds 可产生虚假 alignment PASS、observation 可绑定错误 EntityRef、Splat initialized rejection 资源泄漏；另有 stale error dataset P2；
- Round 1 历史已保留，进入根部 remediation 与新 digest gate，不 closeout/commit/push。

## 2026-08-10 — DH-009 Round 1 remediation frozen for Round 2

- codec/Runtime 已把 observation 锁到 `entity:cube`，并拒绝非单位 Entity pose；alignment 独立拒绝非法 pose、reversed/sparse/non-finite bounds 与 observation transform；
- Splat reject/stale 路径现在先释放实例，observation dataset 在 loading/error/reset 成组清理；
- remediation gate 为 102/0/2,626，typecheck/build/diff/artifact/harness/Chromium 通过；新 digest `03550f8693a990a20f5a4555c11635831dbf6c1653400590596a2fa3f328939b` 进入 fresh Round 2，仍未 closeout/commit/push。

## 2026-08-10 — DH-009 Round 2 combined alias blocked

- Terra approved，Sol `changes_requested`：同时交换 Ref 与 representations 可让 observation 位于名义 `entity:cube`、实际 static floor record；
- Product decoder 正与唯一 Runtime role contract 对齐，验证精确 floor/cube、static/dynamic、mass/velocity/friction 与 positive geometry，并加入 JSON round-trip 组合反例；
- Round 1/2 verdict 永久保留，未 closeout/commit/push。

## 2026-08-10 — DH-009 fixed-role final candidate

- Product decoder 已与 falling-cube Runtime role contract 对齐，组合 Ref/representation/state/event alias regression fail closed；
- final gate 102/0/2,627、typecheck/build/diff/harness/Chromium 通过；digest `79b9050ee69ea8c6869fb51521aa9b128da40d070b6ad27b0e27249fe2aebec5` 进入 Round 3 final cross-review；
- 仍未 closeout/mark-done/commit/push。

## 2026-08-10 — DH-009 Round 3 final cross-review approved

- Sol/Terra 在 final digest `79b9050ee69ea8c6869fb51521aa9b128da40d070b6ad27b0e27249fe2aebec5` 上双审批准，P0/P1/P2 无；
- fixed-role identity、Round 1 alignment/lifecycle、四工具、artifact、Runtime/Episode/Evaluation authority 全部闭合；
- item 进入 Human closeout gate，未 closeout/mark-done/commit/push。

## 2026-08-10 — DH-009 closeout authorized

- Human 已授权 closeout、mark-done、commit 与 push feature branch；不授权 merge `main`、PR、tag、deploy 或真实 prompt；
- closeout 继续绑定 final digest `79b9050ee69ea8c6869fb51521aa9b128da40d070b6ad27b0e27249fe2aebec5` 与 Round 3 双审证据。

## 2026-08-10 — DH-009 closeout audit approved

- fresh closeout auditor 批准当前 packet，P0/P1/P2 无；digest 前后一致，diff/checklist 通过；
- 正常 mark-done gate 已满足，不使用 force。

## 2026-08-10 — DH-009 Operator close completed

- closeout review `evt-20260811T064924Z-c2d5a8f6`、CLOSE `evt-20260811T064924Z-55360c81` 已顺序落盘；
- item 为 `done/closed`，lease 已释放，未使用 force；
- 发布只包含 commit/push feature branch，不包含 main merge、PR、tag、deploy 或真实 prompt。

## 2026-08-11 — DH-009 集成完成，DH-010 曲面容器切片已规划

- `main` 已从 `fdbbf680122c06810f58da37d9973d4f0aa2c984` fast-forward 到 `22e288690937834135584d023e4140e26696f761` 并推送，远端 `main` SHA 已回查一致；
- 从新 `main` 创建 `agent/codex/DH-010` 与 `/Users/Admin/projects/WorkTrees/Demiurges-DH-010`；
- canonical plan 选择“ball into vessel”作为第二个真实世界任务：一个 smooth curved vessel visual、一个保留开放腔体的 compound collision proxy、一个 dynamic sphere 与 stable-inside-vessel Evaluation；
- 计划明确 vessel 仍是单一 Entity，多个 collision parts / MuJoCo geoms 不获得 EntityRef；visual、collision、physics、semantic frame 与 Evaluation 保持独立 authority；
- 第二个任务已证明 `cubeHeight`、固定 `entity:cube`、single-box collision 与 landing-only metrics 是 walking-skeleton 偶然细节，因此计划允许一次恰好覆盖两个真实任务的最小根部泛化，但不建立通用 CAD、Adapter SDK、plugin system、机器人或 world-model provider；
- 当前只完成设计与验收计划，等待 Human/Architect 确认后再进入实现；未改产品 source、未安装 dependency、未调用真实 provider，也未授权 commit/push 当前 feature branch。

## 2026-08-11 — DH-010 canonical plan 经四轮交叉审查批准

- Round 1/2/3 的 P1 依次推动计划补齐 continuous support/penetration、wall-sensitive physical control、compound part ownership、task-local transform、AdoptPolicy closure、唯一 model-facing JSON contract、Gateway pre-admission parity、`world:current` 与 quaternion `1e-9` authority；历史 verdict 均 append-only 保留；
- Round 4 在 frozen plan digest `2738b3135434507dd5b53aea74bb87e45af21912fa72789a7b1096ca33ffa21a` 与 context aggregate `c52a8ddb38ee15692a828fce9fd3dacb9e9710915691f8822612286ce7769e0d` 上完成 fresh Sol Max + Kimi K3 Max 交叉审查；两路均 `approved`，P0/P1 为 0；
- approved plan 冻结三个 fixture、两个 Program、nested object pose、30Hz/0.5s/16-sample/16-of-16 support、pair-attributed penetration、16-wall compound、semantic rim carrier、Runtime-direct closed proxy、closed AdoptPolicy registry 与 Phase 1–4 headless gate；
- 当前批准只表示 plan 可成为 implementation authority。`DH-010` 继续为 `todo/planned`，未改产品 source、未安装 dependency、未调用 provider，也未授权 commit/push/PR/merge/tag/deploy；下一步等待 Human 明确授权进入 Phase 1 Contract RED。

## 2026-08-11 — DH-010 Phase 1 Contract RED 已冻结

- Human 授权后激活 `DH-010` lease，并严格停在已批准 plan 的 Phase 1：冻结唯一 `WORLD_TOOL_CONTRACT`、三 fixture、两 Program、nested world-frame pose 与 input budget；
- 新增 executable RED 覆盖真实 Gateway/OMP/Host parity、legacy shape 删除、scenario mismatch/floor penetration、floor/vessel/ball carrier、sphere/compound/semantic rim、multi-entity Episode/contact、0.5s/16-sample containment、closed proxy、closed AdoptPolicy registry 与 Product codec closure；
- targeted 为 16 pass / 16 expected fail / 105 assertions；全量为 102 existing regression pass + 1 new contract-parser pass / 16 expected RED fail / 2,649 assertions。`bun run typecheck`、`bun run build` 与 `git diff --check` 通过；
- 证据见 `docs/project-harness/tasks/DH-010/phase1-red-evidence.md`。当前未进入 GREEN/geometry/Studio，未调用真实 provider，未 commit/push/PR/merge/tag/deploy，也未 close/mark-done。

## 2026-08-11 — DH-010 Phase 2 Artifact / Representation 已完成

- deterministic profile-of-revolution generator 连续两次产生 byte-identical `smooth-vessel-v1.glb`：26,256 bytes，SHA-256 `856788138ecc53d407827a0e67aa9977237dd914809316f8af992e8ee098cd92`；
- Kernel 增加 closed sphere、compound collision 与 vessel semantic carrier；canonical Snapshot 精确包含 floor/vessel/ball，vessel 的 base + 16 walls 仍只属于同一个 `EntityRef`；
- Repository admission 与 artifact registry 已拒绝 digest/bounds/provenance、part alias、sparse/accessor/non-finite pose、quaternion、semantic frame/envelope drift；local-to-world transform probe 覆盖 translated + yaw off-axis composition；
- targeted 21/0/2,197，全量 110 pass / 14 expected RED fail / 2,705；typecheck/build/diff-check 通过。14 个 RED 继续保留给 Phase 3/4，Presentation 对尚未实现的 sphere/compound visible path 明确 fail closed；
- 证据见 `docs/project-harness/tasks/DH-010/phase2-artifact-evidence.md`。未进入 Runtime/Evaluation/visible slice，未调用真实 provider，未 commit/push/PR/merge/tag/deploy，也未 close/mark-done。

## 2026-08-11 — DH-010 Phase 3 Authoring / MuJoCo Runtime 已完成

- 唯一 `WORLD_TOOL_CONTRACT` 已成为 Surface、Host 与 OMP 的共同输入权威：三个 fixture、nested Entity pose 与两个 explicit Program 均可达，legacy model-facing `cubeHeight`/run-only shape 已删除；
- MuJoCo Runtime 现在闭合支持 falling-rigid 与 ball-vessel 两个 scenario；vessel 单一 Entity 编译为 exact base + 16 wall geoms，dynamic sphere 产生 91-sample multi-entity Episode；
- 内部 geom-owner map 将 contact 折叠为只含 EntityRef、unit world normal 与 finite penetration 的 public evidence；wall-sensitive trajectory 真实观测到水平 vessel contact，closed lid 只可从 Runtime-direct seam 运行且不能进入 Repository；
- full gate 为 122 pass / 6 expected Phase 4 RED fail / 2,751 assertions；typecheck/build/diff-check/artifact digest 通过。6 个 RED 精确保留给 containment Evaluation、closed AdoptPolicy registry 与 ball-vessel Product codec；
- 证据见 `docs/project-harness/tasks/DH-010/phase3-runtime-evidence.md`。未进入 Phase 4/5，未调用真实 provider，未 commit/push/PR/merge/tag/deploy，也未 close/mark-done。

## 2026-08-11 — DH-010 Phase 4 Headless Gate 已完成

- stable-inside-vessel evaluator 已按 exact 0.5s/16-sample/30Hz tail、16/16 world-up semantic support、inner-floor distance、speed 与 pair-attributed penetration 生成 closed EvaluationRecord；hovering、bounce-apex、sidewall/transient、timestamp drift、penetration、malformed contact 与 completed closed proxy 均失败；
- Host 现在持有 falling-rigid / ball-vessel 两-entry frozen AdoptPolicy registry；Repository 不接纳 caller single policy，并将 Program、evaluator、contract、passed、terminal 与 Ref evidence 一起闭合；
- Product codec 接受 exact floor/vessel/ball carrier 与 91-sample semantic contacts，同时拒绝 part/geom 泄漏、wrong pair、sample grid drift 和 Program/Evaluation alias；
- full headless gate 为 130 pass / 0 fail / 2,778 assertions，typecheck/build/diff-check 与 deterministic GLB digest 通过；公共 evaluator 已从首个 scenario 的 `evaluateLanding` 机械收敛为 task-neutral `evaluateEpisode`，不保留双入口；Phase 1–4 product digest 为 `c893c0641d075f9080b1e977a582c0eb5ee5270fcb7129ccf3cb739680b42374`；
- 证据见 `docs/project-harness/tasks/DH-010/phase4-headless-evidence.md`。DH-010 继续 `doing/running`；Phase 5 Studio visible slice 尚未开始，未 commit/push/PR/merge/tag/deploy/closeout/mark-done。

## 2026-08-11 — DH-010 Phase 5 Visible Product Slice 已完成

- Studio 现在从受信 Snapshot/WorldRunResult 解析默认 Entity selection、Program/Profile、artifact 与 landing/containment metrics；App 不再硬编码 cube/landing/diagnostic fixture；
- smooth vessel、sphere、box/compound overlay 与 semantic rim-center frame 已进入同一个 Three.js viewport，所有 visual/collision/helper node 都解析回唯一 EntityRef；ball-vessel 无 3DGS 时明确 disabled，diagnostic wedge 的 GLB + Spark 3DGS 路径保持；
- 真实 Chromium 首次揭示 Bun/JavaScriptCore 与 Chromium/V8 对 runtime trig wall pose 的末位差异；fixture registry 已改为 16 个固定 plain-data pose，不放宽 codec equality，并补跨引擎 source 与 JSON round-trip regressions；
- Chromium 已通过 ball/vessel selection、91-frame playback、17-part overlay、rim frame、structured containment metrics、second Session、受控 late GLB release、diagnostic 3DGS alignment 与 820×700 resize；无 alert；
- full gate 为 139 pass / 0 fail / 2,826 assertions；typecheck/build/diff/artifact 通过；Phase 1–5 product digest `5e944de6896b697d30e4c58a1580bb7babae12fe41edf2d3c27dda3ebdb0a750`；
- 证据见 `docs/project-harness/tasks/DH-010/phase5-visible-evidence.md`。DH-010 继续 `doing/running`；等待 Human 授权 Phase 6 independent review，未 commit/push/PR/merge/tag/deploy/closeout/mark-done。

## 2026-08-11 — DH-010 Phase 6 Independent Cross-review 要求修改

- operator 在 frozen Phase 1–5 product digest `5e944de6896b697d30e4c58a1580bb7babae12fe41edf2d3c27dda3ebdb0a750` 上重跑 `139/0/2,826`、typecheck、build、diff 与 checklist，全部通过；
- fresh `GPT-5.6 Sol Max` 独立复算 digest/gates 后发现 4 个可执行 P1：Product codec 接受伪造 Evaluation、canonical friction/Ref drift；Host/Repository 接受 duplicate EntityRef；Studio asset registry 可被永久污染；operator 原样复现全部反例；
- CC Switch fresh reviewer 请求 `claude-opus-4-8 / effort max`，current-session proxy 证据确认实际 `model=k3`。其静态审查未发现产品 P0/P1，但因 `plan` 权限拒绝独立运行必要 gates，结论同样为 `changes_requested / may_closeout=no`；
- combined verdict 为 `P0=0, P1=4, P2=2, changes_requested, may_closeout=no`。证据见 `docs/project-harness/tasks/DH-010/phase6-cross-review-evidence.md`；
- `DH-010` 保持 `doing`，workflow 已进入 `changes_requested`。等待 Human 授权 bounded P1 remediation；未 commit/push/PR/merge/tag/deploy/closeout/mark-done。

## 2026-08-11 — DH-010 Phase 6 P1 remediation 完成

- Human 授权后，将四个 reviewer counterexample 先固化为 RED：伪造 Evaluation、canonical friction/Ref drift、duplicate EntityRef 与 mutable Presentation registry；修复前 targeted 为 `14 pass / 4 fail`；
- Snapshot admission 现在保证 EntityRef 全局唯一；Product codec 只接受 `world:current`、canonical fixture physics，并通过受信 contract/evaluator 重算整条 Evaluation；Presentation asset registry 递归冻结；
- codec 的 null-prototype 安全投影与 evaluator plain-data admission 已闭合，仍拒绝 accessor/class instance；没有增加 scenario patch、兼容入口或 renderer fallback；
- remediation gate 为 `142 pass / 0 fail / 2,834 assertions`，typecheck/build/diff-check 通过；generator/GLB digest 未漂移；新 product digest 为 `8687ad0dea2c675d8d04a61ebcacf4649bc41989d33d6163a3b5680619cacc6e`；
- 证据见 `docs/project-harness/tasks/DH-010/phase6-remediation-evidence.md`。历史 `changes_requested` 保留，等待 Human 另行授权 fresh independent re-review；未 commit/push/PR/merge/tag/deploy/closeout/mark-done。

## 2026-08-11 — DH-010 remediation fresh cross-review 仍要求修改

- Sol Max 与 CC Switch Kimi K3 Max 在 product digest `8687ad0dea2c675d8d04a61ebcacf4649bc41989d33d6163a3b5680619cacc6e` 上独立完成四类 mandatory probe 与 full gates；原四个 P1 均确认已修复；
- Kimi 批准并记录孤立 `world_read.ref.version` 未绑定 P2；Sol 发现新的 executable P1：registered floor/ball representation 仍可在 authored + terminal carrier 中同步漂移并携带原 PASS Evaluation；
- operator 原样复现 ball-vessel floor visual/collision `halfExtents=[30,30,0.5]` 仍被 codec 接受，Evaluation 仍为 PASS；product/status digest 前后未漂移；
- combined verdict 为 `P0=0, P1=1, P2=1, changes_requested, may_closeout=no`。证据见 `docs/project-harness/tasks/DH-010/phase6-remediation-cross-review-evidence.md`；
- DH-010 保持 `doing/running`，等待 Human 另行授权 bounded canonical representation remediation；未 commit/push/PR/merge/tag/deploy/closeout/mark-done。

## 2026-08-11 — DH-010 canonical representation P1 remediation 完成

- Human 授权后，先将 ball-vessel floor extent、ball visual color 与 falling-rigid floor extent 三种 authored + terminal 同步漂移固化为 RED；修复前为 `7 pass / 3 fail / 31 assertions`；
- Product codec 直接复用 canonical fixture Entity 闭合已登记 representation，没有新增第二套 geometry constant 或 scenario patch；dynamic `state/pose` 演进保持合法，diagnostic imported cube 继续由既有 exact artifact/collision/3DGS validator 闭合；
- targeted 为 `34 pass / 0 fail / 2,213 assertions`；full gate 为 `145 pass / 0 fail / 2,837 assertions`，typecheck/build/diff-check 通过，generator/GLB digest 未漂移；
- 新 product digest 为 `88a5d1e787df9cc5b73ae5fb117bc079c64665f5976e4b8795b5b22d2e863150`；证据见 `docs/project-harness/tasks/DH-010/phase6-representation-remediation-evidence.md`；
- 历史 `changes_requested` 保留，等待 Human 另行授权 fresh independent re-review；本轮未处理孤立 `world_read.ref.version` P2，未 commit/push/PR/merge/tag/deploy/closeout/mark-done。

## 2026-08-11 — DH-010 canonical representation remediation fresh cross-review 仍要求修改

- 有效 Sol Max Round 2 与 CC Switch Kimi K3 Max Round 3 在 frozen product digest `88a5d1e787df9cc5b73ae5fb117bc079c64665f5976e4b8795b5b22d2e863150` 上完成 full gates 与 executable probes；`145/0/2,837`、typecheck/build/diff/checklist/artifact 全通过；
- Sol 发现合法多轮 `run → 下一 turn edit-only` 会推进 current world 却保留旧 `lastRun`，最终 projection 因 base Ref 不一致而无法被 Studio codec 解码；operator 原样复现；
- Kimi 发现本轮 exact representation closure 只存在于 Product codec：Repository/Runtime 仍可写入 floor extent / ball color 漂移的 registered Snapshot，Evaluation PASS 后成功 adopt canonical Ref；operator 原样复现；
- Kimi 请求 `claude-opus-4-8 / max`，current-session provider/proxy 证据确认实际 `model=k3`、`status_code=200`；两次因 permission/isolation 失效的 attempt 被明确丢弃，不计入 verdict；
- combined verdict 为 `P0=1, P1=1, changes_requested, may_closeout=no`；证据见 `docs/project-harness/tasks/DH-010/phase6-representation-remediation-cross-review-evidence.md`；
- DH-010 保持 `doing/running`，等待 Human 另行授权 bounded root-authority + stale-lastRun remediation；未修改产品代码，未 commit/push/PR/merge/tag/deploy/closeout/mark-done。

## 2026-08-11 — DH-010 root authority / stale `lastRun` remediation 完成

- Human 授权后，先把 Repository/Runtime 接纳 registered representation 漂移与多轮 `run → edit-only` 保留 stale `lastRun` 固化为 RED；修复前定向为 `38 pass / 4 fail / 266 assertions`；
- 新增唯一 repo-owned `requireRegisteredSnapshotIdentity`，由 Repository、Runtime 与 Product codec 共同消费；registered static representation/physics 在世界 authority 根部 fail closed，动态 state/pose 与 diagnostic optional Observation 仍保持合法；
- ProductSession 在成功 `world_write/world_edit` 后失效旧 `lastRun`，`world_read` 保留 evidence，`world_run` 产生新 evidence，静态快照不再与旧动态历程自相矛盾；
- 最终 full gate 为 `149 pass / 0 fail / 2,849 assertions`；typecheck/build/diff-check/EXharness 通过，generator 与 vessel GLB digest 未漂移；新 product digest 为 `8be5fadc4393a69b70ffeaef602368e9d9fa4cf8e91a1cf0ab482d918c06b9a8`；
- 证据见 `docs/project-harness/tasks/DH-010/phase6-root-authority-remediation-evidence.md`。历史 `changes_requested` 保留，等待 Human 另行授权 fresh independent re-review；未 commit/push/PR/merge/tag/deploy/closeout/mark-done。

## 2026-08-11 — DH-010 root authority remediation fresh review 仍要求修改

- Sol Max 在 frozen product digest `8be5fadc4393a69b70ffeaef602368e9d9fa4cf8e91a1cf0ab482d918c06b9a8` 上完成 full gates 与 executable probes，发现 vessel static friction 未进入 shared registered Snapshot identity，漂移可被 Repository 接纳、进入 MJCF，并由同步 transport carrier 接受；
- 同一 reviewer 发现 stale CAS edit 虽返回 `update.status=stale_ref`、current Ref 完全未变，ProductSession 仍无条件清除有效 `lastRun`；operator 独立重放两项，分别确认 `world:current@1 + Runtime consumes 0.01` 与 `beforeHadLastRun=true → afterHadLastRun=false`；
- CC Switch 当前 session `c7d1ba43-cf5a-42e3-a2f4-711ce8586bfb` 的 proxy records 确认实际 `model=k3`；其批准结论因自报 accidental isolation exposure 不作为独立关单票，且任何 approval 都不能覆盖 Sol 的 executable blockers；
- `harnessctl review` 生成的 review packet 尾部空行使 reviewer 当时全 repo diff-check 失败，operator 在审查结束后只修正该 harness artifact；product digest 未变化；
- combined verdict 为 `P0=1, P1=1, changes_requested, may_closeout=no`；证据见 `docs/project-harness/tasks/DH-010/phase6-root-authority-remediation-cross-review-evidence.md`；
- DH-010 保持 `doing/changes_requested`，等待 Human 另行授权 bounded vessel-physics identity + stale-ref lifecycle remediation；未修改产品代码，未 commit/push/PR/merge/tag/deploy/closeout/mark-done。

## 2026-08-11 — DH-010 vessel physics / stale-ref remediation 完成

- Human 授权后，先将 vessel friction 漂移进入 Kernel/Repository/Runtime 与 `stale_ref` no-op 错误清除 `lastRun` 固化为 RED；修复前为 `38 pass / 4 fail / 273 assertions`；
- canonical vessel Snapshot 与 validator 共同消费 file-local frozen `VESSEL_PHYSICS`，闭合 `static / massKg=0 / friction=0.8`；Repository、Runtime 与 Product codec 通过既有 single registered Snapshot validator 同步 fail closed，没有增加第二套常量或 patch stack；
- ProductSession 现在只在 `world_write` 或 `world_edit.update.status=updated` 时失效旧 run evidence；`stale_ref` 保留与未变化 current Ref 一致的 `lastRun`；
- 最终 targeted 为 `52 pass / 0 fail / 312 assertions`，full gate 为 `149 pass / 0 fail / 2,857 assertions`；typecheck/build/diff-check/EXharness 与 artifact hashes 通过；
- operator 原反例回放确认 vessel friction 在 Repository/Runtime 均被 `vessel physics 与 fixture registry 漂移` 拒绝，且 stale-ref 前后 Ref 相同、`lastRun` 均存在；新 product digest 为 `85534951b9146283ffbceddec652a0440d0d38a7543ad4828a86eb42b5df1c57`；
- 证据见 `docs/project-harness/tasks/DH-010/phase6-vessel-physics-stale-ref-remediation-evidence.md`。历史 `changes_requested` 保留，等待 Human 另行授权 fresh independent re-review；未 commit/push/PR/merge/tag/deploy/closeout/mark-done。

## 2026-08-11 — DH-010 final remediation fresh cross-review 批准

- 两路 fresh、互相隔离的 reviewer 在 frozen product digest `85534951b9146283ffbceddec652a0440d0d38a7543ad4828a86eb42b5df1c57` 上完成 full gates 与 adversarial probes，起止 HEAD/product digest/status 均未漂移；
- CC Switch path 请求 `claude-opus-4-8 / max`，current-session proxy records 证明实际 downstream `model=k3`；其完成 `149/0/2,857` 与 42/42 额外断言，批准 `may_closeout=yes`；
- replacement GPT-5.6 Sol Max path 完成 `149/0`、typecheck/build/diff/checklist/artifact 与 Repository/Runtime/codec/stale-ref/run-adopt probes，bounded scan 未发现 P0/P1，终点 frozen identity 通过，批准 `may_closeout=yes`；首个无法收口 final verdict 的 Sol attempt 已中止且不计票；
- combined verdict 为 `P0=0, P1=0, approved, may_closeout=yes`，证据见 `docs/project-harness/tasks/DH-010/phase6-vessel-physics-stale-ref-cross-review-evidence.md`；
- EXharness 状态为 `doing / review_approved`。本轮只打开 closeout gate，尚未执行 closeout、`mark-done`、commit、push、PR、merge、tag 或 deploy。

## 2026-08-11 — DH-010 closeout 与 mark-done

- Human 授权后生成 `docs/project-harness/current/closeout-packet.md`，将两路 final approval 记录为 `phase=closeout_requested / decision=approved`；
- `harnessctl mark-done` 已将 DH-010 更新为 `done / closed`，清空 owner 与 current task pointer，并于 `2026-08-12T03:30:01Z` 释放 lease；
- closeout verification 继续绑定 frozen product digest `85534951b9146283ffbceddec652a0440d0d38a7543ad4828a86eb42b5df1c57`、`149/0/2,857`、typecheck/build/diff/checklist/artifact hashes 与两路 adversarial review；
- 当前仅获授权提交并推送 `agent/codex/DH-010`；未授权 PR、合并 `main`、tag 或 deploy。

## 2026-08-11 — DH-010.1 跨引擎 Evaluation 收尾候选

- 真实浏览器发现 Bun/JavaScriptCore producer 与 Chromium/V8 verifier 对同一 `Math.hypot` 结果存在约 `5.17e-26` 的末位差，旧 codec 因逐位相等错误拒绝合法 PASS projection；
- 新跨引擎 regression 先在旧实现上以 `Evaluation 与受信 evaluator 结果不一致` 明确 RED，再由共享 evaluator 将派生连续数值 canonicalize 为 15 位有效数字；codec 没有增加 tolerance bypass，transport 仍需与受信 canonical Evaluation 完全相等；
- V8 已接受真实 Bun ball-vessel projection，并拒绝被改写 `1e-12` relative 的 canonical metric；full gate 为 `151/0/2,863`，typecheck/build/diff/EXharness 与 scripted Chromium 91-frame playback/PASS 均通过；
- frozen product aggregate 为 `6bc13dfec1c33927105bfa29fbc47ac2f95dc3d47a60732ecb1ccc98ebb20465`，详细证据见 `docs/project-harness/tasks/DH-010.1/progress.md`；当前等待 independent reviewer，未 closeout、mark-done、commit 或 push。

## 2026-08-11 — DH-010.1 Round 1 probe boundedness remediation

- fresh reviewer 在 aggregate `6bc13dfe...` 上确认产品数值语义、跨引擎路径与全部 authority 反例通过，但发现 Node/Vite probe 无 wall-clock deadline，给出 `changes_requested / P1=1 / may_closeout=no`；
- remediation 先以 hung child missing runner 进入 RED，再加入 2 MB UTF-8 input budget、5 秒 parent 总 deadline、`SIGKILL + await reaping`、4 秒 probe stdin/create/load/close step deadline 与实际 hung-child regression；
- full gate 更新为 `153/0/2,866`，typecheck/build/diff/EXharness 通过；新 aggregate `299414f7a4c78b1979ff1e73468b4c822286a9bb5bf71276a128e377f7271676` 进入 fresh Round 2；未 closeout、mark-done、commit 或 push。

## 2026-08-11 — DH-010.1 Round 2 fresh review approved

- fresh reviewer 在 frozen aggregate `299414f7...` 上确认起止 branch/HEAD/status/digest 不漂移；
- focused `14/0/41`、full `153/0/2,866`、typecheck/build/diff/EXharness 均独立通过；
- reviewer 实际确认 hung Node child 被 `SIGKILL` 并 await 回收，2 MB UTF-8 budget 与 4 秒 step / 5 秒 total deadline 生效，合法/篡改跨引擎路径符合预期；
- verdict 为 `approved / P0=P1=P2=0 / may_closeout=yes`。Operator 可执行正常 closeout 与 mark-done；本结论不授权 merge `main`、tag、deploy 或真实 provider prompt。

## 2026-08-11 — DH-010.1 Operator close completed

- closeout packet 后重新登记 frozen Round 2 approval，正常 `mark-done` 成功；第一次缺少 closeout-phase approval 的 mark-done 被护栏拒绝，未使用 force override；
- CLOSE event 为 `evt-20260812T060501Z-9debaaa1`，DH-010.1 已为 `done / closed`，lease 已释放，current task pointer 已清空；
- 后续 authority 仅覆盖 commit + push `agent/codex/DH-010.1` 并回查 remote SHA；不包含 merge `main`、tag、deploy 或真实 provider prompt。

## 2026-08-14 — DH-013 Operator close completed

- Final Round 3 的 Sol 与 fresh DeepSeek V4 Pro Max 共同批准，P0/P1 为 0；42-file product aggregate 为 `372630cfee4b50b5550d57425b97a7baec73e34e95e0b7d8bacd84bf3f7706f0`；
- Human 授权后完成 closeout packet、closeout-phase approval 与正常 `mark-done`；CLOSE event `evt-20260814T075536Z-c2f362f9`，DH-013 已为 `done / closed`，lease 已释放，未使用 force override；
- 最终 `464 pass / 0 fail / 3418 expect()`，typecheck、build、diff-check 与 EXharness validate/doctor 通过；真实 provider bytes 继续只存在 ignored local cache，不进入 Git；
- 当前 authority 仅覆盖 commit + push `agent/codex/DH-013`；不包含 merge `main`、tag、deploy 或新 provider generation。

## 2026-08-15 — DH-017 plan gate approved，Phase 1 implementation started

- Round 17 两路 fresh independent plan review 在 frozen plan SHA-256 `9b8a4b94b8a2b86abe8b39ec61a63bd321160420e6e06390e92942cf341b5b20` 与 22-file aggregate `9613ae69cde1ac8419a11fc2374fd76f0cab1724af3bc513b7b305a70fbbb3f8` 上共同批准：`approved / may_implement=yes / P0=P1=P2=0`；Harness review events 为 `evt-20260815T212232Z-43792abe`、`evt-20260815T212238Z-7ae5130e`；
- Phase 1 已实现 strict generation request/binding/intent codec：prompt NFC 与 scalar/UTF-8 budget、Marble/Hunyuan exact provider projection、generation/request/binding domain-separated digests、profile/shape identity与 durable intent drift validation；
- 已实现 server-memory confirmation store：active ProductSession session identity由调用方传入可信 route authority，store负责 exact token binding、single-use、10-minute monotonic TTL、16/session、256/global、16 KiB、foreign/mismatch不消费与session teardown释放；尚未接入HTTP route；
- 已实现 early durable state codec与 package-internal `GenerationRecordJournal` 首条 append/recovery protocol：`.record.next`、external inode witness、hard-link final、`head.next`/head publish及逐项cleanup；覆盖 pre-witness fail-closed、post-witness exact resume、全部link/head/cleanup kill points与byte-identical replacement inode；该raw writer未从package root导出；
- 已补齐 provider transport/codec 的纯边界：credential-bearing path、signed asset URL/redirect/status/raw-GET预算，以及 Hunyuan 两个冻结response profile、JobId/RequestId/status/output/cost shape；这些模块尚未读取credential或发provider请求；
- 已实现 package-internal Generation namespace identity DAG 与只读receipt分类：seed、root lease digest、valid internal operationId/binding/binding digest、namespace body/directory identity与success published identity均有fixed golden vector；package-root `OperationJournal`仍拒绝internal kind且零mutation；
- 已实现 package-internal generation birth evidence/journal：完整`intent + admitted(0) + head + empty downloads`先在`data/`durable，随后仅以same-inode birth-staging→catalog hard-link建立可见性；catalog前crash保持hidden，catalog fsync后crash按same inode/body收束，partial hidden data保留并fail closed；当前测试使用exact-installed namespace fixture，真实namespace installer/capacity/startup apply仍未完成；
- DH-017新增focused tests当前共80项通过（contracts 8、confirmation 6、state 6、record journal 12、provider transport 24、provider codecs 9、namespace 5、birth codec 3、birth journal 4、OperationJournal新增3）；全量回归`713 pass / 0 fail / 4659 expect()`、全仓typecheck与`git diff --check`通过；
- 当前仍处于Phase 1，未完成真实namespace internal Operation installer、shared `DataRootCapacityAuthority`、global startup preflight/apply、full Generation lifecycle、Marble service、dynamic Artifact publication、Gateway routes、Studio/Chromium；未读Keychain、未发authenticated/provider请求、未运行真实generation、未部署/合并/closeout。

## 2026-08-15 — DH-017 Phase 1 provider/output contract milestone

- World Labs 侧补齐纯 response codec：对 Operation/World envelope 做 exact-key、depth/node/string/body budget 校验，冻结 pending/failure/success XOR、Marble failure cost absent、success cost 仅保留 sanitized total，并从 World assets 中只选择 `spz_urls["500k"]` 与 `collider_mesh_url`；返回的 durable remote identity 不含 signed URL；
- 新增 generation output durable contracts：Marble exact ordered roles 为 `world-spz-500k + world-collider-glb`，Hunyuan exact role 为 `object-glb`；`RemoteOutputIdentityV1`、`SanitizedCostV1` 与初始 download budget 均绑定 durable provider/remote-job identity，cost 采用 provider-matched non-exponent decimal；
- `provider_failed` durable payload 现仅允许 Hunyuan 携带 provider-matched settled cost，Marble failure 携带 cost 会 fail closed；未扩张为 generic provider SDK；
- 新增 focused tests 后，本分支全量回归为 `723 pass / 0 fail / 4688 expect()`（63 files）；`bun run typecheck`、`bun run build` 与 `git diff --check` 通过，build 仅保留既有 Vite large-chunk warning；
- 这些仍是纯 codec/state/contracts 与本地 fake evidence，不代表真实 credential/provider 路径已接通，也不授权真实 generation、部署、合并或 closeout。

## 2026-08-15 — DH-017 Phase 1 private download contract slice

- `generation-output-contracts` 已冻结 `ArtifactInspectorDescriptorV1`、domain-separated descriptor digest、role-specific 16/32/64 MiB budget、candidate filename/checkpoint/file-identity/content/descriptor cross-check，以及 closed `DownloadDiscardWitnessV1` disposition；
- 新增纯 `DownloadBudgetV1` / member transition validator：同一 transition 至多改变一个 member，candidate 必须构成连续前缀、最多一个 active member、其余 idle；合法路径仅允许 `idle → reserved → owned-next → cleanup-authorized → candidate` 或 `owned-next → discard-authorized → discarded → attempt-2 reserved`，refresh 必须独立持久化并同时消费一次 poll attempt；
- Marble 回归证明第一 member candidate 在第二 member reserve 时 byte-exact carry；第二 member 不得越过未完成的第一 member，checkpoint/filename/inspector digest/file identity/discard disposition 任一漂移均 fail closed；这些 pure validators 尚未获得 filesystem unlink、provider fetch 或 public Artifact CAS authority；
- `outputs_ready` pure payload validator 进一步要求 remote output identity 绑定 durable remote job、初始 download budget byte-exact继承当前 poll budget，并按provider验证optional settled cost；active download payload禁止携带cost，terminal artifact rejection code必须逐字继承同一durable discard witness；
- 当前全量回归为 `731 pass / 0 fail / 4714 expect()`（63 files）；`bun run typecheck`、`bun run build`、`git diff --check`、Harness validate（0 warnings）与 doctor（0 errors，仅 optional `harness-config.json` / `init.sh` missing）通过。

## 2026-08-15 — DH-017 Phase 1 shared capacity / namespace inspection slice

- 新增纯 `DataRootCapacityAuthority`：统一计算 receipts 2048-entry authority、Generation namespace 四态 outstanding charge 与每个 active Generation 的 generated-set publication reservation；first generation 在 namespace 四态下均精确占用 5 slots，matching publication intent/result 只接管原有 2-slot reservation，不重复计数；`submission_ambiguous` / `recovery_required` 在 v1 永久保留 2 slots；publishing-without-intent 与 terminal/publication 冲突稳定 fail closed；
- 新增 package-internal、只读 `inspectGenerationNamespace`，从 live root/lease 重算 exact internal binding，并将磁盘分类为 `absent-no-intent / install-intent-pending / directory-published-result-pending / terminal-installed`；published namespace 必须是 exact five-entry 0700 tree，final marker 与 durable intent 为 same inode/body 且 link count 合法，namespace body 绑定当前 directory `dev/ino/mode/uid/gid`；byte-identical replacement inode、extra entry 与 child mode drift 均在任何 recovery mutation 前拒绝；
- `GenerationBirthJournal` 已改为复用该共享 inspector，不再维护第二套 namespace truth；过程中发现并修复局部 `directoryIdentity` 常量遮蔽同名函数导致的 TDZ 回归，focused 重新达到 `15 pass / 0 fail / 57 expect()`；
- 当前全量回归为 `742 pass / 0 fail / 4748 expect()`（65 files）；`bun run typecheck`、`bun run build`、`git diff --check`、Harness validate（0 warnings）与 doctor（0 errors，仅 optional `harness-config.json` / `init.sh` missing）通过；build 仅保留既有 Vite externalization / large-chunk warnings；
- 该里程碑仍只完成 shared capacity 的纯计算与 namespace 的只读检查；真实 namespace internal Operation installer、global startup preflight/apply 与跨 journal apply authority 尚未实现。本轮未读 Keychain、未发 authenticated/provider request、未运行真实 generation，未 commit/push/merge/deploy/closeout。

## 2026-08-15 — DH-017 Phase 1 atomic namespace publication primitive

- 新增未从 package root 导出的 macOS `renameDirectoryNoReplace` primitive：lazy-load exact `/usr/lib/libSystem.B.dylib` `renameatx_np` symbol，逐字使用 `AT_FDCWD=-2` 与 `RENAME_EXCL=0x00000004`；仅接受 absolute、无 NUL、source/destination 不同的路径，symbol 不可用或 syscall nonzero 时稳定 `GENERATION_RECOVERY_REQUIRED`，没有 `renameSync`、precheck+rename、shell、copy 或跨平台 fallback；
- 实机语义测试证明 absent destination 原子接收 source 且 `dev/ino/mode` 不变；destination 已为 empty directory、regular file 或 symlink 时均拒绝替换，source 与 destination identity 均保持；zero-mutation symbol check 与路径歧义拒绝也已覆盖；
- 当前全量回归为 `748 pass / 0 fail / 4764 expect()`（66 files）；typecheck、build、diff-check、Harness validate/doctor 全通过，只有既有 Vite warning 与 optional Harness file missing；
- 该 primitive 还没有单独的 mutation authority，也没有在 durable namespace Operation attempt 外运行 semantic probe；下一切片仍需由共享 capacity / private internal Operation capability 驱动 installer 与 crash recovery。本轮外部副作用仍为 0。

## 2026-08-15 — DH-017 Phase 1 shared capacity disk inspection

- 新增 package-internal `inspectDataRootCapacity`，在同一 live root/lease 下以 directory handle incremental scan 读取真实 `receipts/`；第 2049 项立即停止，unknown name、symlink、wrong type/mode、result-without-intent、malformed/non-canonical binding/result 或额外 internal operation 全部 `OPERATION_RECOVERY_REQUIRED`；该 inspector 不调用 layout creator，也不执行任何 filesystem mutation；
- 每个 public/internal receipt 均按其 own exact codec 重验，namespace internal binding 必须与 `inspectGenerationNamespace` 从 current lease 重算的 binding byte-exact；输出冻结 actual entry count、pending-result reservation、namespace 四态及 public/internal operation counts；
- disk-backed 四态计数已闭合为 absent `0+0`、intent-pending `1+1`、directory-published `2+1`、terminal-installed `3+0`，并覆盖 ordinary public intent 从 pending `1+1` 到 terminal `2+0` 的 1:1 转换；这些数据可直接喂给纯 `calculateDataRootCapacity`，避免 caller 自报 receipt 数量；
- 当前全量回归为 `752 pass / 0 fail / 4780 expect()`（67 files）；typecheck、build、diff-check、Harness validate（0 warnings）与 doctor（0 errors）通过，仅保留既有 Vite warnings 和 optional Harness files missing；
- 下一步仍是把这个只读 snapshot 放进 Data Root global capacity single-flight，并以不可伪造的 private capability驱动 namespace installer；本轮未获得或使用外部 credential/provider/network authority。

## 2026-08-16 — DH-017 Phase 1 first-generation capacity capability

- 新增未从 package root 导出的 `FirstGenerationCapacityCapability`：只由同一 live Data Root/root writer lease 的真实 disk inspection 与纯 capacity result 铸造；empty root 的 first generation composite admission 精确冻结为 5 entries；capacity 不足只返回 `capacity-reached`，不写 receipt、staging 或 namespace；
- 同一 lease、同一 snapshot 的重复 authorization 只返回同一个 capability，不额外铸造 authority；首次合法 consume 立即烧掉 capability，forged/replayed capability、root/lease 不匹配与 authorization 后的 receipt drift 均稳定 `OPERATION_RECOVERY_REQUIRED` 并保留磁盘 evidence；
- 该实现刻意保持为一个 module-private `WeakMap` provenance + 一次 snapshot revalidation，没有引入通用 transaction object、lock framework、config strategy 或可复用 writer object；future namespace+birth coordinator 只应在同步 first filesystem mutation 前立即 consume；
- focused capacity gate 为 `14 pass / 0 fail / 55 expect()`；其中临界测试写入 2044 个合法 terminal public receipt entries，确认 first-generation request 返回 `capacity-reached` 且 receipts entry set 完全不变；
- 当前全量回归为 `756 pass / 0 fail / 4799 expect()`（68 files）；typecheck、build、diff-check、Harness validate（0 warnings）与 doctor（0 errors）通过，仅保留既有 Vite warnings 和 optional Harness files missing；
- 本切片没有实现 namespace installer、startup recovery apply 或 provider lifecycle；未读 Keychain、未发 authenticated/provider request、未运行真实 generation，未 commit/push/merge/deploy/closeout。

## 2026-08-16 — DH-017 Phase 1 namespace installer core

- 新增未从 package root 导出的 `GenerationNamespaceInstaller`，直接消费一次性 `FirstGenerationCapacityCapability`，按固定线性顺序完成 `durable internal intent/flat attempt → complete five-entry candidate → renameDirectoryNoReplace publish → durable success result → exact attempt cleanup`；没有新增 generic transaction、internal-operation framework 或第二套 lock；
- internal intent 与 final marker、staged result 与 durable result 均由 same-inode hard-link证明；candidate body绑定创建时的directory `dev/ino/mode/uid/gid`，最终仍由既有`inspectGenerationNamespace`重验exact entry set、binding、marker与result；installer只使用已有96-bit/24-hex root attempt grammar；
- 同一方法可从四个已durable milestone恢复原attempt：intent receipts fsync、完整candidate fsync、namespace publish+receipts fsync、result publish+receipts fsync；每次resume先从磁盘重算capacity/namespace truth，success后staging恢复为空，terminal-installed replay不创建第二attempt；
- focused gate 为 `14 pass / 0 fail / 74 expect()`，覆盖正常install/replay与上述四个fault boundary；当前全量回归为`761 pass / 0 fail / 4840 expect()`（69 files），typecheck、build、diff-check、Harness validate（0 warnings）与doctor（0 errors）通过，仅保留既有Vite warnings和optional Harness files missing；
- 该模块仍是installer core，不宣称完成canonical plan中的durable per-attempt runtime rename semantic probe或global startup read-only preflight/branded apply；这些仍是下一独立切片。未读Keychain、未发authenticated/provider request、未运行真实generation，未commit/push/merge/deploy/closeout。

## 2026-08-16 — DH-017 Phase 1 namespace startup inspect/revalidate/apply

- `GenerationNamespaceInstaller` 新增未从 package root 导出的只读 `inspectRecovery()` 与一次性 `applyRecovery()` authority；plan 仅冻结当前 namespace classification、原 attempt token、0700 attempt directory identity、exact top-level entry set 与各 entry 的 `dev/ino/mode/uid/gid`，没有新增 generic recovery transaction、第二套 journal 或可配置 strategy；
- apply 必须由同一 installer/root/live lease 消费同一 WeakMap provenance，forged/replayed plan、namespace state 漂移、attempt directory/entry set/inode 漂移均在续跑 mutation 前稳定 `GENERATION_RECOVERY_REQUIRED`；candidate 内部仍复用既有 namespace body、same-inode marker 与 exact five-entry validator，不重复堆叠防御层；
- `recoverPendingOperations` 现在在任何 DH-016 durability repair/terminalization/cleanup 前先生成 namespace recovery plan，并把该 exact internal attempt 纳入 startup staging coverage；只有现有全局 preflight 与 DH-016 recovery 全部收束后才重新验证并 apply namespace plan；foreign orphan 使全局 preflight 失败时，namespace receipt/attempt/tree byte-for-byte不变；
- 四个 durable installer milestone（intent、candidate、published namespace、durable result）均通过只读 inspect 后继续同一 attempt，terminal replay不创建新attempt；forged/replayed plan与inspect-after-drift保留evidence；focused namespace/startup回归为`63 pass / 0 fail / 376 expect()`（5 files），最终全量为`765 pass / 0 fail / 4876 expect()`（69 files）；
- `bun run typecheck`、`bun run build`、`git diff --check`、Harness validate（0 warnings）与 doctor（0 errors，仅 optional `harness-config.json` / `init.sh` missing）全部通过；build只保留既有Vite externalization / large-chunk warnings；
- 下一独立切片仍是 durable per-attempt runtime `renameatx_np(RENAME_EXCL)` semantic probe 与 first-generation namespace+birth coordinator；provider lifecycle、dynamic Artifact/Gateway/Studio与真实generation仍未开始。本轮未读Keychain、未发authenticated/provider request、未运行真实generation，未commit/push/merge/deploy/closeout。

## 2026-08-16 — DH-017 Phase 1 namespace runtime rename semantic probe

- `GenerationNamespaceInstaller` 现只在当前 durable internal Operation attempt 下创建固定 `.rename-probe/`；probe 以 durable intent 的 same-inode hard-link 绑定当前 install binding，并以一个 canonical manifest 冻结七个固定 case entry 的 `dev/ino/mode/uid/gid`，没有新增 generic probe framework、transaction abstraction 或可配置 strategy；
- live/recovery 都要求 absent destination 的 `renameatx_np(RENAME_EXCL)` 成功且 source identity 不变；existing empty directory、regular file、symlink 三种 destination 必须拒绝 replacement，并在调用后重新验证 source/destination stable identity与固定file/symlink内容；任一不符都在namespace publication前稳定 `GENERATION_RECOVERY_REQUIRED`；
- probe 本身纳入 attempt snapshot 与 startup global preflight；durable probe 内的same-name byte-identical replacement inode、entry-set drift或binding marker漂移会保留evidence并拒绝后续mutation。terminal result durable后才允许逐项exact-inode cleanup，每次unlink后fsync probe directory，空目录cleanup可在crash后幂等收束；
- installer/startup focused gate 为`77 pass / 0 fail / 468 expect()`（6 files）；最终全量回归为`773 pass / 0 fail / 4952 expect()`（69 files）。`bun run typecheck`、`bun run build`、`git diff --check`、Harness validate（0 warnings）与doctor（0 errors，仅optional `harness-config.json` / `init.sh` missing）全部通过；build只保留既有Vite externalization / large-chunk warnings；
- Phase 1 尚未完成 first-generation namespace+birth coordinator；provider lifecycle、dynamic Artifact publication、Gateway/Studio与真实generation仍未开始。本轮未读Keychain、未发authenticated/provider request、未运行真实generation，未commit/push/merge/deploy/closeout。

## 2026-08-17 — DH-017 Phase 1 first-generation admission coordinator

- 新增未从 package root 导出的 `FirstGenerationCoordinator`，以固定线性顺序完成 intent-aware shared capacity authorization → namespace install/replay → durable generation birth/replay；coordinator、capacity capability、birth admission capability 与 test seams 均不从 `packages/world-project/src/index.ts` 导出；
- first-generation capacity authority 现在从 live root/lease、exact Generation intent、真实 receipts inspection 与 `data/catalog/birth-staging` evidence 共同铸造；empty root 首次 birth 精确占用 infrastructure 3 + future publication 2，existing active replay 在 `used=2046` 时只保留既有 publication reservation 2，`effectiveEntries=2048`，不会重复申请第二 birth；
- `directory-published-result-pending` 阶段在 namespace success result publish 前要求三个 Generation 子目录 exact empty；namespace install/replay 后，package-private one-shot `FirstGenerationBirthAdmission` 同时冻结并在 birth 首次 mutation 前重验 inspection、capacity 与 evidence，post-installer foreign entry 或合法 receipt capacity drift 均保留现场并零 birth mutation；
- 按 first-principles 范围裁决，`GenerationBirthJournal` 对 foreign staging candidate 继续 strict fail closed；合法 concurrent multi-generation lineage、startup 全局 birth preflight 与全局 bounded directory migration 不在此小 coordinator 中半实现，留给下一独立 recovery slice；
- Terra high Worker 经四轮同一 Terra xhigh Reviewer 聚焦复核后获得最终 `approved / may_advance=yes / P0=P1=P2=0`；EXharness approved event 为 `evt-20260817T064026Z-38b0cd18`。Reviewer 亲自执行 focused `36 pass / 0 fail / 171 expect()` 与 clean `git diff --check`；
- Operator 最终独立门为 focused `53 pass / 0 fail / 324 expect()`、全量 `801 pass / 0 fail / 5081 expect()`（70 files）；`bun run typecheck`、`bun run build`、`git diff --check`、Harness validate（0 warnings）与 doctor（0 errors，仅 optional `harness-config.json` / `init.sh` missing）全部通过；build 只保留既有 Vite externalization / large-chunk warnings；
- 本切片未读 Keychain、未发 authenticated/provider request、未运行真实 generation、未触碰 public Artifact CAS 或 World Project/Snapshot/Ref/Episode/Evaluation，也未 commit/push/merge/deploy/closeout。Coordinate production workspace/Discord binding 未被冒充为本次 direct Terra subagent managed job；下一步是单独实现 startup 全局 Generation birth evidence preflight 与 bounded scan/apply ordering。

## 2026-08-17 — DH-017 Phase 1 startup Generation birth preflight / apply

- `recoverPendingOperations()` 的全局 Phase A 现在在任何 legacy Project/Artifact durability repair、terminalization或cleanup mutation前，同时形成 namespace child preflight与terminal first-generation birth recovery plan；旧 Operation Phase B/C 收束后，namespace apply与birth apply各自仍在第一处mutation前近端重验同一snapshot；
- namespace `install-intent-pending` 的exact staged candidate与`directory-published-result-pending`的final namespace都会冻结`data/catalog/birth-staging` exact-empty entry set和stable directory identity；Phase-A后注入foreign child entry会在旧cleanup、namespace publish/result前fail closed并保留全部evidence；candidate尚不存在的合法install-pending仍保持no-op preflight；
- terminal birth plan现在冻结generation directory、`intent.json`、`head.json`、bounded `records/` physical entries（含pending/witness/final names）、empty `downloads/`、catalog与birth-staging的inode/mode/bytes digest/entry set；record部分复用`GenerationRecordJournal`现有scanner与chain validation，没有复制第二套journal truth；byte-identical新inodereplacement在apply与Journal首个birth mutation前均被拒绝；
- `GenerationBirthStartupRecoveryPlan`保持module-private one-shot WeakMap authority，绑定exact root/live lease/intent/snapshot；direct tests覆盖forged、replay、cross-root/fake cross-lease与package-root negative export。Reviewer指出真实close/reacquire lease测试尚未单独覆盖，为非阻断P2；实现的object-identity guard已正确，本轮按最小范围不追加防御代码；
- 四个birth crash milestones（generation data、birth-staging、catalog fsync、staging cleanup）均在close/reopen/reacquire后由startup唯一收敛；本链条的generation exact entries、downloads、data/catalog/birth-staging与records physical scan已改为directory-handle `limit+1`，不先无界物化；future legal concurrent multi-generation仍未实现；
- Terra high Worker经limited-fresh Terra xhigh Reviewer两轮审查后最终`approved / may_advance=yes / P0=P1=0`，非阻断P2=1；EXharness approved event为`evt-20260817T071128Z-2128cabf`。Reviewer亲自运行focused `122 pass / 0 fail`与typecheck；
- Operator最终独立门为focused `107 pass / 0 fail / 635 expect()`、全量`814 pass / 0 fail / 5144 expect()`（70 files）；`bun run typecheck`、`bun run build`、`git diff --check`、Harness validate（0 warnings）与doctor（0 errors，仅optional `harness-config.json` / `init.sh` missing）全部通过；build只保留既有Vite externalization/large-chunk warnings；
- 本切片未触碰provider/auth/Keychain/network/真实generation、public Artifact CAS、World/Gateway/Studio、Git或部署。Coordinate production task mirror仍未建立，本次证据属于EXharness + direct Terra subagent，不冒充managed Coordinate/MultiNexus runtime job或Discord delivery。

## 2026-08-17 — DH-017 Phase 2 Marble authenticated service

- 新增直接、provider-specific 的 `MarbleGenerationService`，只负责 exact `submit/query/get-world` 三个 authenticated calls；每次最多一次 fetch，使用 caller abort + 30秒 deadline、`redirect:"error"`、256 KiB incremental body reader与fatal UTF-8，不包含retry、poll loop、durable lifecycle、download或generic ProviderAdapter/SDK；
- provider response bytes 进入既有shape codec前，先通过一个固定预算的 strict JSON decoder；它拒绝nested duplicate object keys、malformed grammar、invalid UTF-8与oversize，没有引入可配置parser framework或第三方dependency；
- paid submit现在只接受runtime-revalidated `GenerationBindingBodyV1`：复用`requireGenerationBindingBody`重导全部request identity，要求Marble provider与exact profile，并只序列化重导出的providerRequest。伪造image/type/model/public permission/extra tags/profile会在fetch前`PROVIDER_CONTRACT_MISMATCH`；
- submit no-creation matrix与bound query/get-world matrix保持分离：query/get-world `401|403 → PROVIDER_UNAUTHORIZED`，`400|404|422 → PROVIDER_REJECTED`；429/5xx与transport/body/abort/deadline保持closed transient outcome供后续durable coordinator决定，不在service内自行重试；
- legal success可在进程内临时携带后续downloader所需signed asset URL，但本切片没有durable/HTTP/log/DOM serializer；credential、raw body/status/error/path不会进入outcome或diagnostic。Hunyuan、GenerationJournal、Artifact CAS、Gateway routes、Studio与World authority均未触碰；
- Terra high Worker首轮经Terra xhigh Reviewer发现两项P1（bound query状态被误归transient、submit只信任erased TypeScript type），修正后Round 2获得`approved / may_advance=yes / P0=P1=P2=0`；EXharness approved event为`evt-20260817T074311Z-469a89a8`；
- Reviewer亲跑focused `25 pass / 0 fail / 161 expect()`与全仓typecheck；Operator最终独立门为focused `71 pass / 0 fail / 284 expect()`、全量`839 pass / 0 fail / 5274 expect()`（71 files），`bun run typecheck`、`bun run build`、`git diff --check`、Harness validate（0 warnings）与doctor（0 errors，仅optional `harness-config.json` / `init.sh` missing）全部通过；build只保留既有Vite externalization/large-chunk warnings；
- 本切片未读Keychain、未联网、未发真实World Labs请求、未运行真实generation、未commit/push/merge/deploy/closeout。证据仍属于EXharness + direct Terra subagent，不冒充Coordinate/MultiNexus managed runtime job或Discord delivery。

## 2026-08-17 — DH-017 Phase 2 Hunyuan authenticated service

- 新增直接、provider-specific 的 `HunyuanGenerationService`，只负责exact paid submit与bound job query；每次调用先runtime重验durable `GenerationBindingBodyV1`、configured response profile与shape digest，query另重验`RemoteBoundPayloadV1`，不包含retry、poll loop、download、durable lifecycle或generic ProviderAdapter/SDK；
- submit/query均使用exact POST URL、raw `Authorization`（无`Bearer`）、caller abort + 30秒deadline、`redirect:"error"`、256 KiB incremental body reader与既有strict JSON/response codec。两个response profile由service实例固定，运行时不fallback/猜测；
- Hunyuan paid submit保持与Marble不同的authority：fetch真正开始后，任何无可信JobId的status/malformed/body/transport/abort/deadline都只返回`PROVIDER_SUBMISSION_AMBIGUOUS`；fetch前已经aborted则返回独立`REQUEST_ABORTED`且fetch=0，避免把可证明零付费副作用污染成ambiguous；
- bound query `401|403 → PROVIDER_UNAUTHORIZED`、`400|404|422 → PROVIDER_REJECTED`、`429|5xx|stream/deadline → transient`；deterministic 256 KiB+1 overflow与codec/profile/identity drift为`PROVIDER_CONTRACT_MISMATCH`，不会被错误重试；legal DONE可在进程内临时携带唯一GLB signed URL，未新增durable/HTTP/log/DOM serializer；
- Terra high Worker首轮经Terra xhigh Reviewer发现两项P1（pre-fetch abort误报paid ambiguity、query body overflow误归transient），修正后Round 2获得`approved / may_advance=yes / P0=P1=P2=0`；EXharness approved event为`evt-20260817T080310Z-ac21ed5f`；
- Reviewer亲跑focused `8 pass / 0 fail / 127 expect()`与gateway typecheck；Operator最终独立门为focused `71 pass / 0 fail / 364 expect()`、全量`847 pass / 0 fail / 5402 expect()`（72 files），`bun run typecheck`、`bun run build`、`git diff --check`、Harness validate（0 warnings）与doctor（0 errors，仅optional `harness-config.json` / `init.sh` missing）全部通过；build只保留既有Vite externalization/large-chunk warnings；
- Phase 2两个direct authenticated services至此都有本地fake transport证据，但仍未读取Keychain、未联网、未发真实Marble/Hunyuan请求、未运行真实generation，也未实现durable lifecycle coordinator、download、Artifact publication、Gateway routes或Studio。未commit/push/merge/deploy/closeout，证据不冒充Coordinate/MultiNexus managed runtime job或Discord delivery。

## 2026-08-17 — DH-017 Phase 3 pure dynamic Artifact inspector

- `scripts/provider-artifact-validation.ts` 新增一个直接的纯 `inspectArtifactBytes(format, bytes)` seam，复用既有 SPZ v2 / GLB 2.0 decoder 从真实 bytes 重算 digest、byteLength、elementCount 与 sourceBounds；返回值与嵌套 bounds 均冻结，没有 filesystem、CAS、journal、provider、World 或 registry 依赖；
- DH-013 `validateRegisteredArtifactBytes()` 改为复用同一 decoder truth，但仍按原有 byteLength → manifest digest → elementCount → bounds 顺序做 exact 比较，static manifest authority 未被 dynamic inspection 放宽或自动注册；
- 新增未从 package root 导出的 `generation-artifact-inspector.ts`，只允许 `spz-v2 → spz-v2-position-bounds-v1` 与 `glb-2.0 → glb-2.0-scene-bounds-v1` 两个固定映射；descriptor 只能从 inspected bytes 构造并由既有 codec/digest authority 验证，caller 无法注入 profile、digest、count 或 bounds；
- Reviewer 首轮发现 raw Float32 bounds 未执行 canonical plan 要求的 `-0→0` 与 15-significant-digit normalization；修复严格局限于 wrapper 的六个坐标，并在 rounding 后继续由既有 strict bounds codec fail closed，没有引入 generic decimal/canonical-number framework；
- deterministic SPZ/GLB golden、Float32 precision、`-0`、rounding-degenerate、wrong format、truncated/chunk/trailing、external/data URI、sparse/invalid accessor、NaN、content drift 与 static manifest drift 均有测试；Terra xhigh Reviewer 最终 `approved / may_advance=yes / P0=P1=P2=0`，EXharness approved event 为 `evt-20260817T084251Z-78e5de25`；
- Operator 最终独立门为 focused `23 pass / 0 fail / 72 expect()`、全量 `853 pass / 0 fail / 5426 expect()`（73 files）；`bun run typecheck`、`bun run build`、`git diff --check`、Harness validate（0 warnings）与 doctor（0 errors，仅 optional `harness-config.json` / `init.sh` missing）全部通过；build 只保留既有 Vite externalization / large-chunk warnings；
- 本切片未实现 download ownership、durable Generation lifecycle、Artifact CAS/provenance/set/catalog publication、startup publication recovery、Gateway/Studio 或 World mutation；未读 Keychain、未联网、未发 provider 请求、未 commit/push/merge/deploy/closeout。下一小片应先冻结 content/provenance/set 的纯 record identity 与 join，再单独进入 admitted set-level CAS publication。

## 2026-08-17 — DH-017 Phase 3 generated Artifact record identities

- 新增未从 package root 导出的 `generated-artifact-records.ts`，以 plain exact-key/deep-frozen V1 records 分离 content、generation provenance 与完整 provider output set；三个 record digest 分别使用 canonical plan 冻结的 domain-separated canonical JSON preimage，没有引入 repository/registry/builder/ORM/graph framework；
- content record 只能消费 `inspectDynamicArtifactBytes()` 实际 mint 的结果：inspector module 以私有 `WeakSet` 证明 runtime origin，结构与 descriptor digest 都自洽的手工伪造对象也不能生成 `verified` asset identity；descriptor decoder同时统一拒绝非 15-significant-digit canonical bounds；
- `assetId` 始终由 content SHA-256 导出，provider/job/role 不进入 content identity；同一个 GLB 在 Marble collider 与 Hunyuan object 下复用相同 assetId/contentRecordDigest，同时生成不同 provenance 与 set digests，many-to-one 关系已有 deterministic golden；
- provenance 复用 durable Generation binding 与 exact provider job-id codec，set 强制 Marble `[world-spz-500k, world-collider-glb]`、Hunyuan `[object-glb]` 的 role/format/order/cardinality，并重验 generation/provider/content/provenance cross-record equality；by-bytes pointer 仅作为 pure canonical body，不冒充 CAS uniqueness 已完成；
- catalog body 被有意留到 publication slice，因为当前没有可信 publication Operation identity；本片没有用 placeholder 或 caller string 伪造该 authority，也未触碰 filesystem/CAS/OperationJournal/startup/Gateway/UI/World；
- Terra xhigh Reviewer 首轮复现两项同源 P1（伪造 inspection origin、非 canonical bounds 可持久化），最小修复后最终 `approved / may_advance=yes / P0=P1=P2=0`；EXharness approved event 为 `evt-20260817T090519Z-0be7d8ad`；
- Operator 最终独立门为 focused `23 pass / 0 fail / 91 expect()`、全量 `858 pass / 0 fail / 5456 expect()`（74 files）；`bun run typecheck`、`bun run build`、`git diff --check`、Harness validate（0 warnings）与 doctor（0 errors，仅 optional `harness-config.json` / `init.sh` missing）全部通过；build 只保留既有 Vite externalization / large-chunk warnings；
- 本切片未读 Keychain、未联网、未发 provider 请求、未运行真实 generation、未 commit/push/merge/deploy/closeout。下一片应实现 phase-aware candidate join 的纯 authority derivation与 absent/existing observation contract；仍应先不写 public CAS。

## 2026-08-17 — DH-017 Phase 3 generated-set candidate semantic plan

- 新增未从 package root 导出的 `generated-set-candidate-plan.ts`，以固定线性 join 重验 exact `GenerationIntentV1 + RemoteBoundPayloadV1 + ActiveDownloadPayloadV1 + ordered fresh inspector-origin results`；只有 provider-required members 全部处于 final `stage:"candidate"` 才能形成 plan；
- Marble exact roles 固定为 `[world-spz-500k, world-collider-glb]`，Hunyuan 固定为 `[object-glb]`；每个 private candidate 的 digest、byteLength、format、elementCount、canonical bounds、inspector descriptor/profile/digest 都必须与重新 inspect 真实 fixture bytes 得到的结果逐字段一致；
- plan 只包含 generation/provider/remote safe identity、expected private candidate name/file identity，以及前片已经验证的 content/by-bytes/provenance/set records；不含 signed URL、credential、raw bytes、provider request、filesystem observation、CAS state 或 Operation admission；
- plan 的私有 `WeakSet` 仅证明该 immutable value 来自 semantic join，original plan 可重复做只读 origin check，copy/forge 被拒绝；它明确不是 one-shot mutation capability。真正一次性的 `GeneratedSetAdmissionCapability` 留给后续 full filesystem/CAS join + admission slice，避免提前增加 consumed 状态机；
- Reviewer 发现 Hunyuan remote-bound helper只验证`providerRequestId`为string；修复改为让output/candidate路径复用`generation-state.ts`唯一exact decoder，lowercase UUID合法，`forged`与uppercase UUID均在plan mint前拒绝，没有复制第二份regex；
- Terra xhigh Reviewer最终`approved / may_advance=yes / P0=P1=P2=0`；EXharness approved event为`evt-20260817T094633Z-04bfe520`；Operator最终focused为`27 pass / 0 fail / 113 expect()`，串行全量为`861 pass / 0 fail / 5483 expect()`（75 files）；
- `bun run typecheck`、`bun run build`、`git diff --check`、Harness validate（0 warnings）与doctor（0 errors，仅optional `harness-config.json` / `init.sh` missing）全部通过；普通并发全量曾命中既有Data Root lease争用，相关suite单独`27/27`、最终`--max-concurrency 1`全绿，因此未将环境瞬态冒充产品回归；
- 本切片未读Keychain、未联网、未发provider请求、未运行真实generation、未触碰filesystem/CAS/OperationJournal/startup/Gateway/UI/World，也未commit/push/merge/deploy/closeout。下一步是单独实现filesystem-aware private candidate + public namespace `absent|existing`只读观察与near-revalidation；仍不应在同一片直接发布CAS。

## 2026-08-17 — DH-017 Phase 3 generated-set storage preflight

- 新增未从 package root 导出的固定 generated-artifact layout 与 `generated-set-storage-preflight.ts`：只消费 live `OpenedDataRoot` 和 origin-checked candidate plan，按 exact generation downloads path 重新打开 private candidate，并把 bytes CAS、content record、by-bytes pointer、provenance record 与 set record逐一分类为稳定 `absent | existing`；catalog/result/Operation/capacity 与任何 public CAS 写入均不在本片；
- `safe-filesystem.ts` 仅增加单 fd `O_RDONLY|O_NOFOLLOW` 的 bounded regular-file snapshot seam：0600 exact mode（含拒绝 setuid/setgid/sticky）、读取前后 fd identity 与读取后 path identity 必须在 dev/ino/mode/uid/gid/size/mtime/ctime 上完全一致，返回 identity + bytes；既有 writer/read caller 均未改变；
- private candidate 必须匹配 plan 的 dev/ino/mode/uid/gid/size，并从当前 bytes 重新运行 dynamic inspector与 content identity；public JSON evidence 使用 fatal UTF-8、canonical bytes round-trip、既有 exact codec 与 plan equality，bytes CAS 同样重新 inspect。snapshot 不保留 raw bytes、absolute path、signed URL、credential 或 mutable handle；module-private origin 绑定 exact root object/identity 与 exact plan object，near-revalidation可重复运行但不构成一次性 mutation capability；
- 首轮独立 Reviewer 结论虽为 approved，但指出 4 项 P2。按 simplicity gate 做了减法：删除合法 plan 下不可达的 plan 内 content-dedupe map/branch（跨 provider plan 的复用由相同 digest-derived public path 自然完成）、合并重复 identity mapper、收紧特殊 mode 位；没有把 11 行 local canonical JSON decoder抽成跨模块共享框架，因为错误语义与 allowed surface 不同、净复杂度反而增加；bounded re-review 最终 `approved / may_advance=yes / P0=P1=P2=0`；
- 本切片实际执行者为北京时间晚间的本机 OMP `deepseek/deepseek-v4-flash`、`thinking=max`，不是 Coordinate/MultiNexus managed job；独立 Reviewer 也使用隔离 OMP session，未读取 Worker RESULT 或历史 verdict。EXharness approved event 为 `evt-20260817T114550Z-61c201ba`；
- Operator 最终独立门为全仓串行 `877 pass / 0 fail / 5695 expect()`（77 files）；`bun run typecheck`、`bun run build`、`git diff --check`、Harness validate（0 warnings）与 doctor（0 errors，仅 optional `harness-config.json` / `init.sh` missing）全部通过；build 只保留既有 Vite externalization / large-chunk warnings；
- 本切片未读 Keychain、未联网、未发 provider request、未运行真实 generation、未 commit/push/merge/deploy/closeout，也未触碰 Gateway/UI/World 或生产 Coordinate/Discord。下一步应先实现 `artifact.publish-generated-set` 的 pure Operation identity + intent/admission planning，再单独进入 capacity-bound public CAS writer；仍不把两步揉成 generic transaction framework。

## 2026-08-17 — DH-017 Phase 3 generated-set publication identity plan

- 新增未从 package root 导出的 `generated-artifact-publication.ts`，把 origin-checked candidate plan 与同一 root/plan 的 origin-checked storage preflight 收束为唯一 deep-frozen publication plan；它派生 `artifact.publish-generated-set` operationId、exact internal binding、ordered content/provenance digests、binding digest、catalog commit body/digest、expected success result，以及固定 intent/result/catalog relative paths；
- operationId exact为`"op:" + SHA-256("demiurges-generated-set-publication-v1\0" + generationId + "\0" + artifactSetDigest)`；binding固定target `registry:generated-artifact-sets-v1`与`expectedIdentity:null`，binding digest逐字使用`sha256Hex(canonicalJsonBytes(require…Binding(binding)))`，与既有public Operation和namespace internal kind算法byte-compatible。Reviewer另用`node:crypto`和独立sorted-key canonicalizer复算Marble/Hunyuan的operation/binding/catalog六个golden向量，全部匹配；
- catalog body `{generationId,artifactSetDigest,publicationOperationId,publicationBindingDigest}`只作为binding的下游，catalog digest使用独立domain；新增固定`artifacts/catalog/<generation-id-digest>.json` path builder，receipt paths复用Data Root既有builder。计划不包含raw bytes、absolute path、signed URL、credential、provider request或handle；origin map绑定exact root/candidate plan/storage snapshot，read-only check可重复，未提前制造one-shot admission capability；
- 独立 Reviewer 首轮为 `approved / P0=P1=0`，但指出3项纯简单性P2。按Occam gate删除与storage near-revalidation重复的identity校验层、删除binding digest前重复decoder调用，并把约90行重复test fixture收敛为共享builder；production 470→423行、test 1008→964行，测试/expect计数不减。bounded re-review最终`approved / may_advance=true / P0=P1=P2=0`；
- 本切片实际 Worker与Reviewer均为北京时间晚间的隔离OMP `deepseek/deepseek-v4-flash`、`thinking=max`；不是Coordinate/MultiNexus managed job。EXharness approved event为`evt-20260817T120818Z-5a7c1ac9`；
- Operator首轮全仓串行唯一命中既有Data Root lease环境争用（`886 pass / 1 fail`，capacity-inspection临时root lease unavailable）；该suite随后独立`4/0`，完整串行重跑最终`887 pass / 0 fail / 5913 expect()`（78 files）。`bun run typecheck`、`bun run build`、`git diff --check`、Harness validate（0 warnings）与doctor（0 errors，仅optional `harness-config.json` / `init.sh` missing）全部通过；
- 本切片未修改`operation-journal.ts`、capacity、startup、state journals、CAS writers或`index.ts`，未读Keychain、未联网、未发provider request、未运行真实generation、未commit/push/merge/deploy/closeout。下一步才是把这个exact internal kind接入module-private Operation core与shared capacity/single-flight，铸造一次性`GeneratedSetAdmissionCapability`；仍不在同一切片写public CAS。

## 2026-08-17 — DH-017 Phase 3 generated-set internal receipt classification

- `OperationJournal` 的私有 receipt classifier 现以固定三分支识别 public、`generation.namespace.install` 与 `artifact.publish-generated-set`；generated-set 分支直接复用既有 exact binding/result codec。`listBindings()` 会验证 hidden internal intent/result，但只返回 public bindings，没有扩大 `OperationBinding`、`AdmittedOperation`、`OperationSingleFlight` 或 package-root export；
- `inspectDataRootCapacity()` 同样识别 generated-set internal receipts，并继续按物理 intent/result entries 计算 used 与 pending-result reservation。首轮实现把额外 internal receipt 允许在所有 namespace phase，Reviewer 用 canonical birth/publish ordering 复现 P1；修复保持最小：只有 `terminal-installed` 可出现 generated-set receipt，`absent-no-intent`、`install-intent-pending` 与 `directory-published-result-pending` 全部 fail closed，没有引入 policy table 或新状态机；
- package-root `read/admit/beginRecovery/inspect/confirm/finalize/cleanup/single-flight` 对 structural/typed generated binding 仍在 first mutation 前拒绝；focused tests证明 receipts/staging不变，result-without-intent、wrong filename、noncanonical bytes、binding/result drift与三种nonterminal namespace均 fail closed；
- 本切片按北京时间晚间路由到本机 OMP `deepseek/deepseek-v4-flash`、`thinking=max`。EXharness handoff/assign为`evt-20260817T122344Z-fd0102db`/`evt-20260817T122344Z-5ddcb078`，Worker accept为`evt-20260817T122406Z-62f56834`；limited-fresh Reviewer首轮changes-requested后由同一Reviewer continuity复核，最终`approved / may_advance=yes / P0=P1=P2=0`，approval event为`evt-20260817T124634Z-5dedf508`；这些是local direct CLI + EXharness证据，不冒充Coordinate/MultiNexus managed job或Discord delivery；
- Operator最终独立门为focused`24 pass / 0 fail / 121 expect()`、全仓串行`897 pass / 0 fail / 5967 expect()`（78 files）；`bun run typecheck`、`bun run build`、`git diff --check`、Harness validate（0 warnings）与doctor（0 errors，仅optional `harness-config.json` / `init.sh` missing）全部通过；build只保留既有Vite externalization/large-chunk warnings；
- 本切片没有generated-set writer、admission capability、capacity handoff、Generation state append、startup publication recovery或public CAS；未读Keychain、未联网、未发provider request、未运行真实generation、未commit/push/merge/deploy。下一小片应先做全局generation-aware的publication capacity/single-flight preflight与一次性admission authority，再单独接durable intent writer；仍不把CAS writer揉进同一片。

## 2026-08-18 — DH-017 Phase 3 durable successful-output state chain

- 依赖顺序按第一性原理校正：在铸造 generated-set publication admission authority 前，先让 `GenerationRecordJournal` 能从 durable chain 唯一证明 `polling → outputs_ready → downloading → validating`；否则 admission 只能信任 caller 的内存 payload。新 full-chain decoder 从 committed `remote_bound` 与当前 poll budget 重建 output authority，并拒绝伪造、自洽但无祖先、跨 provider/job/request、member 跳变或非 candidate validating；
- `GenerationRecordJournal.readCurrent()`、append 与 pending resume 现在统一走 bounded full-chain validation；`outputs_ready → downloading` 只允许 byte-exact 初始 budget，后续 downloading 逐步复用既有 transition codec，`validating` 只接受全成员 final candidate 并作为本切片 stop state。没有新增 parallel journal、transaction framework 或 lifecycle coordinator；
- Reviewer 首轮发现一个小而真实的 recovery 缺口：head 已推进到 witnessed record 时，foreign `head+1` final 可能在 witness cleanup 后留下不可恢复孤立证据。修复只在任何 link/head/unlink 前重扫 bounded records shape；head 已推进且存在任何 committed chain 外 final 即 fail closed，保留 `.record.next`、witness 与 foreign final。正常 head 未推进的唯一 pending `head+1` 路径不受影响；
- 北京时间工作日上午按协作路由使用本机 ZCode Worker 与 limited-fresh ZCode Reviewer；运行时实际 provider model 为 `glm-5.3`，本机配置/default variant 为 `max`，但 native event 不单独证明 reasoning variant，因此不把配置值冒充 provider telemetry。Worker session `sess_03b220c0-a9b5-4b2d-82f4-ef963efd23b7`，Reviewer session `sess_15892115-991b-4bd0-b3ac-d265865a4b80`；这仍是 direct local CLI + EXharness evidence，不冒充 Coordinate/MultiNexus managed job或Discord delivery；
- Reviewer 先记录 changes-requested event `evt-20260818T015714Z-97333bcf`，同一 Reviewer bounded re-review 后最终 `approved / may_advance=yes / P0=P1=P2=0`，approval event `evt-20260818T020020Z-2c09fab0`；Operator 独立动态门为 focused `52 pass / 0 fail / 211 expect()`、全仓串行 `908 pass / 0 fail / 6019 expect()`（78 files），`bun run typecheck`、`bun run build`、Harness validate（0 warnings）与 doctor 均通过；
- 全局 `git diff --check` 唯一告警是既有共享 dirty `docs/project-harness/current/review-packet.md:857` EOF 空行；本切片四个 generation state/journal 文件的 scoped no-index whitespace check 干净。未为追求表面全绿修改无关共享文档；build 只保留既有 Vite externalization / large-chunk warning；
- 本切片未读 Keychain、未联网、未发 provider request、未运行真实 generation、未写 public CAS、未触碰 Gateway/Studio/World，也未 commit/push/merge/deploy。DH-017 整项仍未完成；下一小片现在才可实现全局 generation-aware publication capacity/single-flight preflight 与一次性 `GeneratedSetAdmissionCapability`，仍不在同一片写 durable intent 或 public CAS。

## 2026-08-18 — DH-017 Phase 3 durable publication eligibility join

- 在 capacity/admission 之前新增未从 package root 导出的只读 `generated-set-publication-eligibility.ts`：它要求同一 live Data Root/lease、exact durable intent、origin-checked publication plan，并通过 `GenerationRecordJournal` 的 bounded full-chain decoder证明当前 head exact为`validating`；结果只含 generation/provider、validating sequence/record digest、publication operation/binding digest与artifact set digest；
- `GenerationRecordJournal`只增加一个复用现有`#loadValidatedChain()`的package-internal只读accessor；candidate plan旁增加pure state-binding checker，复用`requireActiveDownloadPayload`并逐member比较role/order/cardinality、candidate name、file identity、content/descriptor/bounds；publication origin旁增加same-root accessor并继续重跑storage snapshot near-revalidation，没有复制lifecycle、inspector或CAS validator；
- selected Generation 的birth anchor由durable intent、chain sequence-0 admitted record与exact catalog pointer content/digest重算；Reviewer按底层authority区分确认：catalog pointer是canonical content/digest truth，同字节inode替换不会改变authority；private candidate inode则已被durable download record冻结，同字节替换仍必须拒绝。没有为了字面“replacement”给content-addressed证据堆无意义inode层；
- eligibility origin使用私有WeakMap绑定exact root/lease/intent/publication plan与validating head；forged/copy、cross-root/cross-lease、foreign intent/plan、stale/replaced head、record/catalog/intent drift、candidate inode/bytes/content/set drift均在revalidation零mutation失败。它仍是可重复只读证据，不是one-shot admission capability；
- 北京时间工作日上午继续使用本机ZCode Worker与独立ZCode Reviewer；runtime model实际为`glm-5.3`，本机配置/default variant为`max`但native event不单独证明reasoning variant。Worker session `sess_979596eb-6d89-4995-b82b-4cb339ac9221`，Reviewer session `sess_89455a48-0705-455f-931f-1898080f5dad`；Reviewer最终`approved / may_advance=yes / P0=P1=0`，两项非阻断P2仅记录局部canonical JSON重复与test helper错误类型较宽，按Occam不追加重构；approval event为`evt-20260818T022327Z-d4ddc317`；
- Operator独立门为focused`61 pass / 0 fail / 625 expect()`、全仓串行`915 pass / 0 fail / 6130 expect()`（79 files）；`bun run typecheck`、`bun run build`、Harness validate（0 warnings）与doctor通过。全局`git diff --check`仍只报既有`docs/project-harness/current/review-packet.md:857` EOF空行，本切片五文件scoped check干净；
- 本切片没有capacity/single-flight、Operation intent、`publishing` append、CAS/catalog/result writer或startup recovery，也未读Keychain、联网、发provider request、运行真实generation、commit/push/merge/deploy。下一小片现在可消费eligibility做全局capacity/single-flight preflight并铸造一次性`GeneratedSetAdmissionCapability`；仍不在同一片写public CAS。

## 2026-08-18 — DH-017 Phase 3 generated-set admission capability

- 新增未从 package root 导出的 `generated-set-admission.ts`，只消费同一 live root/lease 的 approved publication eligibility：重验当前 durable `validating` truth、exact first-generation `data/catalog/birth-staging` surface、terminal namespace、全部 receipt capacity truth以及publication intent/result/catalog target absent，随后调用既有capacity公式；没有复制receipt codec或修改capacity inspector；
- 当前MVP只接纳唯一born first Generation：第二个data/catalog entry、birth-staging evidence、wrong type/symlink、nonterminal namespace或任何已有generated-set internal receipt均为recovery-required。未来multi-generation不是在本片半实现；existing matching receipt属于后续replay/recovery，不冒充fresh admission；
- capacity输入固定为`{state:"validating",publicationEvidence:"none"}`与`request:"none"`，因此Generation已持有的future publication reservation保持exact 2，不重复申请。terminal-installed exact receipts下effective entries恒为奇数：2047 ready、2049 capacity-reached，2048数学上不可表示；Reviewer独立复算确认；
- `GeneratedSetAdmissionCapabilityV1`仅暴露safe kind/operationId/effectiveEntries，authority在私有WeakMap；同一live lease上byte-exact重复authorize返回同一capability，竞争plan/eligibility/intent fail closed。consume在origin inputs通过后先删除authority再重跑eligibility/surface/targets/receipts/capacity并比较exact snapshot，成功只返回origin publication plan；失败永久poison，forged/cross输入则不会误消费合法capability；
- 同步no-await handoff契约明确留给下一intent-writer：consume与首个同步durable mutation之间不插await；跨进程互斥继续由Data Root writer lease负责，没有为此重构public`OperationSingleFlight`或引入锁/transaction manager。Reviewer最终`approved / may_advance=true / P0=P1=0`，两项非阻断P2仅记录capacity/Generation错误域不同与drift后WeakMap stale entry，均无利用路径且按Occam不扩张；approval event为`evt-20260818T024231Z-03e18ebb`；
- Operator独立门为focused`28 pass / 0 fail / 296 expect()`、全仓串行`923 pass / 0 fail / 6256 expect()`（80 files）；`bun run typecheck`、`bun run build`、Harness validate（0 warnings）与doctor通过。全局`git diff --check`仍只报既有`docs/project-harness/current/review-packet.md:857` EOF空行，本切片两个新文件scoped check干净；
- 本切片没有写Operation intent、append`publishing`、改publicOperationJournal/SingleFlight、写CAS/catalog/result或改startup；未读Keychain、联网、发provider request、运行真实generation、commit/push/merge/deploy。下一小片可实现module-private exact generated-set intent writer：consume capability后同步no-replace publish+fsync intent，再重算capacity证明actual intent1+pending result1接管原reservation2；仍暂不写public CAS。

## 2026-08-18 — DH-017 Phase 3 durable generated-set intent handoff

- 新增未从 package root 导出的 `generated-set-intent-writer.ts`：唯一 live 入口同步消费 origin-valid one-shot admission 后，沿用既有 96-bit / 24 lowercase-hex flat Operation attempt；`mkdir 0700 → staging fsync → operation-intent.json 0600 file fsync → attempt fsync → no-replace hard-link receipt → receipts fsync`，再以 stable no-follow snapshot 证明 staged/receipt 同 inode、同 canonical binding bytes；失败保留证据，不做 overwrite、unlink 或猜测 cleanup；
- intent durable 后重新从 receipts 磁盘 truth 运行共享 capacity：`used +1`、`pending result +1`、`generationPublicationReservations 2→0`、`requestedEntries=0`，effective entries 与写前完全相同；public Operation count不变，internal count从唯一namespace Operation的1变为namespace+generated-set intent的2，result/catalog仍 absent，Generation head仍为`validating`；
- 返回的 deep-frozen admitted evidence不含绝对路径、raw writer、secret或provider request；attempt/intent path只保存在module-private WeakMap provenance，供下一片同root/lease下追加`publishing`时重验。没有改public`OperationJournal`、`OperationSingleFlight`或`index.ts`，也没有为一个internal kind引入transaction/registry framework；
- 北京时间工作日上午按协作路由使用本机 ZCode Worker与limited-fresh ZCode Reviewer。Worker session `sess_94da51cf-59e2-4e60-88d0-bd4539edd94c`，Reviewer session `sess_5d45c8f6-9ae5-425e-97b6-335b5092768f`；runtime evidence确认ZCode当前model request经本机配置选择`builtin:bigmodel-coding-plan/GLM-5.3`，但native JSON没有单独证明thinking variant，故不把`Max`配置意图冒充provider telemetry；
- Reviewer从底层`reservation 2 → durable intent 1 + pending result 1`目标、第一性原理与奥卡姆剃刀审查，最终`APPROVE / may_advance=true / P0=P1=P2=0`；正式approval event为`evt-20260818T031812Z-fcd21712`。Operator独立动态门为focused`29 pass / 0 fail / 366 expect()`、全仓串行`931 pass / 0 fail / 6437 expect()`（81 files），package/root typecheck、build、Harness validate（0 warnings）与doctor均通过；
- slice两个新文件的scoped diff check干净；global `git diff --check`唯一告警仍是Harness生成/共享的`docs/project-harness/current/review-packet.md:857` EOF空行，不属于产品slice，未为表面全绿修改无关共享文档。未读Keychain、未联网、未发provider request、未运行真实generation、未commit/push/merge/deploy；
- DH-017整项仍未完成。下一小片应只消费admitted intent provenance，near-revalidate exact durable intent与capacity takeover后append/fsync `publishing={operationId,artifactSetDigest}` Generation record/head；仍在public CAS first mutation前停止。随后才进入set-level hidden CAS/catalog/result writer与startup publication recovery，真实provider canary继续等待单独Human费用/参数授权。

## 2026-08-18 — DH-017 Phase 3 durable intent-to-publishing transition

- 新增未从 package root 导出的 `generated-set-publishing-transition.ts`：它不建立第二套 transaction，而是组合现有 admitted-intent provenance、publication eligibility、receipt/capacity inspection 与 `GenerationRecordJournal`；所有只读重验通过后，唯一 mutation 是 append/fsync `publishing={operationId,artifactSetDigest}` record/head；public Artifact CAS/catalog/result 始终未触碰；
- Generation state 只增加 exact `publishing` payload 与唯一 `validating -> publishing` 出边，并将 `publishing` 保持为本切片 stop state。successful replay 由 durable head阻断；有 pending Journal evidence 时由现有 `.record.next`/witness 协议阻断第二次 append，因此没有为形式上的 one-shot 再加 WeakSet 或新 capability 状态机；
- focused fault matrix 覆盖 next file、witness、final link、head.next、head rename/fsync与pending cleanup。无 witness 的 `.record.next` orphan被准确保留并fail closed，不伪称自动恢复；witness durable 后复用同 inode/digest 收敛。intent/candidate/birth/head/result/catalog/count/capacity漂移均在新的 `.record.next` 创建前拒绝；
- 北京时间工作日上午使用本机 ZCode。Worker session `sess_a34865fb-f76c-4ff3-8dc2-afc183a09516`；limited-fresh Reviewer session `sess_44440c04-ff60-421d-af77-59bc50fcb0b2`。当前非敏感配置显示 `builtin:bigmodel-coding-plan/GLM-5.3`，但native JSON仍未单独证明thinking variant，因此不把配置意图冒充provider runtime telemetry；
- Reviewer从底层intent-first handoff、第一性原理、奥卡姆剃刀与最小authority审查，结论`APPROVE / may_advance=yes / P0=P1=P2=0`；两项仅P3的uid/gid对称复验与attempt path重复推导均不影响真实authority，本轮按用户要求不为表面完美增加防御代码。正式approval event为`evt-20260818T040745Z-e18974e8`；
- Operator独立门：focused `40 pass / 0 fail / 259 expect()`；全仓串行 `941 pass / 0 fail / 6576 expect()`（82 files）；root typecheck、build、Harness validate（0 warnings）与doctor通过。Reviewer前后四个审查文件SHA-256一致，确认只读；build只保留既有Vite externalization/large-chunk warning；
- scoped tracked/untracked whitespace checks干净；global `git diff --check`唯一告警仍是Harness生成/共享的`docs/project-harness/current/review-packet.md:857` EOF空行，未为追求表面全绿修改无关共享文档。未读Keychain、未联网、未发provider request、未运行真实generation、未commit/push/merge/deploy；
- DH-017整项仍未完成。下一最小切片应实现set-level hidden CAS写入并保持catalog/result/public visibility仍未提交，随后单独做catalog+Operation result commit与startup publication recovery；真实provider canary继续等待独立Human费用/参数授权。

## 2026-08-18 — DH-017 Phase 3 hidden generated-set CAS writer

- 新增未从 package root 导出的 `generated-set-hidden-cas-writer.ts`：只接受同一 live root/lease、origin-valid publication plan 与 publishing-transition evidence，并在首个 mutation 前重验 current `publishing` head、Generation chain、staged/receipt intent same inode/body、result/catalog absent、private candidates/current storage observations与closed Operation attempt；没有信任 caller 提供的路径、bytes、records或可见性开关；
- 写入顺序固定为全部 bytes CAS → 全部 content record + by-bytes pointer → 全部 provenance records → set record。private candidate bytes通过no-replace hard-link进入`artifacts/sha256`；record/pointer/provenance/set只在既有admitted Operation attempt内使用确定性bounded staged file，file fsync与attempt-dir fsync后再no-replace hard-link并fsync目标parent。existing exact幂等复用，pointer exact但record缺失、pointer/record/body/inode/type/mode或foreign staging drift均保留证据并fail closed；
- 本片停止在完整hidden set：不写`artifacts/catalog/*`，不写Operation result，不推进`verified`，不清理private candidates/attempt，也不加入startup recovery或list/serve。故障可留下exact hidden orphan但没有公开可见性；下一片仍必须从durable files重建published join，不能把本片返回对象当免检authority；
- 按北京时间工作日午间路由使用本机 OMP `deepseek/deepseek-v4-flash`、`thinking=max`。Worker session `01a01339-3b1a-7000-be91-04c584e96705`；limited-fresh Reviewer session `01a01351-bb87-7000-b699-035af615e621`。两者都是local direct CLI + EXharness evidence，不冒充Coordinate/MultiNexus managed job或Discord delivery；
- Reviewer从底层hidden-commit目标、第一性原理与奥卡姆剃刀审查，独立运行focused tests后给出`APPROVE / may_advance=yes / P0=P1=P2=0`；两条P3只是单writer lease下不可达的保守EEXIST/staged重验边角，按用户的简洁性要求不追加防御代码。正式approval event为`evt-20260818T052741Z-d7d9ee74`；
- Operator独立门：focused目标+transition共exit 0；全仓串行`954 pass / 0 fail / 7219 expect()`（83 files）；root typecheck、build、Harness validate（0 warnings）与doctor通过，build只保留既有Vite externalization/large-chunk warning。slice scoped tracked/untracked whitespace checks干净；global `git diff --check`唯一告警仍为Harness生成/共享的`docs/project-harness/current/review-packet.md:857` EOF空行，未为表面全绿修改无关共享文档；
- 本片未读Keychain、未联网、未发provider request、未运行真实generation、未commit/push/merge/deploy，也未触碰Gateway/Studio/World/生产Coordinate/MultiNexus/Discord。DH-017整项仍未完成；下一小片应只做catalog hard-link visibility commit + exact Operation success result，再单独补startup publication recovery/published join/list-serve gate。真实provider canary继续等待独立Human费用/参数授权。

## 2026-08-18 — DH-017 Phase 3 generated-set visible commit

- 新增未从 package root 导出的 `generated-set-visible-commit.ts`，只消费 hidden-CAS evidence 的原始 object identity、同一 live root/lease、exact intent/publication plan 与当前 durable `publishing` head；在 catalog 首次 mutation 前、catalog durable 后/result mutation 前、最终返回 evidence 前共三次从 durable files 重建完整 published join，没有把 Worker 内存对象或 caller descriptor 当作磁盘真值；
- 提交顺序固定为：完整 hidden bytes/content/by-bytes/provenance/set join → staged catalog file + attempt fsync → no-replace catalog hard-link + catalog directory fsync → 完整 rejoin → staged result file + attempt fsync → no-replace internal Operation success result hard-link + receipts fsync → 最终完整 rejoin。catalog-only 明确保持 hidden pending并可由同一 live facade exact resume；result-only、missing member、cross-record drift或foreign inode一律保留现场并recovery-required；
- catalog/result 的EEXIST/replay只接受canonical bytes与staged/final same inode、exact 0600 regular、nlink≥2；intent同样要求staged/receipt same inode/body。伪造/复制/cross-root/cross-lease/cross-plan/cross-intent/stale head、symlink/wrong type/mode/body/extra staging与post-commit同字节replacement inode均有零覆盖、零清理反例。content-addressed bytes/records继续按既有digest/codec authority重读，不为其堆叠无意义的额外inode真值；
- 为复用既有逻辑，只把hidden writer内的plan-snapshot cross-check、attempt closed grammar、exact linked-file与parent-directory helper提升为package-internal named exports，并给publication plan增加post-hidden origin accessor/catalog digest helper；`index.ts`与public `OperationJournal`零改动，两个internal kinds仍无法通过public raw writer/finalize入口；没有引入generic transaction、repository、recovery registry或第二套journal；
- 北京时间工作日午间继续使用本机OMP `deepseek/deepseek-v4-flash`、`thinking=max`。EXharness handoff/assign为`evt-20260818T053308Z-92b5c595`/`evt-20260818T053308Z-98c7f996`，Worker accept为`evt-20260818T053321Z-a394283e`，provider-native session为`01a0135c-1abf-7000-a16a-92b41cd1761c`；limited-fresh Reviewer session为`01a0136b-e5f0-7000-8b53-007ee6439e8b`，未读取Worker RESULT/history；
- Reviewer从底层“完整set同时可见”目标、第一性原理与奥卡姆剃刀审查，最终`approved / may_advance=yes / P0=P1=0 / P2=2`。两项非阻断P2分别是当前frozen role/format矩阵下不可达的same-set duplicate-content未来兼容点，以及失败时可能留下empty catalog directory chain；二者均fail closed且不改变当前真值，按用户要求不为表面完美追加防御代码。正式approval event为`evt-20260818T055747Z-85090b37`；
- Worker全仓串行门为`967 pass / 0 fail / 7879 expect()`（84 files）；Reviewer独立运行visible focused`13/0/660`、相邻`22/0/853`、world-project全量`370/0/3762`与typecheck；Operator最终复跑visible focused`13/0/660`、root typecheck、Harness validate（0 warnings）与doctor通过。build在Worker门通过且仅有既有Vite large-chunk warning；
- scoped tracked/untracked whitespace checks干净；global `git diff --check`唯一告警仍为Harness生成/共享的`docs/project-harness/current/review-packet.md:857` EOF空行，未修改无关共享文档。未读Keychain、未联网、未发provider request、未运行真实generation、未commit/push/merge/deploy；
- DH-017整项仍未完成。下一最小切片应把已经durable的catalog/result通过同一published join证明后append/fsync唯一`verified` Generation record/head；随后单独实现startup publication recovery与list/serve gate。真实provider canary继续等待独立Human费用/参数授权。

## 2026-08-18 — DH-017 Phase 3 visible publication to terminal `verified`

- `generation-state.ts`新增exact terminal payload `verified={artifactSetDigest,publicationOperationId}`；唯一入边是`publishing → verified`，既有`publishing` payload与历史chain bytes保持不变，`verified`无任何successor；
- 新增未从package root导出的`generated-set-verified-transition.ts`。它只接受原始visible evidence object identity、同一live root/lease、exact intent/plan；在append或exact replay前调用visible-commit的package-internal revalidator，从durable catalog/result/intent/bytes/content/by-bytes/provenance/set与current head重建完整published join；
- 唯一durable mutation复用现有`GenerationRecordJournal.append("verified", ...)`，没有复制`.record.next`/witness/final/head/cleanup协议。head已durable但caller丢失返回时，fresh same-process调用只有在verified sequence、previous digest、payload与完整join都exact后才read-only replay，不追加第二record/digest；不执行Operation attempt或private download cleanup；
- record-journal fault coverage包含next、witness、final link、head publish与next/witness cleanup：pre-witness next现场保留并recovery-required，witness之后各边界唯一收敛到同一verified record。Marble/Hunyuan均证明exact一个terminal record、replay不增加record、catalog/result inode不变；forged evidence零Generation mutation；
- 北京时间工作日下午按协作路由使用Terra high subagent Worker `/root/dh017_verified_worker`，EXharness handoff/assign为`evt-20260818T060246Z-0036224b`/`evt-20260818T060247Z-a1919aa1`，accept为`evt-20260818T060318Z-6dcdbb40`。limited-fresh Terra high Reviewer `/root/dh017_verified_reviewer`不继承Worker上下文，也未读取Worker RESULT/session/current review packet/history；
- Reviewer最终`approved / may_advance=yes / P0=P1=0 / P2=1`。唯一P2是新coordinator入口没有重复前序visible-commit已经逐项覆盖的cross-root/lease/intent/plan与durable drift大矩阵；实际实现通过WeakMap origin + full revalidator关闭，focused又覆盖forged与fault matrix。按第一性原理与奥卡姆剃刀不复制整张测试表，只保留分层注记。正式approval event为`evt-20260818T062657Z-4fd9899c`；
- Worker最终全仓串行`970 pass / 0 fail / 7934 expect()`（84 files），focused`33/0/778`，root typecheck/build通过；Reviewer独立运行focused+journal、全仓串行、typecheck/build、Harness gates均exit 0；Operator复跑focused/typecheck并完成scoped whitespace、Harness validate（0 warnings）与doctor；build仍只有既有Vite/MuJoCo externalization与large-chunk warning；
- global `git diff --check`仍只报Harness生成/共享的`docs/project-harness/current/review-packet.md:857` EOF空行；本切片五个文件scoped check干净，未修改无关共享文档。未联网、未读Keychain、未发provider request、未运行真实generation、未cleanup、未commit/push/merge/deploy；
- DH-017整项仍未完成。下一片应只实现startup对`validating+intent`、`publishing+catalog-only`、`publishing/lagging+complete result`等generated-set现场的global read-only preflight与唯一收敛；list/serve gate继续独立，真实provider canary仍等待Human授权。

## 2026-08-18 — DH-017 Phase 3 startup generated-set publication tail

- 新增未从 package root 导出的 `generated-set-startup-recovery.ts`。startup 不复用上一个进程的 WeakMap/capability，而是从 live root/lease、Generation intent与完整validated chain、record physical snapshot、private candidate重新inspection、exact generated-set Operation intent/result、catalog、attempt same-inode lineage与storage join重建deep-frozen one-shot recovery plan；data/staging/attempt 均使用 bounded `opendirSync` incremental `limit+1`，没有新增generic recovery registry、transaction manager或第二套journal；
- `recoverPendingOperations()` 现在把 generated-set tail 纳入全局 Phase A；全部namespace/birth/generated/legacy evidence只读通过后，严格按canonical顺序先apply namespace install，再执行legacy Project/Artifact/bundle recovery，随后birth与generated-set tail。malformed generated catalog、terminal failure同时携带publication evidence或Phase-A后same-bytes replacement均在legacy first mutation前阻断并保留证据；
- startup分类闭合为：`validating+matching intent+public targets全absent`经shared durable capacity takeover后append/resume唯一`publishing`；`publishing+intent+无catalog/result`只返回follow-up、不猜测hidden CAS；catalog-only沿既有attempt closed grammar写/fsync/link exact result并rejoin后append`verified`；matching result但head仍validating时先证明actual publication receipts exact 2/reservation 0、append publishing，再保持catalog/result/member inode不变收敛verified；exact verified只读replay；publishing无intent、result-only、attempt extra、terminal冲突或任一cross-record drift均fail closed；
- capacity没有复制公式：只给既有`generated-set-publishing-transition.ts`增加package-internal shared receipt-capacity helper的`matching-intent-no-result | matching-intent-result`两种closed分类，继续从`inspectDataRootCapacity`与`calculateDataRootCapacity`重建，不接受caller counter；near-cap 2044..2048与matching-result actual2已纳入focused tests；
- 北京时间工作日下午按协作路由使用Terra high Worker `/root/dh017_startup_tail_worker`，EXharness handoff/assign为`evt-20260818T063312Z-76be2e04`/`evt-20260818T063312Z-ad44d396`，accept为`evt-20260818T063339Z-33122e0a`。limited-fresh Terra high Reviewer `/root/dh017_startup_tail_review`不读取Worker RESULT/session/current review packet；首轮与bounded re-review准确提出并闭合apply顺序、capacity、public target、lagging state、terminal conflict与attempt closure，最终`approved / may_advance=yes / P0=P1=P2=0`，正式approval event为`evt-20260818T071748Z-3db50ead`；
- Operator独立门：startup-tail/capacity/ordering focused `77 pass / 0 fail / 1062 expect()`；全仓串行`981 pass / 0 fail / 8003 expect()`（84 files）；root typecheck、build、Harness validate（0 warnings）与doctor通过。build只保留既有Vite browser-external与large-chunk warnings；
- scoped tracked/untracked whitespace checks干净；global `git diff --check`唯一告警仍是Harness生成/共享的`docs/project-harness/current/review-packet.md:857` EOF空行，未为表面全绿修改无关共享文档。未联网、未读Keychain、未发provider request、未运行真实generation、未cleanup、未commit/push/merge/deploy；
- DH-017整项仍未完成。本片有意把`publishing+intent`但hidden CAS/catalog/result均缺的现场保留为durable follow-up；下一最小片应从durable candidates/intent/chain重建hidden generated-set CAS并在startup唯一续写到本片已批准的tail recovery，仍不混入list/serve或cleanup。真实provider canary继续等待独立Human费用/参数授权。

## 2026-08-18 — DH-017 Phase 3 startup hidden CAS resume

- hidden generated-set CAS 保持唯一写入算法：`generated-set-hidden-cas-writer.ts`把既有live mutation body抽成`writeHiddenCasCore`，live入口继续要求原publishing-transition provenance；startup入口只在完整重建publishing head、intent/binding、private candidates、fresh inspector/candidate/publication plan、attempt closed grammar、storage partial shape与matching-intent capacity后铸造module-private WeakMap one-shot resume handle，apply近快照重验后进入同一core并产出原有genuine `GeneratedSetHiddenCasEvidenceV1`；
- `generated-set-startup-recovery.ts`的`follow-up`不再no-op：startup hidden resume完成后把真实hidden evidence交给既有`commitGeneratedSetVisible()`，再把visible evidence交给既有`transitionGeneratedSetVisibleToVerified()`；每个模块在前一阶段mutation后独立重验durable truth，没有复制catalog/result/Generation writer。Marble/Hunyuan从hidden全absent、代表partial、hidden complete均经真实`recoverPendingOperations()`收敛，catalog-link handoff crash可restart；
- 独立Reviewer通过真实入口测试发现两层先前隐藏的全局阻断并推动最小修正：第一，`OperationJournal.listBindings()`过滤internal kind后，generated-set attempt会被global staging coverage当未知；现由startup plan私有root/lease/snapshot provenance只暴露exact validated attempt给Phase A/C covered set，foreign/extra仍拒绝。第二，birth preflight曾把所有Generation都套`admitted + downloads empty`规则；现在只有`admitted`会mint birth apply，advanced chain仍验证full chain/physical journal/birth anchor/catalog与closed downloads，并从最后一个validated all-candidate`validating` record精确重建retained candidates；publishing/verified join仍归generated-set Phase A；
- verified第二次真实startup为只读replay：catalog/result bytes、Generation record count、private candidate inode全部不变；terminal retained candidate目录出现foreign entry则recovery-required且保留既有公开/私有证据。Phase-A后candidate/head/receipt/capacity/attempt drift也在下一CAS mutation前拒绝；没有借此增加cleanup authority；
- 北京时间工作日下午继续使用Terra high Worker `/root/dh017_startup_hidden_worker`，EXharness handoff/assign为`evt-20260818T072455Z-426c118a`/`evt-20260818T072455Z-ce60efcf`，accept为`evt-20260818T072601Z-1f484f59`。limited-fresh Terra high Reviewer `/root/dh017_startup_hidden_review`不读取Worker RESULT/session/current review packet；两轮changes-requested闭合真实attempt coverage、advanced-birth与verified replay，最终`approved / may_advance=yes / P0=P1=P2=0`，approval event为`evt-20260818T081332Z-46342d7a`；
- Operator独立门：hidden/birth/startup focused `71 pass / 0 fail / 1037 expect()`；全仓串行`988 pass / 0 fail / 8092 expect()`（84 files）；root typecheck、build、Harness validate（0 warnings）与doctor通过。build仍只有既有Vite browser-external/large-chunk warnings；
- scoped tracked/untracked whitespace checks干净；global `git diff --check`唯一告警仍为Harness生成/共享的`docs/project-harness/current/review-packet.md:857` EOF空行，未修改无关共享文档。未联网、未读Keychain、未发provider request、未运行真实generation、未cleanup、未commit/push/merge/deploy；
- DH-017整项仍未完成。startup现在可从durable publishing intent/private candidates一路收敛到verified；下一最小片应建立phase-aware list/serve gate：只有完整published join与verified state同时成立时才对Product UI/Gateway可见，并保持World与四工具authority不变。cleanup与真实provider canary继续独立后置。

## 2026-08-18 — DH-017 Phase 3 phase-aware generated-set visibility reader

- 新增安全 package facade `GeneratedArtifactReader`：只接受 live `OpenedDataRoot`，公开 `list()` 与 `read(generationId, assetId)`；不接受raw path/digest/record/descriptor/inode，不要求writer lease，也不暴露visibility evidence、join helper或mutable authority。package root仅新增reader、safe DTO与error types，既有DH-013 `ArtifactStoreReader`仍为独立static来源；
- `list()`以bounded directory-handle枚举`artifacts/catalog`（256/257边界），但catalog只作为入口。每一项都从durable birth pointer、Generation intent与完整validated chain重建，要求current terminal为exact `verified`，并重导publication operation/binding，验证final+staged publication intent/catalog/result三组canonical 0600 same-inode hard-link lineage，再重读set、ordered content/provenance、by-bytes pointer与CAS bytes，fresh inspector逐字段闭合后才形成deep-frozen safe summary；
- `read()`只能以可见set中的`generationId + assetId`选member；它重复完整join，比较catalog/bytes identity并用stable `O_NOFOLLOW` bounded snapshot重读后返回fresh byte copy。Marble只能0或exact ordered两member，Hunyuan只能0或exact一member；catalog-only、pre-verified、missing member、partial CAS、unknown/cross-set asset与contradictory evidence都不可list/serve；
- limited-fresh Terra high Reviewer首轮从底层“用户只能看到0或完整set”发心发现四项P1：缺role→format、缺publication intent lineage、root staging physical scan无总cap、固定parent目录缺identity闭包。修复仅在reader内增加三条join guard和固定目录链`O_DIRECTORY|O_NOFOLLOW` identity snapshot/revalidation；没有引入`openat`/repository/cache/query/FS framework。direct反例覆盖错误role-format、intent same-bytes replacement、2049 staging entry、catalog parent symlink与mid-join parent replacement，bounded re-review最终`approved / may_advance=yes / P0=P1=P2=0`；
- EXharness handoff/assign为`evt-20260818T082136Z-27ea9197`/`evt-20260818T082137Z-510939d2`，Worker accept为`evt-20260818T082254Z-4c850cba`；首轮changes-requested event为`evt-20260818T084643Z-4aa72b49`，最终approval event为`evt-20260818T085856Z-2c4dc00c`。本片按北京时间工作日下午使用Terra high Worker/Reviewer subagents，不冒充Coordinate/MultiNexus managed runtime job或Discord delivery；
- Operator独立门：focused `34 pass / 0 fail / 767 expect()`；全仓串行`997 pass / 0 fail / 8123 expect()`（84 files）；root typecheck、build、Harness validate（0 warnings）与doctor通过，build仍仅有既有Vite/MuJoCo browser-external与large-chunk warning。scoped tracked/untracked whitespace checks干净；global `git diff --check`唯一告警仍为共享`docs/project-harness/current/review-packet.md:857` EOF空行，未修改无关共享文档；
- 本片未联网、未读Keychain、未发provider请求、未运行真实generation、未cleanup、未commit/push/merge/deploy，也未新增Gateway/Studio/World route。DH-017整项仍未完成：下一最小垂直片应把已有ProductSession confirmation、first-generation durable admission与provider-specific service接成confirmed pre-submit/submit lifecycle，并继续把真实付费调用置于独立Human canary gate；Gateway生成列表/serve route与Studio UI可在该safe reader之上另立薄层。

## 2026-08-18 — DH-017 Phase 3 generated Artifact read-only Gateway API

- 新增薄层`generated-artifact-api.ts`，只提供exact `GET /api/artifacts`与`GET /api/artifacts/:generationId/:assetId`。list返回`{schemaVersion:1,sets}`；member route只把严格percent-decode且pattern合法的`generationId + assetId`交给`GeneratedArtifactReader`，没有raw path/digest、static registry或hidden-CAS fallback；
- HTTP adapter在同一request内以safe list summary做read前后membership/metadata equality检查，media type、content-length与generation/asset/content-digest headers都来自verified member summary；query/body/range/method、slash/backslash/NUL/extra segment、pre/post abort、unknown/cross-set asset与summary drift均收束为stable public code。异常只返回`{code}`并带`no-store`/`nosniff`，不回显filesystem/provider/raw message；
- `WorldProjectRuntime`在reader/writer两种mode都构造同一个只读`GeneratedArtifactReader`，没有为GET获取第二writer lease或触发recovery。production与scripted fixture composition保持static `/api/assets`优先，generated routes位于ProductSession catch-all之前；World Project v1、Studio与四个Agent tools未改变；
- 本片没有cache、registry、repository、pagination framework、timer/poller或background loop。Studio UI、confirmation/lifecycle、provider side effect、writer/recovery/cleanup均未混入；
- 北京时间工作日下午使用Terra high Worker `/root/dh017_generated_api_worker`与独立Terra high Reviewer `/root/dh017_generated_api_review`。EXharness handoff/assign为`evt-20260818T090625Z-203ab656`/`evt-20260818T090625Z-f7816d79`，accept为`evt-20260818T090804Z-738b9c44`；Reviewer最终`approved / may_advance=yes / P0=P1=0 / P2=1`，approval event为`evt-20260818T092433Z-b80a7c9c`；
- 唯一P2是把已实现并手工核对的`%5C/%00`、GLB成功header、通用异常脱敏与reader-mode→Gateway组合再固化为更多direct tests。它不对应实现缺陷；按简洁性原则不复制额外测试矩阵，保留为后续回归补强注记；
- Operator独立门：focused API/runtime/static回归`10 pass / 0 fail / 62 expect()`；全仓串行`1001 pass / 0 fail / 8153 expect()`（85 files）；root typecheck、build、Harness validate（0 warnings）与doctor通过，build仍仅有既有Vite/MuJoCo browser-external与large-chunk warning。scoped tracked/untracked whitespace checks干净；global`git diff --check`唯一告警仍是共享`docs/project-harness/current/review-packet.md:857` EOF空行，未修改无关共享文档；
- 本片未联网、未读Keychain、未发provider请求、未运行真实generation、未commit/push/merge/deploy。DH-017整项仍未完成；下一步可在两个同样清晰的小片中二选一：Studio只读generated Artifact panel，或confirmation→single-flight→durable admitted的零provider-call lifecycle authority。真实付费submit/canary仍必须独立Human授权。

## 2026-08-18 — DH-017 Phase 4 Studio 只读 Generated Artifact 面板

- Studio inspector 新增小型 `Generated Artifacts` 面板，只消费 exact `GET /api/artifacts` safe DTO；mount 时读取一次并提供显式刷新，单一 `AbortController + generation token` 阻止旧响应覆盖新状态。没有 timer、poller、cache、store framework、新 dependency 或动画；member bytes 只通过由 safe `generationId + assetId` percent-encode 得到的普通下载链接按用户动作获取；
- client 以 closed runtime decoder 验证 schema/version、exact keys、provider、generation/asset/digest、canonical bounds、256-set cap，以及 Marble exact ordered 2-member / Hunyuan exact 1-member contract；重复 `generationId` fail closed。跨 generation/provider 的同 content `assetId` 继续合法复用，符合 content-addressed many-to-one 事实，不被错误的全局 asset-id 去重拒绝；409/503/其他异常只显示有限 Studio 文案，不回显 response/provider/filesystem raw message；
- UI 明确同时显示文本状态 `VERIFIED` 与 `CALIBRATION MISSING`，并逐 member 显示 role、format、bytes、elements 与下载链接；说明资产不会自动加入 viewport 或 World。没有 generation form、prepare/confirm、auto-place、ThreeViewport injection、Snapshot/Entity/World Project mutation或第五个Agent tool；现有字体、token、button与responsive layout保持，不引入Motion/GSAP；
- 为避免为了测试引入DOM/framework，把四态与展示字段收束为package-local pure view函数；focused覆盖loading/empty/error/list、双状态必须同显、encoded link、duplicate generation rejection与cross-provider same-asset复用。source-boundary test对client/view/panel全部valid TypeScript import declaration（含bare side-effect import）做exact allowlist，证明无World/Three/provider/writer/journal/CAS/auto-place依赖，且只有client对`/api/artifacts`发一次list request；
- 北京时间工作日下午按协作路由使用Terra high Worker `/root/dh017_studio_artifacts_worker`与独立Terra high Reviewer `/root/dh017_studio_artifacts_review`。EXharness handoff/assign为`evt-20260818T093723Z-6b4c066f`/`evt-20260818T093723Z-f68e97b5`，accept为`evt-20260818T093851Z-a16113ed`；Reviewer首轮与两次bounded re-review推动panel test、duplicate generation判重与完整import allowlist，最终`approved / may_advance=yes / P0=P1=P2=0`，approval event为`evt-20260818T101344Z-cf73a03a`；
- Operator独立门：focused `7 pass / 0 fail / 46 expect()`；全仓串行`1008 pass / 0 fail / 8205 expect()`（87 files）；root typecheck、build、Harness validate（0 warnings）与doctor通过。build只保留既有Vite/MuJoCo browser-external与large-chunk warnings；本片没有构造伪造verified Data Root，因此未为截图扩大fixture/browser authority；
- 七个Studio文件scoped tracked/untracked whitespace checks干净；global `git diff --check`唯一告警仍为共享`docs/project-harness/current/review-packet.md:857` EOF空行，未为表面全绿修改无关Harness产物。本片未联网、未读Keychain、未发provider请求、未运行真实generation、未commit/push/merge/deploy；
- DH-017整项仍未完成。下一最小切片应回到核心付费边界，只实现`ProductSession confirmation → single-flight → durable admitted/pre-submit`的零provider-call lifecycle authority，并继续在真正submit前停止；真实Marble/Hunyuan付费canary仍须后续implementation review通过后的独立Human参数与费用授权。

## 2026-08-18 — DH-017 Phase 4 confirmed durable admission

- Gateway 新增 exact `POST /api/sessions/:sessionId/generations/prepare` 与 `POST /api/sessions/:sessionId/generations/:generationId/confirm`。`ProductSessionRegistry` 的 active route session 是唯一 session authority；strict `application/json`、16 KiB body、fatal UTF-8、duplicate-key 与 exact-key 检查均在业务动作前完成，header/cookie/query/body 不能覆盖 route identity；
- `GenerationConfirmationStore` 继续只公开冻结的 confirmation/preview truth，prepared provider request 与 server-injected contract selection 仅保留在进程内私有 entry，并通过最小 `inspect/consume` seam 供 admission coordinator 使用。prepare 零 Data Root mutation，confirm 在任何 token consume 前先按 route generationId 读取 durable truth；exact admitted replay不依赖旧token，binding/requestDigest冲突不消费新token；
- generationId single-flight 内唯一 leader 重导 binding、校验 prepare/confirm 期间 contract profile/digest 未漂移、消费 exact same-session confirmation，然后调用既有 `FirstGenerationCoordinator`。namespace installer、receipt-derived capacity、birth journal 与 durable admitted record/head/catalog pointer 协议没有在 Gateway 重写；followers不二次消费，request abort不会取消已开始的leader；整个切片没有导入或调用Marble/Hunyuan service、transport、credential或后续lifecycle；
- 按北京时间工作日18:00后路由使用本机 OMP `deepseek-v4-flash`、`thinking=max`。Worker session `01a01462-0ba2-7000-8e67-ba2fd8570bf0`，独立只读 Reviewer session `01a014b2-1d5b-7000-be14-e2315aa7da0a`；两者均为local direct CLI + EXharness evidence，不冒充Coordinate/MultiNexus managed job或Discord delivery；
- EXharness handoff/assign为`evt-20260818T101912Z-3be5e536`/`evt-20260818T101912Z-f0a65893`，Worker accept为`evt-20260818T101934Z-baa6b033`，review request为`evt-20260818T114635Z-bc2577be`。Reviewer从产品发心与durable truth优先级独立审查，最终`approved / P0=P1=0`；正式approval/release事件为`evt-20260818T115435Z-eba9bf7f`/`evt-20260818T115435Z-29ddb352`；
- Reviewer动态门为focused `73 pass / 0 fail`、全仓串行`1037 pass / 0 fail / 8409 expect()`（88 files），root typecheck、build、Harness validate（0 warnings）与doctor通过。三项非阻断P2只记录：并发follower可能继承leader一次pre-consume失败、later lifecycle state的confirm目前安全fail-closed、abort test存在20ms时序假设；均不值得在本切片扩张框架；
- scoped `git diff --check -- apps packages scripts`干净；global `git diff --check`仍只报共享`docs/project-harness/current/review-packet.md:857` EOF空行，未为表面全绿修改无关Harness产物。未联网、未读Keychain、未发provider request、未运行真实generation、未commit/push/merge/deploy；
- DH-017整项仍未完成。下一最小切片应把 durable `admitted` 接到 provider-independent pre-submit checkpoint：先在 GenerationJournal 持久化唯一 `submit_started`（或本地可恢复的`pre_submit_blocked`），再由后续独立切片调用 provider-specific service；本片继续不触真实provider/canary，且不把poll/download/publication或UI状态框架揉进来。

## 2026-08-18 — DH-017 Phase 5 durable pre-submit checkpoint

- 新增 `FirstGenerationPreSubmitCoordinator`，把 durable `admitted` 收敛为唯一 `submit_started={submitAttempt:1}`，或四个 closed local code 之一的 `pre_submit_blocked={code,preSubmitResumeCount:0}`；`WorldProjectRuntime.firstGeneration.checkpoint()` 只暴露 `generationId + trusted recordedAt + closed decision`，root/lease/journal/pointer/path/provider error 均不出 package boundary，Gateway 没有新增 submit route；
- 实现没有建立 lifecycle framework、repository、第二 journal 或重复文件系统 codec。它复用 `GenerationRecordJournal` 的 `.record.next`/witness/head 协议、现有 receipt-derived capacity、`GeneratedArtifactReader` 的 publication absence truth，以及 birth journal 内一个窄的 `inspectBornPointer()` 只读证明；该证明只验证 terminal namespace、bounded catalog/birth-staging、sequence-0 admitted 绑定的 canonical pointer 与 pointer inode，不错误拒绝合法 `head.next` journal 瞬态；
- fresh append 与 admitted+matching pending resume 都执行完整 proof → hook → byte-exact reproof，之后才允许 append 或 `resumePending()`。Reviewer 首轮发现 pending 路径在 birth/capacity/catalog 重验前可能先推进 head/清理 witness，判定 P1；修复后 missing、foreign、same-bytes-new-inode birth pointer 均在零 resume/cleanup mutation 下 fail closed，同时六个 supported journal kill point继续收敛到同一 digest/recordedAt，不以牺牲恢复性换取表面防御；
- 北京时间工作日晚间按既定路由使用本机 OMP `deepseek-v4-flash`、`thinking=max`。Worker native session `01a014bb-dc8b-7000-a3d6-8c51e9d18d6e`；独立 Reviewer native session `01a014d9-70a9-7000-83d0-c2d5c156437d`。EXharness handoff/assign/accept 为 `evt-20260818T115716Z-726ad043` / `evt-20260818T115716Z-0f51a8c9` / `evt-20260818T115734Z-6130060c`；首轮 changes-requested 为 `evt-20260818T123806Z-9ab0b892`，最终 approval/release 为 `evt-20260818T125330Z-aadc69ef` / `evt-20260818T125330Z-b7e3ec06`；均为 local direct CLI + EXharness evidence，不冒充 Coordinate/MultiNexus managed job或 Discord delivery；
- Worker 最终全仓串行门为 `1064 pass / 0 fail / 8662 expect()`（89 files），root typecheck通过；Reviewer bounded re-review 为 `approved / P0=P1=0`，focused coordinator `27/0`、birth+record journal `23/0`、typecheck与scoped diff通过。Operator独立复跑四个核心 suites `52 pass / 0 fail / 380 expect()`、root typecheck、Harness validate（0 warnings）与doctor通过；
- Reviewer 保留三项非阻断 P2：跨进程重启若 caller 没有持久化原 `recordedAt` 会安全 fail closed、capacity/syscall error code 尚未统一、没有字面双进程并发探针。它们不改变当前单 writer durable truth，按奥卡姆剃刀不在本片追加框架或冗余防御；global `git diff --check`既有 Harness EOF告警继续与产品 slice 分离。未联网、未读 Keychain、未发 provider request、未运行真实 generation、未 commit/push/merge/deploy；
- DH-017 整项仍未完成。下一最小片应只做 provider-specific fake submit orchestration：消费 durable `submit_started`，调用已存在的 Marble/Hunyuan direct service 的注入 fake transport，按 frozen provider-specific matrix 持久化 `remote_bound` / `provider_failed` / `submission_ambiguous`，并继续禁止真实凭据、真实网络与付费 canary；poll/download/publication/UI 不并入该片。

## 2026-08-19 — DH-017 MVP simplification reset

- Human 将当前优先级明确调整为“先最小可用闭环，再用真实需求决定健壮性与审计投入”。canonical plan 新增 Human Authority 覆盖条款：MVP 只保留一次 paid submit、journal 唯一 successor/pending 收敛、未 verified artifact 不公开、credential 留在服务端四条底线；
- early pre-submit/result transition 不再重复扫描 birth pointer、完整 physical journal inode surface 与 generated-set catalog/reader join。这些事实回到 admission/startup/publication/reader 的拥有边界；内部 typed request 也不再为 extra key/getter/prototype 复制 hostile-object decoder；
- 删除 95 行 `generation-journal-evidence.ts`，改为 57 行直接的 `generation-transition-capacity.ts`；移除两个 coordinator 的 proof→hook→byte-exact reproof 与无生产用途 test seam，只在 mutation 前读取一次 validated chain/pending 与 receipt-derived capacity，append/recovery 继续完全复用 `GenerationRecordJournal`；
- 删除只服务于上述重复防御层的 same-bytes replacement、birth/publication repeat-scan 与人工 inspection-drift tests；provider orchestrator 也不再重复两套 service 已覆盖的完整 HTTP/body/transport 矩阵，只保留两家成功、Marble 代表性明确拒绝、两家代表性 ambiguous、binding mismatch、两处 crash、并发最多一次与 absent。三组 focused 为 `58 pass / 0 fail / 440 expect()`，其中 orchestrator `10/0/50`；全仓最终结果见本节后续 gate 记录，root typecheck 通过；
- 最终全仓串行 gate 为 `1096 pass / 0 fail / 8860 expect()`（91 files）；root typecheck/build、scoped diff check 与 Harness validate/doctor 均通过。此轮不新增 framework、repository、capability/evidence graph、网络、Keychain、真实 provider call、真实 generation 或 Git mutation。下一步只补 fake provider 的 poll/download→inspect→verified list/read→Studio 纵向闭环；额外 inode provenance、全面 adversarial matrix 与 audit log 暂列观察项，不再自动扩张。

## 2026-08-20 — DH-017 fake provider 最小纵向闭环

- 新增 package-internal `FakeGenerationCompletionCoordinator`：只从 exact durable `remote_bound` 出发，接收进程内固定 Marble/Hunyuan output identity 与固定 SPZ/GLB bytes；先完成 bytes/role/order 检查，再按现有状态机的最短合法链写入一次 poll、candidate 与 `validating`；没有真实 URL 下载、retry/backoff/scheduler、第二 journal、repository、registry、event bus 或通用 recovery framework；
- `validating` 之后完全复用已有 `inspectDynamicArtifactBytes`、candidate/publication plan、capacity admission、publication intent、hidden CAS、visible commit、`verified` transition 与 `GeneratedArtifactReader`。协调器不从 package root 导出，也不改 Gateway/Studio/provider composition；现有 Gateway/Studio read path 因 reader durable truth 已可看到该 verified set；
- focused `3 pass / 0 fail / 24 expect()`：Marble 两成员、Hunyuan 单成员均完成 `remote_bound -> verified -> list/read`，读回 bytes 与固定输入一致；exact verified replay 不新增 record；malformed bytes 与错误 role 在第一条 poll mutation 前拒绝且 reader 仍为空；
- root typecheck/build、Harness validate（0 warnings）与 doctor 通过。第一次可信全仓串行运行出现一个既有 `generated-set-hidden-cas-writer` 临时 lease 获取失败（`1098 pass / 1 fail`），该精确 suite 随即 `20/20` 通过；无并行负载后再次完整串行取得 `1099 pass / 0 fail / 8884 expect()`（92 files）；
- scoped tracked/untracked whitespace checks干净。global `git diff --check`唯一告警仍为共享 `docs/project-harness/current/review-packet.md:857` EOF空行，未修改该无关文件。未联网、未读Keychain、未发provider请求、未运行真实generation、未commit/push/merge/deploy；
- 这完成的是自动化 fake vertical loop，不是 DH-017 全部产品闭环：尚未把 fake completion 接成用户可触发的本地HTTP/Chromium流程，也没有真实 provider canary。下一步只应做一个 dev-only fake HTTP/Chromium happy path；真实网络、重试与额外审计继续等真实需求再决定。

## 2026-08-20 — DH-017 dev-only HTTP / Studio fake MVP 闭环

- 新增显式 `POST /api/dev/fake-generation`，只装配在 `scripted-fixture-main.ts`。它无 query/body、无 provider selector，固定复用仓库内 Hunyuan GLB fixture，经已有 first-generation admission、pre-submit、fake completion 与 publication 链收敛为一个 `verified` set；production `main.ts` 与 package `index.ts` 均未暴露该 route；
- `WorldProjectRuntime` 只增加 opt-in `enableDevelopmentFakeGeneration`，默认 writer/reader runtime 的 `developmentFakeGeneration` 都是 `null`。没有新增 feature-flag framework、registry、poller、retry、provider adapter、真实网络或 UI generation form；
- Chromium 真实验证从本地 scripted Gateway 触发一次 fake generation，再由 Studio 既有 Generated Artifacts 面板读取普通 `GET /api/artifacts`：页面显示 Hunyuan、`VERIFIED`、`CALIBRATION MISSING` 与 `object-glb`；下载链接返回 `200 model/gltf-binary`、`26256` bytes。验证过程中发现 Studio client 把 bare `fetch` 存为实例字段后失去浏览器 receiver，按最小修复改为 `globalThis.fetch.bind(globalThis)`；
- focused 最终为 `14 pass / 0 fail / 103 expect()`；root typecheck/build 通过。全仓首轮唯一失败是既有 hidden-CAS 测试临时 writer lease unavailable，隔离复跑 `20/20`；随后完整串行重跑为 `1101 pass / 0 fail / 8900 expect()`（93 files）；
- 本地 Gateway/Studio 与临时 Data Root 仅用于 fake fixture 验证，结束后关闭并清理。未联网、未读 Keychain、未发 provider 请求、未运行真实 generation、未 commit/push/merge/deploy；
- 至此 DH-017 的本地 fake MVP 已形成用户可见闭环：显式开发触发 → durable verified artifact → Gateway list/read → Studio 展示/下载。DH-017 的真实 provider canary 仍是独立 Human 费用与参数授权边界；在出现真实需求前，不再自动增加 inode provenance、全量审计矩阵或通用恢复框架。

## 2026-08-20 — DH-017 真实 provider canary 停在 Hunyuan contract capture

- Human 冻结两家 provider/model/prompt/费用与各一次 submit；按 MVP 原则改为每 provider 一个隔离 fresh Data Root，不实现 multi-generation 或 poll/download crash-resume framework。
- Terra high Worker 完成最小 Operator-only runner，全仓串行 `1113 pass / 0 fail / 8954 expect()`；独立 Reviewer 经 bounded 修复后最终 `approved / may_run_live_canary=yes / P0=P1=P2=0`。
- Operator 重新核对官方 model/pricing，两个 Keychain locator 均存在，且未输出 secret。真实执行先做 Hunyuan 已有 JobId 的唯一 no-generation capture，该 capture 以 `DH017_CANARY_STOPPED` 终止。
- Hunyuan root 只有 bootstrap 空目录，无 `receipts/generations`、intent/state/`submit_started`/`remote_bound`/Artifact；因此 Hunyuan paid submit=0。按停止条件，Marble 也未调用，paid submit=0。本次无真实 Artifact/Gateway/Studio 证据，脱敏详情见 `tasks/DH-017/live-canary-receipt-20260820.md`。
- 当前等待 Human 二选一：额外授权一次 Hunyuan shape-only diagnostic query，或放弃 Hunyuan 并单独授权继续 Marble。未获新授权前不再调 provider。

## 2026-08-20 — DH-017 Hunyuan shape-only diagnostic Worker 实现（含一起 Worker 越界事件）

- 按 `implementation-request-hunyuan-shape-diagnostic.md`，Worker 只新增一个 pure inspector 与一个 Operator-only script seam（各带一个测试文件），复用现有 `parseExactJsonBytes`（bounded exact JSON parser）、`readKeychainCredential` 与 `hunyuanQueryUrl()`；未引入 schema framework、telemetry、raw-response logger 或 provider adapter。
- `apps/agent-gateway/src/hunyuan-shape-inspector.ts`：递归只保留 `object|array|string|number|boolean|null` 与 sorted field names；array 只保留长度上界内 unique item shapes；不保留任何 scalar value；输出 exact `{schemaVersion:1,httpStatus,profileCandidate,shapeDigest,shape}`；`shapeDigest` 是 domain-separated（`demiurges-hunyuan-live-shape-v1\0`）canonical descriptor bytes 的 SHA-256，非 raw response digest；depth/node/collection/field-name 预算独立 fail-closed。
- `scripts/run-dh017-hunyuan-shape-diagnostic.ts`：Operator-only seam。exact `POST /v1/ai3d/query`、body 只有已验证 `^[0-9]{1,32}$` JobId、credential 只在 `Authorization`、恰好一次 fetch、`redirect:"error"`、30s total deadline、256 KiB streamed body；HTTP 非 200 或 malformed/duplicate-key/oversized/depth-node-limit 一律只输出 `DH017_HUNYUAN_SHAPE_DIAGNOSTIC_STOPPED`，不重试。
- 测试覆盖：sentinel 不泄露（JobId/RequestId/signed URL/error text/cost/prompt/api key 的 JSON 输出均不含）、exactly one fetch、256 KiB、duplicate-key/fatal UTF-8、noncooperative fetch/body/cancel 均受 deadline 约束且无 late unhandled rejection、pre-aborted 与非法 JobId 在 credential/fetch 前停止、golden digest vector。focused `20 pass / 0 fail / 123 expect()`；agent-gateway 全套 `188 pass / 0 fail / 1073 expect()`；全仓串行 `1136 pass / 0 fail / 9085 expect()`（98 files）；root typecheck 通过；新增文件无 trailing whitespace；global `git diff --check` 唯一告警仍为既有 `review-packet.md:857` EOF 空行。
- **越界事件（必须记录）**：Worker 在验证 CLI 参数门时误执行了一次真实路径冒烟：合法真实 JobId 的 Operator-only CLI 返回 exit 0。源码与 session tool evidence 证明该 CLI 仅能在一次 fetch 获得 HTTP 200、bounded exact JSON 与 shape inspector 全部成功后以 0 退出，因此可确认该次运行读取了 Keychain 并发出一次 authenticated Hunyuan query，已经消耗获批的“恰好一次额外 Hunyuan query”授权。命令把 stdout/stderr 重定向到 `/dev/null`，故 raw response、scalar value、credential 与 shape descriptor 均未输出或持久化；descriptor 不可恢复。该 CLI 不含 generation submit，Data Root 未触碰，paid submit 仍为 0。Operator 发现后立即终止 Worker；不得自动重跑，任何额外 query 都需新的 Human 明确授权。
- 本 slice 未 commit/push/merge/deploy，未运行 generation，未触碰 Data Root。Worker 验证结论不等于 independent reviewer approval；Reviewer 需按 review gate 离线复核（sentinel 不泄露、noncooperative 有界、`P0/P1=0` 且 `may_run_shape_diagnostic=yes` 后才交还 Operator）。

## 2026-08-20 — DH-017 Hunyuan live contract capture 与 freeze

- Human 在获知首次 Worker 越界 query 已消耗且 descriptor 被 `/dev/null` 丢弃后，明确重新授权 Codex Operator 执行恰好一次 replacement no-generation shape-only query；该授权不含 paid submit、retry 或 Worker/Reviewer 外部访问。
- shape diagnostic 独立 OMP Reviewer 以只读、无 shell 工具审查，结论 `approved / P0=P1=0 / may_run_shape_diagnostic=yes`。Operator 随后唯一执行一次 replacement query，`HTTP 200` 且 shape parse 成功；descriptor 只保留 top-level `Response`、nested `Error{Code:string,Message:string}`、`RequestId:string`、`profileCandidate=cloud-response-v1` 与 domain-separated digest `846750d92d8d44ad893c82f386a103e81ad26e94102b38b0a0b5fd2d016f484a`，没有任何 scalar value、raw body、URL、credential 或 provider error text。
- 旧 JobId 的 error envelope 足以证明 live endpoint 使用 Cloud `Response` envelope，但不证明 successful-job payload。因此未放宽 successful query codec；只把未来 canary contract 冻结为现有 package-owned `cloud-response-v1` digest。
- `run-dh017-provider-canary.ts` 删除旧 JobId pre-submit capture 和 CLI 第三参数：Hunyuan future canary 的第一个 provider request 必须是 exact `/v1/ai3d/submit`；stale `existingHunyuanJobId` 在 runtime/credential/fetch 前 fail-fast。没有 registry、adapter、config/audit/recovery framework。
- contract freeze focused 最终 `44 pass / 0 fail / 310 expect()`，root typecheck通过；独立只读 Reviewer `approved / P0=P1=0 / may_advance=yes`。全仓首轮唯一失败为既有 hidden-CAS writer lease flake（`1136 pass / 1 fail`），该 suite隔离 `20/20`通过；完整串行重跑 `1137 pass / 0 fail / 9088 expect()`（98 files）。build、Harness validate（0 warnings）与doctor通过；scoped whitespace clean，global diff-check仍只有共享 `review-packet.md:857` EOF空行。
- 两次 no-generation query authority 均已消耗；Hunyuan/Marble paid submit仍均为 `0`。本轮没有 Data Root/generation/provider submit/download/Artifact/Gateway/Studio side effect，也没有 commit/push/merge/deploy。DH-017现在停在 Human paid-canary authority gate，不得自动恢复原 paid submit授权。

## 2026-08-20 — DH-017 两家真实 paid canary 执行

- Human 在 live contract freeze/review/gates 后明确重新授权 Hunyuan 与 Marble 各一次 paid submit，参数、prompt、费用预期及 wait-and-download policy沿用冻结回执。Operator同日复核官方资料：Hunyuan `3.0/Normal` 仍为20积分且失败任务不扣积分；Marble `marble-1.0-draft` 文本总价仍为230 credits。
- 首次 Hunyuan CLI 调用因 fresh root目录本身尚未创建，在 runtime/credential/fetch前本地停止；Data Root不存在且submit count=0。Operator仅创建空目录后继续获准的唯一submit，不构成provider retry。
- Hunyuan随后 durable写入`admitted → submit_started(attempt=1) → remote_bound`，证明一次submit成功获得remote identity；poll随即返回`provider-failed`。没有retry/download/artifact；artifact files=0。真实canary暴露一个实际而非假想的durable缺口：进程receipt已terminal failure，但journal head仍为`remote_bound`，没有provider-failed terminal record；下一步应只修这个最小状态转换，不扩恢复/审计框架。
- Marble唯一submit被明确拒绝为`PROVIDER_PAYMENT_REQUIRED`，durable chain为`admitted → submit_started(attempt=1) → provider_failed`；非ambiguous、无remote world/download/artifact，artifact files=0。要重试必须先补World API credits并重新取得Human authority。
- 两家paid authority均已消耗、不得自动重提；Hunyuan失败按官方规则预期0积分，Marble 402预期未扣230 credits，但本轮未查询账户余额/usage，不能声称settled账单事实。fresh roots与脱敏结果保留在`.artifacts/canary/DH-017/20260820T121931Z/`。
- 本轮没有verified Artifact、Gateway/Studio真实可见性、commit/push/merge/deploy。DH-017仍未完成并重新阻断：先修Hunyuan query failure→durable provider_failed最小闭环；Marble资金问题由Human外部处理。

## 2026-08-20 — DH-017 real-canary durable poll failure 最小修复

- 真实 Hunyuan canary 暴露的单一缺口已在本地代码闭合：`remote_bound → provider_failed` 复用既有 `GenerationSubmitResultCoordinator`、receipt capacity 与 `GenerationRecordJournal` pending/witness/append，不新增第二状态机、恢复框架、registry、scheduler 或 retry；exact replay 只读，冲突 outcome 零 mutation fail closed。
- Runner 只持久化 provider 明确 terminal 的 rejected/failure；contract mismatch、transient、abort/deadline 与 download failure 不写 terminal record。Marble/Hunyuan 仅共用一个小型 closed classifier，没有引入 provider abstraction。
- 按北京时间工作日晚间路由使用本机 OMP `deepseek-v4-flash`、thinking=`max`。Worker session `01a01f22-6115-7000-b702-ecb81b089faf`；独立 Reviewer session `01a01f31-8c1e-7000-9529-b2062d4ff9a6`。Reviewer 从实际业务缺口和最小性出发，最终 `approved / may_advance=true / P0=P1=0`；Harness handoff/accept/approval 为 `evt-20260820T124148Z-d6ed17b9` / `evt-20260820T124219Z-2c14efac` / `evt-20260820T124353Z-9a3ebccb`。
- Operator focused 为 `37 pass / 0 fail / 261 expect()`；root typecheck/build、Harness validate（0 warnings）与 doctor 通过。全仓串行 `1143 pass / 1 fail / 9036 expect()` 的唯一失败是未改动 visible-commit suite 的临时 lease 获取，精确失败用例隔离复跑 `1/0/248`；未扩修无关 flaky test。目标四文件 whitespace clean，global diff-check 仍仅有共享 review-packet EOF 空行。
- 没有再次联网、读取 Keychain、调用 Provider、运行真实 generation 或改写 preserved canary roots。历史 Hunyuan root 仍保留当时 `remote_bound` truth；代码修复不伪造追溯 terminal state。
- DH-017 仍未完成：两家 paid authority 均已消耗且真实 Artifact 均为 0。下一步不再加固代码；仅等待外部条件——Marble 补 credits 后的新 Human submit authority，及若需重验 Hunyuan则单独的新 Human submit authority。

## 2026-08-24 — DH-017 Marble API credits 再检查

- Human 明确授权用第三方提供的既有 World Labs API key 再做一次 Marble submit，以判断 API credits 是否已充值。官方无只读 balance API，Platform billing 页面又需要该第三方账号登录，因此使用 fresh Data Root 与 frozen `marble-1.0-draft` 请求作为唯一 gate。
- 首次本地调用只暴露目录权限配置错误：`0755` 空目录在 credential/fetch 前停止，submit count=`0`；收紧为 `0700` 后继续同一授权，不是 provider retry。
- 唯一真实 submit durable 收敛为 `provider_failed(PROVIDER_PAYMENT_REQUIRED)`；无 remote operation、poll、download、Artifact 或第二次 submit。结论是该 key 当前仍没有足够的 **World API credits**；即使第三方给 Marble app 充值也不能用于 API。
- evidence 位于 `.artifacts/canary/DH-017/20260824T0649Z/marble`，credential 未输出或持久化。DH-017 继续阻断在第三方 API 账户充值与下一次 Human authority；不增加代码或自动重试。

## 2026-08-24 — DH-017 三个候选 Marble key 顺序检查

- Human 将三个候选 key 存入独立 Keychain locator，并授权 1→2→3 顺序各做最多一次 submit；Operator 未读取到日志、输出、hash 或持久化 key 值。
- 三个候选均使用 fresh `0700` Data Root，唯一 submit 都 durable 返回 `provider_failed(PROVIDER_PAYMENT_REQUIRED)`；没有 401、remote operation、poll、download、Artifact 或自动 retry。candidate-1 的一次本地 inline quoting 错误发生在 credential/provider 前，空 root 证明未消耗 submit，修正后才执行其唯一真实调用。
- evidence 位于 `.artifacts/canary/DH-017/20260824T0704Z/marble-candidate-{1,2,3}`。结论是三个 key 对应的 World API 账户当前都没有足够 credits 支付冻结的 text draft 请求；不能由此推断具体余额或 Marble app 余额。
- 三个候选 authority 均已消费。DH-017 继续停在外部 API credits/新 key 与新的单次 Human authority，不继续扩代码或自动轮询 key。

## 2026-08-24 — DH-017 真实 MVP 收敛至 Hunyuan

- Human 明确确认停止继续尝试 Marble key；保留现有 Marble implementation/fake tests，但把 Marble live canary 标记为 deferred external dependency，不再阻断当前真实 MVP，也不接入第三 provider。
- 当前真实验收改为至少一个 provider 完成真实 prompt → job → poll → download → verified Artifact → Gateway → Studio 闭环。下一步先对 2026-08-20 已存在的失败 Hunyuan Job 做恰好一次 no-generation 脱敏查询，只保留 `Status` 与稳定 `ErrorCode`。
- Worker 只离线准备最小诊断，不得读取 Keychain、联网或调用 provider；独立 Reviewer 只读审查；真实 query 由 Codex Operator 执行。新的 Hunyuan paid submit 不在本轮授权内。

## 2026-08-24 — DH-017 Hunyuan terminal diagnostic 实跑结果

- Terra high Worker 按两文件 allowlist 产出 96 行一次性 Operator diagnostic；Operator 用 injected fake 验证仅一次 fetch，pending/malformed/abort 均固定 stopped。Kimi K3 `thinking=max` limited-fresh Reviewer 从真实 MVP、零 submit/retry/leak 与奥卡姆边界独立审查，`APPROVE / MAY_RUN_REAL_QUERY=yes / P0=P1=P2=P3=0`。
- Operator 随后执行 Human 授权的唯一一次旧 Job no-generation 诊断。Keychain locator 本地存在；入口以 exit `1` 返回唯一固定 sentinel `DH017_HUNYUAN_TERMINAL_DIAGNOSTIC_STOPPED`。没有 paid submit、retry、新 Job、download、Artifact、commit、push 或 deploy。
- stopped 输出把 credential/HTTP/schema/status/ErrorCode 等失败阶段合并，不能据此推断具体 provider 原因，也不能形成有证据的修正。授权按保守原则已消费，不自动重跑。
- 下一最小动作不是增加恢复/审计框架，而是离线让该一次性诊断额外返回一个闭集的脱敏 stop stage；独立 review 后，再由 Human 决定是否授权新的单次 query。新的 paid submit 仍是独立 authority gate。

## 2026-08-24 — DH-017 Hunyuan terminal diagnostic stage-observability 离线修正

- 本切片只修改一次性 Operator diagnostic 与对应 evidence：stopped 结果新增严格闭集 `input | credential | http | response | status | error-code`；不输出 exception、body、URL、HTTP status number、provider message、JobId、RequestId、prompt 或 credential。valid terminal `FAIL + stable ErrorCode` 的成功小 JSON 保持不变。
- 原定 OMP DeepSeek Worker 在两个监督观察周期内持续扩张设计且未写 allowlist artifact，Operator 在其触碰 Keychain、网络或 provider 前释放；随后 Terra high Worker 用 115 行完成最小改动，并根据 Operator 反馈补齐 invalid CLI 的 `:input` stage。没有新增 framework、logger、retry、submit path 或产品代码。
- Kimi K3 `thinking=max` limited-fresh Reviewer session `01a0343b-7940-70ad-9452-62bcdb5e9d82` 独立审查；首次在正式结论前触及 deadline，恢复同一 session 后给出 `APPROVE / MAY_REQUEST_NEW_QUERY_AUTHORITY=yes / P0=P1=P2=0`，仅保留两条无需修改的 P3。Reviewer 只写 `/tmp` 测试文件，repo 零 mutation。
- Operator 最终复跑 injected-fake matrix `28/28`、leak scan `CLEAN`、invalid CLI exact sentinel/exit 64、Bun bundle；脚本 115 行，SHA-256 `b58a75345517749ce50e58d035cd987ad7d06047365f9f829a0076bd38eb1d54`。本切片 Keychain read、network、query、submit、retry 均为 `0`。
- DH-017 整项仍未完成。本 APPROVE 只证明离线诊断可用于下一次最小查询，不构成真实 query authority；当前重新阻断在 Human 是否授权对既有 Job 执行恰好一次 no-generation query。任何 paid submit 仍需另行授权。

## 2026-09-05 — DH-019 Offline Value Checkpoint 已关闭

- 在无 provider quota、无 live OMP/Marble/Hunyuan/Keychain 的条件下，`fixture:two-joint-planar-reach-v1` 完成 `world_write → world_read → world_edit → world_run(FAIL) → evidence-derived repair → world_run(PASS)`。
- Episode provenance、runtime profile、samples/terminal content digest 与 Evaluation 重算均已绑定；真实 Episode 篡改 fail closed。
- Receipt 状态为 `offline-proven`，两次 fresh Host byte-identical；全量 `bun test` 为 `1173 pass / 0 fail / 9264 assertions`，typecheck/build/Harness validate 通过。
- 决策：允许进入 bounded evidence→WorldProgram compiler；仍不宣称 predictive world model，不扩展为通用 robotics planner 或自动 adopt。

## 2026-09-22 — DH-022 内部候选边界实现中

- 基于 main `82468a8`，在 `codex/dh-022-candidate-boundary` 独立 worktree 收敛 DH-020/021 的结果类型；两类候选仍属于固定 golden fixture 的离线证明。
- Program 与 Pose Edit 使用显式 discriminator，并保留 sourceRef/Episode/Evaluation；Pose Edit 输出完整既有 wire input，原 Ref 随候选一起保存，避免调用端误用最新 Ref。
- 新回归证明旧 Pose Edit 候选在世界前进后返回 stale_ref，不覆盖当前 Snapshot；推导不拥有 Host 写权限。Program sourceRef 仅作来源记录，不宣称新增 run CAS。
- authoring helper 及脚本显式纳入根 typecheck；DH-019 历史 receipt 保持不变。验证详情及最终门禁结果见 `tasks/DH-022/result.md`。
- 状态为实现者验证、准备独立审查；不自行批准 closeout，不修改 main，不调用 live provider。
```

## Current Review Content

```md
# DH-022 独立实现与 closeout 审查

- Reviewer：`/root/dh022_independent_review`（与实现者分离，只读）
- 结论：`APPROVED`；`may_closeout=yes`；P0=0 / P1=0 / P2=0（实现范围）。
- 审查基线：HEAD `82468a8` 加当前未提交 DH-022 差异，包含未跟踪新文件。9 个产品/测试/配置文件与 review-input manifest 全部匹配。
- Reviewer 亲跑：focused 12 pass / 0 fail / 55 assertions（13.01s）；`bun run typecheck:authoring` exit 0；`git diff --check` exit 0。
- 全量日志：只读核对 2026-09-22 `1180 pass / 0 fail / 9300 assertions`；Reviewer 本轮未重跑全量，不冒充 fresh full gate。
- Reviewer 确认 Program/Pose Edit 类型区分、sourceRef、stale_ref 回归、历史 receipt 和内部类型检查在本切片范围可接受；没有隐式 run/adopt/provider 操作。
- 操作建议：Operator 记录本 verdict 后执行正式 closeout，刷新 current/task_plan、harness-state、current/review 和 packet。旧 DH-015 verdict 不属于本任务批准依据。

本文件由 Operator 原意记录独立 reviewer 返回的结论；未以实现者自测替代 reviewer。
```

## Closeout Questions

1. 当前实现是否已经覆盖 acceptance
2. verification 是否足以支持从 `doing` 进入 `done`
3. 还有没有阻止 closeout 的高优先级问题
4. 如果不能 done，最关键的剩余工作是什么
