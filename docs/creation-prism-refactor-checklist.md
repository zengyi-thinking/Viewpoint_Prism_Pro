# 创作棱镜重构清单与实现清单

更新时间：2026-03-13

本文档用于作为创作棱镜重构执行单。规则如下：

1. 未完成任务使用 `- [ ]`
2. 已完成且已测试通过的任务使用删除线 `~~任务~~`
3. 只有“实现完成 + 已验证通过”的任务才允许划掉

---

## 1. 当前已确认事实

- ~~已确认当前工程“服务切换按钮”位于 [settings/page.tsx](D:/DevProject/Viewpoint_Prism_Pro/client/src/app/(dashboard)/settings/page.tsx)，并且默认套餐是 `siliconflow`，内部实际映射到 `preferredAsr/Llm/ImageGen/VideoGen/Tts = seedance`~~
- ~~已确认后端 AI Router 当前默认优先级是 `SeedanceProvider`，见 [ai-router.service.ts](D:/DevProject/Viewpoint_Prism_Pro/server/src/infrastructure/ai-router/ai-router.service.ts)~~
- ~~已确认新中转站 `https://ai.t8star.cn/v1/models` 可访问并返回模型列表~~
- ~~已确认新中转站 `https://ai.t8star.cn/v1/chat/completions` 可用，使用 `gpt-4o-mini` 成功返回 `OK`~~
- ~~已确认根目录 `.env` 已配置“贞贞的AI工坊中转站”，包含 `CREATION_AI_BASE_URL / API_KEY / CHAT / VISION / IMAGE / VIDEO / TTS / ASR`~~

当前结论：

1. 新中转站可作为主入口接入
2. 现有工程“硅基流动优先”的逻辑必须被改成“新中转站优先”
3. 最省改造成本的路径不是发明一个全新 provider 名字，而是先让 `OpenAI-compatible` 主链路吃到 `https://ai.t8star.cn`

---

## 2. 模型选型结论

以下选型基于两类依据：

1. 已实测可访问的 `/v1/models` 结果
2. 现有工程的接口兼容性

说明：

1. 下列视频/图片模型可用性是从模型列表推断出来的
2. 并非每个都已逐个实跑渲染
3. 当前最稳妥的策略是先选“接口兼容最强”的模型组合，而不是一上来追求最高规格

## 2.1 推荐主模型组合

### 对话编剧 / 剧本生成 / 章节生成

主模型：

1. `gpt-4o`

备选：

1. `gpt-4.1`
2. `gpt-4o-mini`

原因：

1. 现有 [openai.provider.ts](D:/DevProject/Viewpoint_Prism_Pro/server/src/infrastructure/ai-router/providers/openai.provider.ts) 最容易直接接入
2. 对中文长文本创作、对话归纳、结构化输出足够稳

### 多模态画面分析 / 创作对话里的视觉理解

主模型：

1. `gemini-2.5-flash`

质量优先备选：

1. `gemini-2.5-pro`
2. `gemini-3.1-pro-preview`

暂不建议：

1. `doubao-1-5-vision-pro-32k`

原因：

1. `doubao-1-5-vision-pro-32k` 在当前默认分组下实测返回“无可用渠道”
2. `gemini-*` 至少在模型列表里可见，且更适合做视觉理解 fallback
3. 这里是基于模型列表和错误回包做出的工程判断

### 角色图 / 场景图生成

主模型：

1. `doubao-seedream-4-0-250828`

备选：

1. `flux-kontext-pro`
2. `gpt-image-1`

原因：

1. 你原来工作流思路本身就偏 `seedream/seedance` 体系
2. `seedream-4` 更接近原来视觉工作流迁移成本
3. `flux-kontext-pro` 更适合作为高可控备选

### 分镜参考图 / 九宫格分镜图

主模型：

1. `nano-banana-pro`

备选：

1. `gpt-image-1`
2. `flux-kontext-pro`

原因：

1. 视频稿里分镜图链路本来就强调“参考图连续性”
2. `nano-banana-pro` 在模型列表中可见，且名称上明显更贴近该类任务

### 视频片段生成

主模型：

1. `doubao-seedance-1-5-pro-251215`

草稿/低成本备选：

1. `doubao-seedance-1-0-pro-fast-251015`
2. `wan2.2-i2v-plus`

探索性备选：

1. `veo3.1-fast`
2. `kling-video-v2-5-turbo`

原因：

1. 你希望保留原工作流的视频生成风格，所以优先继续走 `seedance` 家族
2. 但接入层从硅基流动切到新的中转站
3. `wan` 和 `veo/kling` 可以作为后续质量或成本 AB 测试对象

### ASR / 转写

主模型：

1. `whisper-1`

备选：

1. `gpt-4o-transcribe`

原因：

1. 与现有工程兼容性最好
2. 接入复杂度最低

### TTS / 旁白

第一阶段主模型：

1. `tts-1`

质量备选：

1. `tts-1-hd`
2. `gpt-audio-mini`

说明：

1. 如果后续要强化中文配音质感，再评估 `minimax/speech-*`
2. 但第一轮先别扩大复杂度

---

## 3. 当前未通过或待验证项

- [ ] 完成新中转站多模态真实图片输入验证
说明：
当前对 `gemini-2.5-flash` 的图片输入测试拿到了 200 响应，但服务端没有真正识别到图像内容；对 `gpt-4o` 的远程图像 URL 测试则返回图片不可访问；因此“多模态模型可真正吃图”这一点还不能算通过。

- ~~完成新中转站图片生成接口验证~~
- ~~完成新中转站视频生成接口验证~~
说明：
已实测跑通 `POST /v1/video/generations` + `GET /v1/video/generations/{taskId}`。
其中 `veo3.1-fast` 已成功生成 5 秒左右 mp4，返回地址为 OSS 可下载链接；`doubao-seedance-1-5-pro-251215` 仍受预扣费额度约束，暂时不适合作为当前默认验证模型。

- ~~完成新中转站 TTS 接口验证~~
- ~~完成新中转站 ASR 接口验证~~

---

## 4. 架构重构清单

## 4.1 Provider 与设置系统

- ~~把“硅基流动默认套餐”改成“新中转站默认套餐”~~
- ~~在 [settings/page.tsx](D:/DevProject/Viewpoint_Prism_Pro/client/src/app/(dashboard)/settings/page.tsx) 新增 `t8star_default` 套餐按钮~~
- [ ] 移除创作棱镜主链路对 `seedance` 文案的依赖
- ~~将创作棱镜默认优先级改为：~~
  - LLM = `openai`
  - MULTIMODAL = `openai`
  - IMAGE_GEN = `openai`
  - VIDEO_GEN = `openai` 或 `transit`
  - TTS = `openai`
说明：
当前代码层默认优先级已切为 `openai` 主链路，视频任务也已改为优先走扩展后的 `OpenAIProvider`，仍保留 `SeedanceProvider` 作为 fallback。
- ~~为新中转站增加创作专用环境变量：~~
  - `CREATION_AI_BASE_URL`
  - `CREATION_AI_API_KEY`
  - `CREATION_AI_CHAT_MODEL`
  - `CREATION_AI_VISION_MODEL`
  - `CREATION_AI_IMAGE_MODEL`
  - `CREATION_AI_VIDEO_MODEL`
  - `CREATION_AI_TTS_MODEL`
  - `CREATION_AI_NARRATION_TTS_MODEL`
- ~~修改 [ai-router.service.ts](D:/DevProject/Viewpoint_Prism_Pro/server/src/infrastructure/ai-router/ai-router.service.ts)，让创作棱镜优先走新中转站~~
- ~~修改 [openai.provider.ts](D:/DevProject/Viewpoint_Prism_Pro/server/src/infrastructure/ai-router/providers/openai.provider.ts)，让它优先读取创作专用 base URL 与模型变量~~
- ~~决定视频生成是：扩展现有 `OpenAIProvider`~~

## 4.2 创作棱镜产品结构

- ~~把 [CreationCanvas.tsx](D:/DevProject/Viewpoint_Prism_Pro/client/src/components/prisms/creation/CreationCanvas.tsx) 左侧的 `idea/编剧表单` 整体替换为“创作导演对话区”~~
- [ ] 复用 [ChatDock.tsx](D:/DevProject/Viewpoint_Prism_Pro/client/src/components/workbench/ChatDock.tsx) 的消息流结构，做一个 `CreationChatPanel`
- ~~设计 `CreationConversationState`~~
- ~~为对话面板增加：~~
  - 已确认信息摘要卡
  - 当前剧本版本
  - 当前章节版本
  - 进入生产按钮
- [ ] 将 React Flow 画布降级为“高级编辑模式”

## 4.3 创作服务层

- [ ] 新增 `creation-chat-director.service.ts`
- ~~新增 `story-conversation-agent.ts`~~
- [ ] 新增 `script-synthesizer.agent.ts`
- ~~新增 `scene-planner.agent.ts`~~
- ~~新增 `character-asset.service.ts`~~
- ~~新增 `scene-asset.service.ts`~~
- ~~新增 `storyboard-segment.agent.ts`~~
- ~~新增 `dialogue-voice-mapper.agent.ts`~~
- ~~新增 `video-prompt-compiler.agent.ts`~~
- ~~新增 `prompt-compression.agent.ts`~~
- [ ] 新增 `storyboard-frame.service.ts`
- ~~新增 `segment-video-render.service.ts`~~
- ~~新增 `final-video-compose.service.ts`~~

## 4.4 数据结构

- [ ] 将 `PrismFlowProject.stylePreset` 语义升级为 `projectMeta`
- ~~增加 `conversationState`~~
- ~~增加 `scriptPackage`~~
- ~~增加 `scenePlan`~~
- ~~增加 `characterAssets`~~
- ~~增加 `sceneAssets`~~
- ~~增加 `storyboardSegments`~~
- ~~增加 `voiceCasting`~~
- ~~增加 `renderTasks`~~
- ~~增加 `finalVideo`~~

---

## 5. 实现清单

## Phase 0：接入新中转站

- ~~验证 `https://ai.t8star.cn/v1/models` 可用~~
- ~~验证 `https://ai.t8star.cn/v1/chat/completions` 可用~~
- ~~把新中转站接到设置页的默认套餐逻辑~~
- ~~把新中转站接到创作棱镜主链路环境变量~~
- ~~完成图片 / 视频 / TTS / ASR 的最小可用验证~~
说明：
补充：
视频当前建议先用 `veo3.1-fast` 作为低成本主验证模型，待额度足够后再切回 `doubao-seedance-1-5-pro-251215` 做质量对比。

## Phase 1：把创作入口改成对话

- ~~新建 `CreationChatPanel`~~
- ~~左侧表单删除~~
- ~~对话收集故事、风格、拆分偏好~~
- ~~对话自动归纳结构化状态~~
- ~~生成完整剧本~~
- ~~生成章节结构~~
- ~~测试：~~
  - 用户连续对话 5 轮后能生成剧本
  - 能局部修改章节
  - 不影响其他章节

## Phase 2：复刻 n8n 中间生产层

- ~~场景识别~~
- ~~整体摘要~~
- ~~场景摘要~~
- ~~角色设定图生成~~
- ~~场景设定图生成~~
- ~~分镜片段生成~~
- ~~文戏/武戏判定~~
- ~~台词识别~~
- ~~音色映射~~
- ~~分镜图生成~~
- ~~提示词压缩~~
- ~~测试：~~
  - 同角色跨片段一致
  - 同场景色调一致
  - 分镜片段与章节对应正确

## Phase 3：视频片段渲染

- ~~片段视频任务入队~~
- ~~片段视频渲染~~
- [ ] 失败重试
- ~~渲染结果写回工程~~
- ~~测试：~~
  - ~~单章节至少能生成一个视频片段~~
  - [ ] 多片段能独立完成

## Phase 4：成片拼接

- ~~章节排序拼接~~
- ~~TTS/旁白混入~~
- ~~BGM 混入~~
- ~~成片导出~~
- ~~测试：~~
  - ~~最终视频可下载~~
  - ~~工程可重新打开继续编辑~~

## Phase 5：高级编辑回挂

- [ ] 恢复高级节点画布
- [ ] 支持局部改 prompt
- [ ] 支持局部重生图
- [ ] 支持局部重生视频
- [ ] 支持分支与合并

---

## 6. 模型落地建议

## 第一阶段先用这一组

1. 对话编剧：`gpt-4o`
2. 视觉理解：`gemini-2.5-flash`
3. 角色/场景图：`doubao-seedream-4-0-250828`
4. 分镜图：`nano-banana-pro`
5. 视频生成：`doubao-seedance-1-5-pro-251215`
6. ASR：`whisper-1`
7. TTS：`tts-1`

## 第二阶段再做 AB 测试

1. 视觉理解质量版：`gemini-2.5-pro`
2. 角色/场景图备选：`flux-kontext-pro`
3. 视频低成本草稿：`doubao-seedance-1-0-pro-fast-251015`
4. 视频替代方案：`wan2.2-i2v-plus`
5. 视频高质量探索：`veo3.1-fast`

---

## 7. 现在最应该先做的 5 件事

1. ~~把设置页新增一个“新中转站默认套餐”按钮，并把默认偏好从 `seedance` 迁到新主链路~~
2. ~~改 [openai.provider.ts](D:/DevProject/Viewpoint_Prism_Pro/server/src/infrastructure/ai-router/providers/openai.provider.ts)，支持创作专用 base URL 与模型变量~~
3. ~~设计并落地 `CreationConversationState`~~
4. ~~把 [CreationCanvas.tsx](D:/DevProject/Viewpoint_Prism_Pro/client/src/components/prisms/creation/CreationCanvas.tsx) 左栏替换成对话式创作区~~
5. ~~打通“对话 -> 剧本 -> 场景规划”第一段闭环~~
6. ~~打通“章节结构 -> 场景/角色/分镜/音色生产包 -> 创建章节节点”第二段闭环~~

---

## 8. 备注

来源链接：

1. 模型页：<https://ai.t8star.cn/models>
2. 模型 API：<https://ai.t8star.cn/v1/models>

额外说明：

1. 我没有把真实 API key 写进仓库文件
2. 多模态、图片、视频等高成本接口还没有全部实跑
3. `doubao-1-5-vision-pro-32k` 当前默认分组下返回“无可用渠道”，暂时不要拿它做主多模态模型
4. 2026-03-13 已完成一次真实联调：`docker compose up -d --build server client` 后，前端 `http://localhost:7860` 与后端 `http://localhost:7861/api/health` 返回 200，`npm run test:creation:conversation:e2e --workspace=server` 已验证 5 轮对话、剧本归纳、章节生成、局部改章与章节节点创建闭环。
5. 2026-03-13 已完成 Phase 2 真实联调：`npm run test:creation:production:e2e --workspace=server` 已验证场景规划、角色/场景资产、分镜片段、音色映射、压缩提示词，以及角色图/场景图/分镜图的样例生成都能在新的中转商链路下通过。
6. 2026-03-13 已完成 Phase 3 单片段真实联调：`npm run test:creation:phase3:e2e --workspace=server` 已验证单章节样片可在新中转商链路下完成“生图 -> 视频渲染 -> 导出成片 -> 本地保存 mp4”。结果文件为 [__creation_phase3_render_e2e_result.json](D:/DevProject/Viewpoint_Prism_Pro/__creation_phase3_render_e2e_result.json)，本地样片为 [creation-phase3-final-1773413754318.mp4](D:/DevProject/Viewpoint_Prism_Pro/artifacts/creation-phase3-final-1773413754318.mp4) 与 [creation-phase3-clip-1-1773413754318.mp4](D:/DevProject/Viewpoint_Prism_Pro/artifacts/creation-phase3-clip-1-1773413754318.mp4)。
7. 2026-03-13 已完成 Phase 4 真实联调：`npm run test:creation:phase4:e2e --workspace=server` 已验证章节顺序拼接、低成本旁白混入、BGM 混入、成片导出，以及导出后重新读取工程图数据。结果文件为 [__creation_phase4_compose_e2e_result.json](D:/DevProject/Viewpoint_Prism_Pro/__creation_phase4_compose_e2e_result.json)，本地成片为 [creation-phase4-final-1773424871228.mp4](D:/DevProject/Viewpoint_Prism_Pro/artifacts/creation-phase4-final-1773424871228.mp4)。
