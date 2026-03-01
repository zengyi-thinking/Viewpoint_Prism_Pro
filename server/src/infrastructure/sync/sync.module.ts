import { Module } from '@nestjs/common';
import { NotionService } from './notion.service';
import { FeishuService } from './feishu.service';

@Module({
  providers: [NotionService, FeishuService],
  exports: [NotionService, FeishuService],
})
export class SyncModule {}
