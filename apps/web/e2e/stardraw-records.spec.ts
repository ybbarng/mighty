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
 * 「내 기록」(docs/36 11-23)을 실제 앱 흐름으로: 연습 장부에서 응모하고 추첨을 넘기면 처음 받은 기념 서류
 * ("가장 붐빈 밤 감사장", 결과와 상관없이 응모한 회차로 받는다)가 첫 화면 띠로 알려지고, 「보러 가기」를 누르면
 * 건네받는 연출 → 「받기」 → 내 기록에 남는다. 받은 뒤에는 띠가 다시 뜨지 않는다.
 * 당첨증 QR이 가리키는 공유 응모권 화면이 공개 장부(여기서는 연습 장부)에서 그 응모권을 찾는지도 본다
 */
test("내 기록: 처음 받은 서류는 띠로 알리고 건네받은 뒤 내 기록에 남는다", async ({
  page,
}, info) => {
  test.skip(info.project.name !== "phone-portrait", "흐름 시험은 한 번만");
  await virtualAuthenticator(page);
  await page.goto("/stardraw");
  await page.getByRole("button", { name: "우주인 등록", exact: true }).click();
  await page.getByRole("button", { name: "별을 고르러 가 볼까요?" }).click();
  await page.getByRole("button", { name: "자동", exact: true }).click();
  await page.getByRole("button", { name: "응모하기", exact: true }).click();
  const receipt = page.locator("[data-receipt]");
  await expect(receipt).toBeVisible({ timeout: 30_000 });
  const id = await receipt.getAttribute("data-receipt");

  await page.goto("/stardraw");
  await page.getByRole("button", { name: /건너뛰기/ }).click();
  const notice = page.locator("[data-record-notice]");
  await expect(notice).toBeVisible({ timeout: 30_000 });
  await expect(notice).toContainText("새 기념 서류가 도착했습니다.");

  // 건네받는 연출을 보려고 움직임을 켠다
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await notice.getByRole("button", { name: "보러 가기" }).click();
  const handover = page.locator("[data-record-handover]");
  // 「자동」 번호가 우연히 번호 모양 서류(연속 등)도 받으면 "기념 서류 2개가"가 된다
  await expect(handover).toContainText(/기념 서류( \d+개)?가 도착했습니다\./);
  await page.getByRole("button", { name: "받기" }).click();
  await expect(handover).toHaveCount(0, { timeout: 10_000 });
  await expect(page).toHaveURL(/\/stardraw\/mine#records$/);
  const view = page.locator("[data-my-records]");
  await expect(view.locator("[data-record-award]")).not.toHaveCount(0);

  await page.goto("/stardraw");
  await expect(page.locator("[data-card]")).toBeVisible();
  await expect(notice).toHaveCount(0);

  // 당첨증 QR과 같은 주소(ticketUrl): 공개 장부에서 그 응모권을 찾아 보인다
  await page.goto(`/stardraw/ticket#1-${id}`);
  await expect(page.locator(`[data-receipt='${id}']`)).toBeVisible({
    timeout: 30_000,
  });
});

/**
 * 견본(데모 둘러보기 #tour-records, 1회 1~5등을 모두 내 것으로 친 가짜 장부): 로컬에서
 * NEXT_PUBLIC_STARDRAW_SPECIMENS=1로 빌드했을 때만 있다(운영·CI 빌드에는 없다, stardraw-award-specimens.spec)
 */
test("내 기록 견본: 훈장·당첨증·별 도장·기념 서류가 펼쳐지고 당첨증 QR 자리는 견본", async ({
  page,
}) => {
  test.skip(
    process.env.NEXT_PUBLIC_STARDRAW_SPECIMENS !== "1",
    "견본은 로컬 견본 빌드에서만",
  );
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/stardraw/demo#tour-records");
  const view = page.locator("[data-my-records]");
  await expect(view).toBeVisible({ timeout: 30_000 });
  await expect(view.locator("[data-win-list] li")).toHaveCount(5);
  await expect(view.locator("[data-stamp-book='1'] [data-stamp]")).toHaveCount(
    1,
  );
  // 한 회차에서는 가장 높은 등수만 센다(awards.ts) — 같은 회차의 1등이라 금장 하나
  await expect(view.locator("[data-record-medal]")).toHaveCount(1);
  await expect(view.locator("[data-record-certificate]")).toHaveCount(3);
  await view.locator("[data-record-certificate]").first().click();
  const sheet = page.getByRole("dialog");
  await expect(sheet.locator("[data-certificate-specimen]")).toBeVisible();
  await expect(sheet.locator("[data-certificate-url]")).toHaveCount(0);
  await sheet.getByRole("button", { name: "닫기" }).click();
  await view.locator("[data-record-award]").first().click();
  await expect(
    page.getByRole("dialog").locator("[data-award-document]"),
  ).toContainText("카노푸스 우주국장");
});
