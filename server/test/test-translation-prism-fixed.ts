/**
 * 测试翻译棱镜（Translation Prism）的 AI 模型调用
 * 测试以下任务类型：
 * 1. LLM_CHAT - 语言检测
 * 2. TRANSLATION - 字幕翻译
 *
 * 注意：
 * - ASR、MULTIMODAL、IMAGE_GEN 需要图像/视频文件
 * - TTS 不被 SeedanceProvider 支持
 * - VOICE_CLONE 需要 ElevenLabs API Key
 */

import { ConfigService } from '@nestjs/config';
import { SeedanceProvider } from '../src/infrastructure/ai-router/providers/seedance.provider';
import { AITaskType } from '../src/infrastructure/ai-router/ai-router.interface';

// 硬编码的 API Key（从 .env 文件中读取）
const SILICONFLOW_API_KEY = 'sk-eqzwkwakkbzkgbrcnlxrtbupgxxprpfzdqoqzperankekbit';
const SILICONFLOW_BASE_URL = 'https://api.siliconflow.cn/v1';

async function testLLMChat_LanguageDetection() {
  console.log('\n=== 测试 LLM_CHAT (语言检测) ===');

  try {
    const response = await fetch(`${SILICONFLOW_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SILICONFLOW_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'deepseek-ai/DeepSeek-V3',
        messages: [
          {
            role: 'system',
            content: 'You are a language detection expert. Analyze text and respond with ONLY language code (e.g., "zh", "en", "es", "fr"). Do not provide any explanation, only the language code.',
          },
          {
            role: 'user',
            content: 'Detect language of this text:\n\n你好，这是一个中文字符串。Hello, this is a string with mixed languages.',
          },
        ],
        temperature: 0.1,
        max_tokens: 10,
      }),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${await response.text()}`);
    }

    const result = await response.json();
    console.log('LLM_CHAT 响应成功！');
    console.log('Content:', result.choices?.[0]?.message?.content);
    console.log('Usage:', result.usage);

    return { success: true, result };
  } catch (error: any) {
    console.error('LLM_CHAT 测试失败:', error.message);
    return { success: false, error: error.message };
  }
}

async function testTranslation() {
  console.log('\n=== 测试 TRANSLATION (字幕翻译) ===');

  try {
    const response = await fetch(`${SILICONFLOW_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SILICONFLOW_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'deepseek-ai/DeepSeek-V3',
        messages: [
          {
            role: 'system',
            content: '你是一个专业的翻译助手。请将提供的文本翻译成目标语言，保持原文的语调和格式。',
          },
          {
            role: 'user',
            content: '请将以下文本翻译成英语：\n\n今天天气很好，我打算出去散步。Hello, the weather is nice today, I plan to go for a walk.',
          },
        ],
        temperature: 0.3,
      }),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${await response.text()}`);
    }

    const result = await response.json();
    console.log('TRANSLATION 响应成功！');
    console.log('Content:', result.choices?.[0]?.message?.content);
    console.log('Usage:', result.usage);

    // 解析翻译结果
    const translated = result.choices?.[0]?.message?.content || '';
    console.log('\n翻译结果:', translated);

    return { success: true, result };
  } catch (error: any) {
    console.error('TRANSLATION 测试失败:', error.message);
    return { success: false, error: error.message };
  }
}

async function runTests() {
  console.log('========================================');
  console.log('  翻译棱镜 AI 模型调用测试');
  console.log('========================================');

  console.log('API Key:', SILICONFLOW_API_KEY.substring(0, 15) + '...');
  console.log('Base URL:', SILICONFLOW_BASE_URL);

  const results = {
    llm: await testLLMChat_LanguageDetection(),
    translation: await testTranslation(),
  };

  console.log('\n========================================');
  console.log('  测试结果汇总');
  console.log('========================================');
  console.log('LLM_CHAT (语言检测):', results.llm.success ? '✅ 成功' : '❌ 失败');
  console.log('TRANSLATION (字幕翻译):', results.translation.success ? '✅ 成功' : '❌ 失败');

  if (!results.llm.success) console.log('  LLM 错误:', results.llm.error);
  if (!results.translation.success) console.log('  TRANSLATION 错误:', results.translation.error);

  console.log('\n========================================');
  console.log('  跳过的测试（需要其他条件）');
  console.log('========================================');
  console.log('ASR (字幕提取): 跳过 - 需要视频文件');
  console.log('MULTIMODAL (文字区域检测): 跳过 - 需要图像文件');
  console.log('IMAGE_GEN (画面修复): 跳过 - 需要图像文件');
  console.log('VOICE_CLONE (音色克隆): 跳过 - 需要 ElevenLabs API Key 和语音样本文件');
  console.log('TTS (预览音频): 跳过 - SeedanceProvider 不支持 TTS');

  process.exit(results.llm.success && results.translation.success ? 0 : 1);
}

runTests().catch((error) => {
  console.error('测试执行失败:', error);
  process.exit(1);
});
