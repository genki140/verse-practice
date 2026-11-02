import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  ThemeProvider,
  createTheme,
  CssBaseline,
  Button,
  LinearProgress,
  Alert,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
} from "@mui/material";
import {
  catalog,
  metrics,
  type State,
  type Session,
  type Attempt,
} from "./domain/model";
import { repository, activeSession } from "./storage/repository";
import { exportBackup, readBackup } from "./storage/backup";
import { usePwa } from "./pwa/usePwa";
import "./style.css";
const theme = createTheme({
  palette: {
    primary: { main: "#255b56" },
    background: { default: "#f7f8f4", paper: "#ffffff" },
  },
  typography: {
    fontFamily:
      '-apple-system,BlinkMacSystemFont,"Segoe UI","Noto Sans JP",sans-serif',
    fontSize: 16,
    button: { textTransform: "none", fontWeight: 700 },
  },
  shape: { borderRadius: 14 },
  components: { MuiButton: { styleOverrides: { root: { minHeight: 48 } } } },
});
const go = (path: string) => {
  location.hash = path;
  window.scrollTo(0, 0);
};
const name = (id: string) =>
  id === "all"
    ? "すべて"
    : catalog.categories.find((c) => c.id === id)?.name || "以前のカテゴリー";
const pct = (x: number | null) => (x === null ? "—" : `${x}%`);
function App() {
  const [state, setState] = useState<State>();
  const [route, setRoute] = useState(location.hash.slice(1) || "/");
  const [category, setCategory] = useState("all");
  const [error, setError] = useState("");
  const [initFailed, setInitFailed] = useState(false);
  const [memory, setMemory] = useState(false);
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const [limit, setLimit] = useState(20);
  const [backup, setBackup] = useState<State & { exportedAt?: string }>();
  const [confirm, setConfirm] = useState<"start" | "clear" | null>(null);
  const [message, setMessage] = useState("");
  const [retry, setRetry] = useState<Attempt["selectedOptionId"]>();
  const feedback = useRef<HTMLHeadingElement>(null);
  const pwa = usePwa(() => lock.current);
  const [dismissUpdate, setDismissUpdate] = useState(false);
  const channel = useRef<BroadcastChannel | null>(null);
  const refresh = async () => {
    setState(await repository.read());
  };
  useEffect(() => {
    void repository
      .open()
      .then(setState)
      .catch(() => {
        setInitFailed(true);
        setError(
          "履歴を保存できません。ブラウザの保存設定を確認してください。",
        );
      });
    const hash = () => {
      setRoute(location.hash.slice(1) || "/");
      setDismissUpdate(false);
    };
    window.addEventListener("hashchange", hash);
    return () => window.removeEventListener("hashchange", hash);
  }, []);
  useEffect(() => {
    const sync = () => {
      if (!lock.current)
        void refresh().catch(() => setError("履歴の再読み込みに失敗しました"));
    };
    if (!memory && state) {
      if ("BroadcastChannel" in window) {
        const c = new BroadcastChannel("verse-practice");
        channel.current = c;
        c.onmessage = sync;
      }
      document.addEventListener("visibilitychange", sync);
    }
    return () => {
      channel.current?.close();
      channel.current = null;
      document.removeEventListener("visibilitychange", sync);
    };
  }, [memory, !!state]);
  const run = async (fn: () => Promise<void>) => {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      await fn();
      await refresh();
      channel.current?.postMessage("changed");
    } catch (e) {
      setError(e instanceof Error ? e.message : "保存に失敗しました");
      await refresh().catch(() => {});
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };
  const active = state ? activeSession(state) : undefined;
  const latest = state?.sessions.toSorted((a, b) =>
    b.startedAt.localeCompare(a.startedAt),
  )[0];
  const session = route.startsWith("/result/")
    ? state?.sessions.find((s) => s.sessionId === route.split("/")[2])
    : active || (latest?.status === "completed" ? latest : undefined);
  const index = session
    ? Math.min(session.cursor, session.questionSnapshots.length - 1)
    : 0;
  const attempt = state?.attempts.find(
    (a) => a.attemptId === `${session?.sessionId}:${index}`,
  );
  useEffect(() => {
    if (attempt && route === "/quiz") feedback.current?.focus();
  }, [attempt?.attemptId, route]);
  const start = () =>
    void run(async () => {
      await repository.start(category, active?.sessionId);
      setConfirm(null);
      setRetry(undefined);
      go("/quiz");
    });
  const answer = (option: Attempt["selectedOptionId"]) => {
    setRetry(option);
    void run(async () => {
      await repository.answer(session!.sessionId, index, option);
      setRetry(undefined);
    });
  };
  const m = metrics(state?.attempts || []);
  const feedbackBlock = (s: Session, i: number) => {
    const { question: q, source } = s.questionSnapshots[i];
    const a = state!.attempts.find(
      (x) => x.attemptId === `${s.sessionId}:${i}`,
    );
    return (
      <div className="explanation">
        <p>
          <strong>正答：{q.evidenceReference}</strong>
        </p>
        {a && (
          <p>
            自分の回答：
            {q.options.find((o) => o.id === a.selectedOptionId)?.reference}
          </p>
        )}
        <p>{q.explanation}</p>
        <p className="small">
          {source.title}
          <br />
          {q.sourceLocator}
        </p>
        <a href={source.url} target="_blank" rel="noopener noreferrer">
          公式記事を読む ↗ <span className="small">（通信が必要）</span>
        </a>
      </div>
    );
  };
  return (
    <>
      <header>
        <a className="brand" href="#/" aria-label="Verse Practice ホーム">
          <span className="mark">
            V<span>·</span>
          </span>
          Verse Practice
        </a>
        <span className="header-note">聖句を思い出す練習</span>
      </header>
      <main>
        {memory && (
          <Alert severity="warning">
            保存せず試しています。再読み込みで履歴が消えます。
          </Alert>
        )}
        {error && (
          <Alert severity="error" className="notice">
            {error}
            {retry && !attempt && (
              <Button onClick={() => answer(retry)} disabled={busy}>
                保存を再試行
              </Button>
            )}
          </Alert>
        )}
        {message && (
          <Alert onClose={() => setMessage("")} className="notice">
            {message}
          </Alert>
        )}
        {pwa.needRefresh[0] && !dismissUpdate && (
          <Alert className="notice" severity="info">
            更新があります。学習内容を保存して更新できます。
            <div>
              <Button
                disabled={busy}
                onClick={() =>
                  void run(async () => {
                    await repository.read();
                    await pwa.updateServiceWorker();
                  })
                }
              >
                {active ? "中断して更新" : "更新する"}
              </Button>
              <Button onClick={() => setDismissUpdate(true)}>あとで</Button>
            </div>
          </Alert>
        )}
        {!state ? (
          <section className="panel">
            <h1>{initFailed ? "保存を確認してください" : "準備しています…"}</h1>
            {initFailed && (
              <>
                <p>保存せず試す場合、履歴の永続化と復元は利用できません。</p>
                <Button
                  variant="contained"
                  onClick={() => {
                    setState(repository.useMemory());
                    setMemory(true);
                    setError("");
                  }}
                >
                  保存せず試す
                </Button>
                <Button onClick={() => location.reload()}>再読み込み</Button>
              </>
            )}
          </section>
        ) : route === "/" ? (
          <>
            <div className="intro">
              <p className="eyebrow">A LITTLE PRACTICE, EVERY DAY</p>
              <h1>
                思い出せる聖句を、
                <br />
                少しずつ。
              </h1>
              <p>状況と聖句を結び付けて練習しましょう。</p>
            </div>
            <section className="achievement">
              <div>
                <span className="small">総合達成率</span>
                <strong className="large">{pct(m.achievement)}</strong>
                <span>
                  習得済み {m.mastered} / 全{m.total}問
                </span>
              </div>
              <div className="achievement-note">
                <span>✦</span>
                <p>
                  同じ問題に2回続けて正解すると
                  <br />
                  習得済みになります。
                </p>
              </div>
              <LinearProgress
                variant="determinate"
                value={m.achievement || 0}
              />
            </section>
            {active && (
              <section className="resume panel">
                <h2>練習の続きがあります</h2>
                <p>
                  {name(active.categoryId)} · 回答済み{" "}
                  {
                    state.attempts.filter(
                      (a) => a.sessionId === active.sessionId,
                    ).length
                  }
                  /{active.questionSnapshots.length}
                </p>
                <Button variant="contained" onClick={() => go("/quiz")}>
                  続きから再開
                </Button>
              </section>
            )}
            <section>
              <div className="section-heading">
                <h2>今日のテーマ</h2>
                <span className="small">6カテゴリー · 12問</span>
              </div>
              <div className="categories">
                {[
                  { id: "all", name: "すべて" },
                  ...catalog.categories.toSorted((a, b) => a.order - b.order),
                ].map((c, i) => {
                  const cm = metrics(state.attempts, c.id);
                  return (
                    <button
                      className={`category ${category === c.id ? "selected" : ""} ${c.id === "all" ? "all" : ""}`}
                      aria-pressed={category === c.id}
                      onClick={() => setCategory(c.id)}
                      key={c.id}
                    >
                      <span className="category-icon">
                        {["✦", "☀", "◇", "≈", "芽", "↗", "♡"][i]}
                      </span>
                      <span>
                        <strong>{c.name}</strong>
                        <span className="small">
                          {cm.total}問 · 達成率 {pct(cm.achievement)}
                        </span>
                      </span>
                      <span className="select-circle">
                        {category === c.id ? "✓" : ""}
                      </span>
                    </button>
                  );
                })}
              </div>
            </section>
            <section className="start panel">
              <div>
                <span className="small">選択中：{name(category)}</span>
                <h2>
                  今回は{Math.min(10, metrics(state.attempts, category).total)}
                  問
                </h2>
                {metrics(state.attempts, category).total < 10 && (
                  <p className="small">
                    このカテゴリーは全{metrics(state.attempts, category).total}
                    問です。
                  </p>
                )}
              </div>
              <Button
                fullWidth
                variant="contained"
                disabled={busy || !metrics(state.attempts, category).total}
                onClick={() => (active ? setConfirm("start") : start())}
              >
                {active ? "終了して新しく始める" : "練習を始める"} →
              </Button>
            </section>
            <p className="small center">
              自分のペースで。時間制限はありません。
            </p>
          </>
        ) : route === "/quiz" && session ? (
          <>
            <div className="section-heading">
              <span className="eyebrow">{name(session.categoryId)}</span>
              <Button onClick={() => go("/")}>中断してホームへ</Button>
            </div>
            <div className="progress-label">
              <strong>
                {index + 1} / {session.questionSnapshots.length}問目
              </strong>
              <span>
                回答済み{" "}
                {
                  state.attempts.filter(
                    (a) => a.sessionId === session.sessionId,
                  ).length
                }{" "}
                / {session.questionSnapshots.length}
              </span>
            </div>
            <LinearProgress
              variant="determinate"
              value={
                (state.attempts.filter((a) => a.sessionId === session.sessionId)
                  .length /
                  session.questionSnapshots.length) *
                100
              }
            />
            <section className="quiz panel">
              <p className="eyebrow">こんなとき、どの聖句？</p>
              <h1 className="situation">
                {session.questionSnapshots[index].question.situation}
              </h1>
              <p className="small source-title">
                出典：{session.questionSnapshots[index].source.title}
              </p>
              <p>{session.questionSnapshots[index].question.prompt}</p>
              <div className="options">
                {session.optionOrders[index].map((id, i) => {
                  const q = session.questionSnapshots[index].question;
                  return (
                    <Button
                      key={id}
                      variant="outlined"
                      className={
                        attempt &&
                        (id === q.correctOptionId
                          ? "correct"
                          : id === attempt.selectedOptionId
                            ? "incorrect"
                            : "")
                      }
                      disabled={busy || !!attempt || !!retry}
                      onClick={() => answer(id)}
                    >
                      <span className="option-letter">
                        {String.fromCharCode(65 + i)}
                      </span>
                      {q.options.find((o) => o.id === id)!.reference}
                      {attempt && id === q.correctOptionId && <span> ✓</span>}
                    </Button>
                  );
                })}
              </div>
            </section>
            {attempt && (
              <section className="panel feedback" aria-live="polite">
                <h2 ref={feedback} tabIndex={-1}>
                  {attempt.correct ? "✓ 正解です" : "↻ 今回は別の聖句です"}
                </h2>
                {feedbackBlock(session, index)}
                <Button
                  fullWidth
                  variant="contained"
                  disabled={busy}
                  onClick={() =>
                    session.status === "completed"
                      ? go(`/result/${session.sessionId}`)
                      : void run(async () => {
                          await repository.next(session.sessionId, index);
                          setRetry(undefined);
                          window.scrollTo(0, 0);
                        })
                  }
                >
                  {session.status === "completed" ? "結果を見る" : "次へ"} →
                </Button>
              </section>
            )}
          </>
        ) : route.startsWith("/result/") && session?.status === "completed" ? (
          <>
            <section className="panel result">
              <p className="eyebrow">PRACTICE COMPLETE</p>
              <h1>おつかれさまでした</h1>
              <p>{name(session.categoryId)}</p>
              <strong className="score">
                {
                  state.attempts.filter(
                    (a) => a.sessionId === session.sessionId && a.correct,
                  ).length
                }
                <span> / {session.questionSnapshots.length}問正解</span>
              </strong>
              <p>
                正答率{" "}
                {Math.round(
                  (state.attempts.filter(
                    (a) => a.sessionId === session.sessionId && a.correct,
                  ).length /
                    session.questionSnapshots.length) *
                    100,
                )}
                % · 現在の達成率 {pct(m.achievement)}
              </p>
              <p className="small">
                達成率は同じ問題への2回連続の正解で上がります。
              </p>
              <Button
                fullWidth
                variant="contained"
                disabled={busy}
                onClick={() => {
                  setCategory(session.categoryId);
                  void run(async () => {
                    await repository.start(session.categoryId);
                    go("/quiz");
                  });
                }}
              >
                同じカテゴリーでもう一度
              </Button>
              <Button onClick={() => go("/")}>ホームへ</Button>
            </section>
            {session.questionSnapshots.map((x, i) => (
              <details className="panel" key={i}>
                <summary>
                  {i + 1}. {x.question.situation}
                </summary>
                {feedbackBlock(session, i)}
              </details>
            ))}
          </>
        ) : route === "/history" ? (
          <>
            <p className="eyebrow">YOUR PROGRESS</p>
            <h1>学習履歴</h1>
            {memory ? (
              <p>保存なしモードでは履歴機能は利用できません。</p>
            ) : (
              <>
                <section className="panel">
                  <h2>総合達成率 {pct(m.achievement)}</h2>
                  <p>
                    習得済み {m.mastered}/{m.total}問 · 回答済み率{" "}
                    {m.total ? Math.round((m.answered / m.total) * 100) : "—"}%
                    <br />
                    累計正答率（現行版） {pct(m.accuracy)}
                  </p>
                  <p className="small">
                    同じ問題に2回続けて正解すると習得済み。誤答すると習得前に戻ります。
                  </p>
                  {catalog.categories.map((c) => {
                    const x = metrics(state.attempts, c.id);
                    return (
                      <div className="history-row" key={c.id}>
                        <span>{c.name}</span>
                        <span>
                          {x.mastered}/{x.total}問 · {pct(x.achievement)}
                        </span>
                      </div>
                    );
                  })}
                </section>
                {active && (
                  <Button onClick={() => go("/quiz")}>
                    進行中の練習を再開
                  </Button>
                )}
                {state.sessions
                  .filter((s) => s.status !== "active")
                  .toSorted((a, b) => b.startedAt.localeCompare(a.startedAt))
                  .slice(0, limit)
                  .map((s) => {
                    const a = state.attempts.filter(
                      (a) => a.sessionId === s.sessionId,
                    );
                    return (
                      <section className="panel" key={s.sessionId}>
                        <span className="small">
                          {new Date(s.startedAt).toLocaleString("ja-JP")}
                          {s.contentVersion !== catalog.contentVersion
                            ? " · 旧版"
                            : ""}
                        </span>
                        <h2>
                          {name(s.categoryId)} ·{" "}
                          {s.status === "completed" ? "完了" : "中断終了"}
                        </h2>
                        <p>
                          {s.status === "completed"
                            ? `${s.questionSnapshots.length}問中${a.filter((a) => a.correct).length}問正解（${Math.round((a.filter((a) => a.correct).length / s.questionSnapshots.length) * 100)}%）`
                            : `回答済み${a.length}/${s.questionSnapshots.length}問・そのうち${a.filter((a) => a.correct).length}問正解`}
                        </p>
                        {s.status === "completed" && (
                          <Button onClick={() => go(`/result/${s.sessionId}`)}>
                            結果を見る
                          </Button>
                        )}
                      </section>
                    );
                  })}
                {state.sessions.length === 0 && (
                  <p>まだ履歴はありません。最初の練習を始めましょう。</p>
                )}
                {state.sessions.filter((s) => s.status !== "active").length >
                  limit && (
                  <Button onClick={() => setLimit(limit + 20)}>
                    さらに表示
                  </Button>
                )}
              </>
            )}
          </>
        ) : route === "/settings" ? (
          <>
            <p className="eyebrow">KEEP YOUR PRACTICE</p>
            <h1>設定・使い方</h1>
            <section className="panel">
              <h2>バックアップ</h2>
              <p>
                履歴はこの端末だけに保存されます。閲覧データ消去や機種変更で失われることがあるため、JSONファイルを保管してください。暗号化はされません。
              </p>
              <div className="button-stack">
                <Button
                  variant="outlined"
                  disabled={busy}
                  onClick={() =>
                    void run(async () => {
                      const data = exportBackup(await repository.read());
                      const blob = new Blob([data], {
                        type: "application/json",
                      });
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement("a");
                      a.href = url;
                      const d = new Date();
                      const pad = (v: number) => String(v).padStart(2, "0");
                      a.download = `verse-practice-backup-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}.json`;
                      a.click();
                      setTimeout(() => URL.revokeObjectURL(url), 10000);
                      if (blob.size > 10 * 1024 * 1024)
                        setMessage(
                          "書き出しましたが、10MiBの読み込み上限を超えています。",
                        );
                    })
                  }
                >
                  JSONを書き出す
                </Button>
                <Button
                  variant="outlined"
                  component="label"
                  disabled={memory || busy}
                >
                  JSONを読み込む
                  <input
                    hidden
                    type="file"
                    accept="application/json,.json"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      e.target.value = "";
                      if (file)
                        void run(async () => setBackup(await readBackup(file)));
                    }}
                  />
                </Button>
              </div>
            </section>
            <section className="panel">
              <h2>インストール・オフライン</h2>
              <p role="status">
                {pwa.ready
                  ? "✓ オフラインで練習できます"
                  : pwa.error
                    ? "オフライン準備に失敗しました。オンラインで再読み込みしてください。"
                    : "オフライン準備を確認中です。初回は通信が必要です。"}
              </p>
              {pwa.install && (
                <Button onClick={() => void pwa.installApp()}>
                  インストール
                </Button>
              )}
              <p>
                iPhone /
                iPadはSafariの共有メニューから「ホーム画面に追加」。Androidはブラウザメニューの「アプリをインストール」から追加できます。
              </p>
              <p>
                公式記事を読むには通信が必要です。ブラウザとホーム画面アプリで履歴が共有されない場合は、バックアップで移してください。
              </p>
              <Button
                onClick={() =>
                  void run(async () => {
                    const allowed = await navigator.storage?.persist?.();
                    setMessage(
                      allowed
                        ? "ブラウザに永続保存が許可されました。バックアップも保管してください。"
                        : "永続保存は許可されませんでした。通常の保存は引き続き使えます。",
                    );
                  })
                }
              >
                履歴を保持するようブラウザに依頼
              </Button>
            </section>
            <section className="panel">
              <h2>このアプリについて</h2>
              <p>
                個人学習用の非公式アプリです。公式の説明はリンク先をご確認ください。知識の練習であり、信仰や人格の評価ではありません。
              </p>
              <p>
                履歴・回答を解析やログへ送信しません。ログイン・同期・実行時AIはありません。GitHub
                Pagesへのアクセスと公式リンク先の通信は発生します。
              </p>
              <p className="small">
                アプリ {import.meta.env.VITE_APP_BUILD || "1.0.0"} · 問題セット{" "}
                {catalog.contentVersion}
                <br />
                保存状態：{memory ? "保存なし" : "IndexedDB（端末内）"}
              </p>
              <Button
                color="error"
                disabled={memory || busy}
                onClick={() => setConfirm("clear")}
              >
                端末内データを全削除
              </Button>
            </section>
          </>
        ) : (
          <section className="panel">
            <h1>練習が見つかりません</h1>
            <p>履歴がないか、すでに終了しています。</p>
            <Button onClick={() => go("/")}>ホームへ</Button>
          </section>
        )}
      </main>
      <nav aria-label="メインナビゲーション">
        <a
          aria-label="練習"
          aria-current={route === "/" ? "page" : undefined}
          href="#/"
        >
          <span>⌂</span>練習
        </a>
        <a
          aria-label="履歴"
          aria-current={route === "/history" ? "page" : undefined}
          href="#/history"
        >
          <span>▥</span>履歴
        </a>
        <a
          aria-label="設定"
          aria-current={route === "/settings" ? "page" : undefined}
          href="#/settings"
        >
          <span>⚙</span>設定
        </a>
      </nav>
      <footer>Verse Practice · 個人学習用の非公式アプリ</footer>
      <Dialog open={confirm !== null} onClose={() => !busy && setConfirm(null)}>
        <DialogTitle>
          {confirm === "clear"
            ? "端末内データを全削除しますか？"
            : "進行中の練習を終了しますか？"}
        </DialogTitle>
        <DialogContent>
          {confirm === "clear"
            ? "履歴と設定を削除します。必要なら先にバックアップを書き出してください。"
            : "回答済みの履歴は保持し、新しい練習を始めます。"}
        </DialogContent>
        <DialogActions>
          <Button disabled={busy} onClick={() => setConfirm(null)}>
            取消
          </Button>
          <Button
            disabled={busy}
            onClick={() =>
              confirm === "start"
                ? start()
                : void run(async () => {
                    await repository.clear();
                    setConfirm(null);
                    setMessage("端末内データを削除しました");
                  })
            }
          >
            確認して続ける
          </Button>
        </DialogActions>
      </Dialog>
      <Dialog open={!!backup} onClose={() => !busy && setBackup(undefined)}>
        <DialogTitle>バックアップで置き換えますか？</DialogTitle>
        <DialogContent>
          {backup?.sessions.length}セッション・{backup?.attempts.length}
          回答。現在の履歴をこのバックアップで置き換えます。
          <p>
            書き出し日時：
            {backup &&
              new Date(
                backup.exportedAt || backup.meta.createdAt,
              ).toLocaleString("ja-JP")}
          </p>
        </DialogContent>
        <DialogActions>
          <Button disabled={busy} onClick={() => setBackup(undefined)}>
            取消
          </Button>
          <Button
            disabled={busy}
            onClick={() =>
              void run(async () => {
                await repository.replace(backup!);
                setBackup(undefined);
                go("/");
                setMessage("バックアップを復元しました");
              })
            }
          >
            置き換えて復元
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
class Boundary extends React.Component<
  { children: React.ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? (
      <main>
        <h1>アプリを開けませんでした</h1>
        <p>データを消さずに再読み込みしてください。</p>
        <Button onClick={() => location.reload()}>再読み込み</Button>
      </main>
    ) : (
      this.props.children
    );
  }
}
createRoot(document.getElementById("root")!).render(
  <ThemeProvider theme={theme}>
    <CssBaseline />
    <Boundary>
      <App />
    </Boundary>
  </ThemeProvider>,
);
