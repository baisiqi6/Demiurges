# Demiurges Agent 工作规范

## 文档语言

- 仓库内的产品文档、架构文档、ADR、计划、handoff、review、runbook 和代码注释，默认以中文为主体。
- 保留精确的 English technical token，包括命令、identifier、flag、路径、API、schema 字段、package、模型名、协议名和第三方产品名；不要为了“中文化”翻译或改写它们。
- 标题和解释性正文优先使用中文；只有面向国际用户的独立交付物或用户明确要求时，才创建英文主体版本。
- 不得同时维护语义相同的中英文 canonical 文档。需要英文版本时，应明确主从关系和同步责任。

## 阅读顺序

修改本仓库前，依次阅读：

1. `docs/project-harness/scope.md`
2. `docs/project-harness/architecture.md`
3. `docs/project-harness/domain-model.md`
4. `docs/project-harness/progress.md`
5. `docs/project-harness/harness-checklist.json`
6. `docs/project-harness/current/task_plan.md` 指向的 active plan

## Authority

- 本仓库是 Demiurges 实现事实的 source of truth。
- `docs/project-harness/` 是稳定的项目协议与架构 authority。
- `tasks/<id>/plan.md` 是对应 tracked item 的 canonical plan。
- Obsidian 文档是产品输入和决策历史，不是 Runtime 或代码事实。
- Lyaup 仅供只读参考；Demiurges 任务不得修改 Lyaup。
- 不得把 Lyaup 的源码、prompt、API shape、schema、测试、UI 文案或目录结构复制到 Demiurges。应先把有价值的经验重述为独立 requirement，再从第一性原则设计。

## 工程纪律

- 第一版 Kernel 必须保持极小，不预建生态、通用 Adapter SDK、权限平台或模型市场。
- `edit` 改变世界描述，`run` 产生世界历史，不得混淆。
- Three.js 是 Presentation，MuJoCo 是 Evolution Runtime，Snapshot 是世界状态 authority，三者不得静默互相替代。
- 新 requirement 不适配时，先识别被违反的 invariant；未确认抽象正确前，不增加 flag、mode 或兼容分支。
- 只有第二个真实实现需要时，才增加 extension point。
- active task 和用户 authority 未覆盖时，不得安装依赖、commit、push、创建 remote、发布 package 或 deploy。
- Worker、reviewer 与 operator 职责保持分离，worker 不审批自己的 closeout。
