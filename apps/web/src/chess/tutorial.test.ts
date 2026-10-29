// @vitest-environment node
import { chessBeginnerBot } from "@mighty/chess-ai";
import {
  type Action,
  createChessScenario,
  type GameEvent,
  squareAt,
  viewOf,
} from "@mighty/chess-engine";
import { describe, expect, it } from "vitest";

import { LocalMatch } from "@/game/local-match";

import { chessKit } from "./kit";
import {
  CHESS_LESSONS,
  CHESS_TUTORIAL_RULES,
  type ChessLesson,
  type ChessScene,
} from "./tutorial";

type Mission = Extract<ChessLesson["steps"][number], { kind: "mission" }>;

function sceneState(scene: ChessScene) {
  return createChessScenario({ rules: CHESS_TUTORIAL_RULES, ...scene });
}

function runMission(mission: Mission, actions: Action[]) {
  if (!mission.scenario) throw new Error("장면이 없는 미션");
  const match = new LocalMatch({
    kit: chessKit,
    rules: CHESS_TUTORIAL_RULES,
    seed: 1,
    humanSeat: 0,
    bot: chessBeginnerBot,
    initialState: sceneState(mission.scenario),
  });
  const events: GameEvent[] = [];
  match.subscribe((s) => events.push(...s.events));
  const before = mission.check({ view: match.current(), events: [] });
  for (const action of actions) {
    const result = match.submit(action);
    if (!result.ok) throw new Error(`${mission.title}: ${result.error}`);
  }
  return { before, after: mission.check({ view: match.current(), events }) };
}

const missions = CHESS_LESSONS.flatMap((l) =>
  l.steps
    .filter((s): s is Mission => s.kind === "mission" && s.scenario !== null)
    .map((m) => [m.title, m] as const),
);

describe("체스 튜토리얼 미션", () => {
  it("단원은 여덟, 장면이 있는 미션은 일곱이다(실전은 처음부터)", () => {
    expect(CHESS_LESSONS).toHaveLength(8);
    expect(missions).toHaveLength(7);
    expect(CHESS_LESSONS[0]?.id).toBe("goal");
    expect(CHESS_LESSONS.at(-1)?.id).toBe("real");
  });

  it.each(missions)("%s: 정답이면 성공, 실수면 실패", (_title, mission) => {
    expect(mission.solution && mission.mistake).toBeTruthy();
    const solved = runMission(mission, mission.solution ?? []);
    expect(solved.before).toBeNull();
    expect(solved.after).toBe("success");
    expect(runMission(mission, mission.mistake ?? []).after).toBe("fail");
  });
});

describe("체스 튜토리얼 장면", () => {
  it("모든 장면을 만들 수 있고, 내가 둘 차례이며 판이 끝나 있지 않다", () => {
    for (const lesson of CHESS_LESSONS)
      for (const step of lesson.steps) {
        const scene =
          step.kind === "mission" ? step.scenario : (step.scene ?? null);
        if (!scene) continue;
        const view = viewOf(sceneState(scene), 0);
        expect(view.decision).toEqual({ kind: "move" });
        expect(view.phase).toBe("play");
      }
  });

  it("점을 찍는 기물(show)은 그 칸에 있는 둘 차례 편 기물이다", () => {
    for (const lesson of CHESS_LESSONS)
      for (const step of lesson.steps) {
        if (step.kind === "mission" || !step.scene?.show) continue;
        const state = sceneState(step.scene);
        const cell = state.position.board[squareAt(step.scene.show)];
        expect(cell?.startsWith(state.position.turn)).toBe(true);
      }
  });

  it("퀴즈 정답 번호가 보기 안에 있다", () => {
    for (const lesson of CHESS_LESSONS)
      for (const step of lesson.steps) {
        if (step.kind !== "quiz") continue;
        expect(step.answer).toBeGreaterThanOrEqual(0);
        expect(step.answer).toBeLessThan(step.options.length);
      }
  });
});
