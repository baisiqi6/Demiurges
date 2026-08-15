# DH-016 Implementation Cross-review Round 3 — Sol

- decision: `changes_requested`
- may_closeout: `false`
- P0: 0
- P1: 3
- P2: 0

## P1

1. startup recovery没有把durable Artifact candidate与frozen registry完整descriptor及operation target重新绑定，可能为漂移intent发布terminal result。
2. startup Save As只能清理exact lock，重启后没有持久目录ownership evidence，无法安全删除本operation创建的aborted空目录。
3. Gateway/Studio偏离canonical control-plane route：缺少`/project/save-as`，Open使用body route，undo/redo位于`/history/*`。

## Evidence

- focused：42 pass / 0 fail
- full：586 pass / 0 fail
- typecheck、diff-check、EXharness validate/doctor：通过
- frozen product aggregate：`b04c6bbceb5d902fc29e8daf594a67e4872f3c55f35410538b01865af4896ca2`

结论：startup必须从durable intent与disk facts重建同一canonical binding；operation-created目录需要durable binding+inode marker；产品route只能保留plan冻结的唯一事实面。
