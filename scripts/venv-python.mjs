import { spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export function getProjectRoot() {
  return projectRoot;
}

export function getVenvPythonPath() {
  const isWindows = process.platform === 'win32';
  return isWindows
    ? path.join(projectRoot, 'venv', 'Scripts', 'python.exe')
    : path.join(projectRoot, 'venv', 'bin', 'python');
}

export function isVenvReady() {
  return fs.existsSync(getVenvPythonPath());
}

export function getVenvPython() {
  if (isVenvReady()) {
    return getVenvPythonPath();
  }
  return process.platform === 'win32' ? 'python' : 'python3';
}

function removeBrokenVenv() {
  const venvDir = path.join(projectRoot, 'venv');
  if (!fs.existsSync(venvDir)) {
    return;
  }
  if (isVenvReady()) {
    return;
  }
  console.warn('[venv] removing invalid venv (wrong OS layout or incomplete)');
  fs.rmSync(venvDir, { recursive: true, force: true });
}

export function ensureVenv() {
  removeBrokenVenv();

  const venvDir = path.join(projectRoot, 'venv');
  if (isVenvReady()) {
    return getVenvPython();
  }

  const bootstrap = process.platform === 'win32' ? 'python' : 'python3';
  console.log('[venv] creating with', bootstrap);
  const created = spawnSync(bootstrap, ['-m', 'venv', 'venv'], {
    cwd: projectRoot,
    stdio: 'inherit',
  });

  if (created.status !== 0) {
    process.exit(created.status ?? 1);
  }

  if (!isVenvReady()) {
    console.error('[venv] failed to create a usable venv');
    process.exit(1);
  }

  return getVenvPython();
}
