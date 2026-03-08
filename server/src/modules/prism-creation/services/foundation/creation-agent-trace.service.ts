import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../../prisma/prisma.service';
import { TaskStatus } from '../../dto';

type TraceInput = {
  userId: string;
  agent: string;
  action: string;
  payload?: Record<string, unknown>;
  result?: Record<string, unknown>;
  error?: string;
};

@Injectable()
export class CreationAgentTraceService {
  private readonly logger = new Logger(CreationAgentTraceService.name);

  constructor(private readonly prisma: PrismaService) {}

  async record(input: TraceInput) {
    try {
      await this.prisma.taskRecord.create({
        data: {
          userId: input.userId,
          type: 'PRISMFLOW_AGENT_TRACE',
          status: input.error ? TaskStatus.FAILED : TaskStatus.COMPLETED,
          progress: 100,
          payload: {
            agent: input.agent,
            action: input.action,
            payload: input.payload || {},
          } as any,
          result: input.result ? (input.result as any) : undefined,
          error: input.error || null,
          startedAt: new Date(),
          completedAt: new Date(),
        },
      });
    } catch (error) {
      this.logger.warn(
        `Failed to persist agent trace ${input.agent}/${input.action}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }
}
