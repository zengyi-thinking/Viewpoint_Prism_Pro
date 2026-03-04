/**
 * AI 模型调用测试
 * 直接测试 SeedanceProvider 的各个 AI 任务类型
 */

import { SeedanceProvider } from '../src/infrastructure/ai-router/providers/seedance.provider';
import { AITaskType } from '../src/infrastructure/ai-router/ai-router.interface';

console.log('========================================');
console.log('  AI 模型调用测试');
console.log('========================================\n');

const apiKey = process.env.SILICONFLOW_API_KEY || '';
const baseUrl = process.env.SILICONFLOW_BASE_URL || 'https://api.siliconflow.cn/v1';

if (!apiKey) {
  console.error('❌ 错误: SILICONFLOW_API_KEY 环境变量未设置');
  console.log('\n请设置环境变量:');
  console.log('  export SILICONFLOW_API_KEY=your_api_key_here');
  console.log('  或在 .env 文件中设置: SILICONFLOW_API_KEY=your_api_key_here\n');
  process.exit(1);
}

console.log(`✓ API Key 已设置: ${apiKey.substring(0, 10)}...***`);
console.log(`✓ Base URL: ${baseUrl}\n`);

// 创建 SeedanceProvider 实例
const seedanceProvider = new SeedanceProvider({
  get: (key: string) => {
    const mapping: Record<string, any> = {
      SILICONFLOW_BASE_URL: baseUrl,
      SEEDANCE_BASE_URL: baseUrl,
      SILICONFLOW_MODEL_LLM: 'deepseek-ai/DeepSeek-V3',
      SILICONFLOW_MODEL_IMAGE: 'black-forest-labs/FLUX.1-schnell',
      SILICONFLOW_MODEL_VIDEO: 'Wan-AI/Wan2.2-T2V-A14B',
    };
    return mapping[key];
  },
} as any);

async function testConnection() {
  console.log('1. 测试连接...');
  try {
    const connected = await seedanceProvider.testConnection(apiKey);
    if (connected) {
      console.log('   ✓ 连接成功\n');
      return true;
    } else {
      console.log('   ✗ 连接失败\n');
      return false;
    }
  } catch (error: any) {
    console.log(`   ✗ 连接错误: ${error.message}\n`);
    return false;
  }
}

async function testTTS() {
  console.log('2. 测试 TTS (文字转语音)...');
  try {
    // 首先尝试不带 voice 参数
    const ttsResult = await seedanceProvider.execute(
      AITaskType.TTS,
      {
        text: '你好，这是一个测试。',
        responseFormat: 'mp3',
        sampleRate: 32000,
      },
      apiKey,
    );
    console.log('   ✓ TTS 成功');
    console.log(`   - 音频URL: ${ttsResult.audioUrl ? '已返回' : '未返回'}`);
    console.log(`   - 音频数据: ${ttsResult.audioData ? '已返回' : '未返回'}`);
    console.log(`   - 使用音色: ${ttsResult.voice}\n`);
    return true;
  } catch (error: any) {
    console.log(`   ✗ 失败: ${error.message}\n`);
    return false;
  }
}

async function testTranslation() {
  console.log('3. 测试 TRANSLATION (翻译)...');
  try {
    const translationResult = await seedanceProvider.execute(
      AITaskType.TRANSLATION,
      {
        targetLang: 'English',
        text: '你好，世界！这是一个翻译测试。',
      },
      apiKey,
    );
    console.log('   ✓ TRANSLATION 成功');
    console.log(`   - 翻译结果: ${translationResult.content}\n`);
    return true;
  } catch (error: any) {
    console.log(`   ✗ 失败: ${error.message}\n`);
    return false;
  }
}

async function testLLMChat() {
  console.log('4. 测试 LLM_CHAT (对话)...');
  try {
    const chatResult = await seedanceProvider.execute(
      AITaskType.LLM_CHAT,
      {
        systemPrompt: '你是一个友好的助手。',
        prompt: '请简单介绍一下人工智能。',
      },
      apiKey,
    );
    console.log('   ✓ LLM_CHAT 成功');
    console.log(`   - 回答: ${chatResult.content?.substring(0, 100)}...\n`);
    return true;
  } catch (error: any) {
    console.log(`   ✗ 失败: ${error.message}\n`);
    return false;
  }
}

async function testImageGen() {
  console.log('5. 测试 IMAGE_GEN (图片生成)...');
  try {
    const imageResult = await seedanceProvider.execute(
      AITaskType.IMAGE_GEN,
      {
        prompt: 'A beautiful sunset over the ocean, digital art style',
        image_size: '1024x1024',
        num_inference_steps: 4,
      },
      apiKey,
    );
    console.log('   ✓ IMAGE_GEN 成功');
    console.log(`   - 图片URL: ${imageResult.imageUrl || '未返回'}`);
    console.log(`   - 图片数量: ${imageResult.images?.length || 0}\n`);
    return true;
  } catch (error: any) {
    console.log(`   ✗ 失败: ${error.message}\n`);
    return false;
  }
}

async function main() {
  try {
    const results: Record<string, boolean> = {};

    // 测试连接
    results.connection = await testConnection();
    if (!results.connection) {
      console.log('❌ 连接测试失败，终止后续测试');
      process.exit(1);
    }

    // 测试 TTS
    results.tts = await testTTS();

    // 测试 TRANSLATION
    results.translation = await testTranslation();

    // 测试 LLM_CHAT
    results.llmChat = await testLLMChat();

    // 测试 IMAGE_GEN
    results.imageGen = await testImageGen();

    console.log('========================================');
    console.log('  测试结果汇总');
    console.log('========================================\n');

    console.log('测试项               状态');
    console.log('----------------------------------------');
    console.log(`连接测试             ${results.connection ? '✓ 通过' : '✗ 失败'}`);
    console.log(`TTS (文字转语音)     ${results.tts ? '✓ 通过' : '✗ 失败'}`);
    console.log(`TRANSLATION (翻译)   ${results.translation ? '✓ 通过' : '✗ 失败'}`);
    console.log(`LLM_CHAT (对话)      ${results.llmChat ? '✓ 通过' : '✗ 失败'}`);
    console.log(`IMAGE_GEN (图片生成) ${results.imageGen ? '✓ 通过' : '✗ 失败'}`);
    console.log('');

    const allPassed = Object.values(results).every(r => r);
    if (allPassed) {
      console.log('✓ 所有测试通过！');
      console.log('\n支持的 AI 任务类型:');
      console.log('  - ASR: 语音识别');
      console.log('  - TTS: 文字转语音');
      console.log('  - VOICE_CLONE: 音色克隆');
      console.log('  - TRANSLATION: 文本翻译');
      console.log('  - LLM_CHAT: 对话/文本生成');
      console.log('  - MULTIMODAL: 多模态理解');
      console.log('  - IMAGE_GEN: 图片生成');
      console.log('  - VIDEO_GEN: 视频生成');
    } else {
      console.log('⚠ 部分测试失败');
    }

    process.exit(allPassed ? 0 : 1);
  } catch (error: any) {
    console.error('\n❌ 测试出错:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

main();
