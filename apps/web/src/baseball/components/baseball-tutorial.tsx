"use client";

import {
  type Action,
  type BaseballView,
  createBaseballScenario,
  createMatch,
  type GameEvent,
  score,
} from "@mighty/baseball-engine";

import type { TutorialKit } from "@/components/tutorial/kit";

import { useBaseballTutorialProgress } from "../progress";
import { useBaseball } from "../store";
import {
  BASEBALL_LESSONS,
  BASEBALL_TUTORIAL_RULES,
  type BaseballScene,
} from "../tutorial";
import { BaseballGame } from "./BaseballGame";
import { GuessLog, NumberBoxes } from "./parts";

/** 설명·퀴즈에 보이는 그림: 물어본 수와 답(비밀은 보일 때만) */
function BaseballSceneView({ scenario }: { scenario: BaseballScene }) {
  const digits = BASEBALL_TUTORIAL_RULES.digits;
  const entries = (scenario.guesses ?? []).map(
    (guess, i) =>
      [i, { seat: 0, guess, ...score(scenario.secret, guess) }] as [
        number,
        { seat: number; guess: string; strikes: number; balls: number },
      ],
  );
  return (
    <div className="mx-auto flex w-full max-w-xs flex-col gap-2">
      {scenario.showSecret && (
        <div className="flex items-center justify-center gap-2 text-sm">
          <span className="text-white/70">비밀 수</span>
          <NumberBoxes value={scenario.secret} digits={digits} size="sm" />
        </div>
      )}
      <GuessLog
        title="물음 → 답"
        entries={entries}
        digits={digits}
        wrongAt={null}
        empty="아직 묻지 않았어요"
        seat={0}
      />
    </div>
  );
}

/** 숫자야구 배우기. 미션은 컴퓨터 수 맞히기(퍼즐), 장면이 없으면 처음부터 */
export const baseballTutorial: TutorialKit<
  BaseballView,
  GameEvent,
  BaseballScene,
  Action
> = {
  title: "숫자야구 배우기",
  background: "ballpark",
  lessons: BASEBALL_LESSONS,
  progress: useBaseballTutorialProgress,
  glossary: false,
  startMission(scenario) {
    const state = scenario
      ? createBaseballScenario({ rules: BASEBALL_TUTORIAL_RULES, ...scenario })
      : createMatch(
          BASEBALL_TUTORIAL_RULES,
          Math.floor(Math.random() * 2 ** 31),
        ).state;
    useBaseball.getState().startPractice(state);
  },
  subscribe: (listener) =>
    useBaseball.subscribe((state, prev) => {
      if (state.view !== prev.view && state.view)
        listener(state.view, state.events);
    }),
  Scene: BaseballSceneView,
  Table: ({ onExit, mission }) => (
    <BaseballGame
      onExit={() => {
        useBaseball.getState().leave();
        onExit();
      }}
      mission={mission}
    />
  ),
};
