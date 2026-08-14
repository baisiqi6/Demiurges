# DH-014 Chromium Acceptance

## Runtime boundary

- Studio：`http://127.0.0.1:5184/`
- scripted Gateway：`http://127.0.0.1:8798/`
- provider：未调用；只读复用 `/Users/Admin/projects/WorkTrees/Demiurges-DH-013/.artifacts/provider-cache`
- cache exposure：DH-014 ignored `.artifacts/provider-cache` symlink，仅供本地 Gateway same-origin route；不进入 Git diff。

## Acceptance evidence

真实 in-app Chromium + scripted Product Session：

- Evaluation：`PASS`；Snapshot `snapshot:edit-1`，Ref `v2`；76-sample Episode 与 Evaluation identity 在所有 camera 操作前后 exact 不变；
- registered assets：Marble SPZ、Marble collider GLB、Hunyuan visual GLB 均 `loaded`；
- 三个 mode button 全部可见；Explore 显示 `Fly（无 validated navigation surface）`；
- Marble entry pose：`position=[0,-1.2,1.15]`，`boundary=inside`，truth=`AUTHORED / UNVERIFIED`，provenance 绑定 exact asset/calibration/operator method；画面处于世界内部，不是 AABB 外部黑色外壳；
- W/A/S/D/Q/E、Shift tap、wheel speed 与 mouse drag look 均实际改变对应 camera state；camera pose 全 finite；
- active movement 增加 3 个 rAF，keyup settle 后 1.15 秒 `idleFrames=0`；没有永久 idle loop；
- Agent textarea 聚焦后发送 W，camera pose exact 不变；
- Inspect 选择 `entity:generated-object`，F focus 产生 finite 新 pose；
- Overview reset 产生完整 registered fit pose，`boundary=unknown`（camera 在 world bounds 外），Grid/Bounds/Alignment/Collision 均有显式 UI；
- Explore effective collision=`false`；返回 Overview 后恢复用户原 collision preference；
- 页面 error logs：0；无 NaN/Infinity、不可恢复空白或 asset fallback；
- Chromium 截图人工核验：Overview 完整显示 world bounds 与 grid；Explore 在 interior room view 中显示 Fly/truth/provenance，dense collision wireframe 未显示。

## Browser fallback note

首选 `agent-browser` skill 的本机 CLI 不存在（`command not found`），因此使用已安装的 Codex in-app Browser Chromium surface；没有安装新工具或修改浏览器环境。

## Round 1 remediation probe

- 修复后真实 Chromium 在 Explore 聚焦 canvas 上将 `Shift` 按住 700 ms：camera pose exact 不变，期间只产生 keydown/keyup 两个事件帧（`51 → 53`），随后 500 ms `rAF delta=0`；不再形成连续空转。
- `W+S` 抵消、modifier-only 与 lifecycle cleanup 同时由 `camera-rig.test.ts` 的 deterministic regression 覆盖。

## Round 4 closure probe

- reviewer 临时 sessions 耗尽隔离 Gateway 容量后，仅重启本轮自建 `8798` scripted listener；用户既有 `5173/8787` 未触碰。
- 新 session `local-1` 再次完成 scripted Marble turn：Snapshot `snapshot:edit-1`、Ref `v2`、Evaluation `PASS`，三个 registered assets 全部 `loaded`，entry truth=`authored-unverified`、bounds=`registered`、无 integrity alert。
- Explore 转场 settle 后 Shift event + 800 ms idle：pose exact 保持 `[0,-1.2,1.15] → [0,0.2,1.05]`，只产生 keydown/keyup 两个事件帧，无连续帧，collision effective=`false`。
