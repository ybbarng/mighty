// @vitest-environment node
import { gostopBeginnerBot } from "@mighty/gostop-ai";
import {
  type Action,
  createGostopScenario,
  type GameEvent,
} from "@mighty/gostop-engine";
import { describe, expect, it } from "vitest";

import { LocalMatch } from "@/game/local-match";

import { gostopKit } from "./kit";
import {
  GOSTOP_LESSONS,
  GOSTOP_TUTORIAL_RULES,
  type GostopLesson,
  scenarioCards,
} from "./tutorial";

type Mission = Extract<GostopLesson["steps"][number], { kind: "mission" }>;

function runMission(mission: Mission, actions: Action[]) {
  if (!mission.scenario) throw new Error("장면이 없는 미션");
  const match = new LocalMatch({
    kit: gostopKit,
    rules: GOSTOP_TUTORIAL_RULES,
    seed: 1,
    humanSeat: 0,
    bot: gostopBeginnerBot,
    initialState: createGostopScenario({
      rules: GOSTOP_TUTORIAL_RULES,
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

const missions = GOSTOP_LESSONS.flatMap((l) =>
  l.steps
    .filter((s): s is Mission => s.kind === "mission" && s.scenario !== null)
    .map((m) => [m.title, m] as const),
);

describe("고스톱 튜토리얼", () => {
  it("짝 맞추기 → 점수 → 약 → 고·스톱 → 박 → 실전 순서", () => {
    expect(GOSTOP_LESSONS.map((l) => l.id)).toEqual([
      "goal",
      "points",
      "yak",
      "gostop",
      "bak",
      "real",
    ]);
    expect(missions).toHaveLength(5);
    const last = GOSTOP_LESSONS.at(-1)?.steps.at(-1);
    expect(last?.kind === "mission" && last.scenario).toBeNull();
  });

  it.each(missions)("%s: 정답이면 성공, 실수면 실패", (_title, mission) => {
    expect(mission.solution && mission.mistake).toBeTruthy();
    const solved = runMission(mission, mission.solution ?? []);
    expect(solved.before).toBeNull();
    expect(solved.after).toBe("success");
    expect(runMission(mission, mission.mistake ?? []).after).toBe("fail");
  });

  it("장면은 모두 만들 수 있고, 같은 카드가 두 번 나오지 않는다", () => {
    for (const lesson of GOSTOP_LESSONS)
      for (const step of lesson.steps) {
        const scene =
          step.kind === "mission" ? step.scenario : (step.scene ?? null);
        if (!scene) continue;
        const cards = scenarioCards(scene);
        expect(new Set(cards).size).toBe(cards.length);
        expect(() =>
          createGostopScenario({ rules: GOSTOP_TUTORIAL_RULES, ...scene }),
        ).not.toThrow();
      }
  });

  it("퀴즈 정답 번호가 보기 안에 있다", () => {
    for (const lesson of GOSTOP_LESSONS)
      for (const step of lesson.steps) {
        if (step.kind !== "quiz") continue;
        expect(step.answer).toBeGreaterThanOrEqual(0);
        expect(step.answer).toBeLessThan(step.options.length);
      }
  });
});
