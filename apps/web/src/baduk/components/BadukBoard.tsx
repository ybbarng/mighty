"use client";

import {
  type Cell,
  COLUMNS,
  indexOf,
  pointName,
  type Stone,
  starPoints,
  xyOf,
} from "@mighty/baduk-engine";
import {
  type KeyboardEvent,
  type PointerEvent,
  useId,
  useRef,
  useState,
} from "react";

/** 판 가장자리 여백(칸 단위). 바깥 줄 위 돌이 잘리지 않고 줄 이름이 들어갈 만큼 */
export const BADUK_PAD = 1;

const BOARD = "#dcb35c";
const LINE = "#3b2a14";

/**
 * 바둑판. 오목 판과 같은 손맛이다.
 * 마우스는 올리면 반투명 돌이 보이고 누르면 둔다.
 * 손가락은 돌을 가려 잘못 두기 쉬워서 한 번 눌러 겨누고(십자선), 같은 자리를 다시 누르면 둔다.
 * 키보드는 화살표로 겨누고 Enter·Space로 둔다.
 */
export function BadukBoard({
  board,
  size,
  myStone,
  canPlay,
  legal,
  lastMove,
  aim,
  onAim,
  onPlace,
  owners,
  marks,
}: {
  board: readonly Cell[];
  size: number;
  /** 내 돌 색(미리 보기 돌 색) */
  myStone: Stone;
  canPlay: boolean;
  /** 둘 수 있는 자리(미리 보기는 여기에만 보인다) */
  legal: readonly number[];
  lastMove: number | null;
  /** 겨눈 자리(손가락·키보드) */
  aim: number | null;
  onAim: (at: number | null) => void;
  onPlace: (at: number) => void;
  /** 판 끝 세기: 자리마다 누구 것인지(빈 자리에 작은 네모로 보인다) */
  owners?: readonly Cell[] | null;
  /** 튜토리얼 그림의 표시(자리 → 글자, 예: "A"·"×") */
  marks?: Readonly<Record<number, string>>;
}) {
  const svg = useRef<SVGSVGElement>(null);
  const view = size - 1 + BADUK_PAD * 2;
  // 돌 그러데이션 이름. 한 화면에 판이 여럿이어도 겹치지 않게 한다.
  const id = `bstone${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const blackFill = `url(#${id}-black)`;
  const whiteFill = `url(#${id}-white)`;
  const [hover, setHover] = useState<number | null>(null);
  const legalSet = new Set(legal);
  const center = indexOf(Math.floor(size / 2), Math.floor(size / 2), size);

  /** 화면 좌표 → 가장 가까운 교차점 */
  const pointFrom = (clientX: number, clientY: number): number | null => {
    const rect = svg.current?.getBoundingClientRect();
    if (!rect) return null;
    const unit = rect.width / view;
    const x = Math.round((clientX - rect.left) / unit - BADUK_PAD);
    const y = Math.round((clientY - rect.top) / unit - BADUK_PAD);
    if (x < 0 || x >= size || y < 0 || y >= size) return null;
    return indexOf(x, y, size);
  };

  const onPointerMove = (e: PointerEvent<SVGSVGElement>) => {
    if (e.pointerType !== "mouse") return;
    setHover(canPlay ? pointFrom(e.clientX, e.clientY) : null);
  };

  const onPointerUp = (e: PointerEvent<SVGSVGElement>) => {
    if (!canPlay) return;
    const at = pointFrom(e.clientX, e.clientY);
    if (at === null || board[at] !== 0) return;
    if (e.pointerType === "mouse" || aim === at) {
      onAim(null);
      onPlace(at);
    } else onAim(at);
  };

  const onKeyDown = (e: KeyboardEvent<SVGSVGElement>) => {
    if (!canPlay) return;
    const [x, y] = xyOf(aim ?? center, size);
    const move: Record<string, [number, number]> = {
      ArrowLeft: [-1, 0],
      ArrowRight: [1, 0],
      ArrowUp: [0, -1],
      ArrowDown: [0, 1],
    };
    const delta = move[e.key];
    if (delta) {
      e.preventDefault();
      const nx = Math.min(size - 1, Math.max(0, x + delta[0]));
      const ny = Math.min(size - 1, Math.max(0, y + delta[1]));
      onAim(aim === null ? center : indexOf(nx, ny, size));
    } else if ((e.key === "Enter" || e.key === " ") && aim !== null) {
      e.preventDefault();
      if (board[aim] === 0) {
        onAim(null);
        onPlace(aim);
      }
    }
  };

  const ghost = canPlay ? (aim ?? hover) : null;
  const at = (i: number) => {
    const [x, y] = xyOf(i, size);
    return [x + BADUK_PAD, y + BADUK_PAD] as const;
  };
  const lines = Array.from({ length: size }, (_, i) => i + BADUK_PAD);
  const end = size - 1 + BADUK_PAD;
  const stroke = size >= 19 ? 0.05 : 0.04;
  const label = { fontSize: 0.38, fill: LINE, opacity: 0.75 } as const;

  return (
    <svg
      ref={svg}
      viewBox={`0 0 ${view} ${view}`}
      role="img"
      aria-label={canPlay ? "바둑판, 내 차례" : "바둑판"}
      // biome-ignore lint/a11y/noNoninteractiveTabindex: 판은 키보드로 겨누고 둔다
      tabIndex={0}
      className="block h-full w-full touch-none select-none rounded-lg shadow-2xl outline-none focus-visible:ring-2 focus-visible:ring-amber-300"
      style={{ background: BOARD }}
      onPointerMove={onPointerMove}
      onPointerLeave={() => setHover(null)}
      onPointerUp={onPointerUp}
      onKeyDown={onKeyDown}
    >
      {/* 돌의 입체감: 왼쪽 위에서 오는 빛(오목 판과 같다) */}
      <defs>
        <radialGradient id={`${id}-black`} cx="0.36" cy="0.32" r="0.75">
          <stop offset="0" stopColor="#6b6b6b" />
          <stop offset="0.35" stopColor="#2a2a2a" />
          <stop offset="1" stopColor="#050505" />
        </radialGradient>
        <radialGradient id={`${id}-white`} cx="0.36" cy="0.32" r="0.8">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="0.55" stopColor="#f1f0ec" />
          <stop offset="1" stopColor="#b9b6ae" />
        </radialGradient>
      </defs>
      {lines.map((p) => (
        <g key={p}>
          <line
            x1={p}
            y1={BADUK_PAD}
            x2={p}
            y2={end}
            stroke={LINE}
            strokeWidth={stroke}
          />
          <line
            x1={BADUK_PAD}
            y1={p}
            x2={end}
            y2={p}
            stroke={LINE}
            strokeWidth={stroke}
          />
        </g>
      ))}
      {/* 줄 이름: 위·아래에 A~, 왼쪽·오른쪽에 숫자(아래가 1) */}
      <g textAnchor="middle" dominantBaseline="central">
        {lines.map((p, i) => (
          <g key={`l${p}`}>
            <text x={p} y={BADUK_PAD * 0.4} {...label}>
              {COLUMNS[i]}
            </text>
            <text x={p} y={end + BADUK_PAD * 0.6} {...label}>
              {COLUMNS[i]}
            </text>
            <text x={BADUK_PAD * 0.4} y={p} {...label}>
              {size - i}
            </text>
            <text x={end + BADUK_PAD * 0.6} y={p} {...label}>
              {size - i}
            </text>
          </g>
        ))}
      </g>
      {starPoints(size).map((p) => (
        <circle
          key={p}
          cx={at(p)[0]}
          cy={at(p)[1]}
          r={size >= 19 ? 0.13 : 0.1}
          fill={LINE}
        />
      ))}

      {/* 겨눈 자리 십자선(손가락·키보드) */}
      {aim !== null && canPlay && (
        <g stroke="#b91c1c" strokeWidth={0.06} opacity={0.8}>
          <line x1={BADUK_PAD} y1={at(aim)[1]} x2={end} y2={at(aim)[1]} />
          <line x1={at(aim)[0]} y1={BADUK_PAD} x2={at(aim)[0]} y2={end} />
        </g>
      )}

      {board.map((cell, i) => {
        if (cell === 0) return null;
        const [cx, cy] = at(i);
        return (
          <g
            // biome-ignore lint/suspicious/noArrayIndexKey: 판 자리 번호가 곧 정체다
            key={i}
            data-stone={cell === 1 ? "black" : "white"}
            data-point={pointName(i, size)}
          >
            {/* 오른쪽 아래로 비치는 그림자 */}
            <circle
              cx={cx + 0.06}
              cy={cy + 0.08}
              r={0.46}
              fill="#000000"
              opacity={0.35}
            />
            <circle
              cx={cx}
              cy={cy}
              r={0.46}
              fill={cell === 1 ? blackFill : whiteFill}
              stroke={cell === 1 ? "#000000" : "#9a978f"}
              strokeWidth={0.02}
            />
          </g>
        );
      })}

      {/* 판 끝 세기: 빈 자리 주인은 작은 네모, 상대 자리 안의 돌은 흐리게(죽은 돌처럼 보이지 않게 그대로 센다) */}
      {owners?.map((owner, i) => {
        if (owner === 0 || board[i] !== 0) return null;
        const [cx, cy] = at(i);
        return (
          <rect
            // biome-ignore lint/suspicious/noArrayIndexKey: 판 자리 번호가 곧 정체다
            key={`o${i}`}
            data-owner={owner === 1 ? "black" : "white"}
            x={cx - 0.17}
            y={cy - 0.17}
            width={0.34}
            height={0.34}
            fill={owner === 1 ? "#111111" : "#fafafa"}
            stroke={owner === 1 ? "#000000" : "#6b6b6b"}
            strokeWidth={0.02}
            pointerEvents="none"
          />
        );
      })}

      {ghost !== null && board[ghost] === 0 && legalSet.has(ghost) && (
        <circle
          cx={at(ghost)[0]}
          cy={at(ghost)[1]}
          r={0.45}
          fill={myStone === 1 ? blackFill : whiteFill}
          opacity={0.55}
          pointerEvents="none"
        />
      )}

      {lastMove !== null && board[lastMove] !== 0 && (
        <circle
          cx={at(lastMove)[0]}
          cy={at(lastMove)[1]}
          r={0.16}
          fill="none"
          stroke={board[lastMove] === 1 ? "#fafafa" : "#111111"}
          strokeWidth={0.07}
          data-last={pointName(lastMove, size)}
        />
      )}

      {marks &&
        Object.entries(marks).map(([key, text]) => {
          const [cx, cy] = at(Number(key));
          const cell = board[Number(key)];
          return (
            <text
              key={`m${key}`}
              x={cx}
              y={cy}
              textAnchor="middle"
              dominantBaseline="central"
              fontSize={0.5}
              fontWeight={700}
              fill={cell === 1 ? "#fafafa" : cell === 2 ? "#111111" : "#b91c1c"}
              pointerEvents="none"
            >
              {text}
            </text>
          );
        })}
    </svg>
  );
}
