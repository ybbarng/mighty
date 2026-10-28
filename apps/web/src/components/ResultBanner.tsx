"use client";

import { useEffect, useState } from "react";

import type { ResultBanner as Banner } from "@/game/result-banner";
import type { Point } from "@/layout/compute-layout";
import { cn } from "@/lib/cn";

/** 이만큼 머문 뒤 사라진다(ms). 움직임 줄이기에서도 같은 시간 뒤 사라진다 */
const SHOW_MS = 2600;

/**
 * 판이 끝났을 때 화면 가운데에 크게 띄우는 "승리!" / "패배" / "비김". 모든 게임이 함께 쓴다.
 * `banner`는 지금 장면에서 고른 문구다. 판이 끝나자마자 컴퓨터가 다음 판으로 넘어가겠다고 해
 * 새 장면이 와도 지워지지 않게, 한 번 뜨면 정해진 시간 동안 머문다. 누르기는 막지 않는다
 * 뒤에 어두운 판을 깔아 결과 상자 위에 겹쳐도(눕힌 폰) 또렷하게 읽힌다.
 * 카드 게임은 판 가운데 좌표(`center`)를 주고, 판 게임은 주지 않아 감싼 상자의 가운데에 띄운다.
 */
export function ResultBanner({
  banner,
  seq,
  center,
  stageHeight,
}: {
  banner: Banner | null;
  /** 장면 번호. 같은 장면에서 다시 띄우지 않는다 */
  seq: number;
  /** 없으면 감싼 상자(relative)의 가운데 */
  center?: Point;
  /** 무대 높이. 세로 화면은 판 가운데가 아래쪽이라 결과 상자를 가리지 않게 위로 올린다 */
  stageHeight?: number;
}) {
  const [shownFor, setShownFor] = useState<number | null>(null);
  const [current, setCurrent] = useState<{ banner: Banner; key: number }>();
  if (banner && shownFor !== seq) {
    setShownFor(seq);
    setCurrent({ banner, key: seq });
  }
  const key = current?.key;
  useEffect(() => {
    if (key === undefined) return;
    const timer = setTimeout(() => setCurrent(undefined), SHOW_MS);
    return () => clearTimeout(timer);
  }, [key]);
  if (!current) return null;
  const { won, draw, detail } = current.banner;
  const gold = won && !draw;
  return (
    <div
      key={current.key}
      data-result-banner={draw ? "draw" : won ? "win" : "lose"}
      className="result-banner pointer-events-none absolute z-[260] flex -translate-x-1/2 -translate-y-1/2 flex-col items-center whitespace-nowrap rounded-3xl bg-black/60 px-10 py-5 shadow-2xl backdrop-blur-sm"
      style={
        center
          ? {
              left: center.x,
              top: Math.min(center.y, (stageHeight ?? Infinity) * 0.42),
            }
          : { left: "50%", top: "50%" }
      }
    >
      <span
        className={cn(
          "font-black text-[clamp(3.5rem,16vmin,8rem)] leading-none tracking-tight",
          gold
            ? "bg-gradient-to-b from-amber-100 via-amber-300 to-amber-500 bg-clip-text text-transparent drop-shadow-[0_0_24px_rgba(251,191,36,0.55)]"
            : "text-slate-200 drop-shadow-[0_4px_16px_rgba(0,0,0,0.7)]",
        )}
      >
        {draw ? "비김" : won ? "승리!" : "패배"}
      </span>
      {detail && (
        <span
          className={cn(
            "mt-2 rounded-full px-4 py-1 font-bold text-lg shadow-xl",
            gold ? "bg-amber-400 text-amber-950" : "bg-black/70 text-slate-100",
          )}
        >
          {detail}
        </span>
      )}
    </div>
  );
}
