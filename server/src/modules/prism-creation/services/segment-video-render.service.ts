import { Injectable } from '@nestjs/common';
import { CreationRenderService } from './creation-render.service';

@Injectable()
export class SegmentVideoRenderService {
  constructor(private readonly creationRenderService: CreationRenderService) {}

  enqueueNodeRender(params: {
    userId: string;
    projectId: string;
    flowProjectId: string;
    nodeId: string;
  }) {
    return this.creationRenderService.enqueueNodeRender(params);
  }

  enqueueProjectStitch(params: {
    userId: string;
    projectId: string;
    flowProjectId: string;
    composeOptions?: Record<string, unknown>;
  }) {
    return this.creationRenderService.enqueueProjectStitch(params);
  }
}
