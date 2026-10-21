"use client";

import { beginnerBot } from "@mighty/ai";
import { type Card, createScenario, type GameEvent } from "@mighty/engine";
import { useEffect, useRef, useState } from "react";
import { DEFAULT_BOT_NAMES } from "@/game/bot-names";
import { LocalMatch } from "@/game/local-match";
import { useCardTheme } from "@/game/settings";
import { useGame } from "@/game/store";
import { cn } from "@/lib/cn";
import { termOf } from "@/tutorial/glossary";
import {
  LESSONS,
  type MissionStatus,
  TUTORIAL_RULES,
} from "@/tutorial/lessons";
import { useTutorialProgress } from "@/tutorial/progress";

import { CardArt } from "../card-art/CardArt";
import { GameTable } from "../GameTable";
import { ActionButton } from "../panels/common";
import { TermAside } from "../TermHint";
import { RichText } from "./RichText";

const NAMES = ["나", ...DEFAULT_BOT_NAMES.slice(0, 4)];

/** 한 단원: 설명 → 퀴즈 → 미션을 차례로 진행한다 */
export function LessonPlayer({
  lessonId,
  onExit,
}: {
  lessonId: string;
  onExit: () => void;
}) {
  const lesson = LESSONS.find((l) => l.id === lessonId);
  const complete = useTutorialProgress((s) => s.complete);
  const attachOnline = useGame((s) => s.attachOnline);
  const [index, setIndex] = useState(0);
  const [chosen, setChosen] = useState<number | null>(null);
  const [playing, setPlaying] = useState(false);
  const [status, setStatus] = useState<MissionStatus>(null);
  const [finished, setFinished] = useState(false);
  // 다시 하기마다 늘려 진행 구독과 결과 타이머를 새로 건다.
  const [attempt, setAttempt] = useState(0);
  const events = useRef<GameEvent[]>([]);

  const step = lesson?.steps[index];

  // 미션 중에는 화면이 재생하는 진행을 따라가며 성공·실패를 판단한다.
  // biome-ignore lint/correctness/useExhaustiveDependencies: attempt가 바뀌면 다시 건다
  useEffect(() => {
    if (!playing || step?.kind !== "mission") return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const unsubscribe = useGame.subscribe((state, prev) => {
      if (state.seq === prev.seq || !state.view) return;
      events.current.push(...state.events);
      const result = step.check({ view: state.view, events: events.current });
      // 트릭이 정리되는 것을 볼 시간을 조금 준다.
      if (result && timer === null)
        timer = setTimeout(() => setStatus(result), 900);
    });
    return () => {
      unsubscribe();
      if (timer) clearTimeout(timer);
    };
  }, [playing, step, attempt]);

  if (!lesson || !step) return null;

  const next = () => {
    setChosen(null);
    setStatus(null);
    setPlaying(false);
    if (index + 1 >= lesson.steps.length) {
      complete(lesson.id);
      setFinished(true);
      return;
    }
    setIndex(index + 1);
  };

  const startMission = () => {
    if (step.kind !== "mission") return;
    events.current = [];
    setStatus(null);
    const seed = Math.floor(Math.random() * 2 ** 31);
    const match = step.scenario
      ? new LocalMatch({
          rules: TUTORIAL_RULES,
          seed,
          initialState: createScenario({
            rules: TUTORIAL_RULES,
            ...step.scenario,
          }),
        })
      : // 실전 한 판은 입문 컴퓨터와 한다. 추천 카드는 보통 기준이다.
        new LocalMatch({ rules: TUTORIAL_RULES, seed, bot: beginnerBot });
    attachOnline(match, NAMES);
    setAttempt((a) => a + 1);
    setPlaying(true);
  };

  if (playing && step.kind === "mission") {
    return (
      <GameTable
        onExit={() => setPlaying(false)}
        hints={step.scenario === null}
        mission={{
          title: step.title,
          objective: step.objective,
          hint: step.hint,
          status,
          successText: step.success,
          failText: step.fail,
          onNext: next,
          onRetry: startMission,
        }}
      />
    );
  }

  return (
    <main className="flex min-h-dvh items-center justify-center bg-[radial-gradient(ellipse_at_center,#166534_0%,#0a3622_75%)] p-4">
      <div className="flex w-full max-w-lg flex-col gap-4 py-4">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onExit}
            aria-label="단원 나가기"
            className="rounded-lg bg-white/10 px-3 py-1 text-sm"
          >
            ✕
          </button>
          <div className="h-2 flex-1 overflow-hidden rounded-full bg-white/10">
            <div
              className="h-full rounded-full bg-amber-400 transition-[width] duration-500"
              style={{
                width: `${((finished ? lesson.steps.length : index) / lesson.steps.length) * 100}%`,
              }}
            />
          </div>
        </div>

        <div className="flex flex-col gap-4 rounded-3xl border border-white/10 bg-black/40 p-5 shadow-2xl backdrop-blur">
          <p className="text-xs opacity-60">{lesson.title}</p>

          {finished ? (
            <>
              <h2 className="font-black text-2xl">단원 완료! 🎉</h2>
              <p className="text-sm opacity-80">{lesson.summary}</p>
              <ActionButton className="py-3 text-base" onClick={onExit}>
                단원 목록으로
              </ActionButton>
            </>
          ) : step.kind === "explain" ? (
            <>
              <h2 className="font-bold text-xl">{step.title}</h2>
              {step.body.map((line) => (
                <p key={line} className="text-[15px] leading-relaxed">
                  <RichText text={line} />
                </p>
              ))}
              {step.cards && <CardRow cards={step.cards} />}
              {step.terms && step.terms.length > 0 && (
                <dl className="flex flex-col gap-1.5 rounded-2xl bg-white/5 p-3 text-sm">
                  {step.terms.map((id) => {
                    const term = termOf(id);
                    return term ? (
                      <div key={id}>
                        <dt className="inline font-bold text-amber-200">
                          {term.term}
                        </dt>
                        <dd className="inline opacity-80">
                          {" "}
                          — {term.meaning}
                          <TermAside term={term} />
                        </dd>
                      </div>
                    ) : null;
                  })}
                </dl>
              )}
              <ActionButton className="py-3 text-base" onClick={next}>
                다음
              </ActionButton>
            </>
          ) : step.kind === "quiz" ? (
            <>
              <h2 className="font-bold text-lg">
                <RichText text={step.question} />
              </h2>
              {step.cards && <CardRow cards={step.cards} />}
              <div className="flex flex-col gap-2">
                {step.options.map((option, i) => {
                  const picked = chosen === i;
                  const correct = i === step.answer;
                  return (
                    <button
                      key={option}
                      type="button"
                      disabled={chosen !== null}
                      onClick={() => setChosen(i)}
                      className={cn(
                        "rounded-xl border px-4 py-3 text-left font-semibold transition",
                        chosen === null &&
                          "border-white/15 bg-white/5 hover:bg-white/10",
                        chosen !== null &&
                          correct &&
                          "border-emerald-300 bg-emerald-500/25",
                        picked && !correct && "border-rose-300 bg-rose-500/25",
                        chosen !== null &&
                          !correct &&
                          !picked &&
                          "border-white/5 opacity-50",
                      )}
                    >
                      {option}
                      {chosen !== null && correct && " ✓"}
                    </button>
                  );
                })}
              </div>
              {chosen !== null && (
                <div
                  className={cn(
                    "rounded-2xl p-3 text-sm",
                    chosen === step.answer
                      ? "bg-emerald-500/15"
                      : "bg-rose-500/15",
                  )}
                >
                  <p className="mb-1 font-bold">
                    {chosen === step.answer ? "정답이에요!" : "아쉬워요"}
                  </p>
                  <RichText text={step.explain} />
                </div>
              )}
              {chosen !== null &&
                (chosen === step.answer ? (
                  <ActionButton className="py-3 text-base" onClick={next}>
                    다음
                  </ActionButton>
                ) : (
                  <ActionButton
                    variant="secondary"
                    className="py-3 text-base"
                    onClick={() => setChosen(null)}
                  >
                    다시 풀기
                  </ActionButton>
                ))}
            </>
          ) : (
            <>
              <h2 className="font-bold text-xl">미션: {step.title}</h2>
              <p className="text-[15px] leading-relaxed">
                <RichText text={step.objective} />
              </p>
              <ActionButton className="py-3 text-base" onClick={startMission}>
                미션 시작
              </ActionButton>
            </>
          )}
        </div>
      </div>
    </main>
  );
}

function CardRow({ cards }: { cards: readonly Card[] }) {
  const theme = useCardTheme();
  return (
    <div className="flex flex-wrap justify-center gap-1.5">
      {cards.map((card) => (
        <div key={card} className="aspect-[5/7] w-14 drop-shadow-md">
          <CardArt card={card} theme={theme} />
        </div>
      ))}
    </div>
  );
}
