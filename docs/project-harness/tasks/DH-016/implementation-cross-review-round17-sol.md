# DH-016 Implementation Cross-review — Round 17 (Sol)

- decision：`changes_requested`
- may_closeout：`no`
- P0：0
- P1：1
- P2：0

## P1

pending `project.save-as`拥有完整staged candidate/marker，但final target被一个没有`.created-directory.json`或`.write-lock`的foreign目录占用时，Phase A把owner记为`undefined`并跳过entry-set检查。Reader又把缺少`project.json`映射为not found，导致Phase B先发布`OPERATION_INTERRUPTED` result，cleanup才发现marker-directory identity不匹配。

独立probe得到`resultPublished=true`、原attempt与foreign目录仍在，证明发生partial terminalization。focused 102/0/484、full 620/0/4221及其余mandatory gates通过，但未覆盖ownerless final path。

Start/end product aggregate=`6b9ac3c7f2ac034504585432d27c0d78fd1810be5b695308a50ed77ef7fca2b9`，无漂移。另一fresh reviewer被provider内容分类器中止，未形成有效verdict，不能计为approval。Round 17不得用于closeout。
