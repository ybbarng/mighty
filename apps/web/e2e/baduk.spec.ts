import { useTestSpeed } from "./fast";
import { expect, type Page, test } from "./test";

/** 9줄 판과 가장자리 여백(BadukBoard의 BADUK_PAD) */
const SIZE = 9;
const PAD = 1;
const VIEW = SIZE - 1 + PAD * 2;
const COLUMNS = "ABCDEFGHJ";

const board = (page: Page) => page.getByRole("img", { name: /바둑판/ });
const stones = (page: Page) => page.locator("[data-stone]");

/** 자리 이름("E5")을 누른다. 손가락은 한 번 겨누고 다시 눌러 둔다 */
async function placeAt(page: Page, name: string, touch: boolean) {
  const box = await board(page).boundingBox();
  if (!box) throw new Error("판이 안 보인다");
  const unit = box.width / VIEW;
  const x = COLUMNS.indexOf(name[0] as string);
  const y = SIZE - Number(name.slice(1));
  const px = box.x + (x + PAD) * unit;
  const py = box.y + (y + PAD) * unit;
  if (touch) {
    await page.touchscreen.tap(px, py);
    await expect(page.getByRole("status")).toContainText(
      `${name}: 한 번 더 누르면 둔다`,
    );
    await page.touchscreen.tap(px, py);
  } else await page.mouse.click(px, py);
}

/** 빈 자리 하나에 내 돌을 둔다 */
async function playOne(page: Page, touch: boolean, stone = "black") {
  for (const name of ["E5", "C3", "G7", "C7", "G3", "E3", "E7", "C5", "G5"]) {
    if ((await page.locator(`[data-point="${name}"]`).count()) > 0) continue;
    await placeAt(page, name, touch);
    await expect(
      page.locator(`[data-point="${name}"][data-stone="${stone}"]`),
    ).toHaveCount(1);
    return name;
  }
  throw new Error("둘 곳이 없다");
}

/** 첫 화면 → 옵션에서 9줄·컴퓨터(고르면)·흑을 고르고 → 나홀로 바둑 */
async function startSolo(page: Page, level?: string) {
  await page.getByRole("button", { name: "옵션" }).click();
  // 기본은 19줄이다. 시험은 짧게 9줄로 둔다.
  await page.getByRole("button", { name: "9줄", exact: true }).click();
  if (level) await page.getByRole("button", { name: level }).click();
  await page.getByRole("button", { name: "흑(먼저)" }).click();
  await page.getByRole("button", { name: "처음으로" }).click();
  await page.getByRole("button", { name: /나홀로 바둑/ }).click();
}

test.beforeEach(async ({ page, context }) => {
  await useTestSpeed(context);
  await page.addInitScript(() => {
    sessionStorage.setItem("mighty-splash-seen", "1");
  });
});

test("바둑: 게임 목록에서 들어가 두고, 새로고침 뒤 이어 두고, 무르고 기권한다", async ({
  page,
}, info) => {
  const touch = info.project.name.startsWith("phone");
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await page.getByRole("link", { name: /바둑/ }).first().click();
  await expect(page).toHaveURL(/\/baduk$/);
  await expect(page.getByRole("heading", { name: "바둑" })).toBeVisible();
  await page.screenshot({ path: info.outputPath("baduk-home.png") });
  await startSolo(page, "입문");

  await expect(page.getByRole("status")).toContainText("내 차례");
  await expect(stones(page)).toHaveCount(0);
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth,
  );
  expect(overflow).toBe(false);
  await page.screenshot({ path: info.outputPath("baduk-start.png") });

  // 한 수 두면 컴퓨터가 답하고 다시 내 차례.
  await playOne(page, touch);
  await expect(page.getByRole("status")).toContainText("내 차례", {
    timeout: 15_000,
  });
  await expect(stones(page)).toHaveCount(2);

  // 새로고침해도 이어 둘 수 있다.
  await page.reload();
  await page.getByRole("button", { name: /이어하기/ }).click();
  await expect(stones(page)).toHaveCount(2);
  await expect(page.getByRole("status")).toContainText("내 차례");

  await playOne(page, touch);
  await expect(page.getByRole("status")).toContainText("내 차례", {
    timeout: 15_000,
  });
  await expect(stones(page)).toHaveCount(4);
  await page.getByRole("button", { name: "세어 보기" }).click();
  await expect(page.getByText(/지금 세면 흑/)).toBeVisible();
  await page.screenshot({ path: info.outputPath("baduk-play.png") });
  await page.getByRole("button", { name: "세어 보기" }).click();

  await page.getByRole("button", { name: "무르기" }).click();
  await expect(stones(page)).toHaveCount(2);
  await expect(page.getByRole("status")).toContainText("내 차례");

  await page.getByRole("button", { name: "기권" }).click();
  await expect(page.getByRole("status")).toHaveText("기권했어요");
  await expect(page.locator('[data-result-banner="lose"]')).toBeVisible();
  await page.screenshot({ path: info.outputPath("baduk-end.png") });

  // 다 끝난 게임은 이어하기에 남지 않는다.
  await page.getByRole("button", { name: "다시 하기" }).click();
  await expect(page.getByRole("button", { name: /나홀로 바둑/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /이어하기/ })).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("바둑: 둘이 이어 쉬면 판 위 그대로 세어 끝난다", async ({
  page,
}, info) => {
  test.skip(info.project.name !== "desktop", "세기는 화면 크기와 상관없다");
  await page.goto("/baduk");
  await startSolo(page);
  await playOne(page, false);
  await expect(page.getByRole("status")).toContainText("내 차례", {
    timeout: 15_000,
  });
  // 컴퓨터가 쉬면 따라 쉬고, 아니면 내가 먼저 쉰다. 어느 쪽이든 결국 둘이 이어 쉰다.
  const over = page.getByRole("button", { name: "다시 하기" });
  const pass = page.getByRole("button", { name: "쉬기" });
  for (let i = 0; i < 80; i++) {
    // 판이 끝났거나 내 차례가 올 때까지 기다린다.
    await expect(over.or(pass)).toBeVisible({ timeout: 15_000 });
    if (await over.isVisible()) break;
    await pass.click();
    await expect(pass).toBeHidden();
  }
  await expect(page.getByRole("status")).toContainText("세어 보니");
  await expect(page.getByText(/흑 \d+ : 백 [\d.]+/).first()).toBeVisible();
  await page.screenshot({ path: info.outputPath("baduk-count.png") });
});

test("바둑 배우기: 첫 단원 미션을 틀렸다가 다시 해서 백 한 점을 따낸다", async ({
  page,
}, info) => {
  const touch = info.project.name.startsWith("phone");
  await page.goto("/baduk");
  await page.getByRole("button", { name: /바둑 배우기/ }).click();
  await expect(page.getByText("0/7")).toBeVisible();
  await page.getByRole("button", { name: /바둑은 어떤 게임/ }).click();
  await page.getByRole("button", { name: "다음", exact: true }).click();
  // 둘째 설명(활로와 따내기)에는 판 그림이 있다.
  await expect(board(page)).toBeVisible();
  await page.getByRole("button", { name: "다음", exact: true }).click();
  await page
    .getByRole("button", { name: "그 돌의 활로를 모두 막았을 때" })
    .click();
  await page.getByRole("button", { name: "다음", exact: true }).click();
  await page.getByRole("button", { name: "미션 시작" }).click();
  await expect(stones(page)).toHaveCount(4);
  await placeAt(page, "A1", touch);
  await expect(page.getByRole("dialog", { name: "미션 실패" })).toBeVisible({
    timeout: 10_000,
  });
  await page.getByRole("button", { name: "다시 하기" }).click();
  await expect(stones(page)).toHaveCount(4);
  await page.screenshot({ path: info.outputPath("baduk-mission.png") });
  await placeAt(page, "E4", touch);
  await expect(page.getByRole("dialog", { name: "미션 성공" })).toBeVisible({
    timeout: 10_000,
  });
  await page.getByRole("button", { name: "다음", exact: true }).click();
  await expect(page.getByText("단원 완료!")).toBeVisible();
});

test("바둑: 방장이 방을 만들고 친구가 링크로 들어와 두고, 둘이 쉬어 세고, 판 끝 검증을 통과한다", async ({
  context,
}, info) => {
  test.skip(info.project.name !== "desktop", "데스크톱에서만 돌린다");
  const host = await context.newPage();
  const guest = await context.newPage();
  const errors: string[] = [];
  for (const p of [host, guest])
    p.on("pageerror", (e) => errors.push(e.message));

  await host.goto("/baduk?net=local");
  await host.getByRole("button", { name: "옵션" }).click();
  await host.getByRole("button", { name: "9줄", exact: true }).click();
  await host.getByRole("button", { name: "처음으로" }).click();
  await host.getByRole("button", { name: /다함께 바둑/ }).click();
  await host.getByPlaceholder("친구에게 보일 이름").fill("방장");
  await host.getByRole("button", { name: "방 만들기", exact: true }).click();
  const link = await host.locator("input[readonly]").inputValue();
  expect(link).toContain("/baduk");

  await guest.goto(link);
  await guest.getByPlaceholder("친구에게 보일 이름").fill("철수");
  await guest.getByRole("button", { name: "들어가기" }).click();
  await expect(host.getByText("철수")).toBeVisible();
  await host.getByRole("button", { name: "시작하기" }).click();
  await expect(board(guest)).toBeVisible();
  await expect(board(host)).toBeVisible();

  const black = (await host.getByText("나는 흑").count()) > 0 ? host : guest;
  const white = black === host ? guest : host;
  await expect(black.getByRole("status")).toContainText("내 차례", {
    timeout: 15_000,
  });
  await playOne(black, false);
  await expect(white.getByRole("status")).toContainText("내 차례", {
    timeout: 15_000,
  });
  await expect(white.locator('[data-point="E5"]')).toHaveCount(1);
  // 백이 쉬고 흑도 쉬면 판 위 그대로 센다: 흑 81 : 백 7.5
  await white.getByRole("button", { name: "쉬기" }).click();
  await expect(black.getByRole("status")).toContainText("상대가 쉬었어요", {
    timeout: 15_000,
  });
  await black.getByRole("button", { name: "쉬기" }).click();
  await expect(black.getByRole("status")).toHaveText("세어 보니 이겼어요!");
  await expect(white.getByRole("status")).toHaveText("세어 보니 졌어요", {
    timeout: 15_000,
  });
  await expect(white.getByText("흑 81 : 백 7.5").first()).toBeVisible();
  await white.screenshot({ path: info.outputPath("baduk-online.png") });

  // 방장이 나가면 기록이 공개되고, 참가자가 처음부터 다시 둬 보며 확인한다.
  await host.getByRole("button", { name: "← 바둑" }).click();
  await expect(guest.getByText(/검증.*문제없음/)).toBeVisible({
    timeout: 10_000,
  });
  expect(errors).toEqual([]);
});

test("바둑: 끝낸 판은 내 기록에 쌓이고 복기에서 한 수씩 다시 본다", async ({
  page,
}, info) => {
  test.skip(info.project.name !== "desktop", "기록은 화면 크기와 상관없다");
  await page.goto("/baduk");
  await startSolo(page);
  await playOne(page, false);
  await expect(page.getByRole("status")).toContainText("내 차례", {
    timeout: 15_000,
  });
  await page.getByRole("button", { name: "기권" }).click();
  await expect(page.getByRole("status")).toHaveText("기권했어요");
  // 복기 기록이 실제로 쓰인 뒤에 떠난다.
  await page.waitForFunction(
    () =>
      new Promise<boolean>((resolve) => {
        const open = indexedDB.open("mighty-review", 1);
        open.onsuccess = () => {
          const db = open.result;
          if (!db.objectStoreNames.contains("games")) {
            db.close();
            resolve(false);
            return;
          }
          const all = db.transaction("games").objectStore("games").getAll();
          all.onsuccess = () => {
            db.close();
            resolve(
              (all.result as { game: string; over: boolean }[]).some(
                (g) => g.game === "baduk" && g.over,
              ),
            );
          };
        };
        open.onerror = () => resolve(false);
      }),
  );

  await page.goto("/profile?game=baduk");
  await expect(page.getByRole("tab", { name: "⚫ 바둑" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await expect(page.getByText("0승 1패")).toBeVisible();

  await page.goto("/review");
  await page.getByRole("button", { name: /⚫ 바둑 · 혼자/ }).click();
  await page.getByRole("button", { name: "처음" }).click();
  await expect(stones(page)).toHaveCount(0);
  await expect(page.getByText(/다음 수: /)).toBeVisible({ timeout: 15_000 });
  await page.getByRole("button", { name: "한 수 앞으로" }).click();
  await expect(stones(page)).toHaveCount(1);
  await page.screenshot({ path: info.outputPath("baduk-review.png") });
});

test("바둑 개인 시간: 시계가 가고, 다 쓰면 시간패다", async ({
  page,
}, info) => {
  test.skip(info.project.name !== "desktop", "시계는 화면 크기와 상관없다");
  await page.clock.install();
  await page.goto("/baduk");
  await page.getByRole("button", { name: "옵션" }).click();
  await page.getByRole("button", { name: "빠른 3분" }).click();
  await page.getByRole("button", { name: "흑(먼저)" }).click();
  await page.getByRole("button", { name: "처음으로" }).click();
  await page.getByRole("button", { name: /나홀로 바둑/ }).click();
  await expect(page.locator("[data-clock]").first()).toHaveText("3:00");
  await page.clock.runFor(270_001);
  await expect(page.getByRole("status")).toHaveText("시간이 다 돼 졌어요");
  await page.screenshot({ path: info.outputPath("baduk-time.png") });
});

test("바둑 수 배우기: 단수 방향을 틀렸다 다시 풀고, 축으로 몰아 따내고, 급소로 잡는다", async ({
  page,
}, info) => {
  const touch = info.project.name.startsWith("phone");
  await page.goto("/baduk");
  await page.getByRole("button", { name: /바둑 배우기/ }).click();
  await page.getByRole("button", { name: /수 배우기/ }).click();
  const atari = page.getByRole("region", { name: "단수 방향" });
  await expect(atari.getByText("0/8")).toBeVisible();
  await atari.getByRole("button", { name: "풀기 시작" }).click();
  await expect(page.getByRole("status")).toHaveText("△ 백 돌을 따내세요");

  // G1에서 단수 치면 백이 F2로 뻗어 달아난다.
  await placeAt(page, "G1", touch);
  await expect(page.getByRole("status")).toHaveText("그 수로는 못 따내요");
  await page.getByRole("button", { name: "다시 하기" }).click();

  // 정답: F2에서 단수 → 백이 받고(달아날 곳이 없어 쉰다) → 따낸다.
  await placeAt(page, "F2", touch);
  await expect(page.getByRole("status")).toHaveText("계속 몰아 따내세요", {
    timeout: 10_000,
  });
  await placeAt(page, "G1", touch);
  await expect(page.getByRole("status")).toHaveText("따냈어요!");
  await expect(page.getByText(/수 만에 백 돌/)).toBeVisible();
  await page.screenshot({ path: info.outputPath("baduk-atari.png") });
  await page.getByRole("button", { name: "← 목록" }).click();
  await expect(atari.getByText("1/8")).toBeVisible();

  // 축: 계속 단수로 몰아 따낸다(백은 늘 같은 수로 버틴다).
  await page
    .getByRole("region", { name: "축" })
    .getByRole("button", { name: "풀기 시작" })
    .click();
  for (const name of ["C3", "C6", "B6", "A6"]) {
    await placeAt(page, name, touch);
    await expect(page.getByRole("status")).toHaveText("계속 몰아 따내세요", {
      timeout: 10_000,
    });
  }
  await placeAt(page, "A3", touch);
  await expect(page.getByRole("status")).toHaveText("따냈어요!");
  await page.screenshot({ path: info.outputPath("baduk-ladder.png") });
  await page.getByRole("button", { name: "← 목록" }).click();

  // 눈 빼앗기: 귀의 곧은 세 집은 가운데가 급소다.
  await page
    .getByRole("region", { name: "눈 빼앗기" })
    .getByRole("button", { name: "풀기 시작" })
    .click();
  await expect(page.getByRole("status")).toHaveText("△ 백 무리를 잡으세요");
  await placeAt(page, "A8", touch);
  await expect(page.getByRole("status")).toHaveText("잡았어요!");
  await expect(page.getByText(/급소/)).toBeVisible();
  await page.screenshot({ path: info.outputPath("baduk-kill.png") });
});
