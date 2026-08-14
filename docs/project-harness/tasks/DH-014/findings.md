# DH-014 Findings

## 当前代码事实

- `ThreeViewport` 已设置 `camera.up=(0,0,1)`，但只有固定外部 camera pose 与 OrbitControls；
- 当前 render scheduler 是 one-shot `requestAnimationFrame`，不能为 Explore 另建永久 loop；
- Marble registered observation 的 calibrated `targetBounds` 可作为 Overview/entry validity 的受信 Presentation 输入；
- provider 没有 navigation surface 或 camera truth，entry pose 必须标为 operator-authored / unverified；
- selection raycast 已保留 `EntityRef`，Inspect focus 应复用该 identity，而非 renderer node identity；
- Agent `textarea` 与 viewport 同页，必须以真实 focus ownership 阻断 camera key capture。

## 实现中得到的事实

- 浏览器的极短 key tap 可能在首个 rAF 前完成 keyup；首次有效 keydown 的固定 1/60 秒 nudge 可让 tap 确定，同时长按仍由按需 rAF 接管，idle 不空转；
- CUA mouse drag 的 `movementX/Y` 可能为 0，mouse look 必须同时支持 `clientX/Y` delta fallback；
- 普通 `imported-rigid-mesh` registry 不携带 bounds；只有 digest-verified GLB 成功 parse 后的 finite `Box3` 可标记 `derived-from-loaded-digest`，否则回退 primitive/collision/entity-pose；
- 独立 worktree 的 ignored provider cache 不自动继承；本轮显式只读链接 DH-013 cache 后三项 registered assets 全部 `loaded`，provider network/generation 均未发生；
- Overview 不能把 Alignment layer 冒充 Bounds；Grid 与 Bounds 需要独立、可见的 Presentation toggles。
