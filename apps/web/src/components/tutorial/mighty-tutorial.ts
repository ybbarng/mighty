import { beginnerBot } from "@mighty/ai";
import {
  type Action,
  createScenario,
  type GameEvent,
  type PlayerView,
  type ScenarioOptions,
} from "@mighty/engine";

import { DEFAULT_BOT_NAMES } from "@/game/bot-names";
import { LocalMatch } from "@/game/local-match";
import { useGame } from "@/game/store";
import { LESSONS, TUTORIAL_RULES } from "@/tutorial/lessons";
import { useTutorialProgress } from "@/tutorial/progress";

import { GameTable } from "../GameTable";
import type { TutorialKit } from "./kit";

const NAMES = ["나", ...DEFAULT_BOT_NAMES.slice(0, 4)];

/** 마이티 배우기 */
export const mightyTutorial: TutorialKit<
  PlayerView,
  GameEvent,
  Omit<ScenarioOptions, "rules">,
  Action
> = {
  title: "마이티 배우기",
  background: "bg-[radial-gradient(ellipse_at_center,#166534_0%,#0a3622_75%)]",
  lessons: LESSONS,
  progress: useTutorialProgress,
  glossary: true,
  startMission(scenario) {
    const seed = Math.floor(Math.random() * 2 ** 31);
    const match = scenario
      ? new LocalMatch({
          rules: TUTORIAL_RULES,
          seed,
          initialState: createScenario({ rules: TUTORIAL_RULES, ...scenario }),
        })
      : // 실전 한 판은 입문 컴퓨터와 한다. 추천 카드는 중수 기준이다.
        new LocalMatch({ rules: TUTORIAL_RULES, seed, bot: beginnerBot });
    useGame.getState().attachOnline(match, NAMES);
  },
  subscribe: (listener) =>
    useGame.subscribe((state, prev) => {
      if (state.seq !== prev.seq && state.view)
        listener(state.view, state.events);
    }),
  Table: GameTable,
};
