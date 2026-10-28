import { createRng, nextInt } from "@mighty/engine";

import {
  emptyBoard,
  forbiddenReason,
  hasForbidden,
  type Stone,
  winningLine,
} from "./board";
import { CELLS, type OmokRules, PLAYER_COUNT } from "./rules";
import type {
  Action,
  GameEvent,
  OmokState,
  OmokView,
  RoundResult,
} from "./state";

export type StepResult =
  | { ok: true; state: OmokState; events: GameEvent[] }
  | { ok: false; error: string };

/** 첫 판 흑은 시드로 정한다(누가 먼저 두나도 공평하게). 그 뒤로는 판마다 바꾼다 */
export function createMatch(
  rules: OmokRules,
  seed: number,
): { state: OmokState; events: GameEvent[] } {
  const blackSeat = nextInt(createRng(seed), PLAYER_COUNT);
  const state: OmokState = {
    rules,
    board: emptyBoard(),
    moves: [],
    blackSeat,
    roundNumber: 1,
    wins: [0, 0],
    phase: "play",
    result: null,
    continued: [false, false],
  };
  return {
    state,
    events: [{ type: "roundStarted", roundNumber: 1, blackSeat }],
  };
}

/** 지금 둘 색. 흑이 먼저라 둔 수가 짝수면 흑 */
export function stoneToMove(state: OmokState): Stone {
  return state.moves.length % 2 === 0 ? 1 : 2;
}

export function seatOfStone(state: OmokState, stone: Stone): number {
  return stone === 1 ? state.blackSeat : 1 - state.blackSeat;
}

export function stoneOfSeat(state: OmokState, seat: number): Stone {
  return seat === state.blackSeat ? 1 : 2;
}

/** 지금 둘 차례인 자리(판이 끝났으면 null) */
export function seatToMove(state: OmokState): number | null {
  return state.phase === "play" ? seatOfStone(state, stoneToMove(state)) : null;
}

/** 지금 결정해야 하는 자리들. 판 끝에는 두 사람 모두 "다음 판"을 누른다 */
export function pendingSeats(state: OmokState): number[] {
  if (state.phase === "play") {
    const seat = seatToMove(state);
    return seat === null ? [] : [seat];
  }
  if (state.phase === "roundEnd")
    return [0, 1].filter((s) => !state.continued[s]);
  return [];
}

function clone(state: OmokState): OmokState {
  return {
    ...state,
    board: [...state.board],
    moves: [...state.moves],
    wins: [...state.wins],
    continued: [...state.continued],
    result: state.result,
  };
}

function fail(error: string): StepResult {
  return { ok: false, error };
}

function endRound(
  state: OmokState,
  result: RoundResult,
  events: GameEvent[],
): void {
  state.result = result;
  if (result.kind !== "draw")
    state.wins[result.seat] = (state.wins[result.seat] ?? 0) + 1;
  events.push({ type: "roundEnded", result, wins: [...state.wins] });
  if (state.wins.some((w) => w >= state.rules.winsToFinish)) {
    state.phase = "gameOver";
    events.push({ type: "gameEnded", wins: [...state.wins] });
  } else {
    state.phase = "roundEnd";
    state.continued = [false, false];
  }
}

function startNextRound(state: OmokState, events: GameEvent[]): void {
  state.roundNumber += 1;
  state.blackSeat = 1 - state.blackSeat;
  state.board = emptyBoard();
  state.moves = [];
  state.result = null;
  state.phase = "play";
  state.continued = [false, false];
  events.push({
    type: "roundStarted",
    roundNumber: state.roundNumber,
    blackSeat: state.blackSeat,
  });
}

export function step(
  state: OmokState,
  seat: number,
  action: Action,
): StepResult {
  if (seat !== 0 && seat !== 1) return fail("없는 자리다");
  if (action.type === "retire") {
    if (state.phase === "gameOver") return fail("이미 끝난 게임이다");
    const next = clone(state);
    next.phase = "gameOver";
    next.retired = true;
    return {
      ok: true,
      state: next,
      events: [{ type: "gameEnded", wins: [...next.wins], retired: true }],
    };
  }
  if (action.type === "continue") {
    if (state.phase !== "roundEnd") return fail("판이 끝나지 않았다");
    if (state.continued[seat]) return fail("이미 눌렀다");
    const next = clone(state);
    const events: GameEvent[] = [];
    next.continued[seat] = true;
    if (next.continued.every(Boolean)) startNextRound(next, events);
    return { ok: true, state: next, events };
  }
  if (state.phase !== "play") return fail("판이 진행 중이 아니다");
  if (action.type === "resign") {
    const next = clone(state);
    const events: GameEvent[] = [];
    endRound(next, { kind: "resign", seat: 1 - seat }, events);
    return { ok: true, state: next, events };
  }
  if (action.type !== "place") return fail("모르는 행동이다");
  if (seatToMove(state) !== seat) return fail("차례가 아니다");
  const { at } = action;
  if (!Number.isInteger(at) || at < 0 || at >= CELLS) return fail("판 밖이다");
  if (state.board[at] !== 0) return fail("이미 돌이 있다");
  const stone = stoneToMove(state);
  const forbidden = forbiddenReason(
    state.board,
    at,
    stone,
    state.rules.variant,
  );
  if (forbidden !== null) return fail(`${forbidden} 금지`);

  const next = clone(state);
  next.board[at] = stone;
  next.moves.push(at);
  const events: GameEvent[] = [{ type: "placed", seat, at, stone }];
  const line = winningLine(next.board, at, state.rules.variant);
  if (line !== null)
    endRound(next, { kind: "five", seat, stone, line }, events);
  else if (next.moves.length === CELLS || !canMove(next))
    endRound(next, { kind: "draw" }, events);
  return { ok: true, state: next, events };
}

/** 둘 차례인 색에게 둘 곳이 남았나(렌주 흑은 빈칸이 모두 금지일 수 있다) */
function canMove(state: OmokState): boolean {
  const stone = stoneToMove(state);
  const empties: number[] = [];
  for (let at = 0; at < CELLS; at++)
    if (state.board[at] === 0) empties.push(at);
  if (!hasForbidden(state.rules.variant, stone)) return empties.length > 0;
  return empties.some(
    (at) =>
      forbiddenReason(state.board, at, stone, state.rules.variant) === null,
  );
}

/** 내 차례일 때 판에 보일 금지 자리 */
function forbiddenFor(state: OmokState, seat: number): OmokView["forbidden"] {
  if (seatToMove(state) !== seat) return [];
  const stone = stoneToMove(state);
  if (!hasForbidden(state.rules.variant, stone)) return [];
  const list: OmokView["forbidden"] = [];
  for (let at = 0; at < CELLS; at++) {
    const reason = forbiddenReason(state.board, at, stone, state.rules.variant);
    if (reason !== null) list.push({ at, reason });
  }
  return list;
}

export function viewOf(state: OmokState, seat: number): OmokView {
  return {
    ...clone(state),
    mySeat: seat,
    forbidden: forbiddenFor(state, seat),
  };
}

export interface LoggedAction {
  seat: number;
  action: Action;
}

/** 기록대로 다시 둔다(온라인 판 끝 검증·복기·무르기) */
export function replay(
  rules: OmokRules,
  seed: number,
  log: readonly LoggedAction[],
):
  | { ok: true; state: OmokState }
  | { ok: false; index: number; error: string } {
  let { state } = createMatch(rules, seed);
  for (const [index, entry] of log.entries()) {
    const result = step(state, entry.seat, entry.action);
    if (!result.ok) return { ok: false, index, error: result.error };
    state = result.state;
  }
  return { ok: true, state };
}
