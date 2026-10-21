import {
  type Action,
  type Card,
  createRng,
  type MatchState,
  type PlayerView,
  type RuleSet,
  viewOf,
} from "@mighty/engine";
import {
  checkReplay,
  type FairLogged,
  type RoundDeal,
  realAction,
} from "@mighty/fair-play";

import type { KitBot } from "@/game/kit";
import { mightyKit } from "@/game/mighty-kit";

export type FairVerdict =
  | { ok: true }
  | { ok: false; seat: number | null; reason: string };

/** 게임마다 다른 것: 진짜 카드로 다시 돌리기, 화면 만들기, 기록 속 행동 바꾸기, 컴퓨터 행동 다듬기 */
export interface FairReplayGame {
  check(
    rules: unknown,
    seed: number,
    log: readonly FairLogged[],
    deals: ReadonlyMap<number, unknown>,
  ):
    | { ok: true; states: { roundNumber: number }[]; upTo: number }
    | { ok: false; index: number; seat: number; reason: string };
  viewOf(state: unknown, seat: number): unknown;
  realAction(action: unknown, cards: ReadonlyMap<number, unknown>): unknown;
  annotate?(view: unknown, action: unknown): unknown;
}

/** 마이티 */
export const MIGHTY_REPLAY: FairReplayGame = {
  check: (rules, seed, log, deals) =>
    checkReplay(
      rules as RuleSet,
      seed,
      log,
      deals as ReadonlyMap<number, RoundDeal>,
    ),
  viewOf: (state, seat) => viewOf(state as MatchState, seat),
  realAction: (action, cards) =>
    realAction(action as Action, cards as ReadonlyMap<number, Card>),
  annotate: (view, action) =>
    mightyKit.annotateBotAction
      ? mightyKit.annotateBotAction(view as PlayerView, action as Action)
      : action,
};

export interface FairVerifyInput {
  /** 어떤 게임인가(없으면 마이티) */
  game?: FairReplayGame;
  rules: RuleSet;
  seed: number;
  seat: number;
  log: readonly FairLogged[];
  deals: ReadonlyMap<number, { cards: ReadonlyMap<number, unknown> }>;
  /** 컴퓨터 자리와 그 컴퓨터(방장이 컴퓨터를 조종하지 않았는지 다시 계산한다) */
  botSeats: ReadonlySet<number>;
  bot: KitBot<unknown, unknown> | null;
  /** 내가 보낸 행동(JSON) */
  sent: readonly string[];
  /** 게임 중 받은 화면(내 카드로 바꾼 것, JSON) */
  seen: readonly string[];
  /** 게임 중 검증: 기록 뒤에 보낸 내 행동이 더 있을 수 있다 */
  inFlight?: boolean;
}

function idle(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

/**
 * 멘탈 포커 판 검증: 모든 카드가 열린 뒤 행동 기록을 진짜 카드로 다시 돌려
 * ① 모든 행동이 규칙에 맞는지(누가 어겼는지) ② 컴퓨터 수가 같은 컴퓨터·같은 난수로 나오는지
 * ③ 기록 속 내 행동이 내가 보낸 것인지 ④ 게임 중 받은 화면이 다시 계산한 화면과 같은지 본다.
 */
export async function verifyFairLog(
  input: FairVerifyInput,
): Promise<FairVerdict> {
  const { rules, seed, seat, log, deals } = input;
  const game = input.game ?? MIGHTY_REPLAY;
  const checked = game.check(rules, seed, log, deals);
  if (!checked.ok)
    return {
      ok: false,
      seat: checked.seat,
      reason: `기록 ${checked.index + 1}번째: ${checked.reason}`,
    };
  const { states } = checked;
  const partial = checked.upTo < log.length;
  const done = log.slice(0, checked.upTo);

  if (input.bot) {
    const botRng = createRng(seed ^ 0x2545f491);
    for (const [index, entry] of done.entries()) {
      if (input.botSeats.has(entry.seat) && !entry.bot)
        return {
          ok: false,
          seat: 0,
          reason: `기록 ${index + 1}번째: 컴퓨터 자리를 사람이 뒀다`,
        };
      if (!entry.bot) continue;
      const state = states[index];
      if (!state) break;
      const cards = deals.get(state.roundNumber)?.cards ?? new Map();
      const view = game.viewOf(state, entry.seat);
      const decided = input.bot.decide(view, botRng);
      const expected = game.annotate ? game.annotate(view, decided) : decided;
      if (
        JSON.stringify(game.realAction(expected, cards)) !==
        JSON.stringify(game.realAction(entry.action, cards))
      )
        return {
          ok: false,
          seat: 0,
          reason: `기록 ${index + 1}번째: 컴퓨터가 둘 수와 다르다(방장이 컴퓨터를 조종했다)`,
        };
      if (index % 8 === 0) await idle();
    }
  }

  const mine = done
    .filter((e) => e.seat === seat)
    .map((e) => JSON.stringify(e.action));
  const sent = input.sent;
  const prefix = sent.slice(0, mine.length);
  if (
    JSON.stringify(prefix) !== JSON.stringify(mine) ||
    (!partial && !input.inFlight && sent.length !== mine.length)
  )
    return {
      ok: false,
      seat: 0,
      reason: "기록 속 내 행동이 내가 보낸 것과 다르다",
    };

  // 받은 화면이 다시 계산한 화면 중에 차례대로 있어야 한다. 마지막 다시 계산한 화면 뒤로 받은 것은
  // 검증 시점 뒤의 진행이므로 건너뛴다.
  const replayed = states.map((s) => JSON.stringify(game.viewOf(s, seat)));
  let cursor = 0;
  for (const [i, view] of input.seen.entries()) {
    if (cursor === replayed.length - 1 && replayed[cursor] !== view) break;
    while (cursor < replayed.length && replayed[cursor] !== view) cursor++;
    if (cursor === replayed.length) {
      if (partial) break;
      return {
        ok: false,
        seat: 0,
        reason: `게임 중 받은 ${i + 1}번째 화면이 진짜 카드로 다시 계산한 것과 다르다`,
      };
    }
  }
  return { ok: true };
}
