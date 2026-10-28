import { minhwatuBeginnerBot } from "@mighty/minhwatu-ai";
import {
  type Action,
  createMinhwatuScenario,
  type GameEvent,
  viewOf,
} from "@mighty/minhwatu-engine";
import { describe, expect, it } from "vitest";

import { LocalMatch } from "@/game/local-match";

import { minhwatuKit } from "./kit";
import {
  MINHWATU_LESSONS,
  MINHWATU_TUTORIAL_RULES,
  type MinhwatuLesson,
  type MinhwatuScene,
} from "./tutorial";

type Mission = Extract<MinhwatuLesson["steps"][number], { kind: "mission" }>;

const sceneState = (scene: MinhwatuScene) =>
  createMinhwatuScenario({ rules: MINHWATU_TUTORIAL_RULES, ...scene });

function runMission(mission: Mission, actions: Action[]) {
  if (!mission.scenario) throw new Error("장면이 없는 미션");
  const match = new LocalMatch({
    kit: minhwatuKit,
    rules: MINHWATU_TUTORIAL_RULES,
    seed: 1,
    humanSeat: 0,
    bot: minhwatuBeginnerBot,
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

const missions = MINHWATU_LESSONS.flatMap((l) =>
  l.steps
    .filter((s): s is Mission => s.kind === "mission" && s.scenario !== null)
    .map((m) => [m.title, m] as const),
);

describe("민화투 튜토리얼 미션", () => {
  it("장면이 있는 미션이 다섯이고, 마지막 단원은 처음부터 한 판이다", () => {
    expect(missions).toHaveLength(5);
    const last = MINHWATU_LESSONS.at(-1)?.steps.find(
      (s) => s.kind === "mission",
    );
    expect(last?.kind === "mission" && last.scenario).toBeNull();
  });

  it.each(missions)("%s: 정답이면 성공, 실수면 실패", (_title, mission) => {
    expect(mission.solution && mission.mistake).toBeTruthy();
    const solved = runMission(mission, mission.solution ?? []);
    expect(solved.before).toBeNull();
    expect(solved.after).toBe("success");
    expect(runMission(mission, mission.mistake ?? []).after).toBe("fail");
  });
});

describe("민화투 튜토리얼 장면", () => {
  it("모든 장면은 카드가 겹치지 않고 내 차례다", () => {
    for (const lesson of MINHWATU_LESSONS)
      for (const step of lesson.steps) {
        const scene =
          step.kind === "mission" ? step.scenario : (step.scene ?? null);
        if (!scene) continue;
        const all = [
          ...scene.hands.flat(),
          ...scene.floor,
          ...(scene.deck ?? []),
          ...(scene.captured ?? []).flat(),
        ];
        expect(new Set(all).size).toBe(all.length);
        expect(viewOf(sceneState(scene), 0).decision).toEqual({
          kind: "play",
        });
      }
  });

  it("퀴즈 정답 번호가 보기 안에 있다", () => {
    for (const lesson of MINHWATU_LESSONS)
      for (const step of lesson.steps) {
        if (step.kind !== "quiz") continue;
        expect(step.answer).toBeGreaterThanOrEqual(0);
        expect(step.answer).toBeLessThan(step.options.length);
      }
  });

  it("첫 단원은 어떤 게임인지, 마지막은 실전이다", () => {
    expect(MINHWATU_LESSONS[0]?.title).toBe("민화투는 어떤 게임?");
    expect(MINHWATU_LESSONS.at(-1)?.title).toBe("실전");
  });
});
