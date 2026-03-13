import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..', '..');
const envCandidates = [
  path.join(rootDir, '.env'),
  path.join(rootDir, '.env.local'),
  path.join(rootDir, 'server', '.env'),
];

for (const envPath of envCandidates) {
  if (fs.existsSync(envPath)) {
    dotenv.config({ path: envPath, override: false });
  }
}

const trimTrailingSlash = (value) => String(value || '').replace(/\/+$/, '');
const baseUrl = trimTrailingSlash(
  process.env.CREATION_AI_BASE_URL ||
    process.env.OPENAI_BASE_URL ||
    process.env.SILICONFLOW_BASE_URL,
);
const apiKey =
  process.env.CREATION_AI_API_KEY ||
  process.env.OPENAI_API_KEY ||
  process.env.OPENAI_KEY ||
  '';
const model = process.env.CREATION_AI_CHAT_MODEL || process.env.OPENAI_MODEL_CHAT || 'gpt-4o';

if (!baseUrl || !apiKey) {
  console.error('Missing CREATION_AI_BASE_URL / CREATION_AI_API_KEY (or compatible OPENAI_* env).');
  process.exit(1);
}

const authHeaders = {
  Authorization: `Bearer ${apiKey}`,
  'Content-Type': 'application/json',
};

async function testModels() {
  const response = await fetch(`${baseUrl}/models`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
  });

  if (!response.ok) {
    throw new Error(`models failed: ${response.status} ${await response.text()}`);
  }

  const json = await response.json();
  const count = Array.isArray(json?.data) ? json.data.length : 0;
  console.log(`[models] ok, count=${count}`);
}

async function testChat() {
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content: '只回复 OK' }],
      temperature: 0,
      max_tokens: 16,
    }),
  });

  if (!response.ok) {
    throw new Error(`chat failed: ${response.status} ${await response.text()}`);
  }

  const json = await response.json();
  const text = json?.choices?.[0]?.message?.content?.trim();
  console.log(`[chat] ok, model=${json?.model || model}, reply=${JSON.stringify(text)}`);
}

async function main() {
  console.log(`[config] baseUrl=${baseUrl}`);
  console.log(`[config] model=${model}`);
  await testModels();
  await testChat();
  console.log('[result] creation transit checks passed');
}

main().catch((error) => {
  console.error('[result] failed');
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
