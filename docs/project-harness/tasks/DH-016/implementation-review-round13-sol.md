# DH-016 Implementation Review — Round 13 (Sol)

- decision：`changes_requested`
- may_closeout：`no`
- P0：0
- P1：2
- P2：0

## P1 findings

1. Parent-directory durability在失败后不能闭合：Save As先`mkdir(project)`、再`fsync(projects/)`、最后才发布ownership marker；parent fsync失败会留下无marker空目录。`removeExactEmptyDirectory()`与`cleanupAttempt()`也都是先`rmdir`后fsync parent；若删除成功但fsync失败，下一轮恢复会把path absence误当作durability proof。
2. Mandatory adversarial probes缺失：canonical Project引用Artifact但bundle缺entry、`op:a-*`/`op:a-b-*`前缀混淆，以及`projects/`/`staging/`在目录项变更后fsync失败并重启重试。

## Evidence

- focused：86 pass / 0 fail / 414 expect
- full：607 pass / 0 fail / 4159 expect
- typecheck、build、diff-check、EXharness validate/doctor均通过
- start/end：branch=`agent/codex/DH-016`；HEAD=`0efcef3a531c192410cdabcd62cf736e54404313`；58 product files；aggregate=`b9a39e2252ae5e94ec72e6ad928fe4268af2fdb95b4e93f3e6ceb50e5acc976e`，无漂移

Round 13不得用于closeout approval。
