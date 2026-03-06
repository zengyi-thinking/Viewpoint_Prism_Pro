# 知识棱镜改造计划（重写版）

## 1. 文档目的

这份文档不是“功能愿景合集”，而是接下来知识棱镜迭代的执行计划。目标是把现有的知识棱镜从“分析后生成若干资产”，提升为“围绕当前视频形成可持续演进的学习工作台”。

本文档重点解决四个问题：

1. 知识棱镜与 Chat 的职责边界不够清晰。
2. “二次理解”概念过虚，没有明确输入、输出和触发时机。
3. 前后端虽然已有基础能力，但缺少统一的增量流水线和验收标准。
4. 原计划把“背景搜索、图片理解、思维导图、闪卡、同步”并列展开，执行顺序不合理，容易返工。

---

## 2. 现状复盘

### 2.1 当前已经存在的能力

后端已经具备以下基础设施：

- `TranscriptService`：视频转写，支持带时间戳的 transcript。
- `KeyframeService`：关键帧抽取与基础多模态描述。
- `OutlineService`：结构化大纲生成。
- `FlashcardService`：闪卡与 SM-2 复习逻辑。
- `MindmapService`：思维导图生成与导出。
- `CrystalCardService`：晶体卡片生成。
- `ExportService`：同步到 Notion / 飞书。
- `KnowledgeService`：聚合分析、看板快照、结算流程。
- `WsGateway`：知识看板状态和时间轴增量推送。

前端已经具备以下基础组件：

- `KnowledgeBoard`：右侧知识面板容器。
- `RealtimeKnowledgeBoard`：时间轴式实时看板。
- `MindmapViewer`：思维导图视图。
- `OutlinePanel`、`FlashcardsPanel`、`CrystalCardViewer`：资产展示区。

### 2.2 当前的真实短板

现阶段最大的问题不是“功能没有”，而是“能力没有分层”：

- 分析结果更像一次性生成，而不是可持续沉淀的学习资产。
- Chat 的即时回答与知识棱镜的深度产出存在边界模糊。
- 关键帧虽然被抽取，但没有形成稳定的“知识锚点”。
- 背景知识补充没有严格的触发条件，容易演变成无约束搜索。
- 思维导图、闪卡、晶体卡片之间共用同一份浅层摘要，缺少二次推理层。

---

## 3. 重新定义目标

### 3.1 知识棱镜的定位

知识棱镜不是聊天助手的另一个 UI，也不是一个“把视频摘要再排版一次”的导出器。它应当是：

- 以视频为主线的学习资产生产器。
- 以关键帧、转写、用户提问、用户画像为输入的二次理解系统。
- 能把“看视频”沉淀为“可复习、可追溯、可同步”的知识对象。

### 3.2 与 Chat 的职责边界

这个边界必须冻结，否则后面会持续重复建设。

`Chat` 负责：

- 即时问答。
- 基于当前播放上下文的解释和追问。
- 生成临时结果，例如某次问答、某次截图分析、某个快捷动作。

`Knowledge Prism` 负责：

- 将视频分析结果沉淀为长期资产。
- 将重要 Chat 结果注入到时间轴中。
- 形成结构化大纲、闪卡、复习计划、晶体卡片、深度思维导图。
- 负责最终同步与导出。

一句话概括：

- Chat 是“即时交互层”。
- Knowledge Prism 是“学习资产层”。

### 3.3 本次迭代的目标产物

本轮改造完成后，一个视频应至少能稳定产出以下资产：

1. 带关键帧锚点的结构化大纲。
2. 基于二次理解生成的思维导图。
3. 基于核心概念和用户薄弱点生成的闪卡与复习计划。
4. 被注入时间轴的 Q&A 卡片。
5. 可同步到 Notion / 飞书的结构化知识包。

---

## 4. 原计划中不合理的地方与修正

### 4.1 “网络搜索”不应作为默认主流程

原文把网络资讯检索放在主干流程中，这是不合理的。

原因：

- 大多数视频并不需要外部搜索就能完成有效的知识生成。
- 搜索会引入时效性、可信度、配额、延迟和引用管理问题。
- 如果默认接入搜索，会让“二次理解”变成“摘要 + 搜索拼接”，而不是视频本体理解。

修正：

- 搜索只作为“歧义消解 / 术语背景补充”的二级能力。
- 必须由“知识缺口识别”显式触发。
- 必须记录来源、触发原因和置信度，不能直接混入主结论。

### 4.2 “图片理解”不能脱离时间轴上下文

原文把图片理解写成对关键帧做深度分析，这个方向是对的，但描述还不够准确。

修正：

- 分析对象不是“孤立图片”，而是“视频时间轴中的知识锚点帧”。
- 每个关键帧的理解必须绑定：
  - 来源时间点
  - 前后 transcript 片段
  - 所属大纲章节
  - 是否被用户点击 / 收藏 / 提问过

### 4.3 “二次深度理解”不能只是再调一次 LLM

原计划里“二次理解”过于抽象，容易退化成“把 transcript 再喂一遍模型”。

修正：

- 二次理解必须建立在已结构化的一次分析结果之上。
- 输入必须显式包括：
  - transcript segments
  - keyframes
  - outline draft
  - user profile
  - high-signal chat QA
  - optional background facts
- 输出必须显式包括：
  - chapter graph
  - concept graph
  - misconceptions / ambiguity list
  - flashcard candidates
  - mindmap nodes

### 4.4 前端改造不能先于数据模型冻结

原计划把前端增强放在一个单独阶段里，但没有说明依赖。

修正：

- 必须先冻结统一的时间轴 item schema、二次理解结果 schema、同步 payload schema。
- 前端 UI 只消费稳定契约，不直接依赖某个服务的内部返回。

---

## 5. 本次改造后的目标架构

### 5.1 分层模型

整个知识棱镜拆成四层：

1. `Base Analysis Layer`
   - transcript
   - keyframes
   - initial outline

2. `Deep Understanding Layer`
   - keyframe deep context
   - concept extraction
   - ambiguity detection
   - optional background enrichment

3. `Learning Asset Layer`
   - outline blocks
   - QA cards
   - flashcards
   - review plan
   - crystal cards
   - mindmap

4. `Experience Layer`
   - realtime board
   - chapter jump
   - sync/export
   - UI drill-down

### 5.2 主流程

```text
Video
  -> Transcript / Keyframes / Initial Outline
  -> Knowledge Anchors
  -> Deep Understanding
  -> Timeline Assets
  -> Settle / Sync / Export
```

其中：

- `Knowledge Anchors` 指关键帧 + 时间点 + 上下文文本的锚点集合。
- `Deep Understanding` 指对锚点和章节做二次聚合与解释。
- `Timeline Assets` 指所有可在右侧看板中展示和回跳的视频学习资产。

---

## 6. 数据与契约先冻结

这一步必须先做，否则后续仍然会返工。

### 6.1 状态机继续沿用现有定义

当前 [knowledge-board.contract.ts](d:\DevProject\Viewpoint_Prism_Pro\server\src\modules\prism-knowledge\contracts\knowledge-board.contract.ts) 已有：

- `idle`
- `analyzing`
- `streaming`
- `ready`
- `syncing`
- `synced`
- `failed`

这套状态机可以保留，不需要另起一套。

### 6.2 时间轴 item 类型继续沿用现有枚举

当前已有：

- `KEYFRAME_CARD`
- `OUTLINE_BLOCK`
- `QA_CARD`
- `FLASHCARD`
- `REVIEW_PLAN`

建议保留，不再新增“同义不同名”的类型。

### 6.3 需要新增的结构化结果

现有时间轴类型够用，但还缺少“深度理解层”的独立结构。建议新增一个持久化对象，而不是把所有二次理解结果塞到 timeline metadata 里。

建议新增：

- `KnowledgeDeepAnalysis`
  - `id`
  - `videoId`
  - `version`
  - `status`
  - `chapterGraphJson`
  - `conceptGraphJson`
  - `ambiguitiesJson`
  - `backgroundFactsJson`
  - `learningRecommendationsJson`
  - `sourceDigestJson`
  - `createdAt`
  - `updatedAt`

- `FrameInsight`
  - `id`
  - `videoId`
  - `keyframeId`
  - `timestampSec`
  - `ocrText`
  - `visualEntitiesJson`
  - `chartType`
  - `formulaSignalsJson`
  - `codeSignalsJson`
  - `sceneSummary`
  - `chapterHint`
  - `confidence`

设计原则：

- `FrameInsight` 解决单帧理解问题。
- `KnowledgeDeepAnalysis` 解决视频级二次理解问题。
- timeline 只负责展示，不承担所有中间推理数据。

---

## 7. 可执行实施计划

下面的计划以“能连续交付”为原则，按依赖顺序拆分。每个阶段都要求能单独验收。

### 阶段 A：冻结契约与数据模型

目标：

- 固化深度理解所需的输入输出结构。
- 明确 Chat 注入知识棱镜的边界。
- 给后续前后端开发提供稳定接口。

改动范围：

- [server/src/modules/prism-knowledge/contracts/knowledge-board.contract.ts](d:\DevProject\Viewpoint_Prism_Pro\server\src\modules\prism-knowledge\contracts\knowledge-board.contract.ts)
- [server/prisma/schema.prisma](d:\DevProject\Viewpoint_Prism_Pro\server\prisma\schema.prisma)
- [docs/api-contract-chat-prisms.md](d:\DevProject\Viewpoint_Prism_Pro\docs\api-contract-chat-prisms.md)

具体任务：

1. 增加 `KnowledgeDeepAnalysis` 与 `FrameInsight` 数据模型。
2. 明确 `KnowledgeService.getBoardSnapshot()` 返回里哪些字段来自基础层，哪些字段来自深度层。
3. 明确 `QA_CARD` 的注入来源只能是：
   - 当前视频会话
   - `activePrism = knowledge`
   - 被显式标记为“写入知识时间轴”
4. 在接口契约中新增：
   - `GET /videos/:videoId/deep-analysis`
   - `POST /videos/:videoId/deep-analysis/regenerate`
   - `GET /videos/:videoId/background-facts`

验收标准：

- Prisma schema 可迁移。
- 新接口契约写入文档。
- 前后端不需要依赖服务内部实现细节即可理解深度分析结果。

工期建议：

- 1 天

---

### 阶段 B：关键帧锚点深度化

目标：

- 让关键帧从“截图”升级为“知识锚点”。

改动范围：

- [server/src/modules/prism-knowledge/services/keyframe.service.ts](d:\DevProject\Viewpoint_Prism_Pro\server\src\modules\prism-knowledge\services\keyframe.service.ts)
- 新建 `frame-insight.service.ts`
- [server/src/modules/prism-knowledge/knowledge.service.ts](d:\DevProject\Viewpoint_Prism_Pro\server\src\modules\prism-knowledge\knowledge.service.ts)

具体任务：

1. 在关键帧抽取完成后，为每个关键帧生成 `FrameInsight`。
2. 单帧分析至少输出：
   - OCR 文本
   - 视觉摘要
   - 帧类型判断：PPT / 白板 / 图表 / 代码 / 场景切换
   - 所属章节提示
   - 置信度
3. 单帧分析输入必须拼装：
   - 当前帧图片
   - 帧前后 transcript 片段
   - 当前视频标题
4. 将关键帧 timeline item 的 `metadata` 中补充：
   - `frameInsightId`
   - `chapterHint`
   - `visualType`

不做的事：

- 不在这一阶段直接做联网搜索。
- 不在这一阶段做复杂知识图谱。

验收标准：

- 新分析一次视频后，所有关键帧都有 `FrameInsight`。
- `KEYFRAME_CARD` 能展示“这是为什么重要”的解释，而不是只有描述。
- 后续 outline / mindmap 可以消费这些帧洞察。

工期建议：

- 2 天

---

### 阶段 C：二次理解引擎

目标：

- 真正建立知识棱镜区别于 Chat 的“深度层”。

改动范围：

- 新建 `deep-understanding.service.ts`
- [server/src/modules/prism-knowledge/knowledge.service.ts](d:\DevProject\Viewpoint_Prism_Pro\server\src\modules\prism-knowledge\knowledge.service.ts)
- [server/src/modules/prism-knowledge/knowledge.controller.ts](d:\DevProject\Viewpoint_Prism_Pro\server\src\modules\prism-knowledge\knowledge.controller.ts)

输入：

- transcript segments
- keyframes
- frame insights
- initial outline
- user profile
- relevant QA cards

输出：

- 章节图 `chapterGraph`
- 概念图 `conceptGraph`
- 易混淆点列表 `ambiguities`
- 学习建议 `learningRecommendations`
- 后续资产生成所需的结构化中间结果

具体任务：

1. 新建 `generateDeepAnalysis(videoId)` 主流程。
2. 将原本分散在大纲、思维导图、闪卡服务里的二次推理提示词收拢到这一层。
3. 给二次理解增加版本号，避免后续重复生成时无法比较。
4. 让 `settle` 流程优先消费 `KnowledgeDeepAnalysis`，而不是再次从 transcript 生推。

关键约束：

- 如果二次理解失败，不应破坏基础分析结果。
- 基础分析可用时，知识看板仍可展示基础资产。
- 深度层要能单独重跑。

验收标准：

- 单独触发深度分析接口时，能生成一份持久化的 `KnowledgeDeepAnalysis`。
- `mindmap`、`flashcards`、`crystal cards` 可以切换为消费深度层结果。
- 与 Chat 回答相比，深度分析结果更结构化、更稳定。

工期建议：

- 2 到 3 天

---

### 阶段 D：背景知识补充改为“受控增强”

目标：

- 把搜索从“默认主流程”改成“按需增强器”。

改动范围：

- 新建 `background-knowledge.service.ts`
- [server/src/modules/prism-knowledge/services/deep-understanding.service.ts](d:\DevProject\Viewpoint_Prism_Pro\server\src\modules\prism-knowledge\services\deep-understanding.service.ts)

触发条件：

- 检测到歧义实体。
- 检测到专业术语但 transcript / keyframe 无法自洽解释。
- 用户画像要求更多背景补充，例如初学者模式。

具体任务：

1. 实现 `detectKnowledgeGaps()`。
2. 对每个 gap 生成：
   - `query`
   - `reason`
   - `expectedFactType`
3. 搜索结果必须保留：
   - `source`
   - `retrievedAt`
   - `quote/snippet`
   - `confidence`
4. 背景知识只能作为补充说明进入：
   - `backgroundFacts`
   - `ambiguities`
   - `chapter notes`

明确限制：

- 不把搜索结果直接并入 transcript。
- 不把搜索结果伪装成视频原内容。
- 不做“全视频无差别联网扩写”。

验收标准：

- 关闭搜索时，主流程仍能完整运行。
- 打开搜索时，只对少量高价值知识缺口进行补充。
- 最终产物中能明确区分“视频内容”和“外部补充背景”。

工期建议：

- 1 到 2 天

---

### 阶段 E：资产生成重构

目标：

- 让各资产共享深度层结果，而不是各自重新“猜一遍”。

改动范围：

- [server/src/modules/prism-knowledge/services/outline.service.ts](d:\DevProject\Viewpoint_Prism_Pro\server\src\modules\prism-knowledge\services\outline.service.ts)
- [server/src/modules/prism-knowledge/services/mindmap.service.ts](d:\DevProject\Viewpoint_Prism_Pro\server\src\modules\prism-knowledge\services\mindmap.service.ts)
- [server/src/modules/prism-knowledge/services/flashcard.service.ts](d:\DevProject\Viewpoint_Prism_Pro\server\src\modules\prism-knowledge\services\flashcard.service.ts)
- [server/src/modules/prism-knowledge/services/crystal-card.service.ts](d:\DevProject\Viewpoint_Prism_Pro\server\src\modules\prism-knowledge\services\crystal-card.service.ts)

具体任务：

1. `OutlineService`
   - 生成章节化大纲。
   - 每个章节挂接关键帧锚点。
   - 允许插入背景补充说明和 QA 注记。

2. `MindmapService`
   - 输入改为 `chapterGraph + conceptGraph`。
   - 节点必须带：
     - `title`
     - `summary`
     - `timestampSec?`
     - `chapterId?`
     - `relatedKeyframeId?`
   - 保证前端可以继续拖拽与双击跳转。

3. `FlashcardService`
   - 闪卡来源优先使用“核心概念 + 易错点 + 用户问答空白点”。
   - 为每张闪卡标记来源章节和难度。

4. `CrystalCardService`
   - 重点突出“知识收束感”，不要只做花哨卡片。
   - 卡片应当能解释：
     - 为什么这一帧重要
     - 它在整节中的作用
     - 用户曾经问过什么相关问题

验收标准：

- 四类资产共享同一份深度层中间结果。
- 资产之间能相互追踪章节、时间点、关键帧。
- 同一个视频重复生成时，质量波动明显降低。

工期建议：

- 3 天

---

### 阶段 F：Knowledge Board 前端升级

目标：

- 让右侧看板真正变成“学习工作台”，而不是多个 tab 的堆叠容器。

改动范围：

- [client/src/components/prisms/knowledge/KnowledgeBoard.tsx](d:\DevProject\Viewpoint_Prism_Pro\client\src\components\prisms\knowledge\KnowledgeBoard.tsx)
- `RealtimeKnowledgeBoard.tsx`
- `MindmapViewer.tsx`
- `OutlinePanel.tsx`
- `FlashcardsPanel.tsx`
- `CrystalCardViewer.tsx`
- [client/src/services/knowledge.api.ts](d:\DevProject\Viewpoint_Prism_Pro\client\src\services\knowledge.api.ts)

具体任务：

1. 看板顶部
   - 保留 `Analyze`、`Settle`、`Sync to Notion`、`Sync to 飞书`
   - 新增 `Deep Analyze` 或 `Regenerate Deep Analysis`
   - 展示当前 board state

2. 实时时间轴
   - `KEYFRAME_CARD`、`OUTLINE_BLOCK`、`QA_CARD`、`FLASHCARD` 按生成顺序插入
   - 点击时间戳可回跳视频
   - 若存在 `frameInsight`，展示“这一帧为何重要”

3. 思维导图
   - 保持拖拽、缩放、双击跳转
   - 加入节点详情抽屉或浮层
   - 节点展示来源章节与关键帧

4. 大纲与闪卡
   - 大纲按章节分块，附关键帧缩略图
   - 闪卡标明来源章节和推荐复习时间

5. 晶体卡片
   - 以“总结型学习卡片”为主，不再只做视觉卡片
   - 支持导出图片

验收标准：

- 用户在一个面板中即可完成：分析、查看、追问沉淀、结算、同步。
- 所有可跳转资产都能回跳视频时间点。
- 深度层结果能在 UI 中被用户感知，而不是只停留在后端。

工期建议：

- 2 到 3 天

---

### 阶段 G：与 Chat 的正式联动

目标：

- 建立“Chat 产生即时价值，Knowledge 棱镜负责沉淀”的闭环。

改动范围：

- [server/src/modules/chat/chat.service.ts](d:\DevProject\Viewpoint_Prism_Pro\server\src\modules\chat\chat.service.ts)
- [server/src/modules/prism-knowledge/knowledge.service.ts](d:\DevProject\Viewpoint_Prism_Pro\server\src\modules\prism-knowledge\knowledge.service.ts)
- Chat 前端会话层

具体任务：

1. 只允许以下对话写入 `QA_CARD`：
   - 当前会话绑定当前播放视频
   - `activePrism = knowledge`
   - 用户问题不是纯闲聊

2. `QA_CARD` 写入内容包含：
   - question
   - conciseAnswer
   - timestampSec
   - relatedKeyframeId?
   - sourceSessionId

3. 对话回答和知识沉淀解耦：
   - Chat 回复可以更自由
   - 写入知识时间轴的 QA 必须更短、更结构化

验收标准：

- 用户在 Chat 中提出高价值问题后，时间轴中自动出现相应 `QA_CARD`。
- 切换视频时不会误注入到上一个视频。
- Knowledge 资产和聊天记录之间可互相追踪，但不互相污染。

工期建议：

- 1 到 2 天

---

### 阶段 H：结算、同步与导出

目标：

- 把“学习过程”稳定收束成“可带走的知识包”。

改动范围：

- [server/src/modules/prism-knowledge/services/export.service.ts](d:\DevProject\Viewpoint_Prism_Pro\server\src\modules\prism-knowledge\services\export.service.ts)
- [server/src/modules/prism-knowledge/knowledge.service.ts](d:\DevProject\Viewpoint_Prism_Pro\server\src\modules\prism-knowledge\knowledge.service.ts)

具体任务：

1. `settle`
   - 固化最终大纲
   - 固化闪卡与复习计划
   - 固化精选晶体卡片
   - 生成导出摘要

2. Notion / 飞书同步
   - 页面结构至少包含：
     - 标题
     - 视频基本信息
     - 章节大纲
     - 关键帧
     - Q&A 注入
     - 闪卡与复习计划
   - 同步结果记录到 board state 和导出记录中

3. 导出格式
   - markdown
   - notion
   - feishu
   - 可选 zip 包

验收标准：

- 用户点击结算后，得到一套稳定的最终知识资产。
- 同步失败不会影响本地资产。
- 同步成功后可在 board state 中看到 `synced`。

工期建议：

- 2 天

---

## 8. 建议的实施顺序

不要并行铺太多面，按下面顺序推进：

1. 阶段 A：契约与数据模型
2. 阶段 B：关键帧锚点深度化
3. 阶段 C：二次理解引擎
4. 阶段 E：资产生成重构
5. 阶段 F：前端看板升级
6. 阶段 G：Chat 联动
7. 阶段 D：背景知识受控增强
8. 阶段 H：结算与同步

原因：

- 不先冻结 schema，前端和二次理解都会返工。
- 不先做深度层，思维导图/闪卡/晶体卡片仍会是浅层重复生成。
- 搜索应后置，否则会把问题复杂度抬高。

---

## 9. API 变更建议

建议在现有 [knowledge.controller.ts](d:\DevProject\Viewpoint_Prism_Pro\server\src\modules\prism-knowledge\knowledge.controller.ts) 基础上新增以下接口：

- `POST /api/prism/knowledge/videos/:videoId/deep-analysis/regenerate`
- `GET /api/prism/knowledge/videos/:videoId/deep-analysis`
- `GET /api/prism/knowledge/videos/:videoId/background-facts`

建议调整以下现有接口语义：

- `POST /videos/:videoId/analyze`
  - 只负责基础分析
  - 可选参数中增加 `includeDeepAnalysis?: boolean`

- `POST /videos/:videoId/settle`
  - 明确依赖基础资产或深度资产
  - 返回最终结算摘要

---

## 10. 验收清单

### 功能验收

1. 上传并分析一个视频后，能看到 transcript、关键帧、大纲基础结果。
2. 触发深度分析后，能生成 `KnowledgeDeepAnalysis`。
3. 关键帧具备解释性洞察，而不是只有截图。
4. 思维导图比当前版本更细，并能稳定跳转视频时间点。
5. Chat 中的知识性问答可以沉淀为 `QA_CARD`。
6. 结算后能导出结构化大纲、闪卡和复习计划。
7. Sync to Notion / 飞书能带着章节和关键帧同步，而不是只有纯文本。

### 技术验收

1. 深度分析可以单独重跑，不破坏基础资产。
2. 背景搜索可开关，不影响主流程。
3. UI 只消费稳定契约，不依赖服务内部拼接逻辑。
4. WebSocket 增量事件可以驱动时间轴持续追加。

### 质量验收

1. 思维导图节点密度高于当前版本，但不冗余。
2. 闪卡不再只是摘要改写，而是围绕概念与误区。
3. 晶体卡片有明确知识价值，而不是只偏展示。
4. Chat 与 Knowledge 的职责边界在代码和交互上都能体现。

---

## 11. 本文档对应的首批落地任务

如果要马上进入开发，建议先开这 5 个任务：

1. Prisma 新增 `KnowledgeDeepAnalysis` 与 `FrameInsight`。
2. `KeyframeService` 接入 `FrameInsight` 生成流程。
3. 新建 `DeepUnderstandingService`，输出统一 JSON 结构。
4. `MindmapService` 与 `FlashcardService` 改为消费深度层。
5. `KnowledgeBoard` 增加 deep analysis 的状态展示和触发按钮。

这 5 项完成后，知识棱镜会真正进入“从基础分析走向深度学习资产生产”的阶段，而不是继续在现有能力上做零散叠加。
