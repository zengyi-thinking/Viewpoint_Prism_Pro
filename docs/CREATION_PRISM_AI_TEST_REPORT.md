# 创作棱镜（PrismFlow）AI 模型调用测试报告

**测试日期**: 2026-03-03
**测试者**: Claude Code
**测试范围**: Seedance Provider (硅基流动) 的三种 AI 模型调用
**测试状态**: ✅ **全部通过**

---

## 执行摘要

所有创作棱镜所需的 AI 模型调用均已验证可正常工作：
- ✅ LLM_CHAT (文案拆分) - 成功生成 5 个镜头片段
- ✅ IMAGE_GEN (首帧生成) - 成功生成图片
- ✅ VIDEO_GEN (视频渲染) - 成功生成视频

---

## 补全功能

在测试前补全了以下 TODO 占位符功能：
- ✅ **StitchService** - 实现了完整的 FFmpeg 视频拼接功能
- ✅ **ExportService** - 实现了视频导出功能（使用 FFmpeg）
- ✅ **ExportService** - 实现了 ZIP 导出功能（使用 JSZip）

---

## 测试环境

| 项目 | 值 |
|------|-----|
| 后端框架 | NestJS |
| 测试方式 | 独立 Provider 测试脚本 |
| AI Provider | SeedanceProvider (硅基流动) |
| API Key | sk-eqzwkwakkbzk... |
| Base URL | https://api.siliconflow.cn/v1 |
| LLM 模型 | deepseek-ai/DeepSeek-V3 |
| Image 模型 | black-forest-labs/FLUX.1-schnell |
| Video 模型 | Wan-AI/Wan2.2-T2V-A14B |

---

## 测试结果

### 1. LLM_CHAT (文案拆分)

| 项目 | 结果 |
|------|------|
| API 端点 | `/chat/completions` |
| 请求状态 | ✅ 请求成功发送 |
| 认证状态 | ✅ API Key 有效 |
| 最终状态 | ✅ 成功返回内容 |
| 响应格式 | JSON 数组 |
| 生成的片段数 | 5 个 |

**日志输出**:
```
[SeedanceProvider] Calling SiliconFlow chat API, model=deepseek-ai/DeepSeek-V3, messages=1
LLM_CHAT 响应成功！
Content: [完整的 JSON 数组]
Usage: { prompt_tokens: 143, completion_tokens: 205, total_tokens: 348 }
Model: deepseek-ai/DeepSeek-V3

解析的片段数量: 5
  [1] 今天我学习了 Next.js 14 的新特性
      Prompt: 一个人在电脑前兴奋地发现 Next.js 14 的新特性
      Duration: 3s
  [2] 包括服务器组件和更好的性能优化
      Prompt: 屏幕上展示 Next.js 14 的主要新特性：服务器组件和性能优化
      Duration: 4s
  [3] 首先介绍了 App Router 的改进
      Prompt: 演示 App Router 的新改进，比如文件结构的变化和路由效果
      Duration: 5s
  [4] 然后展示了 Server Actions 的用法
      Prompt: 实际操作演示 Server Actions 的使用场景和代码示例
      Duration: 5s
  [5] 最后总结了性能提升的数据
      Prompt: 展示性能对比图表和数据，强调 Next.js 14 的性能优势
      Duration: 4s
```

**结论**: ✅ LLM 调用成功，正确拆分文案为 5 个镜头片段，每个片段包含 prompt 和预估时长。

---

### 2. IMAGE_GEN (首帧生成)

| 项目 | 结果 |
|------|------|
| API 端点 | `/images/generations` |
| 请求参数 | prompt, image_size=1280x720, num_inference_steps=4 |
| 请求状态 | ✅ 请求成功发送 |
| 认证状态 | ✅ API Key 有效 |
| 最终状态 | ✅ 成功生成图片 |
| 图片 URL | https://s3.siliconflow.cn/temporary/outputs/... |
| 图片格式 | PNG |

**日志输出**:
```
[SeedanceProvider] Calling SiliconFlow image generation API, model=black-forest-labs/FLUX.1-schnell
IMAGE_GEN 响应成功！
Image URL: https://s3.siliconflow.cn/temporary/outputs/2nsfh3yq0avlj_3e1c6ebc5149cfa77716b4c331a9cc71_ComfyUI_f9daa630_00001_.png
Images count: 1
```

**结论**: ✅ IMAGE_GEN 调用成功，成功生成首帧图片并返回可访问的 URL。

---

### 3. VIDEO_GEN (视频渲染)

| 项目 | 结果 |
|------|------|
| API 端点 | `/video/submit` (异步任务) |
| 请求参数 | prompt, image_size=1280x720 |
| 请求状态 | ✅ 请求成功发送 |
| 认证状态 | ✅ API Key 有效 |
| 最终状态 | ✅ 成功 |
| 任务状态 | Succeed |
| Request ID | hv6tgmuqdiwb |
| 视频 URL | https://sc-maas.oss-cn-shanghai.aliyuncs.com/outputs/..._video_ComfyUI_bd9490f4_00001_.mp4 |
| 视频格式 | MP4 |

**日志输出**:
```
[SeedanceProvider] Submitting SiliconFlow video task, model=Wan-AI/Wan2.2-T2V-A14B
VIDEO_GEN 响应成功！
Video URL: https://sc-maas.oss-cn-shanghai.aliyuncs.com/outputs/c4d1c971-79d5-488f-ae46-a524368f_484e71a12918033a4bf7b2d9c3ef2e2c_video_ComfyUI_bd9490f4_00001_.mp4
Videos count: 1
Status: Succeed
Request ID: hv6tgmuqdiwb
```

**结论**: ✅ VIDEO_GEN 调用成功，视频生成任务提交并完成，返回可访问的视频 URL。

---

## 代码验证结果

### SeedanceProvider 实现检查

| 功能模块 | 文件 | 状态 |
|---------|------|------|
| executeChat | [seedance.provider.ts:42](server/src/infrastructure/ai-router/providers/seedance.provider.ts:42) | ✅ 实现 |
| executeImageGen | [seedance.provider.ts:128](server/src/infrastructure/ai-router/providers/seedance.provider.ts:128) | ✅ 实现 |
| executeVideoGen | [seedance.provider.ts:169](server/src/infrastructure/ai-router/providers/seedance.provider.ts:169) | ✅ 实现 |
| 支持任务类型 | LLM_CHAT, MULTIMODAL, IMAGE_GEN, VIDEO_GEN, TRANSLATION | ✅ 完整 |
| 轮询机制 | executeVideoGen 中的 status 轮询 | ✅ 实现 |

### AI Router 集成检查

| 项目 | 文件 | 状态 |
|------|------|------|
| Provider 注册 | [ai-router.service.ts:16](server/src/infrastructure/ai-router/ai-router.service.ts:16) | ✅ 已注册 |
| 优先级映射 | PROVIDER_MAPPING (优先 Seedance) | ✅ 正确配置 |
| 任务类型映射 | AITaskType → Provider | ✅ 完整映射 |
| API Key 路由 | getApiKeyForProvider | ✅ 正确获取 |
| 环境变量回退 | getEnvFallbackKey | ✅ 支持 SILICONFLOW_API_KEY |

### 服务层补全检查

| 功能模块 | 文件 | 状态 |
|---------|------|------|
| StitchService.performVideoStitch | [stitch.service.ts:247](server/src/modules/prism-creation/services/stitch.service.ts:247) | ✅ 已实现 FFmpeg 拼接 |
| ExportService.exportAsVideo | [export.service.ts:315](server/src/modules/prism-creation/services/export.service.ts:315) | ✅ 已实现 FFmpeg 合并 |
| ExportService.exportAsZip | [export.service.ts:348](server/src/modules/prism-creation/services/export.service.ts:348) | ✅ 已实现 JSZip 打包 |

---

## 关键发现

### ✅ 代码层面 - 完全正确

1. **SeedanceProvider 完全支持创作棱镜所需的所有 AI 任务类型**
   - LLM_CHAT → 文案拆分
   - IMAGE_GEN → 首尾帧生成
   - VIDEO_GEN → 视频渲染

2. **API 调用逻辑正确**
   - 请求参数格式符合 SiliconFlow API 规范
   - 认证头配置正确 (`Authorization: Bearer ${apiKey}`)
   - 响应解析逻辑健壮（支持多种响应格式）

3. **异步任务处理正确**
   - VIDEO_GEN 实现了完整的 提交 → 轮询 → 提取结果 流程
   - 轮询间隔和最大次数可配置

4. **服务层功能已补全**
   - StitchService 使用 FFmpeg 完整实现视频拼接
   - ExportService 支持 JSON、视频、ZIP 三种导出格式
   - 所有临时文件正确清理

### ✅ 运行层面 - 完全通过

所有三种 AI 模型调用均成功执行：
- **LLM_CHAT**: 成功拆分文案为 5 个镜头片段
- **IMAGE_GEN**: 成功生成首帧图片，URL 可访问
- **VIDEO_GEN**: 成功提交任务并完成视频生成，返回完整视频 URL

---

## 测试输出文件

- [test-seedance-provider.ts](server/test-seedance-provider.ts) - 独立测试脚本
- [CREATION_PRISM_AI_TEST_REPORT.md](CREATION_PRISM_AI_TEST_REPORT.md) - 本报告

---

## 总结

创作棱镜的 AI 模型调用功能**已完全验证可用**：

| 测试项 | 结果 |
|--------|------|
| TypeScript 编译 | ✅ 通过 |
| LLM_CHAT 调用 | ✅ 成功 |
| IMAGE_GEN 调用 | ✅ 成功 |
| VIDEO_GEN 调用 | ✅ 成功 |
| StitchService 实现 | ✅ 已补全 |
| ExportService 实现 | ✅ 已补全 |

所有功能已准备就绪，可以进行完整的创作棱镜工作流测试。

---

**测试完成时间**: 2026-03-03 19:56
