import { expect, test } from "@playwright/test";

test("보안 배우기: 장난감 체험과 퀴즈가 돌아간다", async ({ page }, info) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/learn");
  await expect(page.getByText("0/13단원")).toBeVisible();
  // 교환 가능한 자물쇠: 잠근 순서와 상관없이 같다.
  await expect(page.getByText(/✓ 지수끼리 곱해지므로/)).toBeVisible();
  // 이차잉여 누출: 잘못된 방식은 판정으로 빨강을 다 맞힌다.
  await page.getByRole("button", { name: "상대가 잠그고 섞기" }).click();
  await page.getByRole("button", { name: /판정 돌려 보기/ }).click();
  await page.getByRole("button", { name: "정답 보기" }).click();
  await expect(page.getByText(/8\/8 맞혔다/)).toBeVisible();
  // 영지식 증명: 정직한 증명은 통과한다.
  await page.getByRole("button", { name: "a, b 내기" }).click();
  await page.getByRole("button", { name: "c 고르기" }).click();
  await expect(page.getByText(/✓ 통과\. z에는/)).toBeVisible();
  // cut-and-choose: 버티다 보면 들킨다(아주 드물게 16번 버틴다).
  for (let i = 0; i < 16; i++) {
    const button = page.getByRole("button", { name: /입력에서 정직하게/ });
    if (await button.isDisabled()) break;
    await button.click();
  }
  await expect(
    page.getByText(/번째에 들켰다|16번을 모두 버텼다/),
  ).toBeVisible();
  // 도전값을 해시로 정하면 다시 시도해 노릴 수 있다.
  await page.getByRole("button", { name: "8", exact: true }).first().click();
  await page.getByRole("button", { name: /해시로 정할 때/ }).click();
  await expect(page.getByText(/해시를 돌렸더니 원하는 도전값/)).toBeVisible({
    timeout: 20_000,
  });
  // 퀴즈를 맞히면 단원을 마친다.
  await page
    .getByRole("button", { name: "자기 자리에서 보이는 정보만 있다" })
    .click();
  await expect(page.getByText("1/13단원")).toBeVisible();
  // 심화: ElGamal 다시 감싸기 뒤에도 둘 다 풀면 원래 카드(♠A = 4)가 나온다.
  await page.getByRole("button", { name: /다시 감싸기/ }).click();
  await page.getByRole("button", { name: /다시 감싸기/ }).click();
  await page.getByRole("button", { name: "둘 다 풀기" }).click();
  await expect(page.locator("#elgamal").getByText("→ 4")).toBeVisible();
  // 다항식 확인: 복제 카드는 거의 언제나 잡힌다.
  await page.getByRole("button", { name: "B = 섞으며 한 장을 복제" }).click();
  for (let i = 0; i < 5; i++)
    await page.getByRole("button", { name: "무작위 t 뽑기" }).click();
  await expect(page.getByText(/t를 5번 뽑아/)).toBeVisible();
  // OR 증명: 두 쪽 모두 맞아 어느 쪽이 진짜인지 모른다.
  await page.getByRole("button", { name: "증명 만들기" }).click();
  await expect(page.getByText("증명이 맞다")).toBeVisible();
  await page
    .locator("#no-suit")
    .getByRole("button", { name: "왼쪽", exact: true })
    .click();
  await expect(page.getByText(/반반 찍기보다 나을 수/)).toBeVisible();
  await page
    .locator("#elgamal")
    .screenshot({ path: info.outputPath("elgamal.png") });
  await page
    .locator("#no-suit")
    .screenshot({ path: info.outputPath("no-suit.png") });
  await page.screenshot({ path: info.outputPath("learn.png"), fullPage: true });
  expect(errors).toEqual([]);
});
