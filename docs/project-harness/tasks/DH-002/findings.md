# DH-002 Findings

## 2026-08-09 — 根因与设计约束

- `runFallingCube()` 已生成 2.5 秒、30 Hz 的 76 个 `EpisodeSample`；缺失的是 Presentation playback，不是 Runtime sampling。
- `App.tsx` 在收到 Episode 后直接选择 `samples.length - 1`，因此 Three.js 只看到 terminal sample。
- `ThreeViewport` 按传入 sample 响应式渲染；它不应持有播放器 clock。
- 最小正确形状是独立 `EpisodePlayer`：使用 `requestAnimationFrame` 获取 wall time，再映射到不可变 sample 的 `timeSeconds`；不改变 Runtime，也不创建插值状态。
- 时间选择采用“最后一个 `timeSeconds <= playbackTime` 的 sample”，因此 Presentation 永远只显示真实证据帧；浏览器刷新频率不会改变 Episode frame identity。
- 播放器 clock 只在 Episode view active 时运行。explicit adopt 切换到 Repository view 会停止 clock，避免 Presentation 的残余 tick 抢回视图；这不是 Repository authority 逻辑的一部分。
- 第一轮真实交互证据：自动回放在约 0.40s 到达 frame 11，随后推进到 frame 29；暂停后 frame 16 在 350ms 内不变，下一帧准确到 frame 17；2x 重播继续推进。最终验收需从刷新页面复测 adopt-during-playback。
- 当前 in-app browser 的 page global 与 dataset wrapper 不允许新增 test-only field，无法用页面注入缓存历史 error；最终报告只使用实际取得的 DOM/WebGL/interaction evidence，不宣称 console capture。
- 当前 browser evaluate 返回的 canvas 是隔离 wrapper，不暴露原生 `getContext()`；本轮可验证 canvas/画面存在与交互状态，但不把 context probe 写成通过。
