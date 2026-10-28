import {
  badukBotFor,
  boardOfView,
  EXPERT_PLAYOUTS,
  moveWinRate,
  search,
} from "@mighty/baduk-ai";
import {
  type Action,
  type BadukRules,
  type BadukState,
  type BadukView,
  clockTurn,
  createMatch,
  decodeBadukRules,
  encodeBadukRules,
  type GameEvent,
  PLAYER_COUNT,
  pendingSeats,
  pointName,
  replay,
  STONE_NAMES,
  step,
  stoneOfSeat,
  viewOf,
} from "@mighty/baduk-engine";
import { createRng } from "@mighty/engine";

import type { Commentary, GameKit, KitStats, Verdict } from "@/game/kit";
import type { RoundRecord } from "@/stats/records";

export type BadukKit = GameKit<
  BadukRules,
  BadukState,
  BadukView,
  Action,
  GameEvent,
  undefined
>;

/** 바둑 판 기록(내 자리에서 본 것) */
export interface BadukRound {
  stone: "black" | "white";
  /** 판 크기(줄 수) */
  size: number;
  outcome: "win" | "loss";
  /** 어떻게 끝났나: 세기·기권·시간 */
  by: "score" | "resign" | "time";
  /** 세기로 끝났으면 이긴 쪽과 진 쪽의 차이(덤 포함) */
  margin: number | null;
  /** 이번 판에 둔 수(쉬기 포함) */
  moves: number;
}

export interface BadukGame {
  rounds: number;
  wins: number;
  losses: number;
  won: boolean;
  retired: boolean;
}

export const badukStats: KitStats<BadukView, GameEvent> = {
  roundStarted: (events) => events.some((e) => e.type === "roundStarted"),
  roundEnded: (events) => events.some((e) => e.type === "roundEnded"),
  gameEnded: (events) => events.some((e) => e.type === "gameEnded"),
  roundNumber: (view) => view.roundNumber,
  round(_start, end, events): BadukRound | null {
    const ended = events.find(
      (e): e is Extract<GameEvent, { type: "roundEnded" }> =>
        e.type === "roundEnded",
    );
    if (!ended) return null;
    const me = end.mySeat;
    const result = ended.result;
    return {
      stone: stoneOfSeat(end, me) === 1 ? "black" : "white",
      size: end.rules.size,
      outcome: result.seat === me ? "win" : "loss",
      by: result.kind,
      margin:
        result.kind === "score"
          ? Math.abs(result.count.black - result.count.white)
          : null,
      moves: end.played.length,
    };
  },
  game(view): BadukGame {
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

/** 고수 수와의 승률 차이로 평가한다 */
function verdictOf(loss: number): Verdict {
  if (loss <= 0.03) return "good";
  if (loss <= 0.1) return "fine";
  if (loss <= 0.25) return "slip";
  return "bad";
}

const percent = (rate: number) => `${Math.round(rate * 100)}%`;

/** 다시 보기 해설: 둔 수를 고수가 고르는 수와 승률로 견준다 */
export function explainBaduk(
  state: BadukState,
  next: { seat: number; action: unknown },
  _after: BadukState | null,
  seed: number,
  name: (seat: number) => string,
): Commentary {
  const action = next.action as Action;
  const stone = stoneOfSeat(state, next.seat);
  const size = state.rules.size;
  const situation = [
    `${state.roundNumber}판 ${state.played.length + 1}수째, ${name(next.seat)}(${STONE_NAMES[stone]}) 차례`,
    `따낸 돌 흑 ${state.prisoners[1]} · 백 ${state.prisoners[2]}`,
  ];
  if (action.type === "pass")
    return {
      situation,
      verdict: null,
      reasons: [
        state.passes > 0
          ? "상대에 이어 쉬어 판이 끝났다"
          : "쉬었다(둘이 이어 쉬면 판 위 그대로 센다)",
      ],
    };
  if (action.type !== "place") return { situation, verdict: null, reasons: [] };
  const view = viewOf(state, next.seat);
  const root = boardOfView(view);
  const rng = createRng(seed + 1);
  // 해설은 다시 보기에서 한 수마다 부르므로 고수의 절반만 둬 본다.
  const playouts = Math.round(
    (EXPERT_PLAYOUTS / 2) * (size <= 9 ? 1 : size <= 13 ? 0.4 : 0.15),
  );
  const best = search(root, state.rules.komi, playouts, rng, {
    allowed: view.legal,
  });
  const mine = pointName(action.at, size);
  if (best.move === action.at)
    return {
      situation,
      verdict: "good",
      reasons: [
        `${mine}: 고수도 같은 수를 둔다(승률 ${percent(best.winRate)})`,
      ],
    };
  const seen = best.stats.find((s) => s.move === action.at);
  const mineRate =
    seen && seen.visits >= 30
      ? seen.winRate
      : moveWinRate(root, action.at, state.rules.komi, 200, rng);
  const bestName = best.move >= 0 ? pointName(best.move, size) : "쉬기";
  return {
    situation,
    verdict: verdictOf(best.winRate - mineRate),
    reasons: [
      `${mine}에 뒀다(승률 ${percent(mineRate)})`,
      `고수라면 ${bestName}(승률 ${percent(best.winRate)})`,
    ],
  };
}

/** 판 결과를 한 줄로: "흑 41 : 백 47.5" */
export function countText(count: { black: number; white: number }): string {
  return `흑 ${count.black} : 백 ${count.white}`;
}

/** 바둑 엔진을 대국 진행·온라인 방에 잇는다 */
export const badukKit: BadukKit = {
  id: "baduk",
  createMatch: (rules, seed) => createMatch(rules, seed),
  step,
  viewOf,
  replay: (rules, seed, log) => replay(rules, seed, log),
  pendingSeats,
  playerCount: () => PLAYER_COUNT,
  encodeRules: encodeBadukRules,
  decodeRules: decodeBadukRules,
  startEvents: (view) => [
    {
      type: "roundStarted",
      roundNumber: view.roundNumber,
      blackSeat: view.blackSeat,
    },
  ],
  isOver: (view) => view.phase === "gameOver",
  // 시간패는 방장 기기의 시계만 기록한다.
  guestMayAct: (action) =>
    action.type !== "retire" && action.type !== "timeout",
  retireAction: { type: "retire" },
  stats: badukStats,
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
        label: STONE_NAMES[stoneOfSeat(state, seat)],
        value: `${state.wins[seat] ?? 0}승`,
      })),
    }),
    describe: (action) => {
      const a = action as Action;
      switch (a.type) {
        case "place":
          return `${a.at}번 자리`;
        case "pass":
          return "쉬기";
        case "resign":
          return "기권";
        case "timeout":
          return "시간패";
        case "continue":
          return "다음 판";
        default:
          return a.type;
      }
    },
    sortHand: (_state, cards) => [...cards],
    explain: explainBaduk,
  },
  botFor: (level) => badukBotFor(level),
  timing: {
    turn: clockTurn,
    stamp: (action, spent) =>
      action.type === "place" || action.type === "pass"
        ? { ...action, spent }
        : action,
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

export interface BadukSummary {
  rounds: number;
  wins: number;
  losses: number;
  /** 흑·백으로 둔 판과 이긴 판 */
  black: { n: number; won: number };
  white: { n: number; won: number };
  /** 세기·기권·시간으로 이긴 판 */
  byScore: number;
  byResign: number;
  byTime: number;
  /** 판 크기마다 둔 판 수 */
  sizes: Record<number, number>;
  /** 세기로 이긴 판의 평균 차이 */
  averageMargin: number;
  /** 판 평균 수 */
  averageMoves: number;
  /** 최근 판 결과(오래된 것부터, 이김 1·짐 −1) */
  recent: number[];
}

export function summarizeBaduk(rounds: readonly RoundRecord[]): BadukSummary {
  const all = rounds
    .filter((r) => r.game === "baduk")
    .map((r) => r.data as BadukRound);
  const won = all.filter((r) => r.outcome === "win");
  const side = (s: BadukRound["stone"]) => {
    const mine = all.filter((r) => r.stone === s);
    return {
      n: mine.length,
      won: mine.filter((r) => r.outcome === "win").length,
    };
  };
  const sizes: Record<number, number> = {};
  for (const r of all) sizes[r.size] = (sizes[r.size] ?? 0) + 1;
  const margins = won
    .map((r) => r.margin)
    .filter((m): m is number => m !== null);
  return {
    rounds: all.length,
    wins: won.length,
    losses: all.length - won.length,
    black: side("black"),
    white: side("white"),
    byScore: won.filter((r) => r.by === "score").length,
    byResign: won.filter((r) => r.by === "resign").length,
    byTime: won.filter((r) => r.by === "time").length,
    sizes,
    averageMargin:
      margins.length === 0
        ? 0
        : margins.reduce((n, m) => n + m, 0) / margins.length,
    averageMoves:
      all.length === 0 ? 0 : all.reduce((n, r) => n + r.moves, 0) / all.length,
    recent: all.slice(-30).map((r) => (r.outcome === "win" ? 1 : -1)),
  };
}
