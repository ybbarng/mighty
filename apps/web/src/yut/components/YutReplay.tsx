"use client";

import { type GameResult, viewOf, type YutState } from "@mighty/yut-engine";
import { useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import type { GameArchive } from "@/review/archive";
import { VERDICT_LABEL } from "@/review/commentary";
import { replayArchive } from "@/review/replay";

import { explainYut, yutKit } from "../kit";
import { PendingChips, SideTray, sideLabel, YutSticks } from "./parts";
import { YutBoard } from "./YutBoard";

/** 자동 재생에서 한 걸음 사이 시간 */
const PLAY_MS = 700;

/**
 * 윷놀이 다시 보기: 남긴 기록을 처음부터 다시 둬 보며 한 걸음씩 앞뒤로 움직인다.
 * 던지기 결과는 기록 속 고리 공개로 다시 계산되고, 말 움직임마다 고수가 본 기댓값과 견준 해설을 붙인다.
 * 키보드 ←·→로도 움직인다
 */
export function YutReplay({
  archive,
  name,
}: {
  archive: GameArchive;
  name: (seat: number) => string;
}) {
  const replayed = useMemo(() => replayArchive(yutKit, archive), [archive]);
  const states = replayed.states as YutState[];
  const last = states.length - 1;
  const [index, setIndex] = useState(last);
  const [playing, setPlaying] = useState(false);
  const state = states[index] as YutState;
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

  // 고수 계산이 조금 걸려 그린 뒤에 한다(어느 걸음의 해설인지 함께 둔다).
  const [explained, setExplained] = useState<{
    index: number;
    commentary: ReturnType<typeof explainYut>;
  } | null>(null);
  useEffect(() => {
    if (!next) return;
    const timer = setTimeout(
      () =>
        setExplained({
          index,
          commentary: explainYut(
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

  const view = viewOf(state, archive.seat);
  const result: GameResult | null = state.result;
  const resultText =
    state.phase !== "gameOver"
      ? null
      : result === null || result.side === null
        ? "이긴 편 없음"
        : `${sideLabel(view, result.side, name)} 승리(${
            result.kind === "finish"
              ? "말을 모두 냄"
              : result.kind === "resign"
                ? "기권"
                : result.kind === "time"
                  ? "시간패"
                  : "공개하지 않음"
          })`;

  return (
    <section className="flex flex-col items-center gap-3">
      <div className="grid w-full max-w-3xl gap-3 sm:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
        <YutBoard view={view} events={[]} movable={new Map()} preview={null} />
        <div className="flex flex-col items-center gap-2">
          <YutSticks
            sticks={state.lastThrow?.sticks ?? null}
            value={state.lastThrow?.value ?? null}
            throwKey={0}
            tossing={state.phase === "reveal"}
          />
          <PendingChips
            values={state.pending}
            selected={null}
            usable={new Set()}
          />
          <SideTray
            view={view}
            name={name}
            turnSide={state.rules.mode === "team" ? state.turn % 2 : state.turn}
          />
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
      <p role="status" className="text-sm text-white/80">
        던지기 {state.throwCount}번 · {index}/{last}
        {resultText ? ` · ${resultText}` : ""}
      </p>
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
