import { expect, type Page, test } from "@playwright/test";

/*
 * 민화투 화면 시험. 시드(`?seed=`)로 같은 판을 다시 쳐 결과가 기기 속도와 상관없게 한다.
 * 차례를 기다릴 때는 상태 글·손패 장수가 바뀌기를 기다린다(시간을 재지 않는다)
 */

const hand = (page: Page) => page.getByRole("region", { name: "내 손패" });
const handCards = (page: Page) => hand(page).locator("[data-card]");
const floorButtons = (page: Page) =>
  page.getByRole("region", { name: "바닥" }).getByRole("button");
const status = (page: Page) => page.getByRole("status");

/** 옵션에서 판 수·컴퓨터를 고른다 */
async function chooseOptions(page: Page, rounds: string, level?: string) {
  await page.getByRole("button", { name: "옵션" }).click();
  await page.getByRole("button", { name: rounds, exact: true }).click();
  if (level) await page.getByRole("button", { name: level }).click();
  await page.getByRole("button", { name: "처음으로" }).click();
}

/**
 * 내 차례면 한 번 낸다(같은 달이 둘이거나 뒤집은 패를 고르면 바닥 패도 고른다).
 * 낸 뒤 손패가 한 장 줄 때까지 기다린다. 게임이 끝났으면 false
 */
async function playTurn(page: Page, touch: boolean): Promise<boolean> {
  await expect(status(page)).toHaveText(/내 차례|먹을|1등|점$/, {
    timeout: 20_000,
  });
  if ((await page.locator("[data-outcome]").count()) > 0) return false;
  const text = (await status(page).textContent()) ?? "";
  if (/먹을 바닥 패를 고르세요/.test(text)) {
    await floorButtons(page).first().click();
    await expect(status(page)).not.toHaveText(/먹을 바닥 패를 고르세요/);
    return true;
  }
  const before = await handCards(page).count();
  const card = hand(page).getByRole("button").first();
  if (touch) {
    await card.tap();
    await expect(status(page)).toHaveText("한 번 더 누르면 냅니다");
    await card.tap();
  } else await card.click();
  // 바닥에 같은 달이 둘이면 하나를 고른다.
  if (/둘이에요/.test((await status(page).textContent()) ?? ""))
    await floorButtons(page).first().click();
  await expect(handCards(page)).toHaveCount(before - 1);
  return true;
}

async function noOverflow(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth,
  );
  expect(overflow).toBe(false);
}

/** 복기 기록이 실제로 쓰일 때까지 기다린다 */
async function archived(page: Page) {
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
                (g) => g.game === "minhwatu" && g.over,
              ),
            );
          };
        };
      }),
  );
}

test.beforeEach(async ({ page }) => {
  // 처음 열 때만 저장을 지운다(새로고침 뒤 이어하기를 보려고)
  await page.addInitScript(() => {
    sessionStorage.setItem("mighty-splash-seen", "1");
    if (!sessionStorage.getItem("minhwatu-e2e")) {
      sessionStorage.setItem("minhwatu-e2e", "1");
      localStorage.removeItem("minhwatu-save");
    }
  });
});

test("민화투: 목록에서 들어가 컴퓨터와 한 판을 끝까지 치고, 중간에 새로고침해도 이어 친다", async ({
  page,
}, info) => {
  const touch = info.project.name.startsWith("phone");
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await page
    .getByRole("link", { name: /민화투/ })
    .first()
    .click();
  await expect(page).toHaveURL(/\/minhwatu$/);
  await expect(page.getByRole("heading", { name: "민화투" })).toBeVisible();
  await page.screenshot({ path: info.outputPath("minhwatu-home.png") });
  await chooseOptions(page, "한 판", "입문");

  // 시드를 정해 같은 판을 친다.
  await page.goto("/minhwatu?seed=7");
  await page.getByRole("button", { name: /나홀로 민화투/ }).click();
  await expect(handCards(page)).toHaveCount(7);
  await expect(page.getByRole("region", { name: "바닥" })).toBeVisible();
  await noOverflow(page);
  await page.screenshot({ path: info.outputPath("minhwatu-start.png") });

  // 두 번 내고 새로고침 → 이어하기
  expect(await playTurn(page, touch)).toBe(true);
  expect(await playTurn(page, touch)).toBe(true);
  await expect(status(page)).toHaveText(/내 차례/, { timeout: 20_000 });
  const left = await handCards(page).count();
  await page.screenshot({ path: info.outputPath("minhwatu-play.png") });
  await page.reload();
  await page.getByRole("button", { name: /하던 게임 이어하기/ }).click();
  await expect(handCards(page)).toHaveCount(left);

  // 무르기: 내 마지막 패가 손으로 돌아온다
  await page.getByRole("button", { name: "무르기" }).click();
  await expect(handCards(page)).toHaveCount(left + 1);

  for (let guard = 0; guard < 12; guard++) {
    if (!(await playTurn(page, touch))) break;
    await noOverflow(page);
  }
  await expect(page.locator("[data-outcome]")).toBeVisible();
  await expect(page.locator("[data-result-banner]")).toBeVisible();
  await expect(page.locator("[data-seat-score]")).toHaveCount(3);
  await noOverflow(page);
  await page.screenshot({ path: info.outputPath("minhwatu-end.png") });
  expect(errors).toEqual([]);
});

test("민화투 배우기: 첫 단원 미션은 틀리면 실패하고 다시 해서 성공한다", async ({
  page,
}, info) => {
  const touch = info.project.name.startsWith("phone");
  await page.goto("/minhwatu");
  await page.getByRole("button", { name: /민화투 배우기/ }).click();
  await expect(page.getByText("0/6")).toBeVisible();
  await page.getByRole("button", { name: /민화투는 어떤 게임/ }).click();
  for (let i = 0; i < 2; i++)
    await page.getByRole("button", { name: "다음", exact: true }).click();
  await page.getByRole("button", { name: "3월 피" }).click();
  await page.getByRole("button", { name: "다음", exact: true }).click();
  await page.getByRole("button", { name: "미션 시작" }).click();

  const play = async (name: string) => {
    const card = hand(page).getByRole("button", { name });
    if (touch) {
      await card.tap();
      await card.tap();
    } else await card.click();
  };
  // 틀린 카드(5월 피)를 내면 실패
  await play("난초 피");
  await expect(page.getByRole("dialog", { name: "미션 실패" })).toBeVisible({
    timeout: 10_000,
  });
  await page.getByRole("button", { name: "다시 하기" }).click();
  await expect(handCards(page)).toHaveCount(3);
  await page.screenshot({ path: info.outputPath("minhwatu-mission.png") });
  await play("벚꽃 광");
  await expect(page.getByRole("dialog", { name: "미션 성공" })).toBeVisible({
    timeout: 10_000,
  });
  await page.getByRole("button", { name: "다음", exact: true }).click();
  await expect(page.getByText("단원 완료!")).toBeVisible();

  // 튜토리얼 대국은 이어하기에 남지 않는다.
  await page.goto("/minhwatu");
  await expect(page.getByText("1/6 단원 마침")).toBeVisible();
  await expect(
    page.getByRole("button", { name: /하던 게임 이어하기/ }),
  ).toHaveCount(0);
});

test("민화투: 방장이 방을 만들고 친구가 들어와 컴퓨터 하나와 셋이 끝까지 치고, 판 끝 검증을 통과한다", async ({
  context,
}, info) => {
  test.skip(info.project.name !== "desktop", "데스크톱에서만 돌린다");
  const host = await context.newPage();
  const guest = await context.newPage();
  const errors: string[] = [];
  for (const p of [host, guest])
    p.on("pageerror", (e) => errors.push(e.message));

  await host.goto("/minhwatu?net=local");
  await chooseOptions(host, "한 판");
  await host.getByRole("button", { name: /다함께 민화투/ }).click();
  await host.getByPlaceholder("친구에게 보일 이름").fill("방장");
  await host.getByRole("button", { name: "방 만들기", exact: true }).click();
  const link = await host.locator("input[readonly]").inputValue();
  expect(link).toContain("/minhwatu");

  await guest.goto(link);
  await guest.getByPlaceholder("친구에게 보일 이름").fill("철수");
  await guest.getByRole("button", { name: "들어가기" }).click();
  await expect(host.getByText("철수")).toBeVisible();
  await host.getByRole("button", { name: "시작하기" }).click();
  await expect(handCards(guest)).toHaveCount(7);
  await expect(handCards(host)).toHaveCount(7);

  // 차례인 쪽이 낸다. 둘 다 끝 상자가 뜰 때까지
  const myTurn = async (p: Page) =>
    /내 차례|먹을 바닥 패를 고르세요/.test(
      (await status(p).textContent()) ?? "",
    );
  for (let guard = 0; guard < 60; guard++) {
    const done =
      (await host.locator("[data-outcome]").count()) > 0 &&
      (await guest.locator("[data-outcome]").count()) > 0;
    if (done) break;
    await expect
      .poll(
        async () =>
          (await myTurn(host)) ||
          (await myTurn(guest)) ||
          (await host.locator("[data-outcome]").count()) > 0,
        { timeout: 20_000 },
      )
      .toBe(true);
    if (await myTurn(host)) await playTurn(host, false);
    else if (await myTurn(guest)) await playTurn(guest, false);
  }
  await expect(guest.locator("[data-outcome]")).toBeVisible({
    timeout: 20_000,
  });
  await expect(guest.locator("[data-seat-score]")).toHaveCount(3);
  await guest.screenshot({ path: info.outputPath("minhwatu-online.png") });

  // 방장이 나가면 기록이 공개되고, 참가자가 처음부터 다시 돌려 확인한다.
  await host.getByRole("button", { name: "← 민화투" }).click();
  await expect(guest.getByText(/검증.*문제없음/)).toBeVisible({
    timeout: 20_000,
  });
  expect(errors).toEqual([]);
});

test("민화투: 끝낸 게임은 내 기록에 쌓이고 복기에서 한 걸음씩 다시 본다", async ({
  page,
}, info) => {
  test.skip(info.project.name !== "desktop", "기록은 화면 크기와 상관없다");
  await page.goto("/minhwatu");
  await chooseOptions(page, "한 판", "입문");
  await page.goto("/minhwatu?seed=11");
  await page.getByRole("button", { name: /나홀로 민화투/ }).click();
  for (let guard = 0; guard < 12; guard++)
    if (!(await playTurn(page, false))) break;
  await expect(page.locator("[data-outcome]")).toBeVisible();
  await archived(page);

  await page.goto("/profile?game=minhwatu");
  await expect(page.getByRole("tab", { name: "🎴 민화투" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await expect(page.getByText("판 평균 점수")).toBeVisible();

  await page.goto("/review");
  await page.getByRole("button", { name: /🎴 민화투 · 혼자/ }).click();
  await page.getByRole("button", { name: "처음" }).click();
  await expect(page.getByRole("status")).toContainText("1판 · 0/");
  await page.getByRole("button", { name: "한 수 앞으로" }).click();
  await expect(page.getByRole("status")).toContainText("1판 · 1/");
  await expect(page.getByText(/다음 수: |고수도 같은 수/)).toBeVisible({
    timeout: 10_000,
  });
  await page.screenshot({ path: info.outputPath("minhwatu-review.png") });
});
