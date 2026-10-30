import { expect, test } from "./test";

// 검증하기 페이지: 시험 값이 이 브라우저에서 다시 계산돼 기대값과 같고, 장부 전체 검사가 통과를 보이며,
// 휴대폰 세로에서 가로로 넘치지 않는다(배치는 한 크기로 충분하다)
test("검증하기: 시험 값 다시 계산과 장부 전체 검사가 통과한다", async ({
  page,
}, info) => {
  test.skip(
    info.project.name !== "phone-portrait",
    "휴대폰 세로 한 크기로 본다",
  );
  await page.goto("/stardraw/verify");
  await expect(page.getByRole("heading", { name: "검증하기" })).toBeVisible();
  // 화면을 거치지 않는 길: 터미널 검사기와 화면 코드 해시 비교
  await expect(
    page.getByRole("heading", { name: "터미널 검사기" }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "/build-hashes.json" }),
  ).toHaveAttribute("href", "/build-hashes.json");

  // 무거운 것(Argon2 16MB)을 뺀 시험 값은 저절로 계산된다
  await expect(
    page
      .locator("[data-vector][data-status='wait']")
      .filter({ hasNot: page.getByRole("button") }),
  ).toHaveCount(0);
  await expect(page.locator("[data-vector][data-status='fail']")).toHaveCount(
    0,
  );
  expect(
    await page.locator("[data-vector][data-status='pass']").count(),
  ).toBeGreaterThan(20);

  // 빌드에 서버 주소가 없으면 이 기기의 연습 장부를 검사한다
  await page.getByRole("button", { name: "장부 전체 검사" }).click();
  const result = page.locator("[data-check-result]");
  await expect(result).toHaveAttribute("data-check-result", "pass");
  await expect(
    result.locator("[data-check-item='timestamp'][data-status='skip']"),
  ).toBeVisible();
  // 국장 열쇠 내력(운영 기록, docs/36 11-12)
  await expect(result.locator("[data-director-history]")).toContainText(
    "국장 열쇠 지정 기록이 없습니다",
  );

  // 콘솔 함수도 같은 검사를 부른다
  const viaConsole = await page.evaluate(async () => {
    const api = (
      window as unknown as {
        stardraw: { verify(): Promise<{ problems: unknown[] }> };
      }
    ).stardraw;
    return (await api.verify()).problems.length;
  });
  expect(viaConsole).toBe(0);

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
  await page.screenshot({
    path: info.outputPath("stardraw-verify.png"),
    fullPage: true,
  });
});
