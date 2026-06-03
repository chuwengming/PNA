/**
 * Railway 正式環境：同時啟動 FastAPI + Next（不使用 concurrently，避免 production 缺 devDependencies）。
 */
import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const port = process.env.PORT || '3000';

function runNodeScript(scriptArgs, label) {
  const child = spawn('node', scriptArgs, {
    cwd: projectRoot,
    stdio: 'inherit',
    env: process.env,
  });
  child.on('exit', (code) => {
    if (code !== 0 && code !== null) {
      console.error(`[${label}] exited with code ${code}`);
      process.exit(code);
    }
  });
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
