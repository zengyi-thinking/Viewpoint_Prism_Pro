import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const API_BASE = process.env.CREATION_E2E_API_BASE || 'http://localhost:7861';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..', '..');

const email = `creation-phase2-${Date.now()}@example.com`;
const password = 'CreationE2E123!';
const name = 'Creation Phase2 E2E';

function log(step, payload) {
  const prefix = `[creation-production-e2e] ${step}`;
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
  if (!condition) {
    throw new Error(message);
  }
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
      name: `Creation Phase2 ${Date.now()}`,
      description: 'Creation Prism Phase2 production package e2e',
    }),
  });
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
    '我要做一个近未来海上能源站悬疑短片，女工程师发现系统开始伪造值班记录并掩盖事故。',
    '风格要冷色、潮湿、金属质感强，写实电影感，不要二次元，尽量像剧集级悬疑片。',
    '结构分四章，前两章主要是调查和压抑文戏，后两章冲突升级，有机械失控和空间封锁。',
    '主角沈岚短发、深蓝防水工装，配角是站长周屿和系统播报声，角色外观要固定连续。',
    '拆分时每章 3 到 4 个片段，文戏不要写死动作，动作段要留出模型自由发挥空间。',
  ];

  for (const content of rounds) {
    graph = await api(`/api/prism/creation/projects/${project.id}/conversation/messages`, {
      method: 'POST',
      token,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content }),
    });
  }

  const state = graph.project.meta.conversationState;
  assert(state.scriptDraft, 'conversation should produce scriptDraft');

  const plan = await api(`/api/prism/creation/projects/${project.id}/script-plan`, {
    method: 'POST',
    token,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      scriptText: state.scriptDraft,
      chaptersHint: state.chaptersHint,
    }),
  });
  assert(plan.scriptPlan.chapters.length >= 3, 'script plan should contain at least 3 chapters');

  const packaged = await api(`/api/prism/creation/projects/${plan.flowProjectId}/production-package`, {
    method: 'POST',
    token,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ artStyle: state.summary.visualStyle }),
  });

  const meta = packaged.project.meta;
  assert(meta.scriptPackage?.overallSummary, 'scriptPackage overall summary should exist');
  assert(meta.scenePlan?.scenes?.length >= plan.scriptPlan.chapters.length, 'scene count should cover chapters');
  assert(meta.characterAssets.length >= 1, 'character assets should exist');
  assert(meta.sceneAssets.length >= 1, 'scene assets should exist');
  assert(meta.storyboardSegments.length >= meta.scenePlan.scenes.length, 'storyboard segments should exist');
  assert(meta.voiceCasting.length >= 1, 'voice casting should exist');

  const sceneIds = new Set(meta.scenePlan.scenes.map((item) => item.id));
  const chapterIndexes = new Set(plan.scriptPlan.chapters.map((item) => item.index));
  const characterNames = new Set(meta.characterAssets.map((item) => item.name));
  const sceneAssetMap = new Set(meta.sceneAssets.map((item) => item.sceneId));
  let hasActionOrMixed = false;
  let hasDialogueRefs = false;

  for (const segment of meta.storyboardSegments) {
    assert(sceneIds.has(segment.sceneId), `segment sceneId missing: ${segment.sceneId}`);
    assert(chapterIndexes.has(segment.chapterIndex), `segment chapterIndex invalid: ${segment.chapterIndex}`);
    assert((segment.compressedVideoPrompt || '').length <= 1800, 'compressedVideoPrompt should be within limit');
    assert(sceneAssetMap.has(segment.sceneId), `scene asset missing for ${segment.sceneId}`);
    segment.characterRefs.forEach((name) => {
      assert(characterNames.has(name), `character asset missing for ${name}`);
    });
    if (segment.contentType === 'action' || segment.contentType === 'mixed') {
      hasActionOrMixed = true;
    }
    if (segment.dialogueLines?.length) {
      hasDialogueRefs = true;
    }
  }

  assert(hasActionOrMixed, 'at least one action or mixed segment should exist');
  assert(hasDialogueRefs, 'at least one segment should preserve dialogue lines');

  const firstChapter = plan.scriptPlan.chapters[0];
  const chapterGraph = await api(`/api/prism/creation/projects/${plan.flowProjectId}/chapters/create`, {
    method: 'POST',
    token,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chapterIndex: firstChapter.index }),
  });
  assert(chapterGraph.nodes.length >= 1, 'chapter nodes should be created from production package');

  const characterImageGraph = await api(
    `/api/prism/creation/projects/${plan.flowProjectId}/production-assets/character/${meta.characterAssets[0].id}/generate-image`,
    {
      method: 'POST',
      token,
    },
  );
  const sceneImageGraph = await api(
    `/api/prism/creation/projects/${plan.flowProjectId}/production-assets/scene/${meta.sceneAssets[0].id}/generate-image`,
    {
      method: 'POST',
      token,
    },
  );
  const segmentImageGraph = await api(
    `/api/prism/creation/projects/${plan.flowProjectId}/production-assets/segment/${meta.storyboardSegments[0].id}/generate-image`,
    {
      method: 'POST',
      token,
    },
  );

  assert(
    characterImageGraph.project.meta.characterAssets.some((item) => item.id === meta.characterAssets[0].id && item.imageUrl),
    'character image should be generated',
  );
  assert(
    sceneImageGraph.project.meta.sceneAssets.some((item) => item.id === meta.sceneAssets[0].id && item.imageUrl),
    'scene image should be generated',
  );
  assert(
    segmentImageGraph.project.meta.storyboardSegments.some(
      (item) => item.id === meta.storyboardSegments[0].id && item.storyboardImageUrl,
    ),
    'storyboard image should be generated',
  );

  const result = {
    success: true,
    apiBase: API_BASE,
    projectId: project.id,
    flowProjectId: plan.flowProjectId,
    chapterCount: plan.scriptPlan.chapters.length,
    sceneCount: meta.scenePlan.scenes.length,
    characterAssetCount: meta.characterAssets.length,
    sceneAssetCount: meta.sceneAssets.length,
    storyboardSegmentCount: meta.storyboardSegments.length,
    voiceCastingCount: meta.voiceCasting.length,
    characterImageGenerated: true,
    sceneImageGenerated: true,
    storyboardImageGenerated: true,
    createdNodes: chapterGraph.nodes.length,
    testedAt: new Date().toISOString(),
  };

  const outPath = path.resolve(repoRoot, '__creation_production_package_e2e_result.json');
  fs.writeFileSync(outPath, JSON.stringify(result, null, 2), 'utf8');
  log('done', outPath);
}

main().catch((error) => {
  console.error('[creation-production-e2e] failed', error);
  process.exitCode = 1;
});
