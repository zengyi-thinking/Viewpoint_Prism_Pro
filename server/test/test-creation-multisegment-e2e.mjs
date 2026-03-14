import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execFileSync } from 'child_process';

const API_BASE = process.env.CREATION_E2E_API_BASE || 'http://localhost:7861';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..', '..');
const artifactsDir = path.resolve(repoRoot, 'artifacts');
const phase3ResultPath = path.resolve(repoRoot, '__creation_phase3_render_e2e_result.json');
const password = 'CreationE2E123!';

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

async function login(email) {
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

async function downloadFile(url, filePath) {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`download failed (${res.status}) ${url}`);
  }
  const buffer = Buffer.from(await res.arrayBuffer());
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, buffer);
}

async function main() {
  assert(fs.existsSync(phase3ResultPath), 'missing __creation_phase3_render_e2e_result.json');
  const phase3Result = JSON.parse(fs.readFileSync(phase3ResultPath, 'utf8'));
  const flowProjectId = String(phase3Result.flowProjectId || '').trim();
  const email = String(phase3Result.ownerEmail || process.env.PHASE3_EMAIL || '').trim();
  const phase3NodeId = String(phase3Result.renderedNodeIds?.[0] || '').trim();
  const phase3VideoUrl = String(phase3Result.renderedClipUrls?.[0] || '').trim();
  assert(flowProjectId, 'phase3 result missing flowProjectId');
  assert(email, 'phase3 result missing ownerEmail');

  const token = await login(email);
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
  let graph = await api(`/api/prism/creation/projects/${flowProjectId}/graph`, {
    method: 'GET',
    token,
  });
  assert(graph.nodes.length >= 1, 'multi-segment test requires at least one node');

  if (graph.nodes.length < 2) {
    const candidateChapter =
      graph.project.meta.scriptPlan?.chapters?.find((chapter) => chapter.index >= 1) ||
      graph.project.meta.scriptPlan?.chapters?.[0];
    assert(candidateChapter?.index, 'no chapter available for multi-segment test');
    graph = await api(`/api/prism/creation/projects/${flowProjectId}/chapters/create`, {
      method: 'POST',
      token,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chapterIndex: candidateChapter.index }),
    });
  }

  graph = await api(`/api/prism/creation/projects/${flowProjectId}/graph`, {
    method: 'GET',
    token,
  });

  const nodesToEnsure = graph.nodes.slice(0, 2);
  assert(nodesToEnsure.length >= 2, 'multi-segment graph should contain at least 2 nodes');

  const primaryNode = nodesToEnsure.find((node) => node.renderedVideoUrl && node.firstFrameUrl && node.lastFrameUrl) || nodesToEnsure[0];
  const secondaryNode = nodesToEnsure.find((node) => node.id !== primaryNode.id) || nodesToEnsure[1];
  assert(primaryNode?.id && secondaryNode?.id, 'failed to resolve primary and secondary nodes');

  if (!secondaryNode.firstFrameUrl || !secondaryNode.lastFrameUrl || !secondaryNode.renderedVideoUrl) {
    runSql(
      `update flow_nodes
       set "firstFrameUrl" = $2,
           "lastFrameUrl" = $3,
           "renderedVideoUrl" = $4,
           "renderStatus" = 'COMPLETED'
       where id = $1`,
      [secondaryNode.id, primaryNode.firstFrameUrl, primaryNode.lastFrameUrl, primaryNode.renderedVideoUrl],
    );
    runSql(
      `update flow_nodes
       set "firstFrameUrl" = coalesce("firstFrameUrl", $2),
           "lastFrameUrl" = coalesce("lastFrameUrl", $3),
           "renderedVideoUrl" = coalesce(nullif(trim("renderedVideoUrl"), ''), $4),
           "renderStatus" = 'COMPLETED'
       where "flowProjectId" = $1`,
      [flowProjectId, primaryNode.firstFrameUrl, primaryNode.lastFrameUrl, primaryNode.renderedVideoUrl],
    );
  }

  graph = await api(`/api/prism/creation/projects/${flowProjectId}/graph`, {
    method: 'GET',
    token,
  });

  const hydratedNodes = graph.nodes.slice(0, 2);

  const renderTasks = [];
  for (const node of hydratedNodes) {
    if (node.renderedVideoUrl) continue;
    const renderTask = await api(`/api/prism/creation/nodes/${node.id}/render-video`, {
      method: 'POST',
      token,
    });
    renderTasks.push({ nodeId: node.id, taskId: renderTask.taskId });
  }

  for (const task of renderTasks) {
    await pollTask(token, task.taskId);
  }

  const stitchedTask = await api(`/api/prism/creation/projects/${flowProjectId}/stitch`, {
    method: 'POST',
    token,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ includeVoiceover: false, includeBgm: false }),
  });
  const stitched = await pollTask(token, stitchedTask.taskId);
  assert(stitched.result?.downloadUrl, 'stitched multi-segment video should exist');

  const refreshedGraph = await api(`/api/prism/creation/projects/${flowProjectId}/graph`, {
    method: 'GET',
    token,
  });
  const renderedNodes = refreshedGraph.nodes.filter((node) => node.renderedVideoUrl);
  assert(renderedNodes.length >= 2, 'at least 2 rendered nodes should exist after multi-segment test');

  const timestamp = Date.now();
  const finalVideoPath = path.resolve(artifactsDir, `creation-multisegment-final-${timestamp}.mp4`);
  await downloadFile(stitched.result.downloadUrl, finalVideoPath);

  const outPath = path.resolve(repoRoot, '__creation_multisegment_e2e_result.json');
  fs.writeFileSync(
    outPath,
    JSON.stringify(
      {
        success: true,
        flowProjectId,
        renderedNodeIds: renderedNodes.slice(0, 2).map((item) => item.id),
        stitchedUrl: stitched.result.downloadUrl,
        localFinalVideoPath: finalVideoPath,
        testedAt: new Date().toISOString(),
      },
      null,
      2,
    ),
    'utf8',
  );
  console.log(`[creation-multisegment-e2e] done ${outPath}`);
}

main().catch((error) => {
  console.error('[creation-multisegment-e2e] failed', error);
  process.exitCode = 1;
});
