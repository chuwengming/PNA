import { spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export function getProjectRoot() {
  return projectRoot;
}

export function getVenvPython() {
  const isWindows = process.platform === 'win32';
  const pythonPath = isWindows
    ? path.join(projectRoot, 'venv', 'Scripts', 'python.exe')
    : path.join(projectRoot, 'venv', 'bin', 'python');

  if (fs.existsSync(pythonPath)) {
    return pythonPath;
  }

  return isWindows ? 'python' : 'python3';
}

export function ensureVenv() {
  const python = getVenvPython();
  const venvDir = path.join(projectRoot, 'venv');

  if (fs.existsSync(venvDir)) {
    return python;
  }

  const bootstrap = process.platform === 'win32' ? 'python' : 'python3';
  const created = spawnSync(bootstrap, ['-m', 'venv', 'venv'], {
    cwd: projectRoot,
    stdio: 'inherit',
  });

  if (created.status !== 0) {
    process.exit(created.status ?? 1);
  }

  return getVenvPython();
}
