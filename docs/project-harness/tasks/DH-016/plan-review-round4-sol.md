# DH-016 Plan Review Round 4 — sub-agent

- decision：`changes_requested`
- may_implement：`no`
- P0：0
- P1：1
- P2：0
- plan：`aa5b1b6de8cef0d649e825a22b880d8b20116866531f0084536f44b4d228f060`
- aggregate：`611a8963c7aa22fc9d91e578307231261afcee22fc0f493fddcb6656bc863777`

P1：先mkdir空`.write-lock`再写intent不是原子发布；kill可留下missing/partial intent，只能recovery-required，却与“所有intent边界前kill收敛aborted”矛盾。要求在staging完整写/fsync非空lock candidate，再atomic publish目录；该publish是durable admission point，之前crash可重新开始，之后到Project publish前才产生aborted。

Reviewer独立复核Bun lease原语通过；起终identity一致、零修改。本verdict不授予implementation/release authority。
