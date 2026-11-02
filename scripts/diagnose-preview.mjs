import { chromium } from "@playwright/test";
const browser = await chromium.launch();
const page = await browser.newPage();
page.on("console", (m) => console.log(m.type(), m.text()));
page.on("pageerror", (e) => console.log("pageerror", e.message));
page.on("requestfailed", (r) => console.log("failed", r.url(), r.failure()));
await page.goto("http://127.0.0.1:4180/verse-practice/#/settings");
await page.waitForTimeout(3000);
console.log(await page.locator("main").innerText());
console.log(
  await page.evaluate(async () => ({
    registrations: (await navigator.serviceWorker.getRegistrations()).map(
      (r) => ({
        scope: r.scope,
        active: r.active?.state,
        waiting: r.waiting?.state,
        installing: r.installing?.state,
      }),
    ),
    caches: await caches.keys(),
  })),
);
await page.screenshot({ path: ".tools/settings.png", fullPage: true });
await browser.close();
