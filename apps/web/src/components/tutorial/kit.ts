import type { ComponentType } from "react";

import type { TutorialProgressStore } from "@/tutorial/progress";
import type { Lesson } from "@/tutorial/types";

import type { MissionProps } from "./MissionOverlay";

/** 튜토리얼 화면(단원 목록·단원 진행)을 한 게임에 잇는 것. 게임마다 하나씩 둔다 */
export interface TutorialKit<View, Event, Scenario, Action> {
  /** 단원 목록 제목 */
  title: string;
  /** 화면 배경(Tailwind 클래스) */
  background: string;
  lessons: readonly Lesson<View, Event, Scenario, Action>[];
  progress: TutorialProgressStore;
  /** 용어 사전 단추를 보인다 */
  glossary: boolean;
  /** 미션 대국을 연다. 장면이 없으면 처음부터 한 판 */
  startMission(scenario: Scenario | null): void;
  /** 판 화면이 새 진행을 보여 줄 때마다 부른다. 구독을 끊는 함수를 돌려준다 */
  subscribe(
    listener: (view: View, events: readonly Event[]) => void,
  ): () => void;
  /** 설명·퀴즈의 `scene`을 그리는 그림(판 게임). 없으면 장면을 보이지 않는다 */
  Scene?: ComponentType<{ scenario: Scenario }>;
  /** 미션 띠를 얹은 판 화면 */
  Table: ComponentType<{
    onExit: () => void;
    mission: MissionProps;
    /** 처음부터 한 판일 때 추천 카드를 보인다 */
    hints: boolean;
  }>;
}
