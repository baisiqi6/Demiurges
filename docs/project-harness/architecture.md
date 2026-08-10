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

第一个 Agent Runtime 实现采用锁定版本的 Oh My Pi（OMP）SDK restricted session，而不启动完整 CLI。Demiurges Agent Gateway 只把 `world_read`、`world_write`、`world_edit`、`world_run` 注册为 host-owned custom tools；tool closure 在 Demiurges Host 进程执行。session construction 使用显式 tool allowlist，并关闭 MCP、内建 coding tools、extension discovery、skills、rules、IRC、LSP 与持久 session；任何 prompt 前还要核验 active/enabled tools 恰好为四工具且 mounted tools 为空，否则 fail closed。

OMP 的 prompt、message 与 event 只属于 Agent Gateway，不进入 Kernel contract。Gateway 拒绝 OMP slash/control 与 `@file` preprocessing syntax，避免四工具之外的隐式控制或文件读取。Gateway trace 是 JSON-safe 的观察证据，也不拥有或替代 Snapshot、Episode、EvaluationRecord 与 Ref；失败 turn 仍保留 frozen trace。

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

`DH-005` 在此基础上增加本地 Bun Agent Gateway 与嵌入式 OMP SDK restricted session，用于验证 Agent Runtime 边界。`DH-006` 出现 Studio 与 Gateway 两个真实调用方后，才把既有 Kernel、Repository、Runtime、Evaluation、Host 与四工具提升为最小内部 workspace package `@demiurges/world`；这不是通用 Adapter SDK，也不包含 Three.js、SolidJS 或 OMP。

connected Product Session 的唯一可写 `RuntimeMvpHost` 位于 Gateway。Studio 通过 Demiurges 自有、bounded、ordered、JSON-safe 的 HTTP NDJSON event stream 接收增量证据，并通过只读 resync 获取当前 projection；它不再实例化第二个 Host，也不从渲染状态反推世界状态。OMP message/event 仍只停留在 Gateway，跨进程 contract 是 product-owned `ProductSessionEvent` 与 `ProductSessionProjection`。

这个 product contract 不是只靠 TypeScript cast：共享 codec 先通过 own property descriptor 把输入复制为全新 plain-data graph，再对 event lifecycle、session/turn identity、trace sequence、tool/evidence association、Snapshot/Ref/Episode/Evaluation DTO 与整体 node/depth/string/collection budget 做 fail-closed admission。派生 identity 服从真实 producer contract，不以与 runId 派生规则冲突的局部长度猜测误拒合法 evidence。Gateway 在构造 `200 NDJSON` 前原子取得 turn authority；request body 按真实 UTF-8 bytes 限额并精确解析 media type。任何 stream/parse/abort failure 都在单一 wall-clock deadline 下 bounded follow-up resync，每个 GET 共享剩余预算；只有取得 `running:false` 的 settled projection 才算恢复，预算耗尽则清空 partial authority。tool failure 是可恢复的中间 evidence，只有 `turn.completed`/`turn.failed` 决定 outcome；failure trace 只保留 `[redacted]` 与稳定 public code，不转发原始 tool input、OMP、Host、path、credential-like message 或 stack。

当前闭环只注入 deterministic scripted Agent client，验证自然语言输入、四工具调用、权威证据、逐帧 Episode 回放与评测的产品链路。真实 provider/model prompt、credential 与费用尚未获授权，不能把 scripted product loop 描述为模型能力已经接入。

## 防止架构漂移的规则

- renderer node 不是 Entity。
- MuJoCo body 或 geom 不是 Entity。
- artifact URL 不是世界状态。
- Episode 的终态视图在显式 adopt 前不是 current world。
- `edit` 不能伪造时间证据。
- `run` 不能静默修改 Repository refs。
- 提取通用 Adapter SDK 前必须出现第二个真实实现。
