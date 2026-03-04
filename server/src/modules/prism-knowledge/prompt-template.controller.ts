import { Controller, Get, Post, Put, Delete, Query, UseGuards, Body, Param } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PromptTemplateService } from './services/prompt-template.service';
import { CreatePromptTemplateDto, UpdatePromptTemplateDto, GetPromptTemplatesQueryDto } from './dto';

@Controller('api/prism/knowledge/prompt-templates')
@UseGuards(JwtAuthGuard)
export class PromptTemplateController {
  constructor(private readonly promptTemplateService: PromptTemplateService) {}

  /**
   * 创建 Prompt 模板
   */
  @Post()
  create(
    @CurrentUser() userId: string,
    @Body() dto: CreatePromptTemplateDto,
  ) {
    return this.promptTemplateService.create(userId, dto);
  }

  /**
   * 获取 Prompt 模板列表
   */
  @Get()
  getTemplates(
    @CurrentUser() userId: string,
    @Query() query: GetPromptTemplatesQueryDto,
  ) {
    return this.promptTemplateService.getTemplates(query);
  }

  /**
   * 获取 Prompt 模板详情
   */
  @Get(':id')
  getTemplate(
    @CurrentUser() userId: string,
    @Param('id') id: string,
  ) {
    return this.promptTemplateService.getTemplate(id);
  }

  /**
   * 更新 Prompt 模板
   */
  @Put(':id')
  updateTemplate(
    @CurrentUser() userId: string,
    @Param('id') id: string,
    @Body() dto: UpdatePromptTemplateDto,
  ) {
    return this.promptTemplateService.update(id, userId, dto);
  }

  /**
   * 删除 Prompt 模板
   */
  @Delete(':id')
  deleteTemplate(
    @CurrentUser() userId: string,
    @Param('id') id: string,
  ) {
    return this.promptTemplateService.delete(id, userId);
  }

  /**
   * 复制 Prompt 模板
   */
  @Post(':id/clone')
  cloneTemplate(
    @CurrentUser() userId: string,
    @Param('id') id: string,
  ) {
    return this.promptTemplateService.clone(id, userId);
  }

  /**
   * 评分 Prompt 模板
   */
  @Post(':id/rate')
  rateTemplate(
    @CurrentUser() userId: string,
    @Param('id') id: string,
    @Body() body: { rating: number },
  ) {
    return this.promptTemplateService.rate(id, userId, body.rating);
  }
}
