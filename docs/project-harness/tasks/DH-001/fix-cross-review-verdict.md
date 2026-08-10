# DH-001 Fix Cross-review Verdict

## Combined decision

`changes_requested`

Kimi Code K3 Max 给出静态 `approved`；GPT-5.6 Sol Max 以可复现诊断提出四类 P1。按预先声明的 cross-review gate，任一可复现 P1 都阻断 closeout，不能以多数或实现者报告覆盖。

## Operator 采用的 blocking invariants

1. 固定 program/profile identity 必须稳定标识完整执行语义；同一 ID 不得容纳不同 gravity、timestep、target 或 timing。
2. Runtime 跨异步 provider 边界前必须取得递归 immutable 的 Snapshot、Program、Profile 与 ExplicitInputs；输出证据不得混合 await 前后的两个输入版本。
3. Runtime 必须闭合它声明支持的世界集合；未参与物理演化的 static velocity/mass 或额外 dynamic Entity 应 fail closed。
4. Observation/event time 必须对应同一个 MuJoCo state；不能把 step 前 contact 标成 step 后时间。

## Authority

本轮 reviewer 均只读；审查前后 product digest 为 `a992f412f8b1ced1c8182f492c307f8c9f7b2af1a956ebc80f96451abfb496a7`。`DH-001` 保持打开，继续 Phase 7。
