# DH-022：明确 Program 与 Pose Edit 候选边界

## 问题与选择

DH-020 返回 canonical Program，DH-021 返回无 target/expected Ref 的 Pose，调用端需要手工补齐 edit 输入。第二个调用方已经出现；本次只统一内部结果的类型与来源，不抽 strategy registry、executor、插件接口或公共 package export。

## 实现

- 内部 discriminated union：`kind: program` 保留 canonical Program；`kind: pose-edit` 返回既有 `WorldEditPoseWireInput`，绑定推导时 `read.ref`、`entity:ball` 与 pose。
- 共用只读 sourceRef、sourceEpisodeId、sourceEvaluationId、basis；available 候选递归冻结。
- 两个推导函数和现有调用端迁移到该类型，不再保留 Pose 兼容字段。
- Program 调用端继续去掉 id 后显式 run；Pose 调用端直接显式 edit。没有自动执行，run 没有新增 CAS 语义；sourceRef 对 Program 仅是来源信息。
- golden evidence admission、数值策略、DH-019 receipt、Kernel 与四工具 API 保持现状。摘要表示固定样本内容一致，不是来源认证；不宣称支持任意世界。

## 验收

1. 两类候选均记录 sourceRef，推导不修改 Host；已有 FAIL→repair→PASS 通过。
2. ball 候选直接通过 edit admission；世界前进后再次执行原候选得到 stale_ref，不允许偷偷换成最新 Ref。
3. TypeScript exhaustive narrowing 区分 program/edit，错误 payload 被类型检查拒绝；候选及 nested input 冻结。
4. 显式检查包含未公开 authoring helper 的 TypeScript 文件，避免仅靠 app 引用图漏检。
5. focused regressions、全量 tests、root typecheck/build、Harness validation 和 whitespace 检查；准确记录失败，不能用单测重跑冒充全量通过。

## 交付边界

由 Operator 组织实现、独立审查与 closeout。实现者不审批自己的实现；独立 reviewer 提供结论后，Operator 按正式 Harness transition 关闭任务。发布按会话授权处理；职责分离不是要求用户接手流程的停止条件。
