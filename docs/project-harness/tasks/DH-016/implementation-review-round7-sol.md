# DH-016 Implementation Review — Round 7

- decision：`changes_requested`
- may_closeout：`false`
- P0：0
- P1：1
- frozen product aggregate：`355bb78256e4076a2371aa75d3947dde2d38449f0fb330b059124a2c89aa6079`

## P1：历史terminal receipt阻断同一Project的合法pending lock

startup按operation id处理历史terminal时，无条件要求当前`.write-lock`属于正在遍历的旧intent。同一Project若已有较新的pending Save，其exact lock会被旧receipt误判为foreign，导致`OPERATION_RECOVERY_REQUIRED`并永久阻断owner operation收束。

独立反例：先完成`op:a-history` Save As，再durable-admit同一Project的`op:z-pending` Save并发布其exact intent hard-link lock；startup在处理旧terminal时抛错，未处理pending owner。Reviewer gates：focused 70/0/345，full 593/0/4094，typecheck/diff-check/validate/doctor通过，起终aggregate无漂移。

## Remediation

startup先闭合全部durable binding，再处理状态；历史operation遇到同一Project另一exact intent拥有的lock时，不得删除或验证其marker/directory，整组evidence留给owner。新增existing Project后续Save与空Project后续Save As marker两类排序回归。
