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
  canMate,
  capturedBy,
  castleWing,
  inCheck,
  insufficientMaterial,
  legalMoves,
  type Move,
  moveToSan,
  other,
  type Piece,
  type Position,
  PROMOTIONS,
  positionKey,
  pseudoMoves,
  type Side,
  sameMove,
  startPosition,
} from "./board";
import {
  type ChessRules,
  FIFTY_MOVE_PLIES,
  PLAYER_COUNT,
  SQUARES,
} from "./rules";
import type {
  Action,
  ChessState,
  ChessView,
  DrawReason,
  GameEvent,
  RoundResult,
} from "./state";

export type StepResult =
  | { ok: true; state: ChessState; events: GameEvent[] }
  | { ok: false; error: string };

/** 첫 판 백은 시드로 정한다(누가 먼저 두나도 공평하게). 그 뒤로는 판마다 바꾼다 */
export function createMatch(
  rules: ChessRules,
  seed: number,
): { state: ChessState; events: GameEvent[] } {
  const whiteSeat = nextInt(createRng(seed), PLAYER_COUNT);
  const position = startPosition();
  const state: ChessState = {
    rules,
    position,
    played: [],
    whiteSeat,
    roundNumber: 1,
    wins: [0, 0],
    draws: 0,
    phase: "play",
    result: null,
    continued: [false, false],
    clocks: startClocks(rules),
    positions: [positionKey(position)],
  };
  return {
    state,
    events: [{ type: "roundStarted", roundNumber: 1, whiteSeat }],
  };
}

/** 이 규칙의 개인 시간(없으면 null) */
export function timeControlOf(rules: ChessRules): TimeControl | null {
  return rules.time && rules.time !== "none" ? TIME_PRESETS[rules.time] : null;
}

/** 판을 시작할 때 두 사람의 시계. 판마다 새로 준다 */
function startClocks(rules: ChessRules): PlayerClock[] | null {
  const control = timeControlOf(rules);
  return control ? [startClock(control), startClock(control)] : null;
}

export function seatOfSide(state: ChessState, side: Side): number {
  return side === "w" ? state.whiteSeat : 1 - state.whiteSeat;
}

export function sideOfSeat(state: ChessState, seat: number): Side {
  return seat === state.whiteSeat ? "w" : "b";
}

/** 지금 둘 차례인 자리(판이 끝났으면 null) */
export function seatToMove(state: ChessState): number | null {
  return state.phase === "play" ? seatOfSide(state, state.position.turn) : null;
}

/** 지금 결정해야 하는 자리들. 판 끝에는 두 사람 모두 "다음 판"을 누른다 */
export function pendingSeats(state: ChessState): number[] {
  if (state.phase === "play") {
    const seat = seatToMove(state);
    return seat === null ? [] : [seat];
  }
  if (state.phase === "roundEnd")
    return [0, 1].filter((s) => !state.continued[s]);
  return [];
}

function clonePosition(pos: Position): Position {
  return { ...pos, board: [...pos.board] };
}

function clone(state: ChessState): ChessState {
  return {
    ...state,
    position: clonePosition(state.position),
    played: [...state.played],
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
  state: ChessState,
  result: RoundResult,
  events: GameEvent[],
): void {
  state.result = result;
  if (result.kind === "draw") state.draws += 1;
  else state.wins[result.seat] = (state.wins[result.seat] ?? 0) + 1;
  events.push({ type: "roundEnded", result, wins: [...state.wins] });
  if (state.wins.some((w) => w >= state.rules.winsToFinish)) {
    state.phase = "gameOver";
    events.push({ type: "gameEnded", wins: [...state.wins] });
  } else {
    state.phase = "roundEnd";
    state.continued = [false, false];
  }
}

const draw = (reason: DrawReason): RoundResult => ({ kind: "draw", reason });

function startNextRound(state: ChessState, events: GameEvent[]): void {
  state.roundNumber += 1;
  state.whiteSeat = 1 - state.whiteSeat;
  state.position = startPosition();
  state.played = [];
  state.positions = [positionKey(state.position)];
  state.clocks = startClocks(state.rules);
  state.result = null;
  state.phase = "play";
  state.continued = [false, false];
  events.push({
    type: "roundStarted",
    roundNumber: state.roundNumber,
    whiteSeat: state.whiteSeat,
  });
}

/** 시간을 다 쓴 자리의 판 끝: 상대가 체크메이트할 기물이 없으면 비긴다(FIDE 6.9) */
function endByTime(state: ChessState, seat: number, events: GameEvent[]) {
  const winner = 1 - seat;
  const result: RoundResult = canMate(
    state.position.board,
    sideOfSeat(state, winner),
  )
    ? { kind: "time", seat: winner }
    : draw("timeout");
  endRound(state, result, events);
}

/** 이 수에 쓴 시간을 깎는다. 시간을 넘겼으면 그 판을 시간패로 끝내고 true */
function spendClock(
  state: ChessState,
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
    endByTime(state, seat, events);
    return true;
  }
  return false;
}

/** 둔 뒤의 판 끝 따지기: 체크메이트, 스테일메이트, 기물 부족, 되풀이, 50수 */
function afterMove(state: ChessState, mover: Side, events: GameEvent[]) {
  const pos = state.position;
  const opponent = other(mover);
  const checked = inCheck(pos.board, opponent);
  if (checked) events.push({ type: "check", side: opponent });
  if (legalMoves(pos).length === 0) {
    endRound(
      state,
      checked
        ? { kind: "checkmate", seat: seatOfSide(state, mover) }
        : draw("stalemate"),
      events,
    );
    return;
  }
  if (insufficientMaterial(pos.board)) {
    endRound(state, draw("material"), events);
    return;
  }
  const key = positionKey(pos);
  state.positions.push(key);
  if (state.positions.filter((p) => p === key).length >= 3) {
    endRound(state, draw("repetition"), events);
    return;
  }
  if (pos.halfmove >= FIFTY_MOVE_PLIES) endRound(state, draw("fifty"), events);
}

export function step(
  state: ChessState,
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
  if (seatToMove(state) !== seat) return fail("차례가 아니다");
  const side = sideOfSeat(state, seat);

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
    endByTime(next, seat, events);
    return { ok: true, state: next, events };
  }

  if (action.type !== "move") return fail("모르는 행동이다");
  const { from, to } = action;
  if (![from, to].every((n) => Number.isInteger(n) && n >= 0 && n < SQUARES))
    return fail("판 밖이다");
  if (action.promotion !== undefined && !PROMOTIONS.includes(action.promotion))
    return fail("승급할 수 없는 기물이다");
  const move: Move = {
    from,
    to,
    ...(action.promotion ? { promotion: action.promotion } : {}),
  };
  const pos = state.position;
  const legal = legalMoves(pos);
  if (!legal.some((m) => sameMove(m, move))) {
    // 기물이 갈 수는 있는데 막힌 까닭을 알린다.
    const reach = legal.filter((m) => m.from === from && m.to === to);
    if (reach.length > 0)
      return fail(
        move.promotion
          ? "승급할 수 없는 수다"
          : "폰이 끝줄에 닿으면 바꿀 기물을 골라야 한다",
      );
    if (
      pos.board[from]?.[0] === side &&
      pseudoMoves(pos).some((m) => m.from === from && m.to === to)
    )
      return fail(
        inCheck(pos.board, side)
          ? "체크를 풀어야 한다"
          : "킹이 잡히게 되는 수는 둘 수 없다",
      );
    return fail("둘 수 없는 수다");
  }

  const next = clone(state);
  // 이 수에 쓴 시간을 깎는다. 시간을 넘겨 둔 수는 두지 않고 시간패로 끝낸다.
  const timeEvents: GameEvent[] = [];
  if (spendClock(next, seat, action.spent, timeEvents))
    return { ok: true, state: next, events: timeEvents };
  const piece = pos.board[from] as Piece;
  const taken = capturedBy(pos, move);
  const captured = taken === "" ? null : taken;
  const san = moveToSan(pos, move);
  const castle = castleWing(pos.board, move);
  next.position = applyMove(pos, move);
  next.played.push({
    side,
    from,
    to,
    piece,
    captured,
    ...(move.promotion ? { promotion: move.promotion } : {}),
    san,
  });
  const events: GameEvent[] = [
    {
      type: "moved",
      seat,
      side,
      from,
      to,
      piece,
      captured,
      ...(move.promotion ? { promotion: move.promotion } : {}),
      ...(castle ? { castle } : {}),
      san,
    },
  ];
  afterMove(next, side, events);
  return { ok: true, state: next, events };
}

/** 지금 이 자리가 할 일 */
function decisionFor(state: ChessState, seat: number): ChessView["decision"] {
  if (state.phase === "play")
    return seatToMove(state) === seat ? { kind: "move" } : null;
  if (state.phase === "roundEnd" && !state.continued[seat])
    return { kind: "continue" };
  return null;
}

/** 지금 체크를 받는 편(두기 중일 때만) */
export function checkedSide(state: ChessState): Side | null {
  if (state.phase !== "play") return null;
  const side = state.position.turn;
  return inCheck(state.position.board, side) ? side : null;
}

/** 이 자리가 지금 둘 수 있는 수(차례가 아니면 빈 목록) */
export function legalFor(state: ChessState, seat: number): Move[] {
  if (state.phase !== "play" || seatToMove(state) !== seat) return [];
  return legalMoves(state.position);
}

export function viewOf(state: ChessState, seat: number): ChessView {
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
  rules: ChessRules,
  seed: number,
  log: readonly LoggedAction[],
):
  | { ok: true; state: ChessState }
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
  state: ChessState,
): { seat: number; left: number } | null {
  const control = timeControlOf(state.rules);
  if (state.phase !== "play" || !control) return null;
  const seat = seatToMove(state);
  const clock = seat === null ? undefined : state.clocks?.[seat];
  if (seat === null || !clock) return null;
  return { seat, left: clock.main + clock.periods * control.byoyomi };
}
