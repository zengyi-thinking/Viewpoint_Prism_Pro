import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { UpdateSettingsDto } from './dto';

@Injectable()
export class SettingsService {
  constructor(private readonly prisma: PrismaService) {}

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
    const updated = await this.prisma.userSettings.upsert({
      where: { userId },
      create: {
        userId,
        ...dto,
      },
      update: {
        ...dto,
      },
    });

    return {
      userId,
      settings: this.toSafeSettings(updated),
    };
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
      updatedAt: settings.updatedAt,
    };
  }
}
