import { describe, expect, it } from "vitest";

import { pointAt } from "./board";
import {
  clockTurn,
  createMatch,
  type LoggedAction,
  legalPoints,
  replay,
  seatToMove,
  step,
  stoneOfSeat,
  viewOf,
} from "./match";
import {
  type BadukRules,
  decodeBadukRules,
  encodeBadukRules,
  STANDARD_RULES,
} from "./rules";
import { createBadukScenario } from "./scenario";
import type { Action, BadukState } from "./state";

const at = (name: string, size = 9) => pointAt(name, size);
const place = (name: string): Extract<Action, { type: "place" }> => ({
  type: "place",
  at: at(name),
});

function must(state: BadukState, seat: number, action: Action) {
  const result = step(state, seat, action);
  if (!result.ok) throw new Error(result.error);
  return result;
}

/** 차례인 자리로 행동을 이어 둔다. 둔 기록도 돌려준다 */
function playAll(state: BadukState, actions: Action[]) {
  const log: LoggedAction[] = [];
  let s = state;
  const events = [];
  for (const action of actions) {
    const seat = seatToMove(s) as number;
    const r = must(s, seat, action);
    log.push({ seat, action });
    events.push(...r.events);
    s = r.state;
  }
  return { state: s, log, events };
}

describe("규칙 문자열", () => {
  it("판 크기·덤·판 수·시간이 오간다", () => {
    expect(encodeBadukRules(STANDARD_RULES)).toBe("b1-9k75w1");
    const rules: BadukRules = {
      size: 19,
      komi: 6.5,
      winsToFinish: 2,
      time: "fast",
    };
    expect(encodeBadukRules(rules)).toBe("b1-19k65w2-t1");
    expect(decodeBadukRules("b1-19k65w2-t1")).toEqual({ ok: true, rules });
    expect(decodeBadukRules("b1-9k75w1")).toEqual({
      ok: true,
      rules: STANDARD_RULES,
    });
  });

  it("엉뚱한 문자열은 받지 않는다", () => {
    for (const bad of [
      "",
      "b1-10k75w1",
      "b1-9k70w1",
      "b1-9k75w0",
      "b1-9k75w6",
      "b2-9k75w1",
      "j1-s1",
      "b1-9k75w1-t9",
      "b1-9k75w1x",
    ])
      expect(decodeBadukRules(bad).ok).toBe(false);
  });
});

describe("차례와 두기", () => {
  it("흑이 먼저 둔다. 흑 자리는 시드로 정한다", () => {
    const seats = new Set<number>();
    for (let seed = 1; seed < 20; seed++) {
      const { state } = createMatch(STANDARD_RULES, seed);
      expect(state.toPlay).toBe(1);
      expect(seatToMove(state)).toBe(state.blackSeat);
      seats.add(state.blackSeat);
    }
    expect(seats.size).toBe(2);
  });

  it("차례가 아니거나 이미 돌이 있거나 판 밖이면 거절한다", () => {
    const { state } = createMatch(STANDARD_RULES, 1);
    const black = state.blackSeat;
    expect(step(state, 1 - black, place("E5"))).toEqual({
      ok: false,
      error: "차례가 아니다",
    });
    expect(step(state, 2, place("E5"))).toEqual({
      ok: false,
      error: "없는 자리다",
    });
    const after = must(state, black, place("E5")).state;
    expect(step(after, 1 - black, place("E5"))).toEqual({
      ok: false,
      error: "이미 돌이 있다",
    });
    expect(step(after, 1 - black, { type: "place", at: 81 })).toEqual({
      ok: false,
      error: "판 밖이다",
    });
    expect(step(after, 1 - black, { type: "place", at: 1.5 }).ok).toBe(false);
  });

  it("두면 사건이 나오고 차례가 바뀐다. 화면은 둘 수 있는 자리를 보인다", () => {
    const { state } = createMatch(STANDARD_RULES, 1);
    const black = state.blackSeat;
    const view = viewOf(state, black);
    expect(view.decision).toEqual({ kind: "move" });
    expect(view.legal).toHaveLength(81);
    expect(viewOf(state, 1 - black).legal).toEqual([]);
    const r = must(state, black, place("E5"));
    expect(r.events).toEqual([
      { type: "placed", seat: black, stone: 1, at: at("E5"), captured: [] },
    ]);
    expect(r.state.toPlay).toBe(2);
    expect(seatToMove(r.state)).toBe(1 - black);
  });

  it("자살수는 둘 수 없다", () => {
    const state = createBadukScenario({
      black: ["B9", "A8"],
      white: [],
      me: 2,
    });
    expect(step(state, 0, place("A9"))).toEqual({
      ok: false,
      error: "자살수: 활로가 없는 자리에는 둘 수 없다",
    });
    expect(legalPoints(state)).not.toContain(at("A9"));
  });

  it("따낸 돌을 센다", () => {
    const state = createBadukScenario({
      black: ["B9", "A8", "C8"],
      white: ["B8"],
    });
    const r = must(state, 0, place("B7"));
    expect(r.events[0]).toMatchObject({
      type: "placed",
      captured: [at("B8")],
    });
    expect(r.state.prisoners).toEqual({ 1: 1, 2: 0 });
    expect(r.state.board[at("B8")]).toBe(0);
  });
});

describe("패", () => {
  // 가운데의 패 모양: 흑이 E6에 두면 백 D6 한 점을 따낸다.
  const KO = createBadukScenario({
    black: ["D7", "C6", "D5"],
    white: ["E7", "D6", "F6", "E5"],
  });

  it("따낸 바로 다음에 되따내면 같은 판이 되어 둘 수 없다", () => {
    const took = must(KO, 0, place("E6")).state;
    expect(took.board[at("D6")]).toBe(0);
    expect(step(took, 1, place("D6"))).toEqual({
      ok: false,
      error: "패: 바로 되따낼 수 없다(같은 판 모양이 된다)",
    });
    expect(viewOf(took, 1).legal).not.toContain(at("D6"));
  });

  it("다른 곳에 한 수씩 두고 나면 되따낼 수 있다", () => {
    let s = must(KO, 0, place("E6")).state;
    s = must(s, 1, place("A1")).state;
    s = must(s, 0, place("J9")).state;
    const r = must(s, 1, place("D6"));
    expect(r.events[0]).toMatchObject({ captured: [at("E6")] });
  });
});

describe("판 끝과 세기", () => {
  it("둘이 이어 쉬면 판 위 그대로 센다. 덤이 있어 빈 판은 백이 이긴다", () => {
    const { state } = createMatch(STANDARD_RULES, 1);
    const end = playAll(state, [{ type: "pass" }, { type: "pass" }]);
    expect(end.state.result).toEqual({
      kind: "score",
      seat: 1 - state.blackSeat,
      count: { black: 0, white: 7.5 },
    });
    expect(end.state.phase).toBe("gameOver");
    expect(end.events.map((e) => e.type)).toEqual([
      "passed",
      "passed",
      "roundEnded",
      "gameEnded",
    ]);
  });

  it("쉰 뒤에 상대가 두면 쉰 횟수는 처음부터 센다", () => {
    const { state } = createMatch(STANDARD_RULES, 1);
    const end = playAll(state, [
      { type: "pass" },
      place("E5"),
      { type: "pass" },
    ]);
    expect(end.state.phase).toBe("play");
    expect(end.state.passes).toBe(1);
  });

  it("돌 하나만 있어도 판 전체가 그 색 자리다", () => {
    const { state } = createMatch(STANDARD_RULES, 1);
    const end = playAll(state, [
      place("E5"),
      { type: "pass" },
      { type: "pass" },
    ]);
    expect(end.state.result).toMatchObject({
      kind: "score",
      seat: state.blackSeat,
      count: { black: 81, white: 7.5 },
    });
  });

  it("기권하면 상대가 이긴다. 여러 판이면 판마다 흑백을 바꾼다", () => {
    const rules: BadukRules = { ...STANDARD_RULES, winsToFinish: 2 };
    const { state } = createMatch(rules, 3);
    const black = state.blackSeat;
    const r = must(state, black, { type: "resign" });
    expect(r.state.result).toEqual({ kind: "resign", seat: 1 - black });
    expect(r.state.phase).toBe("roundEnd");
    expect(step(r.state, black, place("E5")).ok).toBe(false);
    let s = must(r.state, 0, { type: "continue" }).state;
    expect(step(s, 0, { type: "continue" })).toEqual({
      ok: false,
      error: "이미 눌렀다",
    });
    const next = must(s, 1, { type: "continue" });
    s = next.state;
    expect(next.events).toEqual([
      { type: "roundStarted", roundNumber: 2, blackSeat: 1 - black },
    ]);
    expect(s.board.every((c) => c === 0)).toBe(true);
    expect(stoneOfSeat(s, black)).toBe(2);
    s = must(s, black, { type: "resign" }).state;
    expect(s.phase).toBe("gameOver");
    expect(s.wins[1 - black]).toBe(2);
  });

  it("그만두기는 게임을 바로 끝낸다", () => {
    const { state } = createMatch(STANDARD_RULES, 1);
    const r = must(state, 0, { type: "retire" });
    expect(r.state.phase).toBe("gameOver");
    expect(r.state.retired).toBe(true);
    expect(step(r.state, 0, { type: "retire" }).ok).toBe(false);
  });
});

describe("다시 두기", () => {
  it("기록대로 다시 두면 같은 상태가 나온다", () => {
    const { state } = createMatch(STANDARD_RULES, 7);
    const played = playAll(state, [
      place("E5"),
      place("D5"),
      place("E4"),
      { type: "pass" },
      place("C3"),
    ]);
    const again = replay(STANDARD_RULES, 7, played.log);
    expect(again.ok && again.state).toEqual(played.state);
  });

  it("잘못된 기록은 몇 번째에서 틀렸는지 알린다", () => {
    const { state } = createMatch(STANDARD_RULES, 7);
    const black = state.blackSeat;
    const r = replay(STANDARD_RULES, 7, [
      { seat: black, action: place("E5") },
      { seat: 1 - black, action: place("E5") },
    ]);
    expect(r).toEqual({ ok: false, index: 1, error: "이미 돌이 있다" });
  });
});

describe("개인 시간", () => {
  const FAST: BadukRules = { ...STANDARD_RULES, time: "fast" };

  it("두기·쉬기에 쓴 시간만큼 준다", () => {
    const { state } = createMatch(FAST, 1);
    const black = state.blackSeat;
    expect(clockTurn(state)).toEqual({ seat: black, left: 270_000 });
    let s = must(state, black, { ...place("E5"), spent: 5_000 }).state;
    expect(s.clocks?.[black]).toEqual({ main: 175_000, periods: 3 });
    s = must(s, 1 - black, { type: "pass", spent: 2_000 }).state;
    expect(s.clocks?.[1 - black]).toEqual({ main: 178_000, periods: 3 });
  });

  it("시간이 다 되면 시간패, 남았으면 받지 않는다. 시간을 넘겨 둔 수는 두지 않는다", () => {
    const { state } = createMatch(FAST, 1);
    const black = state.blackSeat;
    expect(step(state, black, { type: "timeout", spent: 1_000 })).toEqual({
      ok: false,
      error: "아직 시간이 남았다",
    });
    const out = must(state, black, { type: "timeout", spent: 270_001 });
    expect(out.state.result).toEqual({ kind: "time", seat: 1 - black });
    const late = must(state, black, { ...place("E5"), spent: 270_001 });
    expect(late.state.result).toEqual({ kind: "time", seat: 1 - black });
    expect(late.state.board[at("E5")]).toBe(0);
  });

  it("시간 규칙이 없으면 시계가 없다", () => {
    const { state } = createMatch(STANDARD_RULES, 1);
    expect(state.clocks).toBeNull();
    expect(clockTurn(state)).toBeNull();
    expect(step(state, state.blackSeat, { type: "timeout", spent: 1 })).toEqual(
      { ok: false, error: "시간 규칙이 없다" },
    );
  });

  it("기록대로 다시 두면 시계도 같다", () => {
    const { state } = createMatch(FAST, 1);
    const played = playAll(state, [
      { ...place("E5"), spent: 7_777 },
      { type: "pass", spent: 1_234 },
    ]);
    const again = replay(FAST, 1, played.log);
    expect(again.ok && again.state).toEqual(played.state);
  });
});
