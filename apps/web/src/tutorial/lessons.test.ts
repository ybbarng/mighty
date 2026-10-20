import { type Action, createScenario, type GameEvent } from "@mighty/engine";
import { describe, expect, it } from "vitest";

import { LocalMatch } from "@/game/local-match";

import { GLOSSARY } from "./glossary";
import { LESSONS, type Step, TUTORIAL_RULES } from "./lessons";

type Mission = Extract<Step, { kind: "mission" }>;

function runMission(mission: Mission, actions: Action[]) {
  if (!mission.scenario) throw new Error("장면이 없는 미션");
  const match = new LocalMatch({
    rules: TUTORIAL_RULES,
    seed: 1,
    humanSeat: 0,
    initialState: createScenario({
      rules: TUTORIAL_RULES,
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

const missions = LESSONS.flatMap((l) =>
  l.steps
    .filter((s): s is Mission => s.kind === "mission" && s.scenario !== null)
    .map((m) => [m.title, m] as const),
);

describe("튜토리얼 미션", () => {
  it.each(missions)("%s: 정답이면 성공, 실수면 실패", (_title, mission) => {
    expect(mission.solution && mission.mistake).toBeTruthy();
    const solved = runMission(mission, mission.solution ?? []);
    expect(solved.before).toBeNull();
    expect(solved.after).toBe("success");
    expect(runMission(mission, mission.mistake ?? []).after).toBe("fail");
  });
});

describe("튜토리얼 퀴즈", () => {
  const quizzes = LESSONS.flatMap((l) =>
    l.steps.filter((s) => s.kind === "quiz"),
  );
  it("정답 번호가 보기 안에 있다", () => {
    for (const q of quizzes) {
      if (q.kind !== "quiz") continue;
      expect(q.answer).toBeGreaterThanOrEqual(0);
      expect(q.answer).toBeLessThan(q.options.length);
    }
  });
});

describe("용어", () => {
  it("설명에 쓴 용어가 모두 용어집에 있다", () => {
    const ids = new Set(GLOSSARY.map((t) => t.id));
    for (const lesson of LESSONS) {
      for (const step of lesson.steps) {
        if (step.kind === "explain")
          for (const t of step.terms ?? []) expect(ids.has(t)).toBe(true);
      }
    }
  });
});
