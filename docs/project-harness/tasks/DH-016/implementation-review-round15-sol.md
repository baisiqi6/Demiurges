# DH-016 Implementation Review — Round 15 (Sol)

- decision：`changes_requested`
- may_closeout：`no`
- P0：0
- P1：1
- P2：0

## P1

candidate已rename到final后，startup Phase A只校验staged marker的canonical bytes与final directory inode，没有证明final `.created-directory.json`仍是staged marker的同一hard-link。final marker缺失时Phase B会先terminalize、Phase C才失败；final marker被替换为byte-identical新inode时会错误terminalize并删除Project/attempt。Save As与bundle import均可复现。

focused 96/0/459、full 614/0/4196及其他mandatory gates通过，但不覆盖该identity drift。Start/end aggregate=`df494060274d07f57e37bdac2188f771832e5cd992f8737f2eded8a0700c994c`，无漂移。

Round 15不得用于closeout approval。
