"use client";

import { type Clock, realClock } from "@mighty/fair-play";
import { useEffect, useRef } from "react";

import { cn } from "@/lib/cn";

import { SKY_STARS } from "../sky";
import { drawSky, FAINT_STARS, type SkyState, starAt } from "../sky-draw";
import { type SkyEffects, startSkyEffects } from "../sky-effects";

/**
 * 네모 하늘 하나(응모·영수증·추첨이 같이 쓴다). 크기·누르기·강조만 다르다.
 * 반짝임·유성은 움직임 줄이기 설정이 아니고 응모 하늘일 때만 돈다(영수증은 고요하게, 추첨은 하늘의 빛을 끈다).
 * 탭이 안 보이면 멈춘다.
 */
export function SkyBoard({
  state,
  onPick,
  label,
  className,
  clock = realClock,
}: {
  state: SkyState;
  /** 응모: 별을 누르면 그 번호 */
  onPick?: ((n: number) => void) | undefined;
  label: string;
  className?: string | undefined;
  clock?: Clock | undefined;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stateRef = useRef(state);
  stateRef.current = state;
  const effectsRef = useRef<SkyEffects | null>(null);
  const prevPicked = useRef<readonly number[]>(state.picked);
  /** 움직임이 없을 때(영수증, 움직임 줄이기) 상태가 바뀌면 다시 그린다 */
  const repaintRef = useRef<(() => void) | null>(null);

  // 새로 고른 별, 새로 나온 당첨 번호는 곧바로 반짝인다
  useEffect(() => {
    const before = new Set(prevPicked.current);
    for (const n of state.picked)
      if (!before.has(n)) effectsRef.current?.flash("star", n);
    prevPicked.current = state.picked;
  }, [state.picked]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const g = canvas.getContext("2d");
    if (!g) return;
    let width = 0;
    let raf = 0;
    const reduce =
      typeof matchMedia === "function" &&
      matchMedia("(prefers-reduced-motion: reduce)").matches;
    const animate = !reduce && stateRef.current.mode === "pick";

    const resize = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      width = canvas.clientWidth;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(width * dpr);
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    const paint = () => {
      if (!width) return;
      try {
        drawSky(g, {
          width,
          state: stateRef.current,
          now: clock.now(),
          twinkles: effectsRef.current?.twinkles() ?? [],
          meteor: effectsRef.current?.meteor() ?? null,
        });
      } catch (err) {
        // 한 장면에서 오류가 나도 다음 장면은 그린다
        console.error(err);
      }
    };
    const frame = () => {
      paint();
      raf = document.hidden ? 0 : requestAnimationFrame(frame);
    };
    const start = () => {
      if (!animate || effectsRef.current) return;
      effectsRef.current = startSkyEffects({
        clock,
        stars: SKY_STARS.length,
        faints: FAINT_STARS.length,
      });
      if (!raf) raf = requestAnimationFrame(frame);
    };
    const stop = () => {
      effectsRef.current?.stop();
      effectsRef.current = null;
      cancelAnimationFrame(raf);
      raf = 0;
    };
    const onVisibility = () => {
      if (document.hidden) stop();
      else start();
      paint();
    };

    resize();
    paint();
    const observer = new ResizeObserver(() => {
      resize();
      paint();
    });
    observer.observe(canvas);
    document.addEventListener("visibilitychange", onVisibility);
    if (!document.hidden) start();
    repaintRef.current = paint;
    return () => {
      stop();
      observer.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      repaintRef.current = null;
    };
  }, [clock]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: 상태가 바뀔 때마다 다시 그린다
  useEffect(() => {
    repaintRef.current?.();
  }, [state]);

  return (
    <canvas
      ref={canvasRef}
      role="img"
      aria-label={label}
      data-sky={state.mode}
      className={cn(
        "block aspect-square w-full max-w-full rounded-xl border border-white/10 bg-[#070d19]",
        onPick && "cursor-pointer touch-manipulation",
        className,
      )}
      onClick={(e) => {
        if (!onPick) return;
        const rect = e.currentTarget.getBoundingClientRect();
        const n = starAt(
          e.clientX - rect.left,
          e.clientY - rect.top,
          rect.width,
        );
        if (n !== null) onPick(n);
      }}
    />
  );
}
