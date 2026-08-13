// ウィザード用の対話プリミティブ。外部依存ライブラリなし（raw-mode + ANSI を自前実装）。
// select/confirm どちらも非TTYでは null を返して安全に縮退する（CI/パイプでも壊れない）。

const readline = require('readline');
const { stdin, stdout } = process;

const ESC = '\x1b';
const tty = stdout.isTTY;
const cyan = (s) => (tty ? `${ESC}[36m${s}${ESC}[0m` : s);
const dim = (s) => (tty ? `${ESC}[2m${s}${ESC}[0m` : s);

// choices: [{ label, value }]。上下キーで選択、Enterで決定、Escで取消。
// 同時表示は size 件の窓に固定し、選択位置が窓の外に出ないよう開始位置だけ追従させる
// （画面全消しではなく直前の描画行数分だけ上に戻って上書きするため、行数が端末高さを
// 超えると描画が崩れる。窓表示はこれを避けるための対策）。
function select({ message, choices, size = 7 }) {
  return new Promise((resolve) => {
    if (!stdin.isTTY) return resolve(null);

    const n = choices.length;
    const win = Math.min(size, n);
    let index = 0;
    let start = 0;
    let prevLines = 0;

    const draw = () => {
      if (index < start) start = index;
      else if (index >= start + win) start = index - win + 1;
      start = Math.max(0, Math.min(start, n - win));

      const lines = [message];
      for (let i = start; i < start + win; i++) {
        const active = i === index;
        lines.push(`${active ? cyan('❯') : ' '} ${active ? cyan(choices[i].label) : choices[i].label}`);
      }
      lines.push(dim(`↑/↓ 移動  Enter 決定  Esc 取消  (${index + 1}/${n})`));

      if (prevLines > 0) stdout.write(`${ESC}[${prevLines}A`);
      stdout.write(`${ESC}[0J` + lines.join('\n') + '\n');
      prevLines = lines.length;
    };

    const finish = (value) => {
      stdout.write(`${ESC}[?25h`);
      stdin.setRawMode(false);
      stdin.pause();
      stdin.removeListener('keypress', onKey);
      resolve(value);
    };

    const onKey = (_, key) => {
      if (key.ctrl && key.name === 'c') { finish(null); process.exit(130); }
      else if (key.name === 'up') { index = (index - 1 + n) % n; draw(); }
      else if (key.name === 'down') { index = (index + 1) % n; draw(); }
      else if (key.name === 'return') finish(choices[index].value);
      else if (key.name === 'escape') finish(null);
    };

    readline.emitKeypressEvents(stdin);
    stdin.setRawMode(true);
    stdin.resume();
    stdout.write(`${ESC}[?25l`);
    stdin.on('keypress', onKey);
    draw();
  });
}

// y/n の一打鍵確認。Enterはdefaultを採用、Escは取消（null）。
function confirm({ message, default: defaultValue = false }) {
  return new Promise((resolve) => {
    if (!stdin.isTTY) return resolve(null);

    const hint = defaultValue ? 'Y/n' : 'y/N';
    stdout.write(`${message} ${dim(`(${hint})`)} `);

    const finish = (value) => {
      stdin.setRawMode(false);
      stdin.pause();
      stdin.removeListener('keypress', onKey);
      stdout.write('\n');
      resolve(value);
    };

    const onKey = (_, key) => {
      if (key.ctrl && key.name === 'c') { finish(null); process.exit(130); }
      else if (key.name === 'y') finish(true);
      else if (key.name === 'n') finish(false);
      else if (key.name === 'return') finish(defaultValue);
      else if (key.name === 'escape') finish(null);
    };

    readline.emitKeypressEvents(stdin);
    stdin.setRawMode(true);
    stdin.resume();
    stdin.on('keypress', onKey);
  });
}

module.exports = { select, confirm };
