# DH-001 Findings

本文件只记录当前 slice 的 research 与实现发现，不是产品 authority，也不复制外部文档正文。

## 已知约束

- 第一条切片必须使用真实 MuJoCo WASM；mock 或视觉动画不能作为 Runtime proof。
- `scope.md` 明确排除 Spark/3DGS、Agent、机器人与多个 Runtime provider。
- `technical-foundation.md` 允许在更少物理 package 中保持 Kernel/Repository/Runtime/Presentation 单向依赖。

## 已确认

- npm registry 中的版本与 package content 已通过实际安装和 lockfile 固化。
- Bun `1.3.14`、SolidJS `1.9.14`、Vite `8.2.1`、Three.js `0.185.1` 与 MuJoCo `3.11.0` 已通过 typecheck、test、build 和真实 Chromium 验证。

## 2026-08-09 官方 MuJoCo WASM 调研

- Google DeepMind 的 MuJoCo 主仓库把 `wasm/` 描述为 canonical JavaScript/TypeScript bindings，并推荐从 npm 安装 `@mujoco/mujoco`。
- Package 是 ESM，包含预编译 WASM、JavaScript bindings 与 TypeScript declarations；bundler/dev server 必须在 Runtime 提供 `.wasm` asset。
- 默认 root export 是单线程 build，支持现代浏览器且不需要特殊安全 header；`@mujoco/mujoco/mt` 才要求 `SharedArrayBuffer`、COOP 与 COEP。
- 本切片选择默认单线程 build。理由是它已经提供真实 MuJoCo 物理，同时不提前引入 Worker、cross-origin isolation 与多线程生命周期。
- 官方 binding 提醒 Embind C++ handle 必须显式 `.delete()`，因此 Runtime 实现必须用 `try/finally` 管理 `MjModel` 与 `MjData`。
- `MjData.qpos` 等数值数组是 WASM memory 的 live view；Episode sample 必须逐帧复制数值，不能保存 view 引用。
- 官方来源：`https://github.com/google-deepmind/mujoco/tree/main/wasm` 与同目录 `README.md`。

## 2026-08-09 版本锁定输入

- 本机 Bun `1.3.14`，Node `26.5.0`。
- npm registry 当前由本机配置指向 Huawei Cloud mirror；`@mujoco/mujoco@3.11.0` metadata 仍明确记录 author 为 Google DeepMind、repository 为 `google-deepmind/mujoco` 的 `wasm` 目录、license 为 Apache-2.0，integrity 为 `sha512-ZtBh...SVX3Q==`。
- `@mujoco/mujoco@3.11.0` exports 同时包含默认单线程入口、`./mt` 与各自 `.wasm` asset。
- 当前 official `create-vite` 的 `solid-ts` template 选择 Solid `1.9.14`、TypeScript `6.0.2`、Vite `8.2.x`、`vite-plugin-solid` `2.11.x`。
- 当前 registry 查询值：Three.js `0.185.1`、Vite `8.2.1`、`vite-plugin-solid` `2.11.14`。
- 本切片使用上述精确版本，不使用 range；lockfile 记录实际 resolution。

## 2026-08-09 实现发现

- `@mujoco/mujoco` 的生成声明确认入口为 async module factory，模型可由 `MjModel.from_xml_string()` 创建，状态位于 `MjData.qpos/qvel`，推演入口为 `mj_step()`。
- free joint 的 `qpos` 按 position xyz 与 quaternion wxyz 排列；Kernel quaternion 使用 xyzw，因此 Runtime 在边界上显式转换，不能直接透传数组。
- 2.5 秒、240 Hz 共执行 600 个物理步；30 Hz 采样包含初态和 terminal，共 76 samples。
- MuJoCo 在本机 Bun test 与 Chromium 中均能真实加载并推演；浏览器无需 COOP/COEP，因为本切片使用默认单线程 build。
- `run` 完成后 TerminalSnapshot 先只由 Repository `record` 登记；current ref 保持指向 edited Snapshot。只有 `adopt` 才推进 ref。
- MuJoCo 改为 dynamic import，使 physics glue 与 WASM 只在第一次 `run` 时加载；Three.js 必须首屏加载，因为 Observation 本身就是首屏产品能力。
- `@types/bun 1.3.14` 与 `@types/three 0.185.4` 是实现实际需要的 development-only 类型依赖。

## 2026-08-09 浏览器发现

- 初次视觉验收发现 `PCFSoftShadowMap` 在 Three.js `0.185.1` 已 deprecated；改用 `PCFShadowMap` 后消除该 warning，没有为兼容旧版本增加分支。
- 1512 × 859 桌面布局展示完整 viewport、inspector 和 evidence dock；390 × 844 移动布局按 viewport → Repository → controls → evidence 顺序纵向展开。
- 时间轴回到 frame 0 时，画面恢复初始高度而 Repository ref 不变；采纳 terminal 后必须同时把时间轴选择同步到 terminal frame，避免 Observation 与 evidence control 互相矛盾。

## 2026-08-09 交叉审查发现

- Snapshot ID 不是普通 Map key，而是 immutable identity。`record()`/`write()` 对同 ID 不同 bytes 的静默覆盖，会让 current ref 在 ID 不变、未 adopt 时改变内容，属于 Repository authority 违例。
- Runtime 接受 Snapshot 就必须完整映射当前 slice 声明支持的 state；忽略 floor rotation 或 dynamic velocity 会把 authoritative input 降格为提示。若不支持，应在 boundary fail closed。
- 240 Hz / 30 Hz 是整数比，采样应由 physics step index 决定。累计 `data.time` 与 `Number.EPSILON` 比较在实际运行中使 52/76 samples 晚一个 timestep。
- Runtime 需要验证正 duration、正 timestep、有效 sample rate、受支持 profile/frame/units；provenance 必须来自实际实现，不能直接复制 caller 自报 provider/version。
- TypeScript `readonly` 只限制编译期，不能证明运行时 immutable。EvaluationRecord 若是证据记录，必须像 Episode 一样在返回前 deep-freeze，并以 contract/evaluator identity 区分评测语义。
- 现有 4 tests 都通过，但 happy path 无法推翻上述反例；下一轮 tests 必须先固定 invariant，再修 implementation。
