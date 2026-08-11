# DH-007 Round 2 — Combined Cross-review Verdict

decision=changes_requested

## Combined conclusion

两位 reviewer 在同一 frozen product digest `def0c72e9ccfc88066bcee572fd8b0e973afd6470c8c61888290a9d32f239480` 上确认 Round 1 remediation 有效，但发现三个仍会越过 authority 的锁定 SDK 路径：

1. OMP 的 Fireworks `*-fast → base` intrinsic fallback 可绕过已关闭的 retry settings；
2. `pi-ai` provider driver 自有 auth retry 可把一次 turn 切换到 sibling credential；
3. Gateway deadline 未覆盖 OMP `start/stop` lifecycle，悬挂 phase 可阻止 bounded settle 与 `running:false` 恢复。

Round 1 与 Round 2 verdict 都永久保留。下一 candidate 必须在 model/credential call boundary fail closed，并以同一 abort authority 包围完整 Agent lifecycle；新增 executable RED regressions、重跑 full gates 后，只能在新 digest 上进入 fresh Round 3 review。
