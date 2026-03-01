import { Controller, Get, Post, Patch, Delete, Param } from '@nestjs/common';
import { VideoService } from './video.service';

@Controller('api/videos')
export class VideoController {
  constructor(private readonly videoService: VideoService) {}

  @Get()
  findAll() {
    // TODO
  }

  @Post()
  create() {
    // TODO
  }

  @Patch(':id')
  update(@Param('id') id: string) {
    // TODO
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    // TODO
  }
}
