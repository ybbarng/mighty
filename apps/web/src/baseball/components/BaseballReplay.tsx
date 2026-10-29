"use client";

import type { BaseballState } from "@mighty/baseball-engine";
import { useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import type { GameArchive } from "@/review/archive";
import { VERDICT_LABEL } from "@/review/commentary";
import { replayArchive } from "@/review/replay";

import { baseballKit, explainBaseball } from "../kit";
import { GuessLog, NumberBoxes } from "./parts";

/** 자동 재생에서 한 걸음 사이 시간 */
const PLAY_MS = 900;

/**
 * 숫자야구 다시 보기: 남긴 기록을 처음부터 다시 둬 보며 한 걸음씩 앞뒤로 움직인다.
 * 판마다 두 사람 비밀 수(판 끝 공개로 기록에 들어 있다)를 처음부터 보여 주고,
 * 물음마다 고수의 수와 견준 해설을 붙인다. 키보드 ←·→로도 움직인다
 */
export function BaseballReplay({
  archive,
  name,
}: {
  archive: GameArchive;
  name: (seat: number) => string;
}) {
  const replayed = useMemo(
    () => replayArchive(baseballKit, archive),
    [archive],
  );
  const states = replayed.states as BaseballState[];
  const last = states.length - 1;
  const [index, setIndex] = useState(last);
  const [playing, setPlaying] = useState(false);
  const state = states[index] as BaseballState;
  const next = archive.log[index] ?? null;
  const go = (i: number) => setIndex(Math.max(0, Math.min(last, i)));
  const nameRef = useRef(name);
  nameRef.current = name;

  /** 판 번호 → 자리마다 공개한 비밀(공개하지 않았으면 없음) */
  const secrets = useMemo(() => {
    const map = new Map<number, (string | null)[]>();
    for (const s of states)
      map.set(
        s.roundNumber,
        s.reveals.map((r) => r?.secret ?? null),
      );
    return map;
  }, [states]);

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
    commentary: ReturnType<typeof explainBaseball>;
  } | null>(null);
  useEffect(() => {
    if (!next) return;
    const timer = setTimeout(
      () =>
        setExplained({
          index,
          commentary: explainBaseball(
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

  const digits = state.rules.digits;
  const roundSecrets = secrets.get(state.roundNumber) ?? [null, null];
  const result = state.result;
  const resultText =
    result === null
      ? null
      : result.kind === "draw"
        ? "비김"
        : result.kind === "cheat" && result.seat === null
          ? "둘 다 거짓 답"
          : `${name(result.seat as number)} 승리(${
              result.kind === "hit"
                ? "맞힘"
                : result.kind === "cheat"
                  ? "상대 거짓 답"
                  : result.kind === "resign"
                    ? "기권"
                    : result.kind === "time"
                      ? "시간"
                      : "상대가 답하지 않음"
            })`;
  const asked = (seat: number) =>
    state.guesses
      .map((g, i) => [i, g] as [number, typeof g])
      .filter(([, g]) => g.seat === seat);

  return (
    <section className="flex flex-col items-center gap-3">
      <div className="grid w-full max-w-xl grid-cols-2 gap-2 text-sm">
        {[0, 1].map((seat) => (
          <div
            key={seat}
            className="flex flex-col gap-1 rounded-xl bg-white/5 px-3 py-2"
          >
            <span className="font-semibold">
              {name(seat)} {state.wins[seat] ?? 0}승
            </span>
            <span className="flex items-center gap-2 text-white/60 text-xs">
              비밀 수
              {roundSecrets[seat] ? (
                <NumberBoxes
                  value={roundSecrets[seat] as string}
                  digits={digits}
                  size="sm"
                />
              ) : (
                "없음"
              )}
            </span>
          </div>
        ))}
      </div>
      <div className="flex w-full max-w-xl gap-2">
        {[0, 1]
          .filter((seat) => state.rules.mode === "duel" || seat === 0)
          .map((seat) => (
            <GuessLog
              key={seat}
              title={`${name(seat)}의 물음`}
              entries={asked(seat)}
              digits={digits}
              wrongAt={state.reveals[1 - seat]?.wrongAt ?? null}
              empty="아직 묻지 않았다"
              seat={seat}
            />
          ))}
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
        {state.roundNumber}판 · 물음 {state.guesses.length}개 · {index}/{last}
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
