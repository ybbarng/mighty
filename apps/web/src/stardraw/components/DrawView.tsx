"use client";

import { type Clock, realClock } from "@mighty/fair-play";
import type { RoundRecord, Ticket } from "@mighty/stardraw-core";
import { useEffect, useRef, useState } from "react";

import { play } from "@/game/sound";
import { cn } from "@/lib/cn";

import { drawOrder, myRank } from "../results";
import { ballColor, starOf } from "../sky";
import { LottoBall, RANK_LABEL } from "./parts";
import { SkyBoard } from "./SkyBoard";

/** 추첨 진행(ms): 섞기, 공 사이 간격, 공이 관을 내려오는 시간 */
export const DRAW_MIX_MS = 2200;
export const DRAW_GAP_MS = 1700;
export const DRAW_TUBE_MS = 650;

/**
 * 추첨 연출: 유리 천구의 안 공 45개가 바람에 섞이고, 관으로 하나씩 나와 6개 + 보너스가 놓인다.
 * 공이 나올 때마다 하늘의 그 별이 켜진다. 결과는 기록의 drand 값으로 이미 정해져 있고 연출은 보여 줄 뿐이다.
 */
export function DrawView({
  record,
  ticket,
  onClose,
  clock = realClock,
}: {
  record: RoundRecord;
  ticket?: Ticket | undefined;
  onClose: () => void;
  clock?: Clock | undefined;
}) {
  const order = drawOrder(record);
  const [shown, setShown] = useState(0);
  const [exiting, setExiting] = useState<number | null>(null);
  /** 추첨 진행 타이머(「결과 바로 보기」로 끈다) */
  const timers = useRef<(() => void)[]>([]);
  const done = shown >= order.length;
  const rank = ticket ? myRank(record, ticket) : null;

  // 회차가 바뀔 때만 다시 시작한다(order는 record에서 정해진다)
  // biome-ignore lint/correctness/useExhaustiveDependencies: record.round로 충분하다
  useEffect(() => {
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce || order.length === 0) {
      setShown(order.length);
      return;
    }
    play("starMix");
    const stops: (() => void)[] = [];
    timers.current = stops;
    order.forEach((n, i) => {
      const at = DRAW_MIX_MS + i * DRAW_GAP_MS;
      stops.push(clock.after(at, () => setExiting(n)));
      stops.push(
        clock.after(at + DRAW_TUBE_MS, () => {
          setExiting(null);
          setShown(i + 1);
          play("starBall");
        }),
      );
    });
    return () => {
      for (const s of stops) s();
    };
  }, [record.round, clock]);

  useEffect(() => {
    if (done && rank && order.length > 0) play("starWin");
  }, [done, rank, order.length]);

  const main = order.slice(0, Math.min(shown, 6));
  const bonus = shown >= 7 ? (order[6] ?? null) : null;
  const mine = ticket?.numbers ?? [];

  return (
    <section
      className="flex flex-col gap-4"
      aria-label={`${record.round}회 추첨`}
    >
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={onClose}
          className="text-sm text-white/70 hover:text-white"
        >
          ← 돌아가기
        </button>
        <h2 className="font-bold text-lg tabular-nums">
          제 {record.round}회 추첨
        </h2>
        <button
          type="button"
          disabled={done}
          onClick={() => {
            for (const s of timers.current) s();
            setExiting(null);
            setShown(order.length);
          }}
          className="text-sm text-white/60 hover:text-white disabled:invisible"
        >
          결과 바로 보기
        </button>
      </div>

      {record.void ? (
        <p className="rounded-xl bg-white/5 p-4 text-sm text-white/75">
          이 회차는 응모 목록을 제때 기록하지 못해 무효가 되었습니다. 당첨 없이
          끝났습니다.
        </p>
      ) : (
        <>
          <Globe
            order={order}
            taken={order.slice(0, shown)}
            exiting={exiting}
            mixing={!done}
          />

          <div
            className="flex items-center justify-center gap-1.5 sm:gap-2"
            role="status"
            aria-label={`당첨 번호 ${main.join(", ")}${bonus ? `, 보너스 ${bonus}` : ""}`}
          >
            {[0, 1, 2, 3, 4, 5].map((i) => {
              const n = order[i];
              return n !== undefined && i < shown ? (
                <LottoBall
                  key={n}
                  n={n}
                  ring={mine.includes(n)}
                  className="sd-drop"
                />
              ) : (
                <Slot key={`s${i}`} />
              );
            })}
            <span className="px-0.5 text-white/50">+</span>
            {bonus ? (
              <LottoBall
                n={bonus}
                ring={mine.includes(bonus)}
                className="sd-drop"
              />
            ) : (
              <Slot dashed />
            )}
          </div>

          <SkyBoard
            state={{
              mode: "draw",
              picked: mine,
              focus: null,
              lit: main,
              bonus,
            }}
            label={`추첨 하늘: 켜진 별 ${main.map((n) => starOf(n).ko).join(", ")}`}
          />

          {done && (
            <div
              className={cn(
                "sd-rise flex flex-col items-center gap-1 rounded-2xl border p-4 text-center",
                rank
                  ? "border-amber-200/50 bg-amber-200/10"
                  : "border-white/10 bg-white/5",
                rank === 1 && "sd-glory",
              )}
              data-draw-result={rank ?? "none"}
            >
              {ticket ? (
                rank ? (
                  <>
                    <span className="font-black text-3xl text-amber-100">
                      {RANK_LABEL[rank]} 당첨
                    </span>
                    <span className="text-sm text-white/75">
                      내 별 {mine.filter((n) => main.includes(n)).length}개가
                      당첨 번호와 같습니다
                      {rank === 2 ? "(보너스까지)" : ""}
                    </span>
                  </>
                ) : (
                  <>
                    <span className="font-bold text-xl">
                      아쉽게도 당첨되지 않았습니다
                    </span>
                    <span className="text-sm text-white/65">
                      맞은 별 {mine.filter((n) => main.includes(n)).length}개.
                      로또 1등은 맨눈 별 하나 맞히기보다 약 900배 어렵습니다
                    </span>
                  </>
                )
              ) : (
                <span className="text-sm text-white/75">
                  이 회차에는 응모하지 않았습니다
                </span>
              )}
            </div>
          )}
        </>
      )}
    </section>
  );
}

function Slot({ dashed = false }: { dashed?: boolean }) {
  return (
    <span
      className={cn(
        "size-9 rounded-full border border-white/20",
        dashed && "border-dashed",
      )}
    />
  );
}

interface Ball {
  n: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
}

/** 유리 천구의: 공이 바람에 날리고 부딪힌다. 나온 공은 관을 따라 내려간다 */
function Globe({
  order,
  taken,
  exiting,
  mixing,
}: {
  order: readonly number[];
  taken: readonly number[];
  exiting: number | null;
  mixing: boolean;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const takenRef = useRef(taken);
  takenRef.current = taken;
  const exitRef = useRef<{ n: number; start: number } | null>(null);
  const mixingRef = useRef(mixing);
  mixingRef.current = mixing;

  useEffect(() => {
    exitRef.current =
      exiting === null ? null : { n: exiting, start: performance.now() };
  }, [exiting]);

  useEffect(() => {
    const canvas = ref.current;
    const g = canvas?.getContext("2d");
    if (!canvas || !g) return;
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    // 단위 좌표: 구 가운데(0.5, 0.45), 반지름 0.36
    const C = { x: 0.5, y: 0.45, r: 0.36 };
    const R = 0.032;
    const balls: Ball[] = Array.from({ length: 45 }, (_, i) => {
      const a = (i / 45) * Math.PI * 2;
      const d = 0.08 + ((i * 37) % 23) / 100;
      return {
        n: i + 1,
        x: C.x + Math.cos(a) * d,
        y: C.y + 0.12 + Math.sin(a) * d * 0.5,
        vx: 0,
        vy: 0,
      };
    });
    let raf = 0;
    let last = performance.now();
    const step = (dt: number) => {
      const gone = new Set(takenRef.current);
      const exit = exitRef.current?.n;
      const live = balls.filter((b) => !gone.has(b.n) && b.n !== exit);
      for (const b of live) {
        b.vy += 0.9 * dt; // 중력
        if (mixingRef.current && b.y > C.y + 0.05) {
          // 아래에서 부는 바람: 위로 세게, 옆으로 흔들리게(가끔 세찬 돌풍)
          const gust = Math.random() < 0.04 ? 6 : 1;
          b.vy -= (2.4 + Math.random() * 3.4) * gust * dt;
          b.vx += (Math.random() - 0.5) * 6 * gust * dt;
        } else if (mixingRef.current) {
          // 위쪽에서도 소용돌이처럼 흩어진다
          b.vx += (Math.random() - 0.5) * 2.4 * dt;
        }
        b.vx *= 0.995;
        b.vy *= 0.995;
        b.x += b.vx * dt;
        b.y += b.vy * dt;
        const dx = b.x - C.x;
        const dy = b.y - C.y;
        const d = Math.hypot(dx, dy);
        const max = C.r - R;
        if (d > max) {
          const nx = dx / d;
          const ny = dy / d;
          b.x = C.x + nx * max;
          b.y = C.y + ny * max;
          const dot = b.vx * nx + b.vy * ny;
          b.vx -= 1.8 * dot * nx;
          b.vy -= 1.8 * dot * ny;
        }
      }
      // 공끼리 겹치지 않게 살짝 밀어낸다
      for (let i = 0; i < live.length; i++)
        for (let j = i + 1; j < live.length; j++) {
          const a = live[i] as Ball;
          const b = live[j] as Ball;
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const d = Math.hypot(dx, dy) || 1e-6;
          if (d < 2 * R) {
            const push = (2 * R - d) / 2;
            a.x -= (dx / d) * push;
            a.y -= (dy / d) * push;
            b.x += (dx / d) * push;
            b.y += (dy / d) * push;
            const rv = (b.vx - a.vx) * (dx / d) + (b.vy - a.vy) * (dy / d);
            if (rv < 0) {
              a.vx += (rv * dx) / d;
              a.vy += (rv * dy) / d;
              b.vx -= (rv * dx) / d;
              b.vy -= (rv * dy) / d;
            }
          }
        }
      return live;
    };
    const ballAt = (b: { n: number; x: number; y: number }, W: number) => {
      const x = b.x * W;
      const y = b.y * W;
      const r = R * W;
      const grad = g.createRadialGradient(
        x - r * 0.35,
        y - r * 0.4,
        r * 0.1,
        x,
        y,
        r,
      );
      grad.addColorStop(0, "#ffffff");
      grad.addColorStop(0.35, ballColor(b.n));
      grad.addColorStop(1, "#00000088");
      g.fillStyle = grad;
      g.beginPath();
      g.arc(x, y, r, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = "#111";
      g.font = `700 ${Math.round(r * 0.95)}px ui-monospace, Menlo, monospace`;
      g.textAlign = "center";
      g.textBaseline = "middle";
      g.fillText(String(b.n), x, y + 0.5);
    };
    const draw = (now: number) => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const W = canvas.clientWidth;
      if (canvas.width !== Math.round(W * dpr)) {
        canvas.width = Math.round(W * dpr);
        canvas.height = Math.round(W * 0.82 * dpr);
      }
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      const dt = Math.min(0.033, (now - last) / 1000);
      last = now;
      const live = reduce ? balls : step(dt);
      g.clearRect(0, 0, W, W);
      // 받침과 관
      g.fillStyle = "rgba(148,163,184,0.25)";
      g.fillRect((C.x - 0.03) * W, (C.y + C.r - 0.01) * W, 0.06 * W, 0.18 * W);
      g.fillStyle = "rgba(30,41,59,0.9)";
      g.beginPath();
      g.ellipse(
        C.x * W,
        (C.y + C.r + 0.02) * W,
        0.16 * W,
        0.03 * W,
        0,
        0,
        Math.PI * 2,
      );
      g.fill();
      // 유리 구: 안쪽 빛과 테두리, 별자리판처럼 흐린 적도선
      const glass = g.createRadialGradient(
        (C.x - 0.12) * W,
        (C.y - 0.14) * W,
        0.02 * W,
        C.x * W,
        C.y * W,
        C.r * W,
      );
      glass.addColorStop(0, "rgba(186,214,255,0.22)");
      glass.addColorStop(0.7, "rgba(96,125,190,0.08)");
      glass.addColorStop(1, "rgba(160,190,255,0.25)");
      g.fillStyle = glass;
      g.beginPath();
      g.arc(C.x * W, C.y * W, C.r * W, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = "rgba(190,210,255,0.35)";
      g.lineWidth = 0.8;
      g.beginPath();
      g.ellipse(C.x * W, C.y * W, C.r * W, C.r * W * 0.28, 0, 0, Math.PI * 2);
      g.stroke();
      g.beginPath();
      g.ellipse(C.x * W, C.y * W, C.r * W * 0.28, C.r * W, 0, 0, Math.PI * 2);
      g.stroke();
      for (const b of live) ballAt(b, W);
      // 나오는 공: 구 아래 구멍에서 관을 따라 내려간다
      const exit = exitRef.current;
      if (exit) {
        const t = Math.min(1, (now - exit.start) / DRAW_TUBE_MS);
        ballAt({ n: exit.n, x: C.x, y: C.y + C.r - R + t * 0.2 }, W);
      }
      // 유리 반사
      g.strokeStyle = "rgba(255,255,255,0.35)";
      g.lineWidth = 2;
      g.beginPath();
      g.arc(C.x * W, C.y * W, C.r * W * 0.9, Math.PI * 1.1, Math.PI * 1.4);
      g.stroke();
      g.strokeStyle = "rgba(200,220,255,0.6)";
      g.lineWidth = 1.2;
      g.beginPath();
      g.arc(C.x * W, C.y * W, C.r * W, 0, Math.PI * 2);
      g.stroke();
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <canvas
      ref={ref}
      role="img"
      aria-label={`추첨기: 남은 공 ${order.length - taken.length}개`}
      data-globe={order.length - taken.length}
      className="mx-auto block aspect-[1/0.82] w-full max-w-sm"
    />
  );
}
