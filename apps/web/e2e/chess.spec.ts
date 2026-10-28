import { expect, type Page, test } from "@playwright/test";

const board = (page: Page) => page.getByRole("img", { name: /체스판/ });
const pieces = (page: Page) => page.locator("[data-piece]");

/** 칸 이름("e2")을 눌러 고른다. 흑이면 판이 돌아가 있다(data-flipped) */
async function tapSquare(page: Page, name: string, touch: boolean) {
  const svg = board(page);
  const box = await svg.boundingBox();
  if (!box) throw new Error("판이 안 보인다");
  const flipped = (await svg.getAttribute("data-flipped")) !== null;
  const unit = box.width / 8;
  let x = name.charCodeAt(0) - 97;
  let y = 8 - Number(name[1]);
  if (flipped) {
    x = 7 - x;
    y = 7 - y;
  }
  const px = box.x + (x + 0.5) * unit;
  const py = box.y + (y + 0.5) * unit;
  if (touch) await page.touchscreen.tap(px, py);
  else await page.mouse.click(px, py);
}

/** 내 기물(폰부터)을 골라 처음 보이는 갈 곳으로 옮긴다 */
async function playOne(page: Page, touch: boolean, side: "w" | "b" = "w") {
  const order =
    side === "w"
      ? ["e2", "d2", "g1", "b1", "c2", "f2", "a2", "h2", "e3", "d3"]
      : ["e7", "d7", "g8", "b8", "c7", "f7", "a7", "h7", "e6", "d6"];
  for (const from of order) {
    if (
      (await page
        .locator(`[data-square="${from}"][data-piece^="${side}"]`)
        .count()) === 0
    )
      continue;
    await tapSquare(page, from, touch);
    const target = page.locator("[data-target]").first();
    // 갈 곳이 없는 기물이면 점이 생기지 않는다. 다음 기물로.
    const shown = await target
      .waitFor({ timeout: 1500 })
      .then(() => true)
      .catch(() => false);
    if (!shown) continue;
    const to = (await target.getAttribute("data-target")) as string;
    await tapSquare(page, to, touch);
    await expect(
      page.locator(`[data-square="${to}"][data-piece^="${side}"]`),
    ).toHaveCount(1);
    return { from, to };
  }
  throw new Error("둘 수가 없다");
}

/** 첫 화면 → 옵션에서 컴퓨터(고르면)와 백을 고르고 → 나홀로 체스 */
async function startSolo(page: Page, level?: string) {
  await page.getByRole("button", { name: "옵션" }).click();
  if (level) await page.getByRole("button", { name: level }).click();
  await page.getByRole("button", { name: "백(먼저)" }).click();
  await page.getByRole("button", { name: "처음으로" }).click();
  await page.getByRole("button", { name: /나홀로 체스/ }).click();
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    sessionStorage.setItem("mighty-splash-seen", "1");
  });
});

test("체스: 게임 목록에서 들어가 두다가 이어하고, 무르고 기권한다", async ({
  page,
}, info) => {
  const touch = info.project.name.startsWith("phone");
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await page.getByRole("link", { name: /체스/ }).first().click();
  await expect(page).toHaveURL(/\/chess$/);
  await expect(page.getByRole("heading", { name: "체스" })).toBeVisible();
  await page.screenshot({ path: info.outputPath("chess-home.png") });
  await startSolo(page, "입문");

  await expect(pieces(page)).toHaveCount(32);
  await expect(page.getByRole("status")).toContainText("내 차례");
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth,
  );
  expect(overflow).toBe(false);
  await page.screenshot({ path: info.outputPath("chess-start.png") });

  // 한 수 두면 컴퓨터가 답하고 다시 내 차례. 기보 줄에 두 수가 보인다.
  await playOne(page, touch);
  await expect(page.getByRole("status")).toContainText("내 차례", {
    timeout: 15_000,
  });
  await expect(page.getByTitle("기보")).toContainText("1. ");

  // 새로고침해도 이어서 둔다.
  await page.reload();
  await page.getByRole("button", { name: /하던 게임 이어하기/ }).click();
  await expect(page.getByRole("status")).toContainText("내 차례");
  await playOne(page, touch);
  await expect(page.getByRole("status")).toContainText("내 차례", {
    timeout: 15_000,
  });
  await page.screenshot({ path: info.outputPath("chess-play.png") });
  await page.getByRole("button", { name: "무르기" }).click();
  await expect(page.getByRole("status")).toContainText("내 차례");

  await page.getByRole("button", { name: "기권" }).click();
  await expect(page.getByRole("status")).toHaveText("기권했어요");
  await expect(page.locator('[data-result-banner="lose"]')).toBeVisible();
  await page.screenshot({ path: info.outputPath("chess-end.png") });
  expect(errors).toEqual([]);
});

test("체스 배우기: 첫 단원 미션을 틀렸다가 다시 해 룩으로 폰을 잡는다", async ({
  page,
}, info) => {
  const touch = info.project.name.startsWith("phone");
  await page.goto("/chess");
  await page.getByRole("button", { name: /체스 배우기/ }).click();
  await expect(page.getByText("0/8")).toBeVisible();
  // 첫 단원: 설명 둘 → 퀴즈 → 미션(룩으로 폰 잡기)
  await page.getByRole("button", { name: /체스는 어떤 게임/ }).click();
  await expect(board(page)).toBeVisible();
  for (let i = 0; i < 2; i++)
    await page.getByRole("button", { name: "다음", exact: true }).click();
  await page.getByRole("button", { name: "상대 킹을 체크메이트한다" }).click();
  await page.getByRole("button", { name: "다음", exact: true }).click();
  await page.getByRole("button", { name: "미션 시작" }).click();
  // 먼저 틀린 수(룩을 한 칸)로 실패하고, 다시 해서 성공한다.
  await tapSquare(page, "d1", touch);
  await expect(page.locator('[data-target="d6"]')).toHaveCount(1);
  await page.screenshot({ path: info.outputPath("chess-mission.png") });
  await tapSquare(page, "d2", touch);
  await expect(page.getByRole("dialog", { name: "미션 실패" })).toBeVisible({
    timeout: 10_000,
  });
  await page.getByRole("button", { name: "다시 하기" }).click();
  await tapSquare(page, "d1", touch);
  await tapSquare(page, "d6", touch);
  await expect(page.getByRole("dialog", { name: "미션 성공" })).toBeVisible({
    timeout: 10_000,
  });
  await page.getByRole("button", { name: "다음", exact: true }).click();
  await expect(page.getByText("단원 완료!")).toBeVisible();
});

test("체스 배우기: 폰이 끝줄에 닿으면 고르기 창에서 퀸을 고른다", async ({
  page,
}, info) => {
  const touch = info.project.name.startsWith("phone");
  // 앞 두 단원을 마친 상태로 시작한다(단원은 차례대로 열린다).
  await page.addInitScript(() => {
    localStorage.setItem(
      "chess-tutorial",
      JSON.stringify({ state: { completed: ["goal", "pieces"] }, version: 0 }),
    );
  });
  await page.goto("/chess");
  await page.getByRole("button", { name: /체스 배우기/ }).click();
  await page.getByRole("button", { name: /폰과 승급/ }).click();
  for (let i = 0; i < 3; i++)
    await page.getByRole("button", { name: "다음", exact: true }).click();
  await page.getByRole("button", { name: "앞쪽 대각선 한 칸으로" }).click();
  await page.getByRole("button", { name: "다음", exact: true }).click();
  await page.getByRole("button", { name: "미션 시작" }).click();
  await tapSquare(page, "e7", touch);
  await tapSquare(page, "e8", touch);
  await expect(page.getByText("폰을 무엇으로 바꿀까요?")).toBeVisible();
  await page.screenshot({ path: info.outputPath("chess-promotion.png") });
  await page.getByRole("button", { name: "퀸", exact: true }).click();
  await expect(page.locator('[data-square="e8"][data-piece="wQ"]')).toHaveCount(
    1,
  );
  await expect(page.getByRole("dialog", { name: "미션 성공" })).toBeVisible({
    timeout: 10_000,
  });
});

test("체스: 방장이 방을 만들고 친구가 링크로 들어와 두고, 판 끝 검증을 통과한다", async ({
  context,
}, info) => {
  test.skip(info.project.name !== "desktop", "데스크톱에서만 돌린다");
  const host = await context.newPage();
  const guest = await context.newPage();
  const errors: string[] = [];
  for (const p of [host, guest])
    p.on("pageerror", (e) => errors.push(e.message));

  await host.goto("/chess?net=local");
  await host.getByRole("button", { name: /다함께 체스/ }).click();
  await host.getByPlaceholder("친구에게 보일 이름").fill("방장");
  await host.getByRole("button", { name: "방 만들기", exact: true }).click();
  const link = await host.locator("input[readonly]").inputValue();
  expect(link).toContain("/chess");

  await guest.goto(link);
  await guest.getByPlaceholder("친구에게 보일 이름").fill("철수");
  await guest.getByRole("button", { name: "들어가기" }).click();
  await expect(host.getByText("철수")).toBeVisible();
  await host.getByRole("button", { name: "시작하기" }).click();
  await expect(board(guest)).toBeVisible();

  const white = (await host.getByText("나는 백").count()) > 0 ? host : guest;
  const black = white === host ? guest : host;
  await expect(white.getByRole("status")).toContainText("내 차례", {
    timeout: 15_000,
  });
  await playOne(white, false, "w");
  await expect(black.getByRole("status")).toContainText("내 차례", {
    timeout: 15_000,
  });
  // 흑은 돌아간 판에서 한 수 두고, 백이 기권한다.
  await playOne(black, false, "b");
  await expect(white.getByRole("status")).toContainText("내 차례", {
    timeout: 15_000,
  });
  await white.getByRole("button", { name: "기권" }).click();
  await expect(black.getByRole("status")).toHaveText("상대가 기권했어요");
  await black.screenshot({ path: info.outputPath("chess-online.png") });

  // 방장이 나가면 기록이 공개되고, 참가자가 처음부터 다시 둬 보며 확인한다.
  await host.getByRole("button", { name: "← 체스" }).click();
  await expect(guest.getByText(/검증.*문제없음/)).toBeVisible({
    timeout: 10_000,
  });
  expect(errors).toEqual([]);
});

test("체스: 온라인에서 둔 뒤 무승부를 제안하고 상대가 받으면 합의해 비긴다", async ({
  context,
}, info) => {
  test.skip(info.project.name !== "desktop", "데스크톱에서만 돌린다");
  const host = await context.newPage();
  const guest = await context.newPage();
  const errors: string[] = [];
  for (const p of [host, guest])
    p.on("pageerror", (e) => errors.push(e.message));

  await host.goto("/chess?net=local");
  await host.getByRole("button", { name: /다함께 체스/ }).click();
  await host.getByPlaceholder("친구에게 보일 이름").fill("방장");
  await host.getByRole("button", { name: "방 만들기", exact: true }).click();
  const link = await host.locator("input[readonly]").inputValue();
  await guest.goto(link);
  await guest.getByPlaceholder("친구에게 보일 이름").fill("철수");
  await guest.getByRole("button", { name: "들어가기" }).click();
  await expect(host.getByText("철수")).toBeVisible();
  await host.getByRole("button", { name: "시작하기" }).click();
  await expect(board(guest)).toBeVisible();

  const white = (await host.getByText("나는 백").count()) > 0 ? host : guest;
  const black = white === host ? guest : host;
  await expect(white.getByRole("status")).toContainText("내 차례", {
    timeout: 15_000,
  });
  // 아직 아무도 두지 않았으면 제안 단추가 없다.
  await expect(white.getByRole("button", { name: "무승부 제안" })).toHaveCount(
    0,
  );
  await playOne(white, false, "w");
  // 백은 흑이 생각하는 동안(내 차례가 아닐 때) 제안한다.
  await white.getByRole("button", { name: "무승부 제안" }).click();
  await expect(white.getByRole("status")).toContainText("답을 기다려요");
  await expect(black.getByText(/무승부를 제안했어요/)).toBeVisible({
    timeout: 15_000,
  });
  await black.getByRole("button", { name: "받기" }).click();
  await expect(black.getByRole("status")).toHaveText("합의해 비겼어요");
  await expect(white.getByRole("status")).toHaveText("합의해 비겼어요");
  await white.screenshot({ path: info.outputPath("chess-draw.png") });

  await host.getByRole("button", { name: "← 체스" }).click();
  await expect(guest.getByText(/검증.*문제없음/)).toBeVisible({
    timeout: 10_000,
  });
  expect(errors).toEqual([]);
});

test("체스: 끝낸 판은 내 기록에 쌓이고 복기에서 한 수씩 다시 본다", async ({
  page,
}, info) => {
  test.skip(info.project.name !== "desktop", "기록은 화면 크기와 상관없다");
  await page.goto("/chess");
  await startSolo(page);
  await playOne(page, false);
  await expect(page.getByRole("status")).toContainText("내 차례", {
    timeout: 15_000,
  });
  await page.getByRole("button", { name: "기권" }).click();
  await expect(page.getByRole("status")).toHaveText("기권했어요");
  // 복기 기록이 실제로 쓰인 뒤에 떠난다.
  await expect
    .poll(() =>
      page.evaluate(async () => {
        const names = await indexedDB.databases();
        return names.some((d) => d.name === "mighty-review");
      }),
    )
    .toBe(true);
  await page.waitForFunction(
    () =>
      new Promise<boolean>((resolve) => {
        const open = indexedDB.open("mighty-review", 1);
        open.onsuccess = () => {
          const all = open.result
            .transaction("games")
            .objectStore("games")
            .getAll();
          all.onsuccess = () => {
            open.result.close();
            resolve(
              (all.result as { game: string; over: boolean }[]).some(
                (g) => g.game === "chess" && g.over,
              ),
            );
          };
        };
      }),
  );

  await page.goto("/profile?game=chess");
  await expect(page.getByRole("tab", { name: "♞ 체스" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await expect(page.getByText("0승 0무 1패")).toBeVisible();

  await page.goto("/review");
  await page.getByRole("button", { name: /♞ 체스 · 혼자/ }).click();
  await page.getByRole("button", { name: "처음" }).click();
  await expect(pieces(page)).toHaveCount(32);
  await expect(page.getByTitle("기보")).toHaveText("기보: 아직 둔 수가 없어요");
  await page.getByRole("button", { name: "한 수 앞으로" }).click();
  await expect(page.getByTitle("기보")).toContainText("1. ");
  await expect(page.getByText(/다음 수: /)).toBeVisible({ timeout: 10_000 });
  await page.screenshot({ path: info.outputPath("chess-review.png") });
});

test("체스 수 배우기: 메이트 문제를 틀렸다 다시 풀고, 진행이 목록에 남는다", async ({
  page,
}, info) => {
  const touch = info.project.name.startsWith("phone");
  await page.goto("/chess");
  await page.getByRole("button", { name: /체스 배우기/ }).click();
  await page.getByRole("button", { name: /수 배우기/ }).click();
  const mate1 = page.getByRole("region", { name: "한 수 메이트" });
  await expect(mate1.getByText("0/12")).toBeVisible();
  await mate1.getByRole("button", { name: "풀기 시작" }).click();
  await expect(page.getByRole("status")).toHaveText("한 수로 체크메이트하세요");

  // 킹을 한 칸 옮기는 수는 메이트가 아니다.
  await tapSquare(page, "a2", touch);
  const to = await page
    .locator("[data-target]")
    .first()
    .getAttribute("data-target");
  await tapSquare(page, to as string, touch);
  await expect(page.getByRole("status")).toHaveText("메이트가 아니에요");
  await page.getByRole("button", { name: "다시 하기" }).click();

  // 정답: 룩 b5 → b8
  await tapSquare(page, "b5", touch);
  await tapSquare(page, "b8", touch);
  await expect(page.getByRole("status")).toHaveText("체크메이트!");
  await expect(page.getByText("룩을 b8로(Rb8#): 체크!")).toBeVisible();
  await page.screenshot({ path: info.outputPath("chess-puzzle.png") });
  await page.getByRole("button", { name: "다음 문제" }).click();
  await expect(page.getByText("한 수 메이트 2/12")).toBeVisible();
  await page.getByRole("button", { name: "← 목록" }).click();
  await expect(mate1.getByText("1/12")).toBeVisible();
  await expect(
    mate1.getByRole("button", { name: "한 수 메이트 1번 (풂)" }),
  ).toBeVisible();
});

test("체스 수 배우기: 포크 문제를 틀렸다 다시 풀고, 진행이 목록에 남는다", async ({
  page,
}, info) => {
  const touch = info.project.name.startsWith("phone");
  await page.goto("/chess");
  await page.getByRole("button", { name: /체스 배우기/ }).click();
  await page.getByRole("button", { name: /수 배우기/ }).click();
  const fork = page.getByRole("region", { name: "포크" });
  await expect(fork.getByText("0/8")).toBeVisible();
  await fork.getByRole("button", { name: "풀기 시작" }).click();
  await expect(page.getByRole("status")).toHaveText("포크로 기물을 얻으세요");

  // 킹을 옮기는 수로는 기물을 얻지 못한다.
  await tapSquare(page, "b3", touch);
  const to = await page
    .locator("[data-target]")
    .first()
    .getAttribute("data-target");
  await tapSquare(page, to as string, touch);
  await expect(page.getByRole("status")).toHaveText(
    "그 수로는 기물을 얻지 못해요",
  );
  await page.getByRole("button", { name: "다시 하기" }).click();

  // 정답: 퀸 d5 → h1. 킹과 비숍을 함께 노린다.
  await tapSquare(page, "d5", touch);
  await tapSquare(page, "h1", touch);
  await expect(page.getByRole("status")).toHaveText("포크!");
  await expect(page.getByText(/함께 노린다\(포크\)/)).toBeVisible();
  await page.screenshot({ path: info.outputPath("chess-fork.png") });
  await page.getByRole("button", { name: "← 목록" }).click();
  await expect(fork.getByText("1/8")).toBeVisible();
});

test("체스 개인 시간: 내 시계가 가고, 다 쓰면 시간패다", async ({
  page,
}, info) => {
  test.skip(info.project.name !== "desktop", "시계는 화면 크기와 상관없다");
  await page.clock.install();
  await page.goto("/chess");
  await page.getByRole("button", { name: "옵션" }).click();
  await page.getByRole("button", { name: "빠른 3분" }).click();
  await page.getByRole("button", { name: "백(먼저)" }).click();
  await page.getByRole("button", { name: "처음으로" }).click();
  await page.getByRole("button", { name: /나홀로 체스/ }).click();
  await expect(page.locator("[data-clock]").first()).toHaveText("3:00");
  await page.clock.runFor(270_001);
  await expect(page.getByRole("status")).toHaveText("시간이 다 돼 졌어요");
  await page.screenshot({ path: info.outputPath("chess-time.png") });
});
