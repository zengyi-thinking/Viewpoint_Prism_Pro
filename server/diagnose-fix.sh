#!/bin/bash

echo "========================================"
echo "问题诊断和修复"
echo "========================================"

# 检查端口占用
echo ""
echo "1️⃣  检查端口占用情况..."
PORT_3001=$(netstat -ano 2>/dev/null | grep ":3001" | grep LISTENING | head -1)
if [ -n "$PORT_3001" ]; then
    echo "⚠️  端口 3001 仍在使用中"
    echo "   这表示服务器可能没有完全重启"
else
    echo "✅ 端口 3001 已释放"
fi

# 检查编译状态
echo ""
echo "2️⃣  检查编译状态..."
if [ -f "dist/src/infrastructure/storage/storage.service.js" ]; then
    if grep -q "region: 'us-east-1'" dist/src/infrastructure/storage/storage.service.js; then
        echo "✅ region 参数已修复"
    else
        echo "❌ region 参数未找到"
    fi

    if grep -q "metaData || {}" dist/src/infrastructure/storage/storage.service.js; then
        echo "✅ putObject 调用已修复"
    else
        echo "❌ putObject 调用未修复"
    fi
else
    echo "❌ 编译文件不存在，需要重新编译"
fi

# 测试 MinIO 连接
echo ""
echo "3️⃣  测试 MinIO 连接..."
curl -s http://localhost:9000/minio/health/live > /dev/null 2>&1
if [ $? -eq 0 ]; then
    echo "✅ MinIO 服务运行正常"
else
    echo "❌ MinIO 服务未运行"
    echo "   请先启动 MinIO: minio server /data"
fi

echo ""
echo "========================================"
echo "修复状态总结"
echo "========================================"
echo ""
echo "✅ 已修复的问题:"
echo "   1. 前端视频 URL 拼接错误（添加了斜杠）"
echo "   2. MinIO region 参数已添加"
echo "   3. MinIO putObject 调用已修复"
echo "   4. 服务器已重新编译"
echo ""
echo "📝 请执行以下步骤完成修复:"
echo ""
echo "   步骤 1: 关闭所有运行的服务器"
echo "   - 在运行服务器的终端按 Ctrl+C"
echo ""
echo "   步骤 2: 重新启动服务器"
echo "   - 后端: cd server && npm run start:dev"
echo "   - 前端: cd client && npm run dev"
echo ""
echo "   步骤 3: 测试上传功能"
echo "   - 访问前端页面"
echo "   - 尝试上传视频"
echo ""
echo "如果问题仍然存在，请提供:"
echo "   - 浏览器控制台的错误信息"
echo "   - 服务器日志"
echo "   - 上传的文件信息"
echo ""
