import { chessBotFor, positionValue } from "@mighty/chess-ai";
import {
  type Action,
  applyMove,
  type ChessRules,
  type ChessState,
  type ChessView,
  clockTurn,
  createMatch,
  type DrawReason,
  decodeChessRules,
  encodeChessRules,
  type GameEvent,
  type Move,
  moveToSan,
  PLAYER_COUNT,
  pendingSeats,
  replay,
  SIDE_NAMES,
  sideOfSeat,
  squareName,
  step,
  viewOf,
} from "@mighty/chess-engine";

import type { Commentary, GameKit, KitStats, Verdict } from "@/game/kit";
import type { RoundRecord } from "@/stats/records";

export type ChessKit = GameKit<
  ChessRules,
  ChessState,
  ChessView,
  Action,
  GameEvent,
  undefined
>;

/** 체스 판 기록(내 자리에서 본 것) */
export interface ChessRound {
  side: "white" | "black";
  outcome: "win" | "loss" | "draw";
  /** 어떻게 끝났나 */
  by: "checkmate" | "resign" | "time" | DrawReason;
  /** 이번 판에 둔 수(두 편 합) */
  moves: number;
}

export interface ChessGame {
  rounds: number;
  wins: number;
  losses: number;
  draws: number;
  won: boolean;
  retired: boolean;
}

/** 비긴 까닭을 사람 말로 */
export const DRAW_LABEL: Record<DrawReason, string> = {
  stalemate: "스테일메이트",
  fifty: "50수 규칙",
  repetition: "같은 판 세 번",
  material: "기물 부족",
  timeout: "시간 끝, 메이트할 기물 없음",
};

export const chessStats: KitStats<ChessView, GameEvent> = {
  roundStarted: (events) => events.some((e) => e.type === "roundStarted"),
  roundEnded: (events) => events.some((e) => e.type === "roundEnded"),
  gameEnded: (events) => events.some((e) => e.type === "gameEnded"),
  roundNumber: (view) => view.roundNumber,
  round(_start, end, events): ChessRound | null {
    const ended = events.find(
      (e): e is Extract<GameEvent, { type: "roundEnded" }> =>
        e.type === "roundEnded",
    );
    if (!ended) return null;
    const me = end.mySeat;
    const { result } = ended;
    return {
      side: sideOfSeat(end, me) === "w" ? "white" : "black",
      outcome:
        result.kind === "draw" ? "draw" : result.seat === me ? "win" : "loss",
      by: result.kind === "draw" ? result.reason : result.kind,
      moves: end.played.length,
    };
  },
  game(view): ChessGame {
    const me = view.mySeat;
    const wins = view.wins[me] ?? 0;
    const losses = view.wins[1 - me] ?? 0;
    return {
      rounds: view.roundNumber,
      wins,
      losses,
      draws: view.draws,
      won: !view.retired && wins > losses,
      retired: view.retired === true,
    };
  },
};

/** 가장 좋은 수와의 값 차이(폰 100)로 평가한다 */
function verdictOf(loss: number): Verdict {
  if (loss <= 30) return "good";
  if (loss <= 100) return "fine";
  if (loss <= 300) return "slip";
  return "bad";
}

/** 이 수를 둔 뒤 두 수 앞까지 읽은 값(둔 편에서 본 값) */
function moveValue(state: ChessState, move: Move): number {
  return -positionValue(applyMove(state.position, move), 2);
}

/** 다시 보기 해설: 둔 수를 고수가 고르는 수와 견준다. 수는 기보(SAN)로 보인다 */
export function explainChess(
  state: ChessState,
  next: { seat: number; action: unknown },
  _after: ChessState | null,
  _seed: number,
  name: (seat: number) => string,
): Commentary {
  const action = next.action as Action;
  const side = sideOfSeat(state, next.seat);
  const situation = [
    `${state.roundNumber}판 ${state.position.fullmove}수째, ${name(next.seat)}(${SIDE_NAMES[side]}) 차례`,
  ];
  if (action.type !== "move" || state.phase !== "play")
    return { situation, verdict: null, reasons: [] };
  const played: Move = {
    from: action.from,
    to: action.to,
    ...(action.promotion ? { promotion: action.promotion } : {}),
  };
  const suggested = chessBotFor(2).decide(viewOf(state, next.seat), {
    seed: 1,
  });
  const mine = moveToSan(state.position, played);
  if (suggested.type !== "move")
    return { situation, verdict: null, reasons: [`둔 수: ${mine}`] };
  const best: Move = {
    from: suggested.from,
    to: suggested.to,
    ...(suggested.promotion ? { promotion: suggested.promotion } : {}),
  };
  const bestSan = moveToSan(state.position, best);
  if (bestSan === mine)
    return {
      situation,
      verdict: "good",
      reasons: [`${mine}: 고수도 같은 수를 둔다`],
    };
  const mineValue = moveValue(state, played);
  const bestValue = Math.max(moveValue(state, best), mineValue);
  return {
    situation,
    verdict: verdictOf(bestValue - mineValue),
    reasons: [`둔 수: ${mine}`, `고수라면 ${bestSan}`],
  };
}

/** 기록 속 행동 한 줄(다시 보기 목록) */
function describeAction(action: unknown): string {
  const a = action as Action;
  switch (a.type) {
    case "move":
      return `${squareName(a.from)}→${squareName(a.to)}${a.promotion ? `=${a.promotion}` : ""}`;
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

/** 체스 엔진을 대국 진행·온라인 방에 잇는다 */
export const chessKit: ChessKit = {
  id: "chess",
  createMatch: (rules, seed) => createMatch(rules, seed),
  step,
  viewOf,
  replay: (rules, seed, log) => replay(rules, seed, log),
  pendingSeats,
  playerCount: () => PLAYER_COUNT,
  encodeRules: encodeChessRules,
  decodeRules: decodeChessRules,
  startEvents: (view) => [
    {
      type: "roundStarted",
      roundNumber: view.roundNumber,
      whiteSeat: view.whiteSeat,
    },
  ],
  isOver: (view) => view.phase === "gameOver",
  // 시간패는 방장 기기의 시계만 기록한다.
  guestMayAct: (action) =>
    action.type !== "retire" && action.type !== "timeout",
  retireAction: { type: "retire" },
  stats: chessStats,
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
    describe: describeAction,
    sortHand: (_state, cards) => [...cards],
    explain: explainChess,
  },
  botFor: (level) => chessBotFor(level),
  timing: {
    turn: clockTurn,
    stamp: (action, spent) =>
      action.type === "move" ? { ...action, spent } : action,
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

export interface ChessSummary {
  rounds: number;
  wins: number;
  losses: number;
  draws: number;
  /** 백·흑으로 둔 판과 이긴 판 */
  white: { n: number; won: number };
  black: { n: number; won: number };
  byCheckmate: number;
  byResign: number;
  byTime: number;
  /** 판 평균 수(두 편 합) */
  averageMoves: number;
  /** 최근 판 결과(오래된 것부터, 이김 1·비김 0·짐 −1) */
  recent: number[];
}

export function summarizeChess(rounds: readonly RoundRecord[]): ChessSummary {
  const all = rounds
    .filter((r) => r.game === "chess")
    .map((r) => r.data as ChessRound);
  const won = all.filter((r) => r.outcome === "win");
  const side = (s: ChessRound["side"]) => {
    const mine = all.filter((r) => r.side === s);
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
    white: side("white"),
    black: side("black"),
    byCheckmate: won.filter((r) => r.by === "checkmate").length,
    byResign: won.filter((r) => r.by === "resign").length,
    byTime: won.filter((r) => r.by === "time").length,
    averageMoves:
      all.length === 0 ? 0 : all.reduce((n, r) => n + r.moves, 0) / all.length,
    recent: all
      .slice(-30)
      .map((r) => (r.outcome === "win" ? 1 : r.outcome === "draw" ? 0 : -1)),
  };
}
