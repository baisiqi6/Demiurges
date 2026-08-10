# DH-000 计划：Bootstrap Demiurges

## 目标

创建独立 Demiurges 仓库，并在产品实现开始前建立唯一、持久的架构 authority。

## 已授权范围

- 将 `/Users/Admin/projects/Demiurges` 初始化为本地 Git 仓库；
- 记录已接受的产品身份；
- 创建最小 project-harness 协议文档；
- 只读检查 Lyaup，并记录抽象后的技术经验；
- 定义初始代码骨架与几何演进；
- 校验文档图与 checklist；
- 把仓库文档统一为中文主体，并固化语言规则。

## Non-goals

- 不创建 product code 或空 package scaffold；
- 不安装 dependency，不创建 lockfile；
- 不复制 Lyaup；
- 不修改 Lyaup；
- 不创建 remote、commit、GitHub Issue、PR，不发布 package 或 deployment；
- 在反复 session recovery 产生真实需求前，不创建 runtime harness script。

## 验收标准

1. 仓库独立存在于 `main`。
2. `scope.md`、`architecture.md`、`domain-model.md`、`technical-foundation.md` 与 `geometry-roadmap.md` 对第一条 vertical slice 的定义一致。
3. Lyaup 被显式定义为只读捐赠者和未来应用，而不是源码或协议母体。
4. 拟议代码骨架没有让 Three.js 或 MuJoCo 成为 Kernel 的组成部分。
5. 几何演进不局限于方块，并保持 visual、collision、physics、observation 与 semantic representation 分离。
6. 项目文档以中文为主体，精确 English technical token 保持原样。
7. checklist validator 与文档检查通过。
8. DH-000 标记为 done 前已请求 independent review。

## 退出条件

本地校验完成后进入 `closeout_requested`。只有 independent reviewer 可以批准，随后只有 Operator 可以把 DH-000 标记为 done。
