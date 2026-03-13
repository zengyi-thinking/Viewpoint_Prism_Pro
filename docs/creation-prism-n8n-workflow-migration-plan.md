# 创作棱镜对话式重构与 n8n 视频工作流迁移方案

## 1. 文档目标

本文档用于重新定义 `Creation Prism` 的目标形态，并指导将 `docs/n8n工作流视频稿.md` 与 `n8n-seedance2.0` 中的工作流能力迁移到当前工程。

这次重构不是把创作棱镜做成“更强的提示词编辑器”，而是要做成：

1. 以对话为入口的故事生成与导演控制台
2. 以自动化生产链路为核心的漫剧视频制作工作台
3. 以最终输出视频为目标，而不是只输出提示词、分镜图或素材包

核心变化：

1. 左侧原有 `idea/编剧表单` 将被预设对话框替代
2. 用户通过多轮聊天逐步形成：
   - 故事剧本
   - 艺术风格
   - 拆分偏好
   - 角色设定
   - 节奏与章节结构
3. 系统根据对话上下文自动汇总并进入生产流程
4. 最终不仅导出中间资产，还要调用视频模型产出视频片段，并串联成最终视频

参考材料：

1. `docs/n8n工作流视频稿.md`
2. `n8n-seedance2.0/seedance2.0漫剧-主工作流.json`
3. `n8n-seedance2.0/seedance2.0漫剧-文生图.json`
4. `n8n-seedance2.0/seedance2.0漫剧-生成分镜图片.json`
5. `n8n-seedance2.0/seedance2.0漫剧-生成分镜图片-批量.json`
6. `client/src/components/workbench/ChatDock.tsx`
7. `client/src/components/prisms/creation/CreationCanvas.tsx`
8. `server/src/modules/prism-creation/*`
9. `server/src/infrastructure/ai-router/providers/seedance.provider.ts`
10. `server/src/infrastructure/ai-router/providers/openai.provider.ts`

---

## 2. 新的产品定义

## 2.1 创作棱镜的主入口必须是“对话式导演台”

创作棱镜的第一屏不应该再是：

1. 表单输入 idea
2. 表单输入剧本
3. 然后手动点“生成首节点”

而应该是：

1. 系统预设一个创作对话框
2. 助手主动引导用户完成故事构思
3. 对话过程中自动归纳结构化创作信息
4. 对话收束后生成正式剧本与章节结构

也就是说，用户真正面对的是：

`创作对话 -> 剧本定稿 -> 自动分镜与资产生成 -> 视频渲染 -> 成片导出`

## 2.2 创作棱镜的最终目标必须是“产出视频”

当前很多设计仍然停留在：

1. 输出节点
2. 输出提示词
3. 输出图片
4. 输出分镜参考

这些都只是中间产物。

新的产品目标必须明确为：

1. 对话收集创作需求
2. 自动形成可执行剧本
3. 自动生成角色、场景、分镜、提示词、音色映射
4. 自动批量生成视频片段
5. 自动拼接成最终视频
6. 用户可在需要时回到中间层微调

所以创作棱镜不是“帮用户准备视频生成素材”，而是“帮用户实际做出视频”。

---

## 3. 对 n8n 工作流的重新定位

视频中的 n8n 工作流，本质上提供的是一个“中间生产层”：

1. 场景识别
2. 角色与场景资产生成
3. 分镜拆解
4. 台词识别
5. 文戏/武戏分流
6. 音色映射
7. 分镜图生成
8. 提示词压缩与整理

这套能力非常重要，但它本身还不是最终产品形态。

在你的项目里，它应该被放在：

`对话式编剧层` 和 `最终视频渲染层` 之间。

新的完整链路应为：

1. 对话式需求采集
2. 故事与章节生成
3. 场景/角色/分镜中间生产
4. 视频片段渲染
5. 成片拼接与导出

---

## 4. 目标工作流的完整链路

新的 `Creation Prism` 应按以下 8 个阶段运行。

## 4.1 阶段 1：对话式创作采集

用户不再填写左侧表单，而是直接与创作助手聊天。

系统在对话中主动收集：

1. 故事题材
2. 主角设定
3. 核心冲突
4. 世界观/场景设定
5. 艺术风格
6. 分镜拆分偏好
7. 节奏偏好
8. 视频时长目标
9. 是否偏文戏/偏武戏
10. 是否需要配音/旁白/角色说话

系统要把多轮聊天自动整理为：

1. `storyIntent`
2. `storyOutline`
3. `scriptDraft`
4. `visualStyle`
5. `storyboardPreference`
6. `renderGoal`

## 4.2 阶段 2：剧本定稿与章节结构

在对话达到足够信息密度后，系统生成：

1. 主故事梗概
2. 正式剧本
3. 章节结构
4. 每章目标
5. 每章推荐镜头数

这里必须支持：

1. 用户继续聊天修正剧本
2. 用户要求重写某一章
3. 用户要求改风格但不改故事
4. 用户要求改分镜偏好但不改剧情

## 4.3 阶段 3：场景规划

基于定稿剧本，系统执行与 n8n 主工作流一致的场景拆解：

1. 识别场景
2. 标注时间段
3. 识别场景中的角色
4. 为每个场景生成摘要
5. 为整段故事生成全局摘要

## 4.4 阶段 4：角色与场景资产生成

系统根据场景规划批量生成：

1. 角色设定图
2. 场景设定图

要求：

1. 角色保持跨章节一致
2. 场景保持跨镜头一致
3. 所有资产可以反向回写到后续视频渲染

## 4.5 阶段 5：分镜片段设计

系统按场景生成：

1. 多个视频片段
2. 每个片段对应多个子镜头
3. 每个片段的镜头目标、运镜、节奏、台词关系

这里既要支持：

1. 自动拆分

也要支持：

1. 用户聊天追加偏好
2. 用户要求“这一章动作更强”
3. 用户要求“这一段拆得更细”

## 4.6 阶段 6：提示词、音色与分镜图生产

这一阶段完整复刻 n8n 工作流中最关键的中间层：

1. 文戏/武戏判定
2. 视频提示词分流优化
3. 台词识别
4. 角色音色匹配
5. 分镜参考图生成
6. 提示词压缩
7. 引用关系整理

## 4.7 阶段 7：视频片段渲染

这里是本次文档与上一版最大的变化。

目标不再停留在“导出给别的平台使用”，而是系统内部直接根据中间产物生成视频：

1. 角色图/场景图/分镜图作为视觉参考
2. 视频提示词作为渲染输入
3. 角色音色/旁白文本进入音频链路
4. 每个片段单独生成视频

## 4.8 阶段 8：成片拼接与导出

系统自动：

1. 按章节与顺序拼接片段
2. 混入旁白/TTS
3. 混入 BGM
4. 输出最终视频
5. 同时保留可回溯工程

---

## 5. 当前工程中需要移除、降级或替换的部分

## 5.1 前端：需要被替换的主入口

当前核心文件：

1. `client/src/components/prisms/creation/CreationCanvas.tsx`

当前左侧区域是：

1. `idea 模式`
2. `编剧模式`
3. 大量表单
4. 节点导演卡

这部分要被整体替换。

### 必须移除的主入口能力

1. 左侧 `idea/conflict/setting/visualGoal/constraints` 表单
2. 左侧 `scriptText` 文本框作为默认入口
3. 先选方向卡再建首节点的主流程
4. 默认暴露完整节点字段编辑

### 新的替代方案

左侧区域改成 `创作对话区`：

1. 复用 `ChatDock` 的消息流交互风格
2. 但不再只是通用聊天，而是 `Creation Copilot`
3. 预设系统引导问题
4. 在对话顶部显示当前已采集信息
5. 对话结束后生成：
   - 故事剧本
   - 艺术风格
   - 拆分偏好
   - 章节结构

### 交互要求

对话区应具备：

1. 用户消息
2. 系统追问
3. 自动总结卡
4. “确认生成剧本”按钮
5. “重写本章”按钮
6. “继续补充风格”按钮

## 5.2 前端：需要降级到二级能力的部分

以下内容保留，但不再是首页主链路：

1. React Flow 无限画布
2. 单节点编辑
3. 单节点生图
4. 单节点生视频
5. 生成下一节点候选
6. 分支/合并/质量评分

它们应被放到：

1. `高级编辑模式`
2. `导演画布模式`

而不是默认让用户先看到。

## 5.3 前端：需要新增的一级面板

创作棱镜新界面建议分为两栏：

### 左栏：对话式创作区

用于：

1. 收集需求
2. 修正剧本
3. 调整风格
4. 调整分镜偏好
5. 局部重写章节

### 右栏：生产状态区

分阶段显示：

1. 故事定稿
2. 章节结构
3. 场景规划
4. 角色资产
5. 场景资产
6. 分镜片段
7. 视频片段生成状态
8. 成片导出状态

也就是说，右边不再先是节点图，而是 `创作生产流水线`。

---

## 6. 对话式创作系统设计

## 6.1 为什么必须用对话，而不是表单

因为用户真实创作时通常不是一次性想清楚：

1. 故事完整内容
2. 分章结构
3. 风格词
4. 运镜偏好

而是通过交流逐步澄清。

所以系统应该把对话当成创作输入层，而不是把用户逼成 prompt 工程师。

## 6.2 对话系统需要产出的结构化结果

建议新增 `CreationConversationState`：

```json
{
  "intent": "",
  "genre": "",
  "worldSetting": "",
  "mainCharacters": [],
  "conflict": "",
  "visualStyle": "",
  "storyboardPreference": "",
  "targetDurationSec": 0,
  "chapterCount": 0,
  "scriptDraft": "",
  "chapterOutline": []
}
```

## 6.3 对话系统需要的能力

### A. 上下文归纳

系统每轮对话后都要维护：

1. 已确认信息
2. 未确认信息
3. 需要继续追问的问题

### B. 剧本生成

当信息足够时，系统自动输出：

1. 梗概
2. 正式剧本
3. 分章节文本

### C. 增量修订

用户可以说：

1. “第二章节奏再快一点”
2. “把整体风格改成吉卜力”
3. “把主角年龄改小一点”
4. “打斗戏多一点”

系统只局部更新相关结构，不推翻全部内容。

## 6.4 对话入口的 UI 替换要求

当前可参考：

1. `client/src/components/workbench/ChatDock.tsx`

但需要做创作专版：

1. 标题从“对话窗口”改为“创作导演台”
2. 快捷指令改为：
   - `帮我构思故事`
   - `生成完整剧本`
   - `按章节拆分`
   - `强化动作戏`
   - `改艺术风格`
3. 消息 metadata 中要能标记：
   - 已确认设定
   - 当前剧本版本
   - 当前章节版本
   - 是否已可进入生产

---

## 7. n8n 工作流中需要完整复刻的部分

## 7.1 场景识别与物料提取

必须完整复刻：

1. 按 `地点 + 时间段` 拆场景
2. 提取当前场景的主要角色
3. 为角色和场景建立固定素材

## 7.2 双摘要结构

必须保留：

1. 整体故事摘要
2. 每个场景摘要

这一步不能省，因为它决定后续分镜和视频生成的上下文质量。

## 7.3 分镜片段与子镜头

必须保留：

1. 场景 -> 片段
2. 片段 -> 子镜头
3. 台词与角色映射

## 7.4 文戏/武戏路由

必须保留：

1. 片段类型判断
2. 文戏保留精细描述
3. 武戏采用更开放的动态提示词

## 7.5 音色映射

必须保留：

1. 角色音色绑定
2. 声音预设复用

第一期可以先只做角色-音色映射，不强制做完整口型同步。

## 7.6 分镜图连续生成

必须保留：

1. 上一张分镜图作为下一张参考
2. 保持色调和镜头连续性

## 7.7 提示词压缩

必须保留：

1. 完整视频提示词
2. 压缩版视频提示词

因为视频渲染链路仍可能受到字数限制。

---

## 8. 新的创作棱镜目标架构

## 8.1 顶层架构

新的创作棱镜应拆成 4 层：

### 第一层：对话式创作层

负责：

1. 采集需求
2. 生成剧本
3. 生成章节
4. 维护对话上下文

### 第二层：中间生产层

复刻 n8n 工作流能力：

1. 场景识别
2. 角色资产生成
3. 场景资产生成
4. 分镜拆解
5. 台词识别
6. 音色映射
7. 分镜图生成

### 第三层：视频渲染层

负责：

1. 根据资产和提示词生成视频片段
2. 管理片段渲染任务
3. 支持失败重试
4. 支持局部重渲染

### 第四层：成片组装层

负责：

1. 拼接视频片段
2. 混入音频
3. 导出视频
4. 保留工程记录

## 8.2 从“PromptDirectorAgent”升级到完整服务组

建议新增或重构为以下服务：

1. `creation-chat-director.service.ts`
2. `story-conversation-agent.ts`
3. `script-synthesizer.agent.ts`
4. `scene-planner.agent.ts`
5. `character-asset.service.ts`
6. `scene-asset.service.ts`
7. `storyboard-segment.agent.ts`
8. `dialogue-voice-mapper.agent.ts`
9. `video-prompt-compiler.agent.ts`
10. `prompt-compression.agent.ts`
11. `storyboard-frame.service.ts`
12. `segment-video-render.service.ts`
13. `final-video-compose.service.ts`

---

## 9. 后端需要重构的部分

## 9.1 `CreationService` 的主职责要改

当前 `CreationService` 主要围绕：

1. bootstrap
2. idea preview
3. script plan
4. create chapter nodes
5. next candidates
6. generate image
7. render node video

新的主职责应改为：

1. `bootstrapConversationProject`
2. `appendCreationMessage`
3. `summarizeConversationState`
4. `generateScriptFromConversation`
5. `reviseChapterFromConversation`
6. `planScenes`
7. `generateAssets`
8. `generateStoryboardSegments`
9. `compileVideoPrompts`
10. `generateStoryboardFrames`
11. `renderSegmentVideos`
12. `composeFinalVideo`

## 9.2 旧能力的处理

### 从主链路移除

1. `IdeaPlannerAgent`
2. `idea-previews`
3. `select preview`
4. `next-candidates` 默认交互

### 保留为高级模式

1. `PATCH /nodes/:nodeId`
2. `POST /nodes/:nodeId/generate-image`
3. `POST /nodes/:nodeId/render-video`
4. 分支/合并/评分相关接口

## 9.3 数据模型建议

第一期可以继续把数据放在 `PrismFlowProject.stylePreset` 中，但语义上必须升级为 `projectMeta`。

建议结构如下：

```json
{
  "version": "v4",
  "mode": "conversation_production",
  "conversationState": {},
  "scriptPackage": {
    "storySummary": "",
    "scriptDraft": "",
    "chapters": []
  },
  "scenePlan": [],
  "characterAssets": [],
  "sceneAssets": [],
  "storyboardSegments": [],
  "voiceCasting": [],
  "renderTasks": [],
  "finalVideo": {
    "status": "PENDING",
    "videoUrl": ""
  }
}
```

如果进入第二期，建议正式落表：

1. `CreationConversation`
2. `CreationScene`
3. `CreationCharacterAsset`
4. `CreationSceneAsset`
5. `CreationStoryboardSegment`
6. `CreationVoiceCasting`
7. `CreationRenderClip`
8. `CreationFinalVideo`

---

## 10. API 重构方案

## 10.1 对话层 API

新增：

1. `POST /api/prism/creation/projects/:projectId/conversation/bootstrap`
2. `POST /api/prism/creation/projects/:flowProjectId/conversation/messages`
3. `GET /api/prism/creation/projects/:flowProjectId/conversation/state`
4. `POST /api/prism/creation/projects/:flowProjectId/conversation/generate-script`
5. `POST /api/prism/creation/projects/:flowProjectId/conversation/revise-chapter`

## 10.2 中间生产层 API

新增：

1. `POST /api/prism/creation/projects/:flowProjectId/plan-scenes`
2. `POST /api/prism/creation/projects/:flowProjectId/generate-character-assets`
3. `POST /api/prism/creation/projects/:flowProjectId/generate-scene-assets`
4. `POST /api/prism/creation/projects/:flowProjectId/generate-storyboard-segments`
5. `POST /api/prism/creation/projects/:flowProjectId/compile-video-prompts`
6. `POST /api/prism/creation/projects/:flowProjectId/generate-storyboard-frames`

## 10.3 视频产出层 API

新增：

1. `POST /api/prism/creation/projects/:flowProjectId/render-segment-videos`
2. `POST /api/prism/creation/projects/:flowProjectId/compose-final-video`
3. `GET /api/prism/creation/projects/:flowProjectId/final-video`

## 10.4 高级编辑层 API

保留：

1. `GET /api/prism/creation/projects/:flowProjectId/graph`
2. `PATCH /api/prism/creation/nodes/:nodeId`
3. `POST /api/prism/creation/nodes/:nodeId/render-video`

说明：

1. 新架构中项目级 API 是主入口
2. 节点级 API 是高级能力

---

## 11. 视频生成链路要求

## 11.1 最终产物必须包含视频

新的创作棱镜最终至少要产出：

1. 每个片段的视频
2. 最终拼接成片

中间资产仍然保留，但不再是终点。

## 11.2 视频生成输入应来自中间生产链

每个视频片段的渲染输入建议来自：

1. 当前片段的视频 prompt
2. 当前片段的分镜参考图
3. 角色设定图
4. 场景设定图
5. 可选首帧/尾帧
6. 文戏/武戏策略标签

## 11.3 视频生成后的拼接链路

系统应支持：

1. 片段渲染完成后写入工程
2. 自动按章节顺序拼接
3. 混入 TTS/旁白/BGM
4. 导出最终视频

## 11.4 为什么这一步不能留给外部平台手工做

因为你已经明确创作棱镜的定位是“生成视频”，那就不能停在“用户再去别的平台手工粘贴 prompt”。

这会直接破坏产品闭环。

---

## 12. 供应商接入方案调整

## 12.1 新目标

创作棱镜主链路改为统一接入新的中转商：

1. `https://ai.t8star.cn`

当前工程大量逻辑以硅基流动为默认语义，但你已经明确希望迁移到新的中转商。

因此新的原则是：

1. 前台不再强调“硅基流动”
2. 后台默认通过统一中转商访问模型
3. 创作棱镜主链路只暴露一个供应商配置概念

## 12.2 现有 provider 的处理策略

### `SeedanceProvider`

当前它封装了：

1. LLM
2. ASR
3. Image Gen
4. Video Gen
5. TTS
6. Voice Clone

它的很多逻辑仍可复用，但命名与产品语义要降权。

处理建议：

1. 不立即删除 `SeedanceProvider`
2. 把它降为兼容 provider
3. 创作棱镜新主链路优先走新的 `TransitProvider` 或增强版 `OpenAIProvider`

### `OpenAIProvider`

它已经支持：

1. LLM_CHAT
2. MULTIMODAL
3. IMAGE_GEN
4. TTS

建议：

1. 扩展为创作棱镜的主 provider
2. 优先读取新的创作专用环境变量

## 12.3 环境变量建议

不要把真实 key 写入仓库。统一改为环境变量：

1. `CREATION_AI_BASE_URL=https://ai.t8star.cn`
2. `CREATION_AI_API_KEY=***`
3. `CREATION_AI_CHAT_MODEL=...`
4. `CREATION_AI_VISION_MODEL=...`
5. `CREATION_AI_IMAGE_MODEL=...`
6. `CREATION_AI_VIDEO_MODEL=...`
7. `CREATION_AI_TTS_MODEL=...`

## 12.4 代码调整点

需要调整：

### 后端

1. `server/src/infrastructure/ai-router/providers/openai.provider.ts`
2. `server/src/infrastructure/ai-router/providers/seedance.provider.ts`
3. `server/src/infrastructure/ai-router/ai-router.service.ts`
4. `server/prisma/schema.prisma`

### 前端

1. `client/src/app/(dashboard)/settings/page.tsx`
2. `client/src/services/settings.api.ts`

## 12.5 产品层面的最终表现

用户在创作棱镜里只看到：

1. 创作引擎已连接
2. 当前模型链路可用于：
   - 对话编剧
   - 生图
   - 生视频
   - 语音

而不应该看到一堆 provider 名称切换。

---

## 13. 需要明确移除的用户体验负担

以下内容必须从主链路中移除：

1. 左侧多个创意表单字段
2. 先选方向卡再建首节点
3. 用户先理解节点图再开始创作
4. 用户手工一个节点一个节点点生图
5. 用户最后自己拿 prompt 去外部平台生成视频

以下内容保留，但作为高级模式：

1. 节点画布
2. prompt 手工编辑
3. 分支合并
4. 单节点渲染
5. 质量评分
6. 预检

---

## 14. 最终产品形态

改造完成后的创作棱镜应呈现为：

1. 用户进入创作棱镜，看到的是对话式导演台
2. 系统通过多轮聊天帮用户逐步明确故事、风格、章节和镜头偏好
3. 系统自动生成正式剧本与章节结构
4. 系统自动识别场景和角色
5. 系统自动生成角色图、场景图、分镜图、视频提示词和音色映射
6. 系统直接调用视频模型生成片段视频
7. 系统自动拼接成最终视频
8. 用户如需深度微调，再进入高级节点画布

这时创作棱镜才真正符合你的目标：  
不是“帮用户准备视频生成材料”，而是“帮助用户通过对话把视频做出来”。

---

## 15. 推荐的下一步

基于这版文档，建议下一步直接做下面两件事之一：

1. 先继续写一份 `对话式创作棱镜 API 与数据结构详细设计`
2. 直接开始改代码，第一步先把 [CreationCanvas.tsx](D:/DevProject/Viewpoint_Prism_Pro/client/src/components/prisms/creation/CreationCanvas.tsx) 左侧表单替换成创作对话区，并设计 `conversation state`

