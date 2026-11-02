# Verse Practice

日本語・スマートフォン中心の聖句想起トレーニングPWA。6カテゴリー12問、四択、解説、達成率、端末内履歴、再開、JSONバックアップ、オフライン練習に対応します。個人学習用の非公式アプリです。このフォルダが独立したプロジェクトルートです。

## 利用・開発

- 公開先: https://genki140.github.io/verse-practice/
- ソース: https://github.com/genki140/verse-practice
- Node 24.22.1とnpmを使用。依存はlockfileに固定。

```sh
npm ci
npm run dev
```

本番相当の確認は `npm run check` → `npx playwright install chromium` → `npm run test:e2e`。`npm run preview` で `/verse-practice/` を開きます。CIではLinuxのChromiumで同じ検証を実行し、成功したmainのdistだけをPagesへ公開します。distや個人バックアップはGit管理しません。

最初にオンラインで設定画面の「オフラインで練習できます」を確認してください。iPhoneはSafariの共有メニュー→ホーム画面に追加、Androidはブラウザのインストールメニューで追加できます。原典リンクを開くには通信が必要です。履歴の移行はJSONを書き出して新しい端末で復元します。

検証の条件と未実施項目は `docs/verification.md`、実装時の判断は `docs/implementation-decisions.md` を参照してください。以下の仕様策定時の開始指示は履歴として残しています。実装・公開は今回の明示依頼に基づくものです。

## 次のエージェントが読む順序

1. `AGENTS.md` — 作業範囲と仕様の優先順。
2. `docs/01-product-and-ux.md` — 目的、画面、操作、確定した推奨初期値。
3. `docs/02-data-and-learning.md` — 問題・履歴・バックアップ・改版の契約。
4. `data/seed.json` と `docs/03-content-and-sources.md` — 初期12問、一次資料、編集規則。
5. `docs/04-architecture-and-pwa.md` — 技術構成、オフライン、更新。
6. `docs/05-implementation-and-acceptance.md` — 実装順序と完了条件。
7. `docs/06-deployment.md` — GitHub Pages公開手順。
8. `docs/07-reference-audit.md` — Knocktellで確認した事実と採用案の区別。

## そのまま渡せる実装開始指示

> このフォルダをルートとして、AGENTS.md と README.md の読み順に従い、Verse Practice を仕様通り全部実装してください。seed.json の12問を初期データとして使い、画面、IndexedDB永続化、再開、JSONバックアップ、PWA、オフライン、更新通知、GitHub Pagesサブパス、検証、CI/CDまで完成させてください。未指定事項は文書に明示された推奨初期値を採用してください。参考リポジトリ Knocktell は変更しないでください。アプリとローカル検証を完了してから、公開手順に沿って外部アカウントで必要な設定を具体化してください。リポジトリ作成・push・公開は、その実装依頼で与えられた権限の範囲内で実施し、権限がない操作だけを残作業として示してください。今回の仕様書作成依頼自体は外部公開を許可していません。

## 合意の扱い

ユーザー指定を要件とし、質問せずに補った選択を「推奨初期値」として本文に記載しています。これらは実装時に追加質問なく採用できます。特に初期問題数は6カテゴリー各2問の計12問です。「すべて」では10問、個別カテゴリーでは2問です。10問未満の水増し出題はしません。各カテゴリー10問以上への増補は別のコンテンツ拡張であり、初期実装の完了条件ではありません。

## 成果物の性質

問題文・解説は独自の短い要約、選択肢は聖句参照です。公式記事や聖書本文・画像・ロゴを複製しません。教義の原典は各問題が指す公式記事です。出典の内容対応は確認しましたが、公開利用の法的許可を取得したという意味ではありません。公式記事はアプリ外で開き、オフライン配信の対象にしません。
