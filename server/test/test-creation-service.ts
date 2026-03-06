/**
 * 服务层测试脚本（不走 HTTP 接口）
 *
 * 覆盖能力：
 * 1. CreationService.generateNextNode（首节点生成）
 * 2. CreationService.generateNextNode（基于当前节点续写）
 * 3. CreationService.generateNodeCandidates（候选续写）
 *
 * 运行方式：
 * npx ts-node -r tsconfig-paths/register test/test-creation-service.ts
 *
 * 可选环境变量：
 * TEST_CREATION_VIDEO_ID=xxx       指定测试视频ID
 * TEST_CREATION_CLEANUP=1          执行后删除本脚本创建的节点
 */

import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { CreationService } from '../src/modules/prism-creation/creation.service';
import { PrismaService } from '../src/prisma/prisma.service';

function logStep(title: string) {
  console.log(`\n[STEP] ${title}`);
}

function logOk(message: string, data?: unknown) {
  console.log(`[OK] ${message}`);
  if (data !== undefined) {
    console.log(JSON.stringify(data, null, 2));
  }
}

function logWarn(message: string) {
  console.warn(`[WARN] ${message}`);
}

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });

  const prisma = app.get(PrismaService);
  const creationService = app.get(CreationService);

  const createdNodeIds: string[] = [];

  try {
    logStep('定位测试视频');
    const forcedVideoId = (process.env.TEST_CREATION_VIDEO_ID || '').trim();

    const video = forcedVideoId
      ? await prisma.videoSource.findUnique({
          where: { id: forcedVideoId },
          include: { project: true },
        })
      : await prisma.videoSource.findFirst({
          include: { project: true },
          orderBy: { createdAt: 'desc' },
        });

    if (!video) {
      throw new Error(
        '未找到可用视频。请先在前端上传至少一个视频，或设置 TEST_CREATION_VIDEO_ID。',
      );
    }

    const userId = video.project.userId;
    const videoId = video.id;
    logOk('测试上下文已确定', {
      userId,
      videoId,
      source: forcedVideoId ? 'env.TEST_CREATION_VIDEO_ID' : 'latest videoSource',
    });

    logStep('读取当前节点数量');
    const project = await creationService.getOrCreateProject(userId, videoId);
    const beforeCount = await prisma.flowNode.count({
      where: { flowProjectId: project.id },
    });
    logOk('当前节点数', { beforeCount, projectId: project.id });

    logStep('调用 generateNextNode：首节点/新增节点（显式 prompt bundle，不依赖模型）');
    const firstResult = await creationService.generateNextNode(userId, videoId, {
      idea: '以晨雾中的城市天际线作为开场',
      scriptSegment: '清晨，城市从薄雾中慢慢显现，镜头从高空俯拍推进到主街区。',
      videoPrompt:
        '清晨城市天际线，电影感，冷暖对比光线，缓慢推进镜头，16:9，高清细节',
      sceneFramePrompt: '晨雾中的城市高空俯拍关键帧，建筑轮廓清晰，16:9',
      firstFramePrompt: '开场首帧：晨雾中的城市天际线，电影感构图，16:9',
      lastFramePrompt: '收束尾帧：镜头推进到主街区，雾气散开，16:9',
    });

    const firstNodeId = firstResult?.node?.id;
    if (!firstNodeId) {
      throw new Error('首节点生成返回无 node.id');
    }
    createdNodeIds.push(firstNodeId);
    logOk('首节点生成成功', {
      sourceNodeId: firstResult?.sourceNodeId ?? null,
      nodeId: firstNodeId,
      orderIndex: firstResult?.node?.orderIndex,
      mode: firstResult?.mode,
    });

    logStep('调用 generateNextNode：基于当前节点续写（显式 prompt bundle）');
    const nextResult = await creationService.generateNextNode(userId, videoId, {
      currentNodeId: firstNodeId,
      idea: '转入人群与街景，展示节奏提升',
      scriptSegment: '镜头从街区上空下降到人群视角，节奏逐步加快，展示城市活力。',
      videoPrompt:
        '城市街景，人群流动，镜头下降并横移，节奏提升，电影级质感，16:9',
      sceneFramePrompt: '城市街区人流关键画面，动静对比明显，16:9',
      firstFramePrompt: '延续上一镜头尾帧，下降到街区上空，16:9',
      lastFramePrompt: '收束在繁忙路口的人群全景，16:9',
    });

    const nextNodeId = nextResult?.node?.id;
    if (!nextNodeId) {
      throw new Error('续写节点生成返回无 node.id');
    }
    createdNodeIds.push(nextNodeId);
    logOk('续写节点生成成功', {
      sourceNodeId: nextResult?.sourceNodeId ?? null,
      nodeId: nextNodeId,
      orderIndex: nextResult?.node?.orderIndex,
      parentNodeId: nextResult?.node?.parentNodeId ?? null,
    });

    logStep('调用 generateNodeCandidates：候选续写（允许模型失败后走内部 fallback）');
    const candidatesResult = await creationService.generateNodeCandidates(userId, videoId, {
      currentNodeId: nextNodeId,
      idea: '进入夜景并形成情绪反转',
      count: 3,
    });

    const candidates = Array.isArray(candidatesResult?.candidates)
      ? candidatesResult.candidates
      : [];
    logOk('候选节点结果', {
      count: candidates.length,
      sample: candidates.slice(0, 2),
    });

    logStep('回读节点计数');
    const afterCount = await prisma.flowNode.count({
      where: { flowProjectId: project.id },
    });
    logOk('节点计数变化', {
      beforeCount,
      afterCount,
      delta: afterCount - beforeCount,
    });

    const shouldCleanup = process.env.TEST_CREATION_CLEANUP === '1';
    if (shouldCleanup && createdNodeIds.length > 0) {
      logStep('清理脚本创建的测试节点');
      await prisma.flowNode.deleteMany({
        where: { id: { in: createdNodeIds } },
      });
      logOk('测试节点已清理', { deletedCount: createdNodeIds.length });
    } else if (createdNodeIds.length > 0) {
      logWarn(
        `未清理测试节点（可设置 TEST_CREATION_CLEANUP=1 自动清理）。createdNodeIds=${createdNodeIds.join(',')}`,
      );
    }

    logOk('创作棱镜服务层测试完成');
  } finally {
    await app.close();
  }
}

main().catch((error) => {
  console.error('\n[FAIL] 创作棱镜服务层测试失败');
  console.error(error);
  process.exit(1);
});

