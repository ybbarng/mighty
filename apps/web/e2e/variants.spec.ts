import { expect, type Page, test } from "@playwright/test";

import { startSolo } from "./start";

/**
 * 인원별로 내가 주공이 되는 길로 한 판을 끝까지 두며 장면마다 화면을 찍는다.
 * 2마 고르기, 6·7마 죽이기, 바닥 카드 교환, 프렌드, 조커·조커콜 선택지를 모두 지나간다.
 */
const VARIANTS = [
  { preset: "표준 5마", name: "5ma" },
  { preset: "표준 6마", name: "6ma" },
  { preset: "표준 7마", name: "7ma" },
  { preset: "표준 4마", name: "4ma" },
  { preset: "표준 3마", name: "3ma" },
  { preset: "표준 2마", name: "2ma" },
];

async function prepare(page: Page) {
  await page.addInitScript(() => {
    sessionStorage.setItem("mighty-splash-seen", "1");
    localStorage.setItem(
      "mighty-settings",
      JSON.stringify({ state: { speed: 1.6, sound: false }, version: 0 }),
    );
  });
}

const visible = (page: Page, name: string | RegExp) =>
  page.getByRole("button", { name, exact: typeof name === "string" });

async function clickPlayableCards(page: Page, count: number): Promise<number> {
  let clicked = 0;
  const cards = await page
    .locator("button[aria-label]:not([disabled]):not([class*='brightness'])")
    .all();
  for (const card of cards) {
    const label = await card.getAttribute("aria-label");
    if (!label || !/^[♠♥◆♣]|조커/.test(label)) continue;
    // 겹친 손패(세로 두 줄)는 카드의 보이는 왼쪽 위를 누른다.
    await card.click({ position: { x: 8, y: 8 } });
    clicked++;
    if (clicked >= count) break;
  }
  return clicked;
}

for (const variant of VARIANTS) {
  test(`${variant.preset}: 주공이 되어 한 판을 끝까지 둔다`, async ({
    page,
  }, testInfo) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("console", (m) => {
      if (m.type() === "error") errors.push(m.text());
    });
    await prepare(page);
    await page.goto("/");
    await startSolo(page, variant.preset);

    const shots = new Set<string>();
    const shot = async (key: string) => {
      if (shots.has(key)) return;
      shots.add(key);
      await page.waitForTimeout(400);
      await page.screenshot({
        path: testInfo.outputPath(`${variant.name}-${shots.size}-${key}.png`),
      });
    };

    for (let i = 0; i < 600; i++) {
      if (await visible(page, "다음 판").isVisible()) break;

      if (await page.getByText("한 장을 고르세요").isVisible()) {
        await shot("pick");
        await page.getByRole("button", { name: "안 보이는 카드" }).click();
      } else if (await page.getByText("공약을 정하세요").isVisible()) {
        await shot("election");
        // 가장 높은 숫자까지 올려 바로 당선된다.
        const up = page.getByRole("button", { name: "올리기" });
        for (let k = 0; k < 15 && (await up.isEnabled()); k++) await up.click();
        await page.getByRole("button", { name: /^출마/ }).click();
      } else if (await page.getByText("이번 판에서 뺄 사람").isVisible()) {
        await shot("kill");
        // 내 손에 없고 아직 안 고른 카드 중 처음 것
        const ranks = await page
          .locator("button:not([disabled])")
          .filter({ hasText: /^(A|K|Q|J|10|[2-9])$/ })
          .all();
        if (ranks[0]) await ranks[0].click();
        await page.getByRole("button", { name: /지목$/ }).click();
      } else if (await page.getByText("당선을 축하합니다").isVisible()) {
        await shot("exchange");
        const discards = page.getByText(/버릴 카드/).first();
        await expect(discards).toBeVisible();
        // 3장이 다 골라질 때까지 누른다(바닥 카드가 들어오는 중에 누르면 기다렸다가 다시).
        for (let k = 0; k < 8; k++) {
          if (await page.getByText("(3/3)").isVisible()) break;
          const target = page
            .locator(
              "button[aria-label]:not([disabled]):not([class*='0_0_0_3px'])",
            )
            .filter({ hasText: /[0-9AJQK]/ })
            .first();
          if (await target.isVisible())
            await target.click({ position: { x: 8, y: 8 } });
          await page.waitForTimeout(250);
        }
        await shot("exchange-selected");
        await page.getByRole("button", { name: /로 확정$/ }).click();
      } else if (await page.getByText("프렌드를 정하세요").isVisible()) {
        await shot("friend");
        await page.getByRole("button", { name: "확정", exact: true }).click();
      } else if (
        await page.getByText("조커로 부를 무늬를 고르세요").isVisible()
      ) {
        await shot("joker-suit");
        await page.locator("button[title='스페이드']").first().click();
      } else if (await page.getByText(/조커콜을 할까요/).isVisible()) {
        await shot("joker-call");
        await page.getByRole("button", { name: "조커콜!" }).click();
      } else if (
        await page.getByText(/선입니다|낼 카드를 고르세요/).isVisible()
      ) {
        if (!shots.has("trick")) await shot("trick");
        await clickPlayableCards(page, 1);
      } else {
        // 트릭 중간에 내 차례가 오면 안내 문구 없이 손패만 밝아진다.
        await clickPlayableCards(page, 1);
      }
      await page.waitForTimeout(120);
    }

    await expect(
      page.getByRole("heading", { name: /승리|패배/ }),
    ).toBeVisible();
    await shot("result");
    // 끝낸 판은 내 기록에 쌓인다.
    await page.goto("/profile");
    await expect(page.getByText(/1판 · 게임 0번/)).toBeVisible();
    await expect(page.getByText("역할별 승률")).toBeVisible();
    await page.screenshot({
      path: testInfo.outputPath(`${variant.name}-profile.png`),
      fullPage: true,
    });
    if (variant.name !== "5ma") {
      expect(errors).toEqual([]);
      return;
    }
    // 복기: 남긴 게임을 열어 판 한눈에 보기와 다시 보기를 확인한다.
    await page.getByRole("link", { name: /지난 게임 복기/ }).click();
    await page.getByRole("button", { name: /마이티 · 혼자/ }).click();
    await expect(page.getByText("1판").first()).toBeVisible();
    await expect(page.getByText("턴 표").first()).toBeVisible();
    await page.screenshot({
      path: testInfo.outputPath("5ma-review.png"),
      fullPage: true,
    });
    await page
      .getByRole("button", { name: "▶ 이 판 다시 보기" })
      .first()
      .click();
    await expect(
      page.getByRole("toolbar", { name: "다시 보기" }),
    ).toBeVisible();
    for (let k = 0; k < 12; k++) {
      await page.getByRole("button", { name: "한 걸음 앞으로" }).click();
      await page.waitForTimeout(250);
    }
    await page.getByRole("button", { name: "상황판" }).click();
    await expect(page.getByText("모든 패")).toBeVisible();
    await page.waitForTimeout(800);
    await page.screenshot({ path: testInfo.outputPath("5ma-replay.png") });
    expect(errors).toEqual([]);
  });
}
