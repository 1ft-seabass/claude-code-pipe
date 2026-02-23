const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('Running pre-commit checks...');

try {
  console.log('\n=== lint-staged (secretlint) ===');
  execSync('npx lint-staged', { stdio: 'inherit' });

  console.log('\n=== gitleaks ===');

  // Find gitleaks binary: ./bin/gitleaks → global gitleaks → skip
  const isWindows = process.platform === 'win32';
  const binaryName = isWindows ? 'gitleaks.exe' : 'gitleaks';
  const localBinary = path.join(process.cwd(), 'bin', binaryName);

  let gitleaksCommand = null;

  if (fs.existsSync(localBinary)) {
    gitleaksCommand = `"${localBinary}" protect --staged --config gitleaks.toml`;
  } else {
    // Check if global gitleaks is available
    try {
      execSync('gitleaks version', { stdio: 'pipe' });
      gitleaksCommand = 'gitleaks protect --staged --config gitleaks.toml';
    } catch (e) {
      // gitleaks not found
    }
  }

  if (gitleaksCommand) {
    execSync(gitleaksCommand, { stdio: 'inherit' });
  } else {
    console.log('⚠️  gitleaks not found — secretlint のみでコミットを続行します');
    console.log('    gitleaks を導入するには: node scripts/install-gitleaks.js');
  }

  console.log('\n✅ All checks passed');
  process.exit(0);
} catch (e) {
  console.error('\n❌ Pre-commit checks failed');
  process.exit(1);
}
