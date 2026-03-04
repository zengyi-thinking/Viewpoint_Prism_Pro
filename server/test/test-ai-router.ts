import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { AiRouterService } from '../src/infrastructure/ai-router/ai-router.service';
import { AITaskType } from '../src/infrastructure/ai-router/ai-router.interface';

async function testAIRouter() {
  console.log('========================================');
  console.log('AI Router 功能验证测试');
  console.log('========================================\n');

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: false,
  });

  const aiRouter = app.get(AiRouterService);

  // 测试 1: LLM 调用
  console.log('测试 1: LLM 文本生成...');
  try {
    const llmResult = await aiRouter.execute(
      AITaskType.LLM_CHAT,
      {
        messages: [
          { role: 'system', content: '你是一个测试助手。' },
          { role: 'user', content: '请用一句话介绍你自己。' },
        ],
        temperature: 0.7,
        maxTokens: 100,
      },
      'test-user-id',
    );
    console.log('✅ LLM 调用成功');
    console.log('   响应:', llmResult.text?.substring(0, 100) || '无响应');
  } catch (error) {
    console.log('❌ LLM 调用失败:', error);
  }

  // 测试 2: 思维导图生成
  console.log('\n测试 2: 思维导图生成...');
  try {
    const mindmapResult = await aiRouter.execute(
      AITaskType.LLM_CHAT,
      {
        messages: [
          {
            role: 'system',
            content: '你是一个思维导图生成助手。请根据以下内容生成JSON格式的思维导图结构，包含id、label、children字段。',
          },
          {
            role: 'user',
            content: '视频主题：人工智能基础\n内容：包括机器学习、深度学习、神经网络三个主要部分。',
          },
        ],
        temperature: 0.3,
        maxTokens: 500,
      },
      'test-user-id',
    );
    console.log('✅ 思维导图生成成功');
    console.log('   响应:', mindmapResult.text?.substring(0, 150) || '无响应');
  } catch (error) {
    console.log('❌ 思维导图生成失败:', error);
  }

  // 测试 3: 晶体卡片生成
  console.log('\n测试 3: 晶体卡片内容生成...');
  try {
    const cardResult = await aiRouter.execute(
      AITaskType.LLM_CHAT,
      {
        messages: [
          {
            role: 'system',
            content: '你是一个教学卡片生成助手。请根据视频内容生成简洁的概念卡片。',
          },
          {
            role: 'user',
            content: '视频内容：机器学习是人工智能的一个分支，它使计算机能够在没有明确编程的情况下学习。',
          },
        ],
        temperature: 0.5,
        maxTokens: 300,
      },
      'test-user-id',
    );
    console.log('✅ 晶体卡片内容生成成功');
    console.log('   响应:', cardResult.text?.substring(0, 150) || '无响应');
  } catch (error) {
    console.log('❌ 晶体卡片内容生成失败:', error);
  }

  await app.close();
  console.log('\n========================================');
  console.log('测试完成');
  console.log('========================================');
}

testAIRouter().catch((error) => {
  console.error('测试执行失败:', error);
  process.exit(1);
});
