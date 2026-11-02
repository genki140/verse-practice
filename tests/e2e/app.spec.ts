import { test, expect, type Page } from "@playwright/test";
const start = async (page: Page, category?: string) => {
  await page.goto("./");
  if (category)
    await page.getByRole("button", { name: new RegExp(category) }).click();
  await page.getByRole("button", { name: "練習を始める" }).click();
  await expect(page.getByText("こんなとき、どの聖句？")).toBeVisible();
};
const db = async (page: Page) =>
  page.evaluate(async () => {
    const d = await new Promise<IDBDatabase>((resolve, reject) => {
      const r = indexedDB.open("verse-practice");
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
    const tx = d.transaction(["sessions", "attempts"]);
    const get = (store: string) =>
      new Promise<any[]>((resolve) => {
        const r = tx.objectStore(store).getAll();
        r.onsuccess = () => resolve(r.result);
      });
    const [sessions, attempts] = await Promise.all([
      get("sessions"),
      get("attempts"),
    ]);
    d.close();
    return { sessions, attempts };
  });
test("10問抽選、回答固定、解説と再読み込み、2タブ冪等", async ({
  page,
  context,
}) => {
  await start(page);
  await expect(page.getByText("1 / 10問目")).toBeVisible();
  const before = await page.locator(".options").innerText();
  const other = await context.newPage();
  await other.goto("./#/quiz");
  await expect(other.getByText("1 / 10問目")).toBeVisible();
  await page.locator(".options button").first().click();
  await expect(
    page.getByRole("heading", { name: /正解です|今回は別の聖句です/ }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("heading", { name: /正解です|今回は別の聖句です/ }),
  ).toBeVisible();
  expect((await db(page)).attempts).toHaveLength(1);
  expect(
    (await page.locator(".options").innerText()).replace(/\s*✓/g, "").trim(),
  ).toBe(before);
  await expect(other.getByRole("button", { name: "次へ" })).toBeVisible();
  await page.getByRole("button", { name: "次へ" }).click();
  await expect(page.getByText("2 / 10問目")).toBeVisible();
  await page.reload();
  await expect(page.getByText("2 / 10問目")).toBeVisible();
  expect((await db(page)).attempts).toHaveLength(1);
});
test("2問完了、結果永続化、バックアップ削除復元", async ({ page }) => {
  await start(page, "死別と希望");
  await expect(page.getByText("1 / 2問目")).toBeVisible();
  for (let i = 0; i < 2; i++) {
    await page.locator(".options button").first().click();
    await page
      .getByRole("button", { name: i === 1 ? "結果を見る" : "次へ" })
      .click();
  }
  await expect(
    page.getByRole("heading", { name: "おつかれさまでした" }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "おつかれさまでした" }),
  ).toBeVisible();
  await page.getByRole("link", { name: "設定", exact: true }).click();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "JSONを書き出す" }).click();
  const file = await download;
  const path = await file.path();
  const original = await db(page);
  await page.getByRole("button", { name: "端末内データを全削除" }).click();
  await page.getByRole("button", { name: "確認して続ける" }).click();
  await expect.poll(async () => (await db(page)).attempts.length).toBe(0);
  await page.locator("input[type=file]").setInputFiles(path!);
  await page.getByRole("button", { name: "置き換えて復元" }).click();
  await expect(
    page.getByRole("heading", { name: "今日のテーマ" }),
  ).toBeVisible();
  expect(await db(page)).toEqual(original);
});
test("オフライン準備後にページを閉じ、新しいページで起動・回答・履歴・バックアップ", async ({
  page,
  context,
}) => {
  await page.goto("./#/settings");
  await expect(page.getByText("✓ オフラインで練習できます")).toBeVisible();
  await page.close();
  await context.setOffline(true);
  const offline = await context.newPage();
  await start(offline, "友情");
  for (let i = 0; i < 2; i++) {
    await offline.locator(".options button").first().click();
    await offline
      .getByRole("button", { name: i === 1 ? "結果を見る" : "次へ" })
      .click();
  }
  await expect(
    offline.getByRole("heading", { name: "おつかれさまでした" }),
  ).toBeVisible();
  await offline.getByRole("link", { name: "履歴", exact: true }).click();
  await expect(
    offline.getByRole("heading", { name: "学習履歴" }),
  ).toBeVisible();
  await offline.getByRole("link", { name: "設定", exact: true }).click();
  const download = offline.waitForEvent("download");
  await offline.getByRole("button", { name: "JSONを書き出す" }).click();
  expect((await download).suggestedFilename()).toMatch(
    /^verse-practice-backup-/,
  );
});
test("320〜1280pxで横はみ出しがなく、リンクとmanifestはサブパス内", async ({
  page,
  request,
}) => {
  for (const width of [320, 390, 768, 1280]) {
    await page.setViewportSize({ width, height: 844 });
    await page.goto("./");
    await expect(
      page.getByRole("heading", { name: "今日のテーマ" }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
  const manifest = await (await request.get("manifest.webmanifest")).json();
  expect(manifest.scope).toBe("/verse-practice/");
  expect(manifest.start_url).toBe("/verse-practice/");
  await start(page, "怒り");
  await page.locator(".options button").first().click();
  await expect(
    page.getByRole("link", { name: /公式記事を読む/ }),
  ).toHaveAttribute("href", /^https:\/\/www.jw.org\/ja\//);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
test("DB初期化失敗では明示選択後だけ保存なしモード", async ({ page }) => {
  await page.addInitScript(() => {
    indexedDB.open = () => {
      throw new Error("blocked");
    };
  });
  await page.goto("./");
  await expect(
    page.getByText(
      "履歴を保存できません。ブラウザの保存設定を確認してください。",
    ),
  ).toBeVisible();
  await page.getByRole("button", { name: "保存せず試す" }).click();
  await expect(
    page.getByText("保存せず試しています。再読み込みで履歴が消えます。"),
  ).toBeVisible();
  await page.getByRole("button", { name: "練習を始める" }).click();
  await expect(page.getByText("1 / 10問目")).toBeVisible();
});
