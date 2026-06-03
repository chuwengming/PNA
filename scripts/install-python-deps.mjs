import { spawnSync } from 'child_process';
import path from 'path';
import { ensureVenv, getProjectRoot, getVenvPython } from './venv-python.mjs';

const projectRoot = getProjectRoot();
ensureVenv();

const result = spawnSync(
  getVenvPython(),
  ['-m', 'pip', 'install', '-r', 'requirements.txt'],
  { cwd: projectRoot, stdio: 'inherit' },
);

process.exit(result.status ?? 1);
