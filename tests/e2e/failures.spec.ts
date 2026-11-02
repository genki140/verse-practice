import { test, expect } from "@playwright/test";
test("回答保存失敗は未確定、同じ回答の再試行だけを保存", async ({ page }) => {
  await page.goto("./");
  await page.getByRole("button", { name: "練習を始める" }).click();
  await expect(page.getByText("1 / 10問目")).toBeVisible();
  await page.evaluate(() => {
    const original = IDBDatabase.prototype.transaction;
    let reject = true;
    IDBDatabase.prototype.transaction = function (stores, mode, options) {
      if (mode === "readwrite" && reject) {
        reject = false;
        throw new DOMException("テスト用：容量不足", "QuotaExceededError");
      }
      return original.call(this, stores, mode, options);
    };
  });
  await page.locator(".options button").first().click();
  await expect(
    page.getByRole("button", { name: "保存を再試行" }),
  ).toBeVisible();
  await expect(page.locator(".feedback")).toHaveCount(0);
  await page.getByRole("button", { name: "保存を再試行" }).click();
  await expect(page.locator(".feedback")).toBeVisible();
  await expect(page.getByText("回答済み 1 / 10")).toBeVisible();
});
test("無効バックアップと取消は現在の練習を保持", async ({ page }) => {
  await page.goto("./");
  await page.getByRole("button", { name: "練習を始める" }).click();
  await page.locator(".options button").first().click();
  await expect(page.locator(".feedback")).toBeVisible();
  await page.getByRole("link", { name: "設定", exact: true }).click();
  await page.locator("input[type=file]").setInputFiles({
    name: "broken.json",
    mimeType: "application/json",
    buffer: Buffer.from('{"appId":"verse-practice","backupVersion":99}'),
  });
  await expect(page.getByRole("alert")).toBeVisible();
  await page.getByRole("link", { name: "練習", exact: true }).click();
  await page.getByRole("button", { name: "続きから再開" }).click();
  await expect(page.getByText("回答済み 1 / 10")).toBeVisible();
  await page.getByRole("button", { name: "中断してホームへ" }).click();
  await page.getByRole("button", { name: "終了して新しく始める" }).click();
  await page.getByRole("button", { name: "取消", exact: true }).click();
  await page.getByRole("button", { name: "続きから再開" }).click();
  await expect(page.getByText("回答済み 1 / 10")).toBeVisible();
});
