import { Injectable, Logger } from '@nestjs/common';
import { AITaskType, AIProvider } from './ai-router.interface';
import { OpenAIProvider } from './providers/openai.provider';
import { GeminiProvider } from './providers/gemini.provider';
import { WhisperProvider } from './providers/whisper.provider';
import { VolcengineAsrProvider } from './providers/volcengine-asr.provider';
import { AliyunAsrProvider } from './providers/aliyun-asr.provider';
import { MidjourneyProvider } from './providers/midjourney.provider';
import { SeedanceProvider } from './providers/seedance.provider';
import { ElevenLabsProvider } from './providers/elevenlabs.provider';
import { PrismaService } from '../../prisma/prisma.service';
import { ConfigService } from '@nestjs/config';

// Task type to provider class mappings (using constructor types)
const PROVIDER_MAPPING: Record<AITaskType, any[]> = {
  [AITaskType.ASR]: [WhisperProvider, VolcengineAsrProvider, AliyunAsrProvider],
  [AITaskType.LLM_CHAT]: [OpenAIProvider, GeminiProvider],
  [AITaskType.MULTIMODAL]: [OpenAIProvider, GeminiProvider],
  [AITaskType.IMAGE_GEN]: [MidjourneyProvider, OpenAIProvider],
  [AITaskType.VIDEO_GEN]: [SeedanceProvider],
  [AITaskType.TTS]: [ElevenLabsProvider, OpenAIProvider],
  [AITaskType.VOICE_CLONE]: [ElevenLabsProvider],
  [AITaskType.TRANSLATION]: [OpenAIProvider, GeminiProvider],
};

// Default provider preferences
const DEFAULT_PROVIDER_PREFERENCES: Record<AITaskType, string> = {
  [AITaskType.ASR]: 'whisper',
  [AITaskType.LLM_CHAT]: 'openai',
  [AITaskType.MULTIMODAL]: 'openai',
  [AITaskType.IMAGE_GEN]: 'midjourney',
  [AITaskType.VIDEO_GEN]: 'seedance',
  [AITaskType.TTS]: 'elevenlabs',
  [AITaskType.VOICE_CLONE]: 'elevenlabs',
  [AITaskType.TRANSLATION]: 'openai',
};

@Injectable()
export class AiRouterService {
  private readonly logger = new Logger(AiRouterService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly openaiProvider: OpenAIProvider,
    private readonly geminiProvider: GeminiProvider,
    private readonly whisperProvider: WhisperProvider,
    private readonly volcengineAsrProvider: VolcengineAsrProvider,
    private readonly aliyunAsrProvider: AliyunAsrProvider,
    private readonly midjourneyProvider: MidjourneyProvider,
    private readonly seedanceProvider: SeedanceProvider,
    private readonly elevenlabsProvider: ElevenLabsProvider,
  ) {}

  /**
   * Execute an AI task with automatic provider selection and fallback
   * @param taskType - The type of AI task
   * @param payload - Task-specific payload
   * @param userId - User ID for BYOK key lookup
   * @returns Task result
   */
  async execute(taskType: AITaskType, payload: any, userId: string): Promise<any> {
    const startTime = Date.now();

    this.logger.log(`Executing ${taskType} for user ${userId}`);

    try {
      // Get user's provider preferences and API keys
      const userSettings = await this.getUserSettings(userId);

      // Determine provider order based on user preference and fallback
      const providerOrder = this.resolveProviderOrder(taskType, userSettings);

      // Try each provider in order until one succeeds
      let lastError: Error | null = null;

      for (const provider of providerOrder) {
        try {
          this.logger.log(`Trying provider ${provider.name} for ${taskType}`);

          // Get API key for this provider (BYOK)
          const apiKey = this.getApiKeyForProvider(provider, userSettings);

          if (!apiKey) {
            this.logger.warn(`No API key found for provider ${provider.name}, skipping`);
            continue;
          }

          // Execute the task
          const result = await provider.execute(taskType, payload, apiKey);

          // Log successful execution
          const duration = Date.now() - startTime;
          await this.logExecution(userId, taskType, provider.name, true, duration, null);

          // Return result with provider info
          return {
            ...result,
            provider: provider.name,
            duration,
          };
        } catch (error) {
          lastError = error;
          this.logger.warn(`Provider ${provider.name} failed for ${taskType}: ${error.message}`);
          // Continue to next provider
        }
      }

      // All providers failed
      const duration = Date.now() - startTime;
      await this.logExecution(userId, taskType, 'none', false, duration, lastError?.message || null);

      throw new Error(
        `All providers failed for ${taskType}. Last error: ${lastError?.message || 'Unknown error'}`,
      );
    } catch (error) {
      this.logger.error(`Failed to execute ${taskType} for user ${userId}: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Test connection to a provider
   * @param providerName - Provider name to test
   * @param apiKey - API key to use for testing
   * @returns True if connection successful
   */
  async testConnection(providerName: string, apiKey: string): Promise<boolean> {
    const provider = this.getProviderByName(providerName);

    if (!provider) {
      throw new Error(`Unknown provider: ${providerName}`);
    }

    try {
      return await provider.testConnection(apiKey);
    } catch (error) {
      this.logger.error(`Connection test failed for ${providerName}: ${error.message}`);
      return false;
    }
  }

  /**
   * Get usage statistics for a user
   * @param userId - User ID
   * @param startDate - Optional start date filter
   * @param endDate - Optional end date filter
   * @returns Usage statistics
   */
  async getUsageStats(userId: string, startDate?: Date, endDate?: Date) {
    // This would query a usage logs table
    // For now, return empty stats
    return {
      totalCalls: 0,
      byTaskType: {},
      byProvider: {},
      costs: {},
    };
  }

  /**
   * Resolve provider execution order based on user preferences
   */
  private resolveProviderOrder(taskType: AITaskType, userSettings: any): AIProvider[] {
    // Get user's preferred provider for this task type
    const userPreference = this.getUserPreferenceForTask(taskType, userSettings);

    // Get all available providers for this task type
    const availableProviders = PROVIDER_MAPPING[taskType] || [];

    // Sort providers: user preference first, then by default order
    const providers = this.getAllProviders();

    const sorted = availableProviders
      .map((ProviderClass) => {
        // Find the provider instance
        return providers.find((p) => p instanceof ProviderClass);
      })
      .filter((p): p is AIProvider => p !== undefined)
      .sort((a, b) => {
        // User preference first
        if (a.name === userPreference) return -1;
        if (b.name === userPreference) return 1;

        // Then default preference
        const defaultPref = DEFAULT_PROVIDER_PREFERENCES[taskType];
        if (a.name === defaultPref) return -1;
        if (b.name === defaultPref) return 1;

        return 0;
      });

    return sorted;
  }

  /**
   * Get user's preferred provider for a task type
   */
  private getUserPreferenceForTask(taskType: AITaskType, userSettings: any): string {
    const preferenceMap: Record<AITaskType, keyof any> = {
      [AITaskType.ASR]: 'preferredAsr',
      [AITaskType.LLM_CHAT]: 'preferredLlm',
      [AITaskType.MULTIMODAL]: 'preferredLlm', // Use LLM preference
      [AITaskType.IMAGE_GEN]: 'preferredImageGen',
      [AITaskType.VIDEO_GEN]: 'preferredVideoGen',
      [AITaskType.TTS]: 'preferredTts',
      [AITaskType.VOICE_CLONE]: 'preferredTts', // Use TTS preference
      [AITaskType.TRANSLATION]: 'preferredLlm', // Use LLM preference
    };

    const preferenceKey = preferenceMap[taskType];
    return userSettings?.[preferenceKey] || DEFAULT_PROVIDER_PREFERENCES[taskType];
  }

  /**
   * Get API key for a provider from user settings
   */
  private getApiKeyForProvider(provider: AIProvider, userSettings: any): string | null {
    const apiKeyMap: Record<string, keyof any> = {
      openai: 'openaiKey',
      gemini: 'geminiKey',
      whisper: 'openaiKey', // Whisper uses OpenAI key
      'volcengine-asr': 'volcengineKey',
      'aliyun-asr': 'aliyunAsrKey',
      midjourney: 'midjourneyKey',
      seedance: 'seedanceKey',
      elevenlabs: 'elevenlabsKey',
    };

    const key = apiKeyMap[provider.name];
    const userKey = key ? userSettings?.[key] : null;
    if (userKey) return userKey;

    return this.getEnvFallbackKey(provider.name);
  }

  /**
   * Get user settings from database
   */
  private async getUserSettings(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { settings: true },
    });

    return user?.settings || null;
  }

  private getEnvFallbackKey(providerName: string): string | null {
    switch (providerName) {
      case 'openai':
      case 'whisper':
        return (
          this.configService.get<string>('OPENAI_API_KEY') ||
          this.configService.get<string>('SILICONFLOW_API_KEY') ||
          this.configService.get<string>('OPENAI_PREMIUM_API_KEY') ||
          null
        );
      case 'gemini':
        return (
          this.configService.get<string>('GEMINI_API_KEY') ||
          this.configService.get<string>('GOOGLE_API_KEY') ||
          null
        );
      case 'volcengine-asr':
        return this.configService.get<string>('VOLCENGINE_ASR_TOKEN') || null;
      case 'aliyun-asr':
        return this.configService.get<string>('ALIYUN_ASR_ACCESS_KEY') || null;
      case 'midjourney':
        return this.configService.get<string>('MIDJOURNEY_API_KEY') || null;
      case 'seedance':
        return (
          this.configService.get<string>('SEEDANCE_API_KEY') ||
          this.configService.get<string>('SILICONFLOW_API_KEY') ||
          this.configService.get<string>('OPENAI_API_KEY') ||
          null
        );
      case 'elevenlabs':
        return (
          this.configService.get<string>('ELEVENLABS_API_KEY') ||
          this.configService.get<string>('ELEVENLABS_PREMIUM_API_KEY') ||
          null
        );
      default:
        return null;
    }
  }

  /**
   * Get all provider instances
   */
  private getAllProviders(): AIProvider[] {
    return [
      this.openaiProvider,
      this.geminiProvider,
      this.whisperProvider,
      this.volcengineAsrProvider,
      this.aliyunAsrProvider,
      this.midjourneyProvider,
      this.seedanceProvider,
      this.elevenlabsProvider,
    ];
  }

  /**
   * Get provider by name
   */
  private getProviderByName(name: string): AIProvider | undefined {
    const providers = this.getAllProviders();
    return providers.find((p) => p.name === name);
  }

  /**
   * Log execution to database for usage tracking
   */
  private async logExecution(
    userId: string,
    taskType: AITaskType,
    provider: string,
    success: boolean,
    duration: number,
    error: string | null,
  ) {
    try {
      // In a real implementation, this would insert into a usage_logs table
      // For now, just log
      this.logger.log(
        `Execution logged: user=${userId}, task=${taskType}, provider=${provider}, success=${success}, duration=${duration}ms`,
      );
    } catch (error) {
      this.logger.error(`Failed to log execution: ${error.message}`);
    }
  }
}
