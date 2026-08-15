# DH-016 Implementation Review Round 10 — Sol

- Decision：`changes_requested`
- May closeout：`no`
- P0：0
- P1：1

## Finding

startup虽会在per-binding cleanup前验证当前attempt，但没有在任何cleanup前验证所有bindings的全部attempt。排序较后的terminal Artifact含corrupt candidate时，较早terminal Project已经删除directory、lock与attempt，随后才抛`OPERATION_RECOVERY_REQUIRED`，违反全局two-phase preflight。

## Evidence

- Focused：81 pass / 0 fail / 393 expect。
- Full：602 pass / 0 fail / 4138 expect。
- typecheck、build、diff-check、EXharness validate/doctor通过。
- Frozen aggregate：`93d58f533258ab9a6c1325d99a33409959b23fefec3526d8ddae88e82c08db6a`，起终无漂移。

