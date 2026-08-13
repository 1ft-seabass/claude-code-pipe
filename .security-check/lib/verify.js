const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const {
  LOG_FILE,
  GITLEAKS_BINARY_NAME,
  findGitleaksBinary,
  getSecretlintVersion,
  detectLegacyV1,
  detectLegacyV2,
  readJson,
} = require('./environment');

const TOTAL_CHECKS = 15;

function fileExists(filePath) {
  return fs.existsSync(path.join(process.cwd(), filePath));
}

function readFile(filePath) {
  try {
    return fs.readFileSync(path.join(process.cwd(), filePath), 'utf8');
  } catch (e) {
    return null;
  }
}

function execCommand(command) {
  try {
    return execSync(command, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
  } catch (e) {
    return null;
  }
}

// git worktree では .git がディレクトリではなく gitdir ポインタファイル
// （`gitdir: /path/to/main/.git/worktrees/<name>`）になり、決め打ちの
// '.git/hooks/pre-commit' は実在するフックを指さない。hooks は全 worktree で
// 共有される実体を指すため git 自身に解決させる（フォールバックは非 git 環境向け）。
function resolveGitHookPath(hookName) {
  const resolved = execCommand(`git rev-parse --git-path hooks/${hookName}`);
  if (resolved) {
    return path.isAbsolute(resolved) ? resolved : path.join(process.cwd(), resolved);
  }
  return path.join(process.cwd(), '.git', 'hooks', hookName);
}

function run(args) {
  const testRun = args.includes('--test-run');
  const simpleRun = args.includes('--simple');

  console.log('🔍 Security Setup Health Check');
  console.log('================================\n');

  const results = { passed: 0, failed: 0, warning: 0, skipped: 0 };

  function checkResult(passed, message, type = 'normal') {
    if (type === 'warning') {
      console.log(`  ⚠️  ${message}`);
      results.warning++;
    } else if (type === 'skip') {
      console.log(`  ⏭️  ${message}`);
      results.skipped++;
    } else if (passed) {
      console.log(`  ✅ ${message}`);
      results.passed++;
    } else {
      console.log(`  ❌ ${message}`);
      results.failed++;
    }
  }

  // ===========================
  // v1 (husky) / v2 (旧 scripts/ レイアウト) 先行検知
  // ===========================
  // 「共通」ワンショット指示（README）は version-detect を経由せず直接このスクリプトを
  // 呼ぶため、ここで検知しないと旧構成が素通りし、新規導入フローが既存設定の上に
  // 重なってしまうリスクがある。判定ロジックは version-detect/scripts/detect-version.js と同一。
  const v1 = detectLegacyV1();
  if (v1.detected) {
    console.log('⚠️  husky/lint-staged ベースの v1 構成を検出しました（' + v1.reasons.join(' / ') + '）');
    console.log('    このまま進めると、既存の v1 設定の上に新しい構成が重なり混在状態になる可能性があります。');
    console.log('    先に migration/MIGRATION_GUIDE_v1_to_v3.0.0.md を参照してください。');
    console.log('');
  }

  const v2 = detectLegacyV2();
  if (v2.detected) {
    console.log('⚠️  v2（旧 scripts/ レイアウト）構成を検出しました（' + v2.reasons.join(' / ') + '）');
    console.log('    .security-check/ への移行が完了していません。');
    console.log('    先に migration/MIGRATION_GUIDE_v2.1.0_to_v3.0.0.md を参照してください。');
    console.log('');
  }

  const preCommitHookPath = resolveGitHookPath('pre-commit');

  // ===========================
  // 存在チェック
  // ===========================
  console.log('[存在チェック]');

  // 1. .secretlintrc.json
  const secretlintrcExists = fileExists('.secretlintrc.json');
  checkResult(secretlintrcExists, '.secretlintrc.json' + (!secretlintrcExists ? ' — ファイルが見つかりません' : ''));

  // 2. gitleaks.toml
  const gitleaksTomlExists = fileExists('gitleaks.toml');
  checkResult(gitleaksTomlExists, 'gitleaks.toml' + (!gitleaksTomlExists ? ' — ファイルが見つかりません' : ''));

  // 3. .security-check/ ディレクトリ（footprintの集約先そのものが揃っているか）
  const securityCheckDirExists = fileExists('.security-check');
  checkResult(securityCheckDirExists, '.security-check/' + (!securityCheckDirExists ? ' — ディレクトリが見つかりません' : ''));

  // 4. .git/hooks/pre-commit（worktree では共有 hooks の実パスを解決）
  const gitHookExists = fs.existsSync(preCommitHookPath);
  checkResult(gitHookExists, '.git/hooks/pre-commit' + (!gitHookExists ? ' — ファイルが見つかりません（npx simple-git-hooks を実行してください）' : ''));

  // 5. package.json の simple-git-hooks 設定
  const packageJsonExists = fileExists('package.json');
  const packageJsonData = packageJsonExists ? readJson(path.join(process.cwd(), 'package.json')) : null;
  const hookConfig = packageJsonData && packageJsonData['simple-git-hooks'] && packageJsonData['simple-git-hooks']['pre-commit'];
  const simpleGitHooksExists = !!hookConfig && /\.security-check\/cli\.js/.test(hookConfig);
  checkResult(simpleGitHooksExists, 'package.json simple-git-hooks 設定' + (!simpleGitHooksExists ? ' — .security-check/cli.js pre-commit を指す設定が見つかりません' : ''));

  // 6. package.json の npm scripts（cli.js への単一エントリ）
  const securityScript = packageJsonData && packageJsonData.scripts && packageJsonData.scripts.security;
  const scriptsCheckPassed = !!securityScript && /\.security-check\/cli\.js/.test(securityScript);
  checkResult(scriptsCheckPassed, 'package.json scripts.security' + (!scriptsCheckPassed ? ' — .security-check/cli.js を指す設定が見つかりません' : ''));

  console.log('');

  // ===========================
  // 中身チェック
  // ===========================
  console.log('[中身チェック]');

  // 7. .secretlintrc.json の内容
  if (secretlintrcExists) {
    const secretlintrc = readFile('.secretlintrc.json');
    const hasPresetRecommend = secretlintrc && secretlintrc.includes('preset-recommend');
    checkResult(hasPresetRecommend, '.secretlintrc.json に preset-recommend' + (hasPresetRecommend ? ' あり' : ' が含まれていません'));
  } else {
    checkResult(false, '.secretlintrc.json — 存在チェックが ❌ のためスキップ', 'skip');
  }

  // 8. gitleaks.toml の内容
  if (gitleaksTomlExists) {
    const gitleaksToml = readFile('gitleaks.toml');
    // [allowlist] だけで [extend]/[rules] が無いと検出ルール 0 個で動作してしまう。
    // 「空でないこと」だけの確認では見逃すため、検出ルールの有無を確認する。
    const hasRules = gitleaksToml && (/\[extend\]/.test(gitleaksToml) || /\[\[rules\]\]/.test(gitleaksToml));
    checkResult(hasRules, 'gitleaks.toml に検出ルール（[extend] または [[rules]]）' +
      (hasRules ? ' あり' : ' が見つかりません — [allowlist] のみの場合、検出ルール 0 個で動作します'));
  } else {
    checkResult(false, 'gitleaks.toml — 存在チェックが ❌ のためスキップ', 'skip');
  }

  // 9. .git/hooks/pre-commit の内容
  if (gitHookExists) {
    const precommit = fs.readFileSync(preCommitHookPath, 'utf8');
    const hasCliJs = precommit && precommit.includes('.security-check/cli.js');
    const hasSuppression = precommit && /\|\|\s*true/.test(precommit);
    if (hasSuppression) {
      checkResult(false, '.git/hooks/pre-commit — || true が含まれており exit code が握りつぶされています（コミットがブロックされません）');
    } else {
      checkResult(hasCliJs, '.git/hooks/pre-commit に .security-check/cli.js' + (hasCliJs ? ' あり' : ' が含まれていません'));
    }
  } else {
    checkResult(false, '.git/hooks/pre-commit — 存在チェックが ❌ のためスキップ', 'skip');
  }

  console.log('');

  // ===========================
  // 動作チェック
  // ===========================
  console.log('[動作チェック]');

  // 10. secretlint
  const secretlintVersion = getSecretlintVersion();
  if (secretlintVersion) {
    checkResult(true, `secretlint ${secretlintVersion}`);
  } else {
    checkResult(false, 'secretlint — コマンドが見つかりません');
  }

  // 11. gitleaks バイナリ
  const gitleaks = findGitleaksBinary();
  if (gitleaks) {
    const version = execCommand(`${gitleaks.command} version`);
    if (version) {
      checkResult(true, `gitleaks ${version}（${gitleaks.source === 'local' ? '.security-check/bin' : 'グローバル'}）`);
    } else {
      checkResult(false, `gitleaks — ${gitleaks.source === 'local' ? `.security-check/bin/${GITLEAKS_BINARY_NAME}` : 'グローバルコマンド'} が実行できません（実行権限またはバイナリが壊れている可能性）`);
    }
  } else {
    checkResult(false, `gitleaks — 見つかりません（node .security-check/cli.js install-gitleaks で導入してください）`);
  }

  // 12. gitleaks 機能的カナリアテスト
  // 「[extend]/[rules] という文字列が書いてある」だけでは、実際に検出ルールが
  // 機能しているかは分からない（存在確認・内容確認と動作確認は別物）。
  // 合成シークレットを実際にスキャンし、検出できるかで確認する。
  if (gitleaks) {
    // 相対パスで指定する（絶対パスを渡すと、プロジェクトが "/tmp/..." 配下に
    // チェックアウトされている場合などに gitleaks.toml の allowlist paths
    // "tmp/.*" に誤爆し、カナリア自体が除外されてしまう）
    const canaryDirName = '.security-verify-canary';
    const canaryDir = path.join(process.cwd(), canaryDirName);
    const canaryFile = path.join(canaryDir, 'canary.env');
    // allowlist の regexes（YOUR_TOKEN_HERE, xxxxxx 等）に一致しない合成値
    const CANARY_SECRET = 'ghp_A1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6Q7r8'; // gitleaks:allow secretlint-disable-line

    try {
      fs.mkdirSync(canaryDir, { recursive: true });
      fs.writeFileSync(canaryFile, `GITHUB_PAT=${CANARY_SECRET}\n`);

      const canaryCmd = `${gitleaks.command} dir "${canaryDirName}" --config gitleaks.toml --redact`;

      try {
        execSync(canaryCmd, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
        checkResult(false, 'gitleaks 機能的カナリアテスト — 合成シークレットが検出されませんでした（検出ルールが無効化されている可能性）');
      } catch (e) {
        if (e.status === 1) {
          checkResult(true, 'gitleaks 機能的カナリアテスト — 合成シークレットを正しく検出');
        } else {
          checkResult(false, `gitleaks 機能的カナリアテスト — 予期しないエラー（exit ${e.status}）`);
        }
      }
    } finally {
      fs.rmSync(canaryDir, { recursive: true, force: true });
    }
  } else {
    checkResult(false, 'gitleaks 機能的カナリアテスト — gitleaks が未導入のためスキップ', 'skip');
  }

  // 13. 実行ログの最終確認
  const logFileExists = fs.existsSync(LOG_FILE);
  if (logFileExists) {
    const lines = fs.readFileSync(LOG_FILE, 'utf8').trim().split('\n').filter(Boolean);
    if (lines.length > 0) {
      try {
        const last = JSON.parse(lines[lines.length - 1]);
        const date = new Date(last.timestamp);
        const daysDiff = Math.floor((Date.now() - date.getTime()) / (1000 * 60 * 60 * 24));
        const dateStr = last.timestamp.slice(0, 10);
        if (daysDiff === 0) {
          checkResult(true, `実行ログ — 最終実行: ${dateStr} 本日 (${last.result})`);
        } else if (daysDiff <= 7) {
          checkResult(true, `実行ログ — 最終実行: ${dateStr} ${daysDiff}日前 (${last.result})`);
        } else {
          checkResult(false, `実行ログ — 最終実行: ${dateStr} ${daysDiff}日前 (${last.result}) — 長期間動いていない可能性`, 'warning');
        }
      } catch (e) {
        checkResult(false, '実行ログ — 解析エラー');
      }
    } else {
      checkResult(false, '実行ログ — ログが空です（一度も動いていない可能性）');
    }
  } else {
    checkResult(false, '実行ログ — .security-check/logs/pre-commit.log が見つかりません（一度もコミットしていない可能性）');
  }

  // 14. ネガティブテスト実行痕跡（カナリアblocked）
  // 「実行ログが新しい」だけでは、Step 3.6.5のネガティブテスト（シークレットが
  // 実際にブロックされるかの確認）が一度でも実行されたかは分からない。
  // pre-commit.js は .test-secret-canary がステージされたコミットを type: 'canary'
  // としてログに記録するため、その痕跡の有無で確認する（集計数字ではなく事実で判定する）。
  if (logFileExists) {
    const lines = fs.readFileSync(LOG_FILE, 'utf8').trim().split('\n').filter(Boolean);
    const canaryEntries = lines
      .map(line => { try { return JSON.parse(line); } catch (e) { return null; } })
      .filter(entry => entry && entry.type === 'canary');

    const passedCanary = canaryEntries.find(entry => entry.result === 'passed');
    const blockedCanary = canaryEntries.slice().reverse().find(entry => entry.result === 'failed');

    if (passedCanary) {
      checkResult(false, `ネガティブテスト実行痕跡 — カナリアがブロックされずコミットされた形跡があります（${passedCanary.timestamp}）。pre-commit フックが機能していない可能性`);
    } else if (blockedCanary) {
      checkResult(true, `ネガティブテスト実行痕跡 — ${blockedCanary.timestamp.slice(0, 10)} にカナリアがブロックされたことを確認`);
    } else {
      checkResult(false, 'ネガティブテスト実行痕跡 — Step 3.6.5のネガティブテストが実行された形跡がありません', 'warning');
    }
  } else {
    checkResult(false, 'ネガティブテスト実行痕跡 — .security-check/logs/pre-commit.log が見つかりません', 'skip');
  }

  // 15. 毎コミット自動カナリア自己検証の実行痕跡
  // check#14 は「人間が Step 3.6.5 を手動で1回でも実行したか」を確認するのに対し、
  // こちらは pre-commit.js が毎コミット自動で（git index への一時カナリア注入で）
  // 検出器の生死を確認している仕組みが、直近のコミットで実際に機能していたかを
  // autoCanary ログフィールドの証拠で確認する（同じく事実で判定する）。
  if (logFileExists) {
    const lines = fs.readFileSync(LOG_FILE, 'utf8').trim().split('\n').filter(Boolean);
    const entriesWithAutoCanary = lines
      .map(line => { try { return JSON.parse(line); } catch (e) { return null; } })
      .filter(entry => entry && entry.autoCanary);

    if (entriesWithAutoCanary.length === 0) {
      checkResult(false, '自動カナリア自己検証の実行痕跡 — 記録がありません（pre-commit.js が旧バージョンのままか、一度もコミットしていない可能性）', 'warning');
    } else {
      const last = entriesWithAutoCanary[entriesWithAutoCanary.length - 1];
      const { gitleaks: g, secretlint: s } = last.autoCanary;
      const brokenTools = [g === 'failed' && 'gitleaks', s === 'failed' && 'secretlint'].filter(Boolean);
      const cleanupFailedTools = [g === 'cleanup-failed' && 'gitleaks', s === 'cleanup-failed' && 'secretlint'].filter(Boolean);

      if (brokenTools.length > 0) {
        checkResult(false, `自動カナリア自己検証の実行痕跡 — 直近コミット(${last.timestamp.slice(0, 10)})で自己検証が失敗していた形跡があります（${brokenTools.join(', ')}）`);
      } else if (cleanupFailedTools.length > 0) {
        checkResult(false, `自動カナリア自己検証の実行痕跡 — 直近コミット(${last.timestamp.slice(0, 10)})でカナリアの後片付けに失敗していた形跡があります（${cleanupFailedTools.join(', ')}）。index/作業ツリーにカナリアが残留していないか確認してください`);
      } else if (g === 'ok' || s === 'ok') {
        const skipped = [g !== 'ok' && 'gitleaks', s !== 'ok' && 'secretlint'].filter(Boolean);
        checkResult(true, `自動カナリア自己検証の実行痕跡 — 直近コミット(${last.timestamp.slice(0, 10)})で確認${skipped.length ? `（${skipped.join(', ')} はスキップ）` : ''}`);
      } else {
        checkResult(false, `自動カナリア自己検証の実行痕跡 — 直近コミット(${last.timestamp.slice(0, 10)})で両検出器ともスキップされており自己検証が確認できていません`, 'warning');
      }
    }
  } else {
    checkResult(false, '自動カナリア自己検証の実行痕跡 — .security-check/logs/pre-commit.log が見つかりません', 'skip');
  }

  console.log('');

  // ===========================
  // 結果サマリー
  // ===========================
  console.log('================================');
  console.log(`結果: ${results.passed}/${TOTAL_CHECKS} passed, ${results.failed} failed, ${results.warning} warning${results.skipped > 0 ? `, ${results.skipped} skipped` : ''}`);

  if (results.failed > 0) {
    console.log('\n❌ ヘルスチェックに問題があります。まず設定を修正してください。');
    return 1;
  }

  console.log('\n✅ ヘルスチェック完了');

  // ===========================
  // テストラン（--test-run または --simple フラグ時のみ）
  // ===========================
  if (testRun || simpleRun) {
    if (testRun) {
      console.log('\n🧪 実際のスキャンをテスト実行します（全ファイル + 全履歴）...\n');
    } else {
      console.log('\n🧪 シンプルテスト実行します（staged ファイルのみ）...\n');
    }

    const testResults = {
      secretlint: { passed: false, output: '' },
      gitleaks: { passed: false, output: '' }
    };

    // secretlint テスト
    console.log('[secretlint テスト]');
    const secretlintCmd = 'npx secretlint "**/*"';
    console.log(`  ${secretlintCmd}`);
    try {
      const output = execSync(secretlintCmd, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
      testResults.secretlint.passed = true;
      testResults.secretlint.output = output;
      console.log('  → ✅ 0 件検出');
    } catch (e) {
      const output = e.stdout || e.stderr || e.message;
      testResults.secretlint.output = output;

      const lines = output.split('\n');
      const errorCount = lines.filter(line => line.includes('Error:')).length;

      if (errorCount > 0) {
        console.log(`  → ⚠️  ${errorCount} 件検出`);
        console.log('\n  検出内容:');
        console.log(output.split('\n').slice(0, 20).map(l => '    ' + l).join('\n'));
        if (lines.length > 20) {
          console.log('    ...(残り省略)');
        }
      } else {
        console.log('  → ✅ 0 件検出');
        testResults.secretlint.passed = true;
      }
    }

    console.log('');

    // gitleaks テスト（バイナリがある場合のみ）
    if (gitleaks) {
      console.log('[gitleaks テスト]');

      // gitleaks 8.28+ では detect/protect が --help から非表示になった非推奨コマンドのため、
      // 後継の git サブコマンドを使用する（--staged: ステージ済みのみ / 無指定: 全履歴）
      // --redact: 検出時に実際のシークレット値をログ・標準出力に出さないため（AIとの会話や
      // ノートへの貼り付けが新たな漏洩経路にならないようにする）
      const gitleaksCmd = simpleRun
        ? `${gitleaks.command} git --staged -v --config gitleaks.toml --redact .`
        : `${gitleaks.command} git -v --config gitleaks.toml --redact .`;

      console.log(`  ${gitleaksCmd}`);

      try {
        const output = execSync(gitleaksCmd, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
        testResults.gitleaks.passed = true;
        testResults.gitleaks.output = output;
        console.log('  → ✅ 0 件検出');
      } catch (e) {
        const output = e.stdout || e.stderr || e.message;
        testResults.gitleaks.output = output;

        if (e.status === 1 && output.includes('Finding:')) {
          const findings = (output.match(/Finding:/g) || []).length;
          console.log(`  → ⚠️  ${findings} 件検出`);
          console.log('\n  検出内容:');
          console.log(output.split('\n').slice(0, 30).map(l => '    ' + l).join('\n'));
          if (output.split('\n').length > 30) {
            console.log('    ...(残り省略)');
          }
        } else {
          console.log('  → ✅ 0 件検出');
          testResults.gitleaks.passed = true;
        }
      }
    } else {
      console.log('[gitleaks テスト]');
      console.log('  ⏭️  gitleaks が未導入のためスキップ');
    }

    console.log('\n================================');

    const secretlintTestOk = testResults.secretlint.passed;
    const gitleaksTestOk = !gitleaks || testResults.gitleaks.passed;

    if (secretlintTestOk && gitleaksTestOk) {
      console.log('テスト結果: ✅ 問題なし');
    } else {
      console.log('テスト結果: ⚠️  要確認（上記の検出内容を AI に報告してください）');
    }
    return 0;
  }

  return 0;
}

module.exports = { run };
