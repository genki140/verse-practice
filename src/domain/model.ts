import { z } from "zod";
import raw from "../../data/seed.json";
const text = (n: number) =>
  z
    .string()
    .min(1)
    .refine((s) => [...s].length <= n, "文字数超過");
const id = z
  .string()
  .max(80)
  .regex(/^[a-z0-9-]+$/);
const contentVersion = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}\.\d+$/)
  .refine((s) => z.iso.date().safeParse(s.split(".")[0]).success, "日付不正");
const date = z.string().datetime();
export const sourceSchema = z
  .object({
    id,
    title: text(240),
    url: z.string().refine((s) => {
      try {
        const u = new URL(s);
        return (
          u.protocol === "https:" &&
          u.hostname === "www.jw.org" &&
          !u.username &&
          !u.password &&
          !u.port &&
          u.pathname.startsWith("/ja/")
        );
      } catch {
        return false;
      }
    }, "出典URL不正"),
    checkedAt: z.iso.date(),
  })
  .strict();
export const questionSchema = z
  .object({
    id,
    revision: z.number().int().positive(),
    active: z.boolean(),
    categoryId: id,
    situation: text(160),
    prompt: text(240),
    options: z
      .array(
        z
          .object({ id: z.enum(["a", "b", "c", "d"]), reference: text(60) })
          .strict(),
      )
      .length(4),
    correctOptionId: z.enum(["a", "b", "c", "d"]),
    explanation: text(300),
    sourceId: id,
    sourceLocator: text(160),
    evidenceReference: text(60),
    distractorRationale: z.record(z.string(), text(160)),
  })
  .strict()
  .superRefine((q, c) => {
    const fail = (message: string) => c.addIssue({ code: "custom", message });
    if (new Set(q.options.map((o) => o.id)).size !== 4) fail("選択肢ID重複");
    const refs = q.options.map((o) => o.reference.normalize("NFKC").trim());
    if (new Set(refs).size !== 4) fail("参照重複");
    const parts = refs.map((s) => {
      const m = s.match(/^(.*) (\d+):([\d,-]+)$/);
      return m
        ? {
            book: m[1],
            chapter: m[2],
            ranges: m[3].split(",").map((x) => {
              const [a, b] = x.split("-").map(Number);
              const end = b ?? a;
              if (
                !Number.isSafeInteger(a) ||
                !Number.isSafeInteger(end) ||
                a < 1 ||
                end < a
              )
                fail("節の範囲が不正");
              return { start: a, end };
            }),
          }
        : null;
    });
    for (let i = 0; i < 4; i++)
      for (let j = i + 1; j < 4; j++) {
        const a = parts[i],
          b = parts[j];
        if (
          a &&
          b &&
          a.book === b.book &&
          a.chapter === b.chapter &&
          a.ranges.some((x) =>
            b.ranges.some((y) => x.start <= y.end && y.start <= x.end),
          )
        )
          fail("選択肢の節が重複");
      }
    if (
      q.options.find((o) => o.id === q.correctOptionId)?.reference !==
      q.evidenceReference
    )
      fail("根拠と正答が不一致");
    if (
      Object.keys(q.distractorRationale).sort().join() !==
      q.options
        .filter((o) => o.id !== q.correctOptionId)
        .map((o) => o.id)
        .sort()
        .join()
    )
      fail("誤答理由不一致");
  });
export const catalogSchema = z
  .object({
    schemaVersion: z.literal(1),
    contentVersion,
    locale: z.literal("ja"),
    categories: z.array(
      z.object({ id, name: text(100), order: z.number().int() }).strict(),
    ),
    sources: z.array(sourceSchema),
    questions: z.array(questionSchema),
  })
  .strict()
  .superRefine((v, c) => {
    for (const list of [v.categories, v.sources, v.questions])
      if (new Set(list.map((x) => x.id)).size !== list.length)
        c.addIssue({ code: "custom", message: "ID重複" });
    for (const q of v.questions)
      if (
        !v.categories.some((x) => x.id === q.categoryId) ||
        !v.sources.some((x) => x.id === q.sourceId)
      )
        c.addIssue({ code: "custom", message: "参照先不在" });
  });
export type Question = z.infer<typeof questionSchema>;
export const snapshotSchema = z
  .object({ question: questionSchema, source: sourceSchema })
  .strict()
  .refine((x) => x.question.sourceId === x.source.id, "出典不一致");
export const sessionSchema = z
  .object({
    sessionId: z.string().uuid(),
    categoryId: id,
    contentVersion,
    startedAt: date,
    completedAt: date.nullable(),
    status: z.enum(["active", "completed", "abandoned"]),
    cursor: z.number().int().nonnegative(),
    questionSnapshots: z.array(snapshotSchema).min(1).max(10),
    optionOrders: z
      .array(z.array(z.enum(["a", "b", "c", "d"])).length(4))
      .max(10),
  })
  .strict();
export const attemptSchema = z
  .object({
    attemptId: z.string(),
    sessionId: z.string().uuid(),
    questionIndex: z.number().int().nonnegative(),
    questionId: id,
    revision: z.number().int().positive(),
    selectedOptionId: z.enum(["a", "b", "c", "d"]),
    correct: z.boolean(),
    answeredAt: date,
  })
  .strict();
export const metaSchema = z
  .object({
    schemaVersion: z.literal(1),
    appId: z.literal("verse-practice"),
    createdAt: date,
    settings: z.object({ categoryId: id }).strict(),
  })
  .strict();
export type Session = z.infer<typeof sessionSchema>;
export type Attempt = z.infer<typeof attemptSchema>;
export type State = {
  meta: z.infer<typeof metaSchema>;
  sessions: Session[];
  attempts: Attempt[];
};
export const catalog = catalogSchema.parse(raw);
export const initialState = (): State => ({
  meta: {
    schemaVersion: 1,
    appId: "verse-practice",
    createdAt: new Date().toISOString(),
    settings: { categoryId: "all" },
  },
  sessions: [],
  attempts: [],
});
export function shuffle<T>(items: T[], random = Math.random): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
export const ordered = (attempts: Attempt[]) =>
  [...attempts].sort(
    (a, b) =>
      a.answeredAt.localeCompare(b.answeredAt) ||
      a.attemptId.localeCompare(b.attemptId),
  );
export function createSession(
  categoryId: string,
  attempts: Attempt[],
  random = Math.random,
): Session {
  const pool = catalog.questions.filter(
    (q) => q.active && (categoryId === "all" || q.categoryId === categoryId),
  );
  const priority = (q: Question) => {
    const a = ordered(
      attempts.filter(
        (a) => a.questionId === q.id && a.revision === q.revision,
      ),
    );
    return !a.length ? 0 : !a.at(-1)!.correct ? 1 : 2;
  };
  const questions = shuffle(pool, random)
    .sort((a, b) => priority(a) - priority(b))
    .slice(0, 10);
  if (!questions.length) throw Error("問題がありません");
  return {
    sessionId: crypto.randomUUID(),
    categoryId,
    contentVersion: catalog.contentVersion,
    startedAt: new Date().toISOString(),
    completedAt: null,
    status: "active",
    cursor: 0,
    questionSnapshots: questions.map((question) => ({
      question,
      source: catalog.sources.find((s) => s.id === question.sourceId)!,
    })),
    optionOrders: questions.map((q) =>
      shuffle(
        q.options.map((o) => o.id),
        random,
      ),
    ),
  };
}
export function metrics(attempts: Attempt[], categoryId = "all") {
  const qs = catalog.questions.filter(
    (q) => q.active && (categoryId === "all" || q.categoryId === categoryId),
  );
  const histories = qs.map((q) =>
    ordered(
      attempts.filter(
        (a) => a.questionId === q.id && a.revision === q.revision,
      ),
    ),
  );
  const mastered = histories.filter(
    (a) => a.length >= 2 && a.slice(-2).every((x) => x.correct),
  ).length;
  const all = histories.flat();
  return {
    total: qs.length,
    mastered,
    achievement: qs.length ? Math.round((mastered / qs.length) * 100) : null,
    answered: histories.filter((a) => a.length).length,
    accuracy: all.length
      ? Math.round((all.filter((a) => a.correct).length / all.length) * 100)
      : null,
  };
}
