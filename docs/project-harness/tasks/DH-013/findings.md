# DH-013 Findings

## 2026-08-13 — 启动基线

- `main` clean，base 为 `97761d6b5dba899fcb73b93ba830ba78f2980766`。
- 新 worktree：`/Users/Admin/projects/WorkTrees/Demiurges-DH-013`。
- 新 branch：`agent/codex/DH-013`。
- 当前 Spark 2.1 只加载 repo-owned diagnostic PLY；真实 provider SPZ 尚未进入产品。
- 当前 articulated robot 是程序化 Three.js presentation，不是 provider-generated mesh。
- 真实 Marble Draft 缺少可信 metric scale / ground-plane metadata；DH-013 必须使用显式 calibration，不能自动猜测。
- 真实 Hunyuan GLB 不携带可信 physics semantics；必须单独定义 bounded MuJoCo proxy。
- 真实 provider bytes 体积较大且 signed URL 短期有效；本切片采用 ignored verified cache + Git-tracked manifest，不把大资产或 signed URL 直接写入普通 Git history。

## 待计划审查核验

- composite scenario 是否仍然足够窄，没有滑向通用 provider SDK；
- local artifact cache 与 Gateway same-origin route 是否形成唯一、可恢复的 asset path；
- collider source 与 MuJoCo proxy 的边界是否足够明确；
- credential、signed URL、provider error 的脱敏与生命周期是否可执行；
- renderer quality 改动是否只服务可读性，没有掩盖 alignment 问题。

## 2026-08-13 — Round 1 cross-review 与真实 candidate 盘点

- Sol 与 OMP DeepSeek V4 Pro 均给出 `changes_requested / may_implement=no`；交集是 calibration truth level、manifest/cache authority、serve revalidation、redirect isolation 与 proxy witness。
- 只读刷新既有 Marble world，确认 Draft 的 `semantics_metadata=null`；`500k` SPZ 与 collider download host 均为 `cdn.marble.worldlabs.ai`。
- 只读刷新既有 Hunyuan JobId，确认 `Status=DONE`，GLB download host 为 `hunyuan-prod-1258344699.cos.ap-guangzhou.tencentcos.cn`。
- 下载到 ignored candidate cache 后，冻结三项真实 size/digest/source bounds；没有发起 generation，也没有持久化 signed URL。
- Marble SPZ 与 collider source bounds 接近但不相同；同一 authored proper-rotation calibration 后最大 axis-aligned boundary 差约 `0.103 m`，因此固定 `0.12 m` witness tolerance。
- Hunyuan GLB 是约 `0.795 m` 的 Y-up rounded cube；box proxy 从 decoded AABB 直接派生，并以 `1e-6 m` containment tolerance 闭合。
- 因 Marble 没有 ground semantics，floor 只能标记为 `AUTHORED AABB FLOOR / UNVERIFIED`，不能称为 provider-verified ground plane。
