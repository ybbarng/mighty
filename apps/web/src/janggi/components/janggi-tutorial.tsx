"use client";

import {
  type Action,
  createJanggiScenario,
  createMatch,
  type GameEvent,
  type JanggiView,
  pointAt,
  pseudoTargets,
} from "@mighty/janggi-engine";
import { useMemo } from "react";

import type { TutorialKit } from "@/components/tutorial/kit";
import { useJanggiTutorialProgress } from "@/tutorial/progress";

import { useJanggiSettings } from "../settings";
import { useJanggi } from "../store";
import {
  JANGGI_LESSONS,
  JANGGI_TUTORIAL_RULES,
  type JanggiScene,
} from "../tutorial";
import { JanggiBoard } from "./JanggiBoard";
import { JanggiGame } from "./JanggiGame";

const sceneState = (scene: JanggiScene) =>
  createJanggiScenario({ rules: JANGGI_TUTORIAL_RULES, ...scene });

/** 설명·퀴즈에 보이는 판 그림. `show` 자리 기물이 갈 수 있는 곳에 점을 찍는다. 누를 수 없다 */
function JanggiSceneView({ scenario }: { scenario: JanggiScene }) {
  const labels = useJanggiSettings((s) => s.labels);
  const state = useMemo(() => sceneState(scenario), [scenario]);
  const from = scenario.show ? pointAt(scenario.show) : null;
  const shown =
    from === null
      ? []
      : pseudoTargets(state.board, from).map((to) => ({ from, to }));
  return (
    <div className="mx-auto aspect-[924/1024] w-full max-w-[16rem]">
      <JanggiBoard
        board={state.board}
        flipped={false}
        legal={shown}
        selected={from}
        onSelect={() => {}}
        onMove={() => {}}
        lastMove={null}
        checkedKing={null}
        labels={labels}
      />
    </div>
  );
}

/** 장기 배우기. 미션 상대는 입문 컴퓨터, 장면이 없으면 내가 초로 상차림부터 한 판 */
export const janggiTutorial: TutorialKit<
  JanggiView,
  GameEvent,
  JanggiScene,
  Action
> = {
  title: "장기 배우기",
  background: "bg-[radial-gradient(ellipse_at_center,#44403c_0%,#1c1917_80%)]",
  lessons: JANGGI_LESSONS,
  progress: useJanggiTutorialProgress,
  glossary: false,
  startMission(scenario) {
    const state = scenario
      ? sceneState(scenario)
      : {
          ...createMatch(JANGGI_TUTORIAL_RULES, Date.now()).state,
          choSeat: 0,
        };
    useJanggi.getState().startPractice(state);
  },
  subscribe: (listener) =>
    useJanggi.subscribe((state, prev) => {
      if (state.view !== prev.view && state.view)
        listener(state.view, state.events);
    }),
  Scene: JanggiSceneView,
  Table: ({ onExit, mission }) => (
    <JanggiGame
      onExit={() => {
        useJanggi.getState().leave();
        onExit();
      }}
      mission={mission}
    />
  ),
};
