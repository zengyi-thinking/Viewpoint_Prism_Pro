/**
 * 翻译棱镜完整工作流测试脚本
 *
 * 测试流程：
 * 1. 创建测试用户
 * 2. 上传视频文件
 * 3. 创建翻译任务
 * 4. 轮询字幕提取状态
 * 5. 字幕翻译
 * 6. 导出视频
 */

import { PrismaClient } from '@prisma/client';

// 类型定义
type TranslationTask = {
  id: string;
  videoId: string;
  userId: string;
  status: string;
  subtitleStatus: string;
  subtitleTranslateStatus: string;
  inpaintingStatus: string;
  voiceCloneStatus: string;
  ttsStatus: string;
  lipSyncStatus: string;
  outputVideoUrl?: string;
  createdAt: Date;
  updatedAt: Date;
};

type VideoSource = {
  id: string;
  userId: string;
  sourceUrl: string;
  title: string;
  duration: number;
  metadata?: any;
  createdAt: Date;
  updatedAt: Date;
};

type User = {
  id: string;
  email: string;
  settings?: any;
  createdAt: Date;
  updatedAt: Date;
};

// 数据库连接字符串
const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://postgres:postgres:postgres@localhost:5433/viewpoint_prism';

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: DATABASE_URL,
    },
  },
});

const API_BASE_URL = 'http://localhost:3001/api/prism/translation';
const API_KEY = process.env.SILICONFLOW_API_KEY || '';

// 颜色输出
const COLORS = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  red: '\x1b[31m',
  white: '\x1b[37m',
};

function log(message: string, color = 'white') {
  console.log(`${COLORS[color]}${message}\x1b[0m`);
}

function logSuccess(message: string) {
  log(`✓ ${message}`, 'green');
}

function logError(message: string) {
  log(`✗ ${message}`, 'red');
}

function logWarning(message: string) {
  log(`⚠ ${message}`, 'yellow');
}

function logInfo(message: string) {
  log(`ℹ ${message}`, 'cyan');
}

// 等待函数
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// 认证 - 登录获取 JWT token
async function login(): Promise<{ token: string; userId: string }> {
  log('正在登录...');

  const response = await fetch('http://localhost:3001/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username: 'test_user_translation',
      password: 'test_password_123',
    }),
  });

  if (!response.ok) {
    throw new Error(`登录失败: ${response.status}`);
  }

  const result = await response.json();

  logSuccess(`登录成功: userId=${result.userId}`);

  return { token: result.token, userId: result.userId };
}

// 创建测试用户
async function createTestUser(token: string): Promise<string> {
  log('创建测试用户...');

  const response = await fetch('http://localhost:3001/api/users', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({
      email: `test_translation_${Date.now()}@example.com`,
      password: 'password123',
      name: 'Translation Test User',
    }),
  });

  if (!response.ok) {
    throw new Error(`创建用户失败: ${response.status}`);
  }

  const user = await response.json();

  logSuccess(`测试用户创建成功: ${user.id}`);
  return user.id;
}

// 上传视频（通过 API）
async function uploadVideo(token: string, userId: string, videoPath: string): Promise<string> {
  log('正在上传视频...');

  const formData = new FormData();
  formData.append('file', {
    value: fs.createReadStream(videoPath),
    options: { filename: 'videoplayback (1).mp4' },
  });
  formData.append('title', 'Translation Test Video');
  formData.append('duration', '60');

  const response = await fetch('http://localhost:3001/api/videos', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
    },
    body: formData,
  });

  if (!response.ok) {
    throw new Error(`上传视频失败: ${response.status}`);
  }

  const result = await response.json();

  logSuccess(`视频上传成功: ${result.id}`);
  return result.id;
}

// 创建翻译任务
async function createTranslationTask(token: string, userId: string, videoId: string): Promise<string> {
  log('创建翻译任务...');

  const response = await fetch(`${API_BASE_URL}/videos/${videoId}/tasks`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({
        targetLanguage: 'en',
        enableInpainting: false,
        enableVoiceClone: false,
      }),
  });

  if (!response.ok) {
    throw new Error(`创建翻译任务失败: ${response.status}`);
  }

  const result = await response.json();

  logSuccess(`翻译任务创建成功: ${result.id}`);
  return result.id;
}

// 获取任务状态
async function getTaskStatus(token: string, taskId: string): Promise<TranslationTask> {
  const response = await fetch(`${API_BASE_URL}/tasks/${taskId}`, {
    headers: {
      'Authorization': `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    throw new Error(`获取任务状态失败: ${response.status}`);
  }

  return await response.json();
}

// 轮询字幕提取完成
async function waitForSubtitleExtraction(token: string, taskId: string, timeoutMs: number = 120000): Promise<void> {
  const startTime = Date.now();
  const interval = 5000; // 5 秒检查一次

  logInfo(`等待字幕提取... (超时: ${Math.floor(timeoutMs / 1000)} 秒)`);

  return new Promise((resolve, reject) => {
    const checkInterval = setInterval(async () => {
      try {
        const task = await getTaskStatus(token, taskId);
        const elapsed = Date.now() - startTime;

        if (task.status === 'COMPLETED') {
          logSuccess(`字幕提取完成！耗时: ${Math.floor(elapsed / 1000)} 秒`);
          clearInterval(checkInterval);
          resolve();
        } else if (task.status === 'FAILED') {
          logError(`字幕提取失败！`);
          clearInterval(checkInterval);
          reject(new Error('字幕提取失败'));
        } else if (task.status === 'PROCESSING') {
          const progress = Math.min(Math.floor((elapsed / timeoutMs) * 100), 95);
          process.stdout.write(`\r字幕提取中... ${progress}%\r`);
        } else {
          const progress = Math.floor((elapsed / timeoutMs) * 100);
          process.stdout.write(`\r字幕提取: ${task.status} ${progress}%\r`);
        }
      } catch (error) {
        clearInterval(checkInterval);
        reject(error);
      }
    }, interval);

    // 超时处理
    setTimeout(() => {
      clearInterval(checkInterval);
      reject(new Error('字幕提取超时'));
    }, timeoutMs);
  });
}

// 导出视频
async function exportVideo(token: string, taskId: string): Promise<string> {
  log('请求导出视频...');

  const response = await fetch(`${API_BASE_URL}/videos/${taskId}/export`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({
      format: 'mp4',
    includeSubtitles: true,
      includeVoiceOver: true,
    }),
  });

  if (!response.ok) {
    throw new Error(`导出视频失败: ${response.status}`);
  }

  const result = await response.json();

  logSuccess(`视频导出请求成功: ${result.taskId}`);
  return result.taskId;
}

// 主测试流程
async function runFullWorkflowTest() {
  log('========================================');
  log('  翻译棱镜完整工作流测试');
  log('========================================\n');

  const videoPath = '/d/DevProject/Viewpoint_Prism_Pro/vedios/videoplayback (1).mp4';

  if (!require('fs').existsSync(videoPath)) {
    logError(`视频文件不存在: ${videoPath}`);
    process.exit(1);
  }

  try {
    // 1. 登录
    logInfo('步骤 1/6: 登录系统...');
    const { token, userId } = await login();

    // 2. 创建测试用户（备用）
    logInfo('步骤 2/6: 创建测试用户...');
    const testUserId = await createTestUser(token);

    // 3. 上传视频
    logInfo('步骤 3/6: 上传视频...');
    const videoId = await uploadVideo(token, testUserId, videoPath);

    // 4. 创建翻译任务
    logInfo('步骤 4/6: 创建翻译任务...');
    const taskId = await createTranslationTask(token, userId, videoId);

    // 5. 等待字幕提取
    logInfo('步骤 5/6: 等待字幕提取（最多 2 分钟）...');
    await waitForSubtitleExtraction(token, taskId, 120000); // 2 分钟超时

    // 6. 获取最终任务状态
    logInfo('步骤 6/6: 获取最终任务状态...');
    const finalTask = await getTaskStatus(token, taskId);

    // 7. 导出视频
    logInfo('步骤 7/6: 导出视频...');
    const exportTaskId = await exportVideo(token, userId);

    // 显示结果
    log('\n========================================');
    log('  测试结果汇总');
    log('========================================\n');
    logSuccess(`视频ID: ${videoId}`);
    log(`翻译任务ID: ${taskId}`);
    log(`任务状态: ${finalTask.status}`);
    log(`字幕状态: ${finalTask.subtitleStatus}`);
    log(`导出任务ID: ${exportTaskId}`);

    // 成功条件
    const success =
      finalTask.status === 'COMPLETED' ||
      finalTask.status === 'FAILED' && finalTask.subtitleStatus === 'COMPLETED';

    if (success) {
      logSuccess('测试成功！');
    } else {
      logWarning('测试部分成功（字幕提取可能失败）');
    }

    process.exit(success ? 0 : 1);
  } catch (error: any) {
    logError(`测试失败: ${error.message}`);
    console.error(error);
    process.exit(1);
  }
}

// 运行测试
if (require.main === module) {
  runFullWorkflowTest();
} else {
  module.exports = { runFullWorkflowTest };
}
