"use client";

import {
  type Cell,
  type Forbidden,
  indexOf,
  pointName,
  SIZE,
  type Stone,
  xyOf,
} from "@mighty/omok-engine";
import { type KeyboardEvent, type PointerEvent, useRef, useState } from "react";

/** 판 가장자리 여백(칸 단위). 바깥 줄 위 돌이 잘리지 않게 */
const PAD = 0.7;
const VIEW = SIZE - 1 + PAD * 2;
/** 화점 */
const STARS = [
  [3, 3],
  [11, 3],
  [7, 7],
  [3, 11],
  [11, 11],
] as const;

const BOARD = "#e0b464";
const LINE = "#3b2a14";

/**
 * 오목 판. 마우스는 올리면 반투명 돌이 보이고 누르면 둔다.
 * 손가락은 돌을 가려 잘못 두기 쉬워서 한 번 눌러 겨누고(십자선), 같은 자리를 다시 누르면 둔다.
 * 키보드는 화살표로 겨누고 Enter·Space로 둔다.
 */
export function OmokBoard({
  board,
  myStone,
  canPlay,
  lastMove,
  winLine,
  forbidden,
  aim,
  onAim,
  onPlace,
}: {
  board: readonly Cell[];
  /** 내 돌 색(미리 보기 돌 색) */
  myStone: Stone;
  canPlay: boolean;
  lastMove: number | null;
  winLine: readonly number[] | null;
  forbidden: readonly { at: number; reason: Forbidden }[];
  /** 겨눈 자리(손가락·키보드) */
  aim: number | null;
  onAim: (at: number | null) => void;
  onPlace: (at: number) => void;
}) {
  const svg = useRef<SVGSVGElement>(null);
  const [hover, setHover] = useState<number | null>(null);

  /** 화면 좌표 → 가장 가까운 교차점 */
  const pointAt = (clientX: number, clientY: number): number | null => {
    const rect = svg.current?.getBoundingClientRect();
    if (!rect) return null;
    const unit = rect.width / VIEW;
    const x = Math.round((clientX - rect.left) / unit - PAD);
    const y = Math.round((clientY - rect.top) / unit - PAD);
    if (x < 0 || x >= SIZE || y < 0 || y >= SIZE) return null;
    return indexOf(x, y);
  };

  const onPointerMove = (e: PointerEvent<SVGSVGElement>) => {
    if (e.pointerType !== "mouse") return;
    setHover(canPlay ? pointAt(e.clientX, e.clientY) : null);
  };

  const onPointerUp = (e: PointerEvent<SVGSVGElement>) => {
    if (!canPlay) return;
    const at = pointAt(e.clientX, e.clientY);
    if (at === null || board[at] !== 0) return;
    if (e.pointerType === "mouse" || aim === at) {
      onAim(null);
      onPlace(at);
    } else onAim(at);
  };

  const onKeyDown = (e: KeyboardEvent<SVGSVGElement>) => {
    if (!canPlay) return;
    const [x, y] = xyOf(aim ?? indexOf(7, 7));
    const move: Record<string, [number, number]> = {
      ArrowLeft: [-1, 0],
      ArrowRight: [1, 0],
      ArrowUp: [0, -1],
      ArrowDown: [0, 1],
    };
    const delta = move[e.key];
    if (delta) {
      e.preventDefault();
      const nx = Math.min(SIZE - 1, Math.max(0, x + delta[0]));
      const ny = Math.min(SIZE - 1, Math.max(0, y + delta[1]));
      onAim(aim === null ? indexOf(7, 7) : indexOf(nx, ny));
    } else if ((e.key === "Enter" || e.key === " ") && aim !== null) {
      e.preventDefault();
      if (board[aim] === 0) {
        onAim(null);
        onPlace(aim);
      }
    }
  };

  const ghost = canPlay ? (aim ?? hover) : null;
  const forbiddenAt = new Map(forbidden.map((f) => [f.at, f.reason]));
  const at = (i: number) => {
    const [x, y] = xyOf(i);
    return [x + PAD, y + PAD] as const;
  };
  const lines = Array.from({ length: SIZE }, (_, i) => i + PAD);
  const end = SIZE - 1 + PAD;

  return (
    <svg
      ref={svg}
      viewBox={`0 0 ${VIEW} ${VIEW}`}
      role="img"
      aria-label={canPlay ? "오목 판, 내 차례" : "오목 판"}
      // biome-ignore lint/a11y/noNoninteractiveTabindex: 판은 키보드로 겨누고 둔다
      tabIndex={0}
      className="block h-full w-full touch-none select-none rounded-lg shadow-2xl outline-none focus-visible:ring-2 focus-visible:ring-amber-300"
      style={{ background: BOARD }}
      onPointerMove={onPointerMove}
      onPointerLeave={() => setHover(null)}
      onPointerUp={onPointerUp}
      onKeyDown={onKeyDown}
    >
      {lines.map((p) => (
        <g key={p}>
          <line
            x1={p}
            y1={PAD}
            x2={p}
            y2={end}
            stroke={LINE}
            strokeWidth={0.04}
          />
          <line
            x1={PAD}
            y1={p}
            x2={end}
            y2={p}
            stroke={LINE}
            strokeWidth={0.04}
          />
        </g>
      ))}
      {STARS.map(([x, y]) => (
        <circle
          key={`${x}-${y}`}
          cx={x + PAD}
          cy={y + PAD}
          r={0.1}
          fill={LINE}
        />
      ))}

      {/* 겨눈 자리 십자선(손가락·키보드) */}
      {aim !== null && canPlay && (
        <g stroke="#b91c1c" strokeWidth={0.06} opacity={0.8}>
          <line x1={PAD} y1={at(aim)[1]} x2={end} y2={at(aim)[1]} />
          <line x1={at(aim)[0]} y1={PAD} x2={at(aim)[0]} y2={end} />
        </g>
      )}

      {canPlay &&
        [...forbiddenAt].map(([i, reason]) => {
          const [cx, cy] = at(i);
          return (
            <g key={`f${i}`} stroke="#b91c1c" strokeWidth={0.07}>
              <title>{`${pointName(i)} ${reason} 금지`}</title>
              <line
                x1={cx - 0.18}
                y1={cy - 0.18}
                x2={cx + 0.18}
                y2={cy + 0.18}
              />
              <line
                x1={cx - 0.18}
                y1={cy + 0.18}
                x2={cx + 0.18}
                y2={cy - 0.18}
              />
            </g>
          );
        })}

      {board.map((cell, i) => {
        if (cell === 0) return null;
        const [cx, cy] = at(i);
        return (
          <circle
            // biome-ignore lint/suspicious/noArrayIndexKey: 판 자리 번호가 곧 정체다
            key={i}
            data-stone={cell === 1 ? "black" : "white"}
            data-point={pointName(i)}
            cx={cx}
            cy={cy}
            r={0.45}
            fill={cell === 1 ? "#111111" : "#fafafa"}
            stroke={cell === 1 ? "#000000" : "#444444"}
            strokeWidth={0.04}
          />
        );
      })}

      {ghost !== null && board[ghost] === 0 && !forbiddenAt.has(ghost) && (
        <circle
          cx={at(ghost)[0]}
          cy={at(ghost)[1]}
          r={0.45}
          fill={myStone === 1 ? "#111111" : "#fafafa"}
          opacity={0.5}
          pointerEvents="none"
        />
      )}

      {lastMove !== null && (
        <circle
          cx={at(lastMove)[0]}
          cy={at(lastMove)[1]}
          r={0.12}
          fill={board[lastMove] === 1 ? "#fafafa" : "#111111"}
          data-last={pointName(lastMove)}
        />
      )}

      {winLine && winLine.length > 1 && (
        <line
          x1={at(winLine[0] as number)[0]}
          y1={at(winLine[0] as number)[1]}
          x2={at(winLine.at(-1) as number)[0]}
          y2={at(winLine.at(-1) as number)[1]}
          stroke="#dc2626"
          strokeWidth={0.14}
          strokeLinecap="round"
          opacity={0.85}
        />
      )}
    </svg>
  );
}
