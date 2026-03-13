import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const API_BASE = process.env.CREATION_E2E_API_BASE || 'http://localhost:7861';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..', '..');
const artifactsDir = path.resolve(repoRoot, 'artifacts');

const email = `creation-phase3-${Date.now()}@example.com`;
const password = 'CreationE2E123!';
const name = 'Creation Phase3 E2E';

function log(step, payload) {
  const prefix = `[creation-phase3-e2e] ${step}`;
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

async function ensureAuth() {
  try {
    const registered = await api('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, name }),
    });
    return registered.token;
  } catch {
    const loggedIn = await api('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    return loggedIn.token;
  }
}

async function createProject(token) {
  return api('/api/projects', {
    method: 'POST',
    token,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: `Creation Phase3 ${Date.now()}`,
      description: 'Creation Prism phase3 render e2e',
    }),
  });
}

async function pollTask(token, taskId, timeoutMs = 900000) {
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

async function main() {
  const token = await ensureAuth();
  const project = await createProject(token);
  log('project', project.id);

  let graph = await api(`/api/prism/creation/projects/${project.id}/bootstrap`, {
    method: 'POST',
    token,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  });

  const rounds = [
    '我要做一个近未来海上能源站悬疑短片，女工程师沈岚在夜间发现系统日志出现异常，怀疑有人篡改了维护记录。',
    '风格要求高质量、写实电影感、冷色光线、潮湿金属表面、海雾和红色警报灯，像流媒体悬疑剧。',
    '篇幅控制成本，先用第一章做样片，每个片段保持短时长，但画面要稳，角色和场景要连续。',
    '前半段文戏调查，后半段机械系统进入告警状态，通道逐步关闭，镜头里要有环境压迫感。',
    '尽量输出适合 veo3.1-fast 的短视频提示词，不要过长，每个片段三秒左右就够。',
  ];

  for (const content of rounds) {
    graph = await api(`/api/prism/creation/projects/${project.id}/conversation/messages`, {
      method: 'POST',
      token,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content }),
    });
  }

  const conversation = graph.project.meta.conversationState;
  const plan = await api(`/api/prism/creation/projects/${project.id}/script-plan`, {
    method: 'POST',
    token,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      scriptText: conversation.scriptDraft,
      chaptersHint: conversation.chaptersHint,
    }),
  });

  graph = await api(`/api/prism/creation/projects/${plan.flowProjectId}/production-package`, {
    method: 'POST',
    token,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ artStyle: conversation.summary.visualStyle }),
  });

  const firstChapter = graph.project.meta.scriptPlan.chapters[0];
  graph = await api(`/api/prism/creation/projects/${plan.flowProjectId}/chapters/create`, {
    method: 'POST',
    token,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chapterIndex: firstChapter.index }),
  });

  assert(graph.nodes.length >= 1, 'chapter nodes should exist');
  const nodesToRender = graph.nodes.slice(0, 1);

  for (const node of nodesToRender) {
    log('generate image', node.id);
    await api(`/api/prism/creation/nodes/${node.id}/generate-image`, {
      method: 'POST',
      token,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ overwrite: true }),
    });
  }

  const renderResults = [];
  for (const node of nodesToRender) {
    log('submit render', node.id);
    const renderTask = await api(`/api/prism/creation/nodes/${node.id}/render-video`, {
      method: 'POST',
      token,
    });
    const done = await pollTask(token, renderTask.taskId, 1200000);
    renderResults.push(done);
  }

  const stitchTask = await api(`/api/prism/creation/projects/${plan.flowProjectId}/stitch`, {
    method: 'POST',
    token,
  });
  const stitched = await pollTask(token, stitchTask.taskId, 1200000);
  assert(stitched.result?.downloadUrl, 'final stitched video should exist');

  const timestamp = Date.now();
  const finalVideoPath = path.resolve(artifactsDir, `creation-phase3-final-${timestamp}.mp4`);
  await downloadFile(stitched.result.downloadUrl, finalVideoPath);

  const clipPaths = [];
  for (let i = 0; i < renderResults.length; i += 1) {
    const videoUrl = renderResults[i]?.result?.videoUrl;
    assert(videoUrl, `rendered clip ${i + 1} missing videoUrl`);
    const clipPath = path.resolve(artifactsDir, `creation-phase3-clip-${i + 1}-${timestamp}.mp4`);
    await downloadFile(videoUrl, clipPath);
    clipPaths.push(clipPath);
  }

  const result = {
    success: true,
    apiBase: API_BASE,
    flowProjectId: plan.flowProjectId,
    renderedNodeIds: nodesToRender.map((item) => item.id),
    renderedClipUrls: renderResults.map((item) => item.result?.videoUrl),
    stitchedUrl: stitched.result.downloadUrl,
    localFinalVideoPath: finalVideoPath,
    localClipPaths: clipPaths,
    testedAt: new Date().toISOString(),
  };

  const outPath = path.resolve(repoRoot, '__creation_phase3_render_e2e_result.json');
  fs.writeFileSync(outPath, JSON.stringify(result, null, 2), 'utf8');
  log('done', outPath);
}

main().catch((error) => {
  console.error('[creation-phase3-e2e] failed', error);
  process.exitCode = 1;
});
