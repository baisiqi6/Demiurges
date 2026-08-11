# DH-009 Round 1 — Fresh Independent Cross-review

## Role / Authority

Fresh independent reviewer；cwd `/Users/Admin/projects/WorkTrees/Demiurges-DH-009`；严格只读。禁止写文件、build、联网、credential、真实 prompt、commit/push/reset/clean/deploy 或调用其他 agent；不得读取另一 reviewer 的输出，也不得把既有 DH-008 verdict 当作 DH-009 证据。

Base `fdbbf680122c06810f58da37d9973d4f0aa2c984`；frozen product digest `e9d9b1eb1a51f04342cc3aff4ab7211714e705021a910117ccd6d75bb54a5053`。

Digest 的唯一复算命令如下；它排除 review/harness 文档，但纳入所有 tracked product diff 与 untracked product 文件：

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

## Required review

1. **Role/authority**：3DGS 只能是 bounded observation representation；Spark/Three object、URL、buffer 或 Presentation mode 不得进入 Kernel/Product/Agent tool authority；四工具仍恰好是 `read/write/edit/run`。
2. **Artifact identity**：真实 PLY bytes/header/count/digest/provenance/frame/units/local transform/bounds/tolerance 是否闭合；generator 是否 byte-for-byte deterministic；任一漂移是否 fail closed。
3. **Representation closure**：observation 是否只能绑定登记 imported GLB visual + box collision proxy；base Snapshot、samples、terminal 与 serialized projection 是否保持相同 EntityRef/representation，primitive/forged binding 是否可绕过。
4. **Runtime independence**：MJCF 是否完全不消费 3DGS；有/无 observation trajectory 与 landing metrics 是否等价；run/ref/adopt authority 是否未漂移。
5. **Measured alignment**：实际 Spark bounds 的 frame/unit/local transform 是否与 collision bounds 比较；pose quaternion/error、non-finite、tolerance、deep freeze 与 PASS/FAIL 是否可信，不能把缺失 evidence 标为 PASS。
6. **Presentation lifecycle**：async load generation guard、mode switch、selection proxy、session reset、HMR/component cleanup、render/resize scheduling 与 Spark/Splat disposal 是否存在 late contamination、rejection 或 resource leak。
7. **Regression/adversarial probes**：重点尝试 observation 挂到错误 Entity、digest/bytes/units/transform/bounds drift、missing sample state、stale dataset、rapid reset/cleanup、sparse/accessor/plain-data 与 identity alias；只报告当前 scope 的 executable P0/P1/P2。

Operator gate：102 tests / 0 fail / 2,615 assertions；typecheck、production build、`git diff --check`、deterministic PLY SHA-256 与 harness validation 通过。真实 Chromium 验证 blank → four tools → loaded/alignment PASS/Evaluation PASS/playback，reset 清空，再次运行重新加载；resize/HMR/close 后无 page error、非 favicon console/HTTP error 或 `No target`，只有 Spark 2.1.0 内部 deprecated `THREE.Clock` warning。

建议至少运行：

```bash
bun test packages/world/src/artifacts/diagnostic-rigid-fixture.test.ts \
  packages/world/src/product-session-codec.test.ts \
  packages/world/src/runtime-mujoco/run-falling-cube.test.ts \
  apps/studio/src/presentation-three/alignment-evidence.test.ts \
  packages/world/src/world-tools/world-tool-surface.test.ts
git diff --check
```

输出首行严格 `decision=approved|changes_requested|blocked`，随后 P0/P1/P2、精确文件/行号或 executable counterexample、命令、digest before/after 与 limitations。中文为主体；不写 repo-local verdict。
