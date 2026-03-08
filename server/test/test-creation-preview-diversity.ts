import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { CreationService } from '../src/modules/prism-creation/creation.service';
import { PrismaService } from '../src/prisma/prisma.service';

function tokenize(text: string) {
  return Array.from(
    new Set(
      String(text || '')
        .split(/[^a-zA-Z0-9\u4e00-\u9fa5]+/)
        .map((item) => item.trim())
        .filter((item) => item.length >= 2),
    ),
  );
}

function similarity(a: string, b: string) {
  const left = new Set(tokenize(a));
  const right = new Set(tokenize(b));
  if (!left.size || !right.size) return 0;
  const intersection = Array.from(left).filter((token) => right.has(token)).length;
  const union = new Set([...left, ...right]).size;
  return union ? intersection / union : 0;
}

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });

  try {
    const prisma = app.get(PrismaService);
    const creationService = app.get(CreationService);

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
      throw new Error('未找到测试视频，请先上传视频或设置 TEST_CREATION_VIDEO_ID');
    }

    const result = await creationService.generateIdeaPreview(
      video.project.userId,
      video.id,
      {
        idea:
          process.env.TEST_CREATION_PREVIEW_IDEA ||
          '我想做一个仙人大战外星人的奇幻故事，请你帮我想一下怎么构思？',
        count: 3,
        tone: (process.env.TEST_CREATION_PREVIEW_TONE || 'cinematic') as any,
      },
    );

    const previews = Array.isArray((result as any).previews) ? (result as any).previews : [];
    const pairs: Array<Record<string, unknown>> = [];
    for (let i = 0; i < previews.length; i++) {
      for (let j = i + 1; j < previews.length; j++) {
        pairs.push({
          pair: `${i + 1}-${j + 1}`,
          titleSimilarity: similarity(previews[i].title, previews[j].title),
          openingSimilarity: similarity(previews[i].openingScene, previews[j].openingScene),
          progressionSimilarity: similarity(previews[i].progressionBeat, previews[j].progressionBeat),
        });
      }
    }

    console.log(
      JSON.stringify(
        {
          previewCount: previews.length,
          previews: previews.map((item: any, index: number) => ({
            index,
            title: item.title,
            openingScene: item.openingScene,
            progressionBeat: item.progressionBeat,
            styleNotes: item.styleNotes,
          })),
          pairSimilarity: pairs,
        },
        null,
        2,
      ),
    );
  } finally {
    await app.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
