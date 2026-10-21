import { expect, type Page, test } from "@playwright/test";

/** 하트: 숨은 입구, 혼자 한 판, 친구와 한 판 */
async function prepare(page: Page) {
  await page.addInitScript(() => {
    sessionStorage.setItem("mighty-splash-seen", "1");
    localStorage.setItem(
      "mighty-settings",
      JSON.stringify({ state: { speed: 1.6, sound: false }, version: 0 }),
    );
    // 고수는 생각이 길어 시험에서는 중수와 한다.
    localStorage.setItem(
      "hearts-settings",
      JSON.stringify({ state: { level: 1 }, version: 0 }),
    );
  });
}

/** 내 손패에서 지금 낼 수 있는(밝은) 카드 */
function myCards(page: Page) {
  return page
    .locator("button[data-card]:not([disabled]):not([class*='brightness'])")
    .filter({ hasNotText: /^$/ });
}

/** 지금 할 일을 하나 한다. 판이 끝났으면 true */
async function stepOnce(page: Page): Promise<boolean> {
  if (await page.getByRole("button", { name: "다음 판" }).isVisible())
    return true;
  const pass = page.getByRole("button", { name: "넘기기", exact: true });
  if (await pass.isVisible()) {
    for (let k = 0; k < 3 && (await pass.isDisabled()); k++)
      await myCards(page)
        .nth(k)
        .click({ position: { x: 8, y: 8 } });
    if (await pass.isEnabled()) await pass.click();
    return false;
  }
  if (await page.getByText(/낼 카드를 고르세요/).isVisible()) {
    await myCards(page)
      .first()
      .click({ position: { x: 8, y: 8 } });
  }
  return false;
}

test("마이티 로고를 다섯 번 누르면 하트로 간다", async ({ page }) => {
  await prepare(page);
  await page.goto("/");
  const logo = page.locator("h1 div").first();
  for (let i = 0; i < 5; i++) await logo.click();
  await expect(page).toHaveURL(/\/hearts$/);
  await expect(page.getByRole("button", { name: /나홀로 하트/ })).toBeVisible();
  // 한 번 찾으면 마이티 첫 화면에 ♥ 단추가 남는다.
  await page.goto("/");
  await expect(page.getByRole("button", { name: "하트" })).toBeVisible();
});

test("하트: 카드를 넘기고 한 판을 끝까지 둔다", async ({ page }, info) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await prepare(page);
  await page.goto("/hearts");
  await page.getByRole("button", { name: /나홀로 하트/ }).click();
  await expect(page.getByText(/넘길 카드 3장/)).toBeVisible({
    timeout: 20_000,
  });
  await page.screenshot({ path: info.outputPath("hearts-1-pass.png") });

  let shot = false;
  for (let i = 0; i < 400; i++) {
    if (await stepOnce(page)) break;
    if (!shot && (await page.getByText(/2\/13턴/).isVisible())) {
      await page.screenshot({ path: info.outputPath("hearts-2-trick.png") });
      shot = true;
    }
    await page.waitForTimeout(150);
  }
  await expect(page.getByRole("button", { name: "다음 판" })).toBeVisible();
  await page.screenshot({ path: info.outputPath("hearts-3-result.png") });
  await page.getByRole("button", { name: "점수판" }).click();
  await expect(page.getByRole("dialog", { name: "점수판" })).toBeVisible();
  await page.getByRole("button", { name: "닫기" }).click();
  await page.getByRole("button", { name: "다음 판" }).click();
  // 둘째 판은 오른쪽으로 넘긴다.
  await expect(page.getByText(/오른쪽\(.+\)에게 넘길 카드/)).toBeVisible({
    timeout: 20_000,
  });
  expect(errors).toEqual([]);
});

test("하트: 방장이 방을 만들고 친구가 들어와 한 판을 둔다", async ({
  context,
}, info) => {
  test.skip(info.project.name !== "desktop", "데스크톱에서만 돌린다");
  const host = await context.newPage();
  const guest = await context.newPage();
  const errors: string[] = [];
  for (const p of [host, guest]) {
    p.on("pageerror", (e) => errors.push(e.message));
    await prepare(p);
  }
  await host.goto("/hearts?net=local");
  await host.getByRole("button", { name: /다함께 하트/ }).click();
  await host.getByPlaceholder("친구들에게 보일 이름").fill("방장");
  await host.getByRole("button", { name: "방 만들기", exact: true }).click();
  const link = await host.locator("input[readonly]").inputValue();
  expect(link).toContain("/hearts");
  expect(link).toContain("room=");

  await guest.goto(link);
  await guest.getByPlaceholder("친구들에게 보일 이름").fill("철수");
  await guest.getByRole("button", { name: "들어가기" }).click();
  await expect(guest.getByText("방장이 시작하기를 기다리는 중")).toBeVisible();
  await expect(host.getByText("철수")).toBeVisible();
  await host.getByRole("button", { name: "시작하기" }).click();
  await expect(guest.getByRole("button", { name: "점수판" })).toBeVisible();

  for (let i = 0; i < 600; i++) {
    const [h, g] = [await stepOnce(host), await stepOnce(guest)];
    if (h && g) break;
    await host.waitForTimeout(80);
  }
  await expect(host.getByRole("button", { name: "다음 판" })).toBeVisible();
  await expect(guest.getByRole("button", { name: "다음 판" })).toBeVisible();
  await guest.screenshot({ path: info.outputPath("hearts-online-guest.png") });

  // 방장이 나가면 기록이 공개되고 참가자가 공정성을 확인한다.
  await host.getByRole("button", { name: "나가기" }).click();
  await expect(
    guest.getByText("공정성 확인: 섞기와 진행에 문제가 없습니다"),
  ).toBeVisible({ timeout: 10_000 });
  expect(errors).toEqual([]);
});
