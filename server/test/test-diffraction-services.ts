/**
 * 衍射棱镜（Diffraction Prism）服务层测试
 *
 * 直接测试服务层逻辑，不依赖 API 路由
 */

import { PrismaService } from '../src/prisma/prisma.service';
import { DiffractionService } from '../src/modules/prism-diffraction/diffraction.service';
import { ImageSelectService } from '../src/modules/prism-diffraction/services/image-select.service';
import { CopywritingService } from '../src/modules/prism-diffraction/services/copywriting.service';
import { BatchExportService } from '../src/modules/prism-diffraction/services/batch-export.service';
import { PlatformTemplateService } from '../src/modules/prism-diffraction/services/platform-template.service';
import { AiRouterService } from '../src/infrastructure/ai-router/ai-router.service';
import { FfmpegService } from '../src/infrastructure/media/ffmpeg.service';
import { StorageService } from '../src/infrastructure/storage/storage.service';

// 测试用户 ID 和视频 ID（需要根据实际情况修改）
const TEST_USER_ID = 'test-user-id';
const TEST_VIDEO_ID = 'test-video-id';

/**
 * 测试 1: PlatformTemplateService - 获取平台模板
 */
async function testPlatformTemplateService(platformTemplateService: PlatformTemplateService) {
  console.log('\n=== 测试 1: PlatformTemplateService - 获取平台模板 ===');

  const platforms = ['xiaohongshu', 'twitter_x', 'newsletter', 'linkedin', 'instagram'];

  for (const platform of platforms) {
    try {
      const templates = await platformTemplateService.getTemplates(platform);
      console.log(`✅ ${platform}:`, templates.map(t => t.name).join(', '));
    } catch (error: any) {
      console.error(`❌ ${platform} 失败:`, error.message);
    }
  }
}

/**
 * 测试 2: ImageSelectService - 关键帧提取（需要实际视频）
 */
async function testImageSelectService(
  imageSelectService: ImageSelectService,
  videoPath?: string
) {
  console.log('\n=== 测试 2: ImageSelectService - 关键帧提取 ===');

  if (!videoPath) {
    console.log('⏭️  跳过：需要提供实际视频路径');
    return;
  }

  try {
    const frames = await imageSelectService.extractKeyFrames(videoPath, 120, 12);
    console.log(`✅ 提取了 ${frames.length} 帧关键帧`);
    console.log('- 前3帧质量评分:');
    frames.slice(0, 3).forEach((frame, i) => {
      console.log(`  ${i + 1}. 时间: ${frame.timestamp}s, 质量: ${frame.qualityScore}`);
    });
  } catch (error: any) {
    console.error('❌ 失败:', error.message);
  }
}

/**
 * 测试 3: CopywritingService - 文案生成
 */
async function testCopywritingService(copywritingService: CopywritingService) {
  console.log('\n=== 测试 3: CopywritingService - 文案生成 ===');

  const platforms = [
    'xiaohongshu' as const,
    'twitter_x' as const,
    'newsletter' as const,
  ];

  for (const platform of platforms) {
    try {
      console.log(`\n--- 测试平台: ${platform} ---`);

      const result = await copywritingService.generateCopywriting(TEST_USER_ID, {
        videoId: TEST_VIDEO_ID,
        platform,
        selectedFrames: [
          'https://example.com/frame1.jpg',
          'https://example.com/frame2.jpg',
          'https://example.com/frame3.jpg',
        ],
        styleHints: '自然、真实、生活化',
        previousDraftId: undefined,
      });

      console.log(`✅ ${platform} 文案生成成功:`);
      console.log(`- 草稿 ID: ${result.platformDraftId}`);
      console.log(`- 内容长度: ${result.generatedContent.length} 字符`);
      console.log(`- 建议数量: ${result.suggestions?.length || 0}`);

      // 显示部分生成内容
      const preview = result.generatedContent.substring(0, 200);
      console.log(`- 内容预览: ${preview}...`);
    } catch (error: any) {
      console.error(`❌ ${platform} 失败:`, error.message);
    }
  }
}

/**
 * 测试 4: BatchExportService - 批量导出
 */
async function testBatchExportService(
  batchExportService: BatchExportService
) {
  console.log('\n=== 测试 4: BatchExportService - 批量导出 ===');

  try {
    const result = await batchExportService.generateAssets(TEST_USER_ID, {
      videoId: TEST_VIDEO_ID,
      platforms: ['xiaohongshu', 'twitter_x'],
      draftIds: undefined,
    });

    console.log('✅ 批量导出成功:');
    console.log(`- 导出包数量: ${result.length}`);
    result.forEach((pkg) => {
      console.log(`- ${pkg.platform}:`);
      console.log(`  - 任务 ID: ${pkg.taskId}`);
      console.log(`  - 图片数量: ${pkg.assets.images.length}`);
      console.log(`  - 文案长度: ${pkg.assets.copywriting.length} 字符`);
      console.log(`  - 数据文件: ${pkg.assets.dataFileUrl}`);
    });
  } catch (error: any) {
    console.error('❌ 失败:', error.message);
  }
}

/**
 * 测试 5: DiffractionService - 完整工作流
 */
async function testDiffractionService(diffractionService: DiffractionService) {
  console.log('\n=== 测试 5: DiffractionService - 完整工作流 ===');

  // 5.1 测试生成
  try {
    console.log('\n--- 测试生成功能 ---');
    const generateResult = await diffractionService.generate(TEST_USER_ID, TEST_VIDEO_ID, {
      platforms: ['xiaohongshu'],
      tone: '自然',
      audience: '年轻女性',
    });

    console.log('✅ 生成成功:');
    console.log(`- 任务 ID: ${generateResult.taskId}`);
    console.log(`- 状态: ${generateResult.status}`);
  } catch (error: any) {
    console.error('❌ 生成失败:', error.message);
  }

  // 5.2 测试批量导出
  try {
    console.log('\n--- 测试批量导出功能 ---');
    const exportResult = await diffractionService.batchExport(TEST_USER_ID, TEST_VIDEO_ID, {
      platforms: ['xiaohongshu', 'twitter_x'],
      format: 'zip',
    });

    console.log('✅ 批量导出成功:');
    console.log(`- 任务 ID: ${exportResult.taskId}`);
    console.log(`- 状态: ${exportResult.status}`);
  } catch (error: any) {
    console.error('❌ 批量导出失败:', error.message);
  }

  // 5.3 测试获取草稿
  try {
    console.log('\n--- 测试获取草稿功能 ---');
    const draftsResult = await diffractionService.getDrafts(TEST_USER_ID, TEST_VIDEO_ID);
    console.log('✅ 获取草稿成功:');
    console.log(`- 草稿数量: ${draftsResult.drafts.length}`);
    draftsResult.drafts.forEach((draft, i) => {
      console.log(`  ${i + 1}. ${draft.platform}: ${draft.title} (${draft.isPublished ? '已发布' : '草稿'})`);
    });
  } catch (error: any) {
    console.error('❌ 获取草稿失败:', error.message);
  }
}

/**
 * 测试 6: 验证平台 Prompt 模板
 */
async function testPlatformPrompts() {
  console.log('\n=== 测试 6: 验证平台 Prompt 模板 ===');

  const platformTemplateService = new PlatformTemplateService();

  const xiaohongshuTemplates = await platformTemplateService.getTemplates('xiaohongshu');
  console.log('✅ 小红书模板:', xiaohongshuTemplates.map(t => t.name));

  const twitterTemplates = await platformTemplateService.getTemplates('twitter_x');
  console.log('✅ Twitter 模板:', twitterTemplates.map(t => t.name));

  const newsletterTemplates = await platformTemplateService.getTemplates('newsletter');
  console.log('✅ Newsletter 模板:', newsletterTemplates.map(t => t.name));

  const linkedinTemplates = await platformTemplateService.getTemplates('linkedin');
  console.log('✅ LinkedIn 模板:', linkedinTemplates.map(t => t.name));

  const instagramTemplates = await platformTemplateService.getTemplates('instagram');
  console.log('✅ Instagram 模板:', instagramTemplates.map(t => t.name));
}

/**
 * 运行所有测试
 */
export async function runAllDiffractionTests(
  diffractionService: DiffractionService,
  imageSelectService: ImageSelectService,
  copywritingService: CopywritingService,
  batchExportService: BatchExportService,
  platformTemplateService: PlatformTemplateService,
  videoPath?: string
) {
  console.log('═════════════════════════════════════════');
  console.log('   衍射棱镜（Diffraction Prism）服务测试');
  console.log('═════════════════════════════════════════');

  // 6. 测试平台 Prompt（不需要依赖）
  await testPlatformPrompts();

  // 1. 测试平台模板服务
  await testPlatformTemplateService(platformTemplateService);

  // 2. 测试关键帧提取（需要实际视频路径）
  await testImageSelectService(imageSelectService, videoPath);

  // 3. 测试文案生成
  await testCopywritingService(copywritingService);

  // 4. 测试批量导出
  await testBatchExportService(batchExportService);

  // 5. 测试完整工作流
  await testDiffractionService(diffractionService);

  console.log('\n═════════════════════════════════════════');
  console.log('   测试完成');
  console.log('═════════════════════════════════════════');
}

// 如果直接运行此脚本
if (require.main === module) {
  console.log('⚠️  此脚本需要依赖注入，请使用 API 测试脚本 test-diffraction.ts');
  console.log('   或者修改此脚本以正确初始化所有服务实例');
}

export {
  testPlatformTemplateService,
  testImageSelectService,
  testCopywritingService,
  testBatchExportService,
  testDiffractionService,
  testPlatformPrompts,
};
