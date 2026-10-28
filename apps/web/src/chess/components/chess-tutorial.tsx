"use client";

import {
  type Action,
  type ChessView,
  createChessScenario,
  createMatch,
  type GameEvent,
  legalMoves,
  squareAt,
} from "@mighty/chess-engine";
import { useMemo } from "react";

import type { TutorialKit } from "@/components/tutorial/kit";

import { useChessTutorialProgress } from "../progress";
import { useChessSettings } from "../settings";
import { useChess } from "../store";
import {
  CHESS_LESSONS,
  CHESS_TUTORIAL_RULES,
  type ChessScene,
} from "../tutorial";
import { ChessBoard } from "./ChessBoard";
import { ChessGame } from "./ChessGame";

const sceneState = (scene: ChessScene) =>
  createChessScenario({ rules: CHESS_TUTORIAL_RULES, ...scene });

/** 설명·퀴즈에 보이는 판 그림. `show` 칸 기물이 갈 수 있는 곳에 점을 찍는다. 누를 수 없다 */
function ChessSceneView({ scenario }: { scenario: ChessScene }) {
  const coordinates = useChessSettings((s) => s.coordinates);
  const state = useMemo(() => sceneState(scenario), [scenario]);
  const from = scenario.show ? squareAt(scenario.show) : null;
  const shown =
    from === null
      ? []
      : legalMoves(state.position).filter((m) => m.from === from);
  return (
    <div className="mx-auto aspect-square w-full max-w-[16rem]">
      <ChessBoard
        board={state.position.board}
        flipped={false}
        legal={shown}
        selected={from}
        onSelect={() => {}}
        onMove={() => {}}
        lastMove={null}
        checkedKing={null}
        coordinates={coordinates}
      />
    </div>
  );
}

/** 체스 배우기. 미션 상대는 입문 컴퓨터, 장면이 없으면 내가 백으로 처음부터 한 판 */
export const chessTutorial: TutorialKit<
  ChessView,
  GameEvent,
  ChessScene,
  Action
> = {
  title: "체스 배우기",
  background: "bg-[radial-gradient(ellipse_at_center,#44403c_0%,#1c1917_80%)]",
  lessons: CHESS_LESSONS,
  progress: useChessTutorialProgress,
  glossary: false,
  startMission(scenario) {
    const state = scenario
      ? sceneState(scenario)
      : {
          ...createMatch(CHESS_TUTORIAL_RULES, Date.now()).state,
          whiteSeat: 0,
        };
    useChess.getState().startPractice(state);
  },
  subscribe: (listener) =>
    useChess.subscribe((state, prev) => {
      if (state.view !== prev.view && state.view)
        listener(state.view, state.events);
    }),
  Scene: ChessSceneView,
  Table: ({ onExit, mission }) => (
    <ChessGame
      onExit={() => {
        useChess.getState().leave();
        onExit();
      }}
      mission={mission}
    />
  ),
};
