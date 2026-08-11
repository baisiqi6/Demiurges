# DH-007 Round 1 — Combined Cross-review Verdict

decision=changes_requested

## Combined conclusion

两位 reviewer 在同一 frozen product digest `dc90a2482be303718554c13dba6b2ec2d923684bcf3f8fca2f04cc8aaf2a8867` 上一致阻断 closeout：

1. production 仅锁住 OMP 初始 model identity，没有隔离 ambient Settings 或关闭 retry model fallback，不能证明整个 turn 只使用 Human 授权的唯一 provider/model；
2. Studio deadline/abort 没有贯穿 Gateway ProductSession 与 OMP，客户端停止等待后真实 Agent 仍可能继续调用模型或改变世界；
3. `smoke:sdk` 未发送 prompt，但 SDK construction 可能执行 model-host preconnect；此前“未调用 provider/network”的表述需要收窄。

Round 1 verdict 永久保留。下一 candidate 必须从 session settings 与 end-to-end cancellation contract 根修，新增 RED regressions、重跑 full gates/Chromium，并在新 digest 上进行 fresh Round 2 review；不得在原 digest 上补写批准。
