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

/**
 * 화면이 준비될 때까지 기다린다. goto·reload는 저절로 기다리지만, 링크를 눌러 새 문서로 넘어간 뒤
 * 바로 단추를 누를 때는 이것을 먼저 부른다(같은 문서 안에서 넘어갔으면 이미 준비돼 있어 바로 지나간다)
 */
export async function ready(page: Page): Promise<void> {
  await page.locator(READY).waitFor({ state: "attached" });
}

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

/**
 * 하늘의 별 따기 화면 시험의 시작 시각(2026-11-02 12:05 한국 시각). 연습 장부는 매시 :55에 마감하고 정각에 추첨해,
 * 실제 시각이 :55~정각에 걸리면 "앞 회차 추첨이 끝나면 응모할 수 있습니다"로 바뀌어 같은 시험이 가끔 실패했다
 * (2026-10-31 CI). 마감에서 50분 떨어진 이 시각에서 시작하게 고정하고, 그 뒤로는 시계가 저절로 흐른다
 * (연출을 앞당기는 시험은 이 위에서 `page.clock.runFor`를 부른다). 실제 시각에 따라 결과가 달라지지 않는다
 */
export const STARDRAW_START = new Date("2026-11-02T03:05:00Z");

/** 별 따기 시험마다 시작 전에 부른다: `test.beforeEach(({ page }) => fixStardrawClock(page))` */
export async function fixStardrawClock(page: Page): Promise<void> {
  await page.clock.install({ time: STARDRAW_START });
}
