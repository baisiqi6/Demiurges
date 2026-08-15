# DH-016 Plan Review Round 1 — sub-agent

- decision：`changes_requested`
- may_implement：`no`
- P0：0
- P1：1
- P2：0（发现P1后按hard stop停止扩展）
- reviewer：fresh internal sub-agent，reasoning=`max`
- frozen plan：`368d35a01267e24323138c6fc06bf55f514db75ac03c7732def012f7b5d3a05e`
- frozen aggregate：`c0ac69449fdf4be2c0d6457650eee6cad66a73c62453b48e98cfc110383c95c1`

## P1

Save crash recovery与幂等重试状态机矛盾：`rename(project.json)`后、receipt或解锁前kill会留下新revision和stale lock。同一请求重放先返回`PROJECT_WRITE_LOCKED`；人工清锁后又因磁盘revision不再等于旧`expectedRevision`而返回conflict，无法收敛为已成功。

要求：为save冻结stable `operationId`与持久intent（expected/candidate revision）；同key replay优先于通用lock/CAS处理。已发布candidate时补齐receipt并返回同一success；未发布candidate时也必须有本切片内可执行的安全恢复路径。覆盖rename前后、receipt前后与并发重放。

起终branch/HEAD/plan/19-file aggregate/status一致；reviewer零修改。本verdict不授予implementation或release authority。
