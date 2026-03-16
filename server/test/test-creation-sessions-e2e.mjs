import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const API_BASE = process.env.CREATION_E2E_API_BASE || 'http://localhost:3001';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..', '..');

const email = `creation-sessions-${Date.now()}@example.com`;
const password = 'CreationE2E123!';
const name = 'Creation Sessions E2E';

function log(step, payload) {
  const prefix = `[creation-sessions-e2e] ${step}`;
  if (payload === undefined) {
    console.log(prefix);
    return;
  }
  console.log(prefix, payload);
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
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

async function createProject(token, projectName) {
  return api('/api/projects', {
    method: 'POST',
    token,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: projectName,
      description: 'Creation Prism session management e2e smoke test',
    }),
  });
}

async function main() {
  const token = await ensureAuth();
  const project = await createProject(token, `Creation Sessions ${Date.now()}`);
  log('project created', project.id);

  const initialSessions = await api(`/api/prism/creation/projects/${project.id}/sessions`, {
    token,
  });
  assert(Array.isArray(initialSessions) && initialSessions.length === 0, 'new project should start with 0 sessions');

  const sessionA = await api(`/api/prism/creation/projects/${project.id}/sessions`, {
    method: 'POST',
    token,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: '会话 A' }),
  });
  assert(sessionA.project.id, 'session A should have flow project id');

  let sessions = await api(`/api/prism/creation/projects/${project.id}/sessions`, {
    token,
  });
  assert(sessions.length === 1, 'should have one session after first creation');
  assert(sessions[0].name === '会话 A', 'first session should keep custom name');

  const graphAAfterConversation = await api(`/api/prism/creation/projects/${project.id}/conversation/messages`, {
    method: 'POST',
    token,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      flowProjectId: sessionA.project.id,
      content: '我想做一个蒸汽朋克悬疑短剧，第一条会话只讲钟楼和失踪案。',
    }),
  });
  assert(
    graphAAfterConversation.project.id === sessionA.project.id,
    'conversation should stay on session A when flowProjectId is provided',
  );
  assert(
    graphAAfterConversation.project.meta.conversationState.messages.length >= 2,
    'session A should receive conversation messages',
  );

  const sessionB = await api(`/api/prism/creation/projects/${project.id}/sessions`, {
    method: 'POST',
    token,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: '会话 B' }),
  });
  assert(sessionB.project.id !== sessionA.project.id, 'session B should have different flow project id');

  sessions = await api(`/api/prism/creation/projects/${project.id}/sessions`, {
    token,
  });
  assert(sessions.length === 2, 'should have two sessions after second creation');

  const renamedSessionB = await api(`/api/prism/creation/projects/${sessionB.project.id}/session`, {
    method: 'PATCH',
    token,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: '会话 B - 重命名' }),
  });
  assert(renamedSessionB.project.name === '会话 B - 重命名', 'rename should update session name');

  const graphB = await api(`/api/prism/creation/projects/${project.id}/conversation/messages`, {
    method: 'POST',
    token,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      flowProjectId: sessionB.project.id,
      content: '第二条会话改成近未来机器人武打故事，不要继承第一条会话的人设。',
    }),
  });
  assert(graphB.project.id === sessionB.project.id, 'conversation should stay on session B');

  const loadedSessionA = await api(`/api/prism/creation/projects/${sessionA.project.id}/graph`, {
    token,
  });
  const loadedSessionB = await api(`/api/prism/creation/projects/${sessionB.project.id}/graph`, {
    token,
  });
  assert(
    loadedSessionA.project.meta.conversationState.messages.some((item) => item.content.includes('蒸汽朋克悬疑短剧')),
    'session A should preserve its own conversation',
  );
  assert(
    loadedSessionB.project.meta.conversationState.messages.some((item) => item.content.includes('机器人武打故事')),
    'session B should preserve its own conversation',
  );

  const deleteResult = await api(`/api/prism/creation/projects/${sessionA.project.id}/session`, {
    method: 'DELETE',
    token,
  });
  assert(deleteResult.deleted === true, 'delete should return deleted=true');
  assert(deleteResult.sessions.length === 1, 'one session should remain after deleting session A');
  assert(deleteResult.sessions[0].id === sessionB.project.id, 'remaining session should be session B');

  const result = {
    projectId: project.id,
    sessionAId: sessionA.project.id,
    sessionBId: sessionB.project.id,
    remainingSessions: deleteResult.sessions,
    sessionAMessages: loadedSessionA.project.meta.conversationState.messages.length,
    sessionBMessages: loadedSessionB.project.meta.conversationState.messages.length,
  };

  const outPath = path.resolve(repoRoot, '__creation_sessions_e2e_result.json');
  fs.writeFileSync(outPath, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
  log('result saved', outPath);
}

main().catch((error) => {
  console.error('[creation-sessions-e2e] failed', error);
  process.exit(1);
});
