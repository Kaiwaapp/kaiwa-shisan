# 会話資産（試作版）

誰に何を話したかを記録して、「Aさんに話した内容をBさんにも話す」ために見返すためのWebアプリ（PWA）。

- 記録1件 = 自由記述テキスト + 話した相手（複数）+ 話題タグ + 話した日 + フォルダ
- 記録・人・話題の並べ替え（最後に話した順・最初に話した順・回数順など）
- 人・話題の統合（別名で登録してしまったものを1つに）
- 人タブ：その人に話したこと（話題で絞り込み・検索）
- 話題タブ：その話題の記録と、話した相手
- データは端末内（IndexedDB）。設定からJSONでバックアップの書き出し・読み込み
- iPhoneのSafariで「ホーム画面に追加」するとアプリのように使える

## 構成

| 場所 | 役割 | 将来ネイティブ化(Expo)するとき |
| --- | --- | --- |
| `src/core/types.ts` | データモデル | そのまま使う |
| `src/core/store.ts` | 状態と操作（React非依存） | そのまま使う |
| `src/core/search.ts` / `backup.ts` | 検索・バックアップ形式 | そのまま使う |
| `src/core/repository.ts` | 保存先のインターフェース | SQLite実装を追加して差し替え |
| `src/core/idbRepository.ts` | IndexedDB実装（Web用） | Web版で継続利用 |
| `src/ui/` | 画面（React DOM） | React Nativeで作り直す |

話題タグは `{ topicId, source: 'manual' | 'ai' }` の形で持っているので、AI自動タグ付け（課金機能）は `source: 'ai'` で足せる。

## 開発

```sh
npm install
npm run dev     # 開発サーバー
npm test        # テスト
npm run build   # 本番ビルド（BASE_PATH=/リポジトリ名/ でGitHub Pages用）
```

`main` にpushすると GitHub Actions で GitHub Pages に自動デプロイされる。
