import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsObject, IsOptional, IsString, Max, Min } from 'class-validator';

export enum ChatPrismType {
  KNOWLEDGE = 'knowledge',
  CREATION = 'creation',
  TRANSLATION = 'translation',
  DIFFRACTION = 'diffraction',
}

export enum PrismActionType {
  NONE = 'none',
  INJECT_QA_CARD = 'inject_qa_card',
  UPDATE_NODE_PROMPT = 'update_node_prompt',
  REFINE_TRANSLATION_SEGMENT = 'refine_translation_segment',
  REGENERATE_PLATFORM_DRAFT = 'regenerate_platform_draft',
  GENERATE_SUMMARY = 'generate_summary',
  GENERATE_MINDMAP = 'generate_mindmap',
}

export class CreateChatSessionDto {
  @IsString()
  projectId: string;

  @IsOptional()
  @IsString()
  videoId?: string;

  @IsOptional()
  @IsEnum(ChatPrismType)
  activePrism?: ChatPrismType;
}

export class SendChatMessageDto {
  @IsString()
  content: string;

  @IsOptional()
  @IsString()
  videoId?: string;

  @IsOptional()
  @IsEnum(ChatPrismType)
  activePrism?: ChatPrismType;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

export class GetChatMessagesQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 50;

  @IsOptional()
  @IsString()
  before?: string;
}
