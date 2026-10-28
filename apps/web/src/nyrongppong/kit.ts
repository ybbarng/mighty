import { cardOf, sortCards } from "@mighty/hwatu";
import {
  discardFromThree,
  nyrongppongBotFor,
  nyrongppongExpertBot,
  stopChance,
} from "@mighty/nyrongppong-ai";
import {
  type Action,
  callClock,
  createMatch,
  decodeNyrongppongRules,
  encodeNyrongppongRules,
  type GameEvent,
  handValue,
  type NyrongppongRules,
  type NyrongppongState,
  type NyrongppongView,
  pendingSeats,
  ranksOf,
  replay,
  roundWinners,
  step,
  viewOf,
  type YakKind,
} from "@mighty/nyrongppong-engine";

import type { Commentary, GameKit, KitStats } from "@/game/kit";
import type { GameRecord, RoundRecord } from "@/stats/records";

export type NyrongppongKit = GameKit<
  NyrongppongRules,
  NyrongppongState,
  NyrongppongView,
  Action,
  GameEvent,
  undefined
>;

/** 판 기록(내 자리에서 본 것) */
export interface NyrongppongRound {
  players: number;
  /** 이번 판 내 점수(낮을수록 좋다) */
  score: number;
  /** 이번 판 점수가 가장 낮았다(같은 점수 포함) */
  won: boolean;
  /** 판이 어떻게 끝났나 */
  end: "yak" | "out" | "stop" | "deckOut";
  /** 내가 끝냈다(약·박·스톱 성공) */
  mine: boolean;
  /** 내가 바가지를 썼다(뽕 바가지·스톱 바가지) */
  bagaji: boolean;
  /** 이번 판에 내가 한 뽕 */
  ppongs: number;
  yak?: YakKind;
}

export interface NyrongppongGame {
  players: number;
  rounds: number;
  total: number;
  rank: number;
  won: boolean;
  retired: boolean;
}

export const nyrongppongStats: KitStats<NyrongppongView, GameEvent> = {
  roundStarted: (events) => events.some((e) => e.type === "roundStarted"),
  roundEnded: (events) => events.some((e) => e.type === "roundEnded"),
  gameEnded: (events) => events.some((e) => e.type === "gameEnded"),
  roundNumber: (view) => view.roundNumber,
  round(_start, end, events): NyrongppongRound | null {
    const ended = events.find(
      (e): e is Extract<GameEvent, { type: "roundEnded" }> =>
        e.type === "roundEnded",
    );
    if (!ended) return null;
    const me = end.mySeat;
    const { result } = ended;
    const kind = result.end.kind;
    const mine =
      (kind === "yak" || kind === "out") && result.end.seat === me
        ? true
        : kind === "stop" && result.end.seat === me && result.end.success;
    const bagaji =
      (kind === "out" && result.end.from === me) ||
      (kind === "stop" && result.end.seat === me && !result.end.success);
    return {
      players: end.rules.players,
      score: result.scores[me] ?? 0,
      won: roundWinners(result.scores).includes(me),
      end: kind,
      mine,
      bagaji,
      ppongs: events.filter((e) => e.type === "ppong" && e.seat === me).length,
      ...(kind === "yak" && result.end.seat === me
        ? { yak: result.end.yak.kind }
        : {}),
    };
  },
  game(view): NyrongppongGame {
    const me = view.mySeat;
    const rank = ranksOf(view.totals)[me] ?? view.rules.players;
    return {
      players: view.rules.players,
      rounds: view.roundNumber,
      total: view.totals[me] ?? 0,
      rank,
      won: !view.retired && rank === 1,
      retired: view.retired === true,
    };
  },
};

const cardName = (id: string) => cardOf(id).name;

/** 행동 한 줄 설명 */
export function describeAction(action: Action): string {
  switch (action.type) {
    case "discard":
      return `${cardName(action.card)} 버림`;
    case "draw":
      return "한 장 가져옴";
    case "stop":
      return "스톱";
    case "declare":
      return "약 냄";
    case "call":
      return "뽕!";
    case "pass":
      return "넘김";
    case "timeout":
      return "응답 시간 끝";
    case "continue":
      return "다음 판";
    case "retire":
      return "게임 끝냄";
  }
}

/**
 * 다시 보기 해설: 그 자리 화면에서 고수라면 무엇을 했을지 견준다.
 * 버리기는 고수와 같으면 좋은 수, 다르면 괜찮은 수로 보고 고수의 선택을 알린다
 */
export function explainNyrongppong(
  state: NyrongppongState,
  next: { seat: number; action: unknown },
  _after: NyrongppongState | null,
  seed: number,
  name: (seat: number) => string,
): Commentary {
  const action = next.action as Action;
  const view = viewOf(state, next.seat);
  const situation = [
    `${state.roundNumber}판, ${name(next.seat)} 손패 ${view.hand.length}장(합 ${handValue(view.hand)}), 더미 ${view.deckCount}장`,
  ];
  if (!view.decision) return { situation, verdict: null, reasons: [] };
  if (action.type === "stop" || action.type === "draw") {
    if (view.decision.kind !== "draw" || !view.decision.canStop)
      return { situation, verdict: null, reasons: [] };
    const p = stopChance(view, { seed: seed + 1 }, 120);
    const stop = action.type === "stop";
    const wise = p > 0.9 ? stop : !stop;
    return {
      situation,
      verdict: wise ? "good" : p > 0.6 ? "fine" : "slip",
      reasons: [
        `짐작해 보면 스톱해서 가장 낮을 확률 ${Math.round(p * 100)}%`,
        stop ? "스톱했다" : "스톱하지 않고 가져왔다",
      ],
    };
  }
  if (action.type === "call" || action.type === "pass")
    return {
      situation,
      verdict: action.type === "call" ? "good" : "fine",
      reasons: [
        action.type === "call"
          ? "뽕으로 손패 두 장을 내려놓았다"
          : "뽕할 수 있었지만 넘겼다(두 장을 줄일 기회)",
      ],
    };
  if (action.type === "declare")
    return { situation, verdict: "good", reasons: ["약으로 판을 끝냈다"] };
  if (action.type !== "discard")
    return { situation, verdict: null, reasons: [] };
  const suggested = nyrongppongExpertBot.decide(view, { seed: seed + 1 });
  if (suggested.type === "declare")
    return {
      situation,
      verdict: "bad",
      reasons: ["약이 있었는데 내지 않았다"],
    };
  const pick =
    view.hand.length === 3
      ? discardFromThree(view.hand)
      : suggested.type === "discard"
        ? suggested.card
        : null;
  if (!pick || cardOf(pick).month === cardOf(action.card).month)
    return {
      situation,
      verdict: "good",
      reasons: [`${cardName(action.card)}: 고수도 같은 달을 버린다`],
    };
  return {
    situation,
    verdict: "fine",
    reasons: [
      `${cardName(action.card)}를 버렸다`,
      `고수라면 ${cardName(pick)}`,
    ],
  };
}

/** 나이롱뽕 엔진을 대국 진행·온라인 방에 잇는다 */
export const nyrongppongKit: NyrongppongKit = {
  id: "nyrongppong",
  createMatch: (rules, seed) => createMatch(rules, seed),
  step,
  viewOf,
  replay: (rules, seed, log) => replay(rules, seed, log),
  pendingSeats,
  playerCount: (rules) => rules.players,
  encodeRules: encodeNyrongppongRules,
  decodeRules: decodeNyrongppongRules,
  startEvents: (view) => [
    {
      type: "roundStarted",
      roundNumber: view.roundNumber,
      dealer: view.dealer,
    },
  ],
  isOver: (view) => view.phase === "gameOver",
  // 응답 시간 끝은 방장 기기의 시계만 기록한다.
  guestMayAct: (action) =>
    action.type !== "retire" && action.type !== "timeout",
  retireAction: { type: "retire" },
  stats: nyrongppongStats,
  botCanAct: (view) => view.decision !== null,
  // 시드로 섞어 판마다 패가 정해진다(멘탈 포커가 아니다).
  review: {
    firstExtra: () => undefined,
    prepare: (state) => state,
    cleanup: (state) => state,
    realAction: (action) => action,
    situation: (state) => ({
      voids: state.totals.map(() => []),
      tally: state.totals.map((total, seat) => ({
        seat,
        label: "",
        value: `${total}점`,
      })),
    }),
    describe: (action) => describeAction(action as Action),
    sortHand: (_state, cards) => sortCards(cards),
    explain: explainNyrongppong,
  },
  botFor: (level) => nyrongppongBotFor(level),
  /**
   * 뽕 응답 창(docs/30 2절). 대국을 돌리는 기기(혼자 하기·방장)의 LocalMatch가 이 시계로 창을 재고,
   * 시간이 다 되면 `timeout`을 기록한다. 개인 시간과 같은 틀(docs/24)을 빌려 쓴다.
   * 응답(뽕·넘기기)에는 쓴 시간을 실어 창의 남은 시간이 이어지게 한다. 싣지 않으면 넘긴 뒤 창이 처음부터 다시 걸려,
   * 버릴 때마다 여는 창(`everyDiscard`)이 누가 넘겼을 때만 길어져 "같은 달 두 장"이 드러난다.
   * 참가자 검증은 `strip`으로 시간을 떼고 견준다(컴퓨터 응답도)
   */
  timing: {
    turn: callClock,
    stamp: (action, spent) =>
      action.type === "call" || action.type === "pass"
        ? { ...action, spent }
        : action,
    timeout: (spent) => ({ type: "timeout", spent }),
    strip: (action) => {
      if (action.type === "timeout") return null;
      if (action.type !== "call" && action.type !== "pass") return action;
      return { type: action.type };
    },
  },
};

/* ---------- 지표(내 기록) ---------- */

export interface NyrongppongSummary {
  rounds: number;
  /** 판 점수가 가장 낮았던 판 */
  wins: number;
  averageScore: number;
  /** 내가 끝낸 판: 약·박·스톱 성공 */
  byYak: number;
  byOut: number;
  byStop: number;
  /** 바가지 쓴 판 */
  bagaji: number;
  /** 판마다 평균 뽕 */
  averagePpongs: number;
  games: number;
  gameWins: number;
  /** 최근 판 결과(오래된 것부터, 이김 1·짐 −1) */
  recent: number[];
}

export function summarizeNyrongppong(
  rounds: readonly RoundRecord[],
  games: readonly GameRecord[],
): NyrongppongSummary {
  const all = rounds
    .filter((r) => r.game === "nyrongppong")
    .map((r) => r.data as NyrongppongRound);
  const gameRows = games
    .filter((g) => g.game === "nyrongppong")
    .map((g) => g.data as NyrongppongGame);
  const mine = (end: NyrongppongRound["end"]) =>
    all.filter((r) => r.mine && r.end === end).length;
  const avg = (f: (r: NyrongppongRound) => number) =>
    all.length === 0 ? 0 : all.reduce((n, r) => n + f(r), 0) / all.length;
  return {
    rounds: all.length,
    wins: all.filter((r) => r.won).length,
    averageScore: avg((r) => r.score),
    byYak: mine("yak"),
    byOut: mine("out"),
    byStop: mine("stop"),
    bagaji: all.filter((r) => r.bagaji).length,
    averagePpongs: avg((r) => r.ppongs),
    games: gameRows.filter((g) => !g.retired).length,
    gameWins: gameRows.filter((g) => g.won).length,
    recent: all.slice(-30).map((r) => (r.won ? 1 : -1)),
  };
}
