"use client";

import {
  type Action,
  createOmokScenario,
  type GameEvent,
  indexOf,
  type OmokView,
  pointAt,
  viewOf,
  xyOf,
} from "@mighty/omok-engine";
import { useMemo } from "react";

import type { TutorialKit } from "@/components/tutorial/kit";
import { useOmokTutorialProgress } from "@/tutorial/progress";

import { useOmok } from "../store";
import { OMOK_LESSONS, OMOK_TUTORIAL_RULES, type OmokScene } from "../tutorial";
import { OmokBoard } from "./OmokBoard";
import { OmokGame } from "./OmokGame";

const sceneState = (scene: OmokScene) =>
  createOmokScenario({ rules: OMOK_TUTORIAL_RULES, ...scene });

/** 두 끝 사이를 잇는 자리들(가로·세로·대각선) */
function linePoints(from: string, to: string): number[] {
  const [x1, y1] = xyOf(pointAt(from));
  const [x2, y2] = xyOf(pointAt(to));
  const n = Math.max(Math.abs(x2 - x1), Math.abs(y2 - y1));
  const dx = Math.sign(x2 - x1);
  const dy = Math.sign(y2 - y1);
  return Array.from({ length: n + 1 }, (_, k) =>
    indexOf(x1 + dx * k, y1 + dy * k),
  );
}

/** 설명·퀴즈에 보이는 판 그림. 누를 수 없다 */
function OmokSceneView({ scenario }: { scenario: OmokScene }) {
  const view = useMemo(() => viewOf(sceneState(scenario), 0), [scenario]);
  const [from, to] = scenario.line ?? [];
  return (
    <div className="mx-auto aspect-square w-full max-w-xs">
      <OmokBoard
        board={view.board}
        myStone={1}
        canPlay={false}
        lastMove={null}
        winLine={from && to ? linePoints(from, to) : null}
        forbidden={scenario.forbidden ? view.forbidden : []}
        aim={null}
        onAim={() => {}}
        onPlace={() => {}}
      />
    </div>
  );
}

/** 오목 배우기. 미션 상대는 입문 컴퓨터, 장면이 없으면 내가 흑으로 처음부터 */
export const omokTutorial: TutorialKit<OmokView, GameEvent, OmokScene, Action> =
  {
    title: "오목 배우기",
    background: "bg-[radial-gradient(ellipse_at_top,#1e293b_0%,#020617_70%)]",
    lessons: OMOK_LESSONS,
    progress: useOmokTutorialProgress,
    glossary: false,
    startMission(scenario) {
      useOmok
        .getState()
        .startPractice(sceneState(scenario ?? { black: [], white: [] }));
    },
    subscribe: (listener) =>
      useOmok.subscribe((state, prev) => {
        if (state.view !== prev.view && state.view)
          listener(state.view, state.events);
      }),
    Scene: OmokSceneView,
    Table: ({ onExit, mission }) => (
      <OmokGame
        onExit={() => {
          useOmok.getState().leave();
          onExit();
        }}
        mission={mission}
      />
    ),
  };
