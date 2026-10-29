import { useTestSpeed } from "./fast";
import { expect, type Page, test } from "./test";

/*
 * 고스톱 화면 시험. 혼자 하기는 `?seed=`로 패를 정해 늘 같은 판이 나온다.
 * 기다림은 모두 화면 조건으로 한다(정해진 시간을 기다리지 않는다).
 */

/**
 * 화면 조건을 다시 볼 간격. expect.poll 기본(100·250·500·1000ms로 늘어남)은 컴퓨터 차례를 기다릴 때마다
 * 최대 1초씩 늦게 알아챈다. 같은 간격으로 자주 본다
 */
const POLL = [50];

/** 지금 이 화면에서 할 일: 판 끝, 고·스톱, 고르기, 흔들기, 내기, 뒤집기만. 없으면 null */
function actionable(page: Page): Promise<string | null> {
  return page.evaluate(() => {
    if (document.querySelector("[data-outcome]")) return "done";
    const dialogs = [...document.querySelectorAll('[role="dialog"]')].map((d) =>
      d.getAttribute("aria-label"),
    );
    if (dialogs.includes("미션 성공") || dialogs.includes("미션 실패"))
      return "mission";
    if (dialogs.includes("고 또는 스톱")) return "goStop";
    if (dialogs.includes("먹을 카드 고르기")) return "choose";
    if (dialogs.includes("흔들기·폭탄")) return "shake";
    const status = document.querySelector('[role="status"]')?.textContent ?? "";
    if (status.includes("내 차례")) return "play";
    if (status.includes("뒤집기만")) return "flip";
    return null;
  });
}

/** 손패 카드(내 차례면 단추, 아니면 그림) */
const hand = (page: Page) =>
  page.locator('section[aria-label="손패"] [data-card]');

/** 손패 한 장을 골랐다가 다시 눌러 낸다(처음 누르면 짝 맞는 바닥이 빛난다) */
async function playCard(page: Page, id?: string) {
  const card = id
    ? page.locator(`section[aria-label="손패"] [data-card="${id}"]`)
    : page.locator('section[aria-label="손패"] button').first();
  const chosen = (await card.getAttribute("data-card")) as string;
  const target = page.locator(
    `section[aria-label="손패"] [data-card="${chosen}"]`,
  );
  await target.click();
  await expect(page.getByRole("status")).toHaveText("한 번 더 누르면 냅니다");
  await target.click();
  // 낸 카드가 손에서 빠지거나, 흔들기·폭탄을 묻는다.
  await expect
    .poll(
      async () => {
        if ((await target.count()) === 0) return true;
        return (await actionable(page)) === "shake";
      },
      { intervals: POLL },
    )
    .toBe(true);
  return chosen;
}

/** 할 일 하나를 한다. 판이 끝났으면 false */
async function actOnce(page: Page, goStop: "고" | "스톱" = "스톱") {
  let what: string | null = null;
  await expect
    .poll(
      async () => {
        what = await actionable(page);
        return what;
      },
      { timeout: 30_000, intervals: POLL },
    )
    .not.toBeNull();
  switch (what as string | null) {
    case "done":
    case "mission":
      return false;
    case "goStop":
      await page.getByRole("button", { name: goStop, exact: true }).click();
      break;
    case "choose":
      await page
        .getByRole("dialog", { name: "먹을 카드 고르기" })
        .getByRole("button")
        .first()
        .click();
      break;
    case "shake":
      await page.getByRole("button", { name: "한 장만 내기" }).click();
      break;
    case "flip":
      await page.getByRole("button", { name: "뒤집기만" }).click();
      break;
    default:
      await playCard(page);
  }
  return true;
}

/** 판이 끝날 때까지 친다 */
async function playRound(page: Page) {
  for (let i = 0; i < 80; i++) if (!(await actOnce(page))) return;
  throw new Error("판이 끝나지 않는다");
}

/** 옵션에서 맞고·한 판·컴퓨터를 고르고 처음 화면으로 */
async function setOptions(page: Page, level = "입문") {
  await page.getByRole("button", { name: "옵션" }).click();
  await page.getByRole("button", { name: "맞고(2명)" }).click();
  await page.getByRole("button", { name: "1판", exact: true }).click();
  await page.getByRole("button", { name: level, exact: true }).click();
  await page.getByRole("button", { name: "처음으로" }).click();
}

async function noOverflow(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth,
  );
  expect(overflow).toBe(false);
}

test.beforeEach(async ({ page, context }) => {
  await useTestSpeed(context);
  await page.addInitScript(() => {
    sessionStorage.setItem("mighty-splash-seen", "1");
  });
});

test("고스톱: 게임 목록에서 들어가 입문 컴퓨터와 맞고 한 판을 끝까지 친다", async ({
  page,
}, info) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => {
    console.log("PAGEERROR", e.message);
    errors.push(e.message);
  });
  await page.goto("/");
  await page
    .getByRole("link", { name: /고스톱/ })
    .first()
    .click();
  await expect(page).toHaveURL(/\/gostop$/);
  await expect(page.getByRole("heading", { name: "고스톱" })).toBeVisible();
  await page.screenshot({ path: info.outputPath("gostop-home.png") });
  await setOptions(page);
  // 시드를 붙여 늘 같은 패로 친다.
  await page.goto("/gostop?seed=7");
  await page.getByRole("button", { name: /나홀로 고스톱/ }).click();
  await expect(hand(page).first()).toBeVisible();
  await expect(page.getByRole("region", { name: "바닥" })).toBeVisible();
  await noOverflow(page);
  await page.screenshot({ path: info.outputPath("gostop-start.png") });

  // 카드 한 장을 고르면 짝 맞는 바닥 카드가 빛나고, 한 번 더 누르면 낸다.
  await actOnce(page);
  await actOnce(page);
  await noOverflow(page);
  await page.screenshot({ path: info.outputPath("gostop-play.png") });

  await playRound(page);
  await expect(page.locator("[data-result-banner]")).toBeVisible();
  await expect(page.getByRole("region", { name: "판 정산" })).toBeVisible();
  await noOverflow(page);
  await page.screenshot({ path: info.outputPath("gostop-end.png") });
  await expect(page.getByRole("button", { name: "다시 하기" })).toBeVisible();
  expect(errors).toEqual([]);
});

test("고스톱: 새로고침해도 하던 판을 이어서 친다", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop", "저장은 화면 크기와 상관없다");
  await page.goto("/gostop");
  await setOptions(page);
  await page.goto("/gostop?seed=11");
  await page.getByRole("button", { name: /나홀로 고스톱/ }).click();
  await expect(page.getByRole("status")).toContainText("내 차례", {
    timeout: 15_000,
  });
  const before = await hand(page).count();
  const played = await playCard(page);
  await expect(page.getByRole("status")).toContainText("내 차례", {
    timeout: 15_000,
  });
  await page.reload();
  await page.getByRole("button", { name: /하던 게임 이어하기/ }).click();
  await expect(hand(page)).toHaveCount(before - 1);
  await expect(
    page.locator(`section[aria-label="손패"] [data-card="${played}"]`),
  ).toHaveCount(0);
});

test("고스톱 배우기: 첫 단원 미션을 틀렸다가 다시 해서 짝을 맞춘다", async ({
  page,
}, info) => {
  await page.goto("/gostop");
  await page.getByRole("button", { name: /고스톱 배우기/ }).click();
  await expect(page.getByText("0/6")).toBeVisible();
  await page.getByRole("button", { name: /고스톱은 어떤 게임/ }).click();
  for (let i = 0; i < 3; i++)
    await page.getByRole("button", { name: "다음", exact: true }).click();
  await page.getByRole("button", { name: "바닥에 놓인다" }).click();
  await page.getByRole("button", { name: "다음", exact: true }).click();
  await page.getByRole("button", { name: "미션 시작" }).click();

  // 짝이 없는 7월 피를 내면 실패
  await playCard(page, "07p");
  await expect(page.getByRole("dialog", { name: "미션 실패" })).toBeVisible({
    timeout: 10_000,
  });
  await page.getByRole("button", { name: "다시 하기" }).click();

  // 3월 광을 고르면 바닥 3월 피가 빛난다
  const gwang = page.locator('section[aria-label="손패"] [data-card="03g"]');
  await gwang.click();
  await expect(
    page.locator('section[aria-label="바닥"] [data-card="03p"]'),
  ).toHaveClass(/ring-sky-300/);
  await noOverflow(page);
  await page.screenshot({ path: info.outputPath("gostop-mission.png") });
  await gwang.click();
  await expect(page.getByRole("dialog", { name: "미션 성공" })).toBeVisible({
    timeout: 10_000,
  });
  await page.getByRole("button", { name: "다음", exact: true }).click();
  await expect(page.getByText("단원 완료!")).toBeVisible();
});

test("고스톱: 방장이 방을 만들고 친구가 링크로 들어와 맞고 한 판을 치고, 판 끝 검증을 통과한다", async ({
  context,
}, info) => {
  test.skip(info.project.name !== "desktop", "데스크톱에서만 돌린다");
  const host = await context.newPage();
  const guest = await context.newPage();
  const errors: string[] = [];
  for (const p of [host, guest])
    p.on("pageerror", (e) => errors.push(e.message));

  await host.goto("/gostop?net=local");
  await setOptions(host);
  await host.getByRole("button", { name: /다함께 고스톱/ }).click();
  await host.getByPlaceholder("친구에게 보일 이름").fill("방장");
  await host.getByRole("button", { name: "방 만들기", exact: true }).click();
  const link = await host.locator("input[readonly]").inputValue();
  expect(link).toContain("/gostop");

  await guest.goto(link);
  await guest.getByPlaceholder("친구에게 보일 이름").fill("철수");
  await guest.getByRole("button", { name: "들어가기" }).click();
  await expect(host.getByText("철수")).toBeVisible();
  await host.getByRole("button", { name: "시작하기" }).click();
  await expect(hand(guest).first()).toBeVisible();

  // 참가자 화면에는 상대 손패가 뒷면으로만 보인다.
  await expect(guest.getByRole("img", { name: /뒷면 10장/ })).toBeVisible();

  // 차례인 쪽이 친다. 두 화면 모두 판 끝이 될 때까지.
  for (let i = 0; i < 200; i++) {
    let who: Page | null = null;
    await expect
      .poll(
        async () => {
          for (const p of [host, guest]) {
            const what = await actionable(p);
            if (what && what !== "done") {
              who = p;
              return true;
            }
          }
          return (
            (await actionable(host)) === "done" &&
            (await actionable(guest)) === "done"
          );
        },
        { timeout: 30_000, intervals: POLL },
      )
      .toBe(true);
    if (!who) break;
    await actOnce(who);
  }
  await expect(guest.locator("[data-outcome]")).toBeVisible();
  await guest.screenshot({ path: info.outputPath("gostop-online.png") });

  // 방장이 나가면 기록이 공개되고, 참가자가 처음부터 다시 돌려 확인한다.
  await host.getByRole("button", { name: "← 고스톱" }).click();
  await expect(guest.getByText(/\[검증\] 나 — 문제없음/)).toBeVisible({
    timeout: 10_000,
  });
  expect(errors).toEqual([]);
});

test("고스톱: 끝낸 판은 내 기록에 쌓이고 복기에서 한 걸음씩 다시 본다", async ({
  page,
}, info) => {
  test.skip(info.project.name !== "desktop", "기록은 화면 크기와 상관없다");
  await page.goto("/gostop");
  await setOptions(page);
  await page.goto("/gostop?seed=7");
  await page.getByRole("button", { name: /나홀로 고스톱/ }).click();
  await playRound(page);
  // 복기 기록이 실제로 쓰인 뒤에 떠난다.
  await page.waitForFunction(
    () =>
      new Promise<boolean>((resolve) => {
        const open = indexedDB.open("mighty-review", 1);
        open.onerror = () => resolve(false);
        open.onsuccess = () => {
          const db = open.result;
          if (!db.objectStoreNames.contains("games")) {
            db.close();
            resolve(false);
            return;
          }
          const all = db.transaction("games").objectStore("games").getAll();
          all.onsuccess = () => {
            db.close();
            resolve(
              (all.result as { game: string; over: boolean }[]).some(
                (g) => g.game === "gostop" && g.over,
              ),
            );
          };
        };
      }),
  );

  await page.goto("/profile?game=gostop");
  await expect(page.getByRole("tab", { name: "🎴 고스톱" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await expect(page.getByText("판 승률")).toBeVisible();

  await page.goto("/review");
  await page.getByRole("button", { name: /고스톱 · 혼자/ }).click();
  await page.getByRole("button", { name: "처음" }).click();
  await expect(page.getByRole("status")).toContainText("1판 · 0/");
  await page.getByRole("button", { name: "한 걸음 앞으로" }).click();
  await expect(page.getByText(/다음 수: /)).toBeVisible({ timeout: 10_000 });
  await page.screenshot({ path: info.outputPath("gostop-review.png") });
});
