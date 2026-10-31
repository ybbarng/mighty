import sky from "../src/stardraw/sky-data.json" with { type: "json" };
import { expect, fixStardrawClock, type Page, test } from "./test";

test.beforeEach(({ page }) => fixStardrawClock(page));

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
 * 추첨 화면에서 결과까지 간다. 움직임 줄이기(화면 시험 기본)면 연출 없이 결과가 바로 나온다.
 * 연출을 켠 시험은 이 함수가 시계(fixStardrawClock으로 설치됨)를 연출 길이만큼 앞당긴다
 * (처음 보는 추첨은 건너뛸 수 없다)
 */
async function showDrawResult(page: Page, fastForward = false) {
  if (fastForward) await page.clock.runFor(60_000);
  await expect(page.locator("[data-draw-result]")).toBeVisible({
    timeout: 30_000,
  });
}

/** 응모 단추(패스키로 서명, 확인 한 번) */
const ENTER = { name: "응모하기", exact: true } as const;
/** 우주인 등록 단추(패스키 만들기) */
const REGISTER = { name: "우주인 등록", exact: true } as const;
/** 등록증에서 누를 자리(제목 부분. 가운데는 주소 단추라 피한다) */
const CARD_TAP = { x: 40, y: 30 } as const;
/** 첫 화면에서 별 고르기로 */
const TO_PICK = "별 6개 고르기";
/** 등록증을 받은 뒤 별 고르기로 */
const TO_PICK_ISSUED = "별을 고르러 가 볼까요?";

/** 응모 화면까지 간다. 등록증(패스키)이 없으면 먼저 "우주인 등록" 단계가 나온다 */
async function toEntry(page: Page) {
  // 처음 온 사람은 첫 화면이 입구(우주인 등록·신분증 제시)다
  await page.goto("/stardraw");
}

/**
 * 실제 패스키 호출(navigator.credentials의 만들기·단언)을 센다. 가상 인증기 위에서 원래 동작은 그대로 하고
 * 횟수만 남긴다(우주인 등록: 만들기 1·등록 증명 단언 1, 응모: 단언 1)
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
async function demoUnlock(
  page: Page,
  purpose: "create" | "sign" | "check",
  ok = true,
) {
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
  // 데스크톱은 연출을 켜 추첨 연출을 끝까지 지난다(시계를 앞당긴다). 나머지는 결과가 바로 나오는 길
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
  // 처음 온 사람: 첫 화면이 입구다. 우주국 인사, 정답 예시, 지금 회차 한 줄, 우주인 등록·신분증 제시
  await expect(page.locator("[data-greeting]")).toHaveCount(0);
  await expect(page.locator("[data-gate]")).toContainText(
    "하늘의 별 따기는 등록한 우주인만 참여할 수 있습니다.",
  );
  await expect(page.locator("[data-gate-round]")).toContainText(
    /응모를 (받고 있어요|마감했어요)/,
  );
  await expect(page.getByRole("button", { name: TO_PICK })).toHaveCount(0);
  await page.screenshot({ path: info.outputPath("home-first.png") });

  // 별을 고르기 전에 우주인 등록(= 패스키 만들기, 인증기 한 번)
  const setup = page.locator("[data-key-setup]");
  await expect(
    setup.getByRole("button", { name: "신분증 제시" }),
  ).toBeVisible();
  await expect(setup.locator("[data-passkey-line]")).toContainText(
    "이 기기의 패스키로 만들어집니다",
  );
  await expect(setup.getByRole("link", { name: "자세히" })).toHaveAttribute(
    "href",
    "/stardraw/about#passkey",
  );
  await noSideScroll(page);
  await page.screenshot({ path: info.outputPath("stardraw-key-setup.png") });
  await setup.getByRole("button", REGISTER).click();
  // 연출이 있으면 신청서가 올라와 기다린다: 내면(키보드 Enter도 같다) 그 누름에 패스키 만들기
  if (motion)
    await page
      .locator("[aria-label='신청서 제출'][aria-disabled='false']")
      .press("Enter", { timeout: 30_000 });
  // 발급한 등록증이 뜬다(연출이 있으면 입구 위 화면 전체 오버레이로)
  await expect(page.locator("[data-issued='new']")).toBeVisible();
  // 만들자마자 그 패스키로 등록 증명에 서명해 장부에 바로 등록한다
  expect(await passkeyCalls(page)).toEqual({ create: 1, get: 1 });
  // 등록 직후 등록증을 발급해 보여 준다. 아직 응모 전이라 등록일은 비어 있다
  await expect(page.locator("[data-issued='new']")).toContainText(
    /^.+에 거주하는 .+ 님,우주인으로 등록되었습니다\. 환영합니다!$/,
  );
  const card = page.locator("[data-idcard]");
  await expect(card).toBeVisible();
  const number = (await card.getAttribute("data-idcard")) as string;
  expect(number).toMatch(/^SD-[0-9A-Z]{4}-[0-9A-Z]{4}$/);
  // 발급일은 실제 신분증처럼 날짜 하나(장부 등록 회차의 날짜)
  await expect(card.locator("[data-issue-date]")).toHaveText(
    /^\d{4}\. \d{1,2}\. \d{1,2}\.$/,
  );
  // 앞면에는 공개 열쇠가 없다(뒷면에 가려 둔다)
  await expect(page.locator("[data-public-key]")).toHaveCount(0);
  await expect(card).not.toContainText(/04[0-9a-f]{20}/);
  // 주소는 줄여 보이고, 누르면 전체(우리 우주부터)
  await card.getByRole("button", { name: /^주소:/ }).click();
  await expect(page.locator("[data-full-address]")).toContainText(
    /^우리 우주 › 라니아케아 초은하단 › 처녀자리 초은하단 › /,
  );
  // 주소 안내: 그 천체 설명이 위에, 바깥 단계는 접혀 있다가 누르면 펼친다
  const guide = page.locator("[data-address-guide]");
  await expect(guide.locator("[data-address-home] p")).not.toBeEmpty();
  const universe = guide.locator("details").filter({ hasText: "우리 우주" });
  await expect(universe.getByText(/138억 년/)).toBeHidden();
  await universe.locator("summary").click();
  await expect(universe.getByText(/138억 년/)).toBeVisible();
  // 패스키 마크를 누르면 짧은 설명
  await card.locator("[data-passkey-badge]").click();
  await expect(
    page.getByText("이 등록증은 이 기기의 패스키로 지켜집니다"),
  ).toBeVisible();
  await noSideScroll(page);
  await page.screenshot({
    path: info.outputPath("stardraw-id-issued.png"),
    fullPage: true,
  });
  expect(await passkeyCalls(page)).toEqual({ create: 1, get: 1 });
  await page.getByRole("button", { name: TO_PICK_ISSUED }).click();
  // 하늘에서 별을 누르면 그 별 설명, 아래 고른 별 6칸이 채워진다(번호 용지는 응모할 때만 나온다)
  await expect(page.getByRole("group", { name: "응모 용지" })).toHaveCount(0);
  await tapStar(page, "canvas[data-sky='pick']", 7);
  await expect(page.locator("[data-star-info='7']")).toContainText(
    "오리온자리",
  );
  await tapStar(page, "canvas[data-sky='pick']", 1);
  // 별을 고르는 화면은 첫 화면 제목 없이 이번 회차 응모권(한 줄 6칸)이 머리 역할
  await expect(
    page.getByRole("heading", { name: "하늘의 별 따기", level: 1 }),
  ).toHaveCount(0);
  const slip = page.getByRole("region", { name: "1회 응모권" });
  await expect(slip).toHaveAttribute("data-entry-slip", "2");
  await expect(slip.locator("[data-slip-star='7']")).toHaveAccessibleName(
    "7 베텔게우스 빼기",
  );
  // 채운 칸을 누르면 그 별이 빠진다
  await slip.getByRole("button", { name: "1 시리우스 빼기" }).click();
  await expect(slip).toHaveAttribute("data-entry-slip", "1");
  await expect(slip.locator("[data-slip-star='1']")).toHaveCount(0);
  await expect(page.getByRole("button", ENTER)).toBeDisabled();
  await tapStar(page, "canvas[data-sky='pick']", 1);
  await page.getByRole("button", { name: "남은 칸 자동" }).click();
  await expect(slip).toHaveAttribute("data-entry-slip", "6");
  await expect(slip.getByText("6/6")).toBeVisible();
  // 6개를 다 고른 뒤 또 누르면 글 없이 응모권 칸이 흔들리고 그대로 6개다
  const chosen = await slip
    .locator("[data-slip-star]")
    .evaluateAll((els) =>
      els.map((e) => Number(e.getAttribute("data-slip-star"))),
    );
  const other = [...Array(45).keys()]
    .map((i) => i + 1)
    .find((n) => !chosen.includes(n)) as number;
  await tapStar(page, "canvas[data-sky='pick']", other);
  await expect(page.locator(".sd-shake[data-entry-slip='6']")).toHaveCount(1);
  await noSideScroll(page);
  await page.screenshot({
    path: info.outputPath("stardraw-enter.png"),
    fullPage: true,
  });
  // 응모하기는 서명만(인증기 한 번). 연출이 있으면 용지를 다 쓴 뒤 「제출」(밀어 올리기 대신 단추), 이어서
  // 「신분증 제출」을 눌러야 패스키를 연다(누름 직후에만 패스키 창을 여는 브라우저가 있다)
  await page.getByRole("button", ENTER).click();
  if (motion) {
    // 용지와 등록증은 은은하게 떠오르기를 되풀이해(멈추지 않아) 키보드로 낸다(Enter도 같은 제출)
    const paper = page.locator(
      "[aria-label='용지 제출'][aria-disabled='false']",
    );
    await paper.press("Enter", { timeout: 30_000 });
    const card = page.locator(
      "[aria-label='신분증 제출'][aria-disabled='false']",
    );
    await card.press("Enter", { timeout: 30_000 });
  }
  const receipt = page.locator("[data-receipt]");
  await expect(receipt).toBeVisible({ timeout: 30_000 });
  expect(await passkeyCalls(page)).toEqual({ create: 1, get: 2 });
  await expect(receipt).toContainText("베텔게우스");
  await expect(receipt).toContainText("시리우스");
  await expect(receipt.locator("[data-passkey-mark]")).toBeVisible();
  await expect(receipt.locator("[data-wish]")).toHaveText(
    "내 별에 소원을 빌어 보세요",
  );
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
  // 등록한 사람: 인사와 작은 등록증, 응모한 회차는 추첨까지 시계와 고른 별·「영수증」
  await expect(page.locator(`[data-greeting="${number}"]`)).toContainText(
    /^.+에 거주하는 .+ 님, 안녕하세요$/,
  );
  await expect(page.locator(`[data-greeting="${number}"]`)).toHaveAttribute(
    "href",
    "/stardraw/id",
  );
  // 인사는 문장 하나(작은 등록증 그림 없이)
  await expect(page.locator(`[data-greeting="${number}"] *`)).toHaveCount(0);
  await expect(page.locator("[data-card='entered']")).toContainText(
    "1회에 응모했어요",
  );
  await expect(page.locator("[data-countdown='draw']")).toBeVisible();
  await expect(page.getByRole("button", { name: "영수증" })).toBeVisible();
  await noSideScroll(page);
  await page.screenshot({
    path: info.outputPath("home-entered.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: /다음 추첨까지 건너뛰기/ }).click();
  const envelope = page.locator("[data-envelope]").first();
  await expect(envelope).toBeVisible({ timeout: 60_000 });
  await page.screenshot({
    path: info.outputPath("home-result.png"),
    fullPage: true,
  });
  await envelope.click();
  if (motion) {
    // 처음 보는 추첨은 건너뛰는 단추 없이 연출이 돈다
    await expect(page.locator("[data-draw-result]")).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "결과 바로 보기" }),
    ).toHaveCount(0);
  }
  await showDrawResult(page, motion);
  await expect(page.getByRole("status").first()).toHaveAttribute(
    "aria-label",
    /당첨 번호 .+보너스/,
  );
  await page.screenshot({
    path: info.outputPath("stardraw-draw.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: "← 돌아가기" }).click();
  // 결과를 본 뒤에는 지난 회차 한 줄에 내 등수와 「다시 보기」
  await expect(page.locator("[data-last-round='1']")).toBeVisible();
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

  // 탭바 「더 보기」 맨 위에 내 이름, 누르면 내 등록증. 같은 공개 열쇠라 같은 등록증이고, 발급일은 이제 등록 회차의 날짜다
  await page.locator("[data-tab='more']").click();
  await page.locator("[data-my-name]").click();
  await expect(page).toHaveURL(/\/stardraw\/id$/);
  const myCard = page.locator(`[data-idcard="${number}"]`);
  await expect(myCard).toBeVisible();
  await expect(myCard.locator("[data-issue-date]")).toHaveText(
    /^\d{4}\. \d{1,2}\. \d{1,2}\.$/,
  );
  // 누르면 주인 확인: 패스키로 새 문제 값에 서명하고 이 기기에서 확인한다. 시각이 초 단위로 흐른다
  await myCard.click({ position: CARD_TAP });
  // 연출이 있으면 본인 확인도 신분증 제시 틀: 아래에서 올라온 등록증을 내밀면 패스키
  if (motion)
    await page
      .locator("[aria-label='신분증 확인'][aria-disabled='false']")
      .press("Enter", { timeout: 30_000 });
  await expect(myCard.locator("[data-owner-ok]")).toBeVisible({
    timeout: 30_000,
  });
  await expect(myCard.locator("[data-owner-time]")).toHaveText(
    /^\d{2}:\d{2}:\d{2}$/,
  );
  // 새로 연 페이지라 호출 수는 처음부터 센다: 주인 확인 한 번
  expect(await passkeyCalls(page)).toEqual({ create: 0, get: 1 });
  await noSideScroll(page);
  await page.screenshot({
    path: info.outputPath("stardraw-id-owner.png"),
    fullPage: true,
  });
  // 뒷면: 뒤집으면 공개 열쇠는 가려 있고, 가린 줄을 누르면 본인 확인 뒤 꺼내 보인다
  await page.locator("[data-flip-card]").click();
  const back = page.locator("[data-idcard-back]");
  await expect(back.locator("[data-key-mask]")).toBeVisible();
  await expect(back.locator("[data-public-key]")).toHaveCount(0);
  await back.locator("[data-key-mask]").click();
  // 연출이 있으면 열쇠 꺼내기도 신분증 제시 틀(등록증을 내밀면 확인)
  if (motion)
    await page
      .locator("[aria-label='신분증 확인'][aria-disabled='false']")
      .press("Enter", { timeout: 30_000 });
  await expect(back.locator("[data-public-key]")).toHaveText(
    /^04[0-9a-f]{128}$/,
    { timeout: 30_000 },
  );
  await expect(back.getByRole("button", { name: "복사" })).toBeVisible();
  expect(await passkeyCalls(page)).toEqual({ create: 0, get: 2 });
  await noSideScroll(page);
  await page.screenshot({
    path: info.outputPath("stardraw-id-back.png"),
    fullPage: true,
  });
  // 다시 뒤집으면 가린다
  await page.locator("[data-flip-card]").click();
  await expect(back.locator("[data-public-key]")).toHaveCount(0);
  // 등록증 공유: "끝 천체에 거주하는 이름"과 첫 화면 주소(남의 화면이 등록증을 그리지 않게 공개 열쇠는 넣지 않는다)
  await page.getByRole("button", { name: "등록증 공유" }).click();
  await expect
    .poll(async () => ((await shared()) as { text: string }).text)
    .toMatch(/^.+에 거주하는 .+, 하늘의 별 따기 우주인으로 등록했어요\.$/);
  expect(((await shared()) as { url: string }).url).toMatch(/\/stardraw$/);

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
  await setup.getByRole("button", REGISTER).click();
  // Next.js 경로 안내용 빈 alert가 따로 있어 문구로 고른다
  const alert = setup.getByRole("alert").filter({ hasText: "취소" });
  await expect(alert).toBeVisible({ timeout: 30_000 });
  await expect(alert).toContainText("등록하지 않았어요");
  await expect(alert.getByRole("link", { name: "자세히" })).toHaveAttribute(
    "href",
    "/stardraw/about#passkey",
  );
  // 별 고르기로 넘어가지 않는다
  await expect(setup).toBeVisible();
  await expect(page.getByRole("button", ENTER)).toHaveCount(0);
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
  await expect(page.getByRole("button", REGISTER)).toHaveCount(0);

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
  // 지난 회차는 탭바에서(처음 온 사람의 입구에서도)
  await page.locator("[data-tab='rounds']").click();
  await expect(page).toHaveURL(/\/stardraw\/rounds$/);
  await expect(page.getByRole("region", { name: "지난 회차" })).toBeVisible();
  // 새로고침해도 지난 회차
  await page.reload();
  await expect(page.getByRole("region", { name: "지난 회차" })).toBeVisible();
  // 뒤로가기는 게임 목록이 아니라 별 따기 첫 화면
  await page.goBack();
  await expect(page).toHaveURL(/\/stardraw$/);
  await expect(page.locator("[data-gate]")).toBeVisible();
  // 주소로 바로 연 화면의 「처음으로」는 사이트 밖이 아니라 첫 화면으로
  await page.goto("/stardraw/rounds");
  await page.getByRole("button", { name: /처음으로/ }).click();
  await expect(page).toHaveURL(/\/stardraw$/);
  // 당겨서 새로고침은 응모(하늘에서 별 고르기)와 추첨 화면에서만 막는다
  const noPull = page.locator("html[data-no-pull]");
  await expect(noPull).toHaveCount(0);
  await page.goto("/stardraw/enter");
  await expect(noPull).toHaveCount(1);
  await page.goto("/stardraw");
  await expect(noPull).toHaveCount(0);
  // 확인 링크 주소: 없는 링크면 새 링크를 받으라고 안내한다
  await page.goto(`/stardraw/check#${"A".repeat(24)}`);
  await expect(page.locator("[data-check-link='missing']")).toContainText(
    "없는 링크이거나 기한(7일)이 지났습니다",
  );
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
  await expect(page.locator("[data-agency]")).toContainText("카노푸스 우주국");
  await expect(
    page.getByRole("heading", { name: "우주국이 보관하는 것" }),
  ).toBeVisible();
  await noSideScroll(page);
});

test("데모: 1등으로 응모해 당첨자 확인 초록불까지(틀린 별, 가짜 당첨자 포함)", async ({
  page,
}, info) => {
  // 데모는 실제 패스키를 만들지 않는다: 가상 인증기 없이 흉내 시트로만 끝까지 간다
  await watchCredentials(page);
  await page.goto("/stardraw/demo");
  await expect(page.getByRole("note")).toContainText("데모 · 실제 게임과 따로");

  // 처음엔 별을 고르기 전에 우주인 등록(흉내 시트 한 번). 먼저 취소해 본다
  const setup = page.locator("[data-key-setup]");
  await setup.getByRole("button", REGISTER).click();
  await expect(page.locator("[data-demo-unlock='create']")).toBeVisible();
  await page.screenshot({
    path: info.outputPath("stardraw-demo-sheet.png"),
  });
  await demoUnlock(page, "create", false);
  await expect(
    setup.getByRole("alert").filter({ hasText: "등록하지 않았어요" }),
  ).toBeVisible();
  await setup.getByRole("button", REGISTER).click();
  await demoUnlock(page, "create");
  // 이어서 등록 증명 서명(장부에 바로 등록)
  await demoUnlock(page, "sign");
  await expect(setup).toHaveCount(0);
  // 등록증을 누르면 흉내 시트로 주인 확인
  const demoCard = page.locator("[data-idcard]");
  await expect(demoCard).toBeVisible();
  await demoCard.click({ position: CARD_TAP });
  await demoUnlock(page, "check");
  await expect(demoCard.locator("[data-owner-ok]")).toBeVisible();
  await page.getByRole("button", { name: TO_PICK_ISSUED }).click();
  const afterCreate = await demoUnlocks(page);

  // 응모: 이번 회차 1등이 되게 채우고 낸다. 서명 시트 한 번
  await page.getByRole("button", { name: "1등 되게" }).click();
  await expect(page.getByText("6/6")).toBeVisible();
  await page.getByRole("button", ENTER).click();
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

  // 0) 당첨자 폰: 카노푸스 우주국 당첨 안내(장부로 기기가 계산) → 확인 링크 만들기(서명 시트 한 번)
  const notice = winner.locator("[data-win-notice]");
  await expect(notice).toContainText("카노푸스 우주국 당첨 안내");
  await expect(notice).toContainText("1회 1등입니다");
  await notice.getByRole("button", { name: "확인 링크 만들기" }).click();
  await demoUnlock(page, "sign");
  await expect(notice.locator("[data-check-url]")).toHaveAttribute(
    "data-check-url",
    /\/stardraw\/check#[A-Za-z0-9_-]{24}$/,
  );
  await page.screenshot({
    path: info.outputPath("stardraw-demo-link.png"),
    fullPage: true,
  });

  // 1) 확인하는 사람: 링크를 열면 회차·등수가 보이고 「확인 시작」. 링크는 한 번만 쓰인다
  await toChecker();
  await expect(
    checker.getByText("1회 1등 당첨자가 보낸 확인 링크입니다"),
  ).toBeVisible();
  await page.screenshot({
    path: info.outputPath("stardraw-demo-link-open.png"),
    fullPage: true,
  });
  await checker.getByRole("button", { name: "확인 시작" }).click();
  await expect(
    checker.getByText("당첨자의 승인을 기다리고 있습니다"),
  ).toBeVisible();
  await checker
    .getByRole("button", { name: "다른 사람이 같은 링크를 열면?" })
    .click();
  await expect(
    checker.locator("[data-second-checker] [data-link-notice='used']"),
  ).toContainText("이미 사용된 링크입니다");
  await page.screenshot({
    path: info.outputPath("stardraw-demo-link-used.png"),
    fullPage: true,
  });

  // 2) 가짜 당첨자: 서명이 맞지 않아 빨간불
  await toWinner();
  await expect(
    winner.getByText(/보낸 확인 링크로 1회 1등 당첨 확인 요청이 왔습니다/),
  ).toBeVisible();
  // 우주국은 전달만 한다
  await expect(winner).toContainText("에 만든 링크 · 전달: 카노푸스 우주국");
  await winner.getByRole("button", { name: "가짜 당첨자로 답하기" }).click();
  await toChecker();
  await expect(checker.locator("[data-verdict='fail']").first()).toContainText(
    "본인 확인에 실패했습니다",
  );
  await expect(checker).toContainText("그 응모권을 낸 열쇠의 서명이 아닙니다");

  // 3) 새 링크를 보내면 진짜 당첨자가 승인하고 별 세 개를 받는다
  await toWinner();
  await notice
    .getByRole("button", { name: "다른 사람에게 보낼 새 링크" })
    .click();
  await demoUnlock(page, "sign");
  await toChecker();
  await checker.getByRole("button", { name: "확인 시작" }).click();
  await expect(
    checker.getByText("당첨자의 승인을 기다리고 있습니다"),
  ).toBeVisible();
  await toWinner();
  // 「등록증으로 승인」: 내 등록증이 나타나 확인을 받고 별 세 개가 빛난다
  await winner.getByRole("button", { name: "등록증으로 승인" }).click();
  await expect(winner.locator("[data-approving='checking']")).toBeVisible();
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
  await expect(winner.locator("[data-sas-warning]")).toHaveText(
    "별 세 개는 내가 당첨을 알린 그 사람에게만 보내세요.",
  );
  await page.screenshot({
    path: info.outputPath("stardraw-demo-winner.png"),
    fullPage: true,
  });

  // 3) 확인하는 사람: 일부러 차례를 바꿔 한 번 틀리고, 맞게 누른다
  await toChecker();
  await expect(
    checker.getByText("당첨자가 보낸 별 세 개를 하늘에서 차례로 눌러 주세요"),
  ).toBeVisible();
  const sky = "[data-pane='checker'] canvas[data-sky='pick']";
  for (const n of [...stars].reverse()) await tapStar(page, sky, n);
  await expect(checker.locator("[data-verdict='wrong']")).toContainText(
    /별 세 개가 맞지 않습니다.*2번 더 할 수 있습니다/,
  );
  // 틀린 별은 잠시 뒤 지워진다
  await expect(checker.getByText("①").first()).toBeVisible();
  await expect
    .poll(async () =>
      checker.locator("ol li").filter({ hasText: /①|②|③/ }).allTextContents(),
    )
    .toEqual(["①", "②", "③"]);
  for (const n of stars) await tapStar(page, sky, n);
  // 이 흐름은 소속을 받지 않고 응모했다: 응모권 주인까지만 확인하고 소속 표시는 없음(2026-10-31 보안 검토 B1)
  await expect(checker.locator("[data-verdict='ok']")).toHaveText(
    "1회 1등 응모권의 주인이 맞습니다",
  );
  await expect(checker.locator("[data-qual-mark='none']")).toHaveText(
    "소속 표시: 없음(증서를 붙이지 않은 응모권)",
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
  await page.getByRole("button", REGISTER).click();
  await demoUnlock(page, "create");
  await demoUnlock(page, "sign");
  await page.getByRole("button", { name: TO_PICK_ISSUED }).click();
  await page.getByRole("button", { name: "자동", exact: true }).click();
  await page.getByRole("button", ENTER).click();
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
  await page.getByRole("button", ENTER).click();
  await demoUnlock(page, "sign");
  await expect(page.locator("[data-receipt]")).toBeVisible({ timeout: 30_000 });
  expect((await demoUnlocks(page)) - beforeEntry).toBe(1);
  await page.getByRole("button", { name: "지금 추첨" }).click();
  await expect(page.locator("[data-demo-result]")).toHaveText("1등 당첨", {
    timeout: 60_000,
  });
});

test("데모 화면 둘러보기: 목록의 화면이 모두 가로 넘침 없이 열리고, 뒤로가기는 목록으로", async ({
  page,
}, info) => {
  test.skip(info.project.name !== "phone-portrait", "휴대폰 세로 한 크기로");
  await page.goto("/stardraw/demo");
  const list = page.getByRole("navigation", { name: "화면 둘러보기" });
  // 목록에서 들어가면 # 조각이 기록에 남아, 뒤로가기와 「화면 목록」이 목록으로 돌아온다
  await list.getByRole("link", { name: "결과 봉투" }).click();
  await expect(page).toHaveURL(/#tour-envelope$/);
  const screen = page.locator("[data-tour-screen][data-tour-ready]");
  await expect(screen.locator("[data-envelope='1']")).toBeVisible({
    timeout: 30_000,
  });
  await page.goBack();
  await expect(list).toBeVisible();
  await list.getByRole("link", { name: "내 응모" }).click();
  await expect(screen.getByText("제 1회").first()).toBeVisible();
  await page.getByRole("button", { name: "← 화면 목록" }).click();
  await expect(list).toBeVisible();
  await expect(page).not.toHaveURL(/#tour/);

  const expectations: [
    string,
    (s: typeof screen) => ReturnType<Page["locator"]>,
  ][] = [
    ["enter", (s) => s.locator("[data-entry-slip]")],
    ["receipt", (s) => s.locator("[data-receipt]")],
    ["draw", (s) => s.locator("[data-draw-result]")],
    ["envelope", (s) => s.locator("[data-envelope='1']")],
    ["rank-1", (s) => s.getByText("1등 당첨")],
    ["rank-2", (s) => s.getByText("2등 당첨")],
    ["rank-3", (s) => s.getByText("3등 당첨")],
    ["rank-4", (s) => s.getByText("4등 당첨")],
    ["rank-5", (s) => s.getByText("5등 당첨")],
    ["lose", (s) => s.getByText("아쉽게도 당첨되지 않았습니다")],
    ["mine", (s) => s.getByText("제 1회").first()],
    ["rounds", (s) => s.getByRole("heading", { name: "지난 회차" })],
    ["win-notice", (s) => s.locator("[data-check-url]")],
    ["link-open", (s) => s.getByRole("button", { name: "확인 시작" })],
    ["link-used", (s) => s.locator("[data-link-notice='used']")],
    ["winner", (s) => s.getByText(/당첨 확인 요청이 왔습니다/).first()],
    ["checker", (s) => s.getByText("당첨자의 승인을 기다리고 있습니다")],
    ["check-ok", (s) => s.locator("[data-verdict='ok']")],
    ["check-fail", (s) => s.locator("[data-verdict='fail']")],
    ["register", (s) => s.getByRole("button", REGISTER)],
    ["id-card", (s) => s.locator("[data-idcard]")],
    [
      "id-earth",
      (s) => s.getByText("우리 은하 › 오리온 팔 › 태양계 › 지구 › 남극"),
    ],
    ["id-laika", (s) => s.locator("[data-egg='laika']")],
    ["id-prince", (s) => s.locator("[data-egg='prince']")],
    ["id-rabbit", (s) => s.locator("[data-egg='rabbit']")],
    ["sheet-create", () => page.locator("[data-demo-unlock='create']")],
    ["sheet-sign", () => page.locator("[data-demo-unlock='sign']")],
    ["sheet-check", () => page.locator("[data-demo-unlock='check']")],
    ["in-app", (s) => s.getByText(/카카오톡 안에서는 패스키를 쓸 수 없어요/)],
    ["no-passkey", (s) => s.getByText(/패스키를 지원하지 않아요/)],
    // 연출 항목: 시험은 움직임 줄이기라 결과 모습만 보인다
    ["fx-gate", (s) => s.locator("[data-gate]")],
    ["fx-issue", (s) => s.locator("[data-issued='new']")],
    [
      "fx-issue-earth",
      (s) => s.locator("[data-issued-origin]").filter({ hasText: "지구" }),
    ],
    [
      "fx-issue-andromeda",
      (s) =>
        s.locator("[data-issued-origin]").filter({ hasText: "안드로메다" }),
    ],
    ["fx-welcome", (s) => s.locator("[data-idcard]")],
    ["fx-submit", (s) => s.locator("[data-receipt]")],
    ["fx-print", (s) => s.locator("[data-receipt]")],
    ["fx-card-open", (s) => s.locator("[data-card='open']")],
    ["fx-card-entered", (s) => s.locator("[data-card='entered']")],
    ["fx-card-drawing", (s) => s.locator("[data-round-note='closed-entered']")],
    [
      "fx-card-closed-none",
      (s) => s.locator("[data-round-note='closed-none']"),
    ],
  ];
  for (const [id, find] of expectations) {
    await page.evaluate((h) => {
      window.location.hash = h;
    }, `#tour-${id}`);
    await expect(page.locator(`[data-tour-screen='${id}']`)).toBeVisible();
    await expect(find(screen)).toBeVisible();
    await noSideScroll(page);
    await page.screenshot({
      path: info.outputPath(`stardraw-tour-${id}.png`),
      fullPage: true,
    });
  }
  // 남의 등록증(드문 사진 견본)은 이 기기의 열쇠로 서명해도 맞지 않아 조용히 실패한다
  await page.evaluate(() => {
    window.location.hash = "#tour-id-laika";
  });
  const egg = screen.locator("[data-idcard]");
  await expect(egg).toBeVisible();
  await egg.click({ position: CARD_TAP });
  await expect(screen.getByText("확인하지 못했습니다")).toBeVisible();
  await expect(egg.locator("[data-owner-ok]")).toHaveCount(0);
  // 내 것(데모 열쇠)은 통과
  await page.evaluate(() => {
    window.location.hash = "#tour-id-card";
  });
  const own = screen.locator("[data-idcard]");
  await own.click({ position: CARD_TAP });
  await expect(own.locator("[data-owner-ok]")).toBeVisible();
});

test("데모 둘러보기 연출: 영수증 출력이 오버레이로 나왔다 걷히고, 「다시 보기」로 다시 나온다", async ({
  page,
}, info) => {
  test.skip(info.project.name !== "desktop", "한 크기로");
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto("/stardraw/demo#tour-fx-print");
  const overlay = page.locator("[data-stage-overlay]");
  await expect(overlay).toBeVisible({ timeout: 30_000 });
  // 오버레이는 걷히고(조건으로 기다린다) 영수증 화면이 남는다
  await expect(overlay).toHaveCount(0, { timeout: 10_000 });
  await expect(page.locator("[data-receipt]")).toBeVisible();
  await page.getByRole("button", { name: "다시 보기" }).click();
  await expect(overlay).toBeVisible();
});

/**
 * 「추첨 보러 가기」로 결과 전에 들어가면 남은 시간을 보이며 기다리고, 결과가 들어오는 순간 추첨으로 바뀐다.
 * 결과 전에 나가면 "열어 봄"이 남지 않아 정답 가리기가 그대로다(연습 장부의 건너뛰기로 결과를 결정적으로 들인다)
 */
test("추첨 보러 가기: 결과 전에는 기다리고, 결과가 오면 바로 추첨", async ({
  page,
}, info) => {
  test.skip(info.project.name !== "phone-portrait", "휴대폰 세로 한 크기로");
  await virtualAuthenticator(page);
  await page.goto("/stardraw");
  await page.getByRole("button", REGISTER).click();
  await page.getByRole("button", { name: TO_PICK_ISSUED }).click();
  await page.getByRole("button", { name: "자동", exact: true }).click();
  await page.getByRole("button", ENTER).click();
  await expect(page.locator("[data-receipt]")).toBeVisible({ timeout: 30_000 });
  await page.goto("/stardraw");
  await page.locator("[data-card='entered'] [data-go-draw]").click();
  await expect(page).toHaveURL(/#draw-1$/);
  const wait = page.locator("[data-draw-wait='1']");
  await expect(wait).toContainText("추첨까지");
  // 결과 전에 나갔다 와도 정답 가리기가 풀리지 않는다(열어 봄이 남지 않는다)
  await page.getByRole("button", { name: "← 돌아가기" }).click();
  await page.locator("[data-card='entered'] [data-go-draw]").click();
  await expect(wait).toBeVisible();
  // 기다리는 동안 결과가 들어오면 그 자리에서 추첨으로
  await page.getByRole("button", { name: /다음 추첨까지 건너뛰기/ }).click();
  await expect(page.locator("[data-draw-result]")).toBeVisible({
    timeout: 30_000,
  });
  await expect(wait).toHaveCount(0);
});

/**
 * 이 기기의 첫 추첨은 끝까지 보고(건너뛰기 없음), 그 뒤로는 이미 결과가 나온 회차를 열면 「추첨 건너뛰기」가 있다.
 * 건너뛰면 바로 결과이고 열어 봄으로 친다. 실시간(기다리던 화면에서 결과가 들어와 시작한 추첨)에는 없다.
 * 응모는 움직임 줄이기로 빨리 지나고, 추첨만 연출을 켜서 본다
 */
test("추첨 건너뛰기: 첫 추첨은 끝까지, 그 뒤 나중에 연 회차만", async ({
  page,
}, info) => {
  test.skip(info.project.name !== "phone-portrait", "휴대폰 세로 한 크기로");
  test.setTimeout(150_000);
  await virtualAuthenticator(page);
  const skipDraw = page.getByRole("button", { name: "추첨 건너뛰기" });
  const result = page.locator("[data-draw-result]");
  const enter = async (first: boolean) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/stardraw");
    if (first) {
      await page.getByRole("button", REGISTER).click();
      await page.getByRole("button", { name: TO_PICK_ISSUED }).click();
    } else await page.getByRole("button", { name: TO_PICK }).click();
    await page.getByRole("button", { name: "자동", exact: true }).click();
    await page.getByRole("button", ENTER).click();
    await expect(page.locator("[data-receipt]")).toBeVisible({
      timeout: 30_000,
    });
    await page.goto("/stardraw");
  };
  const skipToDraw = async () => {
    const skip = page.getByRole("button", { name: /다음 추첨까지 건너뛰기/ });
    await skip.click();
    await expect(skip).toBeEnabled({ timeout: 30_000 });
  };

  // (가) 첫 추첨: 건너뛰기 없이 끝까지
  await enter(true);
  await skipToDraw();
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.locator("[data-envelope]").click();
  await expect(page.locator("[data-draw-ball], canvas").first()).toBeVisible();
  await expect(skipDraw).toHaveCount(0);
  await expect(result).toBeVisible({ timeout: 60_000 });

  // (나) 끝까지 본 뒤 나중에 연 회차: 건너뛰기가 있고, 누르면 바로 결과·열어 봄
  await enter(false);
  await skipToDraw();
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.locator("[data-envelope]").click();
  await skipDraw.click({ timeout: 10_000 });
  await expect(result).toBeVisible({ timeout: 5_000 });
  await page.getByRole("button", { name: "← 돌아가기" }).click();
  await expect(page.locator("[data-envelope]")).toHaveCount(0);

  // (다) 실시간: 기다리는 화면에서 결과가 들어와 시작한 추첨에는 건너뛰기가 없다
  await enter(false);
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.locator("[data-card='entered'] [data-go-draw]").click();
  await expect(page.locator("[data-draw-wait]")).toBeVisible();
  await page.getByRole("button", { name: /다음 추첨까지 건너뛰기/ }).click();
  await expect(page.locator("[data-draw-wait]")).toHaveCount(0, {
    timeout: 30_000,
  });
  await expect(skipDraw).toHaveCount(0);
  await expect(result).toBeVisible({ timeout: 60_000 });
  await expect(skipDraw).toHaveCount(0);
});

test("등록증 끌기: 가로는 민 방향으로 뒤집고 못 넘기면 제자리, 세로는 기울기만, 단추는 그대로", async ({
  page,
}, info) => {
  test.skip(info.project.name === "phone-landscape", "PC와 휴대폰 세로로");
  // 끄는 동안 따라 도는 모습까지 보려고 움직임을 켠다. 판정은 각도 변수와 뒤집힘 표시로만(시간을 기다리지 않는다)
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto("/stardraw/demo#tour-id-card");
  const screen = page.locator("[data-tour-screen][data-tour-ready]");
  const stage = screen.locator("[data-idcard-stage]");
  await expect(stage.locator("[data-idcard]")).toBeVisible({ timeout: 30_000 });
  const turn = stage.locator(".sd-idcard-flip");
  const angle = (name: "--ang" | "--rx") =>
    turn.evaluate(
      (el, n) => Number.parseFloat(el.style.getPropertyValue(n) || "0"),
      name,
    );
  const box = (await stage.boundingBox()) as {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  /** 가운데에서 (fx, fy)만큼(카드 너비·높이 비율) 끈다. 떼기 전 할 일은 `during` */
  const drag = async (fx: number, fy: number, during?: () => Promise<void>) => {
    await page.mouse.move(cx, cy);
    await page.mouse.down();
    await page.mouse.move(cx + box.width * fx, cy + box.height * fy, {
      steps: 5,
    });
    await during?.();
    await page.mouse.up();
  };

  // 조금 밀면 민 만큼 돌고(너비 20% = 26도) 떼면 제자리
  await drag(0.2, 0, async () => {
    await expect.poll(() => angle("--ang")).toBeGreaterThan(20);
    expect(await angle("--ang")).toBeLessThan(32);
  });
  await expect(turn).not.toHaveAttribute("data-flipped");
  expect(await angle("--ang")).toBe(0);

  // 문턱을 넘겨 오른쪽으로 밀면 오른쪽으로(+180) 뒤집힌다
  await drag(0.5, 0);
  await expect(turn).toHaveAttribute("data-flipped", "");
  expect(await angle("--ang")).toBe(180);
  await expect(screen.locator("[data-key-mask]")).toBeVisible();
  // 뒷면에서 왼쪽으로 밀면 왼쪽으로 돌아 앞면, 한 번 더 왼쪽이면 -180(각이 쌓인다)
  await drag(-0.5, 0);
  await expect(turn).not.toHaveAttribute("data-flipped");
  expect(await angle("--ang")).toBe(0);
  await drag(-0.5, 0);
  await expect(turn).toHaveAttribute("data-flipped", "");
  expect(await angle("--ang")).toBe(-180);
  // 「앞면 보기」 단추는 그대로
  await page.locator("[data-flip-card]").click();
  await expect(turn).not.toHaveAttribute("data-flipped");
  expect(await angle("--ang")).toBe(0);

  // 세로로 크게 끌어도 위아래로 기울 뿐(최대 22도) 뒤집히지 않는다
  await drag(0, 0.45, async () => {
    await expect.poll(() => angle("--rx")).toBeLessThan(-10);
    expect(await angle("--rx")).toBeGreaterThanOrEqual(-22);
    expect(await angle("--ang")).toBe(0);
  });
  await expect(turn).not.toHaveAttribute("data-flipped");
  expect(await angle("--rx")).toBe(0);

  // 주소 단추 위에서 시작해 끌면 단추가 눌리지 않고, 짧게 누르면 눌린다
  const address = stage.getByRole("button", { name: /^주소:/ });
  const at = (await address.boundingBox()) as { x: number; y: number };
  await page.mouse.move(at.x + 4, at.y + 4);
  await page.mouse.down();
  await page.mouse.move(at.x + 40, at.y + 4, { steps: 4 });
  await page.mouse.up();
  await expect(screen.locator("[data-full-address]")).toHaveCount(0);
  await address.click();
  await expect(screen.locator("[data-full-address]")).toBeVisible();
  // 카드를 짧게 누르면 본인 확인(둘러보기는 확인을 바로 통과시킨다)
  await stage.locator("[data-idcard]").click({ position: CARD_TAP });
  // 본인 확인은 신분증 제시 틀: 아래에서 올라온 등록증을 내밀면(Enter도 같다) 확인, 연출이 끝나면 카드에 확인됨
  await page
    .locator("[aria-label='신분증 확인'][aria-disabled='false']")
    .press("Enter", { timeout: 30_000 });
  await expect(stage.locator("[data-owner-ok]")).toBeVisible({
    timeout: 30_000,
  });
});

test("당첨 축하: 맞은 내 별로 나만의 별자리, 1~3등은 당첨 직인, 5등은 가볍게", async ({
  page,
}, info) => {
  test.skip(info.project.name === "phone-landscape", "데스크톱·휴대폰 세로로");
  // 움직임 줄이기(화면 시험 기본): 별자리와 직인이 처음부터 다 보이고 별똥별은 없다
  const cases = [
    { rank: 1, stars: 6, seal: true },
    { rank: 3, stars: 5, seal: true },
    { rank: 5, stars: 3, seal: false },
  ] as const;
  for (const c of cases) {
    await page.goto(`/stardraw/demo#tour-rank-${c.rank}`);
    const screen = page.locator("[data-tour-screen][data-tour-ready]");
    await expect(screen.getByText(`${c.rank}등 당첨`)).toBeVisible({
      timeout: 30_000,
    });
    const party = screen.locator(`[data-celebration='${c.rank}']`);
    await expect(party).toBeAttached();
    await expect(party.locator(".sd-cel-star")).toHaveCount(c.stars);
    await expect(party.locator(".sd-cel-line")).toHaveCount(c.stars - 1);
    await expect(party.locator(".sd-cel-meteor").first()).toBeHidden();
    await expect(screen.locator("[data-win-seal]")).toHaveCount(c.seal ? 1 : 0);
    if (c.seal)
      await expect(
        screen.getByRole("img", { name: "카노푸스 우주국 당첨 직인" }),
      ).toBeVisible();
    await noSideScroll(page);
    await page.screenshot({
      path: info.outputPath(`stardraw-win-${c.rank}.png`),
      fullPage: true,
    });
  }
  // 낙첨은 축하가 없다
  await page.evaluate(() => {
    window.location.hash = "#tour-lose";
  });
  await expect(page.getByText("아쉽게도 당첨되지 않았습니다")).toBeVisible();
  await expect(page.locator("[data-celebration]")).toHaveCount(0);
});

test("당첨 축하 연출: 1등은 별똥별 비, 직인이 찍히는 순간 짧게 떨린다", async ({
  page,
}, info) => {
  test.skip(info.project.name !== "desktop", "데스크톱 한 크기로");
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.addInitScript(() => {
    const w = window as unknown as { __vibrated: unknown[] };
    w.__vibrated = [];
    Object.defineProperty(navigator, "vibrate", {
      configurable: true,
      value: (p: unknown) => {
        w.__vibrated.push(p);
        return true;
      },
    });
  });
  await page.goto("/stardraw/demo#tour-rank-1");
  const party = page.locator("[data-celebration='1']");
  await expect(party).toBeAttached({ timeout: 30_000 });
  await expect(party.locator(".sd-cel-meteor")).toHaveCount(18);
  // 직인이 찍힌 뒤에 한 번 떨린다(시각은 연출 계산에서 정해진다)
  await expect
    .poll(
      () =>
        page.evaluate(
          () => (window as unknown as { __vibrated: unknown[] }).__vibrated,
        ),
      { timeout: 20_000 },
    )
    .toEqual([[40, 60, 80]]);
  await expect(page.locator("[data-win-seal]")).toBeVisible();
  await page.screenshot({ path: info.outputPath("stardraw-win-1-motion.png") });
});

test("HDR 별빛: HDR 화면에서만 맞은 내 별 위에 HDR 그림을 겹치고, 응모 하늘에는 늘 켜진 HDR이 없다", async ({
  page,
}, info) => {
  test.skip(info.project.name !== "desktop", "데스크톱 한 크기로");
  const glows = page.locator("[data-tour-screen] img[data-hdr-glow]");
  // SDR 화면(헤드리스 기본): 그림을 겹치지도 받지도 않는다
  await page.goto("/stardraw/demo#tour-rank-1");
  await expect(page.getByText("1등 당첨")).toBeVisible({ timeout: 30_000 });
  await expect(glows).toHaveCount(0);
  await page.screenshot({ path: info.outputPath("stardraw-hdr-sdr.png") });

  // HDR 화면 흉내: dynamic-range: high 질의만 참으로 답한다
  await page.addInitScript(() => {
    const original = window.matchMedia.bind(window);
    window.matchMedia = (q: string) =>
      q.includes("dynamic-range: high")
        ? ({
            matches: true,
            media: q,
            onchange: null,
            addEventListener() {},
            removeEventListener() {},
            addListener() {},
            removeListener() {},
            dispatchEvent: () => false,
          } as MediaQueryList)
        : original(q);
  });
  await page.reload();
  await expect(page.getByText("1등 당첨")).toBeVisible({ timeout: 30_000 });
  // 1등: 맞은 별 6개만 은은하게(움직임 줄이기라 번쩍임은 없다)
  await expect(page.locator("img[data-hdr-glow='hit']")).toHaveCount(6);
  await expect(page.locator("img[data-hdr-glow='flash']")).toHaveCount(0);
  // 그림이 실제로 풀린다(AVIF 256px)
  await expect
    .poll(() =>
      page
        .locator("img[data-hdr-glow]")
        .first()
        .evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth),
    )
    .toBe(256);
  await page.screenshot({ path: info.outputPath("stardraw-hdr-hit.png") });

  // 응모 하늘: 늘 켜진 HDR은 없다(배터리·화면 밝기 출렁임)
  await page.evaluate(() => {
    window.location.hash = "#tour-enter";
  });
  await expect(page.locator("[data-tour-screen='enter']")).toBeVisible();
  await expect(page.locator("canvas[data-sky='pick']")).toBeVisible();
  await expect(page.locator("img[data-hdr-glow]")).toHaveCount(0);
});
