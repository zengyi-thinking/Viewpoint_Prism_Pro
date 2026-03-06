/**
 * 创作棱镜优化能力服务层测试（不走 HTTP）
 *
 * 覆盖：
 * 1) 首节点/续写节点生成（任务2）
 * 2) 节点预检（任务4）
 * 3) 质量评分（任务5）
 * 4) 分支创建 + 分支对比建议 + 分支合并（任务5）
 *
 * 运行：
 * npx ts-node -r tsconfig-paths/register test/test-creation-optimization-services.ts
 *
 * 可选：
 * TEST_CREATION_VIDEO_ID=xxx
 * TEST_CREATION_CLEANUP=1
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

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });
  const prisma = app.get(PrismaService);
  const creationService = app.get(CreationService);

  const createdNodeIds: string[] = [];

  try {
    logStep('准备测试上下文');
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
      throw new Error('未找到可用视频，请先上传视频或设置 TEST_CREATION_VIDEO_ID');
    }

    const userId = video.project.userId;
    const videoId = video.id;
    logOk('上下文', { userId, videoId });

    logStep('生成首节点（显式提示词，不依赖模型）');
    const first = await creationService.generateNextNode(userId, videoId, {
      idea: '凌晨街道中的孤独开场',
      scriptSegment: '夜色未散，空荡街道中只剩主角脚步声。',
      videoPrompt: '凌晨街道，主角独行，霓虹反光，电影感，16:9',
      sceneFramePrompt: '凌晨街道关键帧，主体清晰，光影层次强，16:9',
      firstFramePrompt: '开场首帧：主角背影出现在街角，16:9',
      lastFramePrompt: '结尾尾帧：主角停在十字路口，16:9',
    });
    const firstNodeId = first.node?.id;
    if (!firstNodeId) throw new Error('首节点生成失败：缺少 node.id');
    createdNodeIds.push(firstNodeId);
    logOk('首节点', { nodeId: firstNodeId, orderIndex: first.node?.orderIndex });

    logStep('生成续写节点');
    const next = await creationService.generateNextNode(userId, videoId, {
      currentNodeId: firstNodeId,
      idea: '镜头推进到人物特写并出现情绪波动',
      scriptSegment: '镜头推进到人物面部，眼神中出现明显迟疑。',
      videoPrompt: '人物特写，眼神迟疑，镜头缓慢推进，电影感，16:9',
      sceneFramePrompt: '人物特写关键帧，神态细节明显，16:9',
      firstFramePrompt: '承接上一镜头，进入中近景，16:9',
      lastFramePrompt: '尾帧停在人物眼神，16:9',
    });
    const nextNodeId = next.node?.id;
    if (!nextNodeId) throw new Error('续写节点生成失败：缺少 node.id');
    createdNodeIds.push(nextNodeId);
    logOk('续写节点', { nodeId: nextNodeId, parentNodeId: next.node?.parentNodeId });

    logStep('创建分支节点');
    const branch = await creationService.createBranch(userId, videoId, {
      sourceNodeId: nextNodeId,
      branchName: `opt-branch-${Date.now()}`,
      promptOverride: '人物特写，情绪反转，镜头横移，冷色调，电影感，16:9',
    });
    const branchNodeId = branch.node?.id;
    if (!branchNodeId) throw new Error('创建分支失败：缺少 branch node id');
    createdNodeIds.push(branchNodeId);
    logOk('分支节点', { branchNodeId, sourceNodeId: nextNodeId });

    logStep('预检主节点与分支节点');
    const precheckMain = await creationService.precheckNode(userId, nextNodeId);
    const precheckBranch = await creationService.precheckNode(userId, branchNodeId);
    logOk('预检结果摘要', {
      main: { level: precheckMain.level, issueCount: precheckMain.issues.length },
      branch: { level: precheckBranch.level, issueCount: precheckBranch.issues.length },
    });

    logStep('质量评分');
    const qualityMain = await creationService.assessNodeQuality(userId, nextNodeId);
    const qualityBranch = await creationService.assessNodeQuality(userId, branchNodeId);
    logOk('质量评分摘要', {
      mainOverall: qualityMain.quality.overall,
      branchOverall: qualityBranch.quality.overall,
      mainLevel: qualityMain.precheckLevel,
      branchLevel: qualityBranch.precheckLevel,
    });

    logStep('分支对比建议');
    const compare = await creationService.compareBranch(userId, branchNodeId);
    logOk('分支对比结果', {
      recommendation: compare.recommendation,
      reasons: compare.reasons,
      deltaOverall: compare.compare.delta.overall,
    });

    logStep('执行分支合并');
    const merge = await creationService.mergeBranch(userId, videoId, branchNodeId);
    logOk('分支合并结果', merge);

    const shouldCleanup = process.env.TEST_CREATION_CLEANUP === '1';
    if (shouldCleanup && createdNodeIds.length > 0) {
      logStep('清理测试节点');
      await prisma.flowNode.deleteMany({
        where: { id: { in: createdNodeIds } },
      });
      logOk('清理完成', { deletedCount: createdNodeIds.length });
    } else {
      logOk('保留测试节点（可设置 TEST_CREATION_CLEANUP=1 自动清理）', { createdNodeIds });
    }

    logOk('创作棱镜优化关键服务测试完成');
  } finally {
    await app.close();
  }
}

main().catch((error) => {
  console.error('\n[FAIL] 创作棱镜优化关键服务测试失败');
  console.error(error);
  process.exit(1);
});

