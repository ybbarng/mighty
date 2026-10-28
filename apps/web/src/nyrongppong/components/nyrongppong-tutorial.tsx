"use client";

import {
  type Action,
  createMatch,
  createNyrongppongScenario,
  type GameEvent,
  handValue,
  type NyrongppongView,
} from "@mighty/nyrongppong-engine";

import type { TutorialKit } from "@/components/tutorial/kit";
import { HwatuCardView } from "@/hwatu/components/HwatuCard";
import { HwatuBacks } from "@/hwatu/components/HwatuLayout";

import { useNyrongppongTutorialProgress } from "../progress";
import { useNyrongppong } from "../store";
import {
  NYRONGPPONG_LESSONS,
  NYRONGPPONG_TUTORIAL_RULES,
  type NyrongppongScene,
} from "../tutorial";
import { NYRONGPPONG_BG, NyrongppongGame } from "./NyrongppongGame";

/** 설명·퀴즈 그림: 상대 뒷면, 버린 카드, 내 뽕 묶음과 손패. 누를 수 없다 */
function NyrongppongSceneView({ scenario }: { scenario: NyrongppongScene }) {
  const state = createNyrongppongScenario(scenario);
  const mine = state.hands[0] ?? [];
  const top = state.pile.at(-1);
  return (
    <div className="mx-auto flex w-full max-w-xs flex-col items-center gap-2 rounded-2xl bg-black/25 p-3">
      <div className="flex items-center gap-3">
        <HwatuBacks count={state.hands[1]?.length ?? 0} width={18} />
        {top && (
          <span className="flex items-center gap-1 text-white/70 text-xs">
            버린 패
            <HwatuCardView id={top} width={30} highlight />
          </span>
        )}
      </div>
      {(state.melds[0]?.length ?? 0) > 0 && (
        <div className="flex items-center gap-1 text-white/60 text-xs">
          뽕
          {(state.melds[0] ?? []).map((meld) => (
            <span key={meld[0]} className="flex -space-x-2">
              {meld.map((id) => (
                <HwatuCardView key={id} id={id} width={20} />
              ))}
            </span>
          ))}
        </div>
      )}
      <div className="flex flex-wrap justify-center gap-1">
        {mine.map((id) => (
          <HwatuCardView
            key={id}
            id={id}
            width={36}
            highlight={state.drawn === id}
          />
        ))}
      </div>
      <span className="text-white/60 text-xs">
        내 손패 합 {handValue(mine)}
      </span>
    </div>
  );
}

/** 나이롱뽕 배우기. 미션 상대는 입문 컴퓨터, 장면이 없으면 컴퓨터 셋과 처음부터 한 판 */
export const nyrongppongTutorial: TutorialKit<
  NyrongppongView,
  GameEvent,
  NyrongppongScene,
  Action
> = {
  title: "나이롱뽕 배우기",
  background: NYRONGPPONG_BG,
  lessons: NYRONGPPONG_LESSONS,
  progress: useNyrongppongTutorialProgress,
  glossary: false,
  startMission(scenario) {
    const state = scenario
      ? createNyrongppongScenario(scenario)
      : createMatch({ ...NYRONGPPONG_TUTORIAL_RULES, rounds: 1 }, Date.now())
          .state;
    useNyrongppong.getState().startPractice(state);
  },
  subscribe: (listener) =>
    useNyrongppong.subscribe((state, prev) => {
      if (state.view !== prev.view && state.view)
        listener(state.view, state.events);
    }),
  Scene: NyrongppongSceneView,
  Table: ({ onExit, mission }) => (
    <NyrongppongGame
      onExit={() => {
        useNyrongppong.getState().leave();
        onExit();
      }}
      mission={mission}
    />
  ),
};
