import { janggiBotFor, negamax } from "@mighty/janggi-ai";
import {
  type Action,
  applyMove,
  clockTurn,
  createMatch,
  decodeJanggiRules,
  encodeJanggiRules,
  type GameEvent,
  type JanggiRules,
  type JanggiState,
  type JanggiView,
  KIND_NAMES,
  type Kind,
  other,
  PLAYER_COUNT,
  pendingSeats,
  pointName,
  replay,
  SETUPS,
  SIDE_NAMES,
  sideOfSeat,
  sideToAct,
  step,
  viewOf,
} from "@mighty/janggi-engine";

import type { Commentary, GameKit, KitStats, Verdict } from "@/game/kit";
import type { RoundRecord } from "@/stats/records";

export type JanggiKit = GameKit<
  JanggiRules,
  JanggiState,
  JanggiView,
  Action,
  GameEvent,
  undefined
>;

/** 장기 판 기록(내 자리에서 본 것) */
export interface JanggiRound {
  side: "cho" | "han";
  outcome: "win" | "loss";
  /** 어떻게 끝났나 */
  by: "checkmate" | "resign" | "score" | "time";
  /** 이번 판에 둔 수(쉬기 포함) */
  moves: number;
}

export interface JanggiGame {
  rounds: number;
  wins: number;
  losses: number;
  won: boolean;
  retired: boolean;
}

export const janggiStats: KitStats<JanggiView, GameEvent> = {
  roundStarted: (events) => events.some((e) => e.type === "roundStarted"),
  roundEnded: (events) => events.some((e) => e.type === "roundEnded"),
  gameEnded: (events) => events.some((e) => e.type === "gameEnded"),
  roundNumber: (view) => view.roundNumber,
  round(_start, end, events): JanggiRound | null {
    const ended = events.find(
      (e): e is Extract<GameEvent, { type: "roundEnded" }> =>
        e.type === "roundEnded",
    );
    if (!ended) return null;
    const me = end.mySeat;
    return {
      side: sideOfSeat(end, me) === "c" ? "cho" : "han",
      outcome: ended.result.seat === me ? "win" : "loss",
      by: ended.result.kind,
      moves: end.played.length,
    };
  },
  game(view): JanggiGame {
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

/** 가장 좋은 수와의 값 차이(점수 ×100)로 평가한다 */
function verdictOf(loss: number): Verdict {
  if (loss <= 30) return "good";
  if (loss <= 150) return "fine";
  if (loss <= 400) return "slip";
  return "bad";
}

/** 이 수를 둔 뒤 두 수 앞까지 읽은 값(둔 편에서 본 값) */
function moveValue(state: JanggiState, from: number, to: number): number {
  const side = sideToAct(state) ?? "c";
  const next = applyMove(state.board, { from, to });
  return -negamax(next, other(side), 2, -Infinity, Infinity, {
    bikjangScore: state.rules.bikjang === "score",
  });
}

function moveText(state: JanggiState, from: number, to: number): string {
  const kind = state.board[from]?.[1] as Kind | undefined;
  return `${kind ? KIND_NAMES[kind] : ""} ${pointName(from)}→${pointName(to)}`;
}

/** 다시 보기 해설: 둔 수를 고수가 고르는 수와 견준다 */
export function explainJanggi(
  state: JanggiState,
  next: { seat: number; action: unknown },
  _after: JanggiState | null,
  _seed: number,
  name: (seat: number) => string,
): Commentary {
  const action = next.action as Action;
  const side = sideOfSeat(state, next.seat);
  const situation = [
    `${state.roundNumber}판 ${state.played.length + 1}수째, ${name(next.seat)}(${SIDE_NAMES[side]}) 차례`,
  ];
  if (action.type !== "move") return { situation, verdict: null, reasons: [] };
  const suggested = janggiBotFor(2).decide(viewOf(state, next.seat), {
    seed: 1,
  });
  if (suggested.type !== "move")
    return { situation, verdict: null, reasons: [] };
  const same = suggested.from === action.from && suggested.to === action.to;
  if (same)
    return {
      situation,
      verdict: "good",
      reasons: [
        `${moveText(state, action.from, action.to)}: 고수도 같은 수를 둔다`,
      ],
    };
  const mine = moveValue(state, action.from, action.to);
  const best = Math.max(moveValue(state, suggested.from, suggested.to), mine);
  return {
    situation,
    verdict: verdictOf(best - mine),
    reasons: [
      `${moveText(state, action.from, action.to)}를 뒀다`,
      `고수라면 ${moveText(state, suggested.from, suggested.to)}`,
    ],
  };
}

/** 장기 엔진을 대국 진행·온라인 방에 잇는다 */
export const janggiKit: JanggiKit = {
  id: "janggi",
  createMatch: (rules, seed) => createMatch(rules, seed),
  step,
  viewOf,
  replay: (rules, seed, log) => replay(rules, seed, log),
  pendingSeats,
  playerCount: () => PLAYER_COUNT,
  encodeRules: encodeJanggiRules,
  decodeRules: decodeJanggiRules,
  startEvents: (view) => [
    {
      type: "roundStarted",
      roundNumber: view.roundNumber,
      choSeat: view.choSeat,
    },
  ],
  isOver: (view) => view.phase === "gameOver",
  // 시간패는 방장 기기의 시계만 기록한다.
  guestMayAct: (action) =>
    action.type !== "retire" && action.type !== "timeout",
  retireAction: { type: "retire" },
  stats: janggiStats,
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
        label: SIDE_NAMES[sideOfSeat(state, seat)],
        value: `${state.wins[seat] ?? 0}승`,
      })),
    }),
    describe: (action) => {
      const a = action as Action;
      switch (a.type) {
        case "move":
          return `${pointName(a.from)}→${pointName(a.to)}`;
        case "setup":
          return SETUPS.find((s) => s.value === a.setup)?.label ?? "상차림";
        case "pass":
          return "한 수 쉬기";
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
    explain: explainJanggi,
  },
  botFor: (level) => janggiBotFor(level),
  timing: {
    turn: clockTurn,
    stamp: (action, spent) =>
      action.type === "move" || action.type === "pass"
        ? { ...action, spent }
        : action,
    timeout: (spent) => ({ type: "timeout", spent }),
  },
};

/* ---------- 지표(내 기록) ---------- */

export interface JanggiSummary {
  rounds: number;
  wins: number;
  losses: number;
  /** 초·한으로 둔 판과 이긴 판 */
  cho: { n: number; won: number };
  han: { n: number; won: number };
  /** 외통·기권·점수로 이긴 판 */
  byCheckmate: number;
  byResign: number;
  byScore: number;
  /** 판 평균 수 */
  averageMoves: number;
  /** 최근 판 결과(오래된 것부터, 이김 1·짐 −1) */
  recent: number[];
}

export function summarizeJanggi(rounds: readonly RoundRecord[]): JanggiSummary {
  const all = rounds
    .filter((r) => r.game === "janggi")
    .map((r) => r.data as JanggiRound);
  const won = all.filter((r) => r.outcome === "win");
  const side = (s: JanggiRound["side"]) => {
    const mine = all.filter((r) => r.side === s);
    return {
      n: mine.length,
      won: mine.filter((r) => r.outcome === "win").length,
    };
  };
  return {
    rounds: all.length,
    wins: won.length,
    losses: all.length - won.length,
    cho: side("cho"),
    han: side("han"),
    byCheckmate: won.filter((r) => r.by === "checkmate").length,
    byResign: won.filter((r) => r.by === "resign").length,
    byScore: won.filter((r) => r.by === "score").length,
    averageMoves:
      all.length === 0 ? 0 : all.reduce((n, r) => n + r.moves, 0) / all.length,
    recent: all.slice(-30).map((r) => (r.outcome === "win" ? 1 : -1)),
  };
}
