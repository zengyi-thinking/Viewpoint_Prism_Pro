import { Injectable } from '@nestjs/common';
import { Prisma } from '../../../generated/prisma/client';
import { AiRouterService } from '../../infrastructure/ai-router/ai-router.service';
import { PrismaService } from '../../prisma/prisma.service';
import { UpdateSettingsDto } from './dto';

@Injectable()
export class SettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly aiRouter: AiRouterService,
  ) {}

  async getSettings(userId: string) {
    const settings = await this.prisma.userSettings.findUnique({
      where: { userId },
    });

    if (!settings) {
      return {
        userId,
        settings: null,
      };
    }

    return {
      userId,
      settings: this.toSafeSettings(settings),
    };
  }

  async updateSettings(userId: string, dto: UpdateSettingsDto) {
    const data = this.normalizeUpdateDto(dto);

    const updated = await this.prisma.userSettings.upsert({
      where: { userId },
      create: {
        userId,
        ...data,
      },
      update: {
        ...data,
      },
    });

    return {
      userId,
      settings: this.toSafeSettings(updated),
    };
  }

  getProviderKeyPoolStats() {
    return {
      providers: this.aiRouter.getProviderKeyPoolStats(),
      generatedAt: new Date().toISOString(),
    };
  }

  private normalizeUpdateDto(dto: UpdateSettingsDto) {
    const data: Record<string, unknown> = { ...dto };
    if (dto.providerConfigs !== undefined) {
      data.providerConfigs = dto.providerConfigs as Prisma.InputJsonValue;
    }
    return data;
  }

  private toSafeSettings(settings: any) {
    return {
      preferredAsr: settings.preferredAsr,
      preferredLlm: settings.preferredLlm,
      preferredImageGen: settings.preferredImageGen,
      preferredVideoGen: settings.preferredVideoGen,
      preferredTts: settings.preferredTts,
      hasOpenaiKey: Boolean(settings.openaiKey),
      hasGeminiKey: Boolean(settings.geminiKey),
      hasVolcengineKey: Boolean(settings.volcengineKey),
      hasAliyunAsrKey: Boolean(settings.aliyunAsrKey),
      hasMidjourneyKey: Boolean(settings.midjourneyKey),
      hasSeedanceKey: Boolean(settings.seedanceKey),
      hasElevenlabsKey: Boolean(settings.elevenlabsKey),
      hasNotionToken: Boolean(settings.notionToken),
      hasFeishuAppId: Boolean(settings.feishuAppId),
      hasFeishuAppSecret: Boolean(settings.feishuAppSecret),
      providerConfigs: settings.providerConfigs ?? null,
      updatedAt: settings.updatedAt,
    };
  }
}
