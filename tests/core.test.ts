import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  catalog,
  catalogSchema,
  createSession,
  metrics,
  initialState,
  type Attempt,
} from "../src/domain/model";
import { exportBackup, validateBackup } from "../src/storage/backup";
import { Repository } from "../src/storage/repository";
import { deleteDB } from "idb";
const q = catalog.questions[0];
const attempt = (correct: boolean, i: number, revision = 1): Attempt => ({
  attemptId: `test:${i}`,
  sessionId: "test",
  questionIndex: 0,
  questionId: q.id,
  revision,
  selectedOptionId: correct ? "a" : "b",
  correct,
  answeredAt: new Date(i * 1000).toISOString(),
});
describe("出題と学習指標", () => {
  it("12問から重複なし10問、カテゴリーは実数2問", () => {
    const s = createSession("all", [], () => 0.4);
    expect(s.questionSnapshots).toHaveLength(10);
    expect(new Set(s.questionSnapshots.map((x) => x.question.id)).size).toBe(
      10,
    );
    expect(s.optionOrders.every((o) => new Set(o).size === 4)).toBe(true);
    expect(createSession("grief", []).questionSnapshots).toHaveLength(2);
  });
  it("未回答→誤答→その他、revisionを分離", () => {
    const a = [
      attempt(true, 1),
      { ...attempt(false, 2), questionId: catalog.questions[1].id },
    ];
    const s = createSession("all", a, () => 0.4);
    expect(s.questionSnapshots.every((x) => x.question.id !== q.id)).toBe(true);
    const two = createSession("grief", a, () => 0.4);
    expect(two.questionSnapshots[0].question.id).toBe(catalog.questions[1].id);
    expect(
      createSession("grief", [attempt(true, 1, 2)], () => 0.99)
        .questionSnapshots[0].question.id,
    ).toBe(q.id);
  });
  it("正→正→誤と旧版を正しく集計", () => {
    expect(metrics([]).accuracy).toBe(null);
    expect(metrics([attempt(true, 1)]).mastered).toBe(0);
    expect(metrics([attempt(true, 1), attempt(true, 2)]).mastered).toBe(1);
    expect(
      metrics([attempt(true, 1), attempt(true, 2), attempt(false, 3)]).mastered,
    ).toBe(0);
    expect(metrics([attempt(true, 1, 2), attempt(true, 2, 2)]).answered).toBe(
      0,
    );
  });
  it("不正カタログを拒否", () => {
    for (const mutate of [
      (x: any) => x.questions.push(x.questions[0]),
      (x: any) => (x.questions[0].sourceId = "missing"),
      (x: any) => (x.questions[0].options[1].reference = "ヨハネ 5:29"),
      (x: any) => (x.sources[0].url = "https://evil.test/ja/"),
      (x: any) => (x.questions[0].extra = true),
    ]) {
      const x = structuredClone(catalog);
      mutate(x);
      expect(catalogSchema.safeParse(x).success).toBe(false);
    }
  });
});
describe("IndexedDB・バックアップ", () => {
  let repo: Repository;
  afterEach(() => repo.close());
  beforeEach(async () => {
    await deleteDB("verse-practice", {
      blocked() {
        /* isolated tests use memory where applicable */
      },
    });
    repo = new Repository();
  });
  it("回答の冪等性、次へ、最後の原子完了、復元", async () => {
    await repo.open();
    const s = await repo.start("grief");
    const a = await repo.answer(s.sessionId, 0, "a");
    expect(await repo.answer(s.sessionId, 0, "b")).toEqual(a);
    expect((await repo.read()).attempts).toHaveLength(1);
    await repo.next(s.sessionId, 0);
    await repo.answer(s.sessionId, 1, "b");
    const state = await repo.read();
    expect(state.sessions[0].status).toBe("completed");
    expect(state.sessions[0].cursor).toBe(2);
    const decoded = validateBackup(JSON.parse(exportBackup(state)));
    await repo.clear();
    await repo.replace(decoded);
    expect(await repo.read()).toEqual(state);
  });
  it("メモリモードでも競合を拒否、改ざんバックアップを拒否", async () => {
    repo.useMemory();
    const s = await repo.start("grief");
    await expect(repo.start("all")).rejects.toThrow();
    await expect(repo.next(s.sessionId, 0)).rejects.toThrow();
    await repo.answer(s.sessionId, 0, "a");
    const data = JSON.parse(exportBackup(await repo.read()));
    expect(() => validateBackup(data)).not.toThrow();
    for (const mutate of [
      (x: any) => (x.backupVersion = 2),
      (x: any) => (x.attempts[0].correct = false),
      (x: any) => (x.sessions[0].cursor = 2),
      (x: any) => (x.sessions[0].optionOrders[0] = ["a", "a", "a", "a"]),
      (x: any) =>
        (x.sessions[0].questionSnapshots[0].source.url = "javascript:alert(1)"),
    ]) {
      const bad = structuredClone(data);
      mutate(bad);
      expect(() => validateBackup(bad)).toThrow();
    }
  });
  it("置換取消に相当する検証だけでは元データを変えない", () => {
    const state = initialState();
    expect(validateBackup(JSON.parse(exportBackup(state)))).toEqual(state);
  });
  it("置換途中の書込み失敗は全storeをロールバック", async () => {
    await repo.open();
    await repo.start("grief");
    const original = await repo.read();
    const replacement = structuredClone(original);
    replacement.meta.settings.categoryId = "friendship";
    const put = IDBObjectStore.prototype.put;
    const spy = vi
      .spyOn(IDBObjectStore.prototype, "put")
      .mockImplementation(function (
        this: IDBObjectStore,
        ...args: Parameters<typeof put>
      ) {
        if (this.name === "sessions")
          throw new DOMException("test failure", "QuotaExceededError");
        return put.apply(this, args);
      });
    await expect(repo.replace(replacement)).rejects.toThrow();
    spy.mockRestore();
    expect(await repo.read()).toEqual(original);
  });
  it("2接続の同時開始・回答はactiveと回答を1件に保つ", async () => {
    await repo.open();
    const other = new Repository();
    await other.open();
    try {
      const starts = await Promise.allSettled([
        repo.start("all"),
        other.start("grief"),
      ]);
      expect(starts.filter((x) => x.status === "fulfilled")).toHaveLength(1);
      const s = (await repo.read()).sessions[0];
      await Promise.all([
        repo.answer(s.sessionId, 0, "a"),
        other.answer(s.sessionId, 0, "b"),
      ]);
      expect((await repo.read()).attempts).toHaveLength(1);
      expect(
        (await other.read()).sessions.filter((x) => x.status === "active"),
      ).toHaveLength(1);
    } finally {
      other.close();
    }
  });
});
