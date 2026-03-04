import { Controller, Get, Post, Put, Body, Param, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { QualityAssessmentService } from './services/quality-assessment.service';

/**
 * 提交质量评估反馈 DTO
 */
class SubmitFeedbackDto {
  qualityId?: string;
  cardId?: string;
  flashcardId?: string;
  rating: number;
  feedback?: string;
}

/**
 * 重新生成请求 DTO
 */
class RegenerateDto {
  cardId?: string;
  flashcardId?: string;
  reason: string;
}

@Controller('api/prism/knowledge/quality')
@UseGuards(JwtAuthGuard)
export class QualityAssessmentController {
  constructor(private readonly qualityAssessmentService: QualityAssessmentService) {}

  /**
   * 获取质量评估历史
   */
  @Get('history/:assetId')
  getHistory(
    @CurrentUser() userId: string,
    @Param('assetId') assetId: string,
  ) {
    return this.qualityAssessmentService.getHistory(assetId);
  }

  /**
   * 提交质量反馈
   */
  @Post('feedback')
  async submitFeedback(
    @CurrentUser() userId: string,
    @Body() dto: SubmitFeedbackDto,
  ) {
    // TODO: 实现用户反馈保存逻辑
    return {
      success: true,
      message: 'Feedback submitted successfully',
      data: {
        rating: dto.rating,
        feedback: dto.feedback,
      },
    };
  }

  /**
   * 有帮助投票
   */
  @Post('helpful/:qualityId')
  async markHelpful(
    @CurrentUser() userId: string,
    @Param('qualityId') qualityId: string,
  ) {
    // TODO: 实现有帮助投票逻辑
    return {
      success: true,
      message: 'Marked as helpful',
    };
  }

  /**
   * 请求重新生成
   */
  @Post('regenerate')
  async regenerate(
    @CurrentUser() userId: string,
    @Body() dto: RegenerateDto,
  ) {
    // TODO: 实现重新生成逻辑
    return {
      success: true,
      message: 'Regeneration request submitted',
    };
  }
}
