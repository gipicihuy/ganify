#!/usr/bin/env node
// Bump Ganify version (MAJOR.MINOR.PATCH) + versionCode
// Usage: node scripts/bump-version.js --bump patch|minor|major
// Updates: VERSION, package.json, android/app/build.gradle.kts, README.md
// Outputs new version via GITHUB_OUTPUT if available

import fs from 'fs';
import path from 'path';

const args = process.argv.slice(2);
const bumpIdx = args.indexOf('--bump');
const bump = bumpIdx !== -1 ? args[bumpIdx + 1] : 'patch';
if (!['patch','minor','major'].includes(bump)) {
  console.error('bump must be patch|minor|major');
  process.exit(1);
}

function readVersion() {
  const v = fs.readFileSync('VERSION', 'utf8').trim();
  if (!/^\d+\.\d+\.\d+$/.test(v)) throw new Error(`Invalid VERSION: ${v}`);
  return v;
}
function bumpVersion(v, type) {
  let [a,b,c] = v.split('.').map(Number);
  if (type === 'major') return `${a+1}.0.0`;
  if (type === 'minor') return `${a}.${b+1}.0`;
  return `${a}.${b}.${c+1}`;
}

const oldVersion = readVersion();
const newVersion = bumpVersion(oldVersion, bump);
console.log(`Bump ${bump}: ${oldVersion} -> ${newVersion}`);

// 1. VERSION
fs.writeFileSync('VERSION', newVersion + '\n');

// 2. package.json
const pkgPath = 'package.json';
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
pkg.version = newVersion;
fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');

// 3. android versionName + versionCode
const gradlePath = 'android/app/build.gradle.kts';
let gradle = fs.readFileSync(gradlePath, 'utf8');
const vcMatch = gradle.match(/versionCode\s*=\s*(\d+)/);
const oldCode = vcMatch ? parseInt(vcMatch[1], 10) : 1;
const newCode = oldCode + 1;
gradle = gradle.replace(/versionName\s*=\s*"[^"]+"/, `versionName = "${newVersion}"`);
gradle = gradle.replace(/versionCode\s*=\s*\d+/, `versionCode = ${newCode}`);
fs.writeFileSync(gradlePath, gradle);
console.log(`versionCode: ${oldCode} -> ${newCode}`);

// 4. README.md title + badge (keep badge auto, just update title line)
const readmePath = 'README.md';
let readme = fs.readFileSync(readmePath, 'utf8');
// Update first heading "# Ganify x.y.z"
readme = readme.replace(/^# Ganify.*$/m, `# Ganify ${newVersion}`);
fs.writeFileSync(readmePath, readme);

// Output for GitHub Actions
if (process.env.GITHUB_OUTPUT) {
  fs.appendFileSync(process.env.GITHUB_OUTPUT, `version=${newVersion}\n`);
  fs.appendFileSync(process.env.GITHUB_OUTPUT, `versionCode=${newCode}\n`);
  fs.appendFileSync(process.env.GITHUB_OUTPUT, `oldVersion=${oldVersion}\n`);
}
