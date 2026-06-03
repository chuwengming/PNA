/**
 * Railway 正式環境：同時啟動 FastAPI + Next（不使用 concurrently，避免 production 缺 devDependencies）。
 * 須先執行 npm run install-python（建立目前作業系統適用的 venv）。
 */
import { spawn, spawnSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import { getVenvPython, isVenvReady } from './venv-python.mjs';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const port = process.env.PORT || '3000';

function assertLinuxVenvWithUvicorn() {
  if (!isVenvReady()) {
    console.error(
      '[railway] FATAL: venv/bin/python 不存在。請確認 railway-start 含 npm run install-python，且未部署 Windows venv。',
    );
    process.exit(1);
  }
  const python = getVenvPython();
  const check = spawnSync(python, ['-m', 'uvicorn', '--version'], {
    cwd: projectRoot,
    encoding: 'utf8',
  });
  if (check.status !== 0) {
    console.error('[railway] FATAL: venv 內沒有 uvicorn，請重新執行 npm run install-python');
    process.exit(1);
  }
  console.log('[railway] venv ok:', python, check.stdout?.trim() || '');
}

assertLinuxVenvWithUvicorn();

function runNodeScript(scriptArgs, label) {
  const child = spawn('node', scriptArgs, {
    cwd: projectRoot,
    stdio: 'inherit',
    env: process.env,
  });
  if (label === 'fastapi') {
    child.on('exit', (code) => {
      if (code !== 0 && code !== null) {
        console.error(`[${label}] exited with code ${code}`);
        process.exit(code);
      }
    });
  }
  return child;
}

console.log('[railway] starting FastAPI on 127.0.0.1:8000');
const fastapi = runNodeScript(
  ['scripts/run-uvicorn.mjs', 'api.index:app', '--host', '127.0.0.1', '--port', '8000'],
  'fastapi',
);

async function waitForFastApi() {
  const healthUrl = 'http://127.0.0.1:8000/api/python/health/db';
  const maxAttempts = Number(process.env.FASTAPI_WAIT_ATTEMPTS || 45);

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const response = await fetch(healthUrl, { signal: AbortSignal.timeout(5000) });
      const payload = await response.json().catch(() => ({}));
      if (response.ok && payload.ok) {
        console.log(`[railway] FastAPI + MySQL ready (${attempt}s)`);
        return;
      }
      console.warn(`[railway] waiting ${attempt}/${maxAttempts}:`, payload.message || response.status);
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      console.warn(`[railway] waiting ${attempt}/${maxAttempts}: ${detail}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  console.warn('[railway] FastAPI health timeout — starting Next.js anyway');
}

await waitForFastApi();

console.log(`[railway] starting Next.js on 0.0.0.0:${port}`);
const nextBin = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const next = spawn(nextBin, ['next', 'start', '-H', '0.0.0.0', '-p', String(port)], {
  cwd: projectRoot,
  stdio: 'inherit',
  env: process.env,
});

next.on('exit', (code) => process.exit(code ?? 1));

for (const signal of ['SIGTERM', 'SIGINT']) {
  process.on(signal, () => {
    fastapi.kill(signal);
    next.kill(signal);
  });
}
