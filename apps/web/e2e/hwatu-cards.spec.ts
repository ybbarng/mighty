import { expect, test } from "@playwright/test";

test("화투 카드 모음: 48장과 화면 조각이 보이고, 가로로 넘치지 않는다", async ({
  page,
}, info) => {
  await page.goto("/hwatu-cards");
  const deck = page.getByRole("region", { name: "48장" });
  await expect(deck.locator("[data-card]")).toHaveCount(48);
  await expect(
    page.getByRole("region", { name: "손패" }).getByRole("button"),
  ).toHaveCount(6);
  await expect(page.getByRole("region", { name: "나 먹은 패" })).toContainText(
    "피 5",
  );
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth,
  );
  expect(overflow).toBe(false);
  await page.screenshot({
    path: info.outputPath("hwatu-cards.png"),
    fullPage: true,
  });
});
