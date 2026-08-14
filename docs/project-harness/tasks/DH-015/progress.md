# DH-015 Progress

## 2026-08-14 — Roadmap authority 与 worktree

- 创建 `agent/codex/DH-015` 与 `/Users/Admin/projects/WorkTrees/Demiurges-DH-015`，base 为 `1805d73055a79a7e0506afafebaffd7b308706f9`。
- 通过 worktree-local EXharness runtime 登记四个节点：DH-015 依赖 DH-013/DH-014；DH-016 依赖 DH-015；DH-017 依赖 DH-016；DH-018 依赖 DH-017。
- 仅 DH-015 进入 `doing/running`；DH-016～DH-018 保持 `todo`。
- 新 worktree 缺少 ignored harness runtime 的两次失败尝试均未产生提交或推送；一次误写 main checklist 已在原子登记前精确撤回，main 当前干净。
- 首次尝试以同一个 `apply_patch` 同时 delete/add plan 文件被工具拒绝，未改变文件；随后分成两个原子 patch 成功写入 canonical plan。
- 当前阶段只允许设计、验收计划与 independent plan cross-review；未进入产品实现，未 commit、push、merge、tag、deploy 或调用 provider。

## Current gate

- 已完成现有 WorldTool/Repository、Marble-Hunyuan registry、Product Session API 与 ThreeViewport seam 的只读审计。
- Round 1 canonical plan 已由 Sol Max 与 OMP DeepSeek V4 Pro Max 独立审查；两者均保持 frozen identity 且只读，combined decision 为 `changes_requested`。
- 已建立 `plan-review-round1.md`，把共同 blocker 收束为 composite source-aware authored-state closure、operation-aware transition decoder、semantic no-op、draft wrapper 与 explicit adopt regression。
- Round 2 计划删除 direct human run endpoint；human authoring 只增加 closed write/edit，run 继续走既有 Agent 四工具路径，从源头避免在本切片发明 runtime cancellation transaction。
- canonical plan 正在修订；重新冻结 digest 并通过 fresh cross-review，P0/P1 为 0 且 approved 后才可请求 implementation authority。

## Round 2 gate

- 两位 fresh reviewer 均完成源码级核验；设计主体已经收敛，但 request manifest 因 `harnessctl review` 的 checklist bookkeeping 在冻结后变化而失效，combined decision 按严格 gate 记为 `blocked`。
- 已补全 180° yaw total hemisphere、canonical root ID、decoder barrel export、human composite-only write 与 pre-authored-world Agent `read→run` fixture。
- Round 3 将先完成全部 EXharness workflow mutation，再最后冻结 digest；冻结后不再调用 harness mutation command。

## Ongoing delivery authority

- Human 已明确授权：在既定方向与 approved plan 内，后续常规 closeout、commit、push、fast-forward merge，以及存在既定发布目标时的 deploy 无需逐项再次询问。
- 若产品方向/核心抽象变化、权限/成本/外部副作用显著扩大、需要破坏性操作，或必须越过 approved scope，仍停下请求 Human 决策。

## Round 3 gate

- frozen identity 正确且两位 reviewer 独立复现同一 P1：human edit 未在 mutation 前限制 composite scenario/target，generic surface 可先改变非 composite world。
- canonical plan 已增加 pre-mutation composite-only admission、stable empty/non-composite errors、zero-side-effect table tests，并把 parsed input 纳入 package-owned transition decoder。
- 同时吸收 decoder mismatch test 与 numeric envelope single-source P2；进入 fresh Round 4，仍未实现产品代码。

## Round 4 gate

- DeepSeek reviewer approved，但 Sol 复现了 insertion 前 edit sequence side effect 与 direct no-op child，因此 combined decision 采用 `changes_requested`。
- canonical plan 已把 composite-specific canonicalization/no-op 提升为 package-owned pure preflight；只有 accepted outcome 可调用 mutation surface，unchanged/rejection 保持 authority 与 Repository sequence 不变。
- 已固定 `POSE_NOT_COMPOSABLE`、floor safety、expected/prior equality 与 child identity no-gap tests；进入 fresh Round 5，仍未实现产品代码。

## Round 5 gate

- DeepSeek approved；Sol 指出 preflight 虽被要求 package-owned，却未在 `index.ts` 获得明确 export authority，combined decision 采用 `changes_requested`。
- canonical plan 已授权 package root 导出 pure preflight/outcome/canonical result/decoder，并增加 import-path test；同时固定 parse error code 与 floor predicate single source。
- 进入 fresh Round 6，仍未实现产品代码。

## Round 6 gate

- reviewer priority 已切换为 Sol Max 第一、ZCode GLM-5.3 第二；ZCode actual model `GLM-5.3` verified，actual reasoning variant `Max` UNVERIFIED，direct CLI 不冒充 managed receipt。
- ZCode approved；Sol 找到 generic parser 会提前吞掉 composite 422 分类且 parsed tuple 不能直接进入 surface 的 P1，combined decision 采用 `changes_requested`。
- canonical plan 已改为 structural decode → composite domain canonicalization 的 single pipeline，accepted outcome同时提供 canonical wire 与 parsed result；generic Agent parser不变。
- 进入 fresh Round 7，仍未实现产品代码。

## Round 7 plan approval

- Sol Max 与 ZCode GLM-5.3 fresh review 均 `approved`，combined P0=0、P1=0；frozen plan/24-file aggregate 起终一致。
- ZCode actual model `GLM-5.3` verified，actual variant `Max` UNVERIFIED；native tools 仅 Read/Grep，Git 零漂移，direct CLI 不冒充 managed receipt。
- canonical plan 已获得 implementation authority；下一步进入 RED-first 产品实现，完成后仍需 full gates、真实 Chromium 与 independent implementation cross-review。

## Implementation checkpoint

- world package 新增 shared structural decode → composite domain admission 的单一 pipeline；`accepted` 同时返回 canonical wire 与 tuple parsed input，`unchanged`/stable rejection 不调用 mutation surface。
- composite fixture 现按 source 关闭状态：write exact；edit 仅允许 generated-object canonical world-Z pose、零速度与 floor-safe translation；runtime-terminal 保持既有 Runtime closure。
- Repository 的 vertical extent / floor predicate 与 `1e-9` tolerance 已机械抽取为单一 helper；既有 Repository 语义未改。
- Product Session 增加固定 human `world/write` 与 `world/edit` 路径，与 Agent turn 共用唯一 reservation；no-op 保留 Ref/lastRun/sequence，accepted edit 才清 lastRun。
- world package 新增 operation-aware projection transition decoder；Studio client 不复制 lineage 规则，失败/stale 以无旧 expectedWorld 的 bounded GET resync。
- Studio 增加 exact Marble/Hunyuan role cards、Presentation-local PoseDraft、Inspect-only world-space TransformControls、translate/world-Z rotate、cancel/commit 与 authority/draft 双 readout；没有 scale 或第五个 Agent tool。
- 真实 Chromium 发现并修复正常 TransformControls drag end 被 `lostpointercapture` 误判为异常取消的问题；现在正常 `dragging-changed(false)` 保留 draft，持续 dragging 的异常 lost-capture 才取消。
- Chromium 已证明：draft drag 时 Snapshot v1 不变；显式 translate commit 生成 `snapshot:edit-1 / v2`；显式 world-Z rotate commit 生成 `snapshot:edit-2 / v3`；Agent textarea 中 W 不移动相机；Explore W 移动相机且 collision effective=false；keyup 后 rAF count 保持不变。
- 当前本机没有 DH-013 provider cache bytes，三项 asset route 均诚实显示 `NOT IMPORTED`；最终 UI 已收紧为 Hunyuan visual load integrity 未通过时禁用 gizmo，3DGS/visual 缺失不删除合法 Snapshot，Collision proxy 仍可诊断。未重新调用 provider。
- 当前 gates：focused suites 通过；全量 `499 pass / 0 fail / 3579 expects`；typecheck、build、git diff --check 通过。补充 reservation、negative-zero、413 body budget、lastRun/no-op 回归后将重跑 final gates。

## Implementation review Round 1 与修复

- ZCode direct CLI（actual model `builtin:bigmodel-coding-plan/GLM-5.3`；`Max` runtime variant `UNVERIFIED`，不是 Coordinate managed receipt）给出 `approved / P0=0 / P1=0`。
- 最高优先级 Sol Max fresh review 给出 `changes_requested / P1=3`：异常 `lostpointercapture` 后 Three.js `TransformControls.dragging` 可能未释放；工具栏按钮聚焦时 Escape 被 viewport keyboard admission 提前拦截；harness review packet 末尾空行令全仓 `git diff --check` 失败。
- 已增加单一 gizmo release seam：异常取消、draft detach 与 unmount 都先调用 `TransformControls.pointerUp(null)`，恢复 Orbit/selection ownership，再取消 Presentation-local draft。
- Escape 现在先判定 active draft 或 viewport ownership；因此按钮聚焦不会移动相机，却仍可取消 draft。新增 focused lifecycle tests 覆盖这两个回归。
- 已删除 packet 多余尾部空行；全仓 `git diff --check` 恢复通过。
- 修复后全量 `504 pass / 0 fail / 3604 expect()`；typecheck、build、EXharness validate/doctor 与 diff-check 全部通过。
- fresh Chromium 使用真实 Three.js `TransformControls` 证明 `dragging=true → pointerUp(null) → dragging=false / axis=null`；产品 fallback 保持三项 `NOT IMPORTED`、合法 Snapshot v1、gizmo disabled、无 page error；settled idle rAF 增量为 0。未调用 provider。

## Implementation review Round 2 与修复

- ZCode direct CLI 给出 `approved / P0=0 / P1=0`，但其 Read/Grep-only reviewer 无法独立执行 shell gates；actual `GLM-5.3` verified、`Max` variant `UNVERIFIED`、不是 managed receipt。
- Sol Max 复算 25-file aggregate并执行 full gates，发现三个可执行 P1：pre-aborted human write 仍能落库；malformed joint-state structural input 被错分为 422；transition decoder 接受 `prior.running=true`。其最终 cache-path broad search 意外触碰禁读 closeout packet 的三条匹配行，因此不能作为 clean approval，但三个反例均在污染前形成，继续作为有效 blocker。
- Gateway 现以 typed `PublicRequestError` 与 `ProductSessionAuthoringFailure` 映射 stable public code，不再读取 raw `Error.message` 推断 authoring code。
- human write/edit 在 body read 前后、reservation 前检查 request abort；pre-aborted 与 body-read期间 abort 均返回 `400 INVALID_REQUEST`，Ref/Snapshot/lastRun/sequence/running 零变化。
- shared structural decoder 现验证 joint-state 的 exact record、字段与 string/number primitive；`joints:[null,null]` 在 composite admission 返回 structural `INVALID_REQUEST`，而 structurally valid unsupported joint-state 仍属于 domain `FIXTURE_NOT_COMPOSABLE`。
- operation-aware decoder 现要求 prior 与 returned 都是 settled projection，`prior.running=true` fail closed。
- 修复后 full gates 为 `506 pass / 0 fail / 3613 expect()`；随后新增 streamed-body abort 回归，Round 3 冻结前再执行一次最终 full gates。

## Implementation review Round 3 与修复

- Sol Max clean review 复算 aggregate并执行 full gates；发现 Studio semantic no-op 在 transition decoder前直接返回 prior，使 `prior.running=true` 可无请求成功 resolve。combined verdict 为 `changes_requested / P1=1`。
- ZCode direct review 没找到新的源码语义反例，但将 mandatory nested joint matrix 缺少 sparse/accessor/extra/wrong-primitive/exact-unsupported 可执行测试列为 P1；actual `GLM-5.3` verified、`Max` variant `UNVERIFIED`、非 managed receipt。
- Studio no-op 现在也调用 operation-aware decoder 的 `{ kind:"edit", outcome:"unchanged" }` 路径；仍不发送 HTTP，但 prior/returned settled 与 byte-equivalent invariants不再有旁路。
- package admission新增表驱动 nested joint matrix：null、sparse、accessor（getter read count=0）、extra field、wrong string/number primitive 均 `INVALID_REQUEST`；完整 exact joint records在 composite domain返回 `FIXTURE_NOT_COMPOSABLE`。
- HTTP 路径同步覆盖 JSON 可表达的 nested structural matrix与 exact unsupported 422，并继续证明随后首个合法 child 为 `snapshot:edit-1`、无 mutation gap。
- focused `35 pass / 0 fail / 136 expect()`、typecheck与全仓 diff-check通过；Round 4 冻结前重跑 full gates。

## Implementation review Round 4 与修复

- ZCode direct CLI 给出 `approved / P0=0 / P1=0`；provider-native rollout确认 actual `builtin:bigmodel-coding-plan/GLM-5.3`，`Max` variant `UNVERIFIED`，非 managed receipt。
- Sol Max 复现 package-root decoder 的共同 identity gap：non-composite primitive prior/returned可被 unchanged与伪造 generated-object updated operation接纳；combined verdict采用 `changes_requested / P1=1`。另指出 draft wrapper仍保留 Three.js默认Y-up（P2）。
- decoder 现在先用完整 trusted ProductSession projection codec重新接纳 prior，并在所有 edit outcome共同入口验证 prior/returned ref与 Snapshot为 exact Marble-Hunyuan composite；不是在 unchanged/updated各补一个特例。
- non-composite primitive unchanged与same-pose direct child updated均有 regression并 fail closed；prior session/ref/version/descriptor等也由 trusted prior decode统一验证。
- draft wrapper创建后显式 `up.set(0,0,1)`，与 camera、world frame及 TransformControls world-space Z-axis一致。
- focused `26 pass / 0 fail / 75 expect()`、typecheck与diff-check通过；Round 5冻结前重跑 full gates。

## Implementation review Round 5 与修复

- ZCode direct CLI 给出 `approved / P0=0 / P1=0`；provider-native rollout确认 actual `GLM-5.3`，`Max` variant `UNVERIFIED`，非 Coordinate managed receipt。
- Sol Max 复算 25-file aggregate并执行 full gates，发现 commit request pending期间既有 TransformControls仍可继续更新本地 PoseDraft；combined verdict采用 `changes_requested / P1=1`。
- authoring busy 现进入 Presentation 输入所有权：busy开始即以统一 lifecycle释放 drag，disable并detach gizmo；settled后才按仍有效的 draft重新取得 ownership。
- `onGizmoObjectChange` 与 App draft update 均有 busy guard，因此迟到事件不会让已发送 command pose与界面 draft readout分叉。
- 新增 lifecycle regression证明 pending authoring不拥有 gizmo，Inspect/settled/no Episode sample才可拥有；focused `26 pass / 0 fail / 70 expect()`、typecheck与diff-check通过。

## Implementation review Round 6 approval

- 第一顺位 Sol Max 与第二顺位 ZCode GLM-5.3 均给出 `approved / may_closeout=yes / P0=0 / P1=0`；frozen 25-file aggregate `03297cbad3fec2f0ff5a054081e50468029a33c0e4584ba15f348fcdb841f36b` 起终一致。
- Sol实际安装态 Three.js probe证明 busy release后 `dragging=false`、`axis=null`、`mouseUpEvents=1`、Orbit恢复；pending、非Inspect与Episode sample均不能拥有draft input。
- final gates：`509 pass / 0 fail / 3634 expect()`；typecheck、build、全仓diff-check、EXharness validate/doctor全部通过。
- ZCode provider-native rollout确认actual model为 `GLM-5.3`；`Max` runtime variant仍为 `UNVERIFIED`，direct CLI不是Coordinate managed receipt。
- DH-015已满足closeout gate；provider cache缺失仍作为外部evidence limitation记录，未调用provider或伪造loaded acceptance。

## Closeout

- closeout packet生成后，第一次normal `mark-done`被EXharness护栏拒绝，因为closeout-phase approval尚未登记；未使用force override。
- 重新登记同一Round 6 frozen approval后，normal `mark-done`成功；CLOSE event为 `evt-20260814T202204Z-23a2a44e`。
- DH-015现为 `done / closed`，lease已释放，current item已清空；validate 0 warnings、doctor无errors、全仓diff-check通过。
