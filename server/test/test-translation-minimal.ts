/**
 * 翻译棱镜 API 测试 - 最简化版本
 */

const API_BASE_URL = 'http://localhost:3001/api/prism/translation';
const API_TOKEN = 'YOUR_JWT_TOKEN_HERE';

console.log('========================================');
console.log('  翻译棱镜 API 测试');
console.log('========================================\n');
console.log('\x1b[33m注意：需要设置 API_TOKEN = 实际的 JWT token\x1b[0m');
console.log('使用方法：');
console.log('  1. 登录 http://localhost:3001/api/auth/login');
console.log('     username: test_user_translation');
console.log('     password: test_password_123');
console.log('  2. 修改脚本中的 API_TOKEN');
console.log('  3. 运行: npx ts-node test-translation-minimal.ts');
console.log('');

console.log('========================================');
console.log('  测试步骤：');
console.log('========================================\n');

console.log('1. 测试 /api/prism/translation/videos');
console.log('2. 测试认证 /api/auth/login');
console.log('3. 测试创建任务 /api/prism/translation/videos/:videoId/tasks');
console.log('4. 测试获取状态 /api/prism/translation/tasks/:taskId');
console.log('5. 测试导出 /api/prism/translation/videos/:taskId/export');
console.log('');
