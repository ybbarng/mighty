"use client";

import type { Card } from "@mighty/engine";
import { cardLabel } from "@/game/terms";
import { PLATE_COMPACT_H, type Rect } from "@/layout/compute-layout";
import { cn } from "@/lib/cn";

interface SeatPlateProps {
  rect: Rect;
  name: string;
  handCount: number;
  points: Card[] | null;
  pointCount: number;
  money: number;
  declarer: boolean;
  friend: boolean;
  ruling: boolean;
  active: boolean;
  leader: boolean;
  dead: boolean;
  bubble: string | null;
  /** 포기했거나 다른 사람에게 밀린 공약 */
  bubbleDim?: boolean;
  compact: boolean;
}

function isRed(card: Card): boolean {
  return card.startsWith("H") || card.startsWith("D");
}

/** 다른 사람 자리. 손패는 펼치지 않고 장수·딴 점수 카드·상태만 보여 준다 (docs/05-layout.md 3.5절). */
export function SeatPlate(props: SeatPlateProps) {
  const { rect } = props;
  // 낮은 화면에서는 점수 카드 줄을 접어 한 줄로 보여 준다.
  const compact = rect.h < PLATE_COMPACT_H;
  return (
    <div
      className={cn(
        "absolute flex flex-col justify-between overflow-visible rounded-xl border px-2 py-1 text-xs shadow-lg backdrop-blur-sm transition-[box-shadow,background-color,opacity] duration-300",
        props.ruling
          ? "border-amber-300/70 bg-amber-950/70"
          : "border-white/15 bg-black/45",
        props.active &&
          "shadow-[0_0_0_2px_#fde68a,0_0_20px_2px_rgba(253,230,138,0.55)]",
        props.dead && "opacity-40",
      )}
      style={{ left: rect.x, top: rect.y, width: rect.w, height: rect.h }}
    >
      <div className="flex items-center gap-1">
        <span className="min-w-0 truncate font-semibold">{props.name}</span>
        {props.declarer && (
          <span className="shrink-0 whitespace-nowrap rounded bg-amber-400 px-1 text-[10px] text-black">
            주공
          </span>
        )}
        {props.friend && (
          <span className="shrink-0 whitespace-nowrap rounded bg-sky-300 px-1 text-[10px] text-black">
            프렌드
          </span>
        )}
        {props.leader && (
          <span className="shrink-0 whitespace-nowrap rounded bg-white/20 px-1 text-[10px]">
            선
          </span>
        )}
        <span
          className="ml-auto shrink-0 whitespace-nowrap tabular-nums opacity-80"
          title="남은 손패"
        >
          {props.dead ? "탈락" : `${props.handCount}장`}
        </span>
      </div>
      {compact ? (
        <div className="flex items-center justify-between text-[10px] tabular-nums opacity-70">
          <span>
            {props.pointCount > 0 ? `점수 ${props.pointCount}장` : ""}
          </span>
          <span>{props.money * 10}</span>
        </div>
      ) : (
        <>
          <div className="flex h-4 flex-nowrap items-center gap-0.5 overflow-hidden">
            {props.points === null || props.compact
              ? props.pointCount > 0 && (
                  <span className="opacity-80">점수 {props.pointCount}장</span>
                )
              : props.points.map((card) => (
                  <span
                    key={card}
                    className={cn(
                      "rounded bg-white px-0.5 text-[10px] leading-4 font-semibold",
                      isRed(card) ? "text-red-600" : "text-black",
                    )}
                  >
                    {cardLabel(card)}
                  </span>
                ))}
          </div>
          <div className="text-[10px] tabular-nums opacity-60">
            {props.money * 10}
          </div>
        </>
      )}
      {props.bubble && (
        <div
          className={cn(
            "absolute -bottom-3 left-1/2 -translate-x-1/2 translate-y-full whitespace-nowrap rounded-full px-2 py-0.5 font-bold text-xs shadow transition-opacity",
            props.bubbleDim
              ? "bg-white/60 text-black/60"
              : "bg-white text-black",
          )}
        >
          {props.bubble}
        </div>
      )}
    </div>
  );
}
