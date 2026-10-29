import { expect, type Page, test } from "@playwright/test";

/** 세 자리·1~9 수를 작은 것부터(테스트가 차례로 물을 때) */
const NUMBERS: string[] = [];
for (const a of "123456789")
  for (const b of "123456789")
    for (const c of "123456789")
      if (a !== b && b !== c && a !== c) NUMBERS.push(a + b + c);

const status = (page: Page) => page.getByRole("status").first();
const over = (page: Page) => page.getByRole("button", { name: "다시 하기" });
/** 내가 물은 줄들(자리 번호는 화면마다 다르니 data-guess가 있는 첫 기록 상자) */
const myRows = (page: Page) =>
  page.locator("section").filter({ hasText: "내 물음" }).locator("li");

/** 숫자 패드로 수를 넣고 단추를 누른다. 휴대폰은 눌러서, PC는 키보드로 */
async function enter(
  page: Page,
  value: string,
  button: string,
  touch: boolean,
) {
  if (touch) {
    for (const d of value)
      await page.getByRole("button", { name: d, exact: true }).click();
    await page.getByRole("button", { name: button }).click();
  } else {
    await page.keyboard.type(value);
    await expect(
      page.getByRole("img", { name: `넣은 수 ${value}` }),
    ).toBeVisible();
    await page.keyboard.press("Enter");
  }
}

/** 아직 묻지 않은 가장 작은 수를 묻는다 */
async function askNext(page: Page, touch: boolean): Promise<void> {
  const asked = new Set(
    await myRows(page).evaluateAll((rows) =>
      rows.map((r) => r.getAttribute("data-guess") ?? ""),
    ),
  );
  const before = asked.size;
  const guess = NUMBERS.find((n) => !asked.has(n)) as string;
  await enter(page, guess, "물어보기", touch);
  await expect(myRows(page)).toHaveCount(before + 1);
}

/** 내 할 일이 생기거나 게임이 끝날 때까지 기다렸다가, 묻기 차례면 하나 묻는다. 끝났으면 false */
async function playStep(page: Page, touch: boolean): Promise<boolean> {
  await expect(
    status(page).filter({
      hasText: /내 차례|마지막 기회|이겼|졌|비겼|이긴 사람/,
    }),
  ).toBeVisible({ timeout: 15_000 });
  if (await over(page).isVisible()) return false;
  const text = (await status(page).textContent()) ?? "";
  if (/이겼|졌|비겼|이긴 사람/.test(text)) {
    // 여러 판이면 다음 판. 한 판 게임이면 다시 하기가 보인다.
    await expect(over(page)).toBeVisible();
    return false;
  }
  await askNext(page, touch);
  return true;
}

/** IndexedDB 복기 기록에 남은 끝난 숫자야구 게임 수(omok.spec과 같은 방식) */
async function finishedBaseballGames(): Promise<number> {
  const names = await indexedDB.databases();
  if (!names.some((d) => d.name === "mighty-review")) return 0;
  return new Promise((resolve, reject) => {
    const open = indexedDB.open("mighty-review", 1);
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const db = open.result;
      if (!db.objectStoreNames.contains("games")) {
        db.close();
        resolve(0);
        return;
      }
      const all = db.transaction("games").objectStore("games").getAll();
      all.onerror = () => reject(all.error);
      all.onsuccess = () => {
        const games = all.result as { game: string; over: boolean }[];
        db.close();
        resolve(games.filter((g) => g.game === "baseball" && g.over).length);
      };
    };
  });
}

/** 옵션에서 컴퓨터 단계와 혼자 하기 방식을 고르고 → 나홀로 숫자야구 */
async function startSolo(page: Page, level = "입문", mode = "서로 맞히기") {
  await page.getByRole("button", { name: "옵션" }).click();
  await page.getByRole("button", { name: level, exact: true }).click();
  await page.getByRole("button", { name: mode, exact: true }).click();
  await page.getByRole("button", { name: "처음으로" }).click();
  await page.getByRole("button", { name: /나홀로 숫자야구/ }).click();
}

/** 비밀 수 정하기: 무작위를 눌러 정한다. 정한 수를 돌려준다 */
async function chooseRandomSecret(page: Page): Promise<string> {
  await expect(status(page)).toContainText("내 비밀 수를 정하세요");
  await page.getByRole("button", { name: "무작위" }).click();
  const label =
    (await page
      .getByRole("img", { name: /^넣은 수 \d{3}$/ })
      .getAttribute("aria-label")) ?? "";
  await page.getByRole("button", { name: "이 수로 정하기" }).click();
  return label.replace("넣은 수 ", "");
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    sessionStorage.setItem("mighty-splash-seen", "1");
    if (!sessionStorage.getItem("keep"))
      localStorage.removeItem("baseball-save");
  });
});

test("숫자야구: 게임 목록에서 들어가 입문 컴퓨터와 서로 맞히기 한 판을 끝까지 한다", async ({
  page,
}, info) => {
  const touch = info.project.name.startsWith("phone");
  await page.goto("/");
  await page
    .getByRole("link", { name: /숫자야구/ })
    .first()
    .click();
  await expect(page).toHaveURL(/\/baseball$/);
  await expect(page.getByRole("heading", { name: "숫자야구" })).toBeVisible();
  await page.screenshot({ path: info.outputPath("baseball-home.png") });
  await startSolo(page);

  await expect(page.getByRole("button", { name: "무작위" })).toBeVisible();
  await page.screenshot({ path: info.outputPath("baseball-setup.png") });
  const secret = await chooseRandomSecret(page);
  await expect(
    page.getByRole("img", { name: secret.split("").join(" ") }).first(),
  ).toBeVisible();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth,
  );
  expect(overflow).toBe(false);

  // 첫 물음과 컴퓨터 답을 보고 무르기로 되돌린다(선이 컴퓨터면 컴퓨터가 먼저 묻는다).
  await expect(status(page)).toContainText("내 차례", { timeout: 15_000 });
  await askNext(page, touch);
  await expect(status(page)).toContainText("내 차례", { timeout: 15_000 });
  await page.screenshot({ path: info.outputPath("baseball-play.png") });
  await page.getByRole("button", { name: "무르기" }).click();
  await expect(myRows(page)).toHaveCount(0);

  for (let i = 0; i < 60; i++) if (!(await playStep(page, touch))) break;
  await expect(over(page)).toBeVisible();
  await expect(status(page)).toHaveText(/이겼|졌|비겼|이긴 사람/);
  // 판 끝: 두 사람 비밀과 다시 계산한 결과
  await expect(page.locator("[data-reveal]")).toHaveCount(2);
  await expect(page.getByText("약속·답 모두 맞음 ✓")).toHaveCount(2);
  await page.screenshot({ path: info.outputPath("baseball-end.png") });

  // 다 끝난 게임은 이어하기에 남지 않는다.
  await over(page).click();
  await expect(
    page.getByRole("button", { name: /나홀로 숫자야구/ }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: /이어하기/ })).toHaveCount(0);
});

test("숫자야구 퍼즐: 컴퓨터 수만 맞히기", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop", "흐름은 화면 크기와 상관없다");
  await page.goto("/baseball");
  await startSolo(page, "입문", "컴퓨터 수만 맞히기");
  await expect(page.getByRole("button", { name: "무작위" })).toHaveCount(0);
  await expect(status(page)).toContainText("컴퓨터 수를 맞혀 보세요");
  // 후보 수 도움말을 보며 남은 후보 가운데 첫 수를 묻는다(앞 답을 화면에서 읽는다).
  for (let i = 0; i < 12; i++) {
    if (await over(page).isVisible()) break;
    const rows = await myRows(page).evaluateAll((els) =>
      els.map((el) => ({
        guess: el.getAttribute("data-guess") ?? "",
        text: el.textContent ?? "",
      })),
    );
    const clues = rows.map((r) => {
      const s = /(\d)S/.exec(r.text);
      const b = /(\d)B/.exec(r.text);
      return {
        guess: r.guess,
        s: s ? Number(s[1]) : 0,
        b: b ? Number(b[1]) : 0,
      };
    });
    const fits = (n: string) =>
      clues.every((c) => {
        let s = 0;
        let b = 0;
        for (let k = 0; k < 3; k++) {
          if (n[k] === c.guess[k]) s++;
          else if (n.includes(c.guess[k] as string)) b++;
        }
        return s === c.s && b === c.b;
      });
    const left = NUMBERS.filter(fits);
    await expect(page.locator("[data-candidates]")).toHaveAttribute(
      "data-candidates",
      String(left.length),
    );
    await enter(page, left[0] as string, "물어보기", false);
    await expect(
      status(page).filter({ hasText: /내 차례|맞혔어요/ }),
    ).toBeVisible({ timeout: 10_000 });
  }
  await expect(status(page)).toContainText("번 만에 맞혔어요!");
  await expect(page.locator('[data-result-banner="win"]')).toBeVisible();
  await page.screenshot({ path: info.outputPath("baseball-puzzle.png") });
});

test("숫자야구: 하던 게임은 새로고침해도 이어 하고, 내 비밀 수도 그대로다", async ({
  page,
}, info) => {
  test.skip(info.project.name !== "desktop", "저장은 화면 크기와 상관없다");
  await page.goto("/baseball");
  await startSolo(page);
  const secret = await chooseRandomSecret(page);
  await expect(status(page)).toContainText("내 차례", { timeout: 15_000 });
  await askNext(page, false);
  await expect(status(page)).toContainText("내 차례", { timeout: 15_000 });
  await page.evaluate(() => sessionStorage.setItem("keep", "1"));
  await page.goto("/baseball?keep");
  await page.getByRole("button", { name: /이어하기/ }).click();
  await expect(myRows(page)).toHaveCount(1);
  await expect(
    page.getByRole("img", { name: secret.split("").join(" ") }).first(),
  ).toBeVisible();
  // 이어서 컴퓨터 물음에도 자동으로 답한다.
  await askNext(page, false);
  await expect(status(page)).toContainText(/내 차례|이겼|졌|비겼/, {
    timeout: 15_000,
  });
});

test("숫자야구: 방장이 방을 만들고 친구가 링크로 들어와 한 판을 하고 판 끝 검증을 통과한다", async ({
  context,
}, info) => {
  test.skip(info.project.name !== "desktop", "데스크톱에서만 돌린다");
  const host = await context.newPage();
  const guest = await context.newPage();
  const errors: string[] = [];
  for (const p of [host, guest])
    p.on("pageerror", (e) => errors.push(e.message));

  await host.goto("/baseball?net=local");
  await host.getByRole("button", { name: /다함께 숫자야구/ }).click();
  await host.getByPlaceholder("친구에게 보일 이름").fill("방장");
  await host.getByRole("button", { name: "방 만들기", exact: true }).click();
  const link = await host.locator("input[readonly]").inputValue();
  expect(link).toContain("/baseball");

  await guest.goto(link);
  await guest.getByPlaceholder("친구에게 보일 이름").fill("철수");
  await guest.getByRole("button", { name: "들어가기" }).click();
  await expect(guest.getByText("방장이 시작하기를 기다리는 중")).toBeVisible();
  await expect(host.getByText("철수")).toBeVisible();
  await host.getByRole("button", { name: "시작하기" }).click();

  await chooseRandomSecret(host);
  const guestSecret = await chooseRandomSecret(guest);
  await guest.screenshot({
    path: info.outputPath("baseball-online-guest-start.png"),
  });

  for (let i = 0; i < 400; i++) {
    if ((await over(host).isVisible()) && (await over(guest).isVisible()))
      break;
    // 판 끝 전에는 방장 화면에 공개 결과가 없다(참가자 비밀이 보이지 않는다).
    if (!(await over(host).isVisible()))
      expect(await host.locator("[data-reveal]").count()).toBe(0);
    for (const p of [host, guest]) {
      const text = (await status(p).textContent()) ?? "";
      if (/내 차례|마지막 기회/.test(text) && !(await over(p).isVisible()))
        await askNext(p, false);
    }
    await host.waitForTimeout(50);
  }
  await expect(over(host)).toBeVisible();
  await expect(over(guest)).toBeVisible();
  // 판 끝: 방장 화면에 참가자 비밀이 처음 보이고, 참가자가 정한 그 수다.
  const guestSeatReveal = host.locator("[data-reveal]").nth(1);
  await expect(guestSeatReveal).toContainText("약속·답 모두 맞음");
  await expect(
    guestSeatReveal.getByRole("img", { name: guestSecret.split("").join(" ") }),
  ).toBeVisible();
  await host.screenshot({
    path: info.outputPath("baseball-online-host-end.png"),
  });

  // 방장이 나가면 기록이 공개되고, 참가자가 처음부터 다시 계산해 확인한다.
  await host.getByRole("button", { name: "← 숫자야구" }).click();
  await expect(guest.getByText(/검증.*문제없음/)).toBeVisible({
    timeout: 15_000,
  });
  await guest.screenshot({
    path: info.outputPath("baseball-online-guest-end.png"),
  });
  expect(errors).toEqual([]);
});

test("숫자야구: 끝낸 판은 내 기록에 쌓이고 복기에서 한 걸음씩 다시 본다", async ({
  page,
}, info) => {
  test.skip(info.project.name !== "desktop", "기록은 화면 크기와 상관없다");
  await page.goto("/baseball");
  await startSolo(page);
  await chooseRandomSecret(page);
  await expect(status(page)).toContainText("내 차례", { timeout: 15_000 });
  await askNext(page, false);
  await expect(status(page)).toContainText("내 차례", { timeout: 15_000 });
  await page.getByRole("button", { name: "기권" }).click();
  await expect(status(page)).toHaveText("기권했어요");
  await expect.poll(() => page.evaluate(finishedBaseballGames)).toBe(1);

  await page.goto("/profile?game=baseball");
  await expect(page.getByRole("tab", { name: "⚾ 숫자야구" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await expect(page.getByText("0승 1패 0무")).toBeVisible();

  await page.goto("/review");
  await page.getByRole("button", { name: /⚾ 숫자야구 · 혼자/ }).click();
  const rows = page.locator("li[data-guess]");
  // 끝난 장면부터 보인다. 처음으로 가면 물은 수가 없다.
  await expect(rows.first()).toBeVisible();
  await page.getByRole("button", { name: "처음" }).click();
  await expect(rows).toHaveCount(0);
  for (let i = 0; i < 6 && (await rows.count()) === 0; i++)
    await page.getByRole("button", { name: "한 수 앞으로" }).click();
  await expect(rows.first()).toBeVisible();
  await expect(
    page.getByText(/번째 물음/).or(page.getByText(/답: /)),
  ).toBeVisible();
  await page.screenshot({ path: info.outputPath("baseball-review.png") });
});

test("숫자야구 배우기: 단원을 끝내고, 미션은 틀리면 다시 한다", async ({
  page,
}, info) => {
  const touch = info.project.name.startsWith("phone");
  await page.goto("/baseball");
  await page.getByRole("button", { name: /숫자야구 배우기/ }).click();
  await expect(page.getByText("0/5")).toBeVisible();

  // 1단원: 설명 둘 → 퀴즈 → 하나 남은 수 미션
  await page.getByRole("button", { name: /숫자야구는 어떤 게임/ }).click();
  for (let i = 0; i < 2; i++)
    await page.getByRole("button", { name: "다음", exact: true }).click();
  await page.getByRole("button", { name: "1S 2B" }).click();
  await expect(page.getByText("정답이에요!")).toBeVisible();
  await page.getByRole("button", { name: "다음", exact: true }).click();
  await page.getByRole("button", { name: "미션 시작" }).click();
  await expect(myRows(page)).toHaveCount(4);
  await page.screenshot({ path: info.outputPath("baseball-mission.png") });
  await enter(page, "573", "물어보기", touch);
  await expect(page.getByRole("dialog", { name: "미션 성공" })).toBeVisible({
    timeout: 10_000,
  });
  await page.getByRole("button", { name: "다음", exact: true }).click();
  await expect(page.getByText("단원 완료!")).toBeVisible();
  await page.getByRole("button", { name: "단원 목록으로" }).click();
  await expect(page.getByText("1/5")).toBeVisible();

  // 2단원: 자리를 틀리면 실패, 다시 해서 맞히면 성공
  await page.getByRole("button", { name: /아웃으로 숫자 지우기/ }).click();
  await page.getByRole("button", { name: "다음", exact: true }).click();
  await page.getByRole("button", { name: "1·5·9" }).click();
  await page.getByRole("button", { name: "다음", exact: true }).click();
  await page.getByRole("button", { name: "미션 시작" }).click();
  await enter(page, "195", "물어보기", touch);
  await expect(page.getByRole("dialog", { name: "미션 실패" })).toBeVisible({
    timeout: 10_000,
  });
  await page.getByRole("button", { name: "다시 하기" }).click();
  await expect(myRows(page)).toHaveCount(4);
  await enter(page, "915", "물어보기", touch);
  await expect(page.getByRole("dialog", { name: "미션 성공" })).toBeVisible({
    timeout: 10_000,
  });

  // 튜토리얼 대국은 이어하기에 남지 않는다.
  await page.goto("/baseball");
  await expect(page.getByText("1/5 단원 마침")).toBeVisible();
  await expect(page.getByRole("button", { name: /이어하기/ })).toHaveCount(0);
});
