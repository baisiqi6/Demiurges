# DH-016 Implementation Review Round 1 — Sol

- decision: `changes_requested`
- may_closeout: `no`
- P0: 0
- P1: 1
- P2: 0

## P1

Save As在建立项目目录与`.write-lock`后收到abort时，虽然durable result为`REQUEST_ABORTED`，但只清理lock与attempt，留下本operation创建的空项目目录。可执行反例得到：

```json
{"code":"REQUEST_ABORTED","projectNames":["project:abort-orphan"],"targetEntries":[]}
```

修复门槛：只记录本operation成功`mkdir`的目录identity；exact lock清理后，以no-follow方式确认同一空目录，再`rmdir`并fsync `projects/`。未知entry或identity drift必须保留并fail closed。

## Evidence

- focused: 89 pass / 0 fail
- full: 578 pass / 0 fail
- typecheck、diff-check、EXharness validate/doctor通过
- frozen product aggregate: `47abaa4ad4e692fbe2aaa8d05be2c9d6a82c5ce8ba7e09825b793a15d88a24a2`
- reviewer只读，起终identity无漂移
