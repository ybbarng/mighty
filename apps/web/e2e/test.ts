import { test as base, type Page } from "@playwright/test";

export type { BrowserContext, Locator, Page } from "@playwright/test";
export { expect } from "@playwright/test";

/**
 * 화면 시험의 `test`. 탭이 페이지를 열거나 새로고침하면, 화면이 단추에 동작을 붙이고 저장값을 읽은 뒤
 * (`<html data-hydrated>`, StoreHydration) 넘어간다. 그 전에 누르면 누름이 사라지거나 늦게 읽힌 저장값이
 * 고른 옵션을 덮어써, 바쁜 기계에서 가끔 실패하던 시험이 된다.
 */
export const test = base.extend({
  context: async ({ context }, use) => {
    for (const page of context.pages()) waitForReady(page);
    context.on("page", waitForReady);
    await use(context);
  },
});

const READY = "html[data-hydrated]";

function waitForReady(page: Page): void {
  const goto = page.goto.bind(page);
  const reload = page.reload.bind(page);
  page.goto = async (...args: Parameters<Page["goto"]>) => {
    const response = await goto(...args);
    await page.locator(READY).waitFor({ state: "attached" });
    return response;
  };
  page.reload = async (...args: Parameters<Page["reload"]>) => {
    const response = await reload(...args);
    await page.locator(READY).waitFor({ state: "attached" });
    return response;
  };
}
