import { IsOptional, IsString } from 'class-validator';

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
}
