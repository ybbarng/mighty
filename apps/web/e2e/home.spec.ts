import { expect, test } from "@playwright/test";

test("첫 화면: 게임 목록과 보안·기록으로 가는 길이 보이고 가로로 넘치지 않는다", async ({
  page,
}, info) => {
  await page.addInitScript(() =>
    sessionStorage.setItem("mighty-splash-seen", "1"),
  );
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "게임" })).toBeVisible();
  for (const [name, path] of [
    [/마이티/, "/mighty"],
    [/하트/, "/hearts"],
    [/어떻게 지켜지나요/, "/security"],
    [/보안 배우기/, "/learn"],
    [/내 기록/, "/profile"],
  ] as const)
    await expect(page.getByRole("link", { name }).first()).toHaveAttribute(
      "href",
      path,
    );
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth,
  );
  expect(overflow).toBe(false);
  await page.screenshot({ path: info.outputPath("home.png"), fullPage: true });

  await page
    .getByRole("link", { name: /마이티/ })
    .first()
    .click();
  await expect(page).toHaveURL(/\/mighty$/);
  await page.getByRole("link", { name: /게임 목록/ }).click();
  await expect(page).toHaveURL(/\/$/);
});
