import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const API_BASE = process.env.CREATION_E2E_API_BASE || 'http://localhost:3001';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..', '..');
const VIDEO_PATH =
  process.env.CREATION_E2E_VIDEO_PATH ||
  path.resolve(repoRoot, 'vedios', 'videoplayback (8).mp4');

const email = `creation-e2e-${Date.now()}@example.com`;
const password = 'CreationE2E123!';
const name = 'Creation E2E';

function log(step, payload) {
  const prefix = `[creation-v2-e2e] ${step}`;
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
    const message =
      body?.message ||
      body?.error ||
      body?.raw ||
      `HTTP ${res.status}`;
    throw new Error(`${pathname} -> ${message}`);
  }

  return body?.data ?? body;
}

async function ensureAuth() {
  try {
    const registered = await api('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, name }),
    });
    return registered.token;
  } catch (error) {
    log('register failed, trying login', error.message);
    const loggedIn = await api('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    return loggedIn.token;
  }
}

async function createProject(token, projectName) {
  return api('/api/projects', {
    method: 'POST',
    token,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: projectName,
      description: 'Creation Prism V2 E2E smoke test',
    }),
  });
}

async function uploadVideo(token, projectId, filePath) {
  const buffer = fs.readFileSync(filePath);
  const file = new File([buffer], path.basename(filePath), { type: 'video/mp4' });
  const form = new FormData();
  form.append('file', file);

  return api(`/api/videos/upload?projectId=${projectId}`, {
    method: 'POST',
    token,
    body: form,
  });
}

async function pollTask(token, taskId, timeoutMs = 240000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const task = await api(`/api/prism/creation/tasks/${taskId}`, {
      method: 'GET',
      token,
    });
    if (task.status === 'COMPLETED') return task;
    if (task.status === 'FAILED') {
      throw new Error(`task ${taskId} failed: ${task.error || 'unknown error'}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 5000));
  }
  throw new Error(`task ${taskId} timed out after ${timeoutMs}ms`);
}

async function runIdeaFlow(token) {
  log('idea flow: create project');
  const project = await createProject(token, `Creation V2 Idea ${Date.now()}`);

  log('idea flow: upload video', VIDEO_PATH);
  const video = await uploadVideo(token, project.id, VIDEO_PATH);

  log('idea flow: bootstrap');
  const boot = await api(`/api/prism/creation/videos/${video.id}/project/bootstrap`, {
    method: 'POST',
    token,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Idea Flow Project' }),
  });

  log('idea flow: generate previews');
  const previewResult = await api(`/api/prism/creation/videos/${video.id}/idea-previews`, {
    method: 'POST',
    token,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      idea: '一个关于普通程序员误入巨型自动化工厂，并在机器暴走前修复系统的短片',
      conflict: '人必须在失控的工业系统和有限时间之间做选择',
      setting: '废弃但仍在运转的自动化工厂',
      visualGoal: '强调空间压迫感、工业细节、人与机器的尺度反差',
      constraints: '避免玄幻设定，保持近未来工业现实感',
      count: 3,
    }),
  });

  if (!previewResult.previews?.length) {
    throw new Error('idea previews empty');
  }

  const selectedPreview = previewResult.previews[0];
  log('idea flow: select preview', selectedPreview.title);
  const graphAfterFirstNode = await api(
    `/api/prism/creation/projects/${boot.project.id}/previews/select`,
    {
      method: 'POST',
      token,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ previewId: selectedPreview.id }),
    },
  );

  const firstNode = graphAfterFirstNode.nodes[0];
  if (!firstNode?.id) {
    throw new Error('first node not created');
  }

  log('idea flow: generate next candidates');
  const candidatesResult = await api(`/api/prism/creation/nodes/${firstNode.id}/next-candidates`, {
    method: 'POST',
    token,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      intent: '让主角发现系统异常来源，并推动他必须进入核心控制区',
      count: 3,
    }),
  });

  if (!candidatesResult.candidates?.length) {
    throw new Error('next candidates empty');
  }

  log('idea flow: select next candidate');
  const graphAfterNextNode = await api(
    `/api/prism/creation/nodes/${firstNode.id}/next-candidates/select`,
    {
      method: 'POST',
      token,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ candidateId: candidatesResult.candidates[0].id }),
    },
  );

  const secondNode = graphAfterNextNode.nodes.find((node) => node.parentNodeId === firstNode.id);
  if (!secondNode?.id) {
    throw new Error('second node not created');
  }

  log('idea flow: generate image');
  const imageResult = await api(`/api/prism/creation/nodes/${firstNode.id}/generate-image`, {
    method: 'POST',
    token,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ overwrite: true }),
  });

  if (!imageResult.imageUrl) {
    throw new Error('image generation returned no imageUrl');
  }

  log('idea flow: render video');
  let renderTask = null;
  let renderDone = null;
  let renderError = null;
  try {
    renderTask = await api(`/api/prism/creation/nodes/${firstNode.id}/render-video`, {
      method: 'POST',
      token,
    });
    renderDone = await pollTask(token, renderTask.taskId, 360000);
  } catch (error) {
    renderError = error instanceof Error ? error.message : String(error);
    log('idea flow: render blocked', renderError);
  }

  let stitchTask = null;
  let stitchDone = null;
  let stitchError = null;
  if (renderDone) {
    log('idea flow: stitch project');
    try {
      stitchTask = await api(`/api/prism/creation/projects/${boot.project.id}/stitch`, {
        method: 'POST',
        token,
      });
      stitchDone = await pollTask(token, stitchTask.taskId, 360000);
    } catch (error) {
      stitchError = error instanceof Error ? error.message : String(error);
      log('idea flow: stitch failed', stitchError);
    }
  }

  return {
    projectId: project.id,
    videoId: video.id,
    flowProjectId: boot.project.id,
    firstNodeId: firstNode.id,
    secondNodeId: secondNode.id,
    imageUrl: imageResult.imageUrl,
    renderTask,
    renderResult: renderDone,
    renderError,
    stitchTask,
    stitchResult: stitchDone,
    stitchError,
  };
}

async function runScriptFlow(token) {
  log('script flow: create project');
  const project = await createProject(token, `Creation V2 Script ${Date.now()}`);

  log('script flow: upload video', VIDEO_PATH);
  const video = await uploadVideo(token, project.id, VIDEO_PATH);

  const scriptText = `
第一章：停机警报
午夜的自动化工厂仍在运转，主角林策接到一条异常报警，显示整条机械臂流水线正在自行改写控制参数。

第二章：进入核心区
林策进入工厂深处，发现旧控制室被封锁。监控画面中，失控的运输平台正把所有零件运向一台本该报废的主控机。

第三章：人工与系统的对抗
主控机开始广播过时的生产指令，要求恢复旧时代的满负荷生产。林策必须在断电和重写底层逻辑之间做出选择。
`.trim();

  log('script flow: generate script plan');
  const planResult = await api(`/api/prism/creation/videos/${video.id}/script-plan`, {
    method: 'POST',
    token,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      scriptText,
      chaptersHint: 3,
    }),
  });

  if (!planResult.scriptPlan?.chapters?.length) {
    throw new Error('script plan empty');
  }

  log('script flow: create chapter nodes');
  const graph = await api(`/api/prism/creation/projects/${planResult.flowProjectId}/chapters/create`, {
    method: 'POST',
    token,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chapterIndex: 1 }),
  });

  if (!graph.nodes?.length) {
    throw new Error('chapter nodes not created');
  }

  return {
    projectId: project.id,
    videoId: video.id,
    flowProjectId: planResult.flowProjectId,
    chapterCount: planResult.scriptPlan.chapters.length,
    createdNodes: graph.nodes.length,
  };
}

async function main() {
  if (!fs.existsSync(VIDEO_PATH)) {
    throw new Error(`video not found: ${VIDEO_PATH}`);
  }

  const token = await ensureAuth();
  log('auth ok');

  const idea = await runIdeaFlow(token);
  const script = await runScriptFlow(token);

  const result = {
    success: true,
    apiBase: API_BASE,
    videoPath: VIDEO_PATH,
    idea,
    script,
    notes: {
      renderVideo:
        idea.renderError || null,
      stitch:
        idea.stitchError || null,
    },
    testedAt: new Date().toISOString(),
  };

  const outPath = path.resolve(repoRoot, '__creation_v2_e2e_result.json');
  fs.writeFileSync(outPath, JSON.stringify(result, null, 2), 'utf8');
  log('done', outPath);
}

main().catch((error) => {
  console.error('[creation-v2-e2e] failed', error);
  process.exitCode = 1;
});
