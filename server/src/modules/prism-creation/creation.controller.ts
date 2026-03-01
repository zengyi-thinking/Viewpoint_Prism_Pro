import { Controller, Get, Post, Patch, Delete, Param } from '@nestjs/common';
import { CreationService } from './creation.service';

@Controller('api/prism/creation')
export class CreationController {
  constructor(private readonly creationService: CreationService) {}

  @Get(':videoId/nodes')
  getNodes(@Param('videoId') videoId: string) {
    // TODO
  }

  @Post(':videoId/nodes')
  createNode(@Param('videoId') videoId: string) {
    // TODO
  }

  @Post(':videoId/branches')
  createBranch(@Param('videoId') videoId: string) {
    // TODO
  }

  @Post(':videoId/render')
  render(@Param('videoId') videoId: string) {
    // TODO
  }
}
