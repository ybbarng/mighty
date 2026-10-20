"use client";

import { type Card, isJoker, rankOf, type Suit, suitOf } from "@mighty/engine";
import {
  type CSSProperties,
  type PointerEvent,
  useEffect,
  useState,
} from "react";

import { cardLabel, SUIT_SYMBOL } from "@/game/terms";
import { cn } from "@/lib/cn";

export interface CardPosition {
  x: number;
  y: number;
  scale?: number;
  opacity?: number;
}

interface PlayingCardProps {
  /** `null`이면 뒷면 */
  card: Card | null;
  width: number;
  height: number;
  /** 카드 가운데 좌표 */
  at: CardPosition;
  /** 처음 나타날 때 출발하는 곳. 여기서 `at`으로 날아간다 */
  from?: CardPosition;
  rotate?: number;
  z?: number;
  delay?: number;
  dim?: boolean;
  highlight?: boolean;
  interactive?: boolean;
  onActivate?: (pointerType: string) => void;
}

/** 카드 그림에는 모서리 숫자가 없어서 겹친 손패에서도 읽히도록 덧그린다 */
function CornerIndex({ card, height }: { card: Card; height: number }) {
  const joker = isJoker(card);
  const suit = suitOf(card);
  const red = joker || suit === "H" || suit === "D";
  return (
    <span
      className={cn(
        "pointer-events-none absolute top-[3%] left-[4%] flex flex-col items-center font-bold leading-none",
        red ? "text-red-600" : "text-neutral-900",
      )}
      style={{ fontSize: Math.max(10, height * 0.13) }}
    >
      {joker ? (
        <span style={{ writingMode: "vertical-rl", fontSize: "0.7em" }}>
          JOKER
        </span>
      ) : (
        <>
          <span>{rankOf(card)}</span>
          <span>{SUIT_SYMBOL[suit as Suit]}</span>
        </>
      )}
    </span>
  );
}

function transform(
  p: CardPosition,
  w: number,
  h: number,
  rotate: number,
): string {
  return `translate(${p.x - w / 2}px, ${p.y - h / 2}px) rotate(${rotate}deg) scale(${p.scale ?? 1})`;
}

/** 무대 위 카드 한 장. 위치가 바뀌면 transform 전환으로 날아간다. */
export function PlayingCard({
  card,
  width,
  height,
  at,
  from,
  rotate = 0,
  z = 0,
  delay = 0,
  dim = false,
  highlight = false,
  interactive = false,
  onActivate,
}: PlayingCardProps) {
  const [arrived, setArrived] = useState(from === undefined);

  useEffect(() => {
    if (arrived) return;
    // 출발 위치를 한 번 그린 다음 목표로 옮겨야 전환이 일어난다.
    const id = requestAnimationFrame(() =>
      requestAnimationFrame(() => setArrived(true)),
    );
    return () => cancelAnimationFrame(id);
  }, [arrived]);

  const position = arrived || from === undefined ? at : from;
  const style: CSSProperties = {
    width,
    height,
    zIndex: z,
    transform: transform(position, width, height, arrived ? rotate : 0),
    opacity: position.opacity ?? 1,
    transitionDelay: `${delay}ms`,
  };

  const handlePointerUp = (e: PointerEvent<HTMLButtonElement>) => {
    if (!interactive || !onActivate) return;
    e.preventDefault();
    onActivate(e.pointerType);
  };

  return (
    <button
      type="button"
      aria-label={card ? cardLabel(card) : "뒷면 카드"}
      disabled={!interactive}
      onPointerUp={handlePointerUp}
      onKeyDown={(e) => {
        if (interactive && onActivate && (e.key === "Enter" || e.key === " ")) {
          e.preventDefault();
          onActivate("keyboard");
        }
      }}
      className={cn(
        "absolute top-0 left-0 select-none rounded-[6%] bg-white p-0 shadow-md",
        "transition-[transform,translate,opacity,filter] duration-300 ease-[cubic-bezier(0.2,0.8,0.2,1)]",
        "motion-reduce:transition-none",
        interactive
          ? "cursor-pointer hover:-translate-y-3 focus-visible:outline-3 focus-visible:outline-amber-300"
          : "cursor-default",
        dim && "brightness-[0.55] saturate-50",
        highlight &&
          "shadow-[0_0_0_3px_#fbbf24,0_0_18px_4px_rgba(251,191,36,0.6)]",
      )}
      style={style}
    >
      {/* biome-ignore lint/performance/noImgElement: 정적 내보내기라 next/image 최적화를 쓰지 않는다 */}
      <img
        src={card ? `/cards/${card}.svg` : "/cards/back.png"}
        alt=""
        draggable={false}
        className="pointer-events-none h-full w-full rounded-[6%] object-cover"
      />
      {card && <CornerIndex card={card} height={height} />}
    </button>
  );
}
