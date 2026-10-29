import { expect, type Locator, type Page, test } from "@playwright/test";

import { prepareFast } from "./fast";

/** 하트: 숨은 입구, 혼자 한 판, 친구와 한 판 */
async function prepare(page: Page) {
  // 고수는 생각이 길어 시험에서는 중수와 한다.
  await prepareFast(page, {
    "hearts-settings": { state: { level: 1 }, version: 0 },
  });
}

/** 내 손패에서 지금 낼 수 있는(밝은) 카드 */
function myCards(page: Page) {
  return page
    .locator("button[data-card]:not([disabled]):not([class*='brightness'])")
    .filter({ hasNotText: /^$/ });
}

/** 지금 할 일을 하나 한다. 판이 끝났으면 true */
async function stepOnce(page: Page): Promise<boolean> {
  if (await page.getByRole("button", { name: "다음 판" }).isVisible())
    return true;
  const pass = page.getByRole("button", { name: "넘기기", exact: true });
  if (await pass.isVisible()) {
    for (let k = 0; k < 3 && (await pass.isDisabled()); k++)
      await myCards(page)
        .nth(k)
        .click({ position: { x: 8, y: 8 } });
    if (await pass.isEnabled()) await pass.click();
    return false;
  }
  if (await page.getByText(/낼 카드를 고르세요/).isVisible()) {
    await myCards(page)
      .first()
      .click({ position: { x: 8, y: 8 } });
    return false;
  }
  // 컴퓨터 차례: 화면이 바뀔 때까지 잠깐 둔다(폴링 간격)
  await page.waitForTimeout(50);
  return false;
}

test("게임 목록에서 하트를 고르면 하트로 간다", async ({ page }) => {
  await prepare(page);
  await page.goto("/");
  await page.getByRole("link", { name: /하트/ }).first().click();
  await expect(page).toHaveURL(/\/hearts$/);
  await expect(page.getByRole("button", { name: /나홀로 하트/ })).toBeVisible();
  // 안드로이드 아래 막대에 비치는 색도 하트 색으로 바뀐다.
  const colors = () =>
    page.evaluate(() => ({
      theme: document
        .querySelector('meta[name="theme-color"]')
        ?.getAttribute("content"),
      html: getComputedStyle(document.documentElement).backgroundColor,
    }));
  await expect
    .poll(colors)
    .toEqual({ theme: "#3b0a0a", html: "rgb(59, 10, 10)" });
  await page.goto("/mighty");
  await expect(
    page.getByRole("button", { name: /나홀로 마이티/ }),
  ).toBeVisible();
  await expect
    .poll(colors)
    .toEqual({ theme: "#0a3622", html: "rgb(10, 54, 34)" });
});

test("하트: 카드를 넘기고 한 판을 끝까지 둔다", async ({ page }, info) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await prepare(page);
  await page.goto("/hearts");
  await page.getByRole("button", { name: /나홀로 하트/ }).click();
  await expect(page.getByText(/넘길 카드 3장/)).toBeVisible({
    timeout: 20_000,
  });
  await page.screenshot({ path: info.outputPath("hearts-1-pass.png") });

  let shot = false;
  for (let i = 0; i < 1200; i++) {
    if (await stepOnce(page)) break;
    if (!shot && (await page.getByText(/2\/13턴/).isVisible())) {
      await page.screenshot({ path: info.outputPath("hearts-2-trick.png") });
      shot = true;
    }
  }
  await expect(page.getByRole("button", { name: "다음 판" })).toBeVisible();
  await page.screenshot({ path: info.outputPath("hearts-3-result.png") });
  await page.getByRole("button", { name: "점수판" }).click();
  await expect(page.getByRole("dialog", { name: "점수판" })).toBeVisible();
  await page.screenshot({ path: info.outputPath("hearts-4-score.png") });
  await page.getByRole("button", { name: "닫기" }).click();
  await page.getByRole("button", { name: "다음 판" }).click();
  // 둘째 판은 오른쪽으로 넘긴다.
  await expect(page.getByText(/오른쪽\(.+\)에게 넘길 카드/)).toBeVisible({
    timeout: 20_000,
  });
  // 끝낸 판은 내 기록에 쌓인다(하트에서 들어가면 하트 기록부터).
  await page.goto("/profile?game=hearts");
  await expect(page.getByRole("tab", { name: "♥ 하트" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await expect(page.getByText("판 평균 점수")).toBeVisible();
  await expect(page.getByText(/1판 · 게임 0번/)).toBeVisible();
  await page.screenshot({
    path: info.outputPath("hearts-4-profile.png"),
    fullPage: true,
  });
  // 복기: 하트 게임을 열어 판 한눈에 보기와 다시 보기를 확인한다.
  await page.getByRole("link", { name: /지난 게임 복기/ }).click();
  await page.getByRole("button", { name: /하트 · 혼자/ }).click();
  await expect(page.getByText("넘긴 카드").first()).toBeVisible();
  await page.getByRole("button", { name: "▶ 이 판 다시 보기" }).first().click();
  const forward = page.getByRole("button", { name: "한 걸음 앞으로" });
  for (let k = 0; k < 8; k++) await forward.click();
  await page.getByRole("button", { name: "상황판" }).click();
  await expect(
    page.getByRole("complementary", { name: "상황판" }),
  ).toBeVisible();
  await expect(page.getByText("해설을 계산하는 중…")).toHaveCount(0, {
    timeout: 15_000,
  });
  // 세로 휴대폰은 상황판을 열 때 이미 펼친다.
  const reveal = page.getByRole("button", { name: "모든 패 보기" });
  if (await reveal.isVisible()) await reveal.click();
  await expect(
    page.getByRole("button", { name: "모든 패 숨기기" }),
  ).toBeVisible();
  await page.screenshot({ path: info.outputPath("hearts-5-replay.png") });
  expect(errors).toEqual([]);
});

/** 카드가 움직임을 멈춘 뒤의 자리(차례가 오면 손패가 0.3초 동안 내려앉는다) */
async function settledBox(card: Locator) {
  let last = await card.boundingBox();
  for (let i = 0; i < 20; i++) {
    await card.page().waitForTimeout(100);
    const now = await card.boundingBox();
    if (now && last && now.x === last.x && now.y === last.y) return now;
    last = now;
  }
  return last;
}

/** 카드가 손패를 떠나 판 가운데로 갔는지(다 모아 가면 사라진다) */
async function expectPlayed(page: Page, card: string, fromY: number) {
  const button = page.locator(`button[data-card="${card}"]`);
  await expect
    .poll(async () => (await button.boundingBox())?.y ?? -1, {
      timeout: 5_000,
    })
    .toBeLessThan(fromY - 40);
}

test("하트: 키보드로 넘기고 내며, 터치로 끌어 낸다", async ({ page }) => {
  await prepare(page);
  await page.goto("/hearts");
  await page.getByRole("button", { name: /나홀로 하트/ }).click();
  await expect(page.getByText(/넘길 카드 3장/)).toBeVisible({
    timeout: 20_000,
  });
  for (let k = 0; k < 3; k++)
    await myCards(page)
      .nth(k)
      .click({ position: { x: 8, y: 8 } });
  // 카드 단추에서 손을 떼고 Enter를 누르면 패널의 넘기기 단추가 눌린다.
  await page.evaluate(() => (document.activeElement as HTMLElement)?.blur());
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("button", { name: "넘기기", exact: true }),
  ).toBeHidden();

  // 키보드: → 로 첫 카드를 고르고 Enter로 낸다.
  const turn = page.getByText(/낼 카드를 고르세요/);
  await expect(turn).toBeVisible({ timeout: 20_000 });
  const first = myCards(page).first();
  const card = (await first.getAttribute("data-card")) as string;
  const y = (await settledBox(first))?.y ?? 0;
  await page.evaluate(() => (document.activeElement as HTMLElement)?.blur());
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("Enter");
  await expectPlayed(page, card, y);

  // 터치: 다음 내 차례에 카드를 짚고 위로 끌어 올려 놓는다.
  await expect(turn).toBeHidden();
  await expect(turn).toBeVisible({ timeout: 20_000 });
  const target = myCards(page).last();
  const dragged = (await target.getAttribute("data-card")) as string;
  const box = await settledBox(target);
  if (!box) throw new Error("카드 자리를 모른다");
  await target.evaluate(
    (el, { x, y, h }) => {
      const fire = (type: string, cy: number) =>
        el.dispatchEvent(
          new PointerEvent(type, {
            bubbles: true,
            pointerType: "touch",
            isPrimary: true,
            clientX: x,
            clientY: cy,
          }),
        );
      fire("pointerdown", y);
      fire("pointermove", y - 20);
      fire("pointermove", y - h * 1.5);
      fire("pointerup", y - h * 1.5);
    },
    { x: box.x + 6, y: box.y + 10, h: box.height },
  );
  await expectPlayed(page, dragged, box.y);
});

test("하트: 방장이 방을 만들고 친구가 들어와 한 판을 둔다", async ({
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
  await host.goto("/hearts?net=local");
  await host.getByRole("button", { name: /다함께 하트/ }).click();
  await host.getByPlaceholder("친구들에게 보일 이름").fill("방장");
  await host.getByRole("button", { name: "방 만들기", exact: true }).click();
  const link = await host.locator("input[readonly]").inputValue();
  expect(link).toContain("/hearts");
  expect(link).toContain("room=");
  // 링크 복사가 기본 단추다.
  await host.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  await host.getByRole("button", { name: "복사", exact: true }).click();
  await expect(host.getByRole("button", { name: "복사됨" })).toBeVisible();
  expect(await host.evaluate(() => navigator.clipboard.readText())).toBe(link);

  await guest.goto(link);
  await guest.getByPlaceholder("친구들에게 보일 이름").fill("철수");
  await guest.getByRole("button", { name: "들어가기" }).click();
  await expect(guest.getByText("방장이 시작하기를 기다리는 중")).toBeVisible();
  await expect(host.getByText("철수")).toBeVisible();
  await host.getByRole("button", { name: "시작하기" }).click();
  await expect(guest.getByRole("button", { name: "점수판" })).toBeVisible();

  // 방장이 먼저 넘기면, 넘긴 세 장은 손패에서 빠져 "넘김" 표를 달고 모여 있다.
  // 암호화 방은 함께 섞고 나누는 데 시간이 걸린다.
  await expect(
    host.getByRole("button", { name: "넘기기", exact: true }),
  ).toBeVisible({ timeout: 60_000 });
  await stepOnce(host);
  await expect(host.getByText("다른 사람이 카드를 고르는 중")).toBeVisible();
  await expect(host.getByText("넘김", { exact: true })).toHaveCount(3);
  await host.screenshot({ path: info.outputPath("hearts-passed.png") });

  for (let i = 0; i < 600; i++) {
    const [h, g] = [await stepOnce(host), await stepOnce(guest)];
    if (h && g) break;
    await host.waitForTimeout(80);
  }
  await expect(host.getByRole("button", { name: "다음 판" })).toBeVisible();
  await expect(guest.getByRole("button", { name: "다음 판" })).toBeVisible();
  await guest.screenshot({ path: info.outputPath("hearts-online-guest.png") });

  // 방장이 나가면 기록이 공개되고 참가자가 공정성을 확인한다.
  await host.getByRole("button", { name: "나가기" }).click();
  await expect(
    guest.getByText("공정성 확인: 섞기와 진행에 문제가 없습니다"),
  ).toBeVisible({ timeout: 10_000 });
  expect(errors).toEqual([]);
});

test("하트 배우기: 설명·퀴즈·미션으로 단원을 끝낸다", async ({
  page,
}, info) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await prepare(page);
  await page.goto("/hearts");
  await page.getByRole("button", { name: /하트 배우기/ }).click();
  await expect(page.getByText("0/4")).toBeVisible();
  await page.screenshot({ path: info.outputPath("hearts-learn-1-home.png") });

  // 1단원: 설명 네 쪽, 퀴즈 두 개, 하트 떠넘기기 미션
  await page.getByRole("button", { name: /하트는 어떤 게임/ }).click();
  for (let i = 0; i < 4; i++)
    await page.getByRole("button", { name: "다음", exact: true }).click();
  await page.getByRole("button", { name: "16점" }).click();
  await page.getByRole("button", { name: "다음", exact: true }).click();
  await page.getByRole("button", { name: "클로버 2" }).click();
  await page.getByRole("button", { name: "다음", exact: true }).click();
  await page.getByRole("button", { name: "미션 시작" }).click();
  await expect(page.getByText(/하트를 남에게 떠넘기세요/)).toBeVisible();
  await expect(page.getByText(/낼 카드를 고르세요/)).toBeVisible({
    timeout: 20_000,
  });
  await page.screenshot({
    path: info.outputPath("hearts-learn-2-mission.png"),
  });
  await page
    .getByRole("button", { name: "♥A", exact: true })
    .click({ position: { x: 8, y: 8 } });
  await expect(page.getByRole("dialog", { name: "미션 성공" })).toBeVisible({
    timeout: 20_000,
  });
  await page.screenshot({
    path: info.outputPath("hearts-learn-3-success.png"),
  });
  await page.getByRole("button", { name: "다음", exact: true }).click();
  await expect(page.getByText("단원 완료!")).toBeVisible();
  await page.getByRole("button", { name: "단원 목록으로" }).click();
  await expect(page.getByText("1/4")).toBeVisible();

  // 2단원: 넘기기 미션
  await page.getByRole("button", { name: /카드 넘기기/ }).click();
  for (let i = 0; i < 2; i++)
    await page.getByRole("button", { name: "다음", exact: true }).click();
  await page.getByRole("button", { name: "넘기지 않는다" }).click();
  await page.getByRole("button", { name: "다음", exact: true }).click();
  await page.getByRole("button", { name: "미션 시작" }).click();
  const pass = page.getByRole("button", { name: "넘기기", exact: true });
  await expect(pass).toBeVisible({ timeout: 20_000 });
  // 고르는 도중 새 화면이 늦게 와 고른 카드가 비워질 수 있다(느린 CI). 카드마다 골라졌는지 보고, 안 골라졌으면 다시 누른다.
  await expect(async () => {
    for (const card of ["♠Q", "♠K", "♠A"]) {
      const button = page.getByRole("button", { name: card, exact: true });
      if ((await button.getAttribute("aria-pressed")) !== "true")
        await button.click({ position: { x: 8, y: 8 } });
    }
    await expect(pass).toBeEnabled({ timeout: 2_000 });
  }).toPass({ timeout: 20_000 });
  await pass.click();
  await expect(page.getByRole("dialog", { name: "미션 성공" })).toBeVisible({
    timeout: 20_000,
  });
  expect(errors).toEqual([]);
});

test("무늬 표기: 기본은 그림, 옵션에서 이름·첫 글자로 바꾼다", async ({
  page,
}) => {
  await prepare(page);
  await page.goto("/hearts");
  await page.getByRole("button", { name: "옵션" }).click();
  const sample = page.locator("[data-suit-sample]");
  // 그림이어도 읽을 때는 기호로 읽힌다.
  await expect(sample.locator("svg")).toHaveCount(4);
  await expect(sample).toHaveText("♠13 · ♣A · ♥Q · ◆K");
  await page.getByRole("button", { name: "이름", exact: true }).click();
  await expect(sample).toHaveText(
    "스페이드 13 · 클로버 A · 하트 Q · 다이아몬드 K",
  );
  await page.getByRole("button", { name: "첫 글자", exact: true }).click();
  await expect(sample).toHaveText("스13 · 클A · 하Q · 다K");
  await page.getByRole("button", { name: "기호", exact: true }).click();
  await expect(sample).toHaveText("♠13 · ♧A · ♥Q · ♢K");
});

test("화면을 돌리면 카드를 날리지 않고 가렸다가 다시 보인다", async ({
  page,
}, info) => {
  test.skip(info.project.name !== "desktop", "데스크톱에서만 돌린다");
  await prepare(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/hearts");
  await page.getByRole("button", { name: /나홀로 하트/ }).click();
  await expect(page.getByText(/넘길 카드 3장/)).toBeVisible({
    timeout: 20_000,
  });
  // 가리는 순간이 짧아 class가 붙는지를 지켜본다.
  await page.evaluate(() => {
    const w = window as unknown as { relayoutSeen: boolean };
    w.relayoutSeen = false;
    new MutationObserver(() => {
      if (document.querySelector(".relayout")) w.relayoutSeen = true;
    }).observe(document.body, {
      subtree: true,
      attributes: true,
      attributeFilter: ["class"],
    });
  });
  await page.setViewportSize({ width: 844, height: 390 });
  await expect
    .poll(() =>
      page.evaluate(
        () => (window as unknown as { relayoutSeen: boolean }).relayoutSeen,
      ),
    )
    .toBe(true);
  await expect(page.locator(".relayout")).toHaveCount(0);
  // 넘기기 패널이 새 화면에서도 보인다.
  await expect(page.getByText(/넘길 카드 3장/)).toBeVisible();
});
