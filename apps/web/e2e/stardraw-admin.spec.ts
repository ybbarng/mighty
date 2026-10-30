import { expect, type Page, test } from "./test";

/**
 * 우주국장 관리 화면(docs/36 11-12).
 * - 데모 국장 모드: 흉내 패스키로 국장 패스키 만들기 → 서버 설정에 넣기 → 하루 건너뛰기 → 시험 소속 추가 → 하루 건너뛰기로 적용.
 *   국장 아닌 패스키는 거절된다. 기기 안 연습 장부가 서버와 같은 규칙(core)으로 확인한다.
 * - 실제 관리 화면(/stardraw/admin): 서버 API는 흉내 응답, 패스키는 Chrome 가상 인증기.
 */

async function demoUnlock(page: Page, purpose: "create" | "sign") {
  const sheet = page.locator(`[data-demo-unlock='${purpose}']`);
  await expect(sheet).toBeVisible({ timeout: 30_000 });
  await sheet.getByRole("button", { name: "확인" }).click();
  await expect(sheet).toHaveCount(0);
}

const message = (page: Page) => page.locator("[data-director-message]");

test("데모 국장 모드: 국장이 되어 시험 소속을 추가하고, 국장 아닌 패스키는 거절된다", async ({
  page,
}, info) => {
  test.skip(
    info.project.name !== "desktop",
    "진행 논리는 데스크톱 하나로 본다",
  );
  await page.goto("/stardraw/demo#director");
  const console = page.locator("[data-director-console]");
  await expect(console).toBeVisible({ timeout: 30_000 });

  await console.getByRole("button", { name: "국장 패스키 만들기" }).click();
  await demoUnlock(page, "create");
  await expect(message(page)).toHaveAttribute("data-director-message", "ok");
  const fingerprint = await console.locator("[data-fingerprint]").innerText();
  expect(fingerprint).toMatch(/^국장-/);
  await expect(console.locator("[data-director-config]")).toContainText(
    "STARDRAW_DIRECTOR_KEYS=",
  );

  // 아직 국장이 아니다: 서명하면 거절
  await console
    .getByRole("button", { name: "국장 패스키로 서명해 예고" })
    .click();
  await demoUnlock(page, "sign");
  await expect(message(page)).toHaveAttribute("data-director-message", "fail");
  await expect(message(page)).toContainText("아직 국장 열쇠가 아닙니다");

  await console.getByRole("button", { name: "서버 설정에 넣기(데모)" }).click();
  await expect(message(page)).toHaveAttribute("data-director-message", "ok");
  await console.getByRole("button", { name: "하루 건너뛰기" }).click();
  await expect(message(page)).toContainText("하루(25회차)를 건너뛰었습니다", {
    timeout: 60_000,
  });
  await expect(console.locator("[data-director-keys]")).toContainText(
    `${fingerprint}쓰는 중`,
  );

  await console
    .getByRole("button", { name: "국장 아닌 패스키로 해 보기" })
    .click();
  await demoUnlock(page, "sign");
  await expect(message(page)).toHaveAttribute("data-director-message", "fail");
  await expect(message(page)).toContainText("국장 열쇠가 아닙니다");

  await console
    .getByRole("button", { name: "국장 패스키로 서명해 예고" })
    .click();
  await demoUnlock(page, "sign");
  await expect(message(page)).toContainText("받았습니다");
  await expect(console.locator("[data-director-submitted]")).toContainText(
    "소속 추가",
  );
  await console.getByRole("button", { name: "하루 건너뛰기" }).click();
  await expect(message(page)).toContainText("하루(25회차)를 건너뛰었습니다", {
    timeout: 60_000,
  });
  await expect(console.locator("[data-director-affiliations]")).toContainText(
    "시험 성단",
  );
  await expect(
    console.locator("[data-director-ops] [data-op-status='applied']"),
  ).toHaveCount(2);
  await console.scrollIntoViewIfNeeded();
  await page.screenshot({
    path: info.outputPath("demo-director-mode.png"),
    fullPage: true,
  });
});

/** 서버의 GET /api/director/state 흉내(1시간 회차 시험 단계 장부, 다음 기록 40회차) */
function serverState() {
  const epoch = 1793253300;
  const schedule = {
    epoch,
    entries: [
      {
        fromRound: 1,
        length: 3600,
        closeMargin: 5,
        powTarget: 143165576,
        registerPowTarget: 7158278,
        phase: "trial",
      },
    ],
  };
  const opensAt = (r: number) => epoch + (r - 1) * 3600;
  return {
    now: opensAt(40) + 600,
    records: 39,
    schedule,
    view: {
      sealKey: "BAAA",
      next: {
        round: 40,
        after: "ab".repeat(32),
        earliestEffectiveRound: 65,
        earliestEffectiveAt: opensAt(65),
      },
      directors: [] as Record<string, unknown>[],
      operations: [
        {
          id: "11".repeat(32),
          kind: "affiliation-add",
          round: 31,
          effectiveRound: 56,
          effectiveAt: opensAt(56),
          status: "applied",
          cancelledIn: null,
          signer: "director",
          signedBy: "국장-0000-0000-0000",
          summary: "소속 추가: 시험 성단(성단)",
          target: null,
        },
        {
          id: "22".repeat(32),
          kind: "affiliation-add",
          round: 38,
          effectiveRound: 63,
          effectiveAt: opensAt(63),
          status: "pending",
          cancelledIn: null,
          signer: "director",
          signedBy: "국장-0000-0000-0000",
          summary: "소속 추가: 거문고 성운(성운)",
          target: null,
        },
      ],
      affiliations: [
        {
          id: "11".repeat(32),
          name: "시험 성단",
          badge: 2,
          badgeName: "성단",
          method: "초대 코드",
          issuerKey: null,
          issued: 0,
          from: 56,
          until: null,
        },
      ],
      schedulePending: false,
    },
    submitted: [] as Record<string, unknown>[],
  };
}

test("관리 화면: 국장 패스키를 만들어 설정 값을 보이고, 장부의 국장 열쇠로만 서명해 보낸다", async ({
  page,
}, info) => {
  test.skip(
    info.project.name === "phone-landscape",
    "세로 휴대폰과 데스크톱으로 본다",
  );
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
  const state = serverState();
  const sent: string[] = [];
  await page.route("**/stardraw-api/api/director/state", (route) =>
    route.fulfill({ json: state }),
  );
  await page.route("**/stardraw-api/api/director/ops", async (route) => {
    const body = route.request().postDataJSON() as { op: string };
    sent.push(body.op);
    await route.fulfill({
      json: { id: "33".repeat(32), round: 40, effectiveRound: 65 },
    });
  });

  await page.goto("/stardraw/admin");
  const console = page.locator("[data-director-console]");
  await expect(console).toBeVisible();
  await expect(console).toContainText(
    "이 화면에서 만든 패스키는 우주국이 지정해야 국장 열쇠가 됩니다",
  );
  await console.getByRole("button", { name: "국장 패스키 만들기" }).click();
  await expect(message(page)).toHaveAttribute("data-director-message", "ok");
  const fingerprint = await console.locator("[data-fingerprint]").innerText();
  await expect(console.locator("[data-director-config]")).toContainText(
    "STARDRAW_DIRECTOR_KEYS=",
  );

  // 장부에 아직 없는 열쇠: 고른 뒤 거절하고 서버에 보내지 않는다
  await console
    .getByRole("button", { name: "국장 패스키로 서명해 예고" })
    .click();
  await expect(message(page)).toContainText("아직 국장 열쇠가 아닙니다");
  expect(sent).toHaveLength(0);
  await page.screenshot({
    path: info.outputPath("admin-new-key.png"),
    fullPage: true,
  });

  // 장부에 지정돼 쓰는 중이 되면 서명해 보낸다
  const saved = await page.evaluate(
    () =>
      JSON.parse(localStorage.getItem("stardraw-director-keys") ?? "[]") as {
        c: string;
        p: string;
      }[],
  );
  state.view.directors = [
    {
      pub: saved[0]?.p,
      credentialId: saved[0]?.c,
      fingerprint,
      from: 30,
      until: null,
    },
  ];
  await page.reload();
  await expect(console.locator("[data-director-keys]")).toContainText(
    `${fingerprint}쓰는 중`,
  );
  await console
    .getByRole("button", { name: "국장 패스키로 서명해 예고" })
    .click();
  await expect(message(page)).toContainText("받았습니다");
  expect(sent).toHaveLength(1);
  await expect(
    console.locator("[data-live-start] option").first(),
  ).toContainText("시작 · 사슬");
  const overflow = await page.evaluate(
    () =>
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);
  await page.screenshot({ path: info.outputPath("admin.png"), fullPage: true });
});
