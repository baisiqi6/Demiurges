# DH-016 Implementation Review — Round 24 / Sol

- decision：`changes_requested`
- may_closeout：`false`
- P0：0
- P1：1
- P2：发现P1后停止扩展

## P1

两个startup-existing、已经完成历史cleanup的successful Save As Project均没有lock/marker/attempt residue。第一项处理完成后删除第二个Project目录，旧实现仍返回两个`alreadyTerminal`。原因是`ProjectEvidenceInspection`只冻结effective owner、lock owner与marker owner；“ownerless目录仍存在”和“目录已缺失”都会表示成三个`undefined`。

Reviewer要求冻结Project directory自身的stable no-follow identity，并在当前项destructive cleanup前比较存在性与`dev/ino/mode/uid/gid`。起终product aggregate均为`c6258ef25061ff886fbd9ed1aa4902637a1e49460b809f5f28f88fc6831c45e2`。
