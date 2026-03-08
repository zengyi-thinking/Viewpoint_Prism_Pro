import 'reflect-metadata';
import * as dotenv from 'dotenv';
import { ConfigService } from '@nestjs/config';
import { SeedanceProvider } from '../src/infrastructure/ai-router/providers/seedance.provider';
import { AITaskType } from '../src/infrastructure/ai-router/ai-router.interface';
import { PromptEngineService } from '../src/modules/prism-creation/services/prompt-engine.service';

dotenv.config({ path: '.env' });
dotenv.config({ path: 'server/.env' });

type Bundle = {
  scriptSegment: string;
  videoPrompt: string;
  sceneFramePrompt: string;
  firstFramePrompt: string;
  lastFramePrompt: string;
};

function scorePrompt(bundle: Bundle) {
  const text = `${bundle.videoPrompt}\n${bundle.sceneFramePrompt}\n${bundle.firstFramePrompt}\n${bundle.lastFramePrompt}`;
  const checks = {
    subject: /(人物|主角|角色|主体|少年|女子|产品|subject)/i.test(text),
    environment: /(场景|环境|街道|小镇|房间|城市|空间|夜色|setting)/i.test(text),
    action: /(走近|转身|抬头|回望|停顿|推进|跟随|动作|move|track|pan|zoom)/i.test(text),
    camera: /(镜头|构图|中景|近景|远景|俯拍|仰拍|跟拍|推镜|拉镜|camera|close-up|wide shot)/i.test(text),
    lighting: /(光线|暖光|冷光|月光|逆光|侧光|布光|lighting)/i.test(text),
    continuity: /(连续性|延续上一镜头|承接上一镜头|上一镜头)/i.test(text),
  };
  const passed = Object.values(checks).filter(Boolean).length;
  return {
    checks,
    score: Math.round((passed / Object.keys(checks).length) * 100),
  };
}

async function main() {
  const configService = new ConfigService(process.env as Record<string, string>);
  const promptEngine = new PromptEngineService();
  const provider = new SeedanceProvider(configService);
  const apiKey = process.env.SILICONFLOW_API_KEY || process.env.SEEDANCE_API_KEY || '';
  const imageModel =
    process.env.SILICONFLOW_MODEL_IMAGE ||
    process.env.GEMINI_MODEL_IMAGE ||
    'black-forest-labs/FLUX.1-schnell';
  const videoModel =
    process.env.SILICONFLOW_MODEL_VIDEO ||
    process.env.GEMINI_MODEL_VIDEO ||
    '';
  const i2vModel =
    process.env.SILICONFLOW_MODEL_VIDEO_I2V ||
    (videoModel.includes('-T2V-') ? videoModel.replace(/-T2V-/i, '-I2V-') : '') ||
    'Wan-AI/Wan2.2-I2V-A14B';
  if (!apiKey) {
    throw new Error('Missing SILICONFLOW_API_KEY / SEEDANCE_API_KEY');
  }

  const opening = promptEngine.normalizeBundle({
    idea: '夜色中的江湖少年在带有赛博霓虹的古镇茶馆初遇神秘AI女子',
    tone: 'fantasy',
  });
  const followUp = promptEngine.normalizeBundle({
    idea: '少年迟疑后跟随女子走入灯火摇曳的小镇深处，气氛从好奇转向危险',
    tone: 'fantasy',
    current: {
      scriptSegment: opening.scriptSegment,
      prompt: opening.videoPrompt,
      orderIndex: 0,
    },
  });

  const openingScore = scorePrompt(opening);
  const followScore = scorePrompt(followUp);

  const result: Record<string, unknown> = {
    generatedAt: new Date().toISOString(),
    openingScore,
    followScore,
    imageModel,
    videoModel,
    i2vModel,
    opening,
    followUp,
  };

  const imagePrompt = followUp.sceneFramePrompt;
  const modelImagePrompt = promptEngine.toImageModelPrompt(imagePrompt, imageModel);
  const modelVideoPrompt = promptEngine.toVideoModelPrompt(followUp.videoPrompt, videoModel);
  result.modelOptimizedPrompts = {
    image: modelImagePrompt,
    video: modelVideoPrompt,
  };
  const imageResult = await provider.execute(
    AITaskType.IMAGE_GEN,
    {
      model: imageModel,
      prompt: modelImagePrompt,
      image_size: '1280x720',
      num_inference_steps: 12,
    },
    apiKey,
  );

  const imageUrl = imageResult?.url || imageResult?.imageUrl;
  result.imageUrl = imageUrl;

  if (imageUrl) {
    const judge = await provider.execute(
      AITaskType.MULTIMODAL,
      {
        imageUrl,
        prompt: [
          '请根据这张图和目标提示词做一致性评估，只返回 JSON。',
          '字段：subjectAlignment, environmentAlignment, cameraAlignment, continuityAlignment, overall, summary。',
          '分值范围 0-100。',
          `目标提示词：${modelImagePrompt}`,
          `上一镜头连续性要求：${promptEngine.toVideoModelPrompt(opening.lastFramePrompt, videoModel)}`,
        ].join('\n'),
        temperature: 0.2,
      },
      apiKey,
    );

    const judgeContent = (judge?.content || '').trim();
    result.imageAlignment = judgeContent;
  }

  if (process.env.RUN_CREATION_VIDEO_TEST === '1' && imageUrl) {
    try {
      const firstFrameUrl = imageUrl;
      const lastFrameResult = await provider.execute(
        AITaskType.IMAGE_GEN,
        {
          model: imageModel,
          prompt: promptEngine.toImageModelPrompt(followUp.lastFramePrompt, imageModel),
          image_size: '1280x720',
          num_inference_steps: 12,
        },
        apiKey,
      );
      const lastFrameUrl = lastFrameResult?.url || lastFrameResult?.imageUrl;
      result.videoTestFrames = { firstFrameUrl, lastFrameUrl };
      if (lastFrameUrl) {
        const video = await provider.execute(
          AITaskType.VIDEO_GEN,
          {
            firstFrameUrl,
            lastFrameUrl,
            model: i2vModel || undefined,
            prompt: promptEngine.toVideoModelPrompt(followUp.videoPrompt, videoModel),
            duration: 5,
          },
          apiKey,
        );
        result.videoTest = {
          url: video?.url || video?.video_url || null,
          provider: video?.provider || 'seedance',
        };
      }
    } catch (error) {
      result.videoTest = { error: error instanceof Error ? error.message : String(error) };
    }
  }

  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
