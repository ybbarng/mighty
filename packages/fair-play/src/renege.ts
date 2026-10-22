import {
  type Card,
  type Kiruda,
  type RuleSet,
  type Suit,
  type TrickCards,
  unplayableReason,
} from "@mighty/engine";
import { cardText } from "./blind";

/*
 * 무늬 안 따르기(renege) 즉시 잡기.
 *
 * 멘탈 포커에서는 남의 손패를 모르므로, 낸 카드가 규칙에 맞는지를 그 자리에서 다 확인할 수 없다.
 * 하지만 마이티는 한 판 동안 손패를 모두 낸다. 그래서 카드 c가 공개되는 순간,
 * "c는 그 전 턴들에도 손에 있었다"는 것을 안다. 그 사람이 앞선 턴에 낸 카드 x가
 * 손패 {x, c}만으로도 규칙 위반이면, 실제 손패(더 많은 카드)에서도 위반이다.
 * 엔진의 금지 조건(무늬 따르기, 조커콜, 첫 턴 기루다, 막판 마이티·조커)은 손에 카드가 늘어도
 * 풀리지 않기 때문이다. 이런 위반을 찾으면 그 즉시 판을 멈춘다.
 *
 * 바닥 카드: 주공은 첫 턴 전에 바닥 카드를 받으므로 모든 손패가 첫 턴부터 손에 있다.
 */

export interface PublicPlay {
  seat: number;
  card: Card;
}

export interface PublicTrick {
  trickIndex: number;
  /** 낸 차례대로 */
  plays: PublicPlay[];
  jokerSuit: Suit | null;
  jokerCalled: boolean;
}

export type Violation = {
  seat: number;
  /** 위반한 턴 */
  trickIndex: number;
  /** 그때 낸 카드 */
  played: Card;
  /** 그때 손에 있었다고 드러난 카드 */
  heldCard: Card;
  reason: string;
};

export class RenegeWatch {
  private readonly tricks: PublicTrick[] = [];
  private readonly revealed = new Set<Card>();

  constructor(
    private readonly rules: RuleSet,
    private readonly kiruda: Kiruda,
  ) {}

  /**
   * 카드 한 장이 공개되었다. 같은 카드가 두 번 나오면 섞기 조작, 이 카드로 드러나는
   * 앞선 위반이 있으면 그 위반을 돌려준다. 문제없으면 null.
   */
  reveal(
    trickIndex: number,
    seat: number,
    card: Card,
    trick: Omit<PublicTrick, "trickIndex" | "plays">,
  ): Violation | { seat: number; reason: string; duplicate?: true } | null {
    // 같은 카드가 두 번: 섞는 단계의 조작이다. 낸 사람이 아니라 섞기 증명으로 범인을 찾는다(`duplicate`).
    if (this.revealed.has(card))
      return {
        seat,
        reason: `${cardText(card)}가 두 번 나왔다`,
        duplicate: true,
      };
    this.revealed.add(card);

    // 이 사람이 앞선 턴들에 낸 카드를 c가 손에 있었다는 사실로 다시 따져 본다.
    for (const past of this.tricks) {
      if (past.trickIndex >= trickIndex) continue;
      const index = past.plays.findIndex((p) => p.seat === seat);
      const played = past.plays[index];
      if (!played) continue;
      const before: TrickCards = {
        cards: past.plays.slice(0, index).map((p) => p.card),
        jokerSuit: past.jokerSuit,
        jokerCalled: past.jokerCalled,
      };
      const reason = unplayableReason(
        { rules: this.rules, kiruda: this.kiruda, trickIndex: past.trickIndex },
        [played.card, card],
        before,
        played.card,
      );
      if (reason && reason.kind !== "notInHand")
        return {
          seat,
          trickIndex: past.trickIndex,
          played: played.card,
          heldCard: card,
          reason: describe(reason.kind),
        };
    }

    // 지금 턴 기록에 더한다.
    let current = this.tricks.find((t) => t.trickIndex === trickIndex);
    if (!current) {
      current = { trickIndex, plays: [], ...trick };
      this.tricks.push(current);
    }
    current.jokerSuit = trick.jokerSuit;
    current.jokerCalled = trick.jokerCalled;
    current.plays.push({ seat, card });
    return null;
  }
}

function describe(kind: string): string {
  switch (kind) {
    case "followSuit":
      return "선 무늬가 있었는데 따라 내지 않았다";
    case "jokerCalled":
      return "조커콜에 조커가 있었는데 내지 않았다";
    case "kirudaFirstTrick":
      return "첫 턴에 다른 카드가 있었는데 기루다를 냈다";
    case "mustPlayMightyOrJoker":
      return "마지막 턴에 못 내는 마이티·조커를 미리 내지 않았다";
    default:
      return `규칙 위반(${kind})`;
  }
}
