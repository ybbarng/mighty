import {
  type Card,
  type GameEvent,
  isJoker,
  type Kiruda,
  mightyOf,
  type PlayerView,
  type ScoreMultiplier,
} from "@mighty/engine";

import type { GameRecord, RoundRecord } from "@/stats/records";

import type { KitStats } from "./kit";

/** 마이티 판 기록(내 자리에서 본 것) */
export interface MightyRound {
  /** 몇 마 */
  players: number;
  /** `out`: 6·7마에서 죽어 이 판에서 빠졌다(승패에 넣지 않는다) */
  role: "declarer" | "friend" | "opposition" | "out";
  won: boolean;
  /** 주공의 최종 공약 */
  goal: { kiruda: Kiruda; score: number };
  /** 노프렌드·첫 턴 프렌드·카드 프렌드·사람 지정 */
  friend: "none" | "firstTrick" | "card" | "player" | null;
  multipliers: ScoreMultiplier[];
  /** 여당이 딴 점수 카드 */
  rulingPoints: number;
  /** 이 판에 번 돈(판을 처음부터 보지 못했으면 없다) */
  money?: number;
  /** 판이 끝난 뒤 내 돈 */
  moneyAfter: number;
  /** 아래는 판 사건에서 센다(판 처음을 보지 못했으면 0) */
  /** 내가 부른 가장 높은 공약 */
  bid: number | null;
  tricks: number;
  /** 내가 먹은 턴의 점수 카드 */
  points: number;
  mighty: boolean;
  joker: boolean;
  jokerCall: boolean;
  /** 6·7마: 죽었다 / 내가 죽였다 */
  killed: boolean;
  killer: boolean;
}

export interface MightyGame {
  players: number;
  rounds: number;
  money: number;
  /** 돈 순위(1부터) */
  rank: number;
  /** 중간에 그만두었다 */
  retired: boolean;
}

/** 마이티 내 기록 */
export const mightyStats: KitStats<PlayerView, GameEvent> = {
  roundStarted: (events) => events.some((e) => e.type === "roundStarted"),
  roundEnded: (events) => events.some((e) => e.type === "roundScored"),
  gameEnded: (events) => events.some((e) => e.type === "gameOver"),
  roundNumber: (view) => view.roundNumber,
  round(start, end, events): MightyRound | null {
    const me = end.seat;
    const result = end.result;
    if (!result || !end.goal || end.declarer === null) return null;
    const role: MightyRound["role"] = end.dead.includes(me)
      ? "out"
      : end.declarer === me
        ? "declarer"
        : end.friend === me
          ? "friend"
          : "opposition";
    const mighty = mightyOf(end.rules, end.goal.kiruda);
    const mine = <T extends GameEvent["type"]>(type: T) =>
      events.filter(
        (e): e is Extract<GameEvent, { type: T }> =>
          e.type === type && "seat" in e && e.seat === me,
      );
    const played = mine("played");
    const won = mine("trickWon");
    const bids = mine("bid").map((e) => e.goal.score);
    const kills = events.filter(
      (e): e is Extract<GameEvent, { type: "killAttempt" }> =>
        e.type === "killAttempt",
    );
    const after = result.money[me] ?? 0;
    const before = start?.money[me];
    return {
      players: end.rules.playerCount,
      role,
      won:
        role === "out"
          ? false
          : role === "opposition"
            ? !result.rulingWon
            : result.rulingWon,
      goal: { ...end.goal },
      friend: end.friendDeclaration?.kind ?? null,
      multipliers: [...result.multipliers],
      rulingPoints: result.rulingPoints,
      ...(before !== undefined ? { money: after - before } : {}),
      moneyAfter: after,
      bid: bids.length > 0 ? Math.max(...bids) : null,
      tricks: won.length,
      points: won.reduce((sum, e) => sum + e.points, 0),
      mighty: played.some((e) => e.card === mighty),
      joker: played.some((e) => isJoker(e.card as Card)),
      jokerCall: played.some((e) => e.jokerCall),
      killed: kills.some((e) => e.killed === me),
      killer: kills.some((e) => e.seat === me && e.killed !== null),
    };
  },
  game(view, events): MightyGame {
    const me = view.seat;
    const money = view.money[me] ?? 0;
    return {
      players: view.rules.playerCount,
      rounds: view.roundNumber,
      money,
      rank: view.order.filter((s) => (view.money[s] ?? 0) > money).length + 1,
      retired: events.some(
        (e) => e.type === "gameOver" && e.reason === "retired",
      ),
    };
  },
};

/* ---------- 지표 ---------- */

export interface Rate {
  n: number;
  won: number;
}

const rate = (list: readonly { won: boolean }[]): Rate => ({
  n: list.length,
  won: list.filter((r) => r.won).length,
});

export interface MightySummary {
  rounds: number;
  games: number;
  overall: Rate;
  byRole: Record<Exclude<MightyRound["role"], "out">, Rate>;
  /** 주공일 때 공약 점수별 성공 */
  byGoal: { score: number; rate: Rate }[];
  /** 주공일 때 기루다 */
  byKiruda: { kiruda: Kiruda; rate: Rate }[];
  /** 몇 마별 */
  byPlayers: { players: number; rate: Rate }[];
  /** 끝까지 둔 게임의 1등 */
  firsts: Rate;
  /** 번 돈 합(처음부터 본 판만) */
  money: number;
  bestRound: number;
  worstRound: number;
  /** 가장 긴 판 연승 */
  bestStreak: number;
  /** 지금 이어지는 연승(음수면 연패) */
  streak: number;
  /** 최근 판 결과(오래된 것부터) */
  recent: { won: boolean; role: Exclude<MightyRound["role"], "out"> }[];
  /** 판마다 번 돈을 쌓은 흐름(최근 100판) */
  moneyLine: number[];
  /** 명장면 횟수 */
  moments: {
    run: number;
    reverseRun: number;
    noFriendWin: number;
    noKirudaWin: number;
    mighty: number;
    jokerCall: number;
    killed: number;
    killer: number;
  };
}

const KIRUDA_ORDER: Kiruda[] = ["S", "D", "H", "C", "NT"];

export function summarizeMighty(
  rounds: readonly RoundRecord[],
  games: readonly GameRecord[],
): MightySummary {
  const every = rounds
    .filter((r) => r.game === "mighty")
    .map((r) => ({ ...(r.data as MightyRound), partial: r.partial === true }));
  // 죽어서 빠진 판은 승패에 넣지 않는다.
  const all = every.filter((r) => r.role !== "out");
  const full = every.filter((r) => !r.partial);
  const declared = all.filter((r) => r.role === "declarer");
  const ended = games
    .filter((g) => g.game === "mighty")
    .map((g) => g.data as MightyGame)
    .filter((g) => !g.retired);
  const moneyRounds = every.filter((r) => r.money !== undefined);
  let bestStreak = 0;
  let run = 0;
  for (const r of all) {
    run = r.won ? run + 1 : 0;
    bestStreak = Math.max(bestStreak, run);
  }
  let streak = 0;
  for (const r of [...all].reverse()) {
    if (streak === 0) streak = r.won ? 1 : -1;
    else if (r.won === streak > 0) streak += streak > 0 ? 1 : -1;
    else break;
  }
  const line: number[] = [];
  let total = 0;
  for (const r of moneyRounds.slice(-100)) {
    total += r.money ?? 0;
    line.push(total);
  }
  const winsWith = (m: ScoreMultiplier) =>
    all.filter((r) => r.won && r.multipliers.includes(m)).length;
  const goals = [...new Set(declared.map((r) => r.goal.score))].sort(
    (a, b) => a - b,
  );
  const players = [...new Set(all.map((r) => r.players))].sort((a, b) => a - b);
  return {
    rounds: every.length,
    games: ended.length,
    overall: rate(all),
    byRole: {
      declarer: rate(declared),
      friend: rate(all.filter((r) => r.role === "friend")),
      opposition: rate(all.filter((r) => r.role === "opposition")),
    },
    byGoal: goals.map((score) => ({
      score,
      rate: rate(declared.filter((r) => r.goal.score === score)),
    })),
    byKiruda: KIRUDA_ORDER.map((kiruda) => ({
      kiruda,
      rate: rate(declared.filter((r) => r.goal.kiruda === kiruda)),
    })).filter((k) => k.rate.n > 0),
    byPlayers: players.map((n) => ({
      players: n,
      rate: rate(all.filter((r) => r.players === n)),
    })),
    firsts: { n: ended.length, won: ended.filter((g) => g.rank === 1).length },
    money: moneyRounds.reduce((sum, r) => sum + (r.money ?? 0), 0),
    bestRound: Math.max(0, ...moneyRounds.map((r) => r.money ?? 0)),
    worstRound: Math.min(0, ...moneyRounds.map((r) => r.money ?? 0)),
    bestStreak,
    streak,
    recent: all.slice(-30).map((r) => ({
      won: r.won,
      role: r.role as Exclude<MightyRound["role"], "out">,
    })),
    moneyLine: line,
    moments: {
      // 런·백런은 내가 이긴 쪽일 때만 센다(내가 당한 것은 빼고).
      run: winsWith("run"),
      reverseRun: winsWith("reverseRun"),
      noFriendWin: all.filter(
        (r) => r.won && r.role === "declarer" && r.friend === "none",
      ).length,
      noKirudaWin: all.filter(
        (r) => r.won && r.role === "declarer" && r.goal.kiruda === "NT",
      ).length,
      mighty: full.filter((r) => r.mighty).length,
      jokerCall: full.filter((r) => r.jokerCall).length,
      killed: full.filter((r) => r.killed).length,
      killer: full.filter((r) => r.killer).length,
    },
  };
}
