# DH-020 计划：Evidence-Derived Authoring Candidate

## 定位

这是 DH-019 之后的 bounded evidence→WorldProgram compiler seam。它只针对已登记 `fixture:two-joint-planar-reach-v1` / `scenario:two-joint-planar-reach-v1` 的 DH-019 golden first-fail 输入，证明从结构化 Evaluation evidence 推导 authoring candidate；不实现通用 robotics planner、motion-planning SDK 或 predictive world model。

## 目标

把 DH-019 中 hardcoded 的 corrected `.65/-1` 替换为纯 deterministic、fixture-specific 的 2-link IK。planner 接收同一 `world_read` snapshot/ref 与 `world_run` Episode/Evaluation，验证注册拓扑、固定 runtime provenance、golden canonical content digest、identity 与 Evaluation 重算一致，再按显式 elbow-down policy 生成唯一 frozen canonical one-step `actuator-sequence` Program。candidate 仍必须交给既有 `WorldToolSurface.run` 与 `evaluateArticulatedReach` 证明 PASS。

## 边界

- planner 只消费 trusted plain immutable `world_read` snapshot/ref 与 `world_run` Episode/Evaluation；不持有 Host、Ref writer，不调用 `adopt`。
- canonical read/run oracle digest 只证明输入 bytes 与 DH-019 golden bytes 相等，不证明摘要来源是真实工具调用；proof 必须标记 `offline-derived`，receipt 继续标记 `offline-proven`。
- 只接受 `run:dh019-zero`、对应 zero Program、Episode、MuJoCo provenance 与 DH-019 first-fail content digest；只接受 `passed=false` 的 `evaluator:end-effector-reach-v1` 与 `success:end-effector-reaches-frame`，并重算 Evaluation 做 canonical equality。
- goal pose 与 semantic topology 只来自 read snapshot；固定 elbow-down 分支是本 fixture policy。角度做 15 位 canonical rounding，复制 first Program 的 duration/sample rate，并通过 `requireWorldRunInput` 生成 id。
- 不新增 world tool、公开 package export、schema、flag、provider adapter 或 ProductSession 自动循环。

## 验收

1. same golden input bytes 产生相同 canonical candidate Program/id；
2. DH-019 offline trace 改用 planner 后仍为 FAIL→derived candidate→PASS，第二次 Evaluation 才能证明成功，Ref 保持 authored v2；
3. forged Evaluation/Episode/baseRef/read snapshot、wrong scenario/runtime/goal/affordance、altered Program schedule、out-of-limits 或不一致 digest 均 fail closed；
4. fixed elbow-down branch deterministic，candidate FK residual 在 contract tolerance 内，但 candidate 本身不判定成功；
5. fresh Host replay byte-identical，proof 记录 read/run/candidate digest、PASS metrics、Ref unchanged、provider calls=0；
6. 无 OMP/provider/Keychain/network 依赖；全量 tests/typecheck/build/Harness validate 通过。

## 非目标

不做通用 IK library、运动规划、训练/记忆/benchmark、多候选 UI、live model 调度或自动 adopt。
