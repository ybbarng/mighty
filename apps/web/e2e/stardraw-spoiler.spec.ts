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
 * 추첨보다 정답이 먼저 보이지 않게(spoiler.ts): 응모한 회차의 결과가 나와도 이 기기에서 추첨을 열어 보기 전에는
 * 영수증·내 응모·지난 회차·회차 결과·관측 기록 어디에도 당첨 번호와 등수가 없고 「추첨 보기」만 있다.
 * 추첨을 보고 나면 모든 곳에 보인다
 */
test("응모한 회차는 추첨을 본 뒤에야 어디서든 정답이 보인다", async ({
  page,
}, info) => {
  await virtualAuthenticator(page);
  await page.goto("/stardraw");
  await page.getByRole("button", { name: "별 6개 고르기" }).click();
  await page.getByRole("button", { name: "우주인 등록", exact: true }).click();
  await page.getByRole("button", { name: "별을 고르러 가 볼까요?" }).click();
  await page.getByRole("button", { name: "자동", exact: true }).click();
  await page.getByRole("button", { name: "응모하기", exact: true }).click();
  const receipt = page.locator("[data-receipt]");
  await expect(receipt).toBeVisible({ timeout: 30_000 });
  const id = await receipt.getAttribute("data-receipt");

  // 1회 추첨을 넘긴다(열어 보지 않는다)
  await page.goto("/stardraw");
  const skip = page.getByRole("button", { name: /다음 추첨까지 건너뛰기/ });
  await skip.click();
  await expect(page.locator("[data-envelope='1']")).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.locator("[data-last-round]")).toHaveCount(0);

  // 영수증: 당첨 번호 줄과 결과 문장 대신 「추첨 보기」
  await page.goto(`/stardraw/mine#t-${id}`);
  await expect(receipt.locator("[data-draw-first='1']")).toBeVisible();
  await expect(receipt.locator("[data-result-numbers]")).toHaveCount(0);
  await expect(receipt.locator("[data-result]")).toHaveCount(0);
  await expect(receipt.locator(".sd-ball-hit")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "추첨 다시 보기" }),
  ).toHaveCount(0);
  await page.screenshot({
    path: info.outputPath("stardraw-spoiler-receipt.png"),
    fullPage: true,
  });

  // 내 응모: 등수 대신 「추첨 보기」
  await page.goto("/stardraw/mine");
  const mine = page.getByRole("region", { name: "내 응모" });
  await expect(mine.locator("[data-draw-first='1']")).toBeVisible();
  await expect(mine).not.toContainText(/당첨|낙첨/);
  await expect(page.getByRole("region", { name: "당첨 안내" })).toHaveCount(0);
  await page.screenshot({ path: info.outputPath("stardraw-spoiler-mine.png") });

  // 지난 회차 목록: 그 회차 줄에 번호와 당첨 수가 없다
  await page.goto("/stardraw/rounds");
  const row = page.locator("[data-round='1']");
  await expect(row.locator("[data-draw-first='1']")).toBeVisible();
  await expect(row.locator("[data-ball]")).toHaveCount(0);
  await expect(row).not.toContainText("당첨");
  await page.screenshot({
    path: info.outputPath("stardraw-spoiler-rounds.png"),
  });

  // 회차 결과: 번호·등수별 당첨이 없다
  await page.goto("/stardraw/rounds#1");
  await expect(page.locator("[data-draw-first='1']")).toBeVisible();
  await expect(page.locator("[data-rank]")).toHaveCount(0);
  await expect(page.locator("[data-ball]")).toHaveCount(0);

  // 관측 기록: 가린 회차는 빼고 센다
  await page.goto("/stardraw/stats");
  await expect(page.getByRole("region", { name: "관측 기록" })).toBeVisible();
  await expect(page.locator("[data-observed-sky]")).toHaveCount(0);

  // 영수증의 「추첨 보기」 → 그 회차 추첨
  await page.goto(`/stardraw/mine#t-${id}`);
  await receipt.locator("[data-draw-first='1']").click();
  await expect(page).toHaveURL(/\/stardraw\/rounds#draw-1$/);
  await expect(page.locator("[data-draw-result]")).toBeVisible({
    timeout: 30_000,
  });

  // 이제 모든 곳에 보인다
  await page.goto(`/stardraw/mine#t-${id}`);
  await expect(receipt.locator("[data-result-numbers]")).toBeVisible();
  await expect(receipt.locator("[data-result]")).toBeVisible();
  await expect(page.locator("[data-draw-first]")).toHaveCount(0);
  await page.screenshot({
    path: info.outputPath("stardraw-spoiler-receipt-open.png"),
    fullPage: true,
  });
  await page.goto("/stardraw/mine");
  await expect(mine).toContainText(/당첨|낙첨/);
  await page.goto("/stardraw/rounds");
  await expect(row.locator("[data-ball]")).toHaveCount(7);
  await page.goto("/stardraw/rounds#1");
  await expect(page.locator("[data-rank]")).toHaveCount(5);
  await page.goto("/stardraw");
  await expect(page.locator("[data-last-round='1']")).toBeVisible();
  await expect(page.locator("[data-envelope]")).toHaveCount(0);
});
