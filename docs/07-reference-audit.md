# Knocktell参考調査の記録

対象: `C:\Users\genki\Documents\Knocktell`（登録名Knocktell）。2026-11-02に読み取り専用で確認。ファイル変更、依存導入、Nodeコマンド、dev server、ビルド、テスト、Git操作は実施していない。確認は静的ファイル読取りであり、実際のスマホ/PWA動作を検証したという意味ではない。

## 確認できた事実

| 確認元 | 読んで確認した内容 |
|---|---|
| AGENTS.md | CLAUDE.md、PREFERENCES.md、docs/INDEX.mdを入口にする。ホストWindowsでNode関連実行をせずコンテナ利用、Issue駆動、モバイルの実画面検証等を要求 |
| CLAUDE.md、PREFERENCES.md、docs/INDEX.md | ルート規約とドキュメント入口の該当箇所を読んだ。サーバー/認証/共有データを扱う業務アプリの規約であることを確認。全リンク先や全規約を監査したわけではない |
| package.json | 表示version 1.28.1。React ^19.1.0、TypeScript ^5.8.3、Vite 8.1.6、MUI ^9.0.1、Emotion、React Router、Vitest、Playwright、fake-indexeddb等の依存宣言 |
| vite.config.ts | React/Vite構成、alias、SPA build設定、開発サーバーとproxy等。独自の公開資産生成やインフラ依存処理も含む |
| public/manifest.webmanifest | name/short_name Knocktell、display standalone、start_url/scopeはルート `/`、192/512アイコン |
| public/sw.js | コメント/冒頭コードでViteのハッシュ付きassetsに限定する静的キャッシュ、shell HTML/API/外部地図はキャッシュしない方針。skipWaiting/claimによる即時更新の設計 |
| src/components/AppDialog.tsx | MUI useMediaQueryで狭幅を判定し、スマホ用sheetとdesktop dialogに切替える実装 |
| src/components/AppShell.tsx、index.html | safe-area/dvh/下部ナビの余白調整がある。viewport-fit=coverとuser-scalable=noの指定がある |

依存の数字はpackage.jsonで宣言された値であり、lockfile解決済み版/実行時互換性を保証しない。SW登録箇所・全キャッシュ動作の追跡や実機監査まではしていない。

## Verse Practiceへの採用判断

- 採用: React/TypeScript/Vite/MUIというフロントエンドの組合せ、レスポンシブ、safe-area、UIとロジック分離、単体＋実画面検証という考え方。
- 新規設計: 全画面と問題のprecache、prompt更新、IndexedDB個人履歴、JSON backup、Pagesサブパス。KnocktellのSWをそのまま使うと本仕様の完全なオフライン起動を満たさない。
- 独立して決定: packageの現行互換版、単純なhash routing、通常フロー中心のスマホレイアウト。ズームは許可する。Knocktellのuser-scalable=noを継承しない。
- 持ち込まない: AWS/Cloudflare、Cognito、DynamoDB、地図、マルチテナント、同期、業務ID規約、大規模gate、参照repo固有のbranch/Issue運用。これらは本アプリの実行要件ではない。

このフォルダはKnocktellの配下ではないため、参照repoの規約を新プロジェクトに丸ごと移植しない。新しい実装環境はこのプロジェクト内に整備し、参照repoのread-only状態を保つ。
