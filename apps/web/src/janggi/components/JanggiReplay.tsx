"use client";

import {
  type JanggiState,
  SIDE_NAMES,
  sideOfSeat,
} from "@mighty/janggi-engine";
import { useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import type { GameArchive } from "@/review/archive";
import { VERDICT_LABEL } from "@/review/commentary";
import { replayArchive } from "@/review/replay";

import { explainJanggi, janggiKit } from "../kit";
import { useJanggiSettings } from "../settings";
import { JanggiBoard, SIDE_COLOR } from "./JanggiBoard";

/** 자동 재생에서 한 수 사이 시간 */
const PLAY_MS = 900;

/**
 * 장기 다시 보기: 남긴 기록을 처음부터 다시 둬 보며 한 수씩 앞뒤로 움직인다.
 * 다음 수는 고수의 판단과 견준 해설을 붙인다. 키보드 ←·→로도 움직인다. 판은 내 편이 아래다
 */
export function JanggiReplay({
  archive,
  name,
}: {
  archive: GameArchive;
  name: (seat: number) => string;
}) {
  const labels = useJanggiSettings((s) => s.labels);
  const replayed = useMemo(() => replayArchive(janggiKit, archive), [archive]);
  const states = replayed.states as JanggiState[];
  const last = states.length - 1;
  const [index, setIndex] = useState(last);
  const [playing, setPlaying] = useState(false);
  const state = states[index] as JanggiState;
  const next = archive.log[index] ?? null;
  const go = (i: number) => setIndex(Math.max(0, Math.min(last, i)));
  // 이름 함수는 그릴 때마다 새로 오므로 해설 계산을 다시 부르지 않게 참조로 둔다.
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
  // 어느 걸음의 해설인지 함께 두어, 걸음을 옮긴 직후 앞 걸음 해설이 비치지 않게 한다.
  const [explained, setExplained] = useState<{
    index: number;
    commentary: ReturnType<typeof explainJanggi>;
  } | null>(null);
  useEffect(() => {
    if (!next || state.phase !== "play") return;
    const timer = setTimeout(
      () =>
        setExplained({
          index,
          commentary: explainJanggi(
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

  const mySide = sideOfSeat(state, archive.seat);
  const lastPlayed = state.played.at(-1);
  const result = state.result;
  const resultText =
    result === null
      ? null
      : `${name(result.seat)} 승리(${result.kind === "checkmate" ? "외통" : result.kind === "resign" ? "기권" : "점수"})`;

  return (
    <section className="flex flex-col items-center gap-3">
      <div className="flex w-full max-w-xl items-center justify-between gap-2 text-sm">
        {[0, 1].map((seat) => {
          const side = sideOfSeat(state, seat);
          return (
            <span key={seat} className="flex items-center gap-2">
              <span className="font-bold" style={{ color: SIDE_COLOR[side] }}>
                {SIDE_NAMES[side]}
              </span>
              {name(seat)} {state.wins[seat] ?? 0}승
            </span>
          );
        })}
      </div>
      <div className="aspect-[924/1024] w-[min(100%,calc((100dvh-20rem)*0.9))] max-w-xl">
        <JanggiBoard
          board={state.board}
          flipped={mySide === "h"}
          legal={[]}
          selected={null}
          onSelect={() => {}}
          onMove={() => {}}
          lastMove={lastPlayed && "from" in lastPlayed ? lastPlayed : null}
          checkedKing={null}
          labels={labels}
        />
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
        {state.roundNumber}판 · {state.played.length}수 · {index}/{last}
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
