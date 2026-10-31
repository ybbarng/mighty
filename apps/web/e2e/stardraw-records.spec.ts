import { expect, test } from "./test";

/**
 * 「내 기록」(docs/36 11-23): 데모 둘러보기의 가짜 장부(1회 1~5등 응모권을 모두 내 것으로 친다)로
 * 훈장·당첨증·관측 수첩·당첨 내역·기념 서류가 받은 것만 보이고, 누르면 크게 펼쳐지는지 본다.
 * 움직임 줄이기라 펼침 연출을 기다리지 않는다
 */
test.use({ reducedMotion: "reduce" });

test("내 기록: 받은 훈장·당첨증·별 도장·기념 서류가 보이고 누르면 펼쳐진다", async ({
  page,
}) => {
  await page.goto("/stardraw/demo#tour-records");
  const view = page.locator("[data-my-records]");
  await expect(view).toBeVisible({ timeout: 30_000 });

  // 당첨 내역: 1~5등 한 번씩
  await expect(view.locator("[data-win-counts]")).toContainText("1");
  await expect(view.locator("[data-win-list] li")).toHaveCount(5);
  // 관측 수첩: 4등 도장 하나
  await expect(view.locator("[data-stamp-book='1'] [data-stamp]")).toHaveCount(
    1,
  );
  // 훈장: 한 회차에서는 가장 높은 등수만 센다(awards.ts) — 같은 회차의 1등이라 금장 하나
  await expect(view.locator("[data-record-medal]")).toHaveCount(1);
  await expect(view.locator("[data-record-medal='medal-gold']")).toBeVisible();
  // 당첨증: 1~3등
  await expect(view.locator("[data-record-certificate]")).toHaveCount(3);

  // 당첨증을 펼치면 검증 QR과 직인
  await view.locator("[data-record-certificate]").first().click();
  const sheet = page.getByRole("dialog");
  await expect(sheet.locator("[data-certificate]")).toBeVisible();
  await expect(
    sheet.getByRole("img", { name: "공개 장부에서 이 응모권 확인하기" }),
  ).toBeVisible();
  await sheet.getByRole("button", { name: "닫기" }).click();
  await expect(sheet).toHaveCount(0);

  // 기념 서류: 받은 것은 마침표로 끝나는 본문으로 펼쳐진다
  const award = view.locator("[data-record-award]").first();
  await award.click();
  const doc = page.getByRole("dialog").locator("[data-award-document]");
  await expect(doc).toBeVisible();
  await expect(doc).toContainText("카노푸스 우주국장");
});
