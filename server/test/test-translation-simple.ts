/**
 * 翻译棱镜简化测试脚本
 *
 * 使用说明：
 * 1. 此脚本仅测试 API 端点，需要先手动登录获取 JWT token
 * 2. 将 token 替换到下面的 API_TOKEN 变量
 * 3. 运行: npx ts-node test-translation-simple.ts
 */

const API_BASE_URL = 'http://localhost:3001/api/prism/translation';
const API_TOKEN = 'YOUR_JWT_TOKEN_HERE'; // 替换为登录后获取的 token

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

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// 等待函数
async function waitForTaskCompletion(taskId: string, timeoutMs: number = 120000): Promise<void> {
  const startTime = Date.now();
  const interval = 5000;

  logInfo(`等待任务完成... (超时: ${Math.floor(timeoutMs / 1000)} 秒)`);

  return new Promise((resolve, reject) => {
    const checkInterval = setInterval(async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/tasks/${taskId}`, {
          headers: { 'Authorization': `Bearer ${API_TOKEN}` },
        });

        if (!response.ok) {
          clearInterval(checkInterval);
          reject(new Error(`HTTP ${response.status}`));
          return;
        }

        const task = await response.json();
        const elapsed = Date.now() - startTime;

        if (task.status === 'COMPLETED') {
          logSuccess(`任务完成！耗时: ${Math.floor(elapsed / 1000)} 秒`);
          clearInterval(checkInterval);
          resolve();
        } else if (task.status === 'FAILED') {
          logError(`任务失败！`);
          clearInterval(checkInterval);
          reject(new Error('任务失败'));
        } else if (task.status === 'PROCESSING') {
          const progress = Math.min(Math.floor((elapsed / timeoutMs) * 100), 95);
          process.stdout.write(`\r处理中... ${progress}%\r`);
        } else {
          const progress = Math.floor((elapsed / timeoutMs) * 100);
          process.stdout.write(`\r${task.status} ${progress}%\r`);
        }
      } catch (error) {
        clearInterval(checkInterval);
        reject(error);
      }
    }, interval);

    setTimeout(() => {
      clearInterval(checkInterval);
      reject(new Error('任务超时'));
    }, timeoutMs);
  });
}

// 主测试流程
async function runSimpleTest() {
  log('========================================');
  log('  翻译棱镜简化测试');
  log('========================================\n');

  // 注意：需要先登录获取 JWT token
  logWarning('请确保 API_TOKEN 已设置有效的 JWT token');
  logInfo('获取 token 步骤：');
  logInfo('  1. 访问 http://localhost:3001 并登录');
  logInfo('  2. 登录后，修改本脚本中的 API_TOKEN 变量');
  logInfo('  3. 重新运行此脚本进行测试');
  log('');

  // 示例测试（需要有效的 videoId）
  const VIDEO_ID = 'YOUR_VIDEO_ID_HERE';
  const TASK_ID = 'YOUR_TASK_ID_HERE';

  try {
    logInfo('步骤 1/4: 检查任务状态...');
    const task = await fetch(`${API_BASE_URL}/tasks/${TASK_ID}`, {
      headers: { 'Authorization': `Bearer ${API_TOKEN}` },
    });

    if (!task.ok) {
      throw new Error(`HTTP ${task.status}`);
    }

    const taskData = await task.json();
    log(`任务ID: ${TASK_ID}`);
    log(`状态: ${taskData.status}`);
    log(`字幕状态: ${taskData.subtitleStatus}`);

    if (taskData.status === 'COMPLETED') {
      logSuccess('测试成功！');
    } else {
      logWarning('任务未完成');
    }

    process.exit(0);
  } catch (error: any) {
    logError(`测试失败: ${error.message}`);
    process.exit(1);
  }
}

// 运行测试
if (require.main === module) {
  runSimpleTest();
} else {
  module.exports = { runSimpleTest };
}
