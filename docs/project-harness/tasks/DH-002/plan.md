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

### Phase 5 — Operator close 与本地正式发布

Status: completed

- 用户明确授权 commit、发布与 `mark-done`；
- 在最终 tests、typecheck、build、checklist validation 与 secret scan 通过后，由 Operator 关闭 `DH-002`；
- 在 `main` 创建包含 DH-000 至 DH-002 的首个 commit，并创建指向该 commit 的 annotated release tag；
- 因仓库不存在 remote、deployment target，且 package 为 `private`，不得伪称 GitHub/npm/公网发布；
- 将 committed source archive、production build archive、SHA-256 与 release receipt 发布到 `/Users/Admin/projects/my release/Demiurges/`；
- 发布后从 commit/tag 与 artifacts 双向读回，确认工作区、Harness 状态与 checksum。

Operator close evidence：`harnessctl mark-done DH-002 operator` 已产生 `[CLOSE] evt-20260810T023458Z-706fa171`；item 状态为 `done`、workflow 为 `closed`、lease 已记录 `released_at`，checklist validator 为 0 warning。Release gate 再次得到 26 tests / 166 assertions 全绿，typecheck/build 通过。发布 locator 固定为 Git tag `release/dh-002-episode-player` 与 `/Users/Admin/projects/my release/Demiurges/dh-002-episode-player/`；外部 receipt 记录最终 commit 与 artifact checksum。

Release product digest 为 `899f2bba2090a6cffa839d8b33111eccca1b96f956b9a941deec10b8caa230f4`。它与 reviewer digest `945b0a827397b44f4570f01891891a4269805b0d6bca8e9fe4d5ebe49e402f36` 的唯一 product-file 差异是 `episode-player-clock.ts` 末尾多余空行在 staged whitespace gate 中被删除；对应 clock tests 再跑为 3/0/13。两份 digest 分别保留为“审查时产品”和“实际发布产品”证据，不互相冒充。

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
