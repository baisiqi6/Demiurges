# DH-016 Plan Review Round 7 — ZCode

- decision: `changes_requested`
- may_implement: `false`
- P0: `0`
- P1: `1`
- P2: `4`
- direct CLI session: `sess_e8245214-478e-4782-822b-3a6ad297eac8`
- requested model: `builtin:bigmodel-coding-plan/GLM-5.3`, Max
- actual model identity: `UNVERIFIED`
- evidence class: one-shot local direct CLI；不是 Coordinate managed receipt

P1：Project manifest只登记registered Artifact，却未禁止Snapshot中legacy `imported-rigid-mesh`/`gaussian-splat` 外部引用，可以Save/Open出无Store bytes的半世界。要求Project v1以stable `PROJECT_ARTIFACT_UNBACKED` 在Save/Open/bundle import中fail closed。

P2：Save As中止后empty project directory清理、Artifact conflict stable code、`import:dh013` operationId来源、derived port冲突accepted risk。前三项已在remediation中闭合。

