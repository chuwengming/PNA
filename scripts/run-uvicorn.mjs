import { spawnSync } from 'child_process';
import { ensureVenv, getProjectRoot, getVenvPython } from './venv-python.mjs';

const projectRoot = getProjectRoot();
ensureVenv();

const uvicornArgs = process.argv.slice(2);
if (uvicornArgs.length === 0) {
  console.error('Usage: node scripts/run-uvicorn.mjs api.index:app [uvicorn options...]');
  process.exit(1);
}

const result = spawnSync(getVenvPython(), ['-m', 'uvicorn', ...uvicornArgs], {
  cwd: projectRoot,
  stdio: 'inherit',
});

process.exit(result.status ?? 1);
