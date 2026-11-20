const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

if (process.platform !== 'win32') {
  process.exit(0);
}

const root = path.resolve(__dirname, '..');
const interopDir = path.join(root, 'node_modules', 'react-native-css-interop');
const lightningcssPackageJson = path.join(
  interopDir,
  'node_modules',
  'lightningcss',
  'package.json',
);

if (!fs.existsSync(lightningcssPackageJson)) {
  process.exit(0);
}

const lightningcss = JSON.parse(fs.readFileSync(lightningcssPackageJson, 'utf8'));
const binaryPackage =
  process.arch === 'arm64'
    ? 'lightningcss-win32-arm64-msvc'
    : 'lightningcss-win32-x64-msvc';
const binaryFile =
  process.arch === 'arm64'
    ? 'lightningcss.win32-arm64-msvc.node'
    : 'lightningcss.win32-x64-msvc.node';
const requiredVersion = lightningcss.optionalDependencies?.[binaryPackage];

if (!requiredVersion) {
  process.exit(0);
}

const binaryPath = path.join(interopDir, 'node_modules', binaryPackage, binaryFile);
if (fs.existsSync(binaryPath)) {
  process.exit(0);
}

const args = [
  'install',
  '--no-save',
  '--package-lock=false',
  '--include=optional',
  '--prefix',
  interopDir,
  `${binaryPackage}@${requiredVersion}`,
];

const npmCli = process.env.npm_execpath;
const result =
  npmCli && /\.([cm]?js)$/.test(npmCli)
    ? spawnSync(process.execPath, [npmCli, ...args], {
        cwd: root,
        stdio: 'inherit',
      })
    : spawnSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', args, {
        cwd: root,
        stdio: 'inherit',
        shell: process.platform === 'win32',
      });

if (result.error) {
  console.error(`Could not install ${binaryPackage}: ${result.error.message}`);
  process.exit(1);
}

process.exit(result.status ?? 1);
