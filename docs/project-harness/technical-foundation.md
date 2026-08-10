# 初始技术基线

## 决策状态

本文是第一条 vertical slice 的拟议技术基线，不是 dependency lockfile。精确版本只在实现开始时选择，并必须记录在 active task 中。

## 选定方向

借鉴 Lyaup 已验证技术选择中的最小子集，同时独立设计 Demiurges 架构：

| 关注点 | 初始选择 | 原因 |
|---|---|---|
| package/runtime tooling | Bun workspace | 统一 TypeScript 工具链并获得快速本地反馈 |
| 语言 | TypeScript | 在 Kernel、Repository、Runtime seam 与 Studio 间共享纯 contract |
| Web 应用 | SolidJS + Vite | 已在 Lyaup 证明适用，但不继承其 UI 架构 |
| 第一条切片的 3D Presentation | Three.js | 直接支持 primitive、mesh、camera、selection 与 animation |
| 第一个 Evolution Runtime | MuJoCo WASM | 封闭虚拟物理，并能最短形成可见的端到端 Episode |
| Product MVP 真实感 Presentation | Spark + 3DGS | 在首个 Runtime slice 后尽早验证真实感 Observation 与结构化世界状态的 alignment，同时不让 3DGS 定义 Kernel |
| contract 校验 | TypeScript 加最小 runtime validation | 防止不可信 serialized data 变成隐式事实 |
| 测试 | Bun unit test 加一条 browser end-to-end scenario | 先验证结构化语义，再验证可见结果 |

## 分阶段后置

“后置”必须说明相对于哪一阶段：

- Spark 与 3DGS 只相对于第一条 `falling-cube` Runtime slice 后置；在 Product MVP 早期接入。Spark 是 3DGS 的 Presentation 实现，3DGS 是带 provenance 与 alignment 的 appearance/observation representation，两者都不能成为 Kernel 或 authoritative state；
- 基于 Electron 的 desktop packaging；
- Python/FastAPI sidecar；
- Mink、OMPL、grasp planner 与 robot-specific controller；
- OpenCode 接入；
- VLM 与 world-model provider；
- database、cloud service、distributed job 与 plugin SDK。

Product MVP 的 3DGS slice 必须对齐同一 `EntityRef` 的 `FrameRef`、units、collision proxy 与 MuJoCo state，并把误差变成可检查的证据。第一条切片的代码骨架不预建 Spark/3DGS package；只有进入该真实 slice 时才增加对应实现。

## 拟议代码骨架

在第一个实现任务真正需要前，不创建空 package。预期结构为：

```text
Demiurges/
├── apps/
│   └── studio/                 # SolidJS/Vite 可观察世界 UI
├── packages/
│   ├── kernel/                 # 纯粹、不可变的 domain records
│   ├── repository/             # write/edit/refs/lineage
│   ├── runtime-mujoco/         # 第一个 Evolution Runtime
│   └── presentation-three/     # Snapshot/Episode → Three.js
├── examples/
│   └── falling-cube/           # 第一条 Golden Scenario
├── tests/
│   └── acceptance/             # 跨边界 vertical-slice checks
└── docs/project-harness/       # 项目 authority
```

Package 边界用于保护 ownership，而不是追求 package 数量。如果更少的物理 package 能让第一条切片更清楚，就在更少目录中保持同样的依赖方向；只有出现真实第二 consumer 时再拆分。

## 第一版依赖方向

```text
studio
├── repository
├── runtime-mujoco
└── presentation-three

repository ──→ kernel
runtime-mujoco ──→ kernel
presentation-three ──→ kernel

kernel ──→ no framework/runtime dependency
```

`runtime-mujoco` 与 `presentation-three` 不得互相 import。Host 通过 Kernel-owned records 或 task-local mapping data 协调二者。

## 为什么先做方块

方块是 diagnostic fixture，不是几何限制。它拥有精确 pose、已知 extents、简单 inertia、稳定 contact expectation 和无歧义 success predicate。当端到端链路正确后，再增加丰富 representation，避免复杂资产掩盖 coordinate 或 authority 错误。
