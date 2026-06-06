import { spawnSync } from 'child_process';
import { ensureVenv, getProjectRoot, getVenvPython } from './venv-python.mjs';

const projectRoot = getProjectRoot();
ensureVenv();

const result = spawnSync(getVenvPython(), ['scripts/build-docs-index.py'], {
  cwd: projectRoot,
  stdio: 'inherit',
});

process.exit(result.status ?? 1);
