"use client";

import type { PlayerClock, TimeControl } from "@mighty/engine";
import { useEffect, useState } from "react";

import { cn } from "@/lib/cn";

/** 남은 시간을 그리는 데 쓰는 값: 기본 시간이 남았나, 초읽기 몇 초·몇 번 남았나 */
export function clockDisplay(
  clock: PlayerClock,
  control: TimeControl,
  elapsed: number,
): { main: number; byoyomi: number | null; periods: number } {
  const main = clock.main - elapsed;
  if (main > 0) return { main, byoyomi: null, periods: clock.periods };
  const over = -main;
  const lost = Math.floor(over / control.byoyomi);
  const periods = Math.max(0, clock.periods - lost);
  const byoyomi =
    periods === 0 ? 0 : control.byoyomi - (over % control.byoyomi);
  return { main: 0, byoyomi, periods };
}

const twoDigits = (n: number) => String(n).padStart(2, "0");

/**
 * 판 게임 자리 표의 개인 시간(docs/24). 내 차례(`running`)에만 줄어든다.
 * 엔진 상태의 남은 시간을 받은 때부터 이 기기에서 거꾸로 센다(온라인 참가자도 방장이 보낸 값에서 센다)
 */
export function GameClock({
  clock,
  control,
  running,
}: {
  clock: PlayerClock;
  control: TimeControl;
  running: boolean;
}) {
  const [since, setSince] = useState(() => Date.now());
  const [now, setNow] = useState(() => Date.now());
  // 시계 값이 바뀌거나(수가 오감) 차례가 바뀌면 그때부터 다시 센다.
  // biome-ignore lint/correctness/useExhaustiveDependencies: 값이 바뀔 때만 다시 센다
  useEffect(() => {
    const t = Date.now();
    setSince(t);
    setNow(t);
  }, [clock.main, clock.periods, running]);
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [running]);

  const shown = clockDisplay(clock, control, running ? now - since : 0);
  const seconds = Math.ceil(
    (shown.byoyomi === null ? shown.main : shown.byoyomi) / 1000,
  );
  const low =
    running && (shown.byoyomi !== null ? seconds <= 10 : shown.main <= 30_000);
  return (
    <span
      data-clock
      className={cn(
        "rounded-md px-1.5 py-0.5 font-mono text-xs tabular-nums",
        running ? "bg-white/15 text-white" : "bg-black/30 text-white/60",
        low && "animate-pulse bg-rose-600 text-white",
      )}
    >
      {shown.byoyomi === null
        ? `${Math.floor(seconds / 60)}:${twoDigits(seconds % 60)}`
        : `초읽기 ${seconds}초 · ${shown.periods}번`}
    </span>
  );
}
