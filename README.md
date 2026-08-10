# Demiurges

> 造物，从此不再唯一。<br>
> Worldmaking, no longer singular.

**Demiurges** 是一个 World Agent Harness：它为 LLM、VLM 与未来的世界模型提供工作环境，使模型能够读取、创建、编辑、推演、观察和评测可版本化的世界。

项目正在实现第一条 `falling-cube` vertical slice：canonical Snapshot → Three.js Presentation → MuJoCo WASM Episode → TerminalSnapshot → deterministic EvaluationRecord。

## 本地运行

```bash
bun install
bun run dev
```

验证：

```bash
bun test
bun run typecheck
bun run build
```

## 阅读入口

1. [`docs/project-harness/scope.md`](docs/project-harness/scope.md)
2. [`docs/project-harness/architecture.md`](docs/project-harness/architecture.md)
3. [`docs/project-harness/domain-model.md`](docs/project-harness/domain-model.md)
4. [`docs/project-harness/technical-foundation.md`](docs/project-harness/technical-foundation.md)
5. [`docs/project-harness/geometry-roadmap.md`](docs/project-harness/geometry-roadmap.md)
6. [`docs/project-harness/harness-checklist.json`](docs/project-harness/harness-checklist.json)

Lyaup 只是只读技术捐赠者和未来应用场景，不是 Demiurges 的源码母体、协议 authority 或共享 mutable kernel。
