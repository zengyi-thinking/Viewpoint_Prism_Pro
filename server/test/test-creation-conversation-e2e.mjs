import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const API_BASE = process.env.CREATION_E2E_API_BASE || 'http://localhost:3001';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..', '..');

const email = `creation-conversation-${Date.now()}@example.com`;
const password = 'CreationE2E123!';
const name = 'Creation Conversation E2E';

function log(step, payload) {
  const prefix = `[creation-conversation-e2e] ${step}`;
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
      description: 'Creation Prism conversation e2e smoke test',
    }),
  });
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function main() {
  const token = await ensureAuth();
  log('auth ok');

  const project = await createProject(token, `Creation Conversation ${Date.now()}`);
  log('project created', project.id);

  const bootstrapped = await api(`/api/prism/creation/projects/${project.id}/bootstrap`, {
    method: 'POST',
    token,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  });
  log('bootstrap ok', bootstrapped.project.id);

  const messages = [
    '我想做一个近未来悬疑短片，核心是一个女工程师在海上能源站发现系统开始伪造值班记录。',
    '整体风格偏冷色、写实电影感，强调潮湿金属、夜间海雾和有限光源，不要二次元。',
    '结构想做成 4 章，每章都要有明确推进，前两章文戏悬疑多一些，后两章节奏逐步升级。',
    '主角叫沈岚，三十岁左右，短发，穿深蓝防水工装，性格克制但判断果断。',
    '拆分上希望每章 3 到 4 个镜头节点，先保证剧情清楚，再考虑动作和视觉奇观。',
  ];

  let latestGraph = bootstrapped;
  for (let i = 0; i < messages.length; i += 1) {
    latestGraph = await api(`/api/prism/creation/projects/${project.id}/conversation/messages`, {
      method: 'POST',
      token,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: messages[i] }),
    });
    log(`conversation round ${i + 1}`, latestGraph.project.meta.conversationState.summary);
  }

  const conversationState = latestGraph.project.meta.conversationState;
  assert(conversationState.messages.length >= 10, 'conversationState messages should include 5 user + 5 assistant messages');
  assert(conversationState.summary.storyIntent, 'storyIntent should not be empty');
  assert(conversationState.summary.visualStyle, 'visualStyle should not be empty');
  assert(conversationState.summary.splitPreference, 'splitPreference should not be empty');
  assert(conversationState.scriptDraft, 'scriptDraft should not be empty');
  assert(conversationState.chaptersHint >= 1, 'chaptersHint should be valid');

  const planResult = await api(`/api/prism/creation/projects/${project.id}/script-plan`, {
    method: 'POST',
    token,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      scriptText: conversationState.scriptDraft,
      chaptersHint: conversationState.chaptersHint,
    }),
  });
  log('script plan generated', planResult.scriptPlan.chapters.length);

  assert(planResult.scriptPlan.chapters.length >= 2, 'script plan should contain at least 2 chapters');
  const originalChapters = JSON.parse(JSON.stringify(planResult.scriptPlan.chapters));
  const targetChapter = originalChapters[1];

  const updatedGraph = await api(
    `/api/prism/creation/projects/${planResult.flowProjectId}/script-plan/chapters/${targetChapter.index}`,
    {
      method: 'PATCH',
      token,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: `${targetChapter.title}·封锁升级`,
        summary: `${targetChapter.summary} 并明确海上平台进入封锁状态。`,
        goal: `${targetChapter.goal}，同时确认伪造日志来自核心控制层。`,
        storyboardCount: Math.min(6, Math.max(2, targetChapter.storyboardCount + 1)),
      }),
    },
  );
  log('chapter updated', targetChapter.index);

  const updatedChapters = updatedGraph.project.meta.scriptPlan.chapters;
  const updatedTarget = updatedChapters.find((chapter) => chapter.index === targetChapter.index);
  const untouchedChapter = updatedChapters.find((chapter) => chapter.index === originalChapters[0].index);

  assert(updatedTarget, 'updated chapter should exist');
  assert(updatedTarget.title !== targetChapter.title, 'target chapter title should change');
  assert(
    untouchedChapter.title === originalChapters[0].title &&
      untouchedChapter.summary === originalChapters[0].summary &&
      untouchedChapter.goal === originalChapters[0].goal,
    'other chapters should remain unchanged',
  );

  const chapterGraph = await api(`/api/prism/creation/projects/${planResult.flowProjectId}/chapters/create`, {
    method: 'POST',
    token,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chapterIndex: targetChapter.index }),
  });
  log('chapter nodes created', chapterGraph.nodes.length);

  assert(chapterGraph.nodes.length >= updatedTarget.storyboardCount, 'chapter nodes should be created');

  const result = {
    success: true,
    apiBase: API_BASE,
    projectId: project.id,
    flowProjectId: planResult.flowProjectId,
    conversationSummary: conversationState.summary,
    chaptersHint: conversationState.chaptersHint,
    scriptDraftPreview: conversationState.scriptDraft.slice(0, 240),
    chapterCount: updatedChapters.length,
    updatedChapter: updatedTarget,
    createdNodes: chapterGraph.nodes.length,
    testedAt: new Date().toISOString(),
  };

  const outPath = path.resolve(repoRoot, '__creation_conversation_e2e_result.json');
  fs.writeFileSync(outPath, JSON.stringify(result, null, 2), 'utf8');
  log('done', outPath);
}

main().catch((error) => {
  console.error('[creation-conversation-e2e] failed', error);
  process.exitCode = 1;
});
