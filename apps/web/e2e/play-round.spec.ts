import { expect, type Page, test } from "@playwright/test";

import { startSolo } from "./start";

/** 스플래시를 건너뛰고 진행을 빠르게 해 둔다 */
async function prepare(page: Page) {
  await page.addInitScript(() => {
    sessionStorage.setItem("mighty-splash-seen", "1");
    localStorage.setItem(
      "mighty-settings",
      JSON.stringify({ state: { speed: 1.6, sound: false }, version: 0 }),
    );
  });
}

/** 낼 수 있는 첫 카드나 지금 필요한 단추를 누른다. 판이 끝나면 true */
async function stepOnce(page: Page): Promise<boolean> {
  if (await page.getByRole("button", { name: "다음 판" }).isVisible())
    return true;
  // 은어(기본으로 켜짐)면 "그냥 내기"가 "쪼콜 아님"으로 보인다.
  for (const name of ["포기", "그냥 내기", "쪼콜 아님"]) {
    const button = page.getByRole("button", { name, exact: true });
    if (await button.isVisible()) {
      await button.click();
      return false;
    }
  }
  const spade = page
    .getByRole("button", { name: "♠" })
    .and(page.locator("[title='스페이드']"));
  if (await spade.first().isVisible()) {
    await spade.first().click();
    return false;
  }
  // 낼 수 있는 카드만 밝게 보이고 누를 수 있다.
  const card = page
    .locator("button[aria-label]:not([disabled]):not([class*='brightness'])")
    .filter({
      hasNot: page.locator("text=뒷면"),
    });
  const candidates = await card.all();
  for (const c of candidates) {
    const label = await c.getAttribute("aria-label");
    if (label && label !== "뒷면 카드" && /^[♠♥◆♣]|조커/.test(label)) {
      // 겹친 손패는 카드의 보이는 왼쪽 위를 누른다.
      await c.click({ position: { x: 8, y: 8 } });
      return false;
    }
  }
  await page.waitForTimeout(250);
  return false;
}

test("컴퓨터 4명과 한 판을 끝까지 한다", async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  await prepare(page);
  await page.goto("/mighty");

  await expect(page.getByRole("img", { name: /마이티/ })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("1-start.png") });

  await startSolo(page);
  await expect(page.getByRole("button", { name: "포기" })).toBeVisible({
    timeout: 15_000,
  });
  await page.screenshot({ path: testInfo.outputPath("2-election.png") });

  let tookTrickShot = false;
  for (let i = 0; i < 400; i++) {
    if (await stepOnce(page)) break;
    if (
      !tookTrickShot &&
      (await page
        .getByText(/\d+\/10( ·|턴)/)
        .first()
        .isVisible())
    ) {
      await page.waitForTimeout(600);
      await page.screenshot({ path: testInfo.outputPath("3-trick.png") });
      tookTrickShot = true;
    }
    await page.waitForTimeout(150);
  }

  // 판이 끝나면 가운데에 크게 승패 문구가 떴다가 사라진다.
  const banner = page.locator("[data-result-banner]");
  await expect(banner).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("4-banner.png") });
  await expect(banner).toBeHidden({ timeout: 5_000 });

  await expect(page.getByRole("button", { name: "다음 판" })).toBeVisible();
  await expect(page.getByRole("heading", { name: /승리|패배/ })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("5-result.png") });
  // 결과 상자와 분석 표 모두 여당·야당 표시가 붙는다.
  await page.getByText("이번 판 분석").click();
  await expect(page.getByText("여당", { exact: true }).first()).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("6-analysis.png") });

  // 손패 카드는 화면 안에 있어야 한다.
  const viewport = page.viewportSize();
  for (const box of await Promise.all(
    (await page.locator("button[aria-label]").all()).map((b) =>
      b.boundingBox(),
    ),
  )) {
    if (!box || !viewport) continue;
    expect(box.x).toBeGreaterThanOrEqual(-1);
    expect(box.x + box.width).toBeLessThanOrEqual(viewport.width + 1);
  }

  expect(errors).toEqual([]);
});

for (const preset of ["표준 5마", "표준 7마"]) {
  test(`${preset}: 공약 단추가 스크롤 없이 다 보인다`, async ({ page }) => {
    await prepare(page);
    await page.goto("/mighty");
    await startSolo(page, preset);
    const bid = page.getByRole("button", { name: /^출마/ });
    await bid.waitFor({ timeout: 20_000 });
    // 눕힌 폰처럼 낮은 화면에서도 패널 안에서 잘리지 않아야 한다.
    await expect(bid).toBeInViewport({ ratio: 1 });
    await expect(page.getByRole("button", { name: "올리기" })).toBeInViewport({
      ratio: 1,
    });
  });
}

test("움직임 줄이기를 켜면 섞고 나눠 주는 연출 없이 바로 공약을 정한다", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await prepare(page);
  await page.goto("/mighty");
  await startSolo(page);
  // 연출이 있으면 2초 넘게 걸린다.
  await expect(page.getByText("공약을 정하세요")).toBeVisible({
    timeout: 1500,
  });
});
