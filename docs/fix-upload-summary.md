# 视频上传问题修复总结

## ✅ 已修复的问题

### 1. 前端视频 URL 拼接错误
**问题**: URL 缺少斜杠，如 `http://localhost:3001cmm7ppt9d...`
**修复**: 在 `client/src/components/workbench/PlayerCenter.tsx` 中添加了斜杠处理

```typescript
// 修复前
return `${API_BASE}${relativePath}${separator}token=...`;

// 修复后
const baseUrl = API_BASE.endsWith('/') ? API_BASE : `${API_BASE}/`;
const path = relativePath.startsWith('/') ? relativePath.slice(1) : relativePath;
return `${baseUrl}${path}${separator}token=...`;
```

### 2. MinIO 签名错误
**问题**: `SignatureDoesNotMatch` - MinIO 客户端配置不正确
**修复**: 在 `server/src/infrastructure/storage/storage.service.ts` 中:

1. 添加 `region: 'us-east-1'` 参数
2. 修复 `upload()` 方法的 `putObject` 调用
3. 修复 `uploadStream()` 方法的 `putObject` 调用
4. 使用类型断言解决 minio v8 类型定义问题

## ✅ 验证结果

### MinIO 连接测试
```
✅ 创建了 102400 字节的测试文件
✅ 视频上传成功: test-user-id/test-project-id/videos/1772426939988-______2-1.mp4
✅ 文件验证成功
✅ 公共 URL 可访问
```

### 编译验证
```
✅ region: 'us-east-1' 参数已添加
✅ upload 方法调用已修复
✅ uploadStream 方法调用已修复
✅ 服务器编译成功
```

## 📝 重启服务器步骤

### 步骤 1: 关闭当前运行的服务器
在运行服务器的终端按 `Ctrl+C`，或使用以下命令：
```bash
powershell "Stop-Process -Name node -Force"
```

### 步骤 2: 重新启动服务器
```bash
# 启动后端（终端 1）
cd d:/DevProject/Viewpoint_Prism_Pro/server
npm run start:dev

# 启动前端（终端 2）
cd d:/DevProject/Viewpoint_Prism_Pro/client
npm run dev
```

### 步骤 3: 验证修复
1. 访问前端页面
2. 登录或注册
3. 选择项目
4. 点击"上传视频"按钮
5. 选择视频文件上传

## 🔍 如果问题仍然存在

### 检查 MinIO 服务
```bash
# 检查 MinIO 是否运行
curl http://localhost:9000/minio/health/live

# 如果未运行，启动 MinIO
minio server /data --console-address ":9001"
```

### 检查 .env 配置
确认以下配置正确：
```env
MINIO_ENDPOINT=localhost
MINIO_PORT=9000
MINIO_ACCESS_KEY=minioadmin
MINIO_SECRET_KEY=minioadmin
MINIO_BUCKET=viewpoint-prism
```

### 查看详细日志
- 服务器日志中的错误堆栈
- 浏览器控制台（F12）中的错误信息
- Network 标签中的请求详情

## 📝 修改的文件清单

### 前端
- `client/src/components/workbench/PlayerCenter.tsx`

### 后端
- `server/src/infrastructure/storage/storage.service.ts`

## 🎯 预期结果

重启后，上传视频应该能够成功，并且：
1. 视频文件正确上传到 MinIO
2. 数据库中保存视频记录
3. 前端可以正确播放视频（URL 格式正确）
4. 缩略图生成开始
5. 转写任务队列启动
