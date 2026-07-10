#!/usr/bin/env node

const https = require('https');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// gitleaks version to install
const GITLEAKS_VERSION = '8.30.0';

// Detect OS and architecture
const platform = process.platform; // 'linux', 'darwin', 'win32', etc.
const arch = process.arch; // 'x64', 'arm64', etc.

console.log(`🔍 OS: ${platform}, Arch: ${arch}`);

// Map to gitleaks download file naming
const platformMap = {
  linux: { x64: 'linux_x64', arm64: 'linux_arm64' },
  darwin: { x64: 'darwin_x64', arm64: 'darwin_arm64' },
  win32: { x64: 'windows_x64' }
};

if (!platformMap[platform] || !platformMap[platform][arch]) {
  console.error(`❌ Unsupported platform: ${platform}/${arch}`);
  console.error('   手動でインストールしてください: https://github.com/gitleaks/gitleaks/releases');
  process.exit(1);
}

const gitleaksPlatform = platformMap[platform][arch];
const isWindows = platform === 'win32';
const extension = isWindows ? 'zip' : 'tar.gz';
const fileName = `gitleaks_${GITLEAKS_VERSION}_${gitleaksPlatform}.${extension}`;
const downloadUrl = `https://github.com/gitleaks/gitleaks/releases/download/v${GITLEAKS_VERSION}/${fileName}`;

const binDir = path.join(process.cwd(), 'bin');
const binaryName = isWindows ? 'gitleaks.exe' : 'gitleaks';
const binaryPath = path.join(binDir, binaryName);

// Check if already installed
if (fs.existsSync(binaryPath)) {
  try {
    const version = execSync(`"${binaryPath}" version`, { encoding: 'utf8' }).trim();
    console.log(`✅ gitleaks already installed: ${version}`);
    process.exit(0);
  } catch (e) {
    console.log('⚠️  gitleaks binary exists but version check failed, reinstalling...');
  }
}

// Create bin directory if not exists
if (!fs.existsSync(binDir)) {
  fs.mkdirSync(binDir, { recursive: true });
}

const downloadPath = path.join(binDir, fileName);

console.log(`📥 Downloading gitleaks v${GITLEAKS_VERSION} for ${gitleaksPlatform}...`);
console.log(`   ${downloadUrl}`);

// Download file
const file = fs.createWriteStream(downloadPath);
https.get(downloadUrl, (response) => {
  if (response.statusCode === 302 || response.statusCode === 301) {
    // Follow redirect
    https.get(response.headers.location, (redirectResponse) => {
      redirectResponse.pipe(file);
      file.on('finish', () => {
        file.close();
        extractAndCleanup();
      });
    });
  } else {
    response.pipe(file);
    file.on('finish', () => {
      file.close();
      extractAndCleanup();
    });
  }
}).on('error', (err) => {
  fs.unlinkSync(downloadPath);
  console.error(`❌ Download failed: ${err.message}`);
  process.exit(1);
});

function extractAndCleanup() {
  console.log(`📦 Extracting to ${binaryPath}...`);

  try {
    if (isWindows) {
      // Use adm-zip (pure JS) to avoid PowerShell dependency
      try {
        require.resolve('adm-zip');
      } catch (e) {
        console.log('   adm-zip をインストールしています...');
        execSync('npm install --no-save adm-zip', { stdio: 'inherit' });
      }
      const AdmZip = require('adm-zip');
      const zip = new AdmZip(downloadPath);
      zip.extractAllTo(binDir, true);
    } else {
      // Use system tar for Linux/macOS (universally available)
      const tar = require('child_process').spawn('tar', ['-xzf', downloadPath, '-C', binDir]);
      tar.on('close', (code) => {
        if (code !== 0) {
          throw new Error(`tar extraction failed with code ${code}`);
        }
        finalize();
      });
      return; // Don't call finalize() yet, tar.on('close') will do it
    }
    finalize();
  } catch (err) {
    console.error(`❌ Extraction failed: ${err.message}`);
    process.exit(1);
  }
}

function finalize() {
  // Cleanup downloaded archive
  if (fs.existsSync(downloadPath)) {
    fs.unlinkSync(downloadPath);
  }

  // Make binary executable on Unix-like systems
  if (!isWindows) {
    fs.chmodSync(binaryPath, 0o755);
  }

  // Verify installation
  try {
    const version = execSync(`"${binaryPath}" version`, { encoding: 'utf8' }).trim();
    console.log(`✅ gitleaks installed: ${version}`);
  } catch (e) {
    console.error(`❌ Installation verification failed: ${e.message}`);
    process.exit(1);
  }
}
