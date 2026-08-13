const https = require('https');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { BIN_DIR, GITLEAKS_BINARY_NAME } = require('./environment');

// gitleaks version to install
const GITLEAKS_VERSION = '8.30.0';

const platformMap = {
  linux: { x64: 'linux_x64', arm64: 'linux_arm64' },
  darwin: { x64: 'darwin_x64', arm64: 'darwin_arm64' },
  win32: { x64: 'windows_x64' }
};

function run() {
  const platform = process.platform;
  const arch = process.arch;

  console.log(`🔍 OS: ${platform}, Arch: ${arch}`);

  if (!platformMap[platform] || !platformMap[platform][arch]) {
    console.error(`❌ Unsupported platform: ${platform}/${arch}`);
    console.error('   手動でインストールしてください: https://github.com/gitleaks/gitleaks/releases');
    return 1;
  }

  const gitleaksPlatform = platformMap[platform][arch];
  const isWindows = platform === 'win32';
  const extension = isWindows ? 'zip' : 'tar.gz';
  const fileName = `gitleaks_${GITLEAKS_VERSION}_${gitleaksPlatform}.${extension}`;
  const downloadUrl = `https://github.com/gitleaks/gitleaks/releases/download/v${GITLEAKS_VERSION}/${fileName}`;

  const binaryPath = path.join(BIN_DIR, GITLEAKS_BINARY_NAME);

  if (fs.existsSync(binaryPath)) {
    try {
      const version = execSync(`"${binaryPath}" version`, { encoding: 'utf8' }).trim();
      console.log(`✅ gitleaks already installed: ${version}`);
      return 0;
    } catch (e) {
      console.log('⚠️  gitleaks binary exists but version check failed, reinstalling...');
    }
  }

  if (!fs.existsSync(BIN_DIR)) {
    fs.mkdirSync(BIN_DIR, { recursive: true });
  }

  const downloadPath = path.join(BIN_DIR, fileName);

  console.log(`📥 Downloading gitleaks v${GITLEAKS_VERSION} for ${gitleaksPlatform}...`);
  console.log(`   ${downloadUrl}`);

  return new Promise((resolve) => {
    function finalize() {
      if (fs.existsSync(downloadPath)) {
        fs.unlinkSync(downloadPath);
      }
      if (!isWindows) {
        fs.chmodSync(binaryPath, 0o755);
      }
      try {
        const version = execSync(`"${binaryPath}" version`, { encoding: 'utf8' }).trim();
        console.log(`✅ gitleaks installed: ${version}`);
        resolve(0);
      } catch (e) {
        console.error(`❌ Installation verification failed: ${e.message}`);
        resolve(1);
      }
    }

    function extractAndCleanup() {
      console.log(`📦 Extracting to ${binaryPath}...`);
      try {
        if (isWindows) {
          const psCommand = `Expand-Archive -Path "${downloadPath}" -DestinationPath "${BIN_DIR}" -Force`;
          execSync(`powershell -Command "${psCommand}"`, { stdio: 'inherit' });
          finalize();
        } else {
          const tar = require('child_process').spawn('tar', ['-xzf', downloadPath, '-C', BIN_DIR]);
          tar.on('close', (code) => {
            if (code !== 0) {
              console.error(`❌ Extraction failed: tar exited with code ${code}`);
              resolve(1);
              return;
            }
            finalize();
          });
        }
      } catch (err) {
        console.error(`❌ Extraction failed: ${err.message}`);
        resolve(1);
      }
    }

    const file = fs.createWriteStream(downloadPath);
    https.get(downloadUrl, (response) => {
      if (response.statusCode === 302 || response.statusCode === 301) {
        https.get(response.headers.location, (redirectResponse) => {
          redirectResponse.pipe(file);
          file.on('finish', () => { file.close(() => extractAndCleanup()); });
        });
      } else {
        response.pipe(file);
        file.on('finish', () => { file.close(() => extractAndCleanup()); });
      }
    }).on('error', (err) => {
      fs.unlinkSync(downloadPath);
      console.error(`❌ Download failed: ${err.message}`);
      resolve(1);
    });
  });
}

module.exports = { run };
