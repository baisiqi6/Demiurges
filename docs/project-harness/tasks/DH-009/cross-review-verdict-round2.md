# DH-009 Round 2 Cross-review Verdict

## Combined decision

`changes_requested`

Terra 在 frozen remediation digest `03550f8693a990a20f5a4555c11635831dbf6c1653400590596a2fa3f328939b` 上批准 Round 1 全部 remediation，P0/P1/P2 无；Sol 独立确认 quaternion、bounds、单独 tuple/Ref swap、lifecycle 与 dataset blockers 均已关闭，但发现一个组合 identity alias P1，因此 combined gate 仍阻断。

## P1

同时对 base/terminal 执行 floor/cube Ref swap 与 representations swap，并同步 sample state keys/values 和 event refs 后，observation 字符串上重新落回 `entity:cube`，但该 record 的真实角色是 `static Ground plane`。Product decoder 只检查 observation 的 Ref 字符串与内部 tuple，没有像 Runtime 一样验证 floor/cube 的 fixed physics role，因此接受该 forged projection。

## Required remediation

- Product plain-data trust boundary 与当前唯一 falling-cube Runtime 对齐：世界只能含精确 `entity:floor` 与 `entity:cube`；floor 必须 static、0 mass、0 velocities，cube 必须 dynamic、positive mass；friction、box geometry 等 Runtime admission 共享的数值不变量也必须在 decoder fail closed；
- 增加 JSON round-trip 后的组合 Ref + representations + sample/event mutation regression；
- 重跑 full/browser gates，冻结新 digest，进入 final focused Round 3。Round 1/2 verdict 均永久保留。
