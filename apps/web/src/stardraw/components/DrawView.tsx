"use client";

import { type Clock, realClock } from "@mighty/fair-play";
import type { RoundRecord, Ticket } from "@mighty/stardraw-core";
import { useEffect, useMemo, useRef, useState } from "react";

import { play } from "@/game/sound";
import { cn } from "@/lib/cn";

import { celebrationPlan } from "../celebrate";
import { drawGlows } from "../hdr-glow";
import { drawOrder, myRank } from "../results";
import { planRoulette, type RouletteFrame, rouletteAt } from "../roulette";
import { starOf } from "../sky";
import { SkyCelebration, WinSeal } from "./Celebration";
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
 * HDR 화면이면 켜지는 별이 흰색보다 밝게 한 번 번쩍이고, 결과에서 맞은 내 별이 은은하게 빛난다(hdr-glow.ts).
 */
export function DrawView({
  record,
  ticket,
  onClose,
  clock = realClock,
  instant = false,
  label,
}: {
  record: RoundRecord;
  ticket?: Ticket | undefined;
  onClose: () => void;
  clock?: Clock | undefined;
  /** 연출 없이 결과부터(데모 화면 둘러보기) */
  instant?: boolean | undefined;
  /** 보이는 회차 이름(서버 장부의 "시험 n회"·"정식 n회"). 없으면 "제 n회" */
  label?: string | undefined;
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
    instant || order.length === 0 ? finished : rouletteAt(plan, 0),
  );
  /** 진행을 멈추는 함수(「결과 바로 보기」로 부른다) */
  const stopRef = useRef<() => void>(() => {});
  /** 룰렛 연출을 실제로 보는 중인지(켜지는 별이 HDR로 번쩍인다). 바로 보기·움직임 줄이기면 false */
  const [animated, setAnimated] = useState(false);
  const done = frame.done;
  const rank = ticket ? myRank(record, ticket) : null;

  // biome-ignore lint/correctness/useExhaustiveDependencies: 회차가 바뀔 때만 다시 돈다
  useEffect(() => {
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (instant || reduce || order.length === 0) {
      setAnimated(false);
      setFrame(finished);
      return;
    }
    setAnimated(true);
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
      setAnimated(false);
      setFrame(finished);
    };
    return () => {
      alive = false;
      cancelAnimationFrame(raf);
    };
  }, [record.round, clock]);

  useEffect(() => {
    if (done && rank && order.length > 0 && !instant) play("starWin");
  }, [done, rank, order.length, instant]);

  const main = frame.fixed.slice(0, 6);
  const bonus = frame.fixed.length >= 7 ? (frame.fixed[6] ?? null) : null;
  const mine = ticket?.numbers ?? [];

  // 당첨 축하: 결과가 나오면 맞은 내 별(보너스 포함)로 나만의 별자리, 3등부터 별똥별, 1~3등은 당첨 직인
  // biome-ignore lint/correctness/useExhaustiveDependencies: 결과·응모권이 정해지면 바뀌지 않는다
  const party = useMemo(
    () =>
      done && rank && ticket
        ? celebrationPlan(
            rank,
            ticket.numbers.filter(
              (n) =>
                order.slice(0, 6).includes(n) || (rank === 2 && order[6] === n),
            ),
          )
        : null,
    [done, rank, ticket, record.round],
  );
  /** 움직임 줄이기면 별자리·직인이 바로 보인다(HDR 번쩍임·떨림도 없다) */
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    setReduce(matchMedia("(prefers-reduced-motion: reduce)").matches);
  }, []);
  // 안드로이드: 직인이 찍히는 순간 짧게 떨린다(지원하지 않는 기기는 없는 일로)
  useEffect(() => {
    if (!party || party.sealAt === null || reduce) return;
    return clock.after(party.sealAt + 350, () => {
      try {
        navigator.vibrate?.(party.rank === 1 ? [40, 60, 80] : 40);
      } catch {
        // 떨림을 못 하면 그냥 넘어간다
      }
    });
  }, [party, reduce, clock]);

  return (
    <section
      className="flex flex-col gap-4"
      aria-label={`${label ?? `${record.round}회`} 추첨`}
    >
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={onClose}
          className="text-sm text-white/70 hover:text-white"
        >
          ← 돌아가기
        </button>
        <div className="flex flex-col items-center leading-tight">
          <h2 className="font-bold text-lg tabular-nums">
            {label ?? `제 ${record.round}회`} 추첨
          </h2>
          <span className="text-[11px] text-white/45">
            카노푸스 우주국 정시 추첨
          </span>
        </div>
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
            hdr={drawGlows({
              fixed: frame.fixed,
              mine,
              done,
              animated,
              lights:
                party && !reduce
                  ? party.order.map((n, i) => ({
                      n,
                      at: party.starAt[i] ?? 0,
                    }))
                  : [],
            })}
            overlay={party && <SkyCelebration plan={party} />}
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
              {/* 하늘에서 당첨 별은 고리 없이 금빛으로 번지고, 보너스는 하늘빛으로 번진다 */}
              <span className="flex size-3 items-center justify-center">
                <span className="size-1.5 rounded-full bg-amber-50 shadow-[0_0_5px_3px_rgba(255,224,140,0.85)]" />
              </span>
              당첨 번호
            </span>
            <span className="flex items-center gap-1.5">
              <span className="flex size-3 items-center justify-center">
                <span className="size-1.5 rounded-full bg-sky-50 shadow-[0_0_5px_3px_rgba(140,212,255,0.85)]" />
              </span>
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
                "sd-rise relative flex flex-col items-center gap-1 rounded-2xl border p-4 text-center",
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
                      맞은 별 {mine.filter((n) => main.includes(n)).length}개
                      {rank === 2 ? " + 보너스" : ""}
                    </span>
                    {party?.sealAt != null && <WinSeal at={party.sealAt} />}
                  </>
                ) : (
                  <>
                    <span className="font-bold text-xl">
                      아쉽게도 당첨되지 않았습니다
                    </span>
                    <span className="text-sm text-white/65">
                      맞은 별 {mine.filter((n) => main.includes(n)).length}개
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
