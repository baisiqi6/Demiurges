# Observer 与 Embodiment

## 为什么需要这一层

Demiurges 呈现的既可能是单个物体，也可能是可进入的 3D 世界、Episode 历程，或未来由 action-conditioned world model 持续生成的 Observation。它们不能共用一个含义模糊的“相机控制器”。

`OrbitControls` 适合围绕目标检查物体；它不能单独承担进入世界、具身行动、传感器观察和调试概览。Observer 层的职责，是明确“谁以什么身份、通过什么视点、为了什么目的观察世界”，同时不让 Presentation state 静默变成 Snapshot authority。

## 四类 Observer

| Observer | 目的 | 第一版状态 | Authority |
|---|---|---|---|
| `Overview Observer` | 从世界外部查看整体边界、坐标、alignment 与 debug proxy | 实现 | 纯 Presentation |
| `Inspect Observer` | 围绕选中的 Entity 检查外观、pose、语义与物理代理 | 实现 | 纯 Presentation |
| `Explore Observer` | 从世界内部自由观察环境 | 实现 | 纯 Presentation |
| `Embodied Observer` | 绑定角色、机器人、车辆或传感器，以动作驱动世界并接收 Observation | 只冻结语义边界，不实现 runtime | 动作进入 `WorldProgram` / `ExplicitInputs`；Observation 成为 Episode/Artifact evidence |

前三者只是同一 Three.js Presentation 中的观察策略。它们可以移动用户相机，但不得写 Snapshot、推进 Ref、伪造 Episode，也不得把当前屏幕像素反推成世界状态。

`Embodied Observer` 不是第四种自由相机。它代表一个世界内主体或传感器：其 action 会参与 `run`，其输出属于受 provenance、Frame 与 Units 约束的 Observation。未来接入 action-conditioned world model 时，模型的 camera/action contract 应落在这里，而不是塞进通用 Viewer。

## 第一版交互契约

第一版只暴露三个显式模式：

```text
Explore | Inspect | Overview
```

模式必须在 viewport 内可见，不允许依靠用户猜测当前鼠标和键盘行为。

### Explore

- 世界级 3DGS 或大型场景默认提供“进入世界”入口；进入后使用经过登记的 Presentation entry pose。
- 当前 Marble fixture 没有已验证的 navigation mesh，因此第一版是无碰撞 `Fly`，不宣称 `Walk`。
- `W/S` 前后、`A/D` 左右、`Q/E` 沿 world Z 轴下降/上升、`Shift` 临时加速、滚轮调节 fly speed、`Esc` 释放输入。
- 鼠标拖动或显式 pointer-lock 控制视线；pointer-lock 不能是使用产品的唯一方式。
- 运动数学必须以 Demiurges 的 Z-up frame 为准，不得直接复用假设 Y-up 的控制器方法。
- Explore 默认隐藏 collision proxy wireframe；proxy 只在显式 debug layer 中显示。
- 接近已知 bounds 时显示“当前世界边界 / 未知区域”，不得把飞到 3DGS 外壳之外的画面伪装为正常世界内容。

### Inspect

- 保留围绕 target 的 Orbit 行为。
- 单击选择 Entity，`F` 聚焦当前选择；双击可作为同一能力的鼠标入口。
- 聚焦目标来自受信 Entity representation/bounds，不以屏幕像素或未登记 renderer node 建立新 Entity 身份。

### Overview

- 根据已登记世界 bounds 自动 frame 整体场景。
- 明确标注这是世界外部的调试/编排视角，而不是主体所在位置。
- 可以显示 grid、bounds、alignment 与 collision proxy，但这些 debug layer 默认不污染 Explore。

### Reset 与 entry pose

- 每种模式拥有自己的 reset pose；切换模式不复用一个全局硬编码相机位置。
- `Explore` entry pose 是 Presentation registry 中带 provenance/truth level 的配置，不进入 Snapshot。
- 当 provider 或 fixture 没有可靠 entry pose 时，UI 必须明确使用 authored fallback；不得假称它是导航真值。
- 将来只有在出现已验证 `navigation surface`、grounding 或 provider camera provenance 后，才把 `Walk`、重力和 camera collision 建立在它们之上。

## 输入与可访问性

- viewport 必须可聚焦；只有获得焦点，或用户主动按住约定鼠标键/进入 pointer-lock 时，才接管导航按键。
- `input`、`textarea`、`select`、`contenteditable` 和 Agent 对话框中的按键永远不触发相机运动。
- `blur`、`visibilitychange`、mode change、pointer-lock exit 和 component unmount 都必须清空 pressed-key state，防止相机持续漂移。
- 提供可见的键盘提示、当前模式、fly speed 与 reset 入口；不能只靠隐藏快捷键。
- 模式转场应短而可中断，UI 微交互不超过 300ms；`prefers-reduced-motion` 下直接切换或显著减少运动。

## 最小实现结构

当前已有多个真实观察行为，因此可以使用一个小型、组合式 controller seam，但不建立通用 plugin system 或类继承树。

建议最小形状：

```ts
type ObserverMode = "overview" | "inspect" | "explore";

interface ObserverController {
  activate(): void;
  deactivate(): void;
  reset(): void;
  update?(deltaSeconds: number): boolean;
  focus?(target: PresentationTarget): void;
}
```

约束：

- `CameraRig` 只拥有 Three.js camera、当前 `ObserverMode` 与三个 controller 的组合。
- controller 共享明确的 `worldUp=(0,0,1)`、Presentation bounds 与 input owner；不各自维护第二份世界状态。
- 只有 Explore 在按键活动、转场或 renderer dirty 时请求连续 frame；空闲时恢复当前按需渲染，避免永久 animation loop。
- `Embodied Observer` 暂不加入 `ObserverMode`，也不创建空实现。未来真实 provider 提供 action/observation contract 后，再通过独立 `Embodiment` composition 接入。

## 第一版验收

1. 加载 DH-013 的 Marble 3DGS 场景后，用户可以显式点击“进入世界”，初始画面位于登记的 entry zone，而不是固定在世界 AABB 外部观察黑色外壳。
2. viewport 始终显示当前 `Explore / Inspect / Overview` 模式，并可通过可见控件切换。
3. Explore 的 W/S/A/D/Q/E、Shift、鼠标视线、滚轮速度和 reset 在 Z-up frame 下行为正确。
4. Agent 输入框聚焦时键盘完全不移动相机；viewport blur、切换 tab 或退出 pointer-lock 后不存在 stuck key。
5. Inspect 能选择 Entity、`F` frame selection，并保持既有 EntityRef、representation layer 与 Episode playback 语义。
6. Overview 能 fit registered world bounds，并允许显式显示 debug proxy；Explore 默认不显示 proxy wireframe。
7. 任意模式切换和相机运动都不改变 Snapshot、Repository Ref、Episode、Evaluation 或 AdoptPolicy evidence。
8. primitive、imported mesh、3DGS 缺失/加载失败和 Marble 3DGS 四类场景都有确定的 reset/fallback，不出现 NaN pose、空白 viewport 或不可恢复控制状态。
9. `prefers-reduced-motion`、键盘可达性与可见操作提示通过 browser acceptance。
10. 空闲 viewport 不因 Explore 支持而永久运行无效 rAF；连续渲染只发生在运动、转场、Episode playback 或 Spark dirty 期间。

## 明确后置

- 基于 collision/navigation mesh 的 `Walk`；
- camera 物理、蹲伏、跳跃和角色控制器；
- gamepad、移动端双摇杆、VR/AR；
- minimap、teleport、书签和多人 camera presence；
- Agent POV、机器人传感器、多 camera synchronization；
- world model action schema、逐帧 rollout 与 promptable world event。

这些能力必须在出现真实调用方和可验证 provider contract 后，扩展 `Embodied Observer`，而不是继续给 Explore 增加 flag。

## 外部设计依据

- [Three.js OrbitControls](https://threejs.org/docs/pages/OrbitControls.html) 与 [PointerLockControls](https://threejs.org/docs/pages/PointerLockControls.html) 分别代表围绕目标检查与第一人称导航。
- [SuperSplat Camera Controls](https://developer.playcanvas.com/user-manual/supersplat/editor/camera-controls/) 显式区分 Orbit 与 Fly，并提供 WASD、Q/E、速度、focus 与 reset。
- [World Labs Marble Expand](https://docs.worldlabs.ai/marble/create/prompt-guides/expand) 把已知世界边界与未知/可扩展区域显式呈现。
- [World Labs Marble Record](https://docs.worldlabs.ai/marble/create/studio-tools/record) 把自由探索、camera pose 与 cinematic timeline 分离。
- [Google Project Genie](https://blog.google/innovation-and-ai/models-and-research/google-deepmind/project-genie/) 在进入世界前分别定义 environment、character、movement 与 first/third-person perspective。
- [Odyssey-1](https://odyssey.ml/introducing-odyssey-1) 把用户 action 与 frame history 作为下一帧世界状态的条件，说明具身观察不能退化为任意自由相机。
