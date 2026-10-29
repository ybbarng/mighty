import { prepareFast } from "./fast";
import { startSolo } from "./start";
import { expect, type Page, test } from "./test";

/**
 * 인원별로 내가 주공이 되는 길로 첫 트릭에 카드를 낼 때까지 두며 장면마다 화면을 찍는다.
 * 2마 고르기, 6·7마 죽이기, 바닥 카드 교환, 프렌드, 조커·조커콜 선택지처럼 인원마다 다른 화면은
 * 모두 첫 트릭 전에 나온다. 판 끝·내 기록·복기는 인원과 상관없는 같은 화면이라
 * `play-round`의 한 판(5마)이 본다. 트릭 진행 규칙은 엔진 단위 시험이 본다.
 */
const VARIANTS = [
  { preset: "표준 5마", name: "5ma" },
  { preset: "표준 6마", name: "6ma" },
  { preset: "표준 7마", name: "7ma" },
  { preset: "표준 4마", name: "4ma" },
  { preset: "표준 3마", name: "3ma" },
  { preset: "표준 2마", name: "2ma" },
];

const visible = (page: Page, name: string | RegExp) =>
  page.getByRole("button", { name, exact: typeof name === "string" });

async function clickPlayableCard(page: Page): Promise<boolean> {
  const cards = await page
    .locator("button[aria-label]:not([disabled]):not([class*='brightness'])")
    .all();
  for (const card of cards) {
    const label = await card.getAttribute("aria-label");
    if (!label || !/^[♠♥◆♣]|조커/.test(label)) continue;
    // 겹친 손패(세로 두 줄)는 카드의 보이는 왼쪽 위를 누른다.
    await card.click({ position: { x: 8, y: 8 } });
    return true;
  }
  return false;
}

for (const variant of VARIANTS) {
  test(`${variant.preset}: 주공이 되어 인원마다 다른 장면을 지나 첫 트릭에 카드를 낸다`, async ({
    page,
  }, testInfo) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("console", (m) => {
      if (m.type() === "error") errors.push(m.text());
    });
    await prepareFast(page);
    await page.goto("/mighty");
    await startSolo(page, variant.preset);

    const shots = new Set<string>();
    const shot = async (key: string) => {
      if (shots.has(key)) return;
      shots.add(key);
      await page.screenshot({
        path: testInfo.outputPath(`${variant.name}-${shots.size}-${key}.png`),
      });
    };

    let played = false;
    for (let i = 0; i < 300 && !played; i++) {
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
        await expect(page.getByText(/버릴 카드/).first()).toBeVisible();
        // 버릴 카드가 다 골라질 때까지(2마 1장, 그 밖 3장) 하나씩 누른다.
        await expect(async () => {
          if (await page.getByText(/\((\d)\/\1\)/).isVisible()) return;
          const target = page
            .locator(
              "button[aria-label]:not([disabled]):not([class*='0_0_0_3px'])",
            )
            .filter({ hasText: /[0-9AJQK]/ })
            .first();
          await target.click({ position: { x: 8, y: 8 } });
          await expect(page.getByText(/\((\d)\/\1\)/)).toBeVisible({
            timeout: 200,
          });
        }).toPass({ intervals: [50], timeout: 10_000 });
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
        // 은어가 기본으로 켜져 있어 "쪼카컴!"으로 보인다. 은어를 끈 설정이면 "조커콜!"
        await page.getByRole("button", { name: /^(조커콜!|쪼카컴!)$/ }).click();
      } else if (
        await page.getByText(/선입니다|낼 카드를 고르세요/).isVisible()
      ) {
        await shot("trick");
        played = await clickPlayableCard(page);
      } else if (await visible(page, "다음 판").isVisible()) {
        break;
      } else {
        // 컴퓨터 차례: 화면이 바뀔 때까지 잠깐 둔다(폴링 간격)
        await page.waitForTimeout(50);
      }
    }

    // 주공으로 당선되어 첫 트릭에 카드를 냈다(인원마다 다른 장면을 모두 지났다).
    expect(shots.has("election")).toBe(true);
    expect(played).toBe(true);
    await page.screenshot({
      path: testInfo.outputPath(`${variant.name}-played.png`),
    });
    expect(errors).toEqual([]);
  });
}
