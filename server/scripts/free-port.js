/* eslint-disable no-console */
const { execSync } = require('node:child_process');

function safeExec(command) {
  try {
    return execSync(command, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
  } catch {
    return '';
  }
}

function toUniqueNumberList(values) {
  return [...new Set(values.map((v) => Number(v)).filter((v) => Number.isFinite(v) && v > 0))];
}

function getWindowsListeningPids(port) {
  const output = safeExec(`netstat -ano | findstr :${port}`);
  if (!output) return [];

  const pids = output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && line.includes('LISTENING'))
    .map((line) => line.split(/\s+/).pop());

  return toUniqueNumberList(pids);
}

function getUnixListeningPids(port) {
  const output = safeExec(`lsof -nP -iTCP:${port} -sTCP:LISTEN -t`);
  if (!output) return [];
  return toUniqueNumberList(output.split(/\r?\n/));
}

function getWindowsProcessName(pid) {
  const out = safeExec(`tasklist /FI "PID eq ${pid}" /FO CSV /NH`).trim();
  if (!out || out.startsWith('INFO:')) return '';
  const first = out.split(',')[0] || '';
  return first.replace(/^"|"$/g, '').trim();
}

function getUnixProcessName(pid) {
  return safeExec(`ps -p ${pid} -o comm=`).trim();
}

function killWindowsPid(pid) {
  execSync(`taskkill /PID ${pid} /T /F`, { stdio: ['pipe', 'pipe', 'pipe'] });
}

function killUnixPid(pid) {
  execSync(`kill -9 ${pid}`, { stdio: ['pipe', 'pipe', 'pipe'] });
}

function freePort(port) {
  const isWindows = process.platform === 'win32';
  const pids = isWindows ? getWindowsListeningPids(port) : getUnixListeningPids(port);

  if (pids.length === 0) {
    console.log(`[free-port] Port ${port} is free.`);
    return;
  }

  let hasBlockedProcess = false;

  for (const pid of pids) {
    if (pid === process.pid) continue;

    const processName = isWindows ? getWindowsProcessName(pid) : getUnixProcessName(pid);
    const lowerName = processName.toLowerCase();

    if (!lowerName.includes('node')) {
      hasBlockedProcess = true;
      console.error(
        `[free-port] Port ${port} is occupied by non-node process PID=${pid} (${processName || 'unknown'}).`,
      );
      continue;
    }

    try {
      if (isWindows) {
        killWindowsPid(pid);
      } else {
        killUnixPid(pid);
      }
      console.log(`[free-port] Killed ${processName || 'node'} PID=${pid} on port ${port}.`);
    } catch (error) {
      hasBlockedProcess = true;
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[free-port] Failed to kill PID=${pid}: ${message}`);
    }
  }

  if (hasBlockedProcess) {
    process.exit(1);
  }
}

const port = Number(process.argv[2] || process.env.PORT || 3001);
if (!Number.isFinite(port) || port <= 0) {
  console.error(`[free-port] Invalid port: ${process.argv[2] || process.env.PORT}`);
  process.exit(1);
}

freePort(port);
