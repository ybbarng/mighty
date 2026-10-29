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
  type Clue,
  commitmentOf,
  HASH_PATTERN,
  hasCandidate,
  isPossibleScore,
  isValidNumber,
  SALT_PATTERN,
  score,
  seatKey,
} from "./numbers";
import { type BaseballRules, PLAYER_COUNT, secretHolders } from "./rules";
import type {
  Action,
  BaseballState,
  BaseballView,
  Decision,
  GameEvent,
  RoundResult,
} from "./state";

export type StepResult =
  | { ok: true; state: BaseballState; events: GameEvent[] }
  | { ok: false; error: string };

/** 이 규칙의 개인 시간(없으면 null) */
export function timeControlOf(rules: BaseballRules): TimeControl | null {
  return rules.time && rules.time !== "none" ? TIME_PRESETS[rules.time] : null;
}

function startClocks(rules: BaseballRules): PlayerClock[] | null {
  const control = timeControlOf(rules);
  return control ? [startClock(control), startClock(control)] : null;
}

/** 첫 판 선(먼저 맞히는 쪽)은 시드로 정한다. 그 뒤로는 판마다 바꾼다. 퍼즐은 늘 0번 자리가 맞힌다 */
export function createMatch(
  rules: BaseballRules,
  seed: number,
): { state: BaseballState; events: GameEvent[] } {
  const starter =
    rules.mode === "duel" ? nextInt(createRng(seed), PLAYER_COUNT) : 0;
  const state: BaseballState = {
    rules,
    roundNumber: 1,
    starter,
    phase: "setup",
    commits: [null, null],
    guesses: [],
    turn: starter,
    solved: [false, false],
    outcome: null,
    reveals: [null, null],
    result: null,
    wins: [0, 0],
    clocks: startClocks(rules),
    continued: [false, false],
    keys: [seatKey(seed, 0), seatKey(seed, 1)],
  };
  return {
    state,
    events: [{ type: "roundStarted", roundNumber: 1, starter }],
  };
}

/** 방금 물어본 수에 답할 자리 */
export function answererOf(state: BaseballState): number | null {
  if (state.phase !== "answer") return null;
  const last = state.guesses.at(-1);
  return last ? 1 - last.seat : null;
}

/** 판 끝에 공개해야 하는 자리: 약속을 낸 자리 가운데 아직 공개하지 않은 곳 */
function revealPending(state: BaseballState): number[] {
  return secretHolders(state.rules).filter(
    (s) => state.commits[s] !== null && state.reveals[s] === null,
  );
}

/** 지금 결정해야 하는 자리들 */
export function pendingSeats(state: BaseballState): number[] {
  switch (state.phase) {
    case "setup":
      return secretHolders(state.rules).filter(
        (s) => state.commits[s] === null,
      );
    case "play":
      return [state.turn];
    case "answer": {
      const seat = answererOf(state);
      return seat === null ? [] : [seat];
    }
    case "reveal":
      return revealPending(state);
    case "roundEnd":
      return [0, 1].filter((s) => !state.continued[s]);
    default:
      return [];
  }
}

/** 이 자리가 물어본 수와 받은 답(답을 받은 것만) */
export function cluesOf(
  state: {
    guesses: readonly {
      seat: number;
      guess: string;
      strikes: number | null;
      balls: number | null;
    }[];
  },
  seat: number,
): Clue[] {
  const clues: Clue[] = [];
  for (const g of state.guesses)
    if (g.seat === seat && g.strikes !== null && g.balls !== null)
      clues.push({ guess: g.guess, strikes: g.strikes, balls: g.balls });
  return clues;
}

function clone(state: BaseballState): BaseballState {
  return {
    ...state,
    commits: [...state.commits],
    guesses: state.guesses.map((g) => ({ ...g })),
    solved: [...state.solved],
    reveals: [...state.reveals],
    wins: [...state.wins],
    continued: [...state.continued],
    clocks: state.clocks ? state.clocks.map((c) => ({ ...c })) : null,
    keys: [...state.keys],
  };
}

function fail(error: string): StepResult {
  return { ok: false, error };
}

function endRound(
  state: BaseballState,
  result: RoundResult,
  events: GameEvent[],
): void {
  state.result = result;
  if ("seat" in result && result.seat !== null)
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

/** 공개가 다 끝나면 거짓을 따져 판 결과를 정한다 */
function finishIfRevealed(state: BaseballState, events: GameEvent[]): void {
  if (revealPending(state).length > 0) return;
  const liars = secretHolders(state.rules).filter((s) => {
    const r = state.reveals[s];
    return r !== null && r !== undefined && (!r.matches || r.wrongAt !== null);
  });
  const outcome = state.outcome as RoundResult;
  if (liars.length === 0) {
    endRound(state, outcome, events);
    return;
  }
  const honest = [0, 1].filter((s) => !liars.includes(s));
  endRound(
    state,
    {
      kind: "cheat",
      seat: honest.length === 1 ? (honest[0] as number) : null,
      liars,
    },
    events,
  );
}

/** 판의 결과가 정해졌다. 약속을 낸 사람은 비밀을 공개하고, 그 뒤에 판이 끝난다 */
function enterReveal(
  state: BaseballState,
  outcome: RoundResult,
  events: GameEvent[],
): void {
  state.phase = "reveal";
  state.outcome = outcome;
  finishIfRevealed(state, events);
}

function startNextRound(state: BaseballState, events: GameEvent[]): void {
  state.roundNumber += 1;
  if (state.rules.mode === "duel") state.starter = 1 - state.starter;
  state.phase = "setup";
  state.commits = [null, null];
  state.guesses = [];
  state.turn = state.starter;
  state.solved = [false, false];
  state.outcome = null;
  state.reveals = [null, null];
  state.result = null;
  state.continued = [false, false];
  state.clocks = startClocks(state.rules);
  events.push({
    type: "roundStarted",
    roundNumber: state.roundNumber,
    starter: state.starter,
  });
}

/** 답을 받은 뒤: 판이 끝났는지, 다음은 누가 맞히는지 */
function afterAnswer(
  state: BaseballState,
  guesser: number,
  events: GameEvent[],
): void {
  const { rules } = state;
  if (rules.mode === "puzzle") {
    if (state.solved[0]) enterReveal(state, { kind: "hit", seat: 0 }, events);
    else {
      state.phase = "play";
      state.turn = 0;
    }
    return;
  }
  const first = state.starter;
  const second = 1 - first;
  if (!rules.fair) {
    if (state.solved[guesser])
      enterReveal(state, { kind: "hit", seat: guesser }, events);
    else {
      state.phase = "play";
      state.turn = 1 - guesser;
    }
    return;
  }
  const count = (seat: number) => cluesOf(state, seat).length;
  if (state.solved[second]) {
    enterReveal(
      state,
      state.solved[first] ? { kind: "draw" } : { kind: "hit", seat: second },
      events,
    );
    return;
  }
  if (state.solved[first] && count(second) >= count(first)) {
    // 후공이 마지막 기회에 맞히지 못했다.
    enterReveal(state, { kind: "hit", seat: first }, events);
    return;
  }
  // 선이 맞혔으면 후공에게 한 번 더(차례가 마침 후공이다).
  state.phase = "play";
  state.turn = 1 - guesser;
}

/** 끝내기: 답이나 공개를 기다리던 사람이 하나뿐이면 그 사람이 진다 */
function retire(state: BaseballState): StepResult {
  if (state.phase === "gameOver") return fail("이미 끝난 게임이다");
  const next = clone(state);
  const events: GameEvent[] = [];
  const pending = pendingSeats(state);
  const waiting =
    (state.phase === "setup" ||
      state.phase === "answer" ||
      state.phase === "reveal") &&
    pending.length === 1 &&
    state.rules.mode === "duel";
  if (waiting) {
    const seat = 1 - (pending[0] as number);
    next.result = { kind: "forfeit", seat };
    next.wins[seat] = (next.wins[seat] ?? 0) + 1;
    events.push({
      type: "roundEnded",
      result: next.result,
      wins: [...next.wins],
    });
  }
  next.phase = "gameOver";
  next.retired = true;
  events.push({ type: "gameEnded", wins: [...next.wins], retired: true });
  return { ok: true, state: next, events };
}

export function step(
  state: BaseballState,
  seat: number,
  action: Action,
): StepResult {
  if (seat !== 0 && seat !== 1) return fail("없는 자리다");
  const { rules } = state;
  switch (action.type) {
    case "retire":
      return retire(state);
    case "continue": {
      if (state.phase !== "roundEnd") return fail("판이 끝나지 않았다");
      if (state.continued[seat]) return fail("이미 눌렀다");
      const next = clone(state);
      const events: GameEvent[] = [];
      next.continued[seat] = true;
      if (next.continued.every(Boolean)) startNextRound(next, events);
      return { ok: true, state: next, events };
    }
    case "resign": {
      if (
        state.phase !== "setup" &&
        state.phase !== "play" &&
        state.phase !== "answer"
      )
        return fail("판이 진행 중이 아니다");
      if (rules.mode === "puzzle" && seat !== 0)
        return fail("퍼즐은 맞히는 사람만 그만둘 수 있다");
      const next = clone(state);
      const events: GameEvent[] = [];
      enterReveal(next, { kind: "resign", seat: 1 - seat }, events);
      return { ok: true, state: next, events };
    }
    case "commit": {
      if (state.phase !== "setup") return fail("비밀 수를 정할 때가 아니다");
      if (!secretHolders(rules).includes(seat))
        return fail("이 자리는 비밀 수를 정하지 않는다");
      if (state.commits[seat] !== null) return fail("이미 정했다");
      if (typeof action.hash !== "string" || !HASH_PATTERN.test(action.hash))
        return fail("약속 형식이 아니다");
      const next = clone(state);
      next.commits[seat] = action.hash;
      const events: GameEvent[] = [{ type: "committed", seat }];
      if (secretHolders(rules).every((s) => next.commits[s] !== null)) {
        next.phase = "play";
        next.turn = next.starter;
      }
      return { ok: true, state: next, events };
    }
    case "guess": {
      if (state.phase !== "play") return fail("맞힐 때가 아니다");
      if (state.turn !== seat) return fail("차례가 아니다");
      if (!isValidNumber(action.guess, rules))
        return fail(
          `${rules.digits}자리, 서로 다른 숫자${rules.zero ? "" : "(1~9)"}로 물어야 한다`,
        );
      if (
        state.guesses.some((g) => g.seat === seat && g.guess === action.guess)
      )
        return fail("이미 물어본 수다");
      const next = clone(state);
      const control = timeControlOf(rules);
      const clock = next.clocks?.[seat];
      if (control && clock) {
        const spent = spendTime(clock, action.spent ?? 0, control);
        (next.clocks as PlayerClock[])[seat] = spent.clock;
        if (spent.flagged) {
          const events: GameEvent[] = [];
          enterReveal(next, { kind: "time", seat: 1 - seat }, events);
          return { ok: true, state: next, events };
        }
      }
      next.guesses.push({
        seat,
        guess: action.guess,
        strikes: null,
        balls: null,
      });
      next.phase = "answer";
      return {
        ok: true,
        state: next,
        events: [{ type: "guessed", seat, guess: action.guess }],
      };
    }
    case "answer": {
      if (state.phase !== "answer") return fail("답할 때가 아니다");
      if (answererOf(state) !== seat) return fail("답할 사람이 아니다");
      const answer = { strikes: action.strikes, balls: action.balls };
      if (!isPossibleScore(answer, rules.digits))
        return fail("나올 수 없는 답이다");
      const next = clone(state);
      const entry = next.guesses.at(-1) as BaseballState["guesses"][number];
      entry.strikes = answer.strikes;
      entry.balls = answer.balls;
      // 앞에서 한 답과 함께 맞는 수가 하나도 없으면 거짓이 확실하다. 받지 않는다.
      if (!hasCandidate(rules, cluesOf(next, entry.seat)))
        return fail("앞에서 한 답과 맞지 않는다");
      const events: GameEvent[] = [
        {
          type: "answered",
          seat,
          guesser: entry.seat,
          guess: entry.guess,
          ...answer,
        },
      ];
      if (answer.strikes === rules.digits) next.solved[entry.seat] = true;
      afterAnswer(next, entry.seat, events);
      return { ok: true, state: next, events };
    }
    case "reveal": {
      if (state.phase !== "reveal") return fail("공개할 때가 아니다");
      if (!revealPending(state).includes(seat))
        return fail("공개할 사람이 아니다");
      if (!isValidNumber(action.secret, rules))
        return fail("규칙에 맞는 수가 아니다");
      if (typeof action.salt !== "string" || !SALT_PATTERN.test(action.salt))
        return fail("소금 형식이 아니다");
      const matches =
        commitmentOf(action.secret, action.salt) === state.commits[seat];
      // 이 사람이 한 답을 공개한 비밀로 다시 계산해 본다.
      let wrongAt: number | null = null;
      for (const [index, g] of state.guesses.entries()) {
        if (g.seat === seat || g.strikes === null || g.balls === null) continue;
        const s = score(action.secret, g.guess);
        if (s.strikes !== g.strikes || s.balls !== g.balls) {
          wrongAt = index;
          break;
        }
      }
      const next = clone(state);
      next.reveals[seat] = {
        secret: action.secret,
        salt: action.salt,
        matches,
        wrongAt,
      };
      const events: GameEvent[] = [
        { type: "revealed", seat, secret: action.secret, matches, wrongAt },
      ];
      finishIfRevealed(next, events);
      return { ok: true, state: next, events };
    }
    case "timeout": {
      if (state.phase !== "play" || state.turn !== seat)
        return fail("차례가 아니다");
      const control = timeControlOf(rules);
      const clock = state.clocks?.[seat];
      if (!control || !clock) return fail("시간 규칙이 없다");
      if (!spendTime(clock, action.spent, control).flagged)
        return fail("아직 시간이 남았다");
      const next = clone(state);
      const events: GameEvent[] = [];
      (next.clocks as PlayerClock[])[seat] = { main: 0, periods: 0 };
      enterReveal(next, { kind: "time", seat: 1 - seat }, events);
      return { ok: true, state: next, events };
    }
    default:
      return fail("모르는 행동이다");
  }
}

function decisionFor(state: BaseballState, seat: number): Decision | null {
  switch (state.phase) {
    case "setup":
      return pendingSeats(state).includes(seat) ? { kind: "commit" } : null;
    case "play":
      return state.turn === seat ? { kind: "guess" } : null;
    case "answer": {
      const last = state.guesses.at(-1);
      return answererOf(state) === seat && last
        ? { kind: "answer", guess: last.guess }
        : null;
    }
    case "reveal":
      return revealPending(state).includes(seat) ? { kind: "reveal" } : null;
    case "roundEnd":
      return state.continued[seat] ? null : { kind: "continue" };
    default:
      return null;
  }
}

export function viewOf(state: BaseballState, seat: number): BaseballView {
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
  rules: BaseballRules,
  seed: number,
  log: readonly LoggedAction[],
):
  | { ok: true; state: BaseballState }
  | { ok: false; index: number; error: string } {
  let { state } = createMatch(rules, seed);
  for (const [index, entry] of log.entries()) {
    const result = step(state, entry.seat, entry.action);
    if (!result.ok) return { ok: false, index, error: result.error };
    state = result.state;
  }
  return { ok: true, state };
}

/** 지금 시계가 가는 자리와 쓸 수 있는 남은 시간(ms). 맞힐 차례에만 간다 */
export function clockTurn(
  state: BaseballState,
): { seat: number; left: number } | null {
  const control = timeControlOf(state.rules);
  if (!control || state.phase !== "play") return null;
  const clock = state.clocks?.[state.turn];
  if (!clock) return null;
  return {
    seat: state.turn,
    left: clock.main + clock.periods * control.byoyomi,
  };
}
