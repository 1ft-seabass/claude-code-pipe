const { execSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { LOG_DIR, LOG_FILE, findGitleaksBinary } = require('./environment');

const MAX_LOG_ENTRIES = 50;
// setup-securecheck.md ステップ3.6.5のネガティブテストが使うファイル名。
// これがステージされている＝人間が意図的にネガティブテストを実行中、という合図。
const CANARY_FILENAME = '.test-secret-canary';

// 毎コミット自動で検出器の生死を証明するためのカナリア（上記の手動 CANARY_FILENAME とは別物）。
// gitleaks は git index にのみ blob を注入し作業ツリーには一切書かない
// （git --staged は index の内容を見るため、これだけで検出対象に混ぜ込める）。
// secretlint はファイルパスしか受け取れずコンテンツを直接渡す手段が無いため、
// こちらだけ cwd 配下に一時ファイルを書いて直後に削除する。
const AUTO_CANARY_GITLEAKS_PATH = '.canary-probe';
const AUTO_CANARY_SECRETLINT_FILENAME = '.canary-probe-secretlint';
const AUTO_CANARY_SECRET = 'ghp_A1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6Q7r8'; // gitleaks:allow secretlint-disable-line
const AUTO_CANARY_CONTENT = `GITHUB_PAT=${AUTO_CANARY_SECRET}\n`;

function getBranch() {
  try {
    return execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf8' }).trim();
  } catch (e) {
    return 'unknown';
  }
}

function writeLog(result, isCanary, autoCanary) {
  const entry = JSON.stringify({
    timestamp: new Date().toISOString(),
    result,
    branch: getBranch(),
    ...(isCanary ? { type: 'canary' } : {}),
    ...(autoCanary ? { autoCanary } : {})
  });

  if (!fs.existsSync(LOG_DIR)) {
    fs.mkdirSync(LOG_DIR, { recursive: true });
  }

  let entries = [];
  if (fs.existsSync(LOG_FILE)) {
    entries = fs.readFileSync(LOG_FILE, 'utf8')
      .split('\n')
      .filter(line => line.trim());
  }

  entries.push(entry);
  if (entries.length > MAX_LOG_ENTRIES) {
    entries = entries.slice(entries.length - MAX_LOG_ENTRIES);
  }

  fs.writeFileSync(LOG_FILE, entries.join('\n') + '\n');
}

function chunk(arr, size) {
  const chunks = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}

// secretlint の JSON 出力（フォワードスラッシュ）と process.cwd() 由来のパス（Windowsではバックスラッシュ）
// を比較可能にするための正規化。大文字小文字の区別もWindowsのファイルシステムに合わせて無視する。
function normalizeForCompare(p) {
  const resolved = path.resolve(p).replace(/\\/g, '/');
  return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
}

function removeGitleaksCanaryFromIndex() {
  try {
    execSync(`git update-index --force-remove "${AUTO_CANARY_GITLEAKS_PATH}"`, { stdio: 'pipe' });
    return true;
  } catch (e) {
    return false;
  }
}

function run() {
  console.log('Running pre-commit checks...');

  let isCanaryTest = false;
  let secretlintOk = true;
  let gitleaksOk = true;
  let exitCode = 0;

  // 自動カナリア自己検証の結果（'ok' | 'failed' | 'cleanup-failed' | 'skipped'）。
  // verify.js check#14 がこの値をログの autoCanary フィールドとして参照する。
  let secretlintSelfCheck = 'skipped';
  let gitleaksSelfCheck = 'skipped';

  // 後片付けが本当に必要な状態かどうかを覚えておくフラグ。
  // 複数箇所で早期に失敗しうるため、process.exit() を直接呼ばず
  // 必ずこの下の try/finally を1回通してから最後にまとめて呼び出し元へ返す構造にしている。
  let gitleaksCanaryInjected = false;
  let secretlintCanaryPath = null;

  try {
    console.log('\n=== secretlint ===');

    // staged ファイルのみをスキャン（gitleaks --staged と対称）
    const staged = execSync('git diff --cached --name-only --diff-filter=ACM', { encoding: 'utf8' })
      .split('\n').map(s => s.trim()).filter(Boolean);

    isCanaryTest = staged.includes(CANARY_FILENAME);

    if (staged.length === 0) {
      console.log('ステージされたファイルがないため secretlint をスキップします');
    } else {
      let secretlintScanTargets = staged;

      if (staged.includes(AUTO_CANARY_SECRETLINT_FILENAME)) {
        console.log(`  ⏭️  secretlint 自動自己検証 — パス衝突のためスキップ（コミットはブロックしません）`);
      } else {
        const canaryAbsPath = path.join(process.cwd(), AUTO_CANARY_SECRETLINT_FILENAME);
        try {
          fs.writeFileSync(canaryAbsPath, AUTO_CANARY_CONTENT);
          secretlintCanaryPath = canaryAbsPath;
          secretlintScanTargets = staged.concat(AUTO_CANARY_SECRETLINT_FILENAME);
          secretlintSelfCheck = 'pending';
        } catch (e) {
          console.log(`  ⏭️  secretlint 自動自己検証 — カナリア作成に失敗したためスキップ: ${e.message || e}`);
        }
      }

      // secretlint が失敗しても gitleaks を実行できるよう、ここで結果を確定させる
      // （secretlint と gitleaks は独立した検出エンジンのため、片方の失敗で
      // もう片方の実行を止めてはいけない）
      let canaryDetected = false;
      const realFindings = [];
      let parseFailed = false;

      // --format json: カナリアと実ファイルの検出結果をファイル単位で区別するため
      // （stylish 出力のままだと「何かリークが見つかった」以上の判定ができない）
      //
      // --output でファイルへ書き出し、execSync の戻り値（パイプ経由）としては受け取らない。
      // vendorライブラリ一括コミット等でJSON出力が数百KB〜MB級になるケースで、
      // このNode.js環境ではパイプ経由の子プロセス出力captureが約210KB付近で
      // 打ち切られることが確認されており（原因未特定）、打ち切られた不完全な
      // JSON文字列のパースに失敗してコミットが誤ブロックされていた。
      const secretlintReportPath = path.join(os.tmpdir(), `pre-commit-secretlint-report-${process.pid}.json`);
      for (const files of chunk(secretlintScanTargets, 100)) {
        try {
          execSync(`npx secretlint --format json --output "${secretlintReportPath}" ${files.map(f => `"${f}"`).join(' ')}`, { stdio: 'pipe' });
        } catch (e) {
          // 検出ありの場合 exit code 1 で終了するが、--output 指定時はファイルには正常に書き出される
        }
        let output = '';
        try {
          output = fs.existsSync(secretlintReportPath) ? fs.readFileSync(secretlintReportPath, 'utf8') : '';
        } finally {
          try { fs.rmSync(secretlintReportPath, { force: true }); } catch (e) { /* ignore */ }
        }
        try {
          const results = JSON.parse(output || '[]');
          for (const r of results) {
            if (!r.messages || r.messages.length === 0) continue;
            if (secretlintCanaryPath && normalizeForCompare(r.filePath) === normalizeForCompare(secretlintCanaryPath)) {
              canaryDetected = true;
            } else {
              realFindings.push(r);
            }
          }
        } catch (e) {
          parseFailed = true;
        }
      }

      // 後片付け（secretlint は作業ツリーに実ファイルを書いているため、走査直後に確実に消す）
      if (secretlintCanaryPath) {
        try {
          fs.rmSync(secretlintCanaryPath, { force: true });
          secretlintCanaryPath = null;
          secretlintSelfCheck = canaryDetected ? 'ok' : 'failed';
        } catch (e) {
          secretlintSelfCheck = 'cleanup-failed';
        }
      }

      if (parseFailed) {
        secretlintOk = false;
        console.error('  ❌ secretlint の出力を解析できませんでした（想定外のエラー）');
      } else if (realFindings.length > 0) {
        secretlintOk = false;
        for (const r of realFindings) {
          console.error(`  ❌ ${path.relative(process.cwd(), r.filePath)}`);
          for (const m of r.messages) {
            console.error(`      ${m.message}`);
          }
        }
      } else {
        console.log('  ✅ 0 件検出');
      }

      if (secretlintSelfCheck === 'failed') {
        secretlintOk = false;
        console.error('  ❌ secretlint 自動自己検証 — カナリアが検出されませんでした（検出ルールが機能していない可能性）');
      } else if (secretlintSelfCheck === 'cleanup-failed') {
        secretlintOk = false;
        console.error(`  ❌ secretlint 自動自己検証 — カナリアファイルの削除に失敗しました。手動で確認してください: ${AUTO_CANARY_SECRETLINT_FILENAME}`);
      } else if (secretlintSelfCheck === 'ok') {
        console.log('  ✅ secretlint 自動自己検証 — カナリアを正しく検出');
      }
    }

    console.log('\n=== gitleaks ===');

    const gitleaks = findGitleaksBinary();

    if (gitleaks) {
      // --redact: 検出時にシークレット値をターミナルにそのまま出さないため
      const gitleaksCommand = `${gitleaks.command} git --staged --config gitleaks.toml --redact .`;

      if (staged.includes(AUTO_CANARY_GITLEAKS_PATH)) {
        console.log(`  ⏭️  gitleaks 自動自己検証 — パス衝突のためスキップ（コミットはブロックしません）`);
      } else {
        try {
          const blob = execSync('git hash-object -w --stdin', { input: AUTO_CANARY_CONTENT, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
          execSync(`git update-index --add --cacheinfo 100644,${blob},"${AUTO_CANARY_GITLEAKS_PATH}"`, { stdio: 'pipe' });
          gitleaksCanaryInjected = true;
          gitleaksSelfCheck = 'pending';
        } catch (e) {
          console.log(`  ⏭️  gitleaks 自動自己検証 — カナリア注入に失敗したためスキップ: ${e.message || e}`);
        }
      }

      // --report-format/--report-path: 既存の --staged 呼び出し1回のままカナリアと
      // 実ファイルの検出結果をファイル単位で区別するため（プロセスを追加起動しない）
      const reportPath = path.join(os.tmpdir(), `pre-commit-canary-report-${process.pid}.json`);
      const reportCommand = `${gitleaksCommand} --report-format json --report-path "${reportPath}"`;

      try {
        execSync(reportCommand, { stdio: 'inherit' });
      } catch (e) {
        // exit code は後段でレポート内容から再判定するのでここでは握りつぶす
      }

      let canaryDetected = false;
      let realLeakFound = false;
      try {
        if (fs.existsSync(reportPath)) {
          const findings = JSON.parse(fs.readFileSync(reportPath, 'utf8') || '[]');
          for (const f of findings) {
            if (f.File === AUTO_CANARY_GITLEAKS_PATH) {
              canaryDetected = true;
            } else {
              realLeakFound = true;
            }
          }
        } else {
          // レポートファイルが生成されない = 想定外の失敗。安全側に倒して失敗扱いにする
          realLeakFound = true;
        }
      } catch (e) {
        realLeakFound = true;
      } finally {
        try { fs.rmSync(reportPath, { force: true }); } catch (e) { /* ignore */ }
      }

      if (gitleaksCanaryInjected) {
        const removed = removeGitleaksCanaryFromIndex();
        if (removed) {
          gitleaksCanaryInjected = false;
          gitleaksSelfCheck = canaryDetected ? 'ok' : 'failed';
        } else {
          gitleaksSelfCheck = 'cleanup-failed';
        }
      }

      gitleaksOk = !realLeakFound;

      if (gitleaksSelfCheck === 'failed') {
        gitleaksOk = false;
        console.error('  ❌ gitleaks 自動自己検証 — カナリアが検出されませんでした（検出ルールが機能していない可能性）');
      } else if (gitleaksSelfCheck === 'cleanup-failed') {
        gitleaksOk = false;
        console.error(`  ❌ gitleaks 自動自己検証 — カナリアの index からの削除に失敗しました。手動で確認してください: git update-index --force-remove "${AUTO_CANARY_GITLEAKS_PATH}"`);
      } else if (gitleaksSelfCheck === 'ok') {
        console.log('  ✅ gitleaks 自動自己検証 — カナリアを正しく検出');
      }
    } else {
      // フェイルクローズ: gitleaksが無い状態は「secretlintのみで守られている」半端な状態であり、
      // 気づかれないまま運用が続くこと自体がリスクなので、警告に留めずコミットをブロックする。
      gitleaksOk = false;
      console.error('  ❌ gitleaks が見つかりません — フェイルクローズ方針によりコミットをブロックします');
      console.error('    導入するには: node .security-check/cli.js install-gitleaks');
    }

    exitCode = (secretlintOk && gitleaksOk) ? 0 : 1;
  } catch (e) {
    exitCode = 1;
    console.error('\n❌ Pre-commit checks failed (unexpected error)');
    console.error(e.message || e);
  } finally {
    // 途中で予期しない例外が飛んでも、index/作業ツリーに注入したカナリアが
    // 実コミットへ紛れ込まないよう最後に必ずここで後片付けを保証する。
    if (gitleaksCanaryInjected) {
      const removed = removeGitleaksCanaryFromIndex();
      if (!removed) {
        console.error(`⚠️  カナリア(gitleaks)が index に残留している可能性があります。手動で確認してください: git update-index --force-remove "${AUTO_CANARY_GITLEAKS_PATH}"`);
      }
      gitleaksCanaryInjected = false;
    }
    if (secretlintCanaryPath) {
      try {
        fs.rmSync(secretlintCanaryPath, { force: true });
      } catch (e) {
        console.error(`⚠️  カナリア(secretlint)ファイルが残留している可能性があります: ${secretlintCanaryPath}`);
      }
      secretlintCanaryPath = null;
    }
  }

  writeLog(exitCode === 0 ? 'passed' : 'failed', isCanaryTest, {
    secretlint: secretlintSelfCheck,
    gitleaks: gitleaksSelfCheck
  });

  if (exitCode === 0) {
    console.log('\n✅ All checks passed');
  } else {
    const failedTools = [!secretlintOk && 'secretlint', !gitleaksOk && 'gitleaks'].filter(Boolean).join(', ');
    console.error(`\n❌ Pre-commit checks failed${failedTools ? ` (${failedTools})` : ''}`);
  }

  return exitCode;
}

module.exports = { run };
