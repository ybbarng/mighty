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
import { dealPlan, SHUFFLE_MS } from "./timing";

export interface CueCall extends PlayOptions {
  cue: Cue;
}

/** 트릭이 끝나고 이긴 카드를 보여 주는 시간(초). 이때 카드를 모으며 득점 소리를 낸다 */
const TRICK_HOLD_S = 1.1;

/** 섞고 나눠 주는 연출 시간(ms). `DealAnimation`과 같은 값을 쓴다 */
export interface DealTiming {
  startDelay: number;
  /** 섞는 연출 시간. 멘탈 포커로 이미 섞는 연출을 보였으면 남은 만큼 */
  shuffleMs: number;
}

/**
 * 섞고 나눠 주는 연출에 맞춘 소리. 덱이 갈라졌다 합쳐질 때 섞는 소리를 내고(0.4초 간격 두 번),
 * 나눠 줄 때는 묶음마다 "슥-톡", 다 나눠 주면 판 시작 소리를 낸다.
 * 원작에는 나눠 주는 소리가 없지만 연출에 소리가 없으면 허전해서 넣었다.
 */
export function dealCues(
  handSize: number,
  players: number,
  { startDelay, shuffleMs }: DealTiming,
  pattern?: readonly number[],
): CueCall[] {
  const calls: CueCall[] = [];
  const start = startDelay / 1000;
  // 섞는 연출을 다 보일 때만 섞는 소리를 낸다(이미 섞는 연출을 보였으면 나눠 주기부터).
  if (shuffleMs >= SHUFFLE_MS) calls.push({ cue: "shuffle", delay: start });
  const plan = dealPlan(handSize, players, pattern);
  const dealStart = start + shuffleMs / 1000;
  plan.flights.forEach((flight, i) => {
    if (plan.flights[i - 1]?.player !== flight.player)
      calls.push({ cue: "deal", delay: dealStart + flight.delay / 1000 });
  });
  calls.push({
    cue: "gameStart",
    delay: start + (plan.duration - SHUFFLE_MS + shuffleMs) / 1000,
  });
  return calls;
}

/**
 * 한 스냅숏의 이벤트에서 낼 소리. 순수 함수라 테스트할 수 있다.
 * 언제 어떤 소리를 내는지는 원작 `PlayerHuman.cpp`를 따른다(docs/16 3절).
 * `deal`은 섞고 나눠 주는 연출 시간. 연출을 하지 않으면(2마, 움직임 줄이기) `null`
 */
export function cuesFor(
  view: PlayerView,
  events: readonly GameEvent[],
  deal: DealTiming | null = null,
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
        if (deal)
          calls.push(...dealCues(event.handSize, view.players.length, deal));
        else calls.push({ cue: "gameStart" });
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
  // 한 스냅숏에 같은 때 같은 소리가 겹치면 하나만 낸다(나눠 주기처럼 때가 다르면 둔다).
  const seen = new Set<string>();
  return calls.filter(({ cue, delay = 0 }) => {
    const key = `${cue}@${delay}`;
    return !seen.has(key) && seen.add(key);
  });
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
