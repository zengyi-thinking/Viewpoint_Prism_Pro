import { IsObject, IsOptional, IsString } from 'class-validator';

export class UpdateSettingsDto {
  @IsOptional()
  @IsString()
  openaiKey?: string;

  @IsOptional()
  @IsString()
  geminiKey?: string;

  @IsOptional()
  @IsString()
  volcengineKey?: string;

  @IsOptional()
  @IsString()
  aliyunAsrKey?: string;

  @IsOptional()
  @IsString()
  midjourneyKey?: string;

  @IsOptional()
  @IsString()
  seedanceKey?: string;

  @IsOptional()
  @IsString()
  elevenlabsKey?: string;

  @IsOptional()
  @IsString()
  notionToken?: string;

  @IsOptional()
  @IsString()
  feishuAppId?: string;

  @IsOptional()
  @IsString()
  feishuAppSecret?: string;

  @IsOptional()
  @IsString()
  preferredAsr?: string;

  @IsOptional()
  @IsString()
  preferredLlm?: string;

  @IsOptional()
  @IsString()
  preferredImageGen?: string;

  @IsOptional()
  @IsString()
  preferredVideoGen?: string;

  @IsOptional()
  @IsString()
  preferredTts?: string;

  @IsOptional()
  @IsObject()
  providerConfigs?: Record<string, unknown>;
}
