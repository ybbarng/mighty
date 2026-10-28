"use client";

import type { Action, NyrongppongState } from "@mighty/nyrongppong-engine";
import { handValue } from "@mighty/nyrongppong-engine";
import { useEffect, useMemo, useRef, useState } from "react";

import { HwatuCardView } from "@/hwatu/components/HwatuCard";
import { cn } from "@/lib/cn";
import type { GameArchive } from "@/review/archive";
import { VERDICT_LABEL } from "@/review/commentary";
import { replayArchive } from "@/review/replay";

import { describeAction, explainNyrongppong, nyrongppongKit } from "../kit";
import { endText } from "./NyrongppongGame";

/** 자동 재생에서 한 걸음 사이 시간 */
const PLAY_MS = 900;

/**
 * 나이롱뽕 다시 보기: 남긴 기록을 처음부터 다시 해 보며 한 걸음씩 앞뒤로 움직인다.
 * 지난 게임이라 모든 손패를 펼쳐 보인다. 다음 걸음은 고수의 판단과 견준 해설을 붙인다. ←·→ 키로도 움직인다
 */
export function NyrongppongReplay({
  archive,
  name,
}: {
  archive: GameArchive;
  name: (seat: number) => string;
}) {
  const replayed = useMemo(
    () => replayArchive(nyrongppongKit, archive),
    [archive],
  );
  const states = replayed.states as NyrongppongState[];
  const last = states.length - 1;
  const [index, setIndex] = useState(last);
  const [playing, setPlaying] = useState(false);
  const state = states[index] as NyrongppongState;
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

  const [explained, setExplained] = useState<{
    index: number;
    commentary: ReturnType<typeof explainNyrongppong>;
  } | null>(null);
  useEffect(() => {
    if (!next) return;
    const timer = setTimeout(
      () =>
        setExplained({
          index,
          commentary: explainNyrongppong(
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
  const top = state.pile.at(-1);

  return (
    <section className="flex flex-col gap-3">
      <ul className="flex flex-col gap-1.5">
        {state.hands.map((hand, seat) => (
          <li
            // biome-ignore lint/suspicious/noArrayIndexKey: 자리 번호가 곧 정체다
            key={seat}
            data-replay-seat={seat}
            className={cn(
              "flex flex-wrap items-center gap-2 rounded-xl px-2 py-1.5",
              state.turn === seat &&
                (state.phase === "discard" || state.phase === "draw")
                ? "bg-amber-300/15"
                : "bg-white/5",
            )}
          >
            <span className="w-20 shrink-0 truncate text-sm">
              {name(seat)}
              {state.dealer === seat ? " (선)" : ""}
            </span>
            <span className="flex gap-0.5">
              {hand.map((id) => (
                <HwatuCardView key={id} id={id} width={26} />
              ))}
            </span>
            {(state.melds[seat] ?? []).map((meld) => (
              <span key={meld[0]} className="flex -space-x-2 opacity-80">
                {meld.map((id) => (
                  <HwatuCardView key={id} id={id} width={18} />
                ))}
              </span>
            ))}
            <span className="ml-auto text-white/70 text-xs tabular-nums">
              손 {handValue(hand)} · 합계 {state.totals[seat] ?? 0}
            </span>
          </li>
        ))}
      </ul>
      <div className="flex items-center justify-center gap-3 text-white/70 text-xs">
        더미 {state.deck.length}장 · 버린 패
        {top ? <HwatuCardView id={top} width={30} /> : " 없음"}
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
      <p role="status" className="text-center text-sm text-white/80">
        {state.roundNumber}판 · {index}/{last}
        {next
          ? ` · 다음: ${name(next.seat)} ${describeAction(next.action as Action)}`
          : ""}
        {state.result
          ? ` · ${endText(state.result, name, state.rules.bagaji)}`
          : ""}
      </p>
      {commentary && (commentary.verdict || commentary.reasons.length > 0) && (
        <div className="rounded-xl bg-white/5 p-3 text-sm">
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
