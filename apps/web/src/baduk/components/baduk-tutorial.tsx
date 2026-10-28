"use client";

import {
  type Action,
  type BadukView,
  createBadukScenario,
  createMatch,
  type GameEvent,
  pointAt,
} from "@mighty/baduk-engine";
import { useMemo } from "react";

import type { TutorialKit } from "@/components/tutorial/kit";

import { useBadukTutorialProgress } from "../progress";
import { useBaduk } from "../store";
import {
  BADUK_LESSONS,
  BADUK_TUTORIAL_RULES,
  type BadukScene,
} from "../tutorial";
import { BadukBoard } from "./BadukBoard";
import { BadukGame } from "./BadukGame";

const sceneState = (scene: BadukScene) =>
  createBadukScenario({ rules: BADUK_TUTORIAL_RULES, ...scene });

/** 설명·퀴즈에 보이는 판 그림. 표시(A·×·○)를 얹는다. 누를 수 없다 */
function BadukSceneView({ scenario }: { scenario: BadukScene }) {
  const state = useMemo(() => sceneState(scenario), [scenario]);
  const size = state.rules.size;
  const marks = useMemo(
    () =>
      Object.fromEntries(
        Object.entries(scenario.marks ?? {}).map(([name, text]) => [
          pointAt(name, size),
          text,
        ]),
      ),
    [scenario, size],
  );
  return (
    <div className="mx-auto aspect-square w-full max-w-xs">
      <BadukBoard
        board={state.board}
        size={size}
        myStone={1}
        canPlay={false}
        legal={[]}
        lastMove={null}
        aim={null}
        onAim={() => {}}
        onPlace={() => {}}
        marks={marks}
      />
    </div>
  );
}

/** 바둑 배우기. 미션 상대는 입문 컴퓨터, 장면이 없으면 내가 흑으로 9줄 처음부터 한 판 */
export const badukTutorial: TutorialKit<
  BadukView,
  GameEvent,
  BadukScene,
  Action
> = {
  title: "바둑 배우기",
  background: "bg-[radial-gradient(ellipse_at_center,#57534e_0%,#1c1917_80%)]",
  lessons: BADUK_LESSONS,
  progress: useBadukTutorialProgress,
  glossary: false,
  startMission(scenario) {
    const state = scenario
      ? sceneState(scenario)
      : {
          ...createMatch(BADUK_TUTORIAL_RULES, Date.now()).state,
          blackSeat: 0,
        };
    useBaduk.getState().startPractice(state);
  },
  subscribe: (listener) =>
    useBaduk.subscribe((state, prev) => {
      if (state.view !== prev.view && state.view)
        listener(state.view, state.events);
    }),
  Scene: BadukSceneView,
  Table: ({ onExit, mission }) => (
    <BadukGame
      onExit={() => {
        useBaduk.getState().leave();
        onExit();
      }}
      mission={mission}
    />
  ),
};
