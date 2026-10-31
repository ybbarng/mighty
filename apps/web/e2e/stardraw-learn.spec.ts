import { expect, type Page, test } from "./test";

// 하늘의 별 따기 보안 배우기: 단계마다 규칙 코드가 이 브라우저에서 실제로 계산하고,
// 바꿔 보면 확인이 실패하는 것을 본다. 상호작용은 휴대폰 세로 한 크기로, 데스크톱은 배치와 스크린숏만 본다

const verdict = (page: Page, id: string) =>
  page.locator(`[data-verdict='${id}']`);

test("보안 배우기: 직접 해 보기 상자가 실제 계산으로 통과·실패를 보인다", async ({
  page,
}, info) => {
  test.skip(
    info.project.name !== "phone-portrait",
    "휴대폰 세로 한 크기로 본다",
  );
  await page.goto("/stardraw/learn");
  await expect(
    page.getByRole("heading", { name: /하늘의 별 따기 보안/ }),
  ).toBeVisible();
  // 단계는 접혀 있다(휴대폰에서 세로로 너무 길었다). 모두 펼쳐 차례로 해 본다
  await expect(page.locator("[data-toy='sign']")).toBeHidden();
  for (const toggle of await page.locator("[data-lesson-toggle]").all())
    await toggle.click();

  // 1. 서명: 서명한 뒤 회차를 바꾸면 확인이 실패한다
  const sign = page.locator("[data-toy='sign']");
  await sign.getByRole("button", { name: "이 번호로 서명하기" }).click();
  await expect(verdict(page, "sign")).toHaveAttribute("data-ok", "pass");
  await sign.getByRole("button", { name: /회차 바꾸기/ }).click();
  await expect(verdict(page, "sign")).toHaveAttribute("data-ok", "fail");

  // 2. 패스키: 비밀 열쇠는 꺼낼 수 없고, 가짜 주소의 서명은 거절된다
  const passkey = page.locator("[data-toy='passkey']");
  await passkey.getByRole("button", { name: "비밀 열쇠 꺼내 보기" }).click();
  await expect(passkey.locator("[data-export-result]")).toContainText(
    "InvalidAccessError",
  );
  await passkey.getByRole("button", { name: /비슷한 가짜/ }).click();
  await passkey.getByRole("button", { name: "응모권에 패스키로 서명" }).click();
  await expect(verdict(page, "passkey")).toHaveAttribute("data-ok", "fail");
  await passkey
    .getByRole("button", { name: "브라우저가 막지 않았다면?" })
    .click();
  await expect(passkey).toContainText("https://game-byb.kr");
  await expect(verdict(page, "passkey")).toHaveAttribute("data-ok", "fail");
  await passkey.getByRole("button", { name: /진짜/ }).click();
  await passkey.getByRole("button", { name: "응모권에 패스키로 서명" }).click();
  await passkey.getByRole("button", { name: "확인", exact: true }).click();
  await expect(verdict(page, "passkey")).toHaveAttribute("data-ok", "pass");
  // 본인 확인(UV) 없이 한 서명은 진짜 주소여도 거절된다
  await passkey.getByLabel(/지문·얼굴·PIN 없이 서명/).check();
  await passkey.getByRole("button", { name: "응모권에 패스키로 서명" }).click();
  await passkey.getByRole("button", { name: "확인", exact: true }).click();
  await expect(verdict(page, "passkey")).toHaveAttribute("data-ok", "fail");
  await expect(passkey).toContainText("본인 확인(UV)");
  await passkey.screenshot({ path: info.outputPath("passkey-no-uv.png") });

  // 3. 작업 증명: 가장 가벼운 설정으로 실제 Argon2id를 푼다
  const pow = page.locator("[data-toy='pow']");
  await pow.getByRole("button", { name: "256KB" }).click();
  await pow.getByRole("button", { name: "1번", exact: true }).click();
  await pow.getByRole("button", { name: "응모권 한 장 만들기" }).click();
  await expect(pow.locator("[data-pow-result]")).toHaveAttribute(
    "data-pow-result",
    "done",
  );
  await expect(verdict(page, "pow")).toHaveAttribute("data-ok", "pass");

  // 4. 머클: 응모권 하나를 빼면 봉인한 뿌리와 어긋나고 내 증명도 닿지 않는다
  await expect(verdict(page, "merkle-proof")).toHaveAttribute(
    "data-ok",
    "pass",
  );
  const merkle = page.locator("[data-toy='merkle']");
  await merkle.getByRole("button", { name: "빼기" }).nth(1).click();
  await expect(verdict(page, "merkle-root")).toHaveAttribute("data-ok", "fail");
  await expect(verdict(page, "merkle-proof")).toHaveAttribute(
    "data-ok",
    "fail",
  );

  // 5. 시각 인증: 받아 둔 실제 토큰은 맞고, 토큰 안 시각을 고치면 실패한다
  await expect(verdict(page, "tsa")).toHaveAttribute("data-ok", "pass");
  await page
    .locator("[data-toy='tsa']")
    .getByRole("button", { name: "토큰 안 시각 고치기" })
    .click();
  await expect(verdict(page, "tsa")).toHaveAttribute("data-ok", "fail");

  // 6. drand: 실제 BLS 서명이 맞고, 뽑은 차례가 규칙 코드와 같다
  await expect(verdict(page, "drand-sig")).toHaveAttribute("data-ok", "pass");
  await expect(verdict(page, "drand-draw")).toContainText(
    "45, 29, 5, 38, 37, 41, 4",
  );

  // 7. 사슬: 2회차를 고치면 3회차에서 끊긴다
  await expect(verdict(page, "chain-linked")).toHaveAttribute(
    "data-ok",
    "pass",
  );
  await page
    .locator("[data-chain-round='2']")
    .getByRole("button", { name: "번호 고치기" })
    .click();
  await expect(verdict(page, "chain-linked")).toHaveAttribute(
    "data-ok",
    "fail",
  );
  await expect(page.locator("[data-chain-round='3']")).toHaveAttribute(
    "data-linked",
    "false",
  );

  // 8. 별 세 개: 그대로면 같고, 가운데서 열쇠를 바꾸면 별과 서명 검사가 모두 어긋난다
  await expect(verdict(page, "sas-stars")).toHaveAttribute("data-ok", "pass");
  await page
    .locator("[data-toy='sas']")
    .getByRole("button", { name: "가운데서 열쇠 바꿔치기" })
    .click();
  await expect(verdict(page, "sas-claim")).toHaveAttribute("data-ok", "fail");
  await expect(verdict(page, "sas-stars")).toHaveAttribute("data-ok", "fail");

  // 9. 공격해 보기: 정직한 장부는 통과, 끼워 넣기는 봉인 토큰에서 걸린다
  await expect(verdict(page, "attack-honest")).toHaveAttribute(
    "data-ok",
    "pass",
  );
  await page.locator("[data-attack='op-insert']").click();
  await expect(page.locator("[data-attack-result]")).toHaveAttribute(
    "data-attack-result",
    "done",
  );
  await expect(page.locator("[data-attack-result]")).toContainText("봉인");

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
  await page.screenshot({
    path: info.outputPath("stardraw-learn-phone.png"),
    fullPage: true,
  });
});

test("보안 배우기: 데스크톱 배치", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop", "데스크톱 한 크기로 본다");
  await page.goto("/stardraw/learn#attack");
  await expect(verdict(page, "attack-honest")).toHaveAttribute(
    "data-ok",
    "pass",
  );
  // 주소의 # 단계만 펼쳐 있다. 다른 단계는 목록에서 누르면 펼친다
  await expect(verdict(page, "tsa")).toBeHidden();
  await page.locator("nav a[href='#tsa']").click();
  await expect(verdict(page, "tsa")).toHaveAttribute("data-ok", "pass");
  await page.screenshot({
    path: info.outputPath("stardraw-learn-desktop.png"),
    fullPage: true,
  });
});

test("보안 배우기: 랑데부 해싱은 주소를 더해도 몇 명만 이사한다", async ({
  page,
}, info) => {
  test.skip(
    info.project.name !== "phone-portrait",
    "휴대폰 세로 한 크기로 본다",
  );
  await page.goto("/stardraw/learn#rendezvous");
  const compare = page.locator("[data-toy='rendezvous']");
  await compare.getByRole("button", { name: "주소 하나 더하기" }).click();
  // 고정 견본 48명: 나머지 방식은 대부분, 랑데부 해싱은 새 주소가 이긴 사람만 이사한다
  await expect(verdict(page, "rendezvous-moves")).toHaveAttribute(
    "data-ok",
    "pass",
  );
  const moved = async (key: string) =>
    Number(
      (
        await compare.locator(`[data-moved-count='${key}']`).textContent()
      )?.match(/이사 (\d+)/)?.[1],
    );
  expect(await moved("mod")).toBeGreaterThan(24);
  expect(await moved("hrw")).toBeLessThan(16);
  expect(await compare.locator("[data-grid='hrw'] [data-moved]").count()).toBe(
    await moved("hrw"),
  );

  // 점수표: 새 주소 막대가 생기고, 1등을 넘었는지로 이사가 정해진다
  const score = page.locator("[data-toy='rendezvous-score']");
  await expect(score.locator("[data-score-row='venus']")).toBeVisible();
  await expect(verdict(page, "rendezvous-score")).toContainText("새 주소 금성");
  await expect(score.locator("[data-top]")).toHaveCount(1);
  await page.screenshot({
    path: info.outputPath("rendezvous-compare-phone.png"),
  });
  await compare.screenshot({
    path: info.outputPath("rendezvous-compare.png"),
  });
  await score.screenshot({ path: info.outputPath("rendezvous-score.png") });

  // 이름만 고치면 아무도 안 움직이고, id를 바꾸면 그 주소 주민이 흩어진다
  const edit = page.locator("[data-toy='rendezvous-edit']");
  await edit.getByRole("button", { name: "이름만 고치기" }).click();
  await expect(verdict(page, "rendezvous-edit")).toHaveAttribute(
    "data-ok",
    "pass",
  );
  await expect(edit.locator("[data-moved]")).toHaveCount(0);
  await edit.getByRole("button", { name: "id 바꾸기" }).click();
  await expect(verdict(page, "rendezvous-edit")).toHaveAttribute(
    "data-ok",
    "fail",
  );
  // 가중치 2배: 고정 견본 600명으로도 세어 보인다
  await edit.getByRole("button", { name: "가중치 2배" }).click();
  await expect(verdict(page, "rendezvous-edit")).toContainText("견본 600명");
  await edit.getByRole("button", { name: "화성 빼기" }).click();
  await expect(verdict(page, "rendezvous-edit")).toHaveAttribute(
    "data-ok",
    "pass",
  );
  await edit.screenshot({ path: info.outputPath("rendezvous-edit.png") });

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
});
