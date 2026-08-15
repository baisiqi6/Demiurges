# DH-016 Implementation Cross-review Round 2 — Sol

- decision: `changes_requested`
- may_closeout: `no`
- P0: 0
- P1: 1
- P2: 0

## P1

`artifact-store.ts`的admission coverage只比较`assetId + digest`。可执行反例把真实SPZ的`elementCount`从497664改为497665，仍得到`status=published`并产生CAS mutation。必须在任何candidate/CAS write前对registry-derived完整descriptor做canonical exact equality，并闭合target kind/id、foreign root/lease/journal、Project operation与terminalized capability。

## Evidence

- focused: 38 pass / 0 fail
- full: 583 pass / 0 fail
- typecheck、diff-check、EXharness validate/doctor通过
- frozen product aggregate: `bee9b468bf4d0c191167ee3fffdf82307045495ee976a29ac22d339acdd74a9e`
- reviewer只读，起终identity无漂移
