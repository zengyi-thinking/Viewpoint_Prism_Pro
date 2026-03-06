# 创作棱镜优化推进记录

## 目标

当前创作棱镜已经具备以下基础能力：

- `PrismFlow` 画布与节点编辑
- `AI 文案拆分 -> 批量建节点`
- `Simple 续写 -> 基于当前节点生成后续节点`
- `首帧 / 尾帧` 提示词编辑、图片生成、锁定
- `Branch / Merge`
- 节点渲染与串联导出

问题不在于“缺少能力点”，而在于这些能力还没有形成一条清晰、低门槛、可控的创作闭环。

本轮优化采用“补全现有链路”而不是“从零重做”的策略。

## 当前判断

### 已完成的骨架

- 双创作思路已经存在：
  - `批量拆分`
  - `Simple 续写`
- 节点导演卡的字段已经存在：
  - `prompt`
  - `firstFramePrompt`
  - `lastFramePrompt`
  - `firstFrameUrl`
  - `lastFrameUrl`
  - `firstFrameLocked`
  - `lastFrameLocked`
- 后端已经支持：
  - `generateNextNode`
  - `createBranch`
  - `mergeBranch`
  - `renderNode`
  - 后续节点继承前序节点帧上下文

### 主要缺口

- 双入口只是按钮切换，不是正式入口体验
- 新用户不知道什么时候该用哪种模式
- “首节点如何开始”仍然不够明确
- 画布模式和快速模式的关系没有讲清楚
- 现有能力虽然有，但认知负担仍然偏高

## 补完版路线图

### 任务 1：补全双入口，不重做双入口

目标：

- 把现有 `批量拆分 / Simple 续写` 整理为正式的两种创作入口：
  - `快速模式`
  - `PrismFlow 工程模式`

交付：

- 创作棱镜顶部新增模式说明与切换
- 空项目时显示模式说明卡片
- 快速模式中保留两条现有路径：
  - `AI 文案拆分`
  - `Idea -> 首节点 / 下一节点`
- PrismFlow 模式强调节点化编辑、分支、合并、导出

验收：

- 新用户进入创作棱镜时，知道应该先从哪一种方式开始
- 不需要理解所有按钮，也能完成第一次创建

### 任务 2：补全“首节点一键生成”闭环

目标：

- 输入一句 idea，就能直接生成第一张完整节点卡

交付：

- 首节点生成提示词统一输出：
  - 镜头摘要
  - 视频提示词
  - 首帧提示词
  - 尾帧提示词
  - 场景帧提示词
- UI 中明确区分：
  - 生成首节点
  - 续写下一节点

### 任务 3：重构节点导演卡

目标：

- 不增加太多功能点，优先重排信息架构

交付：

- 节点卡拆成四层：
  - 叙事意图
  - 画面锚点
  - 提示词层
  - 渲染状态层

### 任务 4：补生成前预检与连续性风险提示

目标：

- 在真正调用模型前，先做可解释的风险检查

交付：

- 缺主体 / 缺动作 / 缺镜头语言 / 连续性风险 / 风格漂移风险
- 输出：
  - `可直接生成`
  - `建议补充`
  - `高风险`

### 任务 5：补分支比较、合并决策、质量评分

目标：

- 让 `Branch / Merge` 真正变成创作者会用的能力

交付：

- 分支对比视图
- 合并建议
- 节点质量评分：
  - 主体一致性
  - 镜头连续性
  - 提示词完整度
  - 渲染稳定性

## 本轮落地范围

本轮已落地：

- 任务 1：双入口产品化（快速模式 / PrismFlow 模式）
- 任务 2：首节点一键生成闭环（首节点与续写节点共用统一 Prompt Bundle）
- 任务 3：导演卡四层信息架构重排
- 任务 4：生成前预检 + 风险分级（`ready/suggest_improve/high_risk`）
- 任务 5：分支对比、合并建议、质量评分

## 实施原则

- 尽量复用现有 `CreationCanvas`、`ScriptInput`、`generateNextNode`
- 不新增第二套状态树
- 不新增第二套后端接口
- 优先把已有能力组织清楚，而不是继续堆按钮

## 本轮进度更新（2026-03-06）

- 已完成：任务 1（双入口产品化）
  - `CreationCanvas` 支持正式入口切换：`快速模式` 与 `PrismFlow`。
  - 快速模式内区分 `文案拆分` 与 `Idea 生成`，并提供空项目引导文案。

- 已完成：任务 2（首节点一键生成闭环）
  - `CreationCanvas` 在“无节点”状态下触发 `AI 生成首节点`，并注入完整 Prompt Bundle：
    - `scriptSegment`
    - `videoPrompt`
    - `sceneFramePrompt`
    - `firstFramePrompt`
    - `lastFramePrompt`
  - 有节点状态下自动转为 `AI 续写下一节点`。

- 已完成：任务 3（导演卡四层结构）
  - `FlowNodeCard` 已按四层重组：
    - 叙事意图层
    - 提示词层
    - 画面锚点层
    - 渲染状态层
  - 同时保留 AI 文案重调、候选续写、分支操作与视频预览。

- 已完成：任务 4（预检与风险提示）
  - 后端新增：
    - `GET /api/prism/creation/nodes/:nodeId/precheck`
  - 服务逻辑新增：
    - 缺主体、缺动作、缺镜头语言
    - 连续性风险、风格漂移风险
    - 风险等级输出：`ready/suggest_improve/high_risk`
  - 前端在渲染前强制执行预检，`high_risk` 阻断渲染并提示原因。

- 已完成：任务 5（分支对比 + 评分）
  - 后端新增：
    - `GET /api/prism/creation/nodes/:nodeId/quality`
    - `GET /api/prism/creation/branches/:nodeId/compare`
  - 节点评分维度：
    - `promptCompleteness`
    - `continuity`
    - `renderStability`
    - `subjectConsistency`
  - 分支对比输出：
    - `merge_branch | keep_main | manual_review`
    - 对比差值与理由列表
  - 前端导演卡支持一键触发：`预检 / 质量评分 / 分支对比`。

- 已完成：服务层测试（不走接口）
  - `server/test/test-creation-service.ts`
    - 覆盖首节点生成、续写节点、候选节点
  - `server/test/test-creation-optimization-services.ts`
    - 覆盖预检、评分、分支对比、分支合并
  - 两个脚本在本地执行均通过。
