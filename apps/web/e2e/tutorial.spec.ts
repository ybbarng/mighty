import { expect, type Page, test } from "@playwright/test";

async function prepare(page: Page) {
  await page.addInitScript(() => {
    sessionStorage.setItem("mighty-splash-seen", "1");
    localStorage.setItem(
      "mighty-settings",
      JSON.stringify({ state: { speed: 1.6, sound: false }, version: 0 }),
    );
  });
}

async function next(page: Page, times = 1) {
  for (let i = 0; i < times; i++)
    await page.getByRole("button", { name: "다음", exact: true }).click();
}

/** 내 차례가 오면 그 카드를 낸다. 겹친 카드는 왼쪽 위 모서리를 누른다 */
async function playCard(page: Page, label: string) {
  await expect(page.getByText("낼 카드를 고르세요")).toBeVisible({
    timeout: 20_000,
  });
  await page
    .getByRole("button", { name: label, exact: true })
    .click({ position: { x: 8, y: 8 } });
}

test("튜토리얼: 설명·퀴즈·미션을 거쳐 단원을 끝낸다", async ({
  page,
}, info) => {
  await prepare(page);
  await page.goto("/");
  await page.getByRole("button", { name: /마이티 배우기/ }).click();
  await expect(page.getByText("0/10")).toBeVisible();

  // 1단원: 설명 세 쪽과 퀴즈 두 개
  await page.getByRole("button", { name: /마이티는 어떤 게임/ }).click();
  await next(page, 3);
  await page.getByRole("button", { name: "♥9" }).click();
  await expect(page.getByText("정답이에요!")).toBeVisible();
  await next(page);
  await page.getByRole("button", { name: "야당" }).click();
  await next(page);
  await expect(page.getByText("단원 완료!")).toBeVisible();
  await page.getByRole("button", { name: "단원 목록으로" }).click();
  await expect(page.getByText("1/10")).toBeVisible();

  // 2단원: 틀리면 다시 풀고, 미션은 실패하면 다시 한다.
  await page.getByRole("button", { name: /트릭 이기기/ }).click();
  await next(page, 2);
  await page.getByRole("button", { name: "♠A" }).click();
  await expect(page.getByText("아쉬워요")).toBeVisible();
  await page.getByRole("button", { name: "다시 풀기" }).click();
  await page.getByRole("button", { name: "♥K" }).click();
  await next(page);
  await page.getByRole("button", { name: "미션 시작" }).click();

  await expect(page.getByText("이 트릭을 가져오세요")).toBeVisible();
  await playCard(page, "♥5");
  await expect(page.getByRole("dialog", { name: "미션 실패" })).toBeVisible({
    timeout: 10_000,
  });
  await page.getByRole("button", { name: "다시 하기" }).click();

  await playCard(page, "♥A");
  await expect(page.getByRole("dialog", { name: "미션 성공" })).toBeVisible({
    timeout: 10_000,
  });
  await page.screenshot({
    path: `test-results/tutorial-${info.project.name}.png`,
  });
  await next(page);
  await expect(page.getByText("단원 완료!")).toBeVisible();
  await page.getByRole("button", { name: "단원 목록으로" }).click();
  await expect(page.getByText("2/10")).toBeVisible();
});
