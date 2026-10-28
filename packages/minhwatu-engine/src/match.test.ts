import { createRng, nextInt } from "@mighty/engine";
import { describe, expect, it } from "vitest";

import {
  createMatch,
  dealRound,
  matchOnFloor,
  pendingSeats,
  replay,
  step,
  viewOf,
} from "./match";
import {
  decodeMinhwatuRules,
  encodeMinhwatuRules,
  type MinhwatuRules,
  STANDARD_RULES,
} from "./rules";
import { createMinhwatuScenario } from "./scenario";
import { cardPoints, scoreRound, sumPoints } from "./score";
import type { Action, GameEvent, MinhwatuState } from "./state";

/** 아무 수나(무작위) 두며 게임 끝까지 간다 */
function playRandom(rules: MinhwatuRules, seed: number) {
  let { state } = createMatch(rules, seed);
  const rng = createRng(seed + 7);
  const log: { seat: number; action: Action }[] = [];
  const events: GameEvent[] = [];
  for (let guard = 0; guard < 1000 && state.phase !== "gameOver"; guard++) {
    const seat = pendingSeats(state)[0] as number;
    const view = viewOf(state, seat);
    let action: Action;
    if (view.decision?.kind === "continue") action = { type: "continue" };
    else if (view.decision?.kind === "pick")
      action = { type: "pick", target: view.decision.options[0] as string };
    else {
      const card = view.hand[nextInt(rng, view.hand.length)] as string;
      const month = card.slice(0, 2);
      const same = view.floor.filter((id) => id.startsWith(month));
      action = {
        type: "play",
        card,
        ...(same.length === 2 ? { target: same[1] as string } : {}),
      };
    }
    const result = step(state, seat, action);
    if (!result.ok) throw new Error(result.error);
    // 판이 끝나기 직전 상태: 바닥은 비어 있어야 한다(달마다 4장이 짝지어 다 먹힌다).
    if (result.events.some((e) => e.type === "roundEnded")) {
      expect(result.state.floor).toEqual([]);
      expect(result.state.deck).toEqual([]);
      expect(result.state.captured.flat().sort()).toHaveLength(48);
    }
    log.push({ seat, action });
    events.push(...result.events);
    state = result.state;
  }
  return { state, log, events };
}

describe("규칙 문자열", () => {
  it("기본 규칙은 m1-33210이고 되돌아온다", () => {
    expect(encodeMinhwatuRules(STANDARD_RULES)).toBe("m1-33210");
    for (const rules of [
      STANDARD_RULES,
      { players: 2, rounds: 1, yakScore: 10, chodan: false, saodong: true },
      { players: 4, rounds: 9, yakScore: 20, chodan: true, saodong: true },
    ] as MinhwatuRules[]) {
      const decoded = decodeMinhwatuRules(encodeMinhwatuRules(rules));
      expect(decoded).toEqual({ ok: true, rules });
    }
  });

  it("깨진 문자열은 거절한다", () => {
    for (const bad of [
      "",
      "m1-53210",
      "m1-30210",
      "m1-33310",
      "j1-s1",
      "m1-332100",
      "m2-33210",
    ])
      expect(decodeMinhwatuRules(bad).ok).toBe(false);
  });
});

describe("나누기", () => {
  it.each([
    [2, 10, 8, 20],
    [3, 7, 6, 21],
    [4, 5, 8, 20],
  ] as const)(
    "%i명: 손패 %i장, 바닥 %i장, 더미 %i장",
    (players, hand, floor, deck) => {
      const rules = { ...STANDARD_RULES, players };
      for (let seed = 1; seed <= 30; seed++) {
        const dealt = dealRound(rules, seed, 1);
        expect(dealt.hands.every((h) => h.length === hand)).toBe(true);
        expect(dealt.floor).toHaveLength(floor);
        expect(dealt.deck).toHaveLength(deck);
        const all = [...dealt.hands.flat(), ...dealt.floor, ...dealt.deck];
        expect(new Set(all).size).toBe(48);
      }
    },
  );

  it("바닥에 같은 달 4장은 깔리지 않는다", () => {
    const rules = { ...STANDARD_RULES, players: 2 as const };
    for (let seed = 1; seed <= 300; seed++) {
      const { floor } = dealRound(rules, seed, 1);
      const months = floor.map((id) => id.slice(0, 2));
      for (const m of months)
        expect(months.filter((x) => x === m).length).toBeLessThan(4);
    }
  });

  it("같은 시드면 같은 판", () => {
    expect(createMatch(STANDARD_RULES, 5)).toEqual(
      createMatch(STANDARD_RULES, 5),
    );
  });
});

describe("짝 맞추기", () => {
  it("맞는 바닥 패가 없으면 바닥에 놓는다", () => {
    expect(matchOnFloor(["01g"], "02a")).toEqual({
      ok: true,
      floor: ["01g", "02a"],
      took: [],
    });
  });
  it("하나면 둘을 먹는다", () => {
    expect(matchOnFloor(["01g", "03p"], "03g")).toEqual({
      ok: true,
      floor: ["01g"],
      took: ["03g", "03p"],
    });
  });
  it("둘이면 골라야 한다", () => {
    expect(matchOnFloor(["08a", "08p"], "08g").ok).toBe(false);
    expect(matchOnFloor(["08a", "08p"], "08g", "08a")).toEqual({
      ok: true,
      floor: ["08p"],
      took: ["08g", "08a"],
    });
  });
  it("셋이면 넷을 다 먹는다", () => {
    expect(matchOnFloor(["10a", "10r", "10p"], "10q")).toEqual({
      ok: true,
      floor: [],
      took: ["10q", "10a", "10r", "10p"],
    });
  });
});

describe("한 차례", () => {
  const rules = { ...STANDARD_RULES, players: 2 as const };

  it("낸 패로 먹고, 뒤집은 패로도 먹는다", () => {
    const state = createMinhwatuScenario({
      rules,
      hands: [["03g", "07a"], ["12a"]],
      floor: ["03p", "05r"],
      deck: ["05p", "09a"],
    });
    const r = step(state, 0, { type: "play", card: "03g" });
    if (!r.ok) throw new Error(r.error);
    expect(r.state.captured[0]).toEqual(["03g", "03p", "05p", "05r"]);
    expect(r.state.turn).toBe(1);
    expect(r.state.last).toEqual({
      seat: 0,
      played: "03g",
      playTook: ["03g", "03p"],
      flipped: "05p",
      flipTook: ["05p", "05r"],
    });
  });

  it("뒤집은 패가 낸 패와 같은 달이면 바닥에 남는다(뻑이 없다)", () => {
    const state = createMinhwatuScenario({
      rules,
      hands: [["03g"], ["12a"]],
      floor: ["03p"],
      deck: ["03q"],
    });
    const r = step(state, 0, { type: "play", card: "03g" });
    if (!r.ok) throw new Error(r.error);
    expect(r.state.captured[0]).toEqual(["03g", "03p"]);
    expect(r.state.floor).toEqual(["03q"]);
  });

  it("맞는 패가 없던 낸 패를 뒤집은 패가 먹는다", () => {
    const state = createMinhwatuScenario({
      rules,
      hands: [["03g"], ["12a"]],
      floor: ["01p"],
      deck: ["03q"],
    });
    const r = step(state, 0, { type: "play", card: "03g" });
    if (!r.ok) throw new Error(r.error);
    expect(r.state.captured[0]).toEqual(["03q", "03g"]);
    expect(r.state.floor).toEqual(["01p"]);
  });

  it("뒤집은 패가 바닥 두 장과 맞으면 고를 때까지 기다린다", () => {
    const state = createMinhwatuScenario({
      rules,
      hands: [["01g"], ["12a"]],
      floor: ["06r", "06p"],
      deck: ["06a"],
    });
    const r = step(state, 0, { type: "play", card: "01g" });
    if (!r.ok) throw new Error(r.error);
    expect(r.state.phase).toBe("pick");
    expect(viewOf(r.state, 0).decision).toEqual({
      kind: "pick",
      options: ["06r", "06p"],
    });
    expect(viewOf(r.state, 1).decision).toBeNull();
    expect(step(r.state, 1, { type: "pick", target: "06r" }).ok).toBe(false);
    expect(step(r.state, 0, { type: "pick", target: "01g" }).ok).toBe(false);
    const picked = step(r.state, 0, { type: "pick", target: "06r" });
    if (!picked.ok) throw new Error(picked.error);
    expect(picked.state.captured[0]).toEqual(["06a", "06r"]);
    expect(picked.state.floor).toEqual(["06p", "01g"]);
    expect(picked.state.turn).toBe(1);
  });

  it("잘못된 행동은 거절한다", () => {
    const state = createMinhwatuScenario({
      rules,
      hands: [["08g"], ["12a"]],
      floor: ["08a", "08p"],
      deck: ["01p"],
    });
    expect(step(state, 1, { type: "play", card: "12a" }).ok).toBe(false);
    expect(step(state, 0, { type: "play", card: "12a" }).ok).toBe(false);
    expect(step(state, 0, { type: "play", card: "xx" }).ok).toBe(false);
    expect(step(state, 0, { type: "play", card: "08g" }).ok).toBe(false);
    expect(step(state, 0, { type: "pick", target: "08a" }).ok).toBe(false);
    expect(step(state, 0, { type: "continue" }).ok).toBe(false);
    expect(
      step(state, 0, { type: "play", card: "08g", target: "08a" }).ok,
    ).toBe(true);
  });

  it("약을 이루면 알린다", () => {
    const state = createMinhwatuScenario({
      rules,
      hands: [["10q"], ["12a"]],
      floor: ["10p"],
      deck: ["01p"],
      captured: [["10a", "10r"], []],
    });
    const r = step(state, 0, { type: "play", card: "10q" });
    if (!r.ok) throw new Error(r.error);
    expect(r.events).toContainEqual({
      type: "yak",
      seat: 0,
      yak: "pungyak",
      value: 20,
    });
  });
});

describe("점수", () => {
  it("광 20, 열끗 10, 띠 5, 피 0, 모두 240", () => {
    expect(cardPoints("01g")).toBe(20);
    expect(cardPoints("09a")).toBe(10);
    expect(cardPoints("12r")).toBe(5);
    expect(cardPoints("11d")).toBe(0);
    const all = dealRound(STANDARD_RULES, 1, 1);
    expect(sumPoints([...all.hands.flat(), ...all.floor, ...all.deck])).toBe(
      240,
    );
  });

  it("약은 나머지 모두에게서 받고, 판 점수 합은 0이다", () => {
    // 0번이 홍단(30), 1번이 비약(20)
    const scores = scoreRound(
      [["01r", "02r", "03r", "01g"], ["12g", "12a", "12r", "12d"], ["08g"]],
      STANDARD_RULES,
    );
    expect(scores.map((s) => s.yakNet)).toEqual([
      30 * 2 - 20,
      20 * 2 - 30,
      -50,
    ]);
    expect(scores.reduce((a, s) => a + s.total, 0)).toBe(
      scores.reduce((a, s) => a + s.cards, 0) - 240,
    );
    expect(scores[0]?.total).toBe(15 + 20 + 40 - 80);
  });

  it("초단·사오동은 옵션이다", () => {
    const cards = [["04r", "05r", "07r", "11g", "11d", "11p", "11q"], [], []];
    expect(scoreRound(cards, STANDARD_RULES)[0]?.yaks.map((y) => y.id)).toEqual(
      ["chodan"],
    );
    expect(
      scoreRound(cards, { ...STANDARD_RULES, chodan: false, saodong: true })[0]
        ?.yaks,
    ).toEqual([{ id: "saodong", value: 40 }]);
  });
});

describe("한 게임", () => {
  it.each([2, 3, 4] as const)(
    "%i명이 끝까지 두면 합계가 0이고 판마다 1등이 선이다",
    (players) => {
      for (let seed = 1; seed <= 15; seed++) {
        const rules = { ...STANDARD_RULES, players };
        const { state, events } = playRandom(rules, seed);
        expect(state.phase).toBe("gameOver");
        expect(state.history).toHaveLength(3);
        expect(state.totals.reduce((a, b) => a + b, 0)).toBe(0);
        const starts = events.filter((e) => e.type === "roundStarted");
        const ends = events.filter((e) => e.type === "roundEnded");
        expect(starts).toHaveLength(2);
        for (const [i, s] of starts.entries()) {
          const end = ends[i];
          if (s.type !== "roundStarted" || end?.type !== "roundEnded") throw 0;
          expect(end.result.winners).toContain(s.dealer);
        }
        expect(events.filter((e) => e.type === "gameEnded")).toHaveLength(1);
      }
    },
  );

  it("기록으로 같은 상태를 다시 만든다", () => {
    const { state, log } = playRandom(STANDARD_RULES, 42);
    const again = replay(STANDARD_RULES, 42, log);
    expect(again.ok && again.state).toEqual(state);
    const broken = [...log];
    broken[3] = { seat: 0, action: { type: "pick", target: "01g" } };
    expect(replay(STANDARD_RULES, 42, broken).ok).toBe(false);
  });

  it("남의 손패와 더미는 장수만 보인다", () => {
    const { state } = createMatch(STANDARD_RULES, 3);
    const view = viewOf(state, 1);
    expect(view.hand).toEqual(state.hands[1]);
    expect(view.handCounts).toEqual([7, 7, 7]);
    expect(view.deckCount).toBe(21);
    const text = JSON.stringify(view);
    for (const id of [...(state.hands[0] ?? []), ...state.deck])
      expect(text).not.toContain(`"${id}"`);
  });

  it("끝내기는 게임을 바로 끝낸다", () => {
    const { state } = createMatch(STANDARD_RULES, 3);
    const r = step(state, 0, { type: "retire" });
    expect(r.ok && r.state.phase).toBe("gameOver");
    expect(r.ok && r.state.retired).toBe(true);
    expect(r.ok && pendingSeats(r.state)).toEqual([]);
  });

  it("판 끝에는 모두 다음 판을 눌러야 이어진다", () => {
    let state: MinhwatuState = createMinhwatuScenario({
      rules: { ...STANDARD_RULES, players: 2 },
      hands: [["01g"], ["02a"]],
      floor: [],
    });
    state = { ...state, rules: { ...state.rules, rounds: 2 } };
    for (const [seat, card] of [
      [0, "01g"],
      [1, "02a"],
    ] as const) {
      const r = step(state, seat, { type: "play", card });
      if (!r.ok) throw new Error(r.error);
      state = r.state;
    }
    expect(state.phase).toBe("roundEnd");
    expect(pendingSeats(state)).toEqual([0, 1]);
    const a = step(state, 0, { type: "continue" });
    if (!a.ok) throw new Error(a.error);
    expect(a.state.roundNumber).toBe(1);
    const b = step(a.state, 1, { type: "continue" });
    if (!b.ok) throw new Error(b.error);
    expect(b.state.roundNumber).toBe(2);
    expect(b.state.hands[0]).toHaveLength(10);
  });
});
