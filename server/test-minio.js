const Minio = require('minio');

const endPoint = 'localhost';
const port = 9000;
const useSSL = false;
const accessKey = 'minioadmin';
const secretKey = 'minioadmin';
const bucketName = 'viewpoint-prism';
const region = 'us-east-1';

async function testMinIO() {
  console.log('========================================');
  console.log('MinIO 连接测试');
  console.log('========================================\n');

  console.log(`配置:`);
  console.log(`  Endpoint: ${endPoint}:${port}`);
  console.log(`  Access Key: ${accessKey}`);
  console.log(`  Secret Key: ${secretKey.substring(0, 3)}***`);
  console.log(`  Bucket: ${bucketName}`);
  console.log(`  Region: ${region}`);
  console.log(`  SSL: ${useSSL}\n`);

  // 创建客户端
  const client = new Minio.Client({
    endPoint,
    port,
    useSSL,
    accessKey,
    secretKey,
    region,
  });

  try {
    // 1. 测试列出桶
    console.log('步骤 1: 列出所有桶...');
    const buckets = await client.listBuckets();
    console.log('✅ 成功获取桶列表:', buckets.map(b => b.name).join(', '));

    // 2. 检查桶是否存在
    console.log('\n步骤 2: 检查桶是否存在...');
    const exists = await client.bucketExists(bucketName);
    if (exists) {
      console.log(`✅ 桶 "${bucketName}" 存在`);
    } else {
      console.log(`⚠️  桶 "${bucketName}" 不存在，创建中...`);
      await client.makeBucket(bucketName);
      console.log(`✅ 桶 "${bucketName}" 创建成功`);
    }

    // 3. 设置桶策略
    console.log('\n步骤 3: 设置桶策略...');
    const publicReadPolicy = {
      Version: '2012-10-17',
      Statement: [
        {
          Effect: 'Allow',
          Principal: { AWS: ['*'] },
          Action: ['s3:GetObject'],
          Resource: [`arn:aws:s3:::${bucketName}/*`],
        },
      ],
    };
    await client.setBucketPolicy(bucketName, JSON.stringify(publicReadPolicy));
    console.log('✅ 桶策略设置成功');

    // 4. 测试上传文件
    console.log('\n步骤 4: 测试上传文件...');
    const testData = Buffer.from('Hello MinIO! This is a test file.');
    const testKey = 'test/test-file.txt';

    await client.putObject(bucketName, testKey, testData, {
      'Content-Type': 'text/plain',
    });
    console.log(`✅ 文件上传成功: ${testKey}`);

    // 5. 测试获取文件 URL
    console.log('\n步骤 5: 获取文件 URL...');
    const url = await client.presignedGetObject(bucketName, testKey);
    console.log(`✅ 文件 URL: ${url}`);

    // 6. 测试删除文件
    console.log('\n步骤 6: 清理测试文件...');
    await client.removeObject(bucketName, testKey);
    console.log('✅ 测试文件已删除');

    console.log('\n========================================');
    console.log('✅ 所有测试通过！MinIO 配置正确');
    console.log('========================================');

  } catch (error) {
    console.error('\n❌ 测试失败:', error.message);
    console.error('错误详情:', error);

    if (error.code === 'SignatureDoesNotMatch') {
      console.error('\n🔧 签名错误解决方案:');
      console.error('1. 确保 MinIO 服务器正在运行');
      console.error('2. 确保 .env 中的 MINIO_ACCESS_KEY 和 MINIO_SECRET_KEY 与 MinIO 服务器配置一致');
      console.error('3. 检查 MinIO 服务器控制台 (http://localhost:9001) 中的凭证配置');
    }

    process.exit(1);
  }
}

testMinIO();
