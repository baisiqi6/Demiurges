# DH-001 计划：Falling Cube Vertical Slice

## 目标

实现 Demiurges 的第一条真实 world Harness loop：从 canonical Snapshot 出发，经 `edit` 产生 child Snapshot，由 MuJoCo WASM 执行冻结的 WorldProgram，生成不可变 Episode 与 TerminalSnapshot，再由独立 deterministic evaluator 给出 EvaluationRecord，并通过 Three.js 将 Snapshot/Episode 证据呈现给用户。

## 已授权范围

- 创建第一份 product code、package manifest、lockfile 与本地开发/测试配置；
- 安装完成本切片所需的最小 dependency；
- 实现 Kernel records、内存 Repository、MuJoCo Runtime、Three.js Presentation、deterministic Evaluation 与最小 SolidJS Studio；
- 添加 unit、build 与浏览器 acceptance 验证；
- 更新 repo-local Harness 状态与实现事实。

不创建 commit、remote、Issue、PR、deployment 或外部发布。

## 假设

- 使用单一 Vite application 内的明确 source-module boundary，而不是预建多个 workspace package；第二个真实 consumer 出现前不拆 package。
- MuJoCo 必须真实参与演化，不能用解析公式、Three.js animation 或 mock runtime 冒充。
- 第一条切片只需要一个 floor 与一个 free rigid cube；世界 schema 只表达该真实需求。
- Studio 是功能型工具 UI，设计服务于状态检查，不做独立品牌/视觉 craft 项目。

## Non-goals

- Agent chat、OpenCode、VLM 或 world-model provider；
- Spark、3DGS、imported mesh、机器人、关节、规划与抓取；
- 通用 Adapter SDK、多个 Runtime provider、plugin system；
- persistence database、cloud、desktop packaging、Python sidecar；
- 通用 schema migration、权限、安全平台或协作控制面；
- 将 Episode 浏览状态或 MuJoCo object id 提升为 Repository authority。

## 最小实现形状

```text
apps/studio/src/
├── kernel/                 # 纯 TypeScript immutable records
├── repository/             # write/edit/refs/lineage
├── runtime-mujoco/         # Snapshot + WorldProgram → Episode
├── presentation-three/     # records → Three.js scene
├── evaluation/             # Episode → EvaluationRecord
└── App.tsx                 # 组合边界，不反向拥有状态
```

如果实际依赖要求不同的 public asset 路径，只在 `runtime-mujoco` 和 Vite 配置内解决，不改变 Kernel contract。

## 验收标准

1. 首屏显示 canonical Snapshot 的地面与方块，并显示 `EntityRef`、pose、geometry、physics、frame 与 units。
2. `edit` 把方块初始高度从 base 值改为用户选择的值，生成具有 parent lineage 的新 Snapshot；base Snapshot bytes 不变。
3. `run` 以冻结 Snapshot、WorldProgram、RuntimeProfile 与 ExplicitInputs 调用真实 MuJoCo WASM，产生带 samples/events/completion 的 Episode 和 TerminalSnapshot。
4. Episode 时间轴可以回看方块 pose，但拖动时间轴不会改变 Repository ref。
5. evaluator 依据预先声明的 height/velocity tolerance 判断方块稳定落地，并生成独立 EvaluationRecord；UI 文案不能代替 predicate。
6. `run` 结束后 current ref 仍指向 edited Snapshot；只有显式 `adopt` 才指向 TerminalSnapshot。
7. Kernel 不 import SolidJS、Three.js 或 MuJoCo；Runtime 与 Presentation 不互相 import。
8. unit tests、typecheck/build 与真实浏览器 acceptance 全部通过；浏览器证据能区分 base、edited、episode frame、terminal 与 adopted state。

## 验证命令

```bash
bun test
bun run typecheck
bun run build
```

浏览器 acceptance 必须实际启动 Vite、完成 edit/run/evaluate/adopt 操作，并核对页面结构化状态与 WebGL canvas。

## 阶段

### Phase 1 — 激活任务并锁定依赖

Status: completed

- 登记并激活 `DH-001`；
- 从官方来源确认当前 SolidJS/Vite/Three.js/MuJoCo WASM 的可用接入方式；
- 记录版本、来源与 MuJoCo asset provenance。

### Phase 2 — Kernel、Repository 与 contract tests

Status: completed

- 定义最小 immutable records；
- 实现 `write`、`edit`、ref read 与 explicit adopt；
- 先用 tests 证明 lineage、immutability 与 ref ownership。

### Phase 3 — MuJoCo Episode 与 Evaluation

Status: completed

- 构造最小 MJCF；
- 运行真实 MuJoCo WASM 并采样 Episode；
- 生成 TerminalSnapshot 与 EvaluationRecord；
- 用 tests 证明 run 不推进 ref、predicate 可复现。

### Phase 4 — Three.js Studio

Status: completed

- 呈现 Snapshot/Episode；
- 提供 edit、run、timeline、evaluate 与 adopt 主流程；
- 展示结构化 evidence 与错误/loading state。

### Phase 5 — 验收、文档与 independent review

Status: completed

- 运行 unit、build 与浏览器 acceptance；
- 更新 `progress.md`、runbook 与 checklist；
- 准备只读 reviewer packet；
- 只有 independent approval 后由 Operator 关闭 item。

### Phase 6 — 交叉审查与 verdict 汇合

Status: completed — changes_requested

- 以相同只读 authority 启动 `gpt-5.6-sol`（`max`）与 Kimi Code K3（`max`）两个 fresh reviewer session；
- 两位 reviewer 独立读取 source、tests、scope 与 closeout packet，不读取另一方 verdict；
- `gpt-5.6-sol` 主攻领域语义、determinism、Snapshot/Episode/Ref authority 与过度抽象；
- Kimi Code K3 主攻实现 correctness、MuJoCo/WASM lifecycle、test oracle、browser 与 UI/a11y 边界；
- Operator 对比 verdict、file:line evidence 与 repository 前后 manifest；存在 P0/P1 分歧时不得自动批准，必须保留分歧并进入 changes_requested；
- 只有两份审查均无 P0/P1，且 Operator 对发现逐条复核成立后，才记录 combined approval。

审查结果：Kimi Code K3 Max 给出 `approved`，GPT-5.6 Sol Max 给出 `changes_requested`。Operator 独立复现 duplicate Snapshot identity 覆盖、初速度丢失、sampling grid 偏移、invalid Runtime input 被标记 completed，以及 EvaluationRecord 可变；combined decision 为 `changes_requested`。详细证据见 `cross-review-verdict.md`。

### Phase 7 — Invariant 修复与再审

Status: completed — focused reviewer approved, Operator close pending

- Repository 拒绝同 ID、不同内容的 Snapshot；
- Runtime 完整映射受支持的 Snapshot state，并对 program/profile/frame/units fail closed；
- 以 integer physics step 生成确定性 sample grid；
- Runtime provenance 来自实际 implementation，不由 caller 伪造；
- EvaluationRecord 冻结并表达 contract/evaluator identity；
- 添加对应 regression tests，重跑 unit、typecheck、build 与 browser acceptance；
- 重新进行 independent review，且不得把本轮 P1 拆成互不相干的 UI/兼容补丁。

本轮成功标准：先增加能够稳定复现五类 P1 的 regression tests 并确认 RED；实现后这些 tests 与原有 happy path 一起 GREEN，typecheck/build/browser acceptance 通过，product behavior 保持在 Falling Cube slice 内，随后重新提交 fresh cross-review。

RED evidence：`bun test` 在旧实现上得到 4 pass、5 fail、1 module error；失败分别证明 duplicate Snapshot 未冻结/未拒绝、floor quaternion 缺失、sample grid 晚一个 timestep、negative duration 未拒绝、EvaluationRecord evaluator identity/immutability 缺失。

GREEN evidence：最小 invariant 修复后 `bun test` 为 9 pass、0 fail、117 assertions；`bun run typecheck` 与 `bun run build` 通过。真实浏览器重新完成 edit → run → evaluate → adopt：run 产生 76 samples，run/evaluate 均保持 current ref 为 `snapshot:edit-1`，Evaluation 为 `PASS`，只有 explicit adopt 才推进到 `snapshot:terminal-studio-1`。浏览器控制台无 error。

修复边界：Repository 对所有重复 Snapshot ID fail closed；Runtime 验证冻结 records、schema、EntityRef、frame、units、state、collision、body type、program 与固定 implementation profile，并将 pose/quaternion/linear velocity/world angular velocity 完整映射至 MuJoCo；sampling 由 integer physics step 决定；EvaluationRecord 包含 evaluator/contract identity 并递归冻结。未新增 provider abstraction、persistence、3DGS、Agent 或 UI 补丁层。

第二次 cross-review：Kimi Code K3 Max 静态审查给出 `approved`；GPT-5.6 Sol Max 运行反例后给出 `changes_requested`。Operator 采用可复现的较严格结论：固定 program/profile identity 尚未约束完整参数，顶层 freeze 无法跨异步边界保证输入一致，Runtime 会接受却旁路未实现的 floor/extra-entity state，contact event 比对应 MuJoCo state 晚一个 physics step。combined decision 仍为 `changes_requested`，进入同一 Phase 7 的第二轮根因修复。

第二轮 regression RED：原 9 个 tests 保持通过，新增 identity、deep immutability、supported-world closure、contact timing 四组回归全部失败，结果为 9 pass / 4 fail / 125 assertions。根因修复后为 13 pass / 0 fail / 130 assertions；typecheck/build 通过。浏览器再次验证 76 samples、Evaluation `PASS`、run/evaluate 不推进 ref、explicit adopt 才推进，console 无 warning/error。

第二轮实现将固定 `WorldProgram` / `RuntimeProfile` identity 与完整参数一一绑定；所有 Runtime inputs 在第一个 await 前递归 immutable；只接受完整参与演化的 `entity:floor + entity:cube`，并拒绝带 mass/velocity 的静态地面；每个 step 后重新 `mj_forward`，令 contact observation 与当前 MuJoCo state/time 对齐；Embind cleanup 使用 nested finally。未添加 provider/plugin/persistence 抽象。

第三次 cross-review：Kimi Code K3 Max（实际路由 `k3`）给出静态 `approved`；首个 Kimi session 因短暂创建并删除 repo-local `.artifacts/` 越过零写 authority 被 Operator 主动中止，确认无残留且 digest 不变后，用物理禁用 Bash/Edit/Write 的 fresh session 重审。GPT-5.6 Sol Max 动态反例给出 `changes_requested`：`deepFreeze` 对已 frozen root 不再遍历 children；Repository 可 adopt orphan lineage；sparse Vec3 绕过 `some/every`；相同 runId 对不同 base 产生相同 Episode/Terminal/Evaluation identity。combined decision 采用 `changes_requested`，继续同一 Phase 7。

第三轮 regression RED：原 13 tests 保持通过，新增 shallow root、orphan lineage、sparse Vec3、derived identity 四组回归失败，结果 13 pass / 4 fail / 134 assertions。修复后为 17 pass / 0 fail / 140 assertions；typecheck/build 通过；浏览器 76 samples、PASS、run/evaluate 不推进 ref、adopt 才推进到 `snapshot:terminal-studio-1--edit-1`，console 无 warning/error。

第三轮实现：`deepFreeze` 使用 cycle-safe traversal，即使 root 已 frozen 也处理 children；Repository admission 要求 parent 已登记；所有 Vec3/halfExtents 校验显式读取 index 0/1/2，Evaluator 也拒绝非 finite terminal metric；Episode 与 Terminal identity 由 run key 和 base Snapshot key 共同派生，Evaluation identity 随 Episode 闭合。无新 registry、ID 平台或 provider abstraction。

Final cross-review：Kimi Code K3 Max 静态 `approved`；GPT-5.6 Sol Max 运行反例后 `changes_requested`。Sol 证明 `--` 拼接不是单射、accessor-backed frozen Array 仍可跨 await 变值、`runtime-terminal + parent:null` 仍可被 adopt、finite 输入的派生 metric 仍可溢出为 Infinity。combined decision 继续采用 `changes_requested`，进入同一 Phase 7 的第四轮原语修复。

第四轮 RED 为 17 pass / 4 fail / 144 assertions；修复后 GREEN 为 21 pass / 0 fail / 146 assertions，typecheck/build 通过。浏览器再次得到 76 samples 与 PASS，run/evaluate 后 ref 仍为 `snapshot:edit-1`，adopt 后才变为 `snapshot:terminal-8-studio-1-6-edit-1`，console 无 warning/error。

第四轮实现：run/base identity 改为 length-prefixed 单射编码；deep immutable validator 通过 property descriptors 拒绝 accessor/function/non-plain prototype，并在 Repository admission 与 Runtime pre-await gate 使用；source-parent 要求 runtime-terminal 具有 parent；Runtime 每帧输出与 Evaluation 派生 metrics 全部要求 finite。未引入 registry、content-addressing 或新平台边界。

Approval gate 动态复测确认前四类反例均关闭且 21/21 tests 通过，但发现两项剩余 P1：`WorldRepository.write()` 可接收 runtime-terminal 并绕过 adopt；Evaluator 未对 Success Contract 应用 plain immutable input gate，accessor 可让 ID 与 predicate 读取不同 tolerance。进入第五轮最小 operation-admission 修复。

第五轮 RED 为 21 pass / 2 fail / 148 assertions；修复后为 23 pass / 0 fail / 153 assertions，typecheck/build 通过，浏览器 76 samples、PASS、run/evaluate 不推进 ref、adopt 才推进、console 无 warning/error。`write` 只接纳 root write，`record/adopt` 只接纳 runtime-terminal；Evaluator 只消费 frozen plain-data Episode 与 SuccessContract。

Focused closure review：GPT-5.6 Sol Max 独立运行 23 tests、operation admission probe 与 zero-read accessor probe，结果 `approved`，无 P0/P1/P2；product digest before/after 均为 `b05bcf70cd8e368cf573329cb733c72a3565241a2f172f2d7aaa03a951e0dec8`。Phase 7 实现与 review gate 完成，等待 Operator 决定是否正式 `mark-done`。

## 实现结果

- `kernel/` 定义最小 immutable `Snapshot`、`WorldProgram`、`RuntimeProfile`、`Episode`、`TerminalSnapshot` 与 `EvaluationRecord`；不 import SolidJS、Three.js 或 MuJoCo。
- `WorldRepository` 以独立的 `record` 与 `adopt` 表达“登记世界产物”和“推进世界引用”，并用 tests 证明二者不会静默合并。
- `runtime-mujoco/` 从 Snapshot 的 collision representation 编译 MJCF，懒加载官方单线程 MuJoCo WASM，以 240 Hz 完成 2.5 秒真实推演，并按 30 Hz 复制 live state 为 76 个 Episode samples。
- Runtime 以 `try/finally` 显式释放 Embind `MjData` 与 `MjModel`；Presentation 不持有任何 MuJoCo object id。
- SolidJS Studio 将 Repository、Runtime、Evaluation 与 Presentation 组合为 edit → run → timeline → evaluate → adopt 主流程。
- Three.js 只读取 Snapshot/Episode state；WebGL 画面不是物理状态 authority。

## 验证证据

- `bun test`：最终 23 tests、153 assertions 全部通过；覆盖真实 MuJoCo WASM、contact/sample timing、完整 state mapping、deep plain immutability、lineage/ref operation admission、无歧义 evidence identity、finite metrics 与 evaluator predicate。
- `bun run typecheck`：通过。
- `bun run build`：通过；产物包含 `mujoco.wasm`，MuJoCo 被拆为按需加载 chunk。
- 真实 Chromium acceptance：WebGL canvas 为有效 context；桌面 1512 × 859 与移动 390 × 844 布局均可使用。
- 浏览器操作证据：edit 后 ref 为 `snapshot:edit-1`；run、evaluate 后 ref 仍不变；76 samples，terminal 高度约 `0.250 m`、高度误差 `0.00007 m`、结果 `PASS`；显式 adopt 后 ref 才变为 `snapshot:terminal-8-studio-1-6-edit-1`，console 无 warning/error。
- 浏览器页面没有 error/alert；Three.js deprecated shadow-map warning 已在验收中发现并改用 `PCFShadowMap` 消除。

## 残余风险

- 当前 `mujoco.wasm` 未压缩体积约 10.1 MB，首个 Runtime 调用需要加载；Product MVP 前需基于真实网络预算评估缓存与加载体验，本切片不先加 preload 策略。
- Vite 对 MuJoCo glue 中的 Node `module` import 产生 browser-external build notice；实际 Chromium 推演已通过，但 dependency 升级时应继续做真实浏览器回归。
- Three.js 主入口仍触发大于 500 kB 的通用 chunk warning；第一屏必须立即显示 3D Observation，因此暂不为警告拆出无真实收益的额外边界。
- Repository 仅为内存实现，页面刷新后不会保留 Snapshot/Episode；persistence 不属于本切片。
- 多轮 adversarial review 发现的 identity、state mapping、sampling、validation/provenance、immutability、lineage、plain-data 与 operation-admission 问题均已由独立 RED regression 修复；最终 focused reviewer 为 `approved`。

## 越界审查

- 与 `scope.md` 一致：仅实现 Bootstrap MVP，保持 Spark/3DGS 等 non-goals。
- 与 `architecture.md` 一致：Host 组合 Repository、Runtime、Evaluation 与 Presentation；Kernel 不依赖实现技术。
- 与 `domain-model.md` 一致：`edit` 创建 Snapshot，`run` 创建 Episode，Ref 只由 Repository 操作推进。
- 不涉及其他 checklist item；Product MVP 的 imported mesh 与 3DGS alignment 必须后移。

## Errors Encountered

| Error | Attempt | Resolution |
|---|---:|---|
| 误用 `python3 .../harnessctl --help`，shell script 被 Python 解析并报 `SyntaxError` | 1 | 后续按 shebang 使用 `bash`/可执行入口，不重复该调用 |
| 临时实例化脚本时 `cp` 遇到 source `__pycache__` 目录并发出未复制 warning | 1 | 所需脚本文件已完整复制且命令成功；后续实例化只复制 regular files |
| `harnessctl start` 默认登记 `agent/codex/DH-001`，与尚无首个 commit 的实际 `main` 不一致 | 1 | 通过正式 `release → assign --branch main → accept --branch main` 迁移修正，validator 0 warning |
| `bun install --frozen-lockfile=false` 参数格式无效，安装未发生，后续 `tsc` 不存在 | 1 | 改用 `bun install`，依赖与 lockfile 已正确生成，随后重新执行测试与类型检查 |
| 临时实例化的 `harnessctl` 没有 executable bit，直接调用报 `permission denied` | 1 | 不修改脚本权限；按 shebang 语义改用 `bash .../harnessctl` 执行正式 transition |
| zsh 对不存在的 `modes/*review*.md` glob 直接报 `no matches found` | 1 | 改为读取已确认存在的 `modes/audit.md`，不重复使用未解析 glob |

## 退出条件

实现与验证完成后进入 `closeout_requested`。Coding agent 不自行标记 `done`；等待 independent reviewer verdict。
