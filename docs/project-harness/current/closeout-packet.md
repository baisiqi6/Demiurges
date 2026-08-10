# Closeout Packet

## Subject

- Checklist item: `DH-002`
- Reviewer: `dh002-independent-reviewer`
- Updated at: `2026-08-10`
- Canonical plan path: `docs/project-harness/tasks/DH-002/plan.md`

## Item Snapshot

- Title: 实现 Episode Player Presentation Slice
- Status: doing
- Workflow status: closeout_requested
- Priority: p0
- Owner: codex
- Session: demiurges-dh002-player-20260809
- Dependencies: DH-001

## Acceptance

不可变 Episode 能按 sample time 自动回放，并支持暂停、继续、重播、逐帧、seek 与倍速；播放器不修改 Episode、不推进 Repository ref，tests/typecheck/build/browser acceptance 通过。

## Verification

Worker and independent reviewer: bun test 26 pass/0 fail/166 assertions; typecheck/build pass; browser autoplay/pause/step/rate/seek/PASS/adopt authority pass; product digest before/after 945b0a827397b44f4570f01891891a4269805b0d6bca8e9fe4d5ebe49e402f36; reviewer P0/P1/P2 none.

## Handoff

Independent reviewer approved. Operator may mark-done. Coding agent did not commit, release, deploy, or mark-done.

## Review Inputs

- Scope: `docs/project-harness/scope.md`
- Architecture: `docs/project-harness/architecture.md`
- Domain model: `docs/project-harness/domain-model.md`
- Progress: `docs/project-harness/progress.md`
- Review output target: `docs/project-harness/current/review.md`

## Canonical Plan Content

```md
# DH-002 计划：Episode Player

## 目标

把 `DH-001` 已产生的不可变 Episode 从“可拖动检查的帧序列”提升为“可按证据时间自动回放的动态历程”。Runtime 继续离线、确定性地产出完整 Episode；新增的播放器只属于 Presentation，不拥有物理状态，也不推进 Repository ref。

## 已授权范围

- 新增独立的 Episode Player Presentation 组件与最小纯时间映射逻辑；
- 点击 `运行 MuJoCo` 后从第 0 帧自动回放 Episode；
- 支持播放/暂停、重播、前后逐帧、拖动时间轴与 `0.5x / 1x / 2x` 倍速；
- 添加播放器时间映射与边界行为测试；
- 更新必要的 SolidJS 组合代码、样式与 repo-local Harness 证据。

不创建 commit、remote、Issue、PR、deployment 或外部发布。

## Invariants

- Episode 与 samples 保持不可变，播放器只持有 transient Presentation state；
- 播放位置由 `EpisodeSample.timeSeconds` 与单调 wall clock 映射，不用 `setInterval` 假装固定帧率；
- 拖动、逐帧、播放或重播都不能调用 Repository `adopt` 或修改 current ref；
- Three.js 仍只消费当前 Snapshot / EpisodeSample，不拥有时间轴；
- 第一版播放精确证据帧，不在相邻 sample 之间制造新的 authority state；
- `prefers-reduced-motion` 下不自动播放，用户仍可逐帧、拖动或显式播放。

## Non-goals

- 修改 MuJoCo step、sample rate、Episode contract 或 Evaluation；
- 在 Runtime loop 内加入实时等待、streaming transport 或 Web Worker；
- 对位置或 quaternion 做插值、外推或补帧；
- 音频、视频导出、轨迹编辑、关键帧编辑或通用媒体时间线；
- Agent、3DGS、机器人或第二个 Runtime provider。

## 验收标准

1. 新 Episode 到达后，普通 motion preference 下播放器从 sample 0 自动开始并按 `timeSeconds` 推进到 terminal。
2. 播放可以暂停、继续、重播、前后逐帧、拖动和切换 `0.5x / 1x / 2x`，结束后稳定停在最后一帧。
3. 任意 seek 后继续播放都从当前 sample time 重新锚定，不因暂停时长或倍速切换产生跳跃。
4. 时间选择逻辑对起点、中间帧、帧间时间、终点和越界时间有 deterministic unit tests。
5. 播放全程 current Repository ref 保持 edited Snapshot；Evaluation 与 explicit adopt 语义不变。
6. `bun test`、`bun run typecheck`、`bun run build` 与真实浏览器 acceptance 通过。

## 阶段

### Phase 1 — Authority 与基线

Status: completed

- `DH-001` 已由独立 reviewer 批准；
- 用户授权实现 Episode Player；
- 基线 `bun test` 为 23 pass / 0 fail / 153 assertions，typecheck 通过；
- 已确认根因是 UI 直接选择最后 sample，Runtime 本身已有 76 个证据帧。

### Phase 2 — 时间映射回归与播放器实现

Status: completed

- 先增加纯时间映射 tests；
- 实现最小 `EpisodePlayer`；
- 把 App 的 terminal jump 改为 sample 0 autoplay。

RED evidence：新增 clock tests 后，`bun test apps/studio/src/presentation-episode/episode-player-clock.test.ts` 以 `Cannot find module './episode-player-clock'` 失败（0 pass / 1 fail / 1 error），证明测试先于实现且当前没有播放器时间映射。

GREEN evidence：新增 3 个 clock tests 后，完整 `bun test` 为 26 pass / 0 fail / 166 assertions；时间选择、wall-time 倍速映射与 index clamp 均通过。

### Phase 3 — 交互、可访问性与浏览器验收

Status: completed

- 验证播放、暂停、重播、逐帧、seek、倍速与 reduced-motion；
- 核对 ref authority、Evaluation、adopt 与 WebGL；
- 运行 tests、typecheck、build。

验收证据：

- 新 Episode 自动播放时从中间帧持续推进：`frame 12 / 75 @ 0.40s`，toggle 为“暂停”；
- 暂停后 `frame 14` 在 320ms 内保持不变，下一帧精确到 `frame 15`；
- 切换 `2x` 后从当前帧继续到 `frame 45`，没有回到起点；
- run、pause、step、rate change 与 evaluate 后 current ref 均保持 `snapshot:edit-1`；
- 播放进行到 `frame 18 / 75` 时 explicit adopt，500ms 后稳定为 terminal ref、`adopted-terminal`、`frame 75 / 75` 与“重播”，残余 clock 未抢回 Episode view；
- timeline seek 到 frame 25 后显示源为 `episode-frame`，Repository ref 保持不变；
- 完整 `bun test` 为 26/0/166，typecheck/build 通过；build 仍只有既有 Vite browser-external notice 与大 chunk warning；
- reduced-motion 由代码路径直接关闭新 Episode autoplay；当前 browser 环境未提供 media emulation，因此未把该分支写成浏览器动态证据；
- 浏览器隔离层不提供历史 console 捕获与原生 canvas context probe；已确认 canvas locator 存在、Three.js 画面截图正常，但不宣称这两项未取得的证据。

Motion self-review：新增的 2.5 秒运动是世界历程本身，不是 UI 装饰；clock 可暂停、seek、逐帧与改速，使用 `requestAnimationFrame`，未动画 layout property；reduced-motion 默认不 autoplay。自审结论为可提交 independent review，不替 reviewer 作 approval。

### Phase 4 — 证据与独立审查

Status: completed — independent reviewer approved, Operator close pending

- 更新 `progress.md`、checklist verification 与 handoff；
- 生成只读 review packet；
- Coding agent 不自行 `mark-done`。

Independent review：fresh reviewer 静态核对 authority、rAF lifecycle、active/adopt、pause/seek/rate anchor 与 scope 后未发现 P0/P1/P2；首次因 Operator 要求停止新增工具而以 evidence-incomplete `blocked` 收口，明确不是产品缺陷。随后在相同只读 authority 下只补 request 已允许的 `bun test` 与 digest-after，两项分别为 26 pass / 0 fail / 166 assertions，以及与 before 完全一致的 `945b0a827397b44f4570f01891891a4269805b0d6bca8e9fe4d5ebe49e402f36`，更新最终 decision 为 `approved`。

## 错误记录

| 错误 | 尝试 | 处理 |
| --- | --- | --- |
| `docs/project-harness/harness-config.json` 不存在 | 基线检查时尝试读取 optional config | 当前实例使用外置临时 runtime，配置文件不是 product authority；继续使用已实例化 `harnessctl`，不补第二份 config。 |
| clock regression 首次运行缺少 `episode-player-clock` module | Phase 2 RED | 预期的 regression-first 失败；下一步实现该最小模块。 |
| `HTMLSelectElement.valueAsNumber` typecheck 失败 | 首次完整 GREEN 验证 | `valueAsNumber` 只属于 number input；倍速 select 改为显式 `Number(event.currentTarget.value)`。 |
| 首次暂停验收时播放已经结束，toggle 触发了重播 | browser acceptance attempt 1 | 重放后在明确的中间帧再次暂停；frame 16 在 350ms 内保持不变，随后逐帧到 frame 17。 |
| 浏览器验收不能在不可扩展的 `window` 或 `dataset` 上新增 test-only error buffer | browser acceptance attempts 2-3 | 停止注入式 console 捕获；改用交互调用无异常、结构化 DOM、WebGL canvas 与最终结果验收，并不把“未捕获历史 console”写成已验证。 |
| browser evaluate 的 canvas wrapper 不暴露原生 `getContext()` | WebGL probe | 不绕过浏览器隔离；改用 canvas locator/element info 与 Three.js 画面截图确认 Presentation 存在，WebGL context 本轮不单独宣称。 |

## 浏览器阶段发现

- 自动播放与时间推进成立；
- 播放器需要显式知道 Episode view 是否 active：`Adopt terminal` 切回 Repository view 时必须停止 clock，否则残余 tick 可能重新选择 Episode frame。该约束通过 `active` Presentation prop 表达，不修改 Runtime 或 Repository。
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
```

## Current Review Content

```md
# DH-001 Review Verdict

当前状态：`changes_requested`。

- Kimi Code K3 Max：`approved`；
- GPT-5.6 Sol Max：`changes_requested`；
- Operator 已独立复现 P1，combined decision 为 `changes_requested`；
- product aggregate SHA-256 审查前后不变。

Canonical verdict：`docs/project-harness/tasks/DH-001/cross-review-verdict.md`。

本文件记录正式 review-result；实现者不得在此自我批准或 mark done。
```

## Closeout Questions

1. 当前实现是否已经覆盖 acceptance
2. verification 是否足以支持从 `doing` 进入 `done`
3. 还有没有阻止 closeout 的高优先级问题
4. 如果不能 done，最关键的剩余工作是什么
