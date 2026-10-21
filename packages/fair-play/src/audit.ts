import {
  type Action,
  type Card,
  createMatch,
  type GameEvent,
  type MatchState,
  type PresetDeal,
  type RuleSet,
  step,
} from "@mighty/engine";

import { slotOfToken } from "./blind";

/*
 * 진짜 카드로 다시 계산하기. 마지막 턴에 모두 열쇠를 공개하면 그 판의 실제 패를 안다.
 * 행동 기록을 실제 패로 처음부터 다시 돌려, 자리 표로 진행한 것과 맞는지 보고 어긋나면 누구 탓인지 짚는다.
 * - 다시 돌리다 규칙에 맞지 않는 행동이 나오면: 그 행동을 한 자리(무늬 안 따르기 등)
 * - 죽이기에서 진짜로는 죽었어야 할 사람이 있으면: 그 카드를 갖고도 없다고 한 자리
 * - 진짜로는 프렌드가 드러났어야 하면: 점수를 따고도 프렌드라고 밝히지 않은 자리
 * - 그 밖에 다르면: 진행을 맡은 방장
 */

/** 한 판(나눠 주기 한 번)의 실제 패 */
export interface RoundDeal {
  /** 처음 나눈 패(실제 카드) */
  deal: PresetDeal;
  /** 6·7마 죽이기 뒤 다시 나눈 순서(실제 카드) */
  redeal?: Card[];
  /** 자리 → 카드. 기록 속 자리 표(버린 카드)를 진짜 카드로 바꾼다 */
  cards: ReadonlyMap<number, Card>;
}

export interface FairLogged {
  seat: number;
  action: Action;
  bot?: true;
}

export type ReplayCheck =
  | {
      ok: true;
      state: MatchState;
      /** 걸음마다의 상태(첫 상태 포함). 화면 비교에 쓴다 */
      states: MatchState[];
      /** 다시 계산한 기록 수. 아직 패를 모르는 판에 들어서면 거기서 멈춘다 */
      upTo: number;
    }
  | { ok: false; index: number; seat: number; reason: string };

/** 기록 속 자리 표를 진짜 카드로 바꾸고, 엔진이 모르는 칸(카드 자리)을 뺀다 */
export function realAction(
  action: Action,
  cards: ReadonlyMap<number, Card>,
): Action {
  const swap = (c: Card) => {
    const slot = slotOfToken(c);
    return slot === null ? c : (cards.get(slot) ?? c);
  };
  switch (action.type) {
    case "exchange":
      return { ...action, discard: action.discard.map(swap) };
    case "play": {
      const { deckSlot: _, ...rest } = action as Action & { deckSlot?: number };
      return rest as Action;
    }
    default:
      return action;
  }
}

/** 사건 비교용: 같은 판단인지만 본다 */
function decisive(events: readonly GameEvent[]): string {
  return JSON.stringify(
    events
      .filter(
        (e) =>
          e.type === "killAttempt" ||
          e.type === "friendRevealed" ||
          e.type === "trickWon" ||
          e.type === "played" ||
          e.type === "elected",
      )
      .map((e) => (e.type === "played" ? { ...e, slot: null } : e)),
  );
}

/**
 * `deals`는 판 번호(1부터) → 실제 패. 아직 모르는 판(앞으로 나눌 판)은 비워 둔다.
 * `observed`가 있으면 자리 표로 진행할 때 나온 사건과 걸음마다 맞춰 본다.
 */
export function checkReplay(
  rules: RuleSet,
  seed: number,
  log: readonly FairLogged[],
  deals: ReadonlyMap<number, RoundDeal>,
  observed?: readonly (readonly GameEvent[])[],
): ReplayCheck {
  const first = deals.get(1);
  if (!first)
    return { ok: false, index: -1, seat: 0, reason: "첫 판 패가 없다" };
  let state = createMatch({ rules, seed, presetDeal: first.deal }).state;
  const states = [state];
  for (const [index, entry] of log.entries()) {
    const round = state.roundNumber;
    const current = deals.get(round);
    if (!current) return { ok: true, state, states, upTo: index };
    state.presetDeal = deals.get(round + 1)?.deal ?? null;
    if (state.round.phase === "kill" && current.redeal)
      state.presetRedeal = current.redeal;
    else delete state.presetRedeal;
    // 이 걸음이 새 판을 여는데 그 판 패를 아직 모르면 여기서 멈춘다(엔진이 시드로 섞어 버리지 않게).
    const action = realAction(entry.action, current.cards);
    const opensRound = (s: MatchState) => s.roundNumber !== round;
    const result = step(state, entry.seat, action);
    if (!result.ok)
      return {
        ok: false,
        index,
        seat: entry.seat,
        reason: `진짜 카드로 다시 계산하니 규칙에 맞지 않는 행동이었다(${result.error})`,
      };
    if (opensRound(result.state) && !deals.has(result.state.roundNumber))
      return { ok: true, state, states, upTo: index };
    const seen = observed?.[index];
    if (seen && decisive(seen) !== decisive(result.events)) {
      const blame = blameOf(result.events, seen, entry.seat);
      return { ok: false, index, ...blame };
    }
    // 판을 새로 시작하지 않았으면 다음 판 패는 넣지 않은 상태로 둔다(자리 표 진행과 같게).
    if (result.state.roundNumber === round) result.state.presetDeal = null;
    delete result.state.presetRedeal;
    state = result.state;
    states.push(state);
  }
  return { ok: true, state, states, upTo: log.length };
}

function blameOf(
  real: readonly GameEvent[],
  seen: readonly GameEvent[],
  actor: number,
): { seat: number; reason: string } {
  const realKill = real.find((e) => e.type === "killAttempt");
  const seenKill = seen.find((e) => e.type === "killAttempt");
  if (
    realKill?.type === "killAttempt" &&
    seenKill?.type === "killAttempt" &&
    realKill.killed !== seenKill.killed &&
    realKill.killed !== null
  )
    return {
      seat: realKill.killed,
      reason: `죽이기에 불린 ${realKill.card}를 갖고 있으면서 없다고 했다`,
    };
  const realFriend = real.find((e) => e.type === "friendRevealed");
  const seenFriend = seen.find((e) => e.type === "friendRevealed");
  if (
    realFriend?.type === "friendRevealed" &&
    realFriend.seat !== null &&
    seenFriend === undefined
  )
    return {
      seat: realFriend.seat,
      reason: "프렌드인데 점수를 따고도 밝히지 않았다",
    };
  return {
    seat: 0,
    reason: `방장이 진행한 결과가 진짜 카드로 다시 계산한 것과 다르다(${actor}번 차례)`,
  };
}
