import { describe, expect, it } from "vitest";

import { chainCommit, chainLink, derivedSeed } from "./chain";
import { clockTurn, createMatch, legalMoves, replay, step } from "./match";
import {
  decodeYutRules,
  encodeYutRules,
  STANDARD_RULES,
  TEAM_RULES,
  type YutRules,
} from "./rules";
import type { Action, YutState } from "./state";

const FAST: YutRules = { ...STANDARD_RULES, time: "fast" };

function chainAction(state: YutState, seat: number): Action {
  const seed = derivedSeed(state.keys[seat] as string, state.generation);
  if (state.phase === "commit")
    return { type: "commit", hash: chainCommit(seed) };
  const used = state.chains[seat]?.used ?? 0;
  return { type: "reveal", link: chainLink(seed, used + 1) };
}

function must(state: YutState, seat: number, action: Action): YutState {
  const result = step(state, seat, action);
  if (!result.ok) throw new Error(`${result.error}: ${JSON.stringify(action)}`);
  return result.state;
}

/** 모두 약속해 첫 던지기 차례까지 */
function started(rules: YutRules, seed: number): YutState {
  let { state } = createMatch(rules, seed);
  for (let s = 0; s < rules.players; s++)
    state = must(state, s, chainAction(state, s));
  return state;
}

/** 모든 자리가 고리를 공개한다 */
function revealAll(state: YutState): YutState {
  let next = state;
  for (let s = 0; s < next.rules.players; s++)
    next = must(next, s, chainAction(next, s));
  return next;
}

/** 첫 던지기가 윷·모로 나오는 시드(결정적으로 찾는다) */
function bonusSeed(): number {
  for (let seed = 1; seed < 500; seed++) {
    const state = started(FAST, seed);
    const thrown = revealAll(must(state, state.turn, { type: "throw" }));
    if (thrown.phase === "throw" && thrown.turn === state.turn) return seed;
  }
  throw new Error("윷·모로 시작하는 시드가 없다");
}

describe("윷놀이 개인 시간", () => {
  it("시간 규칙은 규칙 문자열 꼬리(-t1)로 오가고, 없으면 예전 문자열 그대로다", () => {
    expect(encodeYutRules(FAST)).toBe("y1-2s4b6p-t1");
    expect(decodeYutRules("y1-2s4b6p-t1")).toEqual({ ok: true, rules: FAST });
    expect(encodeYutRules(STANDARD_RULES)).toBe("y1-2s4b6p");
    expect(decodeYutRules("y1-2s4b6p")).toEqual({
      ok: true,
      rules: STANDARD_RULES,
    });
    expect(decodeYutRules("y1-2s4b6p-t9").ok).toBe(false);
  });

  it("시간 규칙이 없으면 시계가 없다", () => {
    const state = started(STANDARD_RULES, 3);
    expect(state.clocks).toBeNull();
    expect(clockTurn(state)).toBeNull();
  });

  it("던지기에 쓴 시간이 깎이고, 모두가 고리를 공개하는 동안은 시계가 서 있다", () => {
    const { state: fresh } = createMatch(FAST, 3);
    expect(clockTurn(fresh)).toBeNull();
    const state = started(FAST, 3);
    const seat = state.turn;
    expect(clockTurn(state)).toEqual({ seat, left: 180_000 + 90_000 });
    const thrown = must(state, seat, { type: "throw", spent: 40_000 });
    expect(thrown.clocks?.[seat]).toEqual({ main: 140_000, periods: 3 });
    expect(thrown.clocks?.[1 - seat]).toEqual({ main: 180_000, periods: 3 });
    expect(clockTurn(thrown)).toBeNull();
  });

  it("말 움직이기도 따로 깎이고, 초읽기 안에 고르면 횟수가 남는다", () => {
    const state = started(FAST, 3);
    const seat = state.turn;
    // 기본 시간을 다 쓰고 초읽기 10초 안쪽에 던진다.
    const thrown = must(state, seat, { type: "throw", spent: 190_000 });
    expect(thrown.clocks?.[seat]).toEqual({ main: 0, periods: 3 });
    let next = revealAll(thrown);
    if (next.phase === "throw")
      next = revealAll(must(next, seat, { type: "throw" }));
    expect(next.phase).toBe("move");
    expect(clockTurn(next)).toEqual({ seat, left: 90_000 });
    const option = legalMoves(next)[0];
    if (!option) throw new Error("움직일 수가 없다");
    // 초읽기 한 번(30초)을 넘기면 하나 준다.
    const moved = must(next, seat, {
      type: "move",
      value: option.value,
      from: option.from,
      spent: 45_000,
    });
    expect(moved.clocks?.[seat]).toEqual({ main: 0, periods: 2 });
  });

  it("윷·모로 한 번 더 던질 때도 같은 사람의 시계가 이어서 간다", () => {
    const state = started(FAST, bonusSeed());
    const seat = state.turn;
    const again = revealAll(
      must(state, seat, { type: "throw", spent: 20_000 }),
    );
    expect(again.phase).toBe("throw");
    expect(clockTurn(again)).toEqual({ seat, left: 160_000 + 90_000 });
    const second = must(again, seat, { type: "throw", spent: 15_000 });
    expect(second.clocks?.[seat]).toEqual({ main: 145_000, periods: 3 });
  });

  it("시간이 남았으면 시간패를 받지 않고, 다 썼으면 그 사람이 진다", () => {
    const state = started(FAST, 3);
    const seat = state.turn;
    expect(step(state, seat, { type: "timeout", spent: 100_000 })).toEqual({
      ok: false,
      error: "아직 시간이 남았다",
    });
    expect(step(state, 1 - seat, { type: "timeout", spent: 999_999 }).ok).toBe(
      false,
    );
    const after = must(state, seat, { type: "timeout", spent: 270_001 });
    expect(after.result).toEqual({ kind: "time", seat, side: 1 - seat });
    expect(after.clocks?.[seat]).toEqual({ main: 0, periods: 0 });
  });

  it("공개를 기다리는 동안에는 시간패를 받지 않는다", () => {
    const state = started(FAST, 3);
    const thrown = must(state, state.turn, { type: "throw" });
    expect(
      step(thrown, state.turn, { type: "timeout", spent: 999_999 }).ok,
    ).toBe(false);
  });

  it("시간을 넘겨 던지면 던지지 않고 시간패로 끝낸다", () => {
    const state = started(FAST, 3);
    const seat = state.turn;
    const after = must(state, seat, { type: "throw", spent: 999_999 });
    expect(after.result).toEqual({ kind: "time", seat, side: 1 - seat });
    expect(after.throwCount).toBe(0);
  });

  it("편 놀이는 사람마다 시계가 있고, 시간을 다 쓴 사람의 편이 진다", () => {
    const rules: YutRules = { ...TEAM_RULES, time: "fast" };
    const state = started(rules, 3);
    expect(state.clocks).toHaveLength(4);
    const seat = state.turn;
    const after = must(state, seat, { type: "timeout", spent: 270_001 });
    expect(after.result).toEqual({ kind: "time", seat, side: 1 - (seat % 2) });
  });

  it("기록대로 다시 두면 시계도 같다", () => {
    let state = createMatch(FAST, 3).state;
    const log: { seat: number; action: Action }[] = [];
    const act = (seat: number, action: Action) => {
      state = must(state, seat, action);
      log.push({ seat, action });
    };
    for (let s = 0; s < 2; s++) act(s, chainAction(state, s));
    act(state.turn, { type: "throw", spent: 12_345 });
    for (let s = 0; s < 2; s++) act(s, chainAction(state, s));
    const again = replay(FAST, 3, log);
    expect(again.ok && again.state).toEqual(state);
  });
});
