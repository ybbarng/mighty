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
  applyMove,
  baseBoard,
  inCheck,
  kindOf,
  kingsFacing,
  legalMoves,
  type Move,
  materialScore,
  other,
  type Piece,
  placeSetup,
  pseudoTargets,
  SETUPS,
  type Side,
} from "./board";
import { CELLS, type JanggiRules, MOVE_LIMIT, PLAYER_COUNT } from "./rules";
import type {
  Action,
  GameEvent,
  JanggiState,
  JanggiView,
  RoundResult,
  ScoreReason,
} from "./state";

export type StepResult =
  | { ok: true; state: JanggiState; events: GameEvent[] }
  | { ok: false; error: string };

/** 첫 판 초는 시드로 정한다(누가 먼저 두나도 공평하게). 그 뒤로는 판마다 바꾼다 */
export function createMatch(
  rules: JanggiRules,
  seed: number,
): { state: JanggiState; events: GameEvent[] } {
  const choSeat = nextInt(createRng(seed), PLAYER_COUNT);
  const state: JanggiState = {
    rules,
    board: baseBoard(),
    played: [],
    choSeat,
    setups: { c: null, h: null },
    roundNumber: 1,
    wins: [0, 0],
    phase: "setup",
    result: null,
    continued: [false, false],
    clocks: startClocks(rules),
    positions: [],
  };
  return {
    state,
    events: [{ type: "roundStarted", roundNumber: 1, choSeat }],
  };
}

/** 이 규칙의 개인 시간(없으면 null) */
export function timeControlOf(rules: JanggiRules): TimeControl | null {
  return rules.time && rules.time !== "none" ? TIME_PRESETS[rules.time] : null;
}

/** 판을 시작할 때 두 사람의 시계. 판마다 새로 준다 */
function startClocks(rules: JanggiRules): PlayerClock[] | null {
  const control = timeControlOf(rules);
  return control ? [startClock(control), startClock(control)] : null;
}

/**
 * 이 수에 쓴 시간을 깎는다. 시간을 넘겼으면 그 판을 시간패로 끝내고 true.
 * 상차림에는 시간을 재지 않는다
 */
function spendClock(
  state: JanggiState,
  seat: number,
  spent: number | undefined,
  events: GameEvent[],
): boolean {
  const control = timeControlOf(state.rules);
  const clock = state.clocks?.[seat];
  if (!control || !clock) return false;
  const result = spendTime(clock, spent ?? 0, control);
  if (result.flagged) {
    endRound(state, { kind: "time", seat: 1 - seat }, events);
    return true;
  }
  (state.clocks as PlayerClock[])[seat] = result.clock;
  return false;
}

export function seatOfSide(state: JanggiState, side: Side): number {
  return side === "c" ? state.choSeat : 1 - state.choSeat;
}

export function sideOfSeat(state: JanggiState, seat: number): Side {
  return seat === state.choSeat ? "c" : "h";
}

/** 상차림은 한이 먼저, 그다음 초. 두기는 초가 먼저다 */
export function sideToAct(state: JanggiState): Side | null {
  if (state.phase === "setup") return state.setups.h === null ? "h" : "c";
  if (state.phase === "play") return state.played.length % 2 === 0 ? "c" : "h";
  return null;
}

/** 지금 할 차례인 자리(판이 끝났으면 null) */
export function seatToMove(state: JanggiState): number | null {
  const side = sideToAct(state);
  return side === null ? null : seatOfSide(state, side);
}

/** 지금 결정해야 하는 자리들. 판 끝에는 두 사람 모두 "다음 판"을 누른다 */
export function pendingSeats(state: JanggiState): number[] {
  if (state.phase === "setup" || state.phase === "play") {
    const seat = seatToMove(state);
    return seat === null ? [] : [seat];
  }
  if (state.phase === "roundEnd")
    return [0, 1].filter((s) => !state.continued[s]);
  return [];
}

/** 판 모양 + 둘 차례(같은 모양 되풀이를 셀 때) */
export function positionKey(state: JanggiState): string {
  return `${state.board.join(",")}|${sideToAct(state) ?? "-"}`;
}

function clone(state: JanggiState): JanggiState {
  return {
    ...state,
    board: [...state.board],
    played: [...state.played],
    setups: { ...state.setups },
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
  state: JanggiState,
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

/** 남은 기물 점수로 가린다. 한의 덤이 0.5 단위라 같을 수 없다 */
function endByScore(
  state: JanggiState,
  reason: ScoreReason,
  events: GameEvent[],
): void {
  const scores = {
    c: materialScore(state.board, "c"),
    h: materialScore(state.board, "h"),
  };
  const winner: Side = scores.c > scores.h ? "c" : "h";
  endRound(
    state,
    { kind: "score", seat: seatOfSide(state, winner), reason, scores },
    events,
  );
}

function startNextRound(state: JanggiState, events: GameEvent[]): void {
  state.roundNumber += 1;
  state.choSeat = 1 - state.choSeat;
  state.board = baseBoard();
  state.played = [];
  state.setups = { c: null, h: null };
  state.positions = [];
  state.clocks = startClocks(state.rules);
  state.result = null;
  state.phase = "setup";
  state.continued = [false, false];
  events.push({
    type: "roundStarted",
    roundNumber: state.roundNumber,
    choSeat: state.choSeat,
  });
}

/** 둔 뒤의 판 끝 따지기: 외통, 빅장, 되풀이, 수 한도 */
function afterTurn(state: JanggiState, mover: Side, events: GameEvent[]) {
  const opponent = other(mover);
  const checked = inCheck(state.board, opponent);
  if (checked) events.push({ type: "check", side: opponent });
  const forbidden = state.rules.bikjang === "forbidden";
  if (checked && legalMoves(state.board, opponent, forbidden).length === 0) {
    endRound(
      state,
      { kind: "checkmate", seat: seatOfSide(state, mover) },
      events,
    );
    return;
  }
  if (!forbidden && kingsFacing(state.board)) {
    endByScore(state, "bikjang", events);
    return;
  }
  const key = positionKey(state);
  state.positions.push(key);
  if (state.positions.filter((p) => p === key).length >= 3) {
    endByScore(state, "repetition", events);
    return;
  }
  if (state.played.length >= MOVE_LIMIT) endByScore(state, "limit", events);
}

export function step(
  state: JanggiState,
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
    if (state.phase !== "play" && state.phase !== "setup")
      return fail("판이 진행 중이 아니다");
    const next = clone(state);
    const events: GameEvent[] = [];
    endRound(next, { kind: "resign", seat: 1 - seat }, events);
    return { ok: true, state: next, events };
  }
  if (seatToMove(state) !== seat) return fail("차례가 아니다");
  const side = sideOfSeat(state, seat);

  if (action.type === "setup") {
    if (state.phase !== "setup") return fail("상차림 때가 아니다");
    if (!SETUPS.some((s) => s.value === action.setup))
      return fail("없는 상차림이다");
    const next = clone(state);
    next.setups[side] = action.setup;
    placeSetup(next.board, side, action.setup);
    const events: GameEvent[] = [
      { type: "setupChosen", seat, side, setup: action.setup },
    ];
    if (next.setups.c !== null && next.setups.h !== null) {
      next.phase = "play";
      next.positions = [positionKey(next)];
    }
    return { ok: true, state: next, events };
  }

  if (state.phase !== "play") return fail("판이 진행 중이 아니다");

  if (action.type === "timeout") {
    const control = timeControlOf(state.rules);
    const clock = state.clocks?.[seat];
    if (!control || !clock) return fail("시간 규칙이 없다");
    if (!spendTime(clock, action.spent, control).flagged)
      return fail("아직 시간이 남았다");
    const next = clone(state);
    const events: GameEvent[] = [];
    endRound(next, { kind: "time", seat: 1 - seat }, events);
    return { ok: true, state: next, events };
  }

  if (action.type === "pass") {
    if (inCheck(state.board, side)) return fail("장군을 받을 때는 쉴 수 없다");
    const next = clone(state);
    const timeEvents: GameEvent[] = [];
    if (spendClock(next, seat, action.spent, timeEvents))
      return { ok: true, state: next, events: timeEvents };
    next.played.push({ side, pass: true });
    const events: GameEvent[] = [{ type: "passed", seat, side }];
    // 두 사람이 이어 쉬면 더 둘 뜻이 없는 것으로 보고 점수로 가린다.
    const before = state.played.at(-1);
    if (before && "pass" in before) endByScore(next, "passes", events);
    else afterTurn(next, side, events);
    return { ok: true, state: next, events };
  }

  if (action.type !== "move") return fail("모르는 행동이다");
  const { from, to } = action;
  if (![from, to].every((n) => Number.isInteger(n) && n >= 0 && n < CELLS))
    return fail("판 밖이다");
  const forbidden = state.rules.bikjang === "forbidden";
  const legal = legalMoves(state.board, side, forbidden);
  if (!legal.some((m) => m.from === from && m.to === to)) {
    // 기물이 갈 수는 있는데 막힌 까닭을 알린다.
    if (
      state.board[from]?.[0] === side &&
      pseudoTargets(state.board, from).includes(to)
    ) {
      const moved = applyMove(state.board, { from, to });
      if (inCheck(moved, side)) return fail("궁이 잡히는 수는 둘 수 없다");
      if (forbidden && kingsFacing(moved)) return fail("빅장 금지");
    }
    return fail("둘 수 없는 수다");
  }

  const next = clone(state);
  // 이 수에 쓴 시간을 깎는다. 시간을 넘겨 둔 수는 두지 않고 시간패로 끝낸다.
  const timeEvents: GameEvent[] = [];
  if (spendClock(next, seat, action.spent, timeEvents))
    return { ok: true, state: next, events: timeEvents };
  const piece = state.board[from] as Piece;
  const target = state.board[to] ?? "";
  next.board = applyMove(state.board, { from, to });
  next.played.push({ side, from, to, captured: kindOf(target) });
  const events: GameEvent[] = [
    {
      type: "moved",
      seat,
      side,
      from,
      to,
      piece,
      captured: target === "" ? null : target,
    },
  ];
  afterTurn(next, side, events);
  return { ok: true, state: next, events };
}

/** 지금 이 자리가 할 일 */
function decisionFor(state: JanggiState, seat: number): JanggiView["decision"] {
  if (state.phase === "setup")
    return seatToMove(state) === seat ? { kind: "setup" } : null;
  if (state.phase === "play")
    return seatToMove(state) === seat ? { kind: "move" } : null;
  if (state.phase === "roundEnd" && !state.continued[seat])
    return { kind: "continue" };
  return null;
}

/** 지금 장군을 받는 편(두기 중일 때만) */
export function checkedSide(state: JanggiState): Side | null {
  if (state.phase !== "play") return null;
  const side = sideToAct(state);
  return side && inCheck(state.board, side) ? side : null;
}

/** 이 자리가 지금 둘 수 있는 수(차례가 아니면 빈 목록) */
export function legalFor(state: JanggiState, seat: number): Move[] {
  if (state.phase !== "play" || seatToMove(state) !== seat) return [];
  return legalMoves(
    state.board,
    sideOfSeat(state, seat),
    state.rules.bikjang === "forbidden",
  );
}

export function viewOf(state: JanggiState, seat: number): JanggiView {
  return {
    ...clone(state),
    mySeat: seat,
    decision: decisionFor(state, seat),
    legal: legalFor(state, seat),
    check: checkedSide(state),
  };
}

export interface LoggedAction {
  seat: number;
  action: Action;
}

/** 기록대로 다시 둔다(온라인 판 끝 검증·복기·무르기) */
export function replay(
  rules: JanggiRules,
  seed: number,
  log: readonly LoggedAction[],
):
  | { ok: true; state: JanggiState }
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
  state: JanggiState,
): { seat: number; left: number } | null {
  const control = timeControlOf(state.rules);
  if (state.phase !== "play" || !control) return null;
  const seat = seatToMove(state);
  const clock = seat === null ? undefined : state.clocks?.[seat];
  if (seat === null || !clock) return null;
  return { seat, left: clock.main + clock.periods * control.byoyomi };
}
