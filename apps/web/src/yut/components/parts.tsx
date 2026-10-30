"use client";

import type { Sticks, ThrowValue, YutView } from "@mighty/yut-engine";
import {
  clockTurn,
  sideCount,
  sideOf,
  throwName,
  timeControlOf,
} from "@mighty/yut-engine";
import { useEffect, useState } from "react";

import { GameClock } from "@/components/GameClock";
import { cn } from "@/lib/cn";

/** 편 색(말 색): 홍·청·녹·황 */
export const SIDE_COLORS = [
  { fill: "#dc2626", dark: "#7f1d1d", light: "#fca5a5", name: "홍" },
  { fill: "#2563eb", dark: "#1e3a8a", light: "#93c5fd", name: "청" },
  { fill: "#16a34a", dark: "#14532d", light: "#86efac", name: "녹" },
  { fill: "#d97706", dark: "#78350f", light: "#fcd34d", name: "황" },
] as const;

export function sideColor(side: number) {
  return SIDE_COLORS[side % SIDE_COLORS.length] as (typeof SIDE_COLORS)[number];
}

/** 화면에 보일 자리 이름: 나, 온라인 이름, 컴퓨터 n */
export function seatLabel(
  seat: number,
  me: number,
  seatNames: string[] | null,
  botCount: number,
): string {
  if (seat === me) return "나";
  if (seatNames) return seatNames[seat] ?? `${seat + 1}번 자리`;
  if (botCount <= 1) return "컴퓨터";
  // 혼자 하기: 내 다음 자리부터 컴퓨터 1, 2, 3
  return `컴퓨터 ${seat < me ? seat + 1 : seat}`;
}

/** 편 이름: 각자 놀이는 사람 이름, 편 놀이는 "우리 편"·"상대 편" */
export function sideLabel(
  view: Pick<YutView, "rules" | "mySeat">,
  side: number,
  name: (seat: number) => string,
): string {
  if (view.rules.mode === "team")
    return side === sideOf(view.rules, view.mySeat) ? "우리 편" : "상대 편";
  return name(side);
}

/** 말 하나(둥근 나무 말). `count`가 둘 이상이면 업힌 말 수를 붙인다 */
export function PieceToken({
  side,
  count = 1,
  size = 28,
  className,
}: {
  side: number;
  count?: number;
  size?: number;
  className?: string;
}) {
  const c = sideColor(side);
  return (
    <span
      className={cn("relative inline-flex shrink-0", className)}
      style={{ width: size, height: size }}
    >
      {/* 업힌 말은 아래에 한 겹씩 비쳐 보인다 */}
      {count > 1 && (
        <span
          className="absolute inset-0 translate-x-[3px] translate-y-[3px] rounded-full"
          style={{ background: c.dark }}
        />
      )}
      <span
        className="absolute inset-0 rounded-full border-2 shadow-[0_2px_3px_rgba(0,0,0,0.45)]"
        style={{
          background: `radial-gradient(circle at 35% 30%, ${c.light}, ${c.fill} 55%, ${c.dark})`,
          borderColor: c.dark,
        }}
      />
      {count > 1 && (
        <span className="absolute -top-1.5 -right-1.5 rounded-full bg-white px-1 font-black text-[10px] text-black leading-4 tabular-nums shadow">
          ×{count}
        </span>
      )}
    </span>
  );
}

/** 결과 칩 색: 윷·모는 금색, 빽도는 회색 */
function chipTone(value: ThrowValue): string {
  if (value === 4 || value === 5) return "bg-amber-300 text-black";
  if (value === -1) return "bg-zinc-300 text-black";
  return "bg-orange-50 text-black";
}

/** 모아 둔 결과. 고를 수 있으면 단추, 아니면 표시만 */
export function PendingChips({
  values,
  selected,
  usable,
  onSelect,
}: {
  values: readonly ThrowValue[];
  selected: ThrowValue | null;
  /** 지금 쓸 수 있는 결과(없으면 고를 수 없다) */
  usable: ReadonlySet<ThrowValue>;
  onSelect?: (value: ThrowValue) => void;
}) {
  if (values.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center justify-center gap-1.5">
      {values.map((value, i) => {
        const can = usable.has(value) && onSelect !== undefined;
        return (
          <button
            // biome-ignore lint/suspicious/noArrayIndexKey: 같은 결과가 여러 번 모일 수 있다
            key={i}
            type="button"
            disabled={!can}
            aria-pressed={selected === value}
            data-pending={value}
            onClick={() => onSelect?.(value)}
            className={cn(
              "yut-pop rounded-full px-3 py-1 font-black text-sm shadow",
              chipTone(value),
              selected === value
                ? "ring-2 ring-white ring-offset-2 ring-offset-black/40"
                : "opacity-90",
              !can && "opacity-40",
            )}
          >
            {throwName(value)}
          </button>
        );
      })}
    </div>
  );
}

/** 윷가락 하나. 앞면(배)은 밝은 나무에 × 무늬, 뒷면(등)은 짙은 둥근 나무. 0번 가락 배에 빽도 표시 */
function Stick({ flat, marked }: { flat: boolean; marked: boolean }) {
  return (
    <span
      className={cn(
        "relative flex h-24 w-5 flex-col items-center justify-around rounded-full border-2 sm:h-28 sm:w-6 short-landscape:h-16 short-landscape:w-4",
        flat
          ? "border-amber-700/70 bg-[linear-gradient(90deg,#e9cf9b,#f6e3bb_45%,#e2c28a)]"
          : "border-amber-950 bg-[linear-gradient(90deg,#6b3a12,#a8641f_40%,#7a4214)]",
      )}
    >
      {flat ? (
        <>
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className="font-black text-[10px] text-red-900/80 leading-none"
            >
              ✕
            </span>
          ))}
          {marked && (
            <span
              className="absolute top-1.5 size-2 rounded-full bg-black/80"
              title="빽도 표시"
            />
          )}
        </>
      ) : (
        <span className="absolute top-2 bottom-2 left-1 w-1 rounded-full bg-amber-200/40" />
      )}
    </span>
  );
}

/**
 * 윷가락 넷과 결과. 새로 던지면 공중에서 돌다 떨어지는 연출 뒤에 앞뒷면을 보인다(`throwKey`가 바뀔 때).
 * 움직임 줄이기를 켰으면 바로 보인다. 화면을 막지 않는다(누르기는 그대로 된다)
 */
export function YutSticks({
  sticks,
  value,
  throwKey,
  tossing,
}: {
  sticks: Sticks | null;
  value: ThrowValue | null;
  throwKey: number;
  /** 던졌는데 아직 결과가 나오지 않았다(모두의 고리를 기다린다) */
  tossing: boolean;
}) {
  const [landed, setLanded] = useState(true);
  useEffect(() => {
    if (throwKey === 0) return;
    const reduce =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduce) return;
    setLanded(false);
    const id = setTimeout(() => setLanded(true), 650);
    return () => clearTimeout(id);
  }, [throwKey]);
  const spins = ["-540deg", "420deg", "-380deg", "620deg"];
  const showFaces = sticks !== null && landed && !tossing;
  return (
    <div className="flex flex-col items-center gap-1.5">
      <div
        className="flex h-32 items-end gap-2.5 sm:h-36 short-landscape:h-20"
        aria-hidden="true"
      >
        {[0, 1, 2, 3].map((i) => (
          <span
            key={`${throwKey}-${i}`}
            className={cn(throwKey > 0 && "yut-toss")}
            style={
              {
                "--spin": spins[i],
                animationDelay: `${i * 40}ms`,
              } as React.CSSProperties
            }
          >
            <Stick
              flat={showFaces ? (sticks?.[i] ?? false) : false}
              marked={i === 0}
            />
          </span>
        ))}
      </div>
      <p
        data-throw-result={showFaces && value !== null ? value : ""}
        className={cn(
          "min-h-8 font-black text-2xl tracking-wide drop-shadow",
          showFaces && value !== null && "yut-pop",
          value === 4 || value === 5 ? "text-amber-300" : "text-orange-50",
        )}
      >
        {tossing
          ? "던지는 중…"
          : showFaces && value !== null
            ? `${throwName(value)}${value === 4 || value === 5 ? "! 한 번 더" : ""}`
            : sticks === null
              ? "윷을 던져 보세요"
              : ""}
      </p>
    </div>
  );
}

/** 편마다 아직 나가지 않은 말과 난 말 */
export function SideTray({
  view,
  name,
  turnSide,
}: {
  view: YutView;
  name: (seat: number) => string;
  turnSide: number;
}) {
  const sides = sideCount(view.rules);
  return (
    <div className="flex w-full flex-col gap-1">
      {Array.from({ length: sides }, (_, side) => {
        const pieces = view.pieces.filter((p) => p.side === side);
        const home = pieces.filter((p) => p.point === -1).length;
        const done = pieces.filter((p) => p.point === -2).length;
        return (
          <div
            // biome-ignore lint/suspicious/noArrayIndexKey: 편 번호는 게임 내내 바뀌지 않는다
            key={side}
            data-side={side}
            className={cn(
              "flex items-center gap-2 rounded-xl px-2.5 py-1.5 text-sm",
              side === turnSide
                ? "bg-white/15 ring-1 ring-amber-300/70"
                : "bg-black/25",
            )}
          >
            <span className="w-3 text-amber-300">
              {side === turnSide ? "▶" : ""}
            </span>
            <PieceToken side={side} size={14} />
            <span className="min-w-0 flex-1 truncate font-semibold">
              {sideLabel(view, side, name)}
            </span>
            <span className="flex items-center gap-0.5" title="기다리는 말">
              {Array.from({ length: home }, (_, i) => (
                <PieceToken
                  // biome-ignore lint/suspicious/noArrayIndexKey: 같은 말이 여럿
                  key={i}
                  side={side}
                  size={12}
                  className="opacity-80"
                />
              ))}
            </span>
            <span
              className="min-w-12 text-right text-white/80 text-xs tabular-nums"
              data-done={done}
            >
              난 말 {done}/{view.rules.pieces}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/** 자리마다 개인 시간(docs/37 4절). 던지기·말 움직이기 때만 차례인 사람 시계가 간다 */
export function SeatClocks({
  view,
  name,
}: {
  view: YutView;
  name: (seat: number) => string;
}) {
  const control = timeControlOf(view.rules);
  if (!control || !view.clocks) return null;
  const running = clockTurn({ ...view, keys: [] })?.seat ?? null;
  return (
    <div className="flex w-full flex-wrap justify-center gap-1.5">
      {view.clocks.map((clock, seat) => (
        <span
          // biome-ignore lint/suspicious/noArrayIndexKey: 자리 번호는 게임 내내 바뀌지 않는다
          key={seat}
          data-clock-seat={seat}
          className="flex items-center gap-1.5 rounded-xl bg-black/25 px-2 py-1 text-xs"
        >
          <PieceToken side={sideOf(view.rules, seat)} size={10} />
          <span className="max-w-20 truncate">{name(seat)}</span>
          <GameClock
            clock={clock}
            control={control}
            running={running === seat}
          />
        </span>
      ))}
    </div>
  );
}
