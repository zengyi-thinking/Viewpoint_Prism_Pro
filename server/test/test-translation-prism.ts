/**
 * 测试翻译棱镜（Translation Prism）的 AI 模型调用
 * 测试以下任务类型：
 * 1. LLM_CHAT - 语言检测
 * 2. TRANSLATION - 字幕翻译
 * 3. TTS - 预览音频生成
 *
 * 注意：ASR、MULTIMODAL、IMAGE_GEN、VOICE_CLONE 需要文件输入，暂不测试
 */

import { ConfigService } from '@nestjs/config';
import { SeedanceProvider } from '../src/infrastructure/ai-router/providers/seedance.provider';
import { AITaskType } from '../src/infrastructure/ai-router/ai-router.interface';

// 创建简单的 ConfigService 模拟
class TestConfigService {
  get(key: string): string | undefined {
    const env = process.env;
    const value = env[key];
    // 调试：打印实际获取的值
    if (value !== undefined) {
      console.log(`[Config] ${key} = ${value.substring(0, 20)}... (length: ${value.length})`);
    } else {
      console.log(`[Config] ${key} = undefined`);
    }

    switch (key) {
      case 'SILICONFLOW_API_KEY':
        return env.SILICONFLOW_API_KEY || env.SEEDANCE_API_KEY || 'sk-eqzwkwakkbzkgbrcnlxrtbupgxxprpfzdqoqzperankekbit';
      case 'SILICONFLOW_BASE_URL':
        return env.SILICONFLOW_BASE_URL || env.SEEDANCE_BASE_URL || 'https://api.siliconflow.cn/v1';
      case 'SEEDANCE_BASE_URL':
        return env.SEEDANCE_BASE_URL || 'https://api.siliconflow.cn/v1';
      case 'SEEDANCE_API_KEY':
        return env.SEEDANCE_API_KEY || env.SILICONFLOW_API_KEY || 'sk-eqzwkwakkbzkgbrcnlxrtbupgxxprpfzdqoqzperankekbit';
      case 'SILICONFLOW_MODEL_LLM':
        return 'deepseek-ai/DeepSeek-V3';
      case 'SEEDANCE_POLL_INTERVAL_MS':
        return '3000';
      case 'SEEDANCE_MAX_POLL_ATTEMPTS':
        return '80';
      default:
        return undefined;
    }
  }
}

async function testLLMChat_LanguageDetection() {
  console.log('\n=== 测试 LLM_CHAT (语言检测) ===');
  const configService = new TestConfigService() as any;
  const provider = new SeedanceProvider(configService);

  const sampleText = '你好，这是一个中文字符串。Hello, this is a string with mixed languages.';

  try {
    const result = await provider.execute(
      AITaskType.LLM_CHAT,
      {
        messages: [
          {
            role: 'system',
            content: 'You are a language detection expert. Analyze text and respond with ONLY the language code (e.g., "zh", "en", "es", "fr"). Do not provide any explanation, only the language code.',
          },
          {
            role: 'user',
            content: `Detect language of this text:\n\n${sampleText}`,
          },
        ],
        temperature: 0.1,
        maxTokens: 10,
      },
      process.env.SILICONFLOW_API_KEY || '',
    );

    console.log('LLM_CHAT 响应成功！');
    console.log('Content:', result.content);
    console.log('Usage:', result.usage);
    console.log('Model:', result.model);

    return { success: true, result };
  } catch (error: any) {
    console.error('LLM_CHAT 测试失败:', error.message);
    return { success: false, error: error.message };
  }
}

async function testTranslation() {
  console.log('\n=== 测试 TRANSLATION (字幕翻译) ===');
  const configService = new TestConfigService() as any;
  const provider = new SeedanceProvider(configService);

  const sourceText = '今天天气很好，我打算出去散步。Hello, the weather is nice today, I plan to go for a walk.';

  try {
    const result = await provider.execute(
      AITaskType.TRANSLATION,
      {
        text: sourceText,
        sourceLang: 'auto',
        targetLang: 'en',
        preserveFormat: true,
      },
      process.env.SILICONFLOW_API_KEY || '',
    );

    console.log('TRANSLATION 响应成功！');
    console.log('Content:', result.content);
    console.log('Usage:', result.usage);
    console.log('Model:', result.model);

    // 尝试解析翻译结果
    try {
      if (typeof result.content === 'string') {
        const translated = result.content.trim();
        console.log('\n翻译结果:', translated);
      }
    } catch (parseError) {
      console.log('解析翻译结果失败:', parseError);
    }

    return { success: true, result };
  } catch (error: any) {
    console.error('TRANSLATION 测试失败:', error.message);
    return { success: false, error: error.message };
  }
}

async function testTTS() {
  console.log('\n=== 测试 TTS (预览音频生成) ===');
  const configService = new TestConfigService() as any;
  const provider = new SeedanceProvider(configService);

  const testText = '你好，这是语音合成的测试文本。Hello, this is a text-to-speech test.';

  try {
    const result = await provider.execute(
      AITaskType.TTS,
      {
        text: testText,
        voice: 'default',
        language: 'zh',
        outputFormat: 'mp3',
      },
      process.env.SILICONFLOW_API_KEY || '',
    );

    console.log('TTS 响应成功！');
    console.log('Audio URL:', result.url || result.audioUrl || result.audio);
    console.log('Usage:', result.usage);
    console.log('Model:', result.model);

    return { success: true, result };
  } catch (error: any) {
    console.error('TTS 测试失败:', error.message);
    return { success: false, error: error.message };
  }
}

async function runTests() {
  console.log('========================================');
  console.log('  翻译棱镜 AI 模型调用测试');
  console.log('========================================');

  // 使用统一的 API Key
  const apiKey = process.env.SILICONFLOW_API_KEY || '';
  console.log('API Key:', apiKey.substring(0, 15) + '...');
  console.log('Base URL:', process.env.SILICONFLOW_BASE_URL || 'https://api.siliconflow.cn/v1');

  const results = {
    llm: await testLLMChat_LanguageDetection(),
    translation: await testTranslation(),
    tts: await testTTS(),
  };

  console.log('\n========================================');
  console.log('  测试结果汇总');
  console.log('========================================');
  console.log('LLM_CHAT (语言检测):', results.llm.success ? '✅ 成功' : '❌ 失败');
  console.log('TRANSLATION (字幕翻译):', results.translation.success ? '✅ 成功' : '❌ 失败');
  console.log('TTS (预览音频):', results.tts.success ? '✅ 成功' : '❌ 失败');

  if (!results.llm.success) console.log('  LLM 错误:', results.llm.error);
  if (!results.translation.success) console.log('  TRANSLATION 错误:', results.translation.error);
  if (!results.tts.success) console.log('  TTS 错误:', results.tts.error);

  console.log('\n========================================');
  console.log('  跳过的测试（需要文件输入）');
  console.log('========================================');
  console.log('ASR (字幕提取): 跳过 - 需要视频文件');
  console.log('MULTIMODAL (文字区域检测): 跳过 - 需要图像文件');
  console.log('IMAGE_GEN (画面修复): 跳过 - 需要图像文件');
  console.log('VOICE_CLONE (音色克隆): 跳过 - 需要 ElevenLabs API Key 和语音样本文件');

  process.exit(results.llm.success && results.translation.success && results.tts.success ? 0 : 1);
}

runTests().catch((error) => {
  console.error('测试执行失败:', error);
  process.exit(1);
});
