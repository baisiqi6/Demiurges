# DH-010 计划：曲面容器与内部空间 Vertical Slice

## 状态与 Authority

- Status：`done / closed`；
- Plan review：Round 4 已批准本计划进入实现；Phase 1–5 与四轮 bounded remediation 已完成。vessel-physics authority 与 stale-ref lifecycle 的最终 remediation candidate（product digest `85534951b9146283ffbceddec652a0440d0d38a7543ad4828a86eb42b5df1c57`）已由 fresh Kimi K3 Max + GPT-5.6 Sol Max 两路隔离审查一致批准，`P0=0 / P1=0 / may_closeout=yes`；EXharness closeout review 已批准，item 已 `mark-done`，证据见 `phase6-vessel-physics-stale-ref-cross-review-evidence.md` 与 `docs/project-harness/current/closeout-packet.md`；
- Branch：`agent/codex/DH-010`；
- Worktree：`/Users/Admin/projects/WorkTrees/Demiurges-DH-010`；
- Base：`22e288690937834135584d023e4140e26696f761`；
- Human 已授权把已批准的 `DH-009` fast-forward 合并到 `main` 并推送，以及创建本 item、独立 worktree/branch、EXharness 节点与 canonical design/acceptance plan；
- Human 已授权 Phase 1–6 实现、四轮 bounded remediation、final fresh independent cross-review、closeout、`mark-done` 以及 commit/push 当前 feature branch；尚未授权 PR、再次 merge、tag 或 deploy。

## Goal

用一个确定性、可见、可推演的“球落入开口容器并稳定停留”任务，证明 Demiurges 不依赖方块拼装世界，并能用任务所需的精度表达曲面、开口、内部空间与 compound collision：

```text
repo-owned smooth vessel visual
+ one semantic vessel EntityRef
+ compound collision parts preserving the cavity
+ one dynamic sphere EntityRef
+ explicit free-fall WorldProgram
→ immutable multi-entity Episode
+ stable-inside-vessel EvaluationRecord
```

本切片的关键不是“渲染一个杯子”。它要证明：一个杯子可以在视觉上是光滑曲面，在物理上由多个简化 geom 组成，在语义上仍然是一个 Entity，并且“内部空间可用”必须由真实 Runtime 与 Evaluation 证据证明，不能靠外观看起来像杯子。

## 为什么现在需要最小根部泛化

`DH-001` 到 `DH-009` 的 falling-cube walking skeleton 已证明 Snapshot、Episode、Repository ref、MuJoCo、Presentation、Agent、imported mesh 与 3DGS Observation 的纵向闭环，但当前实现仍包含只对第一个任务成立的脚手架：

- model-facing `write/edit` 输入直接使用 `cubeHeight`；
- Host 与 Runtime 方法以 `Cube` / `FallingCube` 命名并固定 `entity:cube`；
- collision representation 只有单一 box；
- Product codec 固定 floor/cube 两个角色；
- Evaluation metrics 只有 stable-on-floor；
- Studio inspector 默认围绕 `entity:cube` 呈现。

第二个真实任务已经出现，因此这些限制不能继续通过增加 `cupHeight`、`ballHeight`、`isContainer` 或 scenario-specific UI fallback 修补。本切片允许把上述“第一个 fixture 的偶然细节”提升为恰好覆盖两个真实任务的最小 closed union；它不授权通用 world ontology、任意 JSON patch、Adapter SDK 或 plugin system。

## First-principles design

### 1. 稳定语义不变

- model-facing tools 仍恰好为 `world_read / world_write / world_edit / world_run`；
- `write` 创建静态世界描述，`edit` 创建 child Snapshot，`run` 产生动态 Episode；
- `run` 不推进 current ref，terminal adopt 继续由独立 Harness control authority 掌握；
- EntityRef 是身份；Three.js node、MuJoCo body、geom 与 artifact URL 都不是 Entity；
- Kernel records 继续不 import Three.js、Spark、MuJoCo、SolidJS 或 provider SDK。

### 2. 一个容器 Entity，多种 representation

```text
entity:vessel
├── visual       smooth imported/generated GLB surface of revolution
├── collision    compound(base + bounded wall segments)
├── physics      static rigid body
├── observation  null in this slice
└── semantic     vessel identity + rim-center local frame
```

- vessel visual 由仓库脚本依据固定 Bézier/profile-of-revolution 参数确定性生成，不引入通用 CAD Runtime；
- compound collision 由一个 base 与固定数量的有向 box wall segments 构成，所有 part 都是同一 `entity:vessel` 的 local collision component，不获得独立 EntityRef；
- 每个 collision part 具有 entity-local、唯一且冻结的 `partKey`；`partKey` 只用于 fixture/Runtime 内部映射，不是 EntityRef，不得出现在 public semantic contact pair、selection 或 Evaluation target 中；
- collision inner radius 必须保留可用腔体，不能使用封闭 single box、single convex hull 或 visual mesh 直接冒充 collision authority；
- Studio overlay 可以检查每个 collision part，但 selection 与 inspector 仍解析到唯一 `entity:vessel`；
- `rim-center` 是容器 Entity 的显式 local frame，用于放置和评测，不是 Three.js helper 推导出的临时坐标。

`rim-center` 在 Kernel/Product carrier 中不是外部 helper：vessel 的 `representations.semantic` 使用唯一 closed variant `{kind:"vessel", rimFrame:{ref:"frame:vessel-rim-center", localPose}, innerEnvelope}`；floor、cube 与 ball 的 `semantic` 恰好为 `null`。fixture registry、Snapshot、Product codec、Runtime、Evaluation 与 Studio projection 必须逐字段验证同一个 `frame:vessel-rim-center` 与 local pose，禁止由 renderer 临时创建或只存在于测试 helper。

本切片冻结一个 task-local vessel fixture contract，而不是引入通用 frame graph。该 contract 同时登记 deterministic profile/bounds、visual local transform、`rim-center` local pose、inner-floor/inner-envelope、collision parts 与 exact part count。所有 representation 统一使用：

```text
worldPose = entityPose ∘ localPose
```

translated 与 yaw-rotated vessel 必须在 headless probes 中保持 visual bounds、compound proxy、rim frame、inner envelope 和 Runtime/Evaluation 对齐；任一 representation 单独漂移都必须 fail closed。由于 vessel 是旋转对称体，yaw probe 必须比较 composed pose/matrix，并携带一个 fixture-local off-axis diagnostic point；只比较 yaw 前后 AABB、圆形 rim 或 inner envelope 不构成证据。

### 3. 第二个动态 Entity

增加 `entity:ball`：

- visual 与 collision 使用显式 sphere representation；
- physics 为 positive-mass dynamic rigid body；
- 初态位于 `rim-center` 上方；
- free-fall Program 的 target 是 `entity:ball`，而不是继续假定唯一 dynamic body 为 `entity:cube`。

floor、vessel 与 ball 的 EntityRef 集合、body role、representations、frame、units、mass/friction 与初态必须在 Snapshot、Product Session、MJCF、每个 Episode sample、TerminalSnapshot 和 Evaluation target 中闭合。

### 4. 最小 model-facing contract 演进

model-facing contract 在本计划中冻结；Phase 1 的职责是把下列唯一 shape 写成 RED tests，不再替 implementation 重新设计字段：

```text
world_read  {}

world_write {
  fixtureId:
    | "fixture:primitive-box"
    | "fixture:diagnostic-wedge-v1"
    | "fixture:ball-vessel-v1"
}

world_edit {
  expected: { name, snapshotId, version },
  targetRef: "entity:cube" | "entity:ball",
  frameRef: "frame:world",
  pose: {
    position: { x, y, z },
    rotation: { x, y, z, w }
  }
}

world_run {
  runId,
  programId:
    | "program:free-fall-rigid-v1"
    | "program:free-fall-ball-vessel-v1"
}
```

Exact admission rules：

- 每层 input 都必须是 `Object.prototype` 的 enumerable own-data plain JSON record；required keys 必须恰好存在，以上 contract 没有 optional/unknown/symbol/accessor/inherited keys；model-facing input 不使用 Array；`position` 恰好为 `{x,y,z}`，`rotation` 恰好为 `{x,y,z,w}`；
- `fixtureId`、`targetRef`、`frameRef`、`programId` 都是上述 closed enum；`world_write` 不接受 URL、文件、任意 Entity JSON、pose 或 executable code；
- `expected` 继续恰好为 `{name:"world:current", snapshotId, version}`；`snapshotId` 必须匹配 `^snapshot:[A-Za-z0-9][A-Za-z0-9._-]{0,127}$`，`version` 是 `safe-integer>=1`；三个 fixture 都必须通过 `world_read → JSON round-trip → world_edit`，不另造第二个 Ref lexical identity；
- `runId` 必须匹配 `^run:[A-Za-z0-9][A-Za-z0-9._-]{0,63}$`；
- pose 所有分量必须 finite；position `x/y` 在 `[-4,4] m`、`z` 在 `[0,4] m`，quaternion norm 与 1 的误差不超过 current cross-layer authority `1e-9`；fixture validator 还必须依据受信 collision bounds 拒绝初态穿透 floor；Host、Repository/codec、Runtime 与 Presentation 使用同一 tolerance，不做 silent clamp/normalize；边界值与 Episode sample-0 pose 必须闭合；
- falling-rigid 两个 fixture 只允许 `targetRef=entity:cube` 与 `program:free-fall-rigid-v1`；ball-vessel 只允许 `targetRef=entity:ball` 与 `program:free-fall-ball-vessel-v1`；Program 与 current Snapshot fixture 不匹配必须在 Runtime 前 fail closed；
- `world_write` 创建 canonical initial pose；非 canonical placement 统一通过后续 `world_edit`，不把 height/pose 再塞回 write；
- `fixture:diagnostic-wedge-v1` 继续携带现有 imported GLB + 3DGS Observation，不能在迁移中退化或失去入口；
- 旧 `cubeHeight`、optional `fixtureId` 与 `program:falling-cube` model-facing shape 一次性删除，不保留 legacy/modern 双入口。

在 product/world-tools boundary 增加一个冻结 plain-data `WORLD_TOOL_CONTRACT` 作为 keys、nested object shape、`const`/enum、bounds、pattern、`additionalProperties:false` 与 input budget 的唯一来源；Host admission、Gateway `requireBoundedToolInput` pre-admission 与 OMP JSON Schema 均消费该 contract。executable parity tests 不只比较 schema 文本，还必须经真实 restricted `tool.execute` 证明合法 nested object pose 可达 Host，并拒绝 Array、sparse/accessor/symbol/prototype/extra key、错误 string pattern、const、nested shape、bounds 与 non-finite 值。它不是 Kernel record、scenario framework 或 plugin schema。

### 5. 最小 Kernel 与 Runtime 演进

只增加第二个任务实际需要的 closed variants：

- `VisualRepresentation` 增加 bounded sphere；现有 imported mesh 继续承载 vessel visual；
- `CollisionRepresentation` 从单 box 扩展为 `box | sphere | compound`，compound part 使用 entity-local pose；
- `SemanticRepresentation` 只增加 `null | vessel` closed union；vessel variant 承载 `frame:vessel-rim-center`、local pose 与 inner envelope，不建立任意 frame collection/graph；
- `WorldProgram` 继续表达受信 free-fall evolution，但 target 不再固定为 cube；
- `EvaluationRecord` 使用 exact discriminated contract/metrics union，保留 stable-on-floor，并新增 stable-inside-vessel；不退化为任意 `Record<string, number>`；
- MuJoCo Runtime 只在第二个真实 consumer 成立后把 falling-cube 专名收窄为 task-neutral free-fall/multi-entity implementation；不建立第二 Runtime provider 或通用 Runtime plugin interface。

Product codec 需要按受信 world/program contract 验证 exact entity set 与 role closure。这里允许两个已存在 scenario 的小型 closed registry/validator，禁止继续复制第二份整段 floor/cube/ball if-chain，也禁止把 executable validator、renderer object 或 MuJoCo ID 写进 Kernel。

### 6. Evaluation 与 adopt authority 一起闭合

新增 evaluator 不能绕过现有 terminal adopt authority。Host 只允许按已注册的 WorldProgram/scenario identity 从一个冻结的 closed registry 选择对应 `evaluatorId + contractId + AdoptPolicy`；policy 不能来自 Agent input、EvaluationRecord 自报字段、Presentation 或 transport projection。

- falling-rigid 与 ball-into-vessel 各有一个受信 policy entry；
- 两个合法 contract 的 passed Evaluation 都能通过同一 Repository authority 规则 adopt terminal Snapshot；
- 未注册 Program/contract、错配 evaluator-contract-policy、alternate contract 注入与 failed Evaluation 继续 fail closed；
- `run` 仍不推进 ref，四工具仍不暴露 adopt；
- 这是现有 DH-003 lexical-closure authority 的 closed-set 演进，不是通用 policy plugin/registry SDK。

## Diagnostic world

推荐固定尺寸（实现时可在不改变语义的前提下由 RED probe 微调一次）：

- vessel outer radius：约 `0.50 m`；
- vessel inner radius：约 `0.40 m`；
- vessel height：约 `0.65 m`；
- base thickness：约 `0.08 m`；
- visual radial segments：至少 `48`，形成真实曲面轮廓；
- collision wall segments：固定 `16` 个 box parts；
- ball radius：约 `0.10 m`；
- ball initial center：位于 rim-center 上方约 `0.60 m`；
- canonical 轨迹必须具有 bounded radial offset 或 bounded lateral velocity，使轨迹对 wall 是否存在、是否错位真实敏感，不能只用永远不触壁的中心竖直落体；
- RuntimeProfile：继续使用已锁定 MuJoCo WASM numeric profile；
- `program:free-fall-rigid-v1` 保持 `durationSeconds=2.5, sampleRateHz=30`；`program:free-fall-ball-vessel-v1` 固定 `durationSeconds=3.0, sampleRateHz=30`，两者 terminal 都落在 30Hz sample grid；
- Episode：覆盖首次接触、进入容器与稳定终态；
- MJCF/runtime evidence 必须能断言 exact `base + N walls` vessel geoms；缺失、错位、重复或 owner mapping 错误均 fail closed。

repo-owned visual artifact 必须由确定性 generator 产生并登记 SHA-256、byte length、provenance/license、source frame、units、local transform 与 bounds。generator 重跑必须 byte-identical；Agent 不能提供 artifact bytes/path/URL。

## Evaluation contract

新增 `success:stable-inside-vessel`，至少包含并冻结：

- `targetRef = entity:ball`；
- `containerRef = entity:vessel`；
- rim-center frame identity；
- 最大水平轴偏差；
- ball center 必须低于 rim plane 且高于 inner floor；
- terminal linear speed 上限；
- `settleWindowSeconds` 与 Episode 尾部连续 sample window，不以单一 terminal frame 判定稳定；
- ball-vessel support/contact 必须在 settle window 内成立，且 ball-bottom 到受信 inner-floor 的距离在有界容差内；
- Runtime 将 MuJoCo geom contact 通过内部 geom-owner map 折叠为 EntityRef semantic contact evidence，并记录 finite pair-attributed penetration；Evaluation 检查 ball-vessel support、penetration bound 与错误 floor attribution；
- finite state、无数值爆炸；
- 明确 numeric tolerance。

Evaluation 必须读取 immutable Episode/TerminalSnapshot 与受信 geometry/contact evidence；不得读取 canvas、Three.js bounds、Agent narration 或 Presentation overlay。

本 slice 的 executable stability quantifiers 固定为：

- registered ball-vessel Program 的 `sampleRateHz = 30`，`settleWindowSeconds = 0.5`，因此 tail window 是闭区间 `[terminalTime-0.5, terminalTime]`，必须恰好含 16 个 samples；
- tail timestamps 必须 finite、严格递增，首尾分别在 `1e-9 s` 内等于 window 两端，相邻差必须在 `1e-9 s` 内等于 `1/30 s`；duplicate、missing、extra 或 gapped samples 在 admission 时拒绝；
- 每个 tail sample 都必须满足 finite state：horizontal offset `<= innerRadius - ballRadius - 0.01 m`，ball-top `<= rimPlane + 0.005 m`，`abs(ballBottom-innerFloor) <= 0.005 m`，linear speed `<= 0.02 m/s`；metrics 记录该窗口的最大 radial offset、最大 speed、最大 floor-distance error，而非只记录 terminal 值；
- 每个 sample 的 public contact evidence 是 frozen plain data `{targetRef, otherRef, normalOnTargetWorld:[x,y,z], penetrationMeters}`；只含 EntityRef、finite dense world-space normal（norm 与 1 的误差 `<=1e-6`）和非负 penetration，不含 `partKey`、MuJoCo body/geom/contact id；
- valid support 必须在同一个 tail sample 中存在 `targetRef=entity:ball, otherRef=entity:vessel`，并满足 `dot(normalOnTargetWorld, [0,0,1]) >= 0.5`；16 个 tail samples 每一个都必须有 valid support，support coverage 因而为 `16/16`，任一 transient gap 都 FAIL；纯 sidewall contact 的水平 normal 不构成 support；
- `maxPenetrationMeters` 是 16 个 tail samples 中全部 `ball-vessel` contact evidence 的 `penetrationMeters` 最大值，必须 finite、非负且不超过 `0.005 m`；contact evidence 必须按 EntityRef pair 归因，错误 floor/vessel owner mapping 直接拒绝；
- Episode `contact-began` event 可作为时间线事实保留，但 stable-inside evaluator 只使用逐 sample semantic contact evidence，不能把一次 began event 当成持续支撑。

必须存在以下 adversarial controls：

1. hovering 与 bounce-apex Episode 必须 FAIL，证明单帧低速不是稳定；
2. sidewall-only contact、仅一帧 transient support、duplicate/gapped tail timestamps 必须 FAIL，证明 support 方向和完整时间覆盖真实成立；
3. 缺失/错位 wall 的 wall-sensitive run 必须 FAIL，证明侧壁真实参与物理；
4. 相同 visual 与可 admission 的初态改用受信 closed proxy，必须先由同一 Runtime 产生 completed Episode，再由 Evaluation 明确 FAIL；不能在 Runtime 前短路，也不能因为视觉仍像杯子而通过；
5. wall seam tunneling、penetration 超界、错误 floor/vessel contact attribution、internal geom/part id 泄漏都必须 fail closed。

closed proxy 是 test-owned、Runtime-direct 的 recursively frozen trusted Snapshot mutation：只在 pure compiler/Runtime/evaluator seam 替换 canonical vessel compound 为带 top lid 的 compound，复用 production admission/physics/evaluation，不增加 model-facing `fixtureId`。它不得进入 Host write/edit、三 fixture registry、Product Session projection、Repository record/ref/adopt 或 OMP surface；对应 reachability tests 必须证明这些边界均不可达。

## In scope

1. 增加一个 deterministic smooth vessel GLB generator、repo-owned artifact 与 immutable registry。
2. 增加 sphere visual/collision 和 bounded compound collision representation；compound parts 不成为 Entity。
3. 创建 floor + vessel + ball canonical Snapshot，并声明 rim-center local frame。
4. 用第二个真实任务驱动 `write/edit/run` 从 cube-specific 参数演进为最小 Entity/Program-oriented exact contract；四工具数量不变。
5. 让现有 MuJoCo Runtime 从 Snapshot 编译一个 body 下的多个 vessel geoms与 dynamic sphere，生成 multi-entity Episode。
6. 增加 stable-inside-vessel Success Contract 与 exact EvaluationRecord variant。
7. 让 AdoptPolicy authority 以受信 closed registry 接纳两个已注册 scenario contract，同时拒绝未注册或错配 evaluator/contract/policy。
8. 扩展 Product Session codec/evidence closure，拒绝 Entity/part identity、frame/units、program、sample、contact/penetration、terminal 与 evaluation alias/drift。
9. Studio 能选择 vessel 或 ball，显示 smooth visual、compound proxy overlay、rim frame、Episode playback 与结构化 PASS/FAIL。
10. 保持 DH-001～009 的 falling-rigid、Agent restricted surface、imported GLB、3DGS、Spark lifecycle、Repository/adopt 与 transport regressions。

## Non-goals

- 通用 CSG/BRep/NURBS/CAD kernel、任意 spline editor、geometry node graph 或 asset marketplace；
- prompt/image/video 到 mesh/3DGS 的生成、上传、远程 URL、CDN 或数据库；
- 动态改变 vessel profile、任意 compound part authoring 或开放 Agent 写入原始 MJCF；
- articulated robot、joint、actuator、sensor、抓取、运动规划、VLM loop 或真实设备；
- deformable、fluid、fracture、cloth、soft contact 或 uncertain/belief world；
- 第二 Evolution Runtime、world-model provider、通用 Adapter SDK、plugin system 或第五个 world tool；
- PR、commit/push 当前 feature branch、merge、tag、deploy 或真实 provider prompt，除非 Human 后续单独授权。

## Acceptance

1. **Curved visual evidence**：repo-owned vessel visual 由固定曲线/profile 旋转生成，真实 mesh 不退化为 box/voxel；artifact identity、provenance、frame、units、transform 与 bounds 可重算且 drift fail closed。
2. **Semantic granularity**：vessel 在 Snapshot、selection、Product Session、Episode 与 Evaluation 中始终只有一个 EntityRef；多个 MuJoCo geom/Three overlay node 不得泄漏为多个 Entity 或 authority。
3. **Functional cavity**：compound collision 明确保留开口和内部空间；wall-sensitive ball trajectory 能进入腔体并稳定；MJCF exact `base + N walls` 可核验，missing/misaligned walls FAIL；completed closed-proxy run 的 Evaluation 必须 FAIL，证明通过来自物理结构而非 visual appearance。
4. **Identity and contact closure**：floor/vessel/ball exact entity set、roles、local frame、representations、body type、mass/friction、Program target、sample state keys、semantic contact pair、penetration evidence、TerminalSnapshot 与 Evaluation refs 在 JSON round-trip 后仍闭合；duplicate/unknown/aliased `partKey`、wrong owner/floor attribution、internal ID leakage、swap/alias/missing/extra/sparse/accessor/non-finite 输入 fail closed。
5. **Static/dynamic separation**：`world_edit` 改变 ball 的静态初始 pose 并产生 child Snapshot；`world_run` 使用显式 frozen Program 产生 Episode，不能把 placement edit 伪装成运动历史，也不能推进 current ref。
6. **Four-tool breadth**：同一 restricted OMP four-tool surface 能表达原 falling-rigid 与新 ball-into-vessel 两个任务；active/enabled tools 仍恰好四个，mounted tools 为空，无 fixture-specific 第五工具。
7. **Deterministic evaluation**：stable-inside-vessel Evaluation 只依据 Episode/Terminal 与受信 geometry/contact contract；严格校验 0.5s/16-sample tail、30Hz timestamps、每 sample predicates、16/16 world-up semantic support 与 pair-attributed penetration；输出 finite window、support、height、speed、penetration metrics、tolerance 与 PASS/FAIL；hovering、bounce apex、sidewall-only/transient support、duplicate/gapped timestamps、tunneling/penetration 超界必须 FAIL，Agent narration、canvas 或 overlay 不参与判定。
8. **Visible Product slice**：真实 Chromium 中可选择 vessel/ball，检查 visual/collision/rim frame，播放 ball 从初态到稳定终态的每一帧；reset 与第二 Session 不保留旧 selection、Episode 或 presentation object。
9. **No patch stack**：实现 diff 不新增平行 legacy tool surface、`cupHeight`/`isContainer` compatibility flag、renderer-to-state fallback、MuJoCo-ID-as-EntityRef 或重复 scenario codec；每个新增抽象必须有 falling-rigid 与 vessel 两个真实 consumer。
10. **Regression gates**：targeted adversarial tests、`bun test`、`bun run typecheck`、`bun run build`、deterministic artifact checks、真实 Chromium acceptance、`git diff --check` 与 EXharness validation 全部通过。
11. **Adopt authority**：两个 registered scenario 的 passed Evaluation 均能由对应 frozen AdoptPolicy adopt；unregistered Program/contract、evaluator-policy mismatch、failed Evaluation 与 Agent-requested policy 必须拒绝，且 `run` 不推进 current ref。
12. **Contract reachability**：三个 fixture 的 `read → JSON round-trip → edit → run` 经真实 Gateway pre-admission、OMP schema 与 Host parser 使用同一 `WORLD_TOOL_CONTRACT`；falling-rigid Product codec 只接受 exact floor+cube，ball-vessel 只接受 exact floor+vessel+ball；closed-proxy test mutation 与任何第四 fixture 均不能到达 Product/Repository/Agent authority。

## 实现阶段

### Phase 1 — Contract RED 与边界复核

- 先为第二 scenario、entity-targeted edit、explicit Program、compound/sphere representation、multi-entity samples 与 containment Evaluation 写 exact contract tests；
- 同时为 entity-local `partKey`、semantic contact pair、penetration evidence、settle window 与 closed AdoptPolicy registry 写 RED tests；
- 将本计划已冻结的 `WORLD_TOOL_CONTRACT`、三 fixture IDs、两 Program IDs、world-frame pose、scenario compatibility 与 legacy removal 写成 Host/OMP parity RED tests；Phase 1 不再重新命名或设计 model-facing shape；
- parity 必须覆盖 Gateway pre-admission 与真实 `tool.execute`，并分别固定 falling-rigid exact 2-entity codec closure、ball-vessel exact 3-entity closure、两个 Program duration/sample grid；
- 证明当前 cube-specific surface 无法通过，不先添加兼容 flag；
- 记录哪些命名/类型可直接泛化，哪些应保留为 falling-rigid fixture 内部事实。

### Phase 2 — Deterministic vessel artifact 与 representations

- 增加固定 profile-of-revolution generator、GLB artifact 与 registry；
- 增加 sphere 与 compound collision plain-data records；
- 生成 canonical floor/vessel/ball Snapshot、task-local vessel fixture contract 与 rim-center local frame，统一执行 `worldPose = entityPose ∘ localPose`；
- 用 artifact/proxy drift、reversed/sparse/non-finite local pose 和 part alias regressions fail closed。

### Phase 3 — Authoring、Program 与 MuJoCo multi-entity run

- 迁移两个真实 scenario 到同一最小 `write/edit/run` contract；
- 让 Host/Runtime 依据显式 Program target 编译 dynamic ball 与 vessel compound geoms；
- 建立 internal MuJoCo geom-to-owner mapping，生成 exact sample entity set、semantic EntityRef-pair contact/support、finite penetration evidence 与 TerminalSnapshot；
- 用 radial-offset/lateral-velocity trajectory 证明 exact `base + N walls` 真实参与碰撞，同时保持 ref authority。

### Phase 4 — Evaluation 与 Product Session closure

- 实现基于 exact 0.5s/16-sample tail、16/16 world-up support、inner-floor distance 与 pair-attributed penetration bound 的 stable-inside-vessel evaluator；
- 加入 hovering、bounce-apex、sidewall-only/transient support、duplicate/gapped timestamps、missing/misaligned walls、tunneling 与 completed closed-proxy negative controls；
- 增加两个 registered scenario 的 closed AdoptPolicy entries，并复测 alternate/mismatched contract fail closed；
- 扩展 codec/stream projection 对 scenario、program、Entity/representation/sample/terminal/evaluation identity 的闭合验证。

### Headless implementation gate

只有 Phase 1–4 的 contract、artifact、Runtime、contact/penetration、Evaluation、adopt authority、codec targeted tests 全部通过并冻结 headless digest，才允许进入 Phase 5。若 headless gate 不能在 bounded diff 内关闭，应先停下重新审视根部抽象，不得用 Studio fallback 掩盖；必要时仅将 delivery 内部分为 `DH-010A headless` 与 `DH-010B visible slice`，不新增平台层或改变最终 end-to-end goal。

### Phase 5 — Studio visible slice

- 支持 vessel/ball selection、smooth visual、compound overlay 与 rim-center frame；
- EpisodePlayer 同步两个 Entity，Inspector 展示结构化 containment metrics；
- 默认 selection、metrics/footer 与 artifact URL 从受信 scenario/session projection 解析，不继续硬编码 cube/landing/diagnostic fixture，也不让 renderer 成为状态 authority；
- 复测 GLB/3DGS/overlay、resize、late load、reset 与第二 Session lifecycle。

### Phase 6 — Full gates 与 independent review

- 运行 targeted/full tests、typecheck、build、artifact、browser、diff 与 harness gates；
- 冻结 product digest，执行 independent review；
- reviewer 未批准前不 close/mark-done；Human 未另行授权前不 commit/push。

## Plan review checklist

进入实现前必须由 Human/Architect 确认：

1. 第二真实任务确实选择“ball into vessel”，而不是直接跳到 articulated robot；
2. 接受一次有意的最小 model-facing input contract 演进，不要求兼容未发布的 `cubeHeight` shape；
3. 接受 vessel 一个 Entity 对应多个 collision parts 的颗粒度决定；
4. 接受 visual 曲面精细、physics proxy 任务充分但不逐三角面一致的 multi-fidelity 策略；
5. 接受本 slice 不生成 3DGS、不调用真实 provider，也不进入机器人或 world-model integration。

## Exit condition

只有当同一个 vessel Entity 以 smooth curved visual、保留开放腔体的 compound collision、显式 local frame 和受信 semantic identity 进入 Snapshot/Studio/MuJoCo/Episode/Evaluation，dynamic ball 能通过已冻结 exact JSON four-tool contract 被放置、以 wall-sensitive trajectory 推演并在 exact 0.5s/16-sample tail 中由 16/16 world-up semantic support 与 pair-attributed penetration 证据证明稳定留在内部，registered policy 能安全 adopt terminal Snapshot，而且 hovering、bounce apex、sidewall-only/transient support、duplicate/gapped timestamps、missing/misaligned walls、tunneling 与 completed closed-proxy 对照明确失败、DH-001～009 authority 与 regressions 不回退时，DH-010 才能请求 closeout。
