import { expect, test } from "./test";

test("관측 기록: 지난 회차에서 들어가 공개 장부로 계산한 통계를 보고 돌아간다", async ({
  page,
}, info) => {
  test.skip(info.project.name === "phone-landscape", "데스크톱·휴대폰 세로로");
  await page.goto("/stardraw");
  // 연습 장부를 두 회차 넘겨 추첨한 회차를 만든다
  const skip = page.getByRole("button", { name: /다음 추첨까지 건너뛰기/ });
  await skip.click();
  await skip.click();
  await page.locator("[data-tab='rounds']").click();
  await page.getByRole("button", { name: "관측 기록" }).click();
  await expect(page).toHaveURL(/\/stardraw\/stats$/);

  const stats = page.getByRole("region", { name: "관측 기록" });
  await expect(stats).toBeVisible();
  await expect(stats.locator("dt:text-is('추첨') + dd")).toHaveText("2회");
  await expect(stats.getByText(/아직 2회뿐이라/)).toBeVisible();
  // 두 회차 당첨 번호(겹치면 12개보다 적다)만큼 관측 하늘에 빛이 있다
  const glows = page.locator("[data-observed-sky] circle[data-drawn]");
  expect(await glows.count()).toBeGreaterThan(5);
  await expect(page.locator("[data-fairness]")).toBeVisible();
  await expect(stats.getByText("한 번도 떨어지지 않은 별")).toBeVisible();

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth,
  );
  expect(overflow).toBe(false);
  await page.screenshot({
    path: info.outputPath("stardraw-stats.png"),
    fullPage: true,
  });

  // 새로고침해도 관측 기록, 돌아가기는 지난 회차
  await page.reload();
  await expect(page.getByRole("region", { name: "관측 기록" })).toBeVisible();
  await page.getByRole("button", { name: "← 지난 회차" }).click();
  await expect(page.getByRole("region", { name: "지난 회차" })).toBeVisible();
});
