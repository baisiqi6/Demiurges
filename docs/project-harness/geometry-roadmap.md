# 几何与 Representation 演进路线

## 原则

Demiurges 不局限于 voxel，也不会用方块拼成所有物体。第一个方块只是几何领域的 `Hello World`。

稳定抽象不是一种万能 geometry type，而是具有稳定身份和显式 representation reference 的 Entity。

## Representation 分离

```text
Entity
├── visual representation       人看到什么
├── collision representation    接触计算使用什么
├── physics representation      mass、inertia、friction、constraints
├── observation representation  render、depth、point cloud、3DGS、latent
└── semantic representation     identity、roles、frames、relations
```

一个精细杯子可以使用光滑 GLB mesh 渲染，使用 compound 或 decomposed collision proxy 参与碰撞，携带独立 physics properties，并显式声明 rim/grasp frames。3DGS 可以提供 appearance/observation evidence，但不会自动成为 collision geometry，也不会拥有 Entity pose 或 MuJoCo state。Spark 是消费 3DGS artifact 的 Presentation 实现，而不是 Kernel 组成部分。

## 能力阶段

### G0 — Diagnostic primitives

支持 floor、box、sphere、capsule、cylinder、transform、material 与 rigid-body parameters。

验收：一个方块从 Snapshot state 被渲染，在 MuJoCo 中下落并稳定，最终在 tolerance 内通过评测。

### G1 — 导入 static 与 rigid mesh

支持独立提供的 GLB/OBJ/STL 类 mesh artifact，并显式声明 units、source frame、visual mapping 与 collision proxy。

验收：在 structured state、Presentation 与 physics evidence 中选择同一对象时，必须解析到同一个 EntityRef。

### G2 — 3DGS Observation 与 Spark Presentation 对齐

在 Product MVP 早期支持把 3DGS artifact 显式登记为 Entity 的 `visualRef`、`observationRef` 或两者，并要求每个角色分别声明。Spark 负责把该 artifact 呈现出来；结构化 Snapshot、collision proxy 与 Runtime evidence 仍是各自职责的 authority。

验收：同一个 `EntityRef` 的 3DGS appearance、`FrameRef`、units、alignment transform、collision proxy 与 MuJoCo state 能在选中对象和 Episode 关键帧时共同检查；其空间误差有声明的 tolerance 和失败结果，不能靠视觉上“差不多”判定通过。

### G3 — 曲线与精细 rigid shape

支持由 imported mesh 或 procedural/parametric generation 产生的曲面物体，例如 Bézier profile、spline、revolution、sweep、loft、subdivision surface 或 CSG。Presentation 可以把曲线 tessellate 为三角面；physics 可以使用简化 convex 或 compound proxy。

验收：杯子类对象在已声明 collision representation 中保留开放、可用的内部空间，不得静默使用封闭的单一 hull。

### G4 — Articulated Entity

支持 link、joint、actuator、sensor、stable frame，以及一个机器人 Entity hierarchy 的多种 representation mapping。

验收：导入 articulated fixture 不需要修改 Kernel record，也不能让 MuJoCo ID 成为 authoritative EntityRef。

### G5 — Non-rigid 与 uncertain world

只有真实任务需要后，才增加 deformable、stochastic、partially observed 或 belief-state representation。

验收标准必须从具体 Runtime 和任务出发设计，不能预先投射进初始 Kernel。

## 准入规则

新的 geometry representation 只有回答以下问题后，才能进入稳定架构：

1. 它代表哪个 EntityRef？
2. 它使用哪个 frame 与 units？
3. 它承担 visual、collision、physical、observational、semantic 中的哪种角色，或哪些被显式声明的复合角色？
4. 它的 provenance 与 content identity 是什么？
5. alignment 如何验证？
6. 什么证据证明 active Runtime 确实使用了它？

阶段编号表达验证依赖，不表达本体层级。把 3DGS 提前到 G2，是为了在 articulated robot 之前尽早暴露 frame、units、alignment 与 proxy/state 漂移；它不因此获得高于其他 representation 的 authority。
