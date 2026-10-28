import { describe, expect, it } from "vitest";

import { type Piece, pointAt } from "./board";
import {
  createMatch,
  type LoggedAction,
  replay,
  seatToMove,
  sideOfSeat,
  step,
  viewOf,
} from "./match";
import {
  decodeJanggiRules,
  encodeJanggiRules,
  type JanggiRules,
  STANDARD_RULES,
} from "./rules";
import { createJanggiScenario } from "./scenario";
import type { Action, JanggiState } from "./state";

const move = (from: string, to: string): Action => ({
  type: "move",
  from: pointAt(from),
  to: pointAt(to),
});

function must(state: JanggiState, seat: number, action: Action) {
  const result = step(state, seat, action);
  if (!result.ok) throw new Error(result.error);
  return result;
}

/** 한 → 초 차례로 상차림을 마친 판 */
function started(rules: JanggiRules = STANDARD_RULES, seed = 1) {
  let { state } = createMatch(rules, seed);
  const han = 1 - state.choSeat;
  state = must(state, han, { type: "setup", setup: "NENE" }).state;
  state = must(state, state.choSeat, { type: "setup", setup: "ENEN" }).state;
  return state;
}

describe("상차림과 차례", () => {
  it("상차림은 한이 먼저, 그다음 초. 고르면 두기가 시작되고 초가 먼저 둔다", () => {
    const { state } = createMatch(STANDARD_RULES, 1);
    expect(state.phase).toBe("setup");
    const han = 1 - state.choSeat;
    expect(seatToMove(state)).toBe(han);
    expect(
      step(state, state.choSeat, { type: "setup", setup: "NENE" }),
    ).toEqual({ ok: false, error: "차례가 아니다" });
    const after = started();
    expect(after.phase).toBe("play");
    expect(seatToMove(after)).toBe(after.choSeat);
    expect(after.board.filter((c) => c !== "")).toHaveLength(32);
  });

  it("초가 둔 뒤에는 한 차례다. 남의 기물이나 갈 수 없는 곳은 거절한다", () => {
    const state = started();
    const cho = state.choSeat;
    expect(step(state, cho, move("71", "61")).ok).toBe(true);
    expect(step(state, cho, move("41", "51"))).toEqual({
      ok: false,
      error: "둘 수 없는 수다",
    });
    expect(step(state, cho, move("01", "41"))).toEqual({
      ok: false,
      error: "둘 수 없는 수다",
    });
    const after = must(state, cho, move("71", "61")).state;
    expect(seatToMove(after)).toBe(1 - cho);
  });

  it("화면에는 내 차례일 때만 둘 수 있는 수가 실린다", () => {
    const state = started();
    expect(viewOf(state, state.choSeat).legal.length).toBeGreaterThan(0);
    expect(viewOf(state, 1 - state.choSeat).legal).toEqual([]);
    expect(viewOf(state, state.choSeat).decision).toEqual({ kind: "move" });
  });
});

describe("장군과 외통", () => {
  /** 초 궁이 모서리(04)에 몰렸다. 한 차가 아래 줄로 내려오면 외통 */
  const MATE: Record<string, Piece> = {
    "04": "cK",
    "25": "hK",
    "69": "hR",
    "98": "hR",
  };

  it("장군을 피할 수 없게 두면 그 판을 이긴다", () => {
    const state = createJanggiScenario({ pieces: MATE, me: "h" });
    const { state: after, events } = must(state, 0, move("69", "09"));
    expect(events.map((e) => e.type)).toEqual([
      "moved",
      "check",
      "roundEnded",
      "gameEnded",
    ]);
    expect(after.result).toEqual({ kind: "checkmate", seat: 0 });
    expect(after.phase).toBe("gameOver");
  });

  it("장군을 받으면 피하는 수만 둘 수 있고, 쉴 수 없다", () => {
    const state = createJanggiScenario({
      pieces: { "95": "cK", "35": "hR", "24": "hK", "91": "cR" },
    });
    const view = viewOf(state, 0);
    expect(view.check).toBe("c");
    expect(step(state, 0, { type: "pass" })).toEqual({
      ok: false,
      error: "장군을 받을 때는 쉴 수 없다",
    });
    // 차로 막거나(91 → 94는 줄이 달라 못 막는다) 궁이 비킨다.
    expect(step(state, 0, move("91", "92"))).toEqual({
      ok: false,
      error: "궁이 잡히는 수는 둘 수 없다",
    });
    expect(step(state, 0, move("95", "94")).ok).toBe(true);
  });
});

describe("점수로 가리기", () => {
  it("빅장이 되면 그 판을 점수로 가린다(한은 덤 1.5)", () => {
    const state = createJanggiScenario({
      pieces: { "95": "cK", "25": "hK", "65": "cP" },
    });
    const { state: after } = must(state, 0, move("65", "64"));
    expect(after.result).toEqual({
      kind: "score",
      seat: 0,
      reason: "bikjang",
      scores: { c: 2, h: 1.5 },
    });
  });

  it("빅장 금지 규칙이면 빅장이 되는 수를 거절한다", () => {
    const state = createJanggiScenario({
      rules: { bikjang: "forbidden", winsToFinish: 1 },
      pieces: { "95": "cK", "25": "hK", "65": "cP" },
    });
    expect(step(state, 0, move("65", "64"))).toEqual({
      ok: false,
      error: "빅장 금지",
    });
  });

  it("두 사람이 이어 쉬면 점수로 가린다", () => {
    const state = createJanggiScenario({
      pieces: { "94": "cK", "26": "hK", "01": "cR" },
    });
    const first = must(state, 0, { type: "pass" }).state;
    expect(first.phase).toBe("play");
    const { state: after } = must(first, 1, { type: "pass" });
    expect(after.result).toMatchObject({ kind: "score", reason: "passes" });
    expect(after.result?.seat).toBe(0);
  });

  it("같은 판 모양이 세 번 나오면 점수로 가린다", () => {
    let state = createJanggiScenario({
      pieces: { "94": "cK", "26": "hK", "01": "cR", "11": "hR" },
    });
    const loop: [number, Action][] = [
      [0, move("01", "02")],
      [1, move("11", "12")],
      [0, move("02", "01")],
      [1, move("12", "11")],
    ];
    for (let i = 0; i < 2 && state.phase === "play"; i++)
      for (const [seat, action] of loop)
        if (state.phase === "play") state = must(state, seat, action).state;
    expect(state.result).toMatchObject({ kind: "score", reason: "repetition" });
  });
});

describe("여러 판과 기권", () => {
  it("기권하면 상대가 이기고, 다음 판은 초·한을 바꿔 상차림부터 다시 한다", () => {
    const rules = { ...STANDARD_RULES, winsToFinish: 2 };
    const state = started(rules);
    const cho = state.choSeat;
    let after = must(state, cho, { type: "resign" }).state;
    expect(after.result).toEqual({ kind: "resign", seat: 1 - cho });
    expect(after.phase).toBe("roundEnd");
    after = must(after, 0, { type: "continue" }).state;
    after = must(after, 1, { type: "continue" }).state;
    expect(after.phase).toBe("setup");
    expect(after.roundNumber).toBe(2);
    expect(sideOfSeat(after, cho)).toBe("h");
    expect(after.wins).toEqual(cho === 0 ? [0, 1] : [1, 0]);
  });
});

describe("기록과 규칙 문자열", () => {
  it("기록대로 다시 두면 같은 판이 나온다", () => {
    let { state } = createMatch(STANDARD_RULES, 7);
    const log: LoggedAction[] = [];
    const act = (seat: number, action: Action) => {
      state = must(state, seat, action).state;
      log.push({ seat, action });
    };
    act(1 - state.choSeat, { type: "setup", setup: "ENNE" });
    act(state.choSeat, { type: "setup", setup: "NEEN" });
    act(state.choSeat, move("71", "61"));
    act(1 - state.choSeat, move("41", "51"));
    const replayed = replay(STANDARD_RULES, 7, log);
    expect(replayed.ok && replayed.state.board).toEqual(state.board);
    const broken = replay(STANDARD_RULES, 7, [...log, log[2] as LoggedAction]);
    expect(broken.ok).toBe(false);
  });

  it("규칙 문자열은 j1-로 시작하고 되돌릴 수 있다", () => {
    const rules: JanggiRules = { bikjang: "forbidden", winsToFinish: 3 };
    expect(encodeJanggiRules(rules)).toBe("j1-f3");
    expect(decodeJanggiRules("j1-f3")).toEqual({ ok: true, rules });
    expect(decodeJanggiRules("o1-s1").ok).toBe(false);
  });
});
