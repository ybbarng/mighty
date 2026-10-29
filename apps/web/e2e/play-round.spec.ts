import { expect, type Page, test } from "@playwright/test";

import { prepareFast } from "./fast";
import { startSolo } from "./start";

/** 낼 수 있는 첫 카드나 지금 필요한 단추를 누른다. 판이 끝나면 true */
async function stepOnce(page: Page): Promise<boolean> {
  if (await page.getByRole("button", { name: "다음 판" }).isVisible())
    return true;
  // 은어(기본으로 켜짐)면 "그냥 내기"가 "쪼콜 아님"으로 보인다.
  for (const name of ["포기", "그냥 내기", "쪼콜 아님"]) {
    const button = page.getByRole("button", { name, exact: true });
    if (await button.isVisible()) {
      await button.click();
      return false;
    }
  }
  const spade = page
    .getByRole("button", { name: "♠" })
    .and(page.locator("[title='스페이드']"));
  if (await spade.first().isVisible()) {
    await spade.first().click();
    return false;
  }
  // 낼 수 있는 카드만 밝게 보이고 누를 수 있다.
  const card = page
    .locator("button[aria-label]:not([disabled]):not([class*='brightness'])")
    .filter({
      hasNot: page.locator("text=뒷면"),
    });
  const candidates = await card.all();
  for (const c of candidates) {
    const label = await c.getAttribute("aria-label");
    if (label && label !== "뒷면 카드" && /^[♠♥◆♣]|조커/.test(label)) {
      // 겹친 손패는 카드의 보이는 왼쪽 위를 누른다.
      await c.click({ position: { x: 8, y: 8 } });
      return false;
    }
  }
  // 컴퓨터 차례: 화면이 바뀔 때까지 잠깐 둔다(폴링 간격)
  await page.waitForTimeout(50);
  return false;
}

test("컴퓨터 4명과 한 판을 끝까지 하고, 내 기록과 복기에 남는다", async ({
  page,
}, testInfo) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  await prepareFast(page);
  await page.goto("/mighty");

  await expect(page.getByRole("img", { name: /마이티/ })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("1-start.png") });

  await startSolo(page);
  await expect(page.getByRole("button", { name: "포기" })).toBeVisible({
    timeout: 15_000,
  });
  await page.screenshot({ path: testInfo.outputPath("2-election.png") });

  let tookTrickShot = false;
  for (let i = 0; i < 800; i++) {
    if (await stepOnce(page)) break;
    if (
      !tookTrickShot &&
      (await page
        .getByText(/\d+\/10( ·|턴)/)
        .first()
        .isVisible())
    ) {
      await page.screenshot({ path: testInfo.outputPath("3-trick.png") });
      tookTrickShot = true;
    }
  }

  // 판이 끝나면 가운데에 크게 승패 문구가 떴다가 사라진다.
  const banner = page.locator("[data-result-banner]");
  await expect(banner).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("4-banner.png") });
  await expect(banner).toBeHidden({ timeout: 5_000 });

  await expect(page.getByRole("button", { name: "다음 판" })).toBeVisible();
  await expect(page.getByRole("heading", { name: /승리|패배/ })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("5-result.png") });
  // 결과 상자와 분석 표 모두 여당·야당 표시가 붙는다.
  await page.getByText("이번 판 분석").click();
  await expect(page.getByText("여당", { exact: true }).first()).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("6-analysis.png") });

  // 손패 카드는 화면 안에 있어야 한다.
  const viewport = page.viewportSize();
  for (const box of await Promise.all(
    (await page.locator("button[aria-label]").all()).map((b) =>
      b.boundingBox(),
    ),
  )) {
    if (!box || !viewport) continue;
    expect(box.x).toBeGreaterThanOrEqual(-1);
    expect(box.x + box.width).toBeLessThanOrEqual(viewport.width + 1);
  }

  // 끝낸 판은 내 기록에 쌓인다.
  await page.goto("/profile");
  await expect(page.getByText(/1판 · 게임 0번/)).toBeVisible();
  await expect(page.getByText("역할별 승률")).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath("7-profile.png"),
    fullPage: true,
  });
  // 복기: 남긴 게임을 열어 판 한눈에 보기와 다시 보기를 확인한다.
  await page.getByRole("link", { name: /지난 게임 복기/ }).click();
  await page.getByRole("button", { name: /마이티 · 혼자/ }).click();
  await expect(page.getByText("1판").first()).toBeVisible();
  await expect(page.getByText("턴 표").first()).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath("8-review.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: "▶ 이 판 다시 보기" }).first().click();
  await expect(page.getByRole("toolbar", { name: "다시 보기" })).toBeVisible();
  const forward = page.getByRole("button", { name: "한 걸음 앞으로" });
  for (let k = 0; k < 12; k++) await forward.click();
  // 상황판 없이 모든 패만 펼친 화면
  await page.getByRole("button", { name: "모든 패 보기" }).click();
  await expect(
    page.getByRole("button", { name: "모든 패 숨기기" }),
  ).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("9-replay-open.png") });
  await page.getByRole("button", { name: "모든 패 숨기기" }).click();
  await page.getByRole("button", { name: "상황판" }).click();
  await expect(
    page.getByRole("complementary", { name: "상황판" }),
  ).toBeVisible();
  // 다음 수를 고수의 수와 견준다(고수는 생각하는 데 조금 걸린다).
  await expect(page.getByText(/실제:/)).toBeVisible();
  await expect(page.getByText("생각하는 중…")).toHaveCount(0, {
    timeout: 15_000,
  });
  // 걸음 해설(고수의 계산)
  await expect(page.getByText("해설을 계산하는 중…")).toHaveCount(0, {
    timeout: 15_000,
  });
  await page.screenshot({ path: testInfo.outputPath("10-replay.png") });
  // 복기 기록을 파일로 내보낸다.
  await page.getByRole("button", { name: "다시 보기 나가기" }).click();
  await page.getByRole("button", { name: "← 목록" }).click();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "내보내기" }).click();
  expect((await download).suggestedFilename()).toMatch(/^mighty-review-/);

  expect(errors).toEqual([]);
});

for (const preset of ["표준 5마", "표준 7마"]) {
  test(`${preset}: 공약 단추가 스크롤 없이 다 보인다`, async ({ page }) => {
    await prepareFast(page);
    await page.goto("/mighty");
    await startSolo(page, preset);
    const bid = page.getByRole("button", { name: /^출마/ });
    await bid.waitFor({ timeout: 20_000 });
    // 눕힌 폰처럼 낮은 화면에서도 패널 안에서 잘리지 않아야 한다.
    await expect(bid).toBeInViewport({ ratio: 1 });
    await expect(page.getByRole("button", { name: "올리기" })).toBeInViewport({
      ratio: 1,
    });
  });
}

test("움직임 줄이기를 켜면 섞고 나눠 주는 연출 없이 바로 공약을 정한다", async ({
  page,
}) => {
  await prepareFast(page);
  await page.goto("/mighty");
  await startSolo(page);
  // 연출이 있으면 2초 넘게 걸린다.
  await expect(page.getByText("공약을 정하세요")).toBeVisible({
    timeout: 1500,
  });
});

test("연출을 켜면 섞고 나눠 주는 장면을 지나 공약을 정한다", async ({
  page,
}, testInfo) => {
  // 다른 시험은 움직임 줄이기로 연출을 건너뛴다. 연출이 있는 길은 여기서 한 번 본다.
  test.skip(testInfo.project.name !== "desktop", "데스크톱에서만 돌린다");
  await page.addInitScript(() => {
    sessionStorage.setItem("mighty-splash-seen", "1");
    localStorage.setItem(
      "mighty-settings",
      JSON.stringify({ state: { speed: 1.6, sound: false }, version: 0 }),
    );
  });
  await page.goto("/mighty");
  await startSolo(page);
  // 나눠 주는 연출이 돌고, 끝나면 사라지고 공약을 정한다.
  await expect(page.locator("[data-dealing]")).toHaveCount(1);
  await page.screenshot({ path: testInfo.outputPath("dealing.png") });
  await expect(page.getByText("공약을 정하세요")).toBeVisible({
    timeout: 20_000,
  });
  await expect(page.locator("[data-dealing]")).toHaveCount(0);
});
