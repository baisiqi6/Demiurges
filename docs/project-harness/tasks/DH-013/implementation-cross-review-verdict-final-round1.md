# DH-013 Final Implementation Cross-Review Verdict — Round 1

## Gate decision

```yaml
decision: changes_requested
may_closeout: no
P0: 0
P1: 2
```

Round 1 不是多数投票：OMP DeepSeek V4 Pro Max 给出 `approved`，但 Sol Max 给出两个可执行 P1，因此统一 gate 采用 `changes_requested`。两名 reviewer 的起止 branch、HEAD 与 40-file aggregate 都精确匹配，工作树没有漂移。

## Blocking findings

1. Cache read 没有比较 before/after 的 `dev/ino/mode/size/mtime/ctime` 稳定 identity tuple；FIFO 又可能在 regular-file admission 前阻塞。Asset route deadline 返回后还会提前释放并发 slot，而底层 read promise 可能仍在运行。
2. SPZ validator 只闭合 header + centers，没有闭合 v2 的 opacity/RGB/scale/rotation/SH 完整布局；GLB validator 没有闭合 chunk table/BIN/trailing bytes，也忽略 sparse POSITION，并且只相信 accessor min/max，没有从 BIN POSITION 重算 bounds。

## Accepted evidence, but not approval

- 六项 mandatory gates 通过，full tests 为 `461/0/3397`；三项 import 均 cache-hit 且 provider query/download 为 0。
- DeepSeek 独立 Chromium 验证 imported/empty-cache、四 toggle、header/bytes tamper、四工具、76 samples、Evaluation PASS 与 provider-domain request 0。
- Sol 独立验证 codec/Runtime/ref/Evaluation/Presentation 分离均闭合，但上述 cache/format 反例仍可执行。

Round 1 不得用于 closeout。修复后必须冻结新 product aggregate，并由两名未读取本文件的 fresh reviewer 重新执行 Round 2。
