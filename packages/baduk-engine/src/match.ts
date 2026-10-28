import {
  createRng,
  nextInt,
  type PlayerClock,
  spendTime,
  startClock,
  TIME_PRESETS,
  type TimeControl,
} from "@mighty/engine";

import {
  areaScore,
  type Board,
  boardHash,
  type Cell,
  emptyBoard,
  type Stone,
  tryPlace,
} from "./board";
import { type BadukRules, moveLimit, PLAYER_COUNT } from "./rules";
import type {
  Action,
  AreaCount,
  BadukState,
  BadukView,
  GameEvent,
  RoundResult,
} from "./state";

export type StepResult =
  | { ok: true; state: BadukState; events: GameEvent[] }
  | { ok: false; error: string };

/** 첫 판 흑은 시드로 정한다(누가 먼저 두나도 공평하게). 그 뒤로는 판마다 바꾼다 */
export function createMatch(
  rules: BadukRules,
  seed: number,
): { state: BadukState; events: GameEvent[] } {
  const blackSeat = nextInt(createRng(seed), PLAYER_COUNT);
  const board = emptyBoard(rules.size);
  const state: BadukState = {
    rules,
    board,
    toPlay: 1,
    played: [],
    passes: 0,
    blackSeat,
    prisoners: { 1: 0, 2: 0 },
    roundNumber: 1,
    wins: [0, 0],
    phase: "play",
    result: null,
    continued: [false, false],
    clocks: startClocks(rules),
    positions: [boardHash(board)],
  };
  return {
    state,
    events: [{ type: "roundStarted", roundNumber: 1, blackSeat }],
  };
}

/** 이 규칙의 개인 시간(없으면 null) */
export function timeControlOf(rules: BadukRules): TimeControl | null {
  return rules.time && rules.time !== "none" ? TIME_PRESETS[rules.time] : null;
}

/** 판을 시작할 때 두 사람의 시계. 판마다 새로 준다 */
function startClocks(rules: BadukRules): PlayerClock[] | null {
  const control = timeControlOf(rules);
  return control ? [startClock(control), startClock(control)] : null;
}

export function seatOfStone(state: BadukState, stone: Stone): number {
  return stone === 1 ? state.blackSeat : 1 - state.blackSeat;
}

export function stoneOfSeat(state: BadukState, seat: number): Stone {
  return seat === state.blackSeat ? 1 : 2;
}

/** 지금 둘 차례인 자리(판이 끝났으면 null) */
export function seatToMove(state: BadukState): number | null {
  return state.phase === "play" ? seatOfStone(state, state.toPlay) : null;
}

/** 지금 결정해야 하는 자리들. 판 끝에는 두 사람 모두 "다음 판"을 누른다 */
export function pendingSeats(state: BadukState): number[] {
  if (state.phase === "play") {
    const seat = seatToMove(state);
    return seat === null ? [] : [seat];
  }
  if (state.phase === "roundEnd")
    return [0, 1].filter((s) => !state.continued[s]);
  return [];
}

/** 자리 세기에 덤을 더한 결과 */
export function countArea(board: Board, komi: number): AreaCount {
  const area = areaScore(board);
  return { black: area.black, white: area.white + komi };
}

/**
 * 이 자리에 둘 수 있나. 둘 수 없으면 그 까닭(한국어).
 * 패는 "같은 판 모양 금지"(positional superko)로 본다: 둔 뒤 판이 이번 판에 나왔던 모양과 같으면 둘 수 없다
 */
export function placeError(
  state: BadukState,
  at: number,
): { error: string } | { board: Cell[]; captured: number[] } {
  const size = state.rules.size;
  if (!Number.isInteger(at) || at < 0 || at >= size * size)
    return { error: "판 밖이다" };
  const tried = tryPlace(state.board, at, state.toPlay);
  if (!tried.ok)
    return {
      error:
        tried.error === "occupied"
          ? "이미 돌이 있다"
          : "자살수: 활로가 없는 자리에는 둘 수 없다",
    };
  if (state.positions.includes(boardHash(tried.board)))
    return { error: "패: 바로 되따낼 수 없다(같은 판 모양이 된다)" };
  return tried;
}

/** 지금 둘 차례인 돌이 놓을 수 있는 자리 */
export function legalPoints(state: BadukState): number[] {
  if (state.phase !== "play") return [];
  const seen = new Set(state.positions);
  const points: number[] = [];
  for (let at = 0; at < state.board.length; at++) {
    if (state.board[at] !== 0) continue;
    const tried = tryPlace(state.board, at, state.toPlay);
    if (tried.ok && !seen.has(boardHash(tried.board))) points.push(at);
  }
  return points;
}

function clone(state: BadukState): BadukState {
  return {
    ...state,
    board: [...state.board],
    played: [...state.played],
    prisoners: { ...state.prisoners },
    wins: [...state.wins],
    continued: [...state.continued],
    clocks: state.clocks ? state.clocks.map((c) => ({ ...c })) : null,
    positions: [...state.positions],
  };
}

function fail(error: string): StepResult {
  return { ok: false, error };
}

function endRound(
  state: BadukState,
  result: RoundResult,
  events: GameEvent[],
): void {
  state.result = result;
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

/** 판 위 그대로 센다(죽은 돌을 따로 들어내지 않는다). 덤에 0.5가 붙어 같을 수 없다 */
function endByCount(
  state: BadukState,
  events: GameEvent[],
  limit: boolean,
): void {
  const count = countArea(state.board, state.rules.komi);
  const winner: Stone = count.black > count.white ? 1 : 2;
  endRound(
    state,
    {
      kind: "score",
      seat: seatOfStone(state, winner),
      count,
      ...(limit ? { limit: true as const } : {}),
    },
    events,
  );
}

function startNextRound(state: BadukState, events: GameEvent[]): void {
  state.roundNumber += 1;
  state.blackSeat = 1 - state.blackSeat;
  state.board = emptyBoard(state.rules.size);
  state.toPlay = 1;
  state.played = [];
  state.passes = 0;
  state.prisoners = { 1: 0, 2: 0 };
  state.positions = [boardHash(state.board)];
  state.clocks = startClocks(state.rules);
  state.result = null;
  state.phase = "play";
  state.continued = [false, false];
  events.push({
    type: "roundStarted",
    roundNumber: state.roundNumber,
    blackSeat: state.blackSeat,
  });
}

/**
 * 이 수에 쓴 시간을 깎는다. 시간을 넘겼으면 그 판을 시간패로 끝내고 true
 */
function spendClock(
  state: BadukState,
  seat: number,
  spent: number | undefined,
  events: GameEvent[],
): boolean {
  const control = timeControlOf(state.rules);
  const clock = state.clocks?.[seat];
  if (!control || !clock) return false;
  const result = spendTime(clock, spent ?? 0, control);
  (state.clocks as PlayerClock[])[seat] = result.clock;
  if (result.flagged) {
    endRound(state, { kind: "time", seat: 1 - seat }, events);
    return true;
  }
  return false;
}

export function step(
  state: BadukState,
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
  if (action.type === "resign") {
    if (state.phase !== "play") return fail("판이 진행 중이 아니다");
    const next = clone(state);
    const events: GameEvent[] = [];
    endRound(next, { kind: "resign", seat: 1 - seat }, events);
    return { ok: true, state: next, events };
  }
  if (state.phase !== "play") return fail("판이 진행 중이 아니다");
  if (seatToMove(state) !== seat) return fail("차례가 아니다");
  const stone = state.toPlay;

  if (action.type === "timeout") {
    const control = timeControlOf(state.rules);
    const clock = state.clocks?.[seat];
    if (!control || !clock) return fail("시간 규칙이 없다");
    if (!spendTime(clock, action.spent, control).flagged)
      return fail("아직 시간이 남았다");
    const next = clone(state);
    const events: GameEvent[] = [];
    // 시간을 다 쓴 사람의 시계는 0으로 보인다.
    (next.clocks as PlayerClock[])[seat] = { main: 0, periods: 0 };
    endRound(next, { kind: "time", seat: 1 - seat }, events);
    return { ok: true, state: next, events };
  }

  if (action.type === "pass") {
    const next = clone(state);
    const events: GameEvent[] = [];
    if (spendClock(next, seat, action.spent, events))
      return { ok: true, state: next, events };
    next.played.push({ stone, pass: true });
    next.passes += 1;
    next.toPlay = stone === 1 ? 2 : 1;
    events.push({ type: "passed", seat, stone });
    // 두 사람이 이어 쉬면 판 위 그대로 센다.
    if (next.passes >= 2) endByCount(next, events, false);
    else if (next.played.length >= moveLimit(next.rules.size))
      endByCount(next, events, true);
    return { ok: true, state: next, events };
  }

  if (action.type !== "place") return fail("모르는 행동이다");
  const tried = placeError(state, action.at);
  if ("error" in tried) return fail(tried.error);

  const next = clone(state);
  const events: GameEvent[] = [];
  // 이 수에 쓴 시간을 깎는다. 시간을 넘겨 둔 수는 두지 않고 시간패로 끝낸다.
  if (spendClock(next, seat, action.spent, events))
    return { ok: true, state: next, events };
  next.board = tried.board;
  next.played.push({ stone, at: action.at, captured: tried.captured });
  next.prisoners[stone] += tried.captured.length;
  next.passes = 0;
  next.toPlay = stone === 1 ? 2 : 1;
  next.positions.push(boardHash(next.board));
  events.push({
    type: "placed",
    seat,
    stone,
    at: action.at,
    captured: tried.captured,
  });
  if (next.played.length >= moveLimit(next.rules.size))
    endByCount(next, events, true);
  return { ok: true, state: next, events };
}

/** 지금 이 자리가 할 일 */
function decisionFor(state: BadukState, seat: number): BadukView["decision"] {
  if (state.phase === "play")
    return seatToMove(state) === seat ? { kind: "move" } : null;
  if (state.phase === "roundEnd" && !state.continued[seat])
    return { kind: "continue" };
  return null;
}

export function viewOf(state: BadukState, seat: number): BadukView {
  const decision = decisionFor(state, seat);
  return {
    ...clone(state),
    mySeat: seat,
    decision,
    legal: decision?.kind === "move" ? legalPoints(state) : [],
  };
}

export interface LoggedAction {
  seat: number;
  action: Action;
}

/** 기록대로 다시 둔다(온라인 판 끝 검증·복기·무르기) */
export function replay(
  rules: BadukRules,
  seed: number,
  log: readonly LoggedAction[],
):
  | { ok: true; state: BadukState }
  | { ok: false; index: number; error: string } {
  let { state } = createMatch(rules, seed);
  for (const [index, entry] of log.entries()) {
    const result = step(state, entry.seat, entry.action);
    if (!result.ok) return { ok: false, index, error: result.error };
    state = result.state;
  }
  return { ok: true, state };
}

/** 지금 시계가 가는 자리와 그 사람이 쓸 수 있는 남은 시간(ms). 시간 규칙이 없거나 두기 때가 아니면 null */
export function clockTurn(
  state: BadukState,
): { seat: number; left: number } | null {
  const control = timeControlOf(state.rules);
  if (state.phase !== "play" || !control) return null;
  const seat = seatToMove(state);
  const clock = seat === null ? undefined : state.clocks?.[seat];
  if (seat === null || !clock) return null;
  return { seat, left: clock.main + clock.periods * control.byoyomi };
}
