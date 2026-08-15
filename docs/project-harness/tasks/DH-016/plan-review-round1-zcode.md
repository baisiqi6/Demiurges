# DH-016 Plan Review Round 1 — ZCode

- decision：`changes_requested`
- may_implement：`no`
- P0：0
- P1：1
- P2：3
- CLI：ZCode `0.16.3`
- requested config：`builtin:bigmodel-coding-plan/GLM-5.3`，thinking=`Max`
- actual model identity：`UNVERIFIED`（native JSON没有model/variant runtime proof）
- provider session：`sess_a66d8b0c-ca93-4f17-a7d5-51f3e6019522`
- evidence：direct local CLI JSON；不是Coordinate managed receipt
- mode：`plan`，显式deny `Bash Edit Write NotebookEdit`

## P1

计划声明`GET /api/projects/recent`、Studio“打开最近项目”和重启验收，但Data Root没有recent index，manifest也没有时间，进程重启后无法发现projectId；实现者会被迫临场发明第二事实面。

采纳的最小修订：不新增持久recent index，改为`GET /api/projects`对`projects/<projectId>/project.json`做bounded、no-follow、validated enumeration；mtime只作为非authoritative展示排序，不能影响Project identity或Open admission。

## P2

- 明确`artifacts`只从registered representations推导，不能把legacy imported representation误当frozen provider registry entry。
- stale lock需要可审计owner/intent与本切片内恢复语义。
- 未绑定Project的session调用undo/redo需要稳定`PROJECT_NOT_BOUND`结果。

ZCode未复算Git/hash，由Operator在调用前后独立冻结；输出自报未编辑/Bash/Git mutation。该verdict不授予implementation或release authority。
