# DH-016 Implementation Review — Round 21 (Sol)

- decision：`changes_requested`
- may_closeout：`no`
- P0：0
- P1：1
- P2：0

## P1

bundle decoder只对所有entry应用32 MiB通用上限；`bundle.json`/`project.json`冻结的各1 MiB budget没有在`input.slice()`前执行。自洽2 MiB `project/project.json`先被复制/解析，最终返回`BUNDLE_PROJECT_INVALID`而非`BUNDLE_BUDGET_EXCEEDED`。

focused 109/0/521、full 627/0/4258及其余gates通过。Start/end aggregate=`a43333f6fb205f601812e5777e3d59ee7e9a44e8f963e5f5dc41696b837ebc63`。Round 21不得closeout。
