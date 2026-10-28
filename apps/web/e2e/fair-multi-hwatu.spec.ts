import { expect, type Page, test } from "@playwright/test";

/**
 * 화투 암호화방 여럿이 하기: 브라우저 탭 셋(방장 + 참가자 둘)을 BroadcastChannel로 잇고(?net=local)
 * 모든 자리를 사람으로 채워 민화투 한 판을 끝까지 친다. 중간에 참가자와 방장이 한 번씩 새로고침한다.
 * 첫 판을 섞고 나누는 시간과 한 판 시간을 잰다. 오래 걸려 기본으로는 돌리지 않는다(FAIR_MULTI=1).
 */
test.skip(!process.env.FAIR_MULTI, "FAIR_MULTI=1 일 때만 돌린다");
test.use({ serviceWorkers: "block" });

const hand = (page: Page) => page.getByRole("region", { name: "내 손패" });
const handCards = (page: Page) => hand(page).locator("[data-card]");
const floorButtons = (page: Page) =>
  page.getByRole("region", { name: "바닥" }).getByRole("button");

async function prepare(page: Page) {
  await page.addInitScript(() => {
    sessionStorage.setItem("mighty-splash-seen", "1");
  });
}

/** 내 차례면 한 번 낸다. 낸 게 있으면 true */
async function playIfMine(page: Page): Promise<boolean> {
  const text = (await page.getByRole("status").allTextContents()).join(" ");
  if (/먹을 바닥 패를 고르세요/.test(text)) {
    await floorButtons(page).first().click();
    return true;
  }
  if (!/내 차례/.test(text)) return false;
  const before = await handCards(page).count();
  if (before === 0) return false;
  await hand(page).getByRole("button").first().click();
  if (
    /둘이에요/.test(
      (await page.getByRole("status").allTextContents()).join(" "),
    )
  )
    await floorButtons(page).first().click();
  await expect(handCards(page)).not.toHaveCount(before, { timeout: 20_000 });
  return true;
}

const over = async (p: Page) => (await p.locator("[data-outcome]").count()) > 0;

test("민화투 암호화방: 사람 셋이 한 판을 끝까지 치고, 참가자·방장 새로고침 뒤에도 이어 가며 검증을 통과한다", async ({
  context,
}, info) => {
  test.skip(info.project.name !== "desktop", "데스크톱에서만 돌린다");
  test.setTimeout(300_000);
  const pages = [
    await context.newPage(),
    await context.newPage(),
    await context.newPage(),
  ];
  const errors: string[] = [];
  for (const p of pages) {
    await prepare(p);
    p.on("pageerror", (e) => errors.push(e.message));
  }
  const [host, a, b] = pages as [Page, Page, Page];
  await host.goto("/minhwatu?net=local");
  await host.getByRole("button", { name: "옵션" }).click();
  await host.getByRole("button", { name: "한 판", exact: true }).click();
  await host.getByRole("button", { name: "처음으로" }).click();
  await host.getByRole("button", { name: /다함께 민화투/ }).click();
  await host.getByPlaceholder("친구에게 보일 이름").fill("방장");
  await host.getByRole("button", { name: "방 만들기", exact: true }).click();
  const link = await host.locator("input[readonly]").inputValue();
  for (const [i, p] of [a, b].entries()) {
    await p.goto(link);
    await p.getByPlaceholder("친구에게 보일 이름").fill(`손님${i + 1}`);
    await p.getByRole("button", { name: "들어가기" }).click();
    await expect(host.getByText(`손님${i + 1}`)).toBeVisible();
  }
  await expect(host.getByText("암호화방")).toBeVisible();

  const started = Date.now();
  await host.getByRole("button", { name: "시작하기" }).click();
  for (const p of pages) await expect(handCards(p)).toHaveCount(7);
  const dealMs = Date.now() - started;

  let plays = 0;
  let reloaded = 0;
  for (let guard = 0; guard < 200; guard++) {
    if ((await over(host)) && (await over(a)) && (await over(b))) break;
    if (
      (await host.getByText("부정 감지 —").count()) > 0 ||
      (await a.getByText("부정 감지 —").count()) > 0
    )
      throw new Error("부정 감지가 떴다");
    let acted = false;
    for (const p of pages) if (await playIfMine(p)) acted = true;
    if (acted) plays++;
    // 몇 수 뒤 참가자 하나, 그다음 방장이 새로고침한다(같은 탭).
    if (reloaded === 0 && plays >= 2) {
      await a.reload();
      // 참가자는 새로고침하면 같은 이름으로 다시 들어간다(토큰으로 같은 자리).
      await a.getByRole("button", { name: "들어가기" }).click();
      await expect(handCards(a).first()).toBeVisible({ timeout: 30_000 });
      reloaded = 1;
    } else if (reloaded === 1 && plays >= 4) {
      await host.reload();
      // 방장은 같은 탭에서 새로고침하면 남긴 방을 다시 열어 대국 화면으로 간다.
      await expect(hand(host)).toBeVisible({ timeout: 30_000 });
      reloaded = 2;
    }
    if (!acted) await host.waitForTimeout(100);
  }
  for (const p of pages)
    await expect(p.locator("[data-outcome]")).toBeVisible({ timeout: 30_000 });
  const roundMs = Date.now() - started;
  await host.screenshot({ path: info.outputPath("hwatu-multi-host.png") });
  await b.screenshot({ path: info.outputPath("hwatu-multi-guest.png") });
  expect(reloaded).toBe(2);
  // 판마다 검증: 참가자 화면 채팅에 "문제없음"
  await expect(
    b.getByText("이번 판을 진짜 카드로 다시 계산했습니다 — 문제없음 ✓"),
  ).toBeVisible({ timeout: 30_000 });
  // 게임 끝 검증: 두 참가자 모두 "나 — 문제없음", 실패 줄은 없다.
  for (const p of [a, b]) {
    await expect(p.getByText(/\[검증\] 나 — 문제없음/)).toBeVisible({
      timeout: 30_000,
    });
    await expect(p.getByText(/실패 ⚠/)).toHaveCount(0);
  }
  info.annotations.push({
    type: "시간",
    description: `첫 판 섞고 나누기 ${dealMs}ms, 한 판 ${roundMs}ms`,
  });
  console.log(`첫 판 섞고 나누기 ${dealMs}ms, 한 판 ${roundMs}ms`);
  expect(errors).toEqual([]);
});
