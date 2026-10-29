"use client";

import {
  type Cell,
  indexOf,
  KIND_NAMES,
  type Kind,
  type Move,
  SIDE_NAMES,
  SIZE,
  type Side,
  squareName,
  xyOf,
} from "@mighty/chess-engine";
import { type KeyboardEvent, useRef, useState } from "react";

import { useChessSettings } from "../settings";
import {
  Piece3dIcon,
  PieceSprite,
  PieceUse,
  usePiecePrefix,
} from "./piece-art";

const LIGHT = "#f0d9b5";
const DARK = "#b58863";

/**
 * 기물 글자(유니코드 체스 기호). 두 편 모두 속이 찬 모양을 쓰고 색으로 가린다.
 * 끝의 U+FE0E는 휴대폰이 그림 글자(이모지)로 바꿔 그리지 않게 한다
 */
const GLYPH: Record<Kind, string> = {
  K: "♚︎",
  Q: "♛︎",
  R: "♜︎",
  B: "♝︎",
  N: "♞︎",
  P: "♟︎",
};

/** 체스 기호가 있는 글꼴을 먼저 찾는다(맥·윈도·안드로이드·리눅스) */
export const PIECE_FONT =
  '"Apple Symbols", "Segoe UI Symbol", "Noto Sans Symbols2", "DejaVu Sans", serif';

export function pieceGlyph(kind: Kind): string {
  return GLYPH[kind];
}

/** 백은 흰 바탕에 짙은 테, 흑은 검은 바탕에 옅은 테(어두운 칸에서도 보이게) */
export const PIECE_STYLE: Record<
  Side,
  { fill: string; stroke: string; width: number }
> = {
  w: { fill: "#fffdf7", stroke: "#1c1917", width: 0.045 },
  b: { fill: "#1c1917", stroke: "#f5f5f4", width: 0.02 },
};

/** 화면 읽기용 기물 이름(예: "백 킹 e1") */
export function pieceLabel(piece: `${Side}${Kind}`, square?: string): string {
  const name = `${SIDE_NAMES[piece[0] as Side]} ${KIND_NAMES[piece[1] as Kind]}`;
  return square ? `${name} ${square}` : name;
}

/**
 * 판 밖(자리 표·잡은 기물·승급 고르기)에서 쓰는 작은 기물.
 * 옵션 "기물 모양"을 따라 입체 그림이나 기호 글자로 그린다
 */
export function PieceIcon({
  piece,
  className,
}: {
  piece: `${Side}${Kind}`;
  className?: string;
}) {
  const set = useChessSettings((s) => s.pieces);
  if (set === "3d") return <Piece3dIcon piece={piece} className={className} />;
  const side = piece[0] as Side;
  const style = PIECE_STYLE[side];
  return (
    <svg
      viewBox="0 0 1 1"
      className={className}
      aria-hidden="true"
      data-piece-art="glyph"
    >
      <text
        x={0.5}
        y={0.56}
        textAnchor="middle"
        dominantBaseline="central"
        fontSize={0.92}
        fill={style.fill}
        stroke={style.stroke}
        strokeWidth={style.width}
        paintOrder="stroke"
        style={{ fontFamily: PIECE_FONT }}
      >
        {GLYPH[piece[1] as Kind]}
      </text>
    </svg>
  );
}

/**
 * 체스판. 내 기물을 누르면 갈 수 있는 칸에 점(잡을 칸은 고리)이 생기고, 그 칸을 누르면 옮긴다.
 * 마우스·손가락 모두 "고르기 → 옮기기" 두 번 누르기다. 키보드는 화살표로 움직이고 Enter·Space로 고른다.
 * 내 편이 늘 아래에 오게 `flipped`로 판을 돌려 그린다. 승급 수는 `onMove`에 승급 없이 넘기고, 고르기는 화면이 맡는다
 */
export function ChessBoard({
  board,
  flipped,
  legal,
  selected,
  onSelect,
  onMove,
  lastMove,
  checkedKing,
  coordinates,
}: {
  board: readonly Cell[];
  /** 흑이면 판을 돌려 내 편을 아래에 둔다 */
  flipped: boolean;
  /** 지금 내가 둘 수 있는 수(차례가 아니면 빈 목록) */
  legal: readonly Move[];
  selected: number | null;
  onSelect: (at: number | null) => void;
  onMove: (move: Move) => void;
  lastMove: Move | null;
  /** 체크를 받는 킹의 자리 */
  checkedKing: number | null;
  /** 판 가장자리에 a~h·1~8을 쓴다 */
  coordinates: boolean;
}) {
  const svg = useRef<SVGSVGElement>(null);
  const [cursor, setCursor] = useState<number | null>(null);
  const set = useChessSettings((s) => s.pieces);
  const prefix = usePiecePrefix();

  /** 판 칸 → 그림 좌표(왼쪽 위 모서리) */
  const at = (i: number) => {
    const [x, y] = xyOf(i);
    return flipped
      ? ([SIZE - 1 - x, SIZE - 1 - y] as const)
      : ([x, y] as const);
  };
  const movable = new Set(legal.map((m) => m.from));
  // 승급은 같은 칸으로 가는 수가 넷이다. 칸마다 하나만 남긴다.
  const targets = new Map<number, Move>();
  for (const m of legal)
    if (m.from === selected && !targets.has(m.to))
      targets.set(m.to, { from: m.from, to: m.to });

  /** 한 칸을 눌렀다: 갈 곳이면 옮기고, 내 기물이면 고르고, 아니면 고르기를 푼다 */
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
    const unit = rect.width / SIZE;
    let x = Math.floor((e.clientX - rect.left) / unit);
    let y = Math.floor((e.clientY - rect.top) / unit);
    if (x < 0 || x >= SIZE || y < 0 || y >= SIZE) return;
    if (flipped) {
      x = SIZE - 1 - x;
      y = SIZE - 1 - y;
    }
    press(indexOf(x, y));
  };

  const onKeyDown = (e: KeyboardEvent<SVGSVGElement>) => {
    const start = selected ?? legal[0]?.from ?? indexOf(4, 6);
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
      // 화면에서 보이는 방향대로 움직인다(돌린 판이면 거꾸로).
      const s = flipped ? -1 : 1;
      const nx = Math.min(SIZE - 1, Math.max(0, x + delta[0] * s));
      const ny = Math.min(SIZE - 1, Math.max(0, y + delta[1] * s));
      setCursor(cursor === null ? start : indexOf(nx, ny));
    } else if ((e.key === "Enter" || e.key === " ") && cursor !== null) {
      e.preventDefault();
      press(cursor);
    } else if (e.key === "Escape") onSelect(null);
  };

  const highlight = new Set(lastMove ? [lastMove.from, lastMove.to] : []);

  return (
    <svg
      ref={svg}
      viewBox={`0 0 ${SIZE} ${SIZE}`}
      role="img"
      aria-label={legal.length > 0 ? "체스판, 내 차례" : "체스판"}
      data-flipped={flipped || undefined}
      data-piece-art={set}
      // biome-ignore lint/a11y/noNoninteractiveTabindex: 판은 키보드로 고르고 옮긴다
      tabIndex={0}
      className="block h-full w-full touch-none select-none rounded-md shadow-2xl outline-none focus-visible:ring-2 focus-visible:ring-amber-300"
      onPointerUp={onPointerUp}
      onKeyDown={onKeyDown}
    >
      {set === "3d" && <PieceSprite prefix={prefix} />}
      {board.map((_, i) => {
        const [x, y] = at(i);
        const light = (xyOf(i)[0] + xyOf(i)[1]) % 2 === 0;
        return (
          <rect
            // biome-ignore lint/suspicious/noArrayIndexKey: 칸 번호가 곧 정체다
            key={`sq${i}`}
            x={x}
            y={y}
            width={1}
            height={1}
            fill={light ? LIGHT : DARK}
          />
        );
      })}

      {/* 마지막 수: 출발·도착 칸을 노랗게 */}
      {[...highlight].map((i) => (
        <rect
          key={`last${i}`}
          x={at(i)[0]}
          y={at(i)[1]}
          width={1}
          height={1}
          fill="#facc15"
          opacity={0.45}
          data-last={squareName(i)}
        />
      ))}
      {selected !== null && (
        <rect
          x={at(selected)[0]}
          y={at(selected)[1]}
          width={1}
          height={1}
          fill="#f59e0b"
          opacity={0.5}
        />
      )}
      {checkedKing !== null && (
        <circle
          cx={at(checkedKing)[0] + 0.5}
          cy={at(checkedKing)[1] + 0.5}
          r={0.5}
          fill="#dc2626"
          opacity={0.55}
          data-check={squareName(checkedKing)}
        />
      )}

      {coordinates &&
        Array.from({ length: SIZE }, (_, n) => {
          // 아래 줄에 세로줄 글자(a~h), 왼쪽 줄에 가로줄 숫자(1~8)
          const file = flipped ? SIZE - 1 - n : n;
          const rank = flipped ? n + 1 : SIZE - n;
          const bottomLight = (file + (flipped ? 0 : SIZE - 1)) % 2 === 0;
          const leftLight =
            ((flipped ? SIZE - 1 : 0) + (SIZE - rank)) % 2 === 0;
          return (
            // biome-ignore lint/suspicious/noArrayIndexKey: 줄 번호가 곧 정체다
            <g key={`c${n}`} fontSize={0.2} fontWeight={700}>
              <text
                x={n + 0.94}
                y={SIZE - 0.06}
                textAnchor="end"
                fill={bottomLight ? DARK : LIGHT}
              >
                {"abcdefgh"[file]}
              </text>
              <text x={0.05} y={n + 0.22} fill={leftLight ? DARK : LIGHT}>
                {rank}
              </text>
            </g>
          );
        })}

      {board.map((cell, i) => {
        if (cell === "") return null;
        const side = cell[0] as Side;
        const kind = cell[1] as Kind;
        const [x, y] = at(i);
        const piece = cell as `${Side}${Kind}`;
        if (set === "3d")
          return (
            <g
              // biome-ignore lint/suspicious/noArrayIndexKey: 칸 번호가 곧 정체다
              key={i}
              data-piece={cell}
              data-square={squareName(i)}
              aria-label={pieceLabel(piece, squareName(i))}
              className={movable.has(i) ? "cursor-pointer" : undefined}
            >
              <PieceUse prefix={prefix} piece={piece} x={x} y={y} />
            </g>
          );
        const style = PIECE_STYLE[side];
        return (
          <text
            // biome-ignore lint/suspicious/noArrayIndexKey: 칸 번호가 곧 정체다
            key={i}
            data-piece={cell}
            data-square={squareName(i)}
            aria-label={pieceLabel(piece, squareName(i))}
            x={x + 0.5}
            y={y + 0.56}
            textAnchor="middle"
            dominantBaseline="central"
            fontSize={0.84}
            fill={style.fill}
            stroke={style.stroke}
            strokeWidth={style.width}
            paintOrder="stroke"
            className={movable.has(i) ? "cursor-pointer" : undefined}
            style={{ fontFamily: PIECE_FONT }}
          >
            {GLYPH[kind]}
          </text>
        );
      })}

      {[...targets.keys()].map((i) => {
        const [x, y] = at(i);
        const capture = board[i] !== "";
        return capture ? (
          <circle
            key={`t${i}`}
            cx={x + 0.5}
            cy={y + 0.5}
            r={0.45}
            fill="none"
            stroke="#1e3a8a"
            strokeWidth={0.07}
            opacity={0.7}
            data-target={squareName(i)}
            pointerEvents="none"
          />
        ) : (
          <circle
            key={`t${i}`}
            cx={x + 0.5}
            cy={y + 0.5}
            r={0.15}
            fill="#1e3a8a"
            opacity={0.55}
            data-target={squareName(i)}
            pointerEvents="none"
          />
        );
      })}

      {cursor !== null && (
        <rect
          x={at(cursor)[0] + 0.04}
          y={at(cursor)[1] + 0.04}
          width={0.92}
          height={0.92}
          fill="none"
          stroke="#2563eb"
          strokeWidth={0.06}
          pointerEvents="none"
        />
      )}
    </svg>
  );
}
