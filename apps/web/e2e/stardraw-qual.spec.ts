import { expect, type Page, test } from "./test";

/**
 * 소속(docs/36 11-13, 화면에서는 "상품 자격" 대신 "소속"). 실제 구글 로그인은 화면 시험에서 부르지 않는다(서버의 토큰 확인은 서버 시험이 본다).
 * 데모는 데모 기관 계정으로 같은 흐름을 돈다: 데모 소속 차리기 → 받기(가린 도장) → 복구 코드 → 다음 회차 응모에 증서
 */

async function demoUnlock(page: Page, purpose: "create" | "sign") {
  const sheet = page.locator(`[data-demo-unlock='${purpose}']`);
  await expect(sheet).toBeVisible({ timeout: 30_000 });
  await sheet.getByRole("button", { name: "확인" }).click();
  await expect(sheet).toHaveCount(0);
}

async function noSideScroll(page: Page) {
  const overflow = await page.evaluate(
    () =>
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);
}

test("데모 소속: 데모 기관 계정으로 받아 복구 코드를 보고, 다음 회차 응모권에 소속이 표시된다", async ({
  page,
}, info) => {
  test.skip(
    info.project.name === "phone-landscape",
    "데스크톱과 휴대폰 세로로 본다",
  );
  await page.goto("/stardraw/demo#qualify");
  const panel = page.locator("[data-qualify]");
  await expect(panel).toBeVisible({ timeout: 30_000 });
  await panel.getByRole("button", { name: "데모 소속 차리기" }).click();
  const period = panel.locator("[data-qual-period]");
  await expect(period).toContainText("벌집 성단", {
    timeout: 60_000,
  });
  await period.getByRole("button", { name: "데모 기관 계정으로 받기" }).click();
  await expect(panel.locator("[data-qual-holding]")).toContainText(
    /소속 번호 Q-[0-9A-Z]{4}-[0-9A-Z]{4}/,
  );
  await expect(panel.locator("[data-qual-code]")).toHaveText(
    /^SDQ1-[0-9A-Z]+$/,
  );
  await panel.getByRole("button", { name: "QR 보기" }).click();
  await expect(panel.getByRole("img", { name: "복구 코드 QR" })).toBeVisible();
  // 복구 코드는 받은 직후에만 보이고, 다시 열면 등록증 확인을 거쳐야 보인다(2026-10-31 보안 검토 B5)
  await page.reload();
  await expect(panel.locator("[data-qual-holding]")).toBeVisible({
    timeout: 30_000,
  });
  await expect(panel.locator("[data-qual-code]")).toHaveCount(0);
  await expect(panel.locator("[data-qual-reveal]")).toBeVisible();
  await noSideScroll(page);
  await page.screenshot({
    path: info.outputPath("demo-qualify.png"),
    fullPage: true,
  });

  // 우주인 등록(흉내 시트) 뒤, 받은 회차에는 증서를 붙이지 않는다
  const setup = page.locator("[data-key-setup]");
  await setup.getByRole("button", { name: "우주인 등록", exact: true }).click();
  await demoUnlock(page, "create");
  await demoUnlock(page, "sign");
  await page.getByRole("button", { name: "별을 고르러 가 볼까요?" }).click();
  await expect(page.locator("[data-qual-toggle]")).toHaveCount(0);

  // 다음 회차: 「벌집 성단 소속으로 응모」가 켜진 채로 응모하면 영수증에 소속
  await page.getByRole("button", { name: "지금 추첨" }).click();
  await expect(page.locator("[data-qual-toggle='on']")).toContainText(
    "벌집 성단 소속으로 응모",
    { timeout: 60_000 },
  );
  await page.getByRole("button", { name: "자동", exact: true }).click();
  await page.getByRole("button", { name: "응모하기", exact: true }).click();
  await demoUnlock(page, "sign");
  await expect(page.locator("[data-receipt-qual]")).toContainText(/^Q-/, {
    timeout: 30_000,
  });
  await page.screenshot({
    path: info.outputPath("demo-qual-receipt.png"),
    fullPage: true,
  });
});

test("소속 페이지와 개인정보처리방침: 열린 기간이 없으면 그렇게 알리고, 가로로 넘치지 않는다", async ({
  page,
}, info) => {
  await page.goto("/stardraw/qualify");
  await expect(
    page.getByRole("heading", { name: "소속", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("지금 받을 수 있는 소속이 없습니다."),
  ).toBeVisible({ timeout: 30_000 });
  await noSideScroll(page);
  await page.getByRole("link", { name: "개인정보처리방침" }).click();
  await expect(
    page.getByRole("heading", { name: "개인정보처리방침" }),
  ).toBeVisible();
  await expect(
    page.getByText(/이름·사진·연락처는 받지 않습니다/),
  ).toBeVisible();
  await noSideScroll(page);
  await page.screenshot({
    path: info.outputPath("stardraw-privacy.png"),
    fullPage: true,
  });
});
