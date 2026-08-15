# DH-016 Implementation Review Round 3 — Sol

- decision: `changes_requested`
- may_closeout: `false`
- P0: 0
- P1: 2
- P2: 0

## P1

1. `cleanupArtifactAttemptCandidates()`按candidate路径删除，未证明当前对象仍是admitted operation创建的exact inode；foreign replacement会被误删。
2. result hard-link已可见但receipts directory `fsync`失败时，caller以`readResult()!=undefined`误判durable terminal并清理lock/staging/candidate，破坏recovery evidence。

## Evidence

- focused：42 pass / 0 fail
- full：586 pass / 0 fail
- typecheck、diff-check、EXharness validate/doctor：通过
- frozen product aggregate：`b04c6bbceb5d902fc29e8daf594a67e4872f3c55f35410538b01865af4896ca2`

结论：必须把cleanup绑定到exact filesystem object，并以当前进程内finalizer完成result directory fsync的不可伪造证明驱动live cleanup。
