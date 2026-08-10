# 项目范围

## 产品身份

- 产品名：**Demiurges**
- 技术描述：**A World Agent Harness**
- 标语：**造物，从此不再唯一。 / Worldmaking, no longer singular.**

`Demiurges` 特意采用复数。产品不构造一个享有特权的唯一世界，也不指定某个唯一模型成为造物主；它为模型和用户提供共同环境，使世界能够被创建、改变、推演、检查、比较和评测。

## 产品发心

Demiurges 的使命，是让能够描述、感知、生成或预测世界的模型，成为可以在世界中持续工作的 Agent。

项目提供：

- 可寻址、可版本化的世界状态；
- 显式的静态修改与时间演化；
- 可观察的证据，而非仅靠叙述宣称成功；
- 可恢复的历史与可比较的结果；
- 面向模型的极简能力面；
- Runtime-specific 的执行，同时不让任何单一 Runtime 变成世界本体。

长期类比是：

> Coding Agent operates on repositories. Demiurges operates on worlds.

## 首个用户与首个任务

首个用户是希望让 LLM 操作一个可见、封闭的虚拟 3D 世界，并能准确检查变化内容的工程师或模型研究者。

首个任务刻意保持极小：

> 创建包含地面和一个刚体的世界，观察其结构化状态和 3D Presentation，编辑世界描述，运行一次 MuJoCo Evolution，检查 Episode，并评测终态结果。

## Bootstrap MVP

第一条完整 vertical slice 必须证明：

```text
Snapshot
+ WorldProgram
+ RuntimeProfile
+ ExplicitInputs
→ Episode
+ TerminalSnapshot
+ EvaluationRecord
```

同时必须证明：

- `read` 暴露结构化状态与 Presentation 证据；
- `write` 创建初始世界资源；
- `edit` 产生新 Snapshot，但不虚构历史；
- `run` 产生 Episode 与终态；
- Three.js 呈现状态，但不拥有状态；
- MuJoCo 推演状态，但不拥有 Repository refs；
- 成功由预先声明的 predicate 判定，而不是由 LLM 叙述决定。

## 第一条切片的 Non-goals

- 把 Lyaup 作为起始代码库导入；
- 机器人适配、运动规划、抓取生成或 VLM loop；
- 3DGS、Spark、Electron、Python sidecar、Mink、OMPL 或真实设备；
- 通用世界本体或 Adapter SDK；
- 多个 Runtime provider；
- 多人协作、云服务、权限平台、市场、计费或部署；
- 照片级 Presentation；
- 可变形物体或流体仿真；
- 把生成视频当作可执行世界状态。

## 与 Lyaup 的关系

Lyaup 仍是聚焦机器人能力适配与闭环任务执行的独立应用。Demiurges 可以从它的真实工程证据中学习，并在未来通过明确的 Runtime/Application 边界支持它，但两个项目不共享 authority，也不共同维护一个持续变化的 common core。
