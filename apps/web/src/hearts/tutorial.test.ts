import { heartsBeginnerBot } from "@mighty/hearts-ai";
import {
  type Action,
  createHeartsScenario,
  type GameEvent,
} from "@mighty/hearts-engine";
import { describe, expect, it } from "vitest";

import { LocalMatch } from "@/game/local-match";

import { heartsKit } from "./kit";
import {
  HEARTS_LESSONS,
  HEARTS_TUTORIAL_RULES,
  type HeartsLesson,
} from "./tutorial";

type Mission = Extract<HeartsLesson["steps"][number], { kind: "mission" }>;

function runMission(mission: Mission, actions: Action[]) {
  if (!mission.scenario) throw new Error("장면이 없는 미션");
  const match = new LocalMatch({
    kit: heartsKit,
    rules: HEARTS_TUTORIAL_RULES,
    seed: 1,
    humanSeat: 0,
    bot: heartsBeginnerBot,
    initialState: createHeartsScenario({
      rules: HEARTS_TUTORIAL_RULES,
      ...mission.scenario,
    }),
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

const missions = HEARTS_LESSONS.flatMap((l) =>
  l.steps
    .filter((s): s is Mission => s.kind === "mission" && s.scenario !== null)
    .map((m) => [m.title, m] as const),
);

describe("하트 튜토리얼 미션", () => {
  it("단원마다 미션이 있다(마지막 문 쏘기는 퀴즈만)", () => {
    expect(missions).toHaveLength(3);
  });

  it.each(missions)("%s: 정답이면 성공, 실수면 실패", (_title, mission) => {
    expect(mission.solution && mission.mistake).toBeTruthy();
    const solved = runMission(mission, mission.solution ?? []);
    expect(solved.before).toBeNull();
    expect(solved.after).toBe("success");
    expect(runMission(mission, mission.mistake ?? []).after).toBe("fail");
  });
});

describe("하트 튜토리얼 퀴즈", () => {
  it("정답 번호가 보기 안에 있다", () => {
    for (const lesson of HEARTS_LESSONS)
      for (const step of lesson.steps) {
        if (step.kind !== "quiz") continue;
        expect(step.answer).toBeGreaterThanOrEqual(0);
        expect(step.answer).toBeLessThan(step.options.length);
      }
  });
});
