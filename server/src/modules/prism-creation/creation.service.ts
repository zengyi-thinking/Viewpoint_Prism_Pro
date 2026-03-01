import { Injectable } from '@nestjs/common';
import { CreateBranchDto, CreateFlowNodeDto, RenderFlowDto, StitchFlowDto } from './dto';

@Injectable()
export class CreationService {
  async getNodes(userId: string, videoId: string) {
    // TODO: query PrismFlow nodes from DB
    return {
      userId,
      videoId,
      items: [],
    };
  }

  async createNode(userId: string, videoId: string, dto: CreateFlowNodeDto) {
    // TODO: persist node in DB
    return {
      userId,
      videoId,
      node: {
        id: `node_${Date.now()}`,
        ...dto,
        renderStatus: 'PENDING',
      },
    };
  }

  async createBranch(userId: string, videoId: string, dto: CreateBranchDto) {
    // TODO: persist branch relation in DB
    return {
      userId,
      videoId,
      branchId: `branch_${Date.now()}`,
      ...dto,
      status: 'created',
    };
  }

  async render(userId: string, videoId: string, dto: RenderFlowDto) {
    // TODO: enqueue VIDEO_GEN render task
    return {
      taskId: `creation_render_${Date.now()}`,
      userId,
      videoId,
      ...dto,
      status: 'queued',
    };
  }

  async stitch(userId: string, videoId: string, dto: StitchFlowDto) {
    // TODO: enqueue FFmpeg stitch task
    return {
      taskId: `creation_stitch_${Date.now()}`,
      userId,
      videoId,
      ...dto,
      status: 'queued',
    };
  }
}
