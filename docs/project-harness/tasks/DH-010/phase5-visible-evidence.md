# DH-010 Phase 5 Visible Product Evidence

## Authority 与边界

- Human authority：2026-08-11 明确授权进入 Phase 5 Studio visible slice；
- base：`22e288690937834135584d023e4140e26696f761`；
- branch：`agent/codex/DH-010`；
- 本阶段只实现并验收 ball-vessel / falling-rigid 的 Product Session Presentation；没有进入 Phase 6 independent review；
- 未调用真实 provider，未执行 commit、push、PR、merge、tag、deploy、closeout 或 `mark-done`。

## Scenario-driven Studio

- 默认 selection 从当前 Snapshot 中的 dynamic Entity 解析：falling-rigid 选择 `entity:cube`，ball-vessel 选择 `entity:ball`；仍存在的用户选择被保留，stale EntityRef 在新 Snapshot/Session 中清除；
- Presentation mode 依据所选 Entity 的受信 Observation 决定：diagnostic wedge 默认 `3dgs`，ball/vessel 默认 `mesh`；无 Observation 时 3DGS control disabled；
- Program、RuntimeProfile、metrics、footer、artifact URL/provenance 与 semantic rim data 全部来自受信 `WorldReadResult / WorldRunResult` projection 或 closed repo asset registry；
- App 已移除首个场景偶然硬编码 `CUBE_REF`、`FALLING_CUBE_PROGRAM`、`DIAGNOSTIC_RIGID_ASSET`；renderer 不创建 Snapshot/Runtime，也不反向写 authority。

## Three.js Presentation

- box 与 sphere 使用可选中 visual mesh；sphere 使用 48 × 32 curved tessellation；
- imported visual registry 同时支持 `asset:diagnostic-wedge-v1` 与 `asset:smooth-vessel-v1`，identity/digest 不匹配 fail closed；
- collision overlay 支持 box / sphere / compound。vessel overlay 恰好 17 nodes（base + 16 walls），每个 node 的 selection identity 都是 `entity:vessel`；`partKey` 只用于 overlay 诊断，不成为 EntityRef；
- rim-center helper 直接使用 `representations.semantic.rimFrame.localPose`，显示 `frame:vessel-rim-center` 的 ring + axes，不从 GLB bounds 推导；
- Episode sample 同步 floor/vessel/ball 三个 Entity state；selected ball 与 vessel 都能在逐帧播放中读取同一 sample authority。

## Cross-engine registry correction

首次 Chromium run 可执行地发现：runtime-generated wall poses 会在 Bun/JavaScriptCore 与 Chromium/V8 之间出现三角函数末位差异，触发 exact Product registry drift。根部修复为：

- 16 个 wall local poses 变成 fixture 内固定 plain-data literals；
- 不放宽 Product codec equality/tolerance；
- 新增 `cross-engine fixture registry 不在运行时重算三角函数 pose` regression；
- ball-vessel projection 新增真实 `JSON.stringify → JSON.parse → decode` regression；
- frozen collision registry JSON 为 3,531 bytes，SHA-256 `c0a78d243ce0a9ff688f7511598ad682976b66d5a69638cdc156e148e946f99f`。

## Chromium acceptance

真实 Codex in-app Chromium，ball-vessel scripted Product Session（Studio `127.0.0.1:5173` / Gateway `127.0.0.1:8787`）：

- four-tool trace：`world_write → world_read → world_edit → world_run`；
- Evaluation：`PASS`；Program：`program:free-fall-ball-vessel-v1`；Runtime：`runtime:mujoco-wasm-single-3.11.0`；
- 91 samples；自动播放观测到 `frame 53 / 90`，手动从 frame 0 播放到 `frame 26 / 90`，显示源持续为 `episode-frame`；
- default selection 为 `entity:ball`，visual `sphere`，collision `sphere proxy · Ø 0.200 m`；
- canvas 选择 vessel 后 identity 为 `entity:vessel`，visual `asset:smooth-vessel-v1`，collision `compound proxy · 17 parts`，rim `frame:vessel-rim-center`，artifact URL 为 `packages/world/assets/smooth-vessel-v1.glb`；
- overlay control pressed 后 smooth visual、17-part collision 与 rim frame 同屏；3DGS control 对 ball/vessel disabled；
- containment metrics：support `16/16`、radial offset `0.08352 m`、max speed `0.00000 m/s`、floor error `0.00022 m`、penetration `0.00022 m`；无 alert。

第二 Session lifecycle：

- Session `local-1 → local-2` 后 selection 为 `—`、Episode `frame 0 / 0`、Evaluation `等待 evidence`，viewport 不保留 asset dataset；
- 第二 Session 再运行后重新得到 `entity:ball`、PASS、91-sample Episode 与 loaded vessel asset；
- 通过 CDP 只暂停 `smooth-vessel-v1.glb` Fetch：旧 Session 已 PASS 且 `assetStatus=loading` 时创建新 Session，再释放旧请求；释放前后 selection 均为 `—`、Evaluation 均为 `等待 evidence`，新 Session `local-12` 未出现旧 asset dataset 或 alert，证明 late load 不回写 stale object。

diagnostic GLB/3DGS regression（独立 scripted Gateway `8788` / Studio `5174`）：

- Evaluation PASS，default selection `entity:cube`，visual `asset:diagnostic-wedge-v1`；
- 3DGS control enabled 且默认 pressed；Spark Observation `asset:diagnostic-wedge-3dgs-v1` loaded；
- Alignment PASS：bounds error `0.000068 m`，pose error `0 m / 0 rad`，tolerance `0.0010 m`；
- overlay 切换后 GLB/3DGS/proxy 仍保持 alignment PASS；无 alert；
- 临时 viewport `820 × 700` 下 world viewport 为 `820 × 655`，2× pixel ratio canvas 为 `1640 × 1310`，asset/observation loaded、alignment PASS；随后已 reset viewport override。

## Verification gate

```text
bun test
139 pass / 0 fail / 2,826 assertions

bun run typecheck  # pass
bun run build      # pass，仅既有 Vite large chunk warning
git diff --check   # pass
```

Deterministic artifact：

```text
generator SHA-256  0b600eded75a33e42cbaa8623b5ed8c8b6428f1c731ef188543bee9565b94693
vessel GLB SHA-256 856788138ecc53d407827a0e67aa9977237dd914809316f8af992e8ee098cd92
```

Phase 1–5 product digest（`git diff --binary --full-index` 相对 base，排除 `docs/project-harness/**`，并按路径排序追加 untracked product file SHA-256 manifest）：

```text
5e944de6896b697d30e4c58a1580bb7babae12fe41edf2d3c27dda3ebdb0a750
```

## Phase 5 结论

Phase 5 visible slice 已完成：同一个 ball-vessel authority 现在能在 Studio 中被观察、选择、逐帧播放并检查多精度 representation；diagnostic 3DGS/Spark 路径保持；跨 Session、late asset 与 resize 生命周期均通过真实 Chromium 验收。DH-010 仍为 `doing/running`；下一步是 Phase 6 full gates 与 independent review，需 Human 另行授权。
