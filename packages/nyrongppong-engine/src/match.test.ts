import { HWATU_DECK, shuffledDeck } from "@mighty/hwatu";
import { describe, expect, it } from "vitest";

import { handValue } from "./hand";
import {
  callClock,
  callWinner,
  createMatch,
  pendingSeats,
  ranksOf,
  replay,
  type StepResult,
  step,
  viewOf,
} from "./match";
import {
  decodeNyrongppongRules,
  encodeNyrongppongRules,
  STANDARD_RULES,
} from "./rules";
import { createNyrongppongScenario } from "./scenario";
import type { Action, NyrongppongState } from "./state";

function ok(result: StepResult): NyrongppongState {
  if (!result.ok) throw new Error(result.error);
  return result.state;
}

function run(state: NyrongppongState, moves: [number, Action][]) {
  let s = state;
  for (const [seat, action] of moves) s = ok(step(s, seat, action));
  return s;
}

describe("규칙 문자열", () => {
  it("기본 규칙을 문자열로 나누고 되돌린다", () => {
    const code = encodeNyrongppongRules(STANDARD_RULES);
    expect(code).toBe("n1-p4r5s10b20c5");
    expect(decodeNyrongppongRules(code)).toEqual({
      ok: true,
      rules: STANDARD_RULES,
    });
  });

  it("모르는 값은 거절한다", () => {
    expect(decodeNyrongppongRules("n1-p6r5s10b20c5").ok).toBe(false);
    expect(decodeNyrongppongRules("j1-s1").ok).toBe(false);
  });
});

describe("나눠 주기", () => {
  it("모두 다섯 장, 선은 여섯 장. 같은 시드면 같은 패", () => {
    const { state, events } = createMatch(STANDARD_RULES, 42);
    expect(state.hands.map((h) => h.length)).toEqual(
      state.hands.map((_, s) => (s === state.dealer ? 6 : 5)),
    );
    expect(state.deck).toHaveLength(48 - 21);
    expect(state.phase).toBe("discard");
    expect(state.turn).toBe(state.dealer);
    expect(events[0]).toMatchObject({ type: "roundStarted", roundNumber: 1 });
    // 첫 판은 shuffledDeck(시드) 순서 그대로 나눈다.
    const all = [...state.hands.flat(), ...state.deck].sort();
    expect(all).toEqual(shuffledDeck(42).sort());
    expect(createMatch(STANDARD_RULES, 42).state).toEqual(state);
  });

  it("인원이 2~5명이 아니면 만들지 않는다", () => {
    expect(() => createMatch({ ...STANDARD_RULES, players: 6 }, 1)).toThrow();
  });
});

describe("버리기와 차례", () => {
  // 0: 버릴 차례(여섯 장). 1·2는 아무도 1월이 없다.
  const base = () =>
    createNyrongppongScenario({
      hands: [
        ["01g", "02a", "03g", "05a", "07a", "10a"],
        ["04a", "06a", "08g", "09a", "11g"],
        ["04r", "06r", "08a", "09r", "11d"],
      ],
      deck: ["12g", "12a", "12r", "12d", "10r", "10p"],
    });

  it("아무도 뽕할 수 없으면 다음 자리가 한 장 가져와 버릴 차례가 된다", () => {
    const s = run(base(), [[0, { type: "discard", card: "01g" }]]);
    expect(s.phase).toBe("discard");
    expect(s.turn).toBe(1);
    expect(s.hands[1]).toContain("12g");
    expect(s.drawn).toBe("12g");
    expect(pendingSeats(s)).toEqual([1]);
  });

  it("잘못된 행동은 한국어 오류로 거절한다", () => {
    const s = base();
    expect(step(s, 1, { type: "discard", card: "04a" })).toEqual({
      ok: false,
      error: "차례가 아니다",
    });
    expect(step(s, 0, { type: "discard", card: "04a" })).toEqual({
      ok: false,
      error: "손에 없는 카드다",
    });
    expect(step(s, 0, { type: "declare" })).toEqual({
      ok: false,
      error: "약이 아니다",
    });
    expect(step(s, 0, { type: "call" }).ok).toBe(false);
    expect(step(s, 0, { type: "continue" }).ok).toBe(false);
    expect(step(s, 7, { type: "draw" }).ok).toBe(false);
  });

  it("남의 손패와 더미, 시드는 화면에 보이지 않는다", () => {
    const view = viewOf(base(), 1);
    expect(view.hand).toEqual(["04a", "06a", "08g", "09a", "11g"]);
    expect(view.handCounts).toEqual([6, 5, 5]);
    expect(view.deckCount).toBe(6);
    const text = JSON.stringify(view);
    expect(text).not.toContain("01g");
    expect(text).not.toContain("12g");
    expect(text).not.toContain("seed");
    expect(view.decision).toBeNull();
    expect(viewOf(base(), 0).decision).toEqual({ kind: "discard", yak: null });
  });

  it("더미가 떨어지면 판이 끝나고 손패 합이 점수다", () => {
    const s = createNyrongppongScenario({
      hands: [
        ["01g", "02a", "03g", "05a", "07a", "10a"],
        ["04a", "06a", "08g", "09a", "11g"],
      ],
      deck: [],
    });
    const end = run(s, [[0, { type: "discard", card: "10a" }]]);
    expect(end.phase).toBe("gameOver");
    expect(end.result?.end).toEqual({ kind: "deckOut" });
    expect(end.result?.scores).toEqual([18, 38]);
  });
});

describe("뽕 응답 창", () => {
  // 0이 3월을 버린다. 1과 2가 3월 두 장씩, 3은 없다.
  const sceneOptions = () => ({
    hands: [
      ["03g", "02a", "04a", "05a", "07a", "10a"],
      ["03r", "03p", "06a", "08g", "11g"],
      ["03q", "01r", "09a", "09r", "11d"],
      ["01g", "06r", "08a", "10r", "12a"],
    ],
    deck: ["12g", "12r", "12d", "10p", "05r"],
  });
  const scene = () => createNyrongppongScenario(sceneOptions());

  it("뽕할 수 있는 자리만, 버린 사람 다음 자리부터 묻는다", () => {
    const s = run(scene(), [[0, { type: "discard", card: "03g" }]]);
    expect(s.phase).toBe("call");
    expect(pendingSeats(s)).toEqual([1]);
    expect(viewOf(s, 1).decision).toEqual({ kind: "call" });
    expect(viewOf(s, 2).decision).toBeNull(); // 2는 3월이 한 장뿐
    expect(viewOf(s, 3).call).toEqual({ from: 0, card: "03g", left: 5000 });
    expect(viewOf(s, 1).call?.mine).toBeNull();
  });

  it("뽕하면 두 장을 내려놓고 한 장을 버린다. 그 뒤 차례는 뽕한 사람 다음이다", () => {
    let s = run(scene(), [
      [0, { type: "discard", card: "03g" }],
      [1, { type: "call", spent: 800 }],
    ]);
    expect(s.melds[1]).toEqual([["03g", "03r", "03p"]]);
    expect(s.hands[1]).toEqual(["06a", "08g", "11g"]);
    expect(s.pile).toEqual([]);
    expect(s.phase).toBe("discard");
    expect(s.turn).toBe(1);
    expect(s.drawn).toBeNull();
    s = run(s, [[1, { type: "discard", card: "11g" }]]);
    // 2가 11월 쌍피 한 장뿐이라 창이 없다. 2(뽕한 1 다음)가 가져온다.
    expect(s.turn).toBe(2);
    expect(s.phase).toBe("discard");
  });

  it("바로 다음 자리가 아니어도 뽕할 수 있다(그 사이 자리는 차례를 건너뛴다)", () => {
    const s = createNyrongppongScenario({
      hands: [
        ["03g", "02a", "04a", "05a", "07a", "10a"],
        ["03r", "06a", "08g", "11g", "12a"],
        ["03q", "03p", "09a", "09r", "11d"],
        ["01g", "06r", "08a", "10r", "12r"],
      ],
      deck: ["12g", "12d", "10p", "05r"],
    });
    // 2만 3월 두 장이다(1은 한 장).
    let t = run(s, [[0, { type: "discard", card: "03g" }]]);
    expect(pendingSeats(t)).toEqual([2]);
    t = run(t, [[2, { type: "call" }]]);
    expect(t.melds[2]).toHaveLength(1);
    t = run(t, [[2, { type: "discard", card: "11d" }]]);
    // 1은 건너뛰고 뽕한 2 다음인 3 차례다.
    expect(t.turn).toBe(3);
  });

  it("달마다 넉 장이라 한 장을 버렸을 때 뽕할 수 있는 자리는 많아야 하나다", () => {
    for (const players of [2, 3, 4, 5])
      for (let seed = 1; seed <= 20; seed++) {
        const rules = { ...STANDARD_RULES, players, rounds: 1 };
        let { state } = createMatch(rules, seed);
        for (let i = 0; i < 400 && state.phase !== "gameOver"; i++) {
          expect(state.call?.responses.length ?? 0).toBeLessThanOrEqual(1);
          const seat = pendingSeats(state)[0] as number;
          const hand = state.hands[seat] as string[];
          const action: Action =
            state.phase === "call"
              ? { type: seed % 2 ? "call" : "pass" }
              : state.phase === "draw"
                ? { type: "draw" }
                : { type: "discard", card: hand[i % hand.length] as string };
          state = ok(step(state, seat, action));
        }
        expect(state.phase).toBe("gameOver");
      }
  });

  it("앞 자리가 넘기면 뒤 자리 뽕이 이긴다. 앞 자리가 아직이면 뒤 자리가 불러도 기다린다", () => {
    expect(
      callWinner([
        { seat: 1, answer: null },
        { seat: 2, answer: "call" },
      ]),
    ).toEqual({ done: false });
    expect(
      callWinner([
        { seat: 1, answer: "pass" },
        { seat: 2, answer: "call" },
      ]),
    ).toEqual({ done: true, seat: 2 });
    expect(
      callWinner([
        { seat: 1, answer: "call" },
        { seat: 2, answer: null },
      ]),
    ).toEqual({ done: true, seat: 1 });
    expect(
      callWinner([
        { seat: 1, answer: "pass" },
        { seat: 2, answer: "pass" },
      ]),
    ).toEqual({ done: true, seat: null });
  });

  it("시간이 다 되면 정하지 않은 자리는 넘긴 것으로 본다. 시간이 남았으면 거절한다", () => {
    const s = run(scene(), [[0, { type: "discard", card: "03g" }]]);
    expect(callClock(s)).toEqual({ seat: 1, left: 5000 });
    expect(step(s, 1, { type: "timeout", spent: 4999 })).toEqual({
      ok: false,
      error: "아직 시간이 남았다",
    });
    const t = ok(step(s, 1, { type: "timeout", spent: 5001 }));
    expect(t.phase).toBe("discard");
    expect(t.turn).toBe(1);
    expect(t.melds[1]).toEqual([]);
    expect(t.call).toBeNull();
  });

  it("버릴 때마다 여는 창(온라인): 아무도 뽕할 수 없어도 창이 열리고 시간이 다 돼야 닫힌다", () => {
    const rules = {
      ...STANDARD_RULES,
      callSeconds: 3 as const,
      everyDiscard: true,
    };
    expect(encodeNyrongppongRules(rules)).toBe("n1-p4r5s10b20c3e1");
    expect(decodeNyrongppongRules("n1-p4r5s10b20c3e1")).toEqual({
      ok: true,
      rules,
    });
    const s = run(createNyrongppongScenario({ ...sceneOptions(), rules }), [
      [0, { type: "discard", card: "10a" }],
    ]);
    // 10월 두 장을 든 자리가 없지만 창이 열리고, 버린 자리 이름으로 시간만 잰다.
    expect(s.phase).toBe("call");
    expect(pendingSeats(s)).toEqual([]);
    expect(callClock(s)).toEqual({ seat: 0, left: 3000 });
    expect(viewOf(s, 3).call).toEqual({ from: 0, card: "10a", left: 3000 });
    const t = ok(step(s, 0, { type: "timeout", spent: 3001 }));
    expect(t.phase).toBe("discard");
    expect(t.turn).toBe(1);
  });

  it("버릴 때마다 여는 창: 넘겨도 일찍 닫히지 않고(누가 넘겼는지 드러나지 않게) 남은 시간이 이어진다", () => {
    const rules = {
      ...STANDARD_RULES,
      callSeconds: 3 as const,
      everyDiscard: true,
    };
    let s = run(createNyrongppongScenario({ ...sceneOptions(), rules }), [
      [0, { type: "discard", card: "03g" }],
      [1, { type: "pass", spent: 1000 }],
    ]);
    // 뽕할 수 있던 1이 넘겼지만 창은 그대로, 남은 시간은 2초다. 밖에서 보기엔 넘기지 않은 창과 같다.
    expect(s.phase).toBe("call");
    expect(callClock(s)).toEqual({ seat: 0, left: 2000 });
    expect(viewOf(s, 3).call).toEqual({ from: 0, card: "03g", left: 2000 });
    s = ok(step(s, 0, { type: "timeout", spent: 2001 }));
    expect(s.turn).toBe(1);
    expect(s.melds[1]).toEqual([]);
    // 뽕을 부르면 시간 전이라도 바로 닫힌다.
    const t = run(createNyrongppongScenario({ ...sceneOptions(), rules }), [
      [0, { type: "discard", card: "03g" }],
      [1, { type: "call", spent: 500 }],
    ]);
    expect(t.melds[1]).toEqual([["03g", "03r", "03p"]]);
    expect(t.phase).toBe("discard");
  });

  it("응답 창 밖에서는 뽕할 수 없다. 이미 정한 자리는 다시 정할 수 없다", () => {
    const s = run(scene(), [[0, { type: "discard", card: "03g" }]]);
    expect(step(s, 3, { type: "call" })).toEqual({
      ok: false,
      error: "뽕할 수 있는 패가 없다",
    });
    expect(step(s, 0, { type: "discard", card: "02a" }).ok).toBe(false);
  });
});

describe("판 끝내기", () => {
  it("박: 마지막 두 장으로 뽕하면 0점, 버린 사람은 바가지(+20)", () => {
    const s = createNyrongppongScenario({
      hands: [
        ["05a", "02a", "04a"],
        ["05r", "05p"],
        ["01g", "06r", "08a", "10r", "12a"],
      ],
      melds: [[], [["07a", "07r", "07p"]], []],
      deck: ["12g", "12d", "10p"],
    });
    const end = run(s, [
      [0, { type: "discard", card: "05a" }],
      [1, { type: "call" }],
    ]);
    expect(end.result?.end).toEqual({ kind: "out", seat: 1, from: 0 });
    expect(end.result?.scores).toEqual([6 + 20, 0, 37]);
    expect(end.phase).toBe("gameOver");
  });

  it("스톱: 뽕한 뒤 손패 합이 한도 이하면 가져오기 전에 스톱한다", () => {
    const s = createNyrongppongScenario({
      hands: [
        ["01g", "02a"],
        ["01r", "05p", "06a", "08g", "11g"],
      ],
      melds: [[["07a", "07r", "07p"]], []],
      deck: ["12g", "12d", "10p"],
    });
    expect(s.phase).toBe("draw");
    expect(viewOf(s, 0).decision).toEqual({ kind: "draw", canStop: true });
    const end = run(s, [[0, { type: "stop" }]]);
    expect(end.result?.end).toEqual({ kind: "stop", seat: 0, success: true });
    expect(end.result?.scores).toEqual([0, 31]);
  });

  it("스톱했는데 더 낮은 사람이 있으면 스톱 바가지(+30)", () => {
    const s = createNyrongppongScenario({
      hands: [
        ["04a", "05a"],
        ["01r", "02r"],
      ],
      melds: [[["07a", "07r", "07p"]], [["08g", "08a", "08p"]]],
      deck: ["12g", "12d", "10p"],
    });
    const end = run(s, [[0, { type: "stop" }]]);
    expect(end.result?.scores).toEqual([9 + 30, 3]);
  });

  it("스톱하지 않고 가져올 수도 있다. 뽕하지 않았으면 스톱을 묻지 않는다", () => {
    const s = createNyrongppongScenario({
      hands: [
        ["01g", "02a"],
        ["01r", "05p", "06a", "08g", "11g"],
      ],
      melds: [[["07a", "07r", "07p"]], []],
      deck: ["12g", "12d", "10p"],
    });
    const t = run(s, [[0, { type: "draw" }]]);
    expect(t.hands[0]).toEqual(["01g", "02a", "12g"]);
    expect(step(t, 0, { type: "stop" }).ok).toBe(false);
  });

  it("약: 여섯 장이 또이또이면 내고 판이 끝난다", () => {
    const s = createNyrongppongScenario({
      hands: [
        ["01g", "01r", "05a", "05p", "09a", "09p"],
        ["04a", "06a", "08g", "09r", "11g"],
      ],
      deck: ["12g"],
    });
    expect(viewOf(s, 0).decision).toEqual({
      kind: "discard",
      yak: { kind: "ttoi", value: 0 },
    });
    const end = run(s, [[0, { type: "declare" }]]);
    expect(end.result?.end).toMatchObject({ kind: "yak", seat: 0 });
    expect(end.result?.scores).toEqual([0, 38]);
  });

  it("판이 끝나면 모두 다음 판을 눌러 새로 나눈다. 선은 다음 자리로", () => {
    const rules = { ...STANDARD_RULES, players: 2, rounds: 2 };
    let { state } = createMatch(rules, 7);
    const dealer = state.dealer;
    // 선이 약이 없으면 계속 버리기만 해 더미가 떨어질 때까지 간다.
    for (let guard = 0; guard < 500 && state.phase !== "roundEnd"; guard++) {
      const seat = pendingSeats(state)[0] as number;
      const hand = state.hands[seat] as string[];
      const action: Action =
        state.phase === "call"
          ? { type: "pass" }
          : state.phase === "draw"
            ? { type: "draw" }
            : { type: "discard", card: hand[hand.length - 1] as string };
      state = ok(step(state, seat, action));
    }
    expect(state.phase).toBe("roundEnd");
    expect(pendingSeats(state)).toEqual([0, 1]);
    state = run(state, [
      [0, { type: "continue" }],
      [1, { type: "continue" }],
    ]);
    expect(state.roundNumber).toBe(2);
    expect(state.dealer).toBe(1 - dealer);
    expect(state.hands[1 - dealer]).toHaveLength(6);
  });
});

describe("다시 하기와 등수", () => {
  it("기록대로 다시 하면 같은 상태가 되고, 잘못된 기록은 어디서 틀렸는지 알린다", () => {
    const rules = { ...STANDARD_RULES, players: 3, rounds: 1 };
    let { state } = createMatch(rules, 99);
    const log: { seat: number; action: Action }[] = [];
    for (let guard = 0; guard < 500 && state.phase !== "gameOver"; guard++) {
      const seat = pendingSeats(state)[0] as number;
      const hand = state.hands[seat] as string[];
      const action: Action =
        state.phase === "call"
          ? { type: "call" }
          : state.phase === "draw"
            ? { type: "draw" }
            : { type: "discard", card: hand[0] as string };
      state = ok(step(state, seat, action));
      log.push({ seat, action });
    }
    expect(state.phase).toBe("gameOver");
    const again = replay(rules, 99, log);
    expect(again.ok && again.state).toEqual(state);
    const broken = replay(rules, 99, [
      ...log.slice(0, 2),
      { seat: 0, action: { type: "declare" } },
    ]);
    expect(broken.ok).toBe(false);
    if (!broken.ok) expect(broken.index).toBe(2);
  });

  it("합계가 낮을수록 앞 등수, 같으면 같은 등수", () => {
    expect(ranksOf([30, 10, 30, 50])).toEqual([2, 1, 2, 4]);
  });

  it("판 끝 손패 점수는 자연뽕을 빼고 센다", () => {
    expect(
      handValue(HWATU_DECK.filter((c) => c.month === 2).map((c) => c.id)),
    ).toBe(0);
  });
});

describe("튜토리얼 장면", () => {
  it("뽕 응답 창이 열린 장면에서 시작할 수 있다", () => {
    const s = createNyrongppongScenario({
      hands: [
        ["03r", "03p", "06a", "08g", "11g"],
        ["02a", "04a", "05a", "07a", "10a"],
      ],
      openCall: { from: 1, card: "03g" },
    });
    expect(s.phase).toBe("call");
    expect(s.pile).toEqual(["03g"]);
    expect(pendingSeats(s)).toEqual([0]);
    expect(s.deck).not.toContain("03g");
    const t = ok(step(s, 0, { type: "call" }));
    expect(t.melds[0]).toEqual([["03g", "03r", "03p"]]);
  });
});
