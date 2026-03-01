import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';

@Injectable()
export class FlashcardService {
  constructor(private readonly prisma: PrismaService) {}

  async generateFlashcards(params: {
    assetId: string;
    transcriptSegments: Array<{ text: string }>;
  }) {
    const { assetId, transcriptSegments } = params;

    await this.prisma.flashcard.deleteMany({
      where: { assetId },
    });

    const seeds = transcriptSegments.slice(0, 8);
    if (!seeds.length) {
      return [];
    }

    const created: any[] = [];
    for (let idx = 0; idx < seeds.length; idx += 1) {
      const seg = seeds[idx];
      const front = `第 ${idx + 1} 段的核心观点是什么？`;
      const back = seg.text;

      const card = await this.prisma.flashcard.create({
        data: {
          assetId,
          front,
          back,
          chapter: `章节 ${idx + 1}`,
          difficulty: Math.min(5, 1 + (idx % 5)),
          nextReview: this.computeNextReview(idx),
          reviewCount: 0,
        },
      });
      created.push(card);
    }

    return created;
  }

  private computeNextReview(offsetIndex: number) {
    const days = [1, 2, 4, 7, 15, 30];
    const delta = days[offsetIndex % days.length];
    const d = new Date();
    d.setDate(d.getDate() + delta);
    return d;
  }
}
