# Review Packet

## Subject

- Checklist item: `DH-008`
- Reviewer: `gpt-5.6-sol-max`
- Updated at: `2026-08-11`
- Canonical plan path: `docs/project-harness/tasks/DH-008/plan.md`

## Item Snapshot

- Title: Imported Rigid Entity Vertical Slice
- Status: doing
- Workflow status: running
- Priority: p0
- Owner: codex
- Session: codex-dh008-20260810-1
- Dependencies: DH-007

## Acceptance

一个 repo-owned imported GLB rigid fixture 以稳定 EntityRef 对齐 immutable artifact identity/provenance、source frame、units、visual transform、独立 box collision proxy、MuJoCo state、Episode 与 Evaluation；Three.js selection/playback/reset 保持同一 identity；现有 primitive scenario 与 exact read/write/edit/run surface 保持；tests/typecheck/build/Chromium/diff/checklist 通过。

## Verification

96 tests / 0 fail / 516 assertions；typecheck、production build、git diff --check、deterministic GLB digest、真实 Chromium imported-mesh playback/Inspector/reset acceptance 通过；frozen product digest 66305bb2b078bb20f9181b63d263f35d0277ba61a20600cae94fada0a6a28281，等待 independent review。

## Handoff

实现已完成并冻结至 digest 66305bb2b078bb20f9181b63d263f35d0277ba61a20600cae94fada0a6a28281；请按 tasks/DH-008/review-request-round1.md 严格只读审查。未经批准不 closeout/mark-done；未经 Human authority 不真实 prompt、commit、push、merge、tag 或 deploy。

## Review Inputs

- Scope: `docs/project-harness/scope.md`
- Architecture: `docs/project-harness/architecture.md`
- Domain model: `docs/project-harness/domain-model.md`
- Progress: `docs/project-harness/progress.md`
- Review output target: `docs/project-harness/current/review.md`

## Canonical Plan Content

```md
# DH-008 计划：Imported Rigid Entity Vertical Slice

## 状态与 Authority

- Status：`active`；
- Branch：`agent/codex/DH-008`；
- Worktree：`/Users/Admin/projects/WorkTrees/Demiurges-DH-008`；
- Base：`ac293318c8a6b2fe7433146df7417cc3c83e2726`；
- Human 已授权建立本 item、worktree、canonical plan、checklist/lease 与本切片产品代码实现；
- 当前 authority 包含 DH-008 的离线实现、测试、浏览器验收与独立审查；不包含真实 provider prompt、credential 使用、commit、push、merge、tag 或 deploy。

## Goal

让 Demiurges 第一次操作一个不由 primitive box 定义外观的刚体 Entity：同一个稳定 `EntityRef` 使用 imported GLB mesh 作为 visual representation，使用显式简化 collision proxy 参与 MuJoCo，并在 Snapshot、Three.js selection、Episode 与 Evaluation 中保持可检查的 frame、units、identity 与 alignment。

本切片不是“让 Three.js 能加载一个 GLB”。它要证明 Entity 与 representation 已真正分离：视觉资产、碰撞代理和物理状态可以不同，但它们必须明确属于同一个 Entity，并能由结构化证据验证对齐。

## First-principles boundary

```text
Immutable mesh artifact
  ├── content identity + provenance
  ├── source frame + units
  └── local alignment transform
                 │
                 ▼
EntityRef ── visual representation ──→ Three.js imported mesh
   │
   ├──── collision representation ──→ MuJoCo box proxy
   ├──── physics/state ──────────────→ Snapshot / Episode
   └──── semantic selection ─────────→ Studio inspector
```

- mesh node、Three.js object、asset path 与 MuJoCo geom 都不是 Entity；
- Snapshot 持有稳定 `EntityRef` 与 representation references，不持有 renderer/runtime object；
- visual mesh 不自动成为 collision geometry；collision proxy 必须单独声明；
- imported artifact 必须有不可变 content identity 与 provenance；不能把可变 URL 当作世界事实；
- alignment 由显式 transform/tolerance 与 executable evidence 判定，不能依赖肉眼“差不多”。

## Diagnostic fixture

只登记一个 repo-owned、非对称、单一刚体 GLB fixture。非对称形状用于暴露轴向、旋转、缩放与原点错误；fixture 通过稳定 `assetId` 选择，包含：

- local repo path；
- media type；
- SHA-256 content digest；
- provenance/license note；
- source frame；
- source units 与 meters scale；
- visual local transform；
- 显式 box collision proxy 与 alignment tolerance。

不允许 Agent 传入任意 URL、绝对路径、文件内容或未登记 asset。

## In scope

1. 把当前 `BoxRepresentation`-only visual contract 扩展为最小 discriminated union：primitive box 或 imported rigid mesh；collision 在本切片仍只允许受支持的 box proxy。
2. 增加只读、代码拥有的单 fixture artifact registry；按 `assetId + content digest` 解析，不建设上传、搜索、数据库或通用 asset service。
3. 将 falling-cube 代码中真正属于“一个静态 floor + 一个动态 free-fall target”的语义从 `CUBE_REF`/box visual 假设中解开；MuJoCo 继续只消费 collision proxy，不读取 visual mesh。
4. 让 landing evaluator 从受信 collision representation 推导 expected center height，不把 mesh bounds 或 assistant narration 当作物理真值。
5. Three.js Presentation 按 visual representation kind 创建 primitive 或异步加载 GLB；选择、销毁、session reset 与 Episode playback 始终使用同一 `EntityRef`，不让 late asset load 恢复旧 session state。
6. Inspector 显示 `EntityRef`、visual `assetId`/digest、frame、units、alignment transform、collision proxy 与当前 physics state。
7. `world_write`/`world_edit` 继续是原有四工具中的静态 authoring 能力；用封闭 `fixtureId` 与显式高度/pose 选择受支持 fixture，不新增第五个 asset/file 工具。
8. scripted Product Session 先证明 imported rigid fixture 的 write/edit/run/Episode/Evaluation；任何真实模型 canary 仍需独立 Human authority。

## Non-goals

- Spark、3DGS、point cloud、depth、latent observation 或 world-model provider；
- 任意用户文件上传、远程 URL fetch、asset marketplace、数据库、CDN 或通用 Resource Library；
- mesh collision、convex decomposition、compound proxy、开放容器内部空间或曲面接触精度；
- procedural geometry、CSG、spline、loft、deformable 或 articulated robot；
- 新增第五个 model-facing tool，或把 file/MCP/`@file` 能力重新带回 restricted OMP；
- persistence、多用户、鉴权、TLS、cloud deployment 或第二 Evolution Runtime；
- 为未来格式预建通用 Adapter SDK；首个实现只支持实际 fixture 需要的 GLB contract。

## Acceptance

1. Kernel/codec 能表达 primitive visual 与 imported-mesh visual，但 collision 仍是独立受验 box proxy；所有 records 为 bounded plain immutable data。
2. fixture 的 `assetId`、SHA-256、provenance、source frame、units scale 与 local transform 均有确定 source of truth；digest/format/frame/units/transform 非法时在进入 Presentation 或 Runtime authority 前 fail closed。
3. 同一个 imported Entity 在 Snapshot、Studio selection、Three.js object mapping、Episode samples/terminal Snapshot 与 Evaluation 中保持同一 `EntityRef`；renderer node 与 MuJoCo geom ID 不穿透 product contract。
4. MuJoCo MJCF 只由 collision proxy、physics 与 Entity state 编译；替换 visual mesh bytes 或 visual transform 不能静默改变 collision/physics semantics。
5. imported fixture 完成 free-fall 后产生 deterministic Episode 与 Evaluation PASS；`run` 不推进 current ref，terminal adopt 仍属于独立 Harness control。
6. 现有 primitive-box golden scenario 保持通过；新的 mesh fixture 不通过兼容 flag 或复制第二套 Runtime/Host 实现。
7. Studio 实际显示 imported mesh，并在初始 Snapshot、播放中 Episode sample、terminal 与 session reset 时保持 Entity selection/alignment 正确；late GLB load 不污染已切换 session。
8. model-facing surface 仍恰好为 `read/write/edit/run`，mounted 为空；任意 URL/path/file input 在 tool execution 前被拒绝。
9. contract/unit/integration tests、typecheck、build、真实 Chromium acceptance、`git diff --check`、fixture sensitive-value/license/provenance check 与 harness validation 通过。

## Phases

### Phase 1 — Contract discovery and RED

Status: completed

- 冻结 fixture provenance、digest、frame、units 与 alignment contract；
- 先写 representation codec、artifact admission、Runtime visual/collision separation、late-load/session reset 与 four-tool surface regressions；
- 证明当前 box-only Kernel、hard-coded cube Runtime 与 synchronous `BoxGeometry` Presentation 无法满足 acceptance。

### Phase 2 — Minimal representation and artifact authority

Status: completed

- 增加最小 imported-mesh visual record 与单 fixture registry；
- 保持 Snapshot 为 plain data，registry/loader 不进入 Kernel；
- 对 artifact identity、units、frame、transform 与 budget fail closed。

### Phase 3 — Runtime and Evaluation generalization

Status: completed

- 将 fixed cube target 收敛为一个受支持的 dynamic rigid target；
- MuJoCo 只读取 collision proxy；
- landing evaluator 从 collision evidence 推导 contract。

### Phase 4 — Three.js Product Presentation

Status: completed

- 加载 GLB visual 并绑定稳定 EntityRef；
- 完成 disposal、async cancellation、selection、Episode playback 与 session reset；
- Inspector 呈现 alignment evidence。

### Phase 5 — Agent/Product proof and independent review

Status: in review

- scripted Product Session 经现有四工具完成 imported fixture task；
- 运行 full gates 与真实 Chromium acceptance；
- 在冻结 digest 上进行 independent review；未经额外 authority 不发送真实 provider prompt，不 close、commit 或 push。

## Exit condition

只有当一个 imported rigid mesh 在可见外观、结构化 Entity identity、collision proxy、MuJoCo state、Episode 与 Evaluation 中形成同一条可检查证据链，并且旧 primitive scenario 保持成立时，DH-008 才能进入 closeout。仅在 Three.js 中“看到了模型”不算完成。
```

## Review Focus

1. 当前计划或结果是否覆盖 acceptance
2. 是否越过 scope non-goals
3. 是否越过 architecture 模块边界
4. 是否偷偷吸收了未来 checklist item 的工作
5. 当前验证方式是否足以支持结束本轮
