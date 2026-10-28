import { describe, expect, it } from "vitest";

import { squareAt } from "./board";
import { clockTurn, createMatch, replay, step } from "./match";
import { type ChessRules, decodeChessRules, encodeChessRules } from "./rules";
import { createChessScenario } from "./scenario";
import type { Action, ChessState } from "./state";

const FAST: ChessRules = { winsToFinish: 1, time: "fast" };

function must(state: ChessState, seat: number, action: Action) {
  const r = step(state, seat, action);
  if (!r.ok) throw new Error(r.error);
  return r;
}

const move = (from: string, to: string, spent: number): Action => ({
  type: "move",
  from: squareAt(from),
  to: squareAt(to),
  spent,
});

describe("체스 개인 시간", () => {
  it("시간 규칙은 규칙 문자열 꼬리로 오간다", () => {
    expect(encodeChessRules(FAST)).toBe("c1-w1-t1");
    expect(decodeChessRules("c1-w1-t1")).toEqual({ ok: true, rules: FAST });
  });

  it("둔 사람 시계만 쓴 시간만큼 준다", () => {
    const { state } = createMatch(FAST, 1);
    const white = state.whiteSeat;
    expect(clockTurn(state)).toEqual({ seat: white, left: 270_000 });
    const after = must(state, white, move("e2", "e4", 5_000)).state;
    expect(after.clocks?.[white]).toEqual({ main: 175_000, periods: 3 });
    expect(after.clocks?.[1 - white]).toEqual({ main: 180_000, periods: 3 });
    expect(clockTurn(after)?.seat).toBe(1 - white);
  });

  it("시간을 넘겨 둔 수는 두지 않고 시간패로 끝낸다", () => {
    const { state } = createMatch(FAST, 1);
    const white = state.whiteSeat;
    const late = must(state, white, move("e2", "e4", 270_001));
    expect(late.state.result).toEqual({ kind: "time", seat: 1 - white });
    expect(late.state.played).toEqual([]);
  });

  it("시간이 다 되면 시간패, 남았으면 받지 않는다", () => {
    const { state } = createMatch(FAST, 1);
    const white = state.whiteSeat;
    expect(step(state, white, { type: "timeout", spent: 1_000 })).toEqual({
      ok: false,
      error: "아직 시간이 남았다",
    });
    const end = must(state, white, { type: "timeout", spent: 270_001 });
    expect(end.state.result).toEqual({ kind: "time", seat: 1 - white });
    expect(end.state.clocks?.[white]).toEqual({ main: 0, periods: 0 });
  });

  it("상대가 킹만 남았으면 내 시간이 다 돼도 비긴다(FIDE 6.9)", () => {
    const scene = createChessScenario({
      fen: "4k3/8/8/8/8/8/8/Q3K3 w - - 0 1",
      rules: FAST,
    });
    const state = {
      ...scene,
      clocks: [
        { main: 1_000, periods: 0 },
        { main: 1_000, periods: 0 },
      ],
    };
    const end = must(state, 0, { type: "timeout", spent: 1_001 });
    expect(end.state.result).toEqual({ kind: "draw", reason: "timeout" });
  });

  it("기록대로 다시 두면 시계도 같다", () => {
    let { state } = createMatch(FAST, 1);
    const white = state.whiteSeat;
    const log = [
      { seat: white, action: move("e2", "e4", 7_777) },
      { seat: 1 - white, action: move("e7", "e5", 1_234) },
    ];
    for (const e of log) state = must(state, e.seat, e.action).state;
    const again = replay(FAST, 1, log);
    expect(again.ok && again.state).toEqual(state);
  });
});
