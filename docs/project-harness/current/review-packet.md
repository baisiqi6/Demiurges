# Review Packet

## Subject

- Checklist item: `DH-002`
- Reviewer: `dh002-independent-reviewer`
- Updated at: `2026-08-10`
- Canonical plan path: `docs/project-harness/tasks/DH-002/plan.md`

## Item Snapshot

- Title: 实现 Episode Player Presentation Slice
- Status: doing
- Workflow status: running
- Priority: p0
- Owner: codex
- Session: demiurges-dh002-player-20260809
- Dependencies: DH-001

## Acceptance

不可变 Episode 能按 sample time 自动回放，并支持暂停、继续、重播、逐帧、seek 与倍速；播放器不修改 Episode、不推进 Repository ref，tests/typecheck/build/browser acceptance 通过。

## Verification

Worker evidence: bun test 26 pass/0 fail/166 assertions; typecheck/build pass; browser verifies autoplay, pause, step, 2x resume, seek, PASS evaluation, ref unchanged until adopt, and adopt-during-playback remains terminal. Product digest 945b0a827397b44f4570f01891891a4269805b0d6bca8e9fe4d5ebe49e402f36.

## Handoff

Independent reviewer should follow tasks/DH-002/review-request.md. Browser console history and native canvas context were not available through the isolation wrapper and are not claimed.

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

Status: in_progress

- 更新 `progress.md`、checklist verification 与 handoff；
- 生成只读 review packet；
- Coding agent 不自行 `mark-done`。

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

## Review Focus

1. 当前计划或结果是否覆盖 acceptance
2. 是否越过 scope non-goals
3. 是否越过 architecture 模块边界
4. 是否偷偷吸收了未来 checklist item 的工作
5. 当前验证方式是否足以支持结束本轮
