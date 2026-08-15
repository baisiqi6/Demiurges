# DH-016 Plan Review Round 2 — sub-agent

- decision：`changes_requested`
- may_implement：`no`
- P0：0
- P1：1
- P2：0（P1 hard stop）
- plan：`e7448b290e910b4db8ebba08d9c095ad7bc9541a3369939bb92d55f627732ab7`
- aggregate：`00505904698a541e92f8ec5139c5ca875c6ba960b4ae8b2ec0cefb533e2f4643`

P1：Unix socket connect failure与owner-directory rename都不能证明旧writer死亡；paused/backlog owner仍可被rename，旧writer可能在最后token check后继续publish，新writer同时恢复其intent，导致双writer与receipt/fact矛盾。要求使用进程生命周期由kernel持有、crash自动释放的exclusive lease；所有save/import/artifact/receipt/recovery/cleanup全程持有同一lease。

起终identity一致，reviewer零修改。本verdict不授予implementation/release authority。
