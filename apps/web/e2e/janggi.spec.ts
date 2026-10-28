import { expect, type Page, test } from "@playwright/test";

/** 판 크기와 가장자리 여백(JanggiBoard의 PAD) */
const PAD = 0.62;
const VIEW_W = 8 + PAD * 2;

const board = (page: Page) => page.getByRole("img", { name: /장기판/ });
const pieces = (page: Page) => page.locator("[data-piece]");

/** 기보 자리 이름("71") → 판 좌표. 초 편(뒤집지 않은 판)에서 본다 */
function xyOfName(name: string): [number, number] {
  const row = Number(name[0]);
  return [Number(name[1]) - 1, row === 0 ? 9 : row - 1];
}

async function tapPoint(page: Page, name: string, touch: boolean) {
  const box = await board(page).boundingBox();
  if (!box) throw new Error("판이 안 보인다");
  const unit = box.width / VIEW_W;
  const [x, y] = xyOfName(name);
  const px = box.x + (x + PAD) * unit;
  const py = box.y + (y + PAD) * unit;
  if (touch) await page.touchscreen.tap(px, py);
  else await page.mouse.click(px, py);
}

/** 내 기물(초 졸부터)을 골라 처음 보이는 갈 곳으로 옮긴다 */
async function playOne(page: Page, touch: boolean) {
  for (const from of ["71", "73", "77", "79", "75", "02", "08", "01", "09"]) {
    if (
      (await page
        .locator(`[data-point="${from}"][data-piece^="c"]`)
        .count()) === 0
    )
      continue;
    await tapPoint(page, from, touch);
    const target = page.locator("[data-target]").first();
    // 갈 곳이 없는 기물이면 점이 생기지 않는다. 다음 기물로.
    const shown = await target
      .waitFor({ timeout: 1500 })
      .then(() => true)
      .catch(() => false);
    if (!shown) continue;
    const to = (await target.getAttribute("data-target")) as string;
    await tapPoint(page, to, touch);
    await expect(
      page.locator(`[data-point="${to}"][data-piece^="c"]`),
    ).toHaveCount(1);
    return { from, to };
  }
  throw new Error("둘 수가 없다");
}

/** 첫 화면 → 옵션에서 컴퓨터(고르면)와 초를 고르고 → 나홀로 장기 */
async function startSolo(page: Page, level?: string) {
  await page.getByRole("button", { name: "옵션" }).click();
  if (level) await page.getByRole("button", { name: level }).click();
  await page.getByRole("button", { name: "초(먼저)" }).click();
  await page.getByRole("button", { name: "처음으로" }).click();
  await page.getByRole("button", { name: /나홀로 장기/ }).click();
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    sessionStorage.setItem("mighty-splash-seen", "1");
    localStorage.removeItem("janggi-save");
  });
});

test("장기: 게임 목록에서 들어가 상차림을 고르고 두다가 무르고 기권한다", async ({
  page,
}, info) => {
  const touch = info.project.name.startsWith("phone");
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await page.getByRole("link", { name: /장기/ }).first().click();
  await expect(page).toHaveURL(/\/janggi$/);
  await expect(page.getByRole("heading", { name: "장기" })).toBeVisible();
  await page.screenshot({ path: info.outputPath("janggi-home.png") });
  await startSolo(page, "입문");

  // 한(컴퓨터)이 먼저 상차림을 고르고, 내 차례가 온다.
  await page.getByRole("button", { name: "상마상마" }).click();
  await expect(pieces(page)).toHaveCount(32);
  await expect(page.getByRole("status")).toContainText("내 차례");
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth,
  );
  expect(overflow).toBe(false);
  await page.screenshot({ path: info.outputPath("janggi-start.png") });

  // 한 수 두면 컴퓨터가 답하고 다시 내 차례.
  await playOne(page, touch);
  await expect(page.getByRole("status")).toContainText("내 차례", {
    timeout: 15_000,
  });
  await playOne(page, touch);
  await expect(page.getByRole("status")).toContainText("내 차례", {
    timeout: 15_000,
  });
  await page.screenshot({ path: info.outputPath("janggi-play.png") });
  await page.getByRole("button", { name: "무르기" }).click();
  await expect(page.getByRole("status")).toContainText("내 차례");

  await page.getByRole("button", { name: "기권" }).click();
  await expect(page.getByRole("status")).toHaveText("기권했어요");
  await expect(page.locator('[data-result-banner="lose"]')).toBeVisible();
  await page.screenshot({ path: info.outputPath("janggi-end.png") });
  expect(errors).toEqual([]);
});

test("장기 배우기: 첫 단원 미션에서 차로 졸을 잡는다", async ({
  page,
}, info) => {
  const touch = info.project.name.startsWith("phone");
  await page.goto("/janggi");
  await page.getByRole("button", { name: /장기 배우기/ }).click();
  await expect(page.getByText("0/6")).toBeVisible();
  await page.getByRole("button", { name: /장기는 어떤 게임/ }).click();
  await expect(board(page)).toBeVisible();
  for (let i = 0; i < 2; i++)
    await page.getByRole("button", { name: "다음", exact: true }).click();
  await page.getByRole("button", { name: "상대 궁을 외통으로 몬다" }).click();
  await page.getByRole("button", { name: "다음", exact: true }).click();
  await page.getByRole("button", { name: "미션 시작" }).click();
  await tapPoint(page, "71", touch);
  await expect(page.locator('[data-target="41"]')).toHaveCount(1);
  await page.screenshot({ path: info.outputPath("janggi-mission.png") });
  await tapPoint(page, "41", touch);
  await expect(page.getByRole("dialog", { name: "미션 성공" })).toBeVisible({
    timeout: 10_000,
  });
  await page.getByRole("button", { name: "다음", exact: true }).click();
  await expect(page.getByText("단원 완료!")).toBeVisible();
});

test("장기: 방장이 방을 만들고 친구가 링크로 들어와 두고, 판 끝 검증을 통과한다", async ({
  context,
}, info) => {
  test.skip(info.project.name !== "desktop", "데스크톱에서만 돌린다");
  const host = await context.newPage();
  const guest = await context.newPage();
  const errors: string[] = [];
  for (const p of [host, guest])
    p.on("pageerror", (e) => errors.push(e.message));

  await host.goto("/janggi?net=local");
  await host.getByRole("button", { name: /다함께 장기/ }).click();
  await host.getByPlaceholder("친구에게 보일 이름").fill("방장");
  await host.getByRole("button", { name: "방 만들기", exact: true }).click();
  const link = await host.locator("input[readonly]").inputValue();
  expect(link).toContain("/janggi");

  await guest.goto(link);
  await guest.getByPlaceholder("친구에게 보일 이름").fill("철수");
  await guest.getByRole("button", { name: "들어가기" }).click();
  await expect(host.getByText("철수")).toBeVisible();
  await host.getByRole("button", { name: "시작하기" }).click();
  await expect(board(guest)).toBeVisible();

  // 상차림 둘(한 → 초)과 수 몇 개를 둔다. 한 편은 판이 뒤집혀 보여 그 쪽은 단추·기권으로만 움직인다.
  for (const p of [host, guest, host, guest]) {
    for (const q of [host, guest]) {
      const setup = q.getByRole("button", { name: "마상마상" });
      if (await setup.isVisible()) await setup.click();
    }
  }
  const cho = (await host.getByText("나는 초").count()) > 0 ? host : guest;
  const han = cho === host ? guest : host;
  await expect(cho.getByRole("status")).toContainText("내 차례", {
    timeout: 15_000,
  });
  await playOne(cho, false);
  await expect(han.getByRole("status")).toContainText("내 차례", {
    timeout: 15_000,
  });
  // 한은 한 수 쉬고, 초가 기권한다.
  await han.getByRole("button", { name: "한 수 쉬기" }).click();
  await expect(cho.getByRole("status")).toContainText("내 차례", {
    timeout: 15_000,
  });
  await cho.getByRole("button", { name: "기권" }).click();
  await expect(han.getByRole("status")).toHaveText("상대가 기권했어요");
  await han.screenshot({ path: info.outputPath("janggi-online.png") });

  // 방장이 나가면 기록이 공개되고, 참가자가 처음부터 다시 둬 보며 확인한다.
  await host.getByRole("button", { name: "← 장기" }).click();
  await expect(guest.getByText(/검증.*문제없음/)).toBeVisible({
    timeout: 10_000,
  });
  expect(errors).toEqual([]);
});

test("장기: 끝낸 판은 내 기록에 쌓이고 복기에서 한 수씩 다시 본다", async ({
  page,
}, info) => {
  test.skip(info.project.name !== "desktop", "기록은 화면 크기와 상관없다");
  await page.goto("/janggi");
  await startSolo(page);
  await page.getByRole("button", { name: "마상상마" }).click();
  await playOne(page, false);
  await expect(page.getByRole("status")).toContainText("내 차례", {
    timeout: 15_000,
  });
  await page.getByRole("button", { name: "기권" }).click();
  await expect(page.getByRole("status")).toHaveText("기권했어요");
  // 복기 기록이 실제로 쓰인 뒤에 떠난다.
  await expect
    .poll(() =>
      page.evaluate(async () => {
        const names = await indexedDB.databases();
        return names.some((d) => d.name === "mighty-review");
      }),
    )
    .toBe(true);
  await page.waitForFunction(
    () =>
      new Promise<boolean>((resolve) => {
        const open = indexedDB.open("mighty-review", 1);
        open.onsuccess = () => {
          const all = open.result
            .transaction("games")
            .objectStore("games")
            .getAll();
          all.onsuccess = () => {
            open.result.close();
            resolve(
              (all.result as { game: string; over: boolean }[]).some(
                (g) => g.game === "janggi" && g.over,
              ),
            );
          };
        };
      }),
  );

  await page.goto("/profile?game=janggi");
  await expect(page.getByRole("tab", { name: "楚 장기" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await expect(page.getByText("0승 1패")).toBeVisible();

  await page.goto("/review");
  await page.getByRole("button", { name: /楚 장기 · 혼자/ }).click();
  await page.getByRole("button", { name: "처음" }).click();
  // 상차림 전에는 마·상 여덟을 뺀 24개다.
  await expect(pieces(page)).toHaveCount(24);
  await page.getByRole("button", { name: "한 수 앞으로" }).click();
  await page.getByRole("button", { name: "한 수 앞으로" }).click();
  await expect(pieces(page)).toHaveCount(32);
  await page.getByRole("button", { name: "한 수 앞으로" }).click();
  await expect(page.getByText(/다음 수: /)).toBeVisible({ timeout: 10_000 });
  await page.screenshot({ path: info.outputPath("janggi-review.png") });
});

test("장기 수 배우기: 외통 문제를 틀렸다 다시 풀고, 진행이 목록에 남는다", async ({
  page,
}, info) => {
  const touch = info.project.name.startsWith("phone");
  await page.goto("/janggi");
  await page.getByRole("button", { name: /장기 배우기/ }).click();
  await page.getByRole("button", { name: /수 배우기/ }).click();
  const mate1 = page.getByRole("region", { name: "한 수 외통" });
  await expect(mate1.getByText("0/13")).toBeVisible();
  await mate1.getByRole("button", { name: "풀기 시작" }).click();
  await expect(page.getByRole("status")).toHaveText("한 수로 외통을 만드세요");

  // 궁을 한 칸 옮기는 수는 외통이 아니다.
  await tapPoint(page, "96", touch);
  const to = await page
    .locator("[data-target]")
    .first()
    .getAttribute("data-target");
  await tapPoint(page, to as string, touch);
  await expect(page.getByRole("status")).toHaveText("외통이 아니에요");
  await page.getByRole("button", { name: "다시 하기" }).click();

  // 정답: 차 48 → 44
  await tapPoint(page, "48", touch);
  await tapPoint(page, "44", touch);
  await expect(page.getByRole("status")).toHaveText("외통!");
  await expect(page.getByText(/차를 44로: 장군!/)).toBeVisible();
  await page.screenshot({ path: info.outputPath("janggi-puzzle.png") });
  await page.getByRole("button", { name: "다음 문제" }).click();
  await expect(page.getByText("한 수 외통 2/13")).toBeVisible();
  await page.getByRole("button", { name: "← 목록" }).click();
  await expect(mate1.getByText("1/13")).toBeVisible();
  await expect(
    mate1.getByRole("button", { name: "한 수 외통 1번 (풂)" }),
  ).toBeVisible();

  // 두 수 외통: 첫 수 뒤 한이 받고, 다시 내 차례가 온다.
  const mate2 = page.getByRole("region", { name: "두 수 외통" });
  await mate2.getByRole("button", { name: "풀기 시작" }).click();
  await expect(page.getByRole("status")).toHaveText(
    "두 수 만에 외통: 첫 수를 두세요",
  );
  await tapPoint(page, "62", touch);
  await tapPoint(page, "65", touch);
  await expect(page.getByRole("status")).toHaveText("이제 외통을 만드세요", {
    timeout: 10_000,
  });
});
