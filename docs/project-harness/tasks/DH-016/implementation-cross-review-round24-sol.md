# DH-016 Implementation Cross-review — Round 24 / Sol

- decision：`changes_requested`
- may_closeout：`false`
- P0：0
- P1：1
- P2：发现P1后停止扩展

## P1

第二路以两个terminal-at-startup Save As复现同一根因：第一项cleanup后，将第二个Project目录替换为新inode，并按新目录identity重建同binding marker与exact lock。owner三元组仍相同，旧实现继续`alreadyTerminal`并删除第二项evidence。

这证明Project directory identity必须成为frozen evidence的一部分；仅比较owner operationId不足以识别目录替换。Round 24 combined decision为`changes_requested`，不能closeout。
