import { botKnowsChain, expertValues, yutBotFor } from "@mighty/yut-ai";
import {
  type Action,
  createMatch,
  DONE,
  decodeYutRules,
  encodeYutRules,
  type GameEvent,
  type GameResult,
  HOME,
  legalMoves,
  pendingSeats,
  pointName,
  replay,
  sideCount,
  sideOf,
  step,
  throwName,
  viewOf,
  type YutRules,
  type YutState,
  type YutView,
} from "@mighty/yut-engine";

import type { Commentary, GameKit, KitStats, Verdict } from "@/game/kit";
import type { RoundRecord } from "@/stats/records";

export type YutKit = GameKit<
  YutRules,
  YutState,
  YutView,
  Action,
  GameEvent,
  undefined
>;

/** 점 이름: 모서리·방은 이름, 나머지는 바깥 n번째 · 지름길 */
export function pointLabel(point: number): string {
  if (point === HOME) return "새 말";
  if (point === DONE) return "남";
  const name = pointName(point);
  if (name) return name;
  if (point < 20) return `${point}번 칸`;
  return "지름길";
}

/** 판 끝 결과에서 이 편이 이겼나·졌나·이긴 편이 없나 */
export function outcomeFor(
  result: GameResult | null,
  side: number,
): "win" | "loss" | "draw" {
  if (!result || result.side === null) return "draw";
  return result.side === side ? "win" : "loss";
}

/** 윷놀이 판 기록(내 자리에서 본 것) */
export interface YutRound {
  players: number;
  mode: "solo" | "team";
  outcome: "win" | "loss" | "draw";
  by: GameResult["kind"] | "retired";
  /** 내가 던진 횟수와 그중 윷·모 */
  throws: number;
  yuts: number;
  mos: number;
  /** 내가 잡은 말·잡힌 말 */
  captures: number;
  captured: number;
  /** 내 편이 낸 말 수 */
  finished: number;
}

export interface YutGame {
  won: boolean;
  retired: boolean;
}

export const yutStats: KitStats<YutView, GameEvent> = {
  roundStarted: (events) => events.some((e) => e.type === "gameStarted"),
  roundEnded: (events) => events.some((e) => e.type === "gameEnded"),
  gameEnded: (events) => events.some((e) => e.type === "gameEnded"),
  roundNumber: (view) => view.roundNumber,
  round(_start, end, events): YutRound | null {
    const ended = events.find(
      (e): e is Extract<GameEvent, { type: "gameEnded" }> =>
        e.type === "gameEnded",
    );
    if (!ended) return null;
    const me = end.mySeat;
    const side = sideOf(end.rules, me);
    let throws = 0;
    let yuts = 0;
    let mos = 0;
    let captures = 0;
    let captured = 0;
    for (const e of events) {
      if (e.type === "result" && e.seat === me) {
        throws += 1;
        if (e.value === 4) yuts += 1;
        if (e.value === 5) mos += 1;
      }
      if (e.type === "moved") {
        if (e.seat === me) captures += e.captured;
        if (e.capturedSide === side) captured += e.captured;
      }
    }
    return {
      players: end.rules.players,
      mode: end.rules.mode,
      outcome: outcomeFor(ended.result, side),
      by: ended.result?.kind ?? "retired",
      throws,
      yuts,
      mos,
      captures,
      captured,
      finished: end.pieces.filter((p) => p.side === side && p.point === DONE)
        .length,
    };
  },
  game(view): YutGame {
    return {
      won:
        !view.retired &&
        outcomeFor(view.result, sideOf(view.rules, view.mySeat)) === "win",
      retired: view.retired === true,
    };
  },
};

function describe(action: unknown): string {
  const a = action as Action;
  switch (a.type) {
    case "commit":
      return "사슬 약속";
    case "throw":
      return "던지기";
    case "reveal":
      return "고리 공개";
    case "move":
      return `${throwName(a.value)} → ${pointLabel(a.from)}`;
    case "resign":
      return "기권";
    case "retire":
      return "끝내기";
  }
}

function verdictOf(gap: number): Verdict {
  if (gap <= 0.05) return "good";
  if (gap <= 0.4) return "fine";
  if (gap <= 1.2) return "slip";
  return "bad";
}

/** 다시 보기 해설: 말 움직이기면 고수가 본 기댓값과 견준다 */
export function explainYut(
  state: YutState,
  next: { seat: number; action: unknown },
  _after: YutState | null,
  _seed: number,
  name: (seat: number) => string,
): Commentary {
  const action = next.action as Action;
  const situation = [`${name(next.seat)}의 차례`];
  if (state.pending.length > 0)
    situation.push(
      `모아 둔 결과: ${state.pending.map((v) => throwName(v)).join(", ")}`,
    );
  if (action.type !== "move") return { situation, verdict: null, reasons: [] };
  const options = legalMoves(state);
  if (options.length <= 1)
    return {
      situation,
      verdict: "good",
      reasons: ["둘 수 있는 수가 이것뿐이다"],
    };
  const values = expertValues(viewOf(state, next.seat), options);
  const mineAt = options.findIndex(
    (o) => o.value === action.value && o.from === action.from,
  );
  let bestAt = 0;
  for (let i = 1; i < values.length; i++)
    if ((values[i] as number) > (values[bestAt] as number)) bestAt = i;
  const best = options[bestAt];
  const gap = (values[bestAt] as number) - (values[mineAt] as number);
  const describeOption = (o: (typeof options)[number]) =>
    `${throwName(o.value)}로 ${pointLabel(o.from)} → ${o.finished ? "남" : pointLabel(o.to)}${o.captures > 0 ? `(${o.captures}개 잡음)` : ""}${o.stacks > 0 ? "(업음)" : ""}`;
  const mine = options[mineAt];
  const reasons = mine ? [`둔 수: ${describeOption(mine)}`] : [];
  if (best && bestAt !== mineAt)
    reasons.push(
      `고수라면 ${describeOption(best)}(기댓값 차이 ${gap.toFixed(2)}번 던지기)`,
    );
  else reasons.push("고수도 같은 수를 둔다");
  return {
    situation,
    verdict: bestAt === mineAt ? "good" : verdictOf(gap),
    reasons,
  };
}

/** 윷놀이 엔진을 대국 진행·온라인 방에 잇는다 */
export const yutKit: YutKit = {
  id: "yut",
  createMatch: (rules, seed) => createMatch(rules, seed),
  step,
  viewOf,
  replay: (rules, seed, log) => replay(rules, seed, log),
  pendingSeats,
  playerCount: (rules) => rules.players,
  encodeRules: encodeYutRules,
  decodeRules: decodeYutRules,
  startEvents: (view) => [{ type: "gameStarted", turn: view.turn }],
  isOver: (view) => view.phase === "gameOver",
  // 끝내기는 방장 기기만 기록한다.
  guestMayAct: (action) => action.type !== "retire",
  // 내 차례가 아니어도 기권할 수 있다(받아들일지는 엔진이 정한다).
  offTurn: (view, action) =>
    action.type === "resign" && view.phase !== "gameOver",
  // 끊긴 사람 대신 둘 때, 사람이 만든 사슬 씨앗은 모르니 공개는 그 사람을 기다린다.
  botCanAct: botKnowsChain,
  retireAction: { type: "retire" },
  stats: yutStats,
  // 숨긴 패가 없다. 던지기 결과는 기록 속 고리 공개로 다시 계산된다.
  review: {
    firstExtra: () => undefined,
    prepare: (state) => state,
    cleanup: (state) => state,
    realAction: (action) => action,
    situation: (state) => ({
      voids: Array.from({ length: state.rules.players }, () => []),
      tally: Array.from({ length: sideCount(state.rules) }, (_, side) => {
        const done = state.pieces.filter(
          (p) => p.side === side && p.point === DONE,
        ).length;
        return {
          ...(state.rules.mode === "team" ? {} : { seat: side }),
          label: state.rules.mode === "team" ? `${side + 1}편` : "낸 말",
          value: `${done}/${state.rules.pieces}`,
        };
      }),
    }),
    describe,
    sortHand: (_state, cards) => [...cards],
    explain: explainYut,
  },
  botFor: (level) => yutBotFor(level),
};

/* ---------- 지표(내 기록) ---------- */

export interface YutSummary {
  rounds: number;
  wins: number;
  losses: number;
  draws: number;
  /** 한 판에 평균 잡은 말·잡힌 말 */
  averageCaptures: number;
  averageCaptured: number;
  /** 내가 던진 것 가운데 윷·모 비율 */
  throws: number;
  yuts: number;
  mos: number;
  recent: number[];
}

export function summarizeYut(rounds: readonly RoundRecord[]): YutSummary {
  const all = rounds
    .filter((r) => r.game === "yut")
    .map((r) => r.data as YutRound);
  const sum = (pick: (r: YutRound) => number) =>
    all.reduce((n, r) => n + pick(r), 0);
  return {
    rounds: all.length,
    wins: all.filter((r) => r.outcome === "win").length,
    losses: all.filter((r) => r.outcome === "loss").length,
    draws: all.filter((r) => r.outcome === "draw").length,
    averageCaptures: all.length === 0 ? 0 : sum((r) => r.captures) / all.length,
    averageCaptured: all.length === 0 ? 0 : sum((r) => r.captured) / all.length,
    throws: sum((r) => r.throws),
    yuts: sum((r) => r.yuts),
    mos: sum((r) => r.mos),
    recent: all
      .slice(-30)
      .map((r) => (r.outcome === "win" ? 1 : r.outcome === "loss" ? -1 : 0)),
  };
}
