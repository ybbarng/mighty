import { createRng, nextInt } from "@mighty/engine";

import { DONE, HOME, travel } from "./board";
import {
  CHAIN_LENGTH,
  chainHash,
  LINK_PATTERN,
  type Sticks,
  seatKey,
  sticksFrom,
  valueOfSticks,
} from "./chain";
import {
  isBonusThrow,
  sideCount,
  sideOf,
  type ThrowValue,
  type YutRules,
} from "./rules";
import type {
  Action,
  Decision,
  GameEvent,
  GameResult,
  MoveOption,
  Piece,
  YutState,
  YutView,
} from "./state";

export type StepResult =
  | { ok: true; state: YutState; events: GameEvent[] }
  | { ok: false; error: string };

/** 첫 차례는 시드로 정한다 */
export function createMatch(
  rules: YutRules,
  seed: number,
): { state: YutState; events: GameEvent[] } {
  const turn = nextInt(createRng(seed), rules.players);
  const pieces: Piece[] = [];
  for (let side = 0; side < sideCount(rules); side++)
    for (let i = 0; i < rules.pieces; i++)
      pieces.push({ side, point: HOME, trail: [] });
  const seats = Array.from({ length: rules.players }, (_, s) => s);
  const state: YutState = {
    rules,
    roundNumber: 1,
    phase: "commit",
    turn,
    pieces,
    pending: [],
    throwsLeft: 1,
    throwCount: 0,
    generation: 0,
    chains: seats.map(() => ({ commit: null, last: null, used: 0 })),
    reveals: seats.map(() => null),
    lastThrow: null,
    result: null,
    keys: seats.map((s) => seatKey(seed, s)),
  };
  return { state, events: [{ type: "gameStarted", turn }] };
}

/** 지금 결정해야 하는 자리들 */
export function pendingSeats(state: YutState): number[] {
  const seats = state.chains.map((_, s) => s);
  switch (state.phase) {
    case "commit":
      return seats.filter((s) => state.chains[s]?.commit === null);
    case "throw":
    case "move":
      return [state.turn];
    case "reveal":
      return seats.filter((s) => state.reveals[s] === null);
    default:
      return [];
  }
}

/** 이 편의 말들(번호와 함께) */
function piecesOfSide(
  state: Pick<YutState, "pieces">,
  side: number,
): { piece: Piece; index: number }[] {
  return state.pieces
    .map((piece, index) => ({ piece, index }))
    .filter((p) => p.piece.side === side);
}

/** 지금 차례 편이 모아 둔 결과로 둘 수 있는 수 */
export function legalMoves(
  state: Pick<YutState, "pieces" | "pending" | "turn" | "rules">,
): MoveOption[] {
  const side = sideOf(state.rules, state.turn);
  const mine = piecesOfSide(state, side);
  const options: MoveOption[] = [];
  const values = [...new Set(state.pending)];
  for (const value of values) {
    const froms = new Set<number>();
    for (const { piece } of mine) {
      if (piece.point === DONE) continue;
      if (piece.point === HOME && value < 0) continue;
      froms.add(piece.point);
    }
    for (const from of froms) {
      const sample = mine.find((p) => p.piece.point === from)?.piece;
      if (!sample) continue;
      const moved = travel(sample, value, state.rules.landOnHome);
      if (!moved) continue;
      const to = moved.to.point;
      const onTarget = (p: Piece) => to >= 0 && p.point === to;
      const captures = moved.finished
        ? 0
        : state.pieces.filter((p) => p.side !== side && onTarget(p)).length;
      const stacks = moved.finished
        ? 0
        : state.pieces.filter(
            (p) => p.side === side && onTarget(p) && p.point !== from,
          ).length;
      options.push({
        value,
        from,
        to: moved.finished ? DONE : to,
        path: moved.path,
        finished: moved.finished,
        captures,
        stacks,
      });
    }
  }
  return options;
}

function clone(state: YutState): YutState {
  return {
    ...state,
    pieces: state.pieces.map((p) => ({ ...p, trail: [...p.trail] })),
    pending: [...state.pending],
    chains: state.chains.map((c) => ({ ...c })),
    reveals: [...state.reveals],
    lastThrow: state.lastThrow
      ? { ...state.lastThrow, sticks: [...state.lastThrow.sticks] as Sticks }
      : null,
    keys: [...state.keys],
  };
}

function fail(error: string): StepResult {
  return { ok: false, error };
}

/** 두 편 놀이면 상대 편, 여럿이면 이긴 편이 없다 */
function otherSide(state: YutState, side: number): number | null {
  return sideCount(state.rules) === 2 ? 1 - side : null;
}

function endGame(
  state: YutState,
  result: GameResult,
  events: GameEvent[],
  retired = false,
): void {
  state.result = result;
  state.phase = "gameOver";
  if (retired) state.retired = true;
  events.push({
    type: "gameEnded",
    result,
    ...(retired ? { retired: true } : {}),
  });
}

/** 던지기 전에: 사슬을 다 쓴 자리가 있으면 모두 다시 약속한다 */
function toThrowPhase(state: YutState, events: GameEvent[]): void {
  if (state.chains.some((c) => c.used >= CHAIN_LENGTH)) {
    state.generation += 1;
    state.chains = state.chains.map(() => ({
      commit: null,
      last: null,
      used: 0,
    }));
    state.phase = "commit";
    events.push({ type: "recommit", generation: state.generation });
    return;
  }
  state.phase = "throw";
}

function startTurn(state: YutState, seat: number, events: GameEvent[]): void {
  state.turn = seat;
  state.pending = [];
  state.throwsLeft = 1;
  events.push({ type: "turnStarted", seat });
  toThrowPhase(state, events);
}

/**
 * 던지기·움직이기 뒤에 다음 할 일을 정한다: 던지기가 남았으면 던지고, 쓸 결과가 있으면 움직이고,
 * 남은 결과를 아무 말에도 쓸 수 없으면 버리고 차례를 넘긴다
 */
function settle(state: YutState, events: GameEvent[]): void {
  if (state.throwsLeft > 0) {
    toThrowPhase(state, events);
    return;
  }
  if (state.pending.length > 0) {
    if (legalMoves(state).length > 0) {
      state.phase = "move";
      return;
    }
    events.push({
      type: "discarded",
      seat: state.turn,
      values: [...state.pending],
    });
    state.pending = [];
  }
  startTurn(state, (state.turn + 1) % state.rules.players, events);
}

/** 끝내기: 약속·공개를 기다리던 사람이 하나뿐이면 그 사람의 편이 진다 */
function retire(state: YutState): StepResult {
  if (state.phase === "gameOver") return fail("이미 끝난 게임이다");
  const next = clone(state);
  const events: GameEvent[] = [];
  const pending = pendingSeats(state);
  const waiting =
    (state.phase === "commit" || state.phase === "reveal") &&
    pending.length === 1;
  if (waiting) {
    const seat = pending[0] as number;
    endGame(
      next,
      {
        kind: "forfeit",
        seat,
        side: otherSide(state, sideOf(state.rules, seat)),
      },
      events,
      true,
    );
  } else {
    next.phase = "gameOver";
    next.retired = true;
    events.push({ type: "gameEnded", result: null, retired: true });
  }
  return { ok: true, state: next, events };
}

/** 모든 자리 고리가 모였다: 가락을 정하고 결과를 모은다 */
function resolveThrow(state: YutState, events: GameEvent[]): void {
  const links = state.reveals as string[];
  const index = state.throwCount;
  const sticks = sticksFrom(index, links, state.rules.flatPercent);
  const value = valueOfSticks(sticks, state.rules);
  const bonus = isBonusThrow(value);
  state.throwCount += 1;
  state.reveals = state.reveals.map(() => null);
  state.pending.push(value);
  state.throwsLeft += bonus ? 0 : -1;
  state.lastThrow = { seat: state.turn, index, sticks, value };
  events.push({
    type: "result",
    seat: state.turn,
    index,
    sticks,
    value,
    bonus,
  });
  settle(state, events);
}

export function step(
  state: YutState,
  seat: number,
  action: Action,
): StepResult {
  if (!Number.isInteger(seat) || seat < 0 || seat >= state.rules.players)
    return fail("없는 자리다");
  switch (action.type) {
    case "retire":
      return retire(state);
    case "resign": {
      if (state.phase === "gameOver") return fail("이미 끝난 게임이다");
      const next = clone(state);
      const events: GameEvent[] = [];
      endGame(
        next,
        {
          kind: "resign",
          seat,
          side: otherSide(state, sideOf(state.rules, seat)),
        },
        events,
      );
      return { ok: true, state: next, events };
    }
    case "commit": {
      if (state.phase !== "commit") return fail("약속할 때가 아니다");
      const chain = state.chains[seat];
      if (!chain || chain.commit !== null) return fail("이미 약속했다");
      if (typeof action.hash !== "string" || !LINK_PATTERN.test(action.hash))
        return fail("약속 형식이 아니다");
      const next = clone(state);
      next.chains[seat] = { commit: action.hash, last: action.hash, used: 0 };
      const events: GameEvent[] = [{ type: "committed", seat }];
      if (next.chains.every((c) => c.commit !== null)) next.phase = "throw";
      return { ok: true, state: next, events };
    }
    case "throw": {
      if (state.phase !== "throw") return fail("던질 때가 아니다");
      if (state.turn !== seat) return fail("차례가 아니다");
      const next = clone(state);
      next.phase = "reveal";
      next.reveals = next.reveals.map(() => null);
      return { ok: true, state: next, events: [{ type: "thrown", seat }] };
    }
    case "reveal": {
      if (state.phase !== "reveal") return fail("공개할 때가 아니다");
      if (state.reveals[seat] !== null) return fail("이미 공개했다");
      const chain = state.chains[seat];
      if (!chain?.last) return fail("약속이 없다");
      if (typeof action.link !== "string" || !LINK_PATTERN.test(action.link))
        return fail("고리 형식이 아니다");
      if (chainHash(action.link) !== chain.last)
        return fail("약속한 사슬의 다음 고리가 아니다");
      const next = clone(state);
      next.reveals[seat] = action.link;
      next.chains[seat] = {
        commit: chain.commit,
        last: action.link,
        used: chain.used + 1,
      };
      const events: GameEvent[] = [{ type: "revealed", seat }];
      if (next.reveals.every((r) => r !== null)) resolveThrow(next, events);
      return { ok: true, state: next, events };
    }
    case "move": {
      if (state.phase !== "move") return fail("움직일 때가 아니다");
      if (state.turn !== seat) return fail("차례가 아니다");
      const option = legalMoves(state).find(
        (o) => o.value === action.value && o.from === action.from,
      );
      if (!option) return fail("그 말로 그 결과를 쓸 수 없다");
      const next = clone(state);
      const side = sideOf(state.rules, seat);
      const group = piecesOfSide(next, side).filter(
        (p) => p.piece.point === action.from,
      );
      // 새 말은 하나만 나간다. 판 위 말은 업힌 말이 함께 간다.
      const movers = action.from === HOME ? group.slice(0, 1) : group;
      const sample = movers[0]?.piece as Piece;
      const moved = travel(sample, action.value, state.rules.landOnHome);
      if (!moved) return fail("그 말로 그 결과를 쓸 수 없다");
      let captured = 0;
      let capturedSide: number | null = null;
      let stacked = 0;
      if (!moved.finished) {
        for (const p of next.pieces) {
          if (p.point !== moved.to.point || p.point < 0) continue;
          if (p.side !== side) {
            captured += 1;
            capturedSide = p.side;
            p.point = HOME;
            p.trail = [];
          } else if (!movers.some((m) => m.piece === p)) {
            stacked += 1;
            p.trail = [...moved.to.trail];
          }
        }
      }
      for (const { piece } of movers) {
        piece.point = moved.to.point;
        piece.trail = [...moved.to.trail];
      }
      next.pending.splice(next.pending.indexOf(action.value), 1);
      if (captured > 0) next.throwsLeft += 1;
      const events: GameEvent[] = [
        {
          type: "moved",
          seat,
          side,
          value: action.value,
          from: action.from,
          path: moved.path,
          to: moved.to.point,
          count: movers.length,
          stacked,
          captured,
          capturedSide,
          finished: moved.finished,
        },
      ];
      if (piecesOfSide(next, side).every((p) => p.piece.point === DONE)) {
        endGame(next, { kind: "finish", side }, events);
        return { ok: true, state: next, events };
      }
      settle(next, events);
      return { ok: true, state: next, events };
    }
    default:
      return fail("모르는 행동이다");
  }
}

function decisionFor(state: YutState, seat: number): Decision | null {
  switch (state.phase) {
    case "commit":
      return state.chains[seat]?.commit === null ? { kind: "commit" } : null;
    case "throw":
      return state.turn === seat ? { kind: "throw" } : null;
    case "reveal":
      return state.reveals[seat] === null ? { kind: "reveal" } : null;
    case "move":
      return state.turn === seat
        ? { kind: "move", options: legalMoves(state) }
        : null;
    default:
      return null;
  }
}

export function viewOf(state: YutState, seat: number): YutView {
  const { keys, ...rest } = clone(state);
  return {
    ...rest,
    mySeat: seat,
    decision: decisionFor(state, seat),
    botKey: keys[seat] ?? "",
  };
}

export interface LoggedAction {
  seat: number;
  action: Action;
}

/** 기록대로 다시 둔다(온라인 판 끝 검증·복기·무르기) */
export function replay(
  rules: YutRules,
  seed: number,
  log: readonly LoggedAction[],
): { ok: true; state: YutState } | { ok: false; index: number; error: string } {
  let { state } = createMatch(rules, seed);
  for (const [index, entry] of log.entries()) {
    const result = step(state, entry.seat, entry.action);
    if (!result.ok) return { ok: false, index, error: result.error };
    state = result.state;
  }
  return { ok: true, state };
}

/** 이 편이 낸 말 수 */
export function finishedCount(
  state: Pick<YutState, "pieces">,
  side: number,
): number {
  return state.pieces.filter((p) => p.side === side && p.point === DONE).length;
}

/** 결과 값 목록을 사람이 읽는 글로(예: "윷, 걸") */
export function pendingText(values: readonly ThrowValue[]): string {
  const names: Record<string, string> = {
    "-1": "빽도",
    "1": "도",
    "2": "개",
    "3": "걸",
    "4": "윷",
    "5": "모",
  };
  return values.map((v) => names[String(v)]).join(", ");
}
