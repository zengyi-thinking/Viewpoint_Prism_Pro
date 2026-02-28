# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目概述

Viewpoint Prism Pro 是一个"视频内容工作台"产品。同一条视频在统一界面中被并行处理为四种资产流：学习、二创、译制、分发。项目当前处于需求设计阶段，尚无实际代码，核心资料为 README.md（产品需求文档）和 Excalidraw 设计稿。

## 核心概念

- **四大棱镜**：知识棱镜（学习笔记生成）、创作棱镜/PrismFlow（节点化视频二创）、译制棱镜（多语种本地化）、衍射棱镜（多平台图文分发）
- **BYOK 架构**：用户自带模型 API Key（ASR、LLM、多模态、生图、生视频、TTS），系统按任务路由调用
- **PrismFlow**：类 Git 的视频节点版本控制，支持 Branch/Merge，首尾帧锚定 + 中间动态补全
- **对话窗口**：跨棱镜编排器，对话结果会写入当前激活棱镜的任务流/时间轴

## 工作台布局

三栏结构：
- 左侧：视频源管理（搜索、列表、勾选分析项）
- 中间：视频播放器 + 对话窗口
- 右侧：棱镜入口切换 + 动态展开的专用控制台面板
- 右上：Setting（模型 API Key 管理、引擎状态）

## 全局状态机

Idle → VideoReady → PrismActive → TaskRunning → Reviewing → ExportReady（或 Failed 可重试/回滚）

## 技术栈

- 前端：Next.js 14 (App Router) + React 18 + Tailwind CSS + shadcn/ui + Zustand + React Query + React Flow + Video.js + Tiptap
- 后端：NestJS + Prisma ORM + PostgreSQL + Redis (BullMQ) + MinIO + FFmpeg + Socket.IO
- 认证：NextAuth.js + JWT
- AI Router：策略模式统一路由，支持 OpenAI / Gemini / 火山 / 阿里云 / Midjourney / Seedance / ElevenLabs

## 关键文件

- `README.md`：完整产品需求文档，包含四大棱镜工作流、组件清单、技术架构
- `Viewpoint_Prism_Pro.excalidraw`：产品设计画板（需求拆解、交互流程、界面草图）
- `__all_texts.txt`：Excalidraw 画板中提取的所有文本内容
- `docs/develop/01-architecture.md`：工程架构设计（技术栈、目录结构、AI Router 设计）
- `docs/develop/02-database-design.md`：数据库 ER 关系与完整 Prisma Schema
- `docs/develop/03-prism-workflows.md`：四大棱镜详细工作流与交互特效设计
- `docs/develop/04-development-roadmap.md`：分 8 阶段的开发路线图（精确到每个功能的 checklist）
- `docs/develop/05-ai-model-matrix.md`：AI 模型矩阵、.env 配置说明、Router 路由策略
