# DH-016 Plan Review Round 3 — sub-agent

- decision：`changes_requested`
- may_implement：`no`
- P0：0
- P1：1
- P2：0（P1 hard stop）
- plan：`4cbbc710f7fc0ec050b889a59d2c4c0c1951de2434dc8425c827dc91e88878e9`
- aggregate：`3cf352453927853aaf500dd87cfb4db15f09a57ab953aa7ea2cad1352569c9e3`

P1：以realpath字符串派生lease identity没有闭合case/mount alias、字节序/端口公式与首次root创建顺序。缺失root无法realpath，而Gateway若先创建又违反“disk mutation先持lease”。要求missing root零mutation；从no-follow opened directory的OS `(dev, ino)`派生版本化identity并冻结公式；增加alias/case与真实Bun process probes。

起终identity一致，reviewer零修改。本verdict不授予implementation/release authority。
