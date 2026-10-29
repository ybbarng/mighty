import { expect, type Page, test } from "@playwright/test";

import sky from "../src/stardraw/sky-data.json" with { type: "json" };

/** 패스키는 Chrome 가상 인증기(CDP WebAuthn)로: 누르면 곧바로 지문이 확인된 것처럼 서명한다 */
async function virtualAuthenticator(page: Page) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("WebAuthn.enable");
  await cdp.send("WebAuthn.addVirtualAuthenticator", {
    options: {
      protocol: "ctap2",
      transport: "internal",
      hasResidentKey: true,
      hasUserVerification: true,
      isUserVerified: true,
      automaticPresenceSimulation: true,
    },
  });
}

async function noSideScroll(page: Page) {
  const overflow = await page.evaluate(
    () =>
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);
}

/** 네모 하늘(캔버스)에서 n번 별을 누른다. 별 자리는 데이터 파일과 같다 */
async function tapStar(page: Page, canvas: string, n: number) {
  const star = sky.stars[n - 1];
  if (!star) throw new Error(`없는 별 ${n}`);
  // 하늘이 화면보다 길 수 있어(휴대폰 가로) 화면 밖 별도 누를 수 있게 캔버스에 click을 바로 보낸다
  await page.locator(canvas).evaluate((el, at) => {
    const rect = el.getBoundingClientRect();
    el.dispatchEvent(
      new MouseEvent("click", {
        bubbles: true,
        clientX: rect.left + at.x * rect.width,
        clientY: rect.top + at.y * rect.width,
      }),
    );
  }, star);
}

const isPhone = (name: string) => name.startsWith("phone");

test("게임 목록에서 들어가 응모하고, 추첨을 보고, 내 응모에 남는다", async ({
  page,
}, info) => {
  await virtualAuthenticator(page);
  await page.goto("/");
  await page.getByRole("link", { name: /하늘의 별 따기/ }).click();
  await expect(page).toHaveURL(/\/stardraw$/);
  await expect(
    page.getByText("로또 1등과 하늘의 별 따기, 어느 게 더 쉬울까요?"),
  ).toBeVisible();
  await noSideScroll(page);

  await page.getByRole("button", { name: "별 6개 고르러 가기" }).click();
  // 칸에서 하나, 하늘에서 하나 고르고 나머지는 자동
  await page.getByRole("button", { name: "7 베텔게우스" }).click();
  await expect(page.locator("[data-star-info='7']")).toContainText(
    "오리온자리",
  );
  await tapStar(page, "canvas[data-sky='pick']", 1);
  await expect(
    page.getByRole("button", { name: "1 시리우스" }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "남은 칸 자동" }).click();
  await noSideScroll(page);
  await page.screenshot({
    path: info.outputPath("stardraw-enter.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: "이 별 6개로 응모하기" }).click();
  await page.getByRole("button", { name: /패스키로 만들기/ }).click();
  const receipt = page.locator("[data-receipt]");
  await expect(receipt).toBeVisible({ timeout: 30_000 });
  await expect(receipt).toContainText("베텔게우스");
  await expect(receipt).toContainText("시리우스");
  await page.screenshot({
    path: info.outputPath("stardraw-receipt.png"),
    fullPage: true,
  });

  await page.getByRole("button", { name: "← 처음으로" }).click();
  await expect(page.getByText("이번 회차에 응모했습니다")).toBeVisible();
  await page.getByRole("button", { name: /다음 추첨까지 건너뛰기/ }).click();
  const envelope = page.locator("[data-envelope]").first();
  await expect(envelope).toBeVisible({ timeout: 60_000 });
  await envelope.click();
  await page.getByRole("button", { name: "결과 바로 보기" }).click();
  await expect(page.locator("[data-draw-result]")).toBeVisible();
  await expect(page.getByRole("status").first()).toHaveAttribute(
    "aria-label",
    /당첨 번호 .+보너스/,
  );
  await page.screenshot({
    path: info.outputPath("stardraw-draw.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: "← 돌아가기" }).click();
  await page.getByRole("button", { name: /내 응모/ }).click();
  await expect(page.getByRole("button", { name: /제 1회/ })).toBeVisible();
  // 다시 열어도 응모권이 남는다
  await page.reload();
  await page.getByRole("button", { name: /내 응모/ }).click();
  await expect(page.getByRole("button", { name: /제 1회/ })).toBeVisible();
});

test("설명 페이지: 별 45개와 데이터 출처", async ({ page }) => {
  await page.goto("/stardraw/about");
  await expect(page.getByRole("heading", { name: "별 45개" })).toBeVisible();
  await expect(page.getByText("데네볼라")).toBeVisible();
  await expect(page.getByText(/Bright Star Catalogue/)).toBeVisible();
  await expect(
    page.getByText("판정은 늘 확인하는 사람의 기기에서 합니다", {
      exact: false,
    }),
  ).toBeVisible();
  await noSideScroll(page);
});

test("데모: 1등으로 응모해 당첨자 확인 초록불까지(틀린 별, 가짜 당첨자 포함)", async ({
  page,
}, info) => {
  await virtualAuthenticator(page);
  await page.goto("/stardraw/demo");
  await expect(page.getByRole("note")).toContainText("데모입니다");

  // 응모: 이번 회차 1등이 되게 채우고 낸다
  await page.getByRole("button", { name: "1등 되게" }).click();
  await expect(page.getByText("6/6")).toBeVisible();
  await page.getByRole("button", { name: "이 별 6개로 응모하기" }).click();
  await page.getByRole("button", { name: /패스키로 만들기/ }).click();
  await expect(page.locator("[data-receipt]")).toBeVisible({ timeout: 30_000 });

  // 추첨
  await page.getByRole("button", { name: "지금 추첨" }).click();
  await expect(page.locator("[data-demo-result]")).toHaveText("1등 당첨", {
    timeout: 60_000,
  });
  await page.getByRole("button", { name: "추첨 보기" }).click();
  await page.getByRole("button", { name: "결과 바로 보기" }).click();
  await expect(page.locator("[data-draw-result='1']")).toBeVisible();
  await page
    .getByRole("region", { name: /회 추첨/ })
    .getByRole("button", { name: "← 돌아가기" })
    .click();
  await noSideScroll(page);

  const phone = isPhone(info.project.name);
  const toChecker = async () => {
    if (phone)
      await page.getByRole("tab", { name: "확인하는 사람 화면" }).click();
  };
  const toWinner = async () => {
    if (phone) await page.getByRole("tab", { name: "당첨자 폰" }).click();
  };
  const checker = page.locator("[data-pane='checker']");
  const winner = page.locator("[data-pane='winner']");

  // 1) 가짜 당첨자: 서명이 맞지 않아 빨간불
  await toChecker();
  await checker.getByLabel("확인하는 사람 이름").fill("Brice");
  await checker
    .getByRole("button", { name: "당첨자 확인 요청 보내기" })
    .click();
  await expect(
    checker.getByText("당첨자의 응답을 기다리고 있습니다"),
  ).toBeVisible();
  await toWinner();
  await expect(
    winner.getByText(/Brice님이 1회 1등 당첨자 확인을 요청했습니다/),
  ).toBeVisible();
  await winner.getByRole("button", { name: "가짜 당첨자로 답하기" }).click();
  await toChecker();
  await expect(checker.locator("[data-status='failed']")).toContainText(
    "본인 확인에 실패했습니다",
  );
  await expect(checker).toContainText("그 응모권을 낸 열쇠의 서명이 아닙니다");

  // 2) 새로 요청하면 진짜 당첨자가 서명하고 별 세 개를 받는다
  await checker.getByRole("button", { name: "새로 요청하기" }).click();
  await expect(checker.getByLabel("확인하는 사람 이름")).toHaveValue("Brice");
  await checker
    .getByRole("button", { name: "당첨자 확인 요청 보내기" })
    .click();
  await toWinner();
  await winner.getByRole("button", { name: "확인", exact: true }).click();
  const sas = winner.locator("[data-sas]");
  await expect(sas).toBeVisible({ timeout: 30_000 });
  const stars = ((await sas.getAttribute("data-sas")) ?? "")
    .split(",")
    .map(Number);
  expect(stars).toHaveLength(3);
  await expect(winner).toContainText(
    "당첨을 알렸던 그 메신저·메일로 이 세 별 이름을 차례대로 보내 주세요",
  );
  await page.screenshot({
    path: info.outputPath("stardraw-demo-winner.png"),
    fullPage: true,
  });

  // 3) 확인하는 사람: 일부러 차례를 바꿔 한 번 틀리고, 맞게 누른다
  await toChecker();
  await expect(
    checker.getByText("상대가 보낸 별 세 개를 하늘에서 차례로 눌러 주세요"),
  ).toBeVisible();
  const sky = "[data-pane='checker'] canvas[data-sky='pick']";
  for (const n of [...stars].reverse()) await tapStar(page, sky, n);
  await expect(checker.locator("[data-verdict='fail']")).toContainText(
    "별 세 개가 맞지 않습니다. 2번 더 할 수 있습니다",
  );
  // 틀린 별은 잠시 뒤 지워진다
  await expect(checker.getByText("①").first()).toBeVisible();
  await expect
    .poll(async () =>
      checker.locator("ol li").filter({ hasText: /①|②|③/ }).allTextContents(),
    )
    .toEqual(["①", "②", "③"]);
  for (const n of stars) await tapStar(page, sky, n);
  await expect(checker.locator("[data-verdict='ok']")).toHaveText(
    "1회 1등 당첨자 본인이 맞습니다",
  );
  await checker.getByLabel("누구로 기억할까요?").fill("철수 · 카톡");
  await checker.getByLabel("상품 드림").check();
  await checker.getByRole("button", { name: "적어 두기" }).click();
  await expect(
    checker.getByRole("button", { name: "이 기기에 적어 두었습니다" }),
  ).toBeVisible();
  await page.screenshot({
    path: info.outputPath("stardraw-demo-checker.png"),
    fullPage: true,
  });
  await toWinner();
  await expect(
    winner.getByText("확인하는 분의 화면에 초록불이 켜졌습니다"),
  ).toBeVisible();
  await noSideScroll(page);
});
