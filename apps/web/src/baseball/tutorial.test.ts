// @vitest-environment node
import { baseballBeginnerBot } from "@mighty/baseball-ai";
import {
  type Action,
  candidatesFor,
  cluesOf,
  createBaseballScenario,
  type GameEvent,
  viewOf,
} from "@mighty/baseball-engine";
import { describe, expect, it } from "vitest";

import { LocalMatch } from "@/game/local-match";

import { baseballKit } from "./kit";
import {
  BASEBALL_LESSONS,
  BASEBALL_TUTORIAL_RULES,
  type BaseballLesson,
  type BaseballScene,
} from "./tutorial";

type Mission = Extract<BaseballLesson["steps"][number], { kind: "mission" }>;

const sceneState = (scene: BaseballScene) =>
  createBaseballScenario({ rules: BASEBALL_TUTORIAL_RULES, ...scene });

function runMission(mission: Mission, actions: Action[]) {
  if (!mission.scenario) throw new Error("장면이 없는 미션");
  const match = new LocalMatch({
    kit: baseballKit,
    rules: BASEBALL_TUTORIAL_RULES,
    seed: 1,
    humanSeat: 0,
    bot: baseballBeginnerBot,
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

const missions = BASEBALL_LESSONS.flatMap((l) =>
  l.steps
    .filter((s): s is Mission => s.kind === "mission" && s.scenario !== null)
    .map((m) => [m.title, m] as const),
);

describe("숫자야구 튜토리얼 미션", () => {
  it("장면이 있는 미션이 셋이다(실전은 처음부터)", () => {
    expect(missions).toHaveLength(3);
  });

  it.each(missions)("%s: 정답이면 성공, 실수면 실패", (_title, mission) => {
    expect(mission.solution && mission.mistake).toBeTruthy();
    const solved = runMission(mission, mission.solution ?? []);
    expect(solved.before).toBeNull();
    expect(solved.after).toBe("success");
    expect(runMission(mission, mission.mistake ?? []).after).toBe("fail");
  });

  it("실전 미션: 처음부터 컴퓨터 수를 맞히면 성공", () => {
    const real = BASEBALL_LESSONS.find((l) => l.id === "real")?.steps.find(
      (s): s is Mission => s.kind === "mission",
    );
    if (!real) throw new Error("실전 미션이 없다");
    const { state } = baseballKit.createMatch(BASEBALL_TUTORIAL_RULES, 5);
    const match = new LocalMatch({
      kit: baseballKit,
      rules: BASEBALL_TUTORIAL_RULES,
      seed: 5,
      humanSeat: 0,
      bot: baseballBeginnerBot,
      initialState: state,
    });
    const events: GameEvent[] = [];
    match.subscribe((s) => events.push(...s.events));
    // 컴퓨터가 비밀을 정한 뒤, 늘 남은 후보 가운데 첫 수를 묻는다.
    for (let i = 0; i < 10 && match.current().phase === "play"; i++) {
      const view = match.current();
      const guess = candidatesFor(view.rules, cluesOf(view, 0))[0] as string;
      expect(match.submit({ type: "guess", guess }).ok).toBe(true);
    }
    expect(real.check({ view: match.current(), events })).toBe("success");
  });
});

describe("숫자야구 튜토리얼 장면", () => {
  it("장면마다 내가 물을 차례이고, 미션 장면은 설명한 만큼 후보가 남는다", () => {
    const expected: Record<string, number> = {
      "하나 남은 수": 1,
      "자리 찾기": 1,
      "둘 중 하나": 2,
    };
    for (const lesson of BASEBALL_LESSONS)
      for (const step of lesson.steps) {
        const scene =
          step.kind === "mission" ? step.scenario : (step.scene ?? null);
        if (!scene) continue;
        const state = sceneState(scene);
        expect(viewOf(state, 0).decision).toEqual({ kind: "guess" });
        if (step.kind === "mission") {
          const left = candidatesFor(state.rules, cluesOf(state, 0));
          expect(left).toHaveLength(expected[step.title] ?? -1);
          expect(left).toContain(scene.secret);
        }
      }
  });

  it("퀴즈 정답 번호가 보기 안에 있다", () => {
    for (const lesson of BASEBALL_LESSONS)
      for (const step of lesson.steps) {
        if (step.kind !== "quiz") continue;
        expect(step.answer).toBeGreaterThanOrEqual(0);
        expect(step.answer).toBeLessThan(step.options.length);
      }
  });
});
