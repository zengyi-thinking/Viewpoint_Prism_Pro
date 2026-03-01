import { Controller, Get, Post, Param } from '@nestjs/common';
import { KnowledgeService } from './knowledge.service';

@Controller('api/prism/knowledge')
export class KnowledgeController {
  constructor(private readonly knowledgeService: KnowledgeService) {}

  @Post(':videoId/analyze')
  analyze(@Param('videoId') videoId: string) {
    // TODO
  }

  @Get(':videoId/transcript')
  getTranscript(@Param('videoId') videoId: string) {
    // TODO
  }

  @Get(':videoId/outline')
  getOutline(@Param('videoId') videoId: string) {
    // TODO
  }

  @Get(':videoId/flashcards')
  getFlashcards(@Param('videoId') videoId: string) {
    // TODO
  }
}
