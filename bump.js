const fs = require('fs');
const path = require('path');

const type = process.argv[2];
if (!['major', 'minor', 'patch'].includes(type)) {
  console.error('Usage: node bump.js <major|minor|patch>');
  process.exit(1);
}

const pkgPath = path.join(__dirname, 'projects', 'auth', 'package.json');
const rootPkgPath = path.join(__dirname, 'package.json');

const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
let [major, minor, patch] = pkg.version.split('.').map(Number);

if (type === 'major') { major++; minor = 0; patch = 0; }
if (type === 'minor') { minor++; patch = 0; }
if (type === 'patch') { patch++; }

pkg.version = `${major}.${minor}.${patch}`;
fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');

const rootPkg = JSON.parse(fs.readFileSync(rootPkgPath, 'utf8'));
rootPkg.version = pkg.version;
fs.writeFileSync(rootPkgPath, JSON.stringify(rootPkg, null, 2) + '\n');

console.log(`@identora/auth bumped to ${pkg.version}`);
