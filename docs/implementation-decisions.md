# 実装時の判断（2026-11-02）

- ユーザーの実装・公開依頼を受け、仕様のみだった段階からアプリ実装へ移行。既存01/02/04のデータ・画面契約を優先した。
- 指定のGitHub Actions → GitHub Pagesを採用。SitesのCloudflareホスティングは使わない。Knocktellには変更を加えない。
- Node 24.22.1、React/TypeScript/Vite/MUI/idb/vite-plugin-pwaを使用し、実際に導入した互換版をpackage.jsonとlockfileへ固定。ブラウザ用のサーバー/API/解析なし。
- ルーティングは小さなhash router。UIはReact、純粋ロジックはdomain、保存とバックアップはstorage、SW/インストールはpwaに分離。
- 既存seedの問題文・正答・revision・contentVersionは変更しない。記事6件を再読し、12問の指定論点と参照の対応を確認。記事・聖句本文・画像は配信しない。
- SWはprompt更新、skipWaitingはユーザー操作後だけ。clientsClaimは初回インストール後から制御を確立するため有効。更新による再読み込みは各タブの保存処理終了を待つ。「あとで」はその画面で通知を隠し、画面移動後に再表示。
- IndexedDB更新は全storeを含む直列readwrite transactionでactiveの競合を検出。回答・cursor・完了を原子的に保存。開始・回答・次へは保存完了後に画面を進める。
- ローカルホスト通信は実行環境のサンドボックス外で検証。最初の4173番ポートは応答しなかったため、検証用4180番を採用した。配信パスは一貫して/verse-practice/。
- 初期の小規模データ向けに全履歴を一貫して取得する実装。履歴が大きくなった場合の索引・ページ単位取得は今後の最適化対象。履歴を自動削除しない。
