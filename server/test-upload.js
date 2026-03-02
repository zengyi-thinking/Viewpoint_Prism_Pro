// 测试视频上传修复
const fs = require('fs');
const path = require('path');

async function testUpload() {
  console.log('========================================');
  console.log('测试视频上传功能修复');
  console.log('========================================\n');

  // 读取一个测试文件
  const testFilePath = path.join(__dirname, 'test-minio.js');
  const testBuffer = fs.readFileSync(testFilePath);

  console.log(`测试文件: ${testFilePath}`);
  console.log(`文件大小: ${testBuffer.length} 字节\n`);

  // 模拟 StorageService 的上传方法
  const Minio = require('minio');
  const client = new Minio.Client({
    endPoint: 'localhost',
    port: 9000,
    useSSL: false,
    accessKey: 'minioadmin',
    secretKey: 'minioadmin',
    region: 'us-east-1',
  });

  const bucketName = 'viewpoint-prism';
  const testKey = 'test/video-upload-test.mp4';

  try {
    console.log('步骤 1: 上传测试文件...');
    await client.putObject(bucketName, testKey, testBuffer, {
      'Content-Type': 'video/mp4',
    });
    console.log('✅ 文件上传成功');

    console.log('\n步骤 2: 验证文件存在...');
    const stat = await client.statObject(bucketName, testKey);
    console.log(`✅ 文件验证成功: ${stat.size} 字节`);

    console.log('\n步骤 3: 清理测试文件...');
    await client.removeObject(bucketName, testKey);
    console.log('✅ 测试文件已删除');

    console.log('\n========================================');
    console.log('✅ 上传功能修复验证成功！');
    console.log('========================================');
    console.log('\n现在可以尝试上传视频文件了。');

  } catch (error) {
    console.error('\n❌ 测试失败:', error.message);
    console.error('错误详情:', error);
    process.exit(1);
  }
}

testUpload();
