# Creation Prism V2 Plan

## 1. 目标

创作棱镜 V2 的目标不是“再做一个视频生成输入框”，而是提供一个以节点为核心的创作工作台：

1. `idea 模式`
   从一句模糊想法出发，先生成多个故事方向，再生成首节点。
2. `编剧模式`
   从完整剧本或章节文本出发，先拆章，再拆分镜节点。
3. `节点画布`
   每个节点都有中文分镜描述、展示给用户的中文提示词、模型使用的编译提示词、图片/视频生成按钮和连续性关系。
4. `任务编排`
   图片生成、视频渲染、导出串联都通过统一任务通道执行，并向前端推送状态。

V2 明确禁止在业务逻辑中内置固定题材、风格模板、故事模板。故事方向、章节结构、节点推进、提示词生成都交给 LLM/Agent 处理，本地代码只负责：

1. 数据存储
2. 协议校验
3. 连续性约束
4. 渲染任务编排
5. 结果展示

## 2. 设计原则

### 2.1 无模板原则

禁止以下做法：

1. 在后端写死“世界观建立型/人物钩子型/事件闯入型”这类模板。
2. 在前端写死“赛博朋克/奇幻/商业化”等风格预设。
3. 在 Agent prompt 中要求模型套固定故事结构。

允许以下做法：

1. 用 system prompt 约束输出格式、长度、质量。
2. 用上下文约束保证连贯性。
3. 用 JSON schema 约束结构化输出。

### 2.2 双提示词层

每个节点都区分：

1. `displayPromptCn`
   给用户看的中文分镜提示词，强调可读性。
2. `modelPrompt`
   给图片/视频模型的编译后提示词，强调可执行性。

### 2.3 Agent 协作，而不是规则拼装

V2 的核心 Agent：

1. `IdeaPlannerAgent`
2. `ScriptPlannerAgent`
3. `StoryboardAgent`
4. `PromptDirectorAgent`
5. `ContinuityAgent`
6. `CreationRenderService`

本地逻辑不生成故事，只组织上下文并调用 Agent。

## 3. 现有工程可复用部分

### 3.1 可直接复用

1. `PrismFlowProject` / `FlowNode`
   现有 Prisma 模型保留，可直接用于 V2 存储。
2. `TaskRecord`
   现有任务记录模型可用于规划任务与导出任务。
3. `AiRouterService`
   现有大模型路由层可直接复用。
4. `RenderProcessor`
   现有渲染队列可继续用于节点视频生成。
5. `ExportProcessor`
   现有导出队列可继续用于节点视频串联。
6. `WsGateway`
   当前 WebSocket 任务推送机制可直接复用。

### 3.2 需要新增

1. 新的创作模块 `CreationModule`
2. Agent 服务组
3. 新的前端创作面板
4. 新的创作 API 客户端

## 4. 数据模型策略

不先改 Prisma schema，先基于现有字段实现 V2：

### 4.1 PrismFlowProject

字段用途：

1. `videoId`
   绑定当前工作台视频。
2. `name`
   工程标题。
3. `stylePreset`
   改为存放 `projectMeta` JSON：
   - mode
   - intent
   - scriptPlan
   - selectedPreview
   - constraints
4. `scriptText`
   原始 idea 或导入的剧本文本。
5. `status`
   工程级状态。

### 4.2 FlowNode

字段用途：

1. `scriptSegment`
   节点文案/剧情摘要。
2. `prompt`
   节点编译后模型提示词。
3. `branchName`
   存放节点展示标题。
4. `parentNodeId`
   分支或前序节点。
5. `firstFrameUrl`
   当前节点首帧图。
6. `lastFrameUrl`
   当前节点尾帧图或主视觉图。
7. `renderedVideoUrl`
   节点视频输出。
8. `renderStatus`
   节点渲染状态。

V2 额外结构化信息统一放在 `PrismFlowProject.stylePreset` 的 `nodesMeta` 或任务结果里返回，不在第一轮要求迁移数据库。

## 5. 后端模块设计

目录：

1. `server/src/modules/prism-creation/creation.module.ts`
2. `server/src/modules/prism-creation/creation.controller.ts`
3. `server/src/modules/prism-creation/creation.service.ts`
4. `server/src/modules/prism-creation/dto/*`
5. `server/src/modules/prism-creation/services/*`

### 5.1 Services

#### `creation-project.service.ts`
负责：

1. 获取或创建 `PrismFlowProject`
2. 查询节点图
3. 更新工程级元数据

#### `idea-planner.agent.ts`
负责：

1. 根据自由 idea 生成 3 个故事方向
2. 生成首节点候选
3. 输出结构化 JSON

#### `script-planner.agent.ts`
负责：

1. 解析长文本
2. 输出章节结构
3. 输出章节摘要与建议分镜数

#### `storyboard.agent.ts`
负责：

1. 从故事方向/章节生成节点
2. 从当前节点生成下一节点候选

#### `prompt-director.agent.ts`
负责：

1. 将中文分镜描述编译成图片/视频模型 prompt
2. 输出：
   - displayPromptCn
   - imagePromptCn
   - imagePromptModel
   - videoPromptModel
   - continuityNotes

#### `creation-render.service.ts`
负责：

1. 节点图片生成
2. 渲染队列入队
3. 导出队列入队

#### `creation-task.service.ts`
负责：

1. 创建规划任务记录
2. 查询任务记录
3. 推送任务状态

## 6. API 契约

### 6.1 工程

1. `POST /api/prism/creation/videos/:videoId/project/bootstrap`
   获取或创建当前视频对应创作工程。

2. `GET /api/prism/creation/projects/:flowProjectId/graph`
   获取工程节点图和工程元数据。

### 6.2 Idea 模式

1. `POST /api/prism/creation/videos/:videoId/idea-previews`
   输入自由 idea，返回 3 个故事方向。

2. `POST /api/prism/creation/projects/:flowProjectId/previews/:previewId/select`
   选择某个故事方向并创建首节点。

### 6.3 编剧模式

1. `POST /api/prism/creation/videos/:videoId/script-plan`
   输入长文本，返回章节规划。

2. `POST /api/prism/creation/projects/:flowProjectId/chapters/:chapterIndex/create`
   将指定章节创建为节点序列。

### 6.4 节点

1. `PATCH /api/prism/creation/nodes/:nodeId`
   编辑节点标题、文案、提示词。

2. `POST /api/prism/creation/nodes/:nodeId/next-candidates`
   基于当前节点生成下一节点候选。

3. `POST /api/prism/creation/nodes/:nodeId/generate-image`
   为节点生成图片。

4. `POST /api/prism/creation/nodes/:nodeId/render-video`
   为节点生成视频。

### 6.5 导出

1. `POST /api/prism/creation/projects/:flowProjectId/stitch`
   串联已生成的视频节点。

2. `GET /api/prism/creation/tasks/:taskId`
   查询任务记录。

## 7. 前端设计

### 7.1 面板入口

在 `PrismSwitcher` 中恢复创作棱镜，但只挂一个全新的 `CreationPanel`：

1. 顶部模式切换
   - `Idea 模式`
   - `编剧模式`
2. 中部输入区
3. 下部画布区

### 7.2 Idea 模式 UI

包含：

1. `自由想法`
2. `核心冲突`
3. `世界/场景设定`
4. `画面要求`
5. `补充限制`

生成后展示：

1. 三张故事方向卡
2. 每张卡显示：
   - 标题
   - 开场画面
   - 核心冲突
   - 推进逻辑
   - 选择按钮

### 7.3 编剧模式 UI

包含：

1. 长文本输入框
2. 章节解析按钮
3. 章节结构列表
4. 为章节创建节点按钮

### 7.4 节点画布

使用 `@xyflow/react`：

每个节点显示：

1. 标题
2. 分镜文案
3. 中文提示词
4. 图片预览
5. 视频预览状态
6. 操作按钮：
   - 保存
   - 生成图片
   - 生成视频
   - 生成下一节点

## 8. 任务与状态

### 8.1 任务类型

1. `creation_idea_preview`
2. `creation_script_plan`
3. `creation_image`
4. `creation_render`
5. `creation_stitch`

### 8.2 状态

统一沿用：

1. `PENDING`
2. `PROCESSING`
3. `COMPLETED`
4. `FAILED`

并通过 WebSocket 推送：

1. `task:progress`
2. `task:error`
3. `task:complete`

## 9. 测试计划

### 9.1 后端

1. 构建测试
   - `npm run -w server build`
2. 端到端脚本
   - bootstrap 工程
   - 生成 idea previews
   - 选择 preview 创建首节点
   - 生成下一节点
   - 更新节点

### 9.2 前端

1. 构建测试
   - `npm run -w client build`
2. 联调验证
   - 打开创作棱镜
   - 切换模式
   - 生成预览
   - 创建首节点
   - 看到节点画布

## 10. 本轮实现范围

本轮优先实现：

1. 计划文档冻结
2. 后端 Creation V2 模块
3. Idea 模式
4. 编剧模式基础解析
5. 节点画布展示
6. 节点图片生成
7. 节点视频渲染入队
8. 串联导出入队
9. 基础端到端测试脚本

不在本轮强制完成：

1. 自动复杂转场
2. 高级分支合并决策
3. 角色一致性评分仪表盘

这些能力在 V2 主链路跑通后再增强。
