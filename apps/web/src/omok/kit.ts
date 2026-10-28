import { omokBotFor, placeGain } from "@mighty/omok-ai";
import {
  type Action,
  createMatch,
  decodeOmokRules,
  encodeOmokRules,
  type GameEvent,
  type OmokRules,
  type OmokState,
  type OmokView,
  other,
  PLAYER_COUNT,
  pendingSeats,
  pointName,
  replay,
  step,
  stoneOfSeat,
  stoneToMove,
  viewOf,
} from "@mighty/omok-engine";

import type { Commentary, GameKit, KitStats, Verdict } from "@/game/kit";
import type { RoundRecord } from "@/stats/records";

export type OmokKit = GameKit<
  OmokRules,
  OmokState,
  OmokView,
  Action,
  GameEvent,
  undefined
>;

/** 오목 판 기록(내 자리에서 본 것) */
export interface OmokRound {
  /** 내 돌 색 */
  stone: "black" | "white";
  outcome: "win" | "loss" | "draw";
  /** 어떻게 끝났나 */
  by: "five" | "resign" | "draw";
  /** 판에 놓인 돌 수 */
  moves: number;
}

export interface OmokGame {
  rounds: number;
  wins: number;
  losses: number;
  won: boolean;
  retired: boolean;
}

export const omokStats: KitStats<OmokView, GameEvent> = {
  roundStarted: (events) => events.some((e) => e.type === "roundStarted"),
  roundEnded: (events) => events.some((e) => e.type === "roundEnded"),
  gameEnded: (events) => events.some((e) => e.type === "gameEnded"),
  roundNumber: (view) => view.roundNumber,
  round(_start, end, events): OmokRound | null {
    const ended = events.find(
      (e): e is Extract<GameEvent, { type: "roundEnded" }> =>
        e.type === "roundEnded",
    );
    if (!ended) return null;
    const me = end.mySeat;
    const { result } = ended;
    return {
      stone: stoneOfSeat(end, me) === 1 ? "black" : "white",
      outcome:
        result.kind === "draw" ? "draw" : result.seat === me ? "win" : "loss",
      by: result.kind,
      moves: end.moves.length,
    };
  },
  game(view): OmokGame {
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

/** 가장 좋은 자리 대비 이 수의 모양 점수로 평가한다 */
function verdictOf(score: number, best: number): Verdict {
  if (best <= 0 || score >= best * 0.95) return "good";
  if (score >= best * 0.6) return "fine";
  if (score >= best * 0.25) return "slip";
  return "bad";
}

/** 다시 보기 해설: 둔 자리의 공격·막기 값을 고수가 보는 가장 좋은 자리와 견준다 */
export function explainOmok(
  state: OmokState,
  next: { seat: number; action: unknown },
  _after: OmokState | null,
  _seed: number,
  name: (seat: number) => string,
): Commentary {
  const action = next.action as Action;
  const stone = stoneToMove(state);
  const situation = [
    `${state.roundNumber}판 ${state.moves.length + 1}수째, ${name(next.seat)} ${stone === 1 ? "흑" : "백"} 차례`,
  ];
  if (action.type !== "place") return { situation, verdict: null, reasons: [] };
  const value = (at: number) =>
    placeGain(state.board, at, stone) +
    placeGain(state.board, at, other(stone));
  const bot = omokBotFor(2);
  const view = viewOf(state, next.seat);
  const suggested = bot.decide(view, { seed: 1 });
  const bestAt = suggested.type === "place" ? suggested.at : action.at;
  const score = value(action.at);
  const best = Math.max(value(bestAt), score);
  const verdict = action.at === bestAt ? "good" : verdictOf(score, best);
  const reasons =
    action.at === bestAt
      ? [`${pointName(action.at)}: 고수도 같은 자리를 둔다`]
      : [
          `${pointName(action.at)}에 뒀다`,
          `고수라면 ${pointName(bestAt)}(모양 점수 ${best} 대 ${score})`,
        ];
  return { situation, verdict, reasons };
}

/** 오목 엔진을 대국 진행·온라인 방에 잇는다 */
export const omokKit: OmokKit = {
  id: "omok",
  createMatch: (rules, seed) => createMatch(rules, seed),
  step,
  viewOf,
  replay: (rules, seed, log) => replay(rules, seed, log),
  pendingSeats,
  playerCount: () => PLAYER_COUNT,
  encodeRules: encodeOmokRules,
  decodeRules: decodeOmokRules,
  startEvents: (view) => [
    {
      type: "roundStarted",
      roundNumber: view.roundNumber,
      blackSeat: view.blackSeat,
    },
  ],
  isOver: (view) => view.phase === "gameOver",
  guestMayAct: (action) => action.type !== "retire",
  retireAction: { type: "retire" },
  stats: omokStats,
  // 완전 공개 게임이라 판마다 넣을 패가 없다.
  review: {
    firstExtra: () => undefined,
    prepare: (state) => state,
    cleanup: (state) => state,
    realAction: (action) => action,
    situation: (state) => ({
      voids: [[], []],
      tally: [0, 1].map((seat) => ({
        seat,
        label: stoneOfSeat(state, seat) === 1 ? "흑" : "백",
        value: `${state.wins[seat] ?? 0}승`,
      })),
    }),
    describe: (action) => {
      const a = action as Action;
      switch (a.type) {
        case "place":
          return pointName(a.at);
        case "resign":
          return "기권";
        case "continue":
          return "다음 판";
        default:
          return a.type;
      }
    },
    sortHand: (_state, cards) => [...cards],
    explain: explainOmok,
  },
  botFor: (level) => omokBotFor(level),
};

/* ---------- 지표(내 기록) ---------- */

export interface OmokSummary {
  rounds: number;
  wins: number;
  losses: number;
  draws: number;
  /** 흑·백으로 둔 판과 이긴 판 */
  black: { n: number; won: number };
  white: { n: number; won: number };
  /** 다섯으로 이긴 판, 상대 기권으로 이긴 판 */
  byFive: number;
  byResign: number;
  /** 판 평균 수(놓인 돌 수) */
  averageMoves: number;
  /** 가장 짧게 이긴 판의 수 */
  fastestWin: number | null;
  /** 최근 판 결과(오래된 것부터, 이김 1·비김 0·짐 −1) */
  recent: number[];
}

export function summarizeOmok(rounds: readonly RoundRecord[]): OmokSummary {
  const all = rounds
    .filter((r) => r.game === "omok")
    .map((r) => r.data as OmokRound);
  const won = all.filter((r) => r.outcome === "win");
  const side = (stone: OmokRound["stone"]) => {
    const mine = all.filter((r) => r.stone === stone);
    return {
      n: mine.length,
      won: mine.filter((r) => r.outcome === "win").length,
    };
  };
  return {
    rounds: all.length,
    wins: won.length,
    losses: all.filter((r) => r.outcome === "loss").length,
    draws: all.filter((r) => r.outcome === "draw").length,
    black: side("black"),
    white: side("white"),
    byFive: won.filter((r) => r.by === "five").length,
    byResign: won.filter((r) => r.by === "resign").length,
    averageMoves:
      all.length === 0 ? 0 : all.reduce((n, r) => n + r.moves, 0) / all.length,
    fastestWin:
      won.filter((r) => r.by === "five").length === 0
        ? null
        : Math.min(...won.filter((r) => r.by === "five").map((r) => r.moves)),
    recent: all
      .slice(-30)
      .map((r) => (r.outcome === "win" ? 1 : r.outcome === "loss" ? -1 : 0)),
  };
}
