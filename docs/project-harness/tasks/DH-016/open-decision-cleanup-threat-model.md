# DH-016 Open Decision — Cleanup 并发威胁边界

## 决议

- 状态：**resolved**
- Human decision：**Option A — Cooperative single-writer boundary**
- 决议日期：`2026-08-15`
- canonical authority：`docs/project-harness/tasks/DH-016/plan.md`

本文件保留三种方案的比较与决策理由，不再是未决 blocker。实现与review必须以canonical plan中的Option A边界为准。

## 问题

Round 21 reviewer使用独立本机进程，在startup recovery已经通过全局preflight并开始删除第一个Project evidence后，直接篡改最后一个Project的marker/lock/entry；随后要求此前所有删除都原路径回滚。

普通POSIX目录操作与当前advisory Data Root writer lease不能提供这个性质。lease可阻止另一个守约的Demiurges writer，但不能阻止任意进程直接`unlink`或写Data Root。若把该攻击者纳入DH-016 correctness contract，就需要新的事务型文件系统协议，而不是继续增加preflight。

## 选项

### A — Cooperative single-writer boundary（推荐）

- 所有Demiurges writer必须持有同一live Data Root lease；产品内并发与crash window保持当前严格journal/recovery contract。
- startup在cleanup前全局闭合全部evidence；每次destructive operation前仍重验exact identity。
- cleanup开始后发生的out-of-band filesystem mutation定义为environment corruption：立即停止后续cleanup、保留durable receipts与尚存evidence并返回`OPERATION_RECOVERY_REQUIRED`，但不承诺回滚此前已完成且fsync的cleanup。
- symlink/path traversal/foreign bytes在被观察到时仍fail closed；这不是把Data Root当安全沙箱。

### B — Transaction-grade cleanup

- 为所有Project/attempt evidence建立prepare/commit/rollback namespace，先原子搬移整批对象，再统一commit；失败需可逆恢复所有原路径。
- 仍无法阻止不遵守协议的进程篡改prepare namespace，除非再引入权限隔离、专用daemon或文件系统snapshot。
- 这是独立架构切片，复杂度与风险显著高于DH-016产品持久化MVP。

### C — 不自动cleanup

- startup只terminalize并验证，不删除marker/lock/attempt；由单独离线maintenance工具在Studio/Gateway关闭后清理。
- 最保守，但会永久积累evidence并可能阻塞Project ID复用，产品体验与磁盘治理较差。

## 建议

Human已采用A。Round 21的“cleanup开始后任意外部进程篡改仍全局回滚”不属于DH-016 mandatory gate；替代验收为：检测到后停止剩余cleanup、稳定报`OPERATION_RECOVERY_REQUIRED`、不删除尚未处理的evidence；不对已完成并fsync的cleanup承诺回滚。若未来确有多进程不可信本机writer需求，再单独立项B。
