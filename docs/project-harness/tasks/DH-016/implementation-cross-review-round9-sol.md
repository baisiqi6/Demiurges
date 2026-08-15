# DH-016 Implementation Cross-review Round 9 — Sol

- Decision：`changes_requested`
- May closeout：`no`
- P0：0
- P1：1

## Finding

startup recovery对已证明归属的attempt只按generic文件名放行`project.json`等entry，没有验证其canonical bytes、candidate revision或identity；malformed staged Project因此会在Project lock/marker/directory被清理后随attempt一起删除。可执行反例得到`recoveryError=null`且lock、marker、malformed candidate、attempt、Project directory全部被删除。

## Evidence

- Focused：80 pass / 0 fail / 388 assertions。
- Full：601 pass / 0 fail / 4133 assertions。
- typecheck、build、diff-check、EXharness validate/doctor通过。
- Frozen aggregate：`7e58c02b4c2efd52e19dfcd5210489f46d1cdc7901033ad5e0befb240ba52d74`，起终无漂移。

