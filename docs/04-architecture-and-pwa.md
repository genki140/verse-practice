# 技術構成とPWA

## 採用する構成（推奨初期値）

React、TypeScript strict、Vite、Material UI + Emotion、idb、vite-plugin-pwa（Workbox generateSW、prompt更新）、Vitest + Testing Library + fake-indexeddb、Playwright。React RouterのHashRouter、または同じURL契約の小さなhash router。外部フォント/CDNを使わずシステム日本語フォント。依存バージョンは実装時の相互互換性とNode要件を公式資料で確認して固定しpackage-lock.jsonを追跡する。Knocktellのバージョン番号や巨大な依存集合をコピーする指示ではない。

推奨ソース境界:

```text
src/app/             ルート、テーマ、エラー境界
src/features/        home, quiz, results, history, settings
src/domain/          型、抽選、採点、指標、入力検証（UI/DB非依存）
src/storage/         IndexedDB、transaction、migration、backup
src/content/         カタログ（静的import）
src/pwa/             登録、更新通知、オフライン準備状態
public/              自作アイコン、manifest用資産
tests/               単体・結合・E2E
.github/workflows/   check、deploy（実装時に作成）
```

画面から直接DBスキーマやSWを操作せず、sessionRepository等の小さなインターフェースに依存させる。非同期処理はpending/error/successを明示。採点はsnapshotのcorrectOptionIdだけで決める。

## サブパスとルーティング

標準公開URL `https://<owner>.github.io/verse-practice/`。Vite `base:'/verse-practice/'`、ビルド環境変数 `VITE_BASE_PATH` があれば同形式の先頭末尾スラッシュ付き値を使用。ローカルも本番相当サブパスのpreview検証を行う。ルーティングはhashなのでサーバーのSPAリライトや独自404.htmlに依存しない。

資産・manifest・SW登録はBASE_URLから構築し、`/assets` 等のoriginルート固定参照は禁止。manifestはビルド時にbaseを反映し、`id`/`start_url`/`scope`を `/verse-practice/` とする。SWはその配下に置き、同じscopeで登録。他のPagesプロジェクトを制御しない。ルートサイトやrepo名を変更したらbase一式とmanifest idの影響を確認し、既存端末データ移行にはバックアップを使う。

## インストール

manifest: name/short_name `Verse Practice`、lang ja、display standalone、theme/backgroundはライト背景に合う色、自作192/512 PNGとmaskable512、apple-touch-icon180、orientation制限なし。アイコンは自作の単純な図形を使い、JW.orgの意匠を複製しない。

HTTPSで配信。Android Chromeでは利用可能な場合beforeinstallpromptを保持し「インストール」ボタンからユーザー操作で起動。イベント未発火をエラー扱いしない。iPhone/iPad Safariは共有メニュー→ホーム画面に追加を文章で案内する。すでにstandaloneなら完了表示。通常ブラウザでも全機能を使える。実機のOS/ブラウザ版と検証日を記録し、すべてのブラウザに自動ボタンがあるとは説明しない。

## オフライン

全カタログと画面、JS/CSS、アイコン、必要なローカル資産を同一buildのprecacheへ含める。動的importを使うなら全チャンクも対象にする。外部公式ページは対象外。shellへのnavigation fallbackは自アプリscope内限定。

SWのprecache完了通知を受けて「オフラインで練習できます」と表示する。登録しただけで準備完了と表示しない。初回取得が失敗したらオンラインで再試行を案内し、準備完了を偽らない。初回一度もアクセスしていない端末ではオフライン起動不可。通信がなくても開始/回答/解説/結果/履歴/バックアップが使える。原典リンクには「公式記事を読む（通信が必要）」と明記。外部URLの到達性をアプリから常時検査しない。

## 更新

vite-plugin-pwaのprompt方式を使用し、新SWを自動skipWaitingさせない。起動時およびオンライン復帰時・アプリへ戻った時に更新チェック（最短1時間の間隔で抑制）。失敗しても旧版で継続。新バージョン検出時は「更新があります。学習内容を保存して更新できます」。

進行中は「あとで」または「中断して更新」。更新を選んだら保存完了を待ち、待機SWを有効化してcontrollerchangeで一度だけreload。保存失敗なら更新を実行しない。復帰時は保存snapshotで再開。複数タブにも更新を通知し、snapshotで旧版の途中学習を安全に再開する。自動更新で回答画面を突然消さない。

新SWのprecacheに必要資産が1件でも取得できなければinstall失敗として旧SWを維持する。新コードと旧問題ファイルが混ざらないよう、カタログはハッシュ付きバンドルに含める。古いprecacheの掃除はWorkbox管理範囲内だけで行い、IndexedDBや他アプリのcacheを削除しない。ロールバックも過去成果物を再ビルド/配信して通常の更新経路で行う。DBはダウングレードしないので、破壊的migration後のコードrollbackは互換性確認必須。

## プライバシーと耐久性

履歴・回答は端末内のみ。解析、広告、エラー送信、外部フォント、APIなし。GitHub Pagesへの通常の配信アクセスや原典リンクを開いた先の通信まで消せるという説明はしない。バックアップはローカルファイルとしてユーザーが保存する。

IndexedDBは永久保証ではない。設定で `navigator.storage.persist()` を利用可能な時に要求できるが、許可拒否でも動作し「永久保存」と呼ばない。容量不足/利用禁止を捕捉する。iOSのブラウザ利用とホーム画面アプリのデータ共有を前提にせず、移行は書き出し/読み込みで案内。SWキャッシュ消去と学習DB消去を混同しない。

## 確認した技術資料

- [Vite: GitHub Pagesへの静的デプロイ](https://vite.dev/guide/static-deploy#github-pages): baseとActions配信。
- [Vite PWA: prompt更新](https://vite-pwa-org.netlify.app/guide/prompt-for-update): 手動更新方式。
- [MDN: PWAインストール](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Installing): ブラウザ別導線。
- [MDN: storage quotaとeviction](https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria): 端末保存の制約。

2026-11-02参照。ライブラリの具体的API/互換バージョンは実装時に再確認する。
