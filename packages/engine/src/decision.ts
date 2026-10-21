import { type Card, isJoker, type Kiruda } from "./cards";
import { deckFor, discardCountFor } from "./deck";
import {
  type Goal,
  isDealMiss,
  isValidBid,
  isValidGoalChange,
  lowestGoal,
} from "./goal";
import { maxGoal, type RuleSet } from "./rules";
import type { FriendDeclaration, MatchState, RoundState } from "./state";
import {
  canDeclareJokerCall,
  jokerCallOf,
  playableCards,
  type TrickCards,
  type TrickContext,
} from "./trick";

const KIRUDAS: readonly Kiruda[] = ["S", "D", "H", "C", "NT"];

/** 지금 이 자리가 고를 수 있는 것. 화면과 AI는 이것만 보고 행동을 만든다. */
export type Decision =
  | { kind: "pick"; faceUp: Card }
  | {
      kind: "election";
      current: Goal | null;
      bids: Goal[];
      canPass: boolean;
      canDealMiss: boolean;
    }
  | { kind: "kill"; candidates: Card[]; failed: Card[] }
  | { kind: "exchange"; discardCount: number; goals: Goal[]; electedGoal: Goal }
  | { kind: "friend"; options: FriendDeclaration[] }
  | {
      kind: "play";
      cards: Card[];
      /** 선이 조커를 내면 무늬를 지정해야 한다 */
      leading: boolean;
      /** 조커콜을 선언할 수 있는 카드. 없으면 `null` */
      jokerCallCard: Card | null;
    }
  | { kind: "continue" };

function allGoals(rules: RuleSet): Goal[] {
  const max = maxGoal(rules);
  return KIRUDAS.flatMap((kiruda) => {
    const goals: Goal[] = [];
    for (let score = lowestGoal(rules, kiruda); score <= max; score++) {
      goals.push({ kiruda, score });
    }
    return goals;
  });
}

export function trickContext(state: MatchState): TrickContext {
  const { round } = state;
  return {
    rules: state.rules,
    kiruda: round.goal?.kiruda ?? "NT",
    trickIndex: round.trickIndex,
  };
}

export function trickCards(round: RoundState): TrickCards {
  return {
    cards: round.trick?.plays.map((p) => p.card) ?? [],
    jokerSuit: round.trick?.jokerSuit ?? null,
    jokerCalled: round.trick?.jokerCalled ?? false,
  };
}

function hand(round: RoundState, seat: number): Card[] {
  return round.hands[seat] ?? [];
}

function friendOptions(state: MatchState): FriendDeclaration[] {
  const { rules, round } = state;
  const options: FriendDeclaration[] = [{ kind: "none" }];
  if (!rules.friend || round.declarer === null) return options;
  const declarer = round.declarer;
  options.push({ kind: "firstTrick" });
  for (const seat of round.players) {
    if (seat !== declarer) options.push({ kind: "player", seat });
  }
  const unavailable = new Set([...hand(round, declarer), ...round.discarded]);
  for (const card of deckFor(rules)) {
    if (unavailable.has(card)) continue;
    if (isJoker(card) && !rules.jokerFriend) continue;
    options.push({ kind: "card", card });
  }
  return options;
}

/** 카드를 낼 차례의 결정: 낼 수 있는 카드와 조커콜 */
export function playDecision(
  ctx: TrickContext,
  myHand: readonly Card[],
  current: TrickCards,
  jokerUsed: boolean,
): Decision {
  const cards = playableCards(ctx, myHand, current);
  const leading = current.cards.length === 0;
  const callCard = jokerCallOf(ctx.rules, ctx.kiruda);
  const jokerCallCard =
    leading && cards.includes(callCard) && canDeclareJokerCall(ctx, jokerUsed)
      ? callCard
      : null;
  return { kind: "play", cards, leading, jokerCallCard };
}

/** `seat`가 지금 내릴 결정. 차례가 아니면 `null`. */
export function decisionFor(state: MatchState, seat: number): Decision | null {
  const { rules, round } = state;

  if (round.phase === "roundEnd") {
    return round.continued[seat] ? null : { kind: "continue" };
  }
  if (round.turn !== seat) return null;

  switch (round.phase) {
    case "pick":
      return round.pickOffer
        ? { kind: "pick", faceUp: round.pickOffer[0] }
        : null;

    case "election": {
      const current = round.election.goal;
      const myHand = hand(round, seat);
      return {
        kind: "election",
        current,
        bids: allGoals(rules).filter((g) => isValidBid(rules, current, g)),
        canPass: !(
          current === null &&
          seat === round.beginner &&
          !rules.firstBidderMayPass
        ),
        canDealMiss: isDealMiss(rules, myHand, current?.kiruda ?? "NT"),
      };
    }

    case "kill":
      return {
        kind: "kill",
        candidates: deckFor(rules),
        failed: [...round.kill.failed],
      };

    case "exchange": {
      const elected = round.electedGoal;
      if (elected === null) return null;
      return {
        kind: "exchange",
        discardCount: discardCountFor(rules.playerCount),
        electedGoal: elected,
        goals: allGoals(rules).filter(
          (g) =>
            (g.kiruda === elected.kiruda && g.score === elected.score) ||
            isValidGoalChange(rules, elected, g),
        ),
      };
    }

    case "friend":
      return { kind: "friend", options: friendOptions(state) };

    case "play":
      return playDecision(
        trickContext(state),
        hand(round, seat),
        trickCards(round),
        round.jokerUsed,
      );

    default:
      return null;
  }
}

export function sameFriend(
  a: FriendDeclaration,
  b: FriendDeclaration,
): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === "player" && b.kind === "player") return a.seat === b.seat;
  if (a.kind === "card" && b.kind === "card") return a.card === b.card;
  return true;
}
