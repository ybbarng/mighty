import { describe, expect, it } from "vitest";

import { indexOf } from "./board";
import {
  createMatch,
  pendingSeats,
  replay,
  seatToMove,
  step,
  viewOf,
} from "./match";
import { decodeOmokRules, encodeOmokRules, type OmokRules } from "./rules";
import type { Action, OmokState } from "./state";

const ONE: OmokRules = { variant: "standard", winsToFinish: 1 };
const TWO: OmokRules = { variant: "standard", winsToFinish: 2 };

function must(state: OmokState, seat: number, action: Action): OmokState {
  const result = step(state, seat, action);
  if (!result.ok) throw new Error(result.error);
  return result.state;
}

/** 흑이 가로 H8부터 다섯, 백은 그 아래 줄에 넷을 두는 수순. 흑이 이긴다 */
function blackWins(state: OmokState): OmokState {
  let s = state;
  for (let i = 0; i < 5; i++) {
    s = must(s, seatToMove(s) as number, {
      type: "place",
      at: indexOf(3 + i, 7),
    });
    if (i < 4)
      s = must(s, seatToMove(s) as number, {
        type: "place",
        at: indexOf(3 + i, 9),
      });
  }
  return s;
}

describe("오목 진행", () => {
  it("흑이 먼저, 번갈아 둔다", () => {
    const { state } = createMatch(ONE, 7);
    const black = state.blackSeat;
    expect(pendingSeats(state)).toEqual([black]);
    const wrong = step(state, 1 - black, { type: "place", at: 0 });
    expect(wrong.ok).toBe(false);
    const next = must(state, black, { type: "place", at: indexOf(7, 7) });
    expect(next.board[indexOf(7, 7)]).toBe(1);
    expect(pendingSeats(next)).toEqual([1 - black]);
    const occupied = step(next, 1 - black, {
      type: "place",
      at: indexOf(7, 7),
    });
    expect(occupied).toEqual({ ok: false, error: "이미 돌이 있다" });
  });

  it("첫 판 흑은 시드에 따라 두 자리 모두 나온다", () => {
    const seats = new Set(
      Array.from({ length: 20 }, (_, i) => createMatch(ONE, i).state.blackSeat),
    );
    expect(seats).toEqual(new Set([0, 1]));
  });

  it("다섯을 만들면 그 판을 이기고, 한 판 승부면 게임이 끝난다", () => {
    const { state } = createMatch(ONE, 1);
    const end = blackWins(state);
    expect(end.phase).toBe("gameOver");
    expect(end.result).toMatchObject({
      kind: "five",
      seat: state.blackSeat,
      stone: 1,
    });
    expect(end.wins[state.blackSeat]).toBe(1);
    expect(pendingSeats(end)).toEqual([]);
  });

  it("여러 판: 둘 다 다음 판을 누르면 흑백을 바꿔 새 판", () => {
    const { state } = createMatch(TWO, 1);
    const end = blackWins(state);
    expect(end.phase).toBe("roundEnd");
    expect(pendingSeats(end)).toEqual([0, 1]);
    const one = must(end, 0, { type: "continue" });
    expect(one.phase).toBe("roundEnd");
    const result = step(one, 1, { type: "continue" });
    if (!result.ok) throw new Error(result.error);
    expect(result.state.phase).toBe("play");
    expect(result.state.blackSeat).toBe(1 - state.blackSeat);
    expect(result.state.moves).toEqual([]);
    expect(result.events[0]).toMatchObject({
      type: "roundStarted",
      roundNumber: 2,
    });
  });

  it("금지 수는 둘 수 없다", () => {
    const { state } = createMatch(ONE, 1);
    const b = state.blackSeat;
    const w = 1 - b;
    let s = state;
    // 흑: H7, H6, I8, J8 → H8이 3·3. 백은 멀리 둔다.
    const blacks = [indexOf(7, 6), indexOf(7, 5), indexOf(8, 7), indexOf(9, 7)];
    const whites = [indexOf(0, 0), indexOf(0, 2), indexOf(0, 4), indexOf(0, 6)];
    for (let i = 0; i < 4; i++) {
      s = must(s, b, { type: "place", at: blacks[i] as number });
      s = must(s, w, { type: "place", at: whites[i] as number });
    }
    expect(step(s, b, { type: "place", at: indexOf(7, 7) })).toEqual({
      ok: false,
      error: "3·3 금지",
    });
    expect(viewOf(s, b).forbidden).toContainEqual({
      at: indexOf(7, 7),
      reason: "3·3",
    });
    expect(viewOf(s, w).forbidden).toEqual([]);
  });

  it("기권하면 상대가 그 판을 이긴다", () => {
    const { state } = createMatch(ONE, 1);
    const end = must(state, 0, { type: "resign" });
    expect(end.result).toEqual({ kind: "resign", seat: 1 });
    expect(end.phase).toBe("gameOver");
  });

  it("끝내기(retire)는 게임을 바로 끝낸다", () => {
    const { state } = createMatch(TWO, 1);
    const result = step(state, 0, { type: "retire" });
    expect(result.ok && result.state.retired).toBe(true);
  });

  it("기록대로 다시 두면 같은 상태가 된다", () => {
    const { state } = createMatch(TWO, 3);
    const log: { seat: number; action: Action }[] = [];
    let s = state;
    for (let i = 0; i < 6; i++) {
      const seat = seatToMove(s) as number;
      const action: Action = { type: "place", at: indexOf(i, i % 3) };
      log.push({ seat, action });
      s = must(s, seat, action);
    }
    const again = replay(TWO, 3, log);
    expect(again.ok && again.state).toEqual(s);
    const broken = replay(TWO, 3, [
      ...log,
      { seat: 0, action: { type: "place", at: 0 } },
    ]);
    expect(broken.ok).toBe(false);
  });
});

describe("규칙 문자열", () => {
  it("부호화하고 다시 읽는다", () => {
    for (const variant of ["standard", "free", "renju"] as const)
      for (const winsToFinish of [1, 3, 5]) {
        const rules = { variant, winsToFinish };
        expect(decodeOmokRules(encodeOmokRules(rules))).toEqual({
          ok: true,
          rules,
        });
      }
    expect(encodeOmokRules(ONE)).toBe("o1-s1");
    expect(decodeOmokRules("o1-x1").ok).toBe(false);
    expect(decodeOmokRules("o1-s9").ok).toBe(false);
  });
});
