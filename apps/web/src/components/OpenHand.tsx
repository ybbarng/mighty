import { CardChip } from "@/review/CardChip";

/**
 * 다시 보기에서 펼친 다른 사람 손패. 손패 뒷면은 자리 판 뒤에 작게 깔려 앞면으로 바꿔도 안 보여서,
 * 자리 판 바로 아래에 카드 칩으로 늘어놓는다
 */
export function OpenHand({
  cards,
  rect,
}: {
  cards: readonly string[];
  rect: { x: number; y: number; w: number; h: number };
}) {
  if (cards.length === 0) return null;
  return (
    <div
      data-open-hand
      className="pointer-events-none absolute z-[120] flex flex-wrap justify-center gap-0.5 rounded-lg bg-black/55 p-1"
      style={{ left: rect.x, top: rect.y + rect.h + 4, width: rect.w }}
    >
      {cards.map((card) => (
        <CardChip key={card} card={card} />
      ))}
    </div>
  );
}
