# DH-016 Plan Review Round 3 — ZCode

- decision：`changes_requested`
- may_implement：`no`
- P0：0
- P1：1
- P2：3
- CLI：ZCode `0.16.3`
- requested：GLM-5.3，thinking=`Max`
- actual model：`UNVERIFIED`
- session：`sess_edd8c18d-502e-4702-b26c-7a9e74ea748b`
- direct local CLI evidence，不是Coordinate managed receipt

P1：startup recovery产生`aborted-before-publish` receipt后，同一Idempotency-Key重放结果未定义；若重新执行会让同一operation产生第二次disk mutation。必须返回同一aborted结果且零mutation。

P2：冻结first16→port公式；要求listener backend支持并实测`SO_REUSEADDR`/handshake后SIGKILL rebind；冻结missing root的bootstrap顺序。

该verdict不授予implementation/release authority。
