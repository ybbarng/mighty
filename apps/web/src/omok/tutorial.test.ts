import { omokBeginnerBot } from "@mighty/omok-ai";
import {
  type Action,
  createOmokScenario,
  type GameEvent,
  pointAt,
  viewOf,
} from "@mighty/omok-engine";
import { describe, expect, it } from "vitest";

import { LocalMatch } from "@/game/local-match";

import { omokKit } from "./kit";
import {
  OMOK_LESSONS,
  OMOK_TUTORIAL_RULES,
  type OmokLesson,
  type OmokScene,
} from "./tutorial";

type Mission = Extract<OmokLesson["steps"][number], { kind: "mission" }>;

function sceneState(scene: OmokScene) {
  return createOmokScenario({ rules: OMOK_TUTORIAL_RULES, ...scene });
}

function runMission(mission: Mission, actions: Action[]) {
  if (!mission.scenario) throw new Error("장면이 없는 미션");
  const match = new LocalMatch({
    kit: omokKit,
    rules: OMOK_TUTORIAL_RULES,
    seed: 1,
    humanSeat: 0,
    bot: omokBeginnerBot,
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

const missions = OMOK_LESSONS.flatMap((l) =>
  l.steps
    .filter((s): s is Mission => s.kind === "mission" && s.scenario !== null)
    .map((m) => [m.title, m] as const),
);

describe("오목 튜토리얼 미션", () => {
  it("장면이 있는 미션이 셋이다(금지 수는 퀴즈, 실전은 처음부터)", () => {
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

describe("오목 튜토리얼 장면", () => {
  it("모든 장면을 만들 수 있고 내가 둘 차례다", () => {
    for (const lesson of OMOK_LESSONS)
      for (const step of lesson.steps) {
        const scene =
          step.kind === "mission" ? step.scenario : (step.scene ?? null);
        if (!scene) continue;
        const view = viewOf(sceneState(scene), 0);
        expect(view.decision).toEqual({ kind: "place" });
      }
  });

  it("3·3 장면은 H8이 흑의 금지 자리다", () => {
    const step = OMOK_LESSONS.find((l) => l.id === "forbidden")?.steps[0];
    if (step?.kind !== "explain" || !step.scene) throw new Error("장면 없음");
    const view = viewOf(sceneState(step.scene), 0);
    expect(view.forbidden).toContainEqual({ at: pointAt("H8"), reason: "3·3" });
  });

  it("퀴즈 정답 번호가 보기 안에 있다", () => {
    for (const lesson of OMOK_LESSONS)
      for (const step of lesson.steps) {
        if (step.kind !== "quiz") continue;
        expect(step.answer).toBeGreaterThanOrEqual(0);
        expect(step.answer).toBeLessThan(step.options.length);
      }
  });
});
