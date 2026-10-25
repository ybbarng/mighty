import type { Card } from "@mighty/engine";

/** 두 게임(마이티·하트) 튜토리얼이 함께 쓰는 단원 형식 */

export type MissionStatus = "success" | "fail" | null;

export interface MissionContext<View, Event> {
  view: View;
  /** 미션을 시작한 뒤 생긴 모든 이벤트 */
  events: readonly Event[];
}

/** 화면에 보여 줄 짧은 글. `**굵게**`만 쓴다 */
export type Text = string;

export type Step<View, Event, Scenario, Action> =
  | {
      kind: "explain";
      title: string;
      body: Text[];
      cards?: Card[];
      terms?: string[];
    }
  | {
      kind: "quiz";
      question: Text;
      cards?: Card[];
      options: string[];
      answer: number;
      explain: Text;
    }
  | {
      kind: "mission";
      title: string;
      objective: Text;
      hint: Text;
      /** 정해진 장면. 없으면 처음부터 한 판 */
      scenario: Scenario | null;
      check: (ctx: MissionContext<View, Event>) => MissionStatus;
      success: Text;
      fail: Text;
      /** 테스트용: 성공해야 하는 행동과 실패해야 하는 행동 */
      solution?: Action[];
      mistake?: Action[];
    };

export interface Lesson<View, Event, Scenario, Action> {
  id: string;
  title: string;
  summary: string;
  steps: Step<View, Event, Scenario, Action>[];
}
