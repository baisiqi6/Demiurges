# 架构

## 第一原则

第一版不是一个外挂 Agent 的 3D Viewer，而是一条薄而完整的世界操作闭环；其中的状态、演化、呈现与证据始终能够被区分。

```text
User / Model
    ↓
Harness capability surface
    ↓
Repository + Authoring ──────────────┐
    │                                │
    │ Snapshot + WorldProgram        │
    ↓                                │
Evolution Runtime                    │
    │                                │
    ├── Episode + TerminalSnapshot   │
    └── Artifacts                    │
             ↓                       │
Evaluation                           │
             ↓                       │
Presentation                         │
             └───────────────────────┘
```

## 稳定边界

### Kernel

拥有 `Snapshot`、`WorldProgram`、`Episode`、`Artifact` 和 `EvaluationRecord` 的语义。不得 import Three.js、MuJoCo、SolidJS、Spark 或任何 model-provider SDK。

### Repository / Authoring

拥有不可变记录、lineage、refs、`write` 和 `edit`。Repository 对终态的 adopt 与 Runtime 执行彼此分离。

### Evolution Runtime

消费冻结的 base Snapshot、WorldProgram、RuntimeProfile 和 ExplicitInputs，产生 Episode 与可选终态。第一个实现是 MuJoCo，但 MuJoCo type 不得穿透到 Kernel contract。

### Presentation

把 Snapshot 或 Episode 证据映射为人可见的视图。第一个实现是 Three.js。在 Product MVP 中，Spark 作为 3DGS 的 Presentation 实现，消费带有 provenance 与 alignment 的 appearance/observation artifact；它不定义 Kernel，也不拥有 Entity pose、collision 或 MuJoCo state。Presentation state 永远不能被静默提升为 authoritative world state。

### Evaluation

依据已声明的 Success Contract 评测不可变 Episode。每次评测创建新的 EvaluationRecord，而不是修改 Episode。

### Agent Shell

把用户意图编译为 `read`、`write`、`edit` 和 `run` 调用，并决定下一步。它位于 Kernel 之外，只有非 Agent 的 vertical slice 成立后才接入。

这四个调用是 model-facing world tools，不等于全部 Harness control operations。`run` 可以返回 Episode 与 deterministic Evaluation evidence，但不能推进 Repository ref；`adopt` 仍是 Harness control boundary 的显式 authority transition，不为了凑成“四个工具”而藏进 `run` 或伪装成静态 `edit`。模型只持有 tool surface，组合它的 Host/control side 保留 adopt authority。

## Walking skeleton

### WS-1：可观察状态

- 加载一个包含地面和方块的 canonical Snapshot。
- 通过 Three.js 呈现。
- 选中 Entity 时显示 `EntityRef`、pose、geometry representation、physics properties、frame 与 units。

### WS-2：静态创作

- `write` 创建初始世界。
- `edit` 修改方块 pose 或属性，并创建 child Snapshot。
- UI 能够比较 base Snapshot 与 edited Snapshot。

### WS-3：动态演化

- 一个固定 WorldProgram 让方块在重力下释放。
- MuJoCo 产生 Episode、events、samples 和 TerminalSnapshot。
- UI 可以拖动 Episode 时间轴，但浏览视图不会因此成为 authority。

### WS-4：评测

- 确定性 predicate 验证方块是否在容差内稳定落在地面上。
- `simulate` 不改变 authoritative ref。
- 验收后由独立 adopt 操作推进 ref。

### WS-5：Agent 接入

- LLM 把自然语言请求编译为已有能力调用。
- Agent 读取结构化证据，并能在失败后修改 WorldProgram。
- 第一层 provider-neutral surface 只暴露 `read`、`write`、`edit`、`run`；Harness control 独立决定是否 adopt 已通过评测的 terminal。
- 在真实任务证明 VLM 或 world model 提供了必要的新信息前，不接入这些角色。

## 第一版进程拓扑

上述语义边界不要求提前制造进程边界。只要 import 和 ownership 保持单向，第一条切片可以运行在一个本地 Web 应用内。

MuJoCo WASM 初期可以运行在浏览器中。只有测量证明仿真工作威胁 UI 响应性或隔离性时，才迁入 Web Worker。Python planning service 不属于第一条切片。

## 防止架构漂移的规则

- renderer node 不是 Entity。
- MuJoCo body 或 geom 不是 Entity。
- artifact URL 不是世界状态。
- Episode 的终态视图在显式 adopt 前不是 current world。
- `edit` 不能伪造时间证据。
- `run` 不能静默修改 Repository refs。
- 提取通用 Adapter SDK 前必须出现第二个真实实现。
