"use client";

import {
  type Action,
  createMatch,
  createYutScenario,
  type GameEvent,
  valueOfSticks,
  viewOf,
  type YutView,
} from "@mighty/yut-engine";

import type { TutorialKit } from "@/components/tutorial/kit";

import { useYutTutorialProgress } from "../progress";
import { useYut } from "../store";
import { YUT_LESSONS, YUT_TUTORIAL_RULES, type YutScene } from "../tutorial";
import { PendingChips, YutSticks } from "./parts";
import { YutBoard } from "./YutBoard";
import { YUT_BG, YutGame } from "./YutGame";

/** 장면으로 만든 상태(나는 0번 자리) */
export function sceneState(scene: YutScene) {
  return createYutScenario({
    rules: YUT_TUTORIAL_RULES,
    pieces: scene.pieces,
    ...(scene.pending ? { pending: scene.pending } : {}),
    ...(scene.throwsLeft !== undefined ? { throwsLeft: scene.throwsLeft } : {}),
  });
}

/** 설명·퀴즈에 보이는 그림: 윷판, 모아 둔 결과, 윷가락 */
function YutSceneView({ scenario }: { scenario: YutScene }) {
  const view: YutView = viewOf(sceneState(scenario), 0);
  return (
    <div className="mx-auto flex w-full max-w-xs flex-col items-center gap-2">
      {scenario.sticks ? (
        <YutSticks
          sticks={scenario.sticks}
          value={valueOfSticks(scenario.sticks, YUT_TUTORIAL_RULES)}
          throwKey={0}
          tossing={false}
        />
      ) : (
        <YutBoard
          view={view}
          events={[]}
          movable={new Map()}
          preview={null}
          className="max-w-72"
        />
      )}
      <PendingChips values={view.pending} selected={null} usable={new Set()} />
    </div>
  );
}

/** 윷놀이 배우기. 미션은 정해진 장면에서 입문 컴퓨터와, 장면이 없으면 처음부터 */
export const yutTutorial: TutorialKit<YutView, GameEvent, YutScene, Action> = {
  title: "윷놀이 배우기",
  background: YUT_BG,
  lessons: YUT_LESSONS,
  progress: useYutTutorialProgress,
  glossary: false,
  startMission(scenario) {
    const state = scenario
      ? sceneState(scenario)
      : createMatch(YUT_TUTORIAL_RULES, Math.floor(Math.random() * 2 ** 31))
          .state;
    useYut.getState().startPractice(state);
  },
  subscribe: (listener) =>
    useYut.subscribe((state, prev) => {
      if (state.view !== prev.view && state.view)
        listener(state.view, state.events);
    }),
  Scene: YutSceneView,
  Table: ({ onExit, mission }) => (
    <YutGame
      onExit={() => {
        useYut.getState().leave();
        onExit();
      }}
      mission={mission}
    />
  ),
};
