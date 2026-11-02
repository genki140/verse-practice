import { openDB, type IDBPDatabase } from "idb";
import {
  initialState,
  type State,
  type Session,
  type Attempt,
  createSession,
} from "../domain/model";
export class Repository {
  private db?: IDBPDatabase;
  private memory?: State;
  close() {
    this.db?.close();
  }
  async open() {
    this.db = await openDB("verse-practice", 1, {
      upgrade(db) {
        db.createObjectStore("meta");
        db.createObjectStore("sessions", { keyPath: "sessionId" });
        db.createObjectStore("attempts", { keyPath: "attemptId" });
      },
      blocking() {
        location.reload();
      },
    });
    const tx = this.db.transaction("meta", "readwrite");
    if (!(await tx.store.get("app")))
      await tx.store.put(initialState().meta, "app");
    await tx.done;
    return this.read();
  }
  useMemory() {
    this.memory = initialState();
    return this.memory;
  }
  async read(): Promise<State> {
    if (this.memory) return structuredClone(this.memory);
    if (!this.db) throw Error("保存を利用できません");
    const tx = this.db.transaction(
      ["meta", "sessions", "attempts"],
      "readonly",
    );
    const [meta, sessions, attempts] = await Promise.all([
      tx.objectStore("meta").get("app"),
      tx.objectStore("sessions").getAll(),
      tx.objectStore("attempts").getAll(),
    ]);
    await tx.done;
    return { meta, sessions, attempts };
  }
  private async change<T>(fn: (state: State) => T): Promise<T> {
    if (this.memory) {
      const next = structuredClone(this.memory);
      const result = fn(next);
      this.memory = next;
      return result;
    }
    if (!this.db) throw Error("保存を利用できません");
    const tx = this.db.transaction(
      ["meta", "sessions", "attempts"],
      "readwrite",
    );
    try {
      const state: State = {
        meta: await tx.objectStore("meta").get("app"),
        sessions: await tx.objectStore("sessions").getAll(),
        attempts: await tx.objectStore("attempts").getAll(),
      };
      const before = {
        sessions: new Map(
          state.sessions.map((s) => [s.sessionId, JSON.stringify(s)]),
        ),
        attempts: new Set(state.attempts.map((a) => a.attemptId)),
      };
      const result = fn(state);
      await tx.objectStore("meta").put(state.meta, "app");
      for (const s of state.sessions)
        if (before.sessions.get(s.sessionId) !== JSON.stringify(s))
          await tx.objectStore("sessions").put(s);
      for (const a of state.attempts)
        if (!before.attempts.has(a.attemptId))
          await tx.objectStore("attempts").put(a);
      await tx.done;
      return result;
    } catch (e) {
      try {
        tx.abort();
      } catch {
        /* already aborted */
      }
      await tx.done.catch(() => {});
      throw e;
    }
  }
  async start(category: string, abandonId?: string) {
    return this.change((state) => {
      const active = state.sessions.find((s) => s.status === "active");
      if (active) {
        if (active.sessionId !== abandonId)
          throw Error(
            "別のタブに進行中の練習があります。続きから再開してください。",
          );
        active.status = "abandoned";
      }
      const s = createSession(category, state.attempts);
      state.sessions.push(s);
      return s;
    });
  }
  async answer(
    sessionId: string,
    index: number,
    option: Attempt["selectedOptionId"],
  ) {
    return this.change((state) => {
      const old = state.attempts.find(
        (a) => a.attemptId === `${sessionId}:${index}`,
      );
      if (old) return old;
      const s = state.sessions.find((s) => s.sessionId === sessionId);
      if (!s || s.status !== "active" || s.cursor !== index)
        throw Error("別のタブで進みました。最新の状態を確認してください。");
      const q = s.questionSnapshots[index].question;
      const a: Attempt = {
        attemptId: `${sessionId}:${index}`,
        sessionId,
        questionIndex: index,
        questionId: q.id,
        revision: q.revision,
        selectedOptionId: option,
        correct: option === q.correctOptionId,
        answeredAt: new Date().toISOString(),
      };
      state.attempts.push(a);
      if (index === s.questionSnapshots.length - 1) {
        s.status = "completed";
        s.completedAt = a.answeredAt;
        s.cursor = s.questionSnapshots.length;
      }
      return a;
    });
  }
  async next(sessionId: string, index: number) {
    return this.change((state) => {
      const s = state.sessions.find((s) => s.sessionId === sessionId);
      if (
        !s ||
        s.status !== "active" ||
        s.cursor !== index ||
        !state.attempts.some((a) => a.attemptId === `${sessionId}:${index}`)
      )
        throw Error("最新の練習状態を読み直しました");
      s.cursor++;
    });
  }
  async replace(state: State) {
    if (this.memory) throw Error("保存なしモードでは復元できません");
    if (!this.db) throw Error("保存を利用できません");
    const tx = this.db.transaction(
      ["meta", "sessions", "attempts"],
      "readwrite",
    );
    try {
      await Promise.all(
        ["meta", "sessions", "attempts"].map((x) => tx.objectStore(x).clear()),
      );
      await tx.objectStore("meta").put(state.meta, "app");
      for (const s of state.sessions) await tx.objectStore("sessions").put(s);
      for (const a of state.attempts) await tx.objectStore("attempts").put(a);
      await tx.done;
    } catch (error) {
      try {
        tx.abort();
      } catch {
        /* already aborted */
      }
      await tx.done.catch(() => {});
      throw error;
    }
  }
  async clear() {
    await this.replace(initialState());
  }
}
export const repository = new Repository();
export const activeSession = (state: State): Session | undefined =>
  state.sessions.find((s) => s.status === "active");
