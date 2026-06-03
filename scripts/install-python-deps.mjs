import { spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import {
  ensureVenv,
  getProjectRoot,
  getVenvPython,
  isVenvReady,
} from './venv-python.mjs';

const projectRoot = getProjectRoot();
const markerFile = path.join(projectRoot, 'venv', '.requirements-installed');

console.log('[install-python] cwd:', projectRoot);
console.log('[install-python] platform:', process.platform);

ensureVenv();
const python = getVenvPython();
console.log('[install-python] python:', python);

if (!isVenvReady()) {
  console.error('[install-python] venv is not ready after ensureVenv');
  process.exit(1);
}

const canSkip =
  fs.existsSync(markerFile) &&
  spawnSync(python, ['-m', 'uvicorn', '--version'], {
    cwd: projectRoot,
    stdio: 'ignore',
  }).status === 0;

if (canSkip) {
  console.log('[install-python] skip (venv has uvicorn)');
  process.exit(0);
}

if (fs.existsSync(markerFile)) {
  console.log('[install-python] marker present but uvicorn missing — reinstalling');
  fs.unlinkSync(markerFile);
}

console.log('[install-python] pip install -r requirements.txt');
const result = spawnSync(
  python,
  ['-m', 'pip', 'install', '-r', 'requirements.txt'],
  { cwd: projectRoot, stdio: 'inherit' },
);

if (result.status === 0) {
  fs.mkdirSync(path.dirname(markerFile), { recursive: true });
  fs.writeFileSync(markerFile, new Date().toISOString());
}

process.exit(result.status ?? 1);
