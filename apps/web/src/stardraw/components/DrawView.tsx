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
 * 이 기기의 첫 추첨은 끝까지 본다. 그 뒤로는 이미 결과가 나온 회차를 나중에 열 때 아래 「추첨 건너뛰기」로 바로 결과(canSkip, 실시간 추첨에는 없다, 2026-10-31 사용자). 이미 본 회차(바깥이 instant로 연다)와 움직임 줄이기 설정은 곧바로 마지막 모습이다.
 * HDR 화면이면 켜지는 별이 흰색보다 밝게 한 번 번쩍이고, 결과에서 맞은 내 별이 은은하게 빛난다(hdr-glow.ts).
 */
export function DrawView({
  record,
  ticket,
  onClose,
  clock = realClock,
  instant = false,
  label,
  onReplay,
  onNext,
  canSkip = false,
  onWatched,
}: {
  /**
   * 연출 중 아래에 작은 「추첨 건너뛰기」(누르면 바로 결과). 이 기기에서 추첨을 끝까지 한 번 본 뒤, 이미 결과가 나온
   * 회차를 나중에 열 때만(실시간으로 기다리다 시작한 추첨에는 두지 않는다, 2026-10-31 사용자)
   */
  canSkip?: boolean | undefined;
  /** 연출을 건너뛰지 않고 끝까지 본 순간 */
  onWatched?: (() => void) | undefined;
  record: RoundRecord;
  ticket?: Ticket | undefined;
  onClose: () => void;
  clock?: Clock | undefined;
  /** 연출 없이 결과부터(데모 화면 둘러보기) */
  instant?: boolean | undefined;
  /** 보이는 회차 이름(서버 장부의 "시험 n회"·"정식 n회"). 없으면 "제 n회" */
  label?: string | undefined;
  /** 결과를 보인 뒤 「다시 보기」(연출을 처음부터). 없으면 단추가 없다 */
  onReplay?: (() => void) | undefined;
  /** 결과를 보인 뒤 다음 회차 응모로(지금 응모할 수 있을 때만 넘긴다) */
  onNext?: (() => void) | undefined;
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
  /** 룰렛 연출을 실제로 보는 중인지(켜지는 별이 HDR로 번쩍인다). 움직임 줄이기면 false */
  const [animated, setAnimated] = useState(false);
  /** 건너뛰었는지(연출을 멈추고 바로 결과, 끝까지 본 것으로 치지 않는다) */
  const skipped = useRef(false);
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
      if (!alive || skipped.current) return;
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
      else onWatched?.();
    };
    raf = requestAnimationFrame(tick);
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
        {/* 제목이 가운데 오게 「돌아가기」만큼 자리를 둔다 */}
        <span aria-hidden="true" className="invisible text-sm">
          ← 돌아가기
        </span>
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
            overlay={party && <SkyCelebration plan={party} bonus={bonus} />}
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
              {/* 하늘에서 당첨 별은 그 별빛 색으로 번지며 빛줄기가 가로세로(＋), 보너스는 대각선(✕)으로 뻗는다 */}
              <span className="flex size-3 items-center justify-center font-bold text-[11px] text-white leading-none [text-shadow:0_0_4px_rgba(255,255,255,0.9)]">
                ＋
              </span>
              당첨 번호
            </span>
            <span className="flex items-center gap-1.5">
              <span className="flex size-3 items-center justify-center font-bold text-[11px] text-white leading-none [text-shadow:0_0_4px_rgba(255,255,255,0.9)]">
                ✕
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
                  {/* 하늘에서 맞은 별은 파란 고리 안의 별이 그 별빛 색으로 빛난다 */}
                  <span className="flex size-3 items-center justify-center rounded-full border-2 border-sky-300">
                    <span className="size-1 rounded-full bg-white shadow-[0_0_4px_2px_rgba(255,255,255,0.8)]" />
                  </span>
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
          {canSkip && animated && !done && (
            <button
              type="button"
              onClick={() => {
                skipped.current = true;
                setFrame(finished);
              }}
              className="self-center rounded-lg px-3 py-1.5 text-sm text-white/55 hover:text-white"
            >
              추첨 건너뛰기
            </button>
          )}
          {done && (onNext || onReplay) && (
            <div className="flex flex-col gap-2">
              {onNext && (
                <button
                  type="button"
                  onClick={onNext}
                  className="sd-cta rounded-2xl py-3 font-bold text-slate-950"
                >
                  다음 회차 응모
                </button>
              )}
              {onReplay && (
                <button
                  type="button"
                  onClick={onReplay}
                  className="rounded-2xl border border-white/20 py-2.5 font-semibold text-sm hover:bg-white/10"
                >
                  추첨 다시 보기
                </button>
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
