import type { Card } from "./cards";
import type { Goal } from "./goal";
import { createMatch } from "./match";
import type { RuleSet } from "./rules";
import type { FriendDeclaration, MatchState } from "./state";

/**
 * 튜토리얼 미션처럼 정해진 장면에서 판을 시작한다.
 * 선거를 건너뛰고 주공·공약을 정해 둔 채 바닥 카드 교환, 프렌드 지정, 트릭 단계 가운데 하나로 바로 들어간다.
 * 손패는 10장이 아니어도 된다(짧은 미션). 그런 판은 미션이 끝나면 버린다.
 */
export interface ScenarioOptions {
  rules: RuleSet;
  seed?: number;
  /** 자리 번호 순서의 손패 */
  hands: Card[][];
  /** 교환 단계면 주공이 받을 바닥 카드(이미 손패에 넣어 둔 상태로 시작하려면 비워 둔다) */
  kitty?: Card[];
  phase: "exchange" | "friend" | "play";
  declarer: number;
  goal: Goal;
  /** 트릭 단계에서 이미 정해진 프렌드 */
  friend?: FriendDeclaration;
  /** 트릭 단계에서 선. 기본은 주공 */
  leader?: number;
  /** 몇 번째 트릭부터인가(0부터). 기본 1: 첫 트릭의 특수 규칙을 피한다 */
  trickIndex?: number;
  /** 주공이 이미 버린 카드 */
  discarded?: Card[];
}

export function createScenario(options: ScenarioOptions): MatchState {
  const { rules, declarer, goal } = options;
  const { state } = createMatch({
    rules,
    seed: options.seed ?? 1,
    firstBeginner: declarer,
    presetDeal: { hands: options.hands, kitty: options.kitty ?? [] },
  });
  const round = state.round;
  round.declarer = declarer;
  round.beginner = declarer;
  round.electedGoal = { ...goal };
  round.goal = { ...goal };
  round.discarded = [...(options.discarded ?? [])];
  round.turn = declarer;

  if (options.phase === "exchange") {
    round.phase = "exchange";
    round.hands[declarer] = [...(round.hands[declarer] ?? []), ...round.deck];
    round.deck = [];
    return state;
  }
  if (options.phase === "friend") {
    round.phase = "friend";
    return state;
  }

  const friend = options.friend ?? { kind: "none" };
  round.friendDeclaration = friend;
  if (friend.kind === "player") {
    round.friend = friend.seat;
    round.friendRevealed = true;
  } else if (friend.kind === "card") {
    round.friend =
      round.players.find((s) => round.hands[s]?.includes(friend.card)) ?? null;
  } else {
    round.friend = null;
    round.friendRevealed = friend.kind === "none";
  }
  const leader = options.leader ?? declarer;
  round.phase = "play";
  round.trickIndex = options.trickIndex ?? 1;
  round.trick = { leader, plays: [], jokerSuit: null, jokerCalled: false };
  round.turn = leader;
  return state;
}
