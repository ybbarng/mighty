import type { Card } from "@mighty/engine";

import { cardLabel } from "@/game/terms";
import { cn } from "@/lib/cn";

/** 복기 표의 작은 카드 글자(빨강·검정 무늬) */
export function CardChip({
  card,
  dim = false,
  strong = false,
}: {
  card: string;
  dim?: boolean;
  strong?: boolean;
}) {
  const red = card.startsWith("H") || card.startsWith("D");
  return (
    <span
      className={cn(
        "inline-block whitespace-nowrap rounded bg-white px-1 font-semibold text-[11px] leading-5 tabular-nums",
        red ? "text-red-600" : "text-black",
        dim && "opacity-40",
        strong && "ring-2 ring-amber-300",
      )}
    >
      {cardLabel(card as Card)}
    </span>
  );
}
