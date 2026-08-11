# DH-009 Round 2 — Focused Remediation Cross-review

## Role / Authority

Fresh focused reviewer；cwd `/Users/Admin/projects/WorkTrees/Demiurges-DH-009`；严格只读。允许读取 Round 1 request/verdict 与当前 delta；禁止写文件、build、联网、credential、真实 prompt、commit/push/reset/clean/deploy 或调用其他 agent；不得读取另一位 Round 2 reviewer 输出。

Base `fdbbf680122c06810f58da37d9973d4f0aa2c984`；Round 1 digest `e9d9b1eb1a51f04342cc3aff4ab7211714e705021a910117ccd6d75bb54a5053`；frozen remediation digest `03550f8693a990a20f5a4555c11635831dbf6c1653400590596a2fa3f328939b`。

复算命令与 Round 1 相同：

```bash
product_digest() {
  {
    git diff --binary fdbbf680122c06810f58da37d9973d4f0aa2c984 -- . ':(exclude)docs/project-harness/**'
    git ls-files --others --exclude-standard -- . ':(exclude)docs/project-harness/**' | LC_ALL=C sort | while IFS= read -r product_file; do
      printf 'UNTRACKED %s\n' "$product_file"
      shasum -a 256 "$product_file"
    done
  } | shasum -a 256 | cut -d ' ' -f 1
}
product_digest
```

## Required focused review

逐项复现 Round 1 blockers，并确认不是 alias-only fix：

1. 全链一致的非单位 authoritative quaternion 必须在 Product decoder fail closed；AlignmentEvidence 对两边相同的非单位 quaternion 也必须返回 FAIL/非有限 error，不能 angle 0 PASS。
2. reversed、sparse 与 non-finite bounds 均必须 FAIL；合法 Spark source bounds 仍保持约 0.000068 m error 与 PASS；非法 observation local transform 不能绕过。
3. 把 imported visual/collision/observation 整组迁移到 floor、交换 floor/cube representations 或全链交换 EntityRef，必须因 observation target/Runtime identity fail closed；合法 `entity:cube` fixture 仍通过。
4. `SplatMesh` 必须在 `initialized` reject、stale completion 与 attach 后异常路径均可达并 dispose；catch 必须先清理局部实例，再判断 record 是否仍 active，且不得留下 attached/stale reference。
5. observation status/error/entityRef/alignment dataset 在 loading/success/error/no-observation reset 中成组迁移；特别验证 synthetic stale error 经新空白 Session 清除。
6. 不回归四工具 surface、artifact identity、MuJoCo independence、Episode/Evaluation authority、resize/render/Spark cleanup。

Operator remediation gate：102 tests / 0 fail / 2,626 assertions；typecheck、production build、`git diff --check`、deterministic PLY 与 harness validation 通过。Chromium 验证 four tools、GLB/3DGS/overlay、frame 12/75、alignment PASS、Evaluation PASS、resize、synthetic stale error reset 清除与第二 Session 重载；无 page error、非 favicon console/HTTP error或 lifecycle rejection，只有 Spark 2.1.0 `THREE.Clock` upstream warning。

建议运行 Round 1 targeted suites，加上独立 executable probes。输出首行严格 `decision=approved|changes_requested|blocked`，随后 P0/P1/P2、证据、命令、digest before/after、limitations；不写 repo verdict，不扩展未来性能/SDK non-goal。
