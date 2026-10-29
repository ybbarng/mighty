import { expect, type Page, test } from "@playwright/test";

const status = (page: Page) => page.getByRole("status").first();
const over = (page: Page) => page.getByRole("button", { name: "다시 하기" });
const throwButton = (page: Page) => page.locator("[data-throw]");
/** 지금 움직일 수 있는 판 위 말 묶음 */
const movableStacks = (page: Page) => page.locator("[data-stack]:enabled");
const newPiece = (page: Page) => page.locator("[data-new-piece]");

/** 말 하나를 고른다. PC는 눌러서 바로, 휴대폰은 겨누고(한 번) 다시 눌러 움직인다 */
async function pickTarget(page: Page, touch: boolean): Promise<boolean> {
  const stack = movableStacks(page).first();
  const target = (await stack.count()) > 0 ? stack : newPiece(page);
  if ((await target.count()) === 0) return false;
  if (touch) {
    await target.tap();
    // 겨눈 뒤에는 갈 곳이 보인다.
    await expect(page.locator("[data-preview-to]")).toBeVisible();
    await target.tap();
  } else await target.click();
  return true;
}

/** 내 할 일(던지기·움직이기)이 생기거나 게임이 끝날 때까지 기다렸다가 하나 한다. 끝났으면 false */
async function playStep(page: Page, touch: boolean): Promise<boolean> {
  await expect(
    throwButton(page)
      .or(movableStacks(page))
      .or(newPiece(page))
      .or(over(page))
      .first(),
  ).toBeVisible({ timeout: 20_000 });
  if (await over(page).isVisible()) return false;
  if (await throwButton(page).isVisible()) {
    await throwButton(page).click();
    return true;
  }
  await pickTarget(page, touch);
  return true;
}

/**
 * 내 던지기 차례가 될 때까지 움직이기를 마저 한다. 그때는 컴퓨터 수가 모두 화면에 보인 뒤라
 * 판이 멈춰 있다(수를 세거나 기권해도 대기열에 걸리지 않는다)
 */
async function untilMyThrow(page: Page): Promise<void> {
  for (let i = 0; i < 40; i++) {
    await expect(
      throwButton(page)
        .or(movableStacks(page))
        .or(newPiece(page))
        .or(over(page))
        .first(),
    ).toBeVisible({ timeout: 20_000 });
    if (await throwButton(page).isVisible()) return;
    if (await over(page).isVisible()) throw new Error("게임이 먼저 끝났다");
    await pickTarget(page, false);
  }
  throw new Error("던지기 차례가 오지 않는다");
}

/** IndexedDB 복기 기록에 남은 끝난 윷놀이 게임 수(omok.spec과 같은 방식) */
async function finishedYutGames(): Promise<number> {
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
        resolve(games.filter((g) => g.game === "yut" && g.over).length);
      };
    };
  });
}

/** 옵션에서 컴퓨터 단계와 말 수를 고르고 → 나홀로 윷놀이 */
async function startSolo(page: Page, pieces = "2개") {
  await page.getByRole("button", { name: "옵션" }).click();
  await page.getByRole("button", { name: "입문", exact: true }).click();
  await page.getByRole("button", { name: pieces, exact: true }).click();
  await page.getByRole("button", { name: "처음으로" }).click();
  await page.getByRole("button", { name: /나홀로 윷놀이/ }).click();
}

test.beforeEach(async ({ page }) => {
  // 던지기·말 움직임 연출을 실제 시간으로 기다리지 않는다(연출 자체는 화면 시험의 대상이 아니다)
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.addInitScript(() => {
    sessionStorage.setItem("mighty-splash-seen", "1");
    if (!sessionStorage.getItem("keep")) localStorage.removeItem("yut-save");
  });
});

test("윷놀이: 게임 목록에서 들어가 입문 컴퓨터와 두다가 판 끝 화면까지 간다", async ({
  page,
}, info) => {
  const touch = info.project.name.startsWith("phone");
  await page.goto("/");
  await page
    .getByRole("link", { name: /윷놀이/ })
    .first()
    .click();
  await expect(page).toHaveURL(/\/yut$/);
  await expect(page.getByRole("heading", { name: "윷놀이" })).toBeVisible();
  await page.screenshot({ path: info.outputPath("yut-home.png") });
  await startSolo(page);
  await expect(page.locator("[data-yut-board]")).toBeVisible();

  // 내 차례가 올 때까지 기다려 한 번 던지고, 첫 움직임 뒤 무르기로 되돌린다.
  await expect(throwButton(page)).toBeVisible({ timeout: 20_000 });
  await page.screenshot({ path: info.outputPath("yut-throw.png") });
  await throwButton(page).click();
  await expect(
    movableStacks(page).or(newPiece(page)).or(throwButton(page)).first(),
  ).toBeVisible({ timeout: 20_000 });
  await page.screenshot({ path: info.outputPath("yut-move.png") });
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth,
  );
  expect(overflow).toBe(false);
  if (await newPiece(page).isVisible()) {
    await pickTarget(page, touch);
    await expect(page.getByRole("button", { name: "무르기" })).toBeEnabled({
      timeout: 20_000,
    });
    await page.getByRole("button", { name: "무르기" }).click();
    // 무르면 같은 결과로 다시 고른다(던지기 결과는 사슬로 정해져 있다).
    await expect(newPiece(page)).toBeVisible({ timeout: 20_000 });
  }

  // 몇 수 더 둔 뒤 기권해 판 끝 화면(가운데 띠·결과·다시 하기)을 본다. 끝까지 두는 진행은
  // 엔진 단위 시험과 아래 온라인 시험이 본다. 판 끝 화면은 이기든 기권하든 같은 모양이다.
  for (let i = 0; i < 4; i++) if (!(await playStep(page, touch))) break;
  if (!(await over(page).isVisible())) {
    await untilMyThrow(page);
    await page.getByRole("button", { name: "기권" }).click();
  }
  await expect(over(page)).toBeVisible();
  await expect(status(page)).toHaveText(/이겼|먼저 말을 모두|기권/);
  await expect(page.locator("[data-result-banner]")).toBeVisible();
  await page.screenshot({ path: info.outputPath("yut-end.png") });

  // 다 끝난 게임은 이어하기에 남지 않는다.
  await over(page).click();
  await expect(
    page.getByRole("button", { name: /나홀로 윷놀이/ }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: /이어하기/ })).toHaveCount(0);
});

test("윷놀이: 하던 게임은 새로고침해도 이어 한다", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop", "저장은 화면 크기와 상관없다");
  await page.goto("/yut");
  await startSolo(page, "4개");
  for (let i = 0; i < 6; i++) await playStep(page, false);
  await untilMyThrow(page);
  // 말이 움직이는 연출 중에는 도착 점의 말을 잠깐 숨긴다. 연출이 끝난 뒤에 센다.
  await expect(page.locator("[data-moving]")).toHaveCount(0);
  const before = await page.locator("[data-stack]").count();
  await page.evaluate(() => sessionStorage.setItem("keep", "1"));
  await page.goto("/yut?keep");
  await page.getByRole("button", { name: /이어하기/ }).click();
  await expect(page.locator("[data-yut-board]")).toBeVisible();
  await expect(page.locator("[data-stack]")).toHaveCount(before);
  // 이어서 던지기·움직이기가 된다(내 사슬 공개도 자동).
  await playStep(page, false);
  await playStep(page, false);
});

test("윷놀이: 방장이 방을 만들고 친구가 링크로 들어와 두다가 판을 끝내고 판 끝 검증을 통과한다", async ({
  context,
}, info) => {
  test.skip(info.project.name !== "desktop", "데스크톱에서만 돌린다");
  const host = await context.newPage();
  const guest = await context.newPage();
  const errors: string[] = [];
  for (const p of [host, guest])
    p.on("pageerror", (e) => errors.push(e.message));

  await host.goto("/yut?net=local");
  // 판을 짧게: 말 2개
  await host.getByRole("button", { name: "옵션" }).click();
  await host.getByRole("button", { name: "2개", exact: true }).click();
  await host.getByRole("button", { name: "처음으로" }).click();
  await host.getByRole("button", { name: /다함께 윷놀이/ }).click();
  await host.getByPlaceholder("친구에게 보일 이름").fill("방장");
  await host.getByRole("button", { name: "방 만들기", exact: true }).click();
  const link = await host.locator("input[readonly]").inputValue();
  expect(link).toContain("/yut");

  await guest.goto(link);
  await guest.getByPlaceholder("친구에게 보일 이름").fill("철수");
  await guest.getByRole("button", { name: "들어가기" }).click();
  await expect(guest.getByText("방장이 시작하기를 기다리는 중")).toBeVisible();
  await expect(host.getByText("철수")).toBeVisible();
  await host.getByRole("button", { name: "시작하기" }).click();
  await expect(guest.locator("[data-yut-board]")).toBeVisible();
  await guest.screenshot({
    path: info.outputPath("yut-online-guest-start.png"),
  });

  // 둘이 몇 번씩 던지고 움직인 뒤 방장이 기권한다. 판 끝 검증은 그때까지의 모든 던지기
  // (양쪽 사슬 공개)를 다시 계산한다. 끝까지 두는 진행은 엔진·방 단위 시험이 본다.
  let actions = 0;
  for (let i = 0; i < 1500 && actions < 12; i++) {
    if ((await over(host).isVisible()) && (await over(guest).isVisible()))
      break;
    for (const p of [host, guest]) {
      if (await over(p).isVisible()) continue;
      if (await throwButton(p).isVisible()) {
        await throwButton(p).click();
        actions++;
      } else if (
        (await movableStacks(p).count()) > 0 ||
        (await newPiece(p).count()) > 0
      ) {
        await pickTarget(p, false);
        actions++;
      }
    }
    await host.waitForTimeout(30);
  }
  if (!(await over(host).isVisible())) {
    const resign = host.getByRole("button", { name: "기권" });
    await expect(resign).toBeEnabled({ timeout: 20_000 });
    await resign.click();
  }
  await expect(over(host)).toBeVisible();
  await expect(over(guest)).toBeVisible();
  await host.screenshot({ path: info.outputPath("yut-online-host-end.png") });

  // 방장이 나가면 기록이 공개되고, 참가자가 모든 던지기를 다시 계산해 확인한다.
  await host.getByRole("button", { name: "← 윷놀이" }).click();
  await expect(guest.getByText(/검증.*문제없음/)).toBeVisible({
    timeout: 15_000,
  });
  expect(errors).toEqual([]);
});

test("윷놀이: 끝낸 판은 내 기록에 쌓이고 복기에서 한 걸음씩 다시 본다", async ({
  page,
}, info) => {
  test.skip(info.project.name !== "desktop", "기록은 화면 크기와 상관없다");
  await page.goto("/yut");
  await startSolo(page);
  for (let i = 0; i < 4; i++) await playStep(page, false);
  await untilMyThrow(page);
  await page.getByRole("button", { name: "기권" }).click();
  await expect(status(page)).toHaveText("기권했어요");
  await expect.poll(() => page.evaluate(finishedYutGames)).toBe(1);

  await page.goto("/profile?game=yut");
  await expect(page.getByRole("tab", { name: "🪵 윷놀이" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await expect(page.getByText("0승 1패")).toBeVisible();

  await page.goto("/review");
  await page.getByRole("button", { name: /🪵 윷놀이 · 혼자/ }).click();
  await expect(page.locator("[data-yut-board]")).toBeVisible();
  await page.getByRole("button", { name: "처음" }).click();
  await expect(page.locator("[data-stack]")).toHaveCount(0);
  for (
    let i = 0;
    i < 30 && (await page.locator("[data-stack]").count()) === 0;
    i++
  )
    await page.getByRole("button", { name: "한 수 앞으로" }).click();
  await expect(page.locator("[data-stack]").first()).toBeVisible();
  await page.screenshot({ path: info.outputPath("yut-review.png") });
});

test("윷놀이 배우기: 단원을 끝내고, 미션은 틀리면 다시 한다", async ({
  page,
}, info) => {
  const touch = info.project.name.startsWith("phone");
  const pick = async (point: number) => {
    const stack = page.locator(`[data-stack="${point}"]`);
    if (touch) {
      await stack.tap();
      await stack.tap();
    } else await stack.click();
  };
  await page.goto("/yut");
  await page.getByRole("button", { name: /윷놀이 배우기/ }).click();
  await expect(page.getByText("0/7")).toBeVisible();

  // 1단원: 설명 둘 → 퀴즈 → 새 말 내보내기 미션
  await page.getByRole("button", { name: /윷놀이는 어떤 게임/ }).click();
  for (let i = 0; i < 2; i++)
    await page.getByRole("button", { name: "다음", exact: true }).click();
  await page.getByRole("button", { name: "개(2칸)" }).click();
  await expect(page.getByText("정답이에요!")).toBeVisible();
  await page.getByRole("button", { name: "다음", exact: true }).click();
  await page.getByRole("button", { name: "미션 시작" }).click();
  await expect(newPiece(page)).toBeVisible();
  await page.screenshot({ path: info.outputPath("yut-mission.png") });
  if (touch) {
    await newPiece(page).tap();
    await newPiece(page).tap();
  } else await newPiece(page).click();
  await expect(page.getByRole("dialog", { name: "미션 성공" })).toBeVisible({
    timeout: 10_000,
  });
  await page.getByRole("button", { name: "다음", exact: true }).click();
  await expect(page.getByText("단원 완료!")).toBeVisible();
  await page.getByRole("button", { name: "단원 목록으로" }).click();
  await expect(page.getByText("1/7")).toBeVisible();

  // 2단원: 걸을 먼저 쓰면 모를 지나쳐 실패, 개 → 걸 순서로 다시 하면 성공
  await page.getByRole("button", { name: /지름길/ }).click();
  await page.getByRole("button", { name: "다음", exact: true }).click();
  await page.getByRole("button", { name: "바깥 길로 계속" }).click();
  await page.getByRole("button", { name: "다음", exact: true }).click();
  await page.getByRole("button", { name: "미션 시작" }).click();
  await page.locator('[data-pending="3"]').click();
  await pick(3);
  await pick(6);
  await expect(page.getByRole("dialog", { name: "미션 실패" })).toBeVisible({
    timeout: 10_000,
  });
  await page.getByRole("button", { name: "다시 하기" }).click();
  await expect(page.locator('[data-stack="3"]')).toBeVisible();
  await pick(3);
  await pick(5);
  await expect(page.getByRole("dialog", { name: "미션 성공" })).toBeVisible({
    timeout: 10_000,
  });

  // 튜토리얼 대국은 이어하기에 남지 않는다.
  await page.goto("/yut");
  await expect(page.getByText("1/7 단원 마침")).toBeVisible();
  await expect(page.getByRole("button", { name: /이어하기/ })).toHaveCount(0);
});
