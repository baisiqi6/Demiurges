# DH-016 Implementation Review Round 2 — Sol

- decision: `changes_requested`
- may_closeout: `no`
- P0: 0
- P1: 2
- P2: 0

## P1

1. `artifact-store.ts`只以`assetId + digest`匹配durable candidate，未exact绑定`byteLength / format / elementCount / sourceBounds`。真实journal admission使用错误descriptor后仍发布CAS并形成success terminal。
2. `import-dh013.ts`仅对destination conflict形成durable abort；其他`OPERATION_RECOVERY_REQUIRED`路径仍在`finally`无条件删除candidate与attempt evidence，可能在result尚未durable时破坏恢复证据。

## Evidence

- focused: 38 pass / 0 fail / 221 expect
- full: 583 pass / 0 fail / 4025 expect
- typecheck、diff-check、EXharness validate/doctor通过
- frozen product aggregate: `bee9b468bf4d0c191167ee3fffdf82307045495ee976a29ac22d339acdd74a9e`
- reviewer只读，起终identity无漂移
