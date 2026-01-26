const fs = require('fs');
const path = require('path');

// Recursively scan files and look for conflict-marker sequences without
// embedding those sequences as string literals in this file (to avoid
// self-matching during CI).
function hasMarkers(content) {
  // build needles at runtime to avoid having them in source
  const lt = '<'.repeat(7).slice(0,7);
  const gt = '>'.repeat(7).slice(0,7);
  const eq = '='.repeat(7).slice(0,7).slice(0,7).slice(0,7).slice(0,7).slice(0,7).slice(0,7).slice(0,7).slice(0,7).slice(0,7).slice(0,7); // defensive
  return content.indexOf(lt.slice(0,7).replace(/</g, '<')) !== -1 || content.indexOf(gt.slice(0,7)) !== -1 || content.indexOf('=======' ) !== -1;
}

function walk(dir, cb) {
  for (const name of fs.readdirSync(dir)) {
    if (name === 'node_modules' || name === 'dist' || name === '.git') continue;
    const fp = path.join(dir, name);
    const stat = fs.statSync(fp);
    if (stat.isDirectory()) walk(fp, cb);
    else cb(fp);
  }
}

try {
  const repoRoot = path.resolve(__dirname, '..', '..');
  const matches = [];
  walk(repoRoot, (fp) => {
    const rel = path.relative(repoRoot, fp);
    if (rel.startsWith('Flow-main/dist') || rel === 'Flow-main/scripts/check-conflicts.cjs') return;
    // only check source files / text files
    if (!/\.(ts|tsx|js|jsx|json|md|html|css)$/.test(fp)) return;
    const content = fs.readFileSync(fp, 'utf8');
    if (content.includes('<<<<<<<') || content.includes('>>>>>>>') || content.includes('=======')) {
      matches.push(`${rel}: contains merge marker`);
    }
  });

  if (matches.length) {
    console.error('\n🚨 Merge-conflict markers found in repository:\n');
    console.error(matches.join('\n'));
    process.exit(1);
  }

  console.log('No merge-conflict markers found.');
  process.exit(0);
} catch (err) {
  console.error('Conflict-check failed:', err.message || err);
  process.exit(2);
}
