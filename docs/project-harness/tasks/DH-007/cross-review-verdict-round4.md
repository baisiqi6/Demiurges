# DH-007 Round 4 — Combined Cross-review Verdict

decision=changes_requested

## Combined conclusion

Sol 批准了 Round 3 四项 blocker closure；Terra 进一步给出正常 completed path 的 executable late-write 反例，因此 combined verdict 必须是 `changes_requested`。

已确认关闭的 model/credential/compaction/abort-path/running authority 不回退。下一 candidate 只需把外部 cancellation 与内部 turn capability lifetime 分离：内部 gate 在 success、failure、abort 后一律永久关闭，并覆盖正常 `turn.completed` 后 fresh-signal late call。Round 4 两份真实 verdict 均永久保留，不把 Sol 的批准删除或改写。
