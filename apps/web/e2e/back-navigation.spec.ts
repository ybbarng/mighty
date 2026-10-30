import { expect, type Page, test } from "./test";

/**
 * 게임 앱 화면과 브라우저 기록(game/screen-history): 하위 화면에서 뒤로가기는 바로 전 화면으로,
 * 옵션·배우기 목록은 새로고침해도 그 화면, 온라인 판은 뒤로가기 전에 묻는다.
 * 당겨서 새로고침은 판 화면에서만 막는다(html[data-no-pull]).
 * 모든 게임이 같은 훅을 쓰므로 대표로 오목(판 게임)과 하트(카드 게임)를 본다. 크기와 상관없는 논리라 한 크기만.
 */

const noPull = (page: Page) => page.locator("html[data-no-pull]");
const ONE_SIZE = "화면 크기와 상관없는 기록 논리라 데스크톱에서만";

test("하위 화면에서 뒤로가기는 시작 화면으로, 옵션·배우기 목록은 새로고침해도 남는다", async ({
  page,
}, info) => {
  test.skip(info.project.name !== "desktop", ONE_SIZE);
  await page.goto("/omok");
  const solo = page.getByRole("button", { name: /나홀로 오목/ });
  await expect(solo).toBeVisible();
  await expect(noPull(page)).toHaveCount(0);

  await page.getByRole("button", { name: /오목 배우기/ }).click();
  await expect(page).toHaveURL(/#learn$/);
  await page.reload();
  await expect(page.getByRole("heading", { level: 1 })).toContainText("오목");
  await expect(page).toHaveURL(/#learn$/);
  await expect(solo).toHaveCount(0);
  await page.goBack();
  // 새로고침한 문서의 첫 칸은 배우기 목록이라, 뒤로가기는 그 앞(옵션을 누르기 전 시작 화면) 문서로 간다
  await expect(solo).toBeVisible();

  await page.getByRole("button", { name: "옵션" }).click();
  await expect(page).toHaveURL(/#options$/);
  await page.goBack();
  await expect(solo).toBeVisible();
  await expect(page).not.toHaveURL(/#/);
});

test("혼자 하는 대국은 판에서만 당겨서 새로고침을 막고, 뒤로가기는 묻지 않고 시작 화면(이어하기)으로", async ({
  page,
}, info) => {
  test.skip(info.project.name !== "desktop", ONE_SIZE);
  await page.goto("/omok");
  await page.getByRole("button", { name: /나홀로 오목/ }).click();
  await expect(page.getByRole("img", { name: /오목 판/ })).toBeVisible();
  await expect(noPull(page)).toHaveCount(1);
  await page.getByRole("img", { name: /오목 판/ }).click({
    position: { x: 160, y: 160 },
  });

  await page.goBack();
  await expect(page.locator("[data-leave-confirm]")).toHaveCount(0);
  await expect(page.getByRole("button", { name: /나홀로 오목/ })).toBeVisible();
  await expect(noPull(page)).toHaveCount(0);
});

test("온라인 방에서 뒤로가기는 먼저 묻고, 계속 하기면 방에 남고 나가기면 시작 화면으로", async ({
  page,
}, info) => {
  test.skip(info.project.name !== "desktop", ONE_SIZE);
  await page.goto("/hearts?net=local");
  await page.getByRole("button", { name: /다함께 하트/ }).click();
  await page.getByPlaceholder("친구들에게 보일 이름").fill("방장");
  await page.getByRole("button", { name: "방 만들기", exact: true }).click();
  // 방이 만들어지면 초대 링크 칸이 생긴다
  const roomCode = page.locator("input[readonly]");
  await expect(roomCode).toBeVisible();
  await expect(noPull(page)).toHaveCount(1);

  await page.goBack();
  const confirm = page.locator("[data-leave-confirm]");
  await expect(confirm).toBeVisible();
  await confirm.getByRole("button", { name: "계속 하기" }).click();
  await expect(confirm).toHaveCount(0);
  await expect(roomCode).toBeVisible();

  await page.goBack();
  await confirm.getByRole("button", { name: "나가기" }).click();
  await expect(page.getByRole("button", { name: /다함께 하트/ })).toBeVisible();
  await expect(page).not.toHaveURL(/room=/);
  await expect(noPull(page)).toHaveCount(0);
});
