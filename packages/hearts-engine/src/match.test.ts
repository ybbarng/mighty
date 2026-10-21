import { type Card, createRng, nextInt } from "@mighty/engine";
import { describe, expect, it } from "vitest";

import { pointsOf } from "./cards";
import {
  createMatch,
  decisionFor,
  directionFor,
  passTarget,
  pendingSeats,
  playableCards,
  step,
} from "./match";
import { replay } from "./replay";
import {
  decodeHeartsRules,
  encodeHeartsRules,
  WINDOWS_RULE_CODE,
} from "./rule-string";
import { type HeartsRules, WINDOWS_RULES } from "./rules";
import type { Action, LoggedAction, MatchState } from "./state";
import { viewOf } from "./view";

const rules = WINDOWS_RULES;

/** 낼 수 있는 행동 중 하나를 무작위로 */
function randomAction(state: MatchState, seat: number, seed: number): Action {
  const decision = decisionFor(state, seat);
  if (!decision) throw new Error("결정할 것이 없다");
  const rng = createRng(seed);
  if (decision.kind === "pass") {
    const hand = [...(state.round.hands[seat] ?? [])];
    const cards: Card[] = [];
    while (cards.length < decision.count)
      cards.push(hand.splice(nextInt(rng, hand.length), 1)[0] as Card);
    return { type: "pass", cards };
  }
  if (decision.kind === "play")
    return {
      type: "play",
      card: decision.cards[nextInt(rng, decision.cards.length)] as Card,
    };
  return { type: "continue" };
}

function playOut(seed: number, r: HeartsRules = rules) {
  let { state } = createMatch({ rules: r, seed });
  const log: LoggedAction[] = [];
  for (let i = 0; i < 20_000 && state.round.phase !== "gameOver"; i++) {
    const seat = pendingSeats(state)[0] as number;
    const action = randomAction(state, seat, seed * 7919 + i);
    const result = step(state, seat, action);
    if (!result.ok) throw new Error(result.error);
    state = result.state;
    log.push({ seat, action });
  }
  return { state, log };
}

describe("하트 엔진", () => {
  it("한 사람에게 13장씩, 52장을 겹치지 않게 나눈다", () => {
    const { state } = createMatch({ rules, seed: 1 });
    const all = state.round.hands.flat();
    expect(state.round.hands.map((h) => h.length)).toEqual([13, 13, 13, 13]);
    expect(new Set(all).size).toBe(52);
    expect(all).not.toContain("JK");
  });

  it("넘기는 방향은 왼쪽 → 오른쪽 → 맞은편 → 안 넘김을 되풀이한다", () => {
    expect([1, 2, 3, 4, 5].map((n) => directionFor(rules, n))).toEqual([
      "left",
      "right",
      "across",
      "none",
      "left",
    ]);
    expect(passTarget(0, "left")).toBe(1);
    expect(passTarget(0, "right")).toBe(3);
    expect(passTarget(0, "across")).toBe(2);
  });

  it("모두 3장씩 고르면 한꺼번에 넘기고, ♣2를 가진 사람이 ♣2로 시작한다", () => {
    let { state } = createMatch({ rules, seed: 3 });
    const chosen = state.round.hands.map((h) => h.slice(0, 3));
    for (let s = 0; s < 4; s++) {
      const result = step(state, s, {
        type: "pass",
        cards: chosen[s] as Card[],
      });
      if (!result.ok) throw new Error(result.error);
      state = result.state;
    }
    expect(state.round.phase).toBe("play");
    // 0번이 고른 카드는 왼쪽(1번)에게 갔다.
    for (const c of chosen[0] as Card[])
      expect(state.round.hands[1]).toContain(c);
    expect(viewOf(state, 1).received).toEqual(chosen[0]);
    // 첫 선은 비워 두고 ♣2를 가진 사람만 낼 수 있다.
    expect(state.round.turn).toBeNull();
    const leader = state.round.hands.findIndex((h) => h.includes("C2"));
    expect(decisionFor(state, leader)).toMatchObject({ cards: ["C2"] });
    for (const s of [0, 1, 2, 3].filter((s) => s !== leader))
      expect(decisionFor(state, s)).toBeNull();
  });

  it("3장이 아니거나 손에 없는 카드는 넘길 수 없다", () => {
    const { state } = createMatch({ rules, seed: 3 });
    const hand = state.round.hands[0] as Card[];
    expect(step(state, 0, { type: "pass", cards: hand.slice(0, 2) }).ok).toBe(
      false,
    );
    const other = state.round.hands[1]?.[0] as Card;
    expect(
      step(state, 0, { type: "pass", cards: [...hand.slice(0, 2), other] }).ok,
    ).toBe(false);
  });

  it("첫 턴에는 무늬가 없어도 하트·♠Q를 낼 수 없다(그것뿐이면 예외)", () => {
    const trick = { leader: 1, plays: [{ seat: 1, card: "C2" as Card }] };
    expect(playableCards(rules, ["H5", "SQ", "D3"], trick, 0, false)).toEqual([
      "D3",
    ]);
    expect(playableCards(rules, ["H5", "SQ"], trick, 0, false)).toEqual([
      "H5",
      "SQ",
    ]);
    expect(playableCards(rules, ["C9", "H5"], trick, 0, false)).toEqual(["C9"]);
  });

  it("하트가 깨지기 전에는 하트로 선을 잡을 수 없다(하트뿐이면 예외)", () => {
    const empty = { leader: 0, plays: [] };
    expect(playableCards(rules, ["H5", "D3"], empty, 3, false)).toEqual(["D3"]);
    expect(playableCards(rules, ["H5", "D3"], empty, 3, true)).toEqual([
      "H5",
      "D3",
    ]);
    expect(playableCards(rules, ["H5", "H9"], empty, 3, false)).toEqual([
      "H5",
      "H9",
    ]);
  });

  it("무작위로 끝까지 두어도 규칙이 지켜지고, 판마다 점수 합은 26(문 슛이면 78)이다", () => {
    for (let seed = 1; seed <= 30; seed++) {
      const { state } = playOut(seed);
      expect(state.round.phase).toBe("gameOver");
      expect(Math.max(...state.scores)).toBeGreaterThanOrEqual(100);
      for (const points of state.history) {
        const sum = points.reduce((a, b) => a + b, 0);
        expect([26, 78]).toContain(sum);
      }
    }
  });

  it("기록으로 처음부터 다시 돌리면 같은 상태가 된다", () => {
    const { state, log } = playOut(11);
    const replayed = replay({ rules, seed: 11 }, log);
    expect(replayed.ok).toBe(true);
    if (replayed.ok)
      expect(JSON.stringify(replayed.state)).toBe(JSON.stringify(state));
  });

  it("문 슛: 한 사람이 다 먹으면 다른 사람이 26점씩 받는다", () => {
    // 0번이 모든 하트와 ♠Q, 높은 카드를 쥐고 혼자 다 먹는 판
    const hands: Card[][] = [
      [
        "HA",
        "HK",
        "HQ",
        "HJ",
        "H10",
        "H9",
        "H8",
        "H7",
        "H6",
        "H5",
        "H4",
        "H3",
        "H2",
      ],
      [
        "SQ",
        "SA",
        "SK",
        "SJ",
        "S10",
        "S9",
        "S8",
        "S7",
        "S6",
        "S5",
        "S4",
        "S3",
        "S2",
      ],
      [
        "C2",
        "C3",
        "C4",
        "C5",
        "C6",
        "C7",
        "C8",
        "C9",
        "C10",
        "CJ",
        "CQ",
        "CK",
        "CA",
      ],
      [
        "D2",
        "D3",
        "D4",
        "D5",
        "D6",
        "D7",
        "D8",
        "D9",
        "D10",
        "DJ",
        "DQ",
        "DK",
        "DA",
      ],
    ];
    const r: HeartsRules = {
      ...rules,
      passing: "none",
      firstTrickPoints: true,
    };
    let { state } = createMatch({ rules: r, seed: 1, presetHands: hands });
    // 0번이 하트만 쥐었으니 첫 턴 뒤로 늘 선이 되지 못한다. 대신 점수 계산만 확인한다.
    state.round.taken = [[...(hands[0] as Card[]), "SQ"], [], [], []];
    state.round.hands = [[], [], [], []];
    state.round.trickIndex = 12;
    state.round.trick = { leader: 1, plays: [] };
    state.round.hands[1] = ["S2"];
    state.round.hands[2] = ["C2"];
    state.round.hands[3] = ["D2"];
    state.round.hands[0] = ["S3"];
    state.round.turn = 1;
    for (const [seat, card] of [
      [1, "S2"],
      [2, "C2"],
      [3, "D2"],
      [0, "S3"],
    ] as const) {
      const result = step(state, seat, { type: "play", card });
      if (!result.ok) throw new Error(result.error);
      state = result.state;
    }
    expect(state.round.moonShooter).toBe(0);
    expect(state.round.roundPoints).toEqual([0, 26, 26, 26]);
  });

  it("규칙 문자열을 만들고 다시 읽는다", () => {
    expect(WINDOWS_RULE_CODE).toBe("h1-cobxf3-100");
    const custom: HeartsRules = {
      ...rules,
      passing: "left",
      moon: "self",
      jackOfDiamonds: true,
      endScore: 50,
    };
    const decoded = decodeHeartsRules(encodeHeartsRules(custom));
    expect(decoded).toEqual({ ok: true, rules: custom });
    expect(decodeHeartsRules("(0$1M&))2O%,C5%").ok).toBe(false);
  });

  it("◆J 규칙을 켜면 ◆J는 −10점", () => {
    expect(pointsOf(["DJ", "H2"], { ...rules, jackOfDiamonds: true })).toBe(-9);
    expect(pointsOf(["DJ", "H2"], rules)).toBe(1);
  });
});
