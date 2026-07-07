/**
 * windows-native-probe.js
 *
 * claude-code-pipe の Windows native 対応検討のための使い捨て検証スクリプト。
 * 単体で動作（外部依存なし、Node.js 標準モジュールのみ）。main ブランチには同期されない。
 *
 * 使い方:
 *   node scripts/windows-native-probe.js
 *
 * 前提:
 *   - `claude` コマンドが PATH に通っていること（PowerShell で `claude --version` が動く状態）
 *   - Node.js がインストールされていること
 *
 * 確認したいこと:
 *   1. `claude -v` のような一発コマンドが PTY なしで正常に動くか（既存 /claude-version と同じ手法）
 *   2. `claude -p ... --output-format json`（非ストリーミング）が妥当な時間で完了し、
 *      model / permissionMode / apiKeySource / tools を含むか
 *   3. `claude -p ... --output-format stream-json --verbose` を PTY なしで spawn したとき、
 *      stdout の JSON 行が「逐次届く」のか「プロセス終了までブロックされる」のか
 *   4. 3 と並行して、~/.claude/projects 配下に新規 .jsonl ファイルが「stdout より早く」
 *      出現・更新されるか（watcher相関設計が成立する前提の検証）
 *
 * 出力: 各テストの経過時間（ms）を逐次ログし、最後にサマリー JSON を出力する。
 * このサマリーをそのまま開発者に共有してもらえば判断できる。
 */

'use strict';

const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const PROJECTS_DIR = path.join(os.homedir(), '.claude', 'projects');
const TEST_PROMPT_MARKER = `probe-${Date.now()}`;

// npm でグローバルインストールされた claude は Windows では claude.cmd の場合が多く、
// shell:true なしだと ENOENT になることがあるためこのテストでは shell:true を使う。
// (本実装ではプロンプトのエスケープが必要になる点に注意。このテストでは固定文字列のみ扱う)
//
// stdin は 'ignore' にする（v2）: 前回の実行で "no stdin data received in 3s" という
// 警告と3秒の待ちが観測されたため。stdin をパイプしたまま何も書き込まないと claude 側が
// 律儀に3秒待つ模様。ここを無視することで純粋な起動・応答レイテンシを計測する。
const SPAWN_OPTS_BASE = { shell: true, stdio: ['ignore', 'pipe', 'pipe'] };

function nowMs() {
  return Number(process.hrtime.bigint() / 1000000n);
}

function log(t0, label, extra) {
  const elapsed = nowMs() - t0;
  console.log(`  [+${String(elapsed).padStart(6, ' ')}ms] ${label}${extra ? ' ' + extra : ''}`);
}

/**
 * 再帰的に .jsonl ファイルの一覧と mtime を取得
 */
function listJsonlFiles(dir) {
  const results = [];
  function walk(d) {
    let entries;
    try {
      entries = fs.readdirSync(d, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = path.join(d, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.isFile() && entry.name.endsWith('.jsonl')) {
        try {
          const stat = fs.statSync(full);
          results.push({ path: full, size: stat.size, mtimeMs: stat.mtimeMs });
        } catch {
          // ignore
        }
      }
    }
  }
  walk(dir);
  return results;
}

/**
 * テスト0: shell:true なし（shell:false, デフォルト）で claude -v が動くか
 *
 * shell:true + 引数配列の組み合わせは、引数がエスケープされずコマンドラインに
 * 連結されるためコマンドインジェクションのリスクがある（Node.js自身が
 * DeprecationWarning を出している）。Node は .cmd/.bat ファイルの spawn を
 * shell:false でも内部的に処理できる可能性があるため、これが動けば
 * 本実装で shell:trueを避けられ、エスケープ処理そのものが不要になる。
 * ENOENT になる場合は shell:true (または他の回避策) が必要という結論になる。
 */
function testVersionNoShell() {
  return new Promise((resolve) => {
    console.log('\n=== [Test 0] claude -v (one-shot, shell:false = デフォルト) ===');
    const t0 = nowMs();
    const result = { ok: false, elapsedMs: null, stdout: null, error: null };

    const proc = spawn('claude', ['-v'], { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';

    proc.stdout.on('data', (d) => {
      stdout += d.toString();
      log(t0, 'stdout chunk received', `(${d.length} bytes)`);
    });
    proc.stderr.on('data', (d) => log(t0, 'stderr chunk', d.toString().slice(0, 200)));

    proc.on('error', (err) => {
      log(t0, 'spawn error (ENOENT等はここで捕捉される)', err.message);
      result.error = err.message;
      resolve(result);
    });

    proc.on('close', (code) => {
      result.elapsedMs = nowMs() - t0;
      result.ok = code === 0;
      result.stdout = stdout.trim();
      log(t0, `process closed (code=${code})`);
      resolve(result);
    });
  });
}

/**
 * テスト1: 一発コマンド（claude -v）が PTY なしで動くか
 * 既存の /claude-version エンドポイントと同じ手法。ここが失敗する場合、
 * claude コマンド自体の spawn 解決（PATH/拡張子問題）を先に疑うこと。
 */
function testVersionOneShot() {
  return new Promise((resolve) => {
    console.log('\n=== [Test 1] claude -v (one-shot, no PTY) ===');
    const t0 = nowMs();
    const result = { ok: false, elapsedMs: null, stdout: null, error: null };

    const proc = spawn('claude', ['-v'], SPAWN_OPTS_BASE);
    let stdout = '';

    proc.stdout.on('data', (d) => {
      stdout += d.toString();
      log(t0, 'stdout chunk received', `(${d.length} bytes)`);
    });
    proc.stderr.on('data', (d) => log(t0, 'stderr chunk', d.toString().slice(0, 200)));

    proc.on('error', (err) => {
      log(t0, 'spawn error', err.message);
      result.error = err.message;
      resolve(result);
    });

    proc.on('close', (code) => {
      result.elapsedMs = nowMs() - t0;
      result.ok = code === 0;
      result.stdout = stdout.trim();
      log(t0, `process closed (code=${code})`);
      resolve(result);
    });
  });
}

/**
 * テスト2: 非ストリーミング json 出力の一発コマンドで
 * model / permissionMode / apiKeySource / tools が取れるか、どのくらい時間がかかるか
 */
function testJsonOneShot() {
  return new Promise((resolve) => {
    console.log('\n=== [Test 2] claude -p "..." --output-format json (one-shot, no PTY) ===');
    const t0 = nowMs();
    const result = { ok: false, elapsedMs: null, parsed: null, raw: null, error: null };

    const args = ['-p', `Reply with only the word: pong (marker: ${TEST_PROMPT_MARKER})`, '--output-format', 'json'];
    const proc = spawn('claude', args, SPAWN_OPTS_BASE);
    let stdout = '';

    proc.stdout.on('data', (d) => {
      stdout += d.toString();
      log(t0, 'stdout chunk received', `(${d.length} bytes)`);
    });
    proc.stderr.on('data', (d) => log(t0, 'stderr chunk', d.toString().slice(0, 200)));

    proc.on('error', (err) => {
      log(t0, 'spawn error', err.message);
      result.error = err.message;
      resolve(result);
    });

    proc.on('close', (code) => {
      result.elapsedMs = nowMs() - t0;
      result.raw = stdout.trim();
      log(t0, `process closed (code=${code})`);
      try {
        const parsed = JSON.parse(result.raw);
        result.ok = true;
        result.parsed = {
          model: parsed.model ?? null,
          permission_mode: parsed.permissionMode ?? parsed.permission_mode ?? null,
          apiKeySource: parsed.apiKeySource ?? null,
          tools: parsed.tools ?? null,
          session_id: parsed.session_id ?? null,
          keys: Object.keys(parsed)
        };
      } catch (e) {
        result.error = `JSON parse failed: ${e.message}`;
      }
      resolve(result);
    });
  });
}

/**
 * テスト4: 特殊文字・シェルメタ文字を含むプロンプトで、
 * 配列渡し（shell:false）が本当にシェル解釈を経ずに安全か確認する。
 *
 * このリポジトリは過去に Bash 向けで同種のバグ（改行によるセッション分離、
 * バッククォート・$ のエスケープ漏れ）を2回踏んでいる。Windows は .cmd 実行時に
 * 内部で cmd.exe を経由するため、Node 側のクォーティングが完全に安全か
 * 実地で確認しておきたい。
 *
 * 手法: プロンプト文字列の中に「もしシェル解釈されたら特定のファイルを作る」
 * ペイロードを複数仕込んでおき、プロセス終了後にそのファイルが実在するかで
 * インジェクションの成否を機械的に判定する（モデルの応答内容には依存しない）。
 */
function testSpecialCharacters(testCwd) {
  return new Promise((resolve) => {
    console.log('\n=== [Test 4] 特殊文字・シェルメタ文字インジェクション耐性テスト ===');
    console.log(`    cwd = ${testCwd}`);
    const t0 = nowMs();

    const injectionFile = path.join(testCwd, `injected-${TEST_PROMPT_MARKER}.txt`);
    // Windows のパス区切り(\)がシェル的に解釈されないよう、コマンド内で使う
    // パスはそのまま渡す（このテストは配列渡しでの安全性確認が目的なので、
    // 仮にここがシェル経由で壊れても実害は一時ディレクトリ内で完結する）
    const payload = [
      'Please just reply with the single word: ok.',
      `(marker ${TEST_PROMPT_MARKER})`,
      `" & echo INJECTED > "${injectionFile}" & echo "`,
      `" ; echo INJECTED > "${injectionFile}" ; echo "`,
      `\`echo INJECTED > ${injectionFile}\``,
      `$(echo INJECTED > ${injectionFile})`,
      '%TEMP% %PATH%',
      '^&^|^<^>^%',
      'line1\nline2\nline3 (embedded newlines)',
      'trailing backslash before quote: \\"'
    ].join(' ');

    const result = {
      injectionFile,
      injectionFileCreated: null,
      exitCode: null,
      elapsedMs: null,
      stderrSuspicious: null,
      stdoutTail: null,
      stderrTail: null,
      error: null
    };

    const args = ['-p', payload, '--output-format', 'stream-json', '--verbose'];
    // shell 指定なし（Test 0 で shell:false でも動くことを確認済み）。
    // 配列渡しなのでシェル解釈を経ないはず、というのがこのテストの検証対象。
    const proc = spawn('claude', args, { cwd: testCwd, stdio: ['ignore', 'pipe', 'pipe'] });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (d) => {
      stdout += d.toString();
    });
    proc.stderr.on('data', (d) => {
      stderr += d.toString();
      log(t0, 'stderr chunk', d.toString().slice(0, 200));
    });

    proc.on('error', (err) => {
      log(t0, 'spawn error', err.message);
      result.error = err.message;
      resolve(result);
    });

    proc.on('close', (code) => {
      result.elapsedMs = nowMs() - t0;
      result.exitCode = code;
      result.injectionFileCreated = fs.existsSync(injectionFile);
      result.stdoutTail = stdout.trim().slice(-500);
      result.stderrTail = stderr.trim().slice(-500);

      // cmd.exe/PowerShell がコマンドラインの一部として解釈しようとした形跡がないか
      const suspiciousPatterns = [
        /is not recognized as an internal or external command/i,
        /の構文が間違っています/,
        /is not recognized/i,
        /予期しない/,
        /ParserError/i
      ];
      result.stderrSuspicious = suspiciousPatterns.some((re) => re.test(stderr));

      log(t0, `process closed (code=${code})`, `injectionFileCreated=${result.injectionFileCreated}`);
      if (result.injectionFileCreated) {
        console.log('  !!! WARNING: インジェクションに成功した形跡があります（要調査） !!!');
      } else {
        console.log('  OK: インジェクション用ファイルは作成されませんでした');
      }

      resolve(result);
    });
  });
}

/**
 * テスト3: stream-json をPTYなしでspawnし、
 *   (a) stdout にJSON行が逐次届くか、それともプロセス終了までブロックされるか
 *   (b) それと並行して .jsonl ファイルが stdout より早く出現・更新されるか
 * を同時に計測する。cwd はこのテスト用に一時ディレクトリを使う。
 */
function testStreamingWithFileWatch(testCwd) {
  return new Promise((resolve) => {
    console.log('\n=== [Test 3] claude -p "..." --output-format stream-json --verbose (streaming, no PTY) ===');
    console.log(`    cwd = ${testCwd}`);
    const t0 = nowMs();

    const result = {
      firstStdoutChunkMs: null,
      initEventSeenMs: null,
      sessionId: null,
      jsonlFilePath: null,
      firstJsonlFileSeenMs: null,
      jsonlSizeChangeEvents: [],
      processExitMs: null,
      exitCode: null,
      initEventArrivedBeforeExit: null,
      jsonlAppearedBeforeStdout: null
    };

    const knownFiles = new Map(); // path -> size
    for (const f of listJsonlFiles(PROJECTS_DIR)) {
      knownFiles.set(f.path, f.size);
    }

    const pollInterval = setInterval(() => {
      const current = listJsonlFiles(PROJECTS_DIR);
      for (const f of current) {
        const prevSize = knownFiles.get(f.path);
        if (prevSize === undefined) {
          knownFiles.set(f.path, f.size);
          if (result.firstJsonlFileSeenMs === null) {
            result.firstJsonlFileSeenMs = nowMs() - t0;
            result.jsonlFilePath = f.path;
            log(t0, 'NEW jsonl file detected', f.path);
          }
        } else if (f.size !== prevSize) {
          knownFiles.set(f.path, f.size);
          const elapsed = nowMs() - t0;
          result.jsonlSizeChangeEvents.push({ path: f.path, elapsedMs: elapsed, size: f.size });
          log(t0, 'jsonl size changed', `${f.path} -> ${f.size} bytes`);
        }
      }
    }, 100);

    const args = [
      '-p', `Please briefly explain what 2+2 is, then stop. (marker: ${TEST_PROMPT_MARKER})`,
      '--output-format', 'stream-json',
      '--verbose'
    ];
    const proc = spawn('claude', args, { ...SPAWN_OPTS_BASE, cwd: testCwd });

    let buffer = '';
    proc.stdout.on('data', (data) => {
      if (result.firstStdoutChunkMs === null) {
        result.firstStdoutChunkMs = nowMs() - t0;
        log(t0, 'FIRST stdout chunk received', `(${data.length} bytes)`);
      } else {
        log(t0, 'stdout chunk received', `(${data.length} bytes)`);
      }

      buffer += data.toString();
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const json = JSON.parse(line);
          if (json.type === 'system' && json.subtype === 'init' && result.initEventSeenMs === null) {
            result.initEventSeenMs = nowMs() - t0;
            result.sessionId = json.session_id || null;
            log(t0, 'system/init event parsed from stdout', `model=${json.model}, session_id=${json.session_id}`);
          }
        } catch {
          // 不完全な行は無視
        }
      }
    });

    proc.stderr.on('data', (d) => log(t0, 'stderr chunk', d.toString().slice(0, 200)));

    proc.on('error', (err) => {
      clearInterval(pollInterval);
      log(t0, 'spawn error', err.message);
      result.error = err.message;
      resolve(result);
    });

    proc.on('close', (code) => {
      clearInterval(pollInterval);
      result.processExitMs = nowMs() - t0;
      result.exitCode = code;
      log(t0, `process closed (code=${code})`);

      result.initEventArrivedBeforeExit = result.initEventSeenMs !== null;
      if (result.firstJsonlFileSeenMs !== null && result.firstStdoutChunkMs !== null) {
        result.jsonlAppearedBeforeStdout = result.firstJsonlFileSeenMs < result.firstStdoutChunkMs;
      } else if (result.firstJsonlFileSeenMs !== null && result.firstStdoutChunkMs === null) {
        result.jsonlAppearedBeforeStdout = true; // stdoutが一切来なかった場合
      }

      resolve(result);
    });
  });
}

/**
 * テスト5: --resume で既存セッションに送信したとき、
 *   (a) stdout に system/init（resumed）が逐次届くか
 *   (b) 既存の jsonl ファイルのサイズ変化が stdout より早いか遅いか
 * を計測する。cwd と sessionId は Test 3 で開始したセッションのものを使う
 * （--resume はセッションを開始した cwd と一致していないと解決できないため）。
 */
function testResumeSession(testCwd, sessionId, existingJsonlPath) {
  return new Promise((resolve) => {
    console.log('\n=== [Test 5] claude -p "..." --resume <sessionId> --output-format stream-json --verbose ===');
    console.log(`    cwd = ${testCwd}, sessionId = ${sessionId}`);
    const t0 = nowMs();

    const result = {
      sessionId,
      firstStdoutChunkMs: null,
      initEventSeenMs: null,
      resumedSessionIdMatches: null,
      sizeBefore: null,
      firstSizeChangeMs: null,
      sizeChangeEvents: [],
      processExitMs: null,
      exitCode: null,
      initEventArrivedBeforeExit: null,
      fileChangedBeforeStdout: null,
      error: null
    };

    try {
      result.sizeBefore = fs.statSync(existingJsonlPath).size;
    } catch (e) {
      result.error = `Failed to stat existing jsonl file: ${e.message}`;
      resolve(result);
      return;
    }

    let lastKnownSize = result.sizeBefore;
    const pollInterval = setInterval(() => {
      let stat;
      try {
        stat = fs.statSync(existingJsonlPath);
      } catch {
        return;
      }
      if (stat.size !== lastKnownSize) {
        lastKnownSize = stat.size;
        const elapsed = nowMs() - t0;
        if (result.firstSizeChangeMs === null) {
          result.firstSizeChangeMs = elapsed;
        }
        result.sizeChangeEvents.push({ elapsedMs: elapsed, size: stat.size });
        log(t0, 'jsonl size changed (resume)', `-> ${stat.size} bytes`);
      }
    }, 100);

    const args = [
      '-p', `Please briefly confirm you remember the previous exchange, then stop. (marker: ${TEST_PROMPT_MARKER})`,
      '--resume', sessionId,
      '--output-format', 'stream-json',
      '--verbose'
    ];
    const proc = spawn('claude', args, { cwd: testCwd, stdio: ['ignore', 'pipe', 'pipe'] });

    let buffer = '';
    proc.stdout.on('data', (data) => {
      if (result.firstStdoutChunkMs === null) {
        result.firstStdoutChunkMs = nowMs() - t0;
        log(t0, 'FIRST stdout chunk received (resume)', `(${data.length} bytes)`);
      } else {
        log(t0, 'stdout chunk received (resume)', `(${data.length} bytes)`);
      }

      buffer += data.toString();
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const json = JSON.parse(line);
          if (json.type === 'system' && json.subtype === 'init' && result.initEventSeenMs === null) {
            result.initEventSeenMs = nowMs() - t0;
            result.resumedSessionIdMatches = json.session_id === sessionId;
            log(t0, 'system/init event parsed from stdout (resume)', `session_id=${json.session_id}, matches=${result.resumedSessionIdMatches}`);
          }
        } catch {
          // 不完全な行は無視
        }
      }
    });

    proc.stderr.on('data', (d) => log(t0, 'stderr chunk (resume)', d.toString().slice(0, 200)));

    proc.on('error', (err) => {
      clearInterval(pollInterval);
      log(t0, 'spawn error (resume)', err.message);
      result.error = err.message;
      resolve(result);
    });

    proc.on('close', (code) => {
      clearInterval(pollInterval);
      result.processExitMs = nowMs() - t0;
      result.exitCode = code;
      log(t0, `process closed (code=${code}) (resume)`);

      result.initEventArrivedBeforeExit = result.initEventSeenMs !== null;
      if (result.firstSizeChangeMs !== null && result.firstStdoutChunkMs !== null) {
        result.fileChangedBeforeStdout = result.firstSizeChangeMs < result.firstStdoutChunkMs;
      } else if (result.firstSizeChangeMs !== null && result.firstStdoutChunkMs === null) {
        result.fileChangedBeforeStdout = true;
      }

      resolve(result);
    });
  });
}

async function main() {
  console.log('Windows native probe for claude-code-pipe');
  console.log(`platform=${process.platform}, home=${os.homedir()}`);
  console.log(`projects dir = ${PROJECTS_DIR}`);

  const testCwd = fs.mkdtempSync(path.join(os.tmpdir(), 'ccp-probe-'));

  const test0 = await testVersionNoShell();
  const test1 = await testVersionOneShot();
  const test2 = await testJsonOneShot();
  const test3 = await testStreamingWithFileWatch(testCwd);

  const specialCharsCwd = fs.mkdtempSync(path.join(os.tmpdir(), 'ccp-probe-specialchars-'));
  const test4 = await testSpecialCharacters(specialCharsCwd);

  let test5 = null;
  if (test3.sessionId && test3.jsonlFilePath) {
    test5 = await testResumeSession(testCwd, test3.sessionId, test3.jsonlFilePath);
  } else {
    console.log('\n=== [Test 5] スキップ: Test 3 で sessionId / jsonlFilePath が取得できませんでした ===');
  }

  const summary = {
    platform: process.platform,
    test0_versionNoShell: test0,
    test1_versionOneShot: test1,
    test2_jsonOneShot: test2,
    test3_streamingWithFileWatch: test3,
    test4_specialCharacters: test4,
    test5_resumeSession: test5
  };

  console.log('\n\n=== SUMMARY (このJSONをそのまま共有してください) ===');
  console.log(JSON.stringify(summary, null, 2));
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
