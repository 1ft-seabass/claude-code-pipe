---
tags: [architecture, design-decision, javascript, typescript, simplicity]
---

# JavaScript のまま維持する設計判断 - 開発記録

> **⚠️ 機密情報保護ルール**
>
> このノートに記載する情報について:
> - API キー・パスワード・トークンは必ずプレースホルダー(`YOUR_API_KEY`等)で記載
> - 実際の機密情報は絶対に含めない
> - .env や設定ファイルの内容をそのまま転記しない

**作成日**: 2026-03-01
**関連タスク**: プロジェクトの技術選定とアーキテクチャ決定

## 問題

Node.js プロジェクトにおいて、TypeScript を採用するかどうかは重要な判断ポイント。

**TypeScript のメリット**:
- 型安全性
- エディタの補完機能
- 大規模プロジェクトでの保守性向上
- コンパイル時のエラー検出

**TypeScript のデメリット**:
- ビルドステップの追加
- 配布時の複雑化
- 学習コストの増加
- 小規模プロジェクトではオーバーヘッド

## 検討したプロジェクトの特性

### プロジェクト規模

```
src/
├── index.js         (エントリポイント、150行程度)
├── watcher.js       (JSONL監視、150行程度)
├── parser.js        (JSONL解析、60行程度)
├── subscribers.js   (Webhook配信、260行程度)
├── sender.js        (プロセス管理、330行程度)
├── canceller.js     (キャンセル処理、50行程度)
├── api.js           (REST API、50行程度)
└── websocket.js     (WebSocket、50行程度)
```

**合計**: 約1100行、8ファイル

### プロジェクトの目的

- Claude Code の JSONL 出力を監視
- Webhook で外部サービスに配信
- API 経由でセッション管理
- **シンプルなパイプツール**

### 想定ユーザー

1. **利用者**: Claude Code を外部サービスと連携させたい人
   - Node.js の基本知識があれば使える
   - `npm install && npm start` で動けばOK

2. **開発参加者**: 機能追加やカスタマイズしたい人
   - JavaScript が読めれば改造できる
   - 型定義の理解は不要

### 技術的な複雑性

**型の恩恵が少ない部分**:
- イベント駆動（EventEmitter）
- 単純なオブジェクトの受け渡し
- JSONL のパース（動的な構造）

**型の恩恵がある部分**:
- config.json の構造検証
- Webhook ペイロードの型定義

→ **JSDoc でカバー可能**

## 採用した判断

### JavaScript のまま維持する

**理由**:

#### 1. 配布の簡素化

```bash
# JavaScript: そのまま動く
git clone https://github.com/xxx/claude-code-pipe.git
cd claude-code-pipe
npm install
npm start
```

```bash
# TypeScript: ビルドステップが必要
git clone https://github.com/xxx/claude-code-pipe.git
cd claude-code-pipe
npm install
npm run build  # ← ビルドステップが増える
npm start
```

**影響**:
- 利用者がすぐに動かせる
- トラブルシューティングが簡単（ソースコードがそのまま実行される）
- CI/CD が不要（ビルド済みファイルをコミットする必要がない）

#### 2. 開発者の参入障壁を下げる

```javascript
// JavaScript: 誰でも読める
function parseLine(jsonString) {
  const data = JSON.parse(jsonString);
  return {
    sessionId: data.sessionId || null,
    timestamp: data.timestamp || null
  };
}
```

```typescript
// TypeScript: 型定義の理解が必要
interface JSONLData {
  sessionId?: string;
  timestamp?: string;
  message?: {
    role: 'user' | 'assistant';
    content: Array<ContentBlock>;
  };
}

function parseLine(jsonString: string): ParsedEvent | null {
  const data: JSONLData = JSON.parse(jsonString);
  return {
    sessionId: data.sessionId ?? null,
    timestamp: data.timestamp ?? null
  };
}
```

**影響**:
- JavaScript 初心者でも改造しやすい
- 型パズルに悩まされない
- コミュニティの貢献ハードルが低い

#### 3. プロジェクトの性質に合致

**小規模プロジェクト**:
- 8ファイル、1100行程度
- ファイル間の依存関係が明確
- 複雑な型システムが不要

**明確な責務**:
- watcher: ファイル監視
- parser: JSONL解析
- subscribers: Webhook配信
- sender: プロセス管理

→ **型による安全性よりも、シンプルさが重要**

#### 4. 保守性の確保

**JSDoc で型情報を提供**:

```javascript
/**
 * JSONL の1行をパースしてイベントオブジェクトに変換
 * @param {string} jsonString - JSONL の1行（JSON文字列）
 * @returns {object|null} イベントオブジェクト or null（パース失敗時）
 */
function parseLine(jsonString) {
  // ...
}
```

**明示的な引数チェック**:

```javascript
function setupSubscribers(subscribers, watcher, processEvents) {
  if (!subscribers || subscribers.length === 0) {
    console.log('[subscribers] No subscribers configured');
    return;
  }
  // ...
}
```

**エラーハンドリング**:

```javascript
try {
  const data = JSON.parse(jsonString);
  // ...
} catch (error) {
  console.error('[parser] Failed to parse JSONL line:', error.message);
  return null;
}
```

→ **実行時の安全性は確保できる**

## TypeScript が必要になるケース

このプロジェクトには当てはまらないが、以下の場合は TypeScript を検討すべき：

### 1. 大規模プロジェクト

- 数十ファイル以上
- 複数のモジュール間で複雑な依存関係
- チーム開発（10人以上）

### 2. 複雑な型システム

- ジェネリック型を多用
- 高度な型推論が必要
- 外部ライブラリの型定義が重要

### 3. 型による安全性が必須

- 金融系アプリケーション
- 医療系アプリケーション
- ミッションクリティカルなシステム

### 4. エディタの補完を重視

- 型定義による自動補完が生産性に直結
- API 設計が頻繁に変わる
- 複雑なオブジェクト構造

## 代替案との比較

| 項目 | JavaScript | TypeScript | JSDoc + JavaScript |
|------|-----------|-----------|-------------------|
| **配布の簡素さ** | ✅ 最高 | ❌ ビルド必要 | ✅ 最高 |
| **開発者の参入障壁** | ✅ 低い | ⚠️ 中程度 | ✅ 低い |
| **型安全性** | ❌ なし | ✅ 最高 | ⚠️ 部分的 |
| **エディタ補完** | ⚠️ 部分的 | ✅ 最高 | ✅ 良好 |
| **保守性** | ⚠️ テスト必要 | ✅ コンパイル時検出 | ⚠️ テスト必要 |
| **学習コスト** | ✅ 低い | ⚠️ 中程度 | ✅ 低い |

**このプロジェクトの選択**: JavaScript（JSDocで補完）

## 学び

### 1. 技術選定の基準

技術選定は「最新」「人気」ではなく、**プロジェクトの目的と規模に合わせる**べき。

- 小規模 + シンプル → JavaScript で十分
- 大規模 + 複雑 → TypeScript を検討
- 配布重視 → ビルドステップを避ける

### 2. シンプルさの価値

「かっこつける」ことよりも「使いやすさ」を優先する：

- ✅ 利用者がすぐに動かせる
- ✅ 開発者がすぐに改造できる
- ✅ トラブルシューティングが簡単
- ✅ ドキュメントが少なくて済む

### 3. 型安全性の代替手段

TypeScript を使わなくても、型安全性は確保できる：

- **JSDoc**: 型情報を提供
- **引数チェック**: 実行時検証
- **エラーハンドリング**: try-catch で安全に
- **テスト**: ユニットテストで動作保証

### 4. 後から TypeScript 化も可能

JavaScript で開始しても、必要になれば TypeScript に移行できる：

1. `.ts` ファイルに段階的に移行
2. JSDoc の型情報を TypeScript 型定義に変換
3. `tsconfig.json` で `allowJs: true` にして共存

→ **今すぐ TypeScript にする必要はない**

## 今後の方針

### 維持するもの

- ✅ JavaScript のまま
- ✅ JSDoc で型情報を提供
- ✅ 明示的な引数チェック
- ✅ エラーハンドリング

### 追加を検討

- ⬜ ユニットテスト（Jest など）
- ⬜ ESLint でコード品質チェック
- ⬜ 自動フォーマット（Prettier など）

### TypeScript 化の判断基準

以下のいずれかに該当したら再検討：

1. プロジェクトが **10ファイル以上、3000行以上** になった
2. **チーム開発**（3人以上）になった
3. 外部ライブラリとの**複雑な型連携**が必要になった
4. **型エラーが頻発**して開発効率が下がった

## 関連ドキュメント

- [リポジトリ分離テスト戦略](./2026-02-28-09-45-00-repository-separation-testing-strategy.md)
- [claude-code-pipe 初期実装](./2026-02-23-09-30-00-claude-code-pipe-initial-implementation.md)

---

**最終更新**: 2026-03-01
**作成者**: Claude Code (AI)
