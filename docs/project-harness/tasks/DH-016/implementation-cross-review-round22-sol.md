# DH-016 Implementation Cross-review — Round 22 / Sol

- decision：`changes_requested`
- may_closeout：`false`
- P0：0
- P1：1
- P2：发现P1后停止扩展

## P1

第二路独立复现更严格的同根反例：第一项cleanup完成后，把第二项attempt的`operation-intent.json`替换为byte-identical新inode。旧实现返回成功并删除第二项Project、lock、marker、attempt与替换后的receipt；只留下durable intent/result。Phase C只在loop前确认一次attempt provenance，`cleanupAttempt()`随后按文件名unlink。

Reviewer focused/full/gates均通过；起终product aggregate均为`14062c117ff06465c141f11529115a32f99b566c109c7bf29f20484fb3986100`，无仓库漂移。要求每项cleanup前重新证明attempt set与receipt inode provenance。
