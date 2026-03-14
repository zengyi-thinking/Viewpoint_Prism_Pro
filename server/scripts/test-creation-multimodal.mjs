import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..', '..');

for (const envPath of [
  path.join(rootDir, '.env'),
  path.join(rootDir, '.env.local'),
  path.join(rootDir, 'server', '.env'),
]) {
  if (fs.existsSync(envPath)) {
    dotenv.config({ path: envPath, override: false });
  }
}

const baseUrl = String(process.env.CREATION_AI_BASE_URL || '').replace(/\/+$/, '');
const apiKey = String(process.env.CREATION_AI_API_KEY || '').trim();
const model = String(process.env.CREATION_AI_VISION_MODEL || 'gemini-2.5-flash').trim();
const imagePath = path.join(rootDir, 'product_picture.png');

if (!baseUrl || !apiKey) {
  console.error('missing CREATION_AI_BASE_URL / CREATION_AI_API_KEY');
  process.exit(1);
}

if (!fs.existsSync(imagePath)) {
  console.error(`missing image: ${imagePath}`);
  process.exit(1);
}

const imageBase64 = fs.readFileSync(imagePath).toString('base64');
const dataUrl = `data:image/png;base64,${imageBase64}`;

async function main() {
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      temperature: 0,
      max_tokens: 220,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text:
                '请用一句中文描述这张图片的主视觉主体、周围悬浮界面/图表元素以及整体科技感氛围，不要解释，不要编号。',
            },
            {
              type: 'image_url',
              image_url: { url: dataUrl },
            },
          ],
        },
      ],
    }),
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`multimodal failed: ${response.status} ${text}`);
  }

  const json = JSON.parse(text);
  const content = String(json?.choices?.[0]?.message?.content || '').trim();
  const joined = content.toLowerCase();
  const keywords = ['prism', '棱镜', '棱锥', '面板', '仪表盘', 'dashboard', '图表', '全息', '界面'];
  const matched = keywords.some((keyword) => joined.includes(keyword.toLowerCase()));

  if (!matched) {
    throw new Error(`vision did not appear to consume image content: ${content}`);
  }

  console.log(`[config] baseUrl=${baseUrl}`);
  console.log(`[config] model=${model}`);
  console.log('[result] multimodal real-image check passed');
  console.log(content);
}

main().catch((error) => {
  console.error('[result] failed');
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
