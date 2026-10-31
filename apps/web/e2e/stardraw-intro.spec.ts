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

/**
 * 처음 온 사람에게 무엇을 하는 곳인지: 별자리판에 정답 예시 별 6개와 가짜 별자리, 그 6개 번호 공(2026-11-01 사용자).
 * 화면 시험은 움직임 줄이기라 첫 예시에 멈춰 있다. 응모하고 나면 첫 화면에서 빠진다
 */
test("첫 화면 정답 예시: 별자리판과 번호 공(처음 온 사람도 다녀간 사람도)", async ({
  page,
}, info) => {
  await virtualAuthenticator(page);
  await page.goto("/stardraw");
  const intro = page.locator("section[aria-label='정답 예시']");
  await expect(intro).toBeVisible();
  await expect(intro.getByRole("heading")).toHaveText(
    "45개의 별 중 이번에 빛날 별 6개를 맞혀 보세요",
  );
  await expect(intro.locator("canvas")).toBeVisible();
  // 당첨 별 6개 + 보너스 1개, 별자리 선은 6개끼리만(5개)
  await expect(intro.locator("[data-ball]")).toHaveCount(7);
  await expect(intro.locator("line")).toHaveCount(5);
  // 처음 온 사람은 입구: 바로 아래 우주인 등록으로 이어진다
  await expect(
    page.getByRole("button", { name: "우주인 등록", exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: info.outputPath("intro-first.png"),
    fullPage: true,
  });

  // 등록하고 응모한 뒤에도 첫 화면 모양은 같다(예시가 그대로 있다)
  // 처음 온 사람은 첫 화면 입구에서 바로 우주인 등록
  await page.getByRole("button", { name: "우주인 등록", exact: true }).click();
  await page.getByRole("button", { name: "별을 고르러 가 볼까요?" }).click();
  await page.getByRole("button", { name: "자동", exact: true }).click();
  await page.getByRole("button", { name: "응모하기", exact: true }).click();
  await expect(page.locator("[data-receipt]")).toBeVisible({ timeout: 30_000 });
  await page.goto("/stardraw");
  await expect(page.locator("[data-card]").first()).toBeVisible();
  await expect(intro).toBeVisible();
});
