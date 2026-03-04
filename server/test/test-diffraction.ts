/**
 * 衍射棱镜（Diffraction Prism）功能测试
 *
 * 测试功能：
 * 1. 关键帧提取 - 从视频中提取关键帧并使用 AI 进行质量分析
 * 2. 文案生成 - 为不同平台（小红书、Twitter、Newsletter、LinkedIn、Instagram）生成 AI 文案
 * 3. 批量导出 - 导出多平台内容包
 * 4. 草稿管理 - 获取和删除草稿
 */

import axios from 'axios';

const API_BASE = 'http://localhost:3000';
// 替换为有效的 JWT token
const AUTH_TOKEN = 'your-jwt-token-here';
// 替换为有效的视频 ID
const VIDEO_ID = 'your-video-id-here';

const headers = {
  'Authorization': `Bearer ${AUTH_TOKEN}`,
  'Content-Type': 'application/json',
};

/**
 * 测试 1: 获取平台模板列表
 */
async function testGetTemplates() {
  console.log('\n=== 测试 1: 获取平台模板列表 ===');
  try {
    const response = await axios.get(`${API_BASE}/api/prism/diffraction/templates`, { headers });
    console.log('✅ 平台模板:', JSON.stringify(response.data, null, 2));
  } catch (error: any) {
    console.error('❌ 失败:', error.response?.data || error.message);
  }
}

/**
 * 测试 2: 提取关键帧
 */
async function testExtractKeyFrames() {
  console.log('\n=== 测试 2: 提取关键帧 ===');
  try {
    const response = await axios.post(
      `${API_BASE}/api/prism/diffraction/keyframes`,
      { videoId: VIDEO_ID, count: 12 },
      { headers }
    );
    console.log('✅ 提取关键帧成功:');
    console.log(`- 提取了 ${response.data.frames.length} 帧关键帧`);
    console.log('- 前3帧质量评分:');
    response.data.frames.slice(0, 3).forEach((frame: any, i: number) => {
      console.log(`  ${i + 1}. 时间戳: ${frame.timestamp}s, 质量评分: ${frame.qualityScore}`);
    });
  } catch (error: any) {
    console.error('❌ 失败:', error.response?.data || error.message);
  }
}

/**
 * 测试 3: 生成平台文案
 */
async function testGenerateCopywriting() {
  console.log('\n=== 测试 3: 生成平台文案 ===');

  const platforms = ['xiaohongshu', 'twitter_x', 'newsletter', 'linkedin', 'instagram'];

  for (const platform of platforms) {
    console.log(`\n--- 测试平台: ${platform} ---`);
    try {
      const response = await axios.post(
        `${API_BASE}/api/prism/diffraction/copywriting`,
        {
          videoId: VIDEO_ID,
          platform,
          selectedFrames: [
            { imageUrl: 'https://example.com/frame1.jpg', timestamp: 10 },
            { imageUrl: 'https://example.com/frame2.jpg', timestamp: 20 },
          ],
          styleHints: '自然、真实、生活化',
          previousDraftId: undefined,
        },
        { headers }
      );
      console.log(`✅ ${platform} 文案生成成功:`);
      console.log(`- 草稿 ID: ${response.data.platformDraftId}`);
      console.log(`- 生成内容长度: ${response.data.generatedContent.length} 字符`);
      console.log(`- 建议数量: ${response.data.suggestions?.length || 0}`);
    } catch (error: any) {
      console.error(`❌ ${platform} 失败:`, error.response?.data || error.message);
    }
  }
}

/**
 * 测试 4: 批量导出
 */
async function testBatchExport() {
  console.log('\n=== 测试 4: 批量导出 ===');
  try {
    const response = await axios.post(
      `${API_BASE}/api/prism/diffraction/export`,
      {
        videoId: VIDEO_ID,
        platforms: ['xiaohongshu', 'twitter_x'],
        draftIds: undefined,
      },
      { headers }
    );
    console.log('✅ 批量导出成功:');
    console.log(`- 导出包数量: ${response.data.length}`);
    response.data.forEach((pkg: any) => {
      console.log(`- ${pkg.platform}: 任务 ID ${pkg.taskId}`);
      console.log(`  - 图片数量: ${pkg.assets.images.length}`);
      console.log(`  - 数据文件: ${pkg.assets.dataFileUrl}`);
    });
  } catch (error: any) {
    console.error('❌ 失败:', error.response?.data || error.message);
  }
}

/**
 * 测试 5: 获取草稿列表
 */
async function testGetDrafts() {
  console.log('\n=== 测试 5: 获取草稿列表 ===');
  try {
    const response = await axios.get(
      `${API_BASE}/api/prism/diffraction/drafts/${VIDEO_ID}`,
      { headers }
    );
    console.log('✅ 获取草稿列表成功:');
    console.log(`- 草稿数量: ${response.data.drafts.length}`);
    response.data.drafts.forEach((draft: any) => {
      console.log(`- ${draft.platform}: ${draft.title} (${draft.isPublished ? '已发布' : '草稿'})`);
    });
  } catch (error: any) {
    console.error('❌ 失败:', error.response?.data || error.message);
  }
}

/**
 * 测试 6: 删除草稿
 */
async function testDeleteDraft(draftId: string) {
  console.log('\n=== 测试 6: 删除草稿 ===');
  try {
    const response = await axios.delete(
      `${API_BASE}/api/prism/diffraction/drafts/${draftId}`,
      { headers }
    );
    console.log('✅ 删除草稿成功:', response.data);
  } catch (error: any) {
    console.error('❌ 失败:', error.response?.data || error.message);
  }
}

/**
 * 运行所有测试
 */
async function runAllTests() {
  console.log('开始衍射棱镜功能测试...\n');

  await testGetTemplates();
  await testExtractKeyFrames();
  await testGenerateCopywriting();
  await testGetDrafts();
  await testBatchExport();

  console.log('\n=== 测试完成 ===');
}

// 如果直接运行此脚本
if (require.main === module) {
  runAllTests().catch(console.error);
}

export {
  testGetTemplates,
  testExtractKeyFrames,
  testGenerateCopywriting,
  testBatchExport,
  testGetDrafts,
  testDeleteDraft,
};
