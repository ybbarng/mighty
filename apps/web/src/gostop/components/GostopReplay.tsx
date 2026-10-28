"use client";

import {
  type Action,
  describeAction,
  type GostopState,
  scoreCaptured,
  settlementLines,
} from "@mighty/gostop-engine";
import { useEffect, useMemo, useRef, useState } from "react";

import {
  HwatuCaptured,
  HwatuDeck,
  HwatuFloor,
  HwatuHand,
} from "@/hwatu/components/HwatuLayout";
import { cn } from "@/lib/cn";
import type { GameArchive } from "@/review/archive";
import { VERDICT_LABEL } from "@/review/commentary";
import { replayArchive } from "@/review/replay";

import { explainGostop, gostopKit } from "../kit";

/** 자동 재생에서 한 걸음 사이 시간 */
const PLAY_MS = 900;

/**
 * 고스톱 다시 보기: 남긴 기록을 처음부터 다시 돌려 한 걸음씩 앞뒤로 움직인다.
 * 다시 보기는 모든 손패를 펼쳐 보인다. 다음 수는 고수의 판단과 견준 해설을 붙인다. 키보드 ←·→로도 움직인다
 */
export function GostopReplay({
  archive,
  name,
}: {
  archive: GameArchive;
  name: (seat: number) => string;
}) {
  const replayed = useMemo(() => replayArchive(gostopKit, archive), [archive]);
  const states = replayed.states as GostopState[];
  const last = states.length - 1;
  const [index, setIndex] = useState(last);
  const [playing, setPlaying] = useState(false);
  const state = states[index] as GostopState;
  const next = archive.log[index] ?? null;
  const go = (i: number) => setIndex(Math.max(0, Math.min(last, i)));
  const nameRef = useRef(name);
  nameRef.current = name;

  useEffect(() => {
    if (!playing) return;
    if (index >= last) {
      setPlaying(false);
      return;
    }
    const timer = setTimeout(() => setIndex((i) => i + 1), PLAY_MS);
    return () => clearTimeout(timer);
  }, [playing, index, last]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") setIndex((i) => Math.max(0, i - 1));
      if (e.key === "ArrowRight") setIndex((i) => Math.min(last, i + 1));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [last]);

  // 고수 계산이 조금 걸려 그린 뒤에 한다.
  const [explained, setExplained] = useState<{
    index: number;
    commentary: ReturnType<typeof explainGostop>;
  } | null>(null);
  useEffect(() => {
    if (!next || state.phase !== "play") return;
    const timer = setTimeout(
      () =>
        setExplained({
          index,
          commentary: explainGostop(
            state,
            next,
            states[index + 1] ?? null,
            index,
            nameRef.current,
          ),
        }),
      30,
    );
    return () => clearTimeout(timer);
  }, [state, next, states, index]);
  const commentary = explained?.index === index ? explained.commentary : null;
  const seats = Array.from({ length: state.rules.players }, (_, s) => s);

  return (
    <section className="flex flex-col items-center gap-3">
      <div className="flex w-full max-w-xl flex-col gap-2">
        {seats.map((seat) => (
          <div
            key={seat}
            className={cn(
              "flex flex-col gap-1 rounded-xl border px-2 py-1.5",
              state.phase === "play" && state.turn === seat
                ? "border-amber-300 bg-amber-300/10"
                : "border-white/10 bg-white/5",
            )}
          >
            <p className="flex justify-between text-sm">
              <span className="font-semibold">{name(seat)}</span>
              <span className="text-white/70 text-xs tabular-nums">
                {
                  scoreCaptured(state.captured[seat] ?? [], state.rules.gukjin)
                    .total
                }
                점 · 합 {state.scores[seat] ?? 0}
              </span>
            </p>
            <HwatuHand ids={state.hands[seat] ?? []} width={26} />
            <HwatuCaptured
              ids={state.captured[seat] ?? []}
              width={20}
              label={name(seat)}
            />
          </div>
        ))}
        <div className="flex items-center gap-2 rounded-xl bg-black/20 p-2">
          <HwatuDeck count={state.deck.length} width={30} />
          <div className="min-w-0 flex-1">
            <HwatuFloor ids={state.floor} width={34} />
          </div>
        </div>
      </div>
      <div
        role="toolbar"
        aria-label="다시 보기"
        className="flex flex-wrap justify-center gap-1"
      >
        {(
          [
            ["⏮", "처음", () => go(0)],
            ["◀", "한 걸음 뒤로", () => go(index - 1)],
            ["▶", "한 걸음 앞으로", () => go(index + 1)],
            ["⏭", "끝", () => go(last)],
          ] as const
        ).map(([icon, label, onClick]) => (
          <button
            key={label}
            type="button"
            aria-label={label}
            title={label}
            onClick={() => {
              setPlaying(false);
              onClick();
            }}
            className="min-w-10 rounded-lg bg-white/10 px-2 py-1 font-semibold hover:bg-white/20"
          >
            {icon}
          </button>
        ))}
        <button
          type="button"
          onClick={() => {
            if (index >= last) setIndex(0);
            setPlaying((p) => !p);
          }}
          className={cn(
            "rounded-lg px-3 py-1 font-semibold",
            playing ? "bg-amber-300 text-black" : "bg-white/10",
          )}
        >
          {playing ? "⏸ 멈춤" : "자동 재생"}
        </button>
      </div>
      <p role="status" className="text-sm text-white/80">
        {state.roundNumber}판 · {index}/{last}
        {next
          ? ` · 다음: ${name(next.seat)} ${describeAction(next.action as Action)}`
          : ""}
      </p>
      {state.result && state.phase !== "play" && (
        <p className="text-sm text-white/80">
          {state.result.winner === null
            ? "나가리"
            : `${name(state.result.winner)} 승리`}{" "}
          · {settlementLines(state.result).join(", ")}
        </p>
      )}
      {commentary && (
        <div className="w-full max-w-xl rounded-xl bg-white/5 p-3 text-sm">
          <p className="text-white/70">{commentary.situation.join(" · ")}</p>
          {commentary.verdict && (
            <p className="mt-1 font-semibold">
              다음 수: {VERDICT_LABEL[commentary.verdict]}
            </p>
          )}
          <ul className="mt-1 list-inside list-disc text-white/80">
            {commentary.reasons.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        </div>
      )}
      {replayed.error && (
        <p className="text-rose-300 text-xs">{replayed.error}</p>
      )}
    </section>
  );
}
