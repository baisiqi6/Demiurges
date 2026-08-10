# DH-001 Fix Review Verdict — GPT-5.6 Sol Max

- Decision：`changes_requested`
- P0：无
- Product digest before/after：`a992f412f8b1ced1c8182f492c307f8c9f7b2af1a956ebc80f96451abfb496a7`
- `bun test`：9 pass、0 fail、117 assertions

## P1

1. `WorldProgram` / `RuntimeProfile` identity 未覆盖完整执行语义：非法 program id 与同 profile id 下被篡改的 gravity/timestep 可产生 `completed` Episode，并保留相同 provenance identity。
2. 只检查顶层 `Object.isFrozen()`，且遗漏 `ExplicitInputs`。WASM lazy-load 的 await 期间可修改 nested Snapshot 或 inputs，令 Episode metadata、静态 Entity state 与实际 MJCF execution 不一致。
3. Runtime 接受却忽略未实现语义：static floor 的非零 velocity/非零 mass 与额外 dynamic Entity 都不会进入 MuJoCo 演化，却原样出现在 Episode。
4. `contact-began` 读取的是 `mj_step()` 前向阶段的 contact，却标记为 step 后的 `data.time`，事件比对应 contact state 晚一个 physics step。

## P2

- angular velocity round-trip test 存在同错相消空间；reviewer 用独立 quaternion finite-evolution oracle 复核当前实现方向正确，建议固化正交 oracle。
- 若 `data.delete()` 自身抛错，当前 finally 不会继续释放 model；未观察到正常路径泄漏。

## 关单建议

不关闭 `DH-001`。统一闭合固定 identity、递归 immutable input、当前 slice 的 supported-world set，以及 contact observation timing；补 regression 后再审。
