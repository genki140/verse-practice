import { z } from "zod";
import {
  metaSchema,
  sessionSchema,
  attemptSchema,
  type State,
} from "../domain/model";
const envelope = z
  .object({
    appId: z.literal("verse-practice"),
    backupVersion: z.literal(1),
    exportedAt: z.string().datetime(),
    dbVersion: z.literal(1),
    meta: metaSchema,
    sessions: z.array(sessionSchema).max(10000),
    attempts: z.array(attemptSchema).max(100000),
  })
  .strict();
export function validateBackup(value: unknown): State {
  const data = envelope.parse(value);
  const fail = () => {
    throw Error("バックアップの履歴に矛盾があります");
  };
  if (
    new Set(data.sessions.map((s) => s.sessionId)).size !==
      data.sessions.length ||
    new Set(data.attempts.map((a) => a.attemptId)).size !==
      data.attempts.length ||
    data.sessions.filter((s) => s.status === "active").length > 1
  )
    fail();
  for (const s of data.sessions) {
    const n = s.questionSnapshots.length;
    if (
      s.optionOrders.length !== n ||
      s.optionOrders.some((o) => new Set(o).size !== 4) ||
      new Set(s.questionSnapshots.map((x) => x.question.id)).size !== n ||
      s.cursor > n
    )
      fail();
    const a = data.attempts.filter((a) => a.sessionId === s.sessionId);
    const completed = a.length === n;
    if (
      (s.status === "completed") !== completed ||
      (s.status === "completed"
        ? s.cursor !== n || !s.completedAt
        : s.completedAt !== null) ||
      (!completed && s.cursor >= n)
    )
      fail();
    for (let i = 0; i < s.cursor; i++)
      if (!a.some((x) => x.questionIndex === i)) fail();
    if (a.some((x) => x.questionIndex > s.cursor)) fail();
  }
  for (const a of data.attempts) {
    const s = data.sessions.find((s) => s.sessionId === a.sessionId);
    const q = s?.questionSnapshots[a.questionIndex]?.question;
    if (
      !q ||
      a.attemptId !== `${a.sessionId}:${a.questionIndex}` ||
      a.questionId !== q.id ||
      a.revision !== q.revision ||
      !q.options.some((o) => o.id === a.selectedOptionId) ||
      a.correct !== (a.selectedOptionId === q.correctOptionId)
    )
      fail();
  }
  return { meta: data.meta, sessions: data.sessions, attempts: data.attempts };
}
export const exportBackup = (state: State) =>
  JSON.stringify(
    {
      appId: "verse-practice",
      backupVersion: 1,
      exportedAt: new Date().toISOString(),
      dbVersion: 1,
      ...state,
    },
    null,
    2,
  );
export async function readBackup(file: File) {
  if (file.size > 10 * 1024 * 1024) throw Error("読み込み上限は10MiBです");
  const value = JSON.parse(await file.text());
  return { ...validateBackup(value), exportedAt: value.exportedAt as string };
}
