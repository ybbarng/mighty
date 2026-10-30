import { expect, type Page, test } from "./test";

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
 * 2026-10-31 실제 사례(운영, 안드로이드 폰): 결과 봉투를 열지 않은 채 여러 회차가 지나자 첫 화면이 그 봉투에 갇혔다.
 * 응모 단추가 없었고, 봉투를 누르면 그 회차 추첨 대신 지난 회차 목록이 떠 "열어 봄"이 기록되지 않았다.
 * 연습 장부에서 같은 상황(응모 → 열지 않고 여러 번 건너뛰기)을 만들어 세 가지를 본다:
 * 봉투가 있어도 지금 회차 응모 단추가 있고, 봉투는 그 회차 추첨으로 가며, 열면 첫 화면이 다음 상태로 넘어간다
 */
test("오래 열지 않은 결과 봉투: 응모 단추는 늘 있고, 봉투는 그 회차 추첨으로, 열면 봉투에서 빠진다", async ({
  page,
}) => {
  await virtualAuthenticator(page);
  await page.goto("/stardraw");
  await page.getByRole("button", { name: "별 6개 고르기" }).click();
  await page.getByRole("button", { name: "우주인 등록", exact: true }).click();
  await page.getByRole("button", { name: "별을 고르러 가 볼까요?" }).click();
  await page.getByRole("button", { name: "자동", exact: true }).click();
  await page.getByRole("button", { name: "응모하기", exact: true }).click();
  await expect(page.locator("[data-receipt]")).toBeVisible({ timeout: 30_000 });

  // 1회 결과를 열지 않고 네 회차를 건너뛴다
  await page.goto("/stardraw");
  const skip = page.getByRole("button", { name: /다음 추첨까지 건너뛰기/ });
  for (let i = 0; i < 4; i++) {
    await skip.click();
    await expect(skip).toBeEnabled({ timeout: 30_000 });
  }
  await page.reload();
  const card = page.locator("[data-card='result']");
  await expect(card).toContainText("1회 추첨 끝");
  // (가) 봉투가 있어도 지금 회차 응모 단추
  await expect(
    card.getByRole("button", { name: "별 6개 고르기" }),
  ).toBeVisible();

  // (나) 봉투는 그 회차 추첨으로(목록이 아니라)
  await card.locator("[data-envelope]").click();
  await expect(page).toHaveURL(/\/stardraw\/rounds#draw-1$/);
  await expect(page.getByRole("heading", { name: /1회 추첨/ })).toBeVisible();
  await expect(page.locator("[data-draw-result]")).toBeVisible({
    timeout: 30_000,
  });

  // (다) 열었으니 첫 화면은 봉투 없이 지금 회차로
  await page.goto("/stardraw");
  await expect(page.locator("[data-card='open']")).toBeVisible();
  await expect(page.locator("[data-envelope]")).toHaveCount(0);
});
