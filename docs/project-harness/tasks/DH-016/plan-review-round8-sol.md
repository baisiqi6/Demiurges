# DH-016 Plan Review Round 8 — Sub-agent

- decision: `changes_requested`
- may_implement: `false`
- P0: `0`
- P1: `1`
- P2: `0`

## P1 — Bundle validation 与admission顺序矛盾

Project条款要求unbacked external bundle在global admission前拒绝且零Data Root mutation，但bundle流程先在Data Root staging内做Project/Artifact全量验证。反例会在返回`PROJECT_ARTIFACT_UNBACKED`前已mkdir/write/fsync staging。

要求两阶段：Phase A在bounded memory中完成archive/Project/registry/lineage/external completeness/Artifact格式全验证，零Data Root write syscall；Phase B才取single-flight、global admit、写staging并重验后publish。

Frozen identity：branch `agent/codex/DH-016`，HEAD `0efcef3a531c192410cdabcd62cf736e54404313`，plan `d08d86db9631acac970f05e973d4464b71f76dc551a6e8f0b1b9886a5d802217`，aggregate `1aba06ef0c01359546be60639ba4a1f99ab2aea19360fe711c575480cad4e7cb`；start/end无漂移。

