import { expect, fixStardrawClock, type Page, test } from "./test";

test.beforeEach(({ page }) => fixStardrawClock(page));

/** 패스키는 Chrome 가상 인증기(CDP WebAuthn)로 */
async function virtualAuthenticator(page: Page) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("WebAuthn.enable");
  await cdp.send("WebAuthn.addVirtualAuthenticator", {
    options: {
      protocol: "ctap2",
      transport: "internal",
      hasResidentKey: true,
      hasUserVerification: true,
      isUserVerified: true,
      automaticPresenceSimulation: true,
    },
  });
}

/** 첫 화면에서 자동으로 별 6개를 골라 응모하고 첫 화면으로 돌아온다 */
async function enterAuto(page: Page, first: boolean) {
  // 처음엔 첫 화면 입구에서 우주인 등록, 그 뒤로는 회차 카드의 「별 6개 고르기」
  if (first) {
    await page
      .getByRole("button", { name: "우주인 등록", exact: true })
      .click();
    await page.getByRole("button", { name: "별을 고르러 가 볼까요?" }).click();
  } else await page.getByRole("button", { name: "별 6개 고르기" }).click();
  await page.getByRole("button", { name: "자동", exact: true }).click();
  await page.getByRole("button", { name: "응모하기", exact: true }).click();
  await expect(page.locator("[data-receipt]")).toBeVisible({ timeout: 30_000 });
  await page.goto("/stardraw");
}

/**
 * 응모한 회차의 추첨이 끝났는데 아직 열어 보지 않았으면 별 따기 어느 화면에서든 위쪽에 알림 띠가 뜬다.
 * 띠에는 숫자·등수가 없고, 「추첨 보기」로 그 회차 추첨으로 가며, 닫으면 다시 띄우지 않는다
 */
test("추첨이 끝난 내 회차 알림 띠: 숫자 없이, 추첨 보기로 이어지고, 닫으면 다시 뜨지 않는다", async ({
  page,
}, info) => {
  await virtualAuthenticator(page);
  await page.goto("/stardraw");
  await enterAuto(page, true);
  const notice = page.locator("[data-drawn-notice]");
  await expect(notice).toHaveCount(0);

  // 화면을 열어 둔 채 추첨이 끝나면 그 자리에서 뜬다
  const skip = page.getByRole("button", { name: /다음 추첨까지 건너뛰기/ });
  await skip.click();
  await expect(notice).toHaveAttribute("data-drawn-notice", "1", {
    timeout: 30_000,
  });
  await expect(notice).toHaveText(/1회 추첨이 끝났습니다/);
  await expect(notice.locator("[data-ball]")).toHaveCount(0);
  await expect(notice).not.toContainText(/당첨|낙첨|등/);

  // 다른 화면에서도 뜬다
  await page.goto("/stardraw/rounds");
  await expect(notice).toHaveAttribute("data-drawn-notice", "1");
  await page.screenshot({
    path: info.outputPath("stardraw-drawn-notice.png"),
  });

  // 「추첨 보기」 → 그 회차 추첨, 열어 본 회차는 다시 뜨지 않는다
  await notice.getByRole("button", { name: "추첨 보기" }).click();
  await expect(page).toHaveURL(/\/stardraw\/rounds#draw-1$/);
  await expect(page.locator("[data-draw-result]")).toBeVisible({
    timeout: 30_000,
  });
  await page.goto("/stardraw/mine");
  await expect(page.getByRole("region", { name: "내 응모" })).toBeVisible();
  await expect(notice).toHaveCount(0);

  // 다음 회차에 응모해 추첨을 넘긴 뒤 닫으면, 새로고침해도 뜨지 않는다
  await page.goto("/stardraw");
  await enterAuto(page, false);
  await skip.click();
  await expect(notice).toHaveAttribute("data-drawn-notice", "2", {
    timeout: 30_000,
  });
  await notice.getByRole("button", { name: "닫기" }).click();
  await expect(notice).toHaveCount(0);
  await page.reload();
  await expect(page.locator("[data-envelope='2']")).toBeVisible();
  await expect(notice).toHaveCount(0);
});
