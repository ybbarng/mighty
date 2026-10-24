import {
  type Card,
  isJoker,
  jokerCallOf,
  type Kiruda,
  mightyOf,
  type PlayerView,
  rankOf,
  suitOf,
} from "@mighty/engine";

/**
 * 손패를 추측할 때 카드가 어느 자리에 있을 법한지의 무게. 1이 보통, 클수록 그 자리에 있을 법하다.
 * 많이 해 본 사람은 누가 무슨 공약을 했는지로 패를 짐작한다.
 */
export type Bias = (seat: number, card: Card) => number;

const HIGH = new Set(["A", "K", "Q"]);

function isHigh(card: Card): boolean {
  if (isJoker(card)) return true;
  const rank = rankOf(card);
  return rank !== null && HIGH.has(rank);
}

/**
 * 공약 기록으로 만든 무게.
 * - 기루다로 공약한 사람은 그 무늬 카드를 많이, 특히 높은 카드를 쥐었다
 * - 노기루다로 공약한 사람은 A·K와 마이티·조커를 쥐었다
 * - 한 번도 공약하지 않은 사람은 큰 카드가 적다
 * - 주공은 최종 기루다를 많이 쥐었다(바닥 카드를 받고 다시 고른 무늬)
 * 확실한 사실이 아니라 기울기만 준다. 엇갈리면 무게끼리 곱한다.
 */
export function bidBias(view: PlayerView): Bias {
  const mighty = mightyOf(view.rules, view.goal?.kiruda ?? "NT");
  const lastBid = new Map<number, { kiruda: Kiruda; score: number }>();
  const spoke = new Set<number>();
  for (const { seat, bid } of view.election.log) {
    spoke.add(seat);
    if (bid) lastBid.set(seat, bid);
  }
  const declarer = view.declarer;
  const finalKiruda = view.goal?.kiruda ?? null;

  return (seat, card) => {
    if (seat < 0 || seat === view.seat) return 1;
    let w = 1;
    const suit = isJoker(card) ? null : suitOf(card);
    const big = card === mighty || isHigh(card);
    const bid = lastBid.get(seat);
    if (bid) {
      // 높이 부를수록 확신이 크다.
      const strength = 1 + Math.max(0, bid.score - 13) * 0.15;
      if (bid.kiruda === "NT") {
        if (big) w *= 1.6 * strength;
      } else if (suit === bid.kiruda) {
        w *= (big ? 2.8 : 1.8) * strength;
      } else if (card === mighty || isJoker(card)) {
        w *= 1.3;
      }
    } else if (spoke.has(seat) && big) {
      // 공약 없이 포기만 했다
      w *= 0.75;
    }
    if (
      seat === declarer &&
      finalKiruda !== null &&
      finalKiruda !== "NT" &&
      suit === finalKiruda
    )
      w *= 1.8;
    return w;
  };
}

/**
 * 주공은 자기가 부른 프렌드 카드를 갖고 있지 않다(갖고 있으면 부르지 않는다).
 * 프렌드가 아직 드러나지 않았을 때만 쓴다.
 */
export function friendCardExcluded(
  view: PlayerView,
  seat: number,
  card: Card,
): boolean {
  const declaration = view.friendDeclaration;
  return (
    !view.friendRevealed &&
    declaration?.kind === "card" &&
    declaration.card === card &&
    seat === view.declarer
  );
}

/**
 * 사람이 잘 세는 카드: 마이티·조커·조커콜, 기루다, A·K, 점수 카드.
 * 이것이 아닌 낮은 잡카드는 성향에 따라 잊을 수 있다.
 */
export function isMemorable(view: PlayerView, card: Card): boolean {
  const kiruda = view.goal?.kiruda ?? "NT";
  if (isJoker(card)) return true;
  if (card === mightyOf(view.rules, kiruda)) return true;
  if (card === jokerCallOf(view.rules, kiruda)) return true;
  if (suitOf(card) === kiruda) return true;
  const rank = rankOf(card);
  return (
    rank === "A" ||
    rank === "K" ||
    rank === "Q" ||
    rank === "J" ||
    rank === "10"
  );
}
