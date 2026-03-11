/**
 * 测试 Seedance Provider 的 AI 模型调用
 * 测试三种任务类型：
 * 1. LLM_CHAT - 文案拆分
 * 2. IMAGE_GEN - 首尾帧生成
 * 3. VIDEO_GEN - 视频渲染
 */

import { ConfigService } from '@nestjs/config';
import { SeedanceProvider } from '../src/infrastructure/ai-router/providers/seedance.provider';
import { AITaskType } from '../src/infrastructure/ai-router/ai-router.interface';

// 创建简单的 ConfigService 模拟
class TestConfigService {
  get(key: string): string | undefined {
    const env = process.env;
    switch (key) {
      case 'SEEDANCE_API_KEY':
        return env.SEEDANCE_API_KEY || env.SILICONFLOW_API_KEY || env.SEEDANCE_KEY || env.SILICONFLOW_KEY;
      case 'SEEDANCE_BASE_URL':
        return env.SEEDANCE_BASE_URL || env.SILICONFLOW_BASE_URL || 'https://api.siliconflow.cn/v1';
      case 'SILICONFLOW_MODEL_LLM':
        return 'deepseek-ai/DeepSeek-V3';
      case 'SILICONFLOW_MODEL_IMAGE':
        return 'black-forest-labs/FLUX.1-schnell';
      case 'SILICONFLOW_MODEL_VIDEO':
        return 'Wan-AI/Wan2.2-T2V-A14B';
      case 'SEEDANCE_POLL_INTERVAL_MS':
        return '3000';
      case 'SEEDANCE_MAX_POLL_ATTEMPTS':
        return '80';
      default:
        return undefined;
    }
  }
}

async function testLLMChat() {
  console.log('\n=== 测试 LLM_CHAT (文案拆分) ===');
  const configService = new TestConfigService() as any;
  const provider = new SeedanceProvider(configService);

  const testScript = '今天我学习了 Next.js 14 的新特性，包括服务器组件和更好的性能优化。首先介绍了 App Router 的改进，然后展示了 Server Actions 的用法，最后总结了性能提升的数据。';

  try {
    const result = await provider.execute(
      AITaskType.LLM_CHAT,
      {
        messages: [
          {
            role: 'user',
            content: `请将以下文案按镜头逻辑拆分为多个片段。每个片段应该是一个独立的场景或动作。

文案内容：
${testScript}

输出格式（JSON数组）：
[
  { "segment": "片段1文案", "prompt": "可用于生成视频的描述", "estimatedDuration": 3 },
  { "segment": "片段2文案", "prompt": "可用于生成视频的描述", "estimatedDuration": 5 },
  ...
]

请只返回JSON数组，不要包含其他文字。`,
          },
        ],
        temperature: 0.7,
      },
      process.env.SILICONFLOW_API_KEY || process.env.OPENAI_API_KEY || '',
    );

    console.log('LLM_CHAT 响应成功！');
    console.log('Content:', result.content);
    console.log('Usage:', result.usage);
    console.log('Model:', result.model);

    // 尝试解析 JSON
    try {
      const jsonMatch = result.content.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        const segments = JSON.parse(jsonMatch[0]);
        console.log('\n解析的片段数量:', segments.length);
        segments.forEach((seg: any, i: number) => {
          console.log(`  [${i + 1}] ${seg.segment}`);
          console.log(`      Prompt: ${seg.prompt}`);
          console.log(`      Duration: ${seg.estimatedDuration}s`);
        });
      }
    } catch (e) {
      console.log('JSON 解析失败，但 LLM 调用成功');
    }

    return { success: true, result };
  } catch (error: any) {
    console.error('LLM_CHAT 测试失败:', error.message);
    return { success: false, error: error.message };
  }
}

async function testImageGen() {
  console.log('\n=== 测试 IMAGE_GEN (首帧生成) ===');
  const configService = new TestConfigService() as any;
  const provider = new SeedanceProvider(configService);

  const prompt = '教学视频开场，讲解 Next.js 14 新特性概览，现代化的科技风格';

  try {
    const result = await provider.execute(
      AITaskType.IMAGE_GEN,
      {
        prompt,
        image_size: '1280x720',
        num_inference_steps: 4,
      },
      process.env.SILICONFLOW_API_KEY || process.env.OPENAI_API_KEY || '',
    );

    console.log('IMAGE_GEN 响应成功！');
    console.log('Image URL:', result.url || result.imageUrl);
    console.log('Images count:', result.images?.length || 0);

    return { success: true, result };
  } catch (error: any) {
    console.error('IMAGE_GEN 测试失败:', error.message);
    return { success: false, error: error.message };
  }
}

async function testVideoGen() {
  console.log('\n=== 测试 VIDEO_GEN (视频渲染) ===');
  const configService = new TestConfigService() as any;
  const provider = new SeedanceProvider(configService);

  const prompt = '演示 App Router 和 Server Actions 的具体用法，教学视频片段';

  try {
    const result = await provider.execute(
      AITaskType.VIDEO_GEN,
      {
        prompt,
        image_size: '1280x720',
        // 注意：实际使用时需要传入首尾帧
        // 这里仅测试 API 连接，不传入首尾帧
      },
      process.env.SILICONFLOW_API_KEY || process.env.OPENAI_API_KEY || '',
    );

    console.log('VIDEO_GEN 响应成功！');
    console.log('Video URL:', result.url || result.video_url);
    console.log('Videos count:', result.videos?.length || 0);
    console.log('Status:', result.status);
    console.log('Request ID:', result.requestId);

    return { success: true, result };
  } catch (error: any) {
    console.error('VIDEO_GEN 测试失败:', error.message);
    return { success: false, error: error.message };
  }
}

async function runTests() {
  console.log('========================================');
  console.log('  Seedance Provider 模型调用测试');
  console.log('========================================');

  // 使用统一的 API Key
  const apiKey = process.env.SILICONFLOW_API_KEY || process.env.OPENAI_API_KEY || '';
  console.log('API Key:', apiKey.substring(0, 15) + '...');
  console.log('Base URL:', process.env.SILICONFLOW_BASE_URL || process.env.SEEDANCE_BASE_URL || 'https://api.siliconflow.cn/v1');

  const results = {
    llm: await testLLMChat(),
    image: await testImageGen(),
    video: await testVideoGen(),
  };

  console.log('\n========================================');
  console.log('  测试结果汇总');
  console.log('========================================');
  console.log('LLM_CHAT (文案拆分):', results.llm.success ? '✅ 成功' : '❌ 失败');
  console.log('IMAGE_GEN (首帧生成):', results.image.success ? '✅ 成功' : '❌ 失败');
  console.log('VIDEO_GEN (视频渲染):', results.video.success ? '✅ 成功' : '❌ 失败');

  if (!results.llm.success) console.log('  LLM 错误:', results.llm.error);
  if (!results.image.success) console.log('  IMAGE 错误:', results.image.error);
  if (!results.video.success) console.log('  VIDEO 错误:', results.video.error);

  process.exit(results.llm.success && results.image.success && results.video.success ? 0 : 1);
}

runTests().catch((error) => {
  console.error('测试执行失败:', error);
  process.exit(1);
});
