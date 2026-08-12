# DH-010 Plan-only Independent Review Verdict — Sol Round 1

## Reviewer

- Role：independent plan reviewer；
- Requested model：`gpt-5.6-sol`；
- Reasoning effort：`max`；
- Actual observed model：`gpt-5.6-sol`（由 Codex sub-agent runtime 报告）；
- Provider session id：`unknown`；
- Review mode：严格只读，没有修改 repository。

## Digest verification

- Canonical plan SHA-256：`aca6b9adbb8f8ad72712a01772915665c34c9799e8f8b2a052c4fb23d2d6f2e3`，匹配 review request；
- Context aggregate SHA-256：`654af2d224f571ac8158d3949a304924b3af99c8006c2df3023790ceb0bd6d56`，匹配 review request；
- Review 前后 `git status --short` 一致；
- checklist validator：`0 warning`。

## Findings

### P1-1 — `stable-inside-vessel` 可以把悬停或反弹顶点误判为成功

- 位置：`plan.md` 的 `Evaluation contract`、Acceptance 3/7、Phase 4；
- 失败场景：球在杯内上方悬停，或仅在某一帧经过反弹速度顶点；该帧同时满足“低于 rim、速度较小、未穿透”，但球从未稳定地由容器底部支撑；
- 为什么现有 acceptance 挡不住：计划只约束 terminal state 与 terminal speed，没有定义连续稳定窗口、支撑/接触证据或球底到 inner floor 的关系；
- 最小修订：冻结 `settleWindowSeconds`，在 Episode 尾部连续窗口上计算指标；要求受信 contact/support evidence，或以 ball-bottom 到 inner-floor 的有界容差证明支撑；新增 hovering 与 bounce-apex 两个 RED negative tests，并输出 window、support 与 height metrics。

### P1-2 — centered drop 与 closed proxy negative control 不能证明侧壁被编译并参与物理

- 位置：`Diagnostic world`、`Evaluation contract`、Acceptance 3、Phase 3/4；
- 失败场景：球从杯中心竖直落下，Runtime 只编译 base、不编译 wall geoms，也可能稳定停在看似正确的位置；closed proxy 对照如果只被 evaluator 拒绝，而没有先被同一 Runtime 完整推演，也不能证明真实 collision path；
- 为什么现有 acceptance 挡不住：居中的轨迹对侧壁不敏感，且计划没有要求 closed proxy 先通过 admission、产生 completed Episode，再得到 Evaluation FAIL；
- 最小修订：把 closed proxy 作为受信、可执行的 negative fixture，必须经同一 Runtime 完整运行后明确 Evaluation FAIL；增加 wall-sensitive probe，例如 radial offset 或 bounded lateral velocity；缺失/错位 wall 必须失败，并断言 MJCF 中 exact `base + N walls` geoms。

### P1-3 — collision part 到 EntityRef 的 contact attribution authority 未闭合

- 位置：`First-principles design` 2、`Kernel 与 Runtime 演进`、Acceptance 2/4、Phase 2/3；
- 失败场景：多个 MuJoCo geom 属于同一 vessel Entity，但 contact event 暴露 geom/part id，或把 vessel base/wall 当成不同 Entity；另一个风险是 floor contact 被错误归到 vessel；
- 为什么现有 acceptance 挡不住：计划声明 parts 不是 Entity，却没有定义 part identity、MuJoCo geom id 到 EntityRef 的唯一映射，以及 contact evidence 的折叠规则；
- 最小修订：为 compound part 增加 entity-local、唯一、冻结的 `partKey`（明确不是 EntityRef）；Runtime 内部维护 MuJoCo geom id 到 owner EntityRef 的映射；公开 contact evidence 只输出语义 EntityRef 对，例如 `[entity:ball, entity:vessel]`；新增 duplicate/unknown/aliased part、错误 floor attribution 和内部 id 泄漏的 fail-closed tests。

### P1-4 — rim frame、part local pose 与 visual/collision 对齐缺少可执行 transform authority

- 位置：`一个容器 Entity，多种 representation`、`Diagnostic world`、Acceptance 1/4、Phase 2/5；
- 失败场景：vessel Entity 被平移或 yaw 旋转后，visual、compound parts、rim-center 或 inner envelope 使用不同 transform 组合，静态默认姿态仍看起来正确，但运行与评测发生漂移；
- 为什么现有 acceptance 挡不住：计划说 local frame 与 local collision component，却没有冻结 task-local fixture 的 profile/bounds/rim pose/inner envelope，也没有明确 local-to-world composition；
- 最小修订：定义冻结的 task-local vessel fixture contract，包含 profile/bounds、`rim-center` local pose、collision parts 与 inner envelope；明确 `worldPose = entityPose ∘ localPose`；增加 translated + yaw-rotated vessel probes，以及 visual/collision/frame 任一漂移 mutation；不要扩展成通用 frame graph。

### P2-1 — 单切片较宽，Studio 应位于强制 headless phase gate 之后

- 位置：Phase 1–5；
- 风险：contract、artifact、multi-entity Runtime、contact、Evaluation、Product codec 与 UI 同时推进，会让失败归因和 review digest 过宽；
- 建议：把 headless semantic/physics/evaluation closure 设为进入 Studio 的 mandatory gate。若实施中仍过宽，可将交付内部编号为 `DH-010A headless` 与 `DH-010B visible slice`，但保持一个 end-to-end product goal，不建立新的平台层。

## Counterexamples checked

1. 球在容器腔体内悬停且 terminal speed 为零；
2. 球在反弹 apex 的单帧速度接近零；
3. Runtime 只编译 vessel base、遗漏全部 wall geoms；
4. closed proxy 没有产生 completed Episode 就由 evaluator 直接 FAIL；
5. MuJoCo geom/part id 泄漏到 public contact evidence；
6. floor contact 被错误归因到 vessel Entity；
7. compound parts 使用 duplicate/unknown/aliased identity；
8. vessel 平移或 yaw 旋转后 visual、collision、rim frame 与 inner envelope 漂移。

## Verdict

`changes_requested`

路线与一个 vessel Entity / 多个 collision parts 的核心颗粒度合理，但当前 plan 仍允许可执行的物理与 evidence 假阳性。上述 P1 必须先写入 canonical plan，并由 fresh reviewer 对新 digest 重新审查。

## Implementation gate

`may_enter_implementation: no`
