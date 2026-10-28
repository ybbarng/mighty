import { describe, expect, it } from "vitest";

import { pointAt } from "./board";
import { clockTurn, createMatch, replay, step } from "./match";
import {
  decodeJanggiRules,
  encodeJanggiRules,
  type JanggiRules,
} from "./rules";
import type { Action, JanggiState } from "./state";

const FAST: JanggiRules = { bikjang: "score", winsToFinish: 1, time: "fast" };

function must(state: JanggiState, seat: number, action: Action) {
  const r = step(state, seat, action);
  if (!r.ok) throw new Error(r.error);
  return r;
}

/** 상차림을 마친 판(시계는 상차림에 쓰지 않는다) */
function started() {
  let { state } = createMatch(FAST, 1);
  const log: { seat: number; action: Action }[] = [];
  const act = (seat: number, action: Action) => {
    state = must(state, seat, action).state;
    log.push({ seat, action });
  };
  act(1 - state.choSeat, { type: "setup", setup: "NENE" });
  act(state.choSeat, { type: "setup", setup: "NENE" });
  return { state, log, act, get: () => state };
}

describe("장기 개인 시간", () => {
  it("시간 규칙은 규칙 문자열 꼬리로 오간다", () => {
    expect(encodeJanggiRules(FAST)).toBe("j1-s1-t1");
    expect(decodeJanggiRules("j1-s1-t1")).toEqual({ ok: true, rules: FAST });
    expect(decodeJanggiRules("j1-s1")).toEqual({
      ok: true,
      rules: { bikjang: "score", winsToFinish: 1 },
    });
  });

  it("상차림 때는 시계가 가지 않고, 두기에서 쓴 시간만큼 준다", () => {
    const { state } = createMatch(FAST, 1);
    expect(clockTurn(state)).toBeNull();
    const s = started();
    const cho = s.get().choSeat;
    expect(clockTurn(s.get())).toEqual({ seat: cho, left: 270_000 });
    s.act(cho, {
      type: "move",
      from: pointAt("71"),
      to: pointAt("61"),
      spent: 5_000,
    });
    expect(s.get().clocks?.[cho]).toEqual({ main: 175_000, periods: 3 });
    // 쉬기도 시간을 쓴다.
    s.act(1 - cho, { type: "pass", spent: 2_000 });
    expect(s.get().clocks?.[1 - cho]).toEqual({ main: 178_000, periods: 3 });
  });

  it("시간이 다 되면 시간패, 남았으면 받지 않는다", () => {
    const s = started();
    const cho = s.get().choSeat;
    expect(step(s.get(), cho, { type: "timeout", spent: 1_000 })).toEqual({
      ok: false,
      error: "아직 시간이 남았다",
    });
    s.act(cho, { type: "timeout", spent: 270_001 });
    expect(s.get().result).toEqual({ kind: "time", seat: 1 - cho });
  });

  it("기록대로 다시 두면 시계도 같다", () => {
    const s = started();
    const cho = s.get().choSeat;
    s.act(cho, {
      type: "move",
      from: pointAt("71"),
      to: pointAt("61"),
      spent: 7_777,
    });
    const again = replay(FAST, 1, s.log);
    expect(again.ok && again.state).toEqual(s.get());
  });
});
