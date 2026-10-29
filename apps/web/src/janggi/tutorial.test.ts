// @vitest-environment node
import { janggiBeginnerBot } from "@mighty/janggi-ai";
import {
  type Action,
  createJanggiScenario,
  type GameEvent,
  kingsFacing,
  pointAt,
  viewOf,
} from "@mighty/janggi-engine";
import { describe, expect, it } from "vitest";

import { LocalMatch } from "@/game/local-match";

import { janggiKit } from "./kit";
import {
  JANGGI_LESSONS,
  JANGGI_TUTORIAL_RULES,
  type JanggiLesson,
  type JanggiScene,
} from "./tutorial";

type Mission = Extract<JanggiLesson["steps"][number], { kind: "mission" }>;

function sceneState(scene: JanggiScene) {
  return createJanggiScenario({ rules: JANGGI_TUTORIAL_RULES, ...scene });
}

function runMission(mission: Mission, actions: Action[]) {
  if (!mission.scenario) throw new Error("장면이 없는 미션");
  const match = new LocalMatch({
    kit: janggiKit,
    rules: JANGGI_TUTORIAL_RULES,
    seed: 1,
    humanSeat: 0,
    bot: janggiBeginnerBot,
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

const missions = JANGGI_LESSONS.flatMap((l) =>
  l.steps
    .filter((s): s is Mission => s.kind === "mission" && s.scenario !== null)
    .map((m) => [m.title, m] as const),
);

describe("장기 튜토리얼 미션", () => {
  it("장면이 있는 미션이 여섯이다(실전은 처음부터)", () => {
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

describe("장기 튜토리얼 장면", () => {
  it("모든 장면을 만들 수 있고 내가 둘 차례다", () => {
    for (const lesson of JANGGI_LESSONS)
      for (const step of lesson.steps) {
        const scene =
          step.kind === "mission" ? step.scenario : (step.scene ?? null);
        if (!scene) continue;
        const view = viewOf(sceneState(scene), 0);
        expect(view.decision).toEqual({ kind: "move" });
        // 시작부터 빅장(점수로 끝)이 아니어야 한다.
        expect(kingsFacing(view.board)).toBe(false);
      }
  });

  it("점을 찍는 기물(show)은 그 자리에 있는 내 기물이다", () => {
    for (const lesson of JANGGI_LESSONS)
      for (const step of lesson.steps) {
        if (step.kind === "mission" || !step.scene?.show) continue;
        const cell = sceneState(step.scene).board[pointAt(step.scene.show)];
        expect(cell?.startsWith("c")).toBe(true);
      }
  });

  it("퀴즈 정답 번호가 보기 안에 있다", () => {
    for (const lesson of JANGGI_LESSONS)
      for (const step of lesson.steps) {
        if (step.kind !== "quiz") continue;
        expect(step.answer).toBeGreaterThanOrEqual(0);
        expect(step.answer).toBeLessThan(step.options.length);
      }
  });
});
