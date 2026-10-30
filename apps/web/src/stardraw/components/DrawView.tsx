"use client";

import { type Clock, realClock } from "@mighty/fair-play";
import type { RoundRecord, Ticket } from "@mighty/stardraw-core";
import { useEffect, useMemo, useRef, useState } from "react";

import { play } from "@/game/sound";
import { cn } from "@/lib/cn";

import { drawOrder, myRank } from "../results";
import { planRoulette, type RouletteFrame, rouletteAt } from "../roulette";
import { starOf } from "../sky";
import { LottoBall, RANK_LABEL } from "./parts";
import { SkyBoard } from "./SkyBoard";

/** 틱 소리 사이 가장 짧은 간격(빨리 돌 때 소리가 뭉개지지 않게) */
const TICK_GAP_MS = 45;

/**
 * 추첨 연출(룰렛): 하늘의 빛을 모두 끄고, 불빛이 별 하나씩 켰다 끄며 돌다가 점점 느려져
 * 정확히 당첨 별에서 멈춘다(그 별은 켜진 채). 이미 뽑힌 별은 건너뛰고 6번 멈춘 뒤 7번째는 보너스(하늘빛).
 * 멈추는 차례는 실제 로또처럼 나온 차례다. 결과는 기록의 drand 값으로 이미 정해져 있고 연출은 보여 줄 뿐이다.
 * 칸 위치는 지난 시간으로 계산해(`rouletteAt`) 화면이 늦게 그려져도 늘 목표 별에서 멈춘다.
 * 「결과 바로 보기」와 움직임 줄이기 설정은 곧바로 마지막 모습이다.
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
  // 회차가 바뀔 때만 다시 계산한다(order는 record에서 정해진다)
  // biome-ignore lint/correctness/useExhaustiveDependencies: record.round로 충분하다
  const plan = useMemo(() => planRoulette(order), [record.round]);
  const finished: RouletteFrame = {
    fixed: order,
    cursor: null,
    stop: order.length - 1,
    step: 0,
    done: true,
  };
  const [frame, setFrame] = useState<RouletteFrame>(() =>
    order.length === 0 ? finished : rouletteAt(plan, 0),
  );
  /** 진행을 멈추는 함수(「결과 바로 보기」로 부른다) */
  const stopRef = useRef<() => void>(() => {});
  const done = frame.done;
  const rank = ticket ? myRank(record, ticket) : null;

  // biome-ignore lint/correctness/useExhaustiveDependencies: 회차가 바뀔 때만 다시 돈다
  useEffect(() => {
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce || order.length === 0) {
      setFrame(finished);
      return;
    }
    const started = clock.now();
    let raf = 0;
    let alive = true;
    let last = rouletteAt(plan, 0);
    let lastTick = -Infinity;
    const tick = () => {
      if (!alive) return;
      const now = clock.now();
      const next = rouletteAt(plan, now - started);
      // 칸이 바뀌면 "틱", 멈춰 별이 켜지면 "딩"
      if (next.fixed.length > last.fixed.length) play("starBall");
      else if (
        next.cursor !== null &&
        next.cursor !== last.cursor &&
        now - lastTick >= TICK_GAP_MS
      ) {
        play("starTick");
        lastTick = now;
      }
      if (
        next.cursor !== last.cursor ||
        next.fixed.length !== last.fixed.length
      )
        setFrame(next);
      last = next;
      if (!next.done) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    stopRef.current = () => {
      alive = false;
      cancelAnimationFrame(raf);
      setFrame(finished);
    };
    return () => {
      alive = false;
      cancelAnimationFrame(raf);
    };
  }, [record.round, clock]);

  useEffect(() => {
    if (done && rank && order.length > 0) play("starWin");
  }, [done, rank, order.length]);

  const main = frame.fixed.slice(0, 6);
  const bonus = frame.fixed.length >= 7 ? (frame.fixed[6] ?? null) : null;
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
          onClick={() => stopRef.current()}
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
          <SkyBoard
            state={{
              mode: "draw",
              picked: mine,
              focus: null,
              lit: main,
              bonus,
              cursor: frame.cursor,
            }}
            clock={clock}
            label={`추첨 하늘: 켜진 별 ${main.map((n) => starOf(n).ko).join(", ")}`}
          />

          <div
            className="flex items-center justify-center gap-1.5 sm:gap-2"
            role="status"
            aria-label={`당첨 번호 ${main.join(", ")}${bonus ? `, 보너스 ${bonus}` : ""}`}
            data-roulette-stop={frame.fixed.length}
          >
            {[0, 1, 2, 3, 4, 5].map((i) => {
              const n = main[i];
              return n !== undefined ? (
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

          <p className="-mt-2 flex flex-wrap justify-center gap-x-4 gap-y-1 text-white/65 text-xs">
            <span className="flex items-center gap-1.5">
              <span className="size-3 rounded-full border-2 border-amber-200" />
              당첨 번호
            </span>
            <span className="flex items-center gap-1.5">
              <span className="size-3 rounded-full border-2 border-sky-300 border-dashed" />
              보너스
            </span>
            {mine.length > 0 && (
              <>
                <span className="flex items-center gap-1.5">
                  <span className="size-3 rounded-full border-2 border-sky-300" />
                  내 별
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="size-3 rounded-full border-2 border-emerald-300" />
                  맞은 별
                </span>
              </>
            )}
          </p>

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
