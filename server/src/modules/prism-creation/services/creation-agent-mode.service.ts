import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export type CreationAgentMode = 'off' | 'hybrid' | 'full';

@Injectable()
export class CreationAgentModeService {
  constructor(private readonly configService: ConfigService) {}

  getMode(): CreationAgentMode {
    const raw = String(
      this.configService.get<string>('CREATION_AGENT_MODE') || 'hybrid',
    )
      .trim()
      .toLowerCase();
    if (raw === 'off' || raw === 'full') return raw;
    return 'hybrid';
  }

  isOff() {
    return this.getMode() === 'off';
  }

  isHybrid() {
    return this.getMode() === 'hybrid';
  }

  isFull() {
    return this.getMode() === 'full';
  }

  shouldUseAgents() {
    return !this.isOff();
  }

  shouldFallbackAfterAgentError() {
    return this.isHybrid();
  }
}
