import type { GameEvent, MinhwatuView, YakId } from "@mighty/minhwatu-engine";

import type { KitStats } from "@/game/kit";
import type { GameRecord, RoundRecord } from "@/stats/records";

/** 민화투 판 기록(내 자리에서 본 것) */
export interface MinhwatuRound {
  players: number;
  /** 이번 판 내 점수(카드 + 약 주고받기 − 본) */
  score: number;
  /** 내 카드 점수(광·열끗·띠) */
  cards: number;
  /** 내가 이룬 약 */
  yaks: YakId[];
  /** 판 점수 순위(1부터) */
  rank: number;
}

export interface MinhwatuGame {
  players: number;
  rounds: number;
  total: number;
  rank: number;
  won: boolean;
  retired: boolean;
}

const rankOf = (scores: readonly number[], seat: number) =>
  scores.filter((s) => s > (scores[seat] ?? 0)).length + 1;

export const minhwatuStats: KitStats<MinhwatuView, GameEvent> = {
  roundStarted: (events) => events.some((e) => e.type === "roundStarted"),
  roundEnded: (events) => events.some((e) => e.type === "roundEnded"),
  gameEnded: (events) => events.some((e) => e.type === "gameEnded"),
  roundNumber: (view) => view.roundNumber,
  round(_start, end, events): MinhwatuRound | null {
    const ended = events.find(
      (e): e is Extract<GameEvent, { type: "roundEnded" }> =>
        e.type === "roundEnded",
    );
    if (!ended) return null;
    const me = end.seat;
    const scores = ended.result.scores.map((s) => s.total);
    const mine = ended.result.scores[me];
    return {
      players: scores.length,
      score: mine?.total ?? 0,
      cards: mine?.cards ?? 0,
      yaks: mine?.yaks.map((y) => y.id) ?? [],
      rank: rankOf(scores, me),
    };
  },
  game(view, events): MinhwatuGame {
    const over = events.find(
      (e): e is Extract<GameEvent, { type: "gameEnded" }> =>
        e.type === "gameEnded",
    );
    const me = view.seat;
    return {
      players: view.totals.length,
      rounds: view.history.length,
      total: view.totals[me] ?? 0,
      rank: rankOf(view.totals, me),
      won: !view.retired && (over?.winners.includes(me) ?? false),
      retired: view.retired,
    };
  },
};

/* ---------- 지표(내 기록) ---------- */

export interface MinhwatuSummary {
  rounds: number;
  games: number;
  wins: number;
  /** 판 평균 점수 */
  average: number;
  /** 판 1등 */
  firsts: number;
  /** 판 평균 카드 점수 */
  averageCards: number;
  /** 약별로 이룬 판 수 */
  yaks: Partial<Record<YakId, number>>;
  /** 최근 판 점수(오래된 것부터) */
  recent: number[];
  /** 가장 높은 판 점수 */
  best: number | null;
}

export function summarizeMinhwatu(
  rounds: readonly RoundRecord[],
  games: readonly GameRecord[],
): MinhwatuSummary {
  const all = rounds
    .filter((r) => r.game === "minhwatu")
    .map((r) => r.data as MinhwatuRound);
  const ended = games
    .filter((g) => g.game === "minhwatu")
    .map((g) => g.data as MinhwatuGame)
    .filter((g) => !g.retired);
  const yaks: Partial<Record<YakId, number>> = {};
  for (const r of all) for (const y of r.yaks) yaks[y] = (yaks[y] ?? 0) + 1;
  const avg = (f: (r: MinhwatuRound) => number) =>
    all.length === 0 ? 0 : all.reduce((n, r) => n + f(r), 0) / all.length;
  return {
    rounds: all.length,
    games: ended.length,
    wins: ended.filter((g) => g.won).length,
    average: avg((r) => r.score),
    firsts: all.filter((r) => r.rank === 1).length,
    averageCards: avg((r) => r.cards),
    yaks,
    recent: all.slice(-30).map((r) => r.score),
    best: all.length === 0 ? null : Math.max(...all.map((r) => r.score)),
  };
}
