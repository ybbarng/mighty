import { createRng } from "@mighty/engine";
import {
  gostopBotFor,
  gostopExpertBot,
  greedyValue,
  tableOf,
} from "@mighty/gostop-ai";
import {
  type Action,
  type Bak,
  createMatch,
  decodeGostopRules,
  describeAction,
  encodeGostopRules,
  type GameEvent,
  type GostopRules,
  type GostopState,
  type GostopView,
  pendingSeats,
  replay,
  step,
  viewOf,
} from "@mighty/gostop-engine";
import type { PresetDeal } from "@mighty/hwatu";
import { sortCards } from "@mighty/hwatu";

import type { Commentary, GameKit, KitStats, Verdict } from "@/game/kit";
import { hwatuReviewDeals } from "@/hwatu/fair";
import type { RoundRecord } from "@/stats/records";

import { gostopFair } from "./fair";

export type GostopKit = GameKit<
  GostopRules,
  GostopState,
  GostopView,
  Action,
  GameEvent,
  PresetDeal
>;

/** 고스톱 판 기록(내 자리에서 본 것) */
export interface GostopRound {
  players: 2 | 3;
  outcome: "win" | "loss" | "nagari";
  /** 이번 판 내 점수 변화 */
  points: number;
  kind: "stop" | "chongtong" | "nagari";
  /** 내가 부른 고 횟수 */
  goCount: number;
  /** 내가 진 판에서 걸린 박 */
  baks: Bak[];
}

export interface GostopGame {
  rounds: number;
  /** 게임 점수 합 */
  money: number;
  won: boolean;
  retired: boolean;
}

export const gostopStats: KitStats<GostopView, GameEvent> = {
  roundStarted: (events) => events.some((e) => e.type === "roundStarted"),
  roundEnded: (events) => events.some((e) => e.type === "roundEnded"),
  gameEnded: (events) => events.some((e) => e.type === "gameEnded"),
  roundNumber: (view) => view.roundNumber,
  round(_start, end, events): GostopRound | null {
    const ended = events.find(
      (e): e is Extract<GameEvent, { type: "roundEnded" }> =>
        e.type === "roundEnded",
    );
    if (!ended) return null;
    const me = end.mySeat;
    const s = ended.settlement;
    return {
      players: end.rules.players,
      outcome: s.winner === null ? "nagari" : s.winner === me ? "win" : "loss",
      points: s.deltas[me] ?? 0,
      kind: s.kind,
      goCount: events.filter((e) => e.type === "go" && e.seat === me).length,
      baks: [...(s.baks[me] ?? [])],
    };
  },
  game(view): GostopGame {
    const me = view.mySeat;
    const mine = view.scores[me] ?? 0;
    return {
      rounds: view.history.length,
      money: mine,
      won: !view.retired && view.scores.every((v, i) => i === me || v < mine),
      retired: view.retired === true,
    };
  },
};

function sameAction(a: Action, b: Action): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/** 다시 보기 해설: 둔 수를 고수가 고르는 수와 견준다 */
export function explainGostop(
  state: GostopState,
  next: { seat: number; action: unknown },
  _after: GostopState | null,
  seed: number,
  name: (seat: number) => string,
): Commentary {
  const action = next.action as Action;
  const view = viewOf(state, next.seat);
  const situation = [
    `${state.roundNumber}판, ${name(next.seat)} 차례`,
    `바닥 ${state.floor.length}장 · 더미 ${state.deck.length}장 · 지금 ${view.liveScores[next.seat] ?? 0}점`,
  ];
  const kind = view.decision?.kind;
  if (kind !== "play" && kind !== "goStop" && kind !== "choose")
    return { situation, verdict: null, reasons: [] };
  const suggested = gostopExpertBot.decide(view, createRng(seed + 1));
  const mine = describeAction(action);
  if (sameAction(suggested, action))
    return {
      situation,
      verdict: "good",
      reasons: [`${mine}: 고수도 같은 수를 둔다`],
    };
  let verdict: Verdict = "slip";
  if (kind === "play") {
    const t = tableOf(view, true);
    const loss = greedyValue(view, t, suggested) - greedyValue(view, t, action);
    verdict = loss <= 0.3 ? "fine" : loss <= 1.2 ? "slip" : "bad";
  } else if (kind === "choose") verdict = "fine";
  return {
    situation,
    verdict,
    reasons: [`${mine}를 골랐다`, `고수라면 ${describeAction(suggested)}`],
  };
}

/** 고스톱 엔진을 대국 진행·온라인 방에 잇는다 */
export const gostopKit: GostopKit = {
  id: "gostop",
  // 멘탈 포커 판은 판마다 미리 정한 패(`preset`)로 나눈다.
  createMatch: (rules, seed, preset) => createMatch(rules, seed, preset),
  step,
  viewOf,
  replay: (rules, seed, log, preset) => replay(rules, seed, log, preset),
  cardTable: gostopFair,
  pendingSeats,
  playerCount: (rules) => rules.players,
  encodeRules: encodeGostopRules,
  decodeRules: decodeGostopRules,
  startEvents: (view) => [
    {
      type: "roundStarted",
      roundNumber: view.roundNumber,
      dealer: view.dealer,
      nagari: view.nagari,
      redeals: view.redeals,
    },
  ],
  isOver: (view) => view.phase === "gameOver",
  guestMayAct: (action) => action.type !== "retire",
  retireAction: { type: "retire" },
  stats: gostopStats,
  // 멘탈 포커 판은 판마다 진짜 패를 넣어 가며 돌린다(일반방은 시드로 섞어 넣을 패가 없다).
  review: {
    ...hwatuReviewDeals<GostopState>(),
    situation: (state) => ({
      voids: state.scores.map(() => []),
      tally: state.scores.map((score, seat) => ({
        seat,
        label: "점수",
        value: `${score}점`,
      })),
    }),
    describe: (action) => describeAction(action as Action),
    sortHand: (_state, cards) => sortCards(cards),
    explain: explainGostop,
  },
  botFor: (level) => gostopBotFor(level),
};

/* ---------- 지표(내 기록) ---------- */

export interface GostopSummary {
  rounds: number;
  wins: number;
  losses: number;
  nagari: number;
  /** 판마다 평균 점수 변화 */
  average: number;
  /** 가장 크게 이긴 판 */
  best: number;
  /** 고를 부른 판과 그 가운데 이긴 판 */
  went: { n: number; won: number };
  /** 진 판에서 걸린 박 */
  baks: Record<Bak, number>;
  /** 최근 판 결과(오래된 것부터, 이김 1·짐 −1·나가리 0) */
  recent: number[];
}

export function summarizeGostop(rounds: readonly RoundRecord[]): GostopSummary {
  const all = rounds
    .filter((r) => r.game === "gostop")
    .map((r) => r.data as GostopRound);
  const went = all.filter((r) => r.goCount > 0);
  const baks: Record<Bak, number> = { pi: 0, gwang: 0, meong: 0, go: 0 };
  for (const r of all) for (const b of r.baks) baks[b]++;
  return {
    rounds: all.length,
    wins: all.filter((r) => r.outcome === "win").length,
    losses: all.filter((r) => r.outcome === "loss").length,
    nagari: all.filter((r) => r.outcome === "nagari").length,
    average:
      all.length === 0 ? 0 : all.reduce((n, r) => n + r.points, 0) / all.length,
    best: all.reduce((n, r) => Math.max(n, r.points), 0),
    went: {
      n: went.length,
      won: went.filter((r) => r.outcome === "win").length,
    },
    baks,
    recent: all
      .slice(-30)
      .map((r) => (r.outcome === "win" ? 1 : r.outcome === "loss" ? -1 : 0)),
  };
}
