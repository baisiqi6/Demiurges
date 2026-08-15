# DH-016 Implementation Review — Round 6

- decision：`changes_requested`
- may_closeout：`false`
- P0：0
- P1：1
- frozen product aggregate：`e619ab7d190e2a1b427b1a4450ae94916d95c4a07635751e15f1fc64d86fe5a1`

## P1：startup仅凭result可读即清理durable evidence

`startup-recovery.ts`在`readResult()`返回后直接清理exact Project lock、marker与operation-owned目录，没有在当前live lease下重新完成`receipts/` directory fsync，也没有取得同一`OperationJournal`铸造的durably-finalized capability。

独立crash-point反例在result file fsync、attempt directory fsync、result hard-link完成后，停在`fsync(receipts/)`之前；startup将其分类为`alreadyTerminal`并删除lock/marker/project。正确行为应为`OPERATION_RECOVERY_REQUIRED`并保留全部evidence，直到当前进程重新完成directory fsync。

Reviewer gates：focused 69/0/338，full 592/0/4087，typecheck、diff-check、validate、doctor通过；起终branch/HEAD/56-file aggregate无漂移。

## Remediation

新增package-owned `confirmExistingTerminal()`：重新校验binding/result并在当前live lease下成功fsync receipts后，才铸造cleanup capability。`cleanupProjectEvidence`现在强制验证该capability。新增fault injection回归证明失败保留全部evidence，成功重试后才清理。
