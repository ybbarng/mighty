"use client";

import {
  type Action,
  createGostopScenario,
  type GameEvent,
  type GostopView,
} from "@mighty/gostop-engine";

import type { TutorialKit } from "@/components/tutorial/kit";
import {
  HwatuCaptured,
  HwatuFloor,
  HwatuHand,
} from "@/hwatu/components/HwatuLayout";

import { useGostopTutorialProgress } from "../progress";
import { useGostop } from "../store";
import {
  GOSTOP_LESSONS,
  GOSTOP_TUTORIAL_RULES,
  type GostopScenario,
} from "../tutorial";
import { GostopTable } from "./GostopTable";

/** 설명·퀴즈에 보이는 화투 그림: 내 먹은 패, 바닥, 내 손패(있는 것만). 누를 수 없다 */
function GostopSceneView({ scenario }: { scenario: GostopScenario }) {
  const captured = scenario.captured?.[0] ?? [];
  const hand = scenario.hands[0] ?? [];
  return (
    <div className="mx-auto flex w-full max-w-sm flex-col items-center gap-2 rounded-2xl bg-[#0a3622] p-3">
      {captured.length > 0 && (
        <HwatuCaptured ids={captured} width={30} label="내" />
      )}
      {scenario.floor.length > 0 && (
        <HwatuFloor ids={scenario.floor} width={40} />
      )}
      {hand.length > 0 && <HwatuHand ids={hand} width={44} />}
    </div>
  );
}

/** 고스톱 배우기. 미션 상대는 입문 컴퓨터, 장면이 없으면 맞고 한 판 */
export const gostopTutorial: TutorialKit<
  GostopView,
  GameEvent,
  GostopScenario,
  Action
> = {
  title: "고스톱 배우기",
  background: "bg-[radial-gradient(ellipse_at_center,#166534_0%,#0a3622_80%)]",
  lessons: GOSTOP_LESSONS,
  progress: useGostopTutorialProgress,
  glossary: false,
  startMission(scenario) {
    useGostop
      .getState()
      .startPractice(
        scenario
          ? createGostopScenario({ rules: GOSTOP_TUTORIAL_RULES, ...scenario })
          : null,
        GOSTOP_TUTORIAL_RULES,
      );
  },
  subscribe: (listener) =>
    useGostop.subscribe((state, prev) => {
      if (state.view !== prev.view && state.view)
        listener(state.view, state.events);
    }),
  Scene: GostopSceneView,
  Table: ({ onExit, mission }) => (
    <GostopTable
      onExit={() => {
        useGostop.getState().leave();
        onExit();
      }}
      mission={mission}
    />
  ),
};
