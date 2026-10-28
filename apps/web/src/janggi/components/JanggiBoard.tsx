"use client";

import {
  type Cell,
  HEIGHT,
  indexOf,
  type Kind,
  type Move,
  pointName,
  type Side,
  WIDTH,
  xyOf,
} from "@mighty/janggi-engine";
import { type KeyboardEvent, useId, useRef, useState } from "react";

import type { PieceLabels } from "../settings";

/** 판 가장자리 여백(칸 단위). 바깥 줄 위 기물이 잘리지 않게 */
const PAD = 0.62;
const VIEW_W = WIDTH - 1 + PAD * 2;
const VIEW_H = HEIGHT - 1 + PAD * 2;

const BOARD = "#e4bb6f";
const LINE = "#3b2a14";

/** 기물 크기(반지름, 칸 단위): 궁이 가장 크고 사·졸이 가장 작다 */
const RADIUS: Record<Kind, number> = {
  K: 0.47,
  R: 0.41,
  C: 0.41,
  N: 0.41,
  E: 0.41,
  A: 0.33,
  P: 0.33,
};

const HANJA: Record<Kind, Record<Side, string>> = {
  K: { c: "楚", h: "漢" },
  R: { c: "車", h: "車" },
  C: { c: "包", h: "包" },
  N: { c: "馬", h: "馬" },
  E: { c: "象", h: "象" },
  A: { c: "士", h: "士" },
  P: { c: "卒", h: "兵" },
};
const HANGUL: Record<Kind, Record<Side, string>> = {
  K: { c: "초", h: "한" },
  R: { c: "차", h: "차" },
  C: { c: "포", h: "포" },
  N: { c: "마", h: "마" },
  E: { c: "상", h: "상" },
  A: { c: "사", h: "사" },
  P: { c: "졸", h: "병" },
};

/** 편 글자색: 초는 초록, 한은 빨강 */
export const SIDE_COLOR: Record<Side, string> = { c: "#0f6b3a", h: "#b91c1c" };

export function pieceLabel(
  kind: Kind,
  side: Side,
  labels: PieceLabels,
): string {
  return (labels === "hanja" ? HANJA : HANGUL)[kind][side];
}

/** 반지름 r인 정팔각형(꼭짓점이 위아래가 아니라 변이 위아래에 오게) */
function octagon(cx: number, cy: number, r: number): string {
  const points: string[] = [];
  for (let i = 0; i < 8; i++) {
    const a = Math.PI / 8 + (i * Math.PI) / 4;
    points.push(`${cx + r * Math.cos(a)},${cy + r * Math.sin(a)}`);
  }
  return points.join(" ");
}

/** 궁성 대각선(판 좌표) */
const PALACE_DIAGONALS = [
  [3, 0, 5, 2],
  [5, 0, 3, 2],
  [3, 7, 5, 9],
  [5, 7, 3, 9],
] as const;

/**
 * 장기판. 내 기물을 누르면 갈 수 있는 곳에 점(잡을 곳은 고리)이 생기고, 그곳을 누르면 옮긴다.
 * 마우스·손가락 모두 "고르기 → 옮기기" 두 번 누르기다. 키보드는 화살표로 움직이고 Enter·Space로 고른다.
 * 내 편이 늘 아래에 오게 `flipped`로 판을 뒤집어 그린다
 */
export function JanggiBoard({
  board,
  flipped,
  legal,
  selected,
  onSelect,
  onMove,
  lastMove,
  checkedKing,
  labels,
}: {
  board: readonly Cell[];
  /** 한 편이면 판을 뒤집어 내 편을 아래에 둔다 */
  flipped: boolean;
  /** 지금 내가 둘 수 있는 수(차례가 아니면 빈 목록) */
  legal: readonly Move[];
  selected: number | null;
  onSelect: (at: number | null) => void;
  onMove: (move: Move) => void;
  lastMove: Move | null;
  /** 장군을 받는 궁의 자리 */
  checkedKing: number | null;
  labels: PieceLabels;
}) {
  const svg = useRef<SVGSVGElement>(null);
  const id = `piece${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const [cursor, setCursor] = useState<number | null>(null);

  /** 판 좌표 → 그림 좌표 */
  const at = (i: number) => {
    const [x, y] = xyOf(i);
    const dx = flipped ? WIDTH - 1 - x : x;
    const dy = flipped ? HEIGHT - 1 - y : y;
    return [dx + PAD, dy + PAD] as const;
  };
  const movable = new Set(legal.map((m) => m.from));
  const targets = new Map(
    legal.filter((m) => m.from === selected).map((m) => [m.to, m]),
  );

  /** 한 자리를 눌렀다: 갈 곳이면 옮기고, 내 기물이면 고르고, 아니면 고르기를 푼다 */
  const press = (i: number) => {
    const move = targets.get(i);
    if (move) {
      onSelect(null);
      onMove(move);
    } else if (movable.has(i)) onSelect(selected === i ? null : i);
    else onSelect(null);
  };

  const onPointerUp = (e: React.PointerEvent<SVGSVGElement>) => {
    const rect = svg.current?.getBoundingClientRect();
    if (!rect) return;
    const unit = rect.width / VIEW_W;
    let x = Math.round((e.clientX - rect.left) / unit - PAD);
    let y = Math.round((e.clientY - rect.top) / unit - PAD);
    if (x < 0 || x >= WIDTH || y < 0 || y >= HEIGHT) return;
    if (flipped) {
      x = WIDTH - 1 - x;
      y = HEIGHT - 1 - y;
    }
    press(indexOf(x, y));
  };

  const onKeyDown = (e: KeyboardEvent<SVGSVGElement>) => {
    const start = selected ?? legal[0]?.from ?? indexOf(4, 8);
    const [x, y] = xyOf(cursor ?? start);
    const dir: Record<string, [number, number]> = {
      ArrowLeft: [-1, 0],
      ArrowRight: [1, 0],
      ArrowUp: [0, -1],
      ArrowDown: [0, 1],
    };
    const delta = dir[e.key];
    if (delta) {
      e.preventDefault();
      // 화면에서 보이는 방향대로 움직인다(뒤집힌 판이면 거꾸로).
      const s = flipped ? -1 : 1;
      const nx = Math.min(WIDTH - 1, Math.max(0, x + delta[0] * s));
      const ny = Math.min(HEIGHT - 1, Math.max(0, y + delta[1] * s));
      setCursor(cursor === null ? start : indexOf(nx, ny));
    } else if ((e.key === "Enter" || e.key === " ") && cursor !== null) {
      e.preventDefault();
      press(cursor);
    } else if (e.key === "Escape") onSelect(null);
  };

  const end = (n: number) => n - 1 + PAD;
  const corner = (x: number, y: number) =>
    at(indexOf(x, y)) as readonly [number, number];

  return (
    <svg
      ref={svg}
      viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
      role="img"
      aria-label={legal.length > 0 ? "장기판, 내 차례" : "장기판"}
      // biome-ignore lint/a11y/noNoninteractiveTabindex: 판은 키보드로 고르고 옮긴다
      tabIndex={0}
      className="block h-full w-full touch-none select-none rounded-lg shadow-2xl outline-none focus-visible:ring-2 focus-visible:ring-amber-300"
      style={{ background: BOARD }}
      onPointerUp={onPointerUp}
      onKeyDown={onKeyDown}
    >
      <defs>
        {/* 나무 말의 입체감: 왼쪽 위에서 오는 빛 */}
        <radialGradient id={`${id}-face`} cx="0.38" cy="0.32" r="0.8">
          <stop offset="0" stopColor="#fffaf0" />
          <stop offset="0.6" stopColor="#f1e2c0" />
          <stop offset="1" stopColor="#c9ad78" />
        </radialGradient>
      </defs>

      {Array.from({ length: WIDTH }, (_, x) => (
        <line
          // biome-ignore lint/suspicious/noArrayIndexKey: 줄 번호가 곧 정체다
          key={`v${x}`}
          x1={x + PAD}
          y1={PAD}
          x2={x + PAD}
          y2={end(HEIGHT)}
          stroke={LINE}
          strokeWidth={0.035}
        />
      ))}
      {Array.from({ length: HEIGHT }, (_, y) => (
        <line
          // biome-ignore lint/suspicious/noArrayIndexKey: 줄 번호가 곧 정체다
          key={`h${y}`}
          x1={PAD}
          y1={y + PAD}
          x2={end(WIDTH)}
          y2={y + PAD}
          stroke={LINE}
          strokeWidth={0.035}
        />
      ))}
      {PALACE_DIAGONALS.map(([x1, y1, x2, y2]) => {
        const [ax, ay] = corner(x1, y1);
        const [bx, by] = corner(x2, y2);
        return (
          <line
            key={`d${x1}${y1}`}
            x1={ax}
            y1={ay}
            x2={bx}
            y2={by}
            stroke={LINE}
            strokeWidth={0.035}
          />
        );
      })}

      {/* 마지막 수: 출발·도착 칸을 옅게 */}
      {lastMove &&
        [lastMove.from, lastMove.to].map((i) => (
          <circle
            key={`last${i}`}
            cx={at(i)[0]}
            cy={at(i)[1]}
            r={0.47}
            fill="#facc15"
            opacity={0.35}
            data-last={pointName(i)}
          />
        ))}

      {board.map((cell, i) => {
        if (cell === "") return null;
        const side = cell[0] as Side;
        const kind = cell[1] as Kind;
        const [cx, cy] = at(i);
        const r = RADIUS[kind];
        const chosen = selected === i;
        return (
          <g
            // biome-ignore lint/suspicious/noArrayIndexKey: 판 자리 번호가 곧 정체다
            key={i}
            data-piece={cell}
            data-point={pointName(i)}
            className={movable.has(i) ? "cursor-pointer" : undefined}
          >
            <polygon
              points={octagon(cx + 0.05, cy + 0.07, r)}
              fill="#000000"
              opacity={0.3}
            />
            <polygon
              points={octagon(cx, cy - (chosen ? 0.06 : 0), r)}
              fill={`url(#${id}-face)`}
              stroke={chosen ? "#f59e0b" : SIDE_COLOR[side]}
              strokeWidth={chosen ? 0.07 : 0.035}
            />
            <text
              x={cx}
              y={cy - (chosen ? 0.06 : 0)}
              textAnchor="middle"
              dominantBaseline="central"
              fontSize={r * (labels === "hanja" ? 1.15 : 1.05)}
              fontWeight={700}
              fill={SIDE_COLOR[side]}
              style={{ fontFamily: "serif" }}
            >
              {pieceLabel(kind, side, labels)}
            </text>
          </g>
        );
      })}

      {checkedKing !== null && (
        <circle
          cx={at(checkedKing)[0]}
          cy={at(checkedKing)[1]}
          r={0.55}
          fill="none"
          stroke="#dc2626"
          strokeWidth={0.08}
          data-check={pointName(checkedKing)}
        />
      )}

      {[...targets.keys()].map((i) => {
        const [cx, cy] = at(i);
        const capture = board[i] !== "";
        return capture ? (
          <circle
            key={`t${i}`}
            cx={cx}
            cy={cy}
            r={0.5}
            fill="none"
            stroke="#f59e0b"
            strokeWidth={0.08}
            data-target={pointName(i)}
            pointerEvents="none"
          />
        ) : (
          <circle
            key={`t${i}`}
            cx={cx}
            cy={cy}
            r={0.14}
            fill="#f59e0b"
            opacity={0.9}
            data-target={pointName(i)}
            pointerEvents="none"
          />
        );
      })}

      {cursor !== null && (
        <rect
          x={at(cursor)[0] - 0.5}
          y={at(cursor)[1] - 0.5}
          width={1}
          height={1}
          rx={0.1}
          fill="none"
          stroke="#2563eb"
          strokeWidth={0.05}
          pointerEvents="none"
        />
      )}
    </svg>
  );
}
