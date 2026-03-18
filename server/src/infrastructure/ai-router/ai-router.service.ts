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
// 创作主链路优先走 OpenAI-compatible 中转站，视频暂保留现有 Seedance 渲染链路。
const PROVIDER_MAPPING: Record<AITaskType, any[]> = {
  [AITaskType.ASR]: [WhisperProvider, OpenAIProvider, SeedanceProvider, GeminiProvider, VolcengineAsrProvider, AliyunAsrProvider],
  [AITaskType.LLM_CHAT]: [OpenAIProvider, SeedanceProvider, GeminiProvider],
  [AITaskType.MULTIMODAL]: [OpenAIProvider, SeedanceProvider, GeminiProvider],
  [AITaskType.IMAGE_GEN]: [OpenAIProvider, SeedanceProvider, GeminiProvider, MidjourneyProvider],
  [AITaskType.VIDEO_GEN]: [OpenAIProvider, SeedanceProvider],
  [AITaskType.TTS]: [OpenAIProvider, SeedanceProvider, GeminiProvider, ElevenLabsProvider],
  [AITaskType.VOICE_CLONE]: [ElevenLabsProvider],
  [AITaskType.TRANSLATION]: [OpenAIProvider, SeedanceProvider, GeminiProvider],
};

// Default provider preferences - 创作默认走新中转站，视频仍沿用现有能力。
const DEFAULT_PROVIDER_PREFERENCES: Record<AITaskType, string> = {
  [AITaskType.ASR]: 'whisper',
  [AITaskType.LLM_CHAT]: 'openai',
  [AITaskType.MULTIMODAL]: 'openai',
  [AITaskType.IMAGE_GEN]: 'openai',
  [AITaskType.VIDEO_GEN]: 'openai',
  [AITaskType.TTS]: 'openai',
  [AITaskType.VOICE_CLONE]: 'elevenlabs',
  [AITaskType.TRANSLATION]: 'openai',
};

@Injectable()
export class AiRouterService {
  private readonly logger = new Logger(AiRouterService.name);
  private readonly providerKeyCursor = new Map<string, number>();
  private readonly providerKeyStats = new Map<
    string,
    Map<
      string,
      {
        successCount: number;
        failureCount: number;
        lastSuccessAt: string | null;
        lastFailureAt: string | null;
        lastError: string | null;
      }
    >
  >();

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

          // Get API key candidates for this provider (BYOK first, then env pool)
          const apiKeys = this.getApiKeysForProvider(provider, userSettings);

          if (apiKeys.length === 0) {
            this.logger.warn(`No API key found for provider ${provider.name}, skipping`);
            lastError = new Error(`No API key found for provider ${provider.name}`);
            continue;
          }

          const orderedKeys = this.orderApiKeys(provider.name, apiKeys);
          let providerLastError: Error | null = null;

          for (let keyIndex = 0; keyIndex < orderedKeys.length; keyIndex += 1) {
            const apiKey = orderedKeys[keyIndex];
            try {
              if (orderedKeys.length > 1) {
                this.logger.log(
                  `Trying provider ${provider.name} key ${keyIndex + 1}/${orderedKeys.length} (${this.maskApiKey(apiKey)}) for ${taskType}`,
                );
              }

              const runtimePayload = this.applyUserProviderConfig(
                provider.name,
                taskType,
                payload,
                userSettings,
              );
              const result = await provider.execute(taskType, runtimePayload, apiKey);

              this.advanceKeyCursor(provider.name, apiKeys, apiKey);
              this.recordKeyResult(provider.name, apiKey, true, null);

              const duration = Date.now() - startTime;
              await this.logExecution(userId, taskType, provider.name, true, duration, null);

              return {
                ...result,
                provider: provider.name,
                duration,
              };
            } catch (error) {
              providerLastError =
                error instanceof Error ? error : new Error(String(error));
              this.recordKeyResult(
                provider.name,
                apiKey,
                false,
                providerLastError.message,
              );
              this.logger.warn(
                `Provider ${provider.name} key ${keyIndex + 1}/${orderedKeys.length} (${this.maskApiKey(apiKey)}) failed for ${taskType}: ${providerLastError.message}`,
              );
            }
          }

          lastError = providerLastError;
          continue;
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

  getProviderKeyPoolStats() {
    const providers = ['seedance', 'openai', 'gemini', 'midjourney', 'elevenlabs'];
    return providers.reduce<Record<string, unknown>>((acc, providerName) => {
      const keys = this.getEnvFallbackKeys(providerName);
      const cursor = this.providerKeyCursor.get(providerName) ?? 0;
      const statsByKey = this.providerKeyStats.get(providerName) ?? new Map();

      acc[providerName] = {
        poolSize: keys.length,
        nextCursor: keys.length > 0 ? cursor % keys.length : 0,
        keys: keys.map((key, index) => {
          const masked = this.maskApiKey(key);
          const stats = statsByKey.get(masked);
          return {
            index,
            maskedKey: masked,
            isNext: keys.length > 0 && index === (cursor % keys.length),
            successCount: stats?.successCount ?? 0,
            failureCount: stats?.failureCount ?? 0,
            lastSuccessAt: stats?.lastSuccessAt ?? null,
            lastFailureAt: stats?.lastFailureAt ?? null,
            lastError: stats?.lastError ?? null,
          };
        }),
      };

      return acc;
    }, {});
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

    const strictIsolation = this.isStrictIsolationEnabled();
    if (!strictIsolation) {
      return sorted;
    }

    // 严格隔离模式：只执行当前任务偏好的 Provider，不做跨服务商 fallback
    const preferredProvider = sorted.find((p) => p.name === userPreference);
    if (preferredProvider) {
      return [preferredProvider];
    }

    // 如果偏好 Provider 不支持该任务，回退到该任务的默认首位
    return sorted.length > 0 ? [sorted[0]] : [];
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
  private getApiKeysForProvider(provider: AIProvider, userSettings: any): string[] {
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
    if (typeof userKey === 'string' && userKey.trim()) {
      return [userKey.trim()];
    }

    return this.getEnvFallbackKeys(provider.name);
  }

  /**
   * Get user settings from database
   */
  private async getUserSettings(userId: string) {
    return this.prisma.userSettings.findUnique({
      where: { userId },
    });
  }

  private getEnvFallbackKeys(providerName: string): string[] {
    switch (providerName) {
      case 'openai':
      case 'whisper':
        return this.parseApiKeyPool(
          this.configService.get<string>('CREATION_AI_API_KEY'),
          this.configService.get<string>('CREATION_AI_API_KEYS'),
          this.configService.get<string>('OPENAI_KEY'),
          this.configService.get<string>('OPENAI_API_KEYS'),
          this.configService.get<string>('OPENAI_API_KEY'),
          this.configService.get<string>('OPENAI_PREMIUM_KEY'),
          this.configService.get<string>('OPENAI_PREMIUM_API_KEY'),
        );
      case 'gemini':
        return this.parseApiKeyPool(
          this.configService.get<string>('GEMINI_KEY'),
          this.configService.get<string>('GOOGLE_KEY'),
          this.configService.get<string>('GEMINI_API_KEYS'),
          this.configService.get<string>('GEMINI_API_KEY'),
          this.configService.get<string>('GOOGLE_API_KEY'),
        );
      case 'volcengine-asr':
        return this.parseApiKeyPool(
          this.configService.get<string>('VOLCENGINE_ASR_TOKEN'),
        );
      case 'aliyun-asr':
        return this.parseApiKeyPool(
          this.configService.get<string>('ALIYUN_ASR_ACCESS_KEY'),
        );
      case 'midjourney':
        return this.parseApiKeyPool(
          this.configService.get<string>('MIDJOURNEY_KEY'),
          this.configService.get<string>('MIDJOURNEY_API_KEYS'),
          this.configService.get<string>('MIDJOURNEY_API_KEY'),
        );
      case 'seedance':
        return this.parseApiKeyPool(
          this.configService.get<string>('SILICONFLOW_KEY'),
          this.configService.get<string>('SEEDANCE_KEY'),
          this.configService.get<string>('SILICONFLOW_API_KEYS'),
          this.configService.get<string>('SEEDANCE_API_KEYS'),
          this.configService.get<string>('SEEDANCE_API_KEY'),
          this.configService.get<string>('SILICONFLOW_API_KEY'),
        );
      case 'elevenlabs':
        return this.parseApiKeyPool(
          this.configService.get<string>('ELEVENLABS_KEY'),
          this.configService.get<string>('ELEVENLABS_PREMIUM_KEY'),
          this.configService.get<string>('ELEVENLABS_API_KEYS'),
          this.configService.get<string>('ELEVENLABS_API_KEY'),
          this.configService.get<string>('ELEVENLABS_PREMIUM_API_KEY'),
        );
      default:
        return [];
    }
  }

  private applyUserProviderConfig(
    providerName: string,
    taskType: AITaskType,
    payload: any,
    userSettings: any,
  ) {
    const providerConfig = this.getProviderRuntimeConfig(providerName, userSettings?.providerConfigs);
    if (!providerConfig) {
      return payload;
    }

    const modelKey = this.getModelSlotForTask(taskType);
    const overrideModel =
      modelKey && providerConfig.models && typeof providerConfig.models[modelKey] === 'string'
        ? String(providerConfig.models[modelKey]).trim()
        : '';
    const overrideBaseUrl =
      typeof providerConfig.baseUrl === 'string' ? providerConfig.baseUrl.trim() : '';

    return {
      ...payload,
      ...(overrideBaseUrl && !payload?.baseUrl ? { baseUrl: overrideBaseUrl } : {}),
      ...(overrideModel && !payload?.model ? { model: overrideModel } : {}),
    };
  }

  private getProviderRuntimeConfig(providerName: string, rawConfigs: unknown) {
    if (!rawConfigs || typeof rawConfigs !== 'object') {
      return null;
    }

    const configs = rawConfigs as Record<string, any>;
    const direct = configs[providerName];
    if (direct && typeof direct === 'object') {
      return direct as { baseUrl?: string; models?: Record<string, string> };
    }

    if (providerName === 'whisper') {
      const openaiConfig = configs.openai;
      if (openaiConfig && typeof openaiConfig === 'object') {
        return openaiConfig as { baseUrl?: string; models?: Record<string, string> };
      }
    }

    return null;
  }

  private getModelSlotForTask(taskType: AITaskType):
    | 'asr'
    | 'chat'
    | 'multimodal'
    | 'image'
    | 'video'
    | 'tts'
    | 'translation'
    | null {
    switch (taskType) {
      case AITaskType.ASR:
        return 'asr';
      case AITaskType.LLM_CHAT:
        return 'chat';
      case AITaskType.MULTIMODAL:
        return 'multimodal';
      case AITaskType.IMAGE_GEN:
        return 'image';
      case AITaskType.VIDEO_GEN:
        return 'video';
      case AITaskType.TTS:
      case AITaskType.VOICE_CLONE:
        return 'tts';
      case AITaskType.TRANSLATION:
        return 'translation';
      default:
        return null;
    }
  }

  private parseApiKeyPool(...rawValues: Array<string | undefined | null>): string[] {
    const keys = rawValues
      .flatMap((raw) =>
        String(raw || '')
          .split(/[\r\n,;\s]+/)
          .map((item) => item.trim())
          .filter(Boolean),
      )
      .filter((item) => item.startsWith('sk-'));

    return Array.from(new Set(keys));
  }

  private orderApiKeys(providerName: string, keys: string[]): string[] {
    if (keys.length <= 1) return keys;
    const cursor = this.providerKeyCursor.get(providerName) ?? 0;
    const start = ((cursor % keys.length) + keys.length) % keys.length;
    return [...keys.slice(start), ...keys.slice(0, start)];
  }

  private advanceKeyCursor(providerName: string, keys: string[], usedKey: string) {
    if (keys.length <= 1) return;
    const idx = keys.indexOf(usedKey);
    if (idx < 0) return;
    this.providerKeyCursor.set(providerName, (idx + 1) % keys.length);
  }

  private maskApiKey(apiKey: string) {
    const raw = String(apiKey || '').trim();
    if (raw.length <= 10) return `${raw.slice(0, 2)}***`;
    return `${raw.slice(0, 6)}...${raw.slice(-4)}`;
  }

  private recordKeyResult(
    providerName: string,
    apiKey: string,
    success: boolean,
    errorMessage: string | null,
  ) {
    const masked = this.maskApiKey(apiKey);
    const providerStats =
      this.providerKeyStats.get(providerName) ??
      new Map<
        string,
        {
          successCount: number;
          failureCount: number;
          lastSuccessAt: string | null;
          lastFailureAt: string | null;
          lastError: string | null;
        }
      >();

    if (!this.providerKeyStats.has(providerName)) {
      this.providerKeyStats.set(providerName, providerStats);
    }

    const current =
      providerStats.get(masked) ?? {
        successCount: 0,
        failureCount: 0,
        lastSuccessAt: null,
        lastFailureAt: null,
        lastError: null,
      };

    const now = new Date().toISOString();
    if (success) {
      current.successCount += 1;
      current.lastSuccessAt = now;
      current.lastError = null;
    } else {
      current.failureCount += 1;
      current.lastFailureAt = now;
      current.lastError = errorMessage;
    }

    providerStats.set(masked, current);
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

  private isStrictIsolationEnabled(): boolean {
    // 默认开启严格隔离，确保“选谁就只用谁”
    const raw = this.configService.get<string>('AI_ROUTER_STRICT_ISOLATION');
    if (raw == null || raw === '') return true;
    return raw !== 'false' && raw !== '0';
  }
}
