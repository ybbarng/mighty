import { expect, type Page, test } from "@playwright/test";

/**
 * 친구와 하기: 같은 브라우저의 두 탭(방장, 참가자)을 BroadcastChannel로 이어(?net=local)
 * 방 만들기 → 링크로 들어가기 → 대기실 → 시작 → 한 판 끝까지를 확인한다.
 */
async function prepare(page: Page) {
  await page.addInitScript(() => {
    sessionStorage.setItem("mighty-splash-seen", "1");
    localStorage.setItem(
      "mighty-settings",
      JSON.stringify({ state: { speed: 1.6, sound: false }, version: 0 }),
    );
  });
}

/** 지금 필요한 단추나 낼 수 있는 카드를 하나 누른다. 판이 끝났으면 true */
async function stepOnce(page: Page): Promise<boolean> {
  if (await page.getByRole("heading", { name: /승리|패배/ }).isVisible())
    return true;
  for (const name of ["포기", "그냥 내기"]) {
    const button = page.getByRole("button", { name, exact: true });
    if (await button.isVisible()) {
      await button.click();
      return false;
    }
  }
  if (await page.getByText("당선을 축하합니다").isVisible()) {
    for (
      let k = 0;
      k < 6 && !(await page.getByText(/\(3\/3\)/).isVisible());
      k++
    ) {
      await page
        .locator("button[aria-label]:not([disabled]):not([class*='0_0_0_3px'])")
        .filter({ hasText: /[0-9AJQK]/ })
        .first()
        .click({ position: { x: 8, y: 8 } });
    }
    await page.getByRole("button", { name: /로 확정$/ }).click();
    return false;
  }
  if (await page.getByText("프렌드를 정하세요").isVisible()) {
    await page.getByRole("button", { name: "확정", exact: true }).click();
    return false;
  }
  const suit = page
    .locator("button[title='스페이드']")
    .and(page.locator(".h-12"));
  if (await suit.isVisible()) {
    await suit.click();
    return false;
  }
  const card = page
    .locator("button[aria-label]:not([disabled]):not([class*='brightness'])")
    .filter({ hasText: /[0-9AJQK]|JOKER/ })
    .first();
  if (await card.isVisible()) await card.click({ position: { x: 8, y: 8 } });
  return false;
}

test("방장이 방을 만들고 친구가 링크로 들어와 한 판을 끝까지 둔다", async ({
  context,
}, info) => {
  test.skip(info.project.name !== "desktop", "데스크톱에서만 돌린다");
  const host = await context.newPage();
  const guest = await context.newPage();
  const errors: string[] = [];
  for (const p of [host, guest]) {
    p.on("pageerror", (e) => errors.push(e.message));
    await prepare(p);
  }

  await host.goto("/?net=local");
  await host.getByRole("button", { name: /다함께 마이티/ }).click();
  await host.getByPlaceholder("친구들에게 보일 이름").fill("방장");
  await host.getByRole("button", { name: "방 만들기", exact: true }).click();
  const link = await host.locator("input[readonly]").inputValue();
  expect(link).toContain("room=");
  expect(link).toContain("net=local");

  await guest.goto(link);
  await guest.getByPlaceholder("친구들에게 보일 이름").fill("철수");
  await guest.getByRole("button", { name: "들어가기" }).click();
  await expect(guest.getByText("방장이 시작하기를 기다리는 중")).toBeVisible();
  await expect(host.getByText("철수")).toBeVisible();
  await host.screenshot({
    path: test.info().outputPath("online-1-host-lobby.png"),
  });

  await host.getByRole("button", { name: "시작하기" }).click();
  await expect(host.getByRole("button", { name: "점수판" })).toBeVisible();
  await expect(guest.getByRole("button", { name: "점수판" })).toBeVisible();
  // 서로의 이름이 자리 판에 보인다.
  await expect(host.getByText("철수").first()).toBeVisible();
  await expect(guest.getByText("방장").first()).toBeVisible();

  let shot = false;
  for (let i = 0; i < 800; i++) {
    const [h, g] = [await stepOnce(host), await stepOnce(guest)];
    if (h && g) break;
    if (!shot && (await guest.getByText(/턴 · 남은 점수/).isVisible())) {
      await guest.screenshot({
        path: test.info().outputPath("online-2-guest-trick.png"),
      });
      shot = true;
    }
    await host.waitForTimeout(80);
  }
  await expect(host.getByRole("heading", { name: /승리|패배/ })).toBeVisible();
  await expect(guest.getByRole("heading", { name: /승리|패배/ })).toBeVisible();
  await guest.screenshot({
    path: test.info().outputPath("online-3-guest-result.png"),
  });

  // 방장이 나가면 기록이 공개되고 참가자가 공정성을 확인한다.
  await host.getByRole("button", { name: "나가기" }).click();
  await expect(
    guest.getByText("공정성 확인: 섞기와 진행에 문제가 없습니다"),
  ).toBeVisible({ timeout: 10_000 });
  await expect(
    guest.getByText("방장이 방을 나가 게임이 끝났습니다"),
  ).toBeVisible({ timeout: 10_000 });
  expect(errors).toEqual([]);
});

test("게임 중에 참가자가 새로고침해도 같은 자리로 돌아온다", async ({
  context,
}, info) => {
  test.skip(info.project.name !== "desktop", "데스크톱에서만 돌린다");
  const host = await context.newPage();
  const guest = await context.newPage();
  for (const p of [host, guest]) await prepare(p);

  await host.goto("/?net=local");
  await host.getByRole("button", { name: /다함께 마이티/ }).click();
  await host.getByPlaceholder("친구들에게 보일 이름").fill("방장");
  await host.getByRole("button", { name: "방 만들기", exact: true }).click();
  const link = await host.locator("input[readonly]").inputValue();

  await guest.goto(link);
  await guest.getByPlaceholder("친구들에게 보일 이름").fill("철수");
  await guest.getByRole("button", { name: "들어가기" }).click();
  await expect(host.getByText("철수")).toBeVisible();
  await host.getByRole("button", { name: "시작하기" }).click();
  await expect(guest.getByRole("button", { name: "점수판" })).toBeVisible();

  // 새로고침하면 방장 화면에 연결이 끊겼다고 보인다. 멘탈 포커 판이라 컴퓨터가 대신하지 않고 기다린다.
  await guest.reload();
  await expect(host.getByText("연결 끊김 · 기다리는 중")).toBeVisible();
  await host.screenshot({
    path: test.info().outputPath("online-4-host-offline.png"),
  });

  // 같은 탭이라 토큰이 남아 있어, 다시 들어가면 같은 자리로 게임을 이어 간다.
  const join = guest.getByRole("button", { name: "들어가기" });
  if (await join.isVisible()) await join.click();
  await expect(guest.getByRole("button", { name: "점수판" })).toBeVisible();
  await expect(host.getByText("연결 끊김 · 기다리는 중")).toBeHidden();
});
