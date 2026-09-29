# DH-022 实现与验证记录

## 变化

内部 `AuthoringCandidate` 区分 `program` 与 `pose-edit`，共享 sourceRef/Episode/Evaluation/basis。原有两个实现直接使用这些类型，没有 strategy registry、统一 executor、自动 run 或新增 model-facing tool。

Pose 候选现在提供既有 `WorldEditPoseWireInput`：目标为 entity:ball，expected 为生成时 Ref；调用方无需再补目标、转换 Vec3 或选取最新 Ref。WorldToolSurface.edit 继续负责验证和 CAS。

Program 保留 canonical Program（含 id）；执行仍需显式去 id 并选择 runId。sourceRef 只记录推导来源，不增加 run 的原子 CAS 检查，也不构成可跨 session 使用的能力凭证。

## 验证

- 新回归在修改前出现 2 fail（无 kind/edit payload）；实现后 DH-019/020/021 focused 12 pass / 0 fail / 55 assertions。
- 新增 stale_ref 回归：生成 ball candidate 后先编辑当前世界，再执行旧 edit 候选；返回 stale_ref，当前 Ref/Snapshot 保持不变。
- DH-019 receipt、DH-020 Program digest、DH-021 pose 内容摘要仍保持原值；测试只将新的 wire pose 投影回原来的记录形状检查。
- 根目录 typecheck 增加 typecheck:authoring，显式包含 package 未公开的 authoring helpers 与相关脚本/测试；wrong payload 的 @ts-expect-error 和 exhaustive never 校验通过。顺带修正 DH-019 timeout 参数顺序以适配已锁定 Bun 类型。
- root typecheck/build 通过。Build 保留既有 MuJoCo browser externalization/large-chunk warning。依赖复用本机缓存，@demiurges workspace 链接指向 DH-022 worktree，没有联网安装。
- 全量 `bun test --max-concurrency 1`：1180 pass / 0 fail / 9300 assertions（103 files，182.46s）；日志 `.artifacts/dh022/full-tests.log`。

## 限制与后续判断

两种推导器仍只接纳各自 golden 输入；本次不扩大其泛化范围。内容 hash 不是来源认证，normalization 的已知隐藏字段限制也未在本切片扩修。下一项产品工作需要具体的新用户任务或 UI/Agent 调用方，单纯继续增加 fixture 或公共抽象无法证明更高产品价值。

2026-09-28（本地日期）独立 Reviewer `/root/dh022_independent_review` 返回 APPROVED / may_closeout=yes，P0/P1/P2=0；亲跑 focused 12/0/55 和 authoring typecheck。Operator 本轮 root typecheck/build 通过，审查前后产品 manifest 一致。详见 implementation-review.md，随后由 Operator 正式关单。
