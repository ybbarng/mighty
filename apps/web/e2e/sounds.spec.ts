import { expect, test } from "@playwright/test";

/** 효과음끼리 크기 차이가 커서 깜짝 놀라지 않게 한다(/sounds가 그려 본 소리로 잰다) */
test("효과음 크기 차이가 크지 않다", async ({ page }, info) => {
  // 소리는 화면 크기와 상관없다.
  test.skip(info.project.name !== "desktop", "데스크톱에서만 돌린다");
  await page.goto("/sounds");
  // 모든 소리를 다 잴 때까지 기다린다.
  await page.waitForFunction(
    () =>
      [...document.querySelectorAll("[data-level]")].every((e) =>
        e.hasAttribute("data-loudness"),
      ),
    null,
    { timeout: 60_000 },
  );
  const rows = await page.locator("[data-level]").evaluateAll((els) =>
    els.map((e) => ({
      cue: e.getAttribute("data-level"),
      loudness: Number(e.getAttribute("data-loudness")),
      peak: Number(e.getAttribute("data-peak")),
    })),
  );
  expect(rows.length).toBeGreaterThan(20);
  const loudness = rows.map((r) => r.loudness);
  // 가장 작은 "삑"부터 가장 큰 소리까지 12dB 안(지금 약 10dB)
  expect(Math.max(...loudness) - Math.min(...loudness)).toBeLessThanOrEqual(12);
  // 중요한 소리도 평범한 카드보다 9dB 넘게 크지 않다(지금 약 6~7dB)
  const card = rows.find((r) => r.cue === "card")?.loudness ?? 0;
  for (const r of rows)
    expect(r.loudness - card, r.cue ?? "").toBeLessThanOrEqual(9);
  // 갑자기 튀는 순간이 없다(지금 가장 큰 것이 나눠 주기 약 -13.7dB).
  // renderCue가 난수 씨앗을 고정하므로 같은 소리는 늘 같은 값이 나온다.
  for (const r of rows) expect(r.peak, r.cue ?? "").toBeLessThanOrEqual(-12);
});
