import type { Card } from "@mighty/engine";

import { heartsDeck } from "./cards";
import { createMatch } from "./match";
import { HAND_SIZE, type HeartsRules, PLAYER_COUNT } from "./rules";
import type { MatchState, PassDirection, Play } from "./state";

export interface HeartsScenarioOptions {
  rules: HeartsRules;
  /** 자리마다 지금 손에 든 카드(이번 턴에 이미 낸 카드는 빼고). `fill`이면 13장이 되도록 남은 카드를 채운다 */
  hands: Card[][];
  /** 남은 카드를 자리마다 13장까지 차례로 나눠 채운다(첫 턴처럼 손패가 다 있어야 하는 장면) */
  fill?: boolean;
  /** "passing"이면 카드를 넘기는 단계, "play"면 카드를 내는 단계에서 시작한다 */
  phase: "passing" | "play";
  /** 넘기는 방향. 넘기기 단계에서만 쓴다 */
  direction?: PassDirection;
  /** 이번 턴의 선. 없으면 ♣2를 가진 사람(첫 턴) */
  leader?: number;
  /** 이번 턴에 이미 나온 카드(선부터 차례로) */
  trick?: Card[];
  heartsBroken?: boolean;
}

/**
 * 튜토리얼 미션용 정해진 장면. 손패가 13장보다 적으면 그만큼 턴이 지난 것으로 두어
 * 손패를 다 내면 판이 끝난다
 */
export function createHeartsScenario(
  options: HeartsScenarioOptions,
): MatchState {
  const hands = options.hands.map((h) => [...h]);
  if (options.fill) {
    const used = new Set(hands.flat());
    const rest = heartsDeck().filter((c) => !used.has(c));
    for (let s = 0; rest.length > 0; s = (s + 1) % PLAYER_COUNT) {
      const hand = hands[s] ?? [];
      if (hand.length < HAND_SIZE) hand.push(rest.shift() as Card);
    }
  }
  const { state } = createMatch({
    rules: options.rules,
    seed: 1,
    presetHands: hands,
  });
  const round = state.round;
  if (options.phase === "passing") {
    round.direction = options.direction ?? "left";
    round.phase = "passing";
    round.trick = null;
    round.turn = null;
    return state;
  }

  round.phase = "play";
  round.direction = "none";
  round.heartsBroken = options.heartsBroken ?? false;
  const plays: Play[] = [];
  const leader = options.leader;
  if (leader === undefined) {
    // 첫 턴: ♣2를 가진 사람이 연다.
    round.trickIndex = 0;
    round.trick = { leader: -1, plays: [] };
    round.turn = null;
    return state;
  }
  for (const [i, card] of (options.trick ?? []).entries())
    plays.push({ seat: (leader + i) % PLAYER_COUNT, card });
  // 이번 턴을 시작할 때 손에 있던 장수 = 남은 손패 + 이번 턴에 이미 낸 카드
  const atStart = Math.max(
    ...hands.map(
      (h, seat) => h.length + (plays.some((p) => p.seat === seat) ? 1 : 0),
    ),
  );
  round.trickIndex = HAND_SIZE - atStart;
  round.trick = { leader, plays };
  round.turn = (leader + plays.length) % PLAYER_COUNT;
  return state;
}
