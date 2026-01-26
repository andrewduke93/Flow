const { execSync } = require('child_process');

try {
  // search repository for common merge-conflict markers (exclude node_modules and dist)
  const out = execSync("git grep -n -e '\\\\<\\\\<\\\\<\\\\<\\\\<' -e '\\\\>\\\\>\\\\>\\\\>' -e '=======\' -- ':!node_modules' ':!Flow-main/dist' || true", { encoding: 'utf8' });
  if (out && out.trim()) {
    console.error('\n🚨 Merge-conflict markers found in repository:\n');
    console.error(out);
    process.exit(1);
  }
  console.log('No merge-conflict markers found.');
  process.exit(0);
} catch (err) {
  console.error('Conflict-check failed:', err.message || err);
  process.exit(2);
}
