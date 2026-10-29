import { expect, type Page, ready, test } from "./test";

/*
 * 나이롱뽕 화면 시험(docs/30 8절). 혼자 하기는 `?seed=`로 패를 정한다.
 * 뽕 응답 창 시간은 Playwright `page.clock`으로 옮겨, 기기 속도와 상관없이 같은 순간에 끝나게 한다.
 */

const status = (page: Page) => page.getByRole("status").first();
const hand = (page: Page) => page.getByRole("region", { name: "내 손패" });
const ppong = (page: Page) =>
  page.getByRole("button", { name: "뽕!", exact: true });

/** 옵션에서 인원·판 수·컴퓨터를 고르고 처음으로 */
async function choose(
  page: Page,
  {
    players,
    rounds,
    level,
  }: { players: number; rounds: number; level: string },
) {
  await ready(page);
  await page.getByRole("button", { name: "옵션" }).click();
  await page.getByRole("button", { name: `${players}명`, exact: true }).click();
  await page.getByRole("button", { name: `${rounds}판`, exact: true }).click();
  await page.getByRole("button", { name: level, exact: true }).click();
  await page.getByRole("button", { name: "처음으로" }).click();
}

/** 지금 내가 할 수 있는 일이 있나(단추나 버릴 차례) */
async function actionable(page: Page): Promise<boolean> {
  // 암호화방은 뽕한 적이 있으면 스톱할 수 없어도 "한 장 가져오기"를 묻는다.
  for (const name of ["뽕!", "스톱", "다음 판", "한 장 가져오기"])
    if (await page.getByRole("button", { name, exact: true }).isVisible())
      return true;
  if (await page.getByRole("button", { name: /^약 내기/ }).isVisible())
    return true;
  const text = (await status(page).textContent()) ?? "";
  return /버릴 카드|한 장 더 버리세요|약이 됐어요/.test(text);
}

/**
 * 내가 할 일을 하나 한다: 뽕은 부르고, 스톱·약·다음 판은 누르고, 버릴 차례면 첫 카드를 버린다.
 * 휴대폰은 한 번 겨누고 다시 눌러 버린다
 */
async function actOnce(page: Page, touch: boolean): Promise<void> {
  if (await ppong(page).isVisible()) {
    await expect(status(page)).toContainText("뽕할 수 있어요");
    await ppong(page).click();
    return;
  }
  for (const name of ["스톱", "다음 판", "한 장 가져오기"]) {
    const b = page.getByRole("button", { name, exact: true });
    if (await b.isVisible()) {
      await b.click();
      return;
    }
  }
  const yak = page.getByRole("button", { name: /^약 내기/ });
  if (await yak.isVisible()) {
    await yak.click();
    return;
  }
  const card = hand(page).getByRole("button").first();
  if (!(await card.isVisible())) return;
  const id = await card.getAttribute("data-card");
  if (touch) {
    await card.tap();
    await expect(
      hand(page).locator(`[data-card="${id}"][aria-pressed="true"]`),
    ).toHaveCount(1);
    await hand(page).locator(`[data-card="${id}"]`).tap();
  } else await card.click();
  // 버린 카드가 손에서 빠진 뒤 다음으로 간다(같은 카드를 두 번 누르지 않게).
  await expect(hand(page).locator(`[data-card="${id}"]`)).toHaveCount(0, {
    timeout: 15_000,
  });
}

/** `done`이 참이 될 때까지 내 차례마다 한다 */
async function playUntil(
  page: Page,
  touch: boolean,
  done: () => Promise<boolean>,
): Promise<void> {
  for (let i = 0; i < 400; i++) {
    await expect
      .poll(async () => (await done()) || (await actionable(page)), {
        timeout: 30_000,
        intervals: [50],
      })
      .toBe(true);
    if (await done()) return;
    await actOnce(page, touch);
  }
  throw new Error("게임이 끝나지 않았다");
}

const gameOver = (page: Page) => async () =>
  ((await status(page).textContent()) ?? "").includes("게임 끝");

async function noOverflow(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth,
  );
  expect(overflow).toBe(false);
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    sessionStorage.setItem("mighty-splash-seen", "1");
    // 이어하기 저장은 탭에서 처음 열 때만 지운다(새로고침 뒤 이어하기를 본다).
    if (!sessionStorage.getItem("nyrongppong-e2e")) {
      sessionStorage.setItem("nyrongppong-e2e", "1");
      localStorage.removeItem("nyrongppong-save");
    }
  });
});

test("나이롱뽕: 목록에서 들어가 정해진 패로 컴퓨터와 끝까지 하고, 새로고침 뒤 이어한다", async ({
  page,
}, info) => {
  const touch = info.project.name.startsWith("phone");
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await page
    .getByRole("link", { name: /나이롱뽕/ })
    .first()
    .click();
  await expect(page).toHaveURL(/\/nyrongppong$/);
  await expect(page.getByRole("heading", { name: "나이롱뽕" })).toBeVisible();
  await page.screenshot({ path: info.outputPath("nyrongppong-home.png") });

  await choose(page, { players: 4, rounds: 1, level: "입문" });
  await page.goto("/nyrongppong?seed=4");
  await page.getByRole("button", { name: /나홀로 나이롱뽕/ }).click();
  await expect(hand(page)).toBeVisible();
  await expect(page.locator("[data-seat]")).toHaveCount(3);
  await noOverflow(page);
  await page.screenshot({ path: info.outputPath("nyrongppong-table.png") });

  // 내 차례가 한 번 올 때까지 하고 새로고침하면 이어하기가 있다.
  await playUntil(page, touch, async () =>
    /버릴 카드|약이 됐어요/.test((await status(page).textContent()) ?? ""),
  );
  const before = await hand(page).getByRole("button").count();
  await page.reload();
  await page.getByRole("button", { name: /하던 게임 이어하기/ }).click();
  await expect(hand(page).getByRole("button")).toHaveCount(before);

  // 무르기: 한 장 버린 뒤 되돌리면 그 카드가 손에 돌아온다.
  if (/버릴 카드/.test((await status(page).textContent()) ?? "")) {
    const first = await hand(page)
      .getByRole("button")
      .first()
      .getAttribute("data-card");
    await actOnce(page, touch);
    await expect(page.getByRole("button", { name: "무르기" })).toBeEnabled({
      timeout: 15_000,
    });
    await page.getByRole("button", { name: "무르기" }).click();
    await expect(hand(page).locator(`[data-card="${first}"]`)).toHaveCount(1);
  }

  await playUntil(page, touch, gameOver(page));
  await expect(page.locator("[data-outcome]")).toBeVisible();
  await expect(page.getByRole("table", { name: "점수표" })).toBeVisible();
  await noOverflow(page);
  await page.screenshot({ path: info.outputPath("nyrongppong-end.png") });
  expect(errors).toEqual([]);
});

test("나이롱뽕 배우기: 첫 단원 미션에서 12월을 버린다", async ({
  page,
}, info) => {
  const touch = info.project.name.startsWith("phone");
  await page.goto("/nyrongppong");
  await page.getByRole("button", { name: /나이롱뽕 배우기/ }).click();
  await expect(page.getByText("0/5")).toBeVisible();
  await page.getByRole("button", { name: /나이롱뽕은 어떤 게임/ }).click();
  for (let i = 0; i < 2; i++)
    await page.getByRole("button", { name: "다음", exact: true }).click();
  await page.getByRole("button", { name: "19점" }).click();
  await page.getByRole("button", { name: "다음", exact: true }).click();
  await page.getByRole("button", { name: "미션 시작" }).click();
  const twelve = hand(page).locator('[data-card="12g"]');
  await expect(twelve).toBeVisible();
  await noOverflow(page);
  await page.screenshot({ path: info.outputPath("nyrongppong-mission.png") });
  if (touch) {
    await twelve.tap();
    await expect(
      page.getByRole("button", { name: /비 광 버리기/ }),
    ).toBeVisible();
    await twelve.tap();
  } else await twelve.click();
  await expect(page.getByRole("dialog", { name: "미션 성공" })).toBeVisible({
    timeout: 10_000,
  });
  await page.getByRole("button", { name: "다음", exact: true }).click();
  await expect(page.getByText("단원 완료!")).toBeVisible();
});

test("나이롱뽕 뽕 응답 창: 시간이 지나면 넘어가고, 다시 해서 시간 안에 뽕한다", async ({
  page,
}, info) => {
  test.skip(info.project.name !== "desktop", "시계는 화면 크기와 상관없다");
  await page.clock.install();
  await page.goto("/nyrongppong");
  // 앞 단원을 마친 것으로 두고 뽕 단원으로 간다.
  await page.evaluate(() =>
    localStorage.setItem(
      "nyrongppong-tutorial",
      JSON.stringify({ state: { completed: ["goal", "yak"] }, version: 0 }),
    ),
  );
  await page.reload();
  await page.getByRole("button", { name: /나이롱뽕 배우기/ }).click();
  await page.getByRole("button", { name: /뽕 부르기/ }).click();
  await page.getByRole("button", { name: "다음", exact: true }).click();
  await page
    .getByRole("button", { name: "뽕! 세 장을 내려놓고 한 장 더 버린다" })
    .click();
  await page.getByRole("button", { name: "다음", exact: true }).click();
  await page.getByRole("button", { name: "미션 시작" }).click();

  // 응답 시간 8초: 7초가 지나도 아직 뽕할 수 있고, 남은 시간이 보인다.
  await expect(ppong(page)).toBeVisible();
  await page.clock.runFor(7_000);
  await expect(status(page)).toHaveText("뽕할 수 있어요! 1초");
  await page.screenshot({ path: info.outputPath("nyrongppong-call.png") });
  // 시간이 다 되면 넘긴 것이 되어 미션 실패.
  await page.clock.runFor(1_100);
  await expect(page.getByRole("dialog", { name: "미션 실패" })).toBeVisible();
  await page.getByRole("button", { name: "다시 하기" }).click();
  await expect(ppong(page)).toBeVisible();
  await page.clock.runFor(3_000);
  await ppong(page).click();
  await expect(page.getByRole("dialog", { name: "미션 성공" })).toBeVisible();
});

test("나이롱뽕: 방장이 방을 만들고 친구가 링크로 들어와 끝까지 하고, 판 끝 검증을 통과한다", async ({
  context,
}, info) => {
  test.skip(info.project.name !== "desktop", "데스크톱에서만 돌린다");
  const host = await context.newPage();
  const guest = await context.newPage();
  const errors: string[] = [];
  for (const p of [host, guest])
    p.on("pageerror", (e) => errors.push(e.message));

  // 온라인은 버릴 때마다 모두 3초씩 뽕 창을 기다린다. 대국을 돌리는 방장 화면 시계를 가짜로 두고,
  // 아무도 할 일이 없을 때만 앞으로 당겨 창 기다림을 건너뛴다(정해진 시간 기다리기 없음).
  await host.clock.install();
  await host.goto("/nyrongppong?net=local");
  await choose(host, { players: 2, rounds: 1, level: "입문" });
  await host.getByRole("button", { name: /다함께 나이롱뽕/ }).click();
  await host.getByPlaceholder("친구에게 보일 이름").fill("방장");
  await host.getByRole("button", { name: "방 만들기", exact: true }).click();
  const link = await host.locator("input[readonly]").inputValue();
  expect(link).toContain("/nyrongppong");

  await guest.goto(link);
  await guest.getByPlaceholder("친구에게 보일 이름").fill("철수");
  await guest.getByRole("button", { name: "들어가기" }).click();
  await expect(host.getByText("철수")).toBeVisible();
  await host.getByRole("button", { name: "시작하기" }).click();
  await expect(hand(guest)).toBeVisible();
  await expect(hand(host)).toBeVisible();

  // 두 화면이 번갈아 제 할 일을 한다. 게임이 끝날 때까지.
  for (let i = 0; i < 400; i++) {
    if ((await gameOver(host)()) && (await gameOver(guest)())) break;
    await expect
      .poll(
        async () => {
          if (
            (await actionable(host)) ||
            (await actionable(guest)) ||
            ((await gameOver(host)()) && (await gameOver(guest)()))
          )
            return true;
          await host.clock.runFor(1_000);
          return false;
        },
        { timeout: 30_000, intervals: [50] },
      )
      .toBe(true);
    for (const p of [host, guest])
      if (await actionable(p)) await actOnce(p, false);
  }
  await expect(status(guest)).toContainText("게임 끝");
  await guest.screenshot({ path: info.outputPath("nyrongppong-online.png") });

  // 방장이 나가면 기록과 섞은 값이 공개되고, 참가자가 처음부터 다시 계산해 확인한다.
  await host.getByRole("button", { name: "← 나이롱뽕" }).click();
  await expect(guest.getByText(/\[검증\] 나 — 문제없음/)).toBeVisible({
    timeout: 10_000,
  });
  expect(errors).toEqual([]);
});

test("나이롱뽕: 끝낸 게임은 내 기록에 쌓이고 복기에서 한 걸음씩 다시 본다", async ({
  page,
}, info) => {
  test.skip(info.project.name !== "desktop", "기록은 화면 크기와 상관없다");
  await page.goto("/nyrongppong");
  await choose(page, { players: 2, rounds: 1, level: "중수" });
  await page.goto("/nyrongppong?seed=3");
  await page.getByRole("button", { name: /나홀로 나이롱뽕/ }).click();
  await playUntil(page, false, gameOver(page));
  // 복기 기록이 실제로 쓰인 뒤에 떠난다.
  await page.waitForFunction(
    () =>
      new Promise<boolean>((resolve) => {
        const open = indexedDB.open("mighty-review", 1);
        open.onupgradeneeded = () =>
          open.result.createObjectStore("games", { keyPath: "id" });
        open.onsuccess = () => {
          const all = open.result
            .transaction("games")
            .objectStore("games")
            .getAll();
          all.onsuccess = () => {
            open.result.close();
            resolve(
              (all.result as { game: string; over: boolean }[]).some(
                (g) => g.game === "nyrongppong" && g.over,
              ),
            );
          };
        };
      }),
  );

  await page.goto("/profile?game=nyrongppong");
  await expect(page.getByRole("tab", { name: "🎴 나이롱뽕" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await expect(page.getByText("판 1등")).toBeVisible();

  await page.goto("/review");
  await page.getByRole("button", { name: /🎴 나이롱뽕 · 혼자/ }).click();
  await page.getByRole("button", { name: "처음" }).click();
  await expect(page.getByRole("status")).toContainText("1판 · 0/");
  await page.getByRole("button", { name: "한 걸음 앞으로" }).click();
  await expect(page.getByRole("status")).toContainText("1판 · 1/");
  await expect(page.getByText(/다음 수: /)).toBeVisible({ timeout: 10_000 });
  await page.screenshot({ path: info.outputPath("nyrongppong-review.png") });
});
