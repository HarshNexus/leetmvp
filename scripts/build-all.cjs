const { spawnSync } = require('node:child_process');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const node = process.execPath;
const tsc = path.join(root, 'node_modules', 'typescript', 'bin', 'tsc');
const vite = path.join(root, 'node_modules', 'vite', 'bin', 'vite.js');

function run(cwd, script, args) {
  const result = spawnSync(node, [script, ...args], { cwd, stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

run(path.join(root, 'backend'), tsc, ['-p', 'tsconfig.json']);
run(path.join(root, 'frontend'), tsc, ['-b']);
run(path.join(root, 'frontend'), vite, ['build']);
run(path.join(root, 'extension'), tsc, ['-p', 'tsconfig.json']);
run(path.join(root, 'extension'), path.join(root, 'extension', 'scripts', 'build-extension.cjs'), []);
run(path.join(root, 'extension'), path.join(root, 'extension', 'scripts', 'copy-assets.cjs'), []);
