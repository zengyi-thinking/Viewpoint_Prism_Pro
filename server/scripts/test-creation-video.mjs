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

const trimTrailingSlash = (value) => String(value || '').replace(/\/+$/, '');
const baseUrl = trimTrailingSlash(process.env.CREATION_AI_BASE_URL);
const apiKey = process.env.CREATION_AI_API_KEY || '';
const model = process.env.CREATION_AI_VIDEO_MODEL || 'chat_fast_video';
const prompt = process.env.CREATION_AI_VIDEO_TEST_PROMPT || 'A short cinematic shot of rain on a neon street at night';
const pollIntervalMs = Number(process.env.CREATION_AI_VIDEO_POLL_INTERVAL_MS || 5000);
const maxPollAttempts = Number(process.env.CREATION_AI_VIDEO_MAX_POLL_ATTEMPTS || 60);

if (!baseUrl || !apiKey) {
  console.error('Missing CREATION_AI_BASE_URL / CREATION_AI_API_KEY.');
  process.exit(1);
}

const headers = {
  Authorization: `Bearer ${apiKey}`,
  'Content-Type': 'application/json',
};

function parseJson(text) {
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    return { raw: text };
  }
}

function extractTaskId(data) {
  return data?.id || data?.task_id || data?.taskId || data?.data?.id || data?.data?.task_id || null;
}

function extractStatus(data) {
  return String(
    data?.status ||
      data?.state ||
      data?.task_status ||
      data?.data?.status ||
      data?.data?.state ||
      data?.data?.task_status ||
      data?.data?.data?.status ||
      '',
  ).toLowerCase();
}

function extractUrl(data) {
  return (
    data?.url ||
    data?.video_url ||
    data?.data?.url ||
    data?.data?.video_url ||
    data?.data?.data?.url ||
    data?.data?.data?.video_url ||
    data?.output?.url ||
    data?.data?.output?.url ||
    null
  );
}

function isSuccessStatus(status) {
  return ['succeeded', 'success', 'completed', 'done'].includes(status);
}

function isFailureStatus(status) {
  return ['failed', 'error', 'cancelled', 'canceled'].includes(status);
}

const isVeoModel = /veo/i.test(model);
const submitResponse = await fetch(
  `${baseUrl}/video/generations`,
  isVeoModel
    ? (() => {
        const form = new FormData();
        form.append('model', model);
        form.append('prompt', prompt);
        return {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${apiKey}`,
          },
          body: form,
        };
      })()
    : {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model,
          prompt,
          image_size: '1280x720',
        }),
      },
);

const submitText = await submitResponse.text();
const submitJson = parseJson(submitText);

console.log(`[submit] status=${submitResponse.status}`);
console.log(`[submit] body=${submitText.slice(0, 800)}`);

if (!submitResponse.ok) {
  process.exit(1);
}

const taskId = extractTaskId(submitJson);
if (!taskId) {
  console.error('Missing task id in submit response.');
  process.exit(1);
}

for (let attempt = 1; attempt <= maxPollAttempts; attempt += 1) {
  await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
  const statusResponse = await fetch(`${baseUrl}/video/generations/${taskId}`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  const statusText = await statusResponse.text();
  const statusJson = parseJson(statusText);
  const status = extractStatus(statusJson);
  const url = extractUrl(statusJson);

  console.log(`[poll ${attempt}] statusCode=${statusResponse.status} status=${status || 'unknown'} url=${url || 'none'}`);

  if (!statusResponse.ok) {
    console.log(statusText.slice(0, 800));
    process.exit(1);
  }

  if (url || isSuccessStatus(status)) {
    console.log('[result] success');
    console.log(statusText.slice(0, 1200));
    process.exit(0);
  }

  if (isFailureStatus(status)) {
    console.log('[result] failed');
    console.log(statusText.slice(0, 1200));
    process.exit(1);
  }
}

console.log('[result] timeout');
process.exit(1);
