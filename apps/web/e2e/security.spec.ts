import { expect, test } from "@playwright/test";

/** 어떻게 지켜지나요? — 시연이 실제 코드로 막고 잡아내는지 */
test("보안 설명 페이지의 시연이 조작을 잡아낸다", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop", "데스크톱에서만 돌린다");
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/security");
  await expect(
    page.getByRole("heading", { name: "어떻게 지켜지나요?" }),
  ).toBeVisible();

  // 섞기: 방장이 바꿔치기하면 들킨다.
  await page.getByRole("button", { name: /방장이 ②에서/ }).click();
  await page.getByRole("button", { name: /① 해시만 먼저 공개/ }).click();
  await page.getByRole("button", { name: /② 비밀 값 공개/ }).click();
  await expect(page.getByText(/0번 자리의 값이 약속과 다르다/)).toBeVisible();

  // 판 끝 검증: 기록을 조작하면 걸린다.
  await expect(page.getByText(/모두 맞다/)).toBeVisible();
  await page.getByRole("button", { name: "조작", exact: true }).nth(3).click();
  await expect(
    page.getByText(/규칙에 맞지 않는다|화면과 다르다|기록과 맞지 않는다/),
  ).toBeVisible();

  // 방장 확인: 가짜 방장은 지문이 다르다.
  await page.getByRole("button", { name: /자기 열쇠로 서명/ }).click();
  await expect(page.getByText(/지문이 링크\(k=\)와 다르다/)).toBeVisible();
  await page.getByRole("button", { name: /진짜 방장이 답함/ }).click();
  await expect(page.getByText(/방장으로 믿는다/)).toBeVisible();
  await page.screenshot({
    path: info.outputPath("security.png"),
    fullPage: true,
  });
  expect(errors).toEqual([]);
});
