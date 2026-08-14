# DH-014 Plan Review — Round 1

## Frozen input

- HEAD：`c655c544bb88010f42e0dd9e570f7f04923d9b6e`
- plan SHA-256：`13392abcfa9dddef4ea0d7068ec06b7a2dafc644c49c09c665d673974e1ad59f`
- 16-file aggregate：`372d35fbdc4f3e8247f1640cfed2de88cb715e0e9f7ea84778dbf9a8f042e561`
- 两位 reviewer 起止 identity 均一致，未修改工作树。

## Verdicts

### Sol Max

- decision：`changes_requested`
- may_implement：`no`
- P0：0
- P1：3
- 关键问题：entry truth exact mapping/corrupt fallback 未闭合；Overview fit 未覆盖 world transform、degenerate/aspect/clipping/control envelope；Explore/Orbit/pointer/selection lifecycle 未闭合。

### OMP DeepSeek V4 Pro / thinking=max

- provider-native session：`01a0005e-f845-7000-9e42-1b58f3c5a17c`
- observed provider/model：`deepseek/deepseek-v4-pro`
- decision：`changes_requested`
- may_implement：`no`
- P0：0
- P1：3
- 关键问题：Explore drag-look 会误触 selection；entry truth/provenance 未要求 UI 可见；普通 imported mesh 的 trusted focus bounds 来源未闭合。

## Remediation disposition

Round 1 不批准实现。canonical plan 已显式补充：

1. exact truth literals、registry drift/throw/entry-out-of-bounds fail-safe 与 UI provenance；
2. entity-local calibration bounds 的 8-corner world transform、loaded digest-derived GLB bounds 与 deterministic fallback；
3. aspect-aware fit、degenerate bounds、dynamic clipping/fog/control envelope；
4. Inspect-only click-without-drag selection；Explore/Orbit ownership、pointer capture、defensive pointer-lock exit 与逆序 dispose；
5. input cleanup、idle rAF exact predicate/dataset instrumentation 与 DOM-free unit seam；
6. Explore 只覆盖 collision 的 effective visibility，不改写用户 toggle preference。

四份接管设计输入没有因本轮审查被改写。修订后的 plan 必须重新冻结并进入 fresh Round 2；Round 1 reviewer 不得直接批准自己的修订。
