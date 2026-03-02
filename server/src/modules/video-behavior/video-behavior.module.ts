import { Module } from '@nestjs/common';
import { VideoBehaviorController } from './video-behavior.controller';
import { VideoBehaviorService } from './video-behavior.service';
import { PrismaService } from '../../prisma/prisma.service';

@Module({
  controllers: [VideoBehaviorController],
  providers: [VideoBehaviorService, PrismaService],
  exports: [VideoBehaviorService],
})
export class VideoBehaviorModule {}
