import { badukBeginnerBot } from "@mighty/baduk-ai";
import {
  type Action,
  createBadukScenario,
  type GameEvent,
  pointAt,
  viewOf,
} from "@mighty/baduk-engine";
import { describe, expect, it } from "vitest";

import { LocalMatch } from "@/game/local-match";

import { badukKit } from "./kit";
import {
  BADUK_LESSONS,
  BADUK_TUTORIAL_RULES,
  type BadukLesson,
  type BadukScene,
} from "./tutorial";

type Mission = Extract<BadukLesson["steps"][number], { kind: "mission" }>;

function sceneState(scene: BadukScene) {
  return createBadukScenario({ rules: BADUK_TUTORIAL_RULES, ...scene });
}

function runMission(mission: Mission, actions: Action[]) {
  if (!mission.scenario) throw new Error("장면이 없는 미션");
  const match = new LocalMatch({
    kit: badukKit,
    rules: BADUK_TUTORIAL_RULES,
    seed: 1,
    humanSeat: 0,
    bot: badukBeginnerBot,
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

const missions = BADUK_LESSONS.flatMap((l) =>
  l.steps
    .filter((s): s is Mission => s.kind === "mission" && s.scenario !== null)
    .map((m) => [m.title, m] as const),
);

describe("바둑 튜토리얼 미션", () => {
  it("단원은 일곱, 장면이 있는 미션은 여섯이다(실전은 처음부터)", () => {
    expect(BADUK_LESSONS).toHaveLength(7);
    expect(BADUK_LESSONS[0]?.id).toBe("goal");
    expect(BADUK_LESSONS.at(-1)?.id).toBe("real");
    expect(missions).toHaveLength(6);
  });

  it.each(missions)("%s: 정답이면 성공, 실수면 실패", (_title, mission) => {
    expect(mission.solution && mission.mistake).toBeTruthy();
    const solved = runMission(mission, mission.solution ?? []);
    expect(solved.before).toBeNull();
    expect(solved.after).toBe("success");
    expect(runMission(mission, mission.mistake ?? []).after).toBe("fail");
  });
});

describe("바둑 튜토리얼 장면", () => {
  const scenes = BADUK_LESSONS.flatMap((lesson) =>
    lesson.steps.flatMap((step) => {
      const scene =
        step.kind === "mission" ? step.scenario : (step.scene ?? null);
      return scene ? [scene] : [];
    }),
  );

  it("모든 장면을 만들 수 있고 내가 둘 차례다. 활로가 없는 무리는 없다", () => {
    for (const scene of scenes) {
      const state = sceneState(scene);
      const view = viewOf(state, 0);
      expect(view.decision).toEqual({ kind: "move" });
      // 놓인 돌이 겹치지 않는다.
      expect(state.board.filter((c) => c !== 0)).toHaveLength(
        scene.black.length + scene.white.length,
      );
    }
  });

  it("표시(marks)는 판 위 자리 이름이다", () => {
    for (const scene of scenes)
      for (const name of Object.keys(scene.marks ?? {}))
        expect(() => pointAt(name, BADUK_TUTORIAL_RULES.size)).not.toThrow();
  });

  it("퀴즈 정답 번호가 보기 안에 있다", () => {
    for (const lesson of BADUK_LESSONS)
      for (const step of lesson.steps) {
        if (step.kind !== "quiz") continue;
        expect(step.answer).toBeGreaterThanOrEqual(0);
        expect(step.answer).toBeLessThan(step.options.length);
      }
  });
});
