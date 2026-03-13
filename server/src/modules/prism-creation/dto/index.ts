import { Type } from 'class-transformer';
import { IsBoolean, IsInt, IsNotEmpty, IsNumber, IsOptional, IsString, Max, Min } from 'class-validator';

export class BootstrapCreationProjectDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  backgroundVideoId?: string;
}

export class GenerateIdeaPreviewsDto {
  @IsString()
  @IsNotEmpty()
  idea!: string;

  @IsOptional()
  @IsString()
  conflict?: string;

  @IsOptional()
  @IsString()
  setting?: string;

  @IsOptional()
  @IsString()
  visualGoal?: string;

  @IsOptional()
  @IsString()
  constraints?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(2)
  @Max(5)
  count?: number;

  @IsOptional()
  @IsString()
  backgroundVideoId?: string;
}

export class SelectIdeaPreviewDto {
  @IsString()
  @IsNotEmpty()
  previewId!: string;
}

export class GenerateScriptPlanDto {
  @IsString()
  @IsNotEmpty()
  scriptText!: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(12)
  chaptersHint?: number;

  @IsOptional()
  @IsString()
  backgroundVideoId?: string;
}

export class CreateChapterNodesDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  chapterIndex!: number;
}

export class UpdateScriptPlanChapterDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  summary?: string;

  @IsOptional()
  @IsString()
  goal?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(2)
  @Max(6)
  storyboardCount?: number;
}

export class UpdateCreationNodeDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  scriptSegment?: string;

  @IsOptional()
  @IsString()
  displayPromptCn?: string;

  @IsOptional()
  @IsString()
  imagePromptCn?: string;

  @IsOptional()
  @IsString()
  modelPrompt?: string;

  @IsOptional()
  @IsString()
  videoPrompt?: string;

  @IsOptional()
  @IsString()
  characterIdentity?: string;

  @IsOptional()
  @IsString()
  characterHair?: string;

  @IsOptional()
  @IsString()
  characterOutfit?: string;

  @IsOptional()
  @IsString()
  characterFace?: string;

  @IsOptional()
  @IsString()
  characterProp?: string;

  @IsOptional()
  @IsBoolean()
  continuityLocked?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  positionX?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  positionY?: number;
}

export class GenerateNextNodeCandidatesDto {
  @IsOptional()
  @IsString()
  intent?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(2)
  @Max(5)
  count?: number;
}

export class SelectNextNodeCandidateDto {
  @IsString()
  @IsNotEmpty()
  candidateId!: string;
}

export class GenerateNodeImageDto {
  @IsOptional()
  @IsBoolean()
  overwrite?: boolean;
}

export class AppendConversationMessageDto {
  @IsString()
  @IsNotEmpty()
  content!: string;

  @IsOptional()
  @IsString()
  backgroundVideoId?: string;
}

export class GenerateProductionPackageDto {
  @IsOptional()
  @IsString()
  artStyle?: string;
}
