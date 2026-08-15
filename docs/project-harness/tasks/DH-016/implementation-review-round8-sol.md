# DH-016 Implementation Review Round 8 — Sol

- Decision：`changes_requested`
- May closeout：`no`
- P0：0
- P1：7

## Findings

1. Project 中间目录 symlink 可让 Open/List 读取 Data Root 外的 manifest。
2. startup 未在任何 mutation 前完整验证所有 durable Artifact binding。
3. pending foreign/cross-Project lock 会先被 terminalize，随后才发现 provenance 错误。
4. recovery 与 Artifact `EEXIST` exact 路径缺少 business candidate parent-directory fsync。
5. existing terminal retry 不清理原 attempt/candidate。
6. Undo/Redo 缺少 expected Project revision 与 Ref 的服务端 CAS，且没有 strict bounded body。
7. Studio 缺少未保存状态，可能导出旧磁盘 revision。

## Evidence

- Focused：72 pass / 0 fail / 351 expect。
- Full：595 pass / 0 fail / 4100 expect。
- typecheck、diff-check、EXharness validate/doctor 通过。
- Frozen product aggregate：`c2da0a1de0362b5608edaeef39a3efaf47ac5fbbce4dc35ea4f70ecae7990882`，起终无漂移。

