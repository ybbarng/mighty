import {
  type Card,
  type GameEvent,
  isJoker,
  isJokerEffective,
  isMightyEffective,
  mightyOf,
  type PlayerView,
  suitOf,
  type Trick,
  type TrickContext,
} from "@mighty/engine";

import type { Cue, PlayOptions } from "./sound";
import { dealPlan } from "./timing";

export interface CueCall extends PlayOptions {
  cue: Cue;
}

/** 트릭이 끝나고 이긴 카드를 보여 주는 시간(초). 이때 카드를 모으며 득점 소리를 낸다 */
const TRICK_HOLD_S = 1.1;

/**
 * 한 스냅숏의 이벤트에서 낼 소리. 순수 함수라 테스트할 수 있다.
 * 언제 어떤 소리를 내는지는 원작 `PlayerHuman.cpp`를 따른다(docs/16 3절).
 */
export function cuesFor(
  view: PlayerView,
  events: readonly GameEvent[],
): CueCall[] {
  const calls: CueCall[] = [];
  const played = events.some((e) => e.type === "played");
  for (const event of events) {
    switch (event.type) {
      case "roundStarted":
        // 2마는 섞는 연출이 없으니 판 시작 소리만 낸다.
        if (view.rules.playerCount === 2) calls.push({ cue: "gameStart" });
        break;
      case "dealt":
        if (view.rules.playerCount === 2) break;
        // 원작처럼 섞고, 다 나눠 준 뒤 "솨악!"
        calls.push({ cue: "shuffle" });
        calls.push({
          cue: "gameStart",
          delay: dealPlan(event.handSize, view.players.length).duration / 1000,
        });
        break;
      case "bid":
        calls.push({ cue: "bid" });
        break;
      case "passed":
        calls.push({ cue: "pass" });
        break;
      case "dealMiss":
      case "allPassed":
        calls.push({ cue: "dealMiss" });
        break;
      case "elected":
      case "friendDeclared":
        calls.push({ cue: "announce" });
        break;
      case "killAttempt":
        calls.push({ cue: "kill" });
        // 헛다리면 원작처럼 잠시 뒤 "뽀록"
        if (event.killed === null) calls.push({ cue: "pass", delay: 0.75 });
        break;
      case "redealtForDead":
        calls.push({ cue: "shuffle", delay: 0.8 });
        break;
      case "kittyTaken":
        calls.push({ cue: "pickCard", times: event.count });
        break;
      case "exchanged":
        // 원작은 내가 주공일 때 손패를 정리하며 소리를 냈다.
        if (event.seat === view.seat) calls.push({ cue: "cardSet" });
        break;
      case "played":
        calls.push({
          cue: playedCue(view, event.seat, event.card, event.jokerCall),
        });
        break;
      case "friendRevealed":
        // 카드를 낸 소리와 겹치지 않게 조금 뒤에 낸다.
        if (event.seat !== null)
          calls.push({ cue: "friend", delay: played ? 0.6 : 0 });
        break;
      case "trickWon":
        if (isOppositionScore(view, event.seat, event.points))
          calls.push({
            cue: "scored",
            times: event.points,
            delay: TRICK_HOLD_S,
          });
        break;
      case "roundScored": {
        const ruling = view.seat === view.declarer || view.seat === view.friend;
        calls.push({ cue: ruling === event.result.rulingWon ? "win" : "lose" });
        break;
      }
      default:
        break;
    }
  }
  // 한 스냅숏에 같은 소리가 겹치면 하나만 낸다.
  const seen = new Set<Cue>();
  return calls.filter(({ cue }) => !seen.has(cue) && seen.add(cue));
}

/** 원작 `CPlayerHuman::PlayTurnSound`: 카드 낼 때 소리 고르기 */
function playedCue(
  view: PlayerView,
  seat: number,
  card: Card,
  jokerCall: boolean,
): Cue {
  const kiruda = view.goal?.kiruda ?? "NT";
  if (card === mightyOf(view.rules, kiruda)) return "mighty";
  if (jokerCall) return "jokerCall";

  const found = trickOf(view, seat, card);
  if (!found) return isJoker(card) ? "joker" : "card";
  const { trick, trickIndex } = found;
  const index = trick.plays.findIndex((p) => p.seat === seat);
  const before = trick.plays.slice(0, index).map((p) => p.card);
  const ctx: TrickContext = { rules: view.rules, kiruda, trickIndex };
  const cards = {
    cards: [...before, card],
    jokerSuit: trick.jokerSuit,
    jokerCalled: trick.jokerCalled,
  };
  const mightyDown =
    before.includes(mightyOf(view.rules, kiruda)) && isMightyEffective(ctx);

  if (isJoker(card)) {
    if (!isJokerEffective(ctx, cards)) return "deadJoker";
    // 이미 힘 있는 마이티가 깔려 있으면 조커도 평범한 카드 소리(원작 v4.0)
    return mightyDown ? "card" : "joker";
  }

  const lead = before[0];
  const jokerDown =
    before.some((c) => isJoker(c)) && isJokerEffective(ctx, cards);
  const ledKiruda =
    lead !== undefined &&
    (isJoker(lead) ? trick.jokerSuit === kiruda : suitOf(lead) === kiruda);
  if (
    suitOf(card) === kiruda &&
    lead !== undefined &&
    !ledKiruda &&
    !jokerDown &&
    !mightyDown
  )
    return "gan";
  return "card";
}

/** 방금 낸 카드가 들어 있는 트릭. 트릭이 끝났으면 끝난 트릭 목록의 마지막에 있다 */
function trickOf(
  view: PlayerView,
  seat: number,
  card: Card,
): { trick: Trick; trickIndex: number } | null {
  const has = (t: Trick) =>
    t.plays.some((p) => p.seat === seat && p.card === card);
  if (view.trick && has(view.trick))
    return { trick: view.trick, trickIndex: view.trickIndex };
  const last = view.tricks.at(-1);
  if (last && has(last))
    return { trick: last, trickIndex: view.tricks.length - 1 };
  return null;
}

/** 원작 득점 소리: 점수 카드가 야당(주공·공개된 프렌드가 아닌 쪽) 득점 칸으로 갈 때 */
function isOppositionScore(
  view: PlayerView,
  winner: number,
  points: number,
): boolean {
  if (view.rules.playerCount === 2 || points === 0) return false;
  const ruling =
    winner === view.declarer || (view.friendRevealed && winner === view.friend);
  return !ruling;
}
