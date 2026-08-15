# DH-016 Implementation Cross-review Round 1 — Sol

- decision: `changes_requested`
- may_closeout: `no`
- P0: 0
- P1: 3
- P2: 0

## P1

1. package root公开`publishRegisteredArtifact`与lease acquisition；调用方可绕过shared `OperationSingleFlight`和durable admission直接发布CAS。反例中Artifact已存在，但`receiptEntries=[]`。
2. Gateway JSON/bundle body reader没有把每次`reader.read()`与request abort及有限总deadline竞争；Open的永不结束stream在abort 150ms后仍pending。
3. startup recovery在classification为`OPERATION_RECOVERY_REQUIRED`时，仍由`finally`删除exact `.write-lock`；非终态恢复因此销毁证据。

## Required remediation

- 原始CAS primitive必须package-private且绑定不可伪造的journal-issued admitted leader；所有可达publish先有durable intent与shared single-flight。
- Open/Save/import bounded reader必须响应abort与总deadline，cancel/release reader并返回稳定public code，且零Session/Data Root mutation。
- 只有durable terminal classification/result形成后才能清理lock/staging；ambiguous recovery保留全部evidence。

## Evidence

- focused: 89 pass / 0 fail
- full: 578 pass / 0 fail
- typecheck、diff-check、EXharness validate/doctor通过
- frozen product aggregate: `47abaa4ad4e692fbe2aaa8d05be2c9d6a82c5ce8ba7e09825b793a15d88a24a2`
- reviewer只读，起终identity无漂移
