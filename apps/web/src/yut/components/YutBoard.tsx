"use client";

import {
  CENTER,
  DONE,
  type GameEvent,
  isBigPoint,
  type MoveOption,
  POINT_COUNT,
  POINT_XY,
  pointName,
  START,
  sideOf,
  type YutView,
} from "@mighty/yut-engine";
import { useEffect, useRef, useState } from "react";

import { cn } from "@/lib/cn";

import { PieceToken, sideColor } from "./parts";

/** 판 그림 안쪽 여백(판 크기의 %) */
const PAD = 11;

function at(point: number): { left: string; top: string } {
  const xy = POINT_XY[point] ?? { x: 1, y: 1 };
  return {
    left: `${PAD + xy.x * (100 - PAD * 2)}%`,
    top: `${PAD + xy.y * (100 - PAD * 2)}%`,
  };
}

/** SVG 좌표(0~100) */
function svgAt(point: number): { x: number; y: number } {
  const xy = POINT_XY[point] ?? { x: 1, y: 1 };
  return { x: PAD + xy.x * (100 - PAD * 2), y: PAD + xy.y * (100 - PAD * 2) };
}

/** 판 위 묶음: 점마다 한 편의 말 수 */
function stacksOf(
  view: YutView,
): { point: number; side: number; count: number }[] {
  const map = new Map<string, { point: number; side: number; count: number }>();
  for (const p of view.pieces) {
    if (p.point < 0) continue;
    const key = `${p.point}:${p.side}`;
    const s = map.get(key) ?? { point: p.point, side: p.side, count: 0 };
    s.count += 1;
    map.set(key, s);
  }
  return [...map.values()];
}

/** 움직인 말이 지나간 점을 따라 한 칸씩 가는 연출 */
interface Motion {
  key: string;
  side: number;
  count: number;
  /** 출발 점(새 말이면 HOME) */
  from: number;
  path: number[];
  to: number;
  step: number;
  captured: number;
}

const STEP_MS = 120;

/**
 * 이번 화면의 움직임. 새 움직임은 그리는 그 순간부터(효과가 돌기 전에도) 연출 중으로 본다:
 * 그래야 도착 점에 말이 먼저 나타났다 사라지거나, 숨긴 말 없이 비는 순간이 없다
 */
function useMotion(view: YutView, events: readonly GameEvent[]): Motion | null {
  const [motion, setMotion] = useState<Motion | null>(null);
  const started = useRef<string | null>(null);
  const moved = events.find(
    (e): e is Extract<GameEvent, { type: "moved" }> => e.type === "moved",
  );
  const key = moved
    ? `${view.throwCount}:${view.pending.join(",")}:${moved.side}:${moved.from}:${moved.value}:${moved.to}`
    : null;
  const reduce =
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  const incoming: Motion | null =
    moved && key && key !== started.current && !reduce && moved.path.length > 0
      ? {
          key,
          side: moved.side,
          count: moved.count,
          from: moved.from,
          path: moved.path,
          to: moved.finished ? DONE : moved.to,
          step: 0,
          captured: moved.captured,
        }
      : null;
  useEffect(() => {
    if (!incoming) return;
    started.current = incoming.key;
    setMotion(incoming);
  });
  useEffect(() => {
    if (!motion) return;
    if (motion.step >= motion.path.length) {
      const id = setTimeout(() => setMotion(null), 260);
      return () => clearTimeout(id);
    }
    const id = setTimeout(
      () => setMotion((m) => (m ? { ...m, step: m.step + 1 } : m)),
      STEP_MS,
    );
    return () => clearTimeout(id);
  }, [motion]);
  return incoming ?? motion;
}

/**
 * 윷판: 나무 판 그림 위에 말 묶음을 단추로 얹는다.
 * 내 차례에 움직일 수 있는 말은 빛나고, 올리거나(마우스) 한 번 누르면(터치) 갈 곳과 길을 미리 보인다.
 * 마우스는 누르면 바로, 터치는 같은 말을 다시 누르면 움직인다(`onPick`이 정한다)
 */
export function YutBoard({
  view,
  events,
  movable,
  preview,
  onHover,
  onPick,
  className,
}: {
  view: YutView;
  events: readonly GameEvent[];
  /** 지금 고른 결과로 움직일 수 있는 점 → 수 */
  movable: ReadonlyMap<number, MoveOption>;
  /** 미리 보이는 수(올린 말·겨눈 말) */
  preview: MoveOption | null;
  onHover?: (from: number | null) => void;
  onPick?: (from: number, pointerType: string) => void;
  className?: string;
}) {
  const motion = useMotion(view, events);
  const stacks = stacksOf(view);
  const pathSet = new Set(preview?.path ?? []);
  // 움직이는 말: 첫 순간은 출발 점(새 말은 참먹이), 그 뒤로 지나간 점을 한 칸씩
  const ghostAt = !motion
    ? null
    : motion.step === 0
      ? motion.from >= 0
        ? motion.from
        : START
      : (motion.path[Math.min(motion.step, motion.path.length) - 1] as number);
  // 연출 중에는 도착 점에서 움직인 말 수만큼 빼고 그린다(말이 둘로 보이지 않게).
  const hidden = (point: number, side: number) =>
    motion && motion.to === point && motion.side === side ? motion.count : 0;

  return (
    <div
      className={cn(
        "relative aspect-square w-full select-none rounded-[6%] shadow-[0_10px_30px_rgba(0,0,0,0.55)]",
        className,
      )}
      data-yut-board
    >
      <svg
        viewBox="0 0 100 100"
        className="absolute inset-0 h-full w-full"
        aria-hidden="true"
      >
        <defs>
          <linearGradient id="yut-wood" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#e2b26a" />
            <stop offset="0.55" stopColor="#c98f45" />
            <stop offset="1" stopColor="#a8692b" />
          </linearGradient>
          <pattern
            id="yut-grain"
            width="100"
            height="6"
            patternUnits="userSpaceOnUse"
          >
            <path
              d="M0 3 Q25 1.6 50 3 T100 3"
              fill="none"
              stroke="#8a5320"
              strokeWidth="0.35"
              opacity="0.35"
            />
          </pattern>
        </defs>
        <rect
          x="0"
          y="0"
          width="100"
          height="100"
          rx="6"
          fill="url(#yut-wood)"
        />
        <rect
          x="0"
          y="0"
          width="100"
          height="100"
          rx="6"
          fill="url(#yut-grain)"
        />
        <rect
          x="1.2"
          y="1.2"
          width="97.6"
          height="97.6"
          rx="5"
          fill="none"
          stroke="#6b3a12"
          strokeWidth="1.2"
        />
        {/* 판 선: 바깥 네모와 대각선 둘 */}
        <rect
          x={PAD}
          y={PAD}
          width={100 - PAD * 2}
          height={100 - PAD * 2}
          fill="none"
          stroke="#5a2d0c"
          strokeWidth="0.9"
        />
        <line
          x1={100 - PAD}
          y1={PAD}
          x2={PAD}
          y2={100 - PAD}
          stroke="#5a2d0c"
          strokeWidth="0.9"
        />
        <line
          x1={PAD}
          y1={PAD}
          x2={100 - PAD}
          y2={100 - PAD}
          stroke="#5a2d0c"
          strokeWidth="0.9"
        />
        {/* 미리 보는 길 */}
        {preview?.path.map((p) => {
          const a = svgAt(p);
          return (
            <circle
              // 한 번 움직일 때 같은 점을 두 번 지나지 않는다
              key={p}
              cx={a.x}
              cy={a.y}
              r={1.3}
              fill="#fde047"
              opacity={0.9}
            />
          );
        })}
        {/* 점 29개 */}
        {Array.from({ length: POINT_COUNT }, (_, p) => {
          const a = svgAt(p);
          const big = isBigPoint(p);
          return (
            // biome-ignore lint/suspicious/noArrayIndexKey: 판 점 번호(0~28)는 바뀌지 않는다
            <g key={p}>
              <circle
                cx={a.x}
                cy={a.y}
                r={big ? 4.1 : 2.6}
                fill={pathSet.has(p) ? "#fef08a" : "#f8e7c2"}
                stroke="#5a2d0c"
                strokeWidth={big ? 0.9 : 0.6}
              />
              {big && (
                <circle
                  cx={a.x}
                  cy={a.y}
                  r={2.4}
                  fill="none"
                  stroke="#5a2d0c"
                  strokeWidth={0.5}
                />
              )}
            </g>
          );
        })}
        {/* 이름 있는 점: 참먹이·모·뒷모·찌모·방 */}
        {[START, 5, 10, 15, CENTER].map((p) => {
          const a = svgAt(p);
          // 모서리 이름은 판 테두리 안쪽 여백에, 방은 점 아래에
          const dy = p === CENTER ? 7.2 : a.y > 50 ? 7.4 : -4.8;
          return (
            <text
              key={p}
              x={a.x}
              y={a.y + dy}
              textAnchor="middle"
              fontSize="3.4"
              fontWeight="700"
              fill="#4a2208"
              opacity={0.85}
            >
              {pointName(p)}
            </text>
          );
        })}
        {/* 참먹이에서 나가는 방향 */}
        <path
          d={`M ${100 - PAD + 3.5} ${100 - PAD - 6} L ${100 - PAD + 3.5} ${100 - PAD - 15}`}
          stroke="#4a2208"
          strokeWidth="0.7"
          markerEnd="url(#yut-arrow)"
          opacity={0.7}
        />
        <defs>
          <marker
            id="yut-arrow"
            viewBox="0 0 6 6"
            refX="3"
            refY="3"
            markerWidth="4"
            markerHeight="4"
            orient="auto"
          >
            <path d="M0 0 L6 3 L0 6 Z" fill="#4a2208" />
          </marker>
        </defs>
      </svg>

      {/* 갈 곳 표시 */}
      {preview && (
        <span
          className="pointer-events-none absolute z-10 size-[12%] -translate-x-1/2 -translate-y-1/2 rounded-full border-[3px] border-yellow-300 border-dashed"
          style={at(preview.finished ? START : preview.to)}
          data-preview-to={preview.finished ? "done" : preview.to}
        />
      )}

      {/* 판 위 말 묶음 */}
      {stacks.map((s) => {
        const count = s.count - hidden(s.point, s.side);
        if (count <= 0) return null;
        const option = movable.get(s.point);
        const canMove =
          option !== undefined && s.side === sideOfMovable(view, movable);
        return (
          <button
            key={`${s.point}:${s.side}`}
            type="button"
            data-stack={s.point}
            data-side={s.side}
            aria-label={`${sideColor(s.side).name} 말 ${count}개 · ${pointName(s.point) ?? `${s.point}번 점`}${canMove ? " · 움직일 수 있음" : ""}`}
            disabled={!canMove}
            onPointerEnter={(e) => {
              if (e.pointerType === "mouse" && canMove) onHover?.(s.point);
            }}
            onPointerLeave={(e) => {
              if (e.pointerType === "mouse") onHover?.(null);
            }}
            onFocus={() => canMove && onHover?.(s.point)}
            onClick={(e) => {
              const type =
                (e.nativeEvent as PointerEvent).pointerType || "keyboard";
              onPick?.(s.point, type);
            }}
            className={cn(
              "absolute z-20 -translate-x-1/2 -translate-y-1/2 rounded-full transition-transform disabled:cursor-default",
              canMove && "yut-glow cursor-pointer hover:scale-110",
              preview?.from === s.point && "scale-110",
            )}
            style={at(s.point)}
          >
            <PieceToken side={s.side} count={count} size={tokenSize()} />
          </button>
        );
      })}

      {/* 움직이는 말 */}
      {motion && ghostAt !== null && (
        <span
          data-moving
          className="pointer-events-none absolute z-30 -translate-x-1/2 -translate-y-1/2 transition-[left,top] duration-100 ease-out"
          style={at(ghostAt)}
        >
          <PieceToken
            side={motion.side}
            count={motion.count}
            size={tokenSize()}
          />
        </span>
      )}
      {motion && motion.captured > 0 && motion.step >= motion.path.length && (
        <span
          className="yut-pop pointer-events-none absolute z-40 -translate-x-1/2 -translate-y-[160%] whitespace-nowrap rounded-full bg-rose-600 px-2 py-0.5 font-black text-white text-xs shadow"
          style={at(motion.to >= 0 ? motion.to : START)}
        >
          잡았다!
        </span>
      )}
    </div>
  );
}

/** 말 크기(px). 판이 작아도 누르기 쉽게 너무 작아지지 않는다 */
function tokenSize(): number {
  return 30;
}

/** 움직일 수 있는 말의 편(지금 차례 편). 움직일 말이 없으면 null */
function sideOfMovable(
  view: YutView,
  movable: ReadonlyMap<number, MoveOption>,
): number | null {
  return movable.size === 0 ? null : sideOf(view.rules, view.turn);
}
