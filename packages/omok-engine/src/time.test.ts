import { describe, expect, it } from "vitest";

import { pointAt } from "./board";
import { clockTurn, createMatch, replay, seatToMove, step } from "./match";
import { decodeOmokRules, encodeOmokRules, type OmokRules } from "./rules";
import type { Action, OmokState } from "./state";

const FAST: OmokRules = { variant: "standard", winsToFinish: 2, time: "fast" };

function must(state: OmokState, seat: number, action: Action) {
  const r = step(state, seat, action);
  if (!r.ok) throw new Error(r.error);
  return r;
}

describe("오목 개인 시간", () => {
  it("시간 규칙은 규칙 문자열 꼬리(-t1)로 오가고, 없으면 예전 문자열 그대로다", () => {
    expect(encodeOmokRules(FAST)).toBe("o1-s2-t1");
    expect(decodeOmokRules("o1-s2-t1")).toEqual({ ok: true, rules: FAST });
    expect(encodeOmokRules({ variant: "free", winsToFinish: 1 })).toBe("o1-f1");
    expect(decodeOmokRules("o1-f1")).toEqual({
      ok: true,
      rules: { variant: "free", winsToFinish: 1 },
    });
  });

  it("시간 규칙이 없으면 시계가 없다", () => {
    const { state } = createMatch({ variant: "standard", winsToFinish: 1 }, 1);
    expect(state.clocks).toBeNull();
    expect(clockTurn(state)).toBeNull();
  });

  it("둔 수에 쓴 시간만큼 그 사람 기본 시간이 준다", () => {
    const { state } = createMatch(FAST, 1);
    const seat = seatToMove(state) as number;
    expect(clockTurn(state)).toEqual({ seat, left: 180_000 + 90_000 });
    const after = must(state, seat, {
      type: "place",
      at: pointAt("H8"),
      spent: 40_000,
    }).state;
    expect(after.clocks?.[seat]).toEqual({ main: 140_000, periods: 3 });
    expect(after.clocks?.[1 - seat]).toEqual({ main: 180_000, periods: 3 });
  });

  it("시간이 남았으면 시간패를 받지 않고, 다 썼으면 상대가 이긴다", () => {
    const { state } = createMatch(FAST, 1);
    const seat = seatToMove(state) as number;
    expect(step(state, seat, { type: "timeout", spent: 100_000 })).toEqual({
      ok: false,
      error: "아직 시간이 남았다",
    });
    const { state: after } = must(state, seat, {
      type: "timeout",
      spent: 270_001,
    });
    expect(after.result).toEqual({ kind: "time", seat: 1 - seat });
  });

  it("시간을 넘겨 둔 수는 두지 않고 시간패로 끝낸다", () => {
    const { state } = createMatch(FAST, 1);
    const seat = seatToMove(state) as number;
    const { state: after } = must(state, seat, {
      type: "place",
      at: pointAt("H8"),
      spent: 999_999,
    });
    expect(after.result).toEqual({ kind: "time", seat: 1 - seat });
    expect(after.moves).toEqual([]);
  });

  it("다음 판은 시계를 새로 주고, 기록대로 다시 두면 시계도 같다", () => {
    let { state } = createMatch(FAST, 1);
    const log: { seat: number; action: Action }[] = [];
    const act = (seat: number, action: Action) => {
      state = must(state, seat, action).state;
      log.push({ seat, action });
    };
    const first = seatToMove(state) as number;
    act(first, { type: "place", at: pointAt("H8"), spent: 12_345 });
    act(1 - first, { type: "timeout", spent: 270_000 });
    act(0, { type: "continue" });
    act(1, { type: "continue" });
    expect(state.clocks).toEqual([
      { main: 180_000, periods: 3 },
      { main: 180_000, periods: 3 },
    ]);
    const again = replay(FAST, 1, log);
    expect(again.ok && again.state).toEqual(state);
  });
});
