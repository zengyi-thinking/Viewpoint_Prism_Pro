import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execFileSync } from 'child_process';
import dotenv from 'dotenv';

const API_BASE = process.env.CREATION_E2E_API_BASE || 'http://localhost:7861';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..', '..');
const phase3ResultPath = path.resolve(repoRoot, '__creation_phase3_render_e2e_result.json');
const password = 'CreationE2E123!';

for (const envPath of [
  path.join(repoRoot, '.env'),
  path.join(repoRoot, '.env.local'),
  path.join(repoRoot, 'server', '.env'),
]) {
  if (fs.existsSync(envPath)) {
    dotenv.config({ path: envPath, override: false });
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function sqlLiteral(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

function runSql(sql, params = []) {
  let finalSql = sql;
  params.forEach((value, index) => {
    finalSql = finalSql.replace(new RegExp(`\\$${index + 1}`, 'g'), sqlLiteral(value));
  });
  return execFileSync(
    'docker',
    ['exec', 'vpp-postgres', 'psql', '-U', 'postgres', '-d', 'viewpoint_prism', '-t', '-A', '-c', finalSql],
    { encoding: 'utf8' },
  );
}

async function parseJsonSafe(res) {
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

async function api(pathname, { token, headers, ...options } = {}) {
  const res = await fetch(`${API_BASE}${pathname}`, {
    ...options,
    headers: {
      ...(headers || {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
  const body = await parseJsonSafe(res);
  if (!res.ok) {
    const message = body?.message || body?.error || body?.raw || `HTTP ${res.status}`;
    throw new Error(`${pathname} -> ${message}`);
  }
  return body?.data ?? body;
}

async function pollTask(token, taskId, timeoutMs = 900000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const task = await api(`/api/prism/creation/tasks/${taskId}`, {
      method: 'GET',
      token,
    });
    if (task.status === 'COMPLETED' || task.status === 'FAILED') return task;
    await new Promise((resolve) => setTimeout(resolve, 5000));
  }
  throw new Error(`task ${taskId} timed out`);
}

async function login(email) {
  const loggedIn = await api('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  return loggedIn.token;
}

async function main() {
  assert(fs.existsSync(phase3ResultPath), 'missing __creation_phase3_render_e2e_result.json');
  const phase3Result = JSON.parse(fs.readFileSync(phase3ResultPath, 'utf8'));
  const flowProjectId = String(phase3Result.flowProjectId || '').trim();
  const email = String(phase3Result.ownerEmail || process.env.PHASE3_EMAIL || '').trim();
  assert(flowProjectId, 'phase3 result missing flowProjectId');
  assert(email, 'phase3 result missing ownerEmail');

  const token = await login(email);
  const phase3NodeId = String(phase3Result.renderedNodeIds?.[0] || '').trim();
  const phase3VideoUrl = String(phase3Result.renderedClipUrls?.[0] || '').trim();
  if (phase3NodeId && phase3VideoUrl) {
    runSql(
      `update flow_nodes
       set "renderedVideoUrl" = $2,
           "renderStatus" = 'COMPLETED'
       where id = $1`,
      [phase3NodeId, phase3VideoUrl],
    );
    runSql(
      `update flow_nodes
       set "renderedVideoUrl" = $2,
           "renderStatus" = 'COMPLETED'
       where "flowProjectId" = $1
         and (
           "renderedVideoUrl" is null
           or trim(coalesce("renderedVideoUrl", '')) = ''
           or "renderStatus" is null
           or "renderStatus"::text <> 'COMPLETED'
         )`,
      [flowProjectId, phase3VideoUrl],
    );
  }

  const graph = await api(`/api/prism/creation/projects/${flowProjectId}/graph`, {
    method: 'GET',
    token,
  });
  const node = graph.nodes.find((item) => item.renderedVideoUrl) || graph.nodes[0];
  assert(node?.id && node.renderedVideoUrl, 'no rendered node found for retry e2e');

  const originalVideoUrl = String(node.renderedVideoUrl || '').trim();

  try {
    runSql(
      `update flow_nodes
       set "renderedVideoUrl" = $2
       where id = $1`,
      [node.id, 'http://localhost:7860/storage/viewpoint-prism/missing/retry-render.mp4'],
    );

    const stitchTask = await api(`/api/prism/creation/projects/${flowProjectId}/stitch`, {
      method: 'POST',
      token,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ includeVoiceover: false, includeBgm: false }),
    });
    const failed = await pollTask(token, stitchTask.taskId);
    assert(failed.status === 'FAILED', 'corrupted stitch task should fail');

    runSql(
      `update flow_nodes
       set "renderedVideoUrl" = $2
       where id = $1`,
      [node.id, originalVideoUrl],
    );

    const retried = await api(`/api/prism/creation/tasks/${stitchTask.taskId}/retry`, {
      method: 'POST',
      token,
    });
    const completed = await pollTask(token, retried.taskId);
    assert(completed.status === 'COMPLETED', 'retried stitch task should complete');
    assert(completed.result?.downloadUrl, 'retried stitch task should return downloadUrl');

    const outPath = path.resolve(repoRoot, '__creation_retry_e2e_result.json');
    fs.writeFileSync(
      outPath,
      JSON.stringify(
        {
          success: true,
          flowProjectId,
          nodeId: node.id,
          failedTaskId: stitchTask.taskId,
          retriedTaskId: retried.taskId,
          downloadUrl: completed.result.downloadUrl,
          testedAt: new Date().toISOString(),
        },
        null,
        2,
      ),
      'utf8',
    );
    console.log(`[creation-retry-e2e] done ${outPath}`);
  } finally {
    runSql(
      `update flow_nodes
       set "renderedVideoUrl" = $2
       where id = $1`,
      [node.id, originalVideoUrl],
    );
  }
}

main().catch((error) => {
  console.error('[creation-retry-e2e] failed', error);
  process.exitCode = 1;
});
