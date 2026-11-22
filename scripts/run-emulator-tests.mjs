import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tsxCli = require.resolve('tsx/cli');

const testFiles = [
  'backend/tests/emulator.test.ts',
  'backend/tests/phase05A.emulator.test.ts',
  'backend/tests/phase05B.emulator.test.ts',
  'backend/tests/phase06A.emulator.test.ts',
  'backend/tests/phase06B.emulator.test.ts',
  'backend/tests/phase07A.emulator.test.ts',
  'backend/tests/phase08.emulator.test.ts',
  'backend/tests/phase09A.emulator.test.ts',
  'backend/tests/phase09B.emulator.test.ts',
  'backend/tests/phase10A.emulator.test.ts',
  'backend/tests/phase10B.emulator.test.ts',
  'backend/tests/phase10G.emulator.test.ts',
  'backend/tests/phase11-reputation.emulator.test.ts',
];

for (const testFile of testFiles) {
  console.log(`\n[emulator-tests] Running ${testFile}`);
  const result = spawnSync(process.execPath, [tsxCli, path.join(projectRoot, testFile)], {
    cwd: projectRoot,
    stdio: 'inherit',
  });

  if (result.error) {
    throw result.error;
  }

  if (result.signal) {
    console.error(`[emulator-tests] ${testFile} exited with signal ${result.signal}`);
    process.exit(1);
  }

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

console.log('\n[emulator-tests] All emulator test suites passed');
