import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';

const API_BASE = process.env.CREATION_E2E_API_BASE || 'http://localhost:7861';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..', '..');
const artifactsDir = path.resolve(repoRoot, 'artifacts');

const password = 'CreationE2E123!';

function log(step, payload) {
  const prefix = `[creation-phase4-e2e] ${step}`;
  if (payload === undefined) {
    console.log(prefix);
    return;
  }
  console.log(prefix, payload);
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

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function ensureAuth(email) {
  const loggedIn = await api('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  return loggedIn.token;
}

async function pollTask(token, taskId, timeoutMs = 1200000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const task = await api(`/api/prism/creation/tasks/${taskId}`, {
      method: 'GET',
      token,
    });
    if (task.status === 'COMPLETED') return task;
    if (task.status === 'FAILED') throw new Error(`task ${taskId} failed: ${task.error || 'unknown error'}`);
    await new Promise((resolve) => setTimeout(resolve, 5000));
  }
  throw new Error(`task ${taskId} timed out`);
}

function buildDownloadCandidates(url) {
  const candidates = [url];
  try {
    const parsed = new URL(url);
    const apiOrigin = new URL(API_BASE).origin;
    if (parsed.origin !== apiOrigin) {
      candidates.push(`${apiOrigin}${parsed.pathname}${parsed.search}`);
    }
  } catch {
    return candidates;
  }
  return [...new Set(candidates)];
}

async function downloadFile(url, filePath) {
  const candidates = buildDownloadCandidates(url);
  let lastError;

  for (const candidate of candidates) {
    for (let attempt = 1; attempt <= 5; attempt += 1) {
      try {
        const res = await fetch(candidate);
        if (!res.ok) {
          throw new Error(`download failed (${res.status}) ${candidate}`);
        }
        const buffer = Buffer.from(await res.arrayBuffer());
        fs.mkdirSync(path.dirname(filePath), { recursive: true });
        fs.writeFileSync(filePath, buffer);
        return filePath;
      } catch (error) {
        lastError = error;
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }
    }
  }

  throw lastError;
}

async function main() {
  const phase3ResultPath = path.resolve(repoRoot, '__creation_phase3_render_e2e_result.json');
  if (!fs.existsSync(phase3ResultPath)) {
    throw new Error('missing __creation_phase3_render_e2e_result.json, run phase3 e2e first');
  }
  const phase3Result = JSON.parse(fs.readFileSync(phase3ResultPath, 'utf8'));
  const flowProjectId = String(phase3Result.flowProjectId || '').trim();
  assert(flowProjectId, 'phase3 result missing flowProjectId');

  let email = String(process.env.PHASE4_EMAIL || phase3Result.ownerEmail || '').trim();
  if (!email && process.env.DATABASE_URL) {
    const client = new pg.Client({
      connectionString: process.env.DATABASE_URL,
    });
    await client.connect();
    const row = await client.query(
      `
        select u.email
        from prismflow_projects p
        join projects pr on pr.id = p.project_id
        join users u on u.id = pr.user_id
        where p.id = $1
      `,
      [flowProjectId],
    );
    await client.end();
    email = String(row.rows[0]?.email || '').trim();
  }
  assert(email, 'failed to resolve phase3 project owner email');

  const token = await ensureAuth(email);
  const graph = await api(`/api/prism/creation/projects/${flowProjectId}/graph`, {
    method: 'GET',
    token,
  });
  assert(graph.nodes.length >= 1, 'phase3 project should contain at least one rendered node');

  const stitchTask = await api(`/api/prism/creation/projects/${flowProjectId}/stitch`, {
    method: 'POST',
    token,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      includeVoiceover: true,
      includeBgm: true,
      voiceoverText: '警报响起，沈岚冲向闸门。',
    }),
  });
  const stitched = await pollTask(token, stitchTask.taskId, 1500000);
  assert(stitched.result?.downloadUrl, 'final stitched video should exist');

  const refreshedGraph = await api(`/api/prism/creation/projects/${flowProjectId}/graph`, {
    method: 'GET',
    token,
  });
  assert(refreshedGraph.project.meta.finalVideo?.downloadUrl, 'graph meta should contain finalVideo.downloadUrl');

  const timestamp = Date.now();
  const finalVideoPath = path.resolve(artifactsDir, `creation-phase4-final-${timestamp}.mp4`);
  await downloadFile(stitched.result.downloadUrl, finalVideoPath);

  const clipPaths = [];
  for (let i = 0; i < graph.nodes.length; i += 1) {
    const videoUrl = graph.nodes[i]?.renderedVideoUrl;
    assert(videoUrl, `rendered clip ${i + 1} missing videoUrl`);
    const clipPath = path.resolve(artifactsDir, `creation-phase4-clip-${i + 1}-${timestamp}.mp4`);
    await downloadFile(videoUrl, clipPath);
    clipPaths.push(clipPath);
  }

  const result = {
    success: true,
    apiBase: API_BASE,
    flowProjectId,
    renderedNodeIds: graph.nodes.map((item) => item.id),
    renderedClipUrls: graph.nodes.map((item) => item.renderedVideoUrl),
    stitchedUrl: stitched.result.downloadUrl,
    localFinalVideoPath: finalVideoPath,
    localClipPaths: clipPaths,
    finalVideoMeta: refreshedGraph.project.meta.finalVideo,
    testedAt: new Date().toISOString(),
  };

  const outPath = path.resolve(repoRoot, '__creation_phase4_compose_e2e_result.json');
  fs.writeFileSync(outPath, JSON.stringify(result, null, 2), 'utf8');
  log('done', outPath);
}

main().catch((error) => {
  console.error('[creation-phase4-e2e] failed', error);
  process.exitCode = 1;
});
