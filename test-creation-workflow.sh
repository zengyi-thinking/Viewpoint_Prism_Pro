#!/bin/bash

# 创作棱镜（PrismFlow）工作流测试脚本

echo "=========================================="
echo "创作棱镜工作流测试"
echo "=========================================="

BASE_URL="http://localhost:3001"
JWT_TOKEN=""

# 步骤 1: 注册测试用户（如果不存在）
echo ""
echo "步骤 1: 准备测试用户..."
REGISTER_RESPONSE=$(curl -s -X POST "${BASE_URL}/api/auth/register" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "test123456",
    "name": "Test User"
  }')

echo "注册响应: $REGISTER_RESPONSE"

# 步骤 2: 登录获取 JWT Token
echo ""
echo "步骤 2: 登录获取 Token..."
LOGIN_RESPONSE=$(curl -s -X POST "${BASE_URL}/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "test123456"
  }')

echo "登录响应: $LOGIN_RESPONSE"

# 提取 JWT Token（假设登录成功）
JWT_TOKEN=$(echo "$LOGIN_RESPONSE" | grep -o '"accessToken":"[^"]*"' | cut -d'"' -f4)

if [ -z "$JWT_TOKEN" ]; then
  echo "错误: 无法获取 JWT Token"
  echo "尝试使用固定测试 token..."
  # 注意: 实际使用中需要有效的 JWT
  JWT_TOKEN="test-token-placeholder"
fi

echo "获取到的 JWT Token: ${JWT_TOKEN:0:20}..."

# 步骤 3: 创建测试视频源（通过上传接口）
echo ""
echo "步骤 3: 创建测试视频源..."
# 首先创建一个测试项目
PROJECT_RESPONSE=$(curl -s -X POST "${BASE_URL}/api/projects" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${JWT_TOKEN}" \
  -d '{
    "name": "测试项目 - 创作棱镜测试",
    "description": "用于测试创作棱镜工作流的测试项目"
  }')

echo "项目创建响应: $PROJECT_RESPONSE"

# 提取项目 ID
PROJECT_ID=$(echo "$PROJECT_RESPONSE" | grep -o '"id":"[^"]*"' | cut -d'"' -f4)

if [ -z "$PROJECT_ID" ]; then
  echo "错误: 无法获取项目 ID"
  exit 1
fi

echo "项目 ID: $PROJECT_ID"

# 然后创建视频（使用空文件模拟上传）
VIDEO_RESPONSE=$(curl -s -X POST "${BASE_URL}/api/videos/import?projectId=${PROJECT_ID}" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${JWT_TOKEN}" \
  -d '{
    "title": "测试视频 - 创作棱镜工作流测试",
    "sourceType": "URL_IMPORT",
    "sourceUrl": "https://sample-videos.com/test.mp4"
  }')

echo "视频创建响应: $VIDEO_RESPONSE"

# 提取视频 ID
VIDEO_ID=$(echo "$VIDEO_RESPONSE" | grep -o '"id":"[^"]*"' | cut -d'"' -f4)

if [ -z "$VIDEO_ID" ]; then
  echo "错误: 无法获取视频 ID"
  exit 1
fi

echo "视频 ID: $VIDEO_ID"

# 步骤 4: 获取 PrismFlow 项目（自动创建）
echo ""
echo "步骤 4: 获取 PrismFlow 项目..."
NODES_RESPONSE=$(curl -s "${BASE_URL}/api/prism/creation/videos/${VIDEO_ID}/nodes" \
  -H "Authorization: Bearer ${JWT_TOKEN}")

echo "节点列表响应: $NODES_RESPONSE"

# 步骤 5: 创建测试节点
echo ""
echo "步骤 5: 创建测试节点..."
CREATE_NODE_RESPONSE=$(curl -s -X POST "${BASE_URL}/api/prism/creation/videos/${VIDEO_ID}/nodes" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${JWT_TOKEN}" \
  -d '{
    "orderIndex": 0,
    "prompt": "一个美丽的海边日落场景，海浪轻轻拍打着沙滩",
    "scriptSegment": "在海边，夕阳西下，金色的阳光洒在海面上...",
    "positionX": 100,
    "positionY": 100
  }')

echo "创建节点响应: $CREATE_NODE_RESPONSE"

# 提取节点 ID
NODE_ID=$(echo "$CREATE_NODE_RESPONSE" | grep -o '"id":"[^"]*"' | cut -d'"' -f4)

if [ -z "$NODE_ID" ]; then
  echo "错误: 无法获取节点 ID"
  exit 1
fi

echo "节点 ID: $NODE_ID"

# 步骤 6: 生成首帧
echo ""
echo "步骤 6: 生成首帧..."
GENERATE_FRAME_RESPONSE=$(curl -s -X POST "${BASE_URL}/api/prism/creation/nodes/${NODE_ID}/generate-frame" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${JWT_TOKEN}" \
  -d '{
    "frameType": "first"
  }')

echo "生成首帧响应: $GENERATE_FRAME_RESPONSE"

# 步骤 7: 锁定首帧
echo ""
echo "步骤 7: 锁定首帧..."
LOCK_FRAME_RESPONSE=$(curl -s -X POST "${BASE_URL}/api/prism/creation/nodes/${NODE_ID}/lock-frame" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${JWT_TOKEN}" \
  -d '{
    "frameType": "first",
    "locked": true
  }')

echo "锁定首帧响应: $LOCK_FRAME_RESPONSE"

# 步骤 8: 生成落幅
echo ""
echo "步骤 8: 生成落幅..."
GENERATE_LAST_FRAME_RESPONSE=$(curl -s -X POST "${BASE_URL}/api/prism/creation/nodes/${NODE_ID}/generate-frame" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${JWT_TOKEN}" \
  -d '{
    "frameType": "last"
  }')

echo "生成落幅响应: $GENERATE_LAST_FRAME_RESPONSE"

# 步骤 9: 锁定落幅
echo ""
echo "步骤 9: 锁定落幅..."
LOCK_LAST_FRAME_RESPONSE=$(curl -s -X POST "${BASE_URL}/api/prism/creation/nodes/${NODE_ID}/lock-frame" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${JWT_TOKEN}" \
  -d '{
    "frameType": "last",
    "locked": true
  }')

echo "锁定落幅响应: $LOCK_LAST_FRAME_RESPONSE"

# 步骤 10: 渲染视频
echo ""
echo "步骤 10: 渲染节点视频..."
RENDER_NODE_RESPONSE=$(curl -s -X POST "${BASE_URL}/api/prism/creation/nodes/${NODE_ID}/render?quality=draft" \
  -H "Authorization: Bearer ${JWT_TOKEN}")

echo "渲染视频响应: $RENDER_NODE_RESPONSE"

# 步骤 11: 串联导出
echo ""
echo "步骤 11: 串联导出..."
STITCH_RESPONSE=$(curl -s -X POST "${BASE_URL}/api/prism/creation/videos/${VIDEO_ID}/stitch" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${JWT_TOKEN}" \
  -d '{
    "includeNarration": true,
    "includeBgm": true,
    "bgmVolume": 50
  }')

echo "串联响应: $STITCH_RESPONSE"

# 步骤 12: 导出项目
echo ""
echo "步骤 12: 导出项目..."
EXPORT_RESPONSE=$(curl -s -X POST "${BASE_URL}/api/prism/creation/videos/${VIDEO_ID}/export" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${JWT_TOKEN}" \
  -d '{
    "format": "mp4"
  }')

echo "导出响应: $EXPORT_RESPONSE"

# 步骤 13: AI 文案拆分
echo ""
echo "步骤 13: AI 文案拆分..."
SCRIPT_SPLIT_RESPONSE=$(curl -s -X POST "${BASE_URL}/api/prism/creation/videos/${VIDEO_ID}/script-split" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${JWT_TOKEN}" \
  -d '{
    "scriptText": "这是一段测试文案。第一段描述了海边的日出，第二段描述了沙滩上的脚印，第三段描述了海鸥飞过天空。",
    "stylePreset": {
      "cameraMovements": ["pan", "zoom", "static"],
      "pacePattern": [1, 1.5, 1],
      "transitionStyle": "crossfade"
    }
  }')

echo "文案拆分响应: $SCRIPT_SPLIT_RESPONSE"

echo ""
echo "=========================================="
echo "工作流测试完成"
echo "=========================================="
echo ""
echo "测试总结:"
echo "  - 用户认证: $(echo $LOGIN_RESPONSE | grep -o 'success' || echo '失败')"
echo "  - 视频创建: $(echo $VIDEO_RESPONSE | grep -o 'id' || echo '失败')"
echo "  - 节点创建: $(echo $CREATE_NODE_RESPONSE | grep -o 'id' || echo '失败')"
echo "  - 首帧生成: $(echo $GENERATE_FRAME_RESPONSE | grep -o 'frameUrl' || echo '失败')"
echo "  - 落幅生成: $(echo $GENERATE_LAST_FRAME_RESPONSE | grep -o 'frameUrl' || echo '失败')"
echo "  - 视频渲染: $(echo $RENDER_NODE_RESPONSE | grep -o 'taskId' || echo '失败')"
echo "  - 串联导出: $(echo $STITCH_RESPONSE | grep -o 'taskId' || echo '失败')"
echo "  - 项目导出: $(echo $EXPORT_RESPONSE | grep -o 'taskId' || echo '失败')"
echo "  - 文案拆分: $(echo $SCRIPT_SPLIT_RESPONSE | grep -o 'segments' || echo '失败')"
