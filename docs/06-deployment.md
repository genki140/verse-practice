# GitHub Pagesの公開・運用手順

2026-11-02に公式資料を確認。今回は外部リポジトリ作成・push・Pages設定・公開を実施していない。以下は後の実装/公開依頼向け。

## 選択理由と費用

GitHub Freeでは公開リポジトリでPagesを利用できる。独自ドメイン不要、静的HTML/JS配信だけで本アプリの要件を満たす。AWS/Cloudflareのアカウント・無料枠・既存Knocktellインフラを使用しない。非公開ソースが必要ならGitHubプランを再検討するが、本仕様の初期値は公開repo。

[GitHub Pagesの概要](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages) と [制限](https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits) を確認した。公開サイトは1GiBではなく公式記載の1GB上限、月100GBの帯域soft limit、公開処理10分のtimeoutがある。独自Actions workflowでは通常の時間当たり10ビルドの制限は適用されない。これは無制限/永久無料の保証ではない。少量の静的学習アプリとして無料に近い運用を目指し、実装時と運用拡大時には最新条件を再確認する。

## 必要なアカウントとユーザー側設定

1. GitHubアカウントを持ち、メール確認・必要な認証を行う。公開先ownerを決める。個人アカウントの初期値、repo名は`verse-practice`。
2. 公開リポジトリを作成する（既存repoがあるなら内容を確認して再利用）。個人バックアップ/認証情報はpushしない。公開コードと出典メタデータを誰でも読めることを理解する。
3. Settings → Actions → GeneralでGitHub Actionsと採用する公式actionsを許可。組織の場合は管理者の制限を確認。
4. Settings → Pages → Build and deployment → Sourceを **GitHub Actions** に設定する。
5. `github-pages` environmentのbranch制限/必須reviewerがあればmainからのdeployを許可。保護設定は無断解除しない。
6. 独自ドメイン/CNAMEは不要。利用可能ならEnforce HTTPSを有効にする。

通常は組み込みGITHUB_TOKEN/OIDCで足り、AWSキーや独自PATをworkflow secretsへ置かない。認証操作やアカウント所有者の設定が必要なら、画面と設定値だけを具体的にユーザーへ案内する。

## 実装するworkflowの契約

PRでは検証のみ、mainへのpushまたはworkflow_dispatchで検証→build→Pages artifact upload→deploy。デプロイはcheck成功した同じcommitのdistを使用する。失敗時は旧公開版を維持。PagesのURLはdeploy stepのpage_urlを表示する。

| 設定 | 指定 |
|---|---|
| runner | ubuntu-latest（必要なら検証済み版へ固定） |
| Node | package.json/ローカルと同じ検証済み対応LTS |
| install | lockfileを用いたnpm ci |
| check | content:validate、typecheck、lint、単体/結合、build、Playwright E2E |
| base | VITE_BASE_PATH=/verse-practice/ |
| build artifact | distのみ。仕様書/履歴/秘密情報/作業用ファイルを含めない |
| actions | checkout、setup-node、configure-pages、upload-pages-artifact、deploy-pages |
| 権限 | build/checkはcontents:read、deploy jobはpages:write/id-token:write |
| deployment environment | github-pages、urlはdeployment.outputs.page_url |
| 順序 | deploy needs build、単一pages concurrency group、進行中deployを不用意に取消しない |

actionsは実装時の現行公式版を確認し、完全commit SHAへ固定して版のコメントを付ける。NodeとActionsの古いサンプル番号をそのまま採用しない。forkのPRへ書込みtokenを渡さず、`pull_request_target`で未信頼コードを実行しない。外部サービスのAPIキーは一切不要。

[Vite公式Pages手順](https://vite.dev/guide/static-deploy#github-pages) はbase、SettingsのSourceとworkflow例を掲載。[GitHub独自workflowの公式手順](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages) はartifactと権限、environment、job依存関係の根拠。実装者はこれらから最新のaction参照を確認する。

## 初回公開の実行順序

1. ローカルで全受け入れ条件を検証し、コミット内容を確認。既存repoやremoteを上書きしない。未初期化ならこのプロジェクトだけをGit管理し、node_modules/dist/テスト一時物/個人backupをignoreする。
2. 公開の許可とGitHub認証がある依頼で、repo作成/remote設定/mainへのpushを行う。URLのowner/repoとbaseを一致させる。
3. workflow成功後、Pagesの実URL `https://<owner>.github.io/verse-practice/` を確認。ルートだけでなく `/#/quiz` 等のサブパス起動、manifest/SW/アイコンのHTTP状態とscopeを検証する。
4. スマホでURLを開く。Androidのインストール、iPhoneのホーム画面追加、初回準備完了後の機内モード起動を試す。
5. 版・URL・確認結果・残る実機確認を記録しユーザーへ報告。設定が不足していたら必要な設定だけを示し、公開済みとは言わない。

## 問題追加・更新・復旧

問題ファイルを編集→出典/曖昧さ/構造を検証→revision/contentVersion更新→レビュー→mainへ反映→同じworkflowで再公開。利用者には新SWの更新通知を出す。アプリのコードと問題は同一release単位。記事の自動収集や配信時のfetchはない。

問題の不備はactive:falseで修正版を公開し、旧履歴を保持する。アプリ不具合は互換性を確認して過去commitをrevertし再ビルドする。Pagesの停止だけで端末のoffline cacheが即消えるわけではない。端末の全履歴削除を通常の復旧手段にしない。GitHub ActionsとPagesの障害時は既存のオフライン版を使える範囲で継続。
