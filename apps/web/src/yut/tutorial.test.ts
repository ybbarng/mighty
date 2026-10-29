// @vitest-environment node
import { yutBeginnerBot } from "@mighty/yut-ai";
import {
  type Action,
  createYutScenario,
  type GameEvent,
  sideOf,
  viewOf,
} from "@mighty/yut-engine";
import { describe, expect, it } from "vitest";

import { LocalMatch } from "@/game/local-match";

import { yutKit } from "./kit";
import {
  YUT_LESSONS,
  YUT_TUTORIAL_RULES,
  type YutLesson,
  type YutScene,
} from "./tutorial";

type Mission = Extract<YutLesson["steps"][number], { kind: "mission" }>;

const sceneState = (scene: YutScene) =>
  createYutScenario({
    rules: YUT_TUTORIAL_RULES,
    pieces: scene.pieces,
    ...(scene.pending ? { pending: scene.pending } : {}),
    ...(scene.throwsLeft !== undefined ? { throwsLeft: scene.throwsLeft } : {}),
  });

function runMission(mission: Mission, actions: Action[]) {
  if (!mission.scenario) throw new Error("장면이 없는 미션");
  const match = new LocalMatch({
    kit: yutKit,
    rules: YUT_TUTORIAL_RULES,
    seed: 1,
    humanSeat: 0,
    bot: yutBeginnerBot,
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

const missions = YUT_LESSONS.flatMap((l) =>
  l.steps
    .filter((s): s is Mission => s.kind === "mission" && s.scenario !== null)
    .map((m) => [m.title, m] as const),
);

describe("윷놀이 튜토리얼 미션", () => {
  it("장면이 있는 미션이 다섯이다(실전은 처음부터)", () => {
    expect(missions).toHaveLength(5);
  });

  it.each(missions)("%s: 정답이면 성공, 실수면 실패", (_title, mission) => {
    expect(mission.solution && mission.mistake).toBeTruthy();
    const solved = runMission(mission, mission.solution ?? []);
    expect(solved.before).toBeNull();
    expect(solved.after).toBe("success");
    expect(runMission(mission, mission.mistake ?? []).after).toBe("fail");
  });

  it("실전 미션: 내 편이 말을 모두 내면 성공, 상대가 먼저 내면 실패", () => {
    const real = YUT_LESSONS.find((l) => l.id === "real")?.steps.find(
      (s): s is Mission => s.kind === "mission",
    );
    if (!real) throw new Error("실전 미션이 없다");
    const view = viewOf(sceneState({ pieces: [] }), 0);
    const mine = sideOf(view.rules, 0);
    expect(
      real.check({
        view,
        events: [{ type: "gameEnded", result: { kind: "finish", side: mine } }],
      }),
    ).toBe("success");
    expect(
      real.check({
        view,
        events: [
          { type: "gameEnded", result: { kind: "finish", side: 1 - mine } },
        ],
      }),
    ).toBe("fail");
    expect(real.check({ view, events: [] })).toBeNull();
  });
});

describe("윷놀이 튜토리얼 장면", () => {
  it("모든 장면을 만들 수 있고, 미션 장면은 내가 움직일 차례다", () => {
    for (const lesson of YUT_LESSONS)
      for (const step of lesson.steps) {
        const scene =
          step.kind === "mission" ? step.scenario : (step.scene ?? null);
        if (!scene) continue;
        const state = sceneState(scene);
        if (step.kind === "mission")
          expect(viewOf(state, 0).decision?.kind).toBe("move");
      }
  });

  it("퀴즈 정답 번호가 보기 안에 있다", () => {
    for (const lesson of YUT_LESSONS)
      for (const step of lesson.steps) {
        if (step.kind !== "quiz") continue;
        expect(step.answer).toBeGreaterThanOrEqual(0);
        expect(step.answer).toBeLessThan(step.options.length);
      }
  });
});
