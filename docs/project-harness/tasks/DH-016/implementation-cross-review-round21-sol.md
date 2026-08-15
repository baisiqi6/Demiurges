# DH-016 Implementation Cross-review — Round 21 (Sol)

- decision：`changes_requested`
- may_closeout：`no`
- P0：0
- P1：2
- P2：未扩展

## P1

1. 多Project cleanup开始后，外部进程等待第一个lock消失，再篡改最后一个Project。marker删除会让旧实现仍返回success；foreign/lock/marker replacement虽被后续检查拒绝，但更早Project已cleanup，无法满足“任一cleanup中途外部漂移时全部原路径证据回滚”。
2. 持久测试缺少bundle Phase A malformed、symlink、wrong-type target的零receipt/staging/Artifact matrix，以及多Project lock/marker drift矩阵。

focused最终109/0/521、full627/0/4258及其余gates通过。Start/end aggregate=`a43333f6fb205f601812e5777e3d59ee7e9a44e8f963e5f5dc41696b837ebc63`。Round 21不得closeout。
