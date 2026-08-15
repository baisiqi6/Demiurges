# DH-016 Implementation Review — Round 23 / Sol

- decision：`changes_requested`
- may_closeout：`false`
- P0：0
- P1：1
- P2：发现P1后停止扩展

## P1

两个startup-existing terminal Save As均保留Project/lock/marker/attempt时，第一项cleanup后删除第二项final marker，旧实现把`wasTerminalAtStartup=true`误当作“marker可能早已由历史cleanup删除”，继续删除第二项Project、lock与attempt。例外没有冻结“marker在startup时已经缺失”的具体事实。

Reviewer要求每项destructive cleanup前比较该Project的startup/current owner、lock owner与marker owner；只有startup时本来已缺失的evidence才可进入historical cleanup retry。起终product aggregate均为`685aa0de6a2a066aa5b9c2c932b320727dec384daec7fc1f86869bc730ce09b6`。
