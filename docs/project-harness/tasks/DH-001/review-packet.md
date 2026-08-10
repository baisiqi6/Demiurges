# DH-001 独立审查 Packet

## 请求的 decision

返回 `approved`、`changes_requested` 或 `blocked`。实现者请求审查，不自行批准或关闭 item。

## 实现范围

- canonical Snapshot 与 child edit lineage；
- 内存 `WorldRepository` 的 `record` / `adopt` 分离；
- 真实 MuJoCo WASM falling-cube Episode；
- TerminalSnapshot 与 deterministic landing Evaluation；
- Three.js Observation 与 SolidJS Studio；
- edit → run → timeline → evaluate → adopt 浏览器闭环。

明确不包含 Agent、VLM、Spark、3DGS、imported mesh、机器人、persistence、remote、deployment 或通用 Adapter SDK。

## 关键文件

- `apps/studio/src/kernel/types.ts`
- `apps/studio/src/kernel/world.ts`
- `apps/studio/src/repository/world-repository.ts`
- `apps/studio/src/runtime-mujoco/run-falling-cube.ts`
- `apps/studio/src/evaluation/evaluate-landing.ts`
- `apps/studio/src/presentation-three/ThreeViewport.tsx`
- `apps/studio/src/App.tsx`
- `apps/studio/src/**/*.test.ts`
- `docs/project-harness/tasks/DH-001/plan.md`

## 已执行证据

- `bun test`：4 pass、0 fail、22 assertions；真实 MuJoCo WASM test 约 75 ms。
- `bun run typecheck`：通过。
- `bun run build`：通过，生成真实 `mujoco.wasm` 与 dynamic MuJoCo chunk。
- Chromium：edit 后 `snapshot:edit-1`；run/evaluate/rewind 后 ref 不变；76 samples；Evaluation `PASS`；adopt 后 ref 为 `snapshot:terminal-studio-1`。
- Chromium：WebGL context 有效；1512px 桌面与 390px 移动 viewport 均完成视觉检查；无 error/alert。

## 必审问题

1. Runtime 是否真实调用 MuJoCo，还是用视觉动画或解析公式伪造？
2. Kernel 是否保持对 SolidJS、Three.js 与 MuJoCo 的实现独立？
3. Snapshot → MJCF 的 collision、frame、units、pose 与 quaternion 边界是否明确？
4. Episode sample 是否复制 WASM live view，Embind handle 是否可靠释放？
5. `record`、timeline 与 `evaluate` 是否都不会推进 current ref？
6. `adopt` 是否是唯一显式推进 terminal 的操作？
7. evaluator 是否独立读取 Episode metric，而不是读取 UI/Three.js？
8. 是否存在超出 `DH-001` 的提前抽象或补丁式复杂度？

## 已知非阻断项

- `mujoco.wasm` 约 10.1 MB，Three.js 主 chunk 超过 Vite 默认 500 kB warning threshold；尚未做真实网络性能预算。
- Vite 对 MuJoCo glue 中 Node `module` import 给出 browser-external notice，但真实 Chromium Runtime 已通过。
- Repository 是内存实现，刷新不持久化。
