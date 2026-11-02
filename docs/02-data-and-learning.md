# データ・学習率・保存契約

## 静的問題データ

`data/seed.json` は実装可能な初期データであり、ダミーではない。実装時に `src/content/catalog.json` 等へ移してimportし、ビルドに含める。形式はUTF-8 JSON。HTMLやMarkdownを解釈せず文字列として表示する。全データを単一ビルドへ含め、問題だけをネットから更新しない。

```ts
type Catalog = {
  schemaVersion: 1; contentVersion: string; // ISO日付+連番 2026-11-02.1
  locale: 'ja'; categories: { id: string; name: string; order: number }[];
  sources: { id: string; title: string; url: string; checkedAt: string }[];
  questions: Question[];
};
type Question = {
  id: string; revision: number; active: boolean; categoryId: string;
  situation: string; prompt: string;
  options: { id: string; reference: string }[]; // 必ず4つ、idはa/b/c/d
  correctOptionId: string;
  explanation: string; // 独自要約。原典の引用ではない
  sourceId: string; sourceLocator: string; // 見出し+箇条書き等
  evidenceReference: string; // 正答のreferenceと一致
  distractorRationale: Record<string, string>; // 誤答3つの編集者向け根拠
};
```

source.urlは `https://www.jw.org/ja/` 以下の通常ページのみ。sourceLocatorは見出しと論点で特定し、変更しやすいページ行番号・テキストフラグメントに依存しない。正答が複数節のまとまりなら1選択肢として扱う。聖書の書名表記はUIで「格言」に統一（古い記事の「箴言」と同じ書であることは編集ルールで扱う）。聖句本文フィールドは設けない。

## ビルド時検証（不合格なら公開停止）

- schemaVersion/locale/必須文字列/ISO日付/改版正整数、余分なフィールド拒否。contentVersionは前回から変更。
- 全IDは小文字英数字とハイフン、同じコレクション内重複なし。categoryId/sourceIdは実在。
- 選択肢は4件、ID一意、correctOptionIdがちょうど1件、参照ラベルは前後空白除去・全角数字を半角化しても重複なし。同じ書・章で範囲が重なる選択肢を禁止（例5:28と5:28-29）。
- evidenceReferenceと正答reference一致。誤答理由のキーは誤答ID3件に過不足なし。
- 文字数上限: situation 160、prompt 240、reference 60、explanation 300、locator 160、誤答理由各160。日本語はUnicodeコードポイント単位。
- URLはHTTPS・指定ホスト・日本語パス内。javascript等を拒否。リンク切れ・内容対応・複数正解は機械検査と別に人/実装者が原典を開いて検証する。毎CIで原典にアクセスする必要なし。
- 有効問題全件を同梱。空カテゴリーは許可しUIで準備中。初期リリースはseed12問・6カテゴリー・各2問が必要。

## セッション抽選

選択カテゴリー（すべてなら全件）のactive問題を対象。現行 `(id, revision)` の回答がゼロの問題を優先度0、直近回答が誤答なら1、それ以外なら2。同じ優先度内をFisher–Yatesでシャッフルして先頭min(10,N)問を採る。暗号学的強度は不要。テストでは乱数源を注入する。選択肢も各問1回シャッフルして保存する。

開始時に問題全文・正答・出典を含むsnapshotと順序をDBへ保存し、保存成功後に開始。再読み込み・新ビルドでもsnapshotで最後まで同じ問題を出す。改版された問題に回答してもその旧版の回答としてのみ蓄積する。

## IndexedDB（推奨: idbラッパー）

DB名 `verse-practice`、初期DBバージョン1。ブラウザのDBは同一originで共有されるため、他のPagesアプリと名前を衝突させない。同じoriginにこのアプリを複数置く用途はMVP対象外。ホスト変更ではデータは移らないためバックアップで移す。

| Store / key | 値 |
|---|---|
| meta / `app` | schemaVersion:1, appId:'verse-practice', createdAt, settings（初期カテゴリー等） |
| sessions / sessionId | UUID, categoryIdまたは'all', contentVersion, startedAt, completedAt/null, status:'active'/'completed'/'abandoned', cursor, questionSnapshots[], optionOrders[] |
| attempts / attemptId | `${sessionId}:${questionIndex}`、sessionId、questionIndex、questionId、revision、selectedOptionId、correct（snapshotから算出）、answeredAt |

日時はUTC ISO8601、表示は端末ローカル。cursorは0基準で現在表示する問、完了時N。questionSnapshotsは抽選順で固定。結果はattemptsとsnapshotから計算し、別集計カウンターを正本にしない。activeは全DBで高々1件。

回答トランザクションはattemptsへの追加とsession更新を同時に行う。既存attemptIdがあれば最初の回答を返して上書きしない。最後の回答ならstatus/completedAt/cursor=Nも同トランザクションで設定。途中問ではcursorを動かさず、回答済み解説画面を復元する。「次へ」でcursor+1を保存。途中離脱したセッションの既回答も学習履歴に算入する。

複数タブはDBトランザクションでactiveの競合を検知し、既存セッション再開へ誘導。回答/次への更新は期待するcursor/statusを比較し、他タブが進めていたら最新状態を再読込。BroadcastChannelで更新通知し、未対応時はvisibilitychangeで再取得する。設定の復元・削除中も競合を防ぎ、他タブを再読み込みさせる。

## 学習指標の定義

対象集合Cは現在配信されるactive問題の `(id,revision)`。現在のカテゴリー所属で絞る。総合は各問題1回ずつ数える。

- **達成率** = 現行版の直近2回答がいずれも正解である問題数 / |C| ×100。異なるセッションでなくても構わないが、同一セッションの同一問は1回答だけ。後で誤答すると未習得へ戻る。1正解だけは習得前。
- **回答済み率** = 現行版を1回以上回答した問題数 / |C| ×100。
- **累計正答率（現行版）** = Cに属する正解回答数 / Cに属する全回答数 ×100。途中セッションも含む。
- **セッション正答率** = そのセッションの正解数/N×100。完了セッションのみ表示。旧版でも結果は当時のsnapshotによる。

割合は表示時だけ四捨五入し整数%、内部は分数。分母0は「—」とし、達成済みにしない。最新判定の順序はansweredAt昇順、同一時刻ならattemptId辞書順（バックアップから復元しても決定的）。端末時計変更の影響は仕様上許容する。

例: 現行12問中3問が2連続正解なら25%。q1が正解→正解→誤答となればq1は習得済み数から外れる。10/10正解でも初回練習だけでは達成率100%にならない。画面に「同じ問題に2回続けて正解すると習得済み」と説明する。

## 問題改版

誤字・同意の表記修正・出典URL修正だけならrevision維持。論点/正答/候補聖句/解説の意味が変わればrevision+1。意味が別の問題になったら新ID。削除はactive:falseとしIDを再利用しない。追加・改版時はcontentVersion更新。初期releaseは全問revision:1。

旧回答は消さず当時の結果を保持し、現行達成率から外す。新問追加や改版で達成率が下がり得ることを更新案内で説明。カテゴリー移動のみはrevision維持し、カテゴリー別率は現在の所属で再集計。進行中snapshotの改変は禁止。

## バックアップ

ファイル名 `verse-practice-backup-YYYYMMDD-HHmmss.json`（端末現地時刻）。JSON envelopeは `{appId:'verse-practice', backupVersion:1, exportedAt, dbVersion:1, meta, sessions:[], attempts:[]}`。問題snapshotを含む全履歴と進行中セッションをトランザクションで一貫して読んで出力する。ブラウザの保存操作を使用。暗号化なし、ファイルはユーザーが保管する。アプリキャッシュや公式記事は含めない。

読み込みは最大10MiB、最大10,000セッション/100,000回答（いずれか超過で拒否）。JSON構文だけでなく全型・長さ・状態・ID参照・日時・cursor範囲・選択肢の一意性・回答とsnapshotの整合・完了条件・active高々1件を検証する。correctはsnapshotから再計算し矛盾データは拒否。未来のbackupVersion/dbVersionは拒否。未知の問題ID/旧revisionはsnapshotが正しければ履歴として保持し、現行率に算入しない。URLは前記許可リストを検証。HTMLは実行しない。

検証完了後「Nセッション・M回答・保存日時。現在の履歴をこのバックアップで置き換えます」を表示し明示確認。**MVPは置換のみ、マージなし**。取消は無変更。確認後に全storeを1トランザクションで置換し、失敗なら元DBを保つ。読み込み中はクイズ操作を禁止。復元後に率を再計算し、進行中があれば再開可能。書き出しサイズが10MiBを超える場合も失敗させず出力は許可するが、読込上限を超える旨を表示する。通常運用で上限に近づいたら次版で上限/アーカイブ方針を見直し、自動削除はしない。

全削除は確認後に履歴/設定をトランザクションで初期化。Service Workerやアプリそのものをアンインストールする操作ではない。DBマイグレーションはバージョン順でテストし、失敗時に自動全消去しない。
