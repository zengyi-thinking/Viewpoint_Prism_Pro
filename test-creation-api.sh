#!/bin/bash

# 创作棱镜（PrismFlow）API 测试脚本

echo "=========================================="
echo "创作棱镜 API 端点测试"
echo "=========================================="

BASE_URL="http://localhost:3001"

# 测试 1: 测试 API 路由是否正常
echo ""
echo "测试 1: 检查 API 基础路由..."
curl -s "${BASE_URL}/api/videos" | head -50

echo ""
echo "测试 2: 检查创作棱镜路由..."
curl -s "${BASE_URL}/api/prism/creation/videos/test-video-123/nodes" | head -50

echo ""
echo "测试 3: 检查任务状态路由..."
curl -s "${BASE_URL}/api/prism/creation/tasks/test-task-123/stitch-status" | head -50

echo ""
echo "测试 4: 检查导出状态路由..."
curl -s "${BASE_URL}/api/prism/creation/tasks/test-task-123/export-status" | head -50

echo ""
echo "测试 5: 检查帧生成路由..."
curl -s "${BASE_URL}/api/prism/creation/nodes/test-node-123/generate-frame" | head -50

echo ""
echo "测试 6: 检查帧锁定路由..."
curl -s "${BASE_URL}/api/prism/creation/nodes/test-node-123/lock-frame" | head -50

echo ""
echo "测试 7: 检查渲染路由..."
curl -s "${BASE_URL}/api/prism/creation/nodes/test-node-123/render" | head -50

echo ""
echo "测试 8: 检查文案拆分路由..."
curl -s "${BASE_URL}/api/prism/creation/videos/test-video-123/script-split" | head -50

echo ""
echo "=========================================="
echo "API 路由测试完成"
echo "=========================================="
