import type { GameEvent, PlayerView } from "@mighty/hearts-engine";

import type { KitStats } from "@/game/kit";
import type { GameRecord, RoundRecord } from "@/stats/records";

/** 하트 판 기록(내 자리에서 본 것) */
export interface HeartsRound {
  /** 이번 판 내 점수(문 슛 반영 뒤) */
  points: number;
  /** 문 슛: 내가 했다 / 남이 했다 */
  moon: "me" | "other" | null;
  /** 판이 끝난 뒤 내 합계 */
  total: number;
  /** 아래는 판 사건에서 센다(판 처음을 보지 못했으면 0) */
  tricks: number;
  /** ♠Q를 먹었다 */
  queen: boolean;
}

export interface HeartsGame {
  rounds: number;
  score: number;
  /** 점수 순위(낮을수록 좋다, 1부터) */
  rank: number;
  won: boolean;
  retired: boolean;
}

const QUEEN = "SQ";

export const heartsStats: KitStats<PlayerView, GameEvent> = {
  roundStarted: (events) => events.some((e) => e.type === "roundStarted"),
  roundEnded: (events) => events.some((e) => e.type === "roundScored"),
  gameEnded: (events) => events.some((e) => e.type === "gameOver"),
  roundNumber: (view) => view.roundNumber,
  round(_start, end, events): HeartsRound | null {
    const me = end.seat;
    const scored = events.find(
      (e): e is Extract<GameEvent, { type: "roundScored" }> =>
        e.type === "roundScored",
    );
    if (!scored) return null;
    let trick: string[] = [];
    let tricks = 0;
    let queen = false;
    for (const e of events) {
      if (e.type === "played") trick.push(e.card);
      if (e.type === "trickWon") {
        if (e.seat === me) {
          tricks++;
          if (trick.includes(QUEEN)) queen = true;
        }
        trick = [];
      }
    }
    return {
      points: scored.points[me] ?? 0,
      moon:
        scored.moonShooter === null
          ? null
          : scored.moonShooter === me
            ? "me"
            : "other",
      total: scored.scores[me] ?? 0,
      tricks,
      queen,
    };
  },
  game(view, events): HeartsGame {
    const me = view.seat;
    const over = events.find(
      (e): e is Extract<GameEvent, { type: "gameOver" }> =>
        e.type === "gameOver",
    );
    const score = view.scores[me] ?? 0;
    return {
      rounds: view.roundNumber,
      score,
      rank:
        view.players.filter((s) => (view.scores[s] ?? 0) < score).length + 1,
      won: over?.winners.includes(me) ?? false,
      retired: over?.retired === true,
    };
  },
};

/* ---------- 지표 ---------- */

export interface HeartsSummary {
  rounds: number;
  games: number;
  wins: number;
  /** 판 평균 점수 */
  average: number;
  /** 0점으로 끝낸 판 */
  clean: number;
  queen: number;
  moonMe: number;
  moonOther: number;
  /** 끝까지 둔 게임 중 가장 낮은 점수 */
  bestGame: number | null;
  /** 최근 판 점수(오래된 것부터) */
  recent: number[];
  /** 게임 순위 분포(1~4등) */
  ranks: number[];
  /** 먹은 턴 합(판을 처음부터 본 것만) */
  tricks: number;
  /** 받은 점수 합 */
  points: number;
}

export function summarizeHearts(
  rounds: readonly RoundRecord[],
  games: readonly GameRecord[],
): HeartsSummary {
  const all = rounds
    .filter((r) => r.game === "hearts")
    .map((r) => ({ ...(r.data as HeartsRound), partial: r.partial === true }));
  const ended = games
    .filter((g) => g.game === "hearts")
    .map((g) => g.data as HeartsGame)
    .filter((g) => !g.retired);
  const ranks = [0, 0, 0, 0];
  for (const g of ended) ranks[g.rank - 1] = (ranks[g.rank - 1] ?? 0) + 1;
  return {
    rounds: all.length,
    games: ended.length,
    wins: ended.filter((g) => g.won).length,
    average:
      all.length === 0
        ? 0
        : all.reduce((sum, r) => sum + r.points, 0) / all.length,
    clean: all.filter((r) => r.points === 0 && r.moon !== "other").length,
    queen: all.filter((r) => !r.partial && r.queen).length,
    moonMe: all.filter((r) => r.moon === "me").length,
    moonOther: all.filter((r) => r.moon === "other").length,
    bestGame:
      ended.length === 0 ? null : Math.min(...ended.map((g) => g.score)),
    recent: all.slice(-30).map((r) => r.points),
    ranks,
    tricks: all.filter((r) => !r.partial).reduce((n, r) => n + r.tricks, 0),
    points: all.reduce((n, r) => n + r.points, 0),
  };
}
