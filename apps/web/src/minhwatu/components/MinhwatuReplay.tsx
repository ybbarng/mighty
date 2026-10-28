"use client";

import type { Action, MinhwatuState } from "@mighty/minhwatu-engine";
import { sumPoints, YAK_NAMES, yaksOf } from "@mighty/minhwatu-engine";
import { useEffect, useMemo, useRef, useState } from "react";
import { botName } from "@/game/bot-names";
import { useSettings } from "@/game/settings";
import {
  HwatuCaptured,
  HwatuFloor,
  HwatuHand,
} from "@/hwatu/components/HwatuLayout";
import { cn } from "@/lib/cn";
import type { GameArchive } from "@/review/archive";
import { VERDICT_LABEL } from "@/review/commentary";
import { replayArchive } from "@/review/replay";

import { describeAction, explainMinhwatu, minhwatuKit } from "../kit";
import { ScoreTable } from "./MinhwatuTable";

/** 자동 재생에서 한 걸음 사이 시간 */
const PLAY_MS = 900;

/**
 * 민화투 다시 보기: 남긴 기록을 처음부터 다시 돌려 한 걸음씩 앞뒤로 움직인다.
 * 끝난 게임이라 모든 자리의 손패를 펼쳐 보인다. 다음 수는 고수의 판단과 견준 해설을 붙인다. ←·→ 키로도 움직인다
 */
export function MinhwatuReplay({
  archive,
  name: baseName,
}: {
  archive: GameArchive;
  name: (seat: number) => string;
}) {
  // 혼자 한 게임은 자리 이름이 없어 게임 화면처럼 컴퓨터 이름을 붙인다.
  const botNames = useSettings((s) => s.botNames);
  const name = (seat: number) =>
    archive.seatNames || seat === archive.seat
      ? baseName(seat)
      : botName(botNames, seat);
  const replayed = useMemo(
    () => replayArchive(minhwatuKit, archive),
    [archive],
  );
  const states = replayed.states as MinhwatuState[];
  const last = states.length - 1;
  const [index, setIndex] = useState(last);
  const [playing, setPlaying] = useState(false);
  const state = states[index] as MinhwatuState;
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
    commentary: ReturnType<typeof explainMinhwatu>;
  } | null>(null);
  useEffect(() => {
    if (!next) return;
    const timer = setTimeout(
      () =>
        setExplained({
          index,
          commentary: explainMinhwatu(
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
  const n = state.hands.length;

  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-col gap-2">
        {Array.from({ length: n }, (_, seat) => {
          const ids = state.captured[seat] ?? [];
          const yaks = yaksOf(ids, state.rules);
          return (
            <div
              // biome-ignore lint/suspicious/noArrayIndexKey: 자리 번호가 곧 정체다
              key={seat}
              data-replay-seat={seat}
              className={cn(
                "flex flex-col gap-1 rounded-xl border px-2 py-1.5",
                state.turn === seat &&
                  (state.phase === "play" || state.phase === "pick")
                  ? "border-amber-300 bg-amber-300/10"
                  : "border-white/10 bg-white/5",
              )}
            >
              <div className="flex items-center gap-2 text-sm">
                <span className="font-semibold">{name(seat)}</span>
                <span className="text-white/60 text-xs">
                  {sumPoints(ids)}점
                  {yaks.length > 0 &&
                    ` · ${yaks.map((y) => YAK_NAMES[y.id]).join("·")}`}
                </span>
              </div>
              <HwatuHand ids={state.hands[seat] ?? []} width={30} />
              <HwatuCaptured ids={ids} width={18} label={name(seat)} />
            </div>
          );
        })}
      </div>
      <div className="rounded-2xl bg-[#14532d] p-2">
        <HwatuFloor ids={state.floor} width={36} />
        <p className="mt-1 text-center text-white/60 text-xs">
          더미 {state.deck.length}장
        </p>
      </div>
      <div
        role="toolbar"
        aria-label="다시 보기"
        className="flex flex-wrap justify-center gap-1"
      >
        {(
          [
            ["⏮", "처음", () => go(0)],
            ["◀", "한 수 뒤로", () => go(index - 1)],
            ["▶", "한 수 앞으로", () => go(index + 1)],
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
      </p>
      {state.result && (
        <ScoreTable result={state.result} totals={state.totals} name={name} />
      )}
      {commentary && (
        <div className="w-full rounded-xl bg-white/5 p-3 text-sm">
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
