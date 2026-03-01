import { Module, Global } from '@nestjs/common';
import { AiRouterService } from './ai-router.service';

@Global()
@Module({
  providers: [AiRouterService],
  exports: [AiRouterService],
})
export class AiRouterModule {}
