import { spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { ensureVenv, getProjectRoot, getVenvPython } from './venv-python.mjs';

const projectRoot = getProjectRoot();
const markerFile = path.join(projectRoot, 'venv', '.requirements-installed');

console.log('[install-python] cwd:', projectRoot);
ensureVenv();
const python = getVenvPython();
console.log('[install-python] python:', python);

if (fs.existsSync(markerFile)) {
  console.log('[install-python] skip (already installed)');
  process.exit(0);
}

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
