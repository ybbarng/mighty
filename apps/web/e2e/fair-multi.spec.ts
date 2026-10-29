import { TEST_SPEED } from "./fast";
import { type BrowserContext, expect, type Page, ready, test } from "./test";

/**
 * 멘탈 포커 여럿이 하기: 브라우저 탭 n개(방장 1 + 참가자 n−1)를 BroadcastChannel로 잇고(?net=local)
 * 모든 자리를 사람으로 채워 판을 끝까지 둔다. 사람이 많을수록 섞기 사슬이 길어 가장 느린 경우다.
 * 섞는 시간, 판 시간, 오류, 부정 감지 표시를 잰다. 오래 걸려 기본으로는 돌리지 않는다(FAIR_MULTI=1).
 */
test.skip(!process.env.FAIR_MULTI, "FAIR_MULTI=1 일 때만 돌린다");
// 서비스 워커가 캐시에서 파일을 주면 고친 프로그램을 내려보낼 수 없다.
test.use({ serviceWorkers: "block" });

async function prepare(page: Page) {
  await page.addInitScript((speed) => {
    (globalThis as { __FAIR_DEBUG?: boolean }).__FAIR_DEBUG = true;
    sessionStorage.setItem("mighty-splash-seen", "1");
    localStorage.setItem(
      "mighty-settings",
      JSON.stringify({ state: { speed, sound: false }, version: 0 }),
    );
    // 섞는 중(섞는 애니메이션)이 보인 시간을 잰다.
    const w = window as unknown as {
      __shuffles: number[];
      __since: number | null;
    };
    w.__shuffles = [];
    w.__since = null;
    new MutationObserver(() => {
      const on = document.querySelector("[data-shuffling]") !== null;
      if (on && w.__since === null) w.__since = performance.now();
      if (!on && w.__since !== null) {
        w.__shuffles.push(performance.now() - w.__since);
        w.__since = null;
      }
    }).observe(document, {
      subtree: true,
      childList: true,
      characterData: true,
    });
  }, TEST_SPEED);
}

/** 화면에 맞는 행동 하나(자바스크립트로 단추를 누른다). 판이 끝났으면 "end" */
function stepScript(bidder: boolean): string {
  const visible = (el: Element | null | undefined): el is HTMLElement =>
    !!el && (el as HTMLElement).offsetParent !== null;
  const buttons = [...document.querySelectorAll("button")].filter(
    (b) => visible(b) && !b.disabled,
  );
  const byText = (re: RegExp) =>
    buttons.find((b) => re.test((b.textContent ?? "").trim()));
  const text = document.body.innerText;
  const click = (el: HTMLElement | undefined, what: string) => {
    if (!el) return "";
    // 손패 카드는 손을 뗄 때(pointerup) 낸다. 단추는 click으로 누른다.
    if (el.hasAttribute("data-card"))
      el.dispatchEvent(
        new PointerEvent("pointerup", { bubbles: true, pointerType: "mouse" }),
      );
    else el.click();
    return what;
  };
  if (/부정 감지 —/.test(text)) return "incident";
  // 하트: 넘길 카드 세 장을 고르고 넘긴다.
  const passButton = [...document.querySelectorAll("button")].find(
    (b) => visible(b) && (b.textContent ?? "").trim() === "넘기기",
  );
  if (passButton) {
    if (!passButton.disabled) return click(passButton, "pass3");
    const card = buttons.find(
      (b) =>
        b.hasAttribute("data-card") &&
        !b.className.includes("0_0_0_3px") &&
        !b.className.includes("brightness"),
    );
    return click(card, "passPick");
  }
  // 2마: 보이는 카드와 안 보이는 카드 중 하나
  if (text.includes("한 장을 고르세요"))
    return click(byText(/안 보이는 카드/), "pick");
  const next = byText(/^다음 판$/);
  if (next) return click(next, "next");
  if (text.includes("이번 판에서 뺄 사람")) {
    const rank = buttons.find((b) =>
      /^(A|K|Q|J|10|[2-9])$/.test((b.textContent ?? "").trim()),
    );
    if (rank) rank.click();
    return click(byText(/지목$/), "kill");
  }
  if (text.includes("당선을 축하합니다")) {
    // 버릴 카드를 다 골랐는가(2마 1장, 그 밖 3장): "(3/3)", "(1/1)"
    if (!/\((\d)\/\1\)/.test(text)) {
      const card = buttons.find(
        (b) =>
          /^[♠♥◆♣]|조커/.test(b.getAttribute("aria-label") ?? "") &&
          !b.className.includes("0_0_0_3px"),
      );
      return click(card, "discard");
    }
    return click(byText(/로 확정$/), "exchange");
  }
  if (text.includes("프렌드를 정하세요"))
    return click(byText(/^확정$/), "friend");
  if (text.includes("조커로 부를 무늬를 고르세요"))
    return click(
      document.querySelector<HTMLElement>("button[title='스페이드']") ??
        undefined,
      "jokerSuit",
    );
  const plain = byText(/^(그냥 내기|쪼콜 아님)$/);
  if (plain) return click(plain, "noCall");
  // 모두 포기하면 다시 나누기만 되풀이하므로 한 사람(방장 탭)은 출마한다.
  const run = byText(/^출마/);
  if (bidder && run) return click(run, "bid");
  const pass = byText(/^포기$/);
  if (pass) return click(pass, "pass");
  if (run) return click(run, "bid");
  const card = buttons.find(
    (b) =>
      /^[♠♥◆♣]|조커/.test(b.getAttribute("aria-label") ?? "") &&
      !b.className.includes("brightness"),
  );
  return click(card, "play");
}

async function step(page: Page, bidder: boolean): Promise<string> {
  return page.evaluate(`(${stepScript.toString()})(${bidder})`);
}

async function openTable(
  context: BrowserContext,
  players: number,
  preset: string | null,
  /** 탭을 열기 전에(고친 프로그램 내려보내기 등) */
  before?: (index: number, page: Page) => Promise<void>,
  /** 방장 주소에 덧붙일 것(`&voteDelay=` 등) */
  query = "",
) {
  const pages: Page[] = [];
  const errors: string[] = [];
  const fairLog: string[] = [];
  for (let i = 0; i < players; i++) {
    const p = await context.newPage();
    p.on("pageerror", (e) => errors.push(`${i}: ${e.message}`));
    p.on("console", (m) => {
      if (i === 0 && m.text().startsWith("[fair]")) fairLog.push(m.text());
      if (m.type() === "error" || m.text().includes("멘탈 포커"))
        errors.push(`${i}: ${m.text()}`);
    });
    await prepare(p);
    await before?.(i, p);
    pages.push(p);
  }
  const host = pages[0] as Page;
  if (preset === null) {
    // 하트
    await host.goto(`/hearts?net=local${query}`);
    await host.getByRole("button", { name: /다함께 하트/ }).click();
  } else {
    await host.goto(`/mighty?net=local${query}`);
    await ready(host);
    await host.getByRole("button", { name: "옵션", exact: true }).click();
    await host.getByRole("button", { name: preset, exact: true }).click();
    await host.getByRole("button", { name: "처음으로" }).click();
    await host.getByRole("button", { name: /다함께 마이티/ }).click();
  }
  await host.getByPlaceholder("친구들에게 보일 이름").fill("방장");
  await host.getByRole("button", { name: "방 만들기", exact: true }).click();
  const link = await host.locator("input[readonly]").inputValue();
  await expect(host.getByText(/멘탈 포커/).first()).toBeVisible();
  for (let i = 1; i < players; i++) {
    const guest = pages[i] as Page;
    await guest.goto(link);
    await guest.getByPlaceholder("친구들에게 보일 이름").fill(`손님${i}`);
    await guest.getByRole("button", { name: "들어가기" }).click();
    await expect(host.getByText(`손님${i}`)).toBeVisible();
  }
  return { pages, host, errors, fairLog };
}

for (const [preset, players] of [
  ["표준 2마", 2],
  ["표준 5마", 5],
  ["표준 6마", 6],
  [null, 4],
] as const) {
  test(`${preset ?? "하트"}: 사람 ${players}명이 멘탈 포커로 한 판을 끝까지 둔다`, async ({
    context,
  }, info) => {
    test.skip(info.project.name !== "desktop", "데스크톱에서만 돌린다");
    test.setTimeout(30 * 60_000);
    const { pages, host, errors, fairLog } = await openTable(
      context,
      players,
      preset,
    );
    const started = Date.now();
    await host.getByRole("button", { name: "시작하기" }).click();
    for (const p of pages)
      await expect(p.getByRole("button", { name: "점수판" })).toBeVisible({
        timeout: 60_000,
      });
    const rounds: number[] = [];
    let roundStart = Date.now();
    const counts: Record<string, number> = {};
    let shot = 0;
    let lastAction = Date.now();
    let lastSig = "";
    let shuffleShot = false;
    let lastChange = Date.now();
    for (let i = 0; i < 20_000 && rounds.length < 1; i++) {
      let ended = false;
      const texts = await Promise.all(
        pages.map((p) => p.evaluate(() => document.body.innerText)),
      );
      // 섞는 애니메이션(실제로 섞는 동안)을 한 번 찍는다.
      if (
        !shuffleShot &&
        (await pages[1]?.locator('[data-shuffling="deal"]').count()) === 1
      ) {
        shuffleShot = true;
        await pages[1]?.screenshot({ path: info.outputPath("shuffling.png") });
      }
      const sig = texts.join("|");
      if (sig !== lastSig) {
        lastSig = sig;
        lastChange = Date.now();
      }
      if (Date.now() - lastChange > 30_000) {
        for (const [k, p] of pages.entries()) {
          await p.screenshot({ path: info.outputPath(`stuck-${k}.png`) });
          console.log(`--- ${k}번 탭 ---\n${texts[k]?.slice(0, 1500)}`);
        }
        throw new Error(
          `30초 동안 화면이 그대로다: ${JSON.stringify(counts)} 오류 ${JSON.stringify(errors.slice(-10))}\n${fairLog.slice(-12).join("\n")}`,
        );
      }
      if (Date.now() - lastAction > 60_000) {
        for (const [k, p] of pages.entries())
          await p.screenshot({ path: info.outputPath(`stall-${k}.png`) });
        throw new Error(
          `60초 동안 아무도 행동하지 않았다: ${JSON.stringify(counts)}`,
        );
      }
      for (const [k, p] of pages.entries()) {
        const did = await step(p, k === 0);
        if (did) {
          counts[did] = (counts[did] ?? 0) + 1;
          lastAction = Date.now();
        }
        if (did === "incident") {
          await p.screenshot({ path: info.outputPath(`incident-${k}.png`) });
          throw new Error(`부정 감지가 떴다(${k}번 탭)`);
        }
        if (did === "next" && k === 0) ended = true;
      }
      if (ended) {
        rounds.push(Date.now() - roundStart);
        roundStart = Date.now();
        await host.screenshot({
          path: info.outputPath(`round-${rounds.length}.png`),
        });
      }
      if (
        shot < 2 &&
        (await pages[1]?.getByText(/턴 · 남은 점수/).isVisible())
      ) {
        await pages[1]?.screenshot({
          path: info.outputPath(`guest-trick-${shot}.png`),
        });
        shot++;
      }
      if (i % 300 === 0)
        console.log(
          `#${i} ${Math.round((Date.now() - started) / 1000)}초 ${JSON.stringify(counts)}`,
        );
      await host.waitForTimeout(40);
    }
    const shuffles = await Promise.all(
      pages.map((p) =>
        p.evaluate(
          () => (window as unknown as { __shuffles: number[] }).__shuffles,
        ),
      ),
    );
    const memory = await Promise.all(
      pages.map((p) =>
        p.evaluate(
          () =>
            (performance as unknown as { memory?: { usedJSHeapSize: number } })
              .memory?.usedJSHeapSize ?? 0,
        ),
      ),
    );
    const report = {
      preset: preset ?? "하트",
      players,
      totalSec: Math.round((Date.now() - started) / 1000),
      roundsSec: rounds.map((r) => Math.round(r / 1000)),
      shufflesMs: shuffles.map((s) => s.map(Math.round)),
      heapMB: memory.map((m) => Math.round(m / 1e6)),
      actions: counts,
      errors,
    };
    await info.attach("report", {
      body: JSON.stringify(report, null, 2),
      contentType: "application/json",
    });
    console.log(JSON.stringify(report));
    expect(rounds.length).toBe(1);
    expect(errors).toEqual([]);
  });
}

test("고친 프로그램: 다른 카드라고 속여 내면 방장 화면에 그 자리가 찍히고 판이 멈춘다", async ({
  context,
}, info) => {
  test.skip(info.project.name !== "desktop", "데스크톱에서만 돌린다");
  test.setTimeout(5 * 60_000);
  // 1번 참가자 탭에만 고친 프로그램을 내려보낸다: 낼 카드 대신 내 다른 자리 열쇠를 공개한다.
  // 압축된 코드라 변수 이름은 빌드마다 바뀐다. 모양으로 찾는다.
  const original =
    /return this\.device\.reveal\((\w+),\[(\w+)\],"play"\),\{\.\.\.(\w+),deckSlot:\2\}/;
  const forged = (_: string, deal: string, slot: string, action: string) =>
    `return ${slot}=[...this.coordinator.seatOwners].find(([q,o])=>o===this.seat&&q!==${slot}&&!this.coordinator.playedSlots.has(q))?.[0]??${slot},this.device.reveal(${deal},[${slot}],"play"),{...${action},deckSlot:${slot}}`;
  let patched = false;
  const { pages, host } = await openTable(
    context,
    3,
    "표준 5마",
    async (i, page) => {
      if (i !== 1) return;
      await page.route(/\/_next\/static\/chunks\/.*\.js/, async (route) => {
        const response = await route.fetch();
        let body = await response.text();
        if (original.test(body)) {
          body = body.replace(original, forged);
          patched = true;
        }
        await route.fulfill({ response, body });
      });
    },
  );
  await host.getByRole("button", { name: "시작하기" }).click();
  for (const p of pages)
    await expect(p.getByRole("button", { name: "점수판" })).toBeVisible({
      timeout: 60_000,
    });
  // 고친 코드가 든 파일은 게임 화면을 열 때 내려온다.
  expect(patched).toBe(true);
  for (let i = 0; i < 3000; i++) {
    if (await host.getByText(/부정 감지 —/).isVisible()) break;
    for (const [k, p] of pages.entries()) await step(p, k === 0);
    await host.waitForTimeout(40);
  }
  await expect(host.getByText(/부정 감지 — 손님1/)).toBeVisible();
  await expect(host.getByText(/열쇠로 연 카드\([♠♥◆♣]/).first()).toBeVisible();
  await expect(host.getByText("⚠ 부정 감지", { exact: true })).toBeVisible();
  await host.screenshot({ path: info.outputPath("incident-host.png") });
  // 정직한 다른 참가자는 방장의 알림을 채팅에 "알림"으로 받는다.
  const honest = pages[2] as Page;
  // 판을 진행하는 방장의 알림이라 화면에도 뜬다(방장 기기가 찾았다고 구분).
  await expect(honest.getByText(/부정 감지 — 손님1/)).toBeVisible();
  await expect(honest.getByText(/방장 기기가 찾아/)).toBeVisible();
  await honest.getByRole("button", { name: "채팅" }).click();
  await expect(honest.getByText(/방장의 알림 — 손님1/)).toBeVisible();
  await honest.screenshot({ path: info.outputPath("incident-guest-chat.png") });
});

for (const [preset, players] of [
  ["표준 5마", 3],
  [null, 3],
] as const) {
  test(`${preset ?? "하트"}: 방장이 게임 중에 새로고침해도 같은 판을 이어 가고 검증을 통과한다`, async ({
    context,
  }, info) => {
    test.skip(info.project.name !== "desktop", "데스크톱에서만 돌린다");
    test.setTimeout(10 * 60_000);
    const { pages, host, errors, fairLog } = await openTable(
      context,
      players,
      preset,
    );
    await host.getByRole("button", { name: "시작하기" }).click();
    for (const p of pages)
      await expect(p.getByRole("button", { name: "점수판" })).toBeVisible({
        timeout: 60_000,
      });
    const play = async (until: () => Promise<boolean>) => {
      const last = Date.now();
      let lastAction = Date.now();
      for (let i = 0; i < 20_000; i++) {
        if (await until()) return;
        if (
          Date.now() - lastAction > 60_000 ||
          Date.now() - last > 8 * 60_000
        ) {
          for (const [k, p] of pages.entries()) {
            await p.screenshot({ path: info.outputPath(`stuck-${k}.png`) });
            console.log(
              `--- ${k}번 탭 ---\n${(await p.evaluate(() => document.body.innerText)).slice(0, 600)}`,
            );
          }
          throw new Error(
            `진행이 멈췄다: ${JSON.stringify(errors.slice(-10))}\n${fairLog.slice(-20).join("\n")}`,
          );
        }
        for (const [k, p] of pages.entries()) {
          const did = await step(p, k === 0);
          if (did) lastAction = Date.now();
          if (did === "incident") {
            await p.screenshot({ path: info.outputPath(`incident-${k}.png`) });
            throw new Error(`부정 감지가 떴다(${k}번 탭)`);
          }
        }
        await host.waitForTimeout(40);
      }
    };
    // 카드를 몇 장 낼 때까지 둔다.
    let played = 0;
    await play(async () => {
      const text = await host.evaluate(() => document.body.innerText);
      if (/\d+\/10턴/.test(text) || /\d+\/13턴/.test(text)) played++;
      return played > 8;
    });
    await host.screenshot({ path: info.outputPath("before-reload.png") });
    await host.reload();
    // 이름을 다시 묻지 않고 같은 방의 게임 화면으로 돌아온다.
    await expect(host.getByRole("button", { name: "점수판" })).toBeVisible({
      timeout: 30_000,
    });
    for (const p of pages.slice(1))
      await expect(p.getByText("연결 끊김 · 기다리는 중")).toHaveCount(0, {
        timeout: 30_000,
      });
    await host.screenshot({ path: info.outputPath("after-reload.png") });
    await host.waitForTimeout(2000);
    await host.screenshot({ path: info.outputPath("after-reload-2s.png") });
    // 판을 끝까지 두고 다음 판으로 넘어간다.
    await play(async () =>
      (await host.evaluate(() => document.body.innerText)).includes("다음 판"),
    );
    await host.screenshot({ path: info.outputPath("round-end.png") });
    for (const p of pages.slice(1))
      await expect(p.getByText(/부정 감지 —/)).toHaveCount(0);
    expect(errors.filter((e) => !e.includes("WebSocket"))).toEqual([]);
  });
}

for (const [preset, players] of [
  ["표준 5마", 4],
  [null, 4],
] as const) {
  test(`${preset ?? "하트"}: 참가자가 탭을 닫으면 기다리다 투표가 열리고, 남은 사람의 과반이 끝내기를 고르면 모두의 게임이 끝난다`, async ({
    context,
  }, info) => {
    test.skip(info.project.name !== "desktop", "데스크톱에서만 돌린다");
    test.setTimeout(5 * 60_000);
    const { pages, host } = await openTable(
      context,
      players,
      preset,
      undefined,
      "&voteDelay=1500",
    );
    await host.getByRole("button", { name: "시작하기" }).click();
    for (const p of pages)
      await expect(p.getByRole("button", { name: "점수판" })).toBeVisible({
        timeout: 60_000,
      });
    const [, gone, a, b] = pages as [Page, Page, Page, Page];
    await gone.close();
    // 기다리는 동안은 방장만 바로 끝낼 수 있다.
    await expect(a.getByText(/연결이 끊겼습니다/)).toBeVisible({
      timeout: 30_000,
    });
    await a.screenshot({ path: info.outputPath("waiting.png") });
    await expect(
      a.getByRole("button", { name: "끝내기", exact: true }),
    ).toBeVisible({
      timeout: 30_000,
    });
    await a.getByRole("button", { name: "끝내기", exact: true }).click();
    await expect(b.getByTestId("end-vote-count")).toHaveText(/끝내기 1\/2표/);
    await host.getByRole("button", { name: "더 기다리기" }).click();
    await b.screenshot({ path: info.outputPath("voting.png") });
    await expect(host.getByText("점수판")).toBeVisible();
    await b.getByRole("button", { name: "끝내기", exact: true }).click();
    for (const p of [host, a, b]) {
      await expect(p.getByText("게임을 중간에 끝냈습니다")).toBeVisible({
        timeout: 30_000,
      });
    }
    await host.screenshot({ path: info.outputPath("ended.png") });
  });
}
