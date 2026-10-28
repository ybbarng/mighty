import { describe, expect, it } from "vitest";

import { type Position, sanToMove, squareAt } from "./board";
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
  type ChessRules,
  decodeChessRules,
  encodeChessRules,
  STANDARD_RULES,
} from "./rules";
import { createChessScenario } from "./scenario";
import type { Action, ChessState } from "./state";

function must(state: ChessState, seat: number, action: Action) {
  const result = step(state, seat, action);
  if (!result.ok) throw new Error(result.error);
  return result;
}

/** 기보 한 수를 둘 차례인 자리로 둔다 */
function san(state: ChessState, text: string) {
  const move = sanToMove(state.position as Position, text);
  if (!move) throw new Error(`둘 수 없는 수: ${text}`);
  return must(state, seatToMove(state) as number, { type: "move", ...move });
}

function playLine(state: ChessState, line: string[]) {
  let s = state;
  for (const text of line) s = san(s, text).state;
  return s;
}

describe("규칙 문자열", () => {
  it("이길 판 수와 시간을 오가고, 엉뚱한 글은 거절한다", () => {
    const rules: ChessRules = { winsToFinish: 3, time: "normal" };
    expect(encodeChessRules(STANDARD_RULES)).toBe("c1-w1");
    expect(encodeChessRules(rules)).toBe("c1-w3-t2");
    expect(decodeChessRules("c1-w3-t2")).toEqual({ ok: true, rules });
    expect(decodeChessRules("c1-w1")).toEqual({
      ok: true,
      rules: STANDARD_RULES,
    });
    for (const bad of ["c1-w0", "c1-w6", "c2-w1", "j1-s1", "c1-w1-t9", ""])
      expect(decodeChessRules(bad).ok).toBe(false);
  });
});

describe("차례와 수 두기", () => {
  it("백이 먼저 두고, 남의 차례나 갈 수 없는 곳은 거절한다", () => {
    const { state } = createMatch(STANDARD_RULES, 1);
    const white = state.whiteSeat;
    expect(seatToMove(state)).toBe(white);
    const e4: Action = {
      type: "move",
      from: squareAt("e2"),
      to: squareAt("e4"),
    };
    expect(step(state, 1 - white, e4)).toEqual({
      ok: false,
      error: "차례가 아니다",
    });
    expect(
      step(state, white, {
        type: "move",
        from: squareAt("e2"),
        to: squareAt("e5"),
      }),
    ).toEqual({ ok: false, error: "둘 수 없는 수다" });
    const after = must(state, white, e4);
    expect(after.events[0]).toMatchObject({ type: "moved", san: "e4" });
    expect(seatToMove(after.state)).toBe(1 - white);
  });

  it("화면에는 내 차례일 때만 둘 수 있는 수가 실린다", () => {
    const { state } = createMatch(STANDARD_RULES, 1);
    expect(viewOf(state, state.whiteSeat).legal).toHaveLength(20);
    expect(viewOf(state, 1 - state.whiteSeat).legal).toEqual([]);
    expect(viewOf(state, state.whiteSeat).decision).toEqual({ kind: "move" });
  });

  it("킹을 체크로 남기는 수는 까닭을 알려 거절한다", () => {
    const state = createChessScenario({
      fen: "4k3/4r3/8/8/8/8/4N3/4K3 w - - 0 1",
    });
    expect(
      step(state, 0, {
        type: "move",
        from: squareAt("e2"),
        to: squareAt("c3"),
      }),
    ).toEqual({ ok: false, error: "킹이 잡히게 되는 수는 둘 수 없다" });
  });

  it("승급은 기물을 골라야 하고, 고른 기물로 바뀐다", () => {
    const state = createChessScenario({
      fen: "8/4P1k1/8/8/8/8/8/4K3 w - - 0 1",
    });
    const base = {
      type: "move" as const,
      from: squareAt("e7"),
      to: squareAt("e8"),
    };
    expect(step(state, 0, base)).toEqual({
      ok: false,
      error: "폰이 끝줄에 닿으면 바꿀 기물을 골라야 한다",
    });
    const after = must(state, 0, { ...base, promotion: "R" });
    expect(after.state.position.board[squareAt("e8")]).toBe("wR");
    expect(after.state.played[0]?.san).toBe("e8=R");
    // 킹 수에 승급을 붙이면 거절한다.
    const king = {
      type: "move" as const,
      from: squareAt("e1"),
      to: squareAt("e2"),
    };
    expect(step(state, 0, { ...king, promotion: "Q" })).toEqual({
      ok: false,
      error: "승급할 수 없는 수다",
    });
  });
});

describe("판 끝", () => {
  it("바보 메이트: 흑이 체크메이트로 이긴다", () => {
    const { state } = createMatch(STANDARD_RULES, 2);
    const end = playLine(state, ["f3", "e5", "g4"]);
    const mate = san(end, "Qh4#");
    expect(mate.events.map((e) => e.type)).toEqual([
      "moved",
      "check",
      "roundEnded",
      "gameEnded",
    ]);
    expect(mate.state.result).toEqual({
      kind: "checkmate",
      seat: 1 - state.whiteSeat,
    });
    expect(mate.state.phase).toBe("gameOver");
  });

  it("스테일메이트는 비긴다", () => {
    const state = createChessScenario({
      fen: "7k/8/6Q1/8/8/8/8/K7 w - - 0 1",
    });
    const end = san(state, "Qf7");
    expect(end.state.result).toEqual({ kind: "draw", reason: "stalemate" });
    expect(end.state.draws).toBe(1);
  });

  it("마지막 폰을 잡아 기물이 모자라면 비긴다", () => {
    const state = createChessScenario({
      fen: "8/8/8/4k3/4P3/8/8/6NK b - - 0 1",
    });
    const end = san(state, "Kxe4");
    expect(end.state.result).toEqual({ kind: "draw", reason: "material" });
  });

  it("같은 판이 세 번 나오면 비긴다", () => {
    const { state } = createMatch(STANDARD_RULES, 1);
    const shuffle = ["Nf3", "Nf6", "Ng1", "Ng8"];
    const twice = playLine(state, [...shuffle, ...shuffle.slice(0, 3)]);
    expect(twice.phase).toBe("play");
    const end = san(twice, "Ng8");
    expect(end.state.result).toEqual({ kind: "draw", reason: "repetition" });
  });

  it("50수 동안 폰도 잡기도 없으면 비긴다", () => {
    const state = createChessScenario({
      fen: "4k3/8/8/8/8/8/8/R3K3 w - - 99 80",
    });
    const end = san(state, "Ra2");
    expect(end.state.result).toEqual({ kind: "draw", reason: "fifty" });
  });

  it("여러 판이면 판마다 백을 바꾸고, 먼저 정한 판 수를 이기면 끝난다", () => {
    const rules: ChessRules = { winsToFinish: 2 };
    let { state } = createMatch(rules, 3);
    const first = state.whiteSeat;
    state = must(state, first, { type: "resign" }).state;
    expect(state.phase).toBe("roundEnd");
    expect(state.wins[1 - first]).toBe(1);
    expect(step(state, 0, { type: "resign" }).ok).toBe(false);
    state = must(state, 0, { type: "continue" }).state;
    expect(step(state, 0, { type: "continue" })).toEqual({
      ok: false,
      error: "이미 눌렀다",
    });
    const next = must(state, 1, { type: "continue" });
    expect(next.events[0]).toEqual({
      type: "roundStarted",
      roundNumber: 2,
      whiteSeat: 1 - first,
    });
    state = must(next.state, first, { type: "resign" }).state;
    expect(state.phase).toBe("gameOver");
    expect(sideOfSeat(state, 1 - first)).toBe("w");
  });

  it("그만두기(retire)는 끝나지 않은 게임을 바로 끝낸다", () => {
    const { state } = createMatch(STANDARD_RULES, 1);
    const end = must(state, 0, { type: "retire" });
    expect(end.state.phase).toBe("gameOver");
    expect(end.state.retired).toBe(true);
    expect(step(end.state, 0, { type: "retire" }).ok).toBe(false);
  });
});

describe("다시 두기", () => {
  it("기록대로 다시 두면 같은 판이 나오고, 틀린 기록은 몇 번째에서 틀렸는지 알린다", () => {
    let { state } = createMatch(STANDARD_RULES, 5);
    const log: LoggedAction[] = [];
    for (const text of ["e4", "c5", "Nf3", "d6", "d4", "cxd4"]) {
      const move = sanToMove(state.position, text);
      if (!move) throw new Error(text);
      const seat = seatToMove(state) as number;
      const action: Action = { type: "move", ...move };
      state = must(state, seat, action).state;
      log.push({ seat, action });
    }
    const again = replay(STANDARD_RULES, 5, log);
    expect(again.ok && again.state).toEqual(state);
    const broken = [...log];
    broken[2] = { seat: broken[2]?.seat ?? 0, action: { type: "resign" } };
    broken.push(log[2] as LoggedAction);
    expect(replay(STANDARD_RULES, 5, broken)).toMatchObject({
      ok: false,
      index: 3,
    });
  });
});
