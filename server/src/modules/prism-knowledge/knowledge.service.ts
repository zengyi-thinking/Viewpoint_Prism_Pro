import { Injectable } from '@nestjs/common';
import { AnalyzeKnowledgeDto, ExportKnowledgeDto } from './dto';

@Injectable()
export class KnowledgeService {
  async analyze(
    userId: string,
    videoId: string,
    dto: AnalyzeKnowledgeDto,
  ) {
    // TODO: enqueue transcript + keyframe + outline pipeline
    return {
      taskId: `knowledge_${Date.now()}`,
      userId,
      videoId,
      status: 'queued',
      options: dto,
    };
  }

  async getTranscript(userId: string, videoId: string) {
    // TODO: query transcript records from DB
    return {
      userId,
      videoId,
      status: 'PENDING',
      segments: [],
    };
  }

  async getOutline(userId: string, videoId: string) {
    // TODO: query generated outline from DB
    return {
      userId,
      videoId,
      status: 'PENDING',
      outlineMarkdown: '',
    };
  }

  async getFlashcards(userId: string, videoId: string) {
    // TODO: query generated flashcards from DB
    return {
      userId,
      videoId,
      status: 'PENDING',
      items: [],
    };
  }

  async export(userId: string, videoId: string, dto: ExportKnowledgeDto) {
    // TODO: enqueue export/sync task
    return {
      taskId: `knowledge_export_${Date.now()}`,
      userId,
      videoId,
      target: dto.target ?? 'markdown',
      status: 'queued',
    };
  }
}
