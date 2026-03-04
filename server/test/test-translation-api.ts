/**
 * 翻译棱镜 API 端点测试脚本
 *
 * 仅测试 API 功能，不包含数据库操作
 *
 * 使用说明：
 * 1. 此脚本仅测试 API 端点是否可访问
 * 2. 需要提供有效的 JWT token
 * 3. 需要提供有效的 videoId 和 taskId
 * 4. 运行: npx ts-node test-translation-api.ts
 */

const API_BASE_URL = 'http://localhost:3001/api/prism/translation';
const API_TOKEN = 'YOUR_JWT_TOKEN_HERE';

// 颜色
const COLORS = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  red: '\x1b[31m',
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

function logInfo(message: string) {
  log(`ℹ ${message}`, 'cyan');
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// API 测试 1: 检查服务器状态
async function testServerHealth() {
  logInfo('测试 1/5: 检查服务器状态...');
  try {
    const response = await fetch(`${API_BASE_URL}/videos`);
    log(`HTTP 状态: ${response.status}`);
    return response.ok;
  } catch (error: any) {
    logError(`服务器状态检查失败: ${error.message}`);
    return false;
  }
}

// API 测试 2: 检查认证端点
async function testAuthEndpoint() {
  logInfo('测试 2/5: 检查认证端点...');
  try {
    const response = await fetch('http://localhost:3001/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: 'test_user_translation',
        password: 'test_password_123',
      }),
    });

    const result = await response.json();

    log(`响应状态: ${response.status}`);
    if (result.token) {
      logSuccess('认证端点可访问');
      return result.token;
    } else {
      logError(`认证端点返回 401: ${result.message}`);
      return null;
    }
  } catch (error: any) {
    logError(`认证端点测试失败: ${error.message}`);
    return null;
  }
}

// API 测试 3: 创建翻译任务
async function testCreateTask(token: string, videoId: string) {
  logInfo(`测试 3/5: 创建翻译任务...`);

  try {
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

    const result = await response.json();

    if (result.id) {
      logSuccess(`翻译任务创建成功: ${result.id}`);
      return result.id;
    } else {
      logError(`翻译任务创建失败: ${result.message}`);
      return null;
    }
  } catch (error: any) {
    logError(`创建翻译任务失败: ${error.message}`);
    return null;
  }
}

// API 测试 4: 获取任务状态
async function testGetTaskStatus(token: string, taskId: string) {
  logInfo('测试 4/5: 获取任务状态...');

  try {
    const response = await fetch(`${API_BASE_URL}/tasks/${taskId}`, {
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });

    const task = await response.json();

    log(`任务状态: ${task.status}`);
    log(`字幕提取: ${task.subtitleStatus}`);

    return task.status === 'COMPLETED';
  } catch (error: any) {
    logError(`获取任务状态失败: ${error.message}`);
    return false;
  }
}

// API 测试 5: 导出视频
async function testExportVideo(token: string, taskId: string) {
  logInfo('测试 5/5: 导出视频...');

  try {
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

    const result = await response.json();

    if (result.taskId) {
      logSuccess(`导出请求成功: ${result.taskId}`);
      return result.taskId;
    } else {
      logError(`导出请求失败: ${result.message}`);
      return null;
    }
  } catch (error: any) {
    logError(`导出视频失败: ${error.message}`);
    return null;
  }
}

// 主测试函数
async function runApiTests() {
  log('========================================');
  log('  翻译棱镜 API 端点测试');
  log('========================================\n');

  logWarning('注意：此脚本仅测试 API 端点可访问性');
  logWarning('需要提供有效的 JWT token');
  logWarning('需要提供有效的 videoId 和 taskId');
  log('');

  // 测试 1: 服务器健康检查
  const serverOk = await testServerHealth();
  if (!serverOk) {
    logError('服务器不可访问，终止测试');
    process.exit(1);
  }

  // 测试 2: 认证端点
  logInfo('测试 2: 认证端点...');
  const token = await testAuthEndpoint();
  if (!token) {
    logError('认证失败，终止测试');
    process.exit(1);
  }

  // 使用占位符 ID 进行后续测试
  const VIDEO_ID = 'YOUR_VIDEO_ID_HERE';
  const TASK_ID = 'YOUR_TASK_ID_HERE';

  // 测试 3: 创建翻译任务（需要真实 videoId）
  logInfo('测试 3: 创建翻译任务...');
  logInfo('注意：使用占位符 videoId，此测试将失败');
  const createTaskId = await testCreateTask(token, VIDEO_ID);
  if (!createTaskId) {
    logError('创建任务失败，终止测试');
    process.exit(1);
  }

  // 测试 4: 获取任务状态
  logInfo('测试 4: 获取任务状态...');
  logInfo('注意：使用占位符 taskId，此测试将失败');
  const taskCompleted = await testGetTaskStatus(token, TASK_ID);

  // 测试 5: 导出视频（需要真实 taskId）
  logInfo('测试 5: 导出视频...');
  logInfo('注意：使用占位符 taskId，此测试将失败');
  const exportTaskId = await testExportVideo(token, TASK_ID);

  log('\n========================================');
  log('  测试结果汇总');
  log('========================================\n');

  const allPassed = serverOk && token && taskCompleted && exportTaskId;

  logSuccess(`服务器: ${serverOk ? '✓' : '✗'}`);
  logSuccess(`认证: ${token ? '✓' : '✗'}`);
  logSuccess(`创建任务: ${createTaskId ? '✓' : '✗'}`);
  logSuccess(`任务状态: ${taskCompleted ? '✓' : '✗'}`);
  logSuccess(`导出: ${exportTaskId ? '✓' : '✗'}`);

  if (allPassed) {
    logSuccess('所有 API 测试通过！');
  } else {
    logWarning('部分 API 测试失败（由于使用占位符）');
  }

  log('');
  log('========================================');
  log('  下一步：');
  log('  1. 使用前端界面进行完整的翻译棱镜工作流测试');
  log('  2. 或者：提供真实的 JWT token、videoId、taskId 并重新运行此脚本');
  log(' 3. 或者：通过前端上传视频文件并创建翻译任务');
  log('');

  process.exit(0);
}

// 运行
if (require.main === module) {
  runApiTests();
} else {
  module.exports = { runApiTests };
}
