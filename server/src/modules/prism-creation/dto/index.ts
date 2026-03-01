import { Type } from 'class-transformer';
import { IsBoolean, IsEnum, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export enum RenderQuality {
  DRAFT = 'draft',
  HIGH = 'high',
}

export class CreateFlowNodeDto {
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  orderIndex: number;

  @IsOptional()
  @IsString()
  prompt?: string;

  @IsOptional()
  @IsString()
  scriptSegment?: string;

  @IsOptional()
  @IsString()
  parentNodeId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  positionX?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  positionY?: number;
}

export class CreateBranchDto {
  @IsString()
  sourceNodeId: string;

  @IsString()
  branchName: string;

  @IsOptional()
  @IsString()
  promptOverride?: string;
}

export class RenderFlowDto {
  @IsString()
  nodeId: string;

  @IsOptional()
  @IsEnum(RenderQuality)
  quality?: RenderQuality = RenderQuality.DRAFT;

  @IsOptional()
  @IsString()
  stylePresetId?: string;
}

export class StitchFlowDto {
  @IsOptional()
  @IsBoolean()
  includeNarration?: boolean = true;

  @IsOptional()
  @IsBoolean()
  includeBgm?: boolean = true;
}
