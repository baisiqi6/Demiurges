# DH-016 Plan Review Round 9 — Sub-agent

- decision: `changes_requested`
- may_implement: `false`
- P0: `0`
- P1: `1`
- P2: `0`

## P1 — Bundle Artifact conflict 在 crash recovery 中丢失分类

Bundle Phase B能在live检测`ARTIFACT_DESTINATION_CONFLICT`，但global intent原本只保存project revision；若在terminal result发布前kill，startup recovery会跳过Artifact matrix并改写为`OPERATION_INTERRUPTED`。

要求bundle durable candidate identity包含排序exact Artifact descriptor集合及集合digest；startup recovery必须先重跑bundle Artifact matrix，stable conflict保持conflict code，identity drift保持recovery-required，才可进入Project分支。

Frozen identity：branch `agent/codex/DH-016`，HEAD `0efcef3a531c192410cdabcd62cf736e54404313`，plan `361b052daecbbefdddbfa4738a973d063a7b9ffa5ae1ca1e19aca71c708f06c4`，aggregate `0dbf0672cc8143a74b17b62405d3ea33e0945e7d874649b31b176466cbe2743b`；start/end无漂移。

