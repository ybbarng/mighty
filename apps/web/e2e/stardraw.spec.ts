import sky from "../src/stardraw/sky-data.json" with { type: "json" };
import { expect, type Page, test } from "./test";

/**
 * 패스키는 Chrome 가상 인증기(CDP WebAuthn)로: 누르면 곧바로 지문이 확인된 것처럼 서명한다.
 * `verified: false`면 지문 확인이 안 되는 인증기라, 확인을 요구하는 만들기가 거절된다(취소와 같은 길)
 */
async function virtualAuthenticator(page: Page, verified = true) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("WebAuthn.enable");
  await cdp.send("WebAuthn.addVirtualAuthenticator", {
    options: {
      protocol: "ctap2",
      transport: "internal",
      hasResidentKey: true,
      hasUserVerification: true,
      isUserVerified: verified,
      automaticPresenceSimulation: true,
    },
  });
}

/**
 * 추첨 화면에서 결과까지 간다. 연출이 있으면 「결과 바로 보기」로 건너뛰고,
 * 움직임 줄이기(화면 시험 기본)면 연출 없이 결과가 바로 나온다
 */
async function showDrawResult(page: Page) {
  const skip = page.getByRole("button", { name: "결과 바로 보기" });
  const result = page.locator("[data-draw-result]");
  await expect(async () => {
    if (await result.isVisible()) return;
    // 누르려는 사이에 연출이 끝나 단추가 숨으면(결과가 나온다) 누르기가 실패해도 된다
    await skip.click({ timeout: 1_000 }).catch(() => {});
    await expect(result).toBeVisible({ timeout: 1_000 });
  }).toPass({ intervals: [50], timeout: 30_000 });
}

/** 응모 단추(패스키로 서명, 확인 한 번) */
const ENTER = "이 별 6개로 응모하기";

/** 응모 화면까지 간다. 패스키가 없으면 먼저 "패스키 만들기" 단계가 나온다 */
async function toEntry(page: Page) {
  await page.goto("/stardraw");
  await page.getByRole("button", { name: "별 6개 고르러 가기" }).click();
}

/**
 * 실제 패스키 호출(navigator.credentials의 만들기·단언)을 센다. 가상 인증기 위에서 원래 동작은 그대로 하고
 * 횟수만 남긴다(첫 방문: 만들기 1·단언 1, 두 번째 응모: 단언 1)
 */
async function countPasskeyCalls(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as {
      __passkey: { create: number; get: number };
    };
    w.__passkey = { create: 0, get: 0 };
    const c = navigator.credentials;
    const create = c.create.bind(c);
    const get = c.get.bind(c);
    Object.defineProperty(c, "create", {
      configurable: true,
      value: (o?: CredentialCreationOptions) => {
        w.__passkey.create++;
        return create(o);
      },
    });
    Object.defineProperty(c, "get", {
      configurable: true,
      value: (o?: CredentialRequestOptions) => {
        w.__passkey.get++;
        return get(o);
      },
    });
  });
}

const passkeyCalls = (page: Page) =>
  page.evaluate(
    () =>
      (window as unknown as { __passkey: { create: number; get: number } })
        .__passkey,
  );

/** 데모 흉내 시트가 지금까지 뜬 횟수 */
const demoUnlocks = (page: Page) =>
  page.evaluate(() =>
    Number(document.documentElement.dataset.demoUnlocks ?? 0),
  );

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

/** 데모: 실제 패스키 창 대신 뜨는 흉내 시트에서 확인(또는 취소)한다 */
async function demoUnlock(page: Page, purpose: "create" | "sign", ok = true) {
  const sheet = page.locator(`[data-demo-unlock='${purpose}']`);
  await expect(sheet).toBeVisible({ timeout: 30_000 });
  await sheet.getByRole("button", { name: ok ? "확인" : "취소" }).click();
  await expect(sheet).toHaveCount(0);
}

/** 데모가 실제 패스키(navigator.credentials)를 부르면 표시를 남긴다 */
async function watchCredentials(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as { __credentialCalls: number };
    w.__credentialCalls = 0;
    for (const name of ["create", "get"] as const) {
      Object.defineProperty(navigator.credentials, name, {
        configurable: true,
        value: () => {
          w.__credentialCalls++;
          return Promise.reject(new DOMException("시험", "NotAllowedError"));
        },
      });
    }
  });
}

test("게임 목록에서 들어가 응모하고, 추첨을 보고, 내 응모에 남는다", async ({
  page,
}, info) => {
  // 데스크톱은 연출을 켜 추첨 연출과 「결과 바로 보기」를 지난다. 나머지는 결과가 바로 나오는 길
  const motion = info.project.name === "desktop";
  if (motion) await page.emulateMedia({ reducedMotion: "no-preference" });
  await virtualAuthenticator(page);
  await countPasskeyCalls(page);
  // 공유 시트 대신 보낸 내용을 남긴다
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "share", {
      configurable: true,
      value: async (data: ShareData) => {
        (window as unknown as { __shared: ShareData }).__shared = data;
      },
    });
  });
  await page.goto("/");
  await page.getByRole("link", { name: /하늘의 별 따기/ }).click();
  await expect(page).toHaveURL(/\/stardraw$/);
  await expect(
    page.getByText("로또 1등과 하늘의 별 따기, 어느 게 더 쉬울까요?"),
  ).toBeVisible();
  await noSideScroll(page);
  // 매시 정각 추첨 · 55분 마감, 마감까지와 추첨까지를 따로 센다
  await expect(page.locator("[data-schedule-line]")).toHaveText(
    "매시 정각 추첨 · 55분 마감",
  );
  await expect(page.locator("[data-countdown='close']")).toBeVisible();
  await expect(page.locator("[data-countdown='draw']")).toBeVisible();
  await page.screenshot({ path: info.outputPath("home-countdowns.png") });

  await page.getByRole("button", { name: "별 6개 고르러 가기" }).click();
  // 처음엔 별을 고르기 전에 패스키부터 만든다(등록만, 인증기 한 번)
  const setup = page.locator("[data-key-setup]");
  await expect(setup).toContainText("응모하려면 패스키가 필요해요");
  await expect(
    setup.getByRole("link", { name: "패스키가 뭐예요?" }),
  ).toHaveAttribute("href", "/stardraw/about#passkey");
  await page.screenshot({ path: info.outputPath("stardraw-key-setup.png") });
  await setup.getByRole("button", { name: "패스키 만들기" }).click();
  await expect(setup).toHaveCount(0);
  expect(await passkeyCalls(page)).toEqual({ create: 1, get: 0 });
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
  // 응모하기는 서명만(인증기 한 번)
  await page.getByRole("button", { name: ENTER }).click();
  const receipt = page.locator("[data-receipt]");
  await expect(receipt).toBeVisible({ timeout: 30_000 });
  expect(await passkeyCalls(page)).toEqual({ create: 1, get: 1 });
  await expect(receipt).toContainText("베텔게우스");
  await expect(receipt).toContainText("시리우스");
  await expect(receipt.locator("[data-passkey-mark]")).toBeVisible();
  await page.screenshot({
    path: info.outputPath("stardraw-receipt.png"),
    fullPage: true,
  });

  // 응모권 공유: 보낸 링크를 열면 같은 응모권이 읽기 전용으로 보인다
  const id = (await receipt.getAttribute("data-receipt")) as string;
  await page.getByRole("button", { name: "응모권 공유" }).click();
  const shared = () =>
    page.evaluate(
      () => (window as unknown as { __shared?: ShareData }).__shared ?? null,
    );
  await expect.poll(shared).not.toBeNull();
  const { text, url } = (await shared()) as { text: string; url: string };
  expect(text).toMatch(
    /^하늘의 별 따기 1회에 응모했어요\. 추첨은 오[전후] \d+시( \d+분)?!$/,
  );
  expect(url).toMatch(new RegExp(`/stardraw/ticket#1-${id}$`));
  await page.goto(url);
  await expect(page.locator(`[data-receipt="${id}"]`)).toBeVisible();
  await expect(page.getByRole("status")).toContainText("추첨까지");
  await expect(page.getByRole("link", { name: "나도 응모하기" })).toBeVisible();
  await noSideScroll(page);
  await page.screenshot({
    path: info.outputPath("stardraw-ticket.png"),
    fullPage: true,
  });
  await page.goBack();
  await expect(receipt).toBeVisible();

  await page.getByRole("button", { name: "← 처음으로" }).click();
  await expect(page.getByText("이번 회차에 응모했습니다")).toBeVisible();
  await page.getByRole("button", { name: /다음 추첨까지 건너뛰기/ }).click();
  const envelope = page.locator("[data-envelope]").first();
  await expect(envelope).toBeVisible({ timeout: 60_000 });
  await envelope.click();
  if (motion)
    await expect(
      page.getByRole("button", { name: "결과 바로 보기" }),
    ).toBeVisible();
  await showDrawResult(page);
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
  // 게임 화면은 단순하게: 열쇠 칩·"서버가 가진 것" 비교는 설명 페이지에만
  await expect(page.getByText("서버(공개 장부)가 가진 것")).toHaveCount(0);
  await page.screenshot({
    path: info.outputPath("stardraw-mine.png"),
    fullPage: true,
  });
  // 새로고침해도 내 응모 화면에 머물고 응모권이 남는다
  await expect(page).toHaveURL(/\/stardraw\/mine$/);
  await page.reload();
  await expect(page.getByRole("button", { name: /제 1회/ })).toBeVisible();

  // 추첨 뒤 공유 링크는 장부에서 찾아 결과까지 보여 준다
  await page.goto(url);
  const shown = page.locator(`[data-receipt="${id}"]`);
  await expect(shown).toBeVisible();
  await expect(shown).toContainText(/당첨|낙첨|당첨되지 않았습니다/);
  await expect(page.getByText("추첨까지")).toHaveCount(0);
  await page.goto(`/stardraw/ticket#1-${"0".repeat(64)}`);
  await expect(page.getByText("이 응모권을 찾을 수 없어요")).toBeVisible();
});

test("패스키 만들기를 취소하면 만들어지지 않았다고 알리고 설명으로 이어 준다", async ({
  page,
}) => {
  await virtualAuthenticator(page, false);
  await toEntry(page);
  const setup = page.locator("[data-key-setup]");
  await setup.getByRole("button", { name: "패스키 만들기" }).click();
  // Next.js 경로 안내용 빈 alert가 따로 있어 문구로 고른다
  const alert = setup.getByRole("alert").filter({ hasText: "취소" });
  await expect(alert).toBeVisible({ timeout: 30_000 });
  await expect(
    alert.getByRole("link", { name: "패스키가 뭐예요?" }),
  ).toHaveAttribute("href", "/stardraw/about#passkey");
  // 별 고르기로 넘어가지 않는다
  await expect(setup).toBeVisible();
  await expect(page.getByRole("button", { name: ENTER })).toHaveCount(0);
  await noSideScroll(page);
});

test("패스키를 못 쓰는 브라우저와 앱 안 브라우저는 응모 대신 안내한다", async ({
  browser,
  page,
}) => {
  // WebAuthn이 없는 브라우저
  await page.addInitScript(() => {
    // @ts-expect-error 시험: 패스키가 없는 브라우저 흉내
    delete window.PublicKeyCredential;
  });
  await toEntry(page);
  await expect(page.getByRole("note")).toContainText(
    "이 브라우저는 패스키를 지원하지 않아요",
  );
  await expect(page.getByRole("button", { name: "패스키 만들기" })).toHaveCount(
    0,
  );

  // 카카오톡 안 브라우저
  const kakao = await browser.newContext({
    userAgent:
      "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 KAKAOTALK 10.8.5",
  });
  const inApp = await kakao.newPage();
  await toEntry(inApp);
  await expect(inApp.getByRole("note")).toContainText(
    "카카오톡 안에서는 패스키를 쓸 수 없어요",
  );
  await expect(inApp.getByRole("button", { name: "주소 복사" })).toBeVisible();
  await kakao.close();
});

test("화면마다 주소가 있어 뒤로가기는 바로 전 화면, 새로고침은 그 화면에 머문다", async ({
  page,
}, info) => {
  test.skip(isPhone(info.project.name), "주소·기록은 한 크기로");
  await page.goto("/stardraw");
  await page.getByRole("button", { name: /지난 회차/ }).click();
  await expect(page).toHaveURL(/\/stardraw\/rounds$/);
  await expect(page.getByRole("region", { name: "지난 회차" })).toBeVisible();
  // 새로고침해도 지난 회차
  await page.reload();
  await expect(page.getByRole("region", { name: "지난 회차" })).toBeVisible();
  // 뒤로가기는 게임 목록이 아니라 별 따기 첫 화면
  await page.goBack();
  await expect(page).toHaveURL(/\/stardraw$/);
  await expect(
    page.getByRole("button", { name: "별 6개 고르러 가기" }),
  ).toBeVisible();
  // 내 응모도 같다. 화면 안 「돌아가기」도 바로 전 화면으로
  await page.getByRole("button", { name: /내 응모/ }).click();
  await expect(page).toHaveURL(/\/stardraw\/mine$/);
  await page.goBack();
  await expect(page).toHaveURL(/\/stardraw$/);
  // 주소로 바로 연 화면의 「처음으로」는 사이트 밖이 아니라 첫 화면으로
  await page.goto("/stardraw/rounds");
  await page.getByRole("button", { name: /처음으로/ }).click();
  await expect(page).toHaveURL(/\/stardraw$/);
  // 당겨서 새로고침은 응모(하늘에서 별 고르기)와 추첨 화면에서만 막는다
  const noPull = page.locator("html[data-no-pull]");
  await expect(noPull).toHaveCount(0);
  await page.getByRole("button", { name: "별 6개 고르러 가기" }).click();
  await expect(page).toHaveURL(/\/stardraw\/enter$/);
  await expect(noPull).toHaveCount(1);
  await page.goBack();
  await expect(noPull).toHaveCount(0);
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
  // 패스키와 보안: 문답과 "서버가 가진 것 / 내 기기에만 있는 것"은 여기에
  await expect(
    page.getByRole("heading", { name: "패스키와 보안" }),
  ).toBeVisible();
  await expect(page.locator("#passkey")).toBeVisible();
  await expect(page.getByText("서버(공개 장부)가 가진 것")).toBeVisible();
  await expect(page.getByText("얼굴·지문이 서버로 가나요?")).toBeVisible();
  await expect(page.getByText(/솔직한 한계/)).toBeVisible();
  await noSideScroll(page);
});

test("데모: 1등으로 응모해 당첨자 확인 초록불까지(틀린 별, 가짜 당첨자 포함)", async ({
  page,
}, info) => {
  // 데모는 실제 패스키를 만들지 않는다: 가상 인증기 없이 흉내 시트로만 끝까지 간다
  await watchCredentials(page);
  await page.goto("/stardraw/demo");
  await expect(page.getByRole("note")).toContainText("데모 · 실제 게임과 따로");

  // 처음엔 별을 고르기 전에 패스키부터 만든다(흉내 시트 한 번). 먼저 취소해 본다
  const setup = page.locator("[data-key-setup]");
  await setup.getByRole("button", { name: "패스키 만들기" }).click();
  await expect(page.locator("[data-demo-unlock='create']")).toBeVisible();
  await page.screenshot({
    path: info.outputPath("stardraw-demo-sheet.png"),
  });
  await demoUnlock(page, "create", false);
  await expect(
    setup.getByRole("alert").filter({ hasText: "패스키를 만들지 않았어요" }),
  ).toBeVisible();
  await setup.getByRole("button", { name: "패스키 만들기" }).click();
  await demoUnlock(page, "create");
  await expect(setup).toHaveCount(0);
  const afterCreate = await demoUnlocks(page);

  // 응모: 이번 회차 1등이 되게 채우고 낸다. 서명 시트 한 번
  await page.getByRole("button", { name: "1등 되게" }).click();
  await expect(page.getByText("6/6")).toBeVisible();
  await page.getByRole("button", { name: ENTER }).click();
  await demoUnlock(page, "sign");
  await expect(page.locator("[data-receipt]")).toBeVisible({ timeout: 30_000 });
  expect((await demoUnlocks(page)) - afterCreate).toBe(1);

  // 추첨
  await page.getByRole("button", { name: "지금 추첨" }).click();
  await expect(page.locator("[data-demo-result]")).toHaveText("1등 당첨", {
    timeout: 60_000,
  });
  await page.getByRole("button", { name: "추첨 보기" }).click();
  await showDrawResult(page);
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
  await demoUnlock(page, "sign");
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
  await page.screenshot({
    path: info.outputPath("stardraw-demo-checker.png"),
    fullPage: true,
  });
  await toWinner();
  await expect(
    winner.getByText("확인하는 분의 화면에 초록불이 켜졌습니다"),
  ).toBeVisible();
  await noSideScroll(page);
  // 끝까지 실제 패스키를 한 번도 부르지 않았다
  expect(
    await page.evaluate(
      () =>
        (window as unknown as { __credentialCalls: number }).__credentialCalls,
    ),
  ).toBe(0);
});

test("데모: 이미 해 본 기기에서 「1등 되게」를 누른 뒤 회차가 넘어가도 1등이 된다", async ({
  page,
}, info) => {
  test.skip(isPhone(info.project.name), "저장된 상태와 회차 흐름은 한 크기로");
  await page.goto("/stardraw/demo");
  // 이미 해 본 기기: 한 회차 응모·추첨을 거쳐 열쇠와 장부가 저장된 상태(「데모 처음부터」를 누르지 않는다)
  await page.getByRole("button", { name: "패스키 만들기" }).click();
  await demoUnlock(page, "create");
  await page.getByRole("button", { name: "자동", exact: true }).click();
  await page.getByRole("button", { name: ENTER }).click();
  await demoUnlock(page, "sign");
  await expect(page.locator("[data-receipt]")).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: "지금 추첨" }).click();
  await expect(page.locator("[data-demo-result]")).toBeVisible({
    timeout: 60_000,
  });
  await page.reload();

  // 「1등 되게」로 채운 뒤, 응모보다 먼저 「지금 마감」·「지금 추첨」을 눌러 회차를 넘긴다
  await page.getByRole("button", { name: "1등 되게" }).click();
  await expect(page.getByText("6/6")).toBeVisible();
  const before = await page
    .locator("[data-demo-round]")
    .getAttribute("data-demo-round");
  await page.getByRole("button", { name: "지금 마감" }).click();
  await page.getByRole("button", { name: "지금 추첨" }).click();
  await expect(page.locator("[data-demo-round]")).not.toHaveAttribute(
    "data-demo-round",
    before ?? "",
  );
  // 회차가 바뀌면 고른 등수(1등)로 새 회차 번호를 다시 채운다
  await expect(page.getByText("6/6")).toBeVisible();
  // 두 번째 응모: 패스키 만들기 없이 서명 시트 한 번
  const beforeEntry = await demoUnlocks(page);
  await page.getByRole("button", { name: ENTER }).click();
  await demoUnlock(page, "sign");
  await expect(page.locator("[data-receipt]")).toBeVisible({ timeout: 30_000 });
  expect((await demoUnlocks(page)) - beforeEntry).toBe(1);
  await page.getByRole("button", { name: "지금 추첨" }).click();
  await expect(page.locator("[data-demo-result]")).toHaveText("1등 당첨", {
    timeout: 60_000,
  });
});
