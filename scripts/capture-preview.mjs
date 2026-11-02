import { chromium } from "@playwright/test";
const browser = await chromium.launch();
for (const width of [320, 390, 768, 1280]) {
  const page = await browser.newPage({ viewport: { width, height: 844 } });
  await page.goto("http://127.0.0.1:4180/verse-practice/");
  await page.getByRole("heading", { name: "今日のテーマ" }).waitFor();
  await page.screenshot({ path: `.tools/home-${width}.png`, fullPage: true });
  if (width === 390) {
    await page.getByRole("button", { name: "練習を始める" }).click();
    await page.locator(".options button").first().click();
    await page.getByRole("button", { name: "次へ" }).waitFor();
    await page.screenshot({ path: ".tools/quiz-390.png", fullPage: true });
  }
  await page.close();
}
await browser.close();
