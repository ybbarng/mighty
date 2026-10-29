import {
  baseballBotFor,
  baseballExpertBot,
  botKnowsSecret,
} from "@mighty/baseball-ai";
import {
  type Action,
  type BaseballRules,
  type BaseballState,
  type BaseballView,
  candidatesFor,
  clockTurn,
  cluesOf,
  createMatch,
  decodeBaseballRules,
  encodeBaseballRules,
  type GameEvent,
  PLAYER_COUNT,
  pendingSeats,
  type RoundResult,
  replay,
  score,
  step,
  viewOf,
} from "@mighty/baseball-engine";

import type { Commentary, GameKit, KitStats, Verdict } from "@/game/kit";
import type { RoundRecord } from "@/stats/records";

export type BaseballKit = GameKit<
  BaseballRules,
  BaseballState,
  BaseballView,
  Action,
  GameEvent,
  undefined
>;

/** 답을 짧게: "1S 2B", "아웃", "3S(맞힘)" */
export function scoreText(
  strikes: number,
  balls: number,
  digits: number,
): string {
  if (strikes === digits) return `${strikes}S 맞힘`;
  if (strikes === 0 && balls === 0) return "아웃";
  return [strikes > 0 ? `${strikes}S` : "", balls > 0 ? `${balls}B` : ""]
    .filter(Boolean)
    .join(" ");
}

/** 숫자야구 판 기록(내 자리에서 본 것) */
export interface BaseballRound {
  mode: "duel" | "puzzle";
  digits: number;
  outcome: "win" | "loss" | "draw";
  by: RoundResult["kind"];
  /** 내가 물어본 횟수 */
  guesses: number;
  /** 내가 상대 수를 맞혔나 */
  solved: boolean;
  /** 서로 맞히기에서 내가 먼저 물었나 */
  first: boolean;
}

export interface BaseballGame {
  rounds: number;
  wins: number;
  losses: number;
  won: boolean;
  retired: boolean;
}

function outcomeOf(result: RoundResult, me: number): BaseballRound["outcome"] {
  if (result.kind === "draw") return "draw";
  if (result.kind === "cheat" && result.seat === null) return "draw";
  return result.seat === me ? "win" : "loss";
}

export const baseballStats: KitStats<BaseballView, GameEvent> = {
  roundStarted: (events) => events.some((e) => e.type === "roundStarted"),
  roundEnded: (events) => events.some((e) => e.type === "roundEnded"),
  gameEnded: (events) => events.some((e) => e.type === "gameEnded"),
  roundNumber: (view) => view.roundNumber,
  round(_start, end, events): BaseballRound | null {
    const ended = events.find(
      (e): e is Extract<GameEvent, { type: "roundEnded" }> =>
        e.type === "roundEnded",
    );
    if (!ended) return null;
    const me = end.mySeat;
    return {
      mode: end.rules.mode,
      digits: end.rules.digits,
      outcome: outcomeOf(ended.result, me),
      by: ended.result.kind,
      guesses: cluesOf(end, me).length,
      solved: end.solved[me] === true,
      first: end.starter === me,
    };
  },
  game(view): BaseballGame {
    const me = view.mySeat;
    const wins = view.wins[me] ?? 0;
    const losses = view.wins[1 - me] ?? 0;
    return {
      rounds: view.roundNumber,
      wins,
      losses,
      won: !view.retired && wins > losses,
      retired: view.retired === true,
    };
  },
};

/** 이 추측을 물으면 남는 후보 수의 평균(Σnᵢ²/N) */
export function expectedLeft(
  candidates: readonly string[],
  guess: string,
  digits: number,
): number {
  if (candidates.length === 0) return 0;
  const buckets = new Map<string, number>();
  for (const c of candidates) {
    const s = score(c, guess);
    if (s.strikes === digits) continue;
    const key = `${s.strikes}-${s.balls}`;
    buckets.set(key, (buckets.get(key) ?? 0) + 1);
  }
  let sum = 0;
  for (const n of buckets.values()) sum += n * n;
  return sum / candidates.length;
}

function verdictOf(mine: number, best: number, candidate: boolean): Verdict {
  if (mine <= best * 1.05 + 0.01) return "good";
  if (mine <= best * 1.6 + 0.5) return candidate ? "good" : "fine";
  if (mine <= best * 3 + 1) return "slip";
  return "bad";
}

/** 다시 보기 해설: 추측이면 남는 후보 평균을 고수의 수와 견준다 */
export function explainBaseball(
  state: BaseballState,
  next: { seat: number; action: unknown },
  _after: BaseballState | null,
  _seed: number,
  name: (seat: number) => string,
): Commentary {
  const action = next.action as Action;
  const asked = cluesOf(state, next.seat).length;
  const situation = [`${state.roundNumber}판, ${name(next.seat)}`];
  if (action.type !== "guess") {
    if (action.type === "answer")
      situation.push(
        `답: ${scoreText(action.strikes, action.balls, state.rules.digits)}`,
      );
    return { situation, verdict: null, reasons: [] };
  }
  const candidates = candidatesFor(state.rules, cluesOf(state, next.seat));
  situation.push(`${asked + 1}번째 물음, 남은 후보 ${candidates.length}개`);
  const view = viewOf(state, next.seat);
  const suggested = baseballExpertBot.decide(view, { seed: 1 });
  const bestGuess = suggested.type === "guess" ? suggested.guess : action.guess;
  const digits = state.rules.digits;
  const mine = expectedLeft(candidates, action.guess, digits);
  const best = expectedLeft(candidates, bestGuess, digits);
  const candidate = candidates.includes(action.guess);
  const reasons = [
    `${action.guess}: ${candidate ? "남은 후보 가운데 하나" : "이미 빠진 수(맞을 수는 없다)"}, 물으면 후보가 평균 ${mine.toFixed(1)}개 남는다`,
  ];
  if (bestGuess !== action.guess)
    reasons.push(`고수라면 ${bestGuess}(평균 ${best.toFixed(1)}개)`);
  else reasons.push("고수도 같은 수를 묻는다");
  return {
    situation,
    verdict:
      bestGuess === action.guess ? "good" : verdictOf(mine, best, candidate),
    reasons,
  };
}

function describe(action: unknown): string {
  const a = action as Action;
  switch (a.type) {
    case "commit":
      return "비밀 수 정함";
    case "guess":
      return a.guess;
    case "answer":
      return `${a.strikes}S ${a.balls}B`;
    case "reveal":
      return `공개 ${a.secret}`;
    case "resign":
      return "기권";
    case "timeout":
      return "시간패";
    case "continue":
      return "다음 판";
    default:
      return a.type;
  }
}

/** 숫자야구 엔진을 대국 진행·온라인 방에 잇는다 */
export const baseballKit: BaseballKit = {
  id: "baseball",
  createMatch: (rules, seed) => createMatch(rules, seed),
  step,
  viewOf,
  replay: (rules, seed, log) => replay(rules, seed, log),
  pendingSeats,
  playerCount: () => PLAYER_COUNT,
  encodeRules: encodeBaseballRules,
  decodeRules: decodeBaseballRules,
  startEvents: (view) => [
    {
      type: "roundStarted",
      roundNumber: view.roundNumber,
      starter: view.starter,
    },
  ],
  isOver: (view) => view.phase === "gameOver",
  // 시간패·끝내기는 방장 기기만 기록한다.
  guestMayAct: (action) =>
    action.type !== "retire" && action.type !== "timeout",
  // 상대 차례에도 기권할 수 있다(받아들일지는 엔진이 정한다).
  offTurn: (view, action) =>
    action.type === "resign" &&
    (view.phase === "setup" ||
      view.phase === "play" ||
      view.phase === "answer"),
  // 끊긴 사람 대신 둘 때, 사람이 정한 비밀은 모르니 답하기·공개는 그 사람을 기다린다.
  botCanAct: botKnowsSecret,
  retireAction: { type: "retire" },
  stats: baseballStats,
  // 숨긴 패가 없다. 비밀은 판 끝 공개 행동으로 기록에 들어 있다.
  review: {
    firstExtra: () => undefined,
    prepare: (state) => state,
    cleanup: (state) => state,
    realAction: (action) => action,
    situation: (state) => ({
      voids: [[], []],
      tally: [0, 1].map((seat) => ({
        seat,
        label: `${cluesOf(state, seat).length}번 물음`,
        value: `${state.wins[seat] ?? 0}승`,
      })),
    }),
    describe,
    sortHand: (_state, cards) => [...cards],
    explain: explainBaseball,
  },
  botFor: (level) => baseballBotFor(level),
  timing: {
    turn: clockTurn,
    stamp: (action, spent) =>
      action.type === "guess" ? { ...action, spent } : action,
    timeout: (spent) => ({ type: "timeout", spent }),
    strip: (action) => {
      if (action.type === "timeout") return null;
      if (!("spent" in action)) return action;
      const { spent: _spent, ...rest } = action;
      return rest as Action;
    },
  },
};

/* ---------- 지표(내 기록) ---------- */

export interface BaseballSummary {
  rounds: number;
  wins: number;
  losses: number;
  draws: number;
  /** 서로 맞히기 판 */
  duel: { n: number; won: number };
  /** 퍼즐: 푼 판과 평균·가장 적은 물음 수 */
  puzzle: { n: number; solved: number; average: number; best: number | null };
  /** 맞힌 판의 평균 물음 수(서로 맞히기) */
  averageGuesses: number;
  /** 먼저 물은 판·나중에 물은 판 승률 */
  first: { n: number; won: number };
  second: { n: number; won: number };
  /** 상대 거짓이 드러나 이긴 판 */
  byCheat: number;
  recent: number[];
}

export function summarizeBaseball(
  rounds: readonly RoundRecord[],
): BaseballSummary {
  const all = rounds
    .filter((r) => r.game === "baseball")
    .map((r) => r.data as BaseballRound);
  const duel = all.filter((r) => r.mode === "duel");
  const puzzle = all.filter((r) => r.mode === "puzzle");
  const solvedPuzzles = puzzle.filter((r) => r.solved);
  const solvedDuels = duel.filter((r) => r.solved);
  const side = (first: boolean) => {
    const mine = duel.filter((r) => r.first === first);
    return {
      n: mine.length,
      won: mine.filter((r) => r.outcome === "win").length,
    };
  };
  const avg = (list: BaseballRound[]) =>
    list.length === 0
      ? 0
      : list.reduce((n, r) => n + r.guesses, 0) / list.length;
  return {
    rounds: all.length,
    wins: all.filter((r) => r.outcome === "win").length,
    losses: all.filter((r) => r.outcome === "loss").length,
    draws: all.filter((r) => r.outcome === "draw").length,
    duel: {
      n: duel.length,
      won: duel.filter((r) => r.outcome === "win").length,
    },
    puzzle: {
      n: puzzle.length,
      solved: solvedPuzzles.length,
      average: avg(solvedPuzzles),
      best:
        solvedPuzzles.length === 0
          ? null
          : Math.min(...solvedPuzzles.map((r) => r.guesses)),
    },
    averageGuesses: avg(solvedDuels),
    first: side(true),
    second: side(false),
    byCheat: all.filter((r) => r.by === "cheat" && r.outcome === "win").length,
    recent: all
      .slice(-30)
      .map((r) => (r.outcome === "win" ? 1 : r.outcome === "loss" ? -1 : 0)),
  };
}
