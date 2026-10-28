import { expect, type Page, test } from "@playwright/test";

/** 판 한 변 줄 수와 가장자리 여백(OmokBoard의 PAD) */
const SIZE = 15;
const PAD = 0.7;
const VIEW = SIZE - 1 + PAD * 2;

const pointName = (x: number, y: number) =>
  `${String.fromCharCode(65 + x)}${SIZE - y}`;

/** 가운데에서 바깥으로 도는 순서(빈칸을 찾을 때) */
const SPIRAL: [number, number][] = [];
for (let r = 0; r <= 7; r++)
  for (let y = 7 - r; y <= 7 + r; y++)
    for (let x = 7 - r; x <= 7 + r; x++)
      if (Math.max(Math.abs(x - 7), Math.abs(y - 7)) === r) SPIRAL.push([x, y]);

const board = (page: Page) => page.getByRole("img", { name: /오목 판/ });
const stones = (page: Page) => page.locator("[data-stone]");

/** 판 위 교차점의 화면 좌표 */
async function pointXY(page: Page, x: number, y: number) {
  const box = await board(page).boundingBox();
  if (!box) throw new Error("판이 안 보인다");
  const unit = box.width / VIEW;
  return {
    x: box.x + (x + PAD) * unit,
    y: box.y + (y + PAD) * unit,
  };
}

/** 빈 자리 하나에 둔다. 휴대폰은 한 번 눌러 겨누고 다시 눌러 둔다 */
async function placeOne(page: Page, touch: boolean): Promise<void> {
  const before = await stones(page).count();
  for (const [x, y] of SPIRAL) {
    const taken = await page
      .locator(`[data-point="${pointName(x, y)}"]`)
      .count();
    if (taken > 0) continue;
    const p = await pointXY(page, x, y);
    if (touch) {
      await page.touchscreen.tap(p.x, p.y);
      await expect(page.getByRole("status")).toContainText(
        `${pointName(x, y)}: 한 번 더 누르면 둔다`,
      );
      await page.touchscreen.tap(p.x, p.y);
    } else await page.mouse.click(p.x, p.y);
    // 금지 자리면 돌이 늘지 않는다. 다음 빈칸으로.
    try {
      await expect(stones(page)).toHaveCount(before + 1, { timeout: 1500 });
      return;
    } catch {}
  }
  throw new Error("둘 곳이 없다");
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    sessionStorage.setItem("mighty-splash-seen", "1");
    if (!sessionStorage.getItem("keep")) localStorage.removeItem("omok-save");
  });
});

test("오목: 게임 목록에서 들어가 입문 컴퓨터와 한 판을 끝까지 둔다", async ({
  page,
}, info) => {
  const touch = info.project.name.startsWith("phone");
  await page.goto("/");
  await page.getByRole("link", { name: /오목/ }).first().click();
  await expect(page).toHaveURL(/\/omok$/);
  await expect(page.getByRole("heading", { name: "오목" })).toBeVisible();
  await page.getByRole("button", { name: "입문" }).click();
  await page.getByRole("button", { name: /흑\(먼저\)/ }).click();
  await page.getByRole("button", { name: "컴퓨터와 시작" }).click();

  await expect(board(page)).toBeVisible();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth,
  );
  expect(overflow).toBe(false);
  await expect(page.getByRole("status")).toContainText("내 차례");
  await page.screenshot({ path: info.outputPath("omok-start.png") });

  // 첫 수와 컴퓨터 답을 보고 무르기로 되돌린다.
  await placeOne(page, touch);
  await expect(stones(page)).toHaveCount(2);
  await page.getByRole("button", { name: "무르기" }).click();
  await expect(stones(page)).toHaveCount(0);

  for (let i = 0; i < 120; i++) {
    if (await page.getByRole("button", { name: "다시 하기" }).isVisible())
      break;
    await expect(page.getByRole("status")).toContainText("내 차례", {
      timeout: 10_000,
    });
    await placeOne(page, touch);
    // 내 수 다음에는 컴퓨터가 두거나 판이 끝난다.
    await expect(
      page.getByRole("status").filter({ hasText: /내 차례|이겼|졌|비겼/ }),
    ).toBeVisible({ timeout: 10_000 });
  }
  await expect(page.getByRole("status")).toHaveText(/이겼어요|졌어요|비겼어요/);
  await page.screenshot({ path: info.outputPath("omok-end.png") });

  // 다 끝난 게임은 이어하기에 남지 않는다.
  await page.getByRole("button", { name: "다시 하기" }).click();
  await expect(
    page.getByRole("button", { name: "컴퓨터와 시작" }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "이어하기" })).toHaveCount(0);
});

test("오목: 두던 게임은 새로고침해도 이어 둔다", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop", "저장은 화면 크기와 상관없다");
  await page.goto("/omok");
  await page.getByRole("button", { name: /흑\(먼저\)/ }).click();
  await page.getByRole("button", { name: "컴퓨터와 시작" }).click();
  await placeOne(page, false);
  await expect(stones(page)).toHaveCount(2);
  // 처음에 지운 저장을 다시 지우지 않게 한다.
  await page.evaluate(() => sessionStorage.setItem("keep", "1"));
  await page.goto("/omok?keep");
  await page.getByRole("button", { name: "이어하기" }).click();
  await expect(stones(page)).toHaveCount(2);
});
