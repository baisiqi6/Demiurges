# DH-007 Round 3 — Combined Cross-review Verdict

decision=changes_requested

## Combined conclusion

两位 reviewer 在 frozen digest `ea599a14af3cb1b1cae19cc5defb59329715b117853455af03090a26a73f402c` 上一致复现 late world mutation；Sol 另证明 credential preflight 尚未与 pinned resolver 使用同一 session affinity，且默认 compaction 仍存在旁路 model/credential 调用；Terra 另证明 `ProductSession.runTurn()` 的成功返回 projection 在 settled 前被构造。

Round 1/2/3 verdict 永久保留。下一 candidate 必须：

1. 以同一个显式 provider session id 同时约束 OMP preflight 与 product pinned resolver；
2. 在本产品 session 关闭 compaction/context-promotion ancillary inference；
3. 将 owning turn abort 固化进四工具 closure，使 fake port 无法用替换 signal 恢复 capability；
4. 在构造成功 projection 前恢复 `running:false`；
5. 新增 executable regressions 并在新 digest 上 fresh review。
