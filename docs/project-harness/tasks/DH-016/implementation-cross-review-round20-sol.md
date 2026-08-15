# DH-016 Implementation Cross-review — Round 20 (Sol)

- decision：`changes_requested`
- may_closeout：`no`
- P0：0
- P1：1
- P2：0

## P1

Phase B receipt-fsync seam加入foreign entry后，逐operation cleanup先删除exact lock，随后marker cleanup才发现unknown entry并抛普通Error。Project/marker/attempt虽保留，startup-frozen lock已不可逆丢失，且错误未稳定映射为`OPERATION_RECOVERY_REQUIRED`。

focused 108/0/510、full 626/0/4247及其余gates通过。Start/end aggregate=`480036b44f0e5b2e5e064d535579bf74a86333ff8a2618861b472981fb6b7bd8`。Round 20不得closeout。
