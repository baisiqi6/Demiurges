# Domain Model

本文定义语义，不冻结具体 TypeScript 或 JSON schema。

## 不可约记录

### Snapshot

世界在某一 logical moment 的不可变记录。它包含可寻址 Entity、各自状态、active task 所需 Relation，以及对不同 representation 的引用。

### WorldProgram

对预期时间演化或控制序列的冻结描述。它记录 Runtime 应当展开什么，而不是一段非正式聊天指令。

### Episode

WorldProgram 在已声明 RuntimeProfile 与 ExplicitInputs 下，从 base Snapshot 出发运行所产生的不可变记录。它包含 timing、events、observations、artifacts、completion status，以及可选 TerminalSnapshot。

### Artifact

内容可寻址的结果，例如 mesh、trajectory、frame sequence、video、depth image、contact trace 或未来的 latent representation。Artifact 是证据或 representation，不会自动成为 authoritative world state。

### EvaluationRecord

某个已声明 evaluator 依据一个 Success Contract 对一个 Episode 进行评测后产生的不可变结果。多个 EvaluationRecord 可以并存。

### Ref

Repository 中指向不可变 Snapshot 的可变指针。Runtime 执行不拥有也不推进 refs。

## Entity 与 representation

Entity 是稳定身份，不是 render node 或 physics body。

```text
Entity
├── EntityRef
├── semantic properties
├── state
├── relations
├── FrameRef / UnitSystemRef
└── representations
    ├── visualRef
    ├── collisionRef
    ├── physicsRef
    ├── observationRef
    └── optional sourceRef
```

因此，同一个 Entity 可以拥有精细外观、使用简化 proxy 进行碰撞、携带独立的 mass 与 inertia，并暴露 semantic grasp frame，而不需要制造多个身份。

## State 与 evolution

`edit` 改变世界描述：

```text
Snapshot A → edit(cube.pose = B) → Snapshot B
```

它不声称方块曾经从 A 移动到 B。

`run` 产生一段历史：

```text
Snapshot A + WorldProgram(drop cube) → Episode → Snapshot C
```

Episode 记录时间如何经过，以及期间发生了什么。

## Observation、Belief 与 Presentation

- Observation 是对状态或执行的捕获或查询结果。
- Belief 是模型依据 Observation 形成的估计。
- Presentation 是面向人的可见呈现。

三者都不能静默替代 authoritative Snapshot state。

## Reproducibility

每个 RuntimeProfile 声明一个等级：`exact`、`numeric`、`seeded-stochastic` 或 `observational`。第一个 MuJoCo profile 默认以显式 tolerance 下的 `numeric` equivalence 为目标，除非实现证据能够证明更强保证。
