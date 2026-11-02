import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
const url = process.argv[2] || "https://genki140.github.io/verse-practice/";
for (const asset of [
  "",
  "manifest.webmanifest",
  "sw.js",
  "icon-192.png",
  "icon-512.png",
  "apple-touch-icon.png",
]) {
  const response = await fetch(new URL(asset, url));
  assert.equal(response.status, 200, asset);
  console.log(`HTTP 200 ${asset || "index"}`);
  if (asset === "manifest.webmanifest") {
    const manifest = await response.json();
    assert.equal(manifest.scope, "/verse-practice/");
    assert.equal(manifest.start_url, "/verse-practice/");
  }
}
const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
});
let page = await context.newPage();
const requests = new Set();
page.on("request", (r) => requests.add(new URL(r.url()).origin));
await page.goto(url);
await page.getByRole("heading", { name: "今日のテーマ" }).waitFor();
await page.screenshot({ path: ".tools/public-home.png", fullPage: true });
await page.getByRole("link", { name: "設定", exact: true }).click();
await page.getByText("✓ オフラインで練習できます").waitFor();
const registration = await page.evaluate(async () => {
  const r = await navigator.serviceWorker.getRegistration();
  return { scope: r.scope, active: r.active?.state };
});
assert.equal(registration.scope, new URL(".", url).href);
console.log("SW", registration);
await page.close();
await context.setOffline(true);
page = await context.newPage();
await page.goto(url);
await page.getByRole("button", { name: /死別と希望/ }).click();
await page.getByRole("button", { name: "練習を始める" }).click();
for (let i = 0; i < 2; i++) {
  await page.locator(".options button").first().click();
  await page.locator(".feedback").waitFor();
  if (i === 0) {
    await page.screenshot({ path: ".tools/public-quiz.png", fullPage: true });
    await page.reload();
    await page.locator(".feedback").waitFor();
  }
  await page
    .getByRole("button", { name: i === 1 ? "結果を見る" : "次へ" })
    .click();
}
await page.getByRole("heading", { name: "おつかれさまでした" }).waitFor();
await page.reload();
await page.getByRole("heading", { name: "おつかれさまでした" }).waitFor();
console.log(
  "公開版：offline新規ページ起動・2問回答・解説再開・結果再表示に成功",
);
console.log("初回画面の通信先origin", [...requests]);
assert.deepEqual([...requests], [new URL(url).origin]);
await browser.close();
