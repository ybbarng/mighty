"use client";

import type { Card } from "@mighty/engine";
import {
  type CSSProperties,
  type PointerEvent,
  useEffect,
  useState,
} from "react";

import { useCardTheme } from "@/game/settings";
import { cardLabel } from "@/game/terms";
import { cn } from "@/lib/cn";

import { CardArt } from "./card-art/CardArt";

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
  /** 튜토리얼 추천 카드: 강조와 다른 색으로 깜빡이고 "추천" 표를 단다 */
  hint?: boolean;
  /** 키티에서 막 들어온 카드: "새" 표를 단다 */
  fresh?: boolean;
  interactive?: boolean;
  onActivate?: (pointerType: string) => void;
  /** 움직이는 시간(ms). 기본 300 */
  duration?: number;
  /** 마우스를 올리고 내릴 때(카드 툴팁) */
  onHover?: (hovering: boolean) => void;
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
  hint = false,
  fresh = false,
  interactive = false,
  onActivate,
  onHover,
  duration,
}: PlayingCardProps) {
  const theme = useCardTheme();
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
    ...(duration ? { transitionDuration: `${duration}ms` } : {}),
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
      onPointerEnter={(e) => {
        if (e.pointerType === "mouse") onHover?.(true);
      }}
      onPointerLeave={() => onHover?.(false)}
      onKeyDown={(e) => {
        if (interactive && onActivate && (e.key === "Enter" || e.key === " ")) {
          e.preventDefault();
          onActivate("keyboard");
        }
      }}
      className={cn(
        "absolute top-0 left-0 select-none rounded-[6.4%] bg-transparent p-0 shadow-md",
        "transition-[transform,translate,opacity,filter] duration-300 ease-[cubic-bezier(0.2,0.8,0.2,1)]",
        "motion-reduce:transition-none",
        interactive
          ? "cursor-pointer hover:-translate-y-3 focus-visible:outline-3 focus-visible:outline-amber-300"
          : "cursor-default",
        dim && "brightness-[0.55] saturate-50",
        highlight &&
          "shadow-[0_0_0_3px_#fbbf24,0_0_18px_4px_rgba(251,191,36,0.6)]",
        hint && !highlight && "hint-glow",
      )}
      style={style}
    >
      <CardArt card={card} theme={theme} />
      {(hint || fresh) && (
        // 손패는 오른쪽 카드가 왼쪽 카드를 덮으므로 표는 왼쪽 위에 단다.
        <span
          className="pointer-events-none absolute left-0.5 flex gap-0.5 font-bold leading-none"
          style={{
            fontSize: Math.max(10, Math.round(width * 0.12)),
            top: `-${Math.max(10, Math.round(width * 0.12)) * 0.8}px`,
          }}
        >
          {fresh && (
            <span className="rounded-full bg-emerald-400 px-[0.5em] py-[0.25em] text-black shadow">
              새
            </span>
          )}
          {hint && (
            <span className="whitespace-nowrap rounded-full bg-sky-400 px-[0.5em] py-[0.25em] text-black shadow">
              추천
            </span>
          )}
        </span>
      )}
    </button>
  );
}
