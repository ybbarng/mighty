"use client";

import {
  type Action,
  createMatch,
  createMinhwatuScenario,
  type GameEvent,
  type MinhwatuView,
} from "@mighty/minhwatu-engine";

import type { TutorialKit } from "@/components/tutorial/kit";
import {
  HwatuCaptured,
  HwatuFloor,
  HwatuHand,
} from "@/hwatu/components/HwatuLayout";

import { useMinhwatuTutorialProgress } from "../progress";
import { useMinhwatu } from "../store";
import {
  MINHWATU_LESSONS,
  MINHWATU_TUTORIAL_RULES,
  type MinhwatuScene,
} from "../tutorial";
import { MINHWATU_BG, MinhwatuTable } from "./MinhwatuTable";

/** 설명·퀴즈에 보이는 장면: 바닥, 내 먹은 패, 내 손패. 누를 수 없다 */
function MinhwatuSceneView({ scenario }: { scenario: MinhwatuScene }) {
  const mine = scenario.captured?.[0] ?? [];
  return (
    <div className="flex flex-col items-center gap-2 rounded-2xl bg-[#14532d] p-3">
      <span className="text-[10px] text-white/60">바닥</span>
      <HwatuFloor ids={scenario.floor} width={40} />
      {mine.length > 0 && (
        <HwatuCaptured piCount="cards" ids={mine} width={20} label="나" />
      )}
      <span className="text-[10px] text-white/60">내 손패</span>
      <HwatuHand ids={scenario.hands[0] ?? []} width={40} />
    </div>
  );
}

/** 민화투 배우기. 미션 상대는 입문 컴퓨터 둘, 장면이 없으면 처음부터 한 판 */
export const minhwatuTutorial: TutorialKit<
  MinhwatuView,
  GameEvent,
  MinhwatuScene,
  Action
> = {
  title: "민화투 배우기",
  background: MINHWATU_BG,
  lessons: MINHWATU_LESSONS,
  progress: useMinhwatuTutorialProgress,
  glossary: false,
  startMission(scenario) {
    const state = scenario
      ? createMinhwatuScenario({ rules: MINHWATU_TUTORIAL_RULES, ...scenario })
      : {
          ...createMatch(MINHWATU_TUTORIAL_RULES, Date.now() % 2 ** 31).state,
        };
    // 처음부터 한 판도 내가 선으로 시작한다(바로 내 차례).
    if (!scenario) {
      state.dealer = 0;
      state.turn = 0;
    }
    useMinhwatu.getState().startPractice(state);
  },
  subscribe: (listener) =>
    useMinhwatu.subscribe((state, prev) => {
      if (state.view !== prev.view && state.view)
        listener(state.view, state.events);
    }),
  Scene: MinhwatuSceneView,
  Table: ({ onExit, mission, hints }) => (
    <MinhwatuTable
      onExit={() => {
        useMinhwatu.getState().leave();
        onExit();
      }}
      mission={mission}
      hints={hints}
    />
  ),
};
