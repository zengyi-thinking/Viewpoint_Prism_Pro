# 衍射棱镜参考工程深度分析与调整方案

## 1. 分析目标

本报告基于 `reference/AiToEarn` 与 `reference/baoyu-skills` 两个参考工程，分析它们在“AI 生成内容 -> 多平台适配 -> 分发/发布 -> 数据回流”链路上的能力差异，并结合当前 `Viewpoint_Prism_Pro` 的实现，提出适合衍射棱镜的下一阶段调整方案。

目标不是简单照搬参考工程，而是提炼出适合“衍射棱镜”定位的能力边界：

- 让视频内容先被理解，再被改写成多平台资产
- 让资产不止停留在导出，而是具备“可发布、可追踪、可回流”的闭环能力
- 让衍射棱镜与知识棱镜、创作棱镜、译制棱镜形成协同，而不是孤立模块

---

## 2. 两个参考工程的本质差异

### 2.1 `AiToEarn` 的核心价值

`AiToEarn` 的优势不是单纯“AI 写文案”，而是完整的内容运营系统：

- 账号体系完整
  - 每个平台账号独立建模，包含登录态、平台类型、状态、粉丝量、收益、异常状态等
- 发布记录完整
  - `PubRecord` 管总发布任务
  - `WorkData` 管每个平台、每个账号的具体发布结果、预览链接、统计数据、失败原因、定时发布等
- 平台连接器完整
  - 面向 Bilibili、YouTube、Twitter/X、Meta、微信公众号等有单独平台服务
- 数据回流完整
  - 发布后可跟踪阅读、点赞、收藏、转发、评论、收益
- 运营闭环完整
  - 不只“发内容”，还包含热点、评论搜索、互动运营、数据分析

一句话总结：`AiToEarn` 是“多平台内容运营中台”。

### 2.2 `baoyu-skills` 的核心价值

`baoyu-skills` 的优势不是统一后台，而是“技能化的内容变形能力”：

- 内容输入形式灵活
  - markdown、纯文本、URL、文章、图片等都可作为源输入
- 平台适配强
  - 对公众号、X、微博、小红书等都有单独技能和单独工作流
- 资产生成链路清晰
  - markdown -> html -> 微信文章
  - markdown -> 长文 -> X Article / 微博头条
  - 文章 -> 小红书图文卡片 / 信息图 / 封面图
- 风格与布局系统成熟
  - 比如小红书图卡采用 `style x layout x preset`
- 发布方式现实
  - 能用 API 的用 API，不能稳定 API 的走 Chrome CDP / 浏览器自动填充

一句话总结：`baoyu-skills` 是“多平台内容变体与轻量发布工具箱”。

### 2.3 两者对衍射棱镜的启发

它们并不是同一种系统：

- `AiToEarn` 解决的是“平台与运营闭环”
- `baoyu-skills` 解决的是“内容变体与发布动作”

对衍射棱镜来说，真正需要的是二者结合：

- 向 `AiToEarn` 学“账号、任务、发布记录、回流数据”
- 向 `baoyu-skills` 学“平台原生格式、内容衍生模板、技能化发布执行器”

---

## 3. 当前衍射棱镜的现状

当前实现已经具备雏形能力：

- 关键帧提取
- AI 选帧
- 平台文案生成
- 资产导出
- 草稿存储

对应代码主要在：

- `server/src/modules/prism-diffraction/`
- `client/src/components/prisms/diffraction/`

### 3.1 当前已有的正确方向

- 已经有 `DiffractionTask` 和 `PlatformDraft`
- 已经把“平台草稿”作为数据实体存下来
- 已经开始区分平台模板、平台导出尺寸、平台文案 Prompt
- UI 上已经有“平台切换 + 素材选择 + 草稿预览”的交互雏形

这些都说明衍射棱镜的方向是对的。

### 3.2 当前实现的结构性短板

但它距离“可用的多平台推广棱镜”还有明显差距。

#### 短板 A：还停留在“文案导出器”，不是“发布棱镜”

现在的能力本质上是：

- 从视频取帧
- 生成文案
- 导出 json / 图片

缺失的是：

- 平台账号连接
- 发布动作执行
- 草稿到发布的状态流转
- 发布回执
- 数据回流

也就是说，当前衍射棱镜只有“生成”，没有“推广”。

#### 短板 B：平台抽象过粗

当前平台字段只区分：

- `xiaohongshu`
- `twitter_x`
- `newsletter`
- `linkedin`
- `instagram`

但真实平台需求不是只换个平台名，而是要区分：

- 内容形态
  - 短帖、长文、图文卡片、视频贴、线程、文章
- 发布方式
  - API、浏览器自动填充、导出手动发布
- 资产要求
  - 封面、正文图、标题、摘要、标签、话题、CTA、链接策略
- 平台参数
  - 定时发布、评论权限、可见性、原创声明、合集、@提及、链接限制

这也是 `AiToEarn` 里 `WorkData.diffParams` 很重要的原因。

#### 短板 C：缺少“源内容中间层”

当前生成文案时，`selectedFrames` 基本还是图片 URL 列表，缺失真正的平台生成中间语义层：

- 核心论点
- 目标受众
- 内容钩子
- 章节结构
- 平台禁忌
- 可引用事实
- 可视化素材池
- CTA 候选
- 多语言版本关系

没有这个中间层，就只能每个平台都重新问模型一遍，导致：

- 输出不稳定
- 多平台之间风格不一致
- 难以编辑与复用

#### 短板 D：当前数据流还有实现错位

现有衍射实现内部还有几处明显错位：

- `DiffractionPanel` 把“公众号”映射成 `newsletter`，语义混杂
- DTO 枚举包含 `jike`、`wechat_mp`，但服务层并未真正支持
- `BatchExportService.generateAssets()` 接受的 `videoId` 实际上传入的是 `task.id`
- `DiffractionService.getDrafts()` 中把 `videoId` 当作 `diffractionId` 查询
- 报告中写“已完全就绪”，但当前实现实际上还没有形成真实多平台闭环

这类问题说明：当前模型名、路由名、平台名、任务 id / 视频 id 的边界还没有稳定下来。

---

## 4. 参考工程映射到衍射棱镜后，应该怎么重新定义

### 4.1 新定位

衍射棱镜不应该再定义为：

- “把视频转成几段平台文案”

而应该定义为：

- “把一个视频理解结果，重组为多个平台原生传播单元，并支持发布、追踪和复用”

这个定义包含三层：

1. 内容衍射层
2. 发布执行层
3. 数据回流层

### 4.2 三层新架构

#### 第一层：内容衍射层

负责把视频转成“平台无关的传播素材包”。

建议新增中间实体：`DiffractionAssetBundle`

可包含：

- 视频主题
- 核心观点列表
- 目标受众
- 平台通用摘要
- 可引用片段
- 高价值关键帧集合
- frame insight / OCR / 数据图信息
- 可用 CTA
- 话题词、关键词、标签池
- 风格偏好
- 风险提示

这层相当于“平台之前的传播语义层”。

#### 第二层：平台生成层

负责基于 `DiffractionAssetBundle` 生成平台原生资产。

建议把现在的 `PlatformDraft` 扩展为真正的平台资产草稿：

- 标题
- 正文
- 摘要
- hook
- cta
- hashtags
- cover image
- gallery images
- layout/style preset
- platform specific params
- publish method
- publish payload

这层要引入 `baoyu-skills` 的思路：

- style x layout x preset
- 短帖 / 长文 / 图卡 / thread / image-text 区分开
- markdown -> html -> 平台稿 的格式转换链路

#### 第三层：发布执行层

负责真正“推向平台”。

建议新增 `PublishConnector` 抽象，按执行方式拆成三类：

- `api`
  - 如公众号 API、部分开放平台
- `browser_automation`
  - 如 X、微博、部分小红书场景
- `manual_export`
  - 仅生成可复制/可下载的最终发布包

这一层要明显借鉴：

- `AiToEarn` 的平台服务抽象
- `baoyu-skills` 的脚本化执行器

---

## 5. 面向衍射棱镜的具体调整方案

### 5.1 调整一：平台模型从“平台名”升级为“平台 x 内容形态”

当前枚举过粗，建议拆成两层：

- `PlatformChannel`
  - `xiaohongshu`
  - `wechat_mp`
  - `x`
  - `weibo`
  - `linkedin`
  - `instagram`
- `PlatformContentType`
  - `image_post`
  - `video_post`
  - `thread`
  - `article`
  - `infographic`
  - `newsletter`

示例映射：

- 小红书图文：`xiaohongshu + infographic`
- 公众号文章：`wechat_mp + article`
- X 长文：`x + article`
- X 线程：`x + thread`
- 微博图文：`weibo + image_post`

这样衍射棱镜就不再受限于“一个平台只有一种输出”。

### 5.2 调整二：新增“传播母版”实体

建议新增：

- `DiffractionAssetBundle`
- `DiffractionVariant`

建议关系：

- 一个 `video` 对应多个 `DiffractionAssetBundle`
- 一个 `bundle` 对应多个 `variant`
- 一个 `variant` 对应一个平台输出草稿或发布结果

建议字段方向：

- `DiffractionAssetBundle`
  - `videoId`
  - `sourceTranscriptId`
  - `sourceKnowledgeAssetId`
  - `topic`
  - `coreIdeasJson`
  - `audienceJson`
  - `framePoolJson`
  - `quotePoolJson`
  - `ctaPoolJson`
  - `keywordPoolJson`
  - `language`
  - `status`
- `DiffractionVariant`
  - `bundleId`
  - `channel`
  - `contentType`
  - `title`
  - `summary`
  - `body`
  - `metadataJson`
  - `assetsJson`
  - `publishMethod`
  - `publishStatus`
  - `publishedUrl`
  - `platformPostId`
  - `metricsSnapshotJson`

### 5.3 调整三：把知识棱镜输出纳入衍射输入

现在衍射棱镜主要依赖关键帧和 AI prompt。

建议改为优先消费这些已有资产：

- `KnowledgeAsset.outlineMarkdown`
- `KnowledgeDeepAnalysis.summary`
- `FrameInsight.visualSummary`
- `Transcript.segments`

这样可以让衍射棱镜直接获得：

- 视频的逻辑脉络
- 关键论点
- 章节结构
- 关键可视内容

结果是：

- 平台稿更稳定
- 长文平台输出质量明显提升
- 多平台口径一致

### 5.4 调整四：引入“平台能力矩阵”

建议新增配置中心，类似：

- 支持哪些平台
- 每个平台支持哪些内容类型
- 每个平台支持哪种发布方式
- 是否支持定时
- 是否支持多图
- 是否支持长文
- 是否支持封面
- 字数/图片/视频限制

示例：

- 小红书
  - `infographic`, `image_post`
  - `browser_automation`, `manual_export`
- 公众号
  - `article`
  - `api`, `manual_export`
- X
  - `thread`, `article`, `image_post`, `video_post`
  - `browser_automation`

这会比现在简单的模板列表更适合作为系统配置核心。

### 5.5 调整五：衍射 UI 从“选平台生成”升级为“资产工坊”

当前 UI 更像单步操作面板。

建议改成四栏式工作流：

1. 左栏：传播母版
   - 视频摘要、目标受众、主叙事、内容类型建议
2. 中左：素材池
   - 关键帧、引用片段、数据点、标题钩子
3. 中右：平台变体
   - 每个平台卡片，显示状态：未生成 / 已生成 / 待发布 / 已发布 / 发布失败
4. 右栏：发布与回流
   - 平台账号、发布方式、发布时间、链接、阅读/互动数据

这会让衍射棱镜真正体现“棱镜”感，而不是一个导出按钮。

### 5.6 调整六：引入“执行器插件层”

这是最值得从参考工程继承的能力。

建议将发布执行器做成插件接口：

- `generateVariant(bundle, channel, contentType)`
- `renderAssets(variant)`
- `publishVariant(variant, account)`
- `syncMetrics(variant)`

优先接入方式建议：

- 第一阶段：`manual_export`
  - 生成 markdown/html/images/json/zip
- 第二阶段：`browser_automation`
  - 对接 `baoyu-skills` 风格的脚本执行器
- 第三阶段：`api`
  - 对接稳定平台接口

这能避免一开始就把所有平台深度集成到后端里，成本过高。

### 5.7 调整七：加上“发布记录”和“数据回流”

这是从 `AiToEarn` 必须吸收的能力。

当前只有 `PlatformDraft.isPublished`，远远不够。

至少应增加：

- 发布任务
- 发布状态
- 失败原因
- 平台帖子链接
- 平台帖子 id
- 发布时间
- 定时发布时间
- 指标快照
- 最后同步时间

建议新增：

- `DiffractionPublishTask`
- `DiffractionMetricSnapshot`

否则衍射棱镜无法形成真正的推广闭环。

---

## 6. 推荐的落地顺序

### Phase 1：先把内部模型理顺

优先做：

- 平台枚举重构
- `videoId / diffractionTaskId / draftId` 边界统一
- `newsletter` 与 `wechat_mp` 语义拆开
- `PlatformDraft` 升级为平台变体资产结构
- 建立 `DiffractionAssetBundle`

这一阶段先不追求自动发平台，先把内部数据模型做对。

### Phase 2：把导出能力升级成“平台原生资产包”

优先做：

- 微信公众号文章包
  - markdown
  - wechat-ready html
  - cover
- 小红书图文包
  - 封面
  - 多张内容图
  - caption
  - hashtags
- X 推文包
  - thread
  - image set
  - article markdown

这一步主要吸收 `baoyu-skills` 的内容变体思路。

### Phase 3：接入发布执行器

优先顺序建议：

1. `wechat_mp`
2. `x`
3. `weibo`
4. `xiaohongshu`

原因：

- 微信文章和 X 长文的结构最明确
- 微博和 X 的浏览器自动化路径成熟
- 小红书适合先从“图文资产包 + 半自动发布”切入

### Phase 4：做数据回流和运营闭环

引入：

- 发布状态页
- 每个平台的预览链接
- 指标同步
- 版本对比
- A/B 变体

这一阶段才真正接近 `AiToEarn` 的运营能力，但可以只做衍射棱镜需要的最小子集。

---

## 7. 对当前项目的具体建议结论

### 结论一

衍射棱镜下一阶段不该继续只补 Prompt，而应先重构数据模型与任务流。

### 结论二

对 `AiToEarn` 不要直接学习其“大而全”，而应提取它的三件核心资产：

- 平台账号模型
- 发布记录模型
- 指标回流模型

### 结论三

对 `baoyu-skills` 不要直接嵌入所有 skill，而应吸收其三种方法：

- 平台原生格式转换
- 风格/布局/预设系统
- API / 浏览器 / 手动导出的多执行模式

### 结论四

衍射棱镜最合理的新定位是：

“视频传播资产工坊 + 多平台执行器 + 推广回流面板”

而不是单纯“生成几段不同平台文案”。

---

## 8. 我建议你接下来在项目里优先改的内容

如果按投入产出比排序，最值得立刻推进的是：

1. 重构衍射数据模型
   - 增加 `AssetBundle / Variant / PublishTask`
2. 重新定义平台与内容形态
   - `channel x contentType`
3. 让知识棱镜成为衍射输入
   - 而不是只吃关键帧
4. 升级导出产物
   - 从 `json` 升级到“平台可直接使用”的文章包/图文包
5. 接入执行器插件层
   - 先手动导出，再半自动发布，再 API 发布

---

## 9. 最终判断

参考工程给衍射棱镜的真正答案不是“多加几个平台按钮”，而是：

- 用 `AiToEarn` 补齐运营和发布闭环
- 用 `baoyu-skills` 补齐平台原生内容变体
- 用 `Viewpoint_Prism_Pro` 自己已有的知识理解能力，做出比它们更强的“视频理解驱动型传播系统”

也就是说，衍射棱镜的优势不应该是“我也能发多平台”，而应该是：

- 我比传统多平台工具更懂视频内容本身
- 我能把视频理解结果重组成平台原生传播资产
- 我能让发布和数据回流反过来指导下一轮内容衍射

这才是“衍射棱镜”应该形成的真正产品壁垒。
