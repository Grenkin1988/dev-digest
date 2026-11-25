/* Builds docs/skills/flaky-test-detector.zip from the sample folder.
   Run from the repo root: node docs/skills/build-sample-zip.cjs
   Needs `pnpm install` in server/ (uses its fflate). */
const fs = require('fs');
const path = require('path');
const { zipSync, strToU8 } = require(path.join(__dirname, '../../server/node_modules/fflate'));

const dir = path.join(__dirname, 'flaky-test-detector');
const entries = {};
function walk(rel) {
  for (const name of fs.readdirSync(path.join(dir, rel))) {
    const relPath = rel ? `${rel}/${name}` : name;
    const abs = path.join(dir, relPath);
    if (fs.statSync(abs).isDirectory()) walk(relPath);
    else entries[`flaky-test-detector/${relPath}`] = strToU8(fs.readFileSync(abs, 'utf8').replace(/\r\n/g, '\n'));
  }
}
walk('');
fs.writeFileSync(path.join(__dirname, 'flaky-test-detector.zip'), zipSync(entries));
console.log('wrote flaky-test-detector.zip with', Object.keys(entries));
