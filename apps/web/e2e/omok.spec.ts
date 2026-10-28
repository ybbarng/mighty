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

/**
 * 이 브라우저의 복기 기록(IndexedDB `mighty-review`)에 남은 끝난 오목 게임 수.
 * 앱이 DB를 만들기 전에 열면 빈 DB가 먼저 생겨 앱의 저장소 만들기가 건너뛰어지므로, 있을 때만 연다
 */
async function finishedOmokGames(): Promise<number> {
  const names = await indexedDB.databases();
  if (!names.some((d) => d.name === "mighty-review")) return 0;
  return new Promise((resolve, reject) => {
    const open = indexedDB.open("mighty-review", 1);
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const db = open.result;
      if (!db.objectStoreNames.contains("games")) {
        db.close();
        resolve(0);
        return;
      }
      const all = db.transaction("games").objectStore("games").getAll();
      all.onerror = () => reject(all.error);
      all.onsuccess = () => {
        const games = all.result as { game: string; over: boolean }[];
        db.close();
        resolve(games.filter((g) => g.game === "omok" && g.over).length);
      };
    };
  });
}

/** 첫 화면 → 옵션에서 컴퓨터(고르면)와 흑을 고르고 → 나홀로 오목 */
async function startSolo(page: Page, level?: string) {
  await page.getByRole("button", { name: "옵션" }).click();
  if (level) await page.getByRole("button", { name: level }).click();
  await page.getByRole("button", { name: /흑\(먼저\)/ }).click();
  await page.getByRole("button", { name: "처음으로" }).click();
  await page.getByRole("button", { name: /나홀로 오목/ }).click();
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
  await page.screenshot({ path: info.outputPath("omok-home.png") });
  await startSolo(page, "입문");

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
  await expect(page.getByRole("button", { name: /나홀로 오목/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /이어하기/ })).toHaveCount(0);
});

test("오목: 두던 게임은 새로고침해도 이어 둔다", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop", "저장은 화면 크기와 상관없다");
  await page.goto("/omok");
  await startSolo(page);
  await placeOne(page, false);
  await expect(stones(page)).toHaveCount(2);
  // 처음에 지운 저장을 다시 지우지 않게 한다.
  await page.evaluate(() => sessionStorage.setItem("keep", "1"));
  await page.goto("/omok?keep");
  await page.getByRole("button", { name: /이어하기/ }).click();
  await expect(stones(page)).toHaveCount(2);
});

test("오목: 방장이 방을 만들고 친구가 링크로 들어와 한 판을 둔다", async ({
  context,
}, info) => {
  test.skip(info.project.name !== "desktop", "데스크톱에서만 돌린다");
  const host = await context.newPage();
  const guest = await context.newPage();
  const errors: string[] = [];
  for (const p of [host, guest])
    p.on("pageerror", (e) => errors.push(e.message));

  await host.goto("/omok?net=local");
  await host.getByRole("button", { name: /다함께 오목/ }).click();
  await host.getByPlaceholder("친구에게 보일 이름").fill("방장");
  await host.getByRole("button", { name: "방 만들기", exact: true }).click();
  // 친구가 들어오기 전에는 시작할 수 없다.
  await expect(
    host.getByRole("button", { name: "친구가 들어오면 시작할 수 있어요" }),
  ).toBeDisabled();
  const link = await host.locator("input[readonly]").inputValue();
  expect(link).toContain("/omok");
  expect(link).toContain("room=");

  await guest.goto(link);
  await guest.getByPlaceholder("친구에게 보일 이름").fill("철수");
  await guest.getByRole("button", { name: "들어가기" }).click();
  await expect(guest.getByText("방장이 시작하기를 기다리는 중")).toBeVisible();
  await expect(host.getByText("철수")).toBeVisible();
  await host.getByRole("button", { name: "시작하기" }).click();
  await expect(board(guest)).toBeVisible();
  await expect(guest.getByText("방장", { exact: true })).toBeVisible();

  const over = (p: Page) => p.getByRole("button", { name: "다시 하기" });
  for (let i = 0; i < 300; i++) {
    if ((await over(host).isVisible()) && (await over(guest).isVisible()))
      break;
    for (const p of [host, guest])
      if (
        (await p.getByRole("status").textContent())?.includes("내 차례") &&
        !(await over(p).isVisible())
      )
        await placeOne(p, false);
    await host.waitForTimeout(50);
  }
  await expect(over(host)).toBeVisible();
  await expect(over(guest)).toBeVisible();
  // 두 화면의 판이 같다.
  expect(await stones(guest).count()).toBe(await stones(host).count());
  await guest.screenshot({ path: info.outputPath("omok-online-guest.png") });

  // 방장이 나가면 기록이 공개되고, 참가자가 처음부터 다시 둬 보며 확인한다.
  await host.getByRole("button", { name: "← 오목" }).click();
  await expect(guest.getByText(/검증.*문제없음/)).toBeVisible({
    timeout: 10_000,
  });
  expect(errors).toEqual([]);
});

test("오목: 끝낸 판은 내 기록에 쌓이고 복기에서 한 수씩 다시 본다", async ({
  page,
}, info) => {
  test.skip(info.project.name !== "desktop", "기록은 화면 크기와 상관없다");
  await page.goto("/omok");
  await startSolo(page);
  await placeOne(page, false);
  await expect(stones(page)).toHaveCount(2);
  await page.getByRole("button", { name: "기권" }).click();
  await expect(page.getByRole("status")).toHaveText("기권했어요");
  // 복기 기록은 IndexedDB에 비동기로 쓴다. 끝난 판이 실제로 쓰인 뒤에 떠난다(바로 떠나면 쓰기가 끊긴다).
  await expect.poll(() => page.evaluate(finishedOmokGames)).toBe(1);

  await page.goto("/profile?game=omok");
  await expect(page.getByRole("tab", { name: "● 오목" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await expect(page.getByText("0승 1패 0무")).toBeVisible();

  await page.goto("/review");
  await page.getByRole("button", { name: /● 오목 · 혼자/ }).click();
  // 끝난 장면부터 보인다. 처음으로 가면 빈 판, 한 수 앞으로 가면 돌 하나.
  await expect(stones(page)).toHaveCount(2);
  await page.getByRole("button", { name: "처음" }).click();
  await expect(stones(page)).toHaveCount(0);
  await page.getByRole("button", { name: "한 수 앞으로" }).click();
  await expect(stones(page)).toHaveCount(1);
  await expect(page.getByText(/다음 수: /)).toBeVisible();
  await page.screenshot({ path: info.outputPath("omok-review.png") });
});

/** 판의 한 자리에 둔다. 휴대폰은 겨누고 다시 눌러 둔다 */
async function placeAt(page: Page, x: number, y: number, touch: boolean) {
  const p = await pointXY(page, x, y);
  if (touch) {
    await page.touchscreen.tap(p.x, p.y);
    await page.touchscreen.tap(p.x, p.y);
  } else await page.mouse.click(p.x, p.y);
}

test("오목 배우기: 단원을 끝내고, 미션은 틀리면 다시 한다", async ({
  page,
}, info) => {
  const touch = info.project.name.startsWith("phone");
  await page.goto("/omok");
  await page.getByRole("button", { name: /오목 배우기/ }).click();
  await expect(page.getByText("0/5")).toBeVisible();

  // 1단원: 설명(판 그림) → 퀴즈 → 다섯 잇기 미션
  await page.getByRole("button", { name: /오목은 어떤 게임/ }).click();
  await expect(board(page)).toBeVisible();
  await page.getByRole("button", { name: "다음", exact: true }).click();
  await page.getByRole("button", { name: "ㄱ자로 꺾인 줄" }).click();
  await expect(page.getByText("정답이에요!")).toBeVisible();
  await page.getByRole("button", { name: "다음", exact: true }).click();
  await page.getByRole("button", { name: "미션 시작" }).click();
  await expect(stones(page)).toHaveCount(8);
  await page.screenshot({ path: info.outputPath("omok-mission.png") });
  await placeAt(page, 11, 7, touch); // L8
  await expect(page.getByRole("dialog", { name: "미션 성공" })).toBeVisible({
    timeout: 10_000,
  });
  await page.getByRole("button", { name: "다음", exact: true }).click();
  await expect(page.getByText("단원 완료!")).toBeVisible();
  await page.getByRole("button", { name: "단원 목록으로" }).click();
  await expect(page.getByText("1/5")).toBeVisible();

  // 2단원: 넷을 막지 않으면 실패, 다시 해서 막으면 성공
  await page.getByRole("button", { name: /막기/ }).click();
  for (let i = 0; i < 2; i++)
    await page.getByRole("button", { name: "다음", exact: true }).click();
  await page.getByRole("button", { name: /한쪽만 막을 수 있어/ }).click();
  await page.getByRole("button", { name: "다음", exact: true }).click();
  await page.getByRole("button", { name: "미션 시작" }).click();
  await placeAt(page, 0, 14, touch); // A1
  await expect(page.getByRole("dialog", { name: "미션 실패" })).toBeVisible({
    timeout: 10_000,
  });
  await page.getByRole("button", { name: "다시 하기" }).click();
  await expect(stones(page)).toHaveCount(8);
  await placeAt(page, 7, 7, touch); // H8
  await expect(page.getByRole("dialog", { name: "미션 성공" })).toBeVisible({
    timeout: 10_000,
  });

  // 튜토리얼 대국은 이어하기에 남지 않는다.
  await page.goto("/omok");
  await expect(page.getByText("1/5 단원 마침")).toBeVisible();
  await expect(page.getByRole("button", { name: /이어하기/ })).toHaveCount(0);
});
