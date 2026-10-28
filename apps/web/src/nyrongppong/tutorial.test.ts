import { ManualClock } from "@mighty/fair-play";
import { nyrongppongBeginnerBot } from "@mighty/nyrongppong-ai";
import {
  type Action,
  createNyrongppongScenario,
  type GameEvent,
  viewOf,
} from "@mighty/nyrongppong-engine";
import { describe, expect, it } from "vitest";

import { LocalMatch } from "@/game/local-match";

import { nyrongppongKit } from "./kit";
import { NYRONGPPONG_LESSONS, type NyrongppongLesson } from "./tutorial";

type Mission = Extract<NyrongppongLesson["steps"][number], { kind: "mission" }>;

function runMission(mission: Mission, actions: Action[]) {
  if (!mission.scenario) throw new Error("장면이 없는 미션");
  const initial = createNyrongppongScenario(mission.scenario);
  const match = new LocalMatch({
    kit: nyrongppongKit,
    rules: initial.rules,
    seed: 1,
    humanSeat: 0,
    bot: nyrongppongBeginnerBot,
    clock: new ManualClock(),
    initialState: initial,
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

const missions = NYRONGPPONG_LESSONS.flatMap((l) =>
  l.steps
    .filter((s): s is Mission => s.kind === "mission" && s.scenario !== null)
    .map((m) => [m.title, m] as const),
);

describe("나이롱뽕 튜토리얼 미션", () => {
  it("규칙 → 약 내기 → 뽕 → 스톱 → 실전 순서다", () => {
    expect(NYRONGPPONG_LESSONS.map((l) => l.id)).toEqual([
      "goal",
      "yak",
      "ppong",
      "stop",
      "play",
    ]);
    expect(missions).toHaveLength(4);
  });

  it.each(missions)("%s: 정답이면 성공, 실수면 실패", (_title, mission) => {
    expect(mission.solution && mission.mistake).toBeTruthy();
    const solved = runMission(mission, mission.solution ?? []);
    expect(solved.before).toBeNull();
    expect(solved.after).toBe("success");
    expect(runMission(mission, mission.mistake ?? []).after).toBe("fail");
  });

  it("뽕 미션은 응답 시간이 지나도 실패다", () => {
    const mission = missions.find(([t]) => t === "뽕 부르기")?.[1];
    if (!mission?.scenario) throw new Error("뽕 미션이 없다");
    const clock = new ManualClock();
    const initial = createNyrongppongScenario(mission.scenario);
    const match = new LocalMatch({
      kit: nyrongppongKit,
      rules: initial.rules,
      seed: 1,
      humanSeat: 0,
      bot: nyrongppongBeginnerBot,
      clock,
      initialState: initial,
    });
    const events: GameEvent[] = [];
    match.subscribe((s) => events.push(...s.events));
    clock.advance(initial.rules.callSeconds * 1000 + 1);
    expect(mission.check({ view: match.current(), events })).toBe("fail");
  });
});

describe("나이롱뽕 튜토리얼 장면", () => {
  it("모든 장면을 만들 수 있고 내가 할 차례다", () => {
    for (const lesson of NYRONGPPONG_LESSONS)
      for (const step of lesson.steps) {
        const scene =
          step.kind === "mission" ? step.scenario : (step.scene ?? null);
        if (!scene) continue;
        const state = createNyrongppongScenario(scene);
        // 카드가 겹치지 않는다.
        const all = [
          ...state.hands.flat(),
          ...state.deck,
          ...state.pile,
          ...state.melds.flat(2),
        ];
        expect(new Set(all).size).toBe(all.length);
        expect(viewOf(state, 0).decision).not.toBeNull();
      }
  });

  it("퀴즈 정답 번호가 보기 안에 있다", () => {
    for (const lesson of NYRONGPPONG_LESSONS)
      for (const step of lesson.steps) {
        if (step.kind !== "quiz") continue;
        expect(step.answer).toBeGreaterThanOrEqual(0);
        expect(step.answer).toBeLessThan(step.options.length);
      }
  });
});
