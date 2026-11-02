import { test, expect } from "@playwright/test";
import { createServer, type Server } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { resolve, extname } from "node:path";
import { execFileSync } from "node:child_process";
let server: Server;
let version = "a";
let failAsset = false;
let failedRequests = 0;
test.beforeAll(async () => {
  execFileSync(
    process.execPath,
    ["node_modules/vite/bin/vite.js", "build", "--outDir", ".tools/update-b"],
    { env: { ...process.env, VITE_APP_BUILD: "update-test-B" }, stdio: "pipe" },
  );
  server = createServer((req, res) => {
    const path = decodeURIComponent(
      new URL(req.url!, "http://localhost").pathname,
    );
    if (!path.startsWith("/verse-practice/")) {
      res.writeHead(404).end();
      return;
    }
    const root = resolve(version === "a" ? "dist" : ".tools/update-b");
    const file = resolve(
      root,
      path.slice("/verse-practice/".length) || "index.html",
    );
    if (!file.startsWith(root) || !existsSync(file)) {
      res.writeHead(404).end();
      return;
    }
    if (
      failAsset &&
      req.headers["sec-fetch-dest"] === "empty" &&
      file.includes("assets") &&
      file.endsWith(".js")
    ) {
      failedRequests++;
      res.writeHead(503).end("test unavailable");
      return;
    }
    const mime: Record<string, string> = {
      ".html": "text/html",
      ".js": "application/javascript",
      ".css": "text/css",
      ".png": "image/png",
      ".webmanifest": "application/manifest+json",
    };
    res.writeHead(200, {
      "Content-Type": mime[extname(file)] || "application/octet-stream",
      "Cache-Control": "no-store",
    });
    res.end(readFileSync(file));
  });
  await new Promise<void>((r) => server.listen(4181, "127.0.0.1", r));
});
test.afterAll(async () => {
  await new Promise<void>((r) => server.close(() => r()));
});
test("2ビルド更新：あとで→保存して更新→snapshotで続行", async ({ page }) => {
  version = "a";
  failAsset = false;
  await page.goto("http://127.0.0.1:4181/verse-practice/#/settings");
  await expect(page.getByText("✓ オフラインで練習できます")).toBeVisible();
  await page.getByRole("link", { name: "練習", exact: true }).click();
  await page.getByRole("button", { name: "練習を始める" }).click();
  version = "b";
  await page.evaluate(async () => {
    await (await navigator.serviceWorker.getRegistration())?.update();
  });
  await expect(
    page.getByRole("button", { name: "中断して更新" }),
  ).toBeVisible();
  await page.evaluate(() => {
    const original = IDBDatabase.prototype.transaction;
    let fail = true;
    IDBDatabase.prototype.transaction = function (stores, mode, options) {
      if (mode === "readwrite" && fail) {
        fail = false;
        throw new DOMException("test failure", "QuotaExceededError");
      }
      return original.call(this, stores, mode, options);
    };
  });
  await page.locator(".options button").first().click();
  await expect(
    page.getByRole("button", { name: "保存を再試行" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "中断して更新" }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "保存を再試行" }).click();
  await expect(page.locator(".feedback")).toBeVisible();
  const original = await page.locator(".options").innerText();
  await expect(
    page.getByText("更新があります。学習内容を保存して更新できます。"),
  ).toBeVisible();
  await page.getByRole("button", { name: "あとで", exact: true }).click();
  await expect(page.locator(".feedback")).toBeVisible();
  await page.getByRole("link", { name: "設定", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "中断して更新" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "中断して更新" }).click();
  await expect(page.getByText(/アプリ update-test-B/)).toBeVisible();
  await page.getByRole("link", { name: "練習", exact: true }).click();
  await page.getByRole("button", { name: "続きから再開" }).click();
  await expect(page.locator(".feedback")).toBeVisible();
  await expect(page.getByText("回答済み 1 / 10")).toBeVisible();
  expect(await page.locator(".options").innerText()).toBe(original);
});
test("precache失敗では準備完了を表示しない", async ({ page }) => {
  version = "b";
  failAsset = true;
  failedRequests = 0;
  await page.goto("http://127.0.0.1:4181/verse-practice/#/settings");
  await expect(
    page.getByRole("heading", { name: "設定・使い方" }),
  ).toBeVisible();
  await expect.poll(() => failedRequests).toBeGreaterThan(0);
  await expect(page.getByText("✓ オフラインで練習できます")).toHaveCount(0);
  expect(
    await page.evaluate(
      async () => !!(await navigator.serviceWorker.getRegistration())?.active,
    ),
  ).toBe(false);
});
